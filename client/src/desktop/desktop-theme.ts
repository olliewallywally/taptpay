export const DESKTOP_LOGICAL_WIDTH = 1180;
export const DESKTOP_LOGICAL_HEIGHT = 880;
export const DESKTOP_TARGET_WIDTH = 1000;
export const DESKTOP_TARGET_SCALE =
  DESKTOP_TARGET_WIDTH / DESKTOP_LOGICAL_WIDTH;

export type DesktopVertical = "retail" | "property" | "trades";
export type DesktopPage =
  | "home"
  | "directory"
  | "terminal"
  | "analytics"
  | "settings";

export const DESKTOP_COLORS = {
  backdrop: "#000926",
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

/* ── Which routes wear the desktop chrome ──────────────────────────────────
 *
 * The frame + header + nav are mounted ONCE above the router, so the chrome has
 * to know the active vertical/page from the location alone — a child reporting
 * upward would land a frame late and reintroduce the blank it exists to remove.
 *
 * `null` means "no chrome": public checkout, auth, and admin routes render bare
 * on every device.
 */
export interface DesktopChromeRoute {
  vertical: DesktopVertical;
  page: DesktopPage;
  /** Legacy mobile-in-a-column screens keep the shell's own scope button. */
  showScope: boolean;
  /** Legacy screens render the phone column rather than a ported design. */
  legacy: boolean;
}

const STATIC_CHROME_ROUTES: Record<
  string,
  Omit<DesktopChromeRoute, "showScope" | "legacy"> & Partial<DesktopChromeRoute>
> = {
  "/dashboard": { vertical: "retail", page: "home" },
  "/stock": { vertical: "retail", page: "directory" },
  "/terminal": { vertical: "retail", page: "terminal" },
  "/stack": { vertical: "retail", page: "terminal" },
  "/transactions": { vertical: "retail", page: "analytics" },
  "/nfc": { vertical: "retail", page: "terminal", showScope: true, legacy: true },
  "/board-builder": { vertical: "retail", page: "settings", legacy: true },
  "/property": { vertical: "property", page: "home" },
  "/property/tenants": { vertical: "property", page: "directory" },
  "/property/terminal": { vertical: "property", page: "terminal" },
  "/property/analytics": { vertical: "property", page: "analytics" },
  "/trades": { vertical: "trades", page: "home" },
  "/trades/clients": { vertical: "trades", page: "directory" },
  "/trades/terminal": { vertical: "trades", page: "terminal" },
  "/trades/quote": { vertical: "trades", page: "terminal" },
  "/trades/recurring": { vertical: "trades", page: "terminal" },
  "/trades/analytics": { vertical: "trades", page: "analytics" },
};

/** `/x/:id` profile routes, which render the legacy phone column. */
const PROFILE_CHROME_PREFIXES: ReadonlyArray<
  [prefix: string, vertical: DesktopVertical]
> = [
  ["/property/tenants/", "property"],
  ["/trades/clients/", "trades"],
];

export function desktopChromeForLocation(
  location: string,
  settingsVertical: DesktopVertical,
): DesktopChromeRoute | null {
  const path = location.replace(/[?#].*$/, "").replace(/(.)\/+$/, "$1");

  /* Settings is one route shared by all three verticals; the caller resolves
     which nav to show from the merchant's mode. */
  if (path === "/settings") {
    return {
      vertical: settingsVertical,
      page: "settings",
      showScope: false,
      legacy: false,
    };
  }

  const staticMatch = STATIC_CHROME_ROUTES[path];
  if (staticMatch) {
    return {
      vertical: staticMatch.vertical,
      page: staticMatch.page,
      showScope: staticMatch.showScope ?? false,
      legacy: staticMatch.legacy ?? false,
    };
  }

  for (const [prefix, vertical] of PROFILE_CHROME_PREFIXES) {
    /* `/trades/quote/:token` is a PUBLIC checkout and deliberately absent here —
       only the two profile prefixes take an id segment. */
    const rest = path.startsWith(prefix) ? path.slice(prefix.length) : "";
    if (rest && !rest.includes("/")) {
      return { vertical, page: "directory", showScope: true, legacy: true };
    }
  }

  return null;
}

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
