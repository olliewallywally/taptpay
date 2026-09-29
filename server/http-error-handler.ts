import type { ErrorRequestHandler } from "express";

type ErrorLike = { status?: unknown; statusCode?: unknown; message?: unknown };

export function errorStatus(error: unknown): number {
  const candidate = error as ErrorLike | null | undefined;
  const value = candidate?.status ?? candidate?.statusCode;
  return typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : 500;
}

export function publicErrorMessage(error: unknown, status = errorStatus(error)): string {
  if (status >= 500) return "Internal Server Error";
  const message = (error as ErrorLike | null | undefined)?.message;
  return typeof message === "string" && message.trim() ? message : "Request failed";
}

export function createGlobalErrorHandler(
  log: (message: string, error: unknown) => void = (message, error) => console.error(message, error),
): ErrorRequestHandler {
  return (error, _req, res, next) => {
    log("[EXPRESS_ERROR]", error);
    if (res.headersSent) {
      next(error);
      return;
    }
    const status = errorStatus(error);
    res.status(status).json({ message: publicErrorMessage(error, status) });
  };
}
