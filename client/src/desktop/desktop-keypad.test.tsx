import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DesktopKeypadButton,
  desktopKeypadCents,
  desktopKeypadReducer,
  formatDesktopKeypadMoney,
  type DesktopKeypadKey,
} from "./desktop-keypad";

const enter = (keys: DesktopKeypadKey[]) =>
  keys.reduce(desktopKeypadReducer, "");

describe("shared desktop keypad", () => {
  it("applies the prototype entry and commit rules", () => {
    expect(desktopKeypadReducer("", ".")).toBe("0.");
    expect(desktopKeypadReducer("12.", ".")).toBe("12.");
    expect(desktopKeypadReducer("12", "<")).toBe("1");
    expect(desktopKeypadReducer("", "<")).toBe("");
    expect(desktopKeypadReducer("1234567", "8")).toBe("1234567");

    const committed = enter(["1", "2", ".", "3", "4"]);
    expect(committed).toBe("12.34");
    expect(formatDesktopKeypadMoney(committed)).toBe("$12.34");
    expect(desktopKeypadCents(committed)).toBe(1_234);
  });

  it("centres decorative glyphs while the native buttons retain their names", async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    const { container } = render(
      <div>
        <DesktopKeypadButton keyValue="." className="key" onPress={onPress} />
        <DesktopKeypadButton keyValue="<" className="key" onPress={onPress} />
        <DesktopKeypadButton keyValue="1" className="key" onPress={onPress} />
      </div>,
    );

    const decimalButton = screen.getByRole("button", { name: "decimal point" });
    const backspaceButton = screen.getByRole("button", { name: "backspace" });
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();

    for (const glyph of container.querySelectorAll("[data-desktop-keypad-glyph]")) {
      expect(glyph).toHaveAttribute("aria-hidden", "true");
      expect(glyph).toHaveStyle({
        display: "inline-flex",
        width: "34px",
        height: "24px",
        alignItems: "center",
        justifyContent: "center",
      });
    }
    expect(container.querySelector("[data-desktop-keypad-dot]"))
      .toHaveStyle({ width: "9px", height: "9px", borderRadius: "50%" });
    expect(backspaceButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(backspaceButton.querySelector("svg")).toHaveAttribute("focusable", "false");

    await user.click(decimalButton);
    await user.click(backspaceButton);
    expect(onPress.mock.calls).toEqual([["."], ["<"]]);
  });
});
