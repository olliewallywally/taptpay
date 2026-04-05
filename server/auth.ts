import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { sendPasswordResetEmail } from './email-service';

// Security Audit Log File
const SECURITY_LOG_DIR = path.join(process.cwd(), 'logs');
const SECURITY_LOG_FILE = path.join(SECURITY_LOG_DIR, 'security-audit.log');

// Ensure logs directory exists
if (!fs.existsSync(SECURITY_LOG_DIR)) {
  fs.mkdirSync(SECURITY_LOG_DIR, { recursive: true });
}

export interface User {
  id: number;
  email: string;
  password: string;
  merchantId: number;
  role: 'merchant' | 'admin';
  resetToken?: string;
  resetTokenExpiry?: Date;
  createdAt: Date;
}

// ============================================
// LOGIN SECURITY - Brute Force Protection
// ============================================
interface LoginAttempt {
  count: number;
  lastAttempt: number;
  lockoutUntil: number | null;
}

// Email-based lockout (prevents account enumeration attacks)
const loginAttempts = new Map<string, LoginAttempt>();
// IP-based rate limiting (prevents distributed attacks)
const ipLoginAttempts = new Map<string, LoginAttempt>();

const MAX_LOGIN_ATTEMPTS = 5;
const MAX_IP_LOGIN_ATTEMPTS = 20; // Allow more attempts per IP (multiple users may share)
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const IP_LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes for IP-based lockout
const ATTEMPT_WINDOW = 60 * 60 * 1000; // 1 hour

// Security audit logging - writes to dedicated file with PII redaction
export function logSecurityEvent(event: string, details: Record<string, any>) {
  const timestamp = new Date().toISOString();
  
  // Redact sensitive PII for audit log
  const redactedDetails = { ...details };
  if (redactedDetails.email) {
    // Mask email: keep first 2 chars and domain
    const email = redactedDetails.email;
    const atIndex = email.indexOf('@');
    if (atIndex > 2) {
      redactedDetails.email = email.substring(0, 2) + '***' + email.substring(atIndex);
    }
  }
  
  const logEntry = {
    timestamp,
    event,
    ...redactedDetails,
  };
  
  const logLine = JSON.stringify(logEntry) + '\n';
  
  // Write to dedicated security audit log file
  try {
    fs.appendFileSync(SECURITY_LOG_FILE, logLine);
  } catch (error) {
    // Fallback to console if file write fails, but don't expose full details
    console.error(`[SECURITY_LOG_ERROR] Failed to write audit log for event: ${event}`);
  }
}

// Check if account is locked out (by email)
export function isAccountLocked(email: string): { locked: boolean; remainingTime?: number } {
  const normalizedEmail = email.toLowerCase();
  const attempt = loginAttempts.get(normalizedEmail);
  
  if (!attempt || !attempt.lockoutUntil) {
    return { locked: false };
  }
  
  const now = Date.now();
  if (now < attempt.lockoutUntil) {
    const remainingTime = Math.ceil((attempt.lockoutUntil - now) / 1000 / 60);
    return { locked: true, remainingTime };
  }
  
  // Lockout expired, reset
  loginAttempts.delete(normalizedEmail);
  return { locked: false };
}

// Check if IP is rate limited
export function isIPRateLimited(ip: string): { limited: boolean; remainingTime?: number } {
  const attempt = ipLoginAttempts.get(ip);
  
  if (!attempt || !attempt.lockoutUntil) {
    return { limited: false };
  }
  
  const now = Date.now();
  if (now < attempt.lockoutUntil) {
    const remainingTime = Math.ceil((attempt.lockoutUntil - now) / 1000 / 60);
    return { limited: true, remainingTime };
  }
  
  // Lockout expired, reset
  ipLoginAttempts.delete(ip);
  return { limited: false };
}

// Record failed login attempt (both email and IP tracking)
export function recordFailedLogin(email: string, ip: string): { locked: boolean; ipLimited?: boolean; attemptsRemaining?: number } {
  const normalizedEmail = email.toLowerCase();
  const now = Date.now();
  
  // Track by email
  let emailAttempt = loginAttempts.get(normalizedEmail);
  if (!emailAttempt || now - emailAttempt.lastAttempt > ATTEMPT_WINDOW) {
    emailAttempt = { count: 1, lastAttempt: now, lockoutUntil: null };
  } else {
    emailAttempt.count++;
    emailAttempt.lastAttempt = now;
  }
  
  // Track by IP
  let ipAttempt = ipLoginAttempts.get(ip);
  if (!ipAttempt || now - ipAttempt.lastAttempt > ATTEMPT_WINDOW) {
    ipAttempt = { count: 1, lastAttempt: now, lockoutUntil: null };
  } else {
    ipAttempt.count++;
    ipAttempt.lastAttempt = now;
  }
  
  logSecurityEvent('FAILED_LOGIN', { 
    email: normalizedEmail, 
    ip, 
    emailAttemptCount: emailAttempt.count,
    ipAttemptCount: ipAttempt.count 
  });
  
  // Check IP lockout first (affects all users from that IP)
  if (ipAttempt.count >= MAX_IP_LOGIN_ATTEMPTS) {
    ipAttempt.lockoutUntil = now + IP_LOCKOUT_DURATION;
    ipLoginAttempts.set(ip, ipAttempt);
    logSecurityEvent('IP_RATE_LIMITED', { ip, lockoutMinutes: IP_LOCKOUT_DURATION / 60000 });
    return { locked: false, ipLimited: true };
  }
  ipLoginAttempts.set(ip, ipAttempt);
  
  // Check email lockout
  if (emailAttempt.count >= MAX_LOGIN_ATTEMPTS) {
    emailAttempt.lockoutUntil = now + LOCKOUT_DURATION;
    loginAttempts.set(normalizedEmail, emailAttempt);
    logSecurityEvent('ACCOUNT_LOCKED', { email: normalizedEmail, ip, lockoutMinutes: LOCKOUT_DURATION / 60000 });
    return { locked: true };
  }
  
  loginAttempts.set(normalizedEmail, emailAttempt);
  return { locked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS - emailAttempt.count };
}

// Clear failed attempts on successful login
export function clearFailedAttempts(email: string) {
  const normalizedEmail = email.toLowerCase();
  loginAttempts.delete(normalizedEmail);
  // Note: IP attempts are NOT cleared on successful login to prevent abuse
}

// Cleanup old login attempts periodically
setInterval(() => {
  const now = Date.now();
  
  // Clean email-based attempts
  const emailEntries = Array.from(loginAttempts.entries());
  for (const [email, attempt] of emailEntries) {
    if (now - attempt.lastAttempt > ATTEMPT_WINDOW && (!attempt.lockoutUntil || now > attempt.lockoutUntil)) {
      loginAttempts.delete(email);
    }
  }
  
  // Clean IP-based attempts
  const ipEntries = Array.from(ipLoginAttempts.entries());
  for (const [ip, attempt] of ipEntries) {
    if (now - attempt.lastAttempt > ATTEMPT_WINDOW && (!attempt.lockoutUntil || now > attempt.lockoutUntil)) {
      ipLoginAttempts.delete(ip);
    }
  }
}, 10 * 60 * 1000); // Clean up every 10 minutes

export interface AuthenticatedRequest extends Request {
  user?: User;
}

// In-memory user storage (replace with database in production)
const users: Map<number, User> = new Map();
let currentUserId = 1;

// Create admin user
const adminHashedPassword = bcrypt.hashSync('123456', 10);
users.set(1, {
  id: 1,
  email: 'oliverleonard.professional@gmail.com',
  password: adminHashedPassword,
  merchantId: 0,
  role: 'admin',
  createdAt: new Date(),
});

currentUserId = 2;

export function clearAllUsers() {
  // Clear all users except admin
  const adminUser = users.get(1);
  users.clear();
  if (adminUser) {
    users.set(1, adminUser);
  }
  currentUserId = 2;
  console.log("All user accounts cleared except admin");
}

// Function to recreate auth users for verified merchants
export async function syncVerifiedMerchants() {
  let synced = 0;
  let alreadyPresent = 0;
  let failed = 0;
  try {
    const { storage } = await import('./storage');
    const allMerchants = await storage.getAllMerchants();

    for (const merchant of allMerchants) {
      if (merchant.status === 'verified' && merchant.passwordHash) {
        const existingUser = getUserByEmail(merchant.email);
        if (!existingUser) {
          try {
            const id = currentUserId++;
            const user: User = {
              id,
              email: merchant.email,
              password: merchant.passwordHash,
              merchantId: merchant.id,
              role: 'merchant',
              createdAt: new Date(),
            };
            users.set(id, user);
            synced++;
          } catch {
            failed++;
            console.error(`Failed to recreate auth user for merchant: ${merchant.email} (ID: ${merchant.id})`);
          }
        } else {
          alreadyPresent++;
        }
      }
    }

    const total = synced + alreadyPresent + failed;
    if (failed > 0) {
      console.error(`⚠️  Auth sync: ${total} verified merchants — ${synced} registered, ${alreadyPresent} already present, ${failed} FAILED`);
    } else {
      console.log(`✅ Auth sync: ${total} verified merchants — ${synced} registered, ${alreadyPresent} already present`);
    }
  } catch (error) {
    console.error('❌ Auth sync failed entirely — merchants may not be able to log in:', error);
  }
}

// Initialize auth system by syncing verified merchants
syncVerifiedMerchants();

export const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const user = Array.from(users.values()).find(u => u.email === email);
  if (!user) return null;
  
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return null;
  
  return user;
}

export function generateToken(user: User): string {
  return jwt.sign(
    { 
      userId: user.id, 
      email: user.email, 
      merchantId: user.merchantId,
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: '1h' } // 1 hour as requested
  );
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }

  // Handle admin users (not stored in users Map)
  if (decoded.role === 'admin') {
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      password: '', // Admin doesn't need password stored
      merchantId: decoded.merchantId,
      role: decoded.role,
      createdAt: new Date(),
    };
    return next();
  }

  // For regular users, check if user exists, if not try to recreate from merchant data
  let user = users.get(decoded.userId);
  if (!user && decoded.merchantId) {
    // Try to recreate user from merchant data
    console.log(`Recreating user session for merchant ${decoded.merchantId}`);
    await syncVerifiedMerchants();
    user = users.get(decoded.userId);
  }
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  req.user = user;
  next();
}

export async function createUser(email: string, password: string, merchantId: number, role: 'merchant' | 'admin' = 'merchant'): Promise<User> {
  // Check if user already exists
  const existingUser = getUserByEmail(email);
  if (existingUser) {
    throw new Error(`User with email ${email} already exists`);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const id = currentUserId++;
  
  const user: User = {
    id,
    email,
    password: hashedPassword,
    merchantId,
    role,
    createdAt: new Date(),
  };
  
  users.set(id, user);
  console.log(`User created successfully: ${email} with ID ${id} for merchant ${merchantId}`);
  return user;
}

export function getUserByEmail(email: string): User | undefined {
  return Array.from(users.values()).find(u => u.email === email);
}

export function getUserById(id: number): User | undefined {
  return users.get(id);
}

// Password reset functionality
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function requestPasswordReset(email: string, baseUrl?: string): Promise<boolean> {
  const resetToken = generateResetToken();
  const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

  // Look up merchant in database (single source of truth)
  try {
    const { storage } = await import('./storage');
    const merchant = await storage.getMerchantByEmail(email);
    
    if (!merchant) {
      return true; // Don't reveal if email exists
    }

    await storage.updateMerchant(merchant.id, {
      resetToken,
      resetTokenExpiry,
    } as any);

    // Also update in-memory user if exists
    const memUser = getUserByEmail(email);
    if (memUser) {
      memUser.resetToken = resetToken;
      memUser.resetTokenExpiry = resetTokenExpiry;
      users.set(memUser.id, memUser);
    }
  } catch (error) {
    console.error('Failed to store reset token in database:', error);
    return false;
  }

  try {
    await sendPasswordResetEmail(email, resetToken, baseUrl);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  try {
    const { storage } = await import('./storage');
    const merchant = await storage.getMerchantByResetToken(token);
    
    if (!merchant || !merchant.resetTokenExpiry || new Date(merchant.resetTokenExpiry) < new Date()) {
      return false;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await storage.updateMerchant(merchant.id, {
      passwordHash: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    } as any);

    // Also update in-memory user if exists
    const memUser = getUserByEmail(merchant.email);
    if (memUser) {
      memUser.password = hashedPassword;
      memUser.resetToken = undefined;
      memUser.resetTokenExpiry = undefined;
      users.set(memUser.id, memUser);
    }

    return true;
  } catch (error) {
    console.error('Failed to reset password:', error);
    return false;
  }
}

export async function validateResetToken(token: string): Promise<boolean> {
  try {
    const { storage } = await import('./storage');
    const merchant = await storage.getMerchantByResetToken(token);
    if (merchant && merchant.resetTokenExpiry && new Date(merchant.resetTokenExpiry) > new Date()) {
      return true;
    }
  } catch (error) {
    console.error('Failed to validate reset token:', error);
  }
  return false;
}