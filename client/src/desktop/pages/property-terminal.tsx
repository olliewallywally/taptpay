import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopPropertyTerminal(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="property" page="terminal" />
  );
}
