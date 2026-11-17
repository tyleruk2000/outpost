/**
 * The contract between the download manager and the modules that use it.
 *
 * Anything Outpost fetches from the network goes through the download manager, so that
 * every transfer gets the same treatment: a row people can see on the Downloads screen,
 * pause / resume / cancel, retries with backoff, a free-space check, checksum
 * verification and an install step.
 *
 * Two extension points:
 *  - a *fetcher* knows how to bring bytes to a local file (plain HTTP is built in; the
 *    maps module adds one that extracts a region from a remote PMTiles archive);
 *  - an *installer* runs once the file is complete and verified, and turns it into
 *    something usable (a collection row, a place index, an entry in Kiwix's library).
 */
import type { DownloadDto } from "@outpost/shared";
import type { CollectionMeta, downloads } from "../../db/schema.ts";

export type DownloadRow = typeof downloads.$inferSelect;
export type DownloadKind = DownloadRow["kind"];

export interface StartDownload {
  kind: DownloadKind;
  title: string;
  /** For the "http" fetcher, the address to download. Other fetchers define its meaning. */
  url: string;
  /** Storage location to write to. Defaults to the default location. */
  locationId?: string;
  /** Destination inside the location, e.g. "collections/zim/wikipedia_en_100_2026-08.zim". */
  relPath: string;
  /** Expected size, used for the free-space check and progress before the server answers. */
  sizeBytes?: number;
  sha256?: string;
  catalogEntryId?: string;
  /** Name of a registered fetcher. Defaults to "http". */
  fetcher?: string;
  /** Hosts the first request may go to. Required for the "http" fetcher. */
  allowedHosts?: string[];
  /** Free-form data kept on the row and handed to the fetcher and installer. */
  meta?: Record<string, unknown>;
}

/**
 * Keys of `meta` that the built-in installer reads. It is used for kinds that have no
 * installer of their own, and records the finished file as a collection. Everything is
 * optional; the download's title is the fallback for the collection's title.
 */
export interface InstallMeta {
  title?: string;
  description?: string;
  category?: string;
  language?: string;
  publisher?: string;
  license?: string;
  attribution?: string;
  version?: string;
  /** Stored as the collection's `meta`. */
  collectionMeta?: CollectionMeta;
}

export interface FetchContext {
  download: DownloadRow;
  /** Absolute path of the partial file. Fetchers append to or fill in this file. */
  partPath: string;
  /** The hosts given to `start`, for fetchers that make their own requests. */
  allowedHosts?: string[];
  signal: AbortSignal;
  /**
   * Wait for permission to transfer this many bytes. Every fetcher calls this for each
   * chunk before writing it, which is what makes the speed limit hold.
   */
  throttle(bytes: number): Promise<void>;
  /** Report bytes on disk so far and, once known, the final size. */
  progress(receivedBytes: number, totalBytes?: number | null, message?: string): void;
  /** Persist fields the fetcher needs to resume later (etag, last-modified, extra meta). */
  remember(patch: { etag?: string | null; lastModified?: string | null; meta?: Record<string, unknown> }): void;
}

/**
 * Brings the download to completion at `partPath`. Must be resumable: it may be called
 * again after a pause, a failure or a restart, with whatever it left on disk and
 * whatever it stored through `remember`. Throws on failure; the manager handles retries.
 */
export type Fetcher = (context: FetchContext) => Promise<void>;

export interface InstallContext {
  download: DownloadRow;
  /** Absolute path of the finished, verified file in its final place. */
  filePath: string;
  sizeBytes: number;
  sha256: string;
  signal: AbortSignal;
  progress(current: number, total?: number | null, message?: string): void;
}

/**
 * Returns the id of the collection that now represents the installed content, if any,
 * and anything worth keeping on the download's record (merged into its `meta`).
 */
export type Installer = (context: InstallContext) => Promise<{ collectionId?: string; meta?: Record<string, unknown> } | undefined>;

export interface DownloadsService {
  start(input: StartDownload): Promise<DownloadRow>;
  get(id: string): DownloadRow | undefined;
  list(): DownloadRow[];
  /** Every download that has not finished (finished: completed or cancelled), newest first. */
  unfinished(): DownloadRow[];
  /** Finished downloads, most recently finished first, a page at a time, and how many there are. */
  history(offset: number, limit: number): { rows: DownloadRow[]; total: number };
  pause(id: string): DownloadRow;
  resume(id: string): DownloadRow;
  cancel(id: string): DownloadRow;
  /** Queues a failed or cancelled download again. It continues from its partial file. */
  retry(id: string): Promise<DownloadRow>;
  /** Removes a finished, failed or cancelled download from history, and any partial file. */
  remove(id: string): Promise<void>;
  /** Everything known about one download: source, integrity, history, speed over time. */
  detail(id: string): Promise<import("@outpost/shared").DownloadDetail>;
  /** A forecast of the queue: order, timings, and space left on each location afterwards. */
  plan(): Promise<import("@outpost/shared").DownloadPlan>;
  /** Pauses everything that is queued or transferring. Returns how many were paused. */
  pauseAll(): number;
  /** Resumes everything that is paused. */
  resumeAll(): number;
  registerFetcher(name: string, fetcher: Fetcher): void;
  /**
   * One installer per kind; registering twice for a kind is an error. An installer given
   * with `owns` is instead one of several for the kind: it takes the downloads `owns`
   * recognises, before the kind's own installer is asked.
   */
  registerInstaller(kind: DownloadKind, installer: Installer, owns?: (download: DownloadRow) => boolean): void;
  /** Called once a download has been verified and installed, with its final row. */
  onCompleted(listener: (download: DownloadRow) => void | Promise<void>): void;
  /** The row as the API reports it, with live progress, speed and time remaining. */
  toDto(row: DownloadRow): DownloadDto;
}

declare module "../../core/context.ts" {
  interface Services {
    downloads: DownloadsService;
  }
}
