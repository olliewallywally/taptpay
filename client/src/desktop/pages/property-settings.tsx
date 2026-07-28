import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopPropertySettings(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="property" page="settings" />
  );
}
