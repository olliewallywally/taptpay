import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopPropertyHome(props: DesktopRoutePageProps) {
  return <DesktopPageScaffold {...props} vertical="property" page="home" />;
}
