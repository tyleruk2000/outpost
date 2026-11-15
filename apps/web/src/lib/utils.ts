import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to be told about the project's own scale names. Without this it
 * takes `text-small` for a colour and drops it whenever a real colour such as
 * `text-ink` appears in the same class list.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "small", "body", "lead", "heading", "title", "display"],
      radius: ["control", "panel"],
      shadow: ["float", "dialog"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "3 minutes ago", "yesterday", or a date once it is more than a week old. */
export function timeAgo(timestamp: number | null | undefined): string {
  if (!timestamp) return "never";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return relative.format(Math.round(seconds / 86400), "day");
  return dateFormat.format(timestamp);
}

export const formatDate = (timestamp: number) => dateFormat.format(timestamp);
export const formatDateTime = (timestamp: number) => dateTimeFormat.format(timestamp);

const numberFormat = new Intl.NumberFormat("en-GB");
export const formatNumber = (value: number) => numberFormat.format(value);

/** "1 page" / "3 pages". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? "⌘" : "Ctrl";
