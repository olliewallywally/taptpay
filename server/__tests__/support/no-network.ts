/**
 * R1-T1 — the server tests reach no live system, enforced rather than assumed.
 *
 * Wired as a `setupFiles` entry in jest.server.config.cjs, so it runs before
 * every server test file's imports. Any TCP connection (which is what `fetch`,
 * `http`, `https`, `http2`, TLS, SMTP and WebSocket clients all open), name
 * lookup or UDP send for anything but this machine is refused, and recorded.
 * no-network-after-env.ts then fails the test that made it — even when the code
 * under test swallowed the error, as `fetch` does ("fetch failed") and as a
 * route does when it answers 502.
 *
 * The `node:net`, `node:dns` and `node:dgram` modules are shared by every test
 * file in a Jest worker (a mark set by one file is seen by the next), so the
 * guard is installed once per worker and keeps its record on `node:net`.
 * Child processes a test starts are outside it.
 */
import dgram from "node:dgram";
import dns from "node:dns";
import net from "node:net";

export const NO_NETWORK_GUARD = Symbol.for("taptpay.test.noNetworkGuard");
const STATE = Symbol.for("taptpay.test.noNetworkState");

export interface NetworkViolation {
  kind: "connect" | "dns" | "udp";
  target: string;
  test?: string;
  stack?: string;
}

interface GuardState {
  violations: NetworkViolation[];
  currentTest?: string;
}

function state(): GuardState {
  const holder = net as unknown as Record<symbol, GuardState | undefined>;
  holder[STATE] ??= { violations: [] };
  return holder[STATE]!;
}

const LOOPBACK_NAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"]);

/** This machine: `localhost`, 127.0.0.0/8, ::1. Anything else is the network. */
export function isLoopback(host: string | undefined | null): boolean {
  // Node's default when no host is given is localhost.
  if (host === undefined || host === null || host === "") return true;
  const name = String(host).replace(/^\[|\]$/g, "").toLowerCase();
  if (LOOPBACK_NAMES.has(name)) return true;
  if (net.isIPv4(name)) return name.startsWith("127.");
  if (net.isIPv6(name)) return name === "::1" || name === "0:0:0:0:0:0:0:1" || name.startsWith("::ffff:127.");
  return false;
}

function refuse(kind: NetworkViolation["kind"], target: string): Error {
  const guard = state();
  guard.violations.push({ kind, target, test: guard.currentTest, stack: new Error().stack });
  return Object.assign(
    new Error(`[no-network] ${kind} ${target} refused: the server tests must reach no live system (R1-T1)`),
    { code: "ENOTALLOWED" },
  );
}

/** Where a `Socket#connect` call is going, from any of its argument shapes. */
function connectTarget(args: unknown[]): { host?: string; port?: unknown; path?: string } {
  // net.connect() hands Socket#connect its already-normalized [options, callback].
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first !== null && typeof first === "object") {
    const options = first as { host?: string; hostname?: string; port?: unknown; path?: string | null };
    // As Socket#connect decides: a truthy `path` is a pipe (http passes `path: null`).
    return { host: options.host ?? options.hostname, port: options.port, path: options.path ? String(options.path) : undefined };
  }
  if (typeof first === "string" && !/^\d+$/.test(first)) return { path: first };
  return { port: first, host: typeof args[1] === "string" ? args[1] : undefined };
}

function install(): void {
  const originalConnect = net.Socket.prototype.connect;
  if ((originalConnect as any)[NO_NETWORK_GUARD]) return;

  const guardedConnect = function (this: net.Socket, ...args: unknown[]) {
    const { host, port, path } = connectTarget(args);
    let refusal: Error | null = null;
    if (path !== undefined) refusal = refuse("connect", `unix:${path}`);
    else if (!isLoopback(host)) refusal = refuse("connect", `${host}:${port}`);
    if (!refusal) return (originalConnect as (...a: unknown[]) => net.Socket).apply(this, args);
    // Fail the way a refused connection fails: an error on the socket, next tick.
    const error = refusal;
    process.nextTick(() => this.destroy(error));
    return this;
  };
  Object.defineProperty(guardedConnect, NO_NETWORK_GUARD, { value: true });
  net.Socket.prototype.connect = guardedConnect as typeof originalConnect;

  const guardName = (target: object, name: string, kind: "dns") => {
    const original = (target as Record<string, unknown>)[name];
    if (typeof original !== "function" || (original as any)[NO_NETWORK_GUARD]) return;
    const guarded = function (this: unknown, hostname: unknown, ...rest: unknown[]) {
      if (typeof hostname === "string" && !isLoopback(hostname)) {
        const error = refuse(kind, hostname);
        const callback = rest[rest.length - 1];
        if (typeof callback === "function") {
          process.nextTick(() => (callback as (e: Error) => void)(error));
          return undefined;
        }
        return Promise.reject(error);
      }
      return (original as (...a: unknown[]) => unknown).call(this, hostname, ...rest);
    };
    Object.defineProperty(guarded, NO_NETWORK_GUARD, { value: true });
    (target as Record<string, unknown>)[name] = guarded;
  };
  const lookups = (target: object) =>
    Object.getOwnPropertyNames(target).filter(
      (name) => name === "lookup" || name === "lookupService" || name === "reverse" || /^resolve[A-Za-z0-9]*$/.test(name),
    );
  for (const target of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
    for (const name of lookups(target)) guardName(target, name, "dns");
  }

  for (const method of ["send", "connect"] as const) {
    const original = dgram.Socket.prototype[method] as (...a: unknown[]) => unknown;
    if ((original as any)[NO_NETWORK_GUARD]) continue;
    const guarded = function (this: dgram.Socket, ...args: unknown[]) {
      // send(msg, [offset, length,] port[, address][, cb]); connect(port[, address][, cb])
      const address = args.slice(1).find((arg) => typeof arg === "string") as string | undefined;
      if (!isLoopback(address)) throw refuse("udp", `${address}`);
      return original.apply(this, args);
    };
    Object.defineProperty(guarded, NO_NETWORK_GUARD, { value: true });
    (dgram.Socket.prototype as any)[method] = guarded;
  }
}

install();

/** Called before each test, so a refusal names the test that caused it. */
export function noteCurrentTest(name: string | undefined): void {
  state().currentTest = name;
}

/** Everything refused since the last call, which it clears. */
export function takeNetworkViolations(): NetworkViolation[] {
  const guard = state();
  const taken = guard.violations;
  guard.violations = [];
  return taken;
}

/** Throws, naming each refusal and where it came from, if anything reached out. */
export function assertNoNetworkViolations(): void {
  const violations = takeNetworkViolations();
  if (violations.length === 0) return;
  const lines = violations.map((violation) => {
    const origin = (violation.stack ?? "")
      .split("\n")
      .slice(1)
      .filter((line) => !/no-network\.ts|node:internal|node_modules/.test(line))
      .slice(0, 3)
      .map((line) => `      ${line.trim()}`)
      .join("\n");
    return `  ${violation.kind} ${violation.target}${violation.test ? ` (during "${violation.test}")` : ""}\n${origin}`;
  });
  throw new Error(
    `[no-network] the server tests must reach no live system (R1-T1); refused:\n${lines.join("\n")}`,
  );
}
