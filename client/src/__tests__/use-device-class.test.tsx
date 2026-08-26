import { act, renderHook } from "@testing-library/react";
import {
  classifyDevice,
  useDeviceClass,
  type DeviceClass,
} from "../hooks/use-device-class";

const COARSE_POINTER_QUERY = "(pointer: coarse)";

describe("device class", () => {
  it.each<[number, number, boolean, DeviceClass]>([
    [390, 844, false, "mobile"],
    [844, 390, false, "mobile"],
    [700, 900, true, "mobile"],
    [768, 1024, true, "tablet"],
    [1024, 768, true, "tablet"],
    [720, 900, false, "tablet"],
    [900, 1200, false, "tablet"],
    [1024, 768, false, "desktop"],
    [1440, 900, false, "desktop"],
    [1440, 650, false, "mobile"],
  ])(
    "classifies %ix%i with coarse pointer %s as %s",
    (width, height, coarsePointer, expected) => {
      expect(classifyDevice(width, height, coarsePointer)).toBe(expected);
    },
  );
});

describe("useDeviceClass", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;
  const originalMatchMedia = window.matchMedia;

  let coarsePointer = false;
  let changeListeners: Set<(event: MediaQueryListEvent) => void>;
  let mediaQuery: MediaQueryList;

  function setViewport(width: number, height: number) {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: width,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: height,
    });
  }

  function emitPointerChange() {
    const event = {
      matches: coarsePointer,
      media: COARSE_POINTER_QUERY,
    } as MediaQueryListEvent;
    changeListeners.forEach((listener) => listener(event));
  }

  beforeEach(() => {
    coarsePointer = false;
    changeListeners = new Set();
    mediaQuery = {
      get matches() {
        return coarsePointer;
      },
      media: COARSE_POINTER_QUERY,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(
        (
          type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          if (type === "change") changeListeners.add(listener);
        },
      ),
      removeEventListener: jest.fn(
        (
          type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          if (type === "change") changeListeners.delete(listener);
        },
      ),
      dispatchEvent: jest.fn(),
    } as unknown as MediaQueryList;

    window.matchMedia = jest.fn(() => mediaQuery);
    setViewport(1440, 900);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    setViewport(originalInnerWidth, originalInnerHeight);
    jest.restoreAllMocks();
  });

  it("uses the current viewport and pointer class on its first render", () => {
    const { result } = renderHook(() => useDeviceClass());

    expect(result.current).toBe("desktop");
    expect(window.matchMedia).toHaveBeenCalledWith(COARSE_POINTER_QUERY);
  });

  it("reclassifies when the viewport is resized", () => {
    const { result } = renderHook(() => useDeviceClass());

    act(() => {
      setViewport(390, 844);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe("mobile");
  });

  it("reclassifies when the primary pointer mode changes", () => {
    const { result } = renderHook(() => useDeviceClass());
    expect(result.current).toBe("desktop");

    act(() => {
      coarsePointer = true;
      emitPointerChange();
    });

    expect(result.current).toBe("tablet");
  });

  it("removes its resize and pointer listeners on unmount", () => {
    const addWindowListener = jest.spyOn(window, "addEventListener");
    const removeWindowListener = jest.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useDeviceClass());

    const resizeRegistration = addWindowListener.mock.calls.find(
      ([type]) => type === "resize",
    );
    const pointerRegistration = (
      mediaQuery.addEventListener as jest.Mock
    ).mock.calls.find(([type]) => type === "change");

    expect(resizeRegistration).toBeDefined();
    expect(pointerRegistration).toBeDefined();

    unmount();

    expect(removeWindowListener).toHaveBeenCalledWith(
      "resize",
      resizeRegistration?.[1],
    );
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      pointerRegistration?.[1],
    );
    expect(changeListeners.size).toBe(0);
  });
});
