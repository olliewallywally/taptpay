/**
 * R1-T10 — one spelling for every API address. A page names a route by its registration and this
 * fills its path:
 *
 *   apiPath("GET /api/merchants/:id/profile", { id: merchantId })   →  "/api/merchants/22/profile"
 *   apiRequest(...apiTo("PUT /api/merchants/:id/theme", { id }), body)
 *
 * The names it accepts are the server's own registrations (shared/api-routes.ts, generated, types
 * only), each with the type of every parameter of its path: a route the server does not have, a
 * parameter left out, or a text id where the server reads a whole number does not typecheck.
 *
 * It never throws, so an address may be worked out anywhere, including while a page is being drawn.
 * It writes into the path only what the server could read as that parameter: a positive whole number,
 * or text, percent-encoded into exactly one segment. Anything else (a value the page does not have
 * yet, zero, a fraction, NaN, empty text) leaves the parameter's own name there
 * ("/api/merchants/:id/profile"), which the server refuses just as it refused "undefined" or "NaN":
 * a wrong value never becomes the address of something else. Nothing here is imported at run time,
 * so any page may use it.
 */
import type { ApiRouteKey, ApiRouteParams } from "./api-routes";

/**
 * What a route's path needs after its name: nothing, or exactly its own parameters. A value may be
 * one the page does not have yet (null, undefined): its place in the path then keeps its name.
 */
export type ApiPathArgs<K extends ApiRouteKey> = keyof ApiRouteParams[K] extends never
  ? []
  : [params: { [P in keyof ApiRouteParams[K]]: ApiRouteParams[K][P] | null | undefined }];

/**
 * The admin area: an address under it is signed in by the admin's own session, every other by the
 * business's (server/auth.ts, authenticateToken reads the same prefix).
 */
export const ADMIN_API_PREFIX = "/api/admin";

/**
 * Cache labels. A cached entry is named by a list, and where the list's first word is not itself an
 * address it is one of these: ["/api/merchants", id, "analytics"]. Each is the start of its routes'
 * paths, up to the parameter; none is a GET route's whole path, so none can be fetched as it stands
 * (server/__tests__/api-route-contract.test.ts).
 */
export const MERCHANTS_KEY = "/api/merchants";
export const TRANSACTIONS_KEY = "/api/transactions";
export const SPLIT_PAYMENTS_KEY = "/api/split-payments";
export const CHECKOUT_RESOLVE_KEY = "/api/checkout/resolve";
export const QUOTE_TOKEN_KEY = "/api/trades/quotes/token";

const PATH_PARAMETER = /:([A-Za-z][A-Za-z0-9]*)/g;

/** One parameter as a path segment: the value where the server could read it, otherwise its own name. */
function segment(name: string, value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && value !== "") return encodeURIComponent(value);
  return `:${name}`;
}

/** The route's method: the word before the space. */
export function apiMethod(route: ApiRouteKey): string {
  return route.slice(0, route.indexOf(" "));
}

/** The route's address, with each parameter of its path filled in. */
export function apiPath<K extends ApiRouteKey>(route: K, ...args: ApiPathArgs<K>): string {
  const given: unknown = args[0];
  const own = (name: string): unknown =>
    given !== null && given !== undefined && Object.prototype.hasOwnProperty.call(given, name)
      ? (given as Record<string, unknown>)[name]
      : undefined;
  return route.slice(route.indexOf(" ") + 1).replace(PATH_PARAMETER, (_whole, name: string) => segment(name, own(name)));
}

/** The route's method and address together, for a call that takes both: apiRequest(...apiTo(route), body). */
export function apiTo<K extends ApiRouteKey>(route: K, ...args: ApiPathArgs<K>): [method: string, path: string] {
  return [apiMethod(route), apiPath(route, ...args)];
}

/**
 * A whole-number id that reached the page as text (its own address): the number when the text is
 * written exactly as the server reads one ("22"; never "022", "22.0", " 22" or "2e1"), otherwise
 * null, whose place in the path keeps the parameter's name. A number is handed on for apiPath to judge.
 */
export function wholeNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
