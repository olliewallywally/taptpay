import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DESKTOP_LOGICAL_HEIGHT,
  DESKTOP_LOGICAL_WIDTH,
} from "./desktop-theme";
import "./desktop.css";
import { browserZoomFactor } from '@/hooks/use-device-class';

interface MeasuredSize {
  width: number;
  height: number;
  zoom: number;
}

export interface ScaledCanvasProps {
  children: ReactNode;
  className?: string;
  logicalWidth?: number;
  logicalHeight?: number;
  maxScale?: number;
}

export function ScaledCanvas({
  children,
  className,
  logicalWidth = DESKTOP_LOGICAL_WIDTH,
  logicalHeight = DESKTOP_LOGICAL_HEIGHT,
  maxScale = Number.POSITIVE_INFINITY,
}: ScaledCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<MeasuredSize>({
    width: 0,
    height: 0,
    zoom: 1,
  });

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const next = {
        width: stage.getBoundingClientRect().width,
        height: stage.getBoundingClientRect().height,
        zoom: browserZoomFactor(),
      };
      setAvailable((current) =>
        current.width === next.width && current.height === next.height && current.zoom === next.zoom
          ? current
          : next,
      );
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const measuredScale =
    available.width > 0 && available.height > 0
      ? Math.min(
          available.width * available.zoom / logicalWidth,
          available.height * available.zoom / logicalHeight,
          available.zoom > 1 && stageRef.current?.closest('[data-device-class="desktop"]') ? 1000 / logicalWidth : Number.POSITIVE_INFINITY,
          maxScale,
        )
      : 0;
  const scale = Number.isFinite(measuredScale)
    ? Math.max(0, measuredScale)
    : 0;

  const stageClassName = className
    ? `tapt-desktop-scale-stage ${className}`
    : "tapt-desktop-scale-stage";

  return (
    <div ref={stageRef} className={stageClassName} data-browser-zoomed={available.zoom > 1 ? 'true' : undefined}
      role={available.zoom > 1 ? 'region' : undefined} aria-label={available.zoom > 1 ? 'Merchant app' : undefined} tabIndex={available.zoom > 1 ? 0 : undefined}>
      <div
        className="tapt-desktop-scale-box"
        style={{
          width: logicalWidth * scale,
          height: logicalHeight * scale,
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        <div
          className="tapt-desktop-scale-content"
          data-testid="desktop-scaled-canvas"
          data-desktop-scale={scale}
          style={{
            width: logicalWidth,
            height: logicalHeight,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default ScaledCanvas;
