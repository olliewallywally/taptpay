import { type RefObject, useEffect } from "react";

const FIT_FLOOR = 0.55;

export function useFitTerminalAmounts(viewportRef: RefObject<HTMLElement>): void {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const amount of viewport.querySelectorAll<HTMLElement>(".tp-amount")) {
          amount.style.setProperty("--fit", "1");
          const available = amount.parentElement?.clientWidth ?? amount.clientWidth;
          const required = amount.scrollWidth;
          const scale = available > 0 && required > available
            ? Math.max(FIT_FLOOR, available / required)
            : 1;
          amount.style.setProperty("--fit", String(scale));
        }
      });
    };

    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(viewport);
    const mutationObserver = new MutationObserver(fit);
    mutationObserver.observe(viewport, { childList: true, subtree: true, characterData: true });
    void document.fonts?.ready.then(fit);
    fit();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [viewportRef]);
}
