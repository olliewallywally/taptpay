import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopPropertyAnalytics(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="property" page="analytics" />
  );
}
