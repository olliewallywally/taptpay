import {
  LANDING_DEMO_FRAME_MESSAGE_TYPES,
  LANDING_DEMO_PARENT_MESSAGE_TYPES,
  LANDING_DEMO_PROTOCOL_VERSION,
  isLandingDemoScene,
  type LandingDemoFrameMessage,
  type LandingDemoParentMessage,
} from "@shared/landing-demo";

type UnknownRecord = Record<string, unknown>;

const FRAME_ERROR_CODES = [
  "chunk",
  "protocol",
  "session",
  "scene",
  "unknown",
] as const;

let frameRequestSequence = 0;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: UnknownRecord, allowed: readonly string[]) => {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
};

const isRequestId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 128 &&
  /^[A-Za-z0-9:_-]+$/.test(value);

const hasValidEnvelope = (value: UnknownRecord) =>
  value.protocolVersion === LANDING_DEMO_PROTOCOL_VERSION &&
  isRequestId(value.requestId);

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0;

export const isLandingDemoParentMessage = (
  value: unknown,
): value is LandingDemoParentMessage => {
  if (!isRecord(value) || !hasValidEnvelope(value)) return false;
  if (
    typeof value.type !== "string" ||
    !(LANDING_DEMO_PARENT_MESSAGE_TYPES as readonly string[]).includes(value.type)
  ) {
    return false;
  }

  switch (value.type) {
    case "LANDING_DEMO_INIT":
      return (
        hasOnlyKeys(value, [
          "type",
          "protocolVersion",
          "requestId",
          "scene",
          "reducedMotion",
          "saveData",
        ]) &&
        isLandingDemoScene(value.scene) &&
        typeof value.reducedMotion === "boolean" &&
        typeof value.saveData === "boolean"
      );
    case "LANDING_DEMO_SELECT_SCENE":
    case "LANDING_DEMO_RESET":
      return (
        hasOnlyKeys(value, [
          "type",
          "protocolVersion",
          "requestId",
          "scene",
        ]) && isLandingDemoScene(value.scene)
      );
    case "LANDING_DEMO_SET_REDUCED_MOTION":
    case "LANDING_DEMO_SET_SAVE_DATA":
      return (
        hasOnlyKeys(value, [
          "type",
          "protocolVersion",
          "requestId",
          "enabled",
        ]) && typeof value.enabled === "boolean"
      );
    case "LANDING_DEMO_PLAY":
    case "LANDING_DEMO_PAUSE":
    case "LANDING_DEMO_ENTER_LIVE":
    case "LANDING_DEMO_EXIT_LIVE":
      return hasOnlyKeys(value, ["type", "protocolVersion", "requestId"]);
  }

  return false;
};

export const isLandingDemoFrameMessage = (
  value: unknown,
): value is LandingDemoFrameMessage => {
  if (!isRecord(value) || !hasValidEnvelope(value)) return false;
  if (
    typeof value.type !== "string" ||
    !(LANDING_DEMO_FRAME_MESSAGE_TYPES as readonly string[]).includes(value.type)
  ) {
    return false;
  }

  switch (value.type) {
    case "LANDING_DEMO_READY":
      return (
        hasOnlyKeys(value, [
          "type",
          "protocolVersion",
          "requestId",
          "documentMarker",
        ]) && value.documentMarker === "taptpay-landing-demo-v1"
      );
    case "LANDING_DEMO_SCENE_READY":
    case "LANDING_DEMO_COMPLETE":
      return (
        hasOnlyKeys(value, [
          "type",
          "protocolVersion",
          "requestId",
          "scene",
          "revision",
        ]) &&
        isLandingDemoScene(value.scene) &&
        isNonNegativeInteger(value.revision)
      );
    case "LANDING_DEMO_STATE":
      return (
        hasOnlyKeys(value, [
          "type",
          "protocolVersion",
          "requestId",
          "scene",
          "mode",
          "playing",
          "revision",
        ]) &&
        isLandingDemoScene(value.scene) &&
        (value.mode === "cinematic" || value.mode === "live") &&
        typeof value.playing === "boolean" &&
        isNonNegativeInteger(value.revision)
      );
    case "LANDING_DEMO_STEP":
      return (
        hasOnlyKeys(value, [
          "type",
          "protocolVersion",
          "requestId",
          "scene",
          "step",
          "revision",
        ]) &&
        isLandingDemoScene(value.scene) &&
        isNonNegativeInteger(value.step) &&
        isNonNegativeInteger(value.revision)
      );
    case "LANDING_DEMO_LIVE_READY":
      return (
        hasOnlyKeys(value, [
          "type",
          "protocolVersion",
          "requestId",
          "scene",
          "revision",
        ]) &&
        isLandingDemoScene(value.scene) &&
        isNonNegativeInteger(value.revision)
      );
    case "LANDING_DEMO_ERROR":
      return (
        hasOnlyKeys(value, [
          "type",
          "protocolVersion",
          "requestId",
          "code",
          "recoverable",
        ]) &&
        (FRAME_ERROR_CODES as readonly unknown[]).includes(value.code) &&
        typeof value.recoverable === "boolean"
      );
  }

  return false;
};

export const isTrustedLandingDemoParentEvent = (
  event: Pick<MessageEvent<unknown>, "data" | "origin" | "source">,
  expectedOrigin: string,
  expectedSource: MessageEventSource | null,
): event is MessageEvent<LandingDemoParentMessage> =>
  event.origin === expectedOrigin &&
  event.source === expectedSource &&
  isLandingDemoParentMessage(event.data);

export const nextLandingDemoFrameRequestId = () =>
  `landing-demo-frame:${++frameRequestSequence}`;

export const postLandingDemoFrameMessage = (
  message: LandingDemoFrameMessage,
  target: Pick<Window, "postMessage"> = window.parent,
  targetOrigin = window.location.origin,
) => {
  target.postMessage(message, targetOrigin);
};
