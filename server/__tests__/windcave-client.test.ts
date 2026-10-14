import {
  createWindcaveClient,
  type WindcaveClientConfig,
  type WindcaveTransport,
} from "../windcave-client";

/**
 * R2-T1 (plan v2.2 §9.1): the provider client takes its validated configuration,
 * transport, waits and audit sink as arguments, and answers with typed outcomes.
 * Timeout, malformed, pending and unexpected replies are never approved or declined.
 * Reply shapes follow Windcave's public REST/Hosted Fields pages; every ID is synthetic.
 */

const UAT: WindcaveClientConfig = {
  mode: "uat",
  endpoint: "https://uat.windcave.com/api/v1",
  username: "SyntheticUser",
  apiKey: "synthetic-api-key-value",
  publicOrigin: "https://app.example.test",
};

const SESSION_ID = "0000120000000000a1b2c3d4e5f60718";
const X_ID = "11111111-2222-4333-8444-555555555555";

function reply(status: number, body?: unknown, raw?: string): Response {
  const text = raw ?? (body === undefined ? "" : JSON.stringify(body));
  return new Response(status === 204 ? null : text, { status, headers: { "Content-Type": "application/json" } });
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function harness(replies: Array<Response | Error>, config: WindcaveClientConfig = UAT) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const waits: number[] = [];
  const audit: Array<{ action: string; details: Record<string, unknown> }> = [];
  const transport: WindcaveTransport = async (url, init) => {
    calls.push({ url, init });
    const next = replies.shift();
    if (!next) throw new Error("test transport has no reply left");
    if (next instanceof Error) throw next;
    return next;
  };
  const client = createWindcaveClient({
    config,
    transport,
    wait: async (ms) => { waits.push(ms); },
    audit: (action, details) => { audit.push({ action, details }); },
    clock: () => new Date("2026-10-11T00:00:00.000Z"),
    retryLimit: 2,
    retryDelayMs: 5000,
    timeoutMs: 15000,
  });
  return { client, calls, waits, audit };
}

const createRequest = {
  xId: X_ID,
  amount: "12.34",
  merchantReference: "TAPT_synthetic-attempt",
  customerEmail: "payer@example.test",
  callbackBase: "https://app.example.test/api/windcave/callback?transactionId=7",
  notificationUrl: "https://app.example.test/api/windcave/notification",
};

const created = {
  id: SESSION_ID,
  state: "init",
  links: [
    { href: `https://uat.windcave.com/api/v1/sessions/${SESSION_ID}`, rel: "self", method: "GET" },
    { href: "https://uat.windcave.com/pxmi3/F0SYNTHETIC", rel: "hpp", method: "REDIRECT" },
    { href: "https://uat.windcave.com/mh/F1SYNTHETIC", rel: "ajaxSubmitCard", method: "AJAX_POST" },
  ],
};

describe("createSession", () => {
  it('keeps a completed creation identity without exposing another payment widget',async()=>{
    const {client}=harness([reply(202,{...created,state:'complete'})]);
    expect(await client.createSession(createRequest)).toMatchObject({kind:'created',sessionId:SESSION_ID,links:{}});
    const {client:again}=harness([reply(202,{...created,state:'complete'})]);
    const result=await again.createSession(createRequest);if(result.kind!=='created')throw Error('fixture');
    expect(result.links.hpp).toBeUndefined();expect(result.links.ajaxSubmitCard).toBeUndefined();
  });
  it("posts the purchase to the configured endpoint with the caller's X-ID and Basic auth", async () => {
    const { client, calls } = harness([reply(202, created)]);

    await client.createSession(createRequest);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://uat.windcave.com/api/v1/sessions");
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-ID"]).toBe(X_ID);
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("SyntheticUser:synthetic-api-key-value").toString("base64")}`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      type: "purchase",
      amount: "12.34",
      currency: "NZD",
      merchantReference: "TAPT_synthetic-attempt",
      customer: { email: "payer@example.test" },
      callbackUrls: {
        approved: `${createRequest.callbackBase}&result=approved`,
        declined: `${createRequest.callbackBase}&result=declined`,
        cancelled: `${createRequest.callbackBase}&result=cancelled`,
      },
      notificationUrl: createRequest.notificationUrl,
    });
  });

  it("answers a 202 with the session ID and only the validated links the pages use (R2-T2)", async () => {
    const { client } = harness([reply(202, created)]);
    await expect(client.createSession(createRequest)).resolves.toEqual({
      kind: "created",
      sessionId: SESSION_ID,
      links: { hpp: "https://uat.windcave.com/pxmi3/F0SYNTHETIC", ajaxSubmitCard: "https://uat.windcave.com/mh/F1SYNTHETIC" },
      rejectedLinks: 0,
    });
  });

  it("drops malformed entries and links that fail validation, counting the failures", async () => {
    const { client, audit } = harness([reply(202, { id: SESSION_ID, links: [
      created.links[1], { rel: "hpp" }, "x", null, { rel: 3, href: "y" },
      { rel: "ajaxSubmitCard", href: "https://evil.test/mh/F1", method: "AJAX_POST" },
    ] })]);
    await expect(client.createSession(createRequest)).resolves.toEqual({
      kind: "created",
      sessionId: SESSION_ID,
      links: { hpp: "https://uat.windcave.com/pxmi3/F0SYNTHETIC" },
      rejectedLinks: 1,
    });
    expect(JSON.stringify(audit)).not.toContain("evil.test");
  });

  it.each([
    ["a callback on another origin", { callbackBase: "https://evil.test/api/windcave/callback?transactionId=7" }],
    ["a callback with no query to append the result to", { callbackBase: "https://app.example.test/api/windcave/callback" }],
    ["a notification address on another origin", { notificationUrl: "https://evil.test/api/windcave/notification" }],
    ["plain http", { notificationUrl: "http://app.example.test/api/windcave/notification" }],
  ])("refuses %s without calling the provider", async (_label, change) => {
    const { client, calls } = harness([]);
    await expect(client.createSession({ ...createRequest, ...change })).resolves.toEqual({ kind: "invalid_request" });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["no session ID", { links: created.links }],
    ["an empty session ID", { id: "", links: created.links }],
    ["links that are not a list", { id: SESSION_ID, links: {} }],
  ])("calls a 202 with %s malformed", async (_label, body) => {
    const { client } = harness([reply(202, body)]);
    await expect(client.createSession(createRequest)).resolves.toEqual({ kind: "malformed" });
  });

  it("calls a 202 that is not JSON malformed", async () => {
    const { client } = harness([reply(202, undefined, "<html>")]);
    await expect(client.createSession(createRequest)).resolves.toEqual({ kind: "malformed" });
  });

  it("answers a 200 (an X-ID already used) as a duplicate to be confirmed, never as an outcome", async () => {
    const duplicate = { id: SESSION_ID, state: "complete", transactions: [{ id: "0000000c00000001", authorised: true }] };
    const { client } = harness([reply(200, duplicate)]);
    await expect(client.createSession(createRequest)).resolves.toEqual({ kind: "duplicate", body: duplicate });
  });

  it("answers a 4xx as rejected without the provider's text", async () => {
    const { client, audit } = harness([reply(400, undefined, "provider says: bad merchantReference SECRET-DETAIL")]);
    const result = await client.createSession(createRequest);
    expect(result).toEqual({ kind: "rejected", status: 400 });
    expect(JSON.stringify(audit)).not.toContain("SECRET-DETAIL");
  });

  it("retries a 5xx with the same X-ID, waiting between attempts", async () => {
    const { client, calls, waits } = harness([reply(503), reply(202, created)]);
    await expect(client.createSession(createRequest)).resolves.toMatchObject({ kind: "created" });
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => (call.init.headers as Record<string, string>)["X-ID"])).toEqual([X_ID, X_ID]);
    expect(waits).toEqual([5000]);
  });

  it("answers repeated 5xx as unknown, because the provider may have accepted", async () => {
    const { client, calls } = harness([reply(500), reply(502), reply(503)]);
    await expect(client.createSession(createRequest)).resolves.toEqual({ kind: "unknown", reason: "server_error" });
    expect(calls).toHaveLength(3);
  });

  it("answers repeated timeouts as unknown, reusing the X-ID", async () => {
    const { client, calls } = harness([abortError(), abortError(), abortError()]);
    await expect(client.createSession(createRequest)).resolves.toEqual({ kind: "unknown", reason: "timeout" });
    expect(new Set(calls.map((call) => (call.init.headers as Record<string, string>)["X-ID"]))).toEqual(new Set([X_ID]));
  });

  it("answers repeated network failures as unknown", async () => {
    const { client } = harness([new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")]);
    await expect(client.createSession(createRequest)).resolves.toEqual({ kind: "unknown", reason: "network" });
  });

  it("answers an unexpected status as unknown without retrying", async () => {
    const { client, calls } = harness([reply(302)]);
    await expect(client.createSession(createRequest)).resolves.toEqual({ kind: "unknown", reason: "unexpected_status" });
    expect(calls).toHaveLength(1);
  });
});

describe("querySession", () => {
  const complete = {
    id: SESSION_ID,
    state: "complete",
    transactions: [{
      id: "0000000c00000001",
      authorised: true,
      reCo: "00",
      type: "purchase",
      amount: "12.34",
      currency: "NZD",
      merchantReference: "TAPT_synthetic-attempt",
      sessionId: SESSION_ID,
    }],
  };

  it("asks for the one session it names, with Basic auth and no body", async () => {
    const { client, calls } = harness([reply(200, complete)]);
    await client.querySession("../transactions/1?x#y");
    expect(calls[0].url).toBe("https://uat.windcave.com/api/v1/sessions/..%2Ftransactions%2F1%3Fx%23y");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
    expect((calls[0].init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("answers a 200 with the parsed body, leaving classification to the parser", async () => {
    const { client } = harness([reply(200, complete)]);
    await expect(client.querySession(SESSION_ID)).resolves.toEqual({ kind: "reply", body: complete });
  });

  it("calls a 200 that is not JSON malformed", async () => {
    const { client } = harness([reply(200, undefined, "{\"transactions\":[")]);
    await expect(client.querySession(SESSION_ID)).resolves.toEqual({ kind: "malformed" });
  });

  it("retries a 202 and answers the later reply", async () => {
    const { client, waits } = harness([reply(202, { id: SESSION_ID }), reply(200, complete)]);
    await expect(client.querySession(SESSION_ID)).resolves.toEqual({ kind: "reply", body: complete });
    expect(waits).toEqual([5000]);
  });

  it("answers a session still processing after every retry as pending, not declined", async () => {
    const { client, calls } = harness([reply(202), reply(202), reply(202)]);
    await expect(client.querySession(SESSION_ID)).resolves.toEqual({ kind: "pending" });
    expect(calls).toHaveLength(3);
  });

  it("answers a 4xx as rejected without retrying", async () => {
    const { client, calls } = harness([reply(404, undefined, "not found")]);
    await expect(client.querySession(SESSION_ID)).resolves.toEqual({ kind: "rejected", status: 404 });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["5xx", () => [reply(500), reply(500), reply(500)], "server_error"],
    ["timeouts", () => [abortError(), abortError(), abortError()], "timeout"],
    ["network failures", () => [new TypeError("x"), new TypeError("x"), new TypeError("x")], "network"],
  ] as const)("answers repeated %s as unknown", async (_label, replies, reason) => {
    const { client } = harness(replies());
    await expect(client.querySession(SESSION_ID)).resolves.toEqual({ kind: "unknown", reason });
  });
});

describe("configuration", () => {
  it.each([
    ["payments disabled", { ...UAT, mode: "disabled" as const }],
    ["simulation", { ...UAT, mode: "simulation" as const }],
    ["no endpoint", { ...UAT, endpoint: "" }],
    ["no username", { ...UAT, username: "" }],
    ["no API key", { ...UAT, apiKey: "" }],
    ["no public origin", { ...UAT, publicOrigin: undefined }],
    ["the production endpoint in UAT mode", { ...UAT, endpoint: "https://sec.windcave.com/api/v1" }],
    ["the UAT endpoint in production mode", { ...UAT, mode: "production" as const }],
    ["an endpoint with a trailing slash", { ...UAT, endpoint: "https://uat.windcave.com/api/v1/" }],
    ["an endpoint on another host", { ...UAT, endpoint: "https://uat.windcave.com.evil.test/api/v1" }],
  ])("with %s answers disabled and never calls the transport", async (_label, config) => {
    const { client, calls } = harness([], config);
    await expect(client.createSession(createRequest)).resolves.toEqual({ kind: "disabled" });
    await expect(client.querySession(SESSION_ID)).resolves.toEqual({ kind: "disabled" });
    expect(calls).toHaveLength(0);
  });
});

describe("audit records", () => {
  it("carry no session ID, X-ID, credential, reference, email or provider body", async () => {
    const providerText = "PROVIDER-BODY-TEXT";
    const { client, audit } = harness([
      reply(202, created),
      reply(503), reply(200, { id: SESSION_ID, transactions: [] }),
      reply(400, undefined, providerText),
    ]);
    await client.createSession(createRequest);
    await client.querySession(SESSION_ID);
    await client.querySession(SESSION_ID);

    expect(audit.length).toBeGreaterThan(0);
    const recorded = JSON.stringify(audit);
    for (const secret of [SESSION_ID, X_ID, UAT.username, UAT.apiKey, createRequest.merchantReference, createRequest.customerEmail, providerText, "pxmi3", "/mh/"]) {
      expect(recorded).not.toContain(secret);
    }
  });
});
