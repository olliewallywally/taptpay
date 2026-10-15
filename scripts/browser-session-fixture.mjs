import { randomBytes } from "node:crypto";

/* Synthetic layout fixtures only. Real sign-in and server authorization belong
   to verify-r1-t10-device-matrix.ts. Match server/auth-sessions.ts's cookie
   names/flags and App.tsx's startup protocol; keep account tokens out of JS. */
const fixtures = new WeakMap();

export async function installBusinessSessionFixture(page, {
  baseUrl, merchantId, email, signedIn = true, user = {}, errors = [], label = "browser",
}) {
  const origin = new URL(baseUrl).origin;
  const secure = new URL(origin).protocol === "https:";
  const cookieName = secure ? "__Host-taptpay-session" : "taptpay-session";
  const cookieValue = `${randomBytes(16).toString("base64url")}.${randomBytes(32).toString("base64url")}`;
  const expectedUser = {
    id: 1, email, merchantId, role: "owner", onboardingCompleted: true,
    merchantStatus: "active", billingCardReady: true, gstRegistered: false,
    tradeGstMode: "inclusive", ...user,
  };
  const csrfToken = randomBytes(32).toString("base64url");
  const endpoint = (url) => url.origin === origin && url.pathname === "/api/auth/session";
  const newStartup = () => {
    let resolveFirst;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    return { first, resolveFirst, observations: [] };
  };
  const fixture = { current: newStartup(), signedIn, errors, label };
  const requests = new WeakMap();
  fixtures.set(page, fixture);

  // Verification must not send analytics, banner requests or other external
  // traffic. Register before exact local API fixtures so their overrides win.
  // Local requests fall through to the next matching handler/server as before.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.protocol === "data:" || url.protocol === "blob:") return route.fallback();
    const type = route.request().resourceType();
    return route.fulfill({
      status: type === "script" || type === "stylesheet" ? 200 : 204,
      contentType: type === "script" ? "application/javascript" : type === "stylesheet" ? "text/css" : "text/plain",
      headers: { "Access-Control-Allow-Origin": origin }, body: "",
    });
  });

  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      fixture.current = newStartup();
    }
    if (endpoint(new URL(request.url()))) requests.set(request, fixture.current);
  });

  page.on("response", (response) => {
    if (!endpoint(new URL(response.url()))) return;
    const startup = requests.get(response.request()) ?? fixture.current;
    const observation = (async () => {
      let failure = null;
      try {
        if (response.request().method() !== "GET" || response.status() !== 200) {
          throw new Error("startup must be GET with HTTP 200");
        }
        if (await response.request().headerValue("authorization")) throw new Error("startup sent bearer authorization");
        const cookieHeader = await response.request().headerValue("cookie") ?? "";
        const hasCookie = cookieHeader.split(";").some((part) => part.trim() === `${cookieName}=${cookieValue}`);
        if (hasCookie !== signedIn) throw new Error("startup does not carry the expected fixture cookie");
        const actual = await response.json();
        if (signedIn) {
          if (actual?.signedIn !== true || typeof actual.csrfToken !== "string" || !actual.csrfToken) {
            throw new Error("startup has no signed-in user and CSRF token");
          }
          for (const key of ["id", "email", "merchantId", "role", "onboardingCompleted"]) {
            if (actual.user?.[key] !== expectedUser[key]) throw new Error(`startup has wrong or missing ${key}`);
          }
        } else if (actual?.signedIn !== false) {
          throw new Error("public fixture startup is signed in");
        }
      } catch (error) {
        failure = `${label} session fixture: ${error.message}`;
        errors.push(failure);
      }
      return failure;
    })();
    startup.observations.push(observation);
    startup.resolveFirst(observation);
  });

  if (signedIn) await page.context().addCookies([{
    name: cookieName, value: cookieValue, url: `${origin}/`,
    httpOnly: true, secure, sameSite: "Lax",
  }]);
  await page.route(endpoint, async (route) => {
    const request = route.request();
    if (request.method() !== "GET") return route.fulfill({ status: 405, body: "" });
    const cookies = (await request.headerValue("cookie") ?? "").split(";").map((part) => part.trim());
    const hasCookie = signedIn && cookies.includes(`${cookieName}=${cookieValue}`);
    return route.fulfill({
      status: 200, contentType: "application/json", headers: { "Cache-Control": "no-store" },
      body: JSON.stringify(hasCookie ? { signedIn: true, user: expectedUser, csrfToken } : { signedIn: false }),
    });
  });
}

/** Refuse a bad or absent actual startup response before measuring a page. */
export async function assertBusinessSessionFixture(page, { timeoutMs = 10000 } = {}) {
  const fixture = fixtures.get(page);
  if (!fixture) throw new Error("session fixture was not installed on this page");
  const startup = fixture.current;
  let timeout;
  try {
    await Promise.race([
      startup.first,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${fixture.label} session fixture: startup was not observed`)), timeoutMs);
      }),
    ]);
    const failures = (await Promise.all(startup.observations)).filter(Boolean);
    if (failures.length) throw new Error(failures.join("\n"));
  } finally {
    clearTimeout(timeout);
  }
}
