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
