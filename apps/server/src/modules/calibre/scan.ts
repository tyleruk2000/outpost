/**
 * Reading a Calibre library folder: which folders are books, what each says about
 * itself, and which of its files Outpost can bring in. Only ever reads.
 *
 * Calibre keeps one folder per book, `Author/Title (id)/`, holding `metadata.opf`, the
 * cover as `cover.jpg` and one file per format. The walk looks for `metadata.opf`, so a
 * folder of one author, or of one book, is read the same way as the whole library.
 * Symbolic links met inside are not followed.
 */
import fs from "node:fs";
import path from "node:path";
import type { CalibreBook, CalibreLeftOut } from "@outpost/shared";
import { naturalCompare } from "../imports/names.ts";
import { readOpf } from "./opf.ts";

/** The formats Outpost reads, best first. Calibre often holds several of one book. */
export const PREFERRED = ["epub", "pdf", "txt", "md", "markdown", "html", "htm"] as const;
/** Formats Calibre keeps that Outpost does not read, named in the plan so nobody wonders where they went. */
const OTHER_FORMATS = new Set([
  "mobi",
  "azw",
  "azw3",
  "azw4",
  "kfx",
  "fb2",
  "fbz",
  "docx",
  "doc",
  "odt",
  "rtf",
  "cbz",
  "cbr",
  "cb7",
  "djvu",
  "lit",
  "lrf",
  "pdb",
  "pmlz",
  "htmlz",
  "txtz",
  "snb",
  "tcr",
  "zip",
]);
const COVER_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export const MAX_OPF_BYTES = 1024 * 1024;
const MAX_COVER_BYTES = 20 * 1024 * 1024;
/** How deep below the chosen folder book folders are looked for (library, author, book, and one more). */
const MAX_DEPTH = 4;
/** Folders read at most, so a folder that is not a Calibre library does not keep the walk going for ever. */
const MAX_FOLDERS = 200_000;

export interface ScannedBook extends CalibreBook {
  language: string | null;
  uuid: string | null;
}

export interface ScanResult {
  books: ScannedBook[];
  leftOut: CalibreLeftOut[];
  hasCalibreDatabase: boolean;
  beyondLimit: number;
}

const extOf = (name: string) => path.extname(name).slice(1).toLowerCase();

/** "Dune (12)" is Calibre's folder for book 12; the title without the number. */
const titleFromFolder = (folder: string) => path.basename(folder).replace(/\s*\(\d+\)$/, "") || folder;

export async function scanLibrary(
  root: string,
  options: { maxBooks: number; maxFileBytes: number; signal: AbortSignal; onProgress: (found: number) => void },
): Promise<ScanResult> {
  const result: ScanResult = {
    books: [],
    leftOut: [],
    hasCalibreDatabase: fs.existsSync(path.join(root, "metadata.db")),
    beyondLimit: 0,
  };
  let folders = 0;

  const visit = async (dir: string, relative: string, depth: number): Promise<void> => {
    options.signal.throwIfAborted();
    folders += 1;
    if (folders > MAX_FOLDERS) return;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    if (entries.some((entry) => entry.isFile() && entry.name === "metadata.opf")) {
      if (result.books.length >= options.maxBooks) {
        result.beyondLimit += 1;
        return;
      }
      await readBook(dir, relative || ".", entries, result, options.maxFileBytes);
      if (result.books.length % 50 === 0) options.onProgress(result.books.length);
      return;
    }
    if (depth >= MAX_DEPTH) return;
    const children = entries
      // Calibre's own folders (.caltrash, .calnotes) and anything hidden are not books.
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("$"))
      .map((entry) => entry.name)
      .sort(naturalCompare);
    for (const name of children) await visit(path.join(dir, name), relative ? `${relative}/${name}` : name, depth + 1);
  };

  await visit(root, "", 0);
  options.onProgress(result.books.length);
  return result;
}

async function readBook(dir: string, folder: string, entries: fs.Dirent[], result: ScanResult, maxFileBytes: number): Promise<void> {
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  let opf: ReturnType<typeof readOpf>;
  try {
    const stat = await fs.promises.stat(path.join(dir, "metadata.opf"));
    if (stat.size > MAX_OPF_BYTES) throw new Error("too large");
    opf = readOpf(await fs.promises.readFile(path.join(dir, "metadata.opf"), "utf8"));
  } catch {
    result.leftOut.push({ folder, title: titleFromFolder(folder), reason: "Its metadata.opf could not be read." });
    return;
  }
  const title = opf.title ?? titleFromFolder(folder);

  const byExt = new Map<string, string>();
  for (const name of files) {
    const ext = extOf(name);
    if (!byExt.has(ext)) byExt.set(ext, name);
  }
  const chosenExt = PREFERRED.find((ext) => byExt.has(ext));
  const otherFormats = [...byExt.keys()]
    .filter((ext) => OTHER_FORMATS.has(ext) || (PREFERRED as readonly string[]).includes(ext))
    .filter((ext) => ext !== chosenExt)
    .map((ext) => ext.toUpperCase())
    .sort();

  if (!chosenExt) {
    result.leftOut.push({
      folder,
      title,
      reason: otherFormats.length
        ? `Only in ${otherFormats.join(", ")}, which Outpost cannot read. Convert it to EPUB in Calibre to bring it in.`
        : "There is no book file in its folder.",
    });
    return;
  }
  const fileName = byExt.get(chosenExt)!;
  const fileSize = (await fs.promises.stat(path.join(dir, fileName))).size;
  if (fileSize > maxFileBytes) {
    result.leftOut.push({ folder, title, reason: `Its ${chosenExt.toUpperCase()} is larger than this server takes for one file.` });
    return;
  }

  // The cover the package names, if it is a picture in the folder; otherwise Calibre's usual name.
  const named = opf.coverHref && !opf.coverHref.includes("/") && files.includes(opf.coverHref) ? opf.coverHref : null;
  const coverName = [named, "cover.jpg", "cover.jpeg", "cover.png"].find(
    (name): name is string => name !== null && files.includes(name) && COVER_EXTS.has(extOf(name)),
  );
  let cover: CalibreBook["cover"] = null;
  if (coverName) {
    const size = (await fs.promises.stat(path.join(dir, coverName))).size;
    if (size > 0 && size <= MAX_COVER_BYTES) cover = { name: coverName, sizeBytes: size };
  }

  result.books.push({
    folder,
    title,
    authors: opf.authors,
    series: opf.series,
    seriesIndex: opf.seriesIndex,
    tags: opf.tags,
    file: { name: fileName, ext: chosenExt, sizeBytes: fileSize },
    cover,
    otherFormats,
    language: opf.language,
    uuid: opf.uuid,
  });
}
