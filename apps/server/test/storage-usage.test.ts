/**
 * What Storage says is taking the space: each file counted once, under the name the
 * Library gives it. A book's chapters are the book, not documents; a reference sheet
 * from the catalogue is a document, whose collection record points at it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp({}, undefined, { voacapData: false });
  const location = (app.ctx.sqlite.prepare("SELECT id FROM storage_locations").get() as { id: string }).id;
  const now = Date.now();
  const document = app.ctx.sqlite.prepare(
    "INSERT INTO documents (id, title, original_name, mime, ext, size_bytes, sha256, location_id, rel_path, created_at, updated_at) VALUES (?, ?, ?, 'text/markdown', 'md', ?, 'x', ?, ?, ?, ?)",
  );
  const collection = app.ctx.sqlite.prepare(
    "INSERT INTO collections (id, kind, title, location_id, rel_path, size_bytes, meta, installed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  // Two documents of the person's own.
  document.run("doc-a", "Kit list", "a.md", 100, location, "documents/a/a.md", now, now);
  document.run("doc-b", "Radio bands", "b.md", 200, location, "documents/b/b.md", now, now);
  // A reference sheet from the catalogue: a collection record that is the document doc-b.
  collection.run("sheet", "file", "Radio bands", location, "documents/b/b.md", 200, JSON.stringify({ documentId: "doc-b" }), now, now);
  // A book of three chapters, each held as a document for reading and search.
  collection.run("book", "file", "Handbook", location, "collections/books/h", 3000, JSON.stringify({ book: { chapters: 3 } }), now, now);
  for (const n of [1, 2, 3]) {
    document.run(`ch-${n}`, `Chapter ${n}`, `${n}.md`, 1000, location, `collections/books/h/${n}.md`, now, now);
    app.ctx.sqlite
      .prepare("INSERT INTO book_chapters (collection_id, document_id, key, position) VALUES ('book', ?, ?, ?)")
      .run(`ch-${n}`, String(n), n);
  }
});

afterAll(async () => {
  await app.close();
});

describe("what is taking the space", () => {
  it("counts documents as the Library does, and every byte once", async () => {
    const { body } = await app.api("GET", "/api/storage/locations");
    const usage = body.locations[0].usage;
    expect(usage.byKind.document).toEqual({ count: 2, bytes: 300 });
    expect(usage.byKind.file).toEqual({ count: 1, bytes: 3000 });
    expect(usage.totalBytes).toBe(3300);
  });
});
