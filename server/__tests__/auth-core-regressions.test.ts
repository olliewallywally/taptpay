import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-secret-for-auth-core';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.ADMIN_EMAIL = 'admin@example.test';

const storageMock = {
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
  generateToken,
  requestPasswordReset,
  resetPassword,
  validateResetToken,
} from '../auth';

function response() {
  const value: any = {};
  value.status = jest.fn(() => value);
  value.json = jest.fn(() => value);
  value.setHeader = jest.fn(() => value);
  return value;
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
  it('returns the owner users row from createUser and mints its uid', async () => {
    storageMock.getMerchant.mockResolvedValue({ ...MERCHANT, passwordHash: null });

    const user = await createUser('OWNER@example.test', 'random-google-secret', 22);
    const token = generateToken(user);
    const decoded = jwt.verify(token, TEST_JWT_SECRET) as any;

    expect(storageMock.updateMerchantPasswordHash).toHaveBeenCalledWith(22, expect.any(String));
    expect(storageMock.getUserByEmail).toHaveBeenCalledWith('owner@example.test');
    expect(user).toMatchObject({ id: 5, userId: 5, merchantId: 22, role: 'owner' });
    expect(decoded).toMatchObject({ userId: 5, merchantId: 22, role: 'owner', principal: 'user' });
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

describe('admin token provenance', () => {
  it('accepts only a dedicated environment-backed admin principal', async () => {
    const token = generateToken({
      id: 1,
      email: 'admin@example.test',
      password: '',
      merchantId: 0,
      role: 'admin',
      createdAt: new Date(),
    });
    const decoded = jwt.verify(token, TEST_JWT_SECRET) as any;
    const request: any = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();

    await authenticateToken(request, response(), next);

    expect(decoded.principal).toBe('admin');
    expect(next).toHaveBeenCalled();
    expect(request.user).toMatchObject({ role: 'admin', merchantId: 0, email: 'admin@example.test' });
    expect(storageMock.getUserById).not.toHaveBeenCalled();
  });

  it('rejects a role-only admin token carrying the normal user principal', async () => {
    const token = jwt.sign(
      { principal: 'user', userId: 1, email: 'admin@example.test', merchantId: 0, role: 'admin' },
      TEST_JWT_SECRET,
    );
    const result = response();
    const next = jest.fn();

    await authenticateToken({ headers: { authorization: `Bearer ${token}` } } as any, result, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
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
  function merchantToken() {
    return generateToken({
      id: 5,
      userId: 5,
      email: 'owner@example.test',
      password: '',
      merchantId: 22,
      role: 'owner',
      createdAt: new Date(),
    });
  }

  async function callWithToken() {
    const result = response();
    const next = jest.fn();
    await authenticateToken(
      { headers: { authorization: `Bearer ${merchantToken()}` } } as any,
      result,
      next,
    );
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

    const { result, next } = await callWithToken();

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(503);
    expect(result.status).not.toHaveBeenCalledWith(404);
  });

  it('never tells a merchant their account is missing because of an outage', async () => {
    storageMock.getUserById.mockRejectedValue(new Error('terminating connection due to administrator command'));

    const { result } = await callWithToken();
    const body = bodyOf(result);

    expect(body.code).toBe('AUTH_BACKEND_UNAVAILABLE');
    expect(body.message).not.toMatch(/not found/i);
    expect(body.message).toMatch(/our side/i);
    expect(result.setHeader).toHaveBeenCalledWith('Retry-After', '5');
  });

  it('answers 503 when the merchant lookup is the read that fails', async () => {
    // The second read is reached only after the users row has already validated,
    // so this covers the half of the outage window the first test cannot.
    storageMock.getMerchant.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const { result, next } = await callWithToken();

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(503);
    expect(bodyOf(result).code).toBe('AUTH_BACKEND_UNAVAILABLE');
  });

  it('treats a synchronous driver throw as an outage too', async () => {
    storageMock.getUserById.mockImplementation(() => {
      throw new Error('pool destroyed');
    });

    const { result, next } = await callWithToken();

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(503);
  });

  it('answers 403 when the database says the merchant principal is gone', async () => {
    storageMock.getMerchant.mockResolvedValue(undefined);

    const { result, next } = await callWithToken();

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
    expect(bodyOf(result)).toEqual({ code: 'ACCESS_REVOKED', message: 'Access revoked' });
  });

  it.each(['pending', 'suspended', 'rejected'])(
    'answers 403 when the merchant row exists but is %s',
    async (status) => {
      storageMock.getMerchant.mockResolvedValue({ ...MERCHANT, status });

      const { result, next } = await callWithToken();

      expect(next).not.toHaveBeenCalled();
      expect(result.status).toHaveBeenCalledWith(403);
    },
  );

  it('still answers 403 for a revoked seat rather than hiding it behind 503', async () => {
    storageMock.getUserById.mockResolvedValue({ ...ownerRow, status: 'disabled' });

    const { result, next } = await callWithToken();

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.status).not.toHaveBeenCalledWith(503);
  });

  it('does not consult the database at all for an unreadable token', async () => {
    // Whether the database is up is irrelevant when the token itself is bad —
    // that verdict must stay a 403 and must not become an outage report.
    storageMock.getUserById.mockRejectedValue(new Error('db is down'));
    const result = response();
    const next = jest.fn();

    await authenticateToken({ headers: { authorization: 'Bearer not-a-jwt' } } as any, result, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
    expect(storageMock.getUserById).not.toHaveBeenCalled();
  });

  it('lets a healthy request through unchanged', async () => {
    const { result, next } = await callWithToken();

    expect(next).toHaveBeenCalled();
    expect(result.status).not.toHaveBeenCalled();
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

    await expect(resetPassword(rawToken, 'new-password')).resolves.toBe(true);

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
    await expect(resetPassword('b'.repeat(64), 'new-password')).resolves.toBe(false);
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
