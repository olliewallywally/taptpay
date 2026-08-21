/* DK3 (docs/PLAN-2026-08-17-terminal-panels-and-dock.md §7): the gooey
 * collapse is an enhancement behind one flag. The geometry-only fallback
 * (no filter) runs the exact same keyframes and durations — the timing must
 * not depend on the filter, so turning this off on a misbehaving iOS Safari
 * cannot produce motion that is merely present rather than correct.
 */
export const DOCK_GOO_DEFAULT = true;

declare global {
  interface Window {
    __TAPT_DOCK_GOO__?: boolean;
  }
}

export const gooEnabled = (): boolean =>
  typeof window !== "undefined" && window.__TAPT_DOCK_GOO__ === false
    ? false
    : DOCK_GOO_DEFAULT;
