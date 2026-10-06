/**
 * R1-T10a — one spelling for every API address. A page names a route by its registration and this
 * fills its path:
 *
 *   apiPath("GET /api/merchants/:id/profile", { id: merchantId })   →  "/api/merchants/22/profile"
 *   apiRequest(...apiTo("PUT /api/merchants/:id/theme", { id }), body)
 *
 * The names it accepts are the server's own registrations (shared/api-routes.ts, generated, types
 * only), each with the type of every parameter of its path: a route the server does not have, a
 * missing parameter, or a text id where the server reads a whole number does not typecheck.
 *
 * At run time it refuses, instead of building a wrong address: a parameter that is missing or that
 * the path does not have; a number that is not a positive whole number (NaN, zero, a fraction);
 * empty text. A text parameter is written into exactly one path segment. Nothing here is imported at
 * run time, so any page may use it.
 */
import type { ApiRouteKey, ApiRouteParams } from "./api-routes";

/** What a route's path needs after its name: nothing, or exactly its own parameters. */
export type ApiPathArgs<K extends ApiRouteKey> = keyof ApiRouteParams[K] extends never ? [] : [params: ApiRouteParams[K]];

/**
 * The admin area: an address under it is signed in by the admin's own session, every other by the
 * business's (server/auth.ts, authenticateToken reads the same prefix).
 */
export const ADMIN_API_PREFIX = "/api/admin";

const PATH_PARAMETER = /:([A-Za-z][A-Za-z0-9]*)/g;

/** One parameter as a path segment. A refusal names the route and the parameter, never the value. */
function segment(route: string, name: string, value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${route}: "${name}" must be a positive whole number`);
    return String(value);
  }
  if (typeof value === "string" && value !== "") return encodeURIComponent(value);
  throw new Error(`${route} needs "${name}"`);
}

/** The route's method: the word before the space. */
export function apiMethod(route: ApiRouteKey): string {
  return route.slice(0, route.indexOf(" "));
}

/** The route's address, with each parameter of its path filled in. */
export function apiPath<K extends ApiRouteKey>(route: K, ...args: ApiPathArgs<K>): string {
  const given: Record<string, unknown> = { ...(args[0] as object | undefined) };
  const filled = new Set<string>();
  const path = route.slice(route.indexOf(" ") + 1).replace(PATH_PARAMETER, (_whole, name: string) => {
    filled.add(name);
    return segment(route, name, given[name]);
  });
  for (const name of Object.keys(given)) {
    if (!filled.has(name)) throw new Error(`${route} has no "${name}" in its path`);
  }
  return path;
}

/** The route's method and address together, for a call that takes both: apiRequest(...apiTo(route), body). */
export function apiTo<K extends ApiRouteKey>(route: K, ...args: ApiPathArgs<K>): [method: string, path: string] {
  return [apiMethod(route), apiPath(route, ...args)];
}
