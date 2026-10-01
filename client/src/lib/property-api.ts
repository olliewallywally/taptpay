// Shared fetch helpers for the property-management pages.
//
// propHeaders() attaches the page's CSRF token (R1-T4 phase E: the sign-in is the session cookie, which
// the browser sends itself). propFetch() additionally catches a
// 401 (session expired mid-use) and bounces to /login with a returnTo, so the
// user is sent to re-authenticate instead of staring at a silently-empty screen,
// and turns a billing 402 into BillingCardRequiredError once the banner is raised.
import { BillingCardRequiredError, notifyIfBillingCardRequired } from "./queryClient";
import { businessCsrfHeader, sessionFetch } from "./session";

export function propHeaders(): HeadersInit {
  return businessCsrfHeader();
}

let redirecting = false;

export async function propFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await sessionFetch(url, init);
  if (notifyIfBillingCardRequired(res)) throw new BillingCardRequiredError();
  if (res.status === 401) {
    // Guard so several concurrent queries 401-ing at once don't stack redirects.
    if (!redirecting) {
      redirecting = true;
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?returnTo=${returnTo}`;
    }
    throw new Error('unauthorized');
  }
  return res;
}
