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
