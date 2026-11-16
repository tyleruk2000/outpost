/**
 * Saving a web page to read offline: one page, fetched because a person asked, kept in
 * the document library as a readable copy that records where it came from and when.
 */
import type { JobDto } from "./common.ts";

/** What Outpost holds a page and its pictures to. Sent with every preview so the screen states them. */
export interface WebPageLimits {
  /** Largest page, in bytes of HTML after any compression is undone. */
  pageBytes: number;
  /** Longest the page may take to arrive, in seconds. */
  pageSeconds: number;
  /** Most pictures brought with one page. */
  pictures: number;
  /** Largest single picture, in bytes. */
  pictureBytes: number;
  /** Most that all of a page's pictures may come to, in bytes. */
  picturesTotalBytes: number;
}

/** A copy of the same address that is already in the library. */
export interface SavedCopy {
  documentId: string;
  title: string;
  /** When that copy was saved, in milliseconds. */
  savedAt: number;
}

/** `POST /api/webpages/preview`: what the page holds, before anything is kept. */
export interface WebPagePreview {
  /** Names this look at the page for a few minutes, so saving does not fetch the page again. */
  previewId: string;
  /** The address as it was asked for. */
  requestedUrl: string;
  /** The address the page came from, after any redirects. This is what is recorded. */
  url: string;
  host: string;
  title: string;
  /** Who wrote it, when the page says. */
  byline: string | null;
  /** The site's name, when the page gives one. */
  site: string | null;
  /** When the page says it was published, as written in the page (an ISO date). */
  published: string | null;
  language: string | null;
  /** Words of readable text found. */
  words: number;
  /** The opening of the text, so a sign-in notice or an empty shell is seen for what it is. */
  excerpt: string;
  pictures: {
    /** Pictures in the article that could be brought along. */
    count: number;
    /** How many of those would be fetched: `count`, held to the limit. */
    willFetch: number;
    /** The hosts they would be fetched from. */
    hosts: string[];
  };
  /** Copies of this address already in the library, newest first. */
  existing: SavedCopy[];
  limits: WebPageLimits;
}

/** `POST /api/webpages/save` */
export interface SaveWebPageRequest {
  url: string;
  /** From the preview. Without it, or once it has lapsed, the page is fetched again. */
  previewId?: string;
  /** Fetch the article's pictures too. */
  pictures?: boolean;
  /**
   * What to do when the address is already in the library: put the new copy in place of
   * that document, or keep both. One of the two must be given then; nothing is replaced
   * unasked.
   */
  replaceDocumentId?: string;
  keepBoth?: boolean;
  locationId?: string;
}

export interface SaveWebPageResponse {
  job: JobDto;
}

/** A picture that was not brought along, and why. */
export interface SkippedPicture {
  url: string;
  reason: string;
}

/** The result of a finished `webpage.save` job. */
export interface SaveWebPageResult {
  documentId: string;
  title: string;
  url: string;
  pictures: { kept: number; bytes: number; skipped: SkippedPicture[] };
  /** The document the new copy took the place of, when that was asked for. */
  replacedDocumentId?: string;
  /** Why the earlier copy is still there, when it was to be replaced and could not be removed. */
  replaceError?: string;
}

/**
 * Where a saved page came from, as its file records it. Shown above the text as
 * "Saved from <address> on <date>".
 */
export interface SavedFrom {
  /** An `http` or `https` address, checked by the server. */
  url: string;
  /** Milliseconds. */
  savedAt: number;
  site?: string;
}

/** The job type that saves a page, for screens that follow it. */
export const SAVE_WEB_PAGE_JOB = "webpage.save";
