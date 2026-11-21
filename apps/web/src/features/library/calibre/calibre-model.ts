/** Pure helpers for the Calibre screen. */
import type { CalibreBook, StorageLocation } from "@outpost/shared";

/**
 * The storage location a chosen folder is on, and the folder's path inside it. The
 * innermost location wins when one lies inside another. Null when the folder is on none.
 */
export function placeOf(
  folder: string,
  locations: Array<Pick<StorageLocation, "id" | "path">>,
): { locationId: string; relPath: string } | null {
  const trimmed = folder.replace(/\/+$/, "");
  const holding = locations
    .map((location) => ({ ...location, path: location.path.replace(/\/+$/, "") }))
    .filter((location) => trimmed === location.path || trimmed.startsWith(`${location.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!holding) return null;
  return { locationId: holding.id, relPath: trimmed.slice(holding.path.length).replace(/^\/+/, "") };
}

/** "Dune, book 2" for a book in a series; null otherwise. Whole numbers are written without ".0". */
export function seriesText(series: string | null, index: number | null): string | null {
  if (!series) return null;
  if (index === null) return series;
  return `${series}, book ${Number.isInteger(index) ? index : index.toLocaleString("en", { maximumFractionDigits: 2 })}`;
}

/** "Frank Herbert" or "Jane Doe and Ann Roe" or "A, B and C". */
export function authorsText(authors: string[]): string {
  if (authors.length <= 1) return authors[0] ?? "";
  return `${authors.slice(0, -1).join(", ")} and ${authors.at(-1)}`;
}

export const bookLine = (book: Pick<CalibreBook, "authors" | "series" | "seriesIndex">): string[] =>
  [authorsText(book.authors), seriesText(book.series, book.seriesIndex) ?? ""].filter(Boolean);
