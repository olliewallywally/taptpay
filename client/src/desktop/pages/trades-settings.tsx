import { DesktopSettingsPage } from "../DesktopSettingsPage";
import type { DesktopRoutePageProps } from "../DesktopPageScaffold";

/* Design screen 3e — the shared settings page in its trades flavour. It differs
   from 2e/4e only in the branding and the highlighted vertical, both of which
   the shared page derives from `vertical`. */
export default function DesktopTradesSettings(props: DesktopRoutePageProps) {
  return <DesktopSettingsPage {...props} vertical="trades" />;
}
