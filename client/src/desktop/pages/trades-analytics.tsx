import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopTradesAnalytics(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="trades" page="analytics" />
  );
}
