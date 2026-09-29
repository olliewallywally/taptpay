/* A collapsed action-bar slot — `.tp-send-slot`, `.tp-split-slot` — clips its button
 * with `max-width: 0; overflow: hidden`, so the button paints nothing. As of
 * 2026-08-29 it is also untappable: the vertical sheets used to re-enable
 * `pointer-events` on the *bar* rather than on an expanded slot, which left a
 * phantom 68px hit box floating beside the action bar (the nine `tapCentreMiss`
 * defects the §7.2 gate had been carrying in its baseline).
 *
 * Clipping and `pointer-events: none` between them handle the pointer. Neither
 * handles the KEYBOARD: an invisible "send" was still in the tab order and still
 * in the accessibility tree, so Tab reached it and Enter fired its handler.
 *
 * `inert` is the one attribute that removes a subtree from both the tab order and
 * the a11y tree without touching `visibility` — which matters, because
 * `visibility: hidden` would cut the fade-out transition off at frame one and
 * would need a delayed flip to survive it.
 *
 * React 18 has no typing for `inert` (React 19 accepts it as a boolean), hence the
 * cast. Passing `undefined` omits the attribute entirely rather than rendering
 * `inert="false"`, which the HTML spec would read as *inert*.
 */
export const inertWhen = (collapsed: boolean) =>
  (collapsed ? { inert: "" } : {}) as Record<string, string>;
