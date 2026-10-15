import {
  selectSessionLinks,
  validateCallbackAddress,
  validateWindcaveLink,
  windcaveScriptEnv,
} from "../windcave-links";

/**
 * R2-T2 (plan v2.2 §9.2): every provider link is parsed with URL and held to its
 * relation: https only, the one host for the configured mode, the default port, no
 * userinfo, query or fragment, and the documented path for that relation. Callback
 * and notification addresses sent to the provider must be on the exact PUBLIC_ORIGIN.
 * Relations and paths follow Windcave's REST and Hosted Fields pages.
 */

const UAT = "uat" as const;
const PRODUCTION = "production" as const;

describe("validateWindcaveLink", () => {
  it.each([
    ["self", "https://uat.windcave.com/api/v1/sessions/0000120000000000a1b2c3d4e5f60718"],
    ["hpp", "https://uat.windcave.com/pxmi3/F0AD7308SYNTHETIC"],
    ["seamless_hpp", "https://uat.windcave.com/pxmi3/F5A2BEDESYNTHETIC"],
    ["submitCard", "https://uat.windcave.com/pxmi3/F02CBA53SYNTHETIC"],
    ["ajaxSubmitCard", "https://uat.windcave.com/mh/F105F622SYNTHETIC"],
    ["ajaxSubmitApplePay", "https://uat.windcave.com/mh/FBA081BBSYNTHETIC"],
    ["ajaxSubmitGooglePay", "https://uat.windcave.com/mh/FA0F7246SYNTHETIC"],
  ] as const)("accepts a documented %s link on the UAT host", (relation, href) => {
    expect(validateWindcaveLink(href, relation, UAT)).toEqual({ ok: true, href });
  });

  it("accepts the production host in production mode", () => {
    expect(validateWindcaveLink("https://sec.windcave.com/mh/F105F622SYNTHETIC", "ajaxSubmitCard", PRODUCTION))
      .toEqual({ ok: true, href: "https://sec.windcave.com/mh/F105F622SYNTHETIC" });
  });

  it.each([
    ["the production host in UAT", "https://sec.windcave.com/mh/F1", UAT],
    ["the UAT host in production", "https://uat.windcave.com/mh/F1", PRODUCTION],
    ["plain http", "http://uat.windcave.com/mh/F1", UAT],
    ["a lookalike suffix", "https://uat.windcave.com.evil.test/mh/F1", UAT],
    ["a lookalike prefix", "https://eviluat.windcave.com/mh/F1", UAT],
    ["a subdomain", "https://x.uat.windcave.com/mh/F1", UAT],
    ["userinfo", "https://uat.windcave.com@evil.test/mh/F1", UAT],
    ["userinfo on the real host", "https://user:pass@uat.windcave.com/mh/F1", UAT],
    ["a non-default port", "https://uat.windcave.com:8443/mh/F1", UAT],
    ["a query", "https://uat.windcave.com/mh/F1?next=https://evil.test", UAT],
    ["a fragment", "https://uat.windcave.com/mh/F1#x", UAT],
    ["a protocol-relative address", "//uat.windcave.com/mh/F1", UAT],
    ["a relative path", "/mh/F1", UAT],
    ["a backslash trick", "https:\\\\evil.test\\mh\\F1", UAT],
    ["an encoded host trick", "https://evil.test%2F@uat.windcave.com/mh/F1", UAT],
    ["whitespace", " https://uat.windcave.com/mh/F1", UAT],
    ["another scheme", "javascript:alert(1)", UAT],
    ["the wrong path for the relation", "https://uat.windcave.com/pxmi3/F1", UAT],
    ["no token after the path", "https://uat.windcave.com/mh/", UAT],
    ["a deeper path", "https://uat.windcave.com/mh/F1/../../api/v1/transactions", UAT],
  ] as const)("rejects %s", (_label, href, mode) => {
    expect(validateWindcaveLink(href, "ajaxSubmitCard", mode)).toMatchObject({ ok: false });
  });

  it.each([null, undefined, 3, {}, ""])("rejects a non-address value %p", (href) => {
    expect(validateWindcaveLink(href, "hpp", UAT)).toMatchObject({ ok: false });
  });

  it("rejects an unknown relation", () => {
    expect(validateWindcaveLink("https://uat.windcave.com/pxmi3/F1", "paymentMethod:paypal" as never, UAT)).toMatchObject({ ok: false });
  });

  it("requires a session ID after the sessions path for self", () => {
    expect(validateWindcaveLink("https://uat.windcave.com/api/v1/sessions/", "self", UAT)).toMatchObject({ ok: false });
    expect(validateWindcaveLink("https://uat.windcave.com/api/v1/transactions/1", "self", UAT)).toMatchObject({ ok: false });
  });
});

describe("selectSessionLinks", () => {
  it("takes each relation it uses only when its link is valid, and counts the rest", () => {
    const selected = selectSessionLinks([
      { rel: "self", href: "https://uat.windcave.com/api/v1/sessions/S1", method: "GET" },
      { rel: "hpp", href: "https://uat.windcave.com/pxmi3/F0", method: "REDIRECT" },
      { rel: "ajaxSubmitCard", href: "https://evil.test/mh/F1", method: "AJAX_POST" },
      { rel: "ajaxSubmitGooglePay", href: "https://uat.windcave.com/mh/F3", method: "AJAX_POST" },
      { rel: "paymentMethod:paypal", href: "https://uat.windcave.com/pxmi3/F4", method: "REDIRECT" },
    ], UAT);
    expect(selected).toEqual({
      links: {
        hpp: "https://uat.windcave.com/pxmi3/F0",
        ajaxSubmitGooglePay: "https://uat.windcave.com/mh/F3",
      },
      rejected: 1,
    });
  });

  it("never treats another REDIRECT relation as the hosted page", () => {
    const selected = selectSessionLinks([
      { rel: "paymentMethod:paypal", href: "https://uat.windcave.com/pxmi3/F4", method: "REDIRECT" },
      { rel: "seamless_hpp", href: "https://uat.windcave.com/pxmi3/F5", method: "REDIRECT" },
    ], UAT);
    expect(selected.links.hpp).toBeUndefined();
  });

  it("rejects a relation given twice rather than choosing one", () => {
    const selected = selectSessionLinks([
      { rel: "hpp", href: "https://uat.windcave.com/pxmi3/F0", method: "REDIRECT" },
      { rel: "hpp", href: "https://uat.windcave.com/pxmi3/F9", method: "REDIRECT" },
    ], UAT);
    expect(selected).toEqual({ links: {}, rejected: 2 });
  });
});

describe("validateCallbackAddress", () => {
  const origin = "https://app.example.test";

  it.each([
    ["the retail return", "https://app.example.test/api/pay/return/state?source=hpp", true],
    ["the checkout callback", "https://app.example.test/api/checkout/callback?token=t", true],
    ["a notification address", "https://app.example.test/api/windcave/notification", false],
  ] as const)("accepts %s on the exact origin", (_label, address, needsQuery) => {
    expect(validateCallbackAddress(address, origin, { needsQuery })).toBe(true);
  });

  it.each([
    ["another host", "https://evil.test/api/windcave/notification"],
    ["a lookalike host", "https://app.example.test.evil.test/api/windcave/notification"],
    ["plain http", "http://app.example.test/api/windcave/notification"],
    ["another port", "https://app.example.test:8443/api/windcave/notification"],
    ["userinfo", "https://x@app.example.test/api/windcave/notification"],
    ["a fragment", "https://app.example.test/api/windcave/notification#x"],
    ["no address", ""],
  ])("rejects %s", (_label, address) => {
    expect(validateCallbackAddress(address, origin, { needsQuery: false })).toBe(false);
  });

  it("requires a query on a callback base, since the result is appended with &", () => {
    expect(validateCallbackAddress("https://app.example.test/api/windcave/callback", origin, { needsQuery: true })).toBe(false);
  });

  it("rejects everything when no public origin is configured", () => {
    expect(validateCallbackAddress("https://app.example.test/api/windcave/notification", undefined, { needsQuery: false })).toBe(false);
  });
});

describe("windcaveScriptEnv", () => {
  it("names the production script host only in production mode", () => {
    expect(windcaveScriptEnv("production")).toBe("sec");
    expect(windcaveScriptEnv("uat")).toBe("uat");
    expect(windcaveScriptEnv("disabled")).toBe("uat");
    expect(windcaveScriptEnv("simulation")).toBe("uat");
  });
});
