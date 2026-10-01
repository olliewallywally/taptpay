import {
  merchantSseTransactionDto,
  publicSplitPaymentDto,
  publicTransactionDto,
} from "./http-contracts";

// The business-wide anonymous no-board audience was retired on 2026-09-25 (owner decision,
// docs/decisions/2026-09-25-no-board-rework-402-and-batch-owner-answers.md): a sale without a
// payment board has its own private link and no public stream. The only anonymous audience
// left is a board's, scoped to that board.
export type SseAudience =
  // sessionId: the sign-in session the stream was opened by (R1-T4 phase E), when it was a cookie.
  | { kind: "merchant"; userId: number; principal: "user" | "admin"; sessionId?: string }
  | { kind: "board"; stoneId: number };

export interface SseWritable {
  write(chunk: string): unknown;
  end?(): unknown;
}

/**
 * How often an idle signed-in stream's sign-in is read again from shared storage (external review
 * 2026-09-29, R1-T4): an ending made on another instance closes the stream here within this long.
 */
export const SSE_REVALIDATE_EVERY_MS = 5_000;

type Subscriber = {
  audience: SseAudience;
  connection: SseWritable;
  /** Whether the sign-in that opened the stream still stands; a board's stream has none. */
  authorize?: () => Promise<boolean>;
  /** This subscriber's checks and writes, one after another, so its events keep their order. */
  pending: Promise<void>;
  unsubscribe: () => void;
};

function ownerRefundDto(refund: Record<string, any>) {
  return {
    id: refund.id,
    transactionId: refund.transactionId,
    merchantId: refund.merchantId,
    refundAmount: refund.refundAmount,
    refundReason: refund.refundReason,
    refundMethod: refund.refundMethod,
    status: refund.status,
    initiatedBy: refund.initiatedBy,
    customerNotified: refund.customerNotified,
    completedAt: refund.completedAt,
    createdAt: refund.createdAt,
  };
}

function projectEvent(data: Record<string, any>, audience: SseAudience) {
  const projected: Record<string, unknown> = { type: data.type };
  const merchantAudience = audience.kind === "merchant";

  if (data.transaction) {
    projected.transaction = merchantAudience
      ? merchantSseTransactionDto(data.transaction)
      : publicTransactionDto(data.transaction);
  }
  if (data.transactionId !== undefined) projected.transactionId = data.transactionId;
  if (data.splitPayment) projected.splitPayment = publicSplitPaymentDto(data.splitPayment);
  if (Array.isArray(data.splitPayments)) {
    projected.splitPayments = data.splitPayments.map(publicSplitPaymentDto);
  }
  if (merchantAudience && data.refund) projected.refund = ownerRefundDto(data.refund);

  if (audience.kind === "board") {
    projected.addressingMode = audience.kind;
    projected.stoneId = audience.stoneId;
  }

  return projected;
}

function isTarget(
  audience: SseAudience,
  stoneId: number | null,
  data: Record<string, any>,
) {
  if (audience.kind === "merchant") return true;
  // Per-payment rows are bearer-addressed and must never enter an anonymous
  // stream, even though they are intentionally stoneless.
  if (data.transaction?.paymentTokenHash != null) return false;
  return stoneId !== null && audience.stoneId === stoneId;
}

export class SseBroker {
  private subscribers = new Map<number, Set<Subscriber>>();

  subscribe(merchantId: number, audience: SseAudience, connection: SseWritable, authorize?: () => Promise<boolean>) {
    const merchantSubscribers = this.subscribers.get(merchantId) ?? new Set<Subscriber>();
    let timer: ReturnType<typeof setInterval> | undefined;
    const subscriber: Subscriber = { audience, connection, authorize, pending: Promise.resolve(), unsubscribe: () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      merchantSubscribers.delete(subscriber);
      // Only its own set: a stream that closes late must not drop a newer set of the same business.
      if (merchantSubscribers.size === 0 && this.subscribers.get(merchantId) === merchantSubscribers) {
        this.subscribers.delete(merchantId);
      }
    } };
    // Shared-storage revalidation closes idle streams on other instances too.
    if (authorize) {
      timer = setInterval(() => { void this.deliver(subscriber, merchantSubscribers); }, SSE_REVALIDATE_EVERY_MS);
      timer.unref?.();
    }
    merchantSubscribers.add(subscriber);
    this.subscribers.set(merchantId, merchantSubscribers);

    connection.write(`data: ${JSON.stringify({
      type: "connected",
      audience: audience.kind,
      ...(audience.kind === "board" ? { stoneId: audience.stoneId } : {}),
    })}\n\n`);

    return subscriber.unsubscribe;
  }

  /**
   * A signed-in stream's next step: its sign-in is read again, and only then is the event written. A
   * sign-in that no longer stands, or a check that fails, closes the stream with nothing written.
   */
  private deliver(subscriber: Subscriber, members: Set<Subscriber>, message?: string): Promise<void> {
    subscriber.pending = subscriber.pending.then(async () => {
      if (!members.has(subscriber)) return;
      try {
        if (subscriber.authorize && !await subscriber.authorize()) {
          subscriber.unsubscribe();
          subscriber.connection.end?.();
          return;
        }
        if (message && members.has(subscriber)) subscriber.connection.write(message);
      } catch {
        subscriber.unsubscribe();
        try { subscriber.connection.end?.(); } catch { /* already closed */ }
      }
    });
    return subscriber.pending;
  }

  broadcast(merchantId: number, stoneId: number | null | undefined, data: Record<string, any>): void | Promise<void[]> {
    const merchantSubscribers = this.subscribers.get(merchantId);
    if (!merchantSubscribers) return;
    const canonicalStoneId = stoneId ?? null;

    const pending: Promise<void>[] = [];
    for (const subscriber of merchantSubscribers) {
      if (!isTarget(subscriber.audience, canonicalStoneId, data)) continue;
      const message = `data: ${JSON.stringify(projectEvent(data, subscriber.audience))}\n\n`;
      if (subscriber.authorize) pending.push(this.deliver(subscriber, merchantSubscribers, message));
      else subscriber.connection.write(message);
    }
    return Promise.all(pending);
  }

  /**
   * Drop every live merchant stream owned by a revoked users-row principal.
   * Public board streams and environment-backed admin streams are not tied to
   * that login and must remain connected.
   */
  disconnectUser(merchantId: number, userId: number) {
    const merchantSubscribers = this.subscribers.get(merchantId);
    if (!merchantSubscribers) return 0;

    let disconnected = 0;
    for (const subscriber of Array.from(merchantSubscribers)) {
      if (
        subscriber.audience.kind !== "merchant" ||
        subscriber.audience.principal !== "user" ||
        subscriber.audience.userId !== userId
      ) {
        continue;
      }
      subscriber.unsubscribe();
      disconnected++;
      try {
        subscriber.connection.end?.();
      } catch {
        // A socket that already vanished is still successfully unsubscribed.
      }
    }

    if (merchantSubscribers.size === 0) this.subscribers.delete(merchantId);
    return disconnected;
  }

  /**
   * Drop the live streams one sign-in session opened (R1-T4 phase E: Log Out ends that session only),
   * on every business, as an admin session's streams may be on any.
   */
  disconnectSession(sessionId: string) {
    let disconnected = 0;
    for (const [merchantId, merchantSubscribers] of Array.from(this.subscribers.entries())) {
      for (const subscriber of Array.from(merchantSubscribers)) {
        if (subscriber.audience.kind !== "merchant" || subscriber.audience.sessionId !== sessionId) continue;
        subscriber.unsubscribe();
        disconnected++;
        try {
          subscriber.connection.end?.();
        } catch {
          // A socket that already vanished is still successfully unsubscribed.
        }
      }
      if (merchantSubscribers.size === 0) this.subscribers.delete(merchantId);
    }
    return disconnected;
  }

  subscriberCount(merchantId?: number) {
    if (merchantId !== undefined) return this.subscribers.get(merchantId)?.size ?? 0;
    let total = 0;
    for (const subscribers of this.subscribers.values()) total += subscribers.size;
    return total;
  }

  clear() {
    for (const members of this.subscribers.values()) for (const subscriber of members) subscriber.unsubscribe();
    this.subscribers.clear();
  }
}

export const sseBroker = new SseBroker();
