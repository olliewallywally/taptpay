import bcrypt from 'bcrypt';
import { config } from './config';
import { isDemoAccountLoginBlocked } from './demo-safety';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { sendPasswordResetEmail } from './email-service';
import {
  CSRF_HEADER,
  adminTagMatches,
  clearSessionCookie,
  csrfTokenFor,
  csrfTokenMatches,
  parseSessionCookie,
  presentedSecret,
  readSessionCookie,
  sessionEnded,
  settleSession,
  startSession,
  type PresentedSecret,
  type SessionEndReason,
  type SessionRealm,
  type StartedSession,
} from './auth-sessions';
import { getBaseUrl } from './url-utils';
import type { AuthSession } from '@shared/schema';
import type { IStorage } from './storage';

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
  /**
   * R1-T4 phase D: the users row's session version. Tokens carry the version they
   * were issued under; a password reset or "sign out everywhere" advances it.
   */
  sessionVersion?: number;
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
// LOGIN SECURITY
// ============================================
// Sign-in and password-reset attempts are throttled in shared storage — slowed
// down, never locked (R1-T4 phase C): server/auth-throttle.ts, server/sign-in-device.ts.

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

export interface AuthenticatedRequest extends Request {
  user?: User;
  /** R1-T4 phase E: the session the request was signed in by, when it was a session cookie. */
  authSession?: { id: string; realm: SessionRealm };
}

// Retained for backwards compatibility with startup and verification call sites.
// User rows are synchronised by the storage write that sets an owner's password.
export async function syncVerifiedMerchants(): Promise<void> {
  // no-op — authentication reads live from the users table
}

export const JWT_SECRET = config.jwtSecret;

function userRowToUser(row: {
  id: number;
  email: string;
  password: string;
  merchantId: number | null;
  role: string;
  sessionVersion?: number | null;
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
    sessionVersion: row.sessionVersion ?? 0,
    createdAt: row.createdAt ?? new Date(),
  };
}

// ============================================
// PASSWORD CHECKS THAT DO NOT TELL WHO HAS A LOGIN
// ============================================
// Owner decision 2026-09-23: how long a sign-in takes must not tell whether the
// email has a login. bcrypt's work doubles with each step of cost, and it answers
// a malformed hash at once, so a check here always spends the work of one check at
// PASSWORD_HASH_COST, whatever the stored hash is.

/** The bcrypt cost of every password hash the app writes. */
export const PASSWORD_HASH_COST = 12;

const BCRYPT_HASH = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/;

/** The cost of a well-formed bcrypt hash; null for anything else. */
function bcryptCost(hash: string | null | undefined): number | null {
  const match = hash ? BCRYPT_HASH.exec(hash) : null;
  const cost = match ? Number(match[1]) : Number.NaN;
  return cost >= 4 && cost <= 31 ? cost : null;
}

// Costs what a real hash of the same cost does, and matches no password: a fresh
// salt with a result no password produces. Nothing is hashed to make one.
function standInHash(cost: number): string {
  return bcrypt.genSaltSync(cost) + '.'.repeat(31);
}

/** The work a check against `hash` must spend: a full check, or the hash's own if dearer. */
export function passwordCheckBudget(hash: string | null | undefined): number {
  return Math.max(PASSWORD_HASH_COST, bcryptCost(hash) ?? 0);
}

/**
 * Whether `password` matches `storedHash`, after the work of one check at
 * `budgetCost` whatever the hash: missing, malformed, or made at a lower cost
 * (most older accounts carry cost 10). A lower-cost check is topped up with
 * stand-ins at costs c, c+1, …, budget−1: 2^c + 2^c + 2^(c+1) + … = 2^budget.
 */
export async function checkPasswordEvenly(
  password: string,
  storedHash: string | null | undefined,
  budgetCost = PASSWORD_HASH_COST,
): Promise<boolean> {
  const cost = bcryptCost(storedHash);
  if (cost === null) {
    await bcrypt.compare(password, standInHash(budgetCost));
    return false;
  }
  const matches = await bcrypt.compare(password, storedHash!);
  for (let topUp = cost; topUp < budgetCost; topUp += 1) {
    await bcrypt.compare(password, standInHash(topUp));
  }
  return matches;
}

/**
 * Resolves a login against the `users` table — one row per person, so a seat can
 * be revoked without disturbing anyone else's access.
 *
 * Three gates, all of which must pass: the user row is active, the parent
 * merchant is verified/active, and the password matches. A disabled teammate
 * fails the first gate even though their password is still correct. The password
 * is checked first, at full cost, for every attempt — an email with no login
 * included — so how long a refusal takes tells nothing.
 */
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const { storage } = await import('./storage');

  const userRow = await storage.getUserByEmail(email);
  const candidate = userRow && !isDemoAccountLoginBlocked(config.appEnv, email) ? userRow : undefined;
  const isValid = await checkPasswordEvenly(password, candidate?.password);
  if (!candidate || !isValid || candidate.status !== 'active') return null;

  const user = userRowToUser(candidate);
  if (!user) return null;

  const merchant = await storage.getMerchant(user.merchantId);
  if (!merchant) return null;
  if (merchant.status !== 'verified' && merchant.status !== 'active') return null;

  if (!(await memberWithinSeatLimit(user))) return null;

  await storage.recordUserLogin(candidate.id, new Date()).catch(() => {});
  return user;
}

/**
 * Downgrades are normally blocked while too many seats are occupied, but this
 * second gate covers races, manual repairs and future migrations. The owner
 * always retains access so the account can remove seats or fix billing.
 */
async function memberWithinSeatLimit(user: User): Promise<boolean> {
  if (user.role !== 'member') return true;
  const { storage } = await import('./storage');
  const subscription = await storage.getSubscription(user.merchantId);
  const seatLimit = subscription?.seatLimit;
  if (!isPositiveInteger(seatLimit)) return false;
  const seatsInUse = await storage.countSeatsInUse(user.merchantId);
  return seatsInUse <= seatLimit;
}

/**
 * R1-T4 phase A: an account token for a users row that has just proved itself
 * without a password — Google sign-in's one-time code. Every other gate of a
 * password login applies: the row is active, the merchant verified or active, a
 * member within the seat limit.
 */
export async function issueTokenForUserId(
  userId: number,
): Promise<{ token: string; merchantId: number; userId: number; sessionVersion: number } | null> {
  if (!isPositiveInteger(userId)) return null;
  const { storage } = await import('./storage');
  const userRow = await storage.getUserById(userId);
  if (!userRow || userRow.status !== 'active') return null;
  const user = userRowToUser(userRow);
  if (!user) return null;
  const merchant = await storage.getMerchant(user.merchantId);
  if (!merchant || (merchant.status !== 'verified' && merchant.status !== 'active')) return null;
  if (!(await memberWithinSeatLimit(user))) return null;
  await storage.recordUserLogin(userRow.id, new Date()).catch(() => {});
  return { token: generateToken(user), merchantId: user.merchantId, userId: userRow.id, sessionVersion: user.sessionVersion ?? 0 };
}

/** A token for a users row just read or updated, under its current session version; null if it is not a merchant login. */
export function tokenForUserRow(row: Parameters<typeof userRowToUser>[0]): string | null {
  const user = userRowToUser(row);
  return user ? generateToken(user) : null;
}

export function generateToken(user: User): string {
  const userId = user.userId ?? user.id;
  if (!isPositiveInteger(userId) || typeof user.email !== 'string' || !user.email) {
    throw new Error('Cannot issue a token for an invalid principal');
  }

  if (user.role === 'admin') {
    const adminEmail = config.admin.email;
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
      role: user.role,
      sv: user.sessionVersion ?? 0,
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

/**
 * Marks a storage read that never answered, as opposed to one that answered
 * "no such row".
 *
 * Collapsing the two is how a database outage came to be reported to every
 * signed-in merchant as `404 User not found` — indistinguishable from a deleted
 * account. Reads on the authentication path go through `readForAuth`, which
 * returns this marker instead of throwing, so the caller has to decide which of
 * the two it is rather than falling through to the same answer for both.
 */
const STORAGE_UNAVAILABLE = Symbol('auth.storageUnavailable');

async function readForAuth<T>(
  what: string,
  read: () => Promise<T>,
): Promise<T | typeof STORAGE_UNAVAILABLE> {
  try {
    return await read();
  } catch (error) {
    // Never logged through logSecurityEvent: an outage makes this fire on every
    // request, and the audit log is an append-only file on the same box.
    console.error(`[AUTH_STORAGE_UNAVAILABLE] failed to ${what}:`, error);
    return STORAGE_UNAVAILABLE;
  }
}

/**
 * The honest answer when we cannot tell whether a session is valid. 503 (not
 * 401/403/404) so the client keeps the credentials it holds: nothing about them
 * has been disproved, we simply could not check.
 */
function respondAuthBackendUnavailable(res: Response) {
  res.setHeader('Retry-After', '5');
  return res.status(503).json({
    code: 'AUTH_BACKEND_UNAVAILABLE',
    message: 'Could not verify your session right now. This is a problem on our side — please retry.',
  });
}

export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // R1-T4 phase E: a Bearer header, while it is still accepted, is the sign-in; without one, the
  // session cookie is. The admin area reads only the admin's cookie; every other route the business's,
  // then the admin's, so the platform admin gets the answers its token got.
  if (req.headers['authorization'] === undefined) {
    const realms: SessionRealm[] = req.path.startsWith('/api/admin') ? ['admin'] : ['business', 'admin'];
    for (const realm of realms) {
      const value = readSessionCookie(req, realm);
      if (value !== undefined) return authenticateSession(req, res, next, realm, value);
    }
  }

  const authHeader = req.headers['authorization'];
  const match = typeof authHeader === 'string' ? authHeader.match(/^Bearer ([^\s]+)$/i) : null;

  if (!match) {
    return res.status(401).json({ message: 'Access token required' });
  }
  const token = match[1];
  const decoded = verifyToken(token);
  // P2.2 (R1-T3, owner decision 2026-09-27): a credential that is missing, invalid, expired or disabled
  // is 401, so every page sends the person to sign in again (it was 403 here and below).
  if (!decoded) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // A role string alone is not admin authority. Require the dedicated principal,
  // the configured email, and a zero merchant scope.
  if (decoded.role === 'admin') {
    const adminEmail = config.admin.email;
    if (
      decoded.principal !== ADMIN_TOKEN_PRINCIPAL ||
      !adminEmail ||
      typeof decoded.email !== 'string' ||
      decoded.email.toLowerCase() !== adminEmail.toLowerCase() ||
      decoded.merchantId !== 0 ||
      !isPositiveInteger(decoded.userId)
    ) {
      return res.status(401).json({ message: 'Invalid admin session' });
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

  // R1-T4 phase D: tokens issued before session versions carry none and count as
  // version 0, so they last only until the login's sessions are first ended.
  const tokenSessionVersion = decoded.sv === undefined ? 0 : decoded.sv;
  if (
    !isPositiveInteger(decoded.merchantId) ||
    !isPositiveInteger(decoded.userId) ||
    !isMerchantUserRole(decoded.role) ||
    !Number.isInteger(tokenSessionVersion) ||
    tokenSessionVersion < 0
  ) {
    return res.status(401).json({ code: 'INVALID_SESSION', message: 'Invalid session' });
  }

  // Each read is guarded on its own, and the decisions sit outside the guard, so
  // that only a genuine answer from the database can produce a 401 — a rejection
  // here is a statement about this principal, never about our uptime.
  const storageModule = await readForAuth('load the storage module', () => import('./storage'));
  if (storageModule === STORAGE_UNAVAILABLE) return respondAuthBackendUnavailable(res);
  const { storage } = storageModule;

  const userRow = await readForAuth('read the users row', () => storage.getUserById(decoded.userId));
  if (userRow === STORAGE_UNAVAILABLE) return respondAuthBackendUnavailable(res);

  const user = userRow ? userRowToUser(userRow) : null;

  // Re-check the identity on every request so disabling a teammate takes effect
  // within the token's remaining lifetime rather than at its natural expiry.
  if (!userRow || !user || userRow.status !== 'active' || user.merchantId !== decoded.merchantId) {
    return res.status(401).json({ message: 'Access revoked' });
  }

  // A password reset or "sign out everywhere" advanced the version: every token
  // issued before it is spent. 401, so the client drops it and signs in again.
  if (tokenSessionVersion !== (userRow.sessionVersion ?? 0)) {
    return res.status(401).json({ code: 'SESSION_ENDED', message: 'You were signed out. Please sign in again.' });
  }

  const merchant = await readForAuth('read the merchant row', () => storage.getMerchant(decoded.merchantId));
  if (merchant === STORAGE_UNAVAILABLE) return respondAuthBackendUnavailable(res);

  // A row that is absent, unverified or suspended — the database answered, and
  // the answer is that this login has no usable account behind it.
  if (!merchant || (merchant.status !== 'verified' && merchant.status !== 'active')) {
    return res.status(401).json({ code: 'ACCESS_REVOKED', message: 'Access revoked' });
  }

  // The database role is authoritative; stale JWT role claims are ignored.
  req.user = user;
  return next();
}

// ============================================
// SESSION COOKIES (R1-T4 phase E)
// ============================================

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type SessionRefusal = { status: 401; body: Record<string, string> };
type SessionResolution =
  | { kind: 'ok'; user: User; session: AuthSession; presented: Exclude<PresentedSecret, 'late'> }
  | { kind: 'refused'; refusal: SessionRefusal }
  | { kind: 'unavailable' };
type SessionLoginResolution =
  | { kind: 'ok'; user: User }
  | { kind: 'refused'; refusal: SessionRefusal }
  | { kind: 'unavailable' };

const SESSION_REFUSALS = {
  INVALID_SESSION: { status: 401, body: { code: 'INVALID_SESSION', message: 'Please sign in again.' } },
  SESSION_ENDED: { status: 401, body: { code: 'SESSION_ENDED', message: 'You were signed out. Please sign in again.' } },
  ACCESS_REVOKED_LOGIN: { status: 401, body: { message: 'Access revoked' } },
  ACCESS_REVOKED: { status: 401, body: { code: 'ACCESS_REVOKED', message: 'Access revoked' } },
} as const satisfies Record<string, SessionRefusal>;

/**
 * Resolves a session cookie's value to its signed-in principal, or why not. The row is found by the
 * cookie's id and its secret checked in constant time; a replaced secret presented after its 60 seconds
 * ends the whole session (someone else holds a copy). The login and business are re-read as for a
 * token, and the login's session version must still be the session's. Writes nothing else: only a
 * request let through settles the session (settleSession).
 */
async function resolveSessionCookie(realm: SessionRealm, value: string): Promise<SessionResolution> {
  const refused = (refusal: SessionRefusal): SessionResolution => ({ kind: 'refused', refusal });
  const parsed = parseSessionCookie(value);
  if (!parsed) return refused(SESSION_REFUSALS.INVALID_SESSION);

  const storageModule = await readForAuth('load the storage module', () => import('./storage'));
  if (storageModule === STORAGE_UNAVAILABLE) return { kind: 'unavailable' };
  const { storage } = storageModule;

  const session = await readForAuth('read the session', () => storage.getAuthSession(parsed.id));
  if (session === STORAGE_UNAVAILABLE) return { kind: 'unavailable' };
  if (!session || session.principal !== realm) return refused(SESSION_REFUSALS.INVALID_SESSION);

  const now = new Date();
  const presented = presentedSecret(session, parsed.secret, now);
  if (!presented) return refused(SESSION_REFUSALS.INVALID_SESSION);
  if (sessionEnded(session, now)) return refused(SESSION_REFUSALS.SESSION_ENDED);
  if (presented === 'late') {
    // Someone else holds a copy of a replaced secret: end the session for both of them.
    const ended = await readForAuth('end a reused session', () => storage.revokeAuthSession(session.id, 'reuse_detected', now));
    logSecurityEvent('SESSION_REUSE_DETECTED', { sessionId: session.id, realm, userId: session.userId, ended: ended === true });
    return refused(SESSION_REFUSALS.SESSION_ENDED);
  }

  const login = await resolveSessionLogin(storage, realm, session);
  return login.kind === 'ok' ? { kind: 'ok', user: login.user, session, presented } : login;
}

/**
 * The login a session stands for, re-read as for a token: the admin's credentials must still be the
 * session's; a business login must be active, its session version still the session's, and its business
 * verified or active. Reads only.
 */
async function resolveSessionLogin(
  storage: Pick<IStorage, 'getUserById' | 'getMerchant'>,
  realm: SessionRealm,
  session: AuthSession,
): Promise<SessionLoginResolution> {
  const refused = (refusal: SessionRefusal): SessionLoginResolution => ({ kind: 'refused', refusal });
  if (realm === 'admin') {
    const adminEmail = config.admin.email;
    // The admin's email or password changed since this session began.
    if (!adminEmail || !adminTagMatches(session.adminTag)) return refused(SESSION_REFUSALS.SESSION_ENDED);
    const admin: User = { id: 1, email: adminEmail, password: '', merchantId: 0, role: 'admin', createdAt: new Date() };
    return { kind: 'ok', user: admin };
  }

  const userId = session.userId;
  if (!isPositiveInteger(userId)) return refused(SESSION_REFUSALS.INVALID_SESSION);
  const userRow = await readForAuth('read the users row', () => storage.getUserById(userId));
  if (userRow === STORAGE_UNAVAILABLE) return { kind: 'unavailable' };
  const user = userRow ? userRowToUser(userRow) : null;
  if (!userRow || !user || userRow.status !== 'active') return refused(SESSION_REFUSALS.ACCESS_REVOKED_LOGIN);
  // A password reset or change, or "sign out everywhere", advanced the version.
  if ((userRow.sessionVersion ?? 0) !== session.sessionVersion) return refused(SESSION_REFUSALS.SESSION_ENDED);
  const merchant = await readForAuth('read the merchant row', () => storage.getMerchant(user.merchantId));
  if (merchant === STORAGE_UNAVAILABLE) return { kind: 'unavailable' };
  if (!merchant || (merchant.status !== 'verified' && merchant.status !== 'active')) {
    return refused(SESSION_REFUSALS.ACCESS_REVOKED);
  }
  return { kind: 'ok', user };
}

/**
 * Whether the sign-in a live stream was opened by still stands, read again from shared storage, so an
 * ending made on another instance closes the stream here (external review 2026-09-29, R1-T4). True only
 * for a sign-in a request would still be let through on, and for `merchantId`'s own login or the
 * platform admin. A refusal and a storage fault alike answer false: the stream is closed and the page
 * asks again.
 *
 * A session cookie's stream is checked by its session id: the session must not have been ended or run
 * out, and its login is re-read. The cookie's secret is not presented again (the daily swap replaces it
 * while a stream stays open, and a replaced secret presented late would end the session as a stolen
 * copy), nothing is written, and the check is not a use: an open stream does not keep a session alive.
 * A token's stream (until phase E3) re-runs the request's whole authentication.
 */
export async function isStreamSessionActive(
  signIn: string | { id: string; realm: SessionRealm },
  merchantId?: number,
): Promise<boolean> {
  const user = typeof signIn === 'string' ? await userOfAuthorization(signIn) : await userOfLiveSession(signIn);
  if (!user) return false;
  return merchantId === undefined || user.role === 'admin' || user.merchantId === merchantId;
}

/** The principal an Authorization header signs in now, by the request's own authentication; else null. */
async function userOfAuthorization(authorization: string): Promise<User | null> {
  let accepted = false;
  const request = { headers: { authorization } } as AuthenticatedRequest;
  // No response is sent: whatever the refusal would have said, the stream is simply closed.
  const response = {
    status() { return this; }, json() { return this; }, setHeader() { return this; },
  } as unknown as Response;
  await authenticateToken(request, response, () => { accepted = true; });
  return accepted ? request.user ?? null : null;
}

/** The principal a session stands for now, when it has not been ended or run out; else null. */
async function userOfLiveSession(signIn: { id: string; realm: SessionRealm }): Promise<User | null> {
  const storageModule = await readForAuth('load the storage module', () => import('./storage'));
  if (storageModule === STORAGE_UNAVAILABLE) return null;
  const { storage } = storageModule;
  const session = await readForAuth('read the session', () => storage.getAuthSession(signIn.id));
  if (session === STORAGE_UNAVAILABLE || !session || session.principal !== signIn.realm) return null;
  if (sessionEnded(session, new Date())) return null;
  const login = await resolveSessionLogin(storage, signIn.realm, session);
  return login.kind === 'ok' ? login.user : null;
}

/**
 * Signs a request in by its session cookie: a refusal clears the cookie; a change needs the page's CSRF
 * token; a request let through takes up an offered secret, is offered the daily swap, and is recorded
 * as a use.
 */
async function authenticateSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  realm: SessionRealm,
  value: string,
) {
  const resolved = await resolveSessionCookie(realm, value);
  if (resolved.kind === 'unavailable') return respondAuthBackendUnavailable(res);
  if (resolved.kind === 'refused') {
    clearSessionCookie(res, realm);
    return res.status(resolved.refusal.status).json(resolved.refusal.body);
  }
  if (!SAFE_METHODS.has(req.method) && !csrfTokenMatches(req.headers[CSRF_HEADER], resolved.session.id, getBaseUrl(req))) {
    return res.status(403).json({
      code: 'CSRF_REJECTED',
      message: 'This request could not be verified. Please reload the page and try again.',
    });
  }
  await settleSession(res, realm, resolved.session, resolved.presented, new Date());
  req.user = resolved.user;
  req.authSession = { id: resolved.session.id, realm };
  return next();
}

/**
 * The start-up check's half of a business sign-in (GET /api/auth/session): the signed-in login, or
 * null — never a refusal, so a visitor who is not signed in gets an ordinary answer. An invalid cookie
 * is cleared; a valid session is settled like any request it signs in.
 */
export async function readBusinessSession(
  req: AuthenticatedRequest,
  res: Response,
): Promise<'unavailable' | { user: User; csrfToken: string } | null> {
  const value = readSessionCookie(req, 'business');
  if (value === undefined) return null;
  const resolved = await resolveSessionCookie('business', value);
  if (resolved.kind === 'unavailable') return 'unavailable';
  if (resolved.kind === 'refused') {
    clearSessionCookie(res, 'business');
    return null;
  }
  await settleSession(res, 'business', resolved.session, resolved.presented, new Date());
  req.user = resolved.user;
  req.authSession = { id: resolved.session.id, realm: 'business' };
  return { user: resolved.user, csrfToken: csrfTokenFor(resolved.session.id, getBaseUrl(req)) };
}

export { respondAuthBackendUnavailable };

/** Whether the request carries a business or admin session cookie at all, valid or not. */
export function hasSessionCookie(req: Request): boolean {
  return readSessionCookie(req, 'business') !== undefined || readSessionCookie(req, 'admin') !== undefined;
}

/** The page's CSRF token for the session a request was signed in by; undefined for a token sign-in. */
export function csrfTokenForRequest(req: AuthenticatedRequest): string | undefined {
  return req.authSession ? csrfTokenFor(req.authSession.id, getBaseUrl(req)) : undefined;
}

/** Starts a business session for a login that has just proved itself, and sets its cookie. */
export function startBusinessSession(
  req: Request,
  res: Response,
  login: { userId: number; sessionVersion: number },
): Promise<StartedSession> {
  return startSession(req, res, { realm: 'business', userId: login.userId, sessionVersion: login.sessionVersion });
}

/** Starts an admin session for the admin who has just proved themselves, and sets its cookie. */
export function startAdminSession(req: Request, res: Response): Promise<StartedSession> {
  return startSession(req, res, { realm: 'admin' });
}

/** Ends one session (Log Out), clears its cookie and records why. False when it had already ended. */
export async function endAuthSession(
  res: Response,
  session: { id: string; realm: SessionRealm },
  reason: SessionEndReason,
): Promise<boolean> {
  const { storage } = await import('./storage');
  const ended = await storage.revokeAuthSession(session.id, reason, new Date());
  clearSessionCookie(res, session.realm);
  logSecurityEvent('SESSION_REVOKED', { sessionId: session.id, realm: session.realm, reason });
  return ended;
}

/** Ends every live session of a login (but `keepId`) and records why; how many ended. */
export async function endLoginSessions(userId: number, reason: SessionEndReason, keepId?: string): Promise<number> {
  const { storage } = await import('./storage');
  const count = await storage.revokeAuthSessionsForLogin(userId, reason, new Date(), keepId);
  logSecurityEvent('SESSION_REVOKED', { userId, reason, sessions: count });
  return count;
}

export { clearSessionCookie };

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

/**
 * The login whose password was reset, or null. The reset also ends every session
 * of that login (R1-T4 phase D); the caller closes its live streams.
 *
 * A storage fault is thrown, never answered as null: null tells the user the link
 * is bad, and a good link must not be called expired because the database did not
 * answer (C10 route review, 2026-09-26). The route answers a fault with 500.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ userId: number; merchantId: number } | null> {
  const { storage } = await import('./storage');
  const tokenHash = hashResetToken(token);
  const now = new Date();
  const candidate = await storage.getUserByResetToken(tokenHash);
  if (!candidate || !resetEligible(candidate, now)) return null;

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  const updated = await storage.resetUserPasswordByToken(tokenHash, hashedPassword, now);
  if (!updated || !isMerchantUserRole(updated.role) || updated.status !== 'active') return null;
  if (!isPositiveInteger(updated.id) || !isPositiveInteger(updated.merchantId)) return null;
  return { userId: updated.id, merchantId: updated.merchantId };
}

/** Whether a reset link is live. A storage fault is thrown, never answered false (see resetPassword). */
export async function validateResetToken(token: string): Promise<boolean> {
  const { storage } = await import('./storage');
  const user = await storage.getUserByResetToken(hashResetToken(token));
  return !!user && resetEligible(user, new Date());
}
