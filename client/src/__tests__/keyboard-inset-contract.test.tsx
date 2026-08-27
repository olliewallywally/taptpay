import fs from "fs";
import path from "path";
import { act, renderHook } from "@testing-library/react";
import {
  keyboardInset,
  opensSoftwareKeyboard,
  useKeyboardInset,
} from "../hooks/use-keyboard-inset";

const ROOT = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

/* Amendment A1 §4.1/§4.5 — phase K. The severe half of this is invisible to
   every other gate in the repo: the keyboard is a browser affordance no
   headless run raises, so the contract has to be asserted on the two halves
   separately — the measurement here, the layout that consumes it in
   scripts/verify-mobile-keyboard.mjs. */

describe("keyboardInset", () => {
  test("reports what the keyboard covers when the layout viewport does not shrink", () => {
    /* WebKit: 844 layout, 508 visual — the iPhone case the plan is about. */
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
  });

  test("subtracts the visual viewport's own offset", () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 40 })).toBe(296);
  });

  test("is zero when the layout viewport shrank instead", () => {
    /* Chromium with interactive-widget=resizes-content: both shrink together,
       so there is nothing left for the layout to reserve. */
    expect(keyboardInset(508, { height: 508, offsetTop: 0 })).toBe(0);
  });

  test("ignores a shrink too small to be a keyboard", () => {
    /* A collapsing URL bar is ~60-90px and must not collapse the hero. */
    expect(keyboardInset(844, { height: 760, offsetTop: 0 })).toBe(0);
  });

  test("never goes negative, and is zero with no visual viewport", () => {
    expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, null)).toBe(0);
  });
});

describe("opensSoftwareKeyboard", () => {
  const make = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host.firstElementChild;
  };

  test.each([
    ['<input type="text" />', true],
    ['<input type="email" />', true],
    ["<input />", true],
    ["<textarea></textarea>", true],
    ['<input type="checkbox" />', false],
    ['<input type="radio" />', false],
    ['<input type="range" />', false],
    ['<input type="submit" />', false],
    ['<input type="file" />', false],
    /* A picker is a native overlay: it leaves the visual viewport alone, so
       treating it as an open keyboard would collapse the hero for nothing. */
    ["<select></select>", false],
    ["<button></button>", false],
  ])("%s → %s", (html, expected) => {
    expect(opensSoftwareKeyboard(make(html))).toBe(expected);
  });

  test("nothing focused is not a keyboard", () => {
    expect(opensSoftwareKeyboard(null)).toBe(false);
  });
});

describe("useKeyboardInset", () => {
  const root = document.documentElement;
  const originalInnerHeight = window.innerHeight;
  const originalMatchMedia = window.matchMedia;
  let visual: { height: number; offsetTop: number; listeners: Map<string, Set<() => void>> };
  let coarsePointer: boolean;

  const setLayoutHeight = (value: number) =>
    Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value });

  /* rAF runs synchronously so a test reads the published value on the line
     after the event that caused it. */
  const originalRaf = window.requestAnimationFrame;
  const originalCancelRaf = window.cancelAnimationFrame;

  beforeEach(() => {
    coarsePointer = true;
    visual = { height: 844, offsetTop: 0, listeners: new Map() };
    setLayoutHeight(844);
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      writable: true,
      value: {
        get height() { return visual.height; },
        get offsetTop() { return visual.offsetTop; },
        addEventListener: (type: string, listener: () => void) => {
          if (!visual.listeners.has(type)) visual.listeners.set(type, new Set());
          visual.listeners.get(type)!.add(listener);
        },
        removeEventListener: (type: string, listener: () => void) => {
          visual.listeners.get(type)?.delete(listener);
        },
      },
    });
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)" ? coarsePointer : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    setLayoutHeight(originalInnerHeight);
    window.matchMedia = originalMatchMedia;
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancelRaf;
    root.style.removeProperty("--kb-h");
    root.removeAttribute("data-kb-open");
  });

  const raise = (height: number) => {
    visual.height = height;
    act(() => {
      visual.listeners.get("resize")?.forEach((listener) => listener());
    });
  };

  test("publishes 0px with no keyboard, and the inset when one opens", () => {
    renderHook(() => useKeyboardInset());
    expect(root.style.getPropertyValue("--kb-h")).toBe("0px");
    expect(root.hasAttribute("data-kb-open")).toBe(false);

    raise(508);
    expect(root.style.getPropertyValue("--kb-h")).toBe("336px");
    expect(root.hasAttribute("data-kb-open")).toBe(true);

    raise(844);
    expect(root.style.getPropertyValue("--kb-h")).toBe("0px");
    expect(root.hasAttribute("data-kb-open")).toBe(false);
  });

  test("flags a keyboard from focus alone, which is the Chromium case", () => {
    /* interactive-widget=resizes-content shrinks the layout viewport, so the
       inset stays 0 and a number-only signal would say "no keyboard" on the
       engine where the screen really did get shorter. */
    const field = document.createElement("input");
    document.body.appendChild(field);
    renderHook(() => useKeyboardInset());

    act(() => {
      field.focus();
      field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(root.hasAttribute("data-kb-open")).toBe(true);
    expect(root.style.getPropertyValue("--kb-h")).toBe("0px");

    act(() => {
      field.blur();
      field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(root.hasAttribute("data-kb-open")).toBe(false);
    field.remove();
  });

  test("a focused field on a mouse is not a keyboard", () => {
    coarsePointer = false;
    const field = document.createElement("input");
    document.body.appendChild(field);
    renderHook(() => useKeyboardInset());

    act(() => {
      field.focus();
      field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(root.hasAttribute("data-kb-open")).toBe(false);
    field.remove();
  });

  test("unmounting takes the flag and the token back off the document", () => {
    const { unmount } = renderHook(() => useKeyboardInset());
    raise(508);
    expect(root.hasAttribute("data-kb-open")).toBe(true);

    unmount();
    expect(root.style.getPropertyValue("--kb-h")).toBe("");
    expect(root.hasAttribute("data-kb-open")).toBe(false);
    /* The listeners have to go with it or a later resize writes to a document
       no component owns any more. */
    expect(visual.listeners.get("resize")?.size ?? 0).toBe(0);
    expect(visual.listeners.get("scroll")?.size ?? 0).toBe(0);
  });
});

describe("the layout consumes the inset", () => {
  const tokens = read("features/terminal/terminal-tokens.css");

  test("the panel reserves what the keyboard covers", () => {
    expect(tokens).toContain(
      "padding-bottom: calc(var(--dock-h, 0px) + var(--safe-bottom) + var(--sp-3) + var(--kb-h, 0px))",
    );
  });

  test("a field screen gives the panel the keyboard's height as demand, not padding", () => {
    /* Padding alone leaves 43px of scrollport at 320x568: the hero has to
       yield and the panel's MINIMUM has to grow, or the fix is cosmetic. */
    expect(tokens).toContain(":root[data-kb-open] .tp-viewport .tp-screen.tp-feature");
    expect(tokens).toContain("minmax(calc(var(--panel-min) + var(--kb-h, 0px)), 1fr)");
    expect(tokens).toContain("minmax(0, var(--hero-min))");
    expect(tokens).toContain("overflow: hidden auto");
  });

  test("--kb-h always resolves, and the field floor is on the pointer axis", () => {
    /* Comments stripped: the rules this forbids are described in a comment
       three lines above where they used to live. */
    const base = read("index.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(base).toContain("--kb-h: 0px");
    expect(base).toContain("--field-floor: 0px");
    expect(base).toMatch(/@media \(pointer: coarse\) \{\s*:root \{ --field-floor: 1rem; \}/);
    /* The two blanket overrides A1 §4.4 is about. Neither may come back. */
    expect(base).not.toMatch(/font-size:\s*16px\s*!important/);
    expect(base).not.toMatch(/\*\s*\{[^}]*max-width:\s*100vw/);
  });

  test("the viewport meta allows zoom and hands Chromium the keyboard", () => {
    const html = fs.readFileSync(path.resolve(ROOT, "../index.html"), "utf8");
    const meta = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? "";
    expect(meta).toContain("interactive-widget=resizes-content");
    expect(meta).toContain("viewport-fit=cover");
    /* WCAG 1.4.4: both of these blocked pinch zoom outright. */
    expect(meta).not.toContain("user-scalable=no");
    expect(meta).not.toContain("maximum-scale");
  });
});
