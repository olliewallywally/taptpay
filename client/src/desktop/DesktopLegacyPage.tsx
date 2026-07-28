import type { ReactNode } from "react";
import {
  DesktopPageScaffold,
  type DesktopPage,
  type DesktopRoutePageProps,
  type DesktopVertical,
} from "./DesktopPageScaffold";

export interface DesktopLegacyPageProps extends DesktopRoutePageProps {
  vertical: DesktopVertical;
  page: DesktopPage;
  children: ReactNode;
}

export default function DesktopLegacyPage({
  deviceClass,
  vertical,
  page,
  children,
}: DesktopLegacyPageProps) {
  return (
    <DesktopPageScaffold
      deviceClass={deviceClass}
      vertical={vertical}
      page={page}
    >
      <div className="tapt-desktop-legacy-wrap">
        <div className="tapt-desktop-legacy-column">{children}</div>
      </div>
    </DesktopPageScaffold>
  );
}
