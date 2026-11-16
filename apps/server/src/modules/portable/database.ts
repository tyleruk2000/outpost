/**
 * Turns a copy of this installation's database into the database of a portable drive.
 *
 * The copy keeps all notes, tags, saved places, settings and the search index. It is
 * then narrowed to what actually travels on the drive: one storage location (the
 * drive's own library folder) and only the collections and documents that were chosen.
 * Machine-specific state (job and download history) is cleared, and so are conversations
 * with a language model: a drive is made to be handed on, and they are not part of the library.
 *
 * Last, the copy records what everything in it is at this moment (see
 * modules/merge/fingerprint.ts). When the drive comes home, that record is how Outpost
 * tells what was changed on the drive from what was changed at home.
 */
import Database from "better-sqlite3";
import { writeBaseline } from "../merge/fingerprint.ts";

export interface DriveContents {
  /** Identity of the drive's library folder (its marker id). */
  locationId: string;
  locationName: string;
  /** Absolute path of the library folder as seen while writing; corrected by the marker on first start. */
  locationPath: string;
  collectionIds: string[];
  /** Ids of documents whose files are on the drive. */
  documentIds: string[];
  /** Identity of the library the drive is written from; see `MergeService.libraryId`. */
  madeFrom: string;
}

export function prepareDriveDatabase(file: string, contents: DriveContents): { collections: number; documents: number; notes: number } {
  const db = new Database(file);
  try {
    db.pragma("journal_mode = DELETE");
    db.pragma("foreign_keys = ON");
    const now = Date.now();

    const apply = db.transaction(() => {
      db.exec("CREATE TEMP TABLE keep_collections (id TEXT PRIMARY KEY); CREATE TEMP TABLE keep_documents (id TEXT PRIMARY KEY);");
      const keepCollection = db.prepare("INSERT OR IGNORE INTO keep_collections VALUES (?)");
      for (const id of contents.collectionIds) keepCollection.run(id);
      const keepDocument = db.prepare("INSERT OR IGNORE INTO keep_documents VALUES (?)");
      for (const id of contents.documentIds) keepDocument.run(id);

      // Search entries first: deleting them cascades to passages and their vectors,
      // and the triggers keep the full-text index in step.
      db.exec(`
        DELETE FROM search_entities WHERE kind = 'document' AND entity_id NOT IN (SELECT id FROM keep_documents);
        DELETE FROM search_entities WHERE kind = 'collection' AND entity_id NOT IN (SELECT id FROM keep_collections);
        DELETE FROM documents WHERE id NOT IN (SELECT id FROM keep_documents);
        DELETE FROM places WHERE collection_id NOT IN (SELECT id FROM keep_collections);
        DELETE FROM collections WHERE id NOT IN (SELECT id FROM keep_collections);
        DELETE FROM downloads;
        DELETE FROM jobs;
        DELETE FROM imports;
        DELETE FROM network_shares;
        DELETE FROM drive_merges;
        DELETE FROM chat_conversations;
      `);

      // Everything that remains lives in the drive's one location, at the same relative paths.
      db.exec("PRAGMA defer_foreign_keys = ON");
      db.prepare("UPDATE collections SET location_id = ?, status = 'installed', updated_at = ?").run(contents.locationId, now);
      db.prepare("UPDATE documents SET location_id = ?").run(contents.locationId);
      db.exec("DELETE FROM storage_locations");
      db.prepare(
        `INSERT INTO storage_locations (id, name, path, kind, is_default, status, created_at, updated_at)
         VALUES (?, ?, ?, 'external', 1, 'available', ?, ?)`,
      ).run(contents.locationId, contents.locationName, contents.locationPath, now, now);
      writeBaseline(db, { madeFrom: contents.madeFrom, writtenAt: now });
    });
    apply();

    const count = (table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    const summary = { collections: count("collections"), documents: count("documents"), notes: count("notes") };
    db.exec("VACUUM");
    return summary;
  } finally {
    db.close();
  }
}
