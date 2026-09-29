/**
 * Which web push endpoints the server will register and send to.
 *
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-5-owner-answers.md, answer 1).
 * The server POSTs to a registered endpoint on every payment event (web-push opens an HTTPS request
 * to whatever host, port and path it names), so an endpoint anywhere else would let a signed-in
 * login point the server at a host of its choosing. Browsers only ever hand out endpoints on their
 * vendor's push service: Google's (Chrome and the other Chromium browsers), Mozilla's (Firefox),
 * Apple's (Safari) and Microsoft's (Edge). The app's iPhones use APNs device tokens instead
 * (`apns://…`), which go only to Apple's fixed host (server/push.ts).
 */
const PUSH_SERVICE_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);
/** Microsoft's Windows Push Notification Services hand out endpoints on per-region subdomains. */
const PUSH_SERVICE_HOST_SUFFIXES = [".notify.windows.com"];

export function isPushServiceEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length === 0) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.port !== "" && url.port !== "443") return false;
  if (url.username !== "" || url.password !== "") return false;
  const host = url.hostname;
  return (
    PUSH_SERVICE_HOSTS.has(host) ||
    PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)
  );
}
