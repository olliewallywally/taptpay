/**
 * The landing page's only entry point into the phone demo.
 *
 * Everything the page needs to know lives here, so wiring the demo in is a
 * one-line swap for the dead <iframe> rather than a second pass over
 * landing-page.tsx. This module is deliberately tiny and imports nothing from
 * the demo chunk — scenes, primitives and CSS all arrive behind the lazy
 * boundary below, which is what keeps a visitor who never scrolls to the story
 * from downloading them (§6 rules 1–3).
 *
 * Failure modes are covered by construction, because a blank phone is the bug
 * this whole plan exists to fix (§7.1):
 *   • chunk still loading → static shell
 *   • chunk failed to load → static shell
 *   • scene threw while rendering → static shell
 *   • no IntersectionObserver → load immediately
 *   • Save-Data → no prefetch, and finished frames when it does load
 */
import { Component, Suspense, lazy, useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { SCREEN_H, SCREEN_W } from './tokens';
import type { LandingPhoneScene, LandingPhoneState } from './types';
import { useApproaching, useStillPreference, useStoryProgress } from './useStoryProgress';

const PhoneStage = lazy(() => import('./LandingPhoneDemo'));

/**
 * Inline-styled on purpose: the shell is the pre-chunk state, so it must not
 * depend on landing-phone.css. It is a few hundred bytes and carries the
 * phone's silhouette, not its content.
 *
 * `bare` drops the silhouette: inside the landing page's own phone chrome the
 * shell is a screen, and a rounded, shadowed slab there would read as a second
 * phone floating behind the glass for as long as the chunk takes to arrive.
 */
function StaticShell({ scale = 1, rotateY = 0, bare = false, label = 'taptpay app' }: { scale?: number; rotateY?: number; bare?: boolean; label?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      data-demo-scene="shell"
      style={{
        width: SCREEN_W * scale,
        height: SCREEN_H * scale,
        background: 'linear-gradient(158deg,#0a1656 0%,#040D6D 46%,#0b1a6e 100%)',
        ...(bare
          ? null
          : {
              borderRadius: 54 * scale,
              boxShadow: '0 40px 120px rgba(4,13,109,0.55), inset 0 0 0 2px rgba(185,203,232,0.35)',
              transform: `perspective(2200px) rotateY(${rotateY}deg)`,
            }),
      }}
    />
  );
}

class PhoneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // The landing page is marketing, not a workflow: degrade to the shell and
    // leave a breadcrumb rather than taking the section down.
    if (import.meta.env?.DEV) console.error('[landing-phone] scene failed', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export type LandingPhoneMountProps = {
  /**
   * cinematic — scroll drives scene and step across the eight story zones.
   * industries — the tab picks the scene; step is driven by the tab's own
   * progress or pinned to the finished frame.
   */
  variant: 'cinematic' | 'industries';
  /** Industries only: which scene the selected tab shows. */
  scene?: LandingPhoneScene;
  /** Industries only: pin to an explicit milestone (e.g. replay controls). */
  state?: LandingPhoneState;
  scale?: number;
  /** Degrees of Y rotation at progress 0 and 1; the phone turns between them. */
  spin?: [number, number];
  /**
   * Industries only: "try it live" — tap-through and replay (§3.3). This is
   * local milestone stepping, never live production behaviour.
   */
  interactive?: boolean;
  /** Milestone count for the selected scene; supplied by the caller so the
   *  main chunk never imports the registry to find out. */
  steps?: number;
  /** Render the screen only, for callers that draw their own phone body. */
  bare?: boolean;
  /**
   * Cinematic only: selector for the tall element whose scroll travel is the
   * story. Omit when the mount itself is what scrolls.
   */
  storySelector?: string;
  className?: string;
  style?: CSSProperties;
};

export function LandingPhoneMount({
  variant, scene, state, scale = 1, spin = [-18, 18], interactive = false, steps,
  bare = false, storySelector, className, style,
}: LandingPhoneMountProps) {
  const [ref, near] = useApproaching<HTMLDivElement>('600px');
  const { reducedMotion, saveData } = useStillPreference();
  const progress = useStoryProgress(ref, near && variant === 'cinematic', storySelector);

  // Tap-through state for the Industries phone. Selecting a different tab
  // restarts that workflow from its own first milestone.
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [scene]);
  const advance = useCallback(() => {
    setStep((s) => (steps && steps > 0 ? (s + 1) % steps : s + 1));
  }, [steps]);

  const still = reducedMotion || saveData;
  // Save-Data viewers get the shell until the story is actually in view, not
  // merely approaching, so the chunk is never speculatively fetched for them.
  const load = saveData ? near && progress > 0 : near;
  const rotateY = variant === 'cinematic' ? spin[0] + (spin[1] - spin[0]) * progress : 0;

  const shell = <StaticShell scale={scale} rotateY={rotateY} bare={bare} />;

  // An Industries tab that is not being tapped through rests on its finished
  // frame, so the tab shows a completed workflow rather than an empty first step.
  const restStep = steps && steps > 0 ? steps - 1 : 0;
  const industriesState: LandingPhoneState | undefined = scene
    ? { scene, step: interactive ? step : restStep }
    : undefined;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: SCREEN_W * scale,
        height: SCREEN_H * scale,
        position: 'relative',
        // The landing page scales this element to fit its phone chrome
        // (landingRuntime initPhones), which only lands correctly from the
        // top-left corner of the 390 × 844 screen.
        transformOrigin: 'top left',
        ...style,
      }}
    >
      {load ? (
        <PhoneBoundary fallback={shell}>
          <Suspense fallback={shell}>
            <PhoneStage
              progress={progress}
              state={state ?? industriesState}
              rotateY={rotateY}
              scale={scale}
              still={still}
              bare={bare}
            />
          </Suspense>
        </PhoneBoundary>
      ) : (
        shell
      )}

      {/*
        Only the Industries phone is interactive, and it exposes exactly two
        controls rather than turning every drawn button into a phantom control
        (§7.5). Both are real buttons, so they are keyboard reachable.
      */}
      {interactive && variant === 'industries' && (
        <>
          <button
            type="button"
            onClick={advance}
            aria-label={`step through the ${scene ?? 'demo'} workflow`}
            style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          />
          <button
            type="button"
            onClick={() => setStep(0)}
            style={{
              // Bare mounts sit inside a clipping phone screen, so the control
              // has to live above the bottom edge rather than under it.
              position: 'absolute', bottom: bare ? 16 : -14, left: '50%', transform: 'translateX(-50%)',
              padding: '8px 18px', borderRadius: 999, border: '1px solid rgba(94,157,255,0.5)',
              background: 'rgba(4,13,109,0.9)', color: '#5E9DFF', cursor: 'pointer',
              font: "600 12px/1 'Outfit', system-ui", letterSpacing: '0.06em',
            }}
          >
            replay
          </button>
        </>
      )}
    </div>
  );
}

export default LandingPhoneMount;
