/**
 * Books, papers and reference sheets from the catalogue belong in the document library.
 *
 * A reference archive (ZIM) is read through the reader. A PDF, an e-book or a sheet
 * that ships with Outpost is a document: it should be searchable down to the page and
 * open in the viewer like anything a person adds themselves. So when such a file is
 * installed, it is handed to the document library, and the collection record is kept
 * only as the catalogue's note that the item is installed, pointing at the same file.
 *
 * The two records are kept in step: the collection follows the document when it is
 * moved, and goes when the document is deleted; removing the collection with its
 * files removes the document.
 */
import path from "node:path";
import { CATALOG_CATEGORIES } from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { collections as collectionsTable } from "../../db/schema.ts";
import { formatForName } from "../documents/file-types.ts";

/** Catalogue formats that are documents, and the file extension each is known by. */
const DOCUMENT_EXTENSIONS: Record<string, string> = { pdf: "pdf", epub: "epub", html: "html", markdown: "md" };
const DOCUMENT_FORMATS = new Set(Object.keys(DOCUMENT_EXTENSIONS));

/**
 * The name the document library is given for a catalogue file. Usually the file's own.
 * Some publishers serve a book from an address with no file name in it (".../content",
 * ".../4541"), so the downloaded file has no extension and the library could not tell
 * what it is. The catalogue entry says what it is; such a file is named after its
 * title and edition, with the extension of the format the entry states. The library
 * still checks the file's first bytes against that, so a wrong entry is refused, not
 * believed.
 */
export function documentNameFor(fileName: string, entry: { title: string; version?: string | null; format: string }): string {
  try {
    if (formatForName(fileName).type === entry.format) return fileName;
  } catch {
    // No extension, or one the library does not know.
  }
  const ext = DOCUMENT_EXTENSIONS[entry.format];
  const clean = (text: string) =>
    text
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const title = clean(entry.title).slice(0, 120);
  const version = clean(entry.version ?? "").slice(0, 60);
  // A file named exactly as its title looks to the library like one nobody has named,
  // and the title inside the PDF (often a typist's working name) would replace the
  // catalogue's. Without an edition to tell them apart, the file keeps its own name.
  if (!title || !version) return `${clean(fileName) || "document"}.${ext}`;
  return `${title}, ${version}.${ext}`;
}
const labelOf = (slug: string | null) => CATALOG_CATEGORIES.find((category) => category.slug === slug)?.label ?? slug ?? undefined;

export interface DocumentBridge {
  /**
   * Hands an installed catalogue file to the document library and points its collection
   * record at the document. Returns the document's id, or undefined when the collection
   * is not a document or could not be added (which is logged, not thrown).
   */
  adopt(collectionId: string): Promise<string | undefined>;
}

export function registerDocumentBridge(ctx: AppContext): DocumentBridge {
  const { collections, documents, downloads } = ctx.services;
  const documentIdOf = (meta: Record<string, unknown>) => (typeof meta.documentId === "string" ? meta.documentId : undefined);

  function pointAt(collectionId: string, locationId: string, relPath: string, meta: Record<string, unknown>): void {
    // Location and path are not part of an ordinary collection update, by design:
    // moving a collection is a verified job. Here nothing moves; the record is only
    // being told where the document library keeps the same file.
    ctx.db
      .update(collectionsTable)
      .set({ locationId, relPath, meta, status: "installed", updatedAt: Date.now() })
      .where(eq(collectionsTable.id, collectionId))
      .run();
  }

  async function adopt(collectionId: string): Promise<string | undefined> {
    const collection = collections.get(collectionId);
    if (collection?.kind !== "file" || !DOCUMENT_FORMATS.has(String(collection.meta.format))) return undefined;
    const known = documentIdOf(collection.meta);
    if (known) return known;
    try {
      const filePath = collections.absolutePath(collection.id);
      const outcome = await documents.ingestFile({
        sourcePath: filePath,
        originalName: documentNameFor(path.basename(filePath), {
          title: collection.title,
          version: collection.version,
          format: String(collection.meta.format),
        }),
        title: collection.title,
        category: labelOf(collection.category),
        locationId: collection.locationId,
        move: true,
      });
      const document = outcome.document;
      if (outcome.status === "created") {
        await documents.update(document.id, {
          description: collection.description,
          author: collection.publisher,
          source: typeof collection.meta.homepage === "string" ? collection.meta.homepage : collection.publisher,
          language: collection.language,
        });
        pointAt(collection.id, document.locationId, document.relPath, { ...collection.meta, documentId: document.id });
      } else {
        // The same file was already in the library. It stays as it was; the installed
        // copy stays where it was put.
        pointAt(collection.id, collection.locationId, collection.relPath, {
          ...collection.meta,
          documentId: document.id,
          alreadyInLibrary: true,
        });
      }
      ctx.events.publish({ type: "collections.changed" });
      return document.id;
    } catch (error) {
      // The file itself is installed as a collection; it is only not in the document
      // library. Say so in the log rather than fail what installed it.
      ctx.log.warn({ err: error, collection: collection.id }, "a catalogue document could not be added to the document library");
      return undefined;
    }
  }

  downloads.onCompleted(async (download) => {
    if (download.kind !== "file" || !download.collectionId) return;
    await adopt(download.collectionId);
  });

  // Removing the catalogue item with its files removes the document that holds them.
  collections.onRemoved(async (row, options) => {
    const documentId = documentIdOf(row.meta);
    if (!documentId || !options.deleteFiles || row.meta.alreadyInLibrary) return;
    try {
      const document = documents.get(documentId);
      if (document.locationId === row.locationId && document.relPath === row.relPath) await documents.remove(documentId);
    } catch {
      // Already gone.
    }
  });

  // Moving the catalogue item moves the one file both records describe, so the document
  // has to be told. Without this the document would point at a file that has gone, and
  // the next reconcile would point the collection back at it too.
  collections.onMoved(async (row) => {
    const documentId = documentIdOf(row.meta);
    if (!documentId || row.meta.alreadyInLibrary) return;
    await documents.relocate(documentId, row.locationId, row.relPath);
  });

  // Follow the document: where it now lives, and whether it still exists.
  let reconciling = false;
  async function reconcile(): Promise<void> {
    if (reconciling) return;
    reconciling = true;
    try {
      for (const row of collections.list({ kind: "file" })) {
        const documentId = documentIdOf(row.meta);
        if (!documentId || row.meta.alreadyInLibrary) continue;
        let document: ReturnType<typeof documents.get> | undefined;
        try {
          document = documents.get(documentId);
        } catch {
          document = undefined;
        }
        if (!document) {
          // The person deleted the document from the library; the catalogue's note goes with it.
          await collections.remove(row.id, { deleteFiles: false }).catch(() => {});
        } else if (document.locationId !== row.locationId || document.relPath !== row.relPath) {
          pointAt(row.id, document.locationId, document.relPath, row.meta);
        }
      }
    } finally {
      reconciling = false;
    }
  }
  const stop = ctx.events.subscribe((event) => {
    if (event.type === "documents.changed")
      void reconcile().catch((error) => ctx.log.warn({ err: error }, "catalogue documents could not be reconciled"));
  });
  ctx.onClose.push(stop);

  /**
   * Catalogue documents that were installed but never reached the document library
   * (an earlier version could not name a file that came without an extension, or the
   * storage was away at the time) are handed over now. Each is tried once per start.
   */
  async function adoptLeftBehind(): Promise<void> {
    for (const row of collections.list({ kind: "file" })) {
      if (row.status !== "installed" || documentIdOf(row.meta) || !DOCUMENT_FORMATS.has(String(row.meta.format))) continue;
      // A book made of chapters is a folder, and the books module keeps it.
      if (row.meta.book) continue;
      if (!ctx.services.storage.isAvailable(row.locationId)) continue;
      await adopt(row.id);
    }
  }
  // After start-up has finished, and never in its way.
  const later = setTimeout(() => {
    void adoptLeftBehind().catch((error) => ctx.log.warn({ err: error }, "catalogue documents left behind could not be added"));
  }, 0);
  ctx.onClose.push(() => clearTimeout(later));
  return { adopt };
}
