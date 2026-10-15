import "./support/test-env";

import crypto from "node:crypto";
import { config } from "../config";
import { appleStateMatches, readAppleConnectStart, startAppleConnect, startAppleSignIn, verifyAppleSignInState } from "../apple-sign-in";

/**
 * R1-T5c: the starting cookie of a connect. Apple's return is a cross-site post with no session
 * cookie on it, so the login and the session that asked ride in this cookie, believed only under
 * the server's signature, with a key used for nothing else.
 */
const SESSION = "abcdefghijklmnopqrstuv"; // 22 characters, as a session id is
const login = { userId: 41, sessionId: SESSION };
const sign = (label: string, payload: string) =>
  crypto.createHmac("sha256", Buffer.from(crypto.hkdfSync("sha256", config.jwtSecret, Buffer.alloc(0), label, 32))).update(payload, "utf8").digest("base64url");

afterEach(() => jest.useRealTimers());

test("a connect start names the login and the session that asked, with a fresh state and nonce", () => {
  const started = startAppleConnect(login);
  expect(started.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(started.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(started.nonce).not.toBe(started.state);
  const parts = started.cookieValue.split(".");
  expect(parts).toHaveLength(6);
  expect(parts.slice(0, 2)).toEqual([started.state, started.nonce]);
  expect(parts.slice(3, 5)).toEqual(["41", SESSION]);
  expect(readAppleConnectStart(started.cookieValue)).toEqual({ state: started.state, nonce: started.nonce, userId: 41, sessionId: SESSION, expired: false });
  const again = startAppleConnect(login);
  expect([again.state, again.nonce]).not.toEqual([started.state, started.nonce]);
});

test("every part is under the signature: change any one and it is not a connect start", () => {
  const started = startAppleConnect(login);
  const parts = started.cookieValue.split(".");
  const other = startAppleConnect({ userId: 42, sessionId: "ZYXWVUTSRQPONMLKJIHGFE" }).cookieValue.split(".");
  for (let index = 0; index < parts.length; index += 1) {
    const changed = [...parts];
    changed[index] = index === 2 ? String(Number(parts[2]) + 1) : other[index];
    expect([index, readAppleConnectStart(changed.join("."))]).toEqual([index, null]);
  }
});

test.each([
  ["nothing", undefined],
  ["an empty value", ""],
  ["five parts", (value: string) => value.split(".").slice(1).join(".")],
  ["seven parts", (value: string) => `${value}.extra`],
  ["a login id of zero", () => signed(`${"A".repeat(43)}.${"B".repeat(43)}.${Date.now()}.0.${SESSION}`)],
  ["a login id with a leading zero", () => signed(`${"A".repeat(43)}.${"B".repeat(43)}.${Date.now()}.041.${SESSION}`)],
  ["a login id that is not a number", () => signed(`${"A".repeat(43)}.${"B".repeat(43)}.${Date.now()}.4e1.${SESSION}`)],
  ["a login id too large to be one", () => signed(`${"A".repeat(43)}.${"B".repeat(43)}.${Date.now()}.99999999999999999999.${SESSION}`)],
  // Sixteen digits fit a JavaScript number only inexactly: 9999999999999999 reads back as 10000000000000000.
  ["a login id no number holds exactly", () => signed(`${"A".repeat(43)}.${"B".repeat(43)}.${Date.now()}.9999999999999999.${SESSION}`)],
  ["a login id longer than a database id", () => signed(`${"A".repeat(43)}.${"B".repeat(43)}.${Date.now()}.12345678901.${SESSION}`)],
  ["a session id of the wrong length", () => signed(`${"A".repeat(43)}.${"B".repeat(43)}.${Date.now()}.41.${SESSION}x`)],
  ["a short state", () => signed(`${"A".repeat(42)}.${"B".repeat(43)}.${Date.now()}.41.${SESSION}`)],
  ["a start time that is not thirteen digits", () => signed(`${"A".repeat(43)}.${"B".repeat(43)}.123.41.${SESSION}`)],
])("%s is not a connect start", (_what, make) => {
  const value = typeof make === "function" ? make(startAppleConnect(login).cookieValue) : make;
  expect(readAppleConnectStart(value as string | undefined)).toBeNull();
});
/** A value in the connect cookie's shape, under the connect key: only its content is wrong. */
function signed(payload: string): string {
  return `${payload}.${sign("taptpay apple-connect v1", payload)}`;
}

test("the shape checks are the reader's own: a well-formed value under the connect key is read", () => {
  const payload = `${"A".repeat(43)}.${"B".repeat(43)}.${Date.now()}.41.${SESSION}`;
  expect(readAppleConnectStart(signed(payload))).toMatchObject({ userId: 41, sessionId: SESSION, expired: false });
});

test("a sign-in cookie is never a connect start, and a connect cookie never signs anyone in", () => {
  const signIn = startAppleSignIn();
  expect(readAppleConnectStart(signIn.cookieValue)).toBeNull();
  const connect = startAppleConnect(login);
  expect(verifyAppleSignInState(connect.cookieValue, connect.state)).toBeNull();
  // The two are signed under different keys: a connect payload signed with the sign-in key is refused,
  const payload = connect.cookieValue.split(".").slice(0, 5).join(".");
  expect(readAppleConnectStart(`${payload}.${sign("taptpay apple-state v1", payload)}`)).toBeNull();
  // and a sign-in payload signed with the connect key signs nobody in.
  const [state, nonce, issued] = signIn.cookieValue.split(".");
  expect(verifyAppleSignInState(`${state}.${nonce}.${issued}.${sign("taptpay apple-connect v1", `${state}.${nonce}.${issued}`)}`, state)).toBeNull();
});

test("a start is good for ten minutes: after that, and from the future, it is ours but expired", () => {
  jest.useFakeTimers({ now: new Date("2026-10-04T10:00:00.000Z"), doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval"] });
  const started = startAppleConnect(login);
  jest.setSystemTime(Date.now() + 10 * 60_000 - 1);
  expect(readAppleConnectStart(started.cookieValue)).toMatchObject({ expired: false });
  jest.setSystemTime(Date.now() + 1);
  expect(readAppleConnectStart(started.cookieValue)).toMatchObject({ userId: 41, expired: true });
  jest.setSystemTime(new Date("2026-10-04T09:59:59.000Z"));
  expect(readAppleConnectStart(started.cookieValue)).toMatchObject({ expired: true });
});

test("the returned state is matched whole, and only a state in the shape this server makes", () => {
  const { state } = startAppleConnect(login);
  expect(appleStateMatches(state, state)).toBe(true);
  for (const returned of [undefined, null, 41, "", state.slice(0, 42), `${state}A`, startAppleConnect(login).state, [state], { state }]) {
    expect(appleStateMatches(state, returned)).toBe(false);
  }
});
