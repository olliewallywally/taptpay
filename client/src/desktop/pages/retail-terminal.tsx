import {
  DesktopPageScaffold,
  type DesktopRoutePageProps,
} from "../DesktopPageScaffold";

export default function DesktopRetailTerminal(props: DesktopRoutePageProps) {
  return (
    <DesktopPageScaffold {...props} vertical="retail" page="terminal" />
  );
}
