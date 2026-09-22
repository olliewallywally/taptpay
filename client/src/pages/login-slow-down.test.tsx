/*
 * R1-T4 phase C. The server now slows repeated wrong passwords down instead of
 * locking the account, and says how long to wait in words. The page used to show
 * the raw failure text — `429: {"code":…}` — so a merchant never saw the wait.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/lib/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));

import Login from "./login";

const fetchMock = global.fetch as jest.Mock;

function answer(status: number, body: unknown) {
  fetchMock.mockResolvedValue({
    ok: false, status, statusText: "", text: async () => JSON.stringify(body), json: async () => body,
  });
}

async function signInWithWrongPassword() {
  window.history.replaceState({}, "", "/login");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Login />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByTestId("input-email"), { target: { value: "owner@example.test" } });
  fireEvent.change(screen.getByTestId("input-password"), { target: { value: "not-the-password" } });
  await act(async () => {
    fireEvent.click(screen.getByTestId("button-login"));
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
});

describe("password sign-in failures on the login page", () => {
  it("tells the merchant how long to wait when attempts are being slowed down", async () => {
    answer(429, {
      code: "TOO_MANY_ATTEMPTS",
      message: "Too many attempts. Please try again in 30 seconds.",
      retryAfterSeconds: 30,
    });
    await signInWithWrongPassword();

    expect(screen.getByText("Too many attempts. Please try again in 30 seconds.")).toBeTruthy();
    expect(screen.queryByText(/429/)).toBeNull();
  });

  it("shows a wrong password in words, not as a status code", async () => {
    answer(401, { message: "Invalid email or password" });
    await signInWithWrongPassword();

    expect(screen.getByText("Invalid email or password")).toBeTruthy();
    expect(screen.queryByText(/401/)).toBeNull();
  });
});
