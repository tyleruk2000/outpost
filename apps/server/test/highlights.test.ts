/**
 * Highlights and margin notes: kept in the database only (the file is untouched),
 * listed per document, found by search, copied into a page of Notes with a link back,
 * and gone with their document.
 */
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: responses are read loosely in tests, as in helpers.ts
type Json = Record<string, any>;

const MARKDOWN = "# Water\n\nBoil water for one minute to make it safe to drink. At altitude, boil it for three minutes.\n";

describe("highlights", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(() => app.close());

  async function addDocument(name: string, content: string): Promise<Json> {
    const { payload, headers } = multipart({}, [{ name, content }]);
    const response = await app.api("POST", "/api/documents", payload, { headers });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    await app.ctx.jobs.whenIdle();
    return response.body.results[0].document;
  }
  const fileOf = (document: Json) => {
    const row = app.ctx.sqlite
      .prepare("SELECT location_id AS locationId, rel_path AS relPath FROM documents WHERE id = ?")
      .get(document.id) as Json;
    return app.ctx.services.storage.resolve(row.locationId, row.relPath);
  };

  it("marks a passage with a note, lists it, edits it and removes it, leaving the file untouched", async () => {
    const document = await addDocument("water.md", MARKDOWN);
    const file = fileOf(document);
    const before = fs.readFileSync(file);

    const created = await app.api("POST", `/api/documents/${document.id}/highlights`, {
      exact: "boil it for  three\nminutes",
      prefix: "At altitude, ",
      suffix: ".",
      note: "Above 2,000 m",
      page: 4,
    });
    expect(created.status).toBe(200);
    const highlight = created.body.highlight;
    // Spaces are made single; a page is kept only for a PDF.
    expect(highlight).toMatchObject({ exact: "boil it for three minutes", note: "Above 2,000 m", page: null, chapter: null });
    expect(highlight.url).toBe(`/library/documents/${document.id}?highlight=${highlight.id}`);

    const listed = (await app.api("GET", `/api/documents/${document.id}/highlights`)).body.highlights;
    expect(listed.map((entry: Json) => entry.id)).toEqual([highlight.id]);

    const edited = await app.api("PATCH", `/api/highlights/${highlight.id}`, { note: "Above 2,000 metres" });
    expect(edited.body.highlight.note).toBe("Above 2,000 metres");

    expect(fs.readFileSync(file).equals(before)).toBe(true);

    await app.api("DELETE", `/api/highlights/${highlight.id}`);
    expect((await app.api("GET", `/api/documents/${document.id}/highlights`)).body.highlights).toEqual([]);
  });

  it("keeps one highlight for the same passage marked twice", async () => {
    const document = await addDocument("water.md", MARKDOWN);
    const body = { exact: "Boil water", prefix: "", suffix: " for one minute" };
    const first = (await app.api("POST", `/api/documents/${document.id}/highlights`, body)).body.highlight;
    const second = (await app.api("POST", `/api/documents/${document.id}/highlights`, { ...body, note: "kettle rule" })).body.highlight;
    expect(second.id).toBe(first.id);
    expect(second.note).toBe("kettle rule");
    expect((await app.api("GET", `/api/documents/${document.id}/highlights`)).body.highlights).toHaveLength(1);
  });

  it("refuses an empty selection and a document that cannot be marked", async () => {
    const document = await addDocument("water.md", MARKDOWN);
    expect((await app.api("POST", `/api/documents/${document.id}/highlights`, { exact: "   " })).status).toBe(400);
    const text = await addDocument("plain.txt", "Plain words.");
    const refused = await app.api("POST", `/api/documents/${text.id}/highlights`, { exact: "Plain" });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toMatch(/PDFs, EPUB books and Markdown/);
  });

  it("is found by its words and its note, in the list and in search", async () => {
    const document = await addDocument("water.md", MARKDOWN);
    await app.api("POST", `/api/documents/${document.id}/highlights`, { exact: "Boil water for one minute", note: "kettle rule" });

    const found = (await app.api("GET", "/api/highlights?q=kettle")).body.highlights;
    expect(found).toHaveLength(1);
    expect(found[0].documentTitle).toBe("Water");
    expect((await app.api("GET", "/api/highlights?q=nothing-like-it")).body.highlights).toEqual([]);

    const results = (await app.api("GET", "/api/search?q=kettle&kinds=highlight")).body.results;
    expect(results.map((result: Json) => result.kind)).toEqual(["highlight"]);
    expect(results[0].url).toMatch(/\?highlight=/);
  });

  it("copies a document's highlights into a page of Notes with links back", async () => {
    const document = await addDocument("water.md", MARKDOWN);
    const one = (
      await app.api("POST", `/api/documents/${document.id}/highlights`, { exact: "Boil water for one minute", note: "kettle rule" })
    ).body.highlight;
    await app.api("POST", `/api/documents/${document.id}/highlights`, { exact: "boil it for three minutes" });

    const copied = await app.api("POST", `/api/documents/${document.id}/highlights/to-notes`, {});
    expect(copied.status).toBe(200);
    const page = (await app.api("GET", `/api/notes/${copied.body.note.id}`)).body.note;
    expect(page.title).toBe("Highlights from Water");
    const json = JSON.stringify(page.content);
    expect(json).toContain("Boil water for one minute");
    expect(json).toContain("kettle rule");
    expect(json).toContain(`/library/documents/${document.id}?highlight=${one.id}`);
    // The link back makes the page a backlink of the document.
    const links = app.ctx.sqlite
      .prepare("SELECT target_id AS id FROM note_links WHERE source_id = ? AND target_kind = 'document'")
      .all(page.id) as Json[];
    expect(links.map((link) => link.id)).toContain(document.id);
  });

  it("goes with its document, from the list and from search", async () => {
    const document = await addDocument("water.md", MARKDOWN);
    await app.api("POST", `/api/documents/${document.id}/highlights`, { exact: "Boil water", note: "kettle rule" });
    expect((await app.api("DELETE", `/api/documents/${document.id}`)).status).toBe(200);
    expect((await app.api("GET", "/api/highlights")).body.highlights).toEqual([]);
    expect((await app.api("GET", "/api/search?q=kettle&kinds=highlight")).body.results).toEqual([]);
  });
});
