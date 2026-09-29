import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ResetPassword from "./reset-password";

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 4):
 * the reset page tells a check that failed apart from a link that has expired. Since ba1b6742 the
 * server answers a fault while checking with 500, not { valid: false }; the page called both
 * "Expired Reset Link" and sent the user off to ask for another link, which would fail the same way.
 */
jest.mock("wouter", () => ({
  useLocation: () => ["/reset-password", jest.fn()],
  useSearch: () => "token=reset-token",
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/lib/queryClient", () => ({
  apiRequest: jest.fn(),
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const fetchMock = global.fetch as jest.Mock;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResetPassword />
    </QueryClientProvider>,
  );
}

const answer = (ok: boolean, body: unknown) => ({ ok, status: ok ? 200 : 500, json: async () => body });

describe("the reset page's link check", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("calls a link the server says is not valid expired, and offers a new one", async () => {
    fetchMock.mockResolvedValue(answer(true, { valid: false }));

    renderPage();

    expect(await screen.findByText("Expired Reset Link")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request New Reset Link" })).toBeInTheDocument();
    expect(screen.queryByText("We couldn't check this link")).toBeNull();
  });

  it("says it couldn't check the link when the check fails, and checks again on request", async () => {
    fetchMock
      .mockResolvedValueOnce(answer(false, { message: "Failed to validate reset token" }))
      .mockResolvedValueOnce(answer(true, { valid: true }));

    renderPage();

    expect(await screen.findByText("We couldn't check this link")).toBeInTheDocument();
    expect(screen.getByText("Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("Expired Reset Link")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Reset Your Password")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says the same when the check never reaches the server", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    renderPage();

    expect(await screen.findByText("We couldn't check this link")).toBeInTheDocument();
    expect(screen.queryByText("Expired Reset Link")).toBeNull();
  });
});
