/**
 * The location → desktop chrome map.
 *
 * This lives outside `client/src/desktop/` on purpose. The router has to decide
 * whether a location is a tablet/desktop app screen *before* it can render (or
 * skip) the chrome, so whatever answers that question is reachable from the
 * entry chunk on every device. Keeping it here means a phone downloads this
 * table and nothing else — no frame, no shell, no `desktop.css`. The isolation
 * is asserted by `scripts/verify-desktop-p0.mjs`, which fails if a 390×844
 * client requests any `/src/desktop/` module.
 *
 * `desktop-theme.ts` re-exports these so desktop code keeps importing from the
 * one place it always has.
 */

export type DesktopVertical = "retail" | "property" | "trades";

export type DesktopPage =
  | "home"
  | "directory"
  | "terminal"
  | "analytics"
  | "settings";

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

/**
 * Resolves the chrome a location should wear.
 *
 * `null` means "no chrome": public checkout, auth, and admin routes render bare
 * on every device.
 */
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
