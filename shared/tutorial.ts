export const TUTORIAL_PAGE_KEYS = [
  "retail-dashboard",
  "retail-terminal",
  "retail-payment-stack",
  "retail-transactions",
  "retail-stock",
  "retail-nfc",
  "payment-board-builder",
  "settings",
  "property-dashboard",
  "property-tenants",
  "property-tenant-profile",
  "property-terminal",
  "property-analytics",
  "trades-dashboard",
  "trades-clients",
  "trades-client-profile",
  "trades-terminal",
  "trades-quote",
  "trades-recurring",
  "trades-analytics",
] as const;

export type TutorialPageKey = (typeof TUTORIAL_PAGE_KEYS)[number];
export type TutorialPageStatus = "started" | "completed" | "dismissed";

export function isTutorialPageKey(value: string): value is TutorialPageKey {
  return (TUTORIAL_PAGE_KEYS as readonly string[]).includes(value);
}

