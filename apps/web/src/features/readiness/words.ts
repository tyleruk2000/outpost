/**
 * What the readiness screens say, kept apart from the components so that it can be read
 * and tested in one place: a person's line in the roll call, a routine check's due line,
 * Home's one line of what is overdue, and the times a log is grouped by.
 */
import type { RollCallLine, RoutineCheck } from "@outpost/shared";
import { STATUS_WORDS, whenCheckedIn } from "@/features/board/words";
import { formatTimeOfDay } from "@/lib/clock";
import { appLocale } from "@/lib/region";
import { formatDate } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (at: number) => {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** "5 minutes", "3 hours", "2 days": how long ago, in the largest unit that fits. */
export function ageWords(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "14:00 today", "14:00 yesterday", "3 Nov 2026, 14:00": the time a roll call counts from. */
export function sinceWords(at: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  const time = formatTimeOfDay(at);
  if (days <= 0) return `${time} today`;
  if (days === 1) return `${time} yesterday`;
  return `${formatDate(at)}, ${time}`;
}

/** One person's line in the roll call, without the name: "safe · gone to Mum's · 14:02 today (2 hours ago)". */
export function rollCallWords(line: RollCallLine, now = Date.now()): string {
  const latest = line.latest;
  if (!latest) return "has not checked in";
  const words = (latest.body.split("\n")[0] ?? "").trim().replace(/\.+$/, "");
  const head =
    latest.status === "other"
      ? words || STATUS_WORDS.other
      : words
        ? `${STATUS_WORDS[latest.status]}: ${words}`
        : STATUS_WORDS[latest.status];
  const by = latest.channel === "board" ? null : "by radio";
  return [head, latest.place, by, `${whenCheckedIn(latest.createdAt, now)} (${ageWords(now - latest.createdAt)})`]
    .filter(Boolean)
    .join(" · ");
}

/** "Done 3 Nov 2026 by Sam · due 2 May 2027", "Never done", "Overdue since 2 May 2027". */
export function checkDueWords(check: RoutineCheck, now = Date.now()): string {
  if (check.lastDoneAt === null) return "Never done";
  const done = `Done ${formatDate(check.lastDoneAt)}${check.lastDoneBy ? ` by ${check.lastDoneBy}` : ""}`;
  if (check.dueAt === null) return done;
  if (check.dueAt <= now) return `${done} · overdue since ${formatDate(check.dueAt)}`;
  const days = Math.ceil((check.dueAt - now) / DAY_MS);
  return `${done} · due ${days <= 14 ? `in ${days} day${days === 1 ? "" : "s"}` : formatDate(check.dueAt)}`;
}

/** "Every 6 months", "Every 30 days", "Every year". */
export function everyWords(days: number): string {
  if (days === 1) return "Every day";
  if (days === 7) return "Every week";
  if (days === 365) return "Every year";
  if (days % 365 === 0) return `Every ${days / 365} years`;
  // Months as a household says them, for the usual lengths of one: 182 days is six months.
  const months = Math.round(days / 30.4);
  if (months >= 2 && months < 12 && Math.abs(months * 30.4 - days) <= 2) return `Every ${months} months`;
  if (days % 7 === 0 && days < 60) return `Every ${days / 7} weeks`;
  return `Every ${days} days`;
}

/** Home's one line: "Overdue: run the generator, test the torches and 2 more", or null when nothing is. */
export function overdueLine(checks: RoutineCheck[], now = Date.now()): string | null {
  const overdue = checks.filter((check) => check.dueAt === null || check.dueAt <= now);
  if (overdue.length === 0) return null;
  const names = overdue.map((check) => check.name.charAt(0).toLowerCase() + check.name.slice(1));
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

/** The day heading a log line is grouped under: "Today", "Yesterday", "Tuesday 17 Nov 2026". */
export function logDay(at: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${new Intl.DateTimeFormat(appLocale(), { weekday: "long" }).format(at)} ${formatDate(at)}`;
}

/** A time for a `datetime-local` field, in the device's own zone: "2026-11-21T14:10". */
export function localInput(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The time a `datetime-local` field holds, or null when it holds none. */
export function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
}
