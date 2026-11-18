import { screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { collection, fakeServer, installBrowserStubs, renderScreen } from "../downloads/test-support";
import HomePage from "./home-page";

beforeAll(installBrowserStubs);
afterEach(() => vi.unstubAllGlobals());

describe("the sentence at the top of Home", () => {
  it("counts collections as the Library's Collections tab lists them", async () => {
    fakeServer({
      "GET /api/storage/locations": {
        locations: [
          {
            id: "loc1",
            name: "Internal",
            status: "available",
            freeBytes: 1_000_000_000,
            totalBytes: 2_000_000_000,
            usage: { locationId: "loc1", byKind: {}, totalBytes: 0 },
          },
        ],
      },
      "GET /api/documents/facets": { total: 3, categories: [], formats: [], tags: [] },
      "GET /api/notes/tree": { notes: [{ id: "n1" }] },
      "GET /api/collections": {
        collections: [
          collection({ id: "map", kind: "map", title: "Test map" }),
          collection({ id: "terrain", kind: "terrain", title: "Test terrain" }),
          collection({ id: "sheet", kind: "file", title: "Radio bands", meta: { documentId: "d1" } }),
          collection({ id: "book", kind: "file", title: "Handbook", meta: { book: { chapters: 3 } } }),
        ],
      },
    });
    renderScreen(<HomePage />);
    const sentence = await screen.findByText(/all on this device/, {}, { timeout: 3000 });
    expect(sentence.textContent).toMatch(/^3 documents, 1 page and 4 collections, all on this device/);
  });

  it("names a location that is away, and claims no more than is so", async () => {
    const location = (id: string, name: string, status: string, totalBytes: number) => ({
      id,
      name,
      status,
      freeBytes: status === "available" ? 1_000_000_000 : null,
      totalBytes: 2_000_000_000,
      usage: { locationId: id, byKind: {}, totalBytes },
    });
    fakeServer({
      "GET /api/storage/locations": {
        locations: [
          location("loc1", "Internal storage", "available", 8_000_000_000),
          location("loc2", "docs on 192.168.1.100", "unavailable", 12_000_000_000),
          // Away, but holding nothing: not worth a word.
          location("loc3", "USB stick", "unavailable", 0),
        ],
      },
      "GET /api/documents/facets": { total: 130, categories: [], formats: [], tags: [] },
      "GET /api/notes/tree": { notes: [{ id: "n1" }] },
      "GET /api/collections": { collections: [collection({ id: "map", kind: "map", title: "United Kingdom" })] },
    });
    renderScreen(<HomePage />);
    const sentence = await screen.findByText(/is not connected/, {}, { timeout: 3000 });
    expect(sentence.textContent).toBe(
      "130 documents, 1 page and 1 collection. “docs on 192.168.1.100” is not connected, so what is kept there cannot be opened until it is back; everything else is on this device and readable with no connection. 1.00 GB free.",
    );
  });
});
