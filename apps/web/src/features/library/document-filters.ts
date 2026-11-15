/**
 * The document list's filters live in the address, so a view can be linked, survives a
 * reload, and comes back when someone returns from a document.
 */
import type { DocumentSort, DocumentType } from "@outpost/shared";

export interface DocumentFilters {
  q: string;
  type: DocumentType | "";
  category: string;
  tag: string;
  sort: DocumentSort;
}

const types: readonly DocumentType[] = ["pdf", "markdown", "text", "html", "epub", "image"];
const sorts: readonly DocumentSort[] = ["added", "title", "size"];

export const PAGE_SIZE = 50;

export function readFilters(params: URLSearchParams): DocumentFilters {
  const type = params.get("type") as DocumentType | null;
  const sort = params.get("sort") as DocumentSort | null;
  return {
    q: params.get("q")?.trim() ?? "",
    type: type && types.includes(type) ? type : "",
    category: params.get("category")?.trim() ?? "",
    tag: params.get("tag")?.trim() ?? "",
    sort: sort && sorts.includes(sort) ? sort : "added",
  };
}

/** Applies a change to the address, leaving parameters that belong to others (the Library tab) alone. */
export function writeFilters(current: URLSearchParams, patch: Partial<DocumentFilters>): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    const text = typeof value === "string" ? value.trim() : "";
    // The default sort is left out so the plain address stays plain.
    if (!text || (key === "sort" && text === "added")) next.delete(key);
    else next.set(key, text);
  }
  return next;
}

export function clearFilters(current: URLSearchParams): URLSearchParams {
  return writeFilters(current, { q: "", type: "", category: "", tag: "" });
}

/** True when the list is narrowed. Sorting alone does not count. */
export const isFiltered = (filters: DocumentFilters) => Boolean(filters.q || filters.type || filters.category || filters.tag);

/** The query `GET /api/documents` expects for one page of a view. */
export function listQuery(filters: DocumentFilters, offset: number): Record<string, string | number | undefined> {
  return {
    q: filters.q || undefined,
    type: filters.type || undefined,
    category: filters.category || undefined,
    tag: filters.tag || undefined,
    sort: filters.sort,
    limit: PAGE_SIZE,
    offset,
  };
}
