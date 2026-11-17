/**
 * What the board says, kept apart from the components so that it can be read and tested
 * in one place: when something was, a person's latest check-in in one line, and a
 * message's words split into text and the web addresses in it.
 */
import type { BoardCheckInLine, CheckInStatus } from "@outpost/shared";
import { formatTimeOfDay } from "@/lib/clock";
import { formatDate } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" });

const startOfDay = (at: number) => {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** "14:02", "yesterday, 14:02", "Tuesday, 14:02", or "3 Nov 2026, 14:02": when a message was written, as the board lists it. */
export function whenWritten(at: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  const time = formatTimeOfDay(at);
  if (days <= 0) return time;
  if (days === 1) return `yesterday, ${time}`;
  if (days < 7) return `${weekday.format(at)}, ${time}`;
  return `${formatDate(at)}, ${time}`;
}

/** "14:02 today", "14:02 yesterday", "Tuesday 14:02", "3 Nov 2026": a check-in's time in the strip. */
export function whenCheckedIn(at: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  const time = formatTimeOfDay(at);
  if (days <= 0) return `${time} today`;
  if (days === 1) return `${time} yesterday`;
  if (days < 7) return `${weekday.format(at)} ${time}`;
  return formatDate(at);
}

/** "Tuesday", "yesterday", "3 Nov 2026": the day a check-in was, for "no check-in since". */
function sinceDay(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 1) return "yesterday";
  if (days < 7) return weekday.format(at);
  return formatDate(at);
}

export const STATUS_WORDS: Record<CheckInStatus, string> = { safe: "safe", help: "needs help", other: "checked in" };

/** A check-in older than this is reported as "no check-in since". */
export const STALE_AFTER_MS = DAY_MS;

/**
 * One person's line in the strip, without the name: "safe, gone to Mum's, 14:02 today",
 * "needs help: car won't start, 09:10 today", "no check-in since Tuesday", "no check-in yet".
 */
export function checkInWords(line: BoardCheckInLine, now = Date.now()): string {
  const latest = line.latest;
  if (!latest) return "no check-in yet";
  if (now - latest.createdAt > STALE_AFTER_MS) return `no check-in since ${sinceDay(latest.createdAt, now)}`;
  // Its own full stop is left off: the place and the time follow it on the same line.
  const words = (latest.body.split("\n")[0] ?? "").trim().replace(/\.+$/, "");
  const head =
    latest.status === "other"
      ? words || STATUS_WORDS.other
      : words
        ? `${STATUS_WORDS[latest.status]}: ${words}`
        : STATUS_WORDS[latest.status];
  // Facts about one check-in, joined as every such line is (Joined's " · "): the words may have commas of their own.
  return [head, latest.place, whenCheckedIn(latest.createdAt, now)].filter(Boolean).join(" · ");
}

/** Whether the strip should draw a line as needing attention: help asked for, and not since overtaken by a day. */
export const needsHelp = (line: BoardCheckInLine, now = Date.now()) =>
  line.latest?.status === "help" && now - line.latest.createdAt <= STALE_AFTER_MS;

export type Piece = { text: string } | { href: string; text: string };

/**
 * A message's words cut into plain text and web addresses. Only `http:` and `https:`
 * addresses become links, and only as written: a full stop or a closing bracket at the
 * end is left out of the address. Nothing else in a message is ever read as markup.
 */
export function linkPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  const pattern = /\bhttps?:\/\/[^\s<>"'`]+/gi;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    let address = match[0];
    // Punctuation that ends a sentence is not part of the address; a bracket only when it does not open one inside.
    while (/[.,;:!?)\]]$/.test(address)) {
      if (address.endsWith(")") && (address.match(/\(/g)?.length ?? 0) >= (address.match(/\)/g)?.length ?? 0)) break;
      address = address.slice(0, -1);
    }
    let valid = false;
    try {
      const url = new URL(address);
      valid = url.protocol === "http:" || url.protocol === "https:";
    } catch {
      valid = false;
    }
    if (!valid) continue;
    const start = match.index ?? 0;
    if (start > at) pieces.push({ text: text.slice(at, start) });
    pieces.push({ href: address, text: address });
    at = start + address.length;
  }
  if (at < text.length) pieces.push({ text: text.slice(at) });
  return pieces;
}

/** Long enough to fold, and to offer copying it: a pasted note rather than a line. */
export const isLong = (text: string) => text.length > 480 || text.split("\n").length > 8;
