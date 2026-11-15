/**
 * The library file kiwix-serve reads, and the little Outpost needs to know about a ZIM
 * archive to put it there.
 *
 * kiwix-serve trusts this file: it does not open each archive to fill in missing
 * details. Full-text search in particular refuses to run for a book with no language.
 * So every book is written with complete metadata, which Outpost reads back from the
 * archive itself (through kiwix-serve) the first time the book is served.
 */
import fs from "node:fs";
import path from "node:path";

export interface LibraryBook {
  /** UUID from the archive's header. */
  id: string;
  /** Absolute path as kiwix-serve will see it. */
  path: string;
  title?: string;
  description?: string;
  language?: string;
  creator?: string;
  publisher?: string;
  name?: string;
  flavour?: string;
  date?: string;
  tags?: string;
  articleCount?: number;
  mediaCount?: number;
  /** Size in kibibytes, as the format expects. */
  sizeKib?: number;
}

const xml = (value: string | number) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export function renderLibrary(books: LibraryBook[]): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<library version="20110515">'];
  for (const book of books) {
    const attributes: Array<[string, string | number | undefined]> = [
      ["id", book.id],
      ["path", book.path],
      ["title", book.title],
      ["description", book.description],
      ["language", book.language],
      ["creator", book.creator],
      ["publisher", book.publisher],
      ["name", book.name],
      ["flavour", book.flavour],
      ["date", book.date],
      ["tags", book.tags],
      ["articleCount", book.articleCount],
      ["mediaCount", book.mediaCount],
      ["size", book.sizeKib],
    ];
    const rendered = attributes
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => `${key}="${xml(value!)}"`)
      .join(" ");
    lines.push(`  <book ${rendered}/>`);
  }
  lines.push("</library>", "");
  return lines.join("\n");
}

/** Writes the library file in one step, so kiwix-serve never reads half of it. */
export async function writeLibrary(file: string, books: LibraryBook[]): Promise<boolean> {
  const next = renderLibrary(books);
  const current = await fs.promises.readFile(file, "utf8").catch(() => undefined);
  if (current === next) return false;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  // kiwix-serve runs as a different user in its own container and must be able to read this.
  await fs.promises.writeFile(temporary, next, { mode: 0o644 });
  await fs.promises.rename(temporary, file);
  return true;
}

const ZIM_MAGIC = 0x044d495a;

/** Reads the UUID from a ZIM archive's header, or returns undefined if the file is not one. */
export async function readZimUuid(file: string): Promise<string | undefined> {
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(file, "r");
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, 24, 0);
    if (bytesRead < 24 || header.readUInt32LE(0) !== ZIM_MAGIC) return undefined;
    const hex = header.subarray(8, 24).toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}

/** The name kiwix-serve gives a book in its URLs: the file name without its extension. */
export function bookNameOf(file: string): string {
  return path.basename(file).replace(/\.zim$/i, "").toLowerCase().replace(/\s+/g, "_");
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** kiwix-serve escapes text in its JSON and XML answers as HTML; turn it back into plain text. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return entities[code.toLowerCase()] ?? whole;
  });
}
