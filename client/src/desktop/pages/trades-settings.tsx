import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopTradesSettings(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="trades" page="settings" />
  );
}
