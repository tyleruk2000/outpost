/**
 * Earlier versions of a page: kept as it is saved, thinned with age, restored as a new
 * version, measured and cleared, and never plain text for a page that is encrypted.
 */
import fs from "node:fs";
import path from "node:path";
import { encryptedNoteDoc } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNoteVersions, DAY, HOUR } from "../src/modules/notes/versions.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: responses are read loosely in tests, as in helpers.ts
type Json = Record<string, any>;

const ARMOR = fs.readFileSync(path.join(import.meta.dirname, "fixtures/pgp/message-symmetric.asc"), "utf8").trim();
const p = (value: string) => ({ type: "paragraph", content: [{ type: "text", text: value }] });
const doc = (...content: Json[]) => ({ type: "doc", content });

describe("earlier versions of a page", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(() => app.close());

  async function page(words: string): Promise<Json> {
    return (await app.api("POST", "/api/notes", { title: "Diary", content: doc(p(words)) })).body.note;
  }
  async function save(id: string, body: Json): Promise<Json> {
    const response = await app.api("PATCH", `/api/notes/${id}`, body);
    expect(response.status).toBe(200);
    return response.body.note;
  }
  const versions = async (id: string): Promise<Json[]> => (await app.api("GET", `/api/notes/${id}/versions`)).body.versions;

  it("keeps what the page said before each save of its words or title", async () => {
    const note = await page("first");
    const one = await save(note.id, { content: doc(p("second")), baseUpdatedAt: note.updatedAt });
    await save(note.id, { title: "Diary, renamed", baseUpdatedAt: one.updatedAt });
    // Tags and stars are not a change of what the page says.
    await save(note.id, { tags: ["home"], isFavorite: true });

    const list = await versions(note.id);
    expect(list.map((entry) => entry.title)).toEqual(["Diary", "Diary"]);
    expect(list.every((entry) => entry.encrypted === false && entry.sizeBytes > 0)).toBe(true);
    const oldest = (await app.api("GET", `/api/notes/${note.id}/versions/${list[1]!.id}`)).body.version;
    expect(oldest.content.content[0].content[0].text).toBe("first");
    expect(oldest.savedAt).toBe(note.updatedAt);
  });

  it("restores a version as the newest, keeping what the page says now", async () => {
    const note = await page("first");
    const one = await save(note.id, { content: doc(p("second")), baseUpdatedAt: note.updatedAt });
    const [first] = await versions(note.id);

    const restored = await app.api("POST", `/api/notes/${note.id}/versions/${first!.id}/restore`, { baseUpdatedAt: one.updatedAt });
    expect(restored.status).toBe(200);
    const now = (await app.api("GET", `/api/notes/${note.id}`)).body.note;
    expect(now.content.content[0].content[0].text).toBe("first");
    const list = await versions(note.id);
    expect(list).toHaveLength(2);
    const newest = (await app.api("GET", `/api/notes/${note.id}/versions/${list[0]!.id}`)).body.version;
    expect(newest.content.content[0].content[0].text).toBe("second");

    // Restoring over a page that changed since it was shown is refused.
    const stale = await app.api("POST", `/api/notes/${note.id}/versions/${first!.id}/restore`, { baseUpdatedAt: one.updatedAt });
    expect(stale.status).toBe(409);
  });

  it("thins versions with age: every save for an hour, then hourly, then daily", () => {
    const store = createNoteVersions(app.ctx);
    const noteId = app.ctx.services.notes.create({ title: "Log" }).id;
    const now = 100 * DAY;
    const times = [
      // Three in one hour a few hours ago: the last of them stays.
      now - 5 * HOUR - 50 * 60_000,
      now - 5 * HOUR - 30 * 60_000,
      now - 5 * HOUR - 10 * 60_000,
      // Two on one day last week: the last of them stays.
      now - 7 * DAY + HOUR,
      now - 7 * DAY + 2 * HOUR,
      // Every one in the last hour stays.
      now - 40 * 60_000,
      now - 20 * 60_000,
      now - 60_000,
    ];
    for (const updatedAt of times) store.keep({ id: noteId, title: "Log", content: doc(p(String(updatedAt))), updatedAt }, now);
    const kept = store
      .list(noteId)
      .map((entry) => entry.savedAt)
      .sort((a, b) => a - b);
    expect(kept).toEqual([now - 7 * DAY + 2 * HOUR, now - 5 * HOUR - 10 * 60_000, now - 40 * 60_000, now - 20 * 60_000, now - 60_000]);
  });

  it("states the space taken and clears it", async () => {
    const note = await page("first");
    await save(note.id, { content: doc(p("second")), baseUpdatedAt: note.updatedAt });
    const space = (await app.api("GET", "/api/notes/versions/space")).body;
    expect(space).toMatchObject({ versions: 1, pages: 1 });
    expect(space.bytes).toBeGreaterThan(0);

    const cleared = await app.api("DELETE", "/api/notes/versions");
    expect(cleared.body).toEqual({ cleared: 1 });
    expect((await app.api("GET", "/api/notes/versions/space")).body).toEqual({ versions: 0, pages: 0, bytes: 0 });
    // The page itself is untouched.
    expect((await app.api("GET", `/api/notes/${note.id}`)).body.note.content.content[0].content[0].text).toBe("second");
  });

  it("keeps only ciphertext versions of an encrypted page", async () => {
    const note = await page("my secret plans");
    const one = await save(note.id, { content: doc(p("my secret plans, revised")), baseUpdatedAt: note.updatedAt });
    expect(await versions(note.id)).toHaveLength(1);

    // Encrypting erases every plain version, and does not keep the plain text it replaces.
    const locked = await save(note.id, { content: encryptedNoteDoc(ARMOR), baseUpdatedAt: one.updatedAt });
    expect(await versions(note.id)).toEqual([]);
    const plain = app.ctx.sqlite.prepare("SELECT count(*) AS n FROM note_versions WHERE content LIKE '%secret%'").get() as Json;
    expect(plain.n).toBe(0);

    // A change of title keeps the ciphertext as it was.
    await save(note.id, { title: "Locked diary", baseUpdatedAt: locked.updatedAt });
    const list = await versions(note.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.encrypted).toBe(true);
  });

  it("removes a page's versions with the page", async () => {
    const note = await page("first");
    await save(note.id, { content: doc(p("second")), baseUpdatedAt: note.updatedAt });
    await app.api("DELETE", `/api/notes/${note.id}`);
    await app.api("DELETE", `/api/notes/${note.id}?permanent=1`);
    expect((await app.api("GET", "/api/notes/versions/space")).body.versions).toBe(0);
  });
});
