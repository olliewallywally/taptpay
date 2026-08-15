import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  TerminalDockView,
  type TerminalDockViewProps,
} from "@/features/navigation/TerminalDockView";

const sourcePath = path.resolve(
  process.cwd(),
  "client/src/features/navigation/TerminalDockView.tsx",
);

const forbidden = [
  /\bwouter\b/,
  /\buseLocation\b/,
  /\blocalStorage\b|\bsessionStorage\b/,
  /\bfetch\s*\(/,
  /\bapiRequest\b/,
  /@tanstack\/react-query/,
  /\bwindow\.(?:location|open|history)\b/,
];

const renderDock = (overrides: Partial<TerminalDockViewProps> = {}) => {
  const onPick = jest.fn();
  render(
    <TerminalDockView
      mode="retail"
      activeId="home"
      onPick={onPick}
      placement="absolute"
      collapseAfterMs={null}
      {...overrides}
    />,
  );
  return onPick;
};

describe("TerminalDockView extraction boundary", () => {
  test("contains no production navigation, storage, or network effect", () => {
    const source = fs.readFileSync(sourcePath, "utf8");
    for (const rule of forbidden) expect(source).not.toMatch(rule);
  });

  test("supports iframe-local absolute placement and delegates the real item", () => {
    const onPick = renderDock();

    expect(screen.getByRole("navigation", { name: "Merchant navigation" })).toHaveStyle({
      position: "absolute",
    });
    expect(screen.getByRole("button", { name: "home" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(screen.getByRole("button", { name: "terminal" }));
    expect(onPick).toHaveBeenCalledWith({ id: "terminal", path: "/terminal" });
  });

  test("renders the vertical-specific directory and palette state", () => {
    renderDock({ mode: "trades", activeId: "clients" });

    expect(screen.getByRole("button", { name: "clients" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("button", { name: "stock" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation")).toHaveAttribute(
      "data-terminal-dock-mode",
      "trades",
    );
  });
});
