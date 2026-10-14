import { inspect } from "node:util";
import {
  BankFieldContext, DataEncryption, DataEncryptionError, LEGACY_BANK_COLUMNS,
  MAX_ENCRYPTED_VALUE_BYTES, loadDataEncryption,
} from "../data-encryption";

const key = Buffer.alloc(32, 31);
const oldKey = Buffer.alloc(32, 73);
const context: BankFieldContext = { schema: "public", table: "merchants", rowId: 12, column: "bank_name" };
const source = (keys = [{ id: "current", key: key.toString("base64url") }]) => ({
  DATA_ENCRYPTION_STAGE: "read-compatible", DATA_ENCRYPTION_ACTIVE_KEY_ID: "current",
  DATA_ENCRYPTION_KEYRING: JSON.stringify(keys),
});
const cipher = () => loadDataEncryption(source());
const tamper = (value: string, part: number): string => {
  const parts = value.split(":");
  const bytes = Buffer.from(parts[part], "base64url");
  bytes[0] ^= 1;
  parts[part] = bytes.toString("base64url");
  return parts.join(":");
};

describe("R5 authenticated legacy-bank reader", () => {
  test.each(LEGACY_BANK_COLUMNS)("round-trips %s and binds the column and merchant", column => {
    const service = cipher();
    const ownContext = { ...context, column };
    const encrypted = service.encrypt("Synthetic银行 🏦", ownContext)!;
    expect(encrypted).toMatch(/^enc:v1:current:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(service.read(encrypted, ownContext)).toBe("Synthetic银行 🏦");
    expect(() => service.read(encrypted, { ...ownContext, rowId: 13 })).toThrow("ENCRYPTION_AUTHENTICATION_FAILED");
    const otherColumn = LEGACY_BANK_COLUMNS.find(other => other !== column)!;
    expect(() => service.read(encrypted, { ...ownContext, column: otherColumn })).toThrow("ENCRYPTION_AUTHENTICATION_FAILED");
  });

  test.each([null, "", "plain legacy bank", "Nā te rangatira", "\u0000\n\t", "\ufeffpreserve BOM"])("preserves null/empty/Unicode %p", value => {
    const service = cipher();
    expect(service.read(value, context)).toBe(value);
    expect(service.read(service.encrypt(value, context), context)).toBe(value);
  });

  test("each write uses a fresh 12-byte IV and a 16-byte tag", () => {
    const service = cipher();
    const first = service.encrypt("same", context)!;
    const second = service.encrypt("same", context)!;
    expect(first).not.toBe(second);
    expect(Buffer.from(first.split(":")[3], "base64url")).toHaveLength(12);
    expect(Buffer.from(first.split(":")[4], "base64url")).toHaveLength(16);
  });

  test.each([3, 4, 5])("tampered envelope part %s never falls back to plaintext", part => {
    const service = cipher();
    const changed = tamper(service.encrypt("synthetic-secret", context)!, part);
    expect(() => service.read(changed, context)).toThrow("ENCRYPTION_AUTHENTICATION_FAILED");
    expect(service.classify(changed, context)).toBe("authenticationFailure");
  });

  test.each([
    "enc:", "enc:v", "enc:v1", "enc:v1:current:AA:AA:AA", "enc:v1:current:::",
    "enc:v1:current:!:AA:AA", "enc:v1:bad.key:AA:AA:AA", "enc:v1:current:AA:AA:AA:extra",
  ])("malformed %p is an error, never legacy plaintext", value => {
    const service = cipher();
    expect(() => service.read(value, context)).toThrow("ENCRYPTION_MALFORMED_ENVELOPE");
    expect(service.classify(value, context)).toBe("malformedEnvelope");
  });

  test.each(["enc:v0:anything", "enc:v2:anything", "enc:v01:anything"])("unsupported version %p is not plaintext", value => {
    const service = cipher();
    expect(() => service.read(value, context)).toThrow("ENCRYPTION_UNSUPPORTED_VERSION");
    expect(service.classify(value, context)).toBe("unsupportedVersion");
  });

  test.each([3, 4, 5])("rejects padded/noncanonical base64url in part %s", part => {
    const service = cipher();
    const parts = service.encrypt("data", context)!.split(":");
    parts[part] += "=";
    expect(() => service.read(parts.join(":"), context)).toThrow("ENCRYPTION_MALFORMED_ENVELOPE");
  });

  test("old and new keys coexist during rotation; unknown key never downgrades", () => {
    const old = loadDataEncryption({ ...source([{ id: "previous", key: oldKey.toString("base64url") }]), DATA_ENCRYPTION_ACTIVE_KEY_ID: "previous" });
    const encrypted = old.encrypt("original", context)!;
    const rotated = loadDataEncryption(source([
      { id: "current", key: key.toString("base64url") }, { id: "previous", key: oldKey.toString("base64url") },
    ]));
    expect(rotated.read(encrypted, context)).toBe("original");
    expect(rotated.classify(encrypted, context)).toBe("encryptedOldKey");
    expect(rotated.classify(rotated.encrypt("new", context), context)).toBe("encryptedActiveKey");
    expect(() => cipher().read(encrypted, context)).toThrow("ENCRYPTION_UNKNOWN_KEY");
    expect(cipher().classify(encrypted, context)).toBe("unknownKey");
  });

  test("legacy mode intentionally reads plaintext but cannot accept ciphertext or generate a key", () => {
    const legacy = loadDataEncryption({});
    expect(legacy.read("existing", context)).toBe("existing");
    expect(() => legacy.read(cipher().encrypt("data", context), context)).toThrow("ENCRYPTION_READER_NOT_ENABLED");
    expect(() => legacy.encrypt("data", context)).toThrow("ENCRYPTION_KEY_NOT_CONFIGURED");
    expect(legacy.encrypt(null, context)).toBeNull();
  });

  test.each([
    { ...context, rowId: 0 }, { ...context, rowId: 1.5 }, { ...context, rowId: Number.MAX_SAFE_INTEGER + 1 },
    { ...context, schema: "other" }, { ...context, table: "other" }, { ...context, column: "password_hash" },
  ])("context %p cannot weaken scope or confuse AAD", bad => {
    expect(() => cipher().read("plaintext", bad as BankFieldContext)).toThrow("ENCRYPTION_INVALID_CONTEXT");
    expect(() => cipher().encrypt(null, bad as BankFieldContext)).toThrow("ENCRYPTION_INVALID_CONTEXT");
  });

  test("exact size bound round-trips; overbound and invalid UTF-16 cannot silently change", () => {
    const service = cipher();
    const max = "x".repeat(MAX_ENCRYPTED_VALUE_BYTES);
    expect(service.read(service.encrypt(max, context), context)).toBe(max);
    for (const tooLarge of [max + "x", "🌏".repeat(MAX_ENCRYPTED_VALUE_BYTES / 4 + 1)]) {
      expect(() => service.encrypt(tooLarge, context)).toThrow("ENCRYPTION_VALUE_TOO_LARGE");
      expect(service.classify(tooLarge, context)).toBe("invalidValue");
    }
    expect(() => service.encrypt("\ud800", context)).toThrow("ENCRYPTION_INVALID_VALUE");
    expect(() => service.read(42 as any, context)).toThrow("ENCRYPTION_INVALID_VALUE");
    expect(() => service.read("enc:" + "x".repeat(MAX_ENCRYPTED_VALUE_BYTES * 2), context)).toThrow("ENCRYPTION_VALUE_TOO_LARGE");
  });

  test("safe errors, fixed metrics and observers expose no key/envelope/value/cause", () => {
    const observed: unknown[] = [];
    const service = new DataEncryption({ stage: "read-compatible", keys: new Map([["current", key]]), activeKeyId: "current", observe: diagnostic => {
      observed.push(diagnostic); throw new Error("observer synthetic secret");
    } });
    const encrypted = tamper(service.encrypt("private synthetic bank", context)!, 4);
    let error: any;
    try { service.read(encrypted, context); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(DataEncryptionError);
    expect(error.cause).toBeUndefined();
    expect(observed).toEqual([{ code: "ENCRYPTION_AUTHENTICATION_FAILED", rowId: 12, field: "bank_name" }]);
    expect(service.failureCounts()).toEqual({ ENCRYPTION_AUTHENTICATION_FAILED: 1 });
    for (const output of [JSON.stringify(service), inspect(service), JSON.stringify(error), error.stack, JSON.stringify(observed)]) {
      expect(output).not.toContain(encrypted);
      expect(output).not.toContain(key.toString("base64url"));
      expect(output).not.toContain("private synthetic bank");
      expect(output).not.toContain("observer synthetic secret");
    }
  });

  test("input key buffers cannot change the service after validation", () => {
    const mutable = Buffer.from(key);
    const service = new DataEncryption({ stage: "read-compatible", keys: new Map([["current", mutable]]), activeKeyId: "current" });
    const encrypted = service.encrypt("data", context);
    mutable.fill(0);
    expect(service.read(encrypted, context)).toBe("data");
    expect(Object.isFrozen(service)).toBe(true);
  });
});

describe("R5 keyring grammar", () => {
  test.each([
    "", "bad private key material", "{}", "null", "[]", '[{"id":"current"}]',
    JSON.stringify([{ id: "current", key: "short" }]),
    JSON.stringify([{ id: "current", key: key.toString("base64") }]),
    JSON.stringify([{ id: "current", key: key.toString("base64url"), extra: "secret" }]),
    JSON.stringify([{ id: "bad.id", key: key.toString("base64url") }]),
    JSON.stringify([{ id: "current", key: key.toString("base64url") }, { id: "current", key: oldKey.toString("base64url") }]),
    JSON.stringify([{ id: "current", key: key.toString("base64url") }, { id: "alias", key: key.toString("base64url") }]),
    "x".repeat(8193),
  ])("invalid keyring case %# is rejected without echoing the input", raw => {
    expect(() => loadDataEncryption({ ...source(), DATA_ENCRYPTION_KEYRING: raw })).toThrow("DATA_ENCRYPTION_KEYRING");
    try { loadDataEncryption({ ...source(), DATA_ENCRYPTION_KEYRING: raw }); } catch (error: any) {
      expect(error.message).not.toContain("private key material");
      expect(error.stack).not.toContain(key.toString("base64url"));
    }
  });

  test.each([undefined, "", "missing", "bad:key"])("missing/unknown active key %p is refused", active => {
    expect(() => loadDataEncryption({ ...source(), DATA_ENCRYPTION_ACTIVE_KEY_ID: active })).toThrow(/DATA_ENCRYPTION_(KEYRING|ACTIVE_KEY_ID)/);
  });

  test("partial legacy config does not silently ignore supplied key requirements", () => {
    expect(() => loadDataEncryption({ DATA_ENCRYPTION_ACTIVE_KEY_ID: "current" })).toThrow("DATA_ENCRYPTION_KEYRING");
    expect(() => loadDataEncryption({ DATA_ENCRYPTION_KEYRING: "[]" })).toThrow("DATA_ENCRYPTION_KEYRING");
  });
});
