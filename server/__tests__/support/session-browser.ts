/**
 * A browser's view of a sign-in by session cookie (R1-T4 phase E), for the tests that drive the app
 * the way a page does: the HttpOnly cookie the server set, which a response may replace, and the
 * page's CSRF token, sent with every change.
 *
 * MUST be imported only from a test file that imported "./test-env" first (see ./http-harness.ts).
 */
import type { Express } from "express";
import request from "supertest";
import { config } from "../../config";
import { VALID_PASSWORD } from "./http-harness";

export const BUSINESS_COOKIE = "__Host-taptpay-session";
export const ADMIN_COOKIE = "__Host-taptpay-admin-session";

export interface Browser {
  name: string;
  cookie: string;
  csrf: string;
}

/** Every Set-Cookie line of a response, by cookie name. */
export function setCookies(res: request.Response): Map<string, string> {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return new Map((raw ?? []).map((line) => [line.split("=")[0], line]));
}

export const cookieValueOf = (line: string | undefined) => line?.split(";")[0].split("=").slice(1).join("=") ?? "";
export const sessionIdOf = (cookieValue: string) => cookieValue.split(".")[0];
const cleared = (line: string | undefined) => /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(line ?? "");

/**
 * The session a response began (a sign-in, a password change), as the page that got the response sends
 * it from then on: the new cookie, and the CSRF token the response handed the page.
 */
function sessionBegunBy(res: request.Response, name: string): { cookie: string; csrf: string } {
  const line = setCookies(res).get(name);
  if (!line || cleared(line)) throw new Error(`fixture: the response set no ${name} cookie`);
  if (typeof res.body?.csrfToken !== "string") throw new Error("fixture: the response handed the page no CSRF token");
  return { cookie: `${name}=${cookieValueOf(line)}`, csrf: res.body.csrfToken };
}
export const businessSessionBegunBy = (res: request.Response) => sessionBegunBy(res, BUSINESS_COOKIE);
export const adminSessionBegunBy = (res: request.Response) => sessionBegunBy(res, ADMIN_COOKIE);

function follow(browser: Browser, res: request.Response): request.Response {
  const next = setCookies(res).get(browser.name);
  if (next && !cleared(next)) browser.cookie = cookieValueOf(next);
  return res;
}

/** A request as the browser sends it: its cookie, and the page's CSRF token on a change. */
export async function sendAs(
  app: Express,
  browser: Browser,
  method: "get" | "post" | "put" | "patch" | "delete",
  url: string,
  body?: unknown,
): Promise<request.Response> {
  let call = request(app)[method](url).set("Cookie", `${browser.name}=${browser.cookie}`);
  if (method !== "get") call = call.set("X-CSRF-Token", browser.csrf);
  if (body !== undefined) call = call.send(body as object);
  return follow(browser, await call);
}

/** A business login signed in by password, as the sign-in page does it. */
export async function signInBrowser(app: Express, email: string, password = VALID_PASSWORD): Promise<Browser> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`fixture: sign-in answered ${res.status}`);
  const browser: Browser = { name: BUSINESS_COOKIE, cookie: cookieValueOf(setCookies(res).get(BUSINESS_COOKIE)), csrf: "" };
  const started = await sendAs(app, browser, "get", "/api/auth/session");
  if (started.body.signedIn !== true) throw new Error("fixture: the start-up check did not answer the new session");
  browser.csrf = started.body.csrfToken;
  return browser;
}

/** The platform admin signed in to the admin area (the test file sets the admin's password, ./admin-sign-in-test-env.ts). */
export async function signInAdminBrowser(app: Express, password: string): Promise<Browser> {
  const res = await request(app).post("/api/admin/auth/login").send({ email: config.admin.email, password });
  if (res.status !== 200) throw new Error(`fixture: admin sign-in answered ${res.status}`);
  const browser: Browser = { name: ADMIN_COOKIE, cookie: cookieValueOf(setCookies(res).get(ADMIN_COOKIE)), csrf: "" };
  const me = await sendAs(app, browser, "get", "/api/admin/auth/me");
  if (me.status !== 200) throw new Error(`fixture: the admin's start-up check answered ${me.status}`);
  browser.csrf = me.body.csrfToken;
  return browser;
}
