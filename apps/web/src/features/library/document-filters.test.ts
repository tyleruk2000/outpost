import { describe, expect, it } from "vitest";
import { clearFilters, isFiltered, listQuery, PAGE_SIZE, readFilters, writeFilters } from "./document-filters";

const params = (text: string) => new URLSearchParams(text);

describe("document filters in the address", () => {
  it("reads a plain address as no filters, newest first", () => {
    expect(readFilters(params(""))).toEqual({ q: "", type: "", category: "", tag: "", sort: "added" });
  });

  it("reads each filter", () => {
    expect(readFilters(params("q=water&type=pdf&category=Field+guides&tag=first+aid&sort=size"))).toEqual({
      q: "water",
      type: "pdf",
      category: "Field guides",
      tag: "first aid",
      sort: "size",
    });
  });

  it("ignores a type or sort that does not exist rather than sending it to the server", () => {
    expect(readFilters(params("type=spreadsheet&sort=colour"))).toMatchObject({ type: "", sort: "added" });
  });

  it("writes a change and leaves parameters that belong to others alone", () => {
    const next = writeFilters(params("tab=documents&q=water"), { type: "pdf" });
    expect(next.toString()).toBe("tab=documents&q=water&type=pdf");
  });

  it("removes a filter when it is cleared, and keeps the default sort out of the address", () => {
    expect(writeFilters(params("q=water&sort=title"), { q: "  ", sort: "added" }).toString()).toBe("");
  });

  it("clearing filters keeps the sort order", () => {
    expect(clearFilters(params("q=water&type=pdf&category=a&tag=b&sort=size")).toString()).toBe("sort=size");
  });

  it("does not count sorting as filtering", () => {
    expect(isFiltered(readFilters(params("sort=title")))).toBe(false);
    expect(isFiltered(readFilters(params("tag=water")))).toBe(true);
  });

  it("builds the list request for a page of a view", () => {
    expect(listQuery(readFilters(params("q=water&type=pdf")), PAGE_SIZE)).toEqual({
      q: "water",
      type: "pdf",
      category: undefined,
      tag: undefined,
      sort: "added",
      limit: PAGE_SIZE,
      offset: PAGE_SIZE,
    });
  });
});
