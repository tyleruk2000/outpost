/**
 * A PDF that Outpost made itself (a map page, a prediction, a communication plan), and
 * the one way such a file is added to the library.
 *
 * It goes in through the library's own upload, `POST /api/documents`, exactly as a file
 * chosen from the device does: the server checks that it is a PDF, takes its checksum,
 * refuses a second copy of the same bytes, checks the room on the storage location,
 * files it there and queues the reading of its text for search. Nothing on the server
 * knows the file was made here except by what is written in the document's `source`.
 *
 * What is decided here, and nowhere else:
 *
 * - Where it goes. Under the category "Made in Outpost", so that everything made here
 *   can be listed together and told apart from what was brought in. A person may choose
 *   another category; the choice is kept in this browser and used from then on.
 * - What it is called. The maker of each PDF gives a title that says what it is and for
 *   when; the file is named from that title.
 * - What `source` says: "Made in Outpost from …", ending in the address inside Outpost
 *   of the thing it was made from, when there is one. The document's page turns that
 *   address into a link (made-in-outpost.tsx).
 */
import type { DocumentDto, UploadResponse } from "@outpost/shared";
import { pdfFileName } from "@/features/maps/print/pdf";
import { ApiError, errorMessage, uploadWithProgress } from "@/lib/api";

export interface MadeFrom {
  /** What it was made from, as it reads after "from": "the HF propagation planner", "a communication plan". */
  what: string;
  /** The address inside Outpost that shows it again, when there is one: "/radio/plans/abc". */
  path?: string;
}

export interface MadePdf {
  /** The bytes, under the name they are saved and shared by. */
  file: File;
  /** What the library calls it: "HF prediction, London to Edinburgh, 20 m, for 16 Nov 2026". */
  title: string;
  /** The kind of thing it is, in a word or two. Becomes a tag: "HF prediction", "Map". */
  kind: string;
  from: MadeFrom;
}

/** Wraps bytes the PDF writer made as a file named from its title. */
export function madePdf(bytes: Uint8Array | Blob, title: string, kind: string, from: MadeFrom): MadePdf {
  return { file: new File([bytes as BlobPart], pdfFileName(title), { type: "application/pdf" }), title, kind, from };
}

// ── Where it came from ──────────────────────────────────────────────────────

const SOURCE_START = "Made in Outpost from ";

/** An address inside Outpost and nowhere else: one leading slash, no scheme, no host, nothing a browser would read as either. */
export function isInsidePath(path: string): boolean {
  return /^\/[A-Za-z0-9]/.test(path) && !/[\\\s]/.test(path) && !path.includes("//") && !path.includes(":");
}

/** The words recorded as a document's source. */
export function madeSource(from: MadeFrom): string {
  const what = from.what.replace(/\s+/g, " ").trim();
  return from.path && isInsidePath(from.path) ? `${SOURCE_START}${what}: ${from.path}` : `${SOURCE_START}${what}`;
}

/**
 * Reads those words back. The source of a document is a field anyone may type in, so
 * this is strict: the exact opening, and an address only if it is one inside Outpost.
 */
export function parseMadeSource(source: string | null | undefined): MadeFrom | null {
  if (!source?.startsWith(SOURCE_START)) return null;
  const rest = source.slice(SOURCE_START.length).trim();
  if (!rest) return null;
  const at = rest.lastIndexOf(": /");
  if (at > 0) {
    const path = rest.slice(at + 2);
    if (isInsidePath(path)) return { what: rest.slice(0, at), path };
  }
  return { what: rest };
}

// ── Where it goes ───────────────────────────────────────────────────────────

/** The category a PDF made here is filed under unless the person has chosen another. */
export const MADE_CATEGORY = "Made in Outpost";
const CATEGORY_KEY = "outpost.library.madeCategory";
/** The longest category the library takes. */
export const CATEGORY_MAX = 100;

/** The category chosen on this device. Storage that is full or switched off gives the usual one. */
export function madeCategory(): string {
  try {
    const kept = localStorage.getItem(CATEGORY_KEY)?.trim();
    return kept ? kept.slice(0, CATEGORY_MAX) : MADE_CATEGORY;
  } catch {
    return MADE_CATEGORY;
  }
}

const categoryWatchers = new Set<() => void>();
/** Told when the category is changed, so that two sets of buttons on one screen never say different things. */
export function watchMadeCategory(listener: () => void): () => void {
  categoryWatchers.add(listener);
  return () => categoryWatchers.delete(listener);
}

/** Remembers a category for next time; an empty one goes back to the usual. Returns what will be used. */
export function chooseMadeCategory(category: string): string {
  const chosen = category.replace(/\s+/g, " ").trim().slice(0, CATEGORY_MAX);
  try {
    if (!chosen || chosen === MADE_CATEGORY) localStorage.removeItem(CATEGORY_KEY);
    else localStorage.setItem(CATEGORY_KEY, chosen);
  } catch {
    // Not remembered where storage is switched off: the usual category is used.
  }
  for (const listener of categoryWatchers) listener();
  return madeCategory();
}

// ── Adding it ───────────────────────────────────────────────────────────────

export type AddFailure =
  /** The storage location has no room for it. */
  | "no-room"
  /** The drive or share the library is on is not connected. */
  | "storage-away"
  /** The server did not answer, or the connection dropped on the way. */
  | "unreachable"
  /** The server looked at it and said no, for the reason given. */
  | "refused";

export type AddOutcome =
  | { status: "added"; document: DocumentDto; category: string }
  /** The library already holds these exact bytes; `document` is the one it holds. Nothing was added. */
  | { status: "duplicate"; document: DocumentDto }
  | { status: "cancelled" }
  | { status: "failed"; failure: AddFailure; message: string };

export type SendUpload = typeof uploadWithProgress;

const failureOf = (code: string | undefined): AddFailure =>
  code === "insufficient_space"
    ? "no-room"
    : code === "storage_unavailable"
      ? "storage-away"
      : code === "unreachable"
        ? "unreachable"
        : "refused";

/** A tag cannot hold a comma or run on for ever; a kind that is nothing else is left off. */
const tagOf = (kind: string) =>
  kind
    .replace(/[,\s]+/g, " ")
    .trim()
    .slice(0, 50);

/**
 * Sends the file to the library and says what became of it. Never throws: every way it
 * can go is one of the outcomes, so that a screen has something to say for each.
 */
export async function addMadePdf(
  pdf: MadePdf,
  options: {
    category: string;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
    /** The request itself. Tests give their own. */
    send?: SendUpload;
  },
): Promise<AddOutcome> {
  const form = new FormData();
  // The words about the file go first, so the server has them before the bytes begin.
  form.append("title", pdf.title.slice(0, 300));
  form.append("source", madeSource(pdf.from).slice(0, 1000));
  form.append("category", options.category);
  if (tagOf(pdf.kind)) form.append("tags", tagOf(pdf.kind));
  form.append("file", pdf.file, pdf.file.name);
  try {
    const response = await (options.send ?? uploadWithProgress)<UploadResponse>(
      "/api/documents",
      form,
      options.onProgress ?? (() => undefined),
      options.signal,
    );
    const result = response?.results?.[0];
    if (!result) {
      return {
        status: "failed",
        failure: "refused",
        message: "The server did not say what happened to the file. Look in the library before trying again.",
      };
    }
    if (result.status === "rejected" || !result.document) {
      return { status: "failed", failure: failureOf(result.code), message: result.reason ?? "The library would not take the file." };
    }
    return result.status === "duplicate"
      ? { status: "duplicate", document: result.document }
      : { status: "added", document: result.document, category: result.document.category ?? options.category };
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return { status: "cancelled" };
    return { status: "failed", failure: failureOf(error instanceof ApiError ? error.code : undefined), message: errorMessage(error) };
  }
}
