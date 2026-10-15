import type { ErrorRequestHandler } from 'express';
import { safeErrorSummary, errorDataProperty } from './log-redaction';
import { logOperation } from './structured-log';

export function errorStatus(error: unknown): number {
  const value =
    errorDataProperty(error, 'status') ??
    errorDataProperty(error, 'statusCode');
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= 599
    ? value
    : 500;
}

export function publicErrorMessage(
  error: unknown,
  status = errorStatus(error)
): string {
  if (status >= 500) return 'Internal Server Error';
  if (errorDataProperty(error, 'type') === 'entity.parse.failed')
    return 'Invalid JSON';
  const message = errorDataProperty(error, 'message');
  return typeof message === 'string' && message.trim()
    ? message
    : 'Request failed';
}

export function createGlobalErrorHandler(
  log: (message: string, error: unknown) => void = (_message, error) =>
    logOperation('error', 'express_error', { failure: error })
): ErrorRequestHandler {
  return (error, _req, res, next) => {
    try {
      log('[EXPRESS_ERROR]', safeErrorSummary(error));
    } catch {
      /* Keep diagnostic sink failures out of responses. */
    }
    if (res.headersSent) {
      next(new Error('Internal Server Error'));
      return;
    }
    const status = errorStatus(error);
    res.status(status).json({ message: publicErrorMessage(error, status) });
  };
}
