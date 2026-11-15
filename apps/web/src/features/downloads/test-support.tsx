/** Shared by the component tests of Explore, Downloads and Collections: a router, a query client, and a fake server. */
import type { CatalogEntryDto, CollectionDto, DownloadDto } from "@outpost/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

export function renderScreen(ui: ReactElement, route = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

type Answer = unknown | ((request: { method: string; url: URL }) => unknown);

export interface FakeServer {
  /** Every request made, as "METHOD /path?query". */
  calls: string[];
}

/**
 * Replaces `fetch` with answers keyed by "METHOD /path". An answer of the form
 * `{ status, error }` is sent as a failing response in the server's error shape.
 */
export function fakeServer(routes: Record<string, Answer>): FakeServer {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url.pathname}${url.search}`);
      const answer = routes[`${method} ${url.pathname}`];
      if (answer === undefined)
        return new Response(JSON.stringify({ error: { code: "not_found", message: `No fake answer for ${method} ${url.pathname}` } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      const body = typeof answer === "function" ? (answer as (request: { method: string; url: URL }) => unknown)({ method, url }) : answer;
      const failure = body as { status?: number; error?: unknown } | null;
      const status = failure && typeof failure.status === "number" && failure.error ? failure.status : 200;
      return new Response(JSON.stringify(status === 200 ? body : { error: failure?.error }), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return { calls };
}

export const adminSession = {
  authRequired: false,
  setupRequired: false,
  setupTokenRequired: false,
  lanAccess: false,
  user: { id: "local", username: "local", role: "admin" },
};
export const memberSession = { ...adminSession, authRequired: true, user: { id: "m1", username: "sam", role: "member" } };

export function location(over: Record<string, unknown> = {}) {
  return {
    id: "loc1",
    name: "Internal storage",
    path: "/srv/outpost",
    kind: "internal",
    isDefault: true,
    status: "available",
    statusDetail: null,
    totalBytes: 500_000_000_000,
    freeBytes: 60_000_000_000,
    lastSeenAt: 1,
    createdAt: 1,
    usage: { locationId: "loc1", byKind: {}, totalBytes: 0 },
    ...over,
  };
}

/** Radix measures its controls and scrolls to them; jsdom has neither. Call once per test file that opens a dialog. */
export function installBrowserStubs(): void {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ── Records as the server sends them ──

export function entry(over: Partial<CatalogEntryDto> = {}): CatalogEntryDto {
  return {
    id: "kiwix.knots",
    manifestId: "kiwix-essentials",
    name: "Knots by Wikipedia",
    description: "The Wikipedia articles about knots, gathered into one small archive.",
    category: "survival",
    publisher: "Wikipedia",
    language: "en",
    format: "zim",
    license: "CC BY-SA 4.0",
    attribution: "Wikipedia contributors.",
    lastVerified: "2026-11-15",
    tags: ["knots", "rope"],
    source: { type: "kiwix", name: "wikipedia_en_knots", flavour: "maxi" },
    sizeBytes: 14_000_000,
    sizeIsEstimate: true,
    version: null,
    publishedAt: null,
    articleCount: null,
    resolvedAt: null,
    availability: "unknown",
    unavailableReason: null,
    status: "not_installed",
    updateAvailable: false,
    ...over,
  };
}

export function download(over: Partial<DownloadDto> = {}): DownloadDto {
  return {
    id: "d1",
    kind: "zim",
    title: "Wikipedia 100",
    catalogEntryId: "kiwix.wikipedia-en-100",
    url: "https://download.example.org/wikipedia_en_100.zim",
    locationId: "loc1",
    locationName: "Internal storage",
    relPath: "collections/zim/wikipedia_en_100.zim",
    state: "running",
    receivedBytes: 412_000_000,
    totalBytes: 1_900_000_000,
    bytesPerSecond: 2_100_000,
    etaSeconds: 240,
    message: null,
    error: null,
    errorKind: null,
    attempts: 1,
    collectionId: null,
    createdAt: 1,
    startedAt: 2,
    finishedAt: null,
    updatedAt: 3,
    ...over,
  };
}

export function collection(over: Partial<CollectionDto> = {}): CollectionDto {
  return {
    id: "c1",
    kind: "zim",
    catalogEntryId: "kiwix.vikidia",
    title: "Vikidia (without images)",
    description: "An encyclopedia written for children.",
    category: "encyclopedias",
    language: "en",
    publisher: "Vikidia",
    license: "See source",
    attribution: "Vikidia.",
    version: "2026-09",
    locationId: "loc1",
    locationName: "USB drive",
    locationAvailable: true,
    relPath: "collections/zim/vikidia.zim",
    sizeBytes: 10_555_427,
    sha256: "38858407a11076aa",
    status: "installed",
    updateAvailable: false,
    meta: {},
    installedAt: 1,
    verifiedAt: 1,
    updatedAt: 1,
    ...over,
  };
}
