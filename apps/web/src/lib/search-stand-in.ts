/**
 * For tests: a server that answers a search in two parts, as Outpost's does. A person's
 * own results come at once; the search of reference collections is held open for the
 * test to write to, a line at a time.
 */
import type { ReferenceSearchEvent, SearchResponse, SearchResult } from "@outpost/shared";
import { act } from "@testing-library/react";
import { vi } from "vitest";

export const ownResult = (entityId: string, title: string, kind = "document"): SearchResult => ({
  kind,
  entityId,
  title,
  titleSegments: [{ text: title, hit: false }],
  subtitle: null,
  collection: null,
  url: kind === "note" ? `/notes/${entityId}` : `/library/documents/${entityId}`,
  tags: [],
  score: 1,
  passages: [],
  sources: ["keyword"],
});

export const referenceResult = (collection: string, title: string): SearchResult => ({
  kind: "reference",
  entityId: `${collection}:${title}`,
  title,
  titleSegments: [{ text: title, hit: false }],
  subtitle: null,
  collection,
  url: `/library/read/${collection}/${title}`,
  tags: [],
  score: 1,
  passages: [{ chunkId: null, segments: [{ text: `about ${title}`, hit: false }], page: null, heading: null }],
  sources: ["reference"],
});

/** What reference collections found, as the line the server sends for one of them. */
export const collectionLine = (title: string, ...articles: string[]): ReferenceSearchEvent => ({
  type: "collection",
  collectionId: title,
  title,
  results: articles.map((article) => referenceResult(title, article)),
});

export const ownAnswer = (results: SearchResult[], over: Partial<SearchResponse> = {}): SearchResponse => ({
  query: "",
  mode: "keyword",
  relaxed: false,
  total: results.length,
  results,
  facets: Object.fromEntries([...new Set(results.map((result) => result.kind))].map((kind) => [kind, results.filter((r) => r.kind === kind).length])),
  warnings: [],
  referenceToCome: true,
  tookMs: 3,
  ...over,
});

interface Open {
  q: string;
  signal: AbortSignal | undefined;
  controller: ReadableStreamDefaultController<Uint8Array>;
}

export interface SearchStandIn {
  /** Every search of a person's own things that was asked, as the query of its address. */
  asked: URLSearchParams[];
  /** Every search of reference collections that was opened, oldest first. */
  reference: Open[];
  /** Sends lines down the latest search of reference collections. */
  send(...events: ReferenceSearchEvent[]): Promise<void>;
  /** Sends the last line, and ends it. */
  end(over?: Partial<Extract<ReferenceSearchEvent, { type: "end" }>>): Promise<void>;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Stands in for `fetch`. `own` gives the first part for what was asked. */
export function serveSearch(own: (query: URLSearchParams) => SearchResponse): SearchStandIn {
  const encoder = new TextEncoder();
  const json = (body: unknown, code = 200) =>
    new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
  const standIn: SearchStandIn = {
    asked: [],
    reference: [],
    async send(...events) {
      const open = standIn.reference.at(-1);
      if (!open) throw new Error("No search of reference collections has been opened.");
      await act(async () => {
        for (const event of events) open.controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        await tick();
      });
    },
    async end(over = {}) {
      await standIn.send({ type: "end", searched: 0, missing: [], message: null, tookMs: 1200, ...over });
      await act(async () => {
        standIn.reference.at(-1)!.controller.close();
        await tick();
      });
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/search") {
        standIn.asked.push(url.searchParams);
        return json({ ...own(url.searchParams), query: url.searchParams.get("q") ?? "" });
      }
      if (url.pathname === "/api/search/reference") {
        const signal = init?.signal ?? undefined;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            standIn.reference.push({ q: url.searchParams.get("q") ?? "", signal, controller });
            signal?.addEventListener("abort", () => {
              try {
                controller.error(new DOMException("The operation was aborted.", "AbortError"));
              } catch {
                // Already closed.
              }
            });
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
      }
      if (url.pathname === "/api/answers/status") return json({ enabled: false, ready: false, reason: "Answers are turned off.", busy: false });
      return json({ error: { code: "not_found", message: "Not found" } }, 404);
    }),
  );
  return standIn;
}
