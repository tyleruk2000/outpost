/** What a download is doing, in words and real numbers. Pure, so every state can be tested. */
import { type DownloadDto, formatBytes, formatDuration } from "@outpost/shared";
import { formatSpeed } from "./charts/speed";

export interface DownloadView {
  /** The main line: where the download stands. */
  status: string;
  /** Speed and time left, or what is kept after stopping. */
  detail: string | null;
  /** 0–1 when the size is known and the bar should show it; undefined when it is not. */
  fraction: number | undefined;
  /** Work is happening this moment. Drives the amber "lamp" tone. */
  alive: boolean;
  /** A bar is worth showing at all. */
  bar: boolean;
  tone: "normal" | "danger";
}

type Progressed = Pick<DownloadDto, "receivedBytes" | "totalBytes">;

/** "412 MB of 1.90 GB", or "412 MB" while the total is unknown. */
export function bytesOf(download: Progressed): string {
  return download.totalBytes === null
    ? formatBytes(download.receivedBytes)
    : `${formatBytes(download.receivedBytes)} of ${formatBytes(download.totalBytes)}`;
}

export function fractionOf(download: Progressed): number | undefined {
  if (download.totalBytes === null || download.totalBytes <= 0) return undefined;
  return Math.min(1, download.receivedBytes / download.totalBytes);
}

/** "2.10 MB/s, 4 minutes left" from whichever of the two is known. */
export function paceOf(download: Pick<DownloadDto, "bytesPerSecond" | "etaSeconds">): string | null {
  const parts = [
    download.bytesPerSecond ? formatSpeed(download.bytesPerSecond) : null,
    download.etaSeconds !== null && download.etaSeconds >= 0 ? `${formatDuration(download.etaSeconds)} left` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function describeDownload(download: DownloadDto): DownloadView {
  const fraction = fractionOf(download);
  const some = download.receivedBytes > 0;

  switch (download.state) {
    case "running":
      return {
        status: download.totalBytes === null ? `${formatBytes(download.receivedBytes)} so far` : bytesOf(download),
        detail: paceOf(download) ?? download.message ?? (some ? null : "Starting"),
        fraction,
        alive: true,
        bar: true,
        tone: "normal",
      };
    case "verifying":
      return {
        // The server moves from checking to installing without changing state.
        status: download.message === "Installing" ? "Installing" : "Checking the file against its checksum",
        detail: download.totalBytes === null ? null : formatBytes(download.totalBytes),
        fraction: undefined,
        alive: true,
        bar: true,
        tone: "normal",
      };
    case "queued":
      // An error on a queued download means it stopped and will try again by itself.
      if (download.error) {
        return {
          status: download.error,
          detail: some ? `${bytesOf(download)} so far` : null,
          fraction,
          alive: false,
          bar: some,
          tone: "normal",
        };
      }
      return {
        status: download.message ?? "Waiting to start",
        detail: some ? `${bytesOf(download)} so far` : null,
        fraction,
        alive: false,
        bar: some,
        tone: "normal",
      };
    case "paused":
      return {
        status: some ? `Paused at ${bytesOf(download)}` : "Paused",
        detail: null,
        fraction,
        alive: false,
        bar: true,
        tone: "normal",
      };
    case "failed":
      return {
        status: download.error ?? "The download failed.",
        detail: some ? `${formatBytes(download.receivedBytes)} already downloaded is kept. Retry continues from there.` : null,
        fraction,
        alive: false,
        bar: false,
        tone: "danger",
      };
    case "cancelled":
      return {
        status: some ? `Cancelled at ${bytesOf(download)}` : "Cancelled before anything was downloaded",
        detail: some ? "The part already downloaded is kept until you remove this." : null,
        fraction,
        alive: false,
        bar: false,
        tone: "normal",
      };
    case "completed":
      return {
        status: formatBytes(download.totalBytes ?? download.receivedBytes),
        detail: null,
        fraction: 1,
        alive: false,
        bar: false,
        tone: "normal",
      };
  }
}

/** Removing a stopped download deletes the part of the file already fetched. */
export function removalDeletesPartialFile(download: Pick<DownloadDto, "state" | "receivedBytes">): boolean {
  return download.state !== "completed" && download.receivedBytes > 0;
}

/**
 * Old titles of offline map downloads and tasks, made before they were named as Offline maps names
 * them, in its words: "United Kingdom: routes", "France: source file". Any other title is as given.
 */
const OLD_MAP_TITLES: Array<[RegExp, string]> = [
  [/^Building the road network: (.+)$/, "$1: routes"],
  [/^Road network: (.+)$/, "$1: routes"],
  [/^Roads for routes: (.+)$/, "$1: routes"],
  [/^Reading the country file: (.+)$/, "$1: source file"],
  [/^Country file: (.+?)(?: \(Geofabrik\))?$/, "$1: source file"],
  [/^OpenStreetMap(?: extract)?: (.+?) \(Geofabrik\)$/, "$1: nearby places"],
  [/^Building streets for routes: (.+)$/, "$1: walking and cycling"],
  [/^Bringing in streets for routes: (.+)$/, "$1: walking and cycling, brought in"],
  [/^Satellite: (.+)$/, "$1: satellite pictures"],
];

/** A download's or task's title as Downloads and tasks shows it: map data in the words of Offline maps. */
export function mapTaskTitle(title: string): string {
  for (const [pattern, words] of OLD_MAP_TITLES) if (pattern.test(title)) return title.replace(pattern, words);
  return title;
}
