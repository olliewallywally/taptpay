import {
  PAYMENT_ATTEMPT_MAX_LEASE_MS,
  PAYMENT_RETURN_STATE_MAX_AGE_MS,
  paymentAttemptOutcomes,
  type PaymentAttempt,
  type PaymentAttemptOutcome,
  type PlatformFee,
  type SplitPayment,
  type Transaction,
} from "@shared/schema";
import {
  hashBearerCredential,
  PAYMENT_TOKEN_PATTERN,
} from "./payment-credential";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ClaimPaymentAttemptRecordInput {
  transactionId: number;
  shareIndex: number;
  idempotencyKey: string;
  now: Date;
  leaseExpiresAt: Date;
}

export type PaymentAttemptTargetConflictReason =
  | "transaction-not-payable"
  | "split-target-required"
  | "unsplit-target-required"
  | "share-not-found"
  | "share-not-payable";

export type ClaimPaymentAttemptResult =
  | { kind: "claimed"; attempt: PaymentAttempt; abandonedAttemptId?: string }
  | { kind: "reused"; attempt: PaymentAttempt }
  | { kind: "terminal"; attempt: PaymentAttempt }
  | { kind: "expired"; attempt: PaymentAttempt }
  | { kind: "conflict"; attempt: PaymentAttempt }
  | { kind: "target-conflict"; reason: PaymentAttemptTargetConflictReason }
  | { kind: "transaction-not-found" };

export interface AttachPaymentAttemptSessionRecordInput {
  attemptId: string;
  processorSessionId: string;
  processorXId: string;
  returnStateHash: string | null;
  returnStateExpiresAt: Date | null;
  now: Date;
}

export type AttachPaymentAttemptSessionResult =
  | { kind: "attached"; attempt: PaymentAttempt }
  | { kind: "reused"; attempt: PaymentAttempt }
  | { kind: "expired"; attempt: PaymentAttempt }
  | { kind: "terminal"; attempt: PaymentAttempt }
  | { kind: "conflict"; attempt: PaymentAttempt }
  | { kind: "not-found" };

export interface ClaimPaymentAttemptFinalizationRecordInput {
  attemptId: string;
  processorSessionId: string;
  now: Date;
}

export type ClaimPaymentAttemptFinalizationResult =
  | { kind: "claimed"; attempt: PaymentAttempt }
  | { kind: "reused"; attempt: PaymentAttempt }
  | { kind: "terminal"; attempt: PaymentAttempt }
  | { kind: "conflict"; attempt: PaymentAttempt }
  | { kind: "not-found" };

export interface FinalizePaymentAttemptRecordInput {
  attemptId: string;
  processorSessionId: string;
  processorTransactionId: string | null;
  paymentMethod: string | null;
  outcome: PaymentAttemptOutcome;
  receiptShare: number | null;
  now: Date;
}

export interface FinalizedPaymentAttemptEffects {
  transaction: Transaction;
  splitPayment: SplitPayment | null;
  platformFee: PlatformFee | null;
  counterIncremented: boolean;
}

export type FinalizePaymentAttemptResult =
  | ({ kind: "finalized"; attempt: PaymentAttempt } & FinalizedPaymentAttemptEffects)
  | ({ kind: "reused"; attempt: PaymentAttempt } & FinalizedPaymentAttemptEffects)
  | { kind: "conflict"; attempt: PaymentAttempt }
  | { kind: "not-found" };

export interface PaymentAttemptRepository {
  getPaymentAttempt(id: string): Promise<PaymentAttempt | undefined>;
  getPaymentAttemptByProcessorSessionId(
    processorSessionId: string,
  ): Promise<PaymentAttempt | undefined>;
  getPaymentAttemptByTransactionShareKey(
    transactionId: number,
    shareIndex: number,
    idempotencyKey: string,
  ): Promise<PaymentAttempt | undefined>;
  claimPaymentAttemptRecord(
    input: ClaimPaymentAttemptRecordInput,
  ): Promise<ClaimPaymentAttemptResult>;
  attachPaymentAttemptSessionRecord(
    input: AttachPaymentAttemptSessionRecordInput,
  ): Promise<AttachPaymentAttemptSessionResult>;
  getPaymentAttemptByReturnStateHash(
    returnStateHash: string,
  ): Promise<PaymentAttempt | undefined>;
  claimPaymentAttemptFinalizationRecord(
    input: ClaimPaymentAttemptFinalizationRecordInput,
  ): Promise<ClaimPaymentAttemptFinalizationResult>;
  finalizePaymentAttemptRecord(
    input: FinalizePaymentAttemptRecordInput,
  ): Promise<FinalizePaymentAttemptResult>;
}

export class PaymentAttemptInputError extends Error {
  readonly code = "PAYMENT_ATTEMPT_INPUT";

  constructor(
    readonly field:
      | "transactionId"
      | "shareIndex"
      | "idempotencyKey"
      | "attemptId"
      | "processorSessionId"
      | "processorXId"
      | "processorTransactionId"
      | "paymentMethod"
      | "returnState"
      | "receiptShare"
      | "outcome",
    message: string,
  ) {
    super(message);
    this.name = "PaymentAttemptInputError";
  }
}

export type ResolvePaymentReturnStateResult =
  | { kind: "resolved"; attempt: PaymentAttempt }
  | { kind: "expired"; attempt: PaymentAttempt }
  | { kind: "not-found" };

export class PaymentAttemptService {
  constructor(
    private readonly repository: PaymentAttemptRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  claim(input: {
    transactionId: number;
    shareIndex: number;
    idempotencyKey: string;
  }): Promise<ClaimPaymentAttemptResult> {
    if (!Number.isInteger(input.transactionId) || input.transactionId <= 0) {
      throw new PaymentAttemptInputError(
        "transactionId",
        "transactionId must be a positive integer",
      );
    }
    if (!Number.isInteger(input.shareIndex) || input.shareIndex < 0) {
      throw new PaymentAttemptInputError(
        "shareIndex",
        "shareIndex must be a non-negative integer",
      );
    }
    assertUuid(input.idempotencyKey, "idempotencyKey");

    const now = this.clock();
    return this.repository.claimPaymentAttemptRecord({
      ...input,
      now,
      leaseExpiresAt: new Date(now.getTime() + PAYMENT_ATTEMPT_MAX_LEASE_MS),
    });
  }

  attachSession(input: {
    attemptId: string;
    processorSessionId: string;
    processorXId: string;
    rawReturnState?: string;
  }): Promise<AttachPaymentAttemptSessionResult> {
    assertUuid(input.attemptId, "attemptId");
    assertNonEmpty(input.processorSessionId, "processorSessionId");
    assertNonEmpty(input.processorXId, "processorXId");
    if (
      input.rawReturnState !== undefined &&
      !PAYMENT_TOKEN_PATTERN.test(input.rawReturnState)
    ) {
      throw new PaymentAttemptInputError(
        "returnState",
        "return state must be a 32-byte base64url credential",
      );
    }

    const now = this.clock();
    return this.repository.attachPaymentAttemptSessionRecord({
      attemptId: input.attemptId,
      processorSessionId: input.processorSessionId,
      processorXId: input.processorXId,
      returnStateHash:
        input.rawReturnState === undefined
          ? null
          : hashBearerCredential(input.rawReturnState),
      returnStateExpiresAt:
        input.rawReturnState === undefined
          ? null
          : new Date(now.getTime() + PAYMENT_RETURN_STATE_MAX_AGE_MS),
      now,
    });
  }

  async resolveReturnState(
    rawReturnState: string,
  ): Promise<ResolvePaymentReturnStateResult> {
    if (!PAYMENT_TOKEN_PATTERN.test(rawReturnState)) {
      return { kind: "not-found" };
    }
    const attempt = await this.repository.getPaymentAttemptByReturnStateHash(
      hashBearerCredential(rawReturnState),
    );
    if (!attempt?.returnStateExpiresAt) return { kind: "not-found" };
    if (attempt.returnStateExpiresAt.getTime() <= this.clock().getTime()) {
      return { kind: "expired", attempt };
    }
    return { kind: "resolved", attempt };
  }

  getAttempt(attemptId: string): Promise<PaymentAttempt | undefined> {
    assertUuid(attemptId, "attemptId");
    return this.repository.getPaymentAttempt(attemptId);
  }

  getAttemptByProcessorSessionId(
    processorSessionId: string,
  ): Promise<PaymentAttempt | undefined> {
    assertNonEmpty(processorSessionId, "processorSessionId");
    return this.repository.getPaymentAttemptByProcessorSessionId(
      processorSessionId,
    );
  }

  getAttemptByTransactionShareKey(input: {
    transactionId: number;
    shareIndex: number;
    idempotencyKey: string;
  }): Promise<PaymentAttempt | undefined> {
    if (!Number.isInteger(input.transactionId) || input.transactionId <= 0) {
      throw new PaymentAttemptInputError(
        "transactionId",
        "transactionId must be a positive integer",
      );
    }
    if (!Number.isInteger(input.shareIndex) || input.shareIndex < 0) {
      throw new PaymentAttemptInputError(
        "shareIndex",
        "shareIndex must be a non-negative integer",
      );
    }
    assertUuid(input.idempotencyKey, "idempotencyKey");
    return this.repository.getPaymentAttemptByTransactionShareKey(
      input.transactionId,
      input.shareIndex,
      input.idempotencyKey,
    );
  }

  claimFinalization(
    attemptId: string,
    processorSessionId: string,
  ): Promise<ClaimPaymentAttemptFinalizationResult> {
    assertUuid(attemptId, "attemptId");
    assertNonEmpty(processorSessionId, "processorSessionId");
    return this.repository.claimPaymentAttemptFinalizationRecord({
      attemptId,
      processorSessionId,
      now: this.clock(),
    });
  }

  finalize(input: {
    attemptId: string;
    processorSessionId: string;
    processorTransactionId?: string | null;
    paymentMethod?: string | null;
    outcome: PaymentAttemptOutcome;
    receiptShare?: number | null;
  }): Promise<FinalizePaymentAttemptResult> {
    assertUuid(input.attemptId, "attemptId");
    assertNonEmpty(input.processorSessionId, "processorSessionId");
    if (input.processorTransactionId !== undefined && input.processorTransactionId !== null) {
      assertNonEmpty(input.processorTransactionId, "processorTransactionId");
    }
    if (input.paymentMethod !== undefined && input.paymentMethod !== null) {
      assertNonEmpty(input.paymentMethod, "paymentMethod");
    }
    if (!(paymentAttemptOutcomes as readonly string[]).includes(input.outcome)) {
      throw new PaymentAttemptInputError(
        "outcome",
        "outcome must be approved, declined, or cancelled",
      );
    }
    if (input.outcome === "approved" && !input.processorTransactionId) {
      throw new PaymentAttemptInputError(
        "processorTransactionId",
        "processorTransactionId is required for an approved payment",
      );
    }
    const receiptShare = input.receiptShare ?? null;
    if (
      receiptShare !== null &&
      (!Number.isInteger(receiptShare) || receiptShare < 1)
    ) {
      throw new PaymentAttemptInputError(
        "receiptShare",
        "receiptShare must be a positive integer",
      );
    }
    return this.repository.finalizePaymentAttemptRecord({
      attemptId: input.attemptId,
      processorSessionId: input.processorSessionId,
      processorTransactionId: input.processorTransactionId ?? null,
      paymentMethod: input.paymentMethod ?? null,
      outcome: input.outcome,
      receiptShare,
      now: this.clock(),
    });
  }
}

function assertUuid(
  value: string,
  field: "idempotencyKey" | "attemptId",
): void {
  if (!UUID_PATTERN.test(value)) {
    throw new PaymentAttemptInputError(field, `${field} must be a UUID`);
  }
}

function assertNonEmpty(
  value: string,
  field:
    | "processorSessionId"
    | "processorXId"
    | "processorTransactionId"
    | "paymentMethod",
): void {
  if (!value.trim()) {
    throw new PaymentAttemptInputError(field, `${field} is required`);
  }
}
