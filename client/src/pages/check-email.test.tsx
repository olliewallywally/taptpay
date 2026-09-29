import { fireEvent, render, screen } from "@testing-library/react";

import CheckEmail from "./check-email";

jest.mock("wouter", () => ({
  useLocation: () => ["/check-email", jest.fn()],
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 4):
 * a confirmation link is resent only to the address asked for. Asking by account number let anyone
 * have any waiting application's link sent again by counting; sign-up links here with ?email=, and
 * only old links carry ?id=.
 */
describe("resending the confirmation link from the check-email page", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function openAt(search: string) {
    window.history.replaceState({}, "", `/check-email${search}`);
    render(<CheckEmail />);
  }

  it("asks by the address, even when an old link also carries an account number", async () => {
    openAt("?email=jamie%40harness.test&id=7");

    fireEvent.click(screen.getByRole("button", { name: /resend confirmation email/i }));

    await screen.findByText("Email sent!");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/resend-confirmation");
    expect(JSON.parse(init.body)).toEqual({ email: "jamie@harness.test" });
  });

  it("asks nothing when an old link carries only an account number", async () => {
    openAt("?id=7");

    fireEvent.click(screen.getByRole("button", { name: /resend confirmation email/i }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
