/**
 * The thinking behind the import preview, kept apart from the screen so it can be
 * tested: turning the plan's flat list into a tree, working out what a set of choices
 * will actually do, and the words for it.
 */
import type {
  ImportAnalysis,
  ImportConstructCount,
  ImportConstructKind,
  ImportDuplicatePolicy,
  ImportItem,
  ImportOptions,
  ImportSource,
  ImportState,
} from "@outpost/shared";
import { plural } from "@/lib/utils";

// ── The tree ────────────────────────────────────────────────────────────────

export interface PreviewNode {
  item: ImportItem;
  children: PreviewNode[];
  /** Pages and tables anywhere under this one. */
  descendants: number;
  /** Pictures and files that will be attached to this page. */
  attachments: number;
}

export interface PreviewTree {
  roots: PreviewNode[];
  /** Pages and tables in the whole tree. */
  size: number;
  documents: ImportItem[];
  skipped: ImportItem[];
}

const isPage = (item: ImportItem): boolean => item.kind === "page" || item.kind === "database";

/**
 * Nests pages under their parents, in the order the plan lists them (which is the
 * order they will be created in). A page whose parent is not in the list is shown at
 * the top rather than lost.
 */
export function buildPreviewTree(items: readonly ImportItem[]): PreviewTree {
  const nodes = new Map<string, PreviewNode>();
  for (const item of items) {
    if (isPage(item)) nodes.set(item.path, { item, children: [], descendants: 0, attachments: 0 });
  }

  const roots: PreviewNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.item.parentPath === null ? undefined : nodes.get(node.item.parentPath);
    // A page cannot sit under itself; that would hide it and everything below it.
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  for (const item of items) {
    if (item.kind === "attachment" && item.parentPath !== null) {
      const owner = nodes.get(item.parentPath);
      if (owner) owner.attachments += 1;
    }
  }

  const count = (node: PreviewNode): number => {
    node.descendants = node.children.reduce((total, child) => total + 1 + count(child), 0);
    return node.descendants;
  };
  for (const root of roots) count(root);

  return {
    roots,
    size: nodes.size,
    documents: items.filter((item) => item.kind === "document"),
    skipped: items.filter((item) => item.kind === "skipped"),
  };
}

/** Paths that start open: everything in a small import, only the top level of a large one. */
export function initiallyOpen(tree: PreviewTree, limit = 40): Set<string> {
  const open = new Set<string>();
  const visit = (node: PreviewNode, depth: number) => {
    if (node.children.length === 0) return;
    if (tree.size <= limit || depth === 0) open.add(node.item.path);
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of tree.roots) visit(root, 0);
  return open;
}

// ── What the choices will do ────────────────────────────────────────────────

export interface ImportOutcome {
  /** New pages (copies included). */
  create: number;
  /** Existing pages that will be overwritten. */
  replace: number;
  /** Existing pages that are left alone. */
  keep: number;
  /** PDFs going to the library. */
  documents: number;
}

/** What committing with these choices would do, counted from the plan. */
export function outcomeOf(analysis: ImportAnalysis, options: Pick<ImportOptions, "duplicates" | "pdfs">): ImportOutcome {
  const { pages, databases, importedBefore, sameContent, documents } = analysis.totals;
  const all = pages + databases;
  const duplicates = importedBefore + sameContent;
  const byPolicy: Record<ImportDuplicatePolicy, Pick<ImportOutcome, "create" | "replace" | "keep">> = {
    skip: { create: all - duplicates, replace: 0, keep: duplicates },
    copy: { create: all, replace: 0, keep: 0 },
    // Pages a person wrote themselves are never overwritten, whatever is chosen.
    replace: { create: all - duplicates, replace: importedBefore, keep: sameContent },
  };
  return { ...byPolicy[options.duplicates], documents: options.pdfs === "library" ? documents : 0 };
}

export interface CommitGate {
  allowed: boolean;
  /** Why not, in words for the person; absent when allowed. */
  reason?: string;
}

/**
 * Whether the import may be started. Replacing existing pages is the one choice that
 * destroys something, so it needs its own explicit confirmation on top of the button.
 */
export function commitGate(analysis: ImportAnalysis, options: ImportOptions): CommitGate {
  if (analysis.problems.length > 0) return { allowed: false, reason: analysis.problems[0] };
  const outcome = outcomeOf(analysis, options);
  if (options.duplicates === "replace" && outcome.replace > 0 && options.replaceConfirmed !== true) {
    return { allowed: false, reason: `Tick the box to confirm that ${plural(outcome.replace, "existing page")} will be overwritten.` };
  }
  if (outcome.create + outcome.replace + outcome.documents === 0) {
    return { allowed: false, reason: "With these choices nothing new would be imported: everything is already here." };
  }
  return { allowed: true };
}

/** The name of the main action. It says exactly what will happen and is reused while it happens. */
export function actionLabel(outcome: ImportOutcome): string {
  const pages = outcome.create + outcome.replace;
  if (pages > 0) return `Import ${plural(pages, "page")}`;
  if (outcome.documents > 0) return `Add ${plural(outcome.documents, "PDF")} to the library`;
  return "Nothing to import";
}

/**
 * What the import button will do, in sentences, said beside it before it is pressed:
 * what is made and where, what is overwritten, and what is left alone.
 */
export function outcomeWords(outcome: ImportOutcome, parentTitle: string | null): string[] {
  const where = parentTitle ? `under “${parentTitle}”` : "at the top level of your notes";
  const words: string[] = [];
  if (outcome.create > 0) words.push(`${plural(outcome.create, "new page")} ${outcome.create === 1 ? "is" : "are"} made ${where}.`);
  if (outcome.replace > 0)
    words.push(`${plural(outcome.replace, "page")} from the earlier import ${outcome.replace === 1 ? "is" : "are"} overwritten.`);
  if (outcome.keep > 0)
    words.push(`${plural(outcome.keep, "page")} you already have ${outcome.keep === 1 ? "is left as it is" : "are left as they are"}.`);
  if (outcome.replace === 0) words.push("Nothing is overwritten.");
  if (outcome.documents > 0)
    words.push(`${plural(outcome.documents, "PDF")} ${outcome.documents === 1 ? "is" : "are"} added to the library.`);
  return words;
}

/** The options to send: `replaceConfirmed` only travels with the choice it belongs to. */
export function toCommitBody(options: ImportOptions): ImportOptions {
  return {
    parentId: options.parentId ?? null,
    duplicates: options.duplicates,
    pdfs: options.pdfs,
    replaceConfirmed: options.duplicates === "replace" && options.replaceConfirmed === true,
  };
}

// ── Words ───────────────────────────────────────────────────────────────────

const list = (parts: string[]): string => {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
};

/** "6 pages, 1 table, 1 picture or file and 2 PDFs". */
export function describeTotals(totals: ImportAnalysis["totals"]): string {
  const parts: string[] = [];
  if (totals.pages > 0) parts.push(plural(totals.pages, "page"));
  if (totals.databases > 0) parts.push(plural(totals.databases, "table"));
  if (totals.attachments > 0) parts.push(`${plural(totals.attachments, "picture or file", "pictures and files")}`);
  if (totals.documents > 0) parts.push(plural(totals.documents, "PDF"));
  return parts.length > 0 ? list(parts) : "Nothing to import";
}

export function sourceLabel(source: ImportSource, totals: ImportAnalysis["totals"]): string {
  if (totals.pages + totals.databases === 0 && totals.documents > 0) return "PDF documents";
  const labels: Record<ImportSource, string> = {
    notion: "A Notion export",
    markdown: "Markdown files",
    html: "HTML pages",
    text: "Plain text files",
    mixed: "Files of several kinds",
  };
  return labels[source];
}

interface ConstructWords {
  /** What it is, for `count` of them. */
  name: (count: number) => string;
  /** What becomes of it. */
  outcome: string;
}

const CONSTRUCTS: Record<ImportConstructKind, ConstructWords> = {
  equation: { name: (n) => plural(n, "equation"), outcome: "Kept as its LaTeX text. Outpost does not draw maths." },
  "embedded-database": {
    name: (n) => plural(n, "database shown inside a page", "databases shown inside pages"),
    outcome: "Becomes a link to the table's own page.",
  },
  "embedded-media": { name: (n) => plural(n, "embedded frame, video or sound", "embedded frames, videos or sounds"), outcome: "Left out." },
  html: { name: (n) => `HTML on ${plural(n, "page")}`, outcome: "Formatting the page cannot hold is removed. The words are kept." },
  "html-comment": { name: (n) => plural(n, "hidden HTML comment"), outcome: "Left out." },
  columns: { name: (n) => plural(n, "set of columns", "sets of columns"), outcome: "Their content follows one after another." },
  footnote: { name: (n) => `Footnotes on ${plural(n, "page")}`, outcome: "Kept as ordinary paragraphs." },
  "wiki-link": { name: (n) => plural(n, "[[wiki-style]] link"), outcome: "Kept as text, not as a link." },
  "external-image": {
    name: (n) => plural(n, "picture on the web", "pictures on the web"),
    outcome: "Kept as a link. Outpost does not download anything during an import.",
  },
  "missing-link": {
    name: (n) => plural(n, "link to a file that is not in the upload", "links to files that are not in the upload"),
    outcome: "Kept as plain text.",
  },
  "unsafe-address": { name: (n) => `Unsafe addresses on ${plural(n, "page")}`, outcome: "The link is removed. Its words are kept." },
  "table-truncated": {
    name: (n) => plural(n, "very large table"),
    outcome: "Shortened on the page. The complete CSV file is attached to it.",
  },
  "skipped-file": { name: (n) => plural(n, "file"), outcome: "Left out. Each one is listed with its reason." },
  other: { name: (n) => `Something unusual on ${plural(n, "page")}`, outcome: "Simplified. The page's warnings say how." },
  callout: { name: (n) => plural(n, "callout"), outcome: "Becomes an Outpost callout." },
  toggle: { name: (n) => plural(n, "toggle"), outcome: "Becomes an Outpost toggle." },
};

export function describeConstruct(entry: ImportConstructCount): { name: string; outcome: string } {
  const words = CONSTRUCTS[entry.kind];
  return { name: words.name(entry.count), outcome: words.outcome };
}

/** The last part of a path, without Notion's id: enough to recognise a file by. */
export function fileLabel(path: string): string {
  const name = path.replace(/\/$/, "").split("/").pop() ?? path;
  return name.replace(/ [0-9a-f]{32}(?=(_all)?(\.[A-Za-z0-9]+)?$)/i, "");
}

export interface StateWords {
  label: string;
  tone: "neutral" | "primary" | "success" | "warning" | "danger" | "lamp";
}

/** How a state is named in the list of recent imports. Amber is kept for work that is running now. */
export function describeState(state: ImportState, partial: boolean): StateWords {
  switch (state) {
    case "uploaded":
    case "analysing":
      return { label: "Reading the files", tone: "lamp" };
    case "ready":
      return { label: "Ready to import", tone: "primary" };
    case "importing":
      return { label: "Importing", tone: "lamp" };
    case "completed":
      return partial ? { label: "Imported, with some left out", tone: "warning" } : { label: "Imported", tone: "success" };
    case "failed":
      return partial ? { label: "Partly imported", tone: "warning" } : { label: "Could not be imported", tone: "danger" };
    case "discarded":
      return { label: "Discarded", tone: "neutral" };
  }
}

/** Entries with the same reason, gathered so a long report stays readable. */
export function groupByReason<T extends { reason: string }>(entries: readonly T[]): Array<{ reason: string; entries: T[] }> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const group = groups.get(entry.reason) ?? [];
    group.push(entry);
    groups.set(entry.reason, group);
  }
  return [...groups].map(([reason, grouped]) => ({ reason, entries: grouped }));
}
