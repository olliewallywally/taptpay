import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopRetailStock(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="retail" page="directory" />
  );
}
