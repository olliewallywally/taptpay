import type { NextFunction, Request, Response } from 'express';
import {
  requestIdFromHeader,
  runWithOperationContext,
} from './operation-context';
import { createStructuredLogger } from './structured-log';
export { redactSensitive } from './log-redaction';
export function requestRouteTemplate(req: Request) {
  const route = req.route?.path;
  // baseUrl and fallback req.path can contain actual dynamic mount/capability values.
  return typeof route === 'string' && route.length <= 256
    ? route
    : '[unmatched]';
}
export function createRequestLogger(writeLog: (line: string) => void) {
  const write = createStructuredLogger(writeLog);
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = requestIdFromHeader(req.headers['x-request-id']),
      started = Date.now();
    res.setHeader('X-Request-Id', requestId);
    runWithOperationContext({ requestId }, () => {
      res.on('finish', () => {
        if (!req.path.startsWith('/api')) return;
        runWithOperationContext({ requestId }, () =>
          write('info', 'http_request', {
            method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(
              req.method
            )
              ? req.method
              : 'OTHER',
            route: requestRouteTemplate(req),
            status: res.statusCode,
            durationMs: Math.max(0, Date.now() - started),
          })
        );
      });
      next();
    });
  };
}
