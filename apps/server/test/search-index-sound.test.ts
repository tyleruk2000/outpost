/**
 * The search index stays sound through the saves that erase as they go (an encrypted
 * page). Those saves turn on the index's own erasing ("secure-delete") for the save. In
 * SQLite 3.54, a passage erased that way after it had been put back in the index in place
 * (deleted and put in again under the same number, as an UPDATE of its title or tags did)
 * leaves the index broken: "Did you mean" then read "database disk image is malformed"
 * from its word list. So passages are never put back under the same number.
 */
import fs from "node:fs";
import path from "node:path";
import { encryptedNoteDoc } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSuggester } from "../src/modules/search/suggest.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: responses are read loosely in tests, as in helpers.ts
type Json = Record<string, any>;

const ARMOR = fs.readFileSync(path.join(import.meta.dirname, "fixtures/pgp/message-symmetric.asc"), "utf8").trim();
const p = (value: string) => ({ type: "paragraph", content: [{ type: "text", text: value }] });
const h = (value: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: value }] });
const doc = (...content: Json[]) => ({ type: "doc", content });

const WORDS = ["water", "battery", "padlock", "windowsill", "paraffin", "combination", "warden", "bothy", "kettle", "torch"];
const sentence = (seed: number, length: number) =>
  Array.from({ length }, (_, index) => `${WORDS[(seed * 7 + index) % WORDS.length]}${index % 5 === 0 ? seed : ""}`).join(" ");
/** Each word with its third letter left out, so that "Did you mean" reads the word list. */
const SLIPS = WORDS.map((word) => `${word.slice(0, 2)}${word.slice(3)}`);

describe("the search index after erasing saves", () => {
  let app: TestApp;
  let suggester: ReturnType<typeof createSuggester>;
  beforeEach(async () => {
    app = await createTestApp();
    // As the running server has one: its statement made at its first use and kept.
    suggester = createSuggester(app.ctx.sqlite, (error) => {
      throw error;
    });
  });
  afterEach(() => app.close());

  const create = async (body: Json): Promise<Json> => (await app.api("POST", "/api/notes", body)).body.note;
  const get = async (id: string): Promise<Json> => (await app.api("GET", `/api/notes/${id}`)).body.note;
  const patch = async (id: string, body: Json) => {
    const note = await get(id);
    const response = await app.api("PATCH", `/api/notes/${id}`, { baseUpdatedAt: note.updatedAt, ...body });
    expect(response.status).toBe(200);
  };

  /** SQLite's checks of both indexes against the passages they index, and every word of the word list read. */
  const expectSound = () => {
    const { sqlite } = app.ctx;
    for (const index of ["chunks_fts", "chunks_words"]) {
      sqlite.prepare(`INSERT INTO ${index}(${index}, rank) VALUES('integrity-check', 1)`).run();
    }
    for (const slip of SLIPS) suggester.nearest(slip, 0);
  };

  /** What a person does with a page: retitles it, tags it, edits it. Each leaves its passages' words the same or changes them. */
  const ordinaryEdits = async (id: string, round: number) => {
    await patch(id, { title: `Hut ${round} renamed` });
    await patch(id, { tags: [`shelf-${round}`] });
    await patch(id, { content: doc(h(`Shelf ${round}`), p(sentence(round + 3, 300))) });
    await patch(id, { tags: [`shelf-${round}`, "huts"] });
  };

  it("stays sound when pages edited in the ordinary way are encrypted", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 30; index += 1) {
      const note = await create({
        title: `Hut ${index}`,
        content: doc(h(`Shelf ${index}`), p(sentence(index, 400)), p(sentence(index + 1, 300))),
      });
      ids.push(note.id);
    }
    expectSound();
    for (const [round, id] of [ids[3]!, ids[17]!, ids[29]!].entries()) {
      await ordinaryEdits(id, round);
      expectSound();
      await patch(id, { content: encryptedNoteDoc(ARMOR) });
      expectSound();
      for (const slip of SLIPS) expect((await app.api("GET", `/api/search?q=${slip}`)).status).toBe(200);
    }
    // The pages encrypted are still found by their titles, and the others by their words.
    expect((await app.api("GET", "/api/search?kinds=note&q=renamed")).body.results).toHaveLength(3);
    expect((await app.api("GET", "/api/search?kinds=note&q=kettle&limit=50")).body.results.length).toBeGreaterThan(20);
  });

  it("refuses to change a passage's indexed text in place", async () => {
    await create({ title: "Hut", content: doc(p("kettle")) });
    const { sqlite } = app.ctx;
    expect(() => sqlite.prepare("UPDATE chunks SET title = 'Bothy'").run()).toThrow(/not changed in place/);
    expect(() => sqlite.prepare("UPDATE chunks SET tags = 'huts'").run()).toThrow(/not changed in place/);
  });

  it("keeps a passage's vectors when only the item's title or tags change", async () => {
    const note = await create({ title: "Hut", content: doc(p(sentence(1, 200))) });
    const { sqlite } = app.ctx;
    const passages = () =>
      sqlite
        .prepare(
          "SELECT c.id, c.text FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id WHERE e.entity_id = ? ORDER BY c.ordinal",
        )
        .all(note.id) as Array<{ id: number; text: string }>;
    const before = passages();
    sqlite.prepare("INSERT INTO embedding_models (id, provider, model, dimensions, created_at) VALUES ('m', 'test', 'test', 2, 0)").run();
    for (const passage of before) {
      sqlite
        .prepare("INSERT INTO embeddings (chunk_id, model_id, vector, content_hash, created_at) VALUES (?, 'm', ?, 'h', 0)")
        .run(passage.id, Buffer.from(new Float32Array([passage.id, 1]).buffer));
    }
    await patch(note.id, { title: "Bothy" });
    const after = passages();
    expect(after.map((passage) => passage.text)).toEqual(before.map((passage) => passage.text));
    // New numbers: a passage is never put back in the index under the number it had.
    expect(after.some((passage) => before.some((old) => old.id === passage.id))).toBe(false);
    const vectors = sqlite.prepare("SELECT chunk_id AS chunkId, vector FROM embeddings ORDER BY chunk_id").all() as Array<{
      chunkId: number;
      vector: Buffer;
    }>;
    expect(vectors.map((row) => row.chunkId)).toEqual(after.map((passage) => passage.id));
    // Each vector went with its own passage.
    expect(vectors.map((row) => new Float32Array(new Uint8Array(row.vector).buffer)[0])).toEqual(before.map((passage) => passage.id));
    // Nothing changed, nothing written: the passages keep their numbers.
    await patch(note.id, { title: "Bothy" });
    expect(passages().map((passage) => passage.id)).toEqual(after.map((passage) => passage.id));
  });
});
