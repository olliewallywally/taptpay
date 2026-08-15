/**
 * TEMPORARY review artifact — reproduces the Rules-of-Hooks early-return crash
 * in the merchant pages. Delete after the review.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

jest.mock("@/hooks/use-push-notifications", () => ({
  usePushNotifications: () => ({
    enabled: false, loading: false, supported: false, available: false, toggle: jest.fn(),
  }),
}));
jest.mock("@/hooks/use-billing-card-return", () => ({
  BILLING_CARD_SESSION_KEY: "k",
  useBillingCardReturn: () => ({ confirmingCard: false }),
}));
jest.mock("@/features/tutorial/tutorial", () => ({
  useTutorial: () => ({
    restartTutorials: jest.fn(), visitedPages: [], pageCount: 0,
    isRestarting: false, canRestart: false,
  }),
}));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("wouter", () => ({ useLocation: () => ["/settings", jest.fn()] }));
jest.mock("@/lib/queryClient", () => ({
  apiRequest: jest.fn(async () => ({ ok: true, json: async () => ({}) })),
}));

import Settings from "@/pages/settings";

// A real bearer-shaped token whose payload decodes to { merchantId: 22 }
const payload = Buffer.from(JSON.stringify({ merchantId: 22, role: "owner" })).toString("base64");
const TOKEN = `h.${payload}.s`;

function Harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={client}>
      <Settings />
    </QueryClientProvider>
  );
}

describe("merchant page hook ordering", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, json: async () => ({}),
    })) as any;
  });

  it("Settings crashes on re-render once the auth token is gone", () => {
    localStorage.setItem("authToken", TOKEN);
    const { rerender } = render(<Harness />);

    // Exactly what handleLogout() does at settings.tsx:606, and what a 401
    // credential clear does: the token disappears while the page is mounted.
    localStorage.removeItem("authToken");

    expect(() => rerender(<Harness />)).toThrow(/Rendered fewer hooks than expected/);
  });
});
