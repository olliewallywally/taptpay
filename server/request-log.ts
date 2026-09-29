import type { NextFunction, Request, Response } from "express";

const SENSITIVE_KEY = /(?:authorization|password|secret|token|api[-_]?key|bank|account|processor|session|x[-_]?id)/i;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~-]+/gi;

export function redactSensitive(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redactSensitive(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([entryKey, entryValue]) => [entryKey, redactSensitive(entryValue, entryKey)]),
    );
  }
  if (typeof value !== "string") return value;
  return value
    .replace(BEARER, "Bearer [REDACTED]")
    .replace(JWT, "[REDACTED_JWT]")
    .replace(/\/(pay|split|checkout|receipt)\/t\/[^/?#\s]+/g, "/$1/t/:token")
    .replace(/\/api\/pay\/t\/[^/?#\s]+/g, "/api/pay/t/:token")
    .replace(/\/(api\/)?pay\/return\/[^/?#\s]+/g, "/$1pay/return/:state")
    .replace(/([?&](?:token|state|sessionid)=)[^&#\s]+/gi, "$1[REDACTED]");
}

export function requestRouteTemplate(req: Request) {
  const routePath = req.route?.path;
  if (typeof routePath === "string") return `${req.baseUrl || ""}${routePath}`;
  return String(redactSensitive(req.path));
}

export function createRequestLogger(writeLog: (line: string) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      if (!req.path.startsWith("/api")) return;
      const duration = Date.now() - startedAt;
      writeLog(
        `${req.method} ${requestRouteTemplate(req)} ${res.statusCode} in ${duration}ms`,
      );
    });
    next();
  };
}
