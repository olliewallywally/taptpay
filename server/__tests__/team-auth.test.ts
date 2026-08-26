import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret-for-team-auth";
process.env.JWT_SECRET = JWT_SECRET;

const storageMock = {
  getUserById: jest.fn(),
  getUserByEmail: jest.fn(),
  getMerchant: jest.fn(),
  recordUserLogin: jest.fn().mockResolvedValue(undefined),
};

jest.mock("../storage", () => ({ storage: storageMock }));

import { authenticateToken, generateToken, isAccountOwner, TOKEN_PRINCIPAL } from "../auth";

function res() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
}

const ACTIVE_MERCHANT = { id: 22, status: "active" };
const OWNER_ROW = {
  id: 5, email: "owner@example.test", password: "hash",
  merchantId: 22, role: "owner", status: "active",
};

beforeEach(() => {
  jest.clearAllMocks();
  storageMock.getMerchant.mockResolvedValue(ACTIVE_MERCHANT);
  storageMock.getUserById.mockResolvedValue(OWNER_ROW);
});

describe("token principal", () => {
  it("issues tokens carrying the users-row id, not the merchant id", () => {
    const token = generateToken({
      id: 5, userId: 5, email: "owner@example.test", password: "",
      merchantId: 22, role: "owner", createdAt: new Date(),
    });
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(decoded.principal).toBe(TOKEN_PRINCIPAL);
    expect(decoded.userId).toBe(5);
    expect(decoded.merchantId).toBe(22);
  });

  it("rejects a pre-team-logins token whose userId is really a merchant id", async () => {
    // These tokens are indistinguishable from valid ones except for the missing
    // principal claim; honouring one would resolve the wrong users row.
    const legacy = jwt.sign(
      { userId: 22, email: "owner@example.test", merchantId: 22, role: "merchant" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );
    const response = res();
    const next = jest.fn();
    await authenticateToken(
      { headers: { authorization: `Bearer ${legacy}` } } as any,
      response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(storageMock.getUserById).not.toHaveBeenCalled();
  });

  it("accepts a current token and resolves the user row", async () => {
    const token = generateToken({
      id: 5, userId: 5, email: "owner@example.test", password: "",
      merchantId: 22, role: "owner", createdAt: new Date(),
    });
    const request: any = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();
    await authenticateToken(request, res(), next);

    expect(next).toHaveBeenCalled();
    expect(request.user).toMatchObject({ id: 5, merchantId: 22, role: "owner" });
  });
});

describe("seat revocation", () => {
  it("refuses a disabled teammate even though their token is still valid", async () => {
    storageMock.getUserById.mockResolvedValue({ ...OWNER_ROW, id: 9, role: "member", status: "disabled" });
    const token = generateToken({
      id: 9, userId: 9, email: "member@example.test", password: "",
      merchantId: 22, role: "member", createdAt: new Date(),
    });
    const response = res();
    const next = jest.fn();
    await authenticateToken(
      { headers: { authorization: `Bearer ${token}` } } as any,
      response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("refuses a token whose merchant no longer matches the user row", async () => {
    // Guards against a token minted for one account being replayed against another.
    storageMock.getUserById.mockResolvedValue({ ...OWNER_ROW, merchantId: 99 });
    const token = generateToken({
      id: 5, userId: 5, email: "owner@example.test", password: "",
      merchantId: 22, role: "owner", createdAt: new Date(),
    });
    const response = res();
    const next = jest.fn();
    await authenticateToken(
      { headers: { authorization: `Bearer ${token}` } } as any,
      response,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
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
