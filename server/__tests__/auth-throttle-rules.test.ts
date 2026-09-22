import "./support/test-env";

import {
  AUTH_THROTTLE_RECLAIM_AFTER_MS, PASSWORD_RESET_POLICY, SIGN_IN_POLICY, passwordChangeBucket, passwordResetBucket,
  planAuthThrottleTake,
  retryAfterSeconds, settleAuthThrottleRow, signInAccountBucket, signInDeviceBucket, signInDeviceKeyPrefix,
  tooManyAttempts, uniqueAuthThrottleBuckets, waitAfter, waitInWords,
  type AuthThrottleBucket, type AuthThrottleRow,
} from "../auth-throttle";
import {
  deviceKnowsEmail, deviceMarkAfterSuccess, parseSignInDevice, signInBucketFor, signInDeviceCookie,
} from "../sign-in-device";

/** R1-T4 phase C: the counting rules and the known-device mark, without HTTP or storage. */

const NOW = new Date("2026-09-22T12:00:00.000Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const bucket = (key: string, policy = SIGN_IN_POLICY): AuthThrottleBucket => ({ key, policy });
const row = (key: string, failures: number, nextAllowedAt: Date | null, updatedAt = NOW): AuthThrottleRow =>
  ({ bucketKey: key, failures, windowStartedAt: NOW, nextAllowedAt, updatedAt });

describe("the policies", () => {
  it("never let a wait outlive its bucket, and reclaim only rows no policy still counts", () => {
    for (const policy of [SIGN_IN_POLICY, PASSWORD_RESET_POLICY]) {
      expect(policy.maxWaitMs).toBeLessThan(policy.forgetAfterMs);
      expect(AUTH_THROTTLE_RECLAIM_AFTER_MS).toBeGreaterThanOrEqual(policy.forgetAfterMs);
    }
  });

  it("wait nothing within the free allowance, then double to the cap", () => {
    expect([0, 1, 4].map((n) => waitAfter(n, SIGN_IN_POLICY))).toEqual([0, 0, 0]);
    expect([5, 6, 7, 8, 9, 10, 11, 1_000].map((n) => waitAfter(n, SIGN_IN_POLICY) / 1000))
      .toEqual([30, 60, 120, 240, 480, 900, 900, 900]);
    expect([2, 3, 4, 5, 6, 7].map((n) => waitAfter(n, PASSWORD_RESET_POLICY) / 60_000)).toEqual([0, 5, 10, 20, 40, 60]);
  });
});

describe("taking an attempt", () => {
  it("counts it against a new bucket and starts no wait inside the allowance", () => {
    const plan = planAuthThrottleTake([bucket("a")], [], NOW);
    expect(plan).toEqual({ allowed: true, charged: [row("a", 1, null)] });
  });

  it("starts the first wait with the attempt that uses up the allowance", () => {
    const plan = planAuthThrottleTake([bucket("a")], [row("a", 4, null)], NOW);
    expect(plan).toEqual({ allowed: true, charged: [row("a", 5, at(30))] });
  });

  it("refuses while any bucket waits, gives the longest wait, and counts nothing", () => {
    const plan = planAuthThrottleTake([bucket("a"), bucket("b"), bucket("c")],
      [row("a", 5, at(30)), row("b", 7, at(120)), row("c", 0, null)], NOW);
    expect(plan).toEqual({ allowed: false, retryAfterMs: 120_000 });
  });

  it("lets an attempt through the moment the wait ends", () => {
    const plan = planAuthThrottleTake([bucket("a")], [row("a", 5, at(0), at(-30))], NOW);
    expect(plan).toEqual({ allowed: true, charged: [{ ...row("a", 6, at(60)), windowStartedAt: NOW }] });
  });

  it("starts a bucket again once it has been left alone past its policy's forget time", () => {
    const idle = new Date(NOW.getTime() - SIGN_IN_POLICY.forgetAfterMs);
    const stale = { ...row("a", 9, null, idle), windowStartedAt: idle };
    expect(planAuthThrottleTake([bucket("a")], [stale], NOW)).toEqual({ allowed: true, charged: [row("a", 1, null)] });
    const recent = { ...stale, updatedAt: new Date(idle.getTime() + 1) };
    expect(planAuthThrottleTake([bucket("a")], [recent], NOW))
      .toEqual({ allowed: true, charged: [{ ...row("a", 10, at(900)), windowStartedAt: idle }] });
  });

  it("counts a bucket named twice once, and orders buckets by key", () => {
    expect(uniqueAuthThrottleBuckets([bucket("b"), bucket("a"), bucket("b")]).map((b) => b.key)).toEqual(["a", "b"]);
    const plan = planAuthThrottleTake([bucket("a"), bucket("a")], [], NOW);
    expect(plan).toEqual({ allowed: true, charged: [row("a", 1, null)] });
  });
});

describe("settling an attempt", () => {
  it("clears the bucket on success", () => {
    expect(settleAuthThrottleRow(row("a", 7, at(120)), "success", at(5)))
      .toEqual({ bucketKey: "a", failures: 0, windowStartedAt: at(5), nextAllowedAt: null, updatedAt: at(5) });
  });

  it("gives back a void attempt's count and the wait it started", () => {
    expect(settleAuthThrottleRow(row("a", 5, at(30)), "void", at(1))).toEqual({ ...row("a", 4, null), updatedAt: at(1) });
    expect(settleAuthThrottleRow(row("a", 0, null), "void", at(1)).failures).toBe(0);
  });
});

describe("bucket keys", () => {
  it("hold no email, and treat capitals and spaces as the same email", () => {
    const key = signInAccountBucket("merchant", "Owner@Example.test").key;
    expect(key).toMatch(/^signin-account:[0-9a-f]{64}$/);
    expect(key).not.toMatch(/owner|example/i);
    expect(signInAccountBucket("merchant", " owner@example.TEST ").key).toBe(key);
  });

  it("keep sign-in, admin sign-in, reset requests and password changes apart", () => {
    const keys = [
      signInAccountBucket("merchant", "a@example.test").key,
      signInAccountBucket("admin", "a@example.test").key,
      passwordResetBucket("a@example.test").key,
      signInDeviceBucket("merchant", "a@example.test", "d".repeat(22)).key,
      passwordChangeBucket(7).key,
    ];
    expect(new Set(keys).size).toBe(5);
    expect(new Set(keys.map((key) => key.split(":")[1])).size).toBe(5);
    expect(passwordChangeBucket(7).key).toBe(passwordChangeBucket(7).key);
    expect(passwordChangeBucket(7).key).not.toBe(passwordChangeBucket(8).key);
  });

  it("give each known device its own bucket, all under one prefix per email", () => {
    const prefix = signInDeviceKeyPrefix("merchant", "a@example.test");
    const phone = signInDeviceBucket("merchant", "A@example.test", "p".repeat(22)).key;
    const laptop = signInDeviceBucket("merchant", "a@example.test", "l".repeat(22)).key;
    expect(phone).not.toBe(laptop);
    expect(phone.startsWith(prefix) && laptop.startsWith(prefix)).toBe(true);
    expect(signInDeviceBucket("merchant", "b@example.test", "p".repeat(22)).key.startsWith(prefix)).toBe(false);
    expect(signInDeviceBucket("admin", "a@example.test", "p".repeat(22)).key.startsWith(prefix)).toBe(false);
  });
});

describe("the refusal", () => {
  it("rounds the wait up to whole seconds, never zero", () => {
    expect([1, 999, 1_000, 29_001].map(retryAfterSeconds)).toEqual([1, 1, 1, 30]);
    expect(retryAfterSeconds(0)).toBe(1);
  });

  it("says the wait in words", () => {
    expect([1, 30, 59, 60, 61, 300, 900].map(waitInWords))
      .toEqual(["1 second", "30 seconds", "59 seconds", "1 minute", "2 minutes", "5 minutes", "15 minutes"]);
    expect(tooManyAttempts(60_000, "sign-in")).toEqual({
      retryAfterSeconds: 60,
      body: { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please try again in 1 minute.", retryAfterSeconds: 60 },
    });
    expect(tooManyAttempts(299_500, "password-reset").body.message)
      .toBe("Too many password reset requests. Please try again in 5 minutes.");
  });
});

describe("the known-device mark", () => {
  it("is minted on a first success, and vouches only for that email in that realm", () => {
    const mark = parseSignInDevice(deviceMarkAfterSuccess(null, "merchant", "Owner@example.test"));
    expect(mark).not.toBeNull();
    expect(deviceKnowsEmail(mark, "merchant", "owner@example.test")).toBe(true);
    expect(deviceKnowsEmail(mark, "merchant", "other@example.test")).toBe(false);
    expect(deviceKnowsEmail(mark, "admin", "owner@example.test")).toBe(false);
    expect(signInBucketFor("merchant", "owner@example.test", mark).key)
      .toBe(signInDeviceBucket("merchant", "owner@example.test", mark!.id).key);
    expect(signInBucketFor("merchant", "other@example.test", mark).key)
      .toBe(signInAccountBucket("merchant", "other@example.test").key);
  });

  it("does not vouch when its tag is moved to another device id", () => {
    const mark = parseSignInDevice(deviceMarkAfterSuccess(null, "merchant", "owner@example.test"))!;
    expect(deviceKnowsEmail({ id: "x".repeat(22), tags: mark.tags }, "merchant", "owner@example.test")).toBe(false);
  });

  it("keeps the device id and up to five emails, the latest first", () => {
    let value = deviceMarkAfterSuccess(null, "merchant", "e0@example.test");
    const id = parseSignInDevice(value)!.id;
    for (let i = 1; i <= 6; i += 1) value = deviceMarkAfterSuccess(parseSignInDevice(value), "merchant", `e${i}@example.test`);
    const mark = parseSignInDevice(value)!;
    expect(mark.id).toBe(id);
    expect(mark.tags).toHaveLength(5);
    expect(deviceKnowsEmail(mark, "merchant", "e6@example.test")).toBe(true);
    expect(deviceKnowsEmail(mark, "merchant", "e2@example.test")).toBe(true);
    expect(deviceKnowsEmail(mark, "merchant", "e1@example.test")).toBe(false);
    const again = parseSignInDevice(deviceMarkAfterSuccess(mark, "merchant", "e2@example.test"))!;
    expect(again.tags).toHaveLength(5);
    expect(deviceKnowsEmail(again, "merchant", "e2@example.test")).toBe(true);
  });

  it("is refused unless it has exactly the shape this server writes", () => {
    const good = deviceMarkAfterSuccess(null, "merchant", "owner@example.test");
    const [, id, tag] = good.split(".");
    for (const value of [undefined, "", "2." + good.slice(2), `1.${id}`.slice(0, -1), `1.${id}.${tag}.${"*".repeat(22)}`,
      `1.${id}.${Array(6).fill(tag).join(".")}`, `${good}.`, "1." + "a".repeat(300)]) {
      expect(parseSignInDevice(value)).toBeNull();
    }
    expect(parseSignInDevice(`1.${id}`)).toEqual({ id, tags: [] });
  });

  it("is an HttpOnly, same-site cookie, Secure and __Secure- only on https, one per realm", () => {
    expect(signInDeviceCookie("merchant", "https://taptpay.co.nz")).toEqual({
      realm: "merchant",
      name: "__Secure-taptpay-signin-device",
      options: { httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth", maxAge: 180 * 24 * 60 * 60_000 },
    });
    const admin = signInDeviceCookie("admin", "http://localhost:5000");
    expect(admin.name).toBe("taptpay-admin-signin-device");
    expect(admin.options).toMatchObject({ secure: false, path: "/api/admin/auth", sameSite: "strict", httpOnly: true });
  });
});
