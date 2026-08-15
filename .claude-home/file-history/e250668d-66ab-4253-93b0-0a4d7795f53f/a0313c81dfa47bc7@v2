export const DESKTOP_LOGICAL_WIDTH = 1180;
export const DESKTOP_LOGICAL_HEIGHT = 880;
export const DESKTOP_TARGET_WIDTH = 1000;
export const DESKTOP_TARGET_SCALE =
  DESKTOP_TARGET_WIDTH / DESKTOP_LOGICAL_WIDTH;

/* The chrome route map lives in `@/lib/desktop-chrome-route` so the router can
   match a location without pulling any desktop UI onto a phone. Re-exported
   here because desktop code has always imported these from this module. */
export type {
  DesktopVertical,
  DesktopPage,
  DesktopChromeRoute,
} from "@/lib/desktop-chrome-route";
export { desktopChromeForLocation } from "@/lib/desktop-chrome-route";

import type { DesktopPage, DesktopVertical } from "@/lib/desktop-chrome-route";

export const DESKTOP_COLORS = {
  backdrop: "#F4F4F4",
  canvas: "#000F3F",
  accent: "#5E9EFF",
  active: "#66A9FF",
  navDim: "#4A86F0",
  accentSoft: "#7FB2FF",
  text: "#FFFFFF",
  textSoft: "#F4F6FF",
  ink: "#04103A",
  reportInk: "#12162E",
  chip: "#0F1747",
  sheet: "#F4F5F8",
  lightBorder: "#E2E5EE",
  success: "#35D07F",
  warning: "#F0A34E",
  danger: "#F0656C",
} as const;

export const DESKTOP_EFFECTS = {
  blueBorder: "rgba(94, 158, 255, 0.55)",
  divider: "rgba(94, 158, 255, 0.30)",
  frameBorder: "rgba(94, 158, 255, 0.18)",
  glass: "rgba(255, 255, 255, 0.06)",
  glassBorder: "rgba(255, 255, 255, 0.10)",
  frameShadow: "0 40px 120px rgba(0, 0, 0, 0.55)",
} as const;

export const DESKTOP_FONT_FAMILY =
  "'Outfit', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const DESKTOP_WORDMARK_FONT_FAMILY =
  "'Larken', Georgia, 'Times New Roman', serif";

export interface DesktopNavItem {
  id: DesktopPage;
  label: string;
  path: string;
}

const SHARED_NAV_END: readonly DesktopNavItem[] = [
  { id: "terminal", label: "Terminal", path: "/terminal" },
  { id: "analytics", label: "Analytics", path: "/transactions" },
  { id: "settings", label: "Settings", path: "/settings" },
];

export const DESKTOP_NAV_ITEMS: Record<
  DesktopVertical,
  readonly DesktopNavItem[]
> = {
  retail: [
    { id: "home", label: "Home", path: "/dashboard" },
    { id: "directory", label: "Stock", path: "/stock" },
    ...SHARED_NAV_END,
  ],
  property: [
    { id: "home", label: "Home", path: "/property" },
    { id: "directory", label: "Clients", path: "/property/tenants" },
    { id: "terminal", label: "Terminal", path: "/property/terminal" },
    { id: "analytics", label: "Analytics", path: "/property/analytics" },
    { id: "settings", label: "Settings", path: "/settings" },
  ],
  trades: [
    { id: "home", label: "Home", path: "/trades" },
    { id: "directory", label: "Clients", path: "/trades/clients" },
    { id: "terminal", label: "Terminal", path: "/trades/terminal" },
    { id: "analytics", label: "Analytics", path: "/trades/analytics" },
    { id: "settings", label: "Settings", path: "/settings" },
  ],
};

export const DESKTOP_SCOPE_LABELS: Record<DesktopVertical, string> = {
  retail: "my store",
  property: "all properties",
  trades: "all sites",
};

export const DESKTOP_MODE_STORAGE_KEY = "taptMode";

export function saveDesktopMode(vertical: DesktopVertical): void {
  try {
    localStorage.setItem(DESKTOP_MODE_STORAGE_KEY, vertical);
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

export function readDesktopMode(): DesktopVertical {
  try {
    const stored = localStorage.getItem(DESKTOP_MODE_STORAGE_KEY);
    if (stored === "property" || stored === "trades" || stored === "retail") {
      return stored;
    }
  } catch {
    // Fall through to the default.
  }
  return "retail";
}
