import { fireEvent, render, screen } from "@testing-library/react";

let currentLocation = "/dashboard";
const setLocation = jest.fn();

jest.mock("wouter", () => ({
  useLocation: () => [currentLocation, setLocation],
}));

import { BottomNavigation } from "@/components/bottom-navigation";

describe("BottomNavigation production adapter", () => {
  beforeEach(() => {
    currentLocation = "/dashboard";
    setLocation.mockClear();
    localStorage.clear();
  });

  test("keeps trades route selection and navigation in the wrapper", () => {
    currentLocation = "/trades/clients/fixture-client";
    render(<BottomNavigation />);

    expect(screen.getByRole("button", { name: "clients" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: "terminal" }));
    expect(setLocation).toHaveBeenCalledWith("/trades/terminal");
    expect(localStorage.getItem("taptMode")).toBe("trades");
  });

  test("uses the remembered vertical on the shared settings route", () => {
    localStorage.setItem("taptMode", "property");
    currentLocation = "/settings";
    render(<BottomNavigation />);

    expect(screen.getByRole("button", { name: "tenants" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "stock" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("stays absent on public trades quote routes", () => {
    currentLocation = "/trades/quote/public-token";
    render(<BottomNavigation />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
