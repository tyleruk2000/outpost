/**
 * Archives made with openZIM's "nautilus": a collection of files (PDFs, recordings,
 * films) with a list of them, and not a web site of pages.
 *
 * Such an archive has one page. It holds an empty list, and a script fills that list in
 * the browser from `database.js`, by way of a database the browser keeps for the page
 * (IndexedDB). A page in Outpost's sandbox has no origin of its own to keep a database
 * under, so the script stops at its first line and the list stays empty. Outpost reads
 * `database.js` itself and shows the documents in its own reader.
 *
 * This file knows the format and nothing else: how the page is recognised, what the
 * list holds, and how a file name in it becomes a path inside the archive. It was
 * written from nautilus's source (github.com/openzim/nautilus, read at v1.2.1 and at
 * each earlier tag) and checked against one archive, the Post Disaster Resource
 * Library of May 2024.
 *
 * What is recognised is the layout nautilus has written since 1.0.8 (October 2022): the
 * page at the top of the archive, `database.js` beside it and the files under `files/`.
 * Before that it used the older ZIM layout, with the page under `A/`, the list under
 * `-/` and the files under `I/`. No archive of that age was to hand to try, so it is
 * left unrecognised and such an archive is shown as its own page, as before.
 */
import { DEFAULT_LITERAL_LIMITS, type Literal, type LiteralLimits, parseDatabaseLiteral } from "./literal.ts";

/** The list, relative to the folder the page is in. */
export const NAUTILUS_DATABASE = "database.js";
/** Where the files are, relative to the same folder. `files_prefix` in nautilus.js. */
const FILES_PREFIX = "files/";

/** The most documents read from one archive. An archive that lists more is cut short, and says so. */
export const MAX_DOCUMENTS = 20_000;
const MAX_FILES_PER_DOCUMENT = 50;
const MAX_TITLE = 300;
const MAX_AUTHOR = 300;
const MAX_DESCRIPTION = 2000;
const MAX_FILE_NAME = 500;

/** Half of a character written without its other half. Such text cannot be put into an address. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/**
 * Whether a page is the one nautilus writes: it has the empty list the script fills,
 * and it loads that script. Both are in every version of the page's template.
 */
export function isNautilusHome(html: string): boolean {
  return /<ul\b[^>]*\bid=["']doc-list["']/i.test(html) && /<script\b[^>]*\bsrc=["'](?:\.\/)?nautilus\.js["']/i.test(html);
}

/**
 * The path inside the archive of a file the list names, or undefined when the name is
 * not one that can lie under `files/`.
 *
 * nautilus stores each file at `files/` followed by its name, and its page links to
 * exactly that. A name may hold folders ("guides/water.pdf"). It may not be used to
 * leave `files/`: no empty, "." or ".." part, no leading slash, no backslash, no control
 * character. Percent signs need no rule; the name is text, and is escaped whole wherever
 * it is put into an address, so "%2e%2e" stays those six characters.
 */
export function nautilusFilePath(name: unknown): string | undefined {
  if (typeof name !== "string" || name.length === 0 || name.length > MAX_FILE_NAME) return undefined;
  if (LONE_SURROGATE.test(name)) return undefined;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what is being refused
  if (/[\u0000-\u001f\u007f\\]/.test(name)) return undefined;
  if (name.split("/").some((part) => part === "" || part === "." || part === "..")) return undefined;
  return `${FILES_PREFIX}${name}`;
}

export interface NautilusFile {
  name: string;
  path: string;
}

export interface NautilusDocument {
  title: string;
  description: string;
  author: string;
  files: NautilusFile[];
}

export interface NautilusList {
  documents: NautilusDocument[];
  /** Entries that are not documents, or name no file that can be addressed. */
  skipped: number;
  /** True when the archive lists more than `MAX_DOCUMENTS`. */
  truncated: boolean;
}

/** One line of plain text, however it was written: no control characters, no stray halves of characters, not too long. */
function text(value: Literal | undefined, max: number): string {
  let raw: string;
  if (typeof value === "string") raw = value;
  else if (typeof value === "number") raw = String(value);
  // "authors" is meant to be words, but a list of names is an easy thing to have written.
  else if (Array.isArray(value)) raw = value.filter((item) => typeof item === "string" || typeof item === "number").join(", ");
  else return "";
  const clean = raw
    .replace(new RegExp(LONE_SURROGATE, "g"), "\ufffd")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what is being removed
    .replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  // Cut between characters, not through the middle of one.
  const cut = clean.slice(0, max);
  return (/[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut).trimEnd();
}

/**
 * Reads the text of a `database.js` into documents. Throws `LiteralError` when the file
 * is not a list written the way nautilus writes it. Entries inside a well-formed list
 * that make no sense are passed over and counted, as the archive's own page would have
 * shown them broken or not at all.
 */
export function readNautilusDatabase(source: string, limits: LiteralLimits = DEFAULT_LITERAL_LIMITS): NautilusList {
  const entries = parseDatabaseLiteral(source, limits);
  const documents: NautilusDocument[] = [];
  let skipped = 0;
  let truncated = false;
  for (const entry of entries) {
    if (documents.length >= MAX_DOCUMENTS) {
      truncated = true;
      break;
    }
    if (!(entry instanceof Map)) {
      skipped += 1;
      continue;
    }
    const names = entry.get("fp");
    const files: NautilusFile[] = [];
    const seen = new Set<string>();
    for (const name of (Array.isArray(names) ? names : [names]).slice(0, MAX_FILES_PER_DOCUMENT)) {
      const path = nautilusFilePath(name);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      files.push({ name: name as string, path });
    }
    if (files.length === 0) {
      skipped += 1;
      continue;
    }
    documents.push({
      title: text(entry.get("ti"), MAX_TITLE) || files[0]!.name,
      description: text(entry.get("dsc"), MAX_DESCRIPTION),
      author: text(entry.get("aut"), MAX_AUTHOR),
      files,
    });
  }
  return { documents, skipped, truncated };
}

/** Lower case, without accents, for comparing what was typed with what is listed. */
export function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/** The words of a search, folded. At most eight are used; nobody types more to find a title. */
export function searchWords(q: string): string[] {
  return fold(q)
    .split(/[\s,;]+/u)
    .filter(Boolean)
    .slice(0, 8);
}
