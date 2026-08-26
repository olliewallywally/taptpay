import { useEffect, useRef, type CSSProperties } from "react";

/** Six steps: min(index, 5) × --m-stagger-list, so the tail cannot run away. */
export const ENTRANCE_STAGGER_CAP = 5;

/**
 * Per-surface registry of rows that have already played their entrance.
 *
 * Stable React keys are not enough on their own: filtering and search unmount
 * rows, so a key that returns later looks brand new to React and would replay
 * the entrance for a record the user has already seen. This registry is owned by
 * the persistent list parent and outlives those unmounts.
 *
 * Rules it implements, in order of when they bite:
 *
 * - The first non-empty dataset seeds the whole registry. Rows visible on that
 *   first paint still animate, because seeding happens in the commit effect
 *   *after* they have rendered with the entrance class. Everything else in that
 *   dataset is marked seen without animating, so the first filter or search
 *   change does not replay records that were merely off-screen.
 * - Afterwards, a genuinely new id animates once when it first becomes visible,
 *   then joins the registry for the lifetime of the surface.
 * - Reorder-only and text/status-only updates keep their ids, so they never
 *   replay.
 *
 * @param allIds     every id in the current query dataset, filtered or not
 * @param visibleIds the ids actually being rendered this pass, in visual order
 * @returns          id → stagger step, containing only the rows that should animate
 */
export function useListEntrance(
  allIds: readonly string[],
  visibleIds: readonly string[],
): Map<string, number> {
  const seen = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  const steps = new Map<string, number>();
  let step = 0;
  for (const id of visibleIds) {
    if (!seen.current.has(id)) {
      steps.set(id, Math.min(step, ENTRANCE_STAGGER_CAP));
      step += 1;
    }
  }

  /* No dependency array: this must record whatever was actually committed this
     pass, which is exactly what the next render needs to compare against. */
  useEffect(() => {
    for (const id of visibleIds) seen.current.add(id);
    if (!seeded.current && allIds.length > 0) {
      seeded.current = true;
      for (const id of allIds) seen.current.add(id);
    }
  });

  return steps;
}

/**
 * Spreadable props for one row. A row that has already been seen gets its base
 * class back and nothing else, so a settled list carries no entrance classes or
 * inline styles at all.
 */
export function entranceProps(
  steps: Map<string, number>,
  id: string,
  baseClassName: string,
): { className: string; style?: CSSProperties } {
  const step = steps.get(id);
  if (step === undefined) return { className: baseClassName };
  return {
    className: `${baseClassName} dt-list-row`,
    style: { "--dt-li": String(step) } as CSSProperties,
  };
}
