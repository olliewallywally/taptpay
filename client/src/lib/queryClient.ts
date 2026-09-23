import { QueryClient, QueryFunction } from "@tanstack/react-query";

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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  const isAdminRoute = url.startsWith("/api/admin");
  const token = isAdminRoute 
    ? localStorage.getItem("adminAuthToken")
    : localStorage.getItem("authToken");
    
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
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
    const headers: Record<string, string> = {};
    
    const url = queryKey[0] as string;
    const isAdminRoute = url.startsWith("/api/admin");
    const token = isAdminRoute 
      ? localStorage.getItem("adminAuthToken")
      : localStorage.getItem("authToken");
      
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
    });

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
