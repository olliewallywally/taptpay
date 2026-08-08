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
  /**
   * `owner` holds the account (billing, plan, team); `member` is a teammate on
   * one of the plan's extra seats. `merchant` is the pre-team-logins spelling of
   * owner and is retained so old code paths still typecheck.
   */
  role: 'owner' | 'member' | 'merchant' | 'admin';
  /** Identity of the users row this principal came from, when there is one. */
  userId?: number;
  resetToken?: string;
  resetTokenExpiry?: Date;
  createdAt: Date;
}

/** Owner-equivalent roles. Members are excluded from billing and team writes. */
export function isAccountOwner(user: Pick<User, 'role'> | undefined | null): boolean {
  return user?.role === 'owner' || user?.role === 'merchant' || user?.role === 'admin';
}

/**
 * Claim marking a token as issued by the team-logins scheme.
 *
 * Before team logins, `userId` in a JWT was the *merchant* id and
 * authenticateToken ignored it entirely. Now that real `users.id` values exist,
 * an old token's `userId` would address a different row, so tokens without this
 * claim are rejected outright. The 1h TTL caps the disruption at one re-login.
 */
export const TOKEN_PRINCIPAL = 'user' as const;
const ADMIN_TOKEN_PRINCIPAL = 'admin' as const;

function isMerchantUserRole(role: unknown): role is 'owner' | 'member' {
  return role === 'owner' || role === 'member';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
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
const loginAttemptCleanupTimer = setInterval(() => {
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
loginAttemptCleanupTimer.unref();

export interface AuthenticatedRequest extends Request {
  user?: User;
}

// Retained for backwards compatibility with startup and verification call sites.
// User rows are synchronised by the storage write that sets an owner's password.
export async function syncVerifiedMerchants(): Promise<void> {
  // no-op — authentication reads live from the users table
}

export const JWT_SECRET = process.env.JWT_SECRET ?? (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  return 'dev-only-jwt-secret-not-for-production';
})();

function userRowToUser(row: {
  id: number;
  email: string;
  password: string;
  merchantId: number | null;
  role: string;
  createdAt?: Date | null;
}): User | null {
  // Admins are environment-backed, never merchant-scoped database users. Unknown
  // roles fail closed instead of silently inheriting member access.
  if (
    !isPositiveInteger(row.id) ||
    !isPositiveInteger(row.merchantId) ||
    !isMerchantUserRole(row.role) ||
    typeof row.email !== 'string' ||
    typeof row.password !== 'string'
  ) {
    return null;
  }
  return {
    id: row.id,
    userId: row.id,
    email: row.email,
    password: row.password,
    merchantId: row.merchantId,
    role: row.role,
    createdAt: row.createdAt ?? new Date(),
  };
}

/**
 * Resolves a login against the `users` table — one row per person, so a seat can
 * be revoked without disturbing anyone else's access.
 *
 * Three gates, all of which must pass: the user row is active, the parent
 * merchant is verified/active, and the password matches. A disabled teammate
 * fails the first gate even though their password is still correct.
 */
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const { storage } = await import('./storage');

  const userRow = await storage.getUserByEmail(email);
  if (!userRow || userRow.status !== 'active') return null;

  const user = userRowToUser(userRow);
  if (!user) return null;

  const merchant = await storage.getMerchant(user.merchantId);
  if (!merchant) return null;
  if (merchant.status !== 'verified' && merchant.status !== 'active') return null;

  const isValid = await bcrypt.compare(password, userRow.password);
  if (!isValid) return null;

  // Downgrades are normally blocked while too many seats are occupied, but this
  // second gate covers races, manual repairs and future migrations. The owner
  // always retains access so the account can remove seats or fix billing.
  if (user.role === 'member') {
    const subscription = await storage.getSubscription(user.merchantId);
    const seatLimit = subscription?.seatLimit;
    if (!isPositiveInteger(seatLimit)) return null;
    const seatsInUse = await storage.countSeatsInUse(user.merchantId);
    if (seatsInUse > seatLimit) return null;
  }

  await storage.recordUserLogin(userRow.id, new Date()).catch(() => {});
  return user;
}

export function generateToken(user: User): string {
  const userId = user.userId ?? user.id;
  if (!isPositiveInteger(userId) || typeof user.email !== 'string' || !user.email) {
    throw new Error('Cannot issue a token for an invalid principal');
  }

  if (user.role === 'admin') {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || user.email.toLowerCase() !== adminEmail.toLowerCase() || user.merchantId !== 0) {
      throw new Error('Cannot issue an admin token for an unconfigured principal');
    }
    return jwt.sign(
      { principal: ADMIN_TOKEN_PRINCIPAL, userId, email: adminEmail, merchantId: 0, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
  }

  if (!isMerchantUserRole(user.role) || !isPositiveInteger(user.merchantId)) {
    throw new Error('Cannot issue a token without a users-row principal');
  }

  return jwt.sign(
    {
      principal: TOKEN_PRINCIPAL,
      userId,
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
  const match = typeof authHeader === 'string' ? authHeader.match(/^Bearer ([^\s]+)$/i) : null;

  if (!match) {
    return res.status(401).json({ message: 'Access token required' });
  }
  const token = match[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }

  // A role string alone is not admin authority. Require the dedicated principal,
  // the configured email, and a zero merchant scope.
  if (decoded.role === 'admin') {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (
      decoded.principal !== ADMIN_TOKEN_PRINCIPAL ||
      !adminEmail ||
      typeof decoded.email !== 'string' ||
      decoded.email.toLowerCase() !== adminEmail.toLowerCase() ||
      decoded.merchantId !== 0 ||
      !isPositiveInteger(decoded.userId)
    ) {
      return res.status(403).json({ message: 'Invalid admin session' });
    }
    req.user = {
      id: decoded.userId,
      email: adminEmail,
      password: '',
      merchantId: 0,
      role: 'admin',
      createdAt: new Date(),
    };
    return next();
  }

  // Reject pre-team-logins tokens: their `userId` is a merchant id, so honouring
  // one would resolve the wrong users row. See TOKEN_PRINCIPAL.
  if (decoded.principal !== TOKEN_PRINCIPAL) {
    return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }

  if (
    !isPositiveInteger(decoded.merchantId) ||
    !isPositiveInteger(decoded.userId) ||
    !isMerchantUserRole(decoded.role)
  ) {
    return res.status(404).json({ message: 'User not found' });
  }

  try {
    const { storage } = await import('./storage');
    const userRow = await storage.getUserById(decoded.userId);
    const user = userRow ? userRowToUser(userRow) : null;

    // Re-check the identity on every request so disabling a teammate takes effect
    // within the token's remaining lifetime rather than at its natural expiry.
    if (!userRow || !user || userRow.status !== 'active' || user.merchantId !== decoded.merchantId) {
      return res.status(403).json({ message: 'Access revoked' });
    }

    const merchant = await storage.getMerchant(decoded.merchantId);
    if (merchant && (merchant.status === 'verified' || merchant.status === 'active')) {
      // The database role is authoritative; stale JWT role claims are ignored.
      req.user = user;
      return next();
    }
  } catch {
    // fall through to user not found below
  }
  return res.status(404).json({ message: 'User not found' });
}

// Enable the owner's login and return the real users-row principal. The merchant
// hash writer synchronises/creates that owner row; re-reading it prevents Google
// OAuth from minting a token whose uid is accidentally the merchant id.
export async function createUser(email: string, password: string, merchantId: number, role: 'merchant' | 'admin' = 'merchant'): Promise<User> {
  if (role === 'admin') {
    throw new Error('Admin identities cannot be created in the merchant users table');
  }

  const { storage } = await import('./storage');
  const merchant = await storage.getMerchant(merchantId);
  if (!merchant) {
    throw new Error(`Cannot create login for unknown merchant ${merchantId}`);
  }
  if (merchant.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error(`Cannot create login with an email that does not match merchant ${merchantId}`);
  }

  const passwordHash = merchant.passwordHash || await bcrypt.hash(password, 12);
  const updated = await storage.updateMerchantPasswordHash(merchantId, passwordHash);
  if (!updated) {
    throw new Error(`Failed to enable login for merchant ${merchantId}`);
  }

  const userRow = await storage.getUserByEmail(merchant.email);
  const user = userRow ? userRowToUser(userRow) : null;
  if (!userRow || !user || userRow.status !== 'active' || user.role !== 'owner' || user.merchantId !== merchantId) {
    throw new Error(`Merchant ${merchantId} does not have a unique active owner login`);
  }
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const { storage } = await import('./storage');
  const userRow = await storage.getUserByEmail(email);
  return userRow ? userRowToUser(userRow) ?? undefined : undefined;
}

// Password reset functionality
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function resetEligible(user: {
  merchantId: number | null;
  role: string;
  status: string;
  resetTokenExpiry?: Date | null;
}, now: Date): boolean {
  const expiry = user.resetTokenExpiry ? new Date(user.resetTokenExpiry).getTime() : Number.NaN;
  return isPositiveInteger(user.merchantId)
    && isMerchantUserRole(user.role)
    && user.status === 'active'
    && Number.isFinite(expiry)
    && expiry > now.getTime();
}

export async function requestPasswordReset(email: string, baseUrl?: string): Promise<boolean> {
  try {
    const { storage } = await import('./storage');
    const user = await storage.getUserByEmail(email);
    if (!user || !isPositiveInteger(user.merchantId) || !isMerchantUserRole(user.role) || user.status !== 'active') {
      return true; // Do not reveal whether a usable login exists.
    }

    const resetToken = generateResetToken();
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await storage.setUserResetToken(user.id, hashResetToken(resetToken), resetTokenExpiry);

    return await sendPasswordResetEmail(user.email, resetToken, baseUrl);
  } catch (error) {
    console.error('Failed to process password reset request:', error);
    return false;
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  try {
    const { storage } = await import('./storage');
    const tokenHash = hashResetToken(token);
    const now = new Date();
    const candidate = await storage.getUserByResetToken(tokenHash);
    if (!candidate || !resetEligible(candidate, now)) return false;

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const updated = await storage.resetUserPasswordByToken(tokenHash, hashedPassword, now);
    return !!updated && isMerchantUserRole(updated.role) && updated.status === 'active';
  } catch (error) {
    console.error('Failed to reset password:', error);
    return false;
  }
}

export async function validateResetToken(token: string): Promise<boolean> {
  try {
    const { storage } = await import('./storage');
    const user = await storage.getUserByResetToken(hashResetToken(token));
    return !!user && resetEligible(user, new Date());
  } catch (error) {
    console.error('Failed to validate reset token:', error);
  }
  return false;
}