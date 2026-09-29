import type { Transaction } from "@shared/schema";
import { createPaymentCredential, type PaymentCredential } from "./payment-credential";
import {
  toTransactionStorageInput,
  type TransactionStorageInput,
} from "./storage";

export type RetailLinkMode = "legacy" | "per_payment";

export type RetailTransactionServiceInput = Omit<
  TransactionStorageInput,
  "paymentTokenHash"
>;

export interface RetailTransactionWriter {
  createTransaction(input: TransactionStorageInput): Promise<Transaction>;
}

export interface CreatedRetailTransaction {
  transaction: Transaction;
  rawToken?: string;
}

export class PaymentCredentialCollisionError extends Error {
  readonly code = "PAYMENT_CREDENTIAL_COLLISION";

  constructor() {
    super("Could not allocate a unique payment credential");
    this.name = "PaymentCredentialCollisionError";
  }
}

function isPaymentTokenUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (
      candidate.code === "23505" &&
      (candidate.constraint === undefined ||
        candidate.constraint === "transactions_payment_token_hash_uq")
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

/**
 * The only transaction-creation path that may mint a bearer credential. The
 * raw token never enters storage and is returned only alongside this one
 * authenticated create result.
 */
export async function createRetailTransaction(
  writer: RetailTransactionWriter,
  input: RetailTransactionServiceInput,
  linkMode: RetailLinkMode,
  options: {
    credentialFactory?: () => PaymentCredential;
    maxCredentialAttempts?: number;
  } = {},
): Promise<CreatedRetailTransaction> {
  if (linkMode === "per_payment" && input.taptStoneId != null) {
    throw new Error("Per-payment links cannot use a payment board");
  }

  if (linkMode === "legacy") {
    return {
      transaction: await writer.createTransaction(
        toTransactionStorageInput(input as any),
      ),
    };
  }

  const credentialFactory = options.credentialFactory ?? createPaymentCredential;
  const maxAttempts = options.maxCredentialAttempts ?? 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const credential = credentialFactory();
    try {
      const transaction = await writer.createTransaction(
        toTransactionStorageInput(input as any, { paymentTokenHash: credential.hash }),
      );
      return { transaction, rawToken: credential.rawToken };
    } catch (error) {
      if (!isPaymentTokenUniqueViolation(error)) throw error;
    }
  }

  throw new PaymentCredentialCollisionError();
}
