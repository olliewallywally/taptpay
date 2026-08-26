/**
 * The guard exists because Express 4 silently swallows a rejected promise from
 * an async handler, leaving the request open forever. These tests drive a real
 * HTTP server (there is no supertest in this project) so the thing being
 * asserted is what a client actually receives on the wire — including the two
 * cases where the *wrong* fix would be worse than the bug: the fast-ack
 * webhooks that answer before their `try`, and the SSE stream that a JSON error
 * body would corrupt.
 */

import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import express from "express";

import {
  installAsyncRouteGuard,
  wrapAsyncHandler,
  asyncRouteGuardInternals,
} from "../async-route-guard";
import { createGlobalErrorHandler } from "../http-error-handler";

type SeenError = { err: any; headersSent: boolean };

/** Handlers called directly, outside Express's own typed registration. */
type LooseHandler = (...args: any[]) => any;

type Harness = {
  app: express.Express;
  seenErrors: SeenError[];
  /** Mirrors the global error handler in server/index.ts (around line 305). */
  useGlobalErrorHandler: () => void;
};

function createHarness(options: { guarded?: boolean } = {}): Harness {
  const app = express();
  if (options.guarded !== false) installAsyncRouteGuard(app);

  const seenErrors: SeenError[] = [];
  const useGlobalErrorHandler = () => {
    const productionHandler = createGlobalErrorHandler(() => undefined);
    const handler: express.ErrorRequestHandler = (err, req, res, next) => {
      seenErrors.push({ err, headersSent: res.headersSent });
      productionHandler(err, req, res, next);
    };
    app.use(handler);
  };

  return { app, seenErrors, useGlobalErrorHandler };
}

type RunningServer = { port: number; close: () => Promise<void> };

const running: RunningServer[] = [];

async function listen(app: express.Express): Promise<RunningServer> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const handle: RunningServer = {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  running.push(handle);
  return handle;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
});

type Reply = { status: number; body: string; headers: http.IncomingHttpHeaders };

function request(
  port: number,
  path: string,
  options: { method?: string; timeoutMs?: number } = {},
): Promise<Reply> {
  const { method = "GET", timeoutMs = 4000 } = options;
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body, headers: res.headers }),
        );
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`TIMED_OUT after ${timeoutMs}ms: ${method} ${path}`));
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * Raw bytes off the socket. Needed for the double-send and SSE assertions:
 * an HTTP client library hides a second response, and an SSE stream never ends
 * so there is nothing for a normal request to resolve on.
 */
function collectRaw(port: number, path: string, waitMs = 300): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: keep-alive\r\n\r\n`,
      );
    });
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      raw += chunk;
    });
    socket.on("error", reject);
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(raw);
    }, waitMs);
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(raw);
    });
  });
}

function countResponses(raw: string): number {
  return raw.split("HTTP/1.1 ").length - 1;
}

describe("async route guard — the hang it exists to prevent", () => {
  /**
   * A handler that returns an already-handled rejected promise: the exact shape
   * of the failure (Express ignores the returned promise) without producing an
   * unhandledRejection that would fail the run for unrelated reasons.
   */
  function rejectingHandler(message: string) {
    return () => {
      const rejected = Promise.reject(new Error(message));
      rejected.catch(() => {});
      return rejected;
    };
  }

  test("without the guard, a rejected handler never answers", async () => {
    const { app, useGlobalErrorHandler } = createHarness({ guarded: false });
    app.get("/boom", rejectingHandler("unguarded"));
    useGlobalErrorHandler();
    const server = await listen(app);

    await expect(
      request(server.port, "/boom", { timeoutMs: 400 }),
    ).rejects.toThrow(/TIMED_OUT/);
  });

  test("with the guard, the same handler answers 500", async () => {
    const { app, useGlobalErrorHandler, seenErrors } = createHarness();
    app.get("/boom", rejectingHandler("guarded"));
    useGlobalErrorHandler();
    const server = await listen(app);

    const reply = await request(server.port, "/boom");
    expect(reply.status).toBe(500);
    expect(JSON.parse(reply.body)).toEqual({ message: "Internal Server Error" });
    expect(seenErrors).toHaveLength(1);
    expect(seenErrors[0].headersSent).toBe(false);
  });

  test("an async handler that throws after an await answers", async () => {
    const { app, useGlobalErrorHandler } = createHarness();
    app.get("/late", async (_req, _res) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("column \"billing_claim_token\" does not exist");
    });
    useGlobalErrorHandler();
    const server = await listen(app);

    const reply = await request(server.port, "/late");
    expect(reply.status).toBe(500);
    expect(JSON.parse(reply.body)).toEqual({ message: "Internal Server Error" });
    expect(reply.body).not.toContain("billing_claim_token");
  });

  test("a status carried on the rejected error is preserved", async () => {
    const { app, useGlobalErrorHandler } = createHarness();
    app.post("/pay", async () => {
      throw Object.assign(new Error("Card required"), { status: 402 });
    });
    useGlobalErrorHandler();
    const server = await listen(app);

    const reply = await request(server.port, "/pay", { method: "POST" });
    expect(reply.status).toBe(402);
    expect(JSON.parse(reply.body)).toEqual({ message: "Card required" });
  });

  test.each([
    ["undefined", undefined],
    ["null", null],
    ["the string \"route\"", "route"],
    ["the string \"router\"", "router"],
  ])(
    "a rejection with %s still answers rather than continuing the chain",
    async (_label, reason) => {
      const { app, useGlobalErrorHandler, seenErrors } = createHarness();
      app.get("/odd", async () => {
        throw reason;
      });
      // Would 404 (or hang) if the guard let Express read these as "no error"
      // or as its own routing signals.
      useGlobalErrorHandler();
      const server = await listen(app);

      const reply = await request(server.port, "/odd");
      expect(reply.status).toBe(500);
      expect(seenErrors[0].err).toBeInstanceOf(Error);
      expect(seenErrors[0].err.cause).toBe(reason);
    },
  );

  test("every patched method is covered", async () => {
    const { app, useGlobalErrorHandler } = createHarness();
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      app[method](`/m/${method}`, async () => {
        throw new Error(`${method} failed`);
      });
    }
    app.all("/m/all", async () => {
      throw new Error("all failed");
    });
    app.use("/m/use", async () => {
      throw new Error("use failed");
    });
    useGlobalErrorHandler();
    const server = await listen(app);

    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
      const reply = await request(server.port, `/m/${method.toLowerCase()}`, {
        method,
      });
      expect(reply.status).toBe(500);
      expect(JSON.parse(reply.body).message).toBe("Internal Server Error");
    }

    const all = await request(server.port, "/m/all", { method: "PUT" });
    expect(JSON.parse(all.body).message).toBe("Internal Server Error");

    const used = await request(server.port, "/m/use");
    expect(JSON.parse(used.body).message).toBe("Internal Server Error");
  });
});

describe("async route guard — what it must not break", () => {
  test("4-arity error middleware still handles errors", async () => {
    const { app } = createHarness();
    app.get("/boom", async () => {
      throw Object.assign(new Error("teapot"), { status: 418 });
    });

    let ran = false;
    const errorHandler: express.ErrorRequestHandler = (err, _req, res, _next) => {
      ran = true;
      res.status(err.status).json({ handled: err.message });
    };
    app.use(errorHandler);
    const server = await listen(app);

    const reply = await request(server.port, "/boom");
    expect(ran).toBe(true);
    expect(reply.status).toBe(418);
    expect(JSON.parse(reply.body)).toEqual({ handled: "teapot" });
  });

  test("error middleware is passed through unwrapped, keeping its arity", () => {
    const errorHandler = (_e: unknown, _q: unknown, _s: unknown, _n: unknown) => {};
    expect(wrapAsyncHandler(errorHandler)).toBe(errorHandler);

    // Express treats >4 params as a dead layer; wrapping would revive it.
    const tooWide = (_a: 1, _b: 2, _c: 3, _d: 4, _e: 5) => {};
    expect(wrapAsyncHandler(tooWide)).toBe(tooWide);
  });

  test.each([0, 1, 2, 3])(
    "a %s-parameter handler keeps its arity after wrapping",
    (arity) => {
      const params = ["a", "b", "c"].slice(0, arity).join(",");
      // eslint-disable-next-line no-new-func
      const handler = new Function(params, "return undefined;") as (
        ...args: unknown[]
      ) => unknown;
      expect(handler.length).toBe(arity);
      expect(wrapAsyncHandler(handler).length).toBe(arity);
    },
  );

  test("synchronous handlers are untouched", async () => {
    const { app, useGlobalErrorHandler } = createHarness();
    app.get("/sync", (_req, res) => {
      res.json({ ok: true });
    });
    app.get("/sync-throw", (_req, _res) => {
      throw new Error("sync boom");
    });
    useGlobalErrorHandler();
    const server = await listen(app);

    expect(JSON.parse((await request(server.port, "/sync")).body)).toEqual({
      ok: true,
    });

    // Unchanged from today: Express's own try/catch already forwards this.
    const thrown = await request(server.port, "/sync-throw");
    expect(thrown.status).toBe(500);
    expect(JSON.parse(thrown.body).message).toBe("Internal Server Error");
  });

  test("a sync handler's return value passes straight through", () => {
    const sentinel = { res: true };
    const handler: LooseHandler = () => sentinel;
    const guarded = wrapAsyncHandler(handler);
    expect(guarded({}, {}, () => {})).toBe(sentinel);
  });

  test("a sync throw is not swallowed by the wrapper", () => {
    const handler: LooseHandler = () => {
      throw new Error("sync boom");
    };
    const guarded = wrapAsyncHandler(handler);
    let forwarded: unknown = "not called";
    expect(() =>
      guarded({}, {}, (err: unknown) => {
        forwarded = err;
      }),
    ).toThrow("sync boom");
    expect(forwarded).toBe("not called");
  });

  test("multiple handlers, arrays and non-function arguments survive", async () => {
    const { app, useGlobalErrorHandler } = createHarness();
    const order: string[] = [];
    const mw = (label: string): express.RequestHandler => (_req, _res, next) => {
      order.push(label);
      next();
    };

    // Express flattens handler arrays recursively at runtime; its own types
    // only describe one level, hence the cast.
    const nested = [mw("second"), [mw("third")]] as unknown as
      express.RequestHandler[];

    const finalHandler: express.RequestHandler = async (_req, res) => {
      order.push("handler");
      res.json({ order });
    };

    app.get("/chain", mw("first"), nested, finalHandler);

    // A non-function argument that must reach Express untouched.
    app.use("/json-body", express.json({ limit: "1mb" }));
    app.post("/json-body/echo", async (req, res) => {
      res.json({ body: req.body });
    });

    useGlobalErrorHandler();
    const server = await listen(app);

    const reply = await request(server.port, "/chain");
    expect(JSON.parse(reply.body)).toEqual({
      order: ["first", "second", "third", "handler"],
    });

    const posted = await new Promise<Reply>((resolve, reject) => {
      const payload = JSON.stringify({ hello: "world" });
      const req = http.request(
        {
          host: "127.0.0.1",
          port: server.port,
          path: "/json-body/echo",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body, headers: res.headers }),
          );
        },
      );
      req.on("error", reject);
      req.end(payload);
    });
    expect(JSON.parse(posted.body)).toEqual({ body: { hello: "world" } });
  });

  test("app.get(setting) still reads a setting rather than registering a route", () => {
    const { app } = createHarness();
    app.set("env", "test-env");
    expect(app.get("env")).toBe("test-env");
    expect(app.get("nothing-set")).toBeUndefined();
  });

  test("route registration still returns the app so chaining works", async () => {
    const { app, useGlobalErrorHandler } = createHarness();
    const returned = app
      .get("/a", (_req, res) => res.json({ route: "a" }))
      .get("/b", (_req, res) => res.json({ route: "b" }));
    expect(returned).toBe(app);

    useGlobalErrorHandler();
    const server = await listen(app);
    expect(JSON.parse((await request(server.port, "/b")).body)).toEqual({
      route: "b",
    });
  });

  test("sub-apps and routers are mounted, not wrapped", async () => {
    const { app, useGlobalErrorHandler } = createHarness();

    const subApp = express();
    subApp.get("/inner", (_req, res) => {
      res.json({ mountpath: subApp.mountpath });
    });
    app.use("/sub", subApp);

    const router = express.Router();
    router.get("/inner", (_req, res) => {
      res.json({ from: "router" });
    });
    app.use("/router", router);

    useGlobalErrorHandler();
    const server = await listen(app);

    expect(JSON.parse((await request(server.port, "/sub/inner")).body)).toEqual({
      mountpath: "/sub",
    });
    expect(
      JSON.parse((await request(server.port, "/router/inner")).body),
    ).toEqual({ from: "router" });
  });

  test("`this` and every argument are forwarded", () => {
    const calls: { self: unknown; args: unknown[] }[] = [];
    const handler = function (this: unknown, ...args: unknown[]) {
      calls.push({ self: this, args });
    };
    const guarded = wrapAsyncHandler(handler);
    const context = { name: "app" };
    guarded.call(context, "req", "res", "next", "extra");

    expect(calls).toHaveLength(1);
    expect(calls[0].self).toBe(context);
    expect(calls[0].args).toEqual(["req", "res", "next", "extra"]);
  });

  test("lazy thenables (Drizzle query builders) are not subscribed to", () => {
    let thenCalls = 0;
    const lazyQueryBuilder = {
      [Symbol.toStringTag]: "QueryPromise",
      then() {
        thenCalls += 1;
        return Promise.resolve();
      },
    };
    expect(asyncRouteGuardInternals.isPromise(lazyQueryBuilder)).toBe(false);

    const handler: LooseHandler = () => lazyQueryBuilder;
    const guarded = wrapAsyncHandler(handler);
    expect(guarded({}, {}, () => {})).toBe(lazyQueryBuilder);
    expect(thenCalls).toBe(0);
  });
});

describe("async route guard — already-responded handlers", () => {
  test("the fast-ack webhook pattern does not double-send", async () => {
    const { app, useGlobalErrorHandler, seenErrors } = createHarness();

    // Same shape as app.all("/api/pay/notification/:state"),
    // app.all("/api/windcave/notification") and
    // app.post("/api/webhooks/whatsapp"): answer first, then work.
    app.all("/webhook", async (_req, res) => {
      res.status(200).send("OK");
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("reconciliation failed after the ack");
    });
    useGlobalErrorHandler();
    const server = await listen(app);

    const raw = await collectRaw(server.port, "/webhook", 400);

    expect(countResponses(raw)).toBe(1);
    expect(raw).toContain("HTTP/1.1 200 OK");
    expect(raw.endsWith("OK")).toBe(true);
    expect(raw).not.toContain("reconciliation failed");
    expect(raw).not.toContain("500");

    // The global handler is reached and logs, but headersSent stops it writing.
    expect(seenErrors).toHaveLength(1);
    expect(seenErrors[0].headersSent).toBe(true);
    expect(seenErrors[0].err.message).toBe("reconciliation failed after the ack");
  });

  test("res.headersSent is already true right after writeHead", async () => {
    // The whole no-double-send guarantee rests on this, so assert it directly
    // instead of trusting it.
    const observed: boolean[] = [];
    const { app } = createHarness();
    app.get("/head", (_req, res) => {
      observed.push(res.headersSent);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      observed.push(res.headersSent);
      res.end();
    });
    const server = await listen(app);

    await request(server.port, "/head");
    expect(observed).toEqual([false, true]);
  });

  test("an open SSE stream is not corrupted by a later rejection", async () => {
    const { app, useGlobalErrorHandler, seenErrors } = createHarness();

    // Same shape as app.get("/api/merchants/:id/events").
    app.get("/events", async (_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "private, no-cache, no-store",
        Connection: "keep-alive",
      });
      res.write("data: {\"type\":\"connected\"}\n\n");
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("subscriber lookup failed once the stream was open");
    });
    useGlobalErrorHandler();
    const server = await listen(app);

    const started = Date.now();
    const raw = await collectRaw(server.port, "/events", 400);

    expect(raw).toContain("Content-Type: text/event-stream");
    expect(raw).toContain('data: {"type":"connected"}');
    // Nothing appended after the last event frame — no JSON error body and no
    // second status line. (The stream is chunk-framed, so the raw bytes end
    // with the chunk's trailing CRLF.)
    expect(countResponses(raw)).toBe(1);
    expect(raw).not.toContain('{"message"');
    expect(raw.endsWith('data: {"type":"connected"}\n\n\r\n')).toBe(true);
    // No JSON or terminating chunk is appended. The connection itself is
    // closed promptly so EventSource can reconnect instead of hanging forever.
    expect(raw).not.toContain("\r\n0\r\n\r\n");
    expect(Date.now() - started).toBeLessThan(350);

    expect(seenErrors).toHaveLength(1);
    expect(seenErrors[0].headersSent).toBe(true);
  });
});

describe("async route guard — installation", () => {
  test("installing twice patches nothing twice and routes still work once", async () => {
    const { app, useGlobalErrorHandler } = createHarness();
    const afterFirst = app.get;
    installAsyncRouteGuard(app);
    expect(app.get).toBe(afterFirst);

    let hits = 0;
    app.get("/once", async (_req, res) => {
      hits += 1;
      res.json({ hits });
    });
    useGlobalErrorHandler();
    const server = await listen(app);

    expect(JSON.parse((await request(server.port, "/once")).body)).toEqual({
      hits: 1,
    });
  });

  test("a handler is only wrapped once", () => {
    const handler = async () => {};
    const first = wrapAsyncHandler(handler);
    expect(first).not.toBe(handler);
    expect(wrapAsyncHandler(first)).toBe(first);
  });

  test("install marks the target and returns it", () => {
    const target: Record<string, unknown> = {
      get: () => "original",
      use: () => "original",
    };
    expect(installAsyncRouteGuard(target)).toBe(target);
    expect(
      (target as Record<symbol, unknown>)[
        asyncRouteGuardInternals.GUARD_INSTALLED
      ],
    ).toBe(true);
  });
});

describe("registerRoutes wiring", () => {
  test("the guard is installed before the first route registration", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const source = fs.readFileSync(
      path.join(process.cwd(), "server/routes.ts"),
      "utf8",
    );

    const install = source.indexOf("installAsyncRouteGuard(app)");
    const registerRoutes = source.indexOf(
      "export async function registerRoutes(",
    );
    const firstRoute = source.indexOf("app.get(", registerRoutes);

    expect(install).toBeGreaterThan(registerRoutes);
    expect(firstRoute).toBeGreaterThan(install);
  });
});
