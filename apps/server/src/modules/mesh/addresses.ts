/**
 * Who may connect to Outpost's broker: this computer, and, when Outpost is open to the
 * home network (OUTPOST_LAN_ACCESS), addresses that belong to a home network: the
 * private IPv4 ranges of RFC 1918, link-local, and IPv6 unique-local and link-local.
 * Anything else (a public address, which reaches the port only if the router forwards
 * it) is closed before a byte is read. It is a fence, not a lock: the user name and
 * password are the lock (docs/security.md).
 */
import { isLoopbackAddress } from "../../core/local.ts";

function plain(address: string): string {
  const value = address.trim().toLowerCase().replace(/%.*$/, "");
  return value.startsWith("::ffff:") && value.includes(".") ? value.slice("::ffff:".length) : value;
}

function ipv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  return numbers.every((value) => value >= 0 && value <= 255) ? numbers : null;
}

export function isHomeAddress(address: string | undefined | null, lanAccess: boolean): boolean {
  if (!address) return false;
  if (isLoopbackAddress(address)) return true;
  if (!lanAccess) return false;
  const value = plain(address);
  const v4 = ipv4(value);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return /^f[cd][0-9a-f]{2}:/.test(value) || /^fe[89ab][0-9a-f]:/.test(value);
}
