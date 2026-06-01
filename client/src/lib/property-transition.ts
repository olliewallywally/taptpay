/**
 * Property page hero-morph transition orchestrator.
 *
 * Uses the View Transitions API when available (Chrome 111+, Safari 18+) to
 * morph the navy hero card between the Tenant Directory and Tenant Profile.
 * Falls back to the standard Framer Motion page transition on unsupported
 * browsers with no change in API for callers.
 *
 * Module-level (not React state) so it survives route changes cleanly.
 *
 * Why this is more than a one-line startViewTransition() call:
 * the property pages are lazy()-loaded behind a single <Suspense>. A plain
 * `startViewTransition(go)` snapshots the *new* page on the next frame — but
 * on navigation the destination chunk hasn't loaded yet, so React is still
 * showing the empty Suspense fallback. With no .pt-hero present in the new
 * snapshot the browser can't morph and falls back to a whole-page crossfade
 * (the "quick full reload" flash). To avoid that we keep the OLD page frozen
 * (the View Transition holds it) until the destination mounts and calls
 * signalPropertyReady(), then let the browser capture — so the hero is always
 * present on both sides and the morph + bounce-in play every time.
 */

export type TenantSnap = {
  id: string;
  firstName: string;
  lastName: string;
  propertyAddress: string;
  preferredChannel: string;
  invoiceStatus?: string;
};

let _snap: TenantSnap | null = null;
let _vtPending = false;
let _readyResolve: (() => void) | null = null;

export const supportsVT = (): boolean =>
  typeof document !== 'undefined' && 'startViewTransition' in document;

/**
 * Resolve once the destination route has mounted (it calls signalPropertyReady
 * from a layout effect), plus one frame so the hero is laid out before the
 * browser captures the new snapshot. A timeout guards against a destination
 * that never signals (e.g. a route with no hero) so we never hang.
 */
function waitForReady(timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      _readyResolve = null;
      resolve();
    };
    // Settle one extra frame after the ready signal so layout is committed.
    _readyResolve = () => requestAnimationFrame(finish);
    setTimeout(finish, timeoutMs);
  });
}

/**
 * Called by a destination property page from a layout effect on mount.
 * Lets the in-flight View Transition capture now that the hero is in the DOM.
 * No-op when no navigation is pending (e.g. direct page load / refresh).
 */
export function signalPropertyReady(): void {
  _readyResolve?.();
}

/**
 * Navigate from the Tenant Directory to a Tenant Profile with the hero morph.
 * Stores a tenant snapshot so the profile hero renders instantly before the API
 * response arrives, eliminating any loading flash during the animation.
 */
export function startPropertyNavigation(snap: TenantSnap, go: () => void): void {
  _snap = snap;
  if (!supportsVT()) { go(); return; }
  _vtPending = true;
  const vt = (document as any).startViewTransition(async () => {
    go();
    await waitForReady();
  });
  vt.finished.finally(() => { _vtPending = false; });
}

/**
 * Navigate back with the reverse morph. `expectHero` (default true) waits for
 * the destination hero to mount so the morph plays; pass false for targets with
 * no .pt-hero (e.g. the property dashboard) to get an immediate crossfade
 * instead of a needless pause.
 */
export function startPropertyBack(go: () => void, opts?: { expectHero?: boolean }): void {
  if (!supportsVT()) { go(); return; }
  _vtPending = true;
  const vt = (document as any).startViewTransition(async () => {
    go();
    if (opts?.expectHero !== false) await waitForReady();
  });
  vt.finished.finally(() => { _vtPending = false; });
}

/** True while a View Transition is in flight. PageTransition reads this to stand down. */
export function isVTPending(): boolean { return _vtPending; }

/**
 * Consume the tenant snapshot — called once on TenantProfile mount.
 * Returns null if the profile was opened directly (no directory tap).
 */
export function consumeSnap(): TenantSnap | null {
  const s = _snap;
  _snap = null;
  return s;
}
