import { Fragment, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getCurrentMerchantId } from "@/lib/auth";

/**
 * R1-T8 — resolves the signed-in merchant ABOVE a page.
 *
 * Pages used to read the merchant id and return early ("no merchant: go to
 * login") before most of their hooks. When the session ended while a page was
 * open — logout, or a 401 clearing the stored token — its next render ran fewer
 * hooks and React threw "Rendered fewer hooks than expected". Here the page is
 * never rendered without a merchant, so its hooks always run in the same order.
 * It is keyed by merchant, so a change of account remounts the page instead of
 * carrying one merchant's state into another's.
 *
 * The redirect runs in an effect, once, not during render — and not at all when
 * the app is already on /login: signing out navigates there itself, and the page
 * transition then re-renders the outgoing page.
 */
export function MerchantGate({ children, redirect = "route", fallback = null }: {
  children: (merchantId: number) => ReactNode;
  /** "route": in-app navigation to /login. "document": a full page load of /login. */
  redirect?: "route" | "document";
  /** Shown for the moment before the redirect lands. */
  fallback?: ReactNode;
}) {
  const merchantId = getCurrentMerchantId();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (merchantId || location === "/login") return;
    if (redirect === "document") window.location.href = "/login";
    else setLocation("/login");
  }, [merchantId, location, redirect, setLocation]);

  if (!merchantId) return <>{fallback}</>;
  return <Fragment key={merchantId}>{children(merchantId)}</Fragment>;
}
