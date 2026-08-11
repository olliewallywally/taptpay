import {
  LANDING_DEMO_PARENT_MESSAGE_TYPES,
  LANDING_DEMO_PROTOCOL_VERSION,
  type LandingDemoParentMessage,
} from "@shared/landing-demo";
import {
  isLandingDemoFrameMessage,
  isLandingDemoParentMessage,
  isTrustedLandingDemoParentEvent,
} from "./protocol";

const message = <T extends LandingDemoParentMessage>(value: T) => value;

const parentMessages: LandingDemoParentMessage[] = [
  message({
    type: "LANDING_DEMO_INIT",
    protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
    requestId: "parent:init-1",
    scene: "retail-sale",
    reducedMotion: false,
    saveData: false,
  }),
  message({
    type: "LANDING_DEMO_SELECT_SCENE",
    protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
    requestId: "parent:scene-1",
    scene: "rent-weekly",
  }),
  message({
    type: "LANDING_DEMO_PLAY",
    protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
    requestId: "parent:play-1",
  }),
  message({
    type: "LANDING_DEMO_PAUSE",
    protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
    requestId: "parent:pause-1",
  }),
  message({
    type: "LANDING_DEMO_RESET",
    protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
    requestId: "parent:reset-1",
    scene: "property-bill",
  }),
  message({
    type: "LANDING_DEMO_ENTER_LIVE",
    protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
    requestId: "parent:live-1",
  }),
  message({
    type: "LANDING_DEMO_EXIT_LIVE",
    protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
    requestId: "parent:exit-1",
  }),
  message({
    type: "LANDING_DEMO_SET_REDUCED_MOTION",
    protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
    requestId: "parent:motion-1",
    enabled: true,
  }),
  message({
    type: "LANDING_DEMO_SET_SAVE_DATA",
    protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
    requestId: "parent:data-1",
    enabled: true,
  }),
];

describe("landing demo message protocol", () => {
  it("accepts every declared parent message branch", () => {
    expect(parentMessages.map((item) => item.type)).toEqual(
      LANDING_DEMO_PARENT_MESSAGE_TYPES,
    );
    parentMessages.forEach((item) =>
      expect(isLandingDemoParentMessage(item)).toBe(true),
    );
  });

  it("rejects malformed, unknown, and over-posted parent messages", () => {
    expect(
      isLandingDemoParentMessage({
        ...parentMessages[0],
        protocolVersion: 2,
      }),
    ).toBe(false);
    expect(
      isLandingDemoParentMessage({
        ...parentMessages[1],
        scene: "merchant-production",
      }),
    ).toBe(false);
    expect(
      isLandingDemoParentMessage({
        ...parentMessages[2],
        authToken: "must-not-cross-the-frame",
      }),
    ).toBe(false);
    expect(
      isLandingDemoParentMessage({
        type: "LANDING_DEMO_UNKNOWN",
        protocolVersion: 1,
        requestId: "parent:unknown-1",
      }),
    ).toBe(false);
  });

  it("requires the exact parent source and same landing origin", () => {
    const validEvent = {
      data: parentMessages[1],
      origin: "https://taptpay.example",
      source: window,
    };

    expect(
      isTrustedLandingDemoParentEvent(
        validEvent,
        "https://taptpay.example",
        window,
      ),
    ).toBe(true);
    expect(
      isTrustedLandingDemoParentEvent(
        { ...validEvent, origin: "https://attacker.example" },
        "https://taptpay.example",
        window,
      ),
    ).toBe(false);
    expect(
      isTrustedLandingDemoParentEvent(
        { ...validEvent, source: null },
        "https://taptpay.example",
        window,
      ),
    ).toBe(false);
  });

  it("accepts the uniquely marked ready response and rejects impostors", () => {
    const ready = {
      type: "LANDING_DEMO_READY",
      protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
      requestId: "landing-demo-frame:1",
      documentMarker: "taptpay-landing-demo-v1",
    };

    expect(isLandingDemoFrameMessage(ready)).toBe(true);
    expect(
      isLandingDemoFrameMessage({
        ...ready,
        documentMarker: "main-app",
      }),
    ).toBe(false);
  });
});
