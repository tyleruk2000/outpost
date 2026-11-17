/**
 * Turning a heap of audio files into a book: their order, the chapters' titles, and
 * what the book is called and who wrote and reads it.
 *
 * Every fact comes from somewhere that can be named: the files' own tags, LibriVox's
 * catalogue record of the book, what the person typed, or the file's own name. Nothing
 * is guessed. A field the sources disagree about, or do not give, is left empty.
 */
import path from "node:path";
import type { AudioFacts } from "../documents/audio-tags.ts";
import { naturalCompare } from "../imports/names.ts";
import type { ShelfBook } from "./shelf.ts";

export interface AudioFile {
  /** The file's path as the person knows it: its name, or its path inside the zip. */
  name: string;
  facts: AudioFacts;
}

/**
 * The reading order. When every file carries a track number, and no two the same
 * (counting the disc), the tags decide; otherwise the names do, in natural order, so
 * that "Chapter 2" comes before "Chapter 10". LibriVox numbers its files both ways.
 */
export function orderChapters<T extends AudioFile>(files: T[]): T[] {
  const byName = [...files].sort((a, b) => naturalCompare(a.name, b.name));
  const keys = files.map((file) => (file.facts.track ? `${file.facts.disc ?? 1}:${file.facts.track}` : null));
  const numbered = keys.every((key) => key !== null) && new Set(keys).size === files.length;
  if (!numbered) return byName;
  return [...files].sort(
    (a, b) => (a.facts.disc ?? 1) - (b.facts.disc ?? 1) || (a.facts.track ?? 0) - (b.facts.track ?? 0) || naturalCompare(a.name, b.name),
  );
}

/** A chapter's title: its own tag, or else its file name without the extension. */
export function chapterTitle(file: AudioFile): string {
  if (file.facts.title) return file.facts.title;
  const base = path.posix.basename(file.name.replaceAll("\\", "/"));
  const ext = path.posix.extname(base);
  return (ext ? base.slice(0, -ext.length) : base).trim() || base;
}

/** The value every file that has the field agrees on, or undefined when they differ or none has it. */
function agreed(files: AudioFile[], pick: (facts: AudioFacts) => string | undefined): string | undefined {
  const values = new Set(files.map((file) => pick(file.facts)).filter((value): value is string => Boolean(value)));
  return values.size === 1 ? [...values][0] : undefined;
}

export interface BookFacts {
  title: string;
  author: string | null;
  readers: string[];
  /** Where each fact came from, for the record. */
  from: { title: "typed" | "librivox" | "tags" | "file name"; author: "librivox" | "tags" | null; readers: "librivox" | "tags" | null };
}

/**
 * What the book is called and who made it. `typedTitle` is what the person entered;
 * `librivox` is the shelf's record when the files were matched to it; `archiveName`
 * is the zip's file name, the last resort for a title.
 */
export function bookFacts(files: AudioFile[], options: { typedTitle?: string; librivox?: ShelfBook; archiveName?: string }): BookFacts {
  const { typedTitle, librivox, archiveName } = options;
  const albumTitle = agreed(files, (facts) => facts.album);
  const fallbackName = archiveName ?? (files.length === 1 ? files[0]!.name : undefined);
  const fileTitle = fallbackName ? chapterTitle({ name: fallbackName, facts: {} }) : undefined;
  const title = typedTitle?.trim() || librivox?.title || albumTitle || fileTitle || "Audiobook";
  const tagAuthor = agreed(files, (facts) => facts.albumArtist) ?? agreed(files, (facts) => facts.artist);
  const tagReaders = [...new Set(files.map((file) => file.facts.reader).filter((value): value is string => Boolean(value)))];
  return {
    title: title.slice(0, 300),
    author: librivox ? librivox.authors.join(", ") : (tagAuthor ?? null),
    readers: librivox ? librivox.readers : tagReaders,
    from: {
      title: typedTitle?.trim() ? "typed" : librivox ? "librivox" : albumTitle ? "tags" : "file name",
      author: librivox ? "librivox" : tagAuthor ? "tags" : null,
      readers: librivox ? "librivox" : tagReaders.length > 0 ? "tags" : null,
    },
  };
}

/**
 * The shelf's record for these files, if they are one of its books: named by the
 * person (from Explore's "Add the downloaded file"), or recognised by the zip's file
 * name. A browser may add " (1)" to a name it has saved before, so that is allowed for.
 * Either way the number of files must match the number of sections LibriVox lists.
 */
export function matchLibrivox(
  books: ShelfBook[],
  options: { librivoxId?: string; archiveName?: string; fileCount: number },
): ShelfBook | undefined {
  const { librivoxId, archiveName, fileCount } = options;
  const named = librivoxId ? books.find((book) => book.id === librivoxId) : undefined;
  const plainName = archiveName?.replace(/ \(\d+\)(\.zip)$/i, "$1").toLowerCase();
  const recognised = !named && plainName ? books.find((book) => book.zipName.toLowerCase() === plainName) : undefined;
  const book = named ?? recognised;
  return book && book.sections === fileCount ? book : undefined;
}

/** "Sun Tzu" and ["Moira Fogarty"] to "By Sun Tzu. Read by Moira Fogarty." for the book's page and search. */
export function describeBook(facts: Pick<BookFacts, "author" | "readers">): string | null {
  const parts: string[] = [];
  if (facts.author) parts.push(`By ${facts.author}.`);
  if (facts.readers.length === 1) parts.push(`Read by ${facts.readers[0]}.`);
  else if (facts.readers.length > 1 && facts.readers.length <= 4) parts.push(`Read by ${facts.readers.join(", ")}.`);
  else if (facts.readers.length > 4) parts.push(`Read by ${facts.readers.slice(0, 3).join(", ")} and ${facts.readers.length - 3} others.`);
  return parts.length > 0 ? parts.join(" ") : null;
}
