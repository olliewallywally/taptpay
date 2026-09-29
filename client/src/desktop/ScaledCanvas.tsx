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

interface MeasuredSize {
  width: number;
  height: number;
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
  });

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const next = {
        width: stage.clientWidth,
        height: stage.clientHeight,
      };
      setAvailable((current) =>
        current.width === next.width && current.height === next.height
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
          available.width / logicalWidth,
          available.height / logicalHeight,
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
    <div ref={stageRef} className={stageClassName}>
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
