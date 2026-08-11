export const LANDING_DEMO_TOKEN_HEADER = "x-landing-demo-token" as const;
export const LANDING_DEMO_TTL_MS = 15 * 60 * 1000;
export const LANDING_DEMO_ACTIONS = ["selectScene", "tap", "reset", "setMode"] as const;
export type LandingDemoAction = typeof LANDING_DEMO_ACTIONS[number];
export type LandingDemoMode = "cinematic" | "live";
export interface LandingDemoState { sessionId: string; expiresAt: string; scene: string; step: number; mode: LandingDemoMode; lastAction: LandingDemoAction | null; transaction: { status: "idle" | "pending" | "paid"; amount: number; label: string }; }
export interface LandingDemoActionRequest { action: LandingDemoAction; scene?: string; target?: string; mode?: LandingDemoMode; }
export const isLandingDemoAction = (value: unknown): value is LandingDemoAction => typeof value === "string" && (LANDING_DEMO_ACTIONS as readonly string[]).includes(value);
