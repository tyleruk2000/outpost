/** Talking to the server about saving a web page, and the small facts the screen states about one. */
import {
  formatBytes,
  type JobDto,
  type SavedCopy,
  type SaveWebPageRequest,
  type SaveWebPageResponse,
  type SaveWebPageResult,
  type WebPagePreview,
} from "@outpost/shared";
import { ApiError, api } from "@/lib/api";
import { formatNumber, plural } from "@/lib/utils";

/**
 * Fetches the page and says what is in it. It can be stopped: closing the connection is
 * how the server knows nobody is waiting, and it stops fetching too.
 */
export async function lookAtPage(url: string, signal: AbortSignal): Promise<WebPagePreview> {
  // `stream` is the one request that takes a signal; the answer here is ordinary JSON.
  const response = await api.stream("/api/webpages/preview", { url }, signal);
  return (await response.json()) as WebPagePreview;
}

export const savePage = (request: SaveWebPageRequest) => api.post<SaveWebPageResponse>("/api/webpages/save", request);

export const isFinished = (job: Pick<JobDto, "state">) => job.state === "succeeded" || job.state === "failed" || job.state === "cancelled";

/** The result of a save that succeeded, read with care: a job's result is loosely typed. */
export function resultOf(job: JobDto | undefined): SaveWebPageResult | undefined {
  const result = job?.state === "succeeded" ? (job.result as Partial<SaveWebPageResult> | null) : null;
  if (!result || typeof result.documentId !== "string" || !/^[0-9A-Za-z]{1,40}$/.test(result.documentId)) return undefined;
  return {
    documentId: result.documentId,
    title: typeof result.title === "string" ? result.title : "The page",
    url: typeof result.url === "string" ? result.url : "",
    pictures: {
      kept: Number(result.pictures?.kept) || 0,
      bytes: Number(result.pictures?.bytes) || 0,
      skipped: Array.isArray(result.pictures?.skipped) ? result.pictures.skipped : [],
    },
    ...(typeof result.replacedDocumentId === "string" ? { replacedDocumentId: result.replacedDocumentId } : {}),
    ...(typeof result.replaceError === "string" ? { replaceError: result.replaceError } : {}),
  };
}

/** Copies of the address that came back with a refusal to save without a choice. */
export function existingFrom(error: unknown): SavedCopy[] | undefined {
  if (!(error instanceof ApiError) || error.code !== "conflict") return undefined;
  const existing = error.details?.existing;
  return Array.isArray(existing) ? (existing as SavedCopy[]) : undefined;
}

/** The heading over a refusal, by what kind it was. The server's own sentence follows it. */
export function refusalTitle(error: unknown): string {
  const code = error instanceof ApiError ? error.code : "";
  if (code === "forbidden") return "Outpost does not fetch from this address";
  if (code === "unsupported" || code === "too_large") return "This page cannot be saved";
  if (code === "offline") return "The site could not be reached";
  if (code === "unreachable") return "Outpost is not responding";
  return "The page could not be fetched";
}

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** "example.org", "example.org and cdn.example.net", "example.org and 3 other hosts". */
export function hostsLine(hosts: readonly string[]): string {
  if (hosts.length === 0) return "";
  if (hosts.length === 1) return hosts[0]!;
  if (hosts.length === 2) return `${hosts[0]} and ${hosts[1]}`;
  return `${hosts[0]} and ${hosts.length - 1} other hosts`;
}

/** What ticking the box will fetch: "Bring its 12 pictures", or the first 30 of more. */
export function picturesLabel(pictures: WebPagePreview["pictures"]): string {
  if (pictures.count > pictures.willFetch) return `Bring the first ${pictures.willFetch} of its ${formatNumber(pictures.count)} pictures`;
  return pictures.count === 1 ? "Bring its picture" : `Bring its ${pictures.count} pictures`;
}

export function picturesDetail(preview: WebPagePreview): string {
  const { limits, pictures } = preview;
  return `Fetched from ${hostsLine(pictures.hosts)}, one request each. At most ${limits.pictures} pictures, ${megabytes(limits.pictureBytes)} each and ${megabytes(limits.picturesTotalBytes)} in all; any beyond that are left out. A picture that is left out keeps its description.`;
}

/** "By Mabel Thorne, The Allotment Gazette, 9 March 2026", from whatever the page gave. */
export function creditLine(preview: Pick<WebPagePreview, "byline" | "site" | "published">): string {
  let published: string | undefined;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(preview.published ?? "");
  if (day) {
    // The calendar day the page names, not that moment in this reader's time zone.
    const date = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
    published = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  }
  return [preview.byline ? `By ${preview.byline}` : "", preview.site ?? "", published ?? ""].filter(Boolean).join(", ");
}

/** "12 pictures came with it (3.4 MB)". */
export function keptLine(result: SaveWebPageResult): string | null {
  const { kept, bytes } = result.pictures;
  if (kept === 0) return null;
  return `${plural(kept, "picture")} came with it (${formatBytes(bytes)}).`;
}
