import express, {
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from "express";
import {
  LANDING_DEMO_BODY_LIMIT_BYTES,
  LANDING_DEMO_TOKEN_HEADER,
  isLandingDemoToken,
  type LandingDemoSnapshot,
} from "@shared/landing-demo";
import {
  landingDemoActionSchema,
  landingDemoEmptyBodySchema,
} from "./landing-demo-schema";
import { LandingDemoService } from "./landing-demo-service";

export const LANDING_DEMO_API_PREFIX = "/api/landing-demo" as const;

const errorBody = (code: string) => ({ error: { code } });

function setDemoHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  next();
}

function rejectAlternateAuthority(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.get("authorization") || req.get("cookie") || Object.keys(req.query).length) {
    res.status(400).json(errorBody("DEMO_REQUEST_INVALID"));
    return;
  }
  next();
}

function expectedOrigin(req: Request): string | null {
  const host = req.get("host");
  if (!host) return null;
  const forwarded = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwarded || req.protocol}://${host}`;
}

function validateMutationMetadata(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!["POST", "DELETE"].includes(req.method)) {
    next();
    return;
  }
  const origin = req.get("origin");
  if (!origin || origin !== expectedOrigin(req) ||
      req.get("sec-fetch-site") !== "same-origin" ||
      req.get("sec-fetch-mode") !== "cors" ||
      req.get("sec-fetch-dest") !== "empty") {
    res.status(403).json(errorBody("DEMO_REQUEST_FORBIDDEN"));
    return;
  }
  if (req.method === "POST" && !req.is("application/json")) {
    res.status(415).json(errorBody("DEMO_CONTENT_TYPE_REQUIRED"));
    return;
  }
  if (req.method === "DELETE" && req.get("content-type") && !req.is("application/json")) {
    res.status(415).json(errorBody("DEMO_CONTENT_TYPE_REQUIRED"));
    return;
  }
  next();
}

function tokenFrom(req: Request, res: Response): string | null {
  const token = req.get(LANDING_DEMO_TOKEN_HEADER);
  if (!isLandingDemoToken(token)) {
    res.status(401).json(errorBody("DEMO_SESSION_INVALID"));
    return null;
  }
  return token;
}

function sendSnapshot(res: Response, snapshot: LandingDemoSnapshot): void {
  res.json(snapshot);
}

export function createLandingDemoRouter(
  service = new LandingDemoService(),
): Router {
  const router = express.Router();
  router.use(setDemoHeaders);
  router.use(rejectAlternateAuthority);
  router.use(validateMutationMetadata);
  router.use(express.json({ limit: LANDING_DEMO_BODY_LIMIT_BYTES, strict: true }));

  router.post("/session", (req, res) => {
    if (req.get(LANDING_DEMO_TOKEN_HEADER) ||
        !landingDemoEmptyBodySchema.safeParse(req.body ?? {}).success) {
      res.status(400).json(errorBody("DEMO_REQUEST_INVALID"));
      return;
    }
    const result = service.create(req.ip || req.socket.remoteAddress || "unknown");
    if (result.kind === "rate-limited") {
      res.status(429).json(errorBody("DEMO_RATE_LIMITED"));
      return;
    }
    if (result.kind === "capacity") {
      res.status(503).json(errorBody("DEMO_CAPACITY"));
      return;
    }
    res.status(201).json(result.session);
  });

  router.get("/state", (req, res) => {
    const token = tokenFrom(req, res);
    if (!token) return;
    const result = service.read(token);
    if (result.kind === "expired") {
      res.status(410).json(errorBody("DEMO_SESSION_EXPIRED"));
      return;
    }
    sendSnapshot(res, result.snapshot);
  });

  router.post("/action", (req, res) => {
    const token = tokenFrom(req, res);
    if (!token) return;
    if (service.read(token).kind === "expired") {
      res.status(410).json(errorBody("DEMO_SESSION_EXPIRED"));
      return;
    }
    const parsed = landingDemoActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(errorBody("DEMO_ACTION_INVALID"));
      return;
    }
    const result = service.apply(token, parsed.data);
    switch (result.kind) {
      case "ok":
        sendSnapshot(res, result.snapshot);
        return;
      case "conflict":
        res.status(409).json(result.snapshot);
        return;
      case "expired":
        res.status(410).json(errorBody("DEMO_SESSION_EXPIRED"));
        return;
      case "rate-limited":
        res.status(429).json(errorBody("DEMO_RATE_LIMITED"));
        return;
      case "invalid-transition":
        res.status(422).json(errorBody("DEMO_ACTION_REJECTED"));
        return;
      case "state-too-large":
        res.status(413).json(errorBody("DEMO_STATE_TOO_LARGE"));
        return;
    }
  });

  router.delete("/session", (req, res) => {
    const token = tokenFrom(req, res);
    if (!token) return;
    if (!landingDemoEmptyBodySchema.safeParse(req.body ?? {}).success) {
      res.status(400).json(errorBody("DEMO_REQUEST_INVALID"));
      return;
    }
    if (!service.delete(token)) {
      res.status(410).json(errorBody("DEMO_SESSION_EXPIRED"));
      return;
    }
    res.status(204).end();
  });

  const parserError: ErrorRequestHandler = (error, _req, res, next) => {
    const parseError = error as { type?: string; status?: number };
    if (parseError.type === "entity.too.large" || parseError.status === 413) {
      res.status(413).json(errorBody("DEMO_BODY_TOO_LARGE"));
      return;
    }
    if (parseError.type === "entity.parse.failed" || parseError.status === 400) {
      res.status(400).json(errorBody("DEMO_JSON_INVALID"));
      return;
    }
    next(error);
  };
  router.use(parserError);
  return router;
}

/**
 * This must be called before the application's global express.json middleware.
 * The current autoscale deployment has no sticky routing, so production
 * integration remains gated until an approved shared ephemeral store exists.
 */
export function registerLandingDemoRoutes(
  app: Express,
  service = new LandingDemoService(),
): LandingDemoService {
  app.use(LANDING_DEMO_API_PREFIX, createLandingDemoRouter(service));
  return service;
}
