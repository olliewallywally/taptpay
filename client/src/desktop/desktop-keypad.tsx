import type { CSSProperties } from "react";

export const DESKTOP_KEYPAD_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  "0",
  "<",
] as const;

export type DesktopKeypadKey = (typeof DESKTOP_KEYPAD_KEYS)[number];

/** Prototype-compatible keypad entry with a seven-digit ceiling. */
export function desktopKeypadReducer(
  value: string,
  key: DesktopKeypadKey,
): string {
  if (key === "<") return value.slice(0, -1);
  if (key === ".") {
    if (value.includes(".")) return value;
    return value ? `${value}.` : "0.";
  }
  if (value.replace(".", "").length >= 7) return value;
  return value + key;
}

export function desktopKeypadCents(value: string): number {
  return Math.round((Number(value) || 0) * 100);
}

export function formatDesktopKeypadMoney(value: string): string {
  if (!value) return "$0.00";
  const [rawDollars, rawCents] = value.split(".");
  const dollars = (rawDollars || "0").replace(/^0+(?=\d)/, "");
  const formattedDollars = Number(dollars).toLocaleString("en-NZ");
  if (value.includes(".")) {
    return `$${formattedDollars}.${((rawCents || "") + "00").slice(0, 2)}`;
  }
  return `$${formattedDollars}.00`;
}

export function desktopKeypadKeyName(key: DesktopKeypadKey): string {
  if (key === "<") return "backspace";
  if (key === ".") return "decimal point";
  return key;
}

const GLYPH_BOX: CSSProperties = {
  display: "inline-flex",
  width: 34,
  height: 24,
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 0,
};

/** Visual-only glyphs; the containing button owns the accessible name. */
export function DesktopKeypadGlyph({ keyValue }: { keyValue: DesktopKeypadKey }) {
  if (keyValue === ".") {
    return (
      <span
        aria-hidden="true"
        data-desktop-keypad-glyph="decimal"
        style={GLYPH_BOX}
      >
        <span
          data-desktop-keypad-dot="true"
          style={{ display: "block", width: 9, height: 9, borderRadius: "50%", background: "currentColor" }}
        />
      </span>
    );
  }

  if (keyValue === "<") {
    return (
      <span
        aria-hidden="true"
        data-desktop-keypad-glyph="backspace"
        style={GLYPH_BOX}
      >
        <svg
          aria-hidden="true"
          width="34"
          height="24"
          viewBox="0 0 34 24"
          fill="none"
          focusable="false"
          style={{ display: "block" }}
        >
          <path
            d="M11 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H11L2 12l9-9Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="m16 9 8 6m0-6-8 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  return <>{keyValue}</>;
}

export function DesktopKeypadButton({
  keyValue,
  className,
  style,
  onPress,
}: {
  keyValue: DesktopKeypadKey;
  className: string;
  style?: CSSProperties;
  onPress: (key: DesktopKeypadKey) => void;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={desktopKeypadKeyName(keyValue)}
      data-desktop-keypad-key={keyValue}
      style={style}
      onClick={() => onPress(keyValue)}
    >
      <DesktopKeypadGlyph keyValue={keyValue} />
    </button>
  );
}
