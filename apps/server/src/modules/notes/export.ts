/**
 * Getting pages out of Outpost as plain Markdown files, readable with any editor.
 *
 * One page becomes one `.md` file that starts with its title. The whole workspace
 * becomes a zip that mirrors the tree: a page with sub-pages is `Title.md` next to a
 * folder `Title/`. Links between pages are rewritten to relative paths and pictures are
 * copied to `_attachments/`, so the export works offline and outside Outpost.
 */
import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import type { AppContext } from "../../core/context.ts";
import { pathExists, safeFileName } from "../../core/fs-safe.ts";
import type { AttachmentStore } from "./attachments.ts";
import { type DocToMarkdownOptions, docToMarkdown } from "./content/index.ts";
import type { PMNode } from "./content/schema.ts";
import type { NotesService } from "./service.ts";

const UNTITLED = "Untitled";
const ATTACHMENTS_DIR = "_attachments";
const TEMPLATES_DIR = "_templates";

/** Markdown for a page: its title as the top heading, then its content. */
export function pageMarkdown(title: string, content: unknown, options: DocToMarkdownOptions = {}): string {
  const heading: PMNode = { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title.trim() || UNTITLED }] };
  const blocks = Array.isArray((content as PMNode | null)?.content) ? (content as PMNode).content! : [];
  return docToMarkdown({ type: "doc", content: [heading, ...blocks] }, options);
}

export function pageFileName(title: string): string {
  return `${safeFileName(title.trim() || UNTITLED, UNTITLED)}.md`;
}

/** Hands out names that are unique in one folder, also on filesystems that ignore case. */
export function createNamer(reserved: string[] = []) {
  const taken = new Set(reserved.map((name) => name.toLowerCase()));
  return (wanted: string, extension = ""): string => {
    let name = wanted;
    for (let count = 2; taken.has(`${name}${extension}`.toLowerCase()) || taken.has(name.toLowerCase()); count += 1) {
      name = `${wanted} ${count}`;
    }
    taken.add(name.toLowerCase());
    taken.add(`${name}${extension}`.toLowerCase());
    return name;
  };
}

/** A path from the folder of one file in the export to another file, as a URL. */
export function relativeLink(fromFile: string, toFile: string): string {
  return path.posix
    .relative(path.posix.dirname(fromFile), toFile)
    .split("/")
    .map((segment) => (segment === ".." ? segment : encodeURIComponent(segment)))
    .join("/");
}

interface PlanRow {
  id: string;
  parentId: string | null;
  title: string;
  isTemplate: number;
}

/**
 * Decides the path of every page in the export. Works level by level rather than by
 * recursion, so that a very deep tree is not a problem.
 */
export function planPaths(rows: PlanRow[]): Map<string, string> {
  const ids = new Set(rows.map((row) => row.id));
  const byParent = new Map<string | null, PlanRow[]>();
  const templates: PlanRow[] = [];
  for (const row of rows) {
    if (row.isTemplate) {
      templates.push(row);
      continue;
    }
    // A page whose parent is not part of the export (it is in the trash) goes to the top.
    const parent = row.parentId && ids.has(row.parentId) ? row.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), row]);
  }

  const paths = new Map<string, string>();
  const pending: Array<{ folder: string; pages: PlanRow[]; reserved: string[] }> = [
    { folder: "", pages: byParent.get(null) ?? [], reserved: [ATTACHMENTS_DIR, TEMPLATES_DIR] },
    { folder: `${TEMPLATES_DIR}/`, pages: templates, reserved: [] },
  ];
  while (pending.length > 0) {
    const { folder, pages, reserved } = pending.pop()!;
    const unique = createNamer(reserved);
    for (const page of pages) {
      const name = unique(safeFileName(page.title.trim() || UNTITLED, UNTITLED), ".md");
      paths.set(page.id, `${folder}${name}.md`);
      const children = byParent.get(page.id);
      if (children) pending.push({ folder: `${folder}${name}/`, pages: children, reserved: [] });
    }
  }
  return paths;
}

/** Adds one entry and waits until it has been written out, so only one page is in memory at a time. */
export function addEntry(archive: ZipArchive, source: string | Readable, name: string, date: Date): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (error?: Error) => {
      archive.off("entry", onEntry);
      archive.off("error", onError);
      archive.off("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const onEntry = () => done();
    const onError = (error: Error) => done(error);
    const onClose = () => done(new Error("The export was cancelled."));
    archive.once("entry", onEntry);
    archive.once("error", onError);
    archive.once("close", onClose);
    archive.append(source, { name, date });
  });
}

export interface NotesExporter {
  /** One page as Markdown, with the file name to offer for it. */
  page(id: string): { filename: string; markdown: string };
  /** The whole workspace as a zip, produced as it is read. */
  workspace(): { filename: string; stream: Readable };
  /**
   * Writes the same tree into an archive someone else is making, under `folder/`, and
   * leaves the archive open. Answers how many pages and attachments went in.
   */
  into(archive: ZipArchive, folder: string): Promise<{ pages: number; attachments: number }>;
}

export function createNotesExporter(ctx: AppContext, notes: NotesService, attachments: AttachmentStore): NotesExporter {
  async function writeWorkspace(archive: ZipArchive, folder = ""): Promise<{ pages: number; attachments: number }> {
    let attachmentCount = 0;
    const rows = ctx.sqlite
      .prepare(
        `SELECT id, parent_id AS parentId, title, is_template AS isTemplate FROM notes WHERE trashed_at IS NULL ORDER BY position, id`,
      )
      .all() as PlanRow[];
    const paths = planPaths(rows);

    // Attachments are named as pages mention them and copied in after the pages.
    const attachmentName = createNamer();
    const attachmentPaths = new Map<string, string | null>();
    const attachmentPath = (attachmentId: string): string | null => {
      if (!attachmentPaths.has(attachmentId)) {
        const row = attachments.find(attachmentId);
        const extension = row ? path.extname(row.filename) : "";
        attachmentPaths.set(
          attachmentId,
          row ? `${ATTACHMENTS_DIR}/${attachmentName(path.basename(row.filename, extension), extension)}${extension}` : null,
        );
      }
      return attachmentPaths.get(attachmentId) ?? null;
    };

    for (const [id, file] of paths) {
      // Read one page at a time: the tree can be thousands of pages.
      const row = notes.getRow(id);
      const markdown = pageMarkdown(row.title, row.content, {
        resolvePageLink: (target) => (paths.has(target) ? relativeLink(file, paths.get(target)!) : undefined),
        resolveAttachment: (target) => {
          const to = attachmentPath(target);
          return to ? relativeLink(file, to) : undefined;
        },
      });
      await addEntry(archive, markdown, folder + file, new Date(row.updatedAt));
    }

    for (const [id, file] of attachmentPaths) {
      const row = file ? attachments.find(id) : undefined;
      if (!row || !file) continue;
      const source = attachments.filePath(row);
      if (!(await pathExists(source))) {
        ctx.log.warn({ attachment: id }, "attachment file is missing; left out of the notes export");
        continue;
      }
      await addEntry(archive, fs.createReadStream(source), folder + file, new Date(row.createdAt));
      attachmentCount += 1;
    }
    return { pages: paths.size, attachments: attachmentCount };
  }

  return {
    page(id) {
      const row = notes.getRow(id);
      return { filename: pageFileName(row.title), markdown: pageMarkdown(row.title, row.content) };
    },

    workspace() {
      const archive = new ZipArchive({ zlib: { level: 6 } });
      writeWorkspace(archive)
        .then(() => archive.finalize())
        .catch((error: Error) => {
          // Already destroyed means the person closed the download; that is not a failure.
          if (archive.destroyed) return;
          ctx.log.error({ err: error }, "notes export failed");
          archive.destroy(error);
        });
      return { filename: `outpost-notes-${new Date().toISOString().slice(0, 10)}.zip`, stream: archive };
    },

    into: (archive, folder) => writeWorkspace(archive, folder.endsWith("/") ? folder : `${folder}/`),
  };
}
