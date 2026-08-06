import {
  createPaymentCredential,
  hashPaymentToken,
  PAYMENT_TOKEN_HASH_PATTERN,
  PAYMENT_TOKEN_LENGTH,
  PAYMENT_TOKEN_PATTERN,
} from "../payment-credential";

describe("per-payment credentials", () => {
  test("uses 32 random bytes encoded as an unpadded base64url token", () => {
    const credential = createPaymentCredential();

    expect(credential.rawToken).toHaveLength(PAYMENT_TOKEN_LENGTH);
    expect(credential.rawToken).toMatch(PAYMENT_TOKEN_PATTERN);
    expect(credential.rawToken).not.toMatch(/[+/=]/);
  });

  test("returns the lowercase SHA-256 digest of the raw token", () => {
    const credential = createPaymentCredential();

    expect(credential.hash).toMatch(PAYMENT_TOKEN_HASH_PATTERN);
    expect(credential.hash).toBe(hashPaymentToken(credential.rawToken));
    expect(credential.hash).not.toContain(credential.rawToken);
  });

  test("does not reuse credentials across a generation batch", () => {
    const credentials = Array.from({ length: 256 }, () => createPaymentCredential());

    expect(new Set(credentials.map(({ rawToken }) => rawToken)).size).toBe(256);
    expect(new Set(credentials.map(({ hash }) => hash)).size).toBe(256);
  });
});
