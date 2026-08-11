/**
 * The landing page's phone: a CSS-3D body with a real DOM app screen on its
 * front face.
 *
 * Replaces two things at once (§1, §3):
 *   • the Three.js slab — renderer, geometry, materials, lights, texture loader
 *     and perpetual render loop, none of which survive here;
 *   • the app/embed.html iframe, whose hashed asset references rot every build
 *     and are the actual cause of the blank screen.
 *
 * The screen is a direct React child, so it cannot drift out of sync with a
 * build snapshot and needs no cross-window readiness handshake. Enhanced 3D is
 * additive: if the transform layer fails or is unsupported, the screen still
 * renders flat rather than going blank.
 */
import { useEffect, useRef, useState } from 'react';
import './landing-phone.css';
import { SCREEN_H, SCREEN_W } from './tokens';
import type { LandingPhoneScene, LandingPhoneState } from './types';
import { SCENES, stepsFor } from './scenes/registry';
import { sceneAtProgress, finalState } from './reducer';

export type LandingPhoneDemoProps = {
  /** Which frame to show. Callers own the state; the phone is presentational. */
  state: LandingPhoneState;
  /** Degrees. Driven by scroll on the cinematic phone, by tilt in Industries. */
  rotateY?: number;
  rotateX?: number;
  /** Fit the 390 × 844 screen into the caller's box. */
  scale?: number;
  /** Reduced motion or Save-Data: show finished frames, skip the build-up. */
  still?: boolean;
  /**
   * Screen only — no rim, back face, glare or dynamic island.
   *
   * The landing page already draws a phone around this slot (the cinematic
   * CSS-3D body, and the tilting `.tp-phone` in Industries), so drawing our own
   * would nest a phone inside a phone. `bare` is what the landing page uses;
   * the full chrome exists for standalone use, where the demo *is* the phone.
   */
  bare?: boolean;
  className?: string;
};

/**
 * Announces only completed scenes, and only when the scene changes — an
 * intermediate milestone must not spam the live region (§7.6).
 */
function useSceneAnnouncement(state: LandingPhoneState): string {
  const [message, setMessage] = useState('');
  const last = useRef<LandingPhoneScene | null>(null);
  useEffect(() => {
    const def = SCENES[state.scene];
    const complete = state.step >= def.steps - 1;
    if (complete && last.current !== state.scene) {
      last.current = state.scene;
      setMessage(def.label);
    } else if (!complete && last.current === state.scene) {
      last.current = null;
    }
  }, [state.scene, state.step]);
  return message;
}

const SR_ONLY = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
} as const;

export function LandingPhoneDemo({ state, rotateY = 0, rotateX = 0, scale = 1, still = false, bare = false, className }: LandingPhoneDemoProps) {
  const def = SCENES[state.scene];
  const Scene = def.Component;
  const announcement = useSceneAnnouncement(state);

  // The scene always renders at its canonical 390 × 844 and is scaled as a
  // whole, so no scene has to know what size it is being shown at.
  const screen = (
    <div
      style={{
        width: SCREEN_W,
        height: SCREEN_H,
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'top left',
        position: 'relative',
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <Scene step={state.step} still={still} />
      {!bare && <div className="lp-island" aria-hidden />}
    </div>
  );

  const live = (
    <p aria-live="polite" style={SR_ONLY}>
      {announcement}
    </p>
  );

  if (bare) {
    // No .lp-phone here: preserve-3d and a perspective transform belong to
    // whoever owns the phone body, and this element is only its screen.
    return (
      <div
        className={className}
        data-demo-scene={state.scene}
        data-demo-step={state.step}
        role="img"
        aria-label={def.label}
        style={{ width: SCREEN_W * scale, height: SCREEN_H * scale, position: 'relative', overflow: 'hidden', background: '#fff' }}
      >
        {screen}
        {live}
      </div>
    );
  }

  return (
    <div
      className={`lp-phone${className ? ` ${className}` : ''}`}
      data-demo-scene={state.scene}
      data-demo-step={state.step}
      style={{
        width: SCREEN_W * scale,
        height: SCREEN_H * scale,
        transform: `perspective(2200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
      }}
    >
      <div className="lp-rim" aria-hidden />
      <div className="lp-face lp-face-back" aria-hidden style={{ backgroundImage: "url('/assets/shell-back.webp')" }} />
      <div className="lp-face" role="img" aria-label={def.label}>
        {screen}
        <div className="lp-glare" aria-hidden />
      </div>
      {live}
    </div>
  );
}

/**
 * Story state for the cinematic phone. Scroll selects the scene; once parked,
 * authored beat durations advance the real controls and loop. Visibility and
 * reduced-motion preferences pause the clock.
 */
export function useStoryScene(progress: number, still = false, playing = false): LandingPhoneState {
  const scene = sceneAtProgress(progress).scene;
  const [state, setState] = useState<LandingPhoneState>(() =>
    still ? finalState(scene, stepsFor) : { scene, step: 0 },
  );
  const sceneRef = useRef(scene);

  useEffect(() => {
    sceneRef.current = scene;
    setState(still ? finalState(scene, stepsFor) : { scene, step: 0 });
  }, [scene, still]);

  useEffect(() => {
    if (!playing || still) return;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let currentScene = scene;

    const getDurations = () => {
      const beats = SCENES[currentScene].beats;
      return beats && beats.length === stepsFor(currentScene)
        ? beats
        : Array.from({ length: stepsFor(currentScene) }, () => 700);
    };

    const tick = (now: number) => {
      if (document.hidden) {
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      const delta = Math.min(Math.max(0, now - last), 250);
      last = now;
      if (sceneRef.current !== currentScene) return;
      elapsed += delta;
      const durations = getDurations();
      const total = durations.reduce((sum, value) => sum + Math.max(1, value), 0);
      let cursor = elapsed % total;
      let step = durations.length - 1;
      for (let i = 0; i < durations.length; i += 1) {
        const duration = Math.max(1, durations[i]);
        if (cursor < duration) {
          step = i;
          break;
        }
        cursor -= duration;
      }
      setState((previous) =>
        previous.scene === currentScene && previous.step === step
          ? previous
          : { scene: currentScene, step },
      );
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, scene, still]);

  return state;
}

/**
 * Mode-aware entry point for the lazily loaded chunk.
 *
 * The cinematic phone passes progress and lets the clock play the selected
 * scene; the Industries phone passes an explicit state for the selected tab.
 * Both render the same scene registry, so the two phones cannot drift apart.
 *
 * This is the chunk's default export: LandingPhoneMount lazy-imports this
 * module, so everything below — scenes, primitives, CSS — lands in one chunk
 * that is fetched once and never re-fetched when the scene changes.
 */
export type PhoneStageProps = Omit<LandingPhoneDemoProps, 'state'> & {
  progress?: number;
  state?: LandingPhoneState;
  playing?: boolean;
};

export function PhoneStage({ progress = 0, state, still = false, playing = false, ...rest }: PhoneStageProps) {
  const story = useStoryScene(progress, still, playing);
  return <LandingPhoneDemo {...rest} still={still} state={state ?? story} />;
}

export default PhoneStage;
