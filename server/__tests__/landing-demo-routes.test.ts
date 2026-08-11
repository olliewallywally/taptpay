import express from "express";
import http, { type Server } from "node:http";
import { LANDING_DEMO_TOKEN_HEADER } from "@shared/landing-demo";
import { createLandingDemoRouter, LANDING_DEMO_API_PREFIX } from "../landing-demo-routes";
import { LandingDemoService } from "../landing-demo-service";

describe("landing-demo HTTP boundary", () => {
  let server: Server;
  let origin: string;
  let service: LandingDemoService;

  beforeEach(async () => {
    service = new LandingDemoService({ startCleanup: false });
    const app = express();
    app.use(LANDING_DEMO_API_PREFIX, createLandingDemoRouter(service));
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test address");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    service.dispose();
    await new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()),
    );
  });

  const mutationHeaders = () => ({
    "content-type": "application/json",
    origin,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  });

  function rawRequest(
    path: string,
    options: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const request = http.request(`${origin}${path}`, {
        method: options.method ?? "GET",
        headers: options.headers,
      }, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
      });
      request.on("error", reject);
      request.end(options.body);
    });
  }

  async function createSession() {
    const response = await fetch(`${origin}/api/landing-demo/session`, {
      method: "POST",
      headers: mutationHeaders(),
      body: "{}",
      credentials: "omit",
    });
    expect(response.status).toBe(201);
    return response.json() as Promise<{ token: string; revision: number; state: unknown }>;
  }

  test("uses only the singular endpoints and required no-store headers", async () => {
    const session = await createSession();
    const response = await fetch(`${origin}/api/landing-demo/state`, {
      headers: { [LANDING_DEMO_TOKEN_HEADER]: session.token },
      credentials: "omit",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toMatchObject({ revision: 0, state: { displayDate: "fri 7 aug" } });
    expect((await fetch(`${origin}/api/landing-demo/sessions`)).status).toBe(404);
    expect((await fetch(`${origin}/api/landing-demo/actions`)).status).toBe(404);
  });

  test("accepts the exact header transport and rejects every alternate authority", async () => {
    const session = await createSession();
    const url = `${origin}/api/landing-demo/state`;
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { [LANDING_DEMO_TOKEN_HEADER]: "not-a-token" } })).status).toBe(401);
    expect((await fetch(url, { headers: { authorization: `Bearer ${session.token}` } })).status).toBe(400);
    expect((await fetch(url, { headers: { cookie: `landingDemoToken=${session.token}` } })).status).toBe(400);
    expect((await fetch(`${url}?token=${session.token}`, {
      headers: { [LANDING_DEMO_TOKEN_HEADER]: session.token },
    })).status).toBe(400);
    expect((await fetch(url, {
      headers: { [LANDING_DEMO_TOKEN_HEADER]: "eyJhbGciOiJIUzI1NiJ9.merchant.jwt" },
    })).status).toBe(401);
  });

  test("strictly validates Origin, Fetch Metadata, and JSON content type", async () => {
    const endpoint = `${origin}/api/landing-demo/session`;
    const cases: Record<string, string>[] = [
      { ...mutationHeaders(), origin: "" },
      { ...mutationHeaders(), origin: "https://evil.example" },
      { ...mutationHeaders(), "sec-fetch-site": "cross-site" },
      { ...mutationHeaders(), "sec-fetch-mode": "navigate" },
      { ...mutationHeaders(), "sec-fetch-dest": "iframe" },
    ];
    for (const headers of cases) {
      const response = await rawRequest("/api/landing-demo/session", {
        method: "POST", headers, body: "{}",
      });
      expect(response.status).toBe(403);
    }
    const wrongType = await fetch(endpoint, {
      method: "POST",
      headers: { ...mutationHeaders(), "content-type": "text/plain" },
      body: "{}",
    });
    expect(wrongType.status).toBe(415);
  });

  test("returns a sanitized current snapshot only for a valid-token revision conflict", async () => {
    const session = await createSession();
    const response = await fetch(`${origin}/api/landing-demo/action`, {
      method: "POST",
      headers: {
        ...mutationHeaders(),
        [LANDING_DEMO_TOKEN_HEADER]: session.token,
      },
      body: JSON.stringify({ type: "RESET_SCENE", expectedRevision: 9, scene: "overview" }),
    });
    expect(response.status).toBe(409);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ revision: 0, state: { activeScene: "retail-sale" } });
    expect(body).not.toHaveProperty("token");
  });

  test("strict actions reject identifiers, URLs, files, providers, and body tokens", async () => {
    const session = await createSession();
    for (const extra of [
      { merchantId: 22 }, { userId: 5 }, { url: "https://example.test" },
      { file: "bytes" }, { providerPayload: { id: "real" } },
      { token: session.token },
    ]) {
      const response = await fetch(`${origin}/api/landing-demo/action`, {
        method: "POST",
        headers: { ...mutationHeaders(), [LANDING_DEMO_TOKEN_HEADER]: session.token },
        body: JSON.stringify({
          type: "RESET_SCENE", expectedRevision: 0, scene: "overview", ...extra,
        }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: { code: "DEMO_ACTION_INVALID" } });
    }
  });

  test("authenticates a shaped token before reporting action validation", async () => {
    const response = await fetch(`${origin}/api/landing-demo/action`, {
      method: "POST",
      headers: {
        ...mutationHeaders(),
        [LANDING_DEMO_TOKEN_HEADER]: Buffer.alloc(32, 99).toString("base64url"),
      },
      body: JSON.stringify({ type: "unknown", merchantId: 22 }),
    });
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: { code: "DEMO_SESSION_EXPIRED" } });
  });

  test("rejects both Content-Length and chunked bodies above 16 KiB before handling", async () => {
    const session = await createSession();
    const endpoint = `${origin}/api/landing-demo/action`;
    const oversized = JSON.stringify({ padding: "x".repeat(17 * 1024) });
    const fixed = await fetch(endpoint, {
      method: "POST",
      headers: { ...mutationHeaders(), [LANDING_DEMO_TOKEN_HEADER]: session.token },
      body: oversized,
    });
    expect(fixed.status).toBe(413);
    expect(await fixed.json()).toEqual({ error: { code: "DEMO_BODY_TOO_LARGE" } });

    const chunked = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = http.request(endpoint, {
        method: "POST",
        headers: {
          ...mutationHeaders(),
          [LANDING_DEMO_TOKEN_HEADER]: session.token,
          "transfer-encoding": "chunked",
        },
      }, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
      });
      request.on("error", reject);
      request.write('{"padding":"');
      request.write("x".repeat(17 * 1024));
      request.end('"}');
    });
    expect(chunked.status).toBe(413);
    expect(JSON.parse(chunked.body)).toEqual({ error: { code: "DEMO_BODY_TOO_LARGE" } });
  });

  test("deletes the session and returns 410 on later valid-token access", async () => {
    const session = await createSession();
    const response = await fetch(`${origin}/api/landing-demo/session`, {
      method: "DELETE",
      headers: {
        origin,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        [LANDING_DEMO_TOKEN_HEADER]: session.token,
      },
    });
    expect(response.status).toBe(204);
    const expired = await fetch(`${origin}/api/landing-demo/state`, {
      headers: { [LANDING_DEMO_TOKEN_HEADER]: session.token },
    });
    expect(expired.status).toBe(410);
    expect(await expired.json()).toEqual({ error: { code: "DEMO_SESSION_EXPIRED" } });
  });
});
