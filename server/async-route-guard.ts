/**
 * Router-level async safety net.
 *
 * Express 4 does not understand promises. `Layer.handle_request` calls a
 * handler inside a `try/catch`, which only ever sees a *synchronous* throw —
 * when an `async` handler rejects, the rejection lands nowhere: nothing calls
 * `next(err)`, no response is written, and the request stays open until the
 * client gives up. That is how one missing database column took the whole app
 * down: `/api/auth/me` threw, never answered, and every device class sat on the
 * full-screen loader because first paint is gated on that one call.
 *
 * Fixing individual handlers only fixes the handlers that exist today. This
 * patches the registration methods themselves, so every handler registered
 * after `installAsyncRouteGuard(app)` runs gets `.catch(next)` attached and its
 * rejection flows into the global error handler in `server/index.ts`.
 *
 * What it deliberately does NOT do:
 *
 *  - It does not touch synchronous handlers. They return `undefined`, never a
 *    promise, so the guard is a no-op for them and a sync `throw` keeps taking
 *    exactly the path it takes today (Express's own `try/catch`).
 *  - It does not touch error middleware — Express identifies those by arity
 *    (`fn.length === 4`), and any wrapper would change the arity and silently
 *    demote them to ordinary middleware.
 *  - It does not write a response itself. It only forwards to `next(err)`. The
 *    global error handler is the single place that decides what to send, and it
 *    checks `res.headersSent` first — which is what makes this safe for the
 *    fast-ack webhooks (they answer 200 *before* their `try`) and for the SSE
 *    endpoint (a JSON body written into an open `text/event-stream` would
 *    corrupt the stream).
 */

import type { Express, IRouter } from "express";

/* eslint-disable @typescript-eslint/no-explicit-any -- patching Express's own loosely typed registration methods */
type AnyFunction = (...args: any[]) => any;

/** Registration methods that accept handlers and therefore need patching. */
const GUARDED_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "all",
  "use",
] as const;

/**
 * `Symbol.for` rather than `Symbol()` so the flags survive the module being
 * loaded twice (tsx vs. ts-jest, ESM vs. CJS interop) — double installation
 * must stay a no-op even then.
 */
const GUARD_INSTALLED = Symbol.for("taptpay.asyncRouteGuard.installed");
const HANDLER_WRAPPED = Symbol.for("taptpay.asyncRouteGuard.wrapped");
const WRAPPED_ORIGINAL = Symbol.for("taptpay.asyncRouteGuard.original");

/**
 * True only for real promises, including cross-realm ones.
 *
 * Deliberately narrower than a duck-typed `typeof value.then === "function"`:
 * lazy thenables exist in this codebase — a Drizzle query builder is thenable
 * and *executes the query* when `.then` is first called. A handler that
 * returned one without awaiting it would have its query fired a second time by
 * the guard. Every handler in the risk class is an `async function`, and those
 * always return a native promise, so nothing is lost by being strict.
 */
function isPromise(value: unknown): value is Promise<unknown> {
  if (value instanceof Promise) return true;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function" &&
    Object.prototype.toString.call(value) === "[object Promise]"
  );
}

/**
 * Express mounts sub-apps and routers by inspecting the function it is handed
 * (`fn.handle && fn.set` for a sub-app, a `stack` for a router). Wrapping one
 * would hide those properties and demote it to plain middleware, losing
 * `mountpath`, the `mount` event and `req.app` restoration. They never return a
 * promise, so there is nothing to guard — pass them through as-is.
 *
 * Note that this means handlers registered on a standalone `express.Router()`
 * are not covered by patching the app; such a router needs its own
 * `installAsyncRouteGuard(router)` call. This codebase currently creates none.
 */
function isMountableHandler(fn: AnyFunction): boolean {
  const candidate = fn as { handle?: unknown; set?: unknown; stack?: unknown };
  return (
    typeof candidate.handle === "function" &&
    (typeof candidate.set === "function" || Array.isArray(candidate.stack))
  );
}

/**
 * Express reads a falsy argument to `next()` as "no error, keep routing", and
 * treats the exact strings `"route"` and `"router"` as flow-control signals.
 * A promise rejected with any of those would leave the request unanswered —
 * the very failure this guard exists to prevent — so those are boxed into a
 * real Error.
 *
 * Everything else is forwarded untouched, so custom errors carrying `status` /
 * `statusCode` still reach the global error handler with their status intact.
 */
function toForwardableError(reason: unknown): unknown {
  if (reason instanceof Error) return reason;
  if (!reason || reason === "route" || reason === "router") {
    const error = new Error(
      `Async route handler rejected with a non-error value: ${String(reason)}`,
    );
    (error as Error & { cause?: unknown }).cause = reason;
    return error;
  }
  return reason;
}

/**
 * Wrap a single handler so a rejected promise reaches `next`.
 *
 * Arity is preserved exactly. Express switches on it in two places —
 * `fn.length > 3` is skipped as a request handler and `fn.length !== 4` is
 * skipped as an error handler — so a wrapper that reported a different arity
 * would re-route the handler itself. Handlers of arity 4 or more are returned
 * untouched for the same reason.
 */
export function wrapAsyncHandler<T extends AnyFunction>(handler: T): T {
  if ((handler as Record<symbol, unknown>)[HANDLER_WRAPPED] === true) {
    return handler;
  }
  // (err, req, res, next) — error middleware, and anything wider, which Express
  // already treats as a dead layer. Wrapping either would change its meaning.
  if (handler.length >= 4) return handler;
  if (isMountableHandler(handler)) return handler;

  const guarded = function (this: unknown, ...args: unknown[]) {
    // A synchronous throw is intentionally NOT caught here: Express's own
    // try/catch around the call already forwards it, and catching it would
    // change the error semantics of every sync handler in the app.
    const result = handler.apply(this, args);
    if (!isPromise(result)) return result;

    const next = args[2];
    if (typeof next !== "function") return result;

    // `.then(noop, ...)` on the returned promise, so the rejection is also
    // marked handled and never surfaces as an unhandledRejection (which this
    // server treats as fatal). The inner try/catch keeps that promise from
    // rejecting in turn if `next` itself throws.
    result.then(undefined, (reason: unknown) => {
      try {
        (next as (err?: unknown) => void)(toForwardableError(reason));
      } catch (forwardingError) {
        console.error(
          "[ASYNC_ROUTE_GUARD] failed to forward a rejection to the error handler",
          forwardingError,
          reason,
        );
      }
    });

    return result;
  };

  Object.defineProperty(guarded, "length", {
    value: handler.length,
    configurable: true,
  });
  Object.defineProperty(guarded, "name", {
    value: handler.name || "asyncGuardedHandler",
    configurable: true,
  });
  Object.defineProperty(guarded, HANDLER_WRAPPED, {
    value: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(guarded, WRAPPED_ORIGINAL, {
    value: handler,
    enumerable: false,
    configurable: true,
  });

  return guarded as unknown as T;
}

/**
 * Wrap functions, recurse into arrays (Express flattens handler arrays), and
 * leave everything else — path strings, RegExps, option objects — alone.
 */
function guardArgument(arg: unknown): unknown {
  if (typeof arg === "function") return wrapAsyncHandler(arg as AnyFunction);
  if (Array.isArray(arg)) return arg.map((item) => guardArgument(item));
  return arg;
}

/**
 * Patch an Express app or router in place so every handler registered after
 * this call has its rejections routed to the error handler.
 *
 * Only covers registrations made *after* it runs, so call it before the first
 * route. Idempotent: calling it twice patches nothing twice, and a handler that
 * somehow reaches the wrapper twice is wrapped once.
 */
export function installAsyncRouteGuard<T extends Express | IRouter | object>(
  target: T,
): T {
  const host = target as unknown as Record<string | symbol, unknown>;
  if (host[GUARD_INSTALLED] === true) return target;

  for (const method of GUARDED_METHODS) {
    const original = host[method];
    if (typeof original !== "function") continue;
    const originalMethod = original as AnyFunction;

    const patched = function (this: unknown, ...args: unknown[]) {
      // The return value matters: `app.get("env")` is Express's *settings*
      // getter, not a route registration, and must keep returning the setting.
      // It needs no special case here — the single string argument simply has
      // nothing to wrap — but it does mean the result cannot be swallowed.
      return originalMethod.apply(
        this,
        args.map((arg) => guardArgument(arg)),
      );
    };

    Object.defineProperty(patched, "name", {
      value: method,
      configurable: true,
    });
    host[method] = patched;
  }

  Object.defineProperty(host, GUARD_INSTALLED, {
    value: true,
    enumerable: false,
    configurable: true,
  });

  return target;
}

export const asyncRouteGuardInternals = {
  GUARD_INSTALLED,
  HANDLER_WRAPPED,
  WRAPPED_ORIGINAL,
  GUARDED_METHODS,
  isPromise,
  toForwardableError,
};
