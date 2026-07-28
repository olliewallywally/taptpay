import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopTradesClients(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="trades" page="directory" />
  );
}
