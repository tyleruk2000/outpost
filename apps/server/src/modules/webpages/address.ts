/**
 * The address of a page a person asked Outpost to save, and the addresses of the
 * pictures in it.
 *
 * Nothing here decides whether a host is safe to connect to: that is the download
 * client's job, done when the name is looked up and again on every redirect
 * (`core/http.ts`). This only turns away what can be seen to be wrong in the address
 * as written, so that the person is told why before anything is fetched.
 */
import { AppError, badRequest } from "../../core/errors.ts";
import { isPublicAddress } from "../../core/http.ts";

const MAX_ADDRESS_LENGTH = 2000;

export const PRIVATE_ADDRESS =
  "That address is on this computer or a private network. Outpost only fetches pages from the public internet, so that it cannot be used to reach into your own network.";

export interface PageAddress {
  /** The address in its standard form, without anything after a "#". */
  url: string;
  host: string;
}

/** True for a host written as a number, or one of the names that always mean this computer. */
function isPrivateLiteral(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const literal = /^[\d.]+$/.test(host) || host.includes(":");
  return literal && !isPublicAddress(host);
}

/**
 * Reads an address a person typed or pasted. A bare "example.org/page" is taken as
 * https, as a browser would take it.
 */
export function parsePageAddress(raw: string, options: { allowPrivate: boolean }): PageAddress {
  const typed = raw.trim();
  if (!typed) throw badRequest("Paste the address of the page you want to save.");
  if (typed.length > MAX_ADDRESS_LENGTH) throw badRequest("That address is too long to be a web page's.");
  if (/\s/.test(typed)) {
    throw badRequest("That is more than one address, or has a space in it. Outpost saves one page at a time: paste a single address.");
  }
  // Only something with no scheme at all is completed; "ftp://…" is refused below, not rewritten.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(typed) && !/^[^/:]+:\d+(\/|$)/.test(typed) ? typed : `https://${typed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw badRequest("That is not a web address. It should look like https://example.org/a-page.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw badRequest("Only addresses that start with http:// or https:// can be saved.");
  }
  if (url.username || url.password) {
    throw badRequest("An address that carries a user name or password cannot be saved. Outpost never sends sign-in details to a site.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  // A single word is a mistyped address, unless this server is set up to fetch from its own network, where it may be a machine's name.
  if (!host || (!host.includes(".") && !host.includes(":") && host !== "localhost" && !options.allowPrivate)) {
    throw badRequest("That is not a web address. It should look like https://example.org/a-page.");
  }
  if (!options.allowPrivate && isPrivateLiteral(host)) throw new AppError("forbidden", PRIVATE_ADDRESS);
  url.hash = "";
  return { url: url.toString(), host };
}

/**
 * The address of a picture or a link found in a page, made complete against the page's
 * own address. Undefined for anything that is not a plain web address.
 */
export function resolveAgainst(raw: string | undefined, base: string): URL | undefined {
  const written = raw?.trim();
  if (!written || written.length > MAX_ADDRESS_LENGTH) return undefined;
  try {
    const url = new URL(written, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a picture's address is one Outpost would try to fetch at all. */
export function isFetchablePicture(address: string, options: { allowPrivate: boolean }): boolean {
  try {
    const url = new URL(address);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    // A drawing in SVG can carry script, so the library does not show one in place; there is no use fetching it.
    if (/\.svgz?$/i.test(url.pathname)) return false;
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return Boolean(host) && (options.allowPrivate || !isPrivateLiteral(host));
  } catch {
    return false;
  }
}
