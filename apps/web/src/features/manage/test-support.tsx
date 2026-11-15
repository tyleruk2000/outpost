/** Shared by the manage screen's component tests: a fake server that remembers what it was sent, and sample data. */
import type { CleanupPlan, CleanupStatus, Leftover, ManagedItem, UsageResponse } from "@outpost/shared";
import { vi } from "vitest";

export { renderScreen } from "../downloads/test-support";

type Answer = unknown | ((body: unknown) => unknown);

export interface FakeApi {
  /** Every request made, in order, with the JSON body it carried. */
  requests: Array<{ call: string; body: unknown }>;
  bodiesOf(call: string): unknown[];
}

/** Replaces `fetch` with answers keyed by "METHOD /path". `{ status, error }` is sent as a failure. */
export function fakeApi(routes: Record<string, Answer>): FakeApi {
  const requests: FakeApi["requests"] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), "http://outpost.test");
      const call = `${init?.method ?? "GET"} ${url.pathname}`;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ call, body });
      const answer = routes[call];
      const value = typeof answer === "function" ? (answer as (body: unknown) => unknown)(body) : answer;
      const failure = value as { status?: number; error?: unknown } | undefined;
      const status = answer === undefined ? 404 : failure && typeof failure.status === "number" && failure.error ? failure.status : 200;
      const payload =
        answer === undefined
          ? { error: { code: "not_found", message: `No fake answer for ${call}` } }
          : status === 200
            ? value
            : { error: failure?.error };
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    }),
  );
  return { requests, bodiesOf: (call) => requests.filter((request) => request.call === call).map((request) => request.body) };
}

export function item(over: Partial<ManagedItem> = {}): ManagedItem {
  const id = over.id ?? "c1";
  return {
    key: `collection:${id}`,
    type: "collection",
    id,
    title: "Wikipedia",
    kind: "zim",
    origin: "downloaded",
    sizeBytes: 1_800_000_000,
    addedAt: Date.UTC(2026, 9, 6),
    locationId: "loc1",
    locationName: "Internal storage",
    locationAvailable: true,
    relPath: "collections/zim/wikipedia.zim",
    inOutpostFolder: true,
    state: "ok",
    busyReason: null,
    documents: [],
    catalogEntryId: "wikipedia.en",
    href: `/library/collections/${id}`,
    ...over,
  };
}

export const sampleItems: ManagedItem[] = [
  item(),
  item({
    id: "c2",
    key: "collection:c2",
    title: "The Alps",
    kind: "map",
    sizeBytes: 600_000_000,
    locationId: "usb",
    locationName: "Field SSD",
    addedAt: Date.UTC(2026, 10, 6),
  }),
  item({
    id: "c3",
    key: "collection:c3",
    title: "Radio operating reference",
    kind: "sheet",
    sizeBytes: 11_000,
    documents: [{ id: "d9", title: "Radio operating reference" }],
    href: "/library/documents/d9",
    addedAt: Date.UTC(2026, 10, 15),
  }),
  item({
    id: "d1",
    key: "document:d1",
    type: "document",
    title: "Seed saving handbook",
    kind: "document",
    origin: "own",
    sizeBytes: 5_000_000,
    catalogEntryId: null,
    href: "/library/documents/d1",
    addedAt: Date.UTC(2026, 10, 14),
  }),
];

export function plan(over: Partial<CleanupPlan> = {}): CleanupPlan {
  return {
    scope: "items",
    changes: 2,
    remove: { count: 2, bytes: 1_800_011_000 },
    byKind: [
      { kind: "zim", count: 1, bytes: 1_800_000_000 },
      { kind: "sheet", count: 1, bytes: 11_000 },
    ],
    byLocation: [
      {
        locationId: "loc1",
        name: "Internal storage",
        path: "/srv/outpost",
        available: true,
        remove: { count: 2, bytes: 1_800_011_000 },
        stays: { count: 0, bytes: 0 },
      },
    ],
    own: { count: 0, bytes: 0 },
    linkedDocuments: 1,
    disconnected: { count: 0, bytes: 0, files: [] },
    outside: { count: 0, bytes: 0, files: [] },
    refused: [],
    downloads: { count: 0, bytes: 0 },
    ...over,
  };
}

export function status(over: Partial<CleanupStatus> = {}): CleanupStatus {
  return {
    erase: { allowed: true, reason: "local", option: "OUTPOST_ALLOW_REMOTE_ERASE" },
    derived: {
      vectors: { count: 1200, bytes: 1_843_200 },
      documents: { count: 12, unreachable: 2 },
      reclaimableBytes: 4_000_000,
      databaseBytes: 90_000_000,
    },
    active: null,
    last: null,
    ...over,
  };
}

export const job = (over: Record<string, unknown> = {}) => ({
  id: "job1",
  type: "manage.remove",
  queue: "manage",
  state: "queued",
  title: "Remove 2 items",
  subject: "manage",
  progress: { current: 0, total: null, message: null },
  error: null,
  errorKind: null,
  attempts: 0,
  maxAttempts: 1,
  result: null,
  createdAt: 1,
  startedAt: null,
  finishedAt: null,
  updatedAt: 1,
  ...over,
});

export function leftover(over: Partial<Leftover> = {}): Leftover {
  return {
    id: "file:loc1:collections/zim/old.zim",
    kind: "untracked",
    title: "old.zim",
    detail: "/srv/outpost/collections/zim/old.zim",
    bytes: 88_000_000,
    count: null,
    locationName: "Internal storage",
    href: null,
    what: null,
    ...over,
  };
}

export function usage(over: Partial<UsageResponse> = {}): UsageResponse {
  const row = (id: UsageResponse["rows"][number]["id"], bytes: number | null, extra: Partial<UsageResponse["rows"][number]> = {}) => ({
    id,
    bytes,
    count: null,
    basis: "disk" as const,
    disconnectedBytes: 0,
    within: null,
    ...extra,
  });
  return {
    rows: [
      row("zim", 2_600_000_000, { count: 2, basis: "records", disconnectedBytes: 800_000_000 }),
      row("map", 0, { count: 0, basis: "records" }),
      row("document", 5_000_000, { count: 3, basis: "records" }),
      row("database", 90_000_000),
      row("passages", 12_000_000, { count: 4000, basis: "estimate", within: "database" }),
      row("vectors", 0, { count: 0, basis: "estimate", within: "database" }),
      row("extracted", 3_000_000),
      row("unfinished", 310_000_000, { count: 1 }),
      row("untracked", 0, { count: 0 }),
    ],
    locations: [
      {
        id: "loc1",
        name: "Internal storage",
        path: "/srv/outpost",
        kind: "internal",
        isDefault: true,
        available: true,
        statusDetail: null,
        lastSeenAt: 1,
        totalBytes: 500_000_000_000,
        freeBytes: 60_000_000_000,
        recorded: { count: 4, bytes: 1_810_000_000 },
        byKind: [{ kind: "zim", count: 1, bytes: 1_800_000_000 }],
        measuredBytes: 2_115_000_000,
      },
      {
        id: "usb",
        name: "Field SSD",
        path: "/Volumes/FieldSSD/outpost",
        kind: "external",
        isDefault: false,
        available: false,
        statusDetail: "The folder is not reachable.",
        lastSeenAt: Date.now() - 3 * 86_400_000,
        totalBytes: 1_000_000_000_000,
        freeBytes: 400_000_000_000,
        recorded: { count: 1, bytes: 800_000_000 },
        byKind: [{ kind: "zim", count: 1, bytes: 800_000_000 }],
        measuredBytes: null,
      },
    ],
    dataDir: { path: "/var/lib/outpost", totalBytes: 250_000_000_000, freeBytes: 100_000_000_000, measuredBytes: 96_000_000 },
    measuredAt: Date.now() - 120_000,
    measuring: false,
    ...over,
  };
}
