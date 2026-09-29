/* Merchant-facing desktop preferences from the design's Dashboard Preferences
   section. Stored per merchant in localStorage for v1 — there are no merchant
   settings columns for these yet (plan §6). Only preferences that actually
   drive a screen live here; the design's other props stay out until the screen
   they control supports them. */

export type HistoryStart = "peek" | "expanded";

export interface DesktopPrefs {
  /** Analytics: does the Payment History sheet start peeking or expanded? */
  historyStart: HistoryStart;
}

export const DEFAULT_DESKTOP_PREFS: DesktopPrefs = { historyStart: "peek" };

const keyFor = (merchantId: string | number | null | undefined) =>
  `taptDesktopPrefs:${merchantId ?? "anon"}`;

export function readDesktopPrefs(merchantId: string | number | null | undefined): DesktopPrefs {
  if (typeof window === "undefined") return DEFAULT_DESKTOP_PREFS;
  try {
    const raw = window.localStorage.getItem(keyFor(merchantId));
    if (!raw) return DEFAULT_DESKTOP_PREFS;
    const parsed = JSON.parse(raw) as Partial<DesktopPrefs>;
    return {
      historyStart: parsed.historyStart === "expanded" ? "expanded" : "peek",
    };
  } catch {
    return DEFAULT_DESKTOP_PREFS;
  }
}

export function writeDesktopPrefs(
  merchantId: string | number | null | undefined,
  patch: Partial<DesktopPrefs>,
): DesktopPrefs {
  const next = { ...readDesktopPrefs(merchantId), ...patch };
  try {
    window.localStorage.setItem(keyFor(merchantId), JSON.stringify(next));
  } catch {
    /* Private-mode or storage-full: the preference just doesn't persist. */
  }
  return next;
}
