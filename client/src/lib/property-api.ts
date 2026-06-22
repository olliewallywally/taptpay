// Shared fetch helpers for the property-management pages.
//
// propHeaders() attaches the bearer token. propFetch() additionally catches a
// 401 (session expired mid-use) and bounces to /login with a returnTo, so the
// user is sent to re-authenticate instead of staring at a silently-empty screen.

export function propHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let redirecting = false;

export async function propFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), ...propHeaders() } });
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
