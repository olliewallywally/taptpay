import {
  LandingDemoSessionClient,
  LandingDemoSessionError,
} from "./useLandingDemoSession";
import type { LandingDemoSnapshot } from "@shared/landing-demo";

const token = Buffer.alloc(32, 7).toString("base64url");
const snapshot: LandingDemoSnapshot = {
  revision: 0,
  expiresAt: "2026-08-07T00:20:00.000Z",
  state: {
    displayDate: "fri 7 aug",
    activeScene: "retail-sale",
    property: {
      tenant: {
        key: "tenant-mia",
        name: "Mia",
        address: "18 Tui St",
        weeklyRentCents: 62_000,
      },
      rentRequest: { amountCents: 62_000, frequency: "weekly", status: "draft" },
      schedule: { amountCents: 62_000, frequency: "weekly", status: "draft" },
      bill: {
        key: "water-bill",
        label: "water",
        amountCents: 8_640,
        dueLabel: "due in 7 days",
        attachmentKey: "water-invoice-pdf",
        attachmentLabel: "water-invoice.pdf",
        status: "draft",
      },
    },
    trades: {
      client: { key: "client-dave", name: "Dave Kerr", address: "12 Rimu Ave" },
      invoice: {
        key: "emergency-callout",
        label: "emergency callout",
        amountCents: 48_000,
        status: "draft",
      },
      quote: {
        key: "heat-pump-quote",
        label: "Heat pump service",
        quantity: 1,
        unitAmountCents: 125_000,
        depositPercent: 20,
        depositAmountCents: 25_000,
        status: "draft",
      },
    },
    retail: {
      sale: {
        key: "flat-white-sale",
        label: "flat white ×2",
        quantity: 2,
        amountCents: 1_250,
        status: "draft",
      },
      split: {
        key: "split-four",
        amountCents: 12_000,
        payerCount: 4,
        shareAmountCents: 3_000,
        paidShares: [],
        status: "draft",
      },
    },
    checkout: {
      merchantName: "Kerr Plumbing",
      quoteKey: "heat-pump-quote",
      amountCents: 25_000,
      methods: ["apple-pay", "google-pay", "card"],
      selectedMethod: null,
      status: "draft",
    },
  },
};

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: jest.fn().mockResolvedValue(body === null ? "" : JSON.stringify(body)),
}) as unknown as Response;

describe("LandingDemoSessionClient", () => {
  test("keeps the opaque token in memory and uses only the exact header", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ token, ...snapshot }, 201))
      .mockResolvedValueOnce(response(snapshot));
    const client = new LandingDemoSessionClient(fetchImpl as typeof fetch);

    await client.create();
    await client.read();

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "/api/landing-demo/session",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/api/landing-demo/state",
      {
        credentials: "omit",
        headers: { "X-Landing-Demo-Token": token },
      },
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("Authorization");
  });

  test("sends semantic actions with credentials omitted and surfaces conflicts", async () => {
    const conflict = { ...snapshot, revision: 2 };
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ token, ...snapshot }, 201))
      .mockResolvedValueOnce(response(conflict, 409));
    const client = new LandingDemoSessionClient(fetchImpl as typeof fetch);
    await client.create();

    const result = await client.apply({
      type: "RESET_SCENE",
      expectedRevision: 0,
      scene: "overview",
    });

    expect(result).toEqual({ kind: "conflict", snapshot: conflict });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/api/landing-demo/action",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          "X-Landing-Demo-Token": token,
        },
      }),
    );
  });

  test("clears expired authority and best-effort deletes without storage", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ token, ...snapshot }, 201))
      .mockResolvedValueOnce(response({ error: { code: "DEMO_SESSION_EXPIRED" } }, 410))
      .mockRejectedValueOnce(new Error("unload"));
    const client = new LandingDemoSessionClient(fetchImpl as typeof fetch);
    await client.create();
    await expect(client.read()).rejects.toEqual(
      expect.objectContaining<Partial<LandingDemoSessionError>>({
        status: 410,
        code: "DEMO_SESSION_EXPIRED",
      }),
    );
    await client.destroy();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
