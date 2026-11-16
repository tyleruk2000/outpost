/** Saving files that a reference page links to but its archive does not hold. */
import type { DocumentDto } from "./documents.ts";
import type { DownloadDto } from "./downloads.ts";

/** The file kinds a link may point at for Outpost to offer saving it. */
export const SAVABLE_LINK = /\.(pdf|epub|txt|md|markdown)$/i;

/**
 * Whether an address looks like a file the library can keep. A web page does not.
 * Read with a pattern, not the URL class: this package uses nothing from a browser or Node.
 */
export function isSavableLink(href: string): boolean {
  const match = /^https?:\/\/[^\s/?#@]+(\/[^\s?#]*)?(?:[?#]\S*)?$/i.exec(href.trim());
  return Boolean(match?.[1] && SAVABLE_LINK.test(match[1]));
}

export type SaveLinkResponse =
  | { download: DownloadDto; already?: undefined }
  | { already: "saved"; document: DocumentDto }
  | { already: "saving"; download: DownloadDto };

export interface SaveLinksResponse {
  queued: DownloadDto[];
  /** Links that were already in the library or already on their way. */
  already: number;
  refused: Array<{ url: string; reason: string }>;
}

export type LinkState =
  | { url: string; state: "new" }
  | { url: string; state: "saved"; documentId: string }
  | { url: string; state: "saving"; downloadId: string }
  | { url: string; state: "unsupported" };

/** A file a reference page links to: either inside the same archive, or out on the internet. */
export type PageFile =
  | { kind: "archive" /** Path inside the book, e.g. "example.org/docs/manual.pdf". */; path: string; text: string }
  | { kind: "internet"; href: string; text: string };

/** The kinds of file inside an archive that can be opened and kept as documents. */
export const ARCHIVE_FILE = /\.(pdf|epub)$/i;

export type ArchiveFileState =
  | { path: string; state: "new" }
  /** Being copied into the library now, or waiting its turn in an "add all". */
  | { path: string; state: "adding"; turn: "now" | "waiting" }
  | { path: string; state: "saved"; documentId: string };

export interface SaveArchiveFileResponse {
  /** "already": this file had been added before. "duplicate": the library held the same file from elsewhere. */
  status: "created" | "duplicate" | "already";
  document: DocumentDto;
}
