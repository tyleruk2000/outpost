/**
 * The LibriVox shelf: a short list of recordings that Explore offers as links.
 *
 * It lives in `audiobooks.json` in the catalogue folder. Outpost never fetches these
 * files: LibriVox's recordings are hosted by the Internet Archive, whose terms of use
 * could not be read (see docs/sources.md), so a person downloads a book in their own
 * browser and adds it under Library. What the file holds is LibriVox's own catalogue
 * record of each book, which LibriVox places in the public domain, and a line in our
 * own words. Nothing here makes a request.
 */
import fs from "node:fs";
import path from "node:path";
import type { LibrivoxShelf } from "@outpost/shared";
import { z } from "zod";

export const SHELF_FILE = "audiobooks.json";
export const SHELF_SCHEMA_VERSION = 1;
/** The zips hold 64 kbps MP3s: eight thousand bytes for each second. */
export const BYTES_PER_SECOND = 8000;

const LIBRIVOX_HOSTS = new Set(["librivox.org"]);
const ARCHIVE_HOSTS = new Set(["archive.org", "www.archive.org"]);

const httpsOn = (hosts: Set<string>, what: string) =>
  z
    .string()
    .max(400)
    .refine(
      (value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" && hosts.has(url.hostname) && !url.username && !url.password;
        } catch {
          return false;
        }
      },
      `${what} is an https address on ${[...hosts].join(" or ")}.`,
    );

const name = z.string().trim().min(1).max(200);

const bookSchema = z.strictObject({
  id: z.string().regex(/^\d{1,8}$/, "A LibriVox id is a number."),
  shelf: z.enum(["practical", "adults", "children"] satisfies LibrivoxShelf[]),
  title: name,
  authors: z.array(name).min(1).max(20),
  readers: z.array(name).min(1).max(200),
  language: name,
  totalSeconds: z.number().int().positive(),
  sections: z.number().int().positive().max(2000),
  textYear: z.string().max(20).nullable(),
  summary: z.string().trim().min(1).max(400),
  pageUrl: httpsOn(LIBRIVOX_HOSTS, "The book's page"),
  zipUrl: httpsOn(ARCHIVE_HOSTS, "The zip"),
  zipName: z.string().regex(/^[A-Za-z0-9._-]+\.zip$/, "The zip's name is a plain file name ending .zip."),
});

const shelfSchema = z.strictObject({
  $comment: z.string().optional(),
  schemaVersion: z.literal(SHELF_SCHEMA_VERSION),
  source: z.literal("LibriVox"),
  checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  licence: z.string().min(1).max(200),
  licenceNote: z.string().min(1).max(1000),
  books: z.array(bookSchema).max(200),
});

export type ShelfBook = z.infer<typeof bookSchema>;
export type Shelf = z.infer<typeof shelfSchema>;

export interface LoadedShelf {
  shelf: Shelf;
  problems: string[];
}

const EMPTY: Shelf = { schemaVersion: SHELF_SCHEMA_VERSION, source: "LibriVox", checked: "", licence: "", licenceNote: "", books: [] };

/** Reads the shelf. A missing file is an empty shelf; a broken one is reported and treated as empty. */
export function loadShelf(catalogDir: string): LoadedShelf {
  const file = path.join(catalogDir, SHELF_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { shelf: EMPTY, problems: [] };
    return { shelf: EMPTY, problems: [`${SHELF_FILE} could not be read as JSON.`] };
  }
  const parsed = shelfSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { shelf: EMPTY, problems: [`${SHELF_FILE}: ${issue?.path.join(".") || "the file"}: ${issue?.message ?? "not valid"}`] };
  }
  const problems: string[] = [];
  const ids = new Set<string>();
  const zips = new Set<string>();
  for (const book of parsed.data.books) {
    if (ids.has(book.id)) problems.push(`${SHELF_FILE}: book ${book.id} is listed twice.`);
    if (zips.has(book.zipName)) problems.push(`${SHELF_FILE}: two books download as ${book.zipName}.`);
    ids.add(book.id);
    zips.add(book.zipName);
  }
  return { shelf: parsed.data, problems };
}
