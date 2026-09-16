import {
  merchantSseTransactionDto,
  publicSplitPaymentDto,
  publicTransactionDto,
} from "./http-contracts";

export type SseAudience =
  | { kind: "merchant"; userId: number; principal: "user" | "admin" }
  | { kind: "legacy-no-board" }
  | { kind: "board"; stoneId: number };

export interface SseWritable {
  write(chunk: string): unknown;
  end?(): unknown;
}

type Subscriber = {
  audience: SseAudience;
  connection: SseWritable;
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

  if (!merchantAudience) {
    projected.addressingMode = audience.kind;
    if (audience.kind === "board") projected.stoneId = audience.stoneId;
  }

  return projected;
}

function isTarget(
  audience: SseAudience,
  stoneId: number | null,
  data: Record<string, any>,
) {
  if (audience.kind === "merchant") return true;
  // Per-payment rows are bearer-addressed and must never enter a merchant-wide
  // anonymous stream, even though they are intentionally stoneless.
  if (data.transaction?.paymentTokenHash != null) return false;
  if (audience.kind === "legacy-no-board") return stoneId === null;
  return stoneId !== null && audience.stoneId === stoneId;
}

/**
 * Gap 12 Option C: the same eligibility test `isTarget` applies to a
 * legacy-no-board subscriber, exposed standalone so `server/routes.ts`'s
 * `dispatchLegacyNoBoard` can decide *whether an ambiguity check is even
 * relevant* before ever calling storage — a board-scoped or per-payment
 * event must never trigger the DB round-trip in mandatory fix #2.
 */
export function isLegacyNoBoardEligible(stoneId: number | null, data: Record<string, any>): boolean {
  return isTarget({ kind: "legacy-no-board" }, stoneId, data);
}

export class SseBroker {
  private subscribers = new Map<number, Set<Subscriber>>();

  subscribe(merchantId: number, audience: SseAudience, connection: SseWritable) {
    const merchantSubscribers = this.subscribers.get(merchantId) ?? new Set<Subscriber>();
    const subscriber = { audience, connection };
    merchantSubscribers.add(subscriber);
    this.subscribers.set(merchantId, merchantSubscribers);

    connection.write(`data: ${JSON.stringify({
      type: "connected",
      audience: audience.kind,
      ...(audience.kind === "board" ? { stoneId: audience.stoneId } : {}),
    })}\n\n`);

    return () => {
      merchantSubscribers.delete(subscriber);
      if (merchantSubscribers.size === 0) this.subscribers.delete(merchantId);
    };
  }

  /**
   * `options.audiences`, when given, additionally restricts delivery to
   * subscribers of those audience kinds — used by gap 12 Option C
   * (`server/routes.ts`'s `broadcastToStone`) to dispatch to "merchant" and
   * "board" synchronously while "legacy-no-board" is gated behind an async
   * ambiguity check. Omitting it (every call site before gap 12 Option C,
   * and every existing test) is byte-identical to today's behaviour.
   */
  broadcast(
    merchantId: number,
    stoneId: number | null | undefined,
    data: Record<string, any>,
    options?: { audiences?: ReadonlyArray<SseAudience["kind"]> },
  ) {
    const merchantSubscribers = this.subscribers.get(merchantId);
    if (!merchantSubscribers) return;
    const canonicalStoneId = stoneId ?? null;

    for (const subscriber of merchantSubscribers) {
      if (options?.audiences && !options.audiences.includes(subscriber.audience.kind)) continue;
      if (!isTarget(subscriber.audience, canonicalStoneId, data)) continue;
      subscriber.connection.write(
        `data: ${JSON.stringify(projectEvent(data, subscriber.audience))}\n\n`,
      );
    }
  }

  /**
   * Gap 12 Option C mandatory fix #3's "safe" counterpart: tells every
   * legacy-no-board subscriber that the merchant currently has 2+ concurrent
   * candidate stoneless transactions open, so none can be resolved safely.
   * Carries no transaction data of either candidate — no id, price, item
   * name or status — by design.
   */
  broadcastLegacyNoBoardAmbiguous(merchantId: number) {
    const merchantSubscribers = this.subscribers.get(merchantId);
    if (!merchantSubscribers) return;
    const frame = `data: ${JSON.stringify({
      type: "legacy_no_board_ambiguous",
      addressingMode: "legacy-no-board",
    })}\n\n`;
    for (const subscriber of merchantSubscribers) {
      if (subscriber.audience.kind !== "legacy-no-board") continue;
      subscriber.connection.write(frame);
    }
  }

  /**
   * Drop every live merchant stream owned by a revoked users-row principal.
   * Public board/no-board streams and environment-backed admin streams are not
   * tied to that login and must remain connected.
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
      merchantSubscribers.delete(subscriber);
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

  subscriberCount(merchantId?: number) {
    if (merchantId !== undefined) return this.subscribers.get(merchantId)?.size ?? 0;
    let total = 0;
    for (const subscribers of this.subscribers.values()) total += subscribers.size;
    return total;
  }

  /**
   * Gap 12 Option C mandatory fix #2: `subscriberCount` is audience-agnostic
   * (counts "merchant"/"board"/"legacy-no-board" alike), so it cannot be
   * used as a cheap short-circuit for the legacy-no-board ambiguity check —
   * a merchant with only their own authenticated dashboard open would still
   * trigger a DB round-trip on every stoneless broadcast. This counts only
   * "legacy-no-board" subscribers, so the check runs only when an actual
   * anonymous legacy-no-board subscriber is connected.
   */
  legacyNoBoardSubscriberCount(merchantId: number): number {
    const merchantSubscribers = this.subscribers.get(merchantId);
    if (!merchantSubscribers) return 0;
    let count = 0;
    for (const subscriber of merchantSubscribers) {
      if (subscriber.audience.kind === "legacy-no-board") count++;
    }
    return count;
  }

  clear() {
    this.subscribers.clear();
  }
}

export const sseBroker = new SseBroker();
