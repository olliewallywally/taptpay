import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentType,
} from "react";

import "./segmented-bar.css";

type SegmentedBarIcon = ComponentType<{ sz?: number; c?: string }>;

export interface SegmentedBarItem {
  id: string;
  label: string;
  Icon: SegmentedBarIcon;
}

interface SegmentedBarProps {
  items: SegmentedBarItem[];
  activeIdx?: number;
  onPick?: (index: number) => void;
  compact?: boolean;
  hideLabel?: boolean;
  activeColor: string;
  inactiveColor: string;
  demoIdPrefix: string;
  iconSize?: number;
}

export function SegmentedBar({
  items,
  activeIdx = -1,
  onPick,
  compact = false,
  hideLabel = false,
  activeColor,
  inactiveColor,
  demoIdPrefix,
  iconSize = 18,
}: SegmentedBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const previousLeftRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number>();

  const measure = useCallback((animate: boolean) => {
    const track = trackRef.current;
    const indicator = indicatorRef.current;
    const activeButton = buttonRefs.current[activeIdx];
    if (!track || !indicator || !activeButton || activeIdx < 0) {
      previousLeftRef.current = null;
      return;
    }

    // The grid owns the indicator's final size and column. Measurement is only
    // used for a FLIP transform, so resize and late font loads cannot leave
    // stale pixel geometry behind.
    const nextLeft = activeButton.offsetLeft;
    const previousLeft = previousLeftRef.current;
    previousLeftRef.current = nextLeft;
    indicator.style.setProperty("--bar-slide-x", "0px");

    if (!animate || previousLeft === null || previousLeft === nextLeft) return;
    indicator.classList.remove("animate");
    indicator.style.setProperty("--bar-slide-x", `${previousLeft - nextLeft}px`);
    void indicator.offsetWidth;
    indicator.classList.add("animate");
    cancelAnimationFrame(animationFrameRef.current ?? 0);
    animationFrameRef.current = requestAnimationFrame(() => {
      indicator.style.setProperty("--bar-slide-x", "0px");
    });
  }, [activeIdx]);

  useLayoutEffect(() => {
    measure(true);
  }, [measure, compact, hideLabel, items]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new ResizeObserver(() => measure(false));
    observer.observe(track);
    buttonRefs.current.forEach((button) => button && observer.observe(button));

    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure(false);
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(animationFrameRef.current ?? 0);
    };
  }, [items, measure]);

  const activeColumn = activeIdx >= 0 ? activeIdx + 1 : 1;

  return (
    <div className="tp-subbar-wrap">
      <div
        className={`tp-subbar tp-bar${compact ? " compact" : ""}`}
        ref={trackRef}
        style={{ "--active-col": activeColumn } as React.CSSProperties}
      >
        <div
          ref={indicatorRef}
          className={`tp-subbar-ind tp-bar-ind${activeIdx >= 0 ? " on" : ""}`}
          aria-hidden="true"
        />
        {items.map(({ id, label, Icon }, index) => {
          const active = activeIdx === index;
          return (
            <button
              key={id}
              ref={(element) => { buttonRefs.current[index] = element; }}
              className={`tp-subbar-btn tp-bar-btn tap-target${active ? " active" : ""}`}
              style={{ gridColumn: index + 1 }}
              onClick={() => onPick?.(index)}
              aria-label={label}
              aria-pressed={active}
              data-demo-id={`${demoIdPrefix}-${id}`}
            >
              <Icon sz={iconSize} c={active ? activeColor : inactiveColor} />
              <span className={`tp-bar-label-track${active && !hideLabel ? " show" : ""}`}>
                <span className="tp-subbar-label">{label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
