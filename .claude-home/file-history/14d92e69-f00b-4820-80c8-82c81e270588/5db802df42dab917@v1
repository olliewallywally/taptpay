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
import { useEffect, useMemo, useRef, useState } from 'react';
import './landing-phone.css';
import { SCREEN_H, SCREEN_W } from './tokens';
import type { LandingPhoneScene, LandingPhoneState } from './types';
import { SCENES, stepsFor } from './scenes/registry';
import { createSceneController, finalState, resolveState } from './reducer';

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

export function LandingPhoneDemo({ state, rotateY = 0, rotateX = 0, scale = 1, still = false, className }: LandingPhoneDemoProps) {
  const def = SCENES[state.scene];
  const Scene = def.Component;
  const announcement = useSceneAnnouncement(state);

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
          <div className="lp-island" aria-hidden />
        </div>
        <div className="lp-glare" aria-hidden />
      </div>
      <p
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
      >
        {announcement}
      </p>
    </div>
  );
}

/**
 * Scroll → state for the cinematic phone.
 *
 * The controller only reports milestone changes, so scrolling does not set
 * React state on every frame. `still` viewers jump straight to each scene's
 * finished frame instead of watching it assemble.
 */
export function useStoryScene(progress: number, still = false): LandingPhoneState {
  const controller = useMemo(() => createSceneController(stepsFor), []);
  const [state, setState] = useState<LandingPhoneState>(() => resolveState(progress, stepsFor));

  useEffect(() => {
    const resolved = resolveState(progress, stepsFor);
    const next = still ? finalState(resolved.scene, stepsFor) : resolved;
    const changed = controller.set(next);
    if (changed) setState(changed);
  }, [progress, still, controller]);

  return state;
}

/**
 * Mode-aware entry point for the lazily loaded chunk.
 *
 * The cinematic phone passes `progress` and lets the controller pick the
 * scene; the Industries phone passes an explicit `state` for the selected tab.
 * Both render the same scenes from the same registry, so the two phones cannot
 * drift apart (§3.3).
 *
 * This is the chunk's default export: LandingPhoneMount lazy-imports this
 * module, so everything below — scenes, primitives, CSS — lands in one chunk
 * that is fetched once and never re-fetched when the scene changes.
 */
export type PhoneStageProps = Omit<LandingPhoneDemoProps, 'state'> & {
  progress?: number;
  state?: LandingPhoneState;
};

export function PhoneStage({ progress = 0, state, still = false, ...rest }: PhoneStageProps) {
  const scrolled = useStoryScene(progress, still);
  return <LandingPhoneDemo {...rest} still={still} state={state ?? scrolled} />;
}

export default PhoneStage;
