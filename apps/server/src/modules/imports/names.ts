/**
 * Names and paths inside an import: what kind of thing a file is, how Notion marks its
 * exports, the order pages are created in, and the key that lets a later import of the
 * same source be recognised.
 *
 * Paths here are always relative to the import's file tree and use `/`, whatever the
 * machine's own separator is, so that keys computed on one computer match on another.
 */
import path from "node:path";
import type { ImportItemFormat } from "@outpost/shared";
import { sha256Hex } from "../../core/ids.ts";

/** File endings that become pages, with what they are read as. */
const PAGE_FORMATS: Record<string, ImportItemFormat> = {
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "text",
  ".html": "html",
  ".htm": "html",
  ".csv": "csv",
};

/**
 * What a page may have attached, by file ending. The notes module is the authority and
 * checks every file again when it is attached; this copy only lets the preview say
 * ahead of time that a file will be left out.
 */
const ATTACHABLE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf", ".txt", ".md", ".csv", ".json", ".gpx", ".zip"]);
export const MAX_ATTACHABLE_BYTES = 50 * 1024 * 1024;

/** Folder pages are told apart from files by a trailing slash, which no file path has. */
export const folderPath = (dir: string): string => `${dir}/`;

export const extensionOf = (name: string): string => path.posix.extname(name).toLowerCase();
export const baseName = (file: string): string => path.posix.basename(file);
export const dirName = (file: string): string => {
  const dir = path.posix.dirname(file);
  return dir === "." ? "" : dir;
};
/** The name without its ending: "Trip plan.md" → "Trip plan". */
export const stemOf = (name: string): string => name.slice(0, name.length - path.posix.extname(name).length);

export const pageFormatOf = (name: string): ImportItemFormat | undefined => PAGE_FORMATS[extensionOf(name)];
export const isPdf = (name: string): boolean => extensionOf(name) === ".pdf";
export const isZip = (name: string): boolean => extensionOf(name) === ".zip";
export const isAttachable = (name: string): boolean => ATTACHABLE.has(extensionOf(name));

/** Files that operating systems and tools leave behind, and hidden folders such as `.git` or `.obsidian`. */
export function isJunk(file: string): boolean {
  return file
    .split("/")
    .some((segment) => segment.startsWith(".") || segment === "__MACOSX" || /^(thumbs\.db|desktop\.ini)$/i.test(segment));
}

/**
 * Notion ends every exported file and folder name with the page's id: 32 hexadecimal
 * digits after a space. `Trip plan 0a1b…f9` → title "Trip plan", id "0a1b…f9".
 */
const NOTION_NAME = /^(.*?)[ ]?([0-9a-f]{32})$/i;

export function splitNotionName(stem: string): { title: string; id?: string } {
  const match = NOTION_NAME.exec(stem);
  if (!match) return { title: stem };
  return { title: match[1]!.trim(), id: match[2]!.toLowerCase() };
}

/** Notion writes a database twice: the view as exported, and `…_all.csv` with every row. */
const ALL_ROWS_SUFFIX = "_all";

/** For `Tasks <id>_all.csv`, the stem of its plain twin (`Tasks <id>`); otherwise undefined. */
export function allRowsTwinOf(name: string): string | undefined {
  if (extensionOf(name) !== ".csv") return undefined;
  const stem = stemOf(name);
  if (!stem.endsWith(ALL_ROWS_SUFFIX)) return undefined;
  const plain = stem.slice(0, -ALL_ROWS_SUFFIX.length);
  return splitNotionName(plain).id ? plain : undefined;
}

/** A file that gives a folder its page: the folder's own text rather than a page inside it. */
const INDEX_NAMES = ["readme.md", "index.md", "readme.markdown", "index.markdown", "index.html", "index.htm"];

/** Which of `names` is the folder's index file, if any. `README.md` wins over `index.md`. */
export function pickIndexFile(names: readonly string[]): string | undefined {
  for (const wanted of INDEX_NAMES) {
    const found = names.find((name) => name.toLowerCase() === wanted);
    if (found) return found;
  }
  return undefined;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** "Chapter 2" before "Chapter 10", ignoring case: the order a file manager and Notion show. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * The key of an item that has no id of its own: the name of the uploaded file it came
 * from plus its path inside it. Uploading the same archive again gives the same keys;
 * a different archive that happens to contain a `README.md` does not collide with it.
 */
export function pathKey(uploadName: string, relPath: string): string {
  return `path:${sha256Hex(`${uploadName.normalize("NFC")}\n${relPath.normalize("NFC")}`)}`;
}

export const notionKey = (id: string): string => `notion:${id.toLowerCase()}`;

/** The form paths are compared in when a link is matched to a file: composed Unicode, lower case. */
export const matchKey = (file: string): string => file.normalize("NFC").toLowerCase();

/** A page title has one line and a sensible length. */
export function cleanTitle(value: string, fallback = "Untitled"): string {
  const cleaned = value
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
    .trim();
  return cleaned || fallback;
}
