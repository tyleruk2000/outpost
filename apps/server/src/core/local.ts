/**
 * Telling a request made on this computer from one made by another device.
 *
 * Outpost has no accounts, so "who is asking" cannot be answered. "Where from" can, and
 * it is the one distinction the few irreversible actions lean on: erasing a person's own
 * notes and documents is only offered at the computer Outpost runs on, unless whoever
 * starts Outpost says otherwise.
 *
 * A request counts as local when:
 *
 *  - it did not come through a proxy (a proxy on this computer makes every request look
 *    local, so anything carrying a forwarding header is treated as remote), and
 *  - either nothing but this computer can reach Outpost at all (LAN access is off, which
 *    the configuration refuses to start without), or the connection itself comes from a
 *    loopback address.
 *
 * Inside a container with LAN access on, every connection arrives from the container
 * network, so nothing is ever local there; that case needs the start-up option.
 */
import type { IncomingHttpHeaders } from "node:http";

const FORWARDING_HEADERS = ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip"];

/** 127.0.0.0/8, ::1, and the IPv4 loopback range written as an IPv6 address. */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  const value = address.trim().toLowerCase();
  if (value === "::1") return true;
  const v4 = value.startsWith("::ffff:") ? value.slice("::ffff:".length) : value;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
}

export interface RequestOrigin {
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string };
}

export function isLocalRequest(request: RequestOrigin, config: { lanAccess: boolean }): boolean {
  if (FORWARDING_HEADERS.some((name) => request.headers[name] !== undefined)) return false;
  return !config.lanAccess || isLoopbackAddress(request.socket.remoteAddress);
}
