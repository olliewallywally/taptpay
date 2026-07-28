import type { ReactNode } from "react";
import type { DeviceClass } from "@/hooks/use-device-class";
import { DesktopFrame } from "./DesktopFrame";
import { DesktopShell } from "./DesktopShell";
import { ScaledCanvas } from "./ScaledCanvas";
import type { DesktopPage, DesktopVertical } from "./desktop-theme";

export type { DesktopPage, DesktopVertical } from "./desktop-theme";

export interface DesktopRoutePageProps {
  deviceClass: Exclude<DeviceClass, "mobile">;
}

export interface DesktopPageScaffoldProps extends DesktopRoutePageProps {
  vertical: DesktopVertical;
  page: DesktopPage;
  children?: ReactNode;
}

export function DesktopPageScaffold({
  deviceClass,
  vertical,
  page,
  children,
}: DesktopPageScaffoldProps) {
  return (
    <DesktopFrame deviceClass={deviceClass}>
      <ScaledCanvas>
        <DesktopShell vertical={vertical} page={page}>
          {children}
        </DesktopShell>
      </ScaledCanvas>
    </DesktopFrame>
  );
}

export default DesktopPageScaffold;
