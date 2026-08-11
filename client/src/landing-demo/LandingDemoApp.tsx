import { useEffect, useRef, useState } from "react";
import {
  LANDING_DEMO_PROTOCOL_VERSION,
  type LandingDemoFrameMessage,
  type LandingDemoMode,
  type LandingDemoParentMessage,
  type LandingDemoScene,
} from "@shared/landing-demo";
import {
  isLandingDemoParentMessage,
  isTrustedLandingDemoParentEvent,
  nextLandingDemoFrameRequestId,
  postLandingDemoFrameMessage,
} from "./protocol";

export const LANDING_DEMO_DOCUMENT_MARKER =
  "taptpay-landing-demo-v1" as const;

type FrameState = {
  initialized: boolean;
  scene: LandingDemoScene;
  mode: LandingDemoMode;
  playing: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  revision: number;
};

const INITIAL_STATE: FrameState = {
  initialized: false,
  scene: "overview",
  mode: "cinematic",
  playing: false,
  reducedMotion: false,
  saveData: false,
  revision: 0,
};

const SCENE_LABELS: Record<LandingDemoScene, string> = {
  overview: "Business overview",
  "rent-weekly": "Weekly rent",
  "property-bill": "Property bill",
  "trades-invoice": "Trades invoice",
  "quote-deposit": "Quote deposit",
  "retail-sale": "Retail sale",
  "retail-split": "Split bill",
  "checkout-wallet": "Wallet checkout",
};

const reduceParentMessage = (
  current: FrameState,
  message: LandingDemoParentMessage,
): FrameState => {
  switch (message.type) {
    case "LANDING_DEMO_INIT":
      return {
        ...current,
        initialized: true,
        scene: message.scene,
        mode: "cinematic",
        playing: false,
        reducedMotion: message.reducedMotion,
        saveData: message.saveData,
      };
    case "LANDING_DEMO_SELECT_SCENE":
    case "LANDING_DEMO_RESET":
      return { ...current, scene: message.scene, playing: false };
    case "LANDING_DEMO_PLAY":
      return { ...current, playing: true };
    case "LANDING_DEMO_PAUSE":
      return { ...current, playing: false };
    case "LANDING_DEMO_ENTER_LIVE":
      return { ...current, mode: "live", playing: false };
    case "LANDING_DEMO_EXIT_LIVE":
      return { ...current, mode: "cinematic", playing: false };
    case "LANDING_DEMO_SET_REDUCED_MOTION":
      return {
        ...current,
        reducedMotion: message.enabled,
        playing: message.enabled ? false : current.playing,
      };
    case "LANDING_DEMO_SET_SAVE_DATA":
      return {
        ...current,
        saveData: message.enabled,
        playing: message.enabled ? false : current.playing,
      };
  }
};

const makeFrameEnvelope = (requestId = nextLandingDemoFrameRequestId()) =>
  ({
    protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
    requestId,
  }) as const;

export function LandingDemoApp() {
  const [state, setState] = useState(INITIAL_STATE);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const expectedOrigin = window.location.origin;
    const expectedSource = window.parent;

    postLandingDemoFrameMessage(
      {
        ...makeFrameEnvelope(),
        type: "LANDING_DEMO_READY",
        documentMarker: LANDING_DEMO_DOCUMENT_MARKER,
      } satisfies LandingDemoFrameMessage,
      expectedSource,
      expectedOrigin,
    );

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin === expectedOrigin &&
        event.source === expectedSource &&
        !isLandingDemoParentMessage(event.data)
      ) {
        if (import.meta.env.DEV) {
          console.debug("Ignored malformed landing-demo message");
        }
        return;
      }

      if (
        !isTrustedLandingDemoParentEvent(
          event,
          expectedOrigin,
          expectedSource,
        )
      ) {
        return;
      }

      const next = reduceParentMessage(stateRef.current, event.data);
      stateRef.current = next;
      setState(next);

      if (
        event.data.type === "LANDING_DEMO_INIT" ||
        event.data.type === "LANDING_DEMO_SELECT_SCENE" ||
        event.data.type === "LANDING_DEMO_RESET"
      ) {
        postLandingDemoFrameMessage(
          {
            ...makeFrameEnvelope(event.data.requestId),
            type: "LANDING_DEMO_SCENE_READY",
            scene: next.scene,
            revision: next.revision,
          } satisfies LandingDemoFrameMessage,
          expectedSource,
          expectedOrigin,
        );
      }

      if (event.data.type === "LANDING_DEMO_ENTER_LIVE") {
        postLandingDemoFrameMessage(
          {
            ...makeFrameEnvelope(event.data.requestId),
            type: "LANDING_DEMO_LIVE_READY",
            scene: next.scene,
            revision: next.revision,
          } satisfies LandingDemoFrameMessage,
          expectedSource,
          expectedOrigin,
        );
      }

      postLandingDemoFrameMessage(
        {
          ...makeFrameEnvelope(event.data.requestId),
          type: "LANDING_DEMO_STATE",
          scene: next.scene,
          mode: next.mode,
          playing: next.playing,
          revision: next.revision,
        } satisfies LandingDemoFrameMessage,
        expectedSource,
        expectedOrigin,
      );
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <main
      className="landing-demo"
      data-landing-demo-app={LANDING_DEMO_DOCUMENT_MARKER}
      data-landing-demo-scene={state.scene}
      data-landing-demo-mode={state.mode}
    >
      <header className="landing-demo__header">
        <p className="landing-demo__wordmark" aria-label="TaptPay">
          taptpay<span className="landing-demo__wordmark-dot">.</span>
        </p>
        <p className="landing-demo__mode">
          {state.mode === "live" ? "interactive demo" : "app preview"}
        </p>
      </header>

      <section className="landing-demo__content" aria-labelledby="demo-title">
        <p className="landing-demo__eyebrow">{SCENE_LABELS[state.scene]}</p>
        <h1 className="landing-demo__title" id="demo-title">
          The real app view loads here.
        </h1>
        <p className="landing-demo__copy">
          This isolated frame is ready for the shared mobile view and its public
          demo session.
        </p>

        <div className="landing-demo__card" aria-live="polite">
          <div className="landing-demo__icon" aria-hidden="true">
            t.
          </div>
          <div>
            <p className="landing-demo__card-label">demo boundary</p>
            <p className="landing-demo__card-value">
              {state.initialized ? "connected" : "ready"}
            </p>
          </div>
          <span className="landing-demo__status" aria-hidden="true" />
        </div>

        <p className="landing-demo__footer">
          No merchant account, payment provider, storage, or production API is
          connected to this preview.
        </p>
      </section>
    </main>
  );
}

export default LandingDemoApp;
