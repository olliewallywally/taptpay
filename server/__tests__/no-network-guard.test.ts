import { spawnSync } from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import {
  NO_NETWORK_GUARD,
  assertNoNetworkViolations,
  takeNetworkViolations,
} from "./support/no-network";

/**
 * R1-T1 (plan v2.2 §8.2): the server tests reach no live system. Every server
 * test file runs with this guard (jest.server.config.cjs): a connection or a
 * name lookup for anything but this machine is refused and recorded, and the
 * test that made it fails even when the code under test swallowed the error
 * (`fetch` reports a refused connection as a plain "fetch failed", and a route
 * turns that into a 502 the test might accept).
 */
describe("no-network guard", () => {
  // This file reaches out on purpose; the guard's own check must not fail it.
  afterEach(() => {
    takeNetworkViolations();
  });

  it("is armed in every server test file", () => {
    // Importing the guard above arms it too, so the wiring is checked from the config.
    const config = require(path.join(process.cwd(), "jest.server.config.cjs"));
    expect(config.setupFiles).toContain("<rootDir>/server/__tests__/support/no-network.ts");
    expect(config.setupFilesAfterEnv).toContain("<rootDir>/server/__tests__/support/no-network-after-env.ts");
    expect((net.Socket.prototype.connect as any)[NO_NETWORK_GUARD]).toBe(true);
  });

  it("refuses fetch to an outside host and records it", async () => {
    await expect(fetch("https://example.com/")).rejects.toThrow();
    expect(takeNetworkViolations()).toEqual([
      expect.objectContaining({ kind: "connect", target: "example.com:443" }),
    ]);
  });

  it("refuses http.get to an outside host and records it", async () => {
    const error = await new Promise<Error>((resolve) => {
      http.get("http://example.com/", () => resolve(new Error("connected"))).on("error", resolve);
    });
    expect(error.message).toMatch(/no-network/);
    expect(takeNetworkViolations()).toEqual([
      expect.objectContaining({ kind: "connect", target: "example.com:80" }),
    ]);
  });

  it("refuses a name lookup for an outside host and records it", async () => {
    await expect(dns.promises.lookup("example.com")).rejects.toThrow(/no-network/);
    expect(takeNetworkViolations()).toEqual([
      expect.objectContaining({ kind: "dns", target: "example.com" }),
    ]);
  });

  it("refuses a socket file (a local database's, say) and records it", async () => {
    const error = await new Promise<Error>((resolve) => {
      net.connect("/run/postgresql/.s.PGSQL.5432", () => resolve(new Error("connected"))).on("error", resolve);
    });
    expect(error.message).toMatch(/no-network/);
    expect(takeNetworkViolations()).toEqual([
      expect.objectContaining({ kind: "connect", target: "unix:/run/postgresql/.s.PGSQL.5432" }),
    ]);
  });

  it("refuses a UDP send off this machine and records it", () => {
    const socket = dgram.createSocket("udp4");
    try {
      expect(() => socket.send("probe", 53, "192.0.2.1")).toThrow(/no-network/);
    } finally {
      socket.close();
    }
    expect(takeNetworkViolations()).toEqual([
      expect.objectContaining({ kind: "udp", target: "192.0.2.1" }),
    ]);
  });

  // External review 2026-09-29 (R1-T1): where a request is going is read before any agent or proxy
  // setting can route it through this machine, where the socket guard would take it for local.
  it("refuses http.get to an outside host even when its agent would send it through a proxy on this machine", async () => {
    const proxied: string[] = [];
    const proxy = http.createServer((req, res) => {
      proxied.push(req.headers.host ?? "");
      res.end("proxied");
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const { port } = proxy.address() as net.AddressInfo;
    const viaProxy = new http.Agent();
    (viaProxy as unknown as { createConnection: () => net.Socket }).createConnection = () => net.connect(port, "127.0.0.1");
    try {
      const error = await new Promise<Error>((resolve) => {
        http.get({ host: "192.0.2.1", port: 80, path: "/", agent: viaProxy }, () => resolve(new Error("answered by the proxy")))
          .on("error", resolve);
      });
      expect(error.message).toMatch(/no-network/);
      expect(proxied).toEqual([]);
      expect(takeNetworkViolations()).toEqual([
        expect.objectContaining({ kind: "connect", target: "192.0.2.1:80" }),
      ]);
    } finally {
      viaProxy.destroy();
      await new Promise((resolve) => proxy.close(resolve));
    }
  });

  it("refuses fetch to an outside host before the request is handed on at all", async () => {
    // Refused at the socket only, fetch fails later, as a plain "fetch failed" whose cause is the
    // refusal; through a proxy on this machine it would not fail at all.
    await expect(fetch("http://192.0.2.1/")).rejects.toMatchObject({ code: "ENOTALLOWED" });
    expect(takeNetworkViolations()).toEqual([
      expect.objectContaining({ kind: "connect", target: "192.0.2.1:80" }),
    ]);
  });

  it("refuses every question a resolver would send, this machine's own name included, and answers a plain lookup of it here", async () => {
    // resolve* and reverse go to the configured name server, wherever it is, even for "localhost".
    await expect(dns.promises.resolve4("localhost")).rejects.toThrow(/no-network/);
    await expect(dns.promises.reverse("127.0.0.1")).rejects.toThrow(/no-network/);
    expect(takeNetworkViolations().map((violation) => violation.kind)).toEqual(["dns", "dns"]);

    expect(await dns.promises.lookup("localhost", { all: true })).toEqual([{ address: "127.0.0.1", family: 4 }]);
    expect(await dns.promises.lookup("localhost", 6)).toEqual({ address: "::1", family: 6 });
    expect(takeNetworkViolations()).toEqual([]);
  });

  it("allows this machine, by address and by name, and records nothing", async () => {
    const server = net.createServer((socket) => socket.end("pong"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;
    const ask = (host: string) =>
      new Promise<string>((resolve, reject) => {
        let reply = "";
        const socket = net.connect(port, host);
        socket.on("data", (chunk) => (reply += chunk));
        socket.on("end", () => resolve(reply));
        socket.on("error", reject);
      });

    try {
      expect(await ask("127.0.0.1")).toBe("pong");
      expect((await dns.promises.lookup("localhost")).address).toMatch(/^(127\.|::1$)/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    expect(takeNetworkViolations()).toEqual([]);
  });

  it("fails the test that reached out, even when the code under test swallowed the error", async () => {
    await fetch("https://example.com/").catch(() => undefined);
    expect(() => assertNoNetworkViolations()).toThrow(/example\.com:443/);
    // One refusal fails one test, not every test after it.
    expect(() => assertNoNetworkViolations()).not.toThrow();
  });

  it("fails such a test end to end, in a Jest run with the server config", () => {
    const run = spawnSync(
      process.execPath,
      [
        require.resolve("jest/bin/jest"),
        "--config", "jest.server.config.cjs",
        "--testMatch", "<rootDir>/server/__tests__/fixtures/network-call-swallowed.fixture.ts",
        "--json", "--ci",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    const report = JSON.parse(run.stdout);
    const [test] = report.testResults[0].assertionResults;

    expect(run.status).toBe(1);
    expect(test.title).toBe("swallows a refused outside connection");
    expect(test.status).toBe("failed");
    expect(test.failureMessages.join("\n")).toContain("connect example.com:443");
  }, 60_000);
});
