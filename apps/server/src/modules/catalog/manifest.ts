/**
 * Catalogue manifests: JSON files that list content Outpost can fetch and say where it
 * comes from. A manifest never contains content, only a description and a source.
 * A source is a book in the Kiwix library, a file at an https address, or something that
 * ships with Outpost in the `bundled` folder beside the manifests: one file, or a book of
 * chapters.
 *
 * The zod schema here is the definition of the format; `catalog/schema/manifest.schema.json`
 * is generated from it (see cli/validate-catalog.ts). Loading is forgiving on purpose:
 * a manifest that does not validate is skipped and reported, and never stops the server.
 */
import fs from "node:fs";
import path from "node:path";
import {
  CATALOG_CATEGORY_SLUGS,
  CATALOG_FORMATS,
  type CatalogBook,
  type CatalogBookChapter,
  type CatalogManifest,
  type CatalogManifestEntry,
  type CatalogProblem,
} from "@outpost/shared";
import { z } from "zod";

export const MANIFEST_SCHEMA_VERSION = 1;

const hostName = z
  .string()
  .max(253)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/,
    "A download host is a bare lower-case host name such as download.kiwix.org: no scheme, port or path.",
  );

const isoDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Dates are written YYYY-MM-DD.");

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "A SHA-256 checksum is 64 lower-case hexadecimal characters.");

const kiwixSource = z.strictObject({
  type: z.literal("kiwix"),
  /** The book's name in the Kiwix library, e.g. "wikipedia_en_all". */
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\s/?#&]+$/, "A Kiwix book name has no spaces or URL punctuation."),
  /** "maxi", "nopic", "mini" …; the empty string for books published in one edition. */
  flavour: z
    .string()
    .max(50)
    .regex(/^[a-z0-9_-]*$/, "A flavour is a short lower-case word, or empty."),
});

/** Document formats a bundled file may have, by file extension. */
const BUNDLED_FORMATS: Record<string, CatalogManifestEntry["format"]> = {
  md: "markdown",
  markdown: "markdown",
  pdf: "pdf",
  epub: "epub",
  html: "html",
  htm: "html",
};

const bundledPath = (what: string, example: string) =>
  z
    .string()
    .max(300)
    .regex(
      /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/,
      `${what} is named by its path inside the bundled folder: lower-case names joined by /, such as ${example}.`,
    );

/** How a chapter is named in links between chapters: lower-case words joined by hyphens. */
export const CHAPTER_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const bookChapter = z.strictObject({
  key: z.string().min(1).max(80).regex(CHAPTER_KEY, "A chapter key is lower-case words joined by hyphens, such as getting-started."),
  /** As printed in the contents: "00", "05A", "A". */
  number: z.string().trim().min(1).max(8).optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(400).optional(),
  /** File name inside the book's folder. */
  file: z
    .string()
    .max(120)
    .regex(/^[a-z0-9][a-z0-9._-]*\.md$/, "A chapter is a Markdown file named in lower case, such as 03-everyday-controls.md."),
});

const bundledBook = z.strictObject({
  /** Path of the book's folder inside `bundled`, e.g. "logbook73/g90". */
  folder: bundledPath("A book's folder", "logbook73/g90"),
  /** Named parts in reading order, each with its chapters in reading order. */
  sections: z
    .array(z.strictObject({ title: z.string().trim().min(1).max(120), chapters: z.array(bookChapter).min(1).max(300) }))
    .min(1)
    .max(60),
});

const bundledSource = z
  .strictObject({
    type: z.literal("bundled"),
    /** One file: its path inside the `bundled` folder, e.g. "radio/uk-amateur-bands.md". */
    file: bundledPath("A bundled file", "radio/uk-amateur-bands.md").optional(),
    /** A book: a folder of Markdown chapters and the order they are read in. */
    book: bundledBook.optional(),
    version: z.string().min(1).max(50).optional(),
    published: isoDate.optional(),
  })
  .refine((source) => (source.file === undefined) !== (source.book === undefined), {
    message: 'A bundled source names either one "file" or a "book" of chapters, and not both.',
  })
  // The rule above, in a form the published JSON Schema can state.
  .meta({ oneOf: [{ required: ["file"] }, { required: ["book"] }] });

function httpSource(allowInsecureHttp: boolean) {
  return z.strictObject({
    type: z.literal("http"),
    url: z
      .string()
      .max(2000)
      .regex(allowInsecureHttp ? /^https?:\/\/[^\s]+$/ : /^https:\/\/[^\s]+$/, "Download addresses must start with https://"),
    sha256: sha256.optional(),
    sizeBytes: z.number().int().positive().optional(),
    version: z.string().min(1).max(50).optional(),
    published: isoDate.optional(),
  });
}

/**
 * Builds the manifest schema. Plain http addresses are only accepted where the person
 * running the server has allowed downloads from their own network (a local mirror);
 * the published format, and everything in this repository, is https only.
 */
export function createManifestSchema(options: { allowInsecureHttp?: boolean } = {}) {
  const entry = z.strictObject({
    id: z
      .string()
      .min(3)
      .max(120)
      .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "Entry ids are lower-case words joined by dots or hyphens."),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    category: z.enum(CATALOG_CATEGORY_SLUGS),
    publisher: z.string().trim().min(1).max(200),
    language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, "Languages are BCP 47 tags such as en or pt-BR."),
    format: z.enum(CATALOG_FORMATS),
    license: z.string().trim().min(1).max(300),
    licenseNote: z.string().trim().min(1).max(1000).optional(),
    attribution: z.string().trim().min(1).max(500),
    homepage: z
      .string()
      .max(2000)
      .regex(/^https:\/\/[^\s]+$/, "Home pages must start with https://")
      .optional(),
    lastVerified: isoDate,
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    sizeBytes: z.number().int().positive().optional(),
    source: z.discriminatedUnion("type", [kiwixSource, httpSource(options.allowInsecureHttp ?? false), bundledSource]),
  });

  return z.strictObject({
    $schema: z.string().optional(),
    schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
    id: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "Manifest ids are lower-case words joined by dots or hyphens."),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    maintainers: z.array(z.string().trim().min(1).max(200)),
    /** May be empty when every entry ships with Outpost. */
    downloadHosts: z.array(hostName),
    entries: z.array(entry),
  });
}

/** The published format: https only. */
export const manifestSchema = createManifestSchema();

export type Manifest = CatalogManifest;
export type ManifestEntry = CatalogManifestEntry;

/** An entry together with the manifest it came from. */
export interface LoadedEntry extends ManifestEntry {
  manifestId: string;
}

/** Where a bundled entry's file is on this machine. Never sent to a browser. */
export interface BundledFile {
  path: string;
  sizeBytes: number;
}

/** The files of a bundled book, in reading order. */
export interface BundledBook {
  /** All the chapters together. */
  sizeBytes: number;
  chapters: Array<BundledFile & { key: string; number?: string; title: string; summary?: string; section: string; fileName: string }>;
}

/** A bundled book's chapters in reading order, each with the title of its section. */
export function chaptersOf(book: CatalogBook): Array<CatalogBookChapter & { section: string }> {
  return book.sections.flatMap((section) => section.chapters.map((chapter) => ({ ...chapter, section: section.title })));
}

export interface LoadedCatalog {
  manifests: Manifest[];
  /** Usable entries, in manifest order; ids are unique. */
  entries: LoadedEntry[];
  problems: CatalogProblem[];
  /** Every host a usable manifest lists, lower-case. */
  downloadHosts: string[];
  /** The file behind each usable entry that ships with Outpost as one file, by entry id. */
  bundled: Map<string, BundledFile>;
  /** The chapters behind each usable entry that ships with Outpost as a book, by entry id. */
  books: Map<string, BundledBook>;
}

/** The JSON Schema for manifests, as committed in catalog/schema/manifest.schema.json. */
export function manifestJsonSchema(): string {
  const schema = z.toJSONSchema(manifestSchema, { target: "draft-2020-12" });
  const document = {
    ...schema,
    title: "Outpost catalogue manifest",
    description: "A list of content Outpost can download, with where each item comes from. See catalog/README.md.",
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** Turns zod's issues into one sentence a manifest author can act on. */
function describeIssues(error: z.ZodError, raw: unknown): string {
  const entries = Array.isArray((raw as { entries?: unknown })?.entries) ? (raw as { entries: unknown[] }).entries : [];
  const parts = error.issues.slice(0, 5).map((issue) => {
    const [first, index, ...rest] = issue.path;
    if (first === "entries" && typeof index === "number") {
      const id = (entries[index] as { id?: unknown } | undefined)?.id;
      const label = typeof id === "string" ? `entry "${id}"` : `entry number ${index + 1}`;
      return `${label}, ${rest.length ? rest.join(".") : "entry"}: ${issue.message}`;
    }
    return `${issue.path.length ? issue.path.join(".") : "manifest"}: ${issue.message}`;
  });
  const more = error.issues.length - parts.length;
  return `${parts.join("; ")}${more > 0 ? `; and ${more} more` : ""}`;
}

/** Checks that need more than the shape: does the entry's address fit its manifest? */
export function entryProblem(entry: ManifestEntry, manifest: Manifest): string | undefined {
  if (entry.source.type === "kiwix") {
    return entry.format === "zim" ? undefined : `Kiwix books are ZIM archives, but the format is given as "${entry.format}".`;
  }
  if (entry.source.type === "bundled" && entry.source.book) {
    if (entry.format !== "markdown") return `A book is made of Markdown chapters, but the format is given as "${entry.format}".`;
    const chapters = chaptersOf(entry.source.book);
    for (const field of ["key", "file"] as const) {
      const seen = new Set<string>();
      for (const chapter of chapters) {
        if (seen.has(chapter[field])) return `Two chapters of the book have the ${field} "${chapter[field]}".`;
        seen.add(chapter[field]);
      }
    }
    return undefined;
  }
  if (entry.source.type === "bundled") {
    const extension = path.extname(entry.source.file ?? "").slice(1);
    const expected = BUNDLED_FORMATS[extension];
    if (!expected) return `A bundled file must be Markdown, PDF, EPUB or HTML, but "${entry.source.file}" is none of these.`;
    return entry.format === expected
      ? undefined
      : `"${entry.source.file}" is a ${expected} file, but the format is given as "${entry.format}".`;
  }
  let url: URL;
  try {
    url = new URL(entry.source.url);
  } catch {
    return "The download address is not a valid URL.";
  }
  if (url.username || url.password) return "The download address must not contain a user name or password.";
  if (!manifest.downloadHosts.includes(url.hostname.toLowerCase())) {
    return `The download address is on ${url.hostname}, which is not in this manifest's downloadHosts.`;
  }
  return undefined;
}

export interface ParsedManifest {
  manifest?: Manifest;
  /** Why the whole manifest cannot be used. */
  problem?: string;
}

export function parseManifest(text: string, options: { allowInsecureHttp?: boolean } = {}): ParsedManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { problem: `This file is not valid JSON (${(error as Error).message}).` };
  }
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === "number" && version > MANIFEST_SCHEMA_VERSION) {
    return {
      problem: `This manifest uses format version ${version}, which is newer than this version of Outpost understands. Update Outpost to use it.`,
    };
  }
  const parsed = createManifestSchema(options).safeParse(raw);
  if (!parsed.success) return { problem: `This manifest does not follow the format: ${describeIssues(parsed.error, raw)}.` };
  const { $schema: _schema, ...manifest } = parsed.data;
  return { manifest };
}

/**
 * The folder that holds the files a manifest folder's entries may bundle: `bundled`
 * beside a folder called `manifests` (as shipped: catalog/manifests and catalog/bundled),
 * otherwise `bundled` inside the manifest folder (a person's own: <data>/catalog/bundled).
 */
export function bundledDirFor(manifestDir: string): string {
  return path.basename(manifestDir) === "manifests" ? path.join(path.dirname(manifestDir), "bundled") : path.join(manifestDir, "bundled");
}

/** Finds a bundled entry's file, refusing anything that is not a real file inside the bundled folder. */
function findBundledFile(bundledDir: string, file: string): BundledFile | string {
  const missing = `The file "${file}" is not in the bundled folder beside this manifest.`;
  try {
    const root = fs.realpathSync(bundledDir);
    const real = fs.realpathSync(path.join(bundledDir, ...file.split("/")));
    if (!real.startsWith(root + path.sep)) return `The file "${file}" leads outside the bundled folder.`;
    const stat = fs.statSync(real);
    if (!stat.isFile()) return missing;
    if (stat.size === 0) return `The file "${file}" is empty.`;
    return { path: real, sizeBytes: stat.size };
  } catch {
    return missing;
  }
}

/** Finds every chapter of a bundled book. One missing chapter makes the whole book unusable. */
function findBundledBook(bundledDir: string, book: CatalogBook): BundledBook | string {
  const found: BundledBook = { sizeBytes: 0, chapters: [] };
  for (const chapter of chaptersOf(book)) {
    const file = findBundledFile(bundledDir, `${book.folder}/${chapter.file}`);
    if (typeof file === "string") return file;
    found.sizeBytes += file.sizeBytes;
    found.chapters.push({
      ...file,
      key: chapter.key,
      number: chapter.number,
      title: chapter.title,
      summary: chapter.summary,
      section: chapter.section,
      fileName: chapter.file,
    });
  }
  return found;
}

function jsonFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("."))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch {
    // No such folder: there are simply no manifests there.
    return [];
  }
}

/**
 * Reads every manifest in `dirs`, in order. Earlier files win when an id is used twice,
 * so the manifests shipped with Outpost cannot be shadowed by one added later.
 */
export function loadCatalog(dirs: string[], options: { allowInsecureHttp?: boolean } = {}): LoadedCatalog {
  const catalog: LoadedCatalog = { manifests: [], entries: [], problems: [], downloadHosts: [], bundled: new Map(), books: new Map() };
  const entryOwner = new Map<string, string>();
  const hosts = new Set<string>();

  for (const file of dirs.flatMap(jsonFiles)) {
    const name = path.basename(file);
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (error) {
      catalog.problems.push({ file: name, message: `This file could not be read (${(error as Error).message}).` });
      continue;
    }
    const { manifest, problem } = parseManifest(text, options);
    if (!manifest) {
      catalog.problems.push({ file: name, message: problem! });
      continue;
    }
    if (catalog.manifests.some((other) => other.id === manifest.id)) {
      catalog.problems.push({ file: name, message: `Another manifest already uses the id "${manifest.id}", so this one was skipped.` });
      continue;
    }
    catalog.manifests.push(manifest);
    for (const host of manifest.downloadHosts) hosts.add(host.toLowerCase());

    for (const entry of manifest.entries) {
      const owner = entryOwner.get(entry.id);
      if (owner) {
        catalog.problems.push({
          file: name,
          entryId: entry.id,
          message: `The id "${entry.id}" is already used by an entry in ${owner}; the first one is kept and this one was skipped.`,
        });
        continue;
      }
      let problem = entryProblem(entry, manifest);
      if (!problem && entry.source.type === "bundled" && entry.source.book) {
        const found = findBundledBook(bundledDirFor(path.dirname(file)), entry.source.book);
        if (typeof found === "string") problem = found;
        else catalog.books.set(entry.id, found);
      } else if (!problem && entry.source.type === "bundled") {
        const found = findBundledFile(bundledDirFor(path.dirname(file)), entry.source.file ?? "");
        if (typeof found === "string") problem = found;
        else catalog.bundled.set(entry.id, found);
      }
      if (problem) {
        catalog.problems.push({ file: name, entryId: entry.id, message: `${problem} The entry was skipped.` });
        continue;
      }
      entryOwner.set(entry.id, name);
      catalog.entries.push({ ...entry, manifestId: manifest.id });
    }
  }
  catalog.downloadHosts = [...hosts].sort();
  return catalog;
}
