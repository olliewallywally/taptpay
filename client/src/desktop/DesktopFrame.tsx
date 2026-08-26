import type { ReactNode } from "react";
import type { DeviceClass } from "@/hooks/use-device-class";
import "./desktop.css";

export type DesktopDeviceClass = Exclude<DeviceClass, "mobile">;

export interface DesktopFrameProps {
  children: ReactNode;
  deviceClass: DesktopDeviceClass;
  className?: string;
}

export function DesktopFrame({
  children,
  deviceClass,
  className,
}: DesktopFrameProps) {
  const viewportClassName = className
    ? `tapt-desktop-viewport ${className}`
    : "tapt-desktop-viewport";

  return (
    <div
      className={viewportClassName}
      data-device-class={deviceClass}
      data-testid="desktop-frame"
    >
      <div className="tapt-desktop-frame">{children}</div>
    </div>
  );
}

export default DesktopFrame;
