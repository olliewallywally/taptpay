import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { TextDecoder } from "node:util";

export const LEGACY_BANK_COLUMNS = Object.freeze([
  "bank_name", "bank_branch", "account_holder_name", "bank_account_number",
] as const);
export type LegacyBankColumn = typeof LEGACY_BANK_COLUMNS[number];
export type EncryptionStage = "legacy" | "read-compatible";
export const MAX_ENCRYPTED_VALUE_BYTES = 1024 * 1024;
const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;
export const MAX_ENCRYPTED_ENVELOPE_LENGTH = Math.ceil(MAX_ENCRYPTED_VALUE_BYTES * 4 / 3) + 160;

export type EncryptionErrorCode =
  | "ENCRYPTION_INVALID_CONTEXT" | "ENCRYPTION_INVALID_VALUE" | "ENCRYPTION_VALUE_TOO_LARGE"
  | "ENCRYPTION_MALFORMED_ENVELOPE" | "ENCRYPTION_UNSUPPORTED_VERSION"
  | "ENCRYPTION_UNKNOWN_KEY" | "ENCRYPTION_AUTHENTICATION_FAILED"
  | "ENCRYPTION_READER_NOT_ENABLED" | "ENCRYPTION_KEY_NOT_CONFIGURED";

export interface BankFieldContext {
  readonly schema: "public";
  readonly table: "merchants";
  readonly rowId: number;
  readonly column: LegacyBankColumn;
}
export interface EncryptionDiagnostic {
  readonly code: EncryptionErrorCode;
  readonly rowId?: number;
  readonly field?: LegacyBankColumn;
}

/** No value, envelope, key ID, crypto exception or cause is retained on errors. */
export class DataEncryptionError extends Error {
  constructor(readonly code: EncryptionErrorCode) {
    super(code);
    this.name = "DataEncryptionError";
  }
}

export class EncryptionConfigurationError extends Error {
  constructor(readonly key: string) {
    super(`Invalid encryption configuration: ${key}`);
    this.name = "EncryptionConfigurationError";
  }
}

export type EncryptionBucket = "null" | "plaintext" | "encryptedActiveKey" |
  "encryptedOldKey" | "unknownKey" | "malformedEnvelope" | "authenticationFailure" |
  "unsupportedVersion" | "invalidValue";

function decodeCanonical(value: string, bytes?: number): Buffer {
  if (!BASE64URL.test(value)) throw new DataEncryptionError("ENCRYPTION_MALFORMED_ENVELOPE");
  const result = Buffer.from(value, "base64url");
  if (result.toString("base64url") !== value || (bytes !== undefined && result.length !== bytes)) {
    throw new DataEncryptionError("ENCRYPTION_MALFORMED_ENVELOPE");
  }
  return result;
}

function contextIsValid(context: BankFieldContext): boolean {
  return !!context && context.schema === "public" && context.table === "merchants" &&
    Number.isSafeInteger(context.rowId) && context.rowId > 0 &&
    LEGACY_BANK_COLUMNS.includes(context.column);
}

function additionalData(context: BankFieldContext): Buffer {
  if (!contextIsValid(context)) throw new DataEncryptionError("ENCRYPTION_INVALID_CONTEXT");
  return Buffer.from(JSON.stringify([
    "taptpay:data-encryption:v1", context.schema, context.table, String(context.rowId), context.column,
  ]), "utf8");
}

function valueBytes(value: unknown): Buffer {
  if (typeof value !== "string") throw new DataEncryptionError("ENCRYPTION_INVALID_VALUE");
  if (value.length > MAX_ENCRYPTED_VALUE_BYTES) throw new DataEncryptionError("ENCRYPTION_VALUE_TOO_LARGE");
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > MAX_ENCRYPTED_VALUE_BYTES) throw new DataEncryptionError("ENCRYPTION_VALUE_TOO_LARGE");
  if (bytes.toString("utf8") !== value) throw new DataEncryptionError("ENCRYPTION_INVALID_VALUE");
  return bytes;
}

function parseEnvelope(value: string) {
  if (value.length > MAX_ENCRYPTED_ENVELOPE_LENGTH) throw new DataEncryptionError("ENCRYPTION_VALUE_TOO_LARGE");
  const parts = value.split(":");
  if (parts[0] !== "enc" || !/^v[0-9]+$/.test(parts[1] ?? "")) {
    throw new DataEncryptionError("ENCRYPTION_MALFORMED_ENVELOPE");
  }
  if (parts[1] !== "v1") throw new DataEncryptionError("ENCRYPTION_UNSUPPORTED_VERSION");
  if (parts.length !== 6 || !KEY_ID.test(parts[2])) throw new DataEncryptionError("ENCRYPTION_MALFORMED_ENVELOPE");
  const iv = decodeCanonical(parts[3], 12);
  const tag = decodeCanonical(parts[4], 16);
  const ciphertext = decodeCanonical(parts[5]);
  if (ciphertext.length > MAX_ENCRYPTED_VALUE_BYTES) throw new DataEncryptionError("ENCRYPTION_VALUE_TOO_LARGE");
  return { keyId: parts[2], iv, tag, ciphertext };
}

/** Server-only service. Private key buffers cannot appear in JSON or inspection. */
export class DataEncryption {
  #keys: Map<string, Buffer>;
  #activeKeyId?: string;
  #stage: EncryptionStage;
  #observe?: (diagnostic: EncryptionDiagnostic) => void;
  #failures = new Map<EncryptionErrorCode, number>();

  constructor(options: {
    stage: EncryptionStage;
    activeKeyId?: string;
    keys: ReadonlyMap<string, Buffer>;
    observe?: (diagnostic: EncryptionDiagnostic) => void;
  }) {
    if (options.stage !== "legacy" && options.stage !== "read-compatible") {
      throw new EncryptionConfigurationError("DATA_ENCRYPTION_STAGE");
    }
    const keys = new Map<string, Buffer>();
    if (options.keys.size > 32) throw new EncryptionConfigurationError("DATA_ENCRYPTION_KEYRING");
    for (const [id, key] of options.keys) {
      if (!KEY_ID.test(id) || !Buffer.isBuffer(key) || key.length !== 32 ||
        [...keys.values()].some(existing => existing.equals(key))) {
        throw new EncryptionConfigurationError("DATA_ENCRYPTION_KEYRING");
      }
      keys.set(id, Buffer.from(key));
    }
    if (options.activeKeyId !== undefined && (!KEY_ID.test(options.activeKeyId) || !keys.has(options.activeKeyId))) {
      throw new EncryptionConfigurationError("DATA_ENCRYPTION_ACTIVE_KEY_ID");
    }
    if ((keys.size > 0 && !options.activeKeyId) || (options.stage === "read-compatible" && keys.size === 0)) {
      throw new EncryptionConfigurationError("DATA_ENCRYPTION_KEYRING");
    }
    this.#stage = options.stage;
    this.#activeKeyId = options.activeKeyId;
    this.#keys = keys;
    this.#observe = options.observe;
    Object.freeze(this);
  }

  describe() {
    return { stage: this.#stage, configured: this.#keys.size > 0, readableKeyCount: this.#keys.size };
  }

  toJSON() { return this.describe(); }

  failureCounts(): Readonly<Partial<Record<EncryptionErrorCode, number>>> {
    return Object.freeze(Object.fromEntries(this.#failures));
  }

  #run<T>(context: BankFieldContext, operation: () => T): T {
    try { return operation(); }
    catch (error) {
      const safe = error instanceof DataEncryptionError ? error : new DataEncryptionError("ENCRYPTION_INVALID_VALUE");
      this.#failures.set(safe.code, (this.#failures.get(safe.code) ?? 0) + 1);
      const diagnostic: EncryptionDiagnostic = contextIsValid(context)
        ? { code: safe.code, rowId: context.rowId, field: context.column }
        : { code: safe.code };
      // Observability must not replace the original fixed error with an observer's payload.
      try { this.#observe?.(Object.freeze(diagnostic)); } catch { /* fixed error below */ }
      throw safe;
    }
  }

  /** Building block for later reviewed E2/E3; T1 has no persistent writer. */
  encrypt(value: string | null, context: BankFieldContext): string | null {
    return this.#run(context, () => {
      const aad = additionalData(context);
      if (value === null) return null;
      const bytes = valueBytes(value);
      const id = this.#activeKeyId;
      if (!id) throw new DataEncryptionError("ENCRYPTION_KEY_NOT_CONFIGURED");
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.#keys.get(id)!, iv, { authTagLength: 16 });
      cipher.setAAD(aad);
      const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
      return `enc:v1:${id}:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
    });
  }

  read(value: string | null, context: BankFieldContext): string | null {
    return this.#run(context, () => {
      const aad = additionalData(context);
      if (value === null) return null;
      if (typeof value !== "string") throw new DataEncryptionError("ENCRYPTION_INVALID_VALUE");
      if (!value.startsWith("enc:")) { valueBytes(value); return value; }
      const parsed = parseEnvelope(value);
      if (this.#stage !== "read-compatible") throw new DataEncryptionError("ENCRYPTION_READER_NOT_ENABLED");
      const key = this.#keys.get(parsed.keyId);
      if (!key) throw new DataEncryptionError("ENCRYPTION_UNKNOWN_KEY");
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, parsed.iv, { authTagLength: 16 });
        decipher.setAAD(aad);
        decipher.setAuthTag(parsed.tag);
        const bytes = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw new DataEncryptionError("ENCRYPTION_AUTHENTICATION_FAILED");
      }
    });
  }

  /** Authenticate before counting a value as encrypted. Never returns the value. */
  classify(value: string | null, context: BankFieldContext): EncryptionBucket {
    try {
      this.read(value, context);
      if (value === null) return "null";
      if (!value.startsWith("enc:")) return "plaintext";
      return parseEnvelope(value).keyId === this.#activeKeyId ? "encryptedActiveKey" : "encryptedOldKey";
    } catch (error) {
      if (!(error instanceof DataEncryptionError)) throw error;
      switch (error.code) {
        case "ENCRYPTION_UNKNOWN_KEY": return "unknownKey";
        case "ENCRYPTION_MALFORMED_ENVELOPE": return "malformedEnvelope";
        case "ENCRYPTION_AUTHENTICATION_FAILED": return "authenticationFailure";
        case "ENCRYPTION_UNSUPPORTED_VERSION": return "unsupportedVersion";
        case "ENCRYPTION_INVALID_VALUE": case "ENCRYPTION_VALUE_TOO_LARGE": return "invalidValue";
        default: throw error; // A broken reader/context is not a data classification.
      }
    }
  }
}

/** Injected environment snapshot: no module-level process or database access. */
export function loadDataEncryption(env: Readonly<Record<string, string | undefined>>): DataEncryption {
  const rawStage = env.DATA_ENCRYPTION_STAGE ?? "legacy";
  if (rawStage !== "legacy" && rawStage !== "read-compatible") {
    throw new EncryptionConfigurationError("DATA_ENCRYPTION_STAGE");
  }
  const rawKeyring = env.DATA_ENCRYPTION_KEYRING;
  const activeKeyId = env.DATA_ENCRYPTION_ACTIVE_KEY_ID;
  if (rawKeyring === undefined && activeKeyId !== undefined) {
    throw new EncryptionConfigurationError("DATA_ENCRYPTION_KEYRING");
  }
  const keys = new Map<string, Buffer>();
  if (rawKeyring !== undefined) {
    if (rawKeyring.length > 8192) throw new EncryptionConfigurationError("DATA_ENCRYPTION_KEYRING");
    let entries: unknown;
    try { entries = JSON.parse(rawKeyring); } catch { throw new EncryptionConfigurationError("DATA_ENCRYPTION_KEYRING"); }
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 32) {
      throw new EncryptionConfigurationError("DATA_ENCRYPTION_KEYRING");
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        Object.keys(entry).sort().join(",") !== "id,key" ||
        typeof entry.id !== "string" || typeof entry.key !== "string" ||
        !KEY_ID.test(entry.id) || keys.has(entry.id)) {
        throw new EncryptionConfigurationError("DATA_ENCRYPTION_KEYRING");
      }
      let key: Buffer;
      try { key = decodeCanonical(entry.key, 32); } catch { throw new EncryptionConfigurationError("DATA_ENCRYPTION_KEYRING"); }
      keys.set(entry.id, key);
    }
  }
  return new DataEncryption({ stage: rawStage, activeKeyId, keys });
}
