/**
 * The plan: what an import would create, worked out from the unpacked files alone.
 *
 * Nothing here writes to the notes or the library. The files are read and converted
 * exactly as they will be on import, so that the titles, the warnings and the
 * duplicates the person is shown are the real ones, and then the converted pages are
 * thrown away. Only the plan is kept.
 *
 * How files become a tree of pages:
 * - a file `X.md` with a folder `X/` beside it is the parent of what is in the folder
 *   (this is how Notion lays out sub-pages, and what people do by hand);
 * - a folder with a `README.md` or `index.md` gets that file as its page;
 * - any other folder that holds pages becomes an empty page named after the folder;
 * - a folder that only holds pictures and other files is not a page at all.
 */
import fs from "node:fs";
import type {
  ImportAnalysis,
  ImportConstructCount,
  ImportConstructKind,
  ImportDuplicate,
  ImportItem,
  ImportItemFormat,
  ImportSource,
  NoteDoc,
} from "@outpost/shared";
import { formatBytes } from "@outpost/shared";
import { messageOf } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import { sha256Hex } from "../../core/ids.ts";
import { docToText } from "../notes/content/index.ts";
import { type ConvertedPage, convertPage, kindOfWarning, type ResolveLink, scanConstructs } from "./convert.ts";
import {
  type CsvTable,
  countCsvRows,
  MAX_CSV_BYTES,
  readCsv,
  type TableDocOptions,
  tableDoc,
  toTable,
  truncationNote,
} from "./database.ts";
import {
  allRowsTwinOf,
  baseName,
  cleanTitle,
  dirName,
  extensionOf,
  folderPath,
  isAttachable,
  isPdf,
  isZip,
  MAX_ATTACHABLE_BYTES,
  matchKey,
  naturalCompare,
  notionKey,
  pageFormatOf,
  pathKey,
  pickIndexFile,
  splitNotionName,
  stemOf,
} from "./names.ts";

/** A page holds about 5 MB as a document; a source file near that size cannot become one. */
const MAX_PAGE_SOURCE_BYTES = 4 * 1024 * 1024;

export interface TreeFile {
  /** Relative to the import's tree, `/` separators. */
  path: string;
  sizeBytes: number;
}

/** One uploaded file and the part of the tree that came from it. */
export interface UploadRoot {
  /** The upload's file name: what import keys are derived from. */
  name: string;
  /** "" when the whole tree is this upload; "folder/" for an archive unpacked into a folder; the file's own path for a single file. */
  prefix: string;
}

export interface PlanInput {
  treeDir: string;
  files: TreeFile[];
  roots: UploadRoot[];
  /** Archive entries that were not unpacked, with why. */
  leftOut: Array<{ path: string; reason: string }>;
  ignored: number;
}

export interface DuplicateLookup {
  byImportKey(key: string): { noteId: string; title: string } | undefined;
  /** A page that is not in the trash with exactly this title and this content hash. */
  byContent(title: string, contentHash: string): { noteId: string; title: string } | undefined;
}

export interface PlanDeps {
  lookup: DuplicateLookup;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

// ── Rendering one item (shared with the commit) ─────────────────────────────

export interface RenderOptions extends TableDocOptions {
  resolve?: ResolveLink;
}

export interface RenderedItem {
  title: string;
  doc: NoteDoc;
  tags: string[];
  /** Present for Markdown, HTML and text sources. */
  converted?: ConvertedPage;
  /** The unread source text, for looking at what it contains. */
  raw?: string;
  /** Present for CSV sources. */
  table?: CsvTable;
}

type Renderable = Pick<ImportItem, "path" | "title" | "format" | "source">;

/** Reads an item's source file and converts it to a page. `item.title` is used when the file names no title. */
export async function renderItem(treeDir: string, item: Renderable, options: RenderOptions = {}): Promise<RenderedItem> {
  const format = item.format ?? "folder";
  if (format === "folder") {
    return { title: item.title, doc: { type: "doc", content: [{ type: "paragraph" }] } as NoteDoc, tags: [] };
  }
  const file = resolveInside(treeDir, item.source ?? item.path);
  if (format === "csv") {
    const table = toTable(await readCsv(file));
    return { title: item.title, doc: tableDoc(table, options), tags: [], table };
  }
  const raw = await fs.promises.readFile(file, "utf8");
  const converted = convertPage(format, raw, options.resolve);
  return { title: converted.title ?? item.title, doc: converted.doc, tags: converted.tags, converted, raw };
}

// ── The folder structure ────────────────────────────────────────────────────

interface Dir {
  path: string;
  name: string;
  files: TreeFile[];
  dirs: Dir[];
}

function buildDirs(files: TreeFile[]): Dir {
  const root: Dir = { path: "", name: "", files: [], dirs: [] };
  const byPath = new Map<string, Dir>([["", root]]);
  const dirFor = (dirPath: string): Dir => {
    const known = byPath.get(dirPath);
    if (known) return known;
    const dir: Dir = { path: dirPath, name: baseName(dirPath), files: [], dirs: [] };
    byPath.set(dirPath, dir);
    dirFor(dirName(dirPath)).dirs.push(dir);
    return dir;
  };
  for (const file of files) dirFor(dirName(file.path)).files.push(file);
  return root;
}

const isPageSource = (file: TreeFile): boolean => pageFormatOf(file.path) !== undefined;
const holdsPages = (dir: Dir): boolean => dir.files.some(isPageSource) || dir.dirs.some(holdsPages);

/** The name a Notion id is read from: the file's stem, without the `_all` of a database's second copy. */
const notionStem = (name: string): string => allRowsTwinOf(name) ?? stemOf(name);

/** A page or database before its file has been read. */
interface Draft {
  path: string;
  kind: "page" | "database";
  format: ImportItemFormat;
  parentPath: string | null;
  sizeBytes: number;
  fallbackTitle: string;
  /** The file or folder name this page is ordered by among its siblings. */
  sortName: string;
  notionId?: string;
  /** The `_all.csv` copy of a database, when the export has both. */
  twin?: TreeFile;
}

interface LooseFile {
  file: TreeFile;
  parentPath: string | null;
}

interface Structure {
  drafts: Draft[];
  loose: LooseFile[];
  tooLarge: Array<{ file: TreeFile; parentPath: string | null }>;
  /** Tree path of a file or folder → `path` of the page that stands for it. */
  pageOf: Map<string, string>;
}

function layOut(root: Dir): Structure {
  const structure: Structure = { drafts: [], loose: [], tooLarge: [], pageOf: new Map() };

  // A lone wrapper folder (zipping "my notes/" gives exactly that) adds no structure worth a page.
  let top = root;
  while (top.files.length === 0 && top.dirs.length === 1 && !pickIndexFile(top.dirs[0]!.files.map((file) => baseName(file.path)))) {
    top = top.dirs[0]!;
  }

  const draftFor = (file: TreeFile, parentPath: string | null, fallbackTitle?: string): Draft | undefined => {
    const name = baseName(file.path);
    const format = pageFormatOf(name)!;
    if (file.sizeBytes > (format === "csv" ? MAX_CSV_BYTES : MAX_PAGE_SOURCE_BYTES)) {
      structure.tooLarge.push({ file, parentPath });
      return undefined;
    }
    const notion = splitNotionName(notionStem(name));
    const draft: Draft = {
      path: file.path,
      kind: format === "csv" ? "database" : "page",
      format,
      parentPath,
      sizeBytes: file.sizeBytes,
      fallbackTitle: cleanTitle(fallbackTitle ?? notion.title, stemOf(name)),
      // A folder's index file stands where the folder stands.
      sortName: fallbackTitle === undefined ? name : baseName(dirName(file.path)),
      notionId: notion.id,
    };
    structure.drafts.push(draft);
    structure.pageOf.set(file.path, draft.path);
    return draft;
  };

  const walk = (dir: Dir, parentPath: string | null, indexFile?: TreeFile): void => {
    const names = new Set(dir.files.map((file) => baseName(file.path)));
    /** Pages of this folder by the name a sub-folder would have to carry to belong to them. */
    const owners = new Map<string, Draft>();
    const claim = (key: string, draft: Draft) => {
      const holder = owners.get(key);
      // A page and a database of the same name: the page is the parent, as it is in Notion.
      if (!holder || (holder.kind === "database" && draft.kind === "page")) owners.set(key, draft);
    };

    for (const file of dir.files) {
      if (file === indexFile) continue;
      const name = baseName(file.path);
      const plainTwin = allRowsTwinOf(name);
      if (plainTwin && names.has(`${plainTwin}.csv`)) continue; // folded into its plain twin below
      if (!isPageSource(file)) {
        structure.loose.push({ file, parentPath });
        continue;
      }
      const draft = draftFor(file, parentPath);
      if (!draft) continue;
      if (draft.kind === "database" && draft.notionId) {
        draft.twin = dir.files.find((other) => baseName(other.path) === `${stemOf(name)}_all.csv`);
        if (draft.twin) structure.pageOf.set(draft.twin.path, draft.path);
      }
      claim(notionStem(name), draft);
      if (draft.notionId) claim(draft.notionId, draft);
    }

    for (const sub of dir.dirs) {
      const notion = splitNotionName(sub.name);
      const owner = owners.get(sub.name) ?? (notion.id ? owners.get(notion.id) : undefined);
      if (owner) {
        structure.pageOf.set(sub.path, owner.path);
        walk(sub, owner.path);
        continue;
      }
      const indexName = pickIndexFile(sub.files.map((file) => baseName(file.path)));
      const index = indexName ? sub.files.find((file) => baseName(file.path) === indexName) : undefined;
      const indexDraft = index ? draftFor(index, parentPath, notion.title) : undefined;
      if (index && indexDraft) {
        structure.pageOf.set(sub.path, indexDraft.path);
        walk(sub, indexDraft.path, index);
      } else if (holdsPages(sub)) {
        const folder: Draft = {
          path: folderPath(sub.path),
          kind: "page",
          format: "folder",
          parentPath,
          sizeBytes: 0,
          fallbackTitle: cleanTitle(notion.title, sub.name),
          sortName: sub.name,
          notionId: notion.id,
        };
        structure.drafts.push(folder);
        structure.pageOf.set(sub.path, folder.path);
        walk(sub, folder.path, index);
      } else {
        walk(sub, parentPath);
      }
    }
  };

  walk(top, null);
  return structure;
}

// ── Links ───────────────────────────────────────────────────────────────────

/** Finds the file or folder of the tree that a relative address in `fromFile` points at. */
function linkFinder(files: TreeFile[]): (fromFile: string, href: string) => string | undefined {
  const known = new Map<string, string>();
  const add = (treePath: string) => {
    if (treePath && !known.has(matchKey(treePath))) known.set(matchKey(treePath), treePath);
  };
  for (const file of files) {
    add(file.path);
    for (let dir = dirName(file.path); dir; dir = dirName(dir)) add(dir);
  }

  return (fromFile, href) => {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href) || href.startsWith("#") || href.startsWith("//")) return undefined;
    let target = href.split("#")[0]!.split("?")[0]!;
    try {
      target = decodeURIComponent(target);
    } catch {
      // Not valid percent-encoding; the address is tried as it is written.
    }
    if (!target || target.includes("\0")) return undefined;
    // An address from the root of a site is taken from the root of the import.
    const parts = (target.startsWith("/") ? target.slice(1) : `${dirName(fromFile)}/${target}`).split("/");
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part !== "..") resolved.push(part);
      else if (resolved.length === 0)
        return undefined; // climbs out of the import
      else resolved.pop();
    }
    const joined = resolved.join("/");
    // Links between notes are often written without the ending ("[x](other-note)").
    return known.get(matchKey(joined)) ?? known.get(matchKey(`${joined}.md`)) ?? known.get(matchKey(`${joined}.html`));
  };
}

// ── Building the plan ───────────────────────────────────────────────────────

class Constructs {
  private readonly found = new Map<ImportConstructKind, { count: number; example: string }>();

  add(kind: ImportConstructKind, count: number, example: string): void {
    if (count <= 0) return;
    const entry = this.found.get(kind);
    if (entry) entry.count += count;
    else this.found.set(kind, { count, example });
  }

  list(kinds: (kind: ImportConstructKind) => boolean): ImportConstructCount[] {
    return [...this.found].filter(([kind]) => kinds(kind)).map(([kind, entry]) => ({ kind, ...entry }));
  }
}

const CONVERTED_KINDS = new Set<ImportConstructKind>(["callout", "toggle"]);

function sourceOf(notion: boolean, formats: ImportItemFormat[]): ImportSource {
  if (notion) return "notion";
  // Folders and tables come along with whatever the pages are written in.
  const written = new Set(formats.filter((format) => format !== "folder" && format !== "csv"));
  if (written.size === 1) return [...written][0] as ImportSource;
  if (written.size === 0 && formats.includes("csv")) return "markdown";
  return "mixed";
}

function keyFor(roots: UploadRoot[], treePath: string): string {
  // The longest prefix wins, so a single uploaded file is not mistaken for part of an archive.
  const root = [...roots].sort((a, b) => b.prefix.length - a.prefix.length).find((candidate) => treePath.startsWith(candidate.prefix));
  if (!root) return pathKey("", treePath);
  return pathKey(root.name, treePath === root.prefix ? root.name : treePath.slice(root.prefix.length));
}

export async function buildPlan(input: PlanInput, deps: PlanDeps): Promise<ImportAnalysis> {
  const { treeDir, files } = input;
  const structure = layOut(buildDirs(files));
  const findTarget = linkFinder(files);
  const constructs = new Constructs();
  const fileByPath = new Map(files.map((file) => [file.path, file]));

  const pages: ImportItem[] = [];
  const others: ImportItem[] = [];
  const skip = (path: string, sizeBytes: number, parentPath: string | null, reason: string) => {
    others.push({
      path,
      kind: "skipped",
      title: baseName(path),
      parentPath,
      sizeBytes,
      importKey: keyFor(input.roots, path),
      warnings: [],
      reason,
    });
  };

  // ── Pages and databases: read each one as the import will ──
  /** What each page's text points at, kept until every item's final kind is known. */
  const pending: Array<{ item: ImportItem; targets: Map<string, string>; missing: string[]; markdown: boolean }> = [];
  const referenced = new Set<string>();
  const usedKeys = new Set<string>();
  let done = 0;

  for (const draft of structure.drafts) {
    deps.signal?.throwIfAborted();
    deps.onProgress?.(done, structure.drafts.length);
    done += 1;

    const item: ImportItem = {
      path: draft.path,
      kind: draft.kind,
      title: draft.fallbackTitle,
      parentPath: draft.parentPath,
      sizeBytes: draft.sizeBytes,
      importKey: "",
      warnings: [],
      format: draft.format,
    };
    // Two files can carry the same Notion id (a page and its database); only the first keeps it as its key.
    const notion = draft.notionId ? notionKey(draft.notionId) : undefined;
    item.importKey = notion && !usedKeys.has(notion) ? notion : keyFor(input.roots, draft.path);
    usedKeys.add(item.importKey);

    if (
      draft.twin &&
      (await countCsvRows(resolveInside(treeDir, draft.twin.path))) > (await countCsvRows(resolveInside(treeDir, draft.path)))
    ) {
      // Notion's plain copy holds only the rows of the view that was open; the other holds them all.
      item.source = draft.twin.path;
      item.sizeBytes = draft.twin.sizeBytes;
    }

    let rendered: RenderedItem;
    try {
      rendered = await renderItem(treeDir, item);
    } catch (error) {
      // The page stays in the tree so that what is under it keeps its place; it will be an empty page.
      item.format = "folder";
      item.warnings.push(
        draft.format === "csv"
          ? `This file could not be read as a table (${messageOf(error)}). It is imported as an empty page.`
          : `This file could not be converted (${messageOf(error)}). It is imported as an empty page.`,
      );
      constructs.add("other", 1, draft.path);
      rendered = await renderItem(treeDir, item);
    }
    item.title = rendered.title;

    const note = rendered.table ? truncationNote(rendered.table) : undefined;
    if (note) {
      item.warnings.push(note);
      constructs.add("table-truncated", 1, item.path);
    }

    const targets = new Map<string, string>();
    if (rendered.converted && rendered.raw !== undefined) {
      const { converted } = rendered;
      for (const warning of converted.warnings) {
        item.warnings.push(warning);
        constructs.add(kindOfWarning(warning), 1, item.path);
      }
      for (const [kind, count] of Object.entries(scanConstructs(draft.format, rendered.raw))) {
        constructs.add(kind as ImportConstructKind, count, item.path);
      }
      if (converted.externalImages > 0) {
        constructs.add("external-image", converted.externalImages, item.path);
        item.warnings.push(
          `${converted.externalImages === 1 ? "A picture on the web is" : `${converted.externalImages} pictures on the web are`} kept as ${converted.externalImages === 1 ? "a link" : "links"}. Outpost does not download anything during an import.`,
        );
      }
      for (const href of converted.hrefs) {
        const target = findTarget(draft.path, href);
        if (target) targets.set(href, target);
      }
      pending.push({ item, targets, missing: converted.missing, markdown: draft.format === "markdown" });
    }

    const text = docToText(rendered.doc);
    const duplicate = findDuplicate(deps.lookup, item, text);
    if (duplicate) item.duplicateOf = duplicate;
    pages.push(item);
  }
  deps.onProgress?.(done, structure.drafts.length);

  const pageByPath = new Map(pages.map((item) => [item.path, item]));
  for (const { targets } of pending) {
    for (const target of targets.values()) if (!structure.pageOf.has(target)) referenced.add(target);
  }

  // ── Everything that is not a page ──
  for (const { file, parentPath } of structure.tooLarge) {
    skip(file.path, file.sizeBytes, parentPath, `At ${formatBytes(file.sizeBytes)} it is too large to become a page.`);
  }
  for (const { file, parentPath } of structure.loose) {
    const name = baseName(file.path);
    const base = {
      path: file.path,
      title: cleanTitle(stemOf(name), name),
      parentPath,
      sizeBytes: file.sizeBytes,
      importKey: keyFor(input.roots, file.path),
      warnings: [],
    };
    if (isPdf(name)) others.push({ ...base, kind: "document" });
    else if (!referenced.has(file.path)) {
      skip(
        file.path,
        file.sizeBytes,
        parentPath,
        isZip(name) ? "Archives inside an archive are only unpacked one level deep." : "No page in this import links to it or shows it.",
      );
    } else if (!isAttachable(name)) {
      skip(file.path, file.sizeBytes, parentPath, `Pages cannot hold ${extensionOf(name) || "this kind of"} files.`);
    } else if (file.sizeBytes > MAX_ATTACHABLE_BYTES) {
      skip(
        file.path,
        file.sizeBytes,
        parentPath,
        `At ${formatBytes(file.sizeBytes)} it is too large to attach to a page (the limit is ${formatBytes(MAX_ATTACHABLE_BYTES)}).`,
      );
    } else others.push({ ...base, title: name, kind: "attachment" });
  }
  for (const entry of input.leftOut) skip(entry.path, fileByPath.get(entry.path)?.sizeBytes ?? 0, null, entry.reason);

  // ── Links, now that every target's kind is known ──
  const otherByPath = new Map(others.map((item) => [item.path, item]));
  for (const { item, targets, missing, markdown } of pending) {
    const links: Record<string, string> = {};
    for (const [href, target] of targets) {
      const found = pageByPath.get(structure.pageOf.get(target) ?? "") ?? otherByPath.get(target);
      if (!found || found.kind === "skipped" || found.path === item.path) continue;
      links[href] = found.path;
      if (markdown && found.kind === "database") constructs.add("embedded-database", 1, item.path);
    }
    if (Object.keys(links).length > 0) item.links = links;
    for (const href of missing) {
      if (Object.keys(links).some((known) => known.trim() === href)) continue;
      const target = targets.get(href);
      const cause =
        target && otherByPath.get(target)?.kind === "skipped" ? "that file is left out of the import" : "nothing in this import matches it";
      item.warnings.push(`The link to "${href.length > 80 ? `${href.slice(0, 80)}…` : href}" is kept as plain text, because ${cause}.`);
      constructs.add("missing-link", 1, item.path);
    }
  }

  const skipped = others.filter((item) => item.kind === "skipped");
  if (skipped.length > 0) constructs.add("skipped-file", skipped.length, skipped[0]!.path);

  const sortNames = new Map(structure.drafts.map((draft) => [draft.path, draft.sortName]));
  const items = [...inTreeOrder(pages, sortNames), ...others.sort((a, b) => naturalCompare(a.path, b.path))];
  const countOf = (kind: ImportItem["kind"]) => items.filter((item) => item.kind === kind).length;
  const notion = files.some((file) => file.path.split("/").some((segment) => splitNotionName(notionStem(segment)).id !== undefined));
  const totals = {
    pages: countOf("page"),
    databases: countOf("database"),
    attachments: countOf("attachment"),
    documents: countOf("document"),
    skipped: skipped.length,
    ignored: input.ignored,
    bytes: items.reduce((total, item) => total + (item.kind === "skipped" ? 0 : item.sizeBytes), 0),
    importedBefore: pages.filter((item) => item.duplicateOf?.reason === "imported-before").length,
    sameContent: pages.filter((item) => item.duplicateOf?.reason === "same-content").length,
  };

  const problems: string[] = [];
  if (totals.pages + totals.databases + totals.documents === 0) {
    problems.push(
      "Nothing in this upload can be imported. Outpost imports Markdown, HTML and text files, CSV tables and PDFs, on their own or inside a ZIP archive.",
    );
  }

  return {
    source: sourceOf(
      notion,
      pages.map((item) => item.format ?? "folder"),
    ),
    items,
    totals,
    unsupported: constructs.list((kind) => !CONVERTED_KINDS.has(kind)),
    converted: constructs.list((kind) => CONVERTED_KINDS.has(kind)),
    problems,
    warnings: items.reduce((total, item) => total + item.warnings.length, 0),
  };
}

function findDuplicate(lookup: DuplicateLookup, item: ImportItem, text: string): ImportDuplicate | undefined {
  const before = lookup.byImportKey(item.importKey);
  if (before) return { ...before, reason: "imported-before" };
  // An empty page with a common title ("Notes") says nothing about being the same page.
  if (!text.trim()) return undefined;
  // The hash is made the way the notes module makes `contentHash`: SHA-256 of the page's plain text.
  const same = lookup.byContent(item.title, sha256Hex(text));
  return same ? { ...same, reason: "same-content" } : undefined;
}

/**
 * Parents before their children; siblings by file name in natural order, the order
 * Notion and file managers show. File names rather than titles, so that "2-water.md"
 * comes before "10-fire.md" whatever their headings say.
 */
function inTreeOrder(pages: ImportItem[], sortNames: Map<string, string>): ImportItem[] {
  const nameOf = (item: ImportItem) => sortNames.get(item.path) ?? item.title;
  const known = new Set(pages.map((item) => item.path));
  const children = new Map<string | null, ImportItem[]>();
  for (const item of pages) {
    const parent = item.parentPath !== null && known.has(item.parentPath) ? item.parentPath : null;
    const list = children.get(parent) ?? [];
    list.push(item);
    children.set(parent, list);
  }
  const ordered: ImportItem[] = [];
  const visit = (parent: string | null) => {
    const list = (children.get(parent) ?? []).sort((a, b) => naturalCompare(nameOf(a), nameOf(b)) || naturalCompare(a.path, b.path));
    for (const item of list) {
      ordered.push(item);
      visit(item.path);
    }
  };
  visit(null);
  return ordered;
}
