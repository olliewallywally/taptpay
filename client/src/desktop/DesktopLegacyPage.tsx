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
        {/* One entry bounce for the whole 430px column — the mobile page inside
            owns its own markup and is deliberately left un-cascaded. */}
        <div className="tapt-desktop-legacy-column dt-rise">{children}</div>
      </div>
    </DesktopPageScaffold>
  );
}
