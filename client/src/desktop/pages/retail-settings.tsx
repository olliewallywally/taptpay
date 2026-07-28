import { DesktopSettingsPage } from "../DesktopSettingsPage";
import type { DesktopRoutePageProps } from "../DesktopPageScaffold";

/* Design screen 4e — the shared settings page in its retail flavour. */
export default function DesktopRetailSettings(props: DesktopRoutePageProps) {
  return <DesktopSettingsPage {...props} vertical="retail" />;
}
