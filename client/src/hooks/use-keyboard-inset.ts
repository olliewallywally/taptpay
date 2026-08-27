import { useEffect } from "react";

/* Amendment A1 §4.1 — the software keyboard can hide fields with no way to
 * reach them.
 *
 * The layout viewport does not shrink when a keyboard opens; the VISUAL
 * viewport does. Every terminal screen shell is `overflow: hidden` inside a
 * fixed-height viewport, so on WebKit there was nothing to scroll and anything
 * under the keyboard was simply unreachable.
 *
 * This publishes what the keyboard covers as `--kb-h` on the document element,
 * next to the dock's `--dock-h`, plus a `data-kb-open` flag. The flag exists
 * because the two engines fail differently:
 *
 *   · WebKit ignores `interactive-widget=resizes-content`, so the layout
 *     viewport keeps its full height and `--kb-h` carries the whole inset;
 *   · Chromium honours it and shrinks the layout viewport instead, so the
 *     inset measures ~0 while the screen really is that much shorter.
 *
 * A number alone would therefore say "no keyboard" on Chromium. The flag is
 * driven by focus, which is true on both.
 */

/** Under this, the shrink is browser chrome collapsing, not a keyboard. */
const KEYBOARD_FLOOR_PX = 120;
const COARSE_POINTER_QUERY = "(pointer: coarse)";

const KB_VAR = "--kb-h";
const KB_FLAG = "data-kb-open";

/* A `<select>` is deliberately absent: its picker is a native overlay that
   leaves the visual viewport alone, so treating it as an open keyboard would
   collapse the hero for nothing. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button", "checkbox", "color", "file", "hidden",
  "image", "radio", "range", "reset", "submit",
]);

type VisualViewportLike = { height: number; offsetTop: number };

/**
 * How much of the layout viewport the keyboard covers, in CSS pixels.
 * `offsetTop` is subtracted because WebKit scrolls the visual viewport within
 * the layout viewport rather than resizing it, and that offset is already
 * accounted for by the browser.
 */
export function keyboardInset(
  layoutHeight: number,
  visual: VisualViewportLike | null,
): number {
  if (!visual) return 0;
  const covered = layoutHeight - visual.height - visual.offsetTop;
  return covered >= KEYBOARD_FLOOR_PX ? Math.round(covered) : 0;
}

/** Whether focusing this element raises a software keyboard. */
export function opensSoftwareKeyboard(element: Element | null): boolean {
  if (!element) return false;
  if ((element as HTMLElement).isContentEditable) return true;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName !== "INPUT") return false;
  const type = (element as HTMLInputElement).type?.toLowerCase() || "text";
  return !NON_TEXT_INPUT_TYPES.has(type);
}

export function useKeyboardInset(): void {
  useEffect(() => {
    const root = document.documentElement;
    const visual = window.visualViewport ?? null;
    const coarsePointer =
      typeof window.matchMedia === "function" ? window.matchMedia(COARSE_POINTER_QUERY) : null;

    let frame = 0;
    let pending = false;
    const publish = () => {
      pending = false;
      const inset = keyboardInset(window.innerHeight, visual);
      root.style.setProperty(KB_VAR, `${inset}px`);
      const open =
        inset > 0 || (!!coarsePointer?.matches && opensSoftwareKeyboard(document.activeElement));
      if (open) root.setAttribute(KB_FLAG, "");
      else root.removeAttribute(KB_FLAG);
    };

    /* `visualViewport` fires resize and scroll on every frame of the keyboard
       animation, and `focusout` runs before the next element has focus — one
       coalesced read per frame answers both. */
    /* The pending flag is set before the request, not after: a callback that
       runs synchronously would otherwise be overwritten by the id assigned on
       its way out, and every later event would be dropped. */
    const schedule = () => {
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(publish);
    };

    publish();
    visual?.addEventListener("resize", schedule);
    visual?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      visual?.removeEventListener("resize", schedule);
      visual?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      root.style.removeProperty(KB_VAR);
      root.removeAttribute(KB_FLAG);
    };
  }, []);
}
