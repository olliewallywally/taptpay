import { useLayoutEffect, useRef, type RefObject } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   Shared low-level bucket morph.

   The three home charts keep their own markup, styles and colours — this hook
   never renders a bar. It only measures the outgoing set, drives a FLIP onto the
   incoming one, and owns the retained exit layer. A React key change alone
   cannot do this: changing the bucket count re-flows every remaining bar's x and
   width in the same frame, so without a FLIP the survivors snap.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MorphRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BarSample {
  rect: MorphRect;
  background: string;
  borderRadius: string;
}

interface LabelSample {
  rect: MorphRect;
  text: string;
  color: string;
  font: string;
}

interface Snapshot {
  bars: BarSample[];
  labels: LabelSample[];
  /** Index of the bar button that held focus at snapshot time, if any. */
  focusedIndex: number | null;
}

interface Generation {
  id: number;
  handles: Animation[];
  exitLayer: HTMLElement | null;
}

export interface BucketMorphOptions {
  /** Changes when a new bucket generation should animate — the timeframe id. */
  generation: string;
  /** Selector for the bar element inside each button, e.g. ".rh-bar". */
  barSelector: string;
  /** Selector for the label element inside each button. */
  labelSelector: string;
  /** Selector for each focusable bar button. */
  buttonSelector: string;
  /**
   * Where focus goes when the bar that owned it has no counterpart in the
   * target set — the active timeframe button.
   */
  fallbackFocusSelector: string;
}

const EXIT_LAYER_CLASS = "dt-morph-exit";

/** The canvas is inside `transform: scale(...)`; client rects come back in
 *  post-scale screen pixels. Everything here is expressed in local canvas
 *  pixels, so every measurement is divided by the scale in force. */
function readScale(el: Element): number {
  const scaled = el.closest<HTMLElement>("[data-desktop-scale]");
  const raw = scaled?.dataset.desktopScale;
  const value = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function rectOf(el: Element, origin: DOMRect, scale: number): MorphRect {
  const r = el.getBoundingClientRect();
  return {
    left: (r.left - origin.left) / scale,
    top: (r.top - origin.top) / scale,
    width: r.width / scale,
    height: r.height / scale,
  };
}

/** Samples what is on screen *right now*, including any in-flight animation —
 *  which is what an interrupted generation must rebase from. */
function measure(container: HTMLElement, opts: BucketMorphOptions): Snapshot {
  const origin = container.getBoundingClientRect();
  const scale = readScale(container);

  const bars = Array.from(
    container.querySelectorAll<HTMLElement>(opts.barSelector),
  ).map((el) => {
    const cs = getComputedStyle(el);
    return {
      rect: rectOf(el, origin, scale),
      background: cs.backgroundColor,
      borderRadius: cs.borderRadius,
    };
  });

  const labels = Array.from(
    container.querySelectorAll<HTMLElement>(opts.labelSelector),
  ).map((el) => {
    const cs = getComputedStyle(el);
    return {
      rect: rectOf(el, origin, scale),
      text: el.textContent ?? "",
      color: cs.color,
      font: cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`,
    };
  });

  const buttons = Array.from(
    container.querySelectorAll<HTMLElement>(opts.buttonSelector),
  );
  const focusedIndex = buttons.findIndex((b) => b.contains(document.activeElement));

  return { bars, labels, focusedIndex: focusedIndex < 0 ? null : focusedIndex };
}

/**
 * Builds the retained exit layer.
 *
 * These are synthesized <span>s, never clones of the real bar buttons: a cloned
 * button would put a second focusable, duplicately-labelled control into the
 * page for the length of the transition. The layer is inert, aria-hidden and
 * pointer-events:none, so it is purely a visual residue.
 */
function buildExitLayer(
  snapshot: Snapshot,
  fromIndex: number,
  labelsAll: boolean,
): HTMLElement {
  const layer = document.createElement("div");
  layer.className = EXIT_LAYER_CLASS;
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;

  snapshot.bars.slice(fromIndex).forEach((bar) => {
    const node = document.createElement("span");
    node.style.cssText = [
      "position:absolute",
      `left:${bar.rect.left}px`,
      `top:${bar.rect.top}px`,
      `width:${bar.rect.width}px`,
      `height:${bar.rect.height}px`,
      `background:${bar.background}`,
      `border-radius:${bar.borderRadius}`,
    ].join(";");
    layer.appendChild(node);
  });

  /* The outgoing label layer always leaves in full: a range change relabels
     every bucket, so there is no such thing as a surviving label. */
  const labels = labelsAll ? snapshot.labels : snapshot.labels.slice(fromIndex);
  labels.forEach((label) => {
    const node = document.createElement("span");
    node.textContent = label.text;
    node.style.cssText = [
      "position:absolute",
      `left:${label.rect.left}px`,
      `top:${label.rect.top}px`,
      `width:${label.rect.width}px`,
      "text-align:center",
      "white-space:nowrap",
      `color:${label.color}`,
      `font:${label.font}`,
    ].join(";");
    layer.appendChild(node);
  });

  return layer;
}

export function useBucketMorph<T extends HTMLElement>(
  opts: BucketMorphOptions,
): RefObject<T> {
  const containerRef = useRef<T>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const generationRef = useRef<Generation | null>(null);
  const lastGenerationKey = useRef<string | null>(null);
  const nextId = useRef(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previous = snapshotRef.current;
    const changed = lastGenerationKey.current !== opts.generation;
    lastGenerationKey.current = opts.generation;

    /* Cancel whatever is in flight first — but measure before cancelling, so an
       interrupted generation rebases from what the user can currently see
       rather than from the last committed layout. */
    let liveFirst: Snapshot | null = null;
    const active = generationRef.current;
    if (changed && active) {
      liveFirst = measure(container, opts);
      active.handles.forEach((h) => h.cancel());
      active.exitLayer?.remove();
      generationRef.current = null;
    }

    const commitSnapshot = () => {
      snapshotRef.current = measure(container, opts);
    };

    if (!changed || !previous) {
      commitSnapshot();
      return;
    }

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduced) {
      commitSnapshot();
      return;
    }

    const first = liveFirst ?? previous;
    const cs = getComputedStyle(container);
    const duration =
      Number.parseFloat(cs.getPropertyValue("--m-dur-enter")) || 280;
    const easing =
      cs.getPropertyValue("--m-ease-out").trim() ||
      "cubic-bezier(0.22, 1, 0.36, 1)";
    const fadeDuration =
      Number.parseFloat(cs.getPropertyValue("--m-dur-fade")) || 180;

    const origin = container.getBoundingClientRect();
    const scale = readScale(container);
    const bars = Array.from(
      container.querySelectorAll<HTMLElement>(opts.barSelector),
    );
    const labels = Array.from(
      container.querySelectorAll<HTMLElement>(opts.labelSelector),
    );

    const id = ++nextId.current;
    const handles: Animation[] = [];

    /* ── persistent + entering bars, correlated by target index ── */
    bars.forEach((bar, i) => {
      const target = rectOf(bar, origin, scale);
      const source = first.bars[i]?.rect;

      if (source) {
        /* FLIP: start from where this bar visually was, land on layout. Width
           and height are animated directly rather than scaled, because a scaled
           bar distorts its own corner radius. Easing is non-overshooting: an
           overshoot on width or height clips instead of springing. */
        handles.push(
          bar.animate(
            [
              {
                transform: `translateX(${source.left - target.left}px)`,
                width: `${source.width}px`,
                height: `${source.height}px`,
              },
              { transform: "translateX(0px)", width: `${target.width}px`, height: `${target.height}px` },
            ],
            { duration, easing, fill: "backwards" },
          ),
        );
      } else {
        /* Entering: grow from the baseline the bars already sit on. */
        handles.push(
          bar.animate(
            [
              { transform: "scaleY(0)", opacity: 0 },
              { transform: "scaleY(1)", opacity: 1 },
            ],
            { duration, easing, fill: "backwards" },
          ),
        );
      }
    });

    /* ── incoming label layer fades in; the outgoing one is in the exit layer ── */
    labels.forEach((label) => {
      handles.push(
        label.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: fadeDuration,
          easing,
          fill: "backwards",
        }),
      );
    });

    /* ── retained exit layer for bars with no counterpart, plus every old label ── */
    let exitLayer: HTMLElement | null = null;
    const exitingFrom = bars.length;
    if (first.bars.length > exitingFrom || first.labels.length > 0) {
      exitLayer = buildExitLayer(first, exitingFrom, true);
      container.appendChild(exitLayer);
      handles.push(
        exitLayer.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: fadeDuration,
          easing,
          fill: "forwards",
        }),
      );
    }

    generationRef.current = { id, handles, exitLayer };

    /* ── focus rescue ── */
    if (
      first.focusedIndex !== null &&
      !container.contains(document.activeElement)
    ) {
      const buttons = Array.from(
        container.querySelectorAll<HTMLElement>(opts.buttonSelector),
      );
      const replacement =
        buttons[Math.min(first.focusedIndex, buttons.length - 1)] ?? null;
      const fallback = replacement
        ? null
        : document.querySelector<HTMLElement>(opts.fallbackFocusSelector);
      (replacement ?? fallback)?.focus();
    }

    /* Retained nodes are removed only once every handle of *this* generation has
       settled. A generation that gets cancelled tears its own layer down above,
       so this branch never races it. */
    void Promise.allSettled(handles.map((h) => h.finished)).then(() => {
      if (generationRef.current?.id !== id) return;
      exitLayer?.remove();
      generationRef.current = null;
      commitSnapshot();
    });

    commitSnapshot();
  });

  /* Tear down on unmount so a navigation mid-transition cannot leave a detached
     animation running or an exit layer behind. */
  useLayoutEffect(() => {
    return () => {
      const active = generationRef.current;
      active?.handles.forEach((h) => h.cancel());
      active?.exitLayer?.remove();
      generationRef.current = null;
    };
  }, []);

  return containerRef;
}
