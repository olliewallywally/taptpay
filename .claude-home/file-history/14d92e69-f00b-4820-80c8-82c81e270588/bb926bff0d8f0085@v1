/**
 * Scroll plumbing for the landing phone.
 *
 * These hooks deliberately measure their own scroll position instead of taking
 * a feed from landingRuntime.ts. Keeping the demo self-contained means wiring
 * it into the page is a one-line swap rather than a second set of edits to a
 * 1400-line runtime, and it gives the demo an honest `destroy()` story: every
 * listener and observer here is owned by a component and torn down with it
 * (§7.7).
 *
 * Work stops whenever the story is off screen or the tab is hidden (§6 rule 9).
 */
import { useEffect, useRef, useState } from 'react';

/** True once the element is within `margin` of the viewport. Never flips back. */
export function useApproaching<T extends Element>(margin = '600px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin, near]);

  return [ref, near];
}

/**
 * Progress of `ref` through the viewport, 0 → 1.
 *
 * Rounded to a small grid before it reaches React: the scene controller only
 * cares about milestone boundaries, so there is no reason to re-render on
 * sub-pixel scroll deltas.
 */
export function useStoryProgress<T extends Element>(ref: React.RefObject<T>, active = true): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;

    let frame = 0;
    let visible = true;

    const measure = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const raw = travel > 0 ? -rect.top / travel : rect.top <= 0 ? 1 : 0;
      const next = Math.round(Math.min(1, Math.max(0, raw)) * 2000) / 2000;
      setProgress((prev) => (prev === next ? prev : next));
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              visible = entries.some((e) => e.isIntersecting);
              if (visible) schedule();
            },
            { rootMargin: '100px' },
          );
    io?.observe(el);

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('visibilitychange', schedule);
    measure();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      io?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [ref, active]);

  return progress;
}

/**
 * Viewers who asked for less: reduced motion, or Save-Data. Both get finished
 * frames instead of the build-up, and Save-Data additionally suppresses the
 * prefetch (§6 rule 2).
 */
export function useStillPreference(): { reducedMotion: boolean; saveData: boolean } {
  const [state, setState] = useState({ reducedMotion: false, saveData: false });

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const saveData = Boolean(conn?.saveData);

    if (typeof window.matchMedia !== 'function') {
      setState({ reducedMotion: false, saveData });
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setState({ reducedMotion: mq.matches, saveData });
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return state;
}
