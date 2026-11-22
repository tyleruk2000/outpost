/**
 * Audiobooks from the server, and the words for their running time and size.
 *
 * The keys start with "documents" (an audiobook's files are documents, so anything
 * that changes them refreshes these) or "catalog" (the LibriVox shelf says which of
 * its books are already held, which changes with the collections).
 */
import {
  type AudiobookDto,
  type AudiobookListResponse,
  type AudiobookResponse,
  formatBytes,
  type LibrivoxShelfResponse,
} from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { plural } from "@/lib/utils";

export const audiobookKeys = {
  list: (q: string, sort: string) => ["documents", "audiobooks", "list", q, sort] as const,
  one: (id: string) => ["documents", "audiobooks", "one", id] as const,
  shelf: ["catalog", "audiobooks", "librivox"] as const,
};

export const useAudiobooks = (q = "", sort: "added" | "title" = "added") =>
  useQuery({
    queryKey: audiobookKeys.list(q, sort),
    queryFn: ({ signal }) => api.get<AudiobookListResponse>("/api/audiobooks", { q: q || undefined, sort }, signal),
  });

export const useAudiobook = (id: string | undefined) =>
  useQuery({
    queryKey: audiobookKeys.one(id ?? ""),
    queryFn: ({ signal }) => api.get<AudiobookResponse>(`/api/audiobooks/${id}`, undefined, signal),
    select: (data) => data.audiobook,
    enabled: Boolean(id),
  });

export const useLibrivoxShelf = (enabled = true) =>
  useQuery({
    queryKey: audiobookKeys.shelf,
    queryFn: ({ signal }) => api.get<LibrivoxShelfResponse>("/api/audiobooks/librivox", undefined, signal),
    enabled,
  });

/** "1 hour 12 minutes", rounded to the minute: what a running time is spoken as. */
export function runningTime(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
  // A recording of a few seconds is not said to be a minute long.
  if (seconds < 30) return "under a minute";
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return plural(minutes, "minute");
  return rest === 0 ? plural(hours, "hour") : `${plural(hours, "hour")} ${plural(rest, "minute")}`;
}

/** "12:04" or "1:02:09": a position in a recording, as players show it. */
export function clockTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** "12 minutes 4 seconds": the same, for a screen reader. */
export function spokenTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const parts = [h ? plural(h, "hour") : "", m ? plural(m, "minute") : "", plural(s, "second")].filter(Boolean);
  return parts.join(" ");
}

/** "By Sun Tzu, read by Moira Fogarty" */
export function byline(book: Pick<AudiobookDto, "author" | "readers">): string | null {
  const readers =
    book.readers.length === 0
      ? null
      : book.readers.length <= 3
        ? book.readers.join(", ")
        : `${book.readers.slice(0, 2).join(", ")} and ${book.readers.length - 2} others`;
  if (book.author && readers) return `By ${book.author}, read by ${readers}`;
  if (book.author) return `By ${book.author}`;
  if (readers) return `Read by ${readers}`;
  return null;
}

/** "7 chapters, 1 hour 12 minutes, 35 MB" */
export function factsLine(book: { chapterCount: number; totalSeconds: number | null; sizeBytes: number }): string {
  return [book.chapterCount > 1 ? plural(book.chapterCount, "chapter") : null, runningTime(book.totalSeconds), formatBytes(book.sizeBytes)]
    .filter(Boolean)
    .join(", ");
}
