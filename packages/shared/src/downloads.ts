/** What is being fetched; decides how the file is installed once it is complete. */
export type DownloadKind = "zim" | "map" | "terrain" | "places" | "file" | "model" | "document" | "dataset";

export type DownloadState = "queued" | "running" | "paused" | "verifying" | "completed" | "failed" | "cancelled";

/** States in which a download still holds its place in the queue. */
export const ACTIVE_DOWNLOAD_STATES: readonly DownloadState[] = ["queued", "running", "verifying", "paused"];

/**
 * Why a download stopped, when Outpost can tell. The web app uses it to pick the
 * right hint ("reconnect the drive", "free some space", …); anything else is "error".
 */
export type DownloadErrorKind =
  | "offline"
  | "transient"
  | "storage_unavailable"
  | "insufficient_space"
  | "checksum_mismatch"
  | "not_found"
  | "forbidden"
  | "conflict"
  | "upstream"
  | "error"
  | (string & {});

export interface DownloadDto {
  id: string;
  kind: DownloadKind;
  title: string;
  catalogEntryId: string | null;
  /** Address the file comes from. Mirrors may serve the bytes; this is where it was asked for. */
  url: string;
  locationId: string;
  locationName: string;
  /** Destination inside the storage location. */
  relPath: string;
  state: DownloadState;
  receivedBytes: number;
  /** Null until the size is known. */
  totalBytes: number | null;
  /** Average over the last few seconds; null unless bytes are arriving. */
  bytesPerSecond: number | null;
  etaSeconds: number | null;
  /** Short note on what is happening now, e.g. "Checking the file". */
  message: string | null;
  error: string | null;
  errorKind: DownloadErrorKind | null;
  attempts: number;
  /** The installed collection, once the download has completed. */
  collectionId: string | null;
  /** The library document this became, for a file saved from a link. */
  documentId: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  updatedAt: number;
}

/** Finished downloads (completed or cancelled) sent with the list at first; older ones are asked for a page at a time. */
export const DOWNLOAD_HISTORY_PAGE = 50;

export interface DownloadsResponse {
  /**
   * Newest first: every download that has not finished, and the `DOWNLOAD_HISTORY_PAGE`
   * most recently finished ones.
   */
  downloads: DownloadDto[];
  /** How many downloads have finished, all told: more than are listed when there is older history. */
  historyTotal: number;
}

/** `GET /api/downloads/history`: finished downloads, most recently finished first. */
export interface DownloadHistoryResponse {
  downloads: DownloadDto[];
  total: number;
  offset: number;
}

export interface DownloadResponse {
  download: DownloadDto;
}

// ── Details and the plan ────────────────────────────────────────────────────

/** One line of a download's history: when it entered a state, and why if it says. */
export interface DownloadEvent {
  at: number;
  state: DownloadState | (string & {});
  detail?: string;
}

/** Everything known about one download, for its details screen. */
export interface DownloadDetail {
  download: DownloadDto;
  source: {
    /** Address the download was asked from. */
    requestedUrl: string;
    requestedHost: string;
    /** Host that actually sent the bytes, when a mirror did. */
    servedBy: string | null;
    /** How it is fetched: "http", or "pmtiles-extract" for a map region. */
    fetcher: string;
    etag: string | null;
    lastModified: string | null;
  };
  integrity: {
    /** Checksum published by the source, when there is one. */
    sha256Expected: string | null;
    /** Checksum of what was received, once it has been checked. */
    sha256Actual: string | null;
    /** True when both exist and match; null while unknown. */
    verified: boolean | null;
  };
  destination: {
    locationId: string;
    locationName: string;
    locationAvailable: boolean;
    relPath: string;
    freeBytes: number | null;
    totalBytes: number | null;
  };
  timing: {
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
    /** Mean speed over the readings held in memory; null when not transferring. */
    averageBytesPerSecond: number | null;
    peakBytesPerSecond: number | null;
  };
  /** Speed readings, about one a second, for up to the last quarter of an hour. Not kept across restarts. */
  speedHistory: Array<{ at: number; bytesPerSecond: number }>;
  events: DownloadEvent[];
  attempts: { made: number; allowed: number; nextAttemptAt: number | null };
  /** What the catalogue said about the item when the download was started. */
  about: { publisher?: string; license?: string; attribution?: string; version?: string; description?: string; language?: string } | null;
  /** For map regions: the area and detail asked for. */
  region: { bbox: [number, number, number, number]; minZoom: number; maxZoom: number; tileType: string; sourceBuild?: string } | null;
  /** The shared speed limit in force, in bytes per second; null when there is none. */
  rateLimitBytesPerSecond: number | null;
}

export interface DownloadPlanItem {
  id: string;
  title: string;
  kind: DownloadKind;
  state: DownloadState;
  /** Transferring now, waiting for a free slot, or paused by a person. */
  phase: "active" | "waiting" | "paused";
  receivedBytes: number;
  totalBytes: number | null;
  remainingBytes: number | null;
  locationId: string;
  locationName: string;
  /** Seconds from now. Estimates; null when they cannot be made. */
  startsInSeconds: number | null;
  finishesInSeconds: number | null;
}

export interface DownloadPlanLocation {
  locationId: string;
  name: string;
  available: boolean;
  totalBytes: number | null;
  freeBytes: number | null;
  /** Bytes the queue still has to write here. */
  pendingBytes: number;
  /** Free space once everything queued for this location has arrived. */
  freeAfterBytes: number | null;
  enough: boolean;
}

/** What the download queue is going to do, as far as can be told now. */
export interface DownloadPlan {
  concurrency: number;
  rateLimitBytesPerSecond: number | null;
  /** Total speed being achieved right now. */
  bytesPerSecond: number | null;
  /** The speed the estimates assume, and where it came from. */
  assumedBytesPerSecond: number | null;
  basis: "measured" | "limit" | null;
  remainingBytes: number;
  /** Items whose size is not known yet; estimates leave them out. */
  unknownSizes: number;
  finishesInSeconds: number | null;
  counts: { active: number; waiting: number; paused: number; failed: number };
  queue: DownloadPlanItem[];
  locations: DownloadPlanLocation[];
}
