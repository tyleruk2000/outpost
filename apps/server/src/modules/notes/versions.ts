/**
 * Earlier versions of a page: what it said before each save that changed its title or
 * its content.
 *
 * Every save is kept for an hour. After that, only the last save of each hour is kept,
 * and after a day only the last of each day. Thinning happens as the page is saved
 * again, so a page nobody touches keeps what it had.
 *
 * An encrypted page keeps no plain text: when a page is encrypted, every version of it
 * that is not ciphertext is erased (the caller does this inside `search.scrubbing`, so
 * the freed space is overwritten), and from then on only ciphertext is kept.
 */
import type { NoteDoc, NoteVersionDetail, NoteVersionItem, NoteVersionsSpace } from "@outpost/shared";
import { encryptedNoteArmor } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export interface PageState {
  id: string;
  title: string;
  content: unknown;
  updatedAt: number;
}

export interface NoteVersions {
  /** Keeps `previous` as a version of the page, then thins the page's versions. */
  keep(previous: PageState, now?: number): void;
  /** Erases every version of the page that is not ciphertext. */
  dropPlain(noteId: string): number;
  list(noteId: string): NoteVersionItem[];
  get(noteId: string, versionId: string): NoteVersionDetail;
  space(): NoteVersionsSpace;
  /** Removes every earlier version of every page. Returns how many went. */
  clear(): number;
}

interface VersionRow {
  id: string;
  title: string;
  savedAt: number;
  encrypted: number;
  sizeBytes: number;
}

const COLUMNS = `id, title, saved_at AS savedAt, encrypted, size_bytes AS sizeBytes`;

const toItem = (row: VersionRow): NoteVersionItem => ({
  id: row.id,
  title: row.title,
  savedAt: row.savedAt,
  encrypted: row.encrypted === 1,
  sizeBytes: row.sizeBytes,
});

export function createNoteVersions(ctx: AppContext): NoteVersions {
  const { sqlite } = ctx;

  const insert = sqlite.prepare(
    `INSERT INTO note_versions (id, note_id, title, content, encrypted, saved_at, size_bytes)
     VALUES (@id, @noteId, @title, @content, @encrypted, @savedAt, @sizeBytes)`,
  );
  // Within the last hour each version is its own group; then one group per hour, then
  // per day. The newest of each group stays.
  const thin = sqlite.prepare(
    `DELETE FROM note_versions WHERE id IN (
       SELECT id FROM (
         SELECT id, row_number() OVER (
           PARTITION BY CASE
             WHEN saved_at >= @hourAgo THEN 'v' || id
             WHEN saved_at >= @dayAgo THEN 'h' || (saved_at / ${HOUR})
             ELSE 'd' || (saved_at / ${DAY})
           END
           ORDER BY saved_at DESC, id DESC
         ) AS n
         FROM note_versions WHERE note_id = @noteId
       ) WHERE n > 1
     )`,
  );
  const dropPlainStatement = sqlite.prepare(`DELETE FROM note_versions WHERE note_id = ? AND encrypted = 0`);
  const listStatement = sqlite.prepare(`SELECT ${COLUMNS} FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC, id DESC`);
  const getStatement = sqlite.prepare(`SELECT ${COLUMNS}, content FROM note_versions WHERE note_id = ? AND id = ?`);
  const spaceStatement = sqlite.prepare(
    `SELECT count(*) AS versions, count(DISTINCT note_id) AS pages, coalesce(sum(size_bytes), 0) AS bytes FROM note_versions`,
  );
  const clearStatement = sqlite.prepare(`DELETE FROM note_versions`);

  return {
    keep(previous, now = Date.now()) {
      const content = JSON.stringify(previous.content);
      insert.run({
        id: newId(),
        noteId: previous.id,
        title: previous.title,
        content,
        encrypted: encryptedNoteArmor(previous.content) !== null ? 1 : 0,
        savedAt: previous.updatedAt,
        sizeBytes: Buffer.byteLength(content) + Buffer.byteLength(previous.title),
      });
      thin.run({ noteId: previous.id, hourAgo: now - HOUR, dayAgo: now - DAY });
    },

    dropPlain(noteId) {
      return dropPlainStatement.run(noteId).changes;
    },

    list(noteId) {
      return (listStatement.all(noteId) as VersionRow[]).map(toItem);
    },

    get(noteId, versionId) {
      const row = getStatement.get(noteId, versionId) as (VersionRow & { content: string }) | undefined;
      if (!row) throw notFound("That earlier version");
      return { ...toItem(row), content: JSON.parse(row.content) as NoteDoc };
    },

    space() {
      return spaceStatement.get() as NoteVersionsSpace;
    },

    clear() {
      return clearStatement.run().changes;
    },
  };
}
