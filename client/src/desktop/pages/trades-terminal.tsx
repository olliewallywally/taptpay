import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopTradesTerminal(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="trades" page="terminal" />
  );
}
