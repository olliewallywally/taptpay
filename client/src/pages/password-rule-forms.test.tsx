import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { apiRequest } from "@/lib/queryClient";
import CreateMerchant from "./create-merchant";
import ResetPassword from "./reset-password";

// Owner decision 2026-09-23: a new password needs 8+ characters, a capital letter, and a
// number or symbol. The reset form asked for 6 characters; the admin form's hint said so too.
const RULE = "Use at least 8 characters, including a capital letter and a number or symbol.";

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

function renderPage(page: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

describe("the password reset form", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (url.startsWith("/api/auth/validate-reset-token/") ? { valid: true } : { message: "done" }),
    }));
  });

  const resets = () =>
    (global.fetch as jest.Mock).mock.calls.filter(([url]) => url === "/api/auth/reset-password");

  it("says the rule and sends nothing for a password the old 6-character minimum allowed", async () => {
    const user = userEvent.setup();
    renderPage(<ResetPassword />);

    await user.type(await screen.findByPlaceholderText("Enter new password"), "abcdef");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "abcdef");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByText(RULE)).toBeInTheDocument();
    expect(resets()).toHaveLength(0);
  });

  it("sends a password that meets the rule", async () => {
    const user = userEvent.setup();
    renderPage(<ResetPassword />);

    await user.type(await screen.findByPlaceholderText("Enter new password"), "Password!");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "Password!");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => expect(resets()).toHaveLength(1));
    expect(JSON.parse(resets()[0][1].body)).toEqual(expect.objectContaining({
      token: "reset-token",
      password: "Password!",
    }));
  });
});

describe("the admin's create-merchant form", () => {
  beforeEach(() => jest.clearAllMocks());

  async function fill(password: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Merchant Name"), "Probe Cafe");
    await user.type(screen.getByLabelText("Business Name"), "Probe Cafe Ltd");
    await user.type(screen.getByLabelText("Business Type"), "Cafe");
    await user.type(screen.getByLabelText("Email Address"), "owner@probe.test");
    await user.type(screen.getByLabelText("Phone Number"), "021 555 0100");
    await user.type(screen.getByLabelText("Business Address"), "1 Probe Street, Auckland");
    await user.type(screen.getByLabelText("Password"), password);
    await user.type(screen.getByLabelText("Confirm Password"), password);
    await user.click(screen.getByRole("button", { name: /create merchant/i }));
  }

  it("hints at the rule, not the old 6 characters", () => {
    renderPage(<CreateMerchant />);

    expect(screen.getByLabelText("Password")).toHaveAttribute("placeholder", "8+ characters");
  });

  it("says the rule and sends nothing when the password breaks it", async () => {
    renderPage(<CreateMerchant />);

    await fill("password1");

    expect(await screen.findByText(RULE)).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
