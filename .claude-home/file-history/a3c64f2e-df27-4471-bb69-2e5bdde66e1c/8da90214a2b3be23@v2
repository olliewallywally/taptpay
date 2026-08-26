import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

export interface SlidingIndicatorRect {
  x: number;
  width: number;
}

/**
 * Measurement for a single indicator that travels between the items of a
 * container. Shared by the desktop header navigation and the three home range
 * selectors.
 *
 * The hook owns measurement only — never roles or semantics. Navigation stays a
 * <nav> with aria-current="page"; a range selector stays a labelled group whose
 * buttons expose aria-pressed. Forcing those two into one semantic component
 * would misreport one of them to assistive technology.
 *
 * `activeSelector` embeds the active item's id, so it changes whenever the
 * selection does and drives the re-measure by itself. `deps` covers the cases
 * where the item *set* changes while the selection does not (switching
 * vertical keeps page="home" but replaces every nav item).
 */
export function useSlidingIndicator<T extends HTMLElement>(
  activeSelector: string,
  deps: unknown[] = [],
): { containerRef: RefObject<T>; rect: SlidingIndicatorRect | null } {
  const containerRef = useRef<T>(null);
  const [rect, setRect] = useState<SlidingIndicatorRect | null>(null);

  /* Layout effect so the indicator is already in place on first paint, which is
     what keeps the data-ready guard from ever showing a slide in from the
     origin. Re-measured on resize because the canvas scales with the viewport.

     offsetLeft/offsetWidth are pre-scale values relative to the offsetParent, so
     nothing here needs dividing by the canvas scale — unlike
     getBoundingClientRect, which returns post-scale screen pixels. */
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>(activeSelector);
      if (!active) return;
      const next = { x: active.offsetLeft, width: active.offsetWidth };
      setRect((current) =>
        current && current.x === next.x && current.width === next.width
          ? current
          : next,
      );
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    /* Observe the container *and* the active child. A font swap or a label
       change resizes the child without resizing the container, and observing
       only the container leaves the indicator stale under it. */
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const active = container.querySelector<HTMLElement>(activeSelector);
    if (active) observer.observe(active);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSelector, ...deps]);

  return { containerRef, rect };
}

/**
 * The visual half of the primitive. It owns the travel and nothing else — each
 * call site supplies its own vertical placement, colour and duration through
 * `className` and `style`, so the header pill and the range pill stay visually
 * themselves while sharing one motion contract.
 */
export function SlidingIndicator({
  rect,
  className,
  style,
}: {
  rect: SlidingIndicatorRect | null;
  className: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      data-ready={rect ? "true" : "false"}
      aria-hidden="true"
      style={
        rect
          ? ({
              ...style,
              "--slide-x": `${rect.x}px`,
              "--slide-w": `${rect.width}px`,
            } as CSSProperties)
          : style
      }
    />
  );
}
