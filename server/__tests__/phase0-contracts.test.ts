import { retailTransactionCreateRequestSchema } from "@shared/schema";
import {
  adminMerchantDto,
  adminMerchantSummaryDto,
  ownerMerchantDto,
  ownerTransactionDto,
  publicMerchantBrandDto,
  publicTransactionDto,
  pushNotificationPreferencesDto,
  tokenPaymentDto,
  tokenReceiptDto,
} from "../http-contracts";
import { redactSensitive } from "../request-log";
import { SseBroker } from "../sse-broker";
import { sanitizeWindcaveAuditDetails } from "../windcave";

const merchant = {
  id: 7,
  name: "Owner",
  businessName: "Safe Shop",
  businessType: "retail",
  email: "owner@example.test",
  phone: "021",
  address: "Owner address",
  status: "active",
  verificationToken: "verify-secret",
  passwordHash: "password-secret",
  googleId: "google-secret",
  qrCodeUrl: "/qr",
  paymentUrl: "/pay/7",
  currentProviderRate: "0.0290",
  ourRate: "0.0050",
  director: "Owner",
  nzbn: "123",
  contactEmail: "receipt@example.test",
  contactPhone: "022",
  businessAddress: "Shop address",
  businessDescription: "Shop",
  websiteUrl: "https://example.test",
  estimatedAnnualTurnover: "Under $50k",
  bankName: "Bank",
  bankAccountNumber: "secret-account",
  bankBranch: "secret-branch",
  accountHolderName: "Owner",
  gstNumber: "GST123",
  customLogoUrl: "/logo.png",
  windcaveApiKey: "processor-secret",
  windcaveMerchantId: "wc-merchant",
  themeId: "classic",
  emailVerified: true,
  onboardingCompleted: true,
  gstRegistered: true,
  tradeGstMode: "inclusive",
  dailyGoal: "500.00",
  tutorialGeneration: 1,
  tutorialAutoEnabled: true,
  billingCardLast4: "4242",
  billingCardBrand: "Visa",
  billingCardExpiry: "12/30",
  resetToken: "reset-secret",
  resetTokenExpiry: new Date(),
  rentReminderEnabled: true,
  rentReminderDelayDays: 3,
  rentReminderIntervalDays: 3,
  rentReminderMaxCount: 3,
  tradeRemindersEnabled: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
} as any;

const transaction = {
  id: 11,
  merchantId: 7,
  taptStoneId: 3,
  itemName: "Coffee",
  price: "5.00",
  status: "pending",
  windcaveTransactionId: "processor-id",
  paymentMethod: "qr_code",
  nfcSessionId: "nfc-secret",
  deviceId: "device-secret",
  isSplit: false,
  totalSplits: 1,
  completedSplits: 0,
  splitAmount: null,
  windcaveFeeRate: "0.0290",
  windcaveFeeAmount: "0.15",
  platformFeeRate: "0.0050",
  platformFeeAmount: "0.10",
  merchantNet: "4.75",
  totalRefunded: "0.00",
  refundableAmount: "5.00",
  windcaveSessionId: "session-secret",
  windcaveSessionState: "pending",
  windcaveXId: "x-secret",
  splitEnabled: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  paymentUrl: "/pay/7",
  qrCodeUrl: "/qr/7",
} as any;

describe("Phase 0 request and response contracts", () => {
  test("retail create accepts the legacy pending literal and rejects database fields", () => {
    expect(retailTransactionCreateRequestSchema.safeParse({
      merchantId: 7,
      itemName: "Coffee",
      price: "5.00",
      status: "pending",
      selectedStoneId: 3,
    }).success).toBe(true);

    for (const forbidden of [
      { status: "completed" },
      { taptStoneId: 3 },
      { windcaveSessionId: "session" },
      { platformFeeAmount: "1.00" },
      { paymentTokenHash: "hash" },
    ]) {
      expect(retailTransactionCreateRequestSchema.safeParse({
        merchantId: 7,
        itemName: "Coffee",
        price: "5.00",
        ...forbidden,
      }).success).toBe(false);
    }
  });

  test("merchant projections are positive allowlists", () => {
    expect(Object.keys(publicMerchantBrandDto(merchant)).sort()).toEqual([
      "businessAddress", "businessName", "contactEmail", "contactPhone",
      "customLogoUrl", "gstNumber", "id", "name", "nzbn", "themeId",
    ]);
    expect(Object.keys(adminMerchantSummaryDto(merchant)).sort()).toEqual([
      "businessName", "createdAt", "director", "email", "id", "name", "nzbn", "status",
    ]);

    const owner = ownerMerchantDto(merchant) as Record<string, unknown>;
    const admin = adminMerchantDto(merchant) as Record<string, unknown>;
    expect(Object.keys(owner).sort()).toEqual([
      "address", "billingCardBrand", "billingCardExpiry", "billingCardLast4",
      "businessAddress", "businessDescription", "businessName", "businessType",
      "contactEmail", "contactPhone", "createdAt", "currentProviderRate", "dailyGoal",
      "director", "email", "emailVerified", "estimatedAnnualTurnover", "gstNumber",
      "gstRegistered", "id", "name", "nzbn", "onboardingCompleted", "paymentUrl",
      "phone", "qrCodeUrl", "rentReminderDelayDays", "rentReminderEnabled",
      "rentReminderIntervalDays", "rentReminderMaxCount", "status", "themeId",
      "tradeGstMode", "tradeRemindersEnabled", "tutorialAutoEnabled",
      "tutorialGeneration", "updatedAt", "websiteUrl", "windcaveApiConfigured",
      "customLogoUrl",
    ].sort());
    for (const forbidden of [
      "passwordHash", "verificationToken", "resetToken", "windcaveApiKey",
      "bankAccountNumber", "bankName", "bankBranch", "accountHolderName", "ourRate",
    ]) {
      expect(owner).not.toHaveProperty(forbidden);
      expect(admin).not.toHaveProperty(forbidden);
    }
    expect(owner.windcaveApiConfigured).toBe(true);
    expect(admin.windcaveApiConfigured).toBe(true);
  });

  test("push preferences DTO is a strict boolean allowlist", () => {
    expect(pushNotificationPreferencesDto({
      paymentReceived: false,
      dailyPayoutSummary: true,
      failedPaymentAlerts: true,
      endpoint: "https://push.example.test/secret",
      auth: "secret",
    })).toEqual({
      paymentReceived: true,
      dailyPayoutSummary: true,
      failedPaymentAlerts: false,
    });
    expect(Object.keys(pushNotificationPreferencesDto({
      paymentReceived: false,
      dailyPayoutSummary: true,
      failedPaymentAlerts: true,
    }))).toEqual([
      "paymentReceived",
      "dailyPayoutSummary",
      "failedPaymentAlerts",
    ]);
  });

  test("transaction projections exclude session, device and processor internals publicly", () => {
    const publicDto = publicTransactionDto(transaction) as Record<string, unknown>;
    const ownerDto = ownerTransactionDto(transaction) as Record<string, unknown>;
    for (const forbidden of [
      "windcaveTransactionId", "windcaveSessionId", "windcaveSessionState",
      "windcaveXId", "nfcSessionId", "deviceId", "platformFeeAmount", "merchantNet",
    ]) {
      expect(publicDto).not.toHaveProperty(forbidden);
    }
    for (const forbidden of [
      "windcaveSessionId", "windcaveSessionState", "windcaveXId", "nfcSessionId", "deviceId",
    ]) {
      expect(ownerDto).not.toHaveProperty(forbidden);
    }
  });

  test("token payment projection contains no public numeric address or processor data", () => {
    const dto = tokenPaymentDto(transaction, merchant) as Record<string, any>;
    expect(Object.keys(dto).sort()).toEqual([
      "completedSplits", "createdAt", "isSplit", "itemName", "merchant",
      "paymentMethod", "price", "splitAmount", "splitEnabled", "status", "totalSplits",
    ]);
    expect(Object.keys(dto.merchant).sort()).toEqual([
      "businessAddress", "businessName", "contactEmail", "contactPhone", "customLogoUrl",
      "gstNumber", "name", "nzbn", "themeId",
    ]);
    for (const forbidden of [
      "id", "merchantId", "taptStoneId", "paymentTokenHash", "windcaveSessionId",
      "windcaveTransactionId", "platformFeeAmount", "merchantNet",
    ]) {
      expect(dto).not.toHaveProperty(forbidden);
      expect(dto.merchant).not.toHaveProperty(forbidden);
    }
  });

  test("token receipt exposes only a transaction-local share index", () => {
    const dto = tokenReceiptDto(transaction, merchant, {
      id: 91,
      transactionId: 11,
      splitIndex: 2,
      amount: "2.50",
      paymentMethod: "card",
      paidAt: new Date("2026-01-01T01:00:00Z"),
      windcaveTransactionId: "processor-split-id",
    }) as Record<string, any>;
    expect(Object.keys(dto).sort()).toEqual(["merchant", "share", "transaction"]);
    expect(Object.keys(dto.share).sort()).toEqual([
      "amount", "index", "paidAt", "paymentMethod",
    ]);
    expect(dto.share.index).toBe(2);
    expect(JSON.stringify(dto)).not.toMatch(/processor-split-id|transactionId|merchantId|taptStoneId/);
    expect(dto.transaction).not.toHaveProperty("id");
    expect(dto.merchant).not.toHaveProperty("id");
  });
});

describe("Phase 0 SSE audience matrix", () => {
  const connection = () => {
    const frames: any[] = [];
    return {
      frames,
      write(chunk: string) {
        const data = chunk.match(/^data: (.+)\n\n$/)?.[1];
        if (data) frames.push(JSON.parse(data));
      },
    };
  };

  test("board, no-board and merchant audiences receive only their events", () => {
    const broker = new SseBroker();
    const merchantConn = connection();
    const noBoardConn = connection();
    const boardThreeConn = connection();
    const boardFourConn = connection();
    broker.subscribe(7, { kind: "merchant" }, merchantConn);
    broker.subscribe(7, { kind: "legacy-no-board" }, noBoardConn);
    broker.subscribe(7, { kind: "board", stoneId: 3 }, boardThreeConn);
    broker.subscribe(7, { kind: "board", stoneId: 4 }, boardFourConn);
    for (const conn of [merchantConn, noBoardConn, boardThreeConn, boardFourConn]) {
      conn.frames.length = 0;
    }

    broker.broadcast(7, 3, { type: "transaction_updated", transaction });
    expect(merchantConn.frames).toHaveLength(1);
    expect(boardThreeConn.frames).toHaveLength(1);
    expect(noBoardConn.frames).toHaveLength(0);
    expect(boardFourConn.frames).toHaveLength(0);
    expect(boardThreeConn.frames[0]).toMatchObject({
      addressingMode: "board",
      stoneId: 3,
    });
    expect(boardThreeConn.frames[0].transaction).not.toHaveProperty("windcaveTransactionId");
    expect(merchantConn.frames[0].transaction).not.toHaveProperty("windcaveSessionId");

    broker.broadcast(7, null, {
      type: "transaction_updated",
      transaction: { ...transaction, taptStoneId: null },
    });
    expect(merchantConn.frames).toHaveLength(2);
    expect(noBoardConn.frames).toHaveLength(1);
    expect(noBoardConn.frames[0].addressingMode).toBe("legacy-no-board");
    expect(boardThreeConn.frames).toHaveLength(1);
    expect(boardFourConn.frames).toHaveLength(0);

    broker.broadcast(7, null, {
      type: "transaction_updated",
      transaction: {
        ...transaction,
        taptStoneId: null,
        paymentTokenHash: "a".repeat(64),
      },
    });
    expect(merchantConn.frames).toHaveLength(3);
    expect(noBoardConn.frames).toHaveLength(1);
    expect(merchantConn.frames[2].transaction).not.toHaveProperty("paymentTokenHash");
  });
});

describe("request-log redaction", () => {
  test("redacts secret keys, bearer credentials, JWTs, token routes and return states", () => {
    const value = redactSensitive({
      authorization: "Bearer abc.def.ghi",
      nested: {
        windcaveApiKey: "processor-secret",
        url: "/api/pay/t/raw-payment-token?token=query-secret",
        returnUrl: "/pay/return/raw-return-state",
      },
    }) as any;
    expect(value.authorization).toBe("[REDACTED]");
    expect(value.nested.windcaveApiKey).toBe("[REDACTED]");
    expect(value.nested.url).toBe("/api/pay/t/:token?token=[REDACTED]");
    expect(value.nested.returnUrl).toBe("/pay/return/:state");
  });

  test("redacts processor identifiers, capability URLs and callback states", () => {
    const state = "s".repeat(43);
    const sanitized = sanitizeWindcaveAuditDetails({
      sessionId: "processor-session",
      xId: "processor-xid",
      txId: "processor-transaction",
      hppUrl: `https://sec.windcave.com/hpp?return=/api/pay/return/${state}`,
      href: `/api/pay/return/${state}?result=approved`,
      merchantReference: "TAPT_internal-attempt",
      status: 202,
      approved: true,
    });
    expect(sanitized).toEqual({
      sessionId: "[REDACTED]",
      xId: "[REDACTED]",
      txId: "[REDACTED]",
      hppUrl: "[REDACTED]",
      href: "[REDACTED]",
      merchantReference: "[REDACTED]",
      status: 202,
      approved: true,
    });
    expect(JSON.stringify(sanitized)).not.toContain(state);
  });
});
