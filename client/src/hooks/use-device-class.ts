import { useEffect, useState } from "react";

export type DeviceClass = "mobile" | "tablet" | "desktop";

const COARSE_POINTER_QUERY = "(pointer: coarse)";

export function classifyDevice(
  width: number,
  height: number,
  hasCoarsePointer: boolean,
): DeviceClass {
  if (
    Math.min(width, height) < 700 ||
    (hasCoarsePointer && width < 768)
  ) {
    return "mobile";
  }

  if (hasCoarsePointer) return "tablet";
  if (width >= 1024) return "desktop";
  return "tablet";
}

function readDeviceClass(): DeviceClass {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "mobile";
  }

  return classifyDevice(
    window.innerWidth,
    window.innerHeight,
    window.matchMedia(COARSE_POINTER_QUERY).matches,
  );
}

export function useDeviceClass(): DeviceClass {
  const [deviceClass, setDeviceClass] = useState<DeviceClass>(readDeviceClass);

  useEffect(() => {
    const coarsePointer = window.matchMedia(COARSE_POINTER_QUERY);
    const update = () => {
      setDeviceClass(
        classifyDevice(
          window.innerWidth,
          window.innerHeight,
          coarsePointer.matches,
        ),
      );
    };

    window.addEventListener("resize", update);
    coarsePointer.addEventListener("change", update);
    update();

    return () => {
      window.removeEventListener("resize", update);
      coarsePointer.removeEventListener("change", update);
    };
  }, []);

  return deviceClass;
}
