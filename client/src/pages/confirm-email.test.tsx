import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ConfirmEmail from "./confirm-email";

// Owner decision 2026-09-23: the link alone no longer confirms an application; the page
// asks for the password chosen at sign-up and sends it with the link's token.

const setLocation = jest.fn();
jest.mock("wouter", () => ({
  useLocation: () => ["/confirm-email", setLocation],
}));

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockReset();
  window.history.replaceState({}, "", "/confirm-email?token=link-token");
});

function submit(password: string) {
  fireEvent.change(screen.getByLabelText("Your password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm email" }));
}

it("asks for the sign-up password instead of confirming as soon as it opens", () => {
  render(<ConfirmEmail />);

  expect(screen.getByLabelText("Your password")).toHaveAttribute("type", "password");
  expect(global.fetch).not.toHaveBeenCalled();
});

it("sends the link's token with the password, and confirms", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ message: "Email verified" }) });
  render(<ConfirmEmail />);

  submit("Password1!");

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe("/api/auth/confirm-email");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ token: "link-token", password: "Password1!" });
  expect(await screen.findByText("Email confirmed!")).toBeInTheDocument();
});

it("says so when the password is not the one chosen at sign-up, and lets them try again", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    json: async () => ({ code: "WRONG_PASSWORD", message: "That isn't the password chosen when this application was made." }),
  });
  render(<ConfirmEmail />);

  submit("Not-the-password-9");

  expect(await screen.findByText("That isn't the password chosen when this application was made.")).toBeInTheDocument();
  expect(screen.getByLabelText("Your password")).toBeInTheDocument();
});

it("offers a password reset once a password has been refused, for an applicant who has forgotten it", async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    json: async () => ({ code: "WRONG_PASSWORD", message: "That isn't the password chosen when this application was made." }),
  });
  render(<ConfirmEmail />);
  expect(screen.queryByRole("button", { name: "Reset your password" })).not.toBeInTheDocument();

  submit("Not-the-password-9");

  fireEvent.click(await screen.findByRole("button", { name: "Reset your password" }));
  expect(setLocation).toHaveBeenCalledWith("/forgot-password");
});
