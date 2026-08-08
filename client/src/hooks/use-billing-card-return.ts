import { useEffect, useLayoutEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage, apiErrorStatus } from "@/lib/api-error";
import { apiRequest } from "@/lib/queryClient";

export const BILLING_CARD_SESSION_KEY = "taptpay.cardSession";

type ConfirmResult =
  | { status: "saved" }
  | { status: "pending" }
  | { status: "failed"; message: string; retryable: boolean };

type ConfirmOptions = {
  attempts?: number;
  delayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
  request?: (sessionId: string) => Promise<Response>;
};

const waitFor = (delayMs: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));

/**
 * Windcave can redirect before its session query has reached a terminal state.
 * Retry 202 responses here and keep the browser-held session id until the card
 * is either saved or Windcave returns a terminal rejection.
 */
export async function confirmBillingCardSession(
  sessionId: string,
  options: ConfirmOptions = {},
): Promise<ConfirmResult> {
  const attempts = Math.max(1, options.attempts ?? 6);
  const delayMs = Math.max(0, options.delayMs ?? 750);
  const wait = options.wait ?? waitFor;
  const request = options.request ?? ((id: string) =>
    apiRequest("POST", "/api/billing/card/confirm", { sessionId: id }));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await request(sessionId);
    } catch (error) {
      const status = apiErrorStatus(error);
      return {
        status: "failed",
        message: apiErrorMessage(error, "Could not confirm the card"),
        retryable: status === null || status >= 500,
      };
    }

    const body = await response.json().catch(() => ({}));
    if (response.status === 202) {
      if (attempt === attempts - 1) return { status: "pending" };
      await wait(delayMs * (attempt + 1));
      continue;
    }
    if (!response.ok) {
      return {
        status: "failed",
        message: body?.message || "Could not confirm the card",
        retryable: response.status >= 500,
      };
    }
    return { status: "saved" };
  }

  return { status: "pending" };
}

function readCardReturn(): { present: boolean; outcome: string | null } {
  const params = new URLSearchParams(window.location.search);
  return { present: params.has("card"), outcome: params.get("card") };
}

function scrubCardReturnQuery(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("card");
  url.searchParams.delete("session");
  const query = url.searchParams.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
  );
}

/** Shared phone/tablet/desktop handler for the hosted Windcave return. */
export function useBillingCardReturn(): { confirmingCard: boolean } {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [cardReturn] = useState(readCardReturn);
  const [confirmingCard, setConfirmingCard] = useState(false);

  // Remove processor state from the address bar before the browser paints the
  // settings screen or loads any route-specific subresources.
  useLayoutEffect(() => {
    if (cardReturn.present) scrubCardReturnQuery();
  }, [cardReturn.present]);

  useEffect(() => {
    const sessionId = sessionStorage.getItem(BILLING_CARD_SESSION_KEY);
    if (!cardReturn.present && !sessionId) return;

    if (cardReturn.present && cardReturn.outcome !== "approved") {
      sessionStorage.removeItem(BILLING_CARD_SESSION_KEY);
      if (cardReturn.outcome === "declined") {
        toast({ title: "That card was declined. Please try another.", variant: "destructive" });
      } else if (cardReturn.outcome) {
        toast({ title: "Card setup was not completed." });
      }
      return;
    }

    if (!sessionId) {
      toast({
        title: "Card setup session expired. Please start again.",
        variant: "destructive",
      });
      return;
    }

    let active = true;
    setConfirmingCard(true);
    void confirmBillingCardSession(sessionId).then(async (result) => {
      if (!active) return;
      if (result.status === "saved") {
        sessionStorage.removeItem(BILLING_CARD_SESSION_KEY);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/billing/card"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/subscription"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/subscription/billing-history"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
        ]);
        toast({ title: "Payment method saved" });
      } else if (result.status === "pending") {
        // Keep the session id: reloading Settings safely resumes confirmation.
        toast({ title: "Still confirming your card. Please refresh in a moment." });
      } else {
        if (!result.retryable) sessionStorage.removeItem(BILLING_CARD_SESSION_KEY);
        toast({ title: result.message, variant: "destructive" });
      }
    }).finally(() => {
      if (active) setConfirmingCard(false);
    });

    return () => {
      active = false;
    };
    // This is deliberately a one-shot return handler. Query invalidations do not
    // restart provider confirmation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { confirmingCard };
}
