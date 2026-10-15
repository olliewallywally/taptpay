const JWT_SECRET = "test-secret-for-team-auth";
process.env.JWT_SECRET = JWT_SECRET;

const storageMock = {
  getAuthSession: jest.fn(),
  revokeAuthSession: jest.fn().mockResolvedValue(true),
  touchAuthSession: jest.fn().mockResolvedValue(undefined),
  getUserById: jest.fn(),
  getUserByEmail: jest.fn(),
  getMerchant: jest.fn(),
  recordUserLogin: jest.fn().mockResolvedValue(undefined),
};

jest.mock("../storage", () => ({ storage: storageMock }));

import { authenticateToken, isAccountOwner } from "../auth";
import { liveSession, requestWith } from "./support/session-row";

function res() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  r.setHeader = jest.fn(() => r);
  r.cookie = jest.fn(() => r);
  r.clearCookie = jest.fn(() => r);
  return r;
}

const ACTIVE_MERCHANT = { id: 22, status: "active" };
const OWNER_ROW = {
  id: 5, email: "owner@example.test", password: "hash",
  merchantId: 22, role: "owner", status: "active",
};

/** A request on a live session of the login with this users-row id, which the mocked storage holds. */
function signedInAs(userId: number) {
  const session = liveSession({ realm: "business", userId });
  storageMock.getAuthSession.mockImplementation(async (id: string) => (id === session.row.id ? session.row : undefined));
  return requestWith(session.cookie);
}

beforeEach(() => {
  jest.clearAllMocks();
  storageMock.getAuthSession.mockResolvedValue(undefined);
  storageMock.getMerchant.mockResolvedValue(ACTIVE_MERCHANT);
  storageMock.getUserById.mockResolvedValue(OWNER_ROW);
});

describe("session principal", () => {
  it("resolves a session's login by its users-row id, not the business's id", async () => {
    const request = signedInAs(5);
    const next = jest.fn();
    await authenticateToken(request, res(), next);

    expect(next).toHaveBeenCalled();
    expect(storageMock.getUserById).toHaveBeenCalledWith(5);
    expect(storageMock.getUserById).not.toHaveBeenCalledWith(22);
    expect(request.user).toMatchObject({ id: 5, userId: 5, merchantId: 22, role: "owner" });
  });

  it("signs no one in by an Authorization header, and reads no row for it", async () => {
    // The account token the app held before sessions (R1-T4 phase E3 retired it) named a users row in
    // its claims; nothing a header says is looked up any more.
    const request = requestWith(undefined);
    request.headers.authorization = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjV9.signature";
    const response = res();
    const next = jest.fn();
    await authenticateToken(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(storageMock.getAuthSession).not.toHaveBeenCalled();
    expect(storageMock.getUserById).not.toHaveBeenCalled();
  });

  it("refuses a session whose login row is not a business login", async () => {
    // Admins are environment-backed; an unknown role fails closed rather than inheriting member access.
    for (const row of [{ ...OWNER_ROW, role: "admin" }, { ...OWNER_ROW, role: "unexpected" }, { ...OWNER_ROW, merchantId: null }]) {
      storageMock.getUserById.mockResolvedValue(row);
      const response = res();
      const next = jest.fn();
      await authenticateToken(signedInAs(5), response, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toHaveBeenCalledWith(401);
    }
  });
});

describe("seat revocation", () => {
  it("refuses a disabled teammate even though their session is still live", async () => {
    storageMock.getUserById.mockResolvedValue({ ...OWNER_ROW, id: 9, role: "member", status: "disabled" });
    const response = res();
    const next = jest.fn();
    await authenticateToken(signedInAs(9), response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401); // 401 since 2026-09-27 (R1-T3, P2.2, owner decision): a sign-in that is invalid, expired or disabled was 403.
    // The session's row is left as it is: the refusal is the login's, read afresh on every request.
    expect(storageMock.revokeAuthSession).not.toHaveBeenCalled();
  });

  it("acts for the business the users row names now, never one remembered from sign-in", async () => {
    // A session names a login and nothing else: there is no business in the cookie to replay against
    // another account. The business is read from the login's row on every request.
    storageMock.getUserById.mockResolvedValue({ ...OWNER_ROW, merchantId: 99 });
    storageMock.getMerchant.mockImplementation(async (id: number) => (id === 99 ? { id: 99, status: "active" } : undefined));
    const request = signedInAs(5);
    const next = jest.fn();
    await authenticateToken(request, res(), next);

    expect(next).toHaveBeenCalled();
    expect(storageMock.getMerchant).toHaveBeenCalledWith(99);
    expect(storageMock.getMerchant).not.toHaveBeenCalledWith(22);
    expect(request.user).toMatchObject({ id: 5, merchantId: 99 });
  });
});

describe("owner authority", () => {
  it("treats owner, legacy merchant and admin as account owners", () => {
    expect(isAccountOwner({ role: "owner" })).toBe(true);
    expect(isAccountOwner({ role: "merchant" })).toBe(true);
    expect(isAccountOwner({ role: "admin" })).toBe(true);
  });

  it("does not let a member act as the owner", () => {
    expect(isAccountOwner({ role: "member" })).toBe(false);
    expect(isAccountOwner(undefined)).toBe(false);
  });
});
