import { act, render, screen } from "@testing-library/react";
import { LANDING_DEMO_PROTOCOL_VERSION } from "@shared/landing-demo";
import LandingDemoApp from "./LandingDemoApp";

describe("LandingDemoApp document boundary", () => {
  let postMessage: jest.SpyInstance;

  beforeEach(() => {
    postMessage = jest.spyOn(window, "postMessage").mockImplementation(() => {});
  });

  afterEach(() => {
    postMessage.mockRestore();
  });

  it("announces readiness with the unique document marker", () => {
    render(<LandingDemoApp />);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "LANDING_DEMO_READY",
        protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
        documentMarker: "taptpay-landing-demo-v1",
      }),
      window.location.origin,
    );
    expect(
      document.querySelector('[data-landing-demo-app="taptpay-landing-demo-v1"]'),
    ).toBeInTheDocument();
  });

  it("accepts a valid scene selection from its exact parent only", () => {
    render(<LandingDemoApp />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "LANDING_DEMO_SELECT_SCENE",
            protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
            requestId: "parent:scene-2",
            scene: "quote-deposit",
          },
          origin: window.location.origin,
          source: window,
        }),
      );
    });

    expect(screen.getByText("Quote deposit")).toBeInTheDocument();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "LANDING_DEMO_SCENE_READY",
        requestId: "parent:scene-2",
        scene: "quote-deposit",
      }),
      window.location.origin,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "LANDING_DEMO_SELECT_SCENE",
            protocolVersion: LANDING_DEMO_PROTOCOL_VERSION,
            requestId: "parent:scene-3",
            scene: "retail-split",
          },
          origin: "https://attacker.example",
          source: window,
        }),
      );
    });

    expect(screen.queryByText("Split bill")).not.toBeInTheDocument();
  });
});
