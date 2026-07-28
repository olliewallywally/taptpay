import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopRetailAnalytics(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="retail" page="analytics" />
  );
}
