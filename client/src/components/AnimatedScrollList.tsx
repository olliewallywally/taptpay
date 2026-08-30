import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { motion, useInView, useReducedMotion, type HTMLMotionProps } from "motion/react";

const RESTING = { scale: 1, opacity: 1 };
const POPPED_OUT = { scale: 0.7, opacity: 0 };

/**
 * One row of an `AnimatedScrollList`. Pops between `{scale:0.7, opacity:0}`
 * and `{scale:1, opacity:1}` as it crosses the scroll viewport — ported from
 * the reference "AnimatedList" component's `AnimatedItem` onto this app's own
 * row markup, at Oliver's explicit call to keep the literal pop rather than
 * tone it down to this app's usual fade/rise (see
 * `docs/PLAN-2026-08-15-motion-toning.md` §9, which this deliberately
 * re-opens for the property lists only — 2026-08-30).
 *
 * `once:false` is the other deliberate bit: it replays every time a row
 * scrolls back into view, not just on first mount.
 *
 * `as="div"` exists because the mobile active-stack rows are `<div>`s, not
 * buttons. Rendering a `motion.button` there would nest a button inside the
 * row's own interactive children.
 *
 * `useReducedMotion` bypasses the pop for anyone with the OS preference set —
 * Motion's animations are inline styles, so they are untouched by the
 * `prefers-reduced-motion` CSS blocks in `index.css` / `desktop.css` and need
 * this explicit check instead.
 *
 * **Trap:** a row that also carries a CSS `animation: … both` (the mobile
 * rows used to) will beat these inline transforms in the cascade and pin the
 * row at the keyframe's value. Remove the CSS animation when adopting this.
 */
type AnimatedListRowProps = (
  | ({ as?: "button" } & HTMLMotionProps<"button">)
  | ({ as: "div" } & HTMLMotionProps<"div">)
) & { children?: ReactNode };

export function AnimatedListRow({ as = "button", children, ...props }: AnimatedListRowProps) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.5, once: false });
  const reducedMotion = useReducedMotion();
  const Component = as === "div" ? motion.div : motion.button;
  return (
    <Component
      {...(props as any)}
      ref={ref as any}
      initial={reducedMotion ? RESTING : POPPED_OUT}
      animate={reducedMotion || inView ? RESTING : POPPED_OUT}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.2, delay: 0.1 }}
    >
      {children}
    </Component>
  );
}

interface AnimatedScrollListProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** The actual scrolling element, for a caller that already reads
   * `scrollTop`/`offsetTop` off it elsewhere (property-terminal's
   * row-anchored popover reads `rowsRef` this way). */
  scrollRef?: MutableRefObject<HTMLDivElement | null>;
  /** The outer, position:relative wrapper this component renders. Only
   * needed when a caller must compensate an offset measured against it —
   * see desktop property-terminal.tsx's `toggleRowMenu`. */
  wrapperRef?: MutableRefObject<HTMLDivElement | null>;
  /** Colour the top/bottom scroll cues fade from. Must match whatever the
   * rows actually sit on, which differs per surface (navy desktop canvas,
   * white mobile stack card, navy mobile panel). */
  fadeColor?: string;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
}

/**
 * Scrollable list shell: top/bottom fade cues that track scroll position,
 * plus arrow-key roving focus between `[data-scroll-nav-item]` rows with
 * scroll-into-view — the reference component's container, adapted to this
 * app's own row markup rather than its box design.
 *
 * The keydown handler is deliberately scoped to this container, not a
 * `window` listener like the reference: these lists all sit next to a search
 * input, and a global listener would steal its arrow keys and break normal
 * cursor movement there.
 *
 * Only for lists that scroll in their *own* container. A page-level list (the
 * mobile tenant directory) needs no shell at all — use `AnimatedListRow`
 * alone and let `useInView` observe the viewport.
 */
export function AnimatedScrollList({
  children,
  className,
  style,
  scrollRef,
  wrapperRef,
  fadeColor,
  showGradients = true,
  enableArrowNavigation = true,
}: AnimatedScrollListProps) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [topOpacity, setTopOpacity] = useState(0);
  const [bottomOpacity, setBottomOpacity] = useState(0);

  const setInnerRef = useCallback(
    (node: HTMLDivElement | null) => {
      innerRef.current = node;
      if (scrollRef) scrollRef.current = node;
    },
    [scrollRef],
  );

  const measure = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setTopOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
  }, []);

  /* No dependency array: re-measure after every render, since search/filter
     can change row count — and therefore overflow — without a scroll event. */
  useLayoutEffect(() => {
    measure();
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!enableArrowNavigation) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const container = innerRef.current;
    if (!container) return;
    const items = Array.from(
      container.querySelectorAll<HTMLElement>("[data-scroll-nav-item]"),
    );
    if (items.length === 0) return;
    e.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      currentIndex === -1
        ? 0
        : e.key === "ArrowDown"
          ? Math.min(currentIndex + 1, items.length - 1)
          : Math.max(currentIndex - 1, 0);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    items[nextIndex].focus();
    items[nextIndex].scrollIntoView({
      block: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  const fadeVar = fadeColor
    ? ({ "--list-fade-color": fadeColor } as CSSProperties)
    : undefined;

  return (
    <div className="dt-scroll-wrap" ref={wrapperRef} style={fadeVar}>
      <div
        ref={setInnerRef}
        className={className}
        style={style}
        onScroll={measure}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
      {showGradients && (
        <>
          <div
            className="dt-scroll-gradient dt-scroll-gradient-top"
            style={{ opacity: topOpacity }}
            aria-hidden="true"
          />
          <div
            className="dt-scroll-gradient dt-scroll-gradient-bottom"
            style={{ opacity: bottomOpacity }}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
