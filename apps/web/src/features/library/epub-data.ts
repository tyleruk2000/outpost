/**
 * What the EPUB reader asks the server for, the addresses it builds, and the place a
 * person had reached in each book, which is kept on the device they are reading on.
 */
import type { DocumentEpubChapterResponse, DocumentEpubResponse, EpubChapterDto } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** These start with "documents", so they are refreshed when the document changes. */
export const epubKeys = {
  book: (id: string) => ["documents", "epub", id] as const,
  chapter: (id: string, position: number) => ["documents", "epub", id, "chapter", position] as const,
};

/** A refusal is an answer, not a fault of the network: asking again would get the same words. */
export const useEpubBook = (documentId: string, enabled = true) =>
  useQuery({
    queryKey: epubKeys.book(documentId),
    queryFn: () => api.get<DocumentEpubResponse>(`/api/documents/${documentId}/epub`),
    enabled,
    retry: false,
  });

export const useEpubChapter = (documentId: string, position: number | null) =>
  useQuery({
    queryKey: epubKeys.chapter(documentId, position ?? 0),
    queryFn: () => api.get<DocumentEpubChapterResponse>(`/api/documents/${documentId}/epub/chapters/${position}`),
    enabled: position !== null,
    retry: false,
  });

// ── Addresses ────────────────────────────────────────────────────────────────

const RECORD_ID = /^[0-9A-Za-z]{1,40}$/;
const ANCHOR_ID = /^[\p{L}\p{M}\p{N}_-]{1,200}$/u;

/**
 * The address of a picture inside a book. The server sends the picture's path in the
 * book's archive; it is checked here to be a plain path before it is put in an address,
 * and it only ever goes in as a value, never as part of the address itself.
 */
export function pictureUrl(documentId: string, path: string): string | null {
  if (!RECORD_ID.test(documentId)) return null;
  if (typeof path !== "string" || path.length === 0 || path.length > 1024) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is being refused
  if (/[\u0000-\u001f\\]/.test(path) || path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  if (path.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return `/api/documents/${documentId}/epub/file?path=${encodeURIComponent(path)}`;
}

/**
 * Where a chapter of a book is: the document's own page with `?chapter=N`, and the
 * place inside it as `#h-…`. Chapter 0 is the book's contents. Null when the server
 * sent something that is not a chapter number.
 */
export function chapterTo(documentId: string, chapter: number, anchor?: string): { pathname: string; search: string; hash: string } | null {
  if (!RECORD_ID.test(documentId) || !Number.isInteger(chapter) || chapter < 0 || chapter > 100_000) return null;
  return {
    pathname: `/library/documents/${documentId}`,
    search: chapter === 0 ? "" : `?chapter=${chapter}`,
    hash: chapter > 0 && anchor !== undefined && ANCHOR_ID.test(anchor) ? `#h-${anchor}` : "",
  };
}

/** The chapter the address asks for; null for the book's front page (its contents). */
export function chapterInAddress(params: URLSearchParams): number | null {
  const raw = params.get("chapter");
  if (raw === null || !/^\d{1,6}$/.test(raw)) return null;
  const chapter = Number(raw);
  return chapter >= 1 ? chapter : null;
}

const sameWords = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The chapter a search result means. Search knows a passage of a book by the first
 * heading of the chapter it came from, so that is what a result's link carries. Where
 * two chapters open with the same heading, this is the first of them.
 */
export function chapterForHeading(chapters: readonly EpubChapterDto[], heading: string): number | null {
  if (!heading.trim()) return null;
  const found =
    chapters.find((chapter) => chapter.heading !== null && sameWords(chapter.heading, heading)) ??
    chapters.find((chapter) => sameWords(chapter.title, heading));
  return found?.position ?? null;
}

// ── The reading place ────────────────────────────────────────────────────────

/**
 * How far into a book a person had read. The text is drawn in sections of blocks, so a
 * place is a block and how far down it the top of the window was; that survives a
 * change of window size or type size better than a number of pixels from the top.
 */
export interface ReadingPlace {
  chapter: number;
  section: number;
  block: number;
  /** Pixels of that block above the top of the window. */
  offset: number;
  /** When it was last read, for forgetting the oldest. */
  at: number;
}

const PLACES_KEY = "outpost.epub.places";
/** Books whose place is kept. The one read longest ago is forgotten first. */
const MAX_PLACES = 200;

const count = (value: unknown, most: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= most ? value : null;

function readAll(): Record<string, ReadingPlace> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PLACES_KEY) ?? "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, ReadingPlace>) : {};
  } catch {
    // Storage can be unavailable or hold something else; there is then no place to return to.
    return {};
  }
}

/** The place kept for a book, checked field by field: storage is only ever as trustworthy as what last wrote to it. */
export function readPlace(documentId: string): ReadingPlace | null {
  const stored = readAll()[documentId] as Partial<ReadingPlace> | undefined;
  if (!stored || typeof stored !== "object") return null;
  const chapter = count(stored.chapter, 100_000);
  const section = count(stored.section, 1_000_000);
  const block = count(stored.block, 1_000_000);
  if (chapter === null || chapter < 1 || section === null || block === null) return null;
  const offset = typeof stored.offset === "number" && Number.isFinite(stored.offset) ? Math.max(0, Math.min(stored.offset, 1_000_000)) : 0;
  return { chapter, section, block, offset, at: typeof stored.at === "number" ? stored.at : 0 };
}

export function savePlace(documentId: string, place: Omit<ReadingPlace, "at">, now = Date.now()): void {
  if (!RECORD_ID.test(documentId)) return;
  try {
    const all = readAll();
    all[documentId] = { ...place, offset: Math.round(place.offset), at: now };
    const kept = Object.entries(all)
      .sort(([, a], [, b]) => (b?.at ?? 0) - (a?.at ?? 0))
      .slice(0, MAX_PLACES);
    localStorage.setItem(PLACES_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage can be full or unavailable; the place then lasts only for this visit.
  }
}

/** The block at the top of a scrolling region, among the sections of the text drawn inside it. */
export function placeIn(scroller: HTMLElement): Pick<ReadingPlace, "section" | "block" | "offset"> | null {
  const top = scroller.getBoundingClientRect().top;
  const sections = scroller.querySelectorAll<HTMLElement>("article > section");
  for (const [section, element] of [...sections].entries()) {
    if (element.getBoundingClientRect().bottom <= top + 1) continue;
    for (const [block, child] of [...element.children].entries()) {
      const box = child.getBoundingClientRect();
      if (box.bottom > top + 1) return { section, block, offset: Math.max(0, top - box.top) };
    }
    return { section, block: 0, offset: 0 };
  }
  return null;
}

/** Scrolls a region back to a place. False when the text has no such block (the book was read again, say). */
export function goToPlace(scroller: HTMLElement, place: Pick<ReadingPlace, "section" | "block" | "offset">): boolean {
  const section = scroller.querySelectorAll<HTMLElement>("article > section")[place.section];
  const block = section?.children[place.block] as HTMLElement | undefined;
  if (!block) return false;
  block.scrollIntoView({ block: "start" });
  // No further down the block than it is tall, in case the window is now wider and the block shorter.
  scroller.scrollTop += Math.min(place.offset, Math.max(0, block.getBoundingClientRect().height - 24));
  return true;
}
