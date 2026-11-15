/** What is being fetched; decides how the file is installed once it is complete. */
export type DownloadKind = "zim" | "map" | "terrain" | "places" | "file" | "model";

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
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  updatedAt: number;
}

export interface DownloadsResponse {
  /** Newest first. */
  downloads: DownloadDto[];
}

export interface DownloadResponse {
  download: DownloadDto;
}
