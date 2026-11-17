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
          { id: "loc1", name: "Internal", status: "available", freeBytes: 1_000_000_000, totalBytes: 2_000_000_000, usage: { locationId: "loc1", byKind: {}, totalBytes: 0 } },
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
});
