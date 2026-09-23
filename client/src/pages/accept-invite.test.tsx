import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AcceptInvite from "./accept-invite";

jest.mock("wouter", () => ({
  useLocation: () => ["/accept-invite", jest.fn()],
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

describe("team invite privacy", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    window.history.replaceState({}, "", "/accept-invite?source=email&token=secret-token#setup");
  });

  it("scrubs the credential from the URL but retains it for the acceptance POST", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ message: "ready" }),
    });

    const { container } = render(<AcceptInvite />);

    expect(window.location.pathname).toBe("/accept-invite");
    expect(window.location.search).toBe("?source=email");
    expect(window.location.hash).toBe("#setup");
    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

    fireEvent.change(container.querySelector('input[name="password"]')!, {
      target: { value: "StrongPass1" },
    });
    fireEvent.change(container.querySelector('input[name="confirmPassword"]')!, {
      target: { value: "StrongPass1" },
    });
    fireEvent.click(screen.getByTestId("accept-invite-submit"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      token: "secret-token",
      password: "StrongPass1",
      confirmPassword: "StrongPass1",
    }));
    expect(await screen.findByText("Your login is ready")).toBeInTheDocument();
  });
});

// Owner decision 2026-09-23: 8+ characters, a capital letter, and a number or symbol.
describe("team invite password rule", () => {
  const RULE = "Use at least 8 characters, including a capital letter and a number or symbol.";

  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ message: "ready" }) });
    window.history.replaceState({}, "", "/accept-invite?token=secret-token");
  });

  function choose(container: HTMLElement, password: string) {
    fireEvent.change(container.querySelector('input[name="password"]')!, { target: { value: password } });
    fireEvent.change(container.querySelector('input[name="confirmPassword"]')!, { target: { value: password } });
    fireEvent.click(screen.getByTestId("accept-invite-submit"));
  }

  it("says the rule and sends nothing when the password breaks it", async () => {
    const { container } = render(<AcceptInvite />);

    choose(container, "password1");

    expect(await screen.findByText(RULE)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("takes a symbol in place of a number", async () => {
    const { container } = render(<AcceptInvite />);

    choose(container, "Password!");

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Your login is ready")).toBeInTheDocument();
  });
});
