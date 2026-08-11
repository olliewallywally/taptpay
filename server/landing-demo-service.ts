import { createHash, randomBytes } from "node:crypto";
import {
  LANDING_DEMO_ABSOLUTE_LIFETIME_MS,
  LANDING_DEMO_ACTION_LIMIT,
  LANDING_DEMO_ACTION_WINDOW_MS,
  LANDING_DEMO_CLEANUP_INTERVAL_MS,
  LANDING_DEMO_CREATE_LIMIT,
  LANDING_DEMO_CREATE_WINDOW_MS,
  LANDING_DEMO_MAX_AGGREGATE_BYTES,
  LANDING_DEMO_MAX_SESSIONS,
  LANDING_DEMO_MAX_STATE_BYTES,
  LANDING_DEMO_TOKEN_BYTES,
  LANDING_DEMO_TTL_MS,
  type LandingDemoActionRequest,
  type LandingDemoScene,
  type LandingDemoSessionCreated,
  type LandingDemoSnapshot,
  type LandingDemoState,
} from "@shared/landing-demo";

type SessionRecord = {
  tokenHash: string;
  state: LandingDemoState;
  revision: number;
  createdAtMs: number;
  lastAccessAtMs: number;
  expiresAtMs: number;
  absoluteExpiresAtMs: number;
  stateBytes: number;
  actionTimestamps: number[];
  sequence: number;
};

export type LandingDemoServiceOptions = {
  ttlMs?: number;
  absoluteLifetimeMs?: number;
  maxSessions?: number;
  maxAggregateBytes?: number;
  maxStateBytes?: number;
  createLimit?: number;
  createWindowMs?: number;
  actionLimit?: number;
  actionWindowMs?: number;
  cleanupIntervalMs?: number;
  now?: () => number;
  tokenFactory?: () => string;
  startCleanup?: boolean;
};

export type LandingDemoCreateResult =
  | { kind: "created"; session: LandingDemoSessionCreated }
  | { kind: "rate-limited" }
  | { kind: "capacity" };
export type LandingDemoReadResult =
  | { kind: "ok"; snapshot: LandingDemoSnapshot }
  | { kind: "expired" };
export type LandingDemoApplyResult =
  | { kind: "ok"; snapshot: LandingDemoSnapshot }
  | { kind: "conflict"; snapshot: LandingDemoSnapshot }
  | { kind: "expired" }
  | { kind: "rate-limited" }
  | { kind: "invalid-transition" }
  | { kind: "state-too-large" };

const clone = <T>(value: T): T => structuredClone(value);
const stateBytes = (state: LandingDemoState): number =>
  Buffer.byteLength(JSON.stringify(state), "utf8");
const hashToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

export function createLandingDemoSeedState(
  activeScene: LandingDemoScene = "retail-sale",
): LandingDemoState {
  const state: LandingDemoState = {
    displayDate: "fri 7 aug",
    activeScene,
    property: {
      tenant: { key: "tenant-mia", name: "Mia", address: "18 Tui St", weeklyRentCents: 62_000 },
      rentRequest: { amountCents: 62_000, frequency: "weekly", status: "draft" },
      schedule: { amountCents: 62_000, frequency: "weekly", status: "draft" },
      bill: {
        key: "water-bill", label: "water", amountCents: 8_640,
        dueLabel: "due in 7 days", attachmentKey: "water-invoice-pdf",
        attachmentLabel: "water-invoice.pdf", status: "draft",
      },
    },
    trades: {
      client: { key: "client-dave", name: "Dave Kerr", address: "12 Rimu Ave" },
      invoice: { key: "emergency-callout", label: "emergency callout", amountCents: 48_000, status: "draft" },
      quote: {
        key: "heat-pump-quote", label: "Heat pump service", quantity: 1,
        unitAmountCents: 125_000, depositPercent: 20,
        depositAmountCents: 25_000, status: "draft",
      },
    },
    retail: {
      sale: { key: "flat-white-sale", label: "flat white ×2", quantity: 2, amountCents: 1_250, status: "draft" },
      split: { key: "split-four", amountCents: 12_000, payerCount: 4, shareAmountCents: 3_000, paidShares: [], status: "draft" },
    },
    checkout: {
      merchantName: "Kerr Plumbing", quoteKey: "heat-pump-quote",
      amountCents: 25_000, methods: ["apple-pay", "google-pay", "card"],
      selectedMethod: null, status: "draft",
    },
  };
  if (activeScene === "checkout-wallet") {
    state.trades.quote.status = "accepted";
    state.checkout.status = "ready";
  }
  return state;
}

function reduceAction(
  previous: LandingDemoState,
  action: LandingDemoActionRequest,
): LandingDemoState | null {
  if (action.type === "RESET_SCENE") return createLandingDemoSeedState(action.scene);
  const next = clone(previous);
  switch (action.type) {
    case "CREATE_WEEKLY_RENT":
      if (next.activeScene !== "rent-weekly" || next.property.rentRequest.status !== "draft") return null;
      next.property.rentRequest.status = "sent";
      next.property.schedule.status = "active";
      return next;
    case "SEND_PROPERTY_BILL":
      if (next.activeScene !== "property-bill" || next.property.bill.status !== "draft") return null;
      next.property.bill.status = "sent";
      return next;
    case "SETTLE_PROPERTY_BILL":
      if (next.activeScene !== "property-bill" || next.property.bill.status !== "sent") return null;
      next.property.bill.status = "paid";
      return next;
    case "SEND_TRADES_INVOICE":
      if (next.activeScene !== "trades-invoice" || next.trades.invoice.status !== "draft") return null;
      next.trades.invoice.status = "sent";
      return next;
    case "SETTLE_TRADES_INVOICE":
      if (next.activeScene !== "trades-invoice" || next.trades.invoice.status !== "sent") return null;
      next.trades.invoice.status = "paid";
      return next;
    case "SEND_TRADES_QUOTE":
      if (next.activeScene !== "quote-deposit" || next.trades.quote.status !== "draft") return null;
      next.trades.quote.status = "sent";
      return next;
    case "ACCEPT_TRADES_QUOTE":
      if (next.activeScene !== "quote-deposit" || next.trades.quote.status !== "sent") return null;
      next.trades.quote.status = "accepted";
      next.checkout.status = "ready";
      return next;
    case "CREATE_RETAIL_SALE":
      if (next.activeScene !== "retail-sale" || next.retail.sale.status !== "draft") return null;
      next.retail.sale.status = "pending";
      return next;
    case "SETTLE_RETAIL_SALE":
      if (next.activeScene !== "retail-sale" || next.retail.sale.status !== "pending") return null;
      next.retail.sale.status = "paid";
      return next;
    case "CREATE_RETAIL_SPLIT":
      if (next.activeScene !== "retail-split" || next.retail.split.status !== "draft") return null;
      next.retail.split.status = "pending";
      return next;
    case "PAY_RETAIL_SPLIT_SHARE":
      if (next.activeScene !== "retail-split" || next.retail.split.status !== "pending" ||
          next.retail.split.paidShares.includes(action.shareIndex)) return null;
      next.retail.split.paidShares = [...next.retail.split.paidShares, action.shareIndex].sort();
      if (next.retail.split.paidShares.length === 4) next.retail.split.status = "paid";
      return next;
    case "PAY_CHECKOUT_DEPOSIT":
      if (!["quote-deposit", "checkout-wallet"].includes(next.activeScene) ||
          next.checkout.status !== "ready") return null;
      next.checkout.selectedMethod = action.method;
      next.checkout.status = "paid";
      return next;
  }
}

export class LandingDemoService {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly createTimestamps = new Map<string, number[]>();
  private readonly config: Required<Omit<LandingDemoServiceOptions, "tokenFactory">> & { tokenFactory: () => string };
  private aggregateBytes = 0;
  private sequence = 0;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: LandingDemoServiceOptions = {}) {
    this.config = {
      ttlMs: options.ttlMs ?? LANDING_DEMO_TTL_MS,
      absoluteLifetimeMs: options.absoluteLifetimeMs ?? LANDING_DEMO_ABSOLUTE_LIFETIME_MS,
      maxSessions: options.maxSessions ?? LANDING_DEMO_MAX_SESSIONS,
      maxAggregateBytes: options.maxAggregateBytes ?? LANDING_DEMO_MAX_AGGREGATE_BYTES,
      maxStateBytes: options.maxStateBytes ?? LANDING_DEMO_MAX_STATE_BYTES,
      createLimit: options.createLimit ?? LANDING_DEMO_CREATE_LIMIT,
      createWindowMs: options.createWindowMs ?? LANDING_DEMO_CREATE_WINDOW_MS,
      actionLimit: options.actionLimit ?? LANDING_DEMO_ACTION_LIMIT,
      actionWindowMs: options.actionWindowMs ?? LANDING_DEMO_ACTION_WINDOW_MS,
      cleanupIntervalMs: options.cleanupIntervalMs ?? LANDING_DEMO_CLEANUP_INTERVAL_MS,
      now: options.now ?? Date.now,
      tokenFactory: options.tokenFactory ?? (() => randomBytes(LANDING_DEMO_TOKEN_BYTES).toString("base64url")),
      startCleanup: options.startCleanup ?? true,
    };
    if (this.config.startCleanup) {
      this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupIntervalMs);
      this.cleanupTimer.unref();
    }
  }

  dispose(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
  }

  create(ip: string): LandingDemoCreateResult {
    const now = this.config.now();
    this.cleanup(now);
    const recent = (this.createTimestamps.get(ip) ?? []).filter(
      timestamp => timestamp > now - this.config.createWindowMs,
    );
    if (recent.length >= this.config.createLimit) {
      this.createTimestamps.set(ip, recent);
      return { kind: "rate-limited" };
    }
    const state = createLandingDemoSeedState();
    const bytes = stateBytes(state);
    if (bytes > this.config.maxStateBytes || bytes > this.config.maxAggregateBytes) {
      return { kind: "capacity" };
    }
    this.evictForCapacity(1, bytes, undefined, now);
    if (this.sessions.size >= this.config.maxSessions ||
        this.aggregateBytes + bytes > this.config.maxAggregateBytes) {
      return { kind: "capacity" };
    }
    const token = this.config.tokenFactory();
    const tokenHash = hashToken(token);
    if (this.sessions.has(tokenHash)) return { kind: "capacity" };
    const absoluteExpiresAtMs = now + this.config.absoluteLifetimeMs;
    const expiresAtMs = Math.min(now + this.config.ttlMs, absoluteExpiresAtMs);
    const record: SessionRecord = {
      tokenHash, state, revision: 0, createdAtMs: now, lastAccessAtMs: now,
      expiresAtMs, absoluteExpiresAtMs, stateBytes: bytes,
      actionTimestamps: [], sequence: ++this.sequence,
    };
    this.sessions.set(tokenHash, record);
    this.aggregateBytes += bytes;
    recent.push(now);
    this.createTimestamps.set(ip, recent);
    return { kind: "created", session: { token, ...this.snapshot(record) } };
  }

  read(token: string): LandingDemoReadResult {
    const record = this.access(token);
    return record ? { kind: "ok", snapshot: this.snapshot(record) } : { kind: "expired" };
  }

  apply(token: string, action: LandingDemoActionRequest): LandingDemoApplyResult {
    const now = this.config.now();
    const record = this.access(token, now);
    if (!record) return { kind: "expired" };
    record.actionTimestamps = record.actionTimestamps.filter(
      timestamp => timestamp > now - this.config.actionWindowMs,
    );
    if (record.actionTimestamps.length >= this.config.actionLimit) return { kind: "rate-limited" };
    record.actionTimestamps.push(now);
    if (action.expectedRevision !== record.revision) {
      return { kind: "conflict", snapshot: this.snapshot(record) };
    }
    const next = reduceAction(record.state, action);
    if (!next) return { kind: "invalid-transition" };
    const bytes = stateBytes(next);
    if (bytes > this.config.maxStateBytes || bytes > this.config.maxAggregateBytes) {
      return { kind: "state-too-large" };
    }
    this.evictForCapacity(0, bytes - record.stateBytes, record.tokenHash, now);
    if (this.aggregateBytes - record.stateBytes + bytes > this.config.maxAggregateBytes) {
      return { kind: "state-too-large" };
    }
    this.aggregateBytes += bytes - record.stateBytes;
    record.state = next;
    record.stateBytes = bytes;
    record.revision += 1;
    return { kind: "ok", snapshot: this.snapshot(record) };
  }

  delete(token: string): boolean {
    this.cleanup();
    const hash = hashToken(token);
    const record = this.sessions.get(hash);
    if (!record) return false;
    this.remove(hash, record);
    return true;
  }

  cleanup(now = this.config.now()): void {
    for (const [hash, record] of this.sessions) {
      if (record.expiresAtMs <= now || record.absoluteExpiresAtMs <= now) this.remove(hash, record);
    }
    for (const [ip, timestamps] of this.createTimestamps) {
      const recent = timestamps.filter(timestamp => timestamp > now - this.config.createWindowMs);
      if (recent.length) this.createTimestamps.set(ip, recent);
      else this.createTimestamps.delete(ip);
    }
  }

  stats(): { sessions: number; aggregateBytes: number } {
    return { sessions: this.sessions.size, aggregateBytes: this.aggregateBytes };
  }

  private access(token: string, now = this.config.now()): SessionRecord | null {
    this.cleanup(now);
    const hash = hashToken(token);
    const record = this.sessions.get(hash);
    if (!record) return null;
    record.lastAccessAtMs = now;
    record.expiresAtMs = Math.min(now + this.config.ttlMs, record.absoluteExpiresAtMs);
    this.sessions.delete(hash);
    this.sessions.set(hash, record);
    return record;
  }

  private snapshot(record: SessionRecord): LandingDemoSnapshot {
    return {
      revision: record.revision,
      expiresAt: new Date(record.expiresAtMs).toISOString(),
      state: clone(record.state),
    };
  }

  private evictForCapacity(
    additionalSessions: number,
    additionalBytes: number,
    protectedHash: string | undefined,
    now: number,
  ): void {
    this.cleanup(now);
    const candidates = [...this.sessions.values()]
      .filter(record => record.tokenHash !== protectedHash)
      .sort((a, b) => a.lastAccessAtMs - b.lastAccessAtMs || a.sequence - b.sequence);
    while ((this.sessions.size + additionalSessions > this.config.maxSessions ||
            this.aggregateBytes + additionalBytes > this.config.maxAggregateBytes) &&
           candidates.length) {
      const record = candidates.shift()!;
      this.remove(record.tokenHash, record);
    }
  }

  private remove(hash: string, record: SessionRecord): void {
    if (!this.sessions.delete(hash)) return;
    this.aggregateBytes -= record.stateBytes;
  }
}
