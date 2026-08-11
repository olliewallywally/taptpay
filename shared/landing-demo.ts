/** Browser-safe contracts for the isolated public landing demo. */
export const LANDING_DEMO_PROTOCOL_VERSION = 1 as const;
export const LANDING_DEMO_TOKEN_HEADER = "X-Landing-Demo-Token" as const;
export const LANDING_DEMO_TOKEN_BYTES = 32 as const;
export const LANDING_DEMO_TOKEN_LENGTH = 43 as const;

export const LANDING_DEMO_TTL_MS = 20 * 60 * 1000;
export const LANDING_DEMO_ABSOLUTE_LIFETIME_MS = 30 * 60 * 1000;
export const LANDING_DEMO_MAX_SESSIONS = 1_000;
export const LANDING_DEMO_MAX_AGGREGATE_BYTES = 32 * 1024 * 1024;
export const LANDING_DEMO_MAX_STATE_BYTES = 64 * 1024;
export const LANDING_DEMO_BODY_LIMIT_BYTES = 16 * 1024;
export const LANDING_DEMO_CREATE_LIMIT = 10;
export const LANDING_DEMO_CREATE_WINDOW_MS = 10 * 60 * 1000;
export const LANDING_DEMO_ACTION_LIMIT = 120;
export const LANDING_DEMO_ACTION_WINDOW_MS = 60 * 1000;
export const LANDING_DEMO_CLEANUP_INTERVAL_MS = 60 * 1000;

export const LANDING_DEMO_SCENES = [
  "overview", "rent-weekly", "property-bill", "trades-invoice",
  "quote-deposit", "retail-sale", "retail-split", "checkout-wallet",
] as const;
export type LandingDemoScene = (typeof LANDING_DEMO_SCENES)[number];
export type LandingDemoMode = "cinematic" | "live";
export const LANDING_DEMO_PAYMENT_METHODS = ["apple-pay", "google-pay", "card"] as const;
export type LandingDemoPaymentMethod = (typeof LANDING_DEMO_PAYMENT_METHODS)[number];

export interface LandingDemoState {
  displayDate: "fri 7 aug";
  activeScene: LandingDemoScene;
  property: {
    tenant: { key: "tenant-mia"; name: "Mia"; address: "18 Tui St"; weeklyRentCents: 62_000 };
    rentRequest: { amountCents: 62_000; frequency: "weekly"; status: "draft" | "sent" };
    schedule: { amountCents: 62_000; frequency: "weekly"; status: "draft" | "active" };
    bill: {
      key: "water-bill"; label: "water"; amountCents: 8_640;
      dueLabel: "due in 7 days"; attachmentKey: "water-invoice-pdf";
      attachmentLabel: "water-invoice.pdf"; status: "draft" | "sent" | "paid";
    };
  };
  trades: {
    client: { key: "client-dave"; name: "Dave Kerr"; address: "12 Rimu Ave" };
    invoice: {
      key: "emergency-callout"; label: "emergency callout";
      amountCents: 48_000; status: "draft" | "sent" | "paid";
    };
    quote: {
      key: "heat-pump-quote"; label: "Heat pump service"; quantity: 1;
      unitAmountCents: 125_000; depositPercent: 20; depositAmountCents: 25_000;
      status: "draft" | "sent" | "accepted";
    };
  };
  retail: {
    sale: {
      key: "flat-white-sale"; label: "flat white ×2"; quantity: 2;
      amountCents: 1_250; status: "draft" | "pending" | "paid";
    };
    split: {
      key: "split-four"; amountCents: 12_000; payerCount: 4;
      shareAmountCents: 3_000; paidShares: readonly number[];
      status: "draft" | "pending" | "paid";
    };
  };
  checkout: {
    merchantName: "Kerr Plumbing"; quoteKey: "heat-pump-quote"; amountCents: 25_000;
    methods: readonly ["apple-pay", "google-pay", "card"];
    selectedMethod: LandingDemoPaymentMethod | null; status: "draft" | "ready" | "paid";
  };
}

export interface LandingDemoSnapshot {
  revision: number;
  expiresAt: string;
  state: LandingDemoState;
}
export interface LandingDemoSessionCreated extends LandingDemoSnapshot { token: string }

export type LandingDemoActionRequest =
  | { type: "RESET_SCENE"; expectedRevision: number; scene: LandingDemoScene }
  | { type: "CREATE_WEEKLY_RENT"; expectedRevision: number; tenantKey: "tenant-mia"; amountCents: 62_000; frequency: "weekly" }
  | { type: "SEND_PROPERTY_BILL"; expectedRevision: number; tenantKey: "tenant-mia"; billKey: "water-bill"; amountCents: 8_640; dueKey: "due-seven-days"; attachmentKey: "water-invoice-pdf" }
  | { type: "SETTLE_PROPERTY_BILL"; expectedRevision: number; billKey: "water-bill" }
  | { type: "SEND_TRADES_INVOICE"; expectedRevision: number; clientKey: "client-dave"; invoiceKey: "emergency-callout"; amountCents: 48_000 }
  | { type: "SETTLE_TRADES_INVOICE"; expectedRevision: number; invoiceKey: "emergency-callout" }
  | { type: "SEND_TRADES_QUOTE"; expectedRevision: number; clientKey: "client-dave"; quoteKey: "heat-pump-quote"; quantity: 1; unitAmountCents: 125_000; depositPercent: 20 }
  | { type: "ACCEPT_TRADES_QUOTE"; expectedRevision: number; quoteKey: "heat-pump-quote" }
  | { type: "CREATE_RETAIL_SALE"; expectedRevision: number; saleKey: "flat-white-sale"; amountCents: 1_250; quantity: 2 }
  | { type: "SETTLE_RETAIL_SALE"; expectedRevision: number; saleKey: "flat-white-sale" }
  | { type: "CREATE_RETAIL_SPLIT"; expectedRevision: number; splitKey: "split-four"; amountCents: 12_000; payerCount: 4 }
  | { type: "PAY_RETAIL_SPLIT_SHARE"; expectedRevision: number; splitKey: "split-four"; shareIndex: 1 | 2 | 3 | 4 }
  | { type: "PAY_CHECKOUT_DEPOSIT"; expectedRevision: number; quoteKey: "heat-pump-quote"; method: LandingDemoPaymentMethod };

export const LANDING_DEMO_ACTION_TYPES = [
  "RESET_SCENE", "CREATE_WEEKLY_RENT", "SEND_PROPERTY_BILL",
  "SETTLE_PROPERTY_BILL", "SEND_TRADES_INVOICE", "SETTLE_TRADES_INVOICE",
  "SEND_TRADES_QUOTE", "ACCEPT_TRADES_QUOTE", "CREATE_RETAIL_SALE",
  "SETTLE_RETAIL_SALE", "CREATE_RETAIL_SPLIT", "PAY_RETAIL_SPLIT_SHARE",
  "PAY_CHECKOUT_DEPOSIT",
] as const;

export const LANDING_DEMO_PARENT_MESSAGE_TYPES = [
  "LANDING_DEMO_INIT", "LANDING_DEMO_SELECT_SCENE", "LANDING_DEMO_PLAY",
  "LANDING_DEMO_PAUSE", "LANDING_DEMO_RESET", "LANDING_DEMO_ENTER_LIVE",
  "LANDING_DEMO_EXIT_LIVE", "LANDING_DEMO_SET_REDUCED_MOTION",
  "LANDING_DEMO_SET_SAVE_DATA",
] as const;
export const LANDING_DEMO_FRAME_MESSAGE_TYPES = [
  "LANDING_DEMO_READY", "LANDING_DEMO_SCENE_READY", "LANDING_DEMO_STATE",
  "LANDING_DEMO_STEP", "LANDING_DEMO_COMPLETE", "LANDING_DEMO_LIVE_READY",
  "LANDING_DEMO_ERROR",
] as const;

interface DemoMessage<T extends string> {
  type: T;
  protocolVersion: typeof LANDING_DEMO_PROTOCOL_VERSION;
  requestId: string;
}
export type LandingDemoParentMessage =
  | (DemoMessage<"LANDING_DEMO_INIT"> & { scene: LandingDemoScene; reducedMotion: boolean; saveData: boolean })
  | (DemoMessage<"LANDING_DEMO_SELECT_SCENE"> & { scene: LandingDemoScene })
  | DemoMessage<"LANDING_DEMO_PLAY"> | DemoMessage<"LANDING_DEMO_PAUSE">
  | (DemoMessage<"LANDING_DEMO_RESET"> & { scene: LandingDemoScene })
  | DemoMessage<"LANDING_DEMO_ENTER_LIVE"> | DemoMessage<"LANDING_DEMO_EXIT_LIVE">
  | (DemoMessage<"LANDING_DEMO_SET_REDUCED_MOTION"> & { enabled: boolean })
  | (DemoMessage<"LANDING_DEMO_SET_SAVE_DATA"> & { enabled: boolean });
export type LandingDemoFrameMessage =
  | (DemoMessage<"LANDING_DEMO_READY"> & { documentMarker: "taptpay-landing-demo-v1" })
  | (DemoMessage<"LANDING_DEMO_SCENE_READY"> & { scene: LandingDemoScene; revision: number })
  | (DemoMessage<"LANDING_DEMO_STATE"> & { scene: LandingDemoScene; mode: LandingDemoMode; playing: boolean; revision: number })
  | (DemoMessage<"LANDING_DEMO_STEP"> & { scene: LandingDemoScene; step: number; revision: number })
  | (DemoMessage<"LANDING_DEMO_COMPLETE"> & { scene: LandingDemoScene; revision: number })
  | (DemoMessage<"LANDING_DEMO_LIVE_READY"> & { scene: LandingDemoScene; revision: number })
  | (DemoMessage<"LANDING_DEMO_ERROR"> & { code: "chunk" | "protocol" | "session" | "scene" | "unknown"; recoverable: boolean });

export const isLandingDemoScene = (value: unknown): value is LandingDemoScene =>
  typeof value === "string" && (LANDING_DEMO_SCENES as readonly string[]).includes(value);
export const isLandingDemoToken = (value: unknown): value is string =>
  typeof value === "string" && value.length === LANDING_DEMO_TOKEN_LENGTH &&
  /^[A-Za-z0-9_-]+$/.test(value);
