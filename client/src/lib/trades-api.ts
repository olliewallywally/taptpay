// Shared fetch helpers for the trades pages — mirrors property-api.ts.
// tradesHeaders() attaches the bearer token. tradesFetch() additionally catches
// a 401 (session expired mid-use) and bounces to /login with a returnTo.
export function tradesHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let redirecting = false;

export async function tradesFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), ...tradesHeaders() } });
  if (res.status === 401) {
    if (!redirecting) {
      redirecting = true;
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?returnTo=${returnTo}`;
    }
    throw new Error('unauthorized');
  }
  return res;
}
