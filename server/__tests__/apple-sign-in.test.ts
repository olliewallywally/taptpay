import "./support/test-env";

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  APPLE_ISSUER, APPLE_KEYS_URL, APPLE_TOKEN_URL, AppleSignInError, appleClientSecret, createAppleKeySet,
  exchangeAppleCode, verifyAppleIdentityToken, type AppleTransport,
} from "../apple-sign-in";
import { loadConfig } from "../config";

/**
 * R1-T5a: Apple's token boundary, with stand-ins for Apple (owner decision 2026-09-29: built and tested
 * with stand-ins; live needs his Apple setup). Every key here is made in this file; nothing leaves the
 * machine. `apple` plays Apple: it signs identity tokens and publishes the matching key set.
 */
const SERVICES_ID = "nz.taptpay.signin.harness";
const NONCE = crypto.randomBytes(32).toString("base64url");
const NOW = new Date("2026-10-04T10:00:00.000Z");
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

const apple = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const rotated = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const impostor = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const team = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = (key: crypto.KeyObject, kid: string) => ({ ...key.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" });

const CLAIMS = {
  iss: APPLE_ISSUER, aud: SERVICES_ID, sub: "001234.abcdef0123456789abcdef0123456789.0123", nonce: NONCE,
  iat: seconds(NOW) - 5, exp: seconds(NOW) + 600, email: "person@example.test", email_verified: "true", is_private_email: "false",
};
/** A token as Apple signs one; any claim or header field can be changed, removed (undefined) or signed otherwise. */
function token(change: Record<string, unknown> = {}, options: { kid?: string; key?: crypto.KeyObject; header?: Record<string, unknown> } = {}) {
  const payload: Record<string, unknown> = { ...CLAIMS, ...change };
  for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
  // The library adds an issue time of its own to a token that has none, unless told not to
  // (and told so, it removes one that is there).
  return jwt.sign(payload, options.key ?? apple.privateKey, { algorithm: "RS256", noTimestamp: payload.iat === undefined, header: { alg: "RS256", kid: options.kid ?? "apple-key-1", ...options.header } as any });
}
/** A hand-made token for the algorithms a library will not sign with. */
function forged(header: object, payload: object, sign: (input: string) => string) {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${part(header)}.${part(payload)}`;
  return `${input}.${sign(input)}`;
}

/** Apple's two endpoints, replaced: the published keys and the token exchange. Records every request. */
function standIn(options: { keys?: object[]; keysStatus?: number; tokenStatus?: number; tokenBody?: unknown; fail?: boolean } = {}) {
  const state = { keys: options.keys ?? [jwk(apple.publicKey, "apple-key-1")], requests: [] as Array<{ url: string; init?: any }> };
  const transport: AppleTransport = async (url, init) => {
    state.requests.push({ url, init });
    if (options.fail) throw new Error("synthetic network failure");
    if (url === APPLE_KEYS_URL) return { ok: (options.keysStatus ?? 200) === 200, status: options.keysStatus ?? 200, json: async () => ({ keys: state.keys }) };
    return { ok: (options.tokenStatus ?? 200) === 200, status: options.tokenStatus ?? 200, json: async () => options.tokenBody ?? { id_token: token() } };
  };
  return { state, transport, keyFetches: () => state.requests.filter((request) => request.url === APPLE_KEYS_URL).length };
}
const verify = (idToken: unknown, standin = standIn(), expected = { clientId: SERVICES_ID, nonce: NONCE }, clock = { ms: NOW.getTime() }) =>
  verifyAppleIdentityToken(idToken as string, expected, createAppleKeySet(standin.transport, () => clock.ms), new Date(clock.ms));
const refused = async (pending: Promise<unknown>, reason: string) => {
  await expect(pending).rejects.toBeInstanceOf(AppleSignInError);
  await expect(pending).rejects.toMatchObject({ reason });
};

describe("R1-T5a — Apple's identity token", () => {
  test("a token Apple signed for this Services ID and this browser's nonce is the identity", async () => {
    expect(await verify(token())).toEqual({
      issuer: APPLE_ISSUER, clientId: SERVICES_ID, subject: CLAIMS.sub, email: "person@example.test", emailVerified: true, privateRelay: false,
    });
  });

  test("a later sign-in carries no email and still names the same person", async () => {
    expect(await verify(token({ email: undefined, email_verified: undefined, is_private_email: undefined })))
      .toEqual({ issuer: APPLE_ISSUER, clientId: SERVICES_ID, subject: CLAIMS.sub, email: undefined, emailVerified: false, privateRelay: false });
  });

  test("a private relay address is kept and marked", async () => {
    expect(await verify(token({ email: "abc123@privaterelay.appleid.com", is_private_email: true, email_verified: true })))
      .toMatchObject({ email: "abc123@privaterelay.appleid.com", emailVerified: true, privateRelay: true });
  });

  test.each([["yes"], [1], ["TRUE"], [null], [{}]])("an email_verified of %j is not verified", async (value) => {
    expect(await verify(token({ email_verified: value, is_private_email: value }))).toMatchObject({ emailVerified: false, privateRelay: false });
  });

  test.each([
    ["another issuer", { iss: "https://appleid.apple.com.example.test" }],
    ["another app's audience", { aud: "nz.taptpay.other" }],
    ["an audience list that only includes ours", { aud: [SERVICES_ID, "nz.taptpay.other"] }],
    ["an expired token", { exp: seconds(NOW) - 1 }],
    ["no expiry", { exp: undefined }],
    ["a token issued in the future", { iat: seconds(NOW) + 120 }],
    ["no issue time", { iat: undefined }],
    ["another browser's nonce", { nonce: crypto.randomBytes(32).toString("base64url") }],
    ["no nonce", { nonce: undefined }],
    ["a nonce that is not text", { nonce: 12345 }],
    ["no subject", { sub: undefined }],
    ["an empty subject", { sub: "" }],
    ["a subject that is not text", { sub: 12345 }],
    ["an email that is not text", { email: { address: "person@example.test" } }],
  ])("%s is refused", async (_what, change) => {
    await refused(verify(token(change)), "bad-token");
  });

  test("a token signed by someone else under Apple's key id is refused", async () => {
    await refused(verify(token({}, { key: impostor.privateKey })), "bad-token");
  });

  test("a key id Apple does not publish is refused", async () => {
    await refused(verify(token({}, { kid: "made-up-key", key: impostor.privateKey })), "bad-token");
  });

  test("only RS256 counts: no signature, and Apple's public key used as a shared secret, are refused", async () => {
    const payload = { ...CLAIMS };
    const publicPem = apple.publicKey.export({ type: "spki", format: "pem" }) as string;
    const unsigned = forged({ alg: "none", kid: "apple-key-1" }, payload, () => "");
    const confused = forged({ alg: "HS256", kid: "apple-key-1" }, payload, (input) => crypto.createHmac("sha256", publicPem).update(input).digest("base64url"));
    const noKeyId = jwt.sign(payload, apple.privateKey, { algorithm: "RS256" });
    // Each is refused on its face: Apple is not even asked for its keys.
    const standin = standIn();
    for (const idToken of [unsigned, confused, noKeyId, "not.a.token", "", undefined, 42, `${token()}.extra`]) await refused(verify(idToken, standin), "bad-token");
    expect(standin.keyFetches()).toBe(0);
  });

  test("nothing about a refused token is in the error", async () => {
    const idToken = token({ aud: "nz.taptpay.other" });
    const error: any = await verify(idToken).catch((caught) => caught);
    expect(String(error.message)).not.toContain(idToken);
    expect(String(error.message)).not.toContain(CLAIMS.sub);
    expect(String(error.message)).not.toContain("person@example.test");
  });
});

describe("R1-T5a — Apple's published keys", () => {
  test("are fetched once from Apple's address and reused", async () => {
    const standin = standIn();
    const keys = createAppleKeySet(standin.transport, () => NOW.getTime());
    for (let i = 0; i < 3; i++) await verifyAppleIdentityToken(token(), { clientId: SERVICES_ID, nonce: NONCE }, keys, NOW);
    expect(standin.keyFetches()).toBe(1);
    expect(standin.state.requests[0].url).toBe("https://appleid.apple.com/auth/keys");
  });

  test("a rotated key is picked up by one refetch, and a made-up key id cannot make the server ask Apple again and again", async () => {
    const standin = standIn();
    const clock = { ms: NOW.getTime() };
    const keys = createAppleKeySet(standin.transport, () => clock.ms);
    const check = (idToken: string) => verifyAppleIdentityToken(idToken, { clientId: SERVICES_ID, nonce: NONCE }, keys, new Date(clock.ms));
    await check(token());
    // Apple rotates: a token under the new key id arrives before our cache has it.
    standin.state.keys = [jwk(apple.publicKey, "apple-key-1"), jwk(rotated.publicKey, "apple-key-2")];
    clock.ms += 61_000;
    expect(await check(token({ iat: seconds(new Date(clock.ms)) - 5 }, { kid: "apple-key-2", key: rotated.privateKey }))).toMatchObject({ subject: CLAIMS.sub });
    expect(standin.keyFetches()).toBe(2);
    // Unknown key ids inside the same minute: refused from the cache, no further fetch.
    for (const kid of ["made-up-1", "made-up-2", "made-up-3"]) await refused(check(token({}, { kid, key: impostor.privateKey })), "bad-token");
    expect(standin.keyFetches()).toBe(2);
    // A minute later an unknown key id may cause one more fetch, and only one.
    clock.ms += 61_000;
    await refused(check(token({ iat: seconds(new Date(clock.ms)) - 5 }, { kid: "made-up-4", key: impostor.privateKey })), "bad-token");
    expect(standin.keyFetches()).toBe(3);
  });

  test.each([
    ["cannot be reached", { fail: true }],
    ["answers an error", { keysStatus: 503 }],
  ])("when Apple's keys %s there is no identity", async (_what, options) => {
    await refused(verify(token(), standIn(options)), "unreachable");
  });

  test("keys that are not RSA signing keys are ignored", async () => {
    const ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const standin = standIn({ keys: [{ ...ec.publicKey.export({ format: "jwk" }), kid: "apple-key-1", use: "sig" }, { kty: "RSA", kid: "broken" }, "junk", null] as any });
    await refused(verify(token(), standin), "bad-token");
  });
});

const SETTINGS = () => ({
  servicesId: SERVICES_ID, teamId: "TEAM123456", keyId: "KEY1234567",
  privateKey: team.privateKey.export({ type: "pkcs8", format: "pem" }) as string,
});

describe("R1-T5a — the client secret and the code exchange", () => {
  test("the client secret is a short-lived ES256 token for Apple, signed by the team's key", () => {
    const secret = appleClientSecret(SETTINGS(), NOW);
    const header = JSON.parse(Buffer.from(secret.split(".")[0], "base64url").toString());
    expect(header).toMatchObject({ alg: "ES256", kid: "KEY1234567" });
    const claims = jwt.verify(secret, team.publicKey, { algorithms: ["ES256"], clockTimestamp: seconds(NOW) }) as any;
    expect(claims).toEqual({ iss: "TEAM123456", sub: SERVICES_ID, aud: APPLE_ISSUER, iat: seconds(NOW), exp: seconds(NOW) + 300 });
  });

  test("the code is exchanged at Apple's token address with the Services ID, the secret and the exact redirect", async () => {
    const standin = standIn();
    const idToken = await exchangeAppleCode("apple-code-1", "https://harness.test/api/auth/apple/callback", SETTINGS(), standin.transport, NOW);
    expect(await verify(idToken)).toMatchObject({ subject: CLAIMS.sub });
    expect(standin.state.requests).toHaveLength(1);
    const { url, init } = standin.state.requests[0];
    expect(url).toBe(APPLE_TOKEN_URL);
    expect(url).toBe("https://appleid.apple.com/auth/token");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    const form = new URLSearchParams(init.body);
    expect([...form.keys()].sort()).toEqual(["client_id", "client_secret", "code", "grant_type", "redirect_uri"]);
    expect(form.get("client_id")).toBe(SERVICES_ID);
    expect(form.get("code")).toBe("apple-code-1");
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("redirect_uri")).toBe("https://harness.test/api/auth/apple/callback");
    expect(jwt.verify(form.get("client_secret")!, team.publicKey, { algorithms: ["ES256"], clockTimestamp: seconds(NOW) })).toMatchObject({ sub: SERVICES_ID });
  });

  test.each([
    ["a used or withdrawn code", { tokenStatus: 400, tokenBody: { error: "invalid_grant" } }, "grant-refused"],
    ["Apple refusing our credentials", { tokenStatus: 400, tokenBody: { error: "invalid_client" } }, "unreachable"],
    ["an error from Apple", { tokenStatus: 500, tokenBody: {} }, "unreachable"],
    ["no connection", { fail: true }, "unreachable"],
    ["an answer with no identity token", { tokenBody: { access_token: "x" } }, "bad-token"],
    ["an identity token that is not text", { tokenBody: { id_token: 42 } }, "bad-token"],
  ])("%s gives no identity", async (_what, options, reason) => {
    await refused(exchangeAppleCode("apple-code-1", "https://harness.test/api/auth/apple/callback", SETTINGS(), standIn(options).transport, NOW), reason);
  });

  test("a code that is not a plausible code is refused before Apple is asked", async () => {
    const standin = standIn();
    for (const code of ["", undefined, 42, "x".repeat(2049), ["a"]]) {
      await refused(exchangeAppleCode(code as any, "https://harness.test/api/auth/apple/callback", SETTINGS(), standin.transport, NOW), "bad-token");
    }
    expect(standin.state.requests).toEqual([]);
  });

  test("neither the secret nor the key reaches a log line", async () => {
    const lines: string[] = [];
    const spies = (["log", "warn", "error", "info"] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); }));
    await exchangeAppleCode("apple-code-1", "https://harness.test/api/auth/apple/callback", SETTINGS(), standIn({ tokenStatus: 500 }).transport, NOW).catch(() => undefined);
    await verify(token({ aud: "nz.taptpay.other" })).catch(() => undefined);
    for (const spy of spies) spy.mockRestore();
    const logged = lines.join("\n");
    expect(logged).not.toContain("PRIVATE KEY");
    expect(logged).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
  });
});

describe("R1-T5a — configuration", () => {
  const BASE = {
    ENV_VALIDATION_MODE: "enforce", APP_ENV: "test", DATABASE_TARGET: "ci", DATABASE_URL: "postgresql://config-test.invalid/taptpay",
    JWT_SECRET: "test-only-independent-jwt-secret-0000000000", PAYMENT_RETURN_STATE_SECRET: "test-only-payment-state-secret-1111111111",
    CRON_SECRET: "test-only-cron-secret-22222222222222222222", PAYMENT_MODE: "disabled", PUBLIC_ORIGIN: "https://test.taptpay.invalid",
    RESEND_API_KEY: "test-only-resend-key",
  } as const;
  const APPLE = () => ({
    APPLE_SERVICES_ID: SERVICES_ID, APPLE_TEAM_ID: "TEAM123456", APPLE_KEY_ID: "KEY1234567",
    APPLE_PRIVATE_KEY: team.privateKey.export({ type: "pkcs8", format: "pem" }) as string,
  });

  test("with nothing set, Sign in with Apple is simply not configured", () => {
    expect(loadConfig(BASE).apple).toEqual({ servicesId: undefined, teamId: undefined, keyId: undefined, privateKey: undefined });
  });

  test("the four settings are read together, and a key pasted on one line is put back on its lines", () => {
    const pem = APPLE().APPLE_PRIVATE_KEY;
    expect(loadConfig({ ...BASE, ...APPLE() }).apple).toEqual({ servicesId: SERVICES_ID, teamId: "TEAM123456", keyId: "KEY1234567", privateKey: pem });
    expect(loadConfig({ ...BASE, ...APPLE(), APPLE_PRIVATE_KEY: pem.trim().replace(/\n/g, "\\n") }).apple.privateKey!.trim()).toBe(pem.trim());
  });

  test.each(["APPLE_SERVICES_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"])("without %s the group is refused as incomplete", (missing) => {
    expect(() => loadConfig({ ...BASE, ...APPLE(), [missing]: undefined })).toThrow(/APPLE_SERVICES_ID \+ APPLE_TEAM_ID \+ APPLE_KEY_ID \+ APPLE_PRIVATE_KEY/);
  });

  test("a key that is not an EC P-256 private key is refused without being echoed", () => {
    const rsa = apple.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    for (const bad of ["do-not-echo-this-value", rsa, team.publicKey.export({ type: "spki", format: "pem" }) as string]) {
      try {
        loadConfig({ ...BASE, ...APPLE(), APPLE_PRIVATE_KEY: bad });
        throw new Error("expected loadConfig to fail");
      } catch (error) {
        expect(String(error)).toContain("APPLE_PRIVATE_KEY");
        expect(String(error)).not.toContain(bad.slice(0, 40));
      }
    }
  });

  test("it needs the public origin outside tests: Apple is given an exact redirect address", () => {
    // A development environment in which nothing else needs the public origin (email is simulated).
    const { RESEND_API_KEY: _key, PUBLIC_ORIGIN: _origin, ...rest } = BASE;
    const bare = { ...rest, APP_ENV: "development", DATABASE_TARGET: "local", EMAIL_PROVIDER: "simulation" };
    expect(loadConfig(bare).apple.servicesId).toBeUndefined();
    try {
      loadConfig({ ...bare, ...APPLE() });
      throw new Error("expected loadConfig to fail");
    } catch (error) {
      expect(String(error)).toContain("PUBLIC_ORIGIN");
      expect(String(error)).toContain("apple-sign-in");
    }
    expect(loadConfig({ ...bare, ...APPLE(), PUBLIC_ORIGIN: "https://dev.taptpay.test" }).apple.servicesId).toBe(SERVICES_ID);
  });
});
