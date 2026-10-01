/**
 * Owner decision 2026-09-26 (answer 2, "Open the boards"): the phone Settings
 * "Customer Payment Page" button opens the boards (the Board Builder, where each
 * printed board's QR and customer page are chosen), not the business-wide page
 * retired on 2026-09-25. Setup as in settings-sign-out-everywhere.test.tsx.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
jest.mock("@/lib/push-device", () => ({ stopThisDevicePush: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
const mockNavigate = jest.fn();
jest.mock("wouter", () => ({ useLocation: () => ["/settings", mockNavigate] }));
jest.mock("@/lib/queryClient", () => ({
  apiRequest: jest.fn(async () => ({ ok: true, json: async () => ({}) })),
}));

import Settings from "@/pages/settings";
import { holdSession, releaseSession } from "@/lib/session";

const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  localStorage.clear();
  // R1-T4 phase E: who is signed in is what the start-up check read, held in memory.
  releaseSession("business");
  holdSession("business", { id: 7, email: "owner@example.test", merchantId: 22, role: "owner" }, "c".repeat(43));
  mockNavigate.mockClear();
  global.fetch = jest.fn(async (url: unknown) => {
    if (url === "/api/merchants/22/profile") return reply({ id: 22, businessName: "Synthetic Merchant 22", status: "active" });
    return reply({});
  }) as any;
});
afterEach(() => jest.restoreAllMocks());

it("opens the boards, never the retired business-wide page", async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <Settings />
    </QueryClientProvider>,
  );
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await userEvent.click(await screen.findByTestId("button-customer-page"));

  expect(mockNavigate).toHaveBeenCalledWith("/board-builder");
  expect(mockNavigate).not.toHaveBeenCalledWith("/pay/22");
});
