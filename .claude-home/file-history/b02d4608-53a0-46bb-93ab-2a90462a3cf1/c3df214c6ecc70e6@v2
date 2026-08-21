import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useLocation } from "wouter";
import { TERMINAL_DOCK_ITEMS, TerminalDockView, type TerminalDockMode } from "@/features/navigation/TerminalDockView";
import { getDockCollapse, getDockCollapseServer, subscribeDockCollapse } from "@/features/navigation/dock-collapse-store";

const RETAIL_NAV_PATHS = ["/dashboard", "/stock", "/transactions", "/settings", "/terminal"];

function readMode(): TerminalDockMode {
  try { return (localStorage.getItem("taptMode") as TerminalDockMode) || "retail"; }
  catch { return "retail"; }
}
function saveMode(mode: TerminalDockMode) {
  try { localStorage.setItem("taptMode", mode); }
  catch { /* Route-derived navigation still works without storage. */ }
}
const itemIsActive = (path: string, location: string) => {
  if (path === "/dashboard" || path === "/property" || path === "/trades") return location === path;
  if (path === "/settings" || path === "/terminal" || path === "/trades/terminal") return location === path;
  return location === path || location.startsWith(`${path}/`);
};

export function BottomNavigation() {
  const [location, setLocation] = useLocation();
  const [, startTransition] = useTransition();
  const [storedMode, setStoredMode] = useState<TerminalDockMode>(readMode);
  const collapse = useSyncExternalStore(subscribeDockCollapse, getDockCollapse, getDockCollapseServer);

  useEffect(() => {
    if (location.startsWith("/trades")) { saveMode("trades"); setStoredMode("trades"); }
    else if (location.startsWith("/property")) { saveMode("property"); setStoredMode("property"); }
    else if (RETAIL_NAV_PATHS.includes(location) && location !== "/settings") { saveMode("retail"); setStoredMode("retail"); }
  }, [location]);

  const isTradesMode = location.startsWith("/trades") || storedMode === "trades";
  const isPropertyMode = !isTradesMode && (location.startsWith("/property") || storedMode === "property");
  const mode: TerminalDockMode = isTradesMode ? "trades" : isPropertyMode ? "property" : "retail";
  const onRetailPage = RETAIL_NAV_PATHS.includes(location);
  const onPropertyPage = location.startsWith("/property");
  const onTradesPage = location.startsWith("/trades") && !location.startsWith("/trades/quote/");
  if (!onRetailPage && !onPropertyPage && !onTradesPage) return null;

  const activeItem = TERMINAL_DOCK_ITEMS[mode].find((item) => itemIsActive(item.path, location));
  return <TerminalDockView mode={mode} activeId={activeItem?.id ?? ""} onPick={({ path }) => startTransition(() => setLocation(path))} collapse={collapse} />;
}
