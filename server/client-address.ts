import net from "node:net";
import type { Request } from "express";
import { config } from "./config";

/**
 * R1-T4 phase B: the visitor's address, for limits keyed on it. null while the app
 * does not know how many proxies stand in front of it (TRUST_PROXY_HOPS unset): behind
 * a proxy every visitor may then arrive from the proxy's address, and one bucket for
 * everyone would let anyone slow everyone down.
 *
 * With the setting on, `req.ip` is Express's reading of X-Forwarded-For through that
 * many trusted hops, so an entry the visitor wrote is never taken as their address.
 */
export function clientAddressForLimits(req: Request): string | null {
  if (config.trustProxyHops === null) return null;
  return limitAddress(req.ip ?? req.socket.remoteAddress);
}

/**
 * The form a limit counts: IPv4 as it is (an IPv4-mapped IPv6 address unwrapped), IPv6
 * by its /64 network. A home connection or a phone is usually given a whole /64, so a
 * limit on single IPv6 addresses would be no limit at all.
 */
export function limitAddress(raw: string | undefined): string | null {
  if (!raw) return null;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw);
  const address = mapped && net.isIPv4(mapped[1]) ? mapped[1] : raw;
  if (net.isIPv4(address)) return address;
  if (!net.isIPv6(address)) return null;
  return `${ipv6Groups(address).slice(0, 4).join(":")}::/64`;
}

/** The eight 16-bit groups of a valid IPv6 address, "::" expanded; an embedded IPv4 tail counts as two. */
function ipv6Groups(address: string): string[] {
  const bare = address.split("%")[0].toLowerCase();
  const groups = (part: string) =>
    (part ? part.split(":") : []).flatMap((group) => (group.includes(".") ? ["0", "0"] : [group]));
  const [head, tail] = bare.includes("::") ? bare.split("::") : [bare, undefined];
  const left = groups(head);
  const right = tail === undefined ? [] : groups(tail);
  const full = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return full.map((group) => parseInt(group, 16).toString(16));
}
