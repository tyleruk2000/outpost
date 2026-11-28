/**
 * Encrypted pages, from the server's side. The server cannot encrypt or decrypt; what
 * it owes an encrypted page is to keep its old text out of everything derived from
 * content, and never to let ciphertext and plain text replace each other by accident.
 * The message here was written by `gpg -c` (GnuPG 2.5.18).
 */
import fs from "node:fs";
import path from "node:path";
import { ENCRYPTED_NOTE_LANGUAGE, encryptedNoteArmor, encryptedNoteDoc, isArmoredMessage } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: responses are read loosely in tests, as in helpers.ts
type Json = Record<string, any>;

const ARMOR = fs.readFileSync(path.join(import.meta.dirname, "fixtures/pgp/message-symmetric.asc"), "utf8").trim();
const text = (value: string) => ({ type: "text", text: value });
const p = (value: string) => ({ type: "paragraph", content: [text(value)] });
const h = (value: string) => ({ type: "heading", attrs: { level: 2 }, content: [text(value)] });
const doc = (...content: Json[]) => ({ type: "doc", content });

describe("what counts as an encrypted page", () => {
  it("recognises one armoured message in one code block and nothing else", () => {
    expect(isArmoredMessage(ARMOR)).toBe(true);
    expect(encryptedNoteArmor(encryptedNoteDoc(ARMOR))).toBe(ARMOR);
    expect(encryptedNoteArmor(doc(p("hello")))).toBeNull();
    expect(encryptedNoteArmor(null)).toBeNull();
    expect(encryptedNoteArmor("text")).toBeNull();
    // The block and a line after it: a page that quotes a message is an ordinary page.
    expect(encryptedNoteArmor(doc(...encryptedNoteDoc(ARMOR).content, p("see above")))).toBeNull();
    // The right language around something that is not a message.
    expect(
      encryptedNoteArmor(
        doc({ type: "codeBlock", attrs: { language: ENCRYPTED_NOTE_LANGUAGE }, content: [text("my diary, in the clear")] }),
      ),
    ).toBeNull();
    // A message in a block of another language.
    expect(encryptedNoteArmor(doc({ type: "codeBlock", attrs: { language: "text" }, content: [text(ARMOR)] }))).toBeNull();
  });

  it("is strict about the form of the armour", () => {
    expect(isArmoredMessage(ARMOR.replace("-----END PGP MESSAGE-----", ""))).toBe(false);
    expect(isArmoredMessage(`note to self\n${ARMOR}`)).toBe(false);
    expect(isArmoredMessage(`${ARMOR}\nand the password is hunter2`)).toBe(false);
    expect(isArmoredMessage(ARMOR.replace("PGP MESSAGE", "PGP PRIVATE KEY BLOCK"))).toBe(false);
    expect(isArmoredMessage("-----BEGIN PGP MESSAGE-----\n\nplain words here\n-----END PGP MESSAGE-----")).toBe(false);
    expect(isArmoredMessage(ARMOR.replace(/\n/g, "\r\n"))).toBe(true);
  });
});

describe("encrypted pages", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(() => app.close());

  const create = async (body: Json): Promise<Json> => (await app.api("POST", "/api/notes", body)).body.note;
  const get = async (id: string): Promise<Json> => (await app.api("GET", `/api/notes/${id}`)).body.note;
  const row = (id: string) =>
    app.ctx.sqlite
      .prepare("SELECT content, content_text AS contentText, content_hash AS contentHash FROM notes WHERE id = ?")
      .get(id) as Json;
  const searchIds = async (q: string) =>
    (await app.api("GET", `/api/search?kinds=note&q=${encodeURIComponent(q)}`)).body.results.map((result: Json) => result.entityId);
  const passages = (id: string) =>
    app.ctx.sqlite
      .prepare(
        "SELECT c.id AS id, c.text AS text, c.heading AS heading FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id WHERE e.kind = 'note' AND e.entity_id = ?",
      )
      .all(id) as Array<{ id: number; text: string; heading: string }>;

  /** Whether the full-text index is set to erase what is deleted from it, which it should only be during a scrubbing save. */
  const indexErases = () => {
    const setting = app.ctx.sqlite.prepare("SELECT v FROM chunks_fts_config WHERE k = 'secure-delete'").get() as { v: number } | undefined;
    return (setting?.v ?? 0) !== 0;
  };

  async function plainPage(): Promise<Json> {
    return create({
      title: "Bothy combination",
      content: doc(
        h("Padlock"),
        p("The combination is seven four one nine, kept under the windowsill."),
        p("Ask the warden about paraffin."),
      ),
    });
  }
  const encrypt = (note: Json, extra: Json = {}) =>
    app.api("PATCH", `/api/notes/${note.id}`, { content: encryptedNoteDoc(ARMOR), baseUpdatedAt: note.updatedAt, ...extra });

  it("says whether a page is encrypted", async () => {
    const note = await plainPage();
    expect(note.encrypted).toBe(false);
    expect((await encrypt(note)).status).toBe(200);
    const after = await get(note.id);
    expect(after.encrypted).toBe(true);
    expect(encryptedNoteArmor(after.content)).toBe(ARMOR);
    expect(after.title).toBe("Bothy combination");
  });

  it("drops the old text from the page, its preview text and the search index, and keeps the title findable", async () => {
    const note = await plainPage();
    await app.api("PATCH", `/api/notes/${note.id}`, { tags: ["huts"] });
    expect(await searchIds("windowsill")).toEqual([note.id]);
    expect(await searchIds("padlock")).toEqual([note.id]);
    expect(passages(note.id).some((passage) => passage.text.includes("windowsill"))).toBe(true);

    const current = await get(note.id);
    expect((await encrypt(current)).status).toBe(200);

    expect(await searchIds("windowsill")).toEqual([]);
    expect(await searchIds("padlock")).toEqual([]);
    expect(await searchIds("paraffin")).toEqual([]);
    expect(await searchIds("bothy")).toEqual([note.id]);
    expect(await searchIds("huts")).toEqual([note.id]);
    // One passage is left, holding no text at all: neither the old words nor the ciphertext.
    expect(passages(note.id)).toEqual([expect.objectContaining({ text: "", heading: "" })]);
    const stored = row(note.id);
    expect(stored.contentText).toBe("");
    expect(stored.content).not.toContain("windowsill");
    // Nothing in the index's own tables still holds a word of it.
    const fts = app.ctx.sqlite
      .prepare("SELECT count(*) AS n FROM chunks WHERE text LIKE '%windowsill%' OR heading LIKE '%Padlock%'")
      .get() as { n: number };
    expect(fts.n).toBe(0);
  });

  it("drops the vectors made from the old text", async () => {
    const note = await plainPage();
    const { sqlite } = app.ctx;
    const before = passages(note.id);
    expect(before.length).toBeGreaterThan(0);
    // Stand in for an index by meaning: one vector per passage, as the semantic module stores them.
    sqlite.prepare("INSERT INTO embedding_models (id, provider, model, dimensions, created_at) VALUES ('m', 'test', 'test', 2, 0)").run();
    for (const passage of before) {
      sqlite
        .prepare("INSERT INTO embeddings (chunk_id, model_id, vector, content_hash, created_at) VALUES (?, 'm', ?, 'h', 0)")
        .run(passage.id, Buffer.alloc(8));
    }
    expect((sqlite.prepare("SELECT count(*) AS n FROM embeddings").get() as { n: number }).n).toBe(before.length);
    expect((await encrypt(note)).status).toBe(200);
    expect((sqlite.prepare("SELECT count(*) AS n FROM embeddings").get() as { n: number }).n).toBe(0);
  });

  it("erases the text it replaces from the database file, its log and the index's own tables", async () => {
    const filler = Array.from({ length: 300 }, (_, index) => `An ordinary sentence, number ${index}, about nothing at all.`).join(" ");
    // Other pages before and after, so that the index has passages of its own that must survive.
    for (let index = 0; index < 12; index += 1) await create({ title: `Other ${index}`, content: doc(p(`${filler} Page ${index}.`)) });
    const note = await create({ title: "Combination", content: doc(p(`The zyxquorvate word and the flimbertwist phrase. ${filler}`)) });
    for (let index = 0; index < 6; index += 1) await create({ title: `Later ${index}`, content: doc(p(`${filler} Later ${index}.`)) });

    const files = ["outpost.db", "outpost.db-wal"].map((name) => path.join(app.dir, "data", name));
    /** True when any of the database's files holds the bytes of `word`. */
    const onDisk = (word: string) => files.some((file) => fs.existsSync(file) && fs.readFileSync(file).includes(word));
    expect(onDisk("zyxquorvate")).toBe(true);
    expect(onDisk("flimbertwist")).toBe(true);

    expect((await encrypt(note)).status).toBe(200);

    // Neither the words nor the stems the index made of them ("zyxquorv", "flimbertwist") are anywhere in the files.
    for (const word of ["zyxquorvate", "zyxquorv", "flimbertwist", "flimbertw"]) expect(onDisk(word), word).toBe(false);
    // The settings it changed to do that are back as they were, the database is sound, and other pages are still found.
    const { sqlite } = app.ctx;
    expect(sqlite.pragma("secure_delete", { simple: true })).toBe(0);
    expect(indexErases()).toBe(false);
    expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    // Checked against the passages too (rank 1): without it, an index out of step with them passes.
    for (const index of ["chunks_fts", "chunks_words"])
      sqlite.prepare(`INSERT INTO ${index}(${index}, rank) VALUES('integrity-check', 1)`).run();
    expect((await searchIds("ordinary sentence")).length).toBeGreaterThan(10);
    expect(await searchIds("combination")).toEqual([note.id]);
  });

  it("puts the erasing settings back even when the save is refused", async () => {
    const note = await plainPage();
    await app.api("PATCH", `/api/notes/${note.id}`, { content: doc(p("A newer version.")) });
    expect((await encrypt(note)).status).toBe(409);
    expect(app.ctx.sqlite.pragma("secure_delete", { simple: true })).toBe(0);
    expect(indexErases()).toBe(false);
  });

  it("forgets the links the page made, since nobody can see them now", async () => {
    const target = await create({ title: "Warden" });
    const note = await create({
      title: "Hut notes",
      content: doc({ type: "paragraph", content: [{ type: "pageLink", attrs: { noteId: target.id, label: "Warden" } }] }),
    });
    expect((await get(target.id)).backlinks.map((link: Json) => link.id)).toEqual([note.id]);
    expect((await encrypt(note)).status).toBe(200);
    expect((await get(target.id)).backlinks).toEqual([]);
  });

  it("only encrypts on top of the version it was made from", async () => {
    const note = await plainPage();
    const without = await app.api("PATCH", `/api/notes/${note.id}`, { content: encryptedNoteDoc(ARMOR) });
    expect(without.status).toBe(400);
    expect((await get(note.id)).encrypted).toBe(false);

    // Someone else changes the page after this copy was read.
    await app.api("PATCH", `/api/notes/${note.id}`, { content: doc(p("A newer version.")) });
    const stale = await encrypt(note);
    expect(stale.status).toBe(409);
    expect(JSON.stringify((await get(note.id)).content)).toContain("A newer version.");
  });

  it("refuses to put plain text over an encrypted page unless the save says that is the point", async () => {
    const note = await plainPage();
    await encrypt(note);
    const encrypted = await get(note.id);

    // An editor left open from before, saving without a base version.
    const blind = await app.api("PATCH", `/api/notes/${note.id}`, { content: doc(p("old text from a stale tab")) });
    expect(blind.status).toBe(400);
    // The same with the base version of the encrypted page but without saying so.
    const unsaid = await app.api("PATCH", `/api/notes/${note.id}`, { content: doc(p("old text")), baseUpdatedAt: encrypted.updatedAt });
    expect(unsaid.status).toBe(409);
    expect(unsaid.body.error.message).toMatch(/encrypted/);
    // With an older base version, the ordinary conflict.
    const older = await app.api("PATCH", `/api/notes/${note.id}`, {
      content: doc(p("old text")),
      baseUpdatedAt: note.updatedAt,
      removeEncryption: true,
    });
    expect(older.status).toBe(409);
    expect(encryptedNoteArmor((await get(note.id)).content)).toBe(ARMOR);

    const removed = await app.api("PATCH", `/api/notes/${note.id}`, {
      content: doc(p("Readable again.")),
      baseUpdatedAt: encrypted.updatedAt,
      removeEncryption: true,
    });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const after = await get(note.id);
    expect(after.encrypted).toBe(false);
    expect(await searchIds("readable")).toEqual([note.id]);
  });

  it("lets the title, tags and favourite mark of an encrypted page change without touching the message", async () => {
    const note = await plainPage();
    await encrypt(note);
    const renamed = await app.api("PATCH", `/api/notes/${note.id}`, { title: "Hut", tags: ["keys"], isFavorite: true });
    expect(renamed.status).toBe(200);
    const after = await get(note.id);
    expect(after).toMatchObject({ title: "Hut", tags: ["keys"], isFavorite: true, encrypted: true });
    expect(encryptedNoteArmor(after.content)).toBe(ARMOR);
  });

  it("replaces one message with another on top of the version it was read from", async () => {
    const note = await plainPage();
    await encrypt(note);
    const encrypted = await get(note.id);
    const other = ARMOR.replace("\n\n", "\nComment: saved again\n\n");
    expect(isArmoredMessage(other)).toBe(true);
    expect((await app.api("PATCH", `/api/notes/${note.id}`, { content: encryptedNoteDoc(other) })).status).toBe(400);
    const saved = await app.api("PATCH", `/api/notes/${note.id}`, { content: encryptedNoteDoc(other), baseUpdatedAt: encrypted.updatedAt });
    expect(saved.status).toBe(200);
    expect(encryptedNoteArmor((await get(note.id)).content)).toBe(other);
    expect(row(note.id).contentHash).not.toBe("");
  });

  it("keeps templates in the clear", async () => {
    const note = await plainPage();
    await app.api("PATCH", `/api/notes/${note.id}`, { isTemplate: true });
    const template = await get(note.id);
    expect((await encrypt(template)).status).toBe(400);

    const other = await plainPage();
    await encrypt(other);
    const made = await app.api("PATCH", `/api/notes/${other.id}`, { isTemplate: true });
    expect(made.status).toBe(409);
    expect(
      (await app.api("GET", "/api/notes/templates")).body.templates.every((item: Json) => !item.description.includes("BEGIN PGP")),
    ).toBe(true);
  });

  it("stays ciphertext through the trash, a duplicate and a Markdown export", async () => {
    const note = await plainPage();
    await encrypt(note);

    const copy = (await app.api("POST", `/api/notes/${note.id}/duplicate`, {})).body.note;
    expect(copy.encrypted).toBe(true);
    expect(await searchIds("windowsill")).toEqual([]);

    await app.api("DELETE", `/api/notes/${note.id}`);
    const restored = (await app.api("POST", `/api/notes/${note.id}/restore`)).body.note;
    expect(restored.encrypted).toBe(true);
    expect(passages(note.id)).toEqual([expect.objectContaining({ text: "" })]);

    const exported = await app.api("GET", `/api/notes/${note.id}/export.md`);
    expect(exported.status).toBe(200);
    expect(exported.body).toContain("```pgp-message");
    expect(exported.body).toContain("-----BEGIN PGP MESSAGE-----");
    expect(exported.body).not.toContain("windowsill");
  });

  it("comes back as an encrypted page when its Markdown export is read as a page", async () => {
    const note = await plainPage();
    await encrypt(note);
    const exported = (await app.api("GET", `/api/notes/${note.id}/export.md`)).body as string;
    const body = exported.replace(/^---[\s\S]*?---\n/, "").replace(/^# .*\n/, "");
    const reread = app.ctx.services.notes.content.markdownToDoc(body);
    expect(encryptedNoteArmor(reread.doc ?? reread)).toBe(ARMOR);
  });
});
