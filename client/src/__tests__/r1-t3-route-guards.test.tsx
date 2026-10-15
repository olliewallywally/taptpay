/**
 * R1-T3 (plan §22.11): "Audit protection and device shell for /terminal, /stack, /smart-terminal,
 * /property/*, /trades/*, and /admin/*; test unauthenticated, member, owner, other tenant, and admin
 * cases."
 *
 * The whole app is rendered at each address, on the phone shell and on the tablet and desktop shells
 * (which put one guard around the signed-in frame, and the route's own guard inside it), for each
 * caller. The pages are stand-ins that record being shown, so a page shown for a moment before a
 * redirect counts. The two record pages are rendered for real for another business's record, with the
 * server's answer to it (404: c10-batch-6c-property, c10-batch-6d-trades). The guards only decide what
 * is shown; the server keeps the authority over every request (server/route-matrix.ts and its tests).
 *
 * The route table is also read: every route of the listed families must be classified here, so a new
 * one cannot arrive unguarded without this test being told.
 */
jest.mock("@/plugins/TaptPayPlugin", () => ({}));
jest.mock("@/pages/landing-page", () => ({ LandingPage: () => null }));
jest.mock("@/pages/login", () => ({ __esModule: true, default: () => null }));
jest.mock("@/pages/app-login", () => ({ __esModule: true, default: () => null }));
jest.mock("@/pages/merchant-signup", () => ({ __esModule: true, default: () => null }));
jest.mock("@/lib/push-device", () => ({
  resyncThisDevicePush: () => Promise.resolve(),
  stopThisDevicePush: () => Promise.resolve(),
}));
jest.mock("@/hooks/use-device-class", () => ({ useDeviceClass: () => mockShell }));

// Stand-in pages, each recording that it was shown.
jest.mock("@/pages/merchant-terminal-mobile-v2", () => mockPage("phone: retail terminal"));
jest.mock("@/pages/payment-stack", () => mockPage("phone: payment stack"));
jest.mock("@/pages/property/property-dashboard", () => mockPage("phone: property home"));
jest.mock("@/pages/property/tenant-directory", () => mockPage("phone: tenants"));
jest.mock("@/pages/property/tenant-profile", () => mockRecordPage("@/pages/property/tenant-profile", "phone: tenant profile"));
jest.mock("@/pages/property/property-analytics", () => mockPage("phone: property analytics"));
jest.mock("@/pages/property/property-terminal", () => mockPage("phone: property terminal"));
jest.mock("@/pages/trades/trades-dashboard", () => mockPage("phone: trades home"));
jest.mock("@/pages/trades/client-directory", () => mockPage("phone: trades clients"));
jest.mock("@/pages/trades/client-profile", () => mockRecordPage("@/pages/trades/client-profile", "phone: trades client"));
jest.mock("@/pages/trades/trades-analytics", () => mockPage("phone: trades analytics"));
jest.mock("@/pages/trades/trades-terminal", () => mockPage("phone: trades terminal"));
jest.mock("@/pages/trades/quote-builder", () => mockPage("phone: quote builder"));
jest.mock("@/pages/trades/recurring-schedules", () => mockPage("phone: recurring"));
jest.mock("@/desktop/pages/retail-terminal", () => mockPage("desktop: retail terminal"));
jest.mock("@/desktop/pages/property-home", () => mockPage("desktop: property home"));
jest.mock("@/desktop/pages/property-clients", () => mockPage("desktop: property clients"));
jest.mock("@/desktop/pages/property-analytics", () => mockPage("desktop: property analytics"));
jest.mock("@/desktop/pages/property-terminal", () => mockPage("desktop: property terminal"));
jest.mock("@/desktop/pages/trades-home", () => mockPage("desktop: trades home"));
jest.mock("@/desktop/pages/trades-clients", () => mockPage("desktop: trades clients"));
jest.mock("@/desktop/pages/trades-analytics", () => mockPage("desktop: trades analytics"));
jest.mock("@/desktop/pages/trades-terminal", () => mockPage("desktop: trades terminal"));
jest.mock("@/desktop/DesktopChrome", () => mockFrame());
jest.mock("@/desktop/DesktopLegacyPage", () => mockPassThrough());
jest.mock("@/pages/admin/AdminDashboard", () => mockPage("the admin area"));
jest.mock("@/pages/merchant-onboarding", () => mockPage("onboarding"));
jest.mock("@/pages/checkout", () => mockPage("customer checkout"));
jest.mock("@/pages/not-found", () => mockPage("not found"));
// Warmed in the background once signed in (never shown here).
jest.mock("@/pages/dashboard", () => mockPage("phone: retail home"));
jest.mock("@/pages/transactions", () => mockPage("phone: transactions"));
jest.mock("@/pages/stock-management", () => mockPage("phone: stock"));
jest.mock("@/pages/settings", () => mockPage("phone: settings"));
jest.mock("@/pages/nfc-payment", () => mockPage("phone: nfc"));
jest.mock("@/desktop/pages/retail-home", () => mockPage("desktop: retail home"));
jest.mock("@/desktop/pages/retail-stock", () => mockPage("desktop: retail stock"));
jest.mock("@/desktop/pages/retail-analytics", () => mockPage("desktop: retail analytics"));
jest.mock("@/desktop/pages/retail-settings", () => mockPage("desktop: retail settings"));
jest.mock("@/desktop/pages/property-settings", () => mockPage("desktop: property settings"));
jest.mock("@/desktop/pages/trades-settings", () => mockPage("desktop: trades settings"));

import { readFileSync } from "fs";
import { join } from "path";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { queryClient } from "../lib/queryClient";

type Shell = "mobile" | "tablet" | "desktop";
let mockShell: Shell = "mobile";
/** Every stand-in shown, in order: the pages' names, and "desktop frame". */
const mockShown: string[] = [];
/** The two record pages render for real while this is set. */
let mockRealRecordPages = false;

function mockPage(name: string) {
  const React = require("react");
  return {
    __esModule: true,
    default: function StandInPage() {
      mockShown.push(name);
      return React.createElement("main", { "data-testid": "page" }, name);
    },
  };
}

function mockRecordPage(path: string, name: string) {
  const React = require("react");
  const standIn = mockPage(name).default;
  return {
    __esModule: true,
    default: function RecordPage(props: object) {
      return React.createElement(mockRealRecordPages ? jest.requireActual(path).default : standIn, props);
    },
  };
}

function mockFrame() {
  const React = require("react");
  return {
    __esModule: true,
    default: function StandInFrame({ children, route }: { children: unknown; route: { vertical: string } }) {
      mockShown.push("desktop frame");
      return React.createElement("div", { "data-testid": "desktop-frame", "data-vertical": route.vertical }, children);
    },
  };
}

function mockPassThrough() {
  const React = require("react");
  return { __esModule: true, default: ({ children }: { children: unknown }) => React.createElement(React.Fragment, null, children) };
}

const SHELLS: Shell[] = ["mobile", "tablet", "desktop"];
/** Long enough for a page wrongly let through to load and render (the mutation checks set it). */
const SETTLE_MS = 50;
const RECORD_ID = "11111111-1111-4111-8111-111111111111";

/** The listed merchant pages: what each shell shows there, and the frame's vertical. */
const MERCHANT_PAGES: Record<string, { phone: string; desktop: string; vertical: string }> = {
  "/terminal": { phone: "phone: retail terminal", desktop: "desktop: retail terminal", vertical: "retail" },
  "/stack": { phone: "phone: payment stack", desktop: "desktop: retail terminal", vertical: "retail" },
  "/property": { phone: "phone: property home", desktop: "desktop: property home", vertical: "property" },
  "/property/tenants": { phone: "phone: tenants", desktop: "desktop: property clients", vertical: "property" },
  // The record pages keep the phone column inside the desktop frame.
  "/property/tenants/:id": { phone: "phone: tenant profile", desktop: "phone: tenant profile", vertical: "property" },
  "/property/analytics": { phone: "phone: property analytics", desktop: "desktop: property analytics", vertical: "property" },
  "/property/terminal": { phone: "phone: property terminal", desktop: "desktop: property terminal", vertical: "property" },
  "/trades": { phone: "phone: trades home", desktop: "desktop: trades home", vertical: "trades" },
  "/trades/clients": { phone: "phone: trades clients", desktop: "desktop: trades clients", vertical: "trades" },
  "/trades/clients/:id": { phone: "phone: trades client", desktop: "phone: trades client", vertical: "trades" },
  "/trades/analytics": { phone: "phone: trades analytics", desktop: "desktop: trades analytics", vertical: "trades" },
  "/trades/terminal": { phone: "phone: trades terminal", desktop: "desktop: trades terminal", vertical: "trades" },
  "/trades/quote": { phone: "phone: quote builder", desktop: "desktop: trades terminal", vertical: "trades" },
  "/trades/recurring": { phone: "phone: recurring", desktop: "desktop: trades terminal", vertical: "trades" },
};
const ADMIN_PAGES = ["/admin"];
/** Public by design: the customer's quote link (its token is the credential, checked by the server). */
const PUBLIC_PAGES = ["/trades/quote/:token"];

const address = (route: string) => route.replace(":id", RECORD_ID);

const jsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

// R1-T4 phase E: a sign-in is an HttpOnly session cookie the page cannot see. Who the browser is signed in
// as is the server's answer to the start-up check (/api/auth/session), and the admin area's (/api/admin/
// auth/me). What the page kept in storage before the switch is removed on the first load.
const session = (overrides: Record<string, unknown> = {}) => ({
  signedIn: true,
  user: { id: 7, email: "owner@example.test", merchantId: "22", role: "owner", onboardingCompleted: true, ...overrides },
  csrfToken: "c".repeat(43),
});
const ADMIN_ME = { user: { id: 1, email: "admin@example.test", merchantId: 0, role: "admin" }, csrfToken: "a".repeat(43) };

interface Caller {
  /** What the browser still holds in storage from before the switch (removed on the first load). */
  stored?: Record<string, string>;
  /** The server's answer to the start-up check, from the browser's session cookie. */
  session?: ReturnType<typeof session> | { signedIn: false };
  /** The server's answer to the admin area's check, from the browser's admin session cookie. */
  adminMe?: number;
}

const CALLERS: Record<string, Caller & { merchantPages: "page" | "sign-in" | "onboarding" }> = {
  "signed out": { merchantPages: "sign-in" },
  "a session the server refuses (expired; a disabled login; a suspended business)": {
    stored: { authToken: "an-old-stored-token" }, session: { signedIn: false }, merchantPages: "sign-in",
  },
  "the owner": { session: session(), merchantPages: "page" },
  "a teammate": { session: session({ id: 8, role: "member" }), merchantPages: "page" },
  "another business's owner": { session: session({ id: 9, merchantId: "99" }), merchantPages: "page" },
  "the platform admin (the admin area's own session)": { adminMe: 200, merchantPages: "sign-in" },
  "an owner who has not finished onboarding": {
    session: session({ onboardingCompleted: false }), merchantPages: "onboarding",
  },
};

let store: Record<string, string>;
let requests: string[];

/** The server, as each caller meets it. Another business's record is answered as a missing one. */
function serve(caller: Caller) {
  requests = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (url === "/api/auth/session") return jsonResponse(200, caller.session ?? { signedIn: false });
    if (url === "/api/auth/me") {
      return caller.session?.signedIn ? jsonResponse(200, { user: caller.session.user }) : jsonResponse(401, {});
    }
    if (url === "/api/admin/auth/me") {
      return caller.adminMe === 200 ? jsonResponse(200, ADMIN_ME) : jsonResponse(caller.adminMe ?? 401, { message: "Invalid admin session" });
    }
    if (url === "/api/tutorial/state") return jsonResponse(200, { autoEnabled: false, generation: 1, progress: {}, pageCount: 0 });
    if (url.startsWith(`/api/property/tenants/${RECORD_ID}`)) return jsonResponse(404, { message: "Tenant not found" });
    if (url.startsWith(`/api/trades/clients/${RECORD_ID}`)) return jsonResponse(404, { message: "Client not found" });
    if (/^\/api\/(property|trades)\//.test(url)) return jsonResponse(200, []);
    return jsonResponse(404, { message: "Not found" });
  }) as unknown as typeof fetch;
}

async function open(shell: Shell, path: string, caller: Caller) {
  mockShell = shell;
  store = { ...(caller.stored ?? {}) };
  serve(caller);
  window.history.pushState({}, "", path);
  render(<App />);
}

/** Lets the last redirects, chunk loads and renders finish inside act. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  });
}

/** The browser's storage is `store`, for the case. */
function holdStorage() {
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => store[key] ?? null);
  jest.spyOn(Storage.prototype, "setItem").mockImplementation((key: string, value: string) => {
    store[key] = String(value);
  });
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation((key: string) => {
    delete store[key];
  });
}

// The signed-in frame's code is loaded once, first, as a returning visitor's browser holds it. Cold, it
// arrives only after the sign-in redirect on the first framed case, so a guard letting the page through
// would go unseen there (breaking the guard showed it: that case alone stayed green).
beforeAll(async () => {
  holdStorage();
  await open("tablet", "/terminal", CALLERS["the owner"]);
  await screen.findByTestId("desktop-frame");
  await settle();
  cleanup();
  queryClient.clear();
  jest.restoreAllMocks();
});

beforeEach(() => {
  mockShown.length = 0;
  mockRealRecordPages = false;
  holdStorage();
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

describe("R1-T3 — every route of the listed families is classified", () => {
  const APP = readFileSync(join(__dirname, "..", "App.tsx"), "utf8");

  /** Each <Route path="…"> in the route table, and the guard its element sits behind. */
  function routesInTable() {
    const table = APP.slice(APP.indexOf("function RouteTable("));
    const found: Array<{ path: string; guard: "merchant" | "admin" | "none" }> = [];
    const opening = /<Route path="([^"]+)"([^>]*?)(\/?)>/g;
    for (let m = opening.exec(table); m; m = opening.exec(table)) {
      const body = m[3] === "/" ? "" : table.slice(opening.lastIndex, table.indexOf("</Route>", opening.lastIndex));
      const guard = /<AdminProtectedRoute/.test(body) ? "admin" : /<ProtectedRoute/.test(body) ? "merchant" : "none";
      found.push({ path: m[1], guard });
    }
    return found;
  }

  it("and each sits behind its guard (a new route there must be added here, with its guard)", () => {
    const listed = /^\/(terminal|stack|smart-terminal|property|trades|admin)(\/|$)/;
    const expected = [
      ...Object.keys(MERCHANT_PAGES).map((path) => ({ path, guard: "merchant" })),
      ...ADMIN_PAGES.map((path) => ({ path, guard: "admin" })),
      ...PUBLIC_PAGES.map((path) => ({ path, guard: "none" })),
    ];
    const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);
    expect(routesInTable().filter(({ path }) => listed.test(path)).sort(byPath)).toEqual(expected.sort(byPath));
  });
});

describe.each(SHELLS)("R1-T3 — the merchant pages, on the %s shell", (shell) => {
  const framed = shell !== "mobile";

  describe.each(Object.entries(CALLERS))("for %s", (_label, caller) => {
    it.each(Object.keys(MERCHANT_PAGES))("%s", async (route) => {
      const path = address(route);
      const expected = MERCHANT_PAGES[route];
      await open(shell, path, caller);

      if (caller.merchantPages === "page") {
        const page = await screen.findByTestId("page");
        expect(page).toHaveTextContent(framed ? expected.desktop : expected.phone);
        if (framed) {
          expect(screen.getByTestId("desktop-frame")).toContainElement(page);
          expect(screen.getByTestId("desktop-frame")).toHaveAttribute("data-vertical", expected.vertical);
        } else {
          expect(screen.queryByTestId("desktop-frame")).not.toBeInTheDocument();
        }
        expect(window.location.pathname).toBe(path);
      } else {
        const destination = caller.merchantPages === "sign-in" ? "/login" : "/onboarding";
        await waitFor(() => expect(window.location.pathname).toBe(destination));
        if (destination === "/login") expect(new URLSearchParams(window.location.search).get("returnTo")).toBe(path);
      }
      await settle();

      // Nothing of the page, or of the signed-in frame, was shown to a caller it was not for, even briefly.
      const shownHere = mockShown.filter((name) => name !== "onboarding");
      if (caller.merchantPages !== "page") expect(shownHere).toEqual([]);
    });
  });
});

describe.each(SHELLS)("R1-T3 — another business's record, on the %s shell", (shell) => {
  it.each([
    ["/property/tenants/:id", "tenant not found"],
    ["/trades/clients/:id", "client not found"],
  ])("%s shows the page's not-found for the server's answer (404)", async (route, notFound) => {
    mockRealRecordPages = true;
    await open(shell, address(route), CALLERS["another business's owner"]);

    expect(await screen.findByText(notFound, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(requests).toContain(`/api/${route.split("/")[1]}/${route.includes("tenants") ? "tenants" : "clients"}/${RECORD_ID}`);
    await settle();
  });
});

describe.each(SHELLS)("R1-T3 — the admin area, on the %s shell", (shell) => {
  // jsdom cannot navigate: the guard's move to /login (window.location.href) is reported, not made.
  // That report is caught here; everything else goes on to the setup's React-problem watcher.
  let navigations: number;
  beforeEach(() => {
    navigations = 0;
    const watcher = console.error;
    jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (args.map(String).join(" ").includes("Not implemented: navigation")) navigations += 1;
      else watcher(...args);
    });
  });
  const triedToLeave = () => navigations > 0;

  it.each(["/admin", "/admin/merchants"])("%s: shown to the platform admin, bare (no frame)", async (path) => {
    await open(shell, path, CALLERS["the platform admin (the admin area's own session)"]);

    expect(await screen.findByTestId("page")).toHaveTextContent("the admin area");
    expect(screen.queryByTestId("desktop-frame")).not.toBeInTheDocument();
    expect(requests).toContain("/api/admin/auth/me");
    await settle();
  });

  it.each([
    ["signed out", CALLERS["signed out"]],
    ["the owner", CALLERS["the owner"]],
    ["a teammate", CALLERS["a teammate"]],
    ["another business's owner", CALLERS["another business's owner"]],
  ])("/admin: not shown to %s, whom the admin check refuses and sends to sign in", async (_label, caller) => {
    await open(shell, "/admin", caller);
    await waitFor(() => expect(triedToLeave()).toBe(true));
    await settle();

    expect(mockShown).toEqual([]);
    // The admin's sign-in is a cookie the page cannot see, so the area always asks (R1-T4 phase E).
    expect(requests).toContain("/api/admin/auth/me");
  });

  it("/admin: not shown when the server refuses the admin session; what was stored before the switch is removed", async () => {
    await open(shell, "/admin", { stored: { adminAuthToken: "refused", adminUser: "{}" }, adminMe: 401 });
    await waitFor(() => expect(triedToLeave()).toBe(true));
    await settle();

    expect(mockShown).toEqual([]);
    expect(store).toEqual({});
  });
});

describe.each(SHELLS)("R1-T3 — the public and retired addresses, on the %s shell", (shell) => {
  it("the customer's quote link is shown signed out, bare (public by design)", async () => {
    await open(shell, "/trades/quote/a-customer-quote-token", CALLERS["signed out"]);

    expect(await screen.findByTestId("page")).toHaveTextContent("customer checkout");
    expect(screen.queryByTestId("desktop-frame")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/trades/quote/a-customer-quote-token");
    await settle();
  });

  it.each([["signed out", CALLERS["signed out"]], ["the owner", CALLERS["the owner"]]])(
    "/smart-terminal is not found for %s (retired, owner decision 2026-09-27)",
    async (_label, caller) => {
      await open(shell, "/smart-terminal", caller);

      expect(await screen.findByTestId("page")).toHaveTextContent("not found");
      await settle();
      expect([...new Set(mockShown)]).toEqual(["not found"]);
    },
  );
});
