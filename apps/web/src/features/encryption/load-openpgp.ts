/**
 * Fetches OpenPGP.js, once, the first time something needs it.
 *
 * The library is not part of Outpost's bundles (see `openpgpVendor` in vite.config.ts):
 * it is a file of its own, loaded from this address at run time, so that it stays the
 * separate, replaceable work its licence asks for and costs nothing on screens that do
 * no encryption. `engine-openpgp.ts` is the only code that calls it.
 */
export type OpenPGP = typeof import("openpgp");

export const OPENPGP_URL = "/vendor/openpgp/openpgp.min.mjs";

let loading: Promise<OpenPGP> | undefined;

export function loadOpenpgp(): Promise<OpenPGP> {
  // The address is built at run time so that the bundler leaves the import alone.
  loading ??= (import(/* @vite-ignore */ new URL(OPENPGP_URL, window.location.origin).href) as Promise<OpenPGP>).catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
