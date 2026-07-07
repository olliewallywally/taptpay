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

// Merchant auth is backed directly by the `merchants` table (email + passwordHash
// are the source of truth). There is no in-memory user store: it did not survive
// restarts and was inconsistent across multiple server instances, which could make a
// valid merchant fail to log in ("Invalid email or password") after a redeploy or on
// an instance that had not yet synced.

// Build the auth User view of a merchant record.
function merchantToUser(merchant: {
  id: number;
  email: string;
  passwordHash?: string | null;
}): User {
  return {
    // For merchants the identity IS the merchant id — no separate synthetic id.
    id: merchant.id,
    email: merchant.email,
    password: merchant.passwordHash || '',
    merchantId: merchant.id,
    role: 'merchant',
    createdAt: new Date(),
  };
}

// Retained as a no-op for backwards compatibility: callers (index.ts, verify /
// confirm-email routes) used to call this to rebuild the in-memory store. With the DB
// as the source of truth there is nothing to sync.
export async function syncVerifiedMerchants(): Promise<void> {
  // no-op — merchant auth reads live from the merchants table
}

export const JWT_SECRET = process.env.JWT_SECRET ?? (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  return 'dev-only-jwt-secret-not-for-production';
})();

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const { storage } = await import('./storage');
  const merchant = await storage.getMerchantByEmail(email);
  if (!merchant || !merchant.passwordHash) return null;

  // Only verified/active merchants may log in.
  if (merchant.status !== 'verified' && merchant.status !== 'active') return null;

  const isValid = await bcrypt.compare(password, merchant.passwordHash);
  if (!isValid) return null;

  return merchantToUser(merchant);
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

  // Regular merchant: resolve from the merchants table (source of truth).
  if (!decoded.merchantId) {
    return res.status(404).json({ message: 'User not found' });
  }
  try {
    const { storage } = await import('./storage');
    const merchant = await storage.getMerchant(decoded.merchantId);
    if (merchant && (merchant.status === 'verified' || merchant.status === 'active') && merchant.passwordHash) {
      req.user = merchantToUser(merchant);
      return next();
    }
  } catch {
    // fall through to user not found below
  }
  return res.status(404).json({ message: 'User not found' });
}

// Enable password login for a merchant by ensuring its passwordHash is set.
// (Merchant auth is DB-backed, so "creating a user" means writing the hash onto the
// merchant record.) Idempotent: won't clobber an already-set hash. Returns the User view.
export async function createUser(email: string, password: string, merchantId: number, role: 'merchant' | 'admin' = 'merchant'): Promise<User> {
  const { storage } = await import('./storage');
  const merchant = await storage.getMerchant(merchantId);
  if (!merchant) {
    throw new Error(`Cannot create login for unknown merchant ${merchantId}`);
  }

  if (!merchant.passwordHash) {
    const hashedPassword = await bcrypt.hash(password, 12);
    await storage.updateMerchantPasswordHash(merchantId, hashedPassword);
    merchant.passwordHash = hashedPassword;
  }

  console.log(`Login enabled for ${email} (merchant ${merchantId})`);
  return merchantToUser(merchant);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const { storage } = await import('./storage');
  const merchant = await storage.getMerchantByEmail(email);
  return merchant ? merchantToUser(merchant) : undefined;
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

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    await storage.updateMerchant(merchant.id, {
      passwordHash: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    } as any);

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