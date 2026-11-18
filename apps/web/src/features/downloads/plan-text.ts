/**
 * The download plan and a download's history, in words. Pure, so every wording can be
 * tested without a server or a clock.
 */
import {
  type DownloadDetail,
  type DownloadDto,
  type DownloadEvent,
  type DownloadPlan,
  type DownloadPlanItem,
  formatBytes,
  formatDuration,
} from "@outpost/shared";
import { formatRate } from "./charts/speed";
import { clockAt } from "./charts/time-axis";

const count = (n: number, singular: string) => `${n} ${n === 1 ? singular : `${singular}s`}`;

// ── The plan, as a sentence ─────────────────────────────────────────────────

export interface PlanWords {
  /** What is queued and when it will be done. Set in the title face. */
  lead: string;
  /** Smaller facts that qualify it: the clock time, the limit, what is left out. */
  notes: string[];
}

type PlanFacts = Pick<
  DownloadPlan,
  "counts" | "remainingBytes" | "unknownSizes" | "finishesInSeconds" | "basis" | "rateLimitBytesPerSecond" | "queue"
>;

/**
 * States the plan from its real numbers. `waitingForConnection` is how many of the
 * waiting downloads stopped because the network went away; the plan itself does not say.
 */
export function planSentence(plan: PlanFacts, options: { now?: number; waitingForConnection?: number } = {}): PlanWords {
  const now = options.now ?? Date.now();
  const { counts } = plan;
  const going = counts.active + counts.waiting;
  const limit = plan.rateLimitBytesPerSecond ? formatRate(plan.rateLimitBytesPerSecond) : null;
  const notes: string[] = [];
  const attention =
    counts.failed > 0 ? `${counts.failed} stopped and ${counts.failed === 1 ? "needs" : "need"} attention, further down.` : null;

  if (going === 0) {
    if (counts.paused === 0) return { lead: "Nothing is queued.", notes: attention ? [attention] : [] };
    const paused = plan.queue.filter((item) => item.phase === "paused");
    const bytes = paused.reduce((sum, item) => sum + (item.remainingBytes ?? 0), 0);
    const one = counts.paused === 1;
    const what =
      bytes > 0
        ? `${count(counts.paused, "download")} paused, ${formatBytes(bytes)} still to fetch.`
        : `${count(counts.paused, "download")} paused.`;
    if (limit) notes.push(`Transfers are limited to ${limit}.`);
    if (attention) notes.push(attention);
    return { lead: `${what} Nothing will arrive until ${one ? "it is" : "they are"} resumed.`, notes };
  }

  const one = going === 1;
  const they = one ? "it" : "they";
  const sized = going - plan.unknownSizes;
  let what: string;
  if (sized === 0) {
    what = `${count(going, "download")} whose size is not known yet.`;
  } else if (plan.remainingBytes === 0 && plan.unknownSizes === 0) {
    what = `${count(going, "download")} ${one ? "has" : "have"} arrived and ${one ? "is" : "are"} being checked.`;
  } else {
    what = `${count(sized, "download")}, ${formatBytes(plan.remainingBytes)} to go${plan.unknownSizes > 0 ? `, plus ${plan.unknownSizes} whose size is not known yet` : ""}.`;
  }

  let when: string | null;
  let limitSaid = false;
  const offline = options.waitingForConnection ?? 0;
  if (counts.active === 0 && offline > 0 && offline >= counts.waiting) {
    when = `Waiting for a connection: ${they} will carry on by ${one ? "itself" : "themselves"} when the network is back.`;
  } else if (plan.finishesInSeconds !== null && plan.finishesInSeconds > 0 && plan.basis === "measured") {
    limitSaid = limit !== null;
    when = `At the present speed${limit ? `, limited to ${limit},` : ""} ${they} will finish in about ${formatDuration(plan.finishesInSeconds)}.`;
  } else if (plan.finishesInSeconds !== null && plan.finishesInSeconds > 0 && plan.basis === "limit" && limit) {
    limitSaid = true;
    when = `Nothing is moving yet. At the limit you set, ${limit}, ${they} would finish in about ${formatDuration(plan.finishesInSeconds)}.`;
  } else if (plan.finishesInSeconds !== null) {
    // Only checking and installing is left; there is nothing to time.
    when = null;
  } else if (plan.basis === null) {
    when = "Estimates appear once a transfer is under way.";
  } else if (plan.unknownSizes > 0) {
    when = "A finish time cannot be given until every size is known.";
  } else {
    when = "A finish time cannot be estimated yet.";
  }

  if (plan.finishesInSeconds !== null && plan.finishesInSeconds > 0 && when && !when.startsWith("Waiting")) {
    notes.push(`${plan.basis === "limit" ? "That would be" : "That is"} about ${clockAt(now + plan.finishesInSeconds * 1000, now)}.`);
  }
  if (limit && !limitSaid) notes.push(`Transfers are limited to ${limit}.`);
  if (counts.paused > 0) notes.push(`${counts.paused} more ${counts.paused === 1 ? "is" : "are"} paused and not counted.`);
  if (attention) notes.push(attention);
  return { lead: when ? `${what} ${when}` : what, notes };
}

// ── The queue ───────────────────────────────────────────────────────────────

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Where a waiting download stands, counting from 1: "Next", "2nd in line". */
export function queuePosition(position: number): string {
  return position <= 1 ? "Next" : `${ordinal(position)} in line`;
}

/** Each waiting download's place in the line, by id, in the order the server will start them. */
export function queuePositions(queue: Array<Pick<DownloadPlanItem, "id" | "phase">>): Map<string, number> {
  const positions = new Map<string, number>();
  for (const item of queue) if (item.phase === "waiting") positions.set(item.id, positions.size + 1);
  return positions;
}

/** Whether the schedule can draw a bar for this item. */
export function isScheduled(item: Pick<DownloadPlanItem, "state" | "phase" | "startsInSeconds" | "finishesInSeconds">): boolean {
  return item.phase !== "paused" && item.state !== "verifying" && item.startsInSeconds !== null && item.finishesInSeconds !== null;
}

/**
 * Why an item has no bar in the schedule, in a few words. Null when it has one.
 * `stalled` is what the download itself reports when it stopped and is waiting to try
 * again; no forecast is honest for it, whatever the queue's arithmetic says.
 */
export function unscheduledReason(
  item: Pick<DownloadPlanItem, "state" | "phase" | "remainingBytes" | "startsInSeconds" | "finishesInSeconds">,
  plan: Pick<DownloadPlan, "basis">,
  stalled?: string,
): string | null {
  if (stalled && item.phase === "waiting") return stalled;
  if (isScheduled(item)) return null;
  if (item.phase === "paused") return "Paused";
  if (item.state === "verifying") return "Arrived; being checked";
  if (item.remainingBytes === null) return "Size not known yet";
  if (plan.basis === null) return "No speed measured yet";
  return "Behind a download whose size is not known";
}

/** "Downloading now" or "Starts in about 12 minutes, at 14:32". */
export function startWords(item: Pick<DownloadPlanItem, "phase" | "startsInSeconds">, now: number): string {
  if (item.phase === "active" || !item.startsInSeconds)
    return item.phase === "active" ? "Downloading now" : "Starts as soon as a slot is free";
  return `Starts in about ${formatDuration(item.startsInSeconds)}, at ${clockAt(now + item.startsInSeconds * 1000, now)}`;
}

/** "Finishes about 15:10, in 50 minutes". */
export function finishWords(finishesInSeconds: number, now: number): string {
  return `Finishes about ${clockAt(now + finishesInSeconds * 1000, now)}, in ${formatDuration(finishesInSeconds)}`;
}

// ── One download ────────────────────────────────────────────────────────────

export type Tone = "normal" | "alive" | "success" | "warning" | "danger";

/** For a download that stopped and will try again by itself: what it is waiting for. Null for any other. */
export function stalledWords(download: Pick<DownloadDto, "state" | "error" | "errorKind">): string | null {
  if (download.state !== "queued" || !download.error) return null;
  return download.errorKind === "offline" ? "Waiting for a connection" : "Waiting to retry";
}

/** A download's state as one or two words, for the head of its details. */
export function stateWords(download: Pick<DownloadDto, "state" | "message" | "error" | "errorKind">): { label: string; tone: Tone } {
  switch (download.state) {
    case "running":
      return { label: "Downloading", tone: "alive" };
    case "verifying":
      return { label: download.message === "Installing" ? "Installing" : "Checking the file", tone: "alive" };
    case "queued":
      if (download.error) return { label: stalledWords(download) ?? "Waiting to retry", tone: "warning" };
      return { label: "Waiting for its turn", tone: "normal" };
    case "paused":
      return { label: "Paused", tone: "normal" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "cancelled":
      return { label: "Cancelled", tone: "normal" };
    case "completed":
      return { label: "Installed", tone: "success" };
  }
}

/** "Attempt 3 of 8, in 40 seconds", while a download waits to try again. Null when nothing is scheduled. */
export function retryWords(attempts: DownloadDetail["attempts"], now: number): string | null {
  if (attempts.nextAttemptAt === null) return null;
  const seconds = Math.max(0, Math.round((attempts.nextAttemptAt - now) / 1000));
  const which = `Attempt ${Math.min(attempts.made + 1, attempts.allowed)} of ${attempts.allowed}`;
  return seconds <= 0 ? `${which}, any moment now` : `${which}, in ${formatDuration(seconds)}`;
}

export interface EventLine {
  at: number;
  title: string;
  detail: string | null;
  tone: Tone;
}

/** An attempt that fails this soon after it starts never got going; the two events are told as one step. */
const BOUNCE_MS = 3000;

/**
 * A download's changes of state as a story: what each one meant, given what came
 * before it. A retry that failed at once ("running", then "queued" with a reason a
 * moment later) is one line, not two.
 */
export function describeEvents(events: DownloadEvent[]): EventLine[] {
  const lines: EventLine[] = [];
  let started = false;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    const before = index > 0 ? events[index - 1]!.state : null;
    const detail = event.detail ?? null;
    let title: string;
    let tone: Tone = "normal";
    switch (event.state) {
      case "queued":
        if (before === null) title = "Added to the queue";
        else if (detail) {
          title = /no connection|network/i.test(detail) ? "Connection lost — waiting to retry" : "Interrupted — waiting to retry";
          tone = "warning";
        } else if (before === "paused") title = "Resumed — back in the queue";
        else if (before === "failed" || before === "cancelled") title = "Retried — back in the queue";
        else title = "Back in the queue";
        break;
      case "running": {
        const next = events[index + 1];
        if (started && next && next.state === "queued" && next.detail && next.at - event.at <= BOUNCE_MS) {
          lines.push({
            at: next.at,
            title: /no connection|network/i.test(next.detail) ? "Tried again — still no connection" : "Tried again — interrupted",
            // The reason is given once; repeating it under every failed try adds nothing.
            detail: lines.some((line) => line.detail === next.detail) ? null : next.detail,
            tone: "warning",
          });
          index += 1;
          continue;
        }
        // Back to fetching straight from the check, with a reason: the storage lost part of what was written to it.
        if (before === "verifying" && detail) {
          title = "Storage lost part of the file — fetching it again";
          tone = "warning";
        } else title = started ? "Carried on" : "Started";
        started = true;
        break;
      }
      case "paused":
        title = "Paused";
        break;
      case "verifying":
        title = "Checking the file";
        break;
      case "completed":
        title = "Installed";
        tone = "success";
        break;
      case "failed":
        title = "Failed";
        tone = "danger";
        break;
      case "cancelled":
        title = "Cancelled";
        break;
      default:
        title = event.state.charAt(0).toUpperCase() + event.state.slice(1);
    }
    lines.push({ at: event.at, title, detail, tone });
  }
  return lines;
}

/** What can be said about whether the file is the one the source published. */
export function integrityVerdict(
  integrity: DownloadDetail["integrity"],
  state: DownloadDto["state"],
): { tone: Tone; title: string; text: string } {
  // What the source published and what the file has by the same measure: a SHA-256, or the MD5 some sources give instead.
  const byMd5 = !integrity.sha256Expected && Boolean(integrity.md5Expected);
  const expected = byMd5 ? integrity.md5Expected : integrity.sha256Expected;
  const actual = byMd5 ? integrity.md5Actual : integrity.sha256Actual;
  if (expected && actual) {
    return expected === actual
      ? { tone: "success", title: "Verified", text: "The file received matches the checksum published by the source." }
      : {
          tone: "danger",
          title: "Mismatch",
          text: "The file received does not match the checksum published by the source, so it was deleted and nothing was installed. It may have been damaged on the way or as it was written to storage, or changed at the source. Retry fetches it again.",
        };
  }
  if (expected) {
    const stopped = state === "failed" || state === "cancelled";
    return stopped
      ? { tone: "normal", title: "Not checked", text: "The download did not finish, so there was nothing complete to check." }
      : {
          tone: "normal",
          title: "Will be checked",
          text: "The file is compared with this checksum when the download finishes, before anything is installed.",
        };
  }
  if (actual) {
    return {
      tone: "normal",
      title: "No checksum published",
      text: "The source publishes no checksum for this file, so there was nothing to compare it with. The file's own checksum was recorded when it arrived, and later checks use it to spot damage.",
    };
  }
  return {
    tone: "normal",
    title: "No checksum published",
    text: "The source publishes no checksum for this file. The file's own checksum is recorded once it arrives.",
  };
}

/** How the bytes are fetched, for someone who has never heard of a fetcher. */
export function fetcherWords(fetcher: string): string {
  if (fetcher === "http") return "A plain download of the whole file. If it is interrupted, it carries on from where it stopped.";
  if (fetcher === "pmtiles-extract")
    return "A region cut from a larger map archive. Only the tiles for the chosen area are read, never the whole archive.";
  return `Fetched by “${fetcher}”.`;
}

// ── Map regions ─────────────────────────────────────────────────────────────

const degrees = (value: number, positive: string, negative: string) => `${Math.abs(value).toFixed(2)}° ${value < 0 ? negative : positive}`;

/** "45.80° N to 46.20° N, 6.80° E to 7.40° E" from [west, south, east, north]. */
export function regionExtent(bbox: readonly [number, number, number, number]): string {
  const [west, south, east, north] = bbox;
  return `${degrees(south, "N", "S")} to ${degrees(north, "N", "S")}, ${degrees(west, "E", "W")} to ${degrees(east, "E", "W")}`;
}

/** The same steps the Maps screen offers when a region is chosen. */
const detailLevels: Array<[maxZoom: number, label: string]> = [
  [5, "continents and countries"],
  [7, "countries and cities"],
  [9, "main roads and large towns"],
  [11, "roads and towns"],
  [13, "villages and tracks"],
  [14, "footpaths and buildings"],
];

/** "Zoom 0 to 14: detailed enough for footpaths and buildings." */
export function regionDetail(region: { minZoom: number; maxZoom: number; tileType: string }): string {
  const zooms = region.minZoom === region.maxZoom ? `Zoom ${region.maxZoom}` : `Zoom ${region.minZoom} to ${region.maxZoom}`;
  if (region.tileType === "terrain") return `${zooms}: the shape of the land, for hill shading.`;
  const level = detailLevels.find(([limit]) => region.maxZoom <= limit)?.[1];
  return level ? `${zooms}: detailed enough for ${level}.` : `${zooms}: everything the map source has.`;
}
