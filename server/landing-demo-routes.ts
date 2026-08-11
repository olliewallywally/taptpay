import type { Express, Request, Response } from "express";
import { LANDING_DEMO_TOKEN_HEADER, type LandingDemoActionRequest } from "@shared/landing-demo";
import { applyLandingDemoAction, createLandingDemoSession, getLandingDemoSession, landingDemoAllowedActions } from "./landing-demo-service";
const noStore = (res: Response) => res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
const guard = (req: Request, res: Response) => { const s = getLandingDemoSession(req.get(LANDING_DEMO_TOKEN_HEADER)); if (!s) { noStore(res).status(401).json({ error: "landing_demo_session_invalid" }); return null; } return s; };
export function registerLandingDemoRoutes(app: Express): void {
  app.post("/api/landing-demo/sessions", (_req, res) => { noStore(res).status(201).json(createLandingDemoSession()); });
  app.get("/api/landing-demo/actions", (_req, res) => noStore(res).json({ actions: landingDemoAllowedActions() }));
  app.get("/api/landing-demo/state", (req, res) => { const s = guard(req, res); if (s) noStore(res).json(s.state); });
  app.post("/api/landing-demo/actions", (req, res) => { const s = guard(req, res); if (!s) return; const state = applyLandingDemoAction(s, req.body as LandingDemoActionRequest); if (!state) { noStore(res).status(400).json({ error: "landing_demo_action_invalid" }); return; } noStore(res).json(state); });
}
