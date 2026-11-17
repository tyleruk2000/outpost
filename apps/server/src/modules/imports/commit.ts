/**
 * Carrying out a plan: creating the pages, attaching the pictures, adding the PDFs.
 *
 * Links can point forward ("see chapter 3" on page 1), so pages are made in two
 * passes. The first creates every page with its text; a link to another imported page
 * is plain text at that point. The second goes back over the pages that link to
 * something and connects them, now that every target has an id.
 *
 * One page failing never stops the rest: it is written down with a reason a person
 * can act on and the import carries on.
 *
 * Everything this import creates is noted in a ledger file next to the staged files
 * the moment it exists. A commit that is stopped, fails or is cut short by a restart
 * can therefore be run again: what the ledger already holds is kept, not made twice.
 * The import keys on the pages back this up. Should the ledger miss a page (the
 * process died between creating it and writing the line), the page is found by its
 * key and treated as already imported.
 */
import fs from "node:fs";
import type { ImportAnalysis, ImportDuplicate, ImportItem, ImportOptions, ImportReport } from "@outpost/shared";
import type { FastifyBaseLogger } from "fastify";
import { AppError } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import type { JobProgress } from "../../core/jobs.ts";
import type { DocumentsService } from "../documents/service.ts";
import type { InAppTarget } from "../notes/content/index.ts";
import type { NotesService } from "../notes/service.ts";
import { rowPageMatcher } from "./database.ts";
import { baseName } from "./names.ts";
import { type RenderOptions, renderItem } from "./plan.ts";

// ── The ledger ──────────────────────────────────────────────────────────────

export type LedgerEntry =
  | { t: "page"; path: string; noteId: string; title: string; action: "created" | "updated"; topLevel: boolean }
  /** The page's links and pictures have been connected. */
  | { t: "linked"; path: string }
  | { t: "attachment"; path: string; attachmentId: string }
  | { t: "document"; path: string; documentId: string; title: string; alreadyInLibrary: boolean };

export interface Ledger {
  read(): LedgerEntry[];
  append(entry: LedgerEntry): void;
}

/** One JSON object per line, appended and flushed as each thing is created. */
export function openLedger(file: string): Ledger {
  return {
    read() {
      let text: string;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch {
        return [];
      }
      const entries: LedgerEntry[] = [];
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line) as LedgerEntry);
        } catch {
          // A line cut off by a crash. What it described is found again by its import key.
        }
      }
      return entries;
    },
    append(entry) {
      fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
    },
  };
}

// ── The commit ──────────────────────────────────────────────────────────────

export interface CommitLookup {
  /** The page with this id, when it exists and is not in the trash. */
  live(noteId: string): { noteId: string; title: string } | undefined;
  byImportKey(key: string): { noteId: string; title: string } | undefined;
}

/** A seam for tests: called before each page or document is imported, and may throw to make that item fail. */
export interface ImportHooks {
  beforeItem?: (item: ImportItem) => void;
}

export interface CommitDeps {
  notes: NotesService;
  documents: DocumentsService;
  lookup: CommitLookup;
  treeDir: string;
  ledger: Ledger;
  signal: AbortSignal;
  progress(update: JobProgress): void;
  hooks: ImportHooks;
  log: FastifyBaseLogger;
}

const isPage = (item: ImportItem): boolean => item.kind === "page" || item.kind === "database";

const SKIPPED_BEFORE = "It was imported before and is left as it is.";
const SKIPPED_SAME = "A page with the same title and text already exists and is left as it is.";
const SKIPPED_OWN = "A page with the same title and text already exists. It did not come from an import, so it is never overwritten.";
const SKIPPED_ENCRYPTED =
  "It has been encrypted since it was imported. Replacing it would put text that is not encrypted in its place, so it is left as it is.";
const SKIPPED_LATE = "It was imported by something else after the preview was made, so it is left as it is.";

export async function runCommit(analysis: ImportAnalysis, options: ImportOptions, deps: CommitDeps): Promise<ImportReport> {
  const started = Date.now();
  const { notes, documents, lookup, treeDir, ledger, signal, hooks } = deps;
  const targetParent = options.parentId ?? null;

  const report: ImportReport = {
    created: [],
    updated: [],
    skipped: [],
    failed: [],
    attachments: 0,
    documents: [],
    unsupported: analysis.unsupported,
    warnings: 0,
    durationMs: 0,
    stopped: false,
  };

  const byPath = new Map(analysis.items.map((item) => [item.path, item]));
  const pages = analysis.items.filter(isPage);
  const pdfs = analysis.items.filter((item) => item.kind === "document");
  const linkTargets = new Set(pages.flatMap((item) => Object.values(item.links ?? {})));

  /** The page each item ended up as: one this import made, or the existing page that was kept. */
  const noteOf = new Map<string, string>();
  /** Items whose page this import created or replaced; only these have their links connected. */
  const ours = new Set<string>();
  const linked = new Set<string>();
  const attachmentOf = new Map<string, string>();
  const documentOf = new Map<string, string>();

  // ── What earlier attempts already did ──
  for (const entry of ledger.read()) {
    if (entry.t === "page") {
      // A page the person has deleted since is simply imported again.
      if (!lookup.live(entry.noteId) || noteOf.has(entry.path)) continue;
      noteOf.set(entry.path, entry.noteId);
      ours.add(entry.path);
      const { noteId, title, path, topLevel } = entry;
      if (entry.action === "created") report.created.push({ noteId, title, path, topLevel });
      else report.updated.push({ noteId, title, path });
    } else if (entry.t === "linked") {
      linked.add(entry.path);
    } else if (entry.t === "attachment") {
      if (!attachmentOf.has(entry.path)) report.attachments += 1;
      attachmentOf.set(entry.path, entry.attachmentId);
    } else if (!documentOf.has(entry.path)) {
      documentOf.set(entry.path, entry.documentId);
      report.documents.push({ documentId: entry.documentId, title: entry.title, alreadyInLibrary: entry.alreadyInLibrary });
    }
  }

  const needsLinking = (item: ImportItem): boolean => Object.keys(item.links ?? {}).length > 0 || item.format === "csv";
  const toLink = () => pages.filter((item) => ours.has(item.path) && !linked.has(item.path) && needsLinking(item));

  const steps = {
    current: 0,
    total: pdfs.length + pages.length + pages.filter(needsLinking).length,
  };
  const step = (message: string) => {
    steps.current += 1;
    deps.progress({ current: Math.min(steps.current, steps.total), total: steps.total, message });
  };
  const stopped = (): boolean => {
    if (signal.aborted) report.stopped = true;
    return report.stopped;
  };

  const reasonOf = (error: unknown, item: ImportItem): string => {
    if (error instanceof AppError) return error.message;
    deps.log.error({ err: error, path: item.path }, "import item failed");
    return "Something unexpected went wrong with this item. The server log has the details.";
  };
  const fail = (item: ImportItem, reason: string) => report.failed.push({ path: item.path, title: item.title, reason });

  // ── PDFs into the library ──
  for (const item of pdfs) {
    if (stopped()) break;
    step("Adding PDFs to the library");
    if (options.pdfs !== "library") {
      // A PDF that a page links to is still attached to that page further down.
      if (!linkTargets.has(item.path))
        report.skipped.push({ path: item.path, title: item.title, reason: "PDFs were left out of this import." });
      continue;
    }
    if (documentOf.has(item.path)) continue;
    try {
      hooks.beforeItem?.(item);
      const outcome = await documents.ingestFile({ sourcePath: resolveInside(treeDir, item.path), originalName: baseName(item.path) });
      const entry = { documentId: outcome.document.id, title: outcome.document.title, alreadyInLibrary: outcome.status === "duplicate" };
      ledger.append({ t: "document", path: item.path, ...entry });
      documentOf.set(item.path, entry.documentId);
      report.documents.push(entry);
    } catch (error) {
      fail(item, reasonOf(error, item));
    }
  }

  // ── First pass: every page, with its text ──
  /** The nearest page above this one that exists; the chosen place when none does. */
  const parentOf = (item: ImportItem): string | null => {
    for (let parent = item.parentPath; parent !== null; parent = byPath.get(parent)?.parentPath ?? null) {
      const noteId = noteOf.get(parent);
      if (noteId) return noteId;
    }
    return targetParent;
  };

  /** Whether the page exists already, as of now. The plan's answer is checked again because time has passed. */
  const duplicateOf = (item: ImportItem): (ImportDuplicate & { planned: boolean }) | undefined => {
    const planned = item.duplicateOf && lookup.live(item.duplicateOf.noteId) ? item.duplicateOf : undefined;
    if (planned) return { ...planned, planned: true };
    const late = lookup.byImportKey(item.importKey);
    return late ? { ...late, reason: "imported-before", planned: false } : undefined;
  };

  const keep = (item: ImportItem, duplicate: ImportDuplicate, reason: string) => {
    noteOf.set(item.path, duplicate.noteId);
    report.skipped.push({ path: item.path, title: item.title, reason, noteId: duplicate.noteId });
  };

  for (const item of pages) {
    if (stopped()) break;
    step("Creating pages");
    if (ours.has(item.path)) continue;
    try {
      hooks.beforeItem?.(item);
      const duplicate = duplicateOf(item);
      if (duplicate && options.duplicates === "skip") {
        keep(item, duplicate, duplicate.reason === "imported-before" ? SKIPPED_BEFORE : SKIPPED_SAME);
        continue;
      }
      if (duplicate && options.duplicates === "replace" && (duplicate.reason !== "imported-before" || !duplicate.planned)) {
        // Replacing was confirmed for the pages the preview named, and only ever for pages an import made.
        keep(item, duplicate, duplicate.reason === "imported-before" ? SKIPPED_LATE : SKIPPED_OWN);
        continue;
      }
      if (duplicate && options.duplicates === "replace" && notes.get(duplicate.noteId).encrypted) {
        keep(item, duplicate, SKIPPED_ENCRYPTED);
        continue;
      }

      const rendered = await renderItem(treeDir, item);
      const parentId = parentOf(item);
      if (duplicate && options.duplicates === "replace") {
        notes.update(duplicate.noteId, { title: rendered.title, content: rendered.doc, tags: rendered.tags });
        ledger.append({ t: "page", path: item.path, noteId: duplicate.noteId, title: rendered.title, action: "updated", topLevel: false });
        report.updated.push({ noteId: duplicate.noteId, title: rendered.title, path: item.path });
        noteOf.set(item.path, duplicate.noteId);
      } else {
        const note = notes.create({
          parentId,
          title: rendered.title,
          content: rendered.doc,
          tags: rendered.tags,
          // A copy of a page from an earlier import does not take its key: the first page keeps
          // it, so importing again still finds exactly one page that was "imported before".
          importKey: duplicate?.reason === "imported-before" ? undefined : item.importKey,
        });
        const topLevel = parentId === targetParent;
        ledger.append({ t: "page", path: item.path, noteId: note.id, title: rendered.title, action: "created", topLevel });
        report.created.push({ noteId: note.id, title: rendered.title, path: item.path, topLevel });
        noteOf.set(item.path, note.id);
      }
      ours.add(item.path);
    } catch (error) {
      fail(item, reasonOf(error, item));
    }
  }

  // ── Second pass: links between pages, pictures, attached files ──
  let attachFailures = 0;

  /** Copies a file of the import into the attachments once, however many pages use it. */
  const attach = async (key: string, file: string, noteId: string): Promise<string | undefined> => {
    const known = attachmentOf.get(key);
    if (known) return known;
    try {
      const attachment = await notes.createAttachmentFromFile({
        sourcePath: resolveInside(treeDir, file),
        filename: baseName(file),
        noteId,
      });
      ledger.append({ t: "attachment", path: key, attachmentId: attachment.id });
      attachmentOf.set(key, attachment.id);
      report.attachments += 1;
      return attachment.id;
    } catch (error) {
      // The page keeps its text; only this picture or file is missing from it.
      deps.log.warn({ err: error, file }, "import attachment refused");
      attachFailures += 1;
      return undefined;
    }
  };

  const connect = async (item: ImportItem, noteId: string): Promise<void> => {
    const links = item.links ?? {};
    for (const target of new Set(Object.values(links))) {
      const found = byPath.get(target);
      // A PDF that did not go to the library is attached to the page instead, so the link still opens it.
      if (found?.kind === "attachment" || (found?.kind === "document" && !documentOf.has(target))) await attach(target, target, noteId);
    }

    const resolve = (href: string): InAppTarget | null => {
      const target = links[href];
      if (target === undefined) return null;
      const document = documentOf.get(target);
      if (document) return { type: "document", documentId: document };
      const attachment = attachmentOf.get(target);
      if (attachment) return { type: "attachment", attachmentId: attachment };
      const note = noteOf.get(target);
      return note ? { type: "note", noteId: note } : null;
    };

    // The page is converted on another thread, which cannot ask; it is handed the answers.
    const placed: Record<string, InAppTarget> = {};
    for (const href of Object.keys(links)) {
      const target = resolve(href);
      if (target) placed[href] = target;
    }
    const renderOptions: RenderOptions = { links: placed };
    if (item.format === "csv") {
      // The pages of a database's rows are its sub-pages; the first column links to them by name.
      const rows = pages.filter((page) => page.parentPath === item.path && noteOf.has(page.path));
      renderOptions.rowPage = rowPageMatcher(rows.map((page) => ({ title: page.title, noteId: noteOf.get(page.path)! })));
      const preview = await renderItem(treeDir, item);
      if (preview.table?.truncated) {
        const file = item.source ?? item.path;
        const attachmentId = await attach(`csv:${file}`, file, noteId);
        if (attachmentId) renderOptions.fullCsv = { href: `/api/attachments/${attachmentId}`, filename: baseName(file) };
      }
    }
    const rendered = await renderItem(treeDir, item, renderOptions);
    notes.update(noteId, { content: rendered.doc });
  };

  for (const item of toLink()) {
    if (stopped()) break;
    step("Connecting links and pictures");
    try {
      await connect(item, noteOf.get(item.path)!);
      ledger.append({ t: "linked", path: item.path });
      linked.add(item.path);
    } catch (error) {
      fail(item, `The page was imported, but its links and pictures could not be connected. ${reasonOf(error, item)}`);
    }
  }

  // ── What was left out on purpose ──
  for (const item of analysis.items) {
    if (item.kind === "skipped") report.skipped.push({ path: item.path, title: item.title, reason: item.reason ?? "It was left out." });
  }

  report.warnings = attachFailures + pages.reduce((total, item) => total + (ours.has(item.path) ? item.warnings.length : 0), 0);
  report.durationMs = Date.now() - started;
  return report;
}
