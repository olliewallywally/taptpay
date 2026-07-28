import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopRetailSettings(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="retail" page="settings" />
  );
}
