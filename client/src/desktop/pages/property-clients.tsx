import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopPropertyClients(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="property" page="directory" />
  );
}
