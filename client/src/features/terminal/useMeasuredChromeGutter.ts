import { useLayoutEffect, type RefObject } from "react";

type ChromeKind = "fab" | "bar" | null;

/**
 * Publishes the realised height of the visible home-screen chrome locally on
 * that home screen. The layout phase can consume `--chrome-gutter` without a
 * viewport-wide constant or coupling the screen components to overlay refs.
 */
export function useMeasuredChromeGutter(
  viewportRef: RefObject<HTMLElement>,
  chromeKind: ChromeKind,
) {
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const homeScreens = viewport.querySelectorAll<HTMLElement>(
      ".tp-layer:not(.leaving) .tp-screen.tp-home",
    );
    const homeScreen = homeScreens.item(homeScreens.length - 1);
    if (!homeScreen || !chromeKind) {
      homeScreen?.style.removeProperty("--chrome-gutter");
      return;
    }

    const hero = homeScreen.querySelector<HTMLElement>(".tp-home-hero");
    const chrome = [...viewport.querySelectorAll<HTMLElement>(".tp-pfab.show, .tp-psubbar.show")];
    if (!chrome.length || !hero) {
      homeScreen.style.removeProperty("--chrome-gutter");
      return;
    }

    /* Both writes resize what is being observed: --chrome-gutter IS grid row 2,
       so changing it re-solves rows 1 and 3, and row 1 is the hero this hook
       observes. While row 3 had slack the hero absorbed nothing and the loop
       never showed; once the 40/60 split put row 3 on its minimum, every gutter
       write moved the hero and Chromium started reporting "ResizeObserver loop
       completed with undelivered notifications" on the three smallest cells —
       which the Replit runtime-error plugin renders as a full-screen overlay,
       taking every tap target on the page with it.

       Same coalescing as use-keyboard-inset.ts: one write per frame, out of the
       observation cycle, and no write at all when the value has not moved, so
       the loop settles instead of ping-ponging. Sub-pixel changes are skipped —
       the tokens they feed are compared at 0.5px by the gates. */
    /* How far one overlay reaches PAST the seam, measured without reading the
       hero. Each overlay is positioned `top: var(--home-hero-h)`, so its
       untransformed top edge is the hero's bottom edge and its reach is its own
       height plus whatever its transform pushes it down by.

       The obvious formula — `chromeBottom - heroBottom` — looks equivalent and
       is not: the chrome's `top` resolves against the --home-hero-h this hook
       published on an EARLIER frame, so it lags the hero it is being compared
       against, and the gutter it produces changes the grid, which changes the
       hero again. Coalescing the writes stopped that reporting an error but not
       converging on the wrong answer: property at 390x844 settled on a 128px
       gutter against a 106px bar, then on 70px — 36px too short, which puts the
       action bar over the stack header. Both terms agree exactly once settled
       (verified on all three verticals at 320, 390 and 430); only this one
       cannot drift, because the hero is not in it. */
    const reachPastSeam = (element: HTMLElement): number => {
      const { height } = element.getBoundingClientRect();
      const transform = getComputedStyle(element).transform;
      if (!transform || transform === "none") return height;
      let translateY = 0;
      try {
        translateY = new DOMMatrixReadOnly(transform).f;
      } catch {
        return height;
      }
      return height + Math.max(0, translateY);
    };

    let lastGutter = "";
    let lastHeroH = "";
    let frame = 0;
    let pending = false;
    const publish = () => {
      pending = false;
      const heroRect = hero.getBoundingClientRect();
      const height = Math.max(0, ...chrome.map(reachPastSeam));
      if (height > 0) {
        const next = `${Math.round(height * 100) / 100}px`;
        if (next !== lastGutter) {
          lastGutter = next;
          homeScreen.style.setProperty("--chrome-gutter", next);
        }
      }
      const heroHeight = heroRect.height;
      if (heroHeight > 0) {
        const next = `${Math.round(heroHeight * 100) / 100}px`;
        if (next !== lastHeroH) {
          lastHeroH = next;
          viewport.style.setProperty("--home-hero-h", next);
        }
      }
    };

    const schedule = () => {
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(publish);
    };

    publish();
    const observer = new ResizeObserver(schedule);
    chrome.forEach(element => observer.observe(element));
    observer.observe(hero);

    /* The gutter is measured from the chrome's *position* (its bottom against
       the hero's), but the chrome arrives by sliding into place on a transform
       — and a transform changes no box's size, so ResizeObserver never fires
       for it. Mounting mid-slide therefore published one wrong number and kept
       it: on the retail home screen after a sale that pinned --chrome-gutter at
       563px against a resting 106px, which pushed the whole 233px active stack
       past the viewport bottom, where the screen's overflow:hidden amputated it
       and left the stack's expand control unreachable under the dock (§4.2
       clause 2). Re-measuring when the movement ends is what was missing. */
    const settle = () => schedule();
    for (const element of [...chrome, hero]) {
      element.addEventListener("transitionend", settle);
      element.addEventListener("animationend", settle);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      for (const element of [...chrome, hero]) {
        element.removeEventListener("transitionend", settle);
        element.removeEventListener("animationend", settle);
      }
      viewport.style.removeProperty("--home-hero-h");
    };
  }, [viewportRef, chromeKind]);
}
