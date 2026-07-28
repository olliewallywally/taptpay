import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopRetailHome(props: DesktopRoutePageProps) {
  return <DesktopPageScaffold {...props} vertical="retail" page="home" />;
}
