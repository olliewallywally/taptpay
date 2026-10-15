import bcrypt from 'bcrypt';
import crypto from 'crypto';

const TEST_JWT_SECRET = 'test-secret-for-auth-core';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.ADMIN_EMAIL = 'admin@example.test';
// No password matches it: only its presence and its value matter here (the admin session's tag).
process.env.ADMIN_PASSWORD_HASH = '$2b$12$authCorePlaceholderAdminPasswordHash0000000000000';

const storageMock = {
  getAuthSession: jest.fn(),
  revokeAuthSession: jest.fn(),
  touchAuthSession: jest.fn(),
  getUserById: jest.fn(),
  getUserByEmail: jest.fn(),
  getUserByResetToken: jest.fn(),
  getMerchant: jest.fn(),
  getSubscription: jest.fn(),
  countSeatsInUse: jest.fn(),
  recordUserLogin: jest.fn(),
  updateMerchantPasswordHash: jest.fn(),
  setUserResetToken: jest.fn(),
  resetUserPasswordByToken: jest.fn(),
};
const mockSendPasswordResetEmail = jest.fn();

jest.mock('../storage', () => ({ storage: storageMock }));
jest.mock('../email-service', () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

import {
  authenticateToken,
  authenticateUser,
  createUser,
  requestPasswordReset,
  resetPassword,
  validateResetToken,
} from '../auth';
import { liveSession, requestWith, type LiveSession } from './support/session-row';

function response() {
  const value: any = {};
  value.status = jest.fn(() => value);
  value.json = jest.fn(() => value);
  value.setHeader = jest.fn(() => value);
  value.cookie = jest.fn(() => value);
  value.clearCookie = jest.fn(() => value);
  return value;
}

/** A session the mocked storage holds, for the request that presents its cookie. */
function held(session: LiveSession): LiveSession {
  storageMock.getAuthSession.mockImplementation(async (id: string) => (id === session.row.id ? session.row : undefined));
  return session;
}

const MERCHANT = {
  id: 22,
  email: 'owner@example.test',
  status: 'active',
  passwordHash: 'existing-owner-hash',
};

let passwordHash: string;
let ownerRow: any;

beforeAll(async () => {
  passwordHash = await bcrypt.hash('correct-password', 4);
});

beforeEach(() => {
  ownerRow = {
    id: 5,
    email: 'owner@example.test',
    password: passwordHash,
    merchantId: 22,
    role: 'owner',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    resetToken: null,
    resetTokenExpiry: null,
  };

  storageMock.getAuthSession.mockReset().mockResolvedValue(undefined);
  storageMock.revokeAuthSession.mockReset().mockResolvedValue(true);
  storageMock.touchAuthSession.mockReset().mockResolvedValue(undefined);
  storageMock.getUserById.mockResolvedValue(ownerRow);
  storageMock.getUserByEmail.mockResolvedValue(ownerRow);
  storageMock.getUserByResetToken.mockResolvedValue(undefined);
  storageMock.getMerchant.mockResolvedValue(MERCHANT);
  storageMock.getSubscription.mockResolvedValue({ seatLimit: 5 });
  storageMock.countSeatsInUse.mockResolvedValue(1);
  storageMock.recordUserLogin.mockResolvedValue(undefined);
  storageMock.updateMerchantPasswordHash.mockResolvedValue(MERCHANT);
  storageMock.setUserResetToken.mockResolvedValue(undefined);
  storageMock.resetUserPasswordByToken.mockResolvedValue(ownerRow);
  mockSendPasswordResetEmail.mockResolvedValue(true);
});

describe('real users-row principals', () => {
  it('returns the owner users row from createUser: its own id, never the business id', async () => {
    storageMock.getMerchant.mockResolvedValue({ ...MERCHANT, passwordHash: null });

    const user = await createUser('OWNER@example.test', 'random-google-secret', 22);

    expect(storageMock.updateMerchantPasswordHash).toHaveBeenCalledWith(22, expect.any(String));
    expect(storageMock.getUserByEmail).toHaveBeenCalledWith('owner@example.test');
    expect(user).toMatchObject({ id: 5, userId: 5, merchantId: 22, role: 'owner' });
  });

  it('runs the owner-row sync even when a merchant already has a password hash', async () => {
    await createUser('owner@example.test', 'unused', 22);
    expect(storageMock.updateMerchantPasswordHash).toHaveBeenCalledWith(22, 'existing-owner-hash');
  });

  it('refuses to mint a principal when a global email collision resolves to another merchant', async () => {
    storageMock.getUserByEmail.mockResolvedValue({ ...ownerRow, merchantId: 99 });
    await expect(createUser('owner@example.test', 'unused', 22)).rejects.toThrow('unique active owner');
  });

  it('never creates an admin identity in the merchant users table', async () => {
    await expect(createUser('admin@example.test', 'unused', 22, 'admin')).rejects.toThrow(
      'Admin identities cannot be created',
    );
    expect(storageMock.getMerchant).not.toHaveBeenCalled();
  });
});

describe('login-time seat enforcement', () => {
  it('always allows the owner when an account is over its seat limit', async () => {
    storageMock.countSeatsInUse.mockResolvedValue(9);
    const user = await authenticateUser('owner@example.test', 'correct-password');
    expect(user).toMatchObject({ id: 5, role: 'owner' });
    expect(storageMock.getSubscription).not.toHaveBeenCalled();
    expect(storageMock.recordUserLogin).toHaveBeenCalledWith(5, expect.any(Date));
  });

  it('refuses a member while occupied seats exceed the current plan', async () => {
    storageMock.getUserByEmail.mockResolvedValue({
      ...ownerRow,
      id: 9,
      email: 'member@example.test',
      role: 'member',
    });
    storageMock.getSubscription.mockResolvedValue({ seatLimit: 5 });
    storageMock.countSeatsInUse.mockResolvedValue(6);

    await expect(authenticateUser('member@example.test', 'correct-password')).resolves.toBeNull();
    expect(storageMock.recordUserLogin).not.toHaveBeenCalled();
  });

  it('allows a member within the plan and records the login', async () => {
    storageMock.getUserByEmail.mockResolvedValue({
      ...ownerRow,
      id: 9,
      email: 'member@example.test',
      role: 'member',
    });
    storageMock.countSeatsInUse.mockResolvedValue(5);

    const user = await authenticateUser('member@example.test', 'correct-password');
    expect(user).toMatchObject({ id: 9, role: 'member', merchantId: 22 });
    expect(storageMock.recordUserLogin).toHaveBeenCalledWith(9, expect.any(Date));
  });

  it.each(['admin', 'merchant', 'unexpected'])('fails closed for a database role of %s', async (role) => {
    storageMock.getUserByEmail.mockResolvedValue({ ...ownerRow, role });
    await expect(authenticateUser('owner@example.test', 'correct-password')).resolves.toBeNull();
    expect(storageMock.getMerchant).not.toHaveBeenCalled();
  });
});

describe('admin session provenance', () => {
  it("accepts only the admin area's own kind of session, begun under the admin's current credentials", async () => {
    const session = held(liveSession({ realm: 'admin' }));
    const request = requestWith(session.cookie, '/api/admin/auth/me');
    const next = jest.fn();

    await authenticateToken(request, response(), next);

    expect(session.row.adminTag).toEqual(expect.any(String));
    expect(next).toHaveBeenCalled();
    expect(request.user).toMatchObject({ role: 'admin', merchantId: 0, email: 'admin@example.test' });
    expect(storageMock.getUserById).not.toHaveBeenCalled();
  });

  it("rejects a business login's session presented under the admin's cookie", async () => {
    const session = held(liveSession({ realm: 'business', userId: 5 }, { as: 'admin' }));
    const result = response();
    const next = jest.fn();

    await authenticateToken(requestWith(session.cookie, '/api/admin/auth/me'), result, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(401); // 401 since 2026-09-27 (R1-T3, P2.2, owner decision): a sign-in that is invalid, expired or disabled was 403.
    expect(storageMock.getUserById).not.toHaveBeenCalled();
  });

  it("rejects an admin session begun under credentials that are no longer the admin's", async () => {
    const session = liveSession({ realm: 'admin' });
    session.row.adminTag = 'the-tag-of-a-password-since-changed';
    held(session);
    const result = response();
    const next = jest.fn();

    await authenticateToken(requestWith(session.cookie, '/api/admin/auth/me'), result, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(401);
    expect(result.json.mock.calls[0][0].code).toBe('SESSION_ENDED');
  });

  it("never reads the admin's cookie as a business login, whatever role its row might claim", async () => {
    // An admin session carries no login: on a business route it is the platform admin and nothing else.
    const session = held(liveSession({ realm: 'admin' }));
    const request = requestWith(session.cookie, '/api/auth/me');
    const next = jest.fn();

    await authenticateToken(request, response(), next);

    expect(next).toHaveBeenCalled();
    expect(request.user).toMatchObject({ role: 'admin', merchantId: 0 });
    expect(storageMock.getUserById).not.toHaveBeenCalled();
    expect(storageMock.getMerchant).not.toHaveBeenCalled();
  });
});

describe('an Authorization header is not a sign-in (R1-T4 phase E3)', () => {
  it('refuses a request that carries only a header, without consulting the database', async () => {
    const result = response();
    const next = jest.fn();
    const request = requestWith(undefined);
    request.headers.authorization = 'Bearer anything.at.all';

    await authenticateToken(request, result, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(401);
    expect(storageMock.getAuthSession).not.toHaveBeenCalled();
    expect(storageMock.getUserById).not.toHaveBeenCalled();
  });

  it('signs a request in by its cookie whatever header comes with it', async () => {
    const session = held(liveSession({ realm: 'business', userId: 5 }));
    const request = requestWith(session.cookie);
    request.headers.authorization = 'Bearer anything.at.all';
    const next = jest.fn();

    await authenticateToken(request, response(), next);

    expect(next).toHaveBeenCalled();
    expect(request.user).toMatchObject({ id: 5, merchantId: 22, role: 'owner' });
  });
});

/**
 * A database outage used to be reported as `404 User not found`, because the
 * lookup's catch fell through to the same response as a missing row. To a
 * signed-in merchant that is indistinguishable from "your account was deleted",
 * and the client acted on it by wiping the session. These tests hold the line
 * between "the database answered no" and "the database did not answer".
 */
describe('database outage versus a real rejection', () => {
  async function callWithSession() {
    const session = held(liveSession({ realm: 'business', userId: 5 }));
    const result = response();
    const next = jest.fn();
    await authenticateToken(requestWith(session.cookie), result, next);
    return { result, next };
  }

  function bodyOf(result: any) {
    return result.json.mock.calls[0][0];
  }

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('answers 503, not 404, when the users lookup cannot reach the database', async () => {
    storageMock.getUserById.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:5432'));

    const { result, next } = await callWithSession();

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(503);
    expect(result.status).not.toHaveBeenCalledWith(404);
  });

  it('never tells a merchant their account is missing because of an outage', async () => {
    storageMock.getUserById.mockRejectedValue(new Error('terminating connection due to administrator command'));

    const { result } = await callWithSession();
    const body = bodyOf(result);

    expect(body.code).toBe('AUTH_BACKEND_UNAVAILABLE');
    expect(body.message).not.toMatch(/not found/i);
    expect(body.message).toMatch(/our side/i);
    expect(result.setHeader).toHaveBeenCalledWith('Retry-After', '5');
  });

  it('answers 503 when the session lookup is the read that fails, and keeps the cookie', async () => {
    // The first read of all: a session that could not be looked up has not been disproved.
    const session = liveSession({ realm: 'business', userId: 5 });
    storageMock.getAuthSession.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const result = response();
    const next = jest.fn();

    await authenticateToken(requestWith(session.cookie), result, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(503);
    expect(bodyOf(result).code).toBe('AUTH_BACKEND_UNAVAILABLE');
    expect(result.clearCookie).not.toHaveBeenCalled();
    expect(storageMock.getUserById).not.toHaveBeenCalled();
  });

  it('answers 503 when the merchant lookup is the read that fails', async () => {
    // The last read is reached only after the session and the users row have validated,
    // so this covers the half of the outage window the first test cannot.
    storageMock.getMerchant.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const { result, next } = await callWithSession();

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(503);
    expect(bodyOf(result).code).toBe('AUTH_BACKEND_UNAVAILABLE');
    expect(result.clearCookie).not.toHaveBeenCalled();
  });

  it('treats a synchronous driver throw as an outage too', async () => {
    storageMock.getUserById.mockImplementation(() => {
      throw new Error('pool destroyed');
    });

    const { result, next } = await callWithSession();

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(503);
  });

  it('answers 401 when the database says the merchant principal is gone', async () => {
    storageMock.getMerchant.mockResolvedValue(undefined);

    const { result, next } = await callWithSession();

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(401);
    expect(bodyOf(result)).toEqual({ code: 'ACCESS_REVOKED', message: 'Access revoked' });
  });

  it.each(['pending', 'suspended', 'rejected'])(
    'answers 401 when the merchant row exists but is %s',
    async (status) => {
      storageMock.getMerchant.mockResolvedValue({ ...MERCHANT, status });

      const { result, next } = await callWithSession();

      expect(next).not.toHaveBeenCalled();
      expect(result.status).toHaveBeenCalledWith(401);
    },
  );

  it('still answers 401 for a revoked seat rather than hiding it behind 503', async () => {
    storageMock.getUserById.mockResolvedValue({ ...ownerRow, status: 'disabled' });

    const { result, next } = await callWithSession();

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(401);
    expect(result.status).not.toHaveBeenCalledWith(503);
  });

  it('does not consult the database at all for an unreadable cookie', async () => {
    // Whether the database is up is irrelevant when the cookie itself is not one this server wrote —
    // that verdict must stay a 401 and must not become an outage report.
    storageMock.getAuthSession.mockRejectedValue(new Error('db is down'));
    storageMock.getUserById.mockRejectedValue(new Error('db is down'));
    const session = liveSession({ realm: 'business', userId: 5 });
    const result = response();
    const next = jest.fn();

    await authenticateToken(requestWith(`${session.cookie.split('=')[0]}=not-a-session`), result, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(401);
    expect(storageMock.getAuthSession).not.toHaveBeenCalled();
    expect(storageMock.getUserById).not.toHaveBeenCalled();
  });

  it('lets a healthy request through unchanged', async () => {
    const { result, next } = await callWithSession();

    expect(next).toHaveBeenCalled();
    expect(result.status).not.toHaveBeenCalled();
    // Nothing is written for a session used within the minute and not yet due its daily swap.
    expect(storageMock.touchAuthSession).not.toHaveBeenCalled();
    expect(result.cookie).not.toHaveBeenCalled();
  });
});

describe('user-backed password resets', () => {
  it('stores only a SHA-256 token digest and emails the raw one to a member', async () => {
    storageMock.getUserByEmail.mockResolvedValue({
      ...ownerRow,
      id: 9,
      email: 'member@example.test',
      role: 'member',
    });

    await expect(requestPasswordReset('MEMBER@example.test', 'https://example.test')).resolves.toBe(true);

    const rawToken = mockSendPasswordResetEmail.mock.calls[0][1] as string;
    const expectedHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(storageMock.setUserResetToken).toHaveBeenCalledWith(9, expectedHash, expect.any(Date));
    expect(storageMock.setUserResetToken).not.toHaveBeenCalledWith(9, rawToken, expect.any(Date));
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      'member@example.test',
      rawToken,
      'https://example.test',
    );
  });

  it('does not create a reset for invited or disabled identities', async () => {
    storageMock.getUserByEmail.mockResolvedValue({ ...ownerRow, status: 'disabled' });
    await expect(requestPasswordReset('owner@example.test')).resolves.toBe(true);
    expect(storageMock.setUserResetToken).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('atomically consumes a live reset token and updates the users-row password', async () => {
    const rawToken = 'a'.repeat(64);
    const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    storageMock.getUserByResetToken.mockResolvedValue({
      ...ownerRow,
      resetToken: tokenHash,
      resetTokenExpiry: new Date(Date.now() + 60_000),
    });

    await expect(resetPassword(rawToken, 'new-password')).resolves.toEqual({ userId: 5, merchantId: 22 });

    const [storedTokenHash, storedPasswordHash, now] = storageMock.resetUserPasswordByToken.mock.calls[0];
    expect(storedTokenHash).toBe(tokenHash);
    expect(now).toBeInstanceOf(Date);
    await expect(bcrypt.compare('new-password', storedPasswordHash)).resolves.toBe(true);
  });

  it('fails if another request already consumed the otherwise-valid token', async () => {
    storageMock.getUserByResetToken.mockResolvedValue({
      ...ownerRow,
      resetTokenExpiry: new Date(Date.now() + 60_000),
    });
    storageMock.resetUserPasswordByToken.mockResolvedValue(null);
    await expect(resetPassword('b'.repeat(64), 'new-password')).resolves.toBeNull();
  });

  it('hashes validation tokens and rejects expired ones', async () => {
    const rawToken = 'c'.repeat(64);
    const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    storageMock.getUserByResetToken.mockResolvedValue({
      ...ownerRow,
      resetTokenExpiry: new Date(Date.now() - 1),
    });

    await expect(validateResetToken(rawToken)).resolves.toBe(false);
    expect(storageMock.getUserByResetToken).toHaveBeenCalledWith(tokenHash);
    expect(storageMock.resetUserPasswordByToken).not.toHaveBeenCalled();
  });
});
