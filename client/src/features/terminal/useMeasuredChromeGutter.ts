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

    const publish = () => {
      const heroRect = hero.getBoundingClientRect();
      const height = Math.max(
        0,
        ...chrome.map(element => element.getBoundingClientRect().bottom - heroRect.bottom),
        ...chrome.map(element => element.getBoundingClientRect().height),
      );
      if (height > 0) homeScreen.style.setProperty("--chrome-gutter", `${height}px`);
      const heroHeight = heroRect.height;
      if (heroHeight > 0) viewport.style.setProperty("--home-hero-h", `${heroHeight}px`);
    };

    publish();
    const observer = new ResizeObserver(publish);
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
    const settle = () => publish();
    for (const element of [...chrome, hero]) {
      element.addEventListener("transitionend", settle);
      element.addEventListener("animationend", settle);
    }

    return () => {
      observer.disconnect();
      for (const element of [...chrome, hero]) {
        element.removeEventListener("transitionend", settle);
        element.removeEventListener("animationend", settle);
      }
      viewport.style.removeProperty("--home-hero-h");
    };
  }, [viewportRef, chromeKind]);
}
