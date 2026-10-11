import { render, screen } from "@testing-library/react";
import { TaptWordmark } from "./tapt-wordmark";

test("checkout brand has a valid named image role", () => {
  render(<TaptWordmark />);
  expect(screen.getByRole("img", { name: "taptpay" })).toBeVisible();
});

test("custom merchant logo keeps its own accessible name", () => {
  render(<TaptWordmark customLogoUrl="/synthetic-logo.png" />);
  expect(screen.getByRole("img", { name: "Merchant logo" })).toHaveAttribute("src", "/synthetic-logo.png");
  expect(screen.queryByRole("img", { name: "taptpay" })).not.toBeInTheDocument();
});
