/**
 * The notes workspace: a tree of pages.
 *
 * A page's `content` (an editor document) is the source of truth. Everything else that
 * depends on it is derived here whenever it changes and never edited separately: the
 * plain text and its hash, the links to other pages (which is what backlinks are read
 * from) and the page's entry in the search index.
 *
 * Deleting is in two steps. "Delete" moves a page and its sub-pages to the trash, where
 * they keep everything and can be restored. Only an explicit permanent delete removes
 * rows and attachment files.
 */
import type {
  AttachmentDto,
  NoteDetail,
  NoteDoc,
  NoteListItem,
  NoteLookupItem,
  NoteRef,
  NoteSaveResult,
  NoteTemplate,
  NoteTreeItem,
  TrashedNote,
} from "@outpost/shared";
import { encryptedNoteArmor } from "@outpost/shared";
import { and, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { badRequest, conflict, notFound } from "../../core/errors.ts";
import { newId, sha256Hex } from "../../core/ids.ts";
import { noteLinks, notes, noteTags, tags } from "../../db/schema.ts";
import type { AttachmentStore } from "./attachments.ts";
import * as content from "./content/index.ts";
import { attachmentHref, docToSections, docToText, emptyDoc, extractLinks, noteHref, sanitizeDoc } from "./content/index.ts";
import { needsRenumbering, positionBetween } from "./positions.ts";
import { BUILTIN_PREFIX, BUILTIN_TEMPLATES, findBuiltinTemplate } from "./templates.ts";

export type NoteRow = typeof notes.$inferSelect;

const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 50;
const UNTITLED = "Untitled";

export interface CreateNoteInput {
  parentId?: string | null;
  title?: string;
  icon?: string | null;
  content?: unknown;
  templateId?: string;
  /** Place the page right after this sibling. Without `parentId`, the sibling's parent is used. */
  afterId?: string;
  tags?: string[];
  /** Where an imported page came from; see `findByImportKey`. */
  importKey?: string;
}

export interface UpdateNoteInput {
  title?: string;
  icon?: string | null;
  content?: unknown;
  tags?: string[];
  isFavorite?: boolean;
  coverAttachmentId?: string | null;
  isTemplate?: boolean;
  baseUpdatedAt?: number;
  /**
   * Has to be true for a save that replaces an encrypted page's content with content
   * that is not encrypted. Without it such a save is refused, so that an editor left
   * open from before the page was encrypted cannot put the old text back by accident.
   */
  removeEncryption?: boolean;
  /**
   * Set for saves that come from a browser. They may only put ciphertext in place of
   * text, or text in place of ciphertext, on top of the version named by
   * `baseUpdatedAt`, and the second only with `removeEncryption`. A merge or an import
   * replaces a page as the direct result of a person's choice and has its own check
   * that the page is the one they were shown.
   */
  guardEncryption?: boolean;
}

/** A page brought in whole from another library; see `NotesService.adopt`. */
export interface AdoptNoteInput {
  /** Keep this id when no page has it; the page is refused when one does. */
  id?: string;
  parentId: string | null;
  /** Place the page right after this sibling instead of last. */
  afterId?: string;
  title: string;
  icon: string | null;
  content: unknown;
  tags: string[];
  coverAttachmentId?: string | null;
  isTemplate?: boolean;
  isFavorite?: boolean;
  /** When the page was written where it came from. Dates in the future are brought back to now. */
  createdAt?: number;
  updatedAt?: number;
}

export interface NotesService {
  tree(): NoteTreeItem[];
  create(input?: CreateNoteInput): NoteDetail;
  /**
   * Adds a page that already exists in another library (a portable drive coming home),
   * keeping its id and dates where it can. The content goes through the same sanitiser
   * as every other page. Used by the merge module; nothing else should need it.
   */
  adopt(input: AdoptNoteInput): NoteDetail;
  /** `view: true` also records that the page was opened, for the list of recent pages. */
  get(id: string, options?: { view?: boolean }): NoteDetail;
  /** Applies a change. Throws 409 `conflict` when `baseUpdatedAt` is older than the stored page. */
  update(id: string, patch: UpdateNoteInput): NoteSaveResult;
  move(id: string, target: { parentId: string | null; afterId?: string | null }): NoteTreeItem;
  duplicate(id: string, options?: { withChildren?: boolean }): NoteDetail;
  /** Moves a page and its sub-pages to the trash. Returns the ids that went. */
  trash(id: string): string[];
  restore(id: string): NoteDetail;
  /** Deletes a page in the trash for good, with the attachments no other page uses. */
  deletePermanently(id: string): Promise<{ deletedNotes: number; deletedAttachments: number }>;
  listTrash(): TrashedNote[];
  recent(limit?: number): NoteListItem[];
  favorites(): NoteListItem[];
  templates(): NoteTemplate[];
  lookup(query: string, limit?: number): NoteLookupItem[];
  /** The page an importer created earlier from the same source, if it still exists. */
  findByImportKey(key: string): NoteDetail | undefined;
  setImportKey(id: string, key: string | null): void;
  /** For importers: copies a file from disk into the attachments, with the same checks as an upload. */
  createAttachmentFromFile(input: { sourcePath: string; filename: string; noteId?: string }): Promise<AttachmentDto>;
  /** Removes an attachment that no page uses any more. */
  deleteAttachment(id: string): Promise<void>;
  /** The stored row, for code in this module that needs more than the DTO. */
  getRow(id: string): NoteRow;
  /** Pure helpers for page documents (Markdown and HTML conversion, text, links). */
  content: typeof content;
}

declare module "../../core/context.ts" {
  interface Services {
    notes: NotesService;
  }
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/g;

/** Tags are the same tag whatever their capitalisation; the documents module agrees. */
const tagKey = (name: string) => name.normalize("NFC").toLowerCase();

/** Trims, drops blanks and repeats, and refuses names the shared tag list cannot hold. */
export function cleanTags(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of input) {
    const name = raw.normalize("NFC").replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
    if (!name || seen.has(tagKey(name))) continue;
    if (name.includes(",")) throw badRequest(`Tags cannot contain commas ("${name}"). Add each tag separately.`);
    if (name.length > MAX_TAG_LENGTH) {
      throw badRequest(`The tag "${name.slice(0, 20)}…" is too long. Keep tags to ${MAX_TAG_LENGTH} characters or fewer.`);
    }
    seen.add(tagKey(name));
    names.push(name);
  }
  if (names.length > MAX_TAGS) throw badRequest(`A page can have at most ${MAX_TAGS} tags.`);
  return names;
}

/** Titles are one line. Spaces are kept as typed: a save arrives while a title is still being written. */
const cleanTitle = (title: string): string => title.replace(CONTROL_CHARACTERS, " ");

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

interface SiblingRow {
  id: string;
  position: number;
}

interface TreeRow {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  position: number;
  isFavorite: number;
  updatedAt: number;
}

export function createNotesService(ctx: AppContext, attachments: AttachmentStore): NotesService {
  const { db, sqlite } = ctx;
  const { search } = ctx.services;

  const changed = (id: string) => ctx.events.publish({ type: "notes.changed", id });

  // ── Reading the tree ──────────────────────────────────────────────────────

  const TREE_COLUMNS = `id, parent_id AS parentId, title, icon, position, is_favorite AS isFavorite, updated_at AS updatedAt`;
  const LIST_COLUMNS = `id, parent_id AS parentId, title, icon, is_favorite AS isFavorite, updated_at AS updatedAt, last_viewed_at AS lastViewedAt`;
  /** Pages people see in the tree: not in the trash and not a template. */
  const VISIBLE = `trashed_at IS NULL AND is_template = 0`;

  const treeStatement = sqlite.prepare(`SELECT ${TREE_COLUMNS} FROM notes WHERE ${VISIBLE} ORDER BY parent_id, position, id`);

  const siblingsStatement = sqlite.prepare(
    `SELECT id, position FROM notes WHERE parent_id IS @parentId AND ${VISIBLE} AND id IS NOT @exceptId ORDER BY position, id`,
  );
  const setPosition = sqlite.prepare(`UPDATE notes SET position = ? WHERE id = ?`);

  /** The page and everything under it. UNION (not UNION ALL) so that damaged data with a loop still ends. */
  const subtreeStatement = sqlite.prepare(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM notes WHERE id = ?
       UNION
       SELECT n.id FROM notes n JOIN sub ON n.parent_id = sub.id
     )
     SELECT n.id AS id, n.trashed_at AS trashedAt FROM sub JOIN notes n ON n.id = sub.id`,
  );

  /** Ancestors of a page, nearest first. The depth limit ends a loop in damaged data. */
  const ancestorsStatement = sqlite.prepare(
    `WITH RECURSIVE up(id, parent_id, title, icon, depth) AS (
       SELECT p.id, p.parent_id, p.title, p.icon, 1 FROM notes c JOIN notes p ON p.id = c.parent_id WHERE c.id = ?
       UNION ALL
       SELECT p.id, p.parent_id, p.title, p.icon, up.depth + 1 FROM up JOIN notes p ON p.id = up.parent_id WHERE up.depth < 200
     )
     SELECT id, title, icon FROM up ORDER BY depth`,
  );

  const backlinksStatement = sqlite.prepare(
    `SELECT n.id AS id, n.title AS title, n.icon AS icon
     FROM note_links l JOIN notes n ON n.id = l.source_id
     WHERE l.target_kind = 'note' AND l.target_id = @id AND n.id != @id AND n.trashed_at IS NULL
     ORDER BY n.title COLLATE NOCASE, n.id`,
  );

  const childrenStatement = sqlite.prepare(`SELECT id, title, icon FROM notes WHERE parent_id = ? AND ${VISIBLE} ORDER BY position, id`);

  const tagNamesStatement = sqlite.prepare(
    `SELECT t.name AS name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = ? ORDER BY t.name COLLATE NOCASE`,
  );

  function getRow(id: string): NoteRow {
    const row = db.select().from(notes).where(eq(notes.id, id)).get();
    if (!row) throw notFound("Page");
    return row;
  }

  const ancestors = (id: string): NoteRef[] => (ancestorsStatement.all(id) as NoteRef[]).reverse();
  const tagsOf = (id: string): string[] => (tagNamesStatement.all(id) as Array<{ name: string }>).map((row) => row.name);
  const subtree = (id: string) => subtreeStatement.all(id) as Array<{ id: string; trashedAt: number | null }>;

  function toTreeItem(row: TreeRow, childCount: number): NoteTreeItem {
    return {
      id: row.id,
      parentId: row.parentId,
      title: row.title,
      icon: row.icon,
      position: row.position,
      isFavorite: Boolean(row.isFavorite),
      childCount,
      updatedAt: row.updatedAt,
    };
  }

  function tree(): NoteTreeItem[] {
    // One indexed query, then one pass to count children: a few thousand pages cost a
    // few milliseconds, and the sidebar asks for this often.
    const rows = treeStatement.all() as TreeRow[];
    const counts = new Map<string, number>();
    for (const row of rows) if (row.parentId) counts.set(row.parentId, (counts.get(row.parentId) ?? 0) + 1);
    return rows.map((row) => toTreeItem(row, counts.get(row.id) ?? 0));
  }

  function treeItem(id: string): NoteTreeItem {
    const row = sqlite.prepare(`SELECT ${TREE_COLUMNS} FROM notes WHERE id = ?`).get(id) as TreeRow;
    return toTreeItem(row, childrenStatement.all(id).length);
  }

  function toDetail(row: NoteRow): NoteDetail {
    return {
      id: row.id,
      parentId: row.parentId,
      title: row.title,
      icon: row.icon,
      content: row.content as unknown as NoteDoc,
      encrypted: encryptedNoteArmor(row.content) !== null,
      tags: tagsOf(row.id),
      isFavorite: row.isFavorite,
      isTemplate: row.isTemplate,
      position: row.position,
      coverAttachmentId: row.coverAttachmentId,
      coverUrl: row.coverAttachmentId ? attachmentHref(row.coverAttachmentId) : null,
      breadcrumbs: ancestors(row.id),
      backlinks: backlinksStatement.all({ id: row.id }) as NoteRef[],
      children: childrenStatement.all(row.id) as NoteRef[],
      trashedAt: row.trashedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastViewedAt: row.lastViewedAt,
    };
  }

  function toSaveResult(row: NoteRow): NoteSaveResult {
    return {
      id: row.id,
      title: row.title,
      icon: row.icon,
      updatedAt: row.updatedAt,
      tags: tagsOf(row.id),
      isFavorite: row.isFavorite,
      isTemplate: row.isTemplate,
      coverAttachmentId: row.coverAttachmentId,
      coverUrl: row.coverAttachmentId ? attachmentHref(row.coverAttachmentId) : null,
    };
  }

  // ── Derived data: tags, links, search ─────────────────────────────────────

  const pruneTag = sqlite.prepare(
    `DELETE FROM tags WHERE id = @id
       AND NOT EXISTS (SELECT 1 FROM document_tags WHERE tag_id = @id)
       AND NOT EXISTS (SELECT 1 FROM note_tags WHERE tag_id = @id)`,
  );

  /** Replaces a page's tags, creating any that do not exist yet. Call inside a transaction. */
  function setTags(noteId: string, names: string[]): void {
    const known = new Map(
      db
        .select()
        .from(tags)
        .all()
        .map((tag) => [tagKey(tag.name), tag.id]),
    );
    const before = db.select({ tagId: noteTags.tagId }).from(noteTags).where(eq(noteTags.noteId, noteId)).all();
    const after = new Set<string>();
    db.delete(noteTags).where(eq(noteTags.noteId, noteId)).run();
    for (const name of names) {
      let tagId = known.get(tagKey(name));
      if (!tagId) {
        tagId = newId();
        db.insert(tags).values({ id: tagId, name, createdAt: Date.now() }).run();
        known.set(tagKey(name), tagId);
      }
      after.add(tagId);
      db.insert(noteTags).values({ noteId, tagId }).run();
    }
    // A tag nothing uses any more is dropped, so a typo does not linger as a suggestion.
    for (const { tagId } of before) if (!after.has(tagId)) pruneTag.run({ id: tagId });
  }

  /**
   * An encrypted page (see `encryptedNoteArmor`) has no text the server can read. Its
   * ciphertext is kept out of everything derived from content, so no preview, search
   * passage or vector is ever made of it; the hash still changes when the message does.
   */
  function derive(doc: NoteDoc): { contentText: string; contentHash: string } {
    const armor = encryptedNoteArmor(doc);
    if (armor !== null) return { contentText: "", contentHash: sha256Hex(armor) };
    const contentText = docToText(doc);
    return { contentText, contentHash: sha256Hex(contentText) };
  }

  function writeLinks(noteId: string, doc: NoteDoc): void {
    const links = extractLinks(doc);
    db.delete(noteLinks).where(eq(noteLinks.sourceId, noteId)).run();
    for (const targetId of links.noteIds) {
      // A page that mentions itself is not a backlink.
      if (targetId !== noteId) db.insert(noteLinks).values({ sourceId: noteId, targetId, targetKind: "note" }).run();
    }
    for (const targetId of links.documentIds) {
      db.insert(noteLinks).values({ sourceId: noteId, targetId, targetKind: "document" }).run();
    }
  }

  /** Puts a page into the search index, or takes it out when it is in the trash or a template. */
  function index(row: NoteRow, options: { textChanged?: boolean } = {}): void {
    if (row.trashedAt !== null || row.isTemplate) {
      search.remove("note", row.id);
      return;
    }
    const entity = {
      kind: "note",
      entityId: row.id,
      title: row.title.trim() || UNTITLED,
      url: noteHref(row.id),
      subtitle:
        ancestors(row.id)
          .map((ancestor) => ancestor.title.trim() || UNTITLED)
          .join(" / ") || null,
      tags: tagsOf(row.id),
      // An encrypted page stays findable by its title and tags, which are not encrypted.
      sections: encryptedNoteArmor(row.content) !== null ? [] : docToSections(row.content as unknown as NoteDoc),
    };
    const result = search.upsert(entity);
    // The index compares passages by their text alone, so renaming a heading without
    // touching the text under it looks like "nothing changed" and the old heading
    // would stay searchable. Rebuilding the entry is the way to make it notice.
    if (options.textChanged && !result.changed) {
      search.remove("note", row.id);
      search.upsert(entity);
    }
  }

  /** Re-indexes everything under a page: their breadcrumb path is part of their search entry. */
  function indexDescendants(id: string): void {
    for (const entry of subtree(id)) {
      if (entry.id !== id && entry.trashedAt === null) index(getRow(entry.id));
    }
  }

  // ── Positions ─────────────────────────────────────────────────────────────

  /**
   * The position for a page among the children of `parentId`: last when `afterId` is
   * undefined, first when it is null, otherwise right after that sibling. `movingId` is
   * the page being placed, which must not count as its own neighbour.
   */
  function place(parentId: string | null, movingId: string | null, afterId: string | null | undefined): number {
    const siblings = siblingsStatement.all({ parentId, exceptId: movingId }) as SiblingRow[];
    let beforeIndex: number;
    if (afterId === undefined) beforeIndex = siblings.length - 1;
    else if (afterId === null) beforeIndex = -1;
    else {
      beforeIndex = siblings.findIndex((sibling) => sibling.id === afterId);
      if (beforeIndex < 0) throw badRequest("The page to put this one after is no longer in that place. Refresh and try again.");
    }
    if (needsRenumbering(siblings[beforeIndex]?.position, siblings[beforeIndex + 1]?.position)) {
      siblings.forEach((sibling, order) => {
        sibling.position = order + 1;
        setPosition.run(sibling.position, sibling.id);
      });
    }
    return positionBetween(siblings[beforeIndex]?.position, siblings[beforeIndex + 1]?.position);
  }

  /** A page that other pages can be put inside: it exists, is not in the trash and is not a template. */
  function assertParent(parentId: string): NoteRow {
    const parent = db.select().from(notes).where(eq(notes.id, parentId)).get();
    if (!parent) throw badRequest("The page this was meant to go inside no longer exists.");
    if (parent.trashedAt !== null) throw badRequest("That page is in the trash. Restore it before adding pages to it.");
    if (parent.isTemplate) throw badRequest("Templates cannot have sub-pages.");
    return parent;
  }

  // ── Writing ───────────────────────────────────────────────────────────────

  interface NewPage {
    parentId: string | null;
    position: number;
    title: string;
    icon: string | null;
    doc: NoteDoc;
    tags: string[];
    coverAttachmentId?: string | null;
    importKey?: string | null;
  }

  /** Inserts a page with everything derived from its content. Call inside a transaction. */
  function insert(page: NewPage): string {
    const id = newId();
    const now = Date.now();
    db.insert(notes)
      .values({
        id,
        parentId: page.parentId,
        title: page.title,
        icon: page.icon,
        coverAttachmentId: page.coverAttachmentId ?? null,
        content: page.doc as unknown as Record<string, unknown>,
        ...derive(page.doc),
        position: page.position,
        importKey: page.importKey ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (page.tags.length > 0) setTags(id, page.tags);
    writeLinks(id, page.doc);
    index(getRow(id));
    return id;
  }

  function templateSource(templateId: string): { title: string; icon: string | null; content: unknown } {
    if (templateId.startsWith(BUILTIN_PREFIX)) {
      const builtin = findBuiltinTemplate(templateId);
      if (!builtin) throw notFound("Template");
      return builtin;
    }
    const row = db.select().from(notes).where(eq(notes.id, templateId)).get();
    if (!row?.isTemplate || row.trashedAt !== null) throw notFound("Template");
    return row;
  }

  const create = sqlite.transaction((input: CreateNoteInput = {}): string => {
    const template = input.templateId ? templateSource(input.templateId) : undefined;
    const after = input.afterId ? db.select().from(notes).where(eq(notes.id, input.afterId)).get() : undefined;
    if (input.afterId && !after) throw badRequest("The page to put this one after no longer exists. Refresh and try again.");

    const parentId = input.parentId !== undefined ? input.parentId : (after?.parentId ?? null);
    if (parentId) assertParent(parentId);

    return insert({
      parentId,
      position: place(parentId, null, input.afterId),
      title: cleanTitle(input.title ?? template?.title ?? ""),
      icon: input.icon !== undefined ? input.icon : (template?.icon ?? null),
      doc: sanitizeDoc(input.content ?? template?.content ?? emptyDoc()),
      tags: cleanTags(input.tags ?? []),
      importKey: input.importKey,
    });
  });

  const update = sqlite.transaction((id: string, patch: UpdateNoteInput): { row: NoteRow; dirty: boolean } => {
    const row = getRow(id);
    if (row.trashedAt !== null) throw conflict("This page is in the trash. Restore it before changing it.");
    if (patch.baseUpdatedAt !== undefined && row.updatedAt > patch.baseUpdatedAt) {
      throw conflict(
        "This page was changed somewhere else after you opened it, in another tab or on another device. Your changes were not saved over it; reload to see the newer version.",
        { current: { updatedAt: row.updatedAt, title: row.title } },
      );
    }

    const set: Partial<NoteRow> = {};
    let textChanged = false;
    let tagsChanged = false;

    if (patch.title !== undefined && cleanTitle(patch.title) !== row.title) set.title = cleanTitle(patch.title);
    if (patch.icon !== undefined && patch.icon !== row.icon) set.icon = patch.icon;

    let doc: NoteDoc | undefined;
    if (patch.content !== undefined) {
      doc = sanitizeDoc(patch.content);
      // Both sides went through the same sanitiser, so equal documents serialise equally.
      if (JSON.stringify(doc) !== JSON.stringify(row.content)) {
        const wasEncrypted = encryptedNoteArmor(row.content) !== null;
        const willBeEncrypted = encryptedNoteArmor(doc) !== null;
        if (patch.guardEncryption && (wasEncrypted || willBeEncrypted)) {
          // Putting ciphertext in place of text, or the other way round, replaces the
          // whole page. It is only done on top of the version the person was looking at.
          if (patch.baseUpdatedAt === undefined) {
            throw badRequest("An encrypted page can only be saved over the version it was made from. Reload the page and try again.");
          }
          if (wasEncrypted && !willBeEncrypted && patch.removeEncryption !== true) {
            throw conflict(
              "This page is encrypted. What was sent would have replaced it with text that is not, so it was not saved. Reload the page.",
            );
          }
        }
        if (willBeEncrypted && row.isTemplate && patch.isTemplate !== false) {
          throw badRequest("A template cannot be encrypted: every page made from it would start as text nobody can read.");
        }
        const derived = derive(doc);
        textChanged = derived.contentHash !== row.contentHash;
        Object.assign(set, { content: doc, ...derived });
      } else {
        doc = undefined;
      }
    }

    if (patch.coverAttachmentId !== undefined && patch.coverAttachmentId !== row.coverAttachmentId) {
      if (patch.coverAttachmentId !== null) {
        const cover = attachments.find(patch.coverAttachmentId);
        if (!cover) throw badRequest("That cover picture no longer exists. Upload it again.");
        if (!attachments.isImage(cover)) throw badRequest("A page cover has to be a picture.");
      }
      set.coverAttachmentId = patch.coverAttachmentId;
    }

    if (patch.isTemplate !== undefined && patch.isTemplate !== row.isTemplate) {
      if (patch.isTemplate && encryptedNoteArmor(patch.content !== undefined ? sanitizeDoc(patch.content) : row.content) !== null) {
        throw conflict("An encrypted page cannot be a template: every page made from it would start as text nobody can read.");
      }
      if (patch.isTemplate) {
        // A template is a single page outside the tree; sub-pages would be left hanging.
        if (childrenStatement.all(id).length > 0) {
          throw conflict("This page has sub-pages. Move them somewhere else before turning it into a template.");
        }
        Object.assign(set, { isTemplate: true, parentId: null, isFavorite: false });
      } else {
        Object.assign(set, { isTemplate: false, parentId: null, position: place(null, id, undefined) });
      }
    }

    if (patch.tags !== undefined) {
      const next = cleanTags(patch.tags);
      // The same tags in another order or capitalisation are not a change.
      const keys = (names: string[]) => names.map(tagKey).sort().join("\n");
      if (keys(next) !== keys(tagsOf(id))) {
        setTags(id, next);
        tagsChanged = true;
      }
    }

    // Starring a page is not an edit of the page: it must not make an open editor think
    // someone else changed the text, so it leaves `updatedAt` alone.
    const touched = Object.keys(set).length > 0 || tagsChanged;
    if (touched) set.updatedAt = Math.max(Date.now(), row.updatedAt + 1);
    if (patch.isFavorite !== undefined && patch.isFavorite !== row.isFavorite && set.isTemplate !== true) {
      set.isFavorite = patch.isFavorite;
    }
    if (Object.keys(set).length === 0) return { row, dirty: false };

    db.update(notes).set(set).where(eq(notes.id, id)).run();
    const next = getRow(id);
    if (doc) writeLinks(id, doc);
    if (touched) index(next, { textChanged });
    // Sub-pages show this page's title in their search entry.
    if (set.title !== undefined) indexDescendants(id);
    return { row: next, dirty: true };
  });

  const move = sqlite.transaction((id: string, target: { parentId: string | null; afterId?: string | null }): void => {
    const row = getRow(id);
    if (row.trashedAt !== null) throw conflict("This page is in the trash. Restore it before moving it.");
    if (row.isTemplate) throw conflict("Templates are kept outside the page tree and cannot be moved into it.");

    if (target.parentId) {
      assertParent(target.parentId);
      const inside = target.parentId === id || subtree(id).some((entry) => entry.id === target.parentId);
      if (inside) throw badRequest("A page cannot be moved inside itself or one of its own sub-pages.");
    }
    if (target.afterId === id) throw badRequest("A page cannot be placed after itself.");

    const position = place(target.parentId, id, target.afterId);
    db.update(notes).set({ parentId: target.parentId, position }).where(eq(notes.id, id)).run();
    if (target.parentId !== row.parentId) {
      // The breadcrumb path of the page and everything under it has changed.
      index(getRow(id));
      indexDescendants(id);
    }
  });

  const duplicate = sqlite.transaction((id: string, withChildren: boolean): string => {
    const row = getRow(id);
    if (row.trashedAt !== null) throw conflict("This page is in the trash. Restore it before duplicating it.");

    const copy = (source: NoteRow, parentId: string | null, position: number, title: string): string =>
      insert({
        parentId,
        position,
        title,
        icon: source.icon,
        doc: source.content as unknown as NoteDoc,
        tags: tagsOf(source.id),
        coverAttachmentId: source.coverAttachmentId,
      });

    // A copy of a template is an ordinary page; making more templates is a deliberate act.
    const parentId = row.isTemplate ? null : row.parentId;
    const position = row.isTemplate ? place(null, null, undefined) : place(parentId, null, row.id);
    const copyId = copy(row, parentId, position, `${row.title.trim() || UNTITLED} (copy)`);

    if (withChildren) {
      const pending: Array<{ sourceId: string; copyId: string }> = [{ sourceId: id, copyId }];
      while (pending.length > 0) {
        const current = pending.pop()!;
        const children = db
          .select()
          .from(notes)
          .where(and(eq(notes.parentId, current.sourceId), sql`${notes.trashedAt} IS NULL`, eq(notes.isTemplate, false)))
          .all();
        for (const child of children) {
          pending.push({ sourceId: child.id, copyId: copy(child, current.copyId, child.position, child.title) });
        }
      }
    }
    return copyId;
  });

  const trash = sqlite.transaction((id: string): string[] => {
    const row = getRow(id);
    if (row.trashedAt !== null) return [];
    // Sub-pages already in the trash keep their own time, so they stay there when this
    // page is restored. A time later than any other keeps each trip to the trash apart.
    const latest = (sqlite.prepare(`SELECT max(trashed_at) AS latest FROM notes`).get() as { latest: number | null }).latest ?? 0;
    const trashedAt = Math.max(Date.now(), latest + 1);
    const ids = subtree(id)
      .filter((entry) => entry.trashedAt === null)
      .map((entry) => entry.id);
    const mark = sqlite.prepare(`UPDATE notes SET trashed_at = ? WHERE id = ?`);
    for (const entryId of ids) {
      mark.run(trashedAt, entryId);
      search.remove("note", entryId);
    }
    return ids;
  });

  const restore = sqlite.transaction((id: string): void => {
    const row = getRow(id);
    if (row.trashedAt === null) return;
    const batch = subtree(id).filter((entry) => entry.trashedAt === row.trashedAt);

    // Back to where it was if that place still exists; otherwise to the top level.
    const parent = row.parentId ? db.select().from(notes).where(eq(notes.id, row.parentId)).get() : undefined;
    const parentUsable = parent !== undefined && parent.trashedAt === null && !parent.isTemplate;
    const unmark = sqlite.prepare(`UPDATE notes SET trashed_at = NULL WHERE id = ?`);
    for (const entry of batch) unmark.run(entry.id);
    if (row.parentId && !parentUsable) {
      db.update(notes)
        .set({ parentId: null, position: place(null, id, undefined) })
        .where(eq(notes.id, id))
        .run();
    }
    for (const entry of batch) index(getRow(entry.id));
  });

  const referencesStatement = sqlite.prepare(`SELECT id FROM notes WHERE cover_attachment_id = @id OR instr(content, @href) > 0 LIMIT 5`);
  /** Pages (including ones in the trash, which can come back) that still use an attachment. */
  const referencesTo = (attachmentId: string): string[] =>
    (referencesStatement.all({ id: attachmentId, href: attachmentHref(attachmentId) }) as Array<{ id: string }>).map((row) => row.id);

  async function deletePermanently(id: string): Promise<{ deletedNotes: number; deletedAttachments: number }> {
    const candidates = new Set<string>();
    const ids = sqlite.transaction((): string[] => {
      const row = getRow(id);
      if (row.trashedAt === null) throw conflict("Move this page to the trash first. Only pages in the trash can be deleted for good.");
      const doomed = subtree(id)
        .filter((entry) => entry.trashedAt !== null)
        .map((entry) => entry.id);
      const ownedBy = sqlite.prepare(`SELECT id FROM attachments WHERE note_id = ?`);
      const release = sqlite.prepare(`UPDATE attachments SET note_id = NULL WHERE note_id = ?`);
      const orphan = sqlite.prepare(`UPDATE notes SET parent_id = NULL WHERE parent_id = ? AND trashed_at IS NULL`);
      for (const noteId of doomed) {
        const page = getRow(noteId);
        for (const attachmentId of extractLinks(page.content as unknown as NoteDoc).attachmentIds) candidates.add(attachmentId);
        if (page.coverAttachmentId) candidates.add(page.coverAttachmentId);
        for (const owned of ownedBy.all(noteId) as Array<{ id: string }>) candidates.add(owned.id);
        const tagIds = db.select({ tagId: noteTags.tagId }).from(noteTags).where(eq(noteTags.noteId, noteId)).all();
        release.run(noteId);
        // Cannot happen through this service, but a live page must never be left under a deleted one.
        orphan.run(noteId);
        search.remove("note", noteId);
        db.delete(notes).where(eq(notes.id, noteId)).run();
        for (const { tagId } of tagIds) pruneTag.run({ id: tagId });
      }
      return doomed;
    })();

    let deletedAttachments = 0;
    for (const attachmentId of candidates) {
      // Checked after the pages are gone, so only pages that remain can keep a file.
      if (!attachments.find(attachmentId) || referencesTo(attachmentId).length > 0) continue;
      await attachments.remove(attachmentId);
      deletedAttachments += 1;
    }
    changed(id);
    return { deletedNotes: ids.length, deletedAttachments };
  }

  const adopt = sqlite.transaction((input: AdoptNoteInput): string => {
    const id = input.id ?? newId();
    if (db.select({ id: notes.id }).from(notes).where(eq(notes.id, id)).get()) {
      throw conflict("A page with that id already exists, so the incoming page was not added over it.");
    }
    const isTemplate = input.isTemplate === true;
    // A template lives outside the tree.
    const parentId = isTemplate ? null : input.parentId;
    if (parentId) assertParent(parentId);
    if (input.coverAttachmentId) {
      const cover = attachments.find(input.coverAttachmentId);
      if (!cover || !attachments.isImage(cover)) throw badRequest("A page cover has to be a picture that is stored here.");
    }
    const doc = sanitizeDoc(input.content);
    const now = Date.now();
    const createdAt = Math.min(input.createdAt ?? now, now);
    db.insert(notes)
      .values({
        id,
        parentId,
        title: cleanTitle(input.title).slice(0, 300),
        icon: input.icon,
        coverAttachmentId: input.coverAttachmentId ?? null,
        content: doc as unknown as Record<string, unknown>,
        ...derive(doc),
        position: isTemplate ? 0 : place(parentId, null, input.afterId),
        isTemplate,
        isFavorite: !isTemplate && input.isFavorite === true,
        createdAt,
        updatedAt: Math.max(createdAt, Math.min(input.updatedAt ?? now, now)),
      })
      .run();
    const tagList = cleanTags(input.tags);
    if (tagList.length > 0) setTags(id, tagList);
    writeLinks(id, doc);
    index(getRow(id));
    return id;
  });

  // ── Lists ─────────────────────────────────────────────────────────────────

  const toListItem = (row: Omit<NoteListItem, "isFavorite"> & { isFavorite: number }): NoteListItem => ({
    ...row,
    isFavorite: Boolean(row.isFavorite),
  });

  const listRows = (statement: string, ...params: unknown[]): NoteListItem[] =>
    (sqlite.prepare(statement).all(...params) as Array<Omit<NoteListItem, "isFavorite"> & { isFavorite: number }>).map(toListItem);

  function listTrash(): TrashedNote[] {
    // Only the page that was deleted is listed, not each sub-page that went with it.
    const rows = sqlite
      .prepare(
        `SELECT n.id AS id, n.title AS title, n.icon AS icon, n.trashed_at AS trashedAt
         FROM notes n LEFT JOIN notes p ON p.id = n.parent_id
         WHERE n.trashed_at IS NOT NULL AND (p.id IS NULL OR p.trashed_at IS NULL OR p.trashed_at != n.trashed_at)
         ORDER BY n.trashed_at DESC, n.id`,
      )
      .all() as Array<NoteRef & { trashedAt: number }>;
    return rows.map((row) => ({
      ...row,
      descendantCount: subtree(row.id).filter((entry) => entry.trashedAt === row.trashedAt).length - 1,
    }));
  }

  function lookup(query: string, limit = 10): NoteLookupItem[] {
    const q = query.trim();
    const rows = sqlite
      .prepare(
        // Titles that start with what was typed come first, then the most recently edited.
        `SELECT id, title, icon, updated_at AS updatedAt FROM notes
         WHERE ${VISIBLE} AND title LIKE @contains ESCAPE '\\'
         ORDER BY (title LIKE @prefix ESCAPE '\\') DESC, updated_at DESC, id
         LIMIT @limit`,
      )
      .all({ contains: `%${escapeLike(q)}%`, prefix: `${escapeLike(q)}%`, limit }) as Array<NoteRef & { updatedAt: number }>;
    return rows.map((row) => ({
      ...row,
      path: ancestors(row.id)
        .map((ancestor) => ancestor.title.trim() || UNTITLED)
        .join(" / "),
    }));
  }

  function templates(): NoteTemplate[] {
    const own = sqlite
      .prepare(
        `SELECT id, title, icon, content_text AS text FROM notes WHERE is_template = 1 AND trashed_at IS NULL ORDER BY title COLLATE NOCASE, id`,
      )
      .all() as Array<NoteRef & { text: string }>;
    return [
      ...BUILTIN_TEMPLATES.map(({ id, title, icon, description, builtin }) => ({ id, title, icon, description, builtin })),
      ...own.map((row) => ({
        id: row.id,
        title: row.title,
        icon: row.icon,
        // The first words of the page say what a personal template is for.
        description: row.text.replace(/\s+/g, " ").trim().slice(0, 140),
        builtin: false,
      })),
    ];
  }

  // ── The service ───────────────────────────────────────────────────────────

  const service: NotesService = {
    tree,
    getRow,
    content,

    create(input) {
      const id = create.immediate(input);
      changed(id);
      return toDetail(getRow(id));
    },

    adopt(input) {
      const id = adopt.immediate(input);
      changed(id);
      return toDetail(getRow(id));
    },

    get(id, options = {}) {
      let row = getRow(id);
      if (options.view && row.trashedAt === null) {
        db.update(notes).set({ lastViewedAt: Date.now() }).where(eq(notes.id, id)).run();
        row = getRow(id);
      }
      return toDetail(row);
    },

    update(id, patch) {
      // A save that puts ciphertext in place of a page's text also erases that text from
      // the database file and the search index, rather than leaving it in freed space.
      const encrypting = patch.content !== undefined && encryptedNoteArmor(patch.content) !== null;
      const result = encrypting ? search.scrubbing(() => update.immediate(id, patch)) : update.immediate(id, patch);
      if (result.dirty) changed(id);
      return toSaveResult(result.row);
    },

    move(id, target) {
      move.immediate(id, target);
      changed(id);
      return treeItem(id);
    },

    duplicate(id, options = {}) {
      const copyId = duplicate.immediate(id, options.withChildren === true);
      changed(copyId);
      return toDetail(getRow(copyId));
    },

    trash(id) {
      const ids = trash.immediate(id);
      if (ids.length > 0) changed(id);
      return ids;
    },

    restore(id) {
      restore.immediate(id);
      changed(id);
      return toDetail(getRow(id));
    },

    deletePermanently,
    listTrash,
    lookup,
    templates,

    recent(limit = 20) {
      return listRows(
        `SELECT ${LIST_COLUMNS} FROM notes WHERE ${VISIBLE} AND last_viewed_at IS NOT NULL ORDER BY last_viewed_at DESC, id LIMIT ?`,
        limit,
      );
    },

    favorites() {
      return listRows(`SELECT ${LIST_COLUMNS} FROM notes WHERE ${VISIBLE} AND is_favorite = 1 ORDER BY title COLLATE NOCASE, id`);
    },

    findByImportKey(key) {
      const row = db.select().from(notes).where(eq(notes.importKey, key)).orderBy(notes.createdAt).get();
      return row ? toDetail(row) : undefined;
    },

    setImportKey(id, key) {
      getRow(id);
      db.update(notes).set({ importKey: key }).where(eq(notes.id, id)).run();
    },

    async createAttachmentFromFile(input) {
      return attachments.toDto(await attachments.saveFile(input));
    },

    async deleteAttachment(id) {
      attachments.get(id);
      const users = referencesTo(id);
      if (users.length > 0) {
        // Duplicated pages share their pictures, so "I removed it from this page" is
        // not enough to know the file is unused.
        throw conflict("This file is still used on a page. Remove it from the page first.", { noteIds: users });
      }
      await attachments.remove(id);
    },
  };

  return service;
}
