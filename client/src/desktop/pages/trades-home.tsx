import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopTradesHome(props: DesktopRoutePageProps) {
  return <DesktopPageScaffold {...props} vertical="trades" page="home" />;
}
