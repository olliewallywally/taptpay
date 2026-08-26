/* The channel between a terminal feature screen and the nav dock.
 *
 * App.tsx renders <Router /> and <BottomNavigation /> as siblings, and which
 * feature screen is showing is view state, not a route — retail's keypad,
 * split, stock and share are all at /terminal. There is no prop path and no
 * URL BottomNavigation can read to know a feature screen is active, so this
 * module is the channel. docs/SPEC-2026-08-20-dock-implementation.md §6.1.
 *
 * Deliberately a plain module: no wouter, no storage, no fetch, so
 * __tests__/terminal-dock-view-boundary.test.tsx is unaffected by either side
 * importing it.
 */
export type DockCollapse = "auto" | "collapsed" | "expanded";

let current: DockCollapse = "auto";
const listeners = new Set<() => void>();

export function setDockCollapse(next: DockCollapse) {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export function subscribeDockCollapse(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getDockCollapse = () => current;
export const getDockCollapseServer = (): DockCollapse => "auto";
