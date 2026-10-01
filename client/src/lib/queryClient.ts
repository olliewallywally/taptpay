import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { sessionFetch } from "./session";

export const BILLING_CARD_REQUIRED_EVENT = "taptpay:billing-card-required";

/* A 402 means the merchant's subscription has no paid access, card or not
   (server/billing-card.ts): the server says "Your subscription needs attention
   before you can send payments". One banner says so, in these words, with the
   way to Billing (components/notification-system.tsx). */
export const BILLING_REQUIRED_TITLE = "Subscription needs attention";
export const BILLING_REQUIRED_MESSAGE = "You can't send payments until it's sorted in Billing.";

/** What a payment action gets for a 402, after the banner is raised: the banner
    states the required action, so the action shows nothing more (R1-T9: no
    duplicate or conflicting billing messages). */
export class BillingCardRequiredError extends Error {
  /* The server's code for it; also keeps the type distinct from a plain Error. */
  readonly code = "BILLING_CARD_REQUIRED";

  constructor() {
    super(`${BILLING_REQUIRED_TITLE}: ${BILLING_REQUIRED_MESSAGE}`);
    this.name = "BillingCardRequiredError";
  }
}

export function isBillingCardRequired(error: unknown): error is BillingCardRequiredError {
  return error instanceof BillingCardRequiredError;
}

export function notifyIfBillingCardRequired(res: Response): boolean {
  if (res.status !== 402) return false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BILLING_CARD_REQUIRED_EVENT));
  }
  return true;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (notifyIfBillingCardRequired(res)) throw new BillingCardRequiredError();
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * R1-T4 phase E: the sign-in is the session cookie, sent by the browser itself; a change carries the
 * page's CSRF token (lib/session.ts). No token is read from storage or sent in a header.
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }

  const res = await sessionFetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await sessionFetch(queryKey[0] as string);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // 5 minutes: stable data (merchant profile, analytics, stock) won't
      // re-fetch on every component mount; auth-sensitive routes override
      // this with a shorter staleTime where needed.
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
