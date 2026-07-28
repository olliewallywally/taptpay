import { DesktopSettingsPage } from "../DesktopSettingsPage";
import type { DesktopRoutePageProps } from "../DesktopPageScaffold";

/* Design screen 2e — the shared settings page in its property flavour. */
export default function DesktopPropertySettings(props: DesktopRoutePageProps) {
  return <DesktopSettingsPage {...props} vertical="property" />;
}
