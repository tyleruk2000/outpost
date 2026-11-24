/**
 * The app's one query client and how every query behaves unless a screen says otherwise.
 *
 * - `networkMode: "always"`: the server is on this network or this computer, not on the internet. The browser's
 *   idea of being offline (`navigator.onLine`, false on a laptop with no network at all while it talks to Outpost on
 *   localhost, or on a phone whose Wi-Fi has no internet) says nothing about whether Outpost answers. In the library's
 *   default mode a query was held, unasked, for as long as the browser thought it was offline, and a screen showed its
 *   skeleton for ever. Asked always, a server out of reach fails like any other request and is said so.
 * - Data is fresh for 30 s, so going back to a screen draws it at once from what was fetched, and a refetch behind it
 *   replaces it without a flash. Live events refresh what changes (lib/events.tsx), so a window coming back into focus
 *   asks nothing again.
 * - A query that failed because the server was restarting is tried again; a 4xx is not.
 *
 * A screen whose query key changes as a person types or filters keeps the last answer on screen while the next is
 * fetched: `placeholderData: keepPreviousData`. It is not the default, since a screen of one thing (a document by its
 * id) must never show another's data for a moment.
 */
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        networkMode: "always",
        // Retrying helps when the server is restarting; it does not help a 4xx, nor a GET that had no answer in 15 s
        // (lib/api.ts), which would only keep the screen waiting three times as long before it said so.
        retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.isUnreachable || error.status >= 500),
      },
      mutations: { networkMode: "always" },
    },
  });
}
