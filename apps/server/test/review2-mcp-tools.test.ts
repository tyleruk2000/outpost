/**
 * The model tools, called the way a model steered by a hostile document might call them:
 * off their main paths, with every argument varied, hunting for something that must
 * never be readable. tools-readonly.test.ts proves the main path of each; this proves the
 * rest.
 */
import fs from "node:fs";
import path from "node:path";
import { encryptedNoteDoc } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Filled, filledServer } from "./fixtures/tools/filled.ts";

let filled: Filled;
const SECRET_PHONE = "07700 900461";
const SECRET_NOTE = "Zebedee keeps the spare key under the third flowerpot";
const ARMOR = fs.readFileSync(path.join(import.meta.dirname, "fixtures/pgp/message-symmetric.asc"), "utf8").trim();
/** A piece of the armour's body, to look for in what the tools say. */
const CIPHER = ARMOR.split("\n")
  .find((line) => line.length > 40)!
  .slice(0, 30);
const DIARY = "the diary says the bothy combination is nine three one";

beforeAll(async () => {
  filled = await filledServer();
  const { app } = filled;
  const contact = await app.api("POST", "/api/contacts", {
    kind: "person",
    name: { prefix: "", given: "Zebedee", additional: "", family: "Quill", suffix: "" },
    phones: [{ value: SECRET_PHONE, label: "Mobile" }],
    note: SECRET_NOTE,
    addresses: [{ label: "", street: "1 Zebedee Lane", locality: "Northampton", region: "", postcode: "NN1 1ZZ", country: "" }],
  });
  expect(contact.status).toBe(200);
  const note = await app.api("POST", "/api/notes", {
    title: "Zebedee's private page",
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: DIARY }] }] },
  });
  expect(note.status).toBeLessThan(300);
  // biome-ignore lint/suspicious/noExplicitAny: read loosely, as in helpers.ts
  const made = ((note.body as any).note ?? note.body) as { id: string; updatedAt: number };
  const encrypted = await app.api("PATCH", `/api/notes/${made.id}`, { content: encryptedNoteDoc(ARMOR), baseUpdatedAt: made.updatedAt });
  expect(encrypted.status, JSON.stringify(encrypted.body)).toBeLessThan(300);
  await app.ctx.jobs.whenIdle();
}, 120_000);
afterAll(async () => {
  await filled?.close();
});

const calls: Array<[string, Record<string, unknown>]> = [
  ["search_library", { query: "Zebedee" }],
  ["search_library", { query: "flowerpot spare key" }],
  ["search_library", { query: SECRET_PHONE }],
  ["search_library", { query: "PGP MESSAGE" }],
  ["search_library", { query: "bothy combination diary" }],
  ["search_library", { query: "water", page: 20 }],
  ["find_places", { query: "Zebedee" }],
  ["find_places", { query: "Zebedee Lane", near: "home", radius_km: 100 }],
  ["find_places", { near: "Zebedee Quill" }],
  ["find_places", { near: "NN1 1ZZ" }],
  ["find_places", {}],
  ["find_places", { kind: "supermarket" }],
  ["find_places", { query: "Tesco" }],
  ["find_places", { kind: "hospital", near: "52.25,-0.88", radius_km: 100, page: 50 }],
  ["nearest_place", { kind: "water", near: "Northampton", count: 10 }],
  ["nearest_place", { kind: "Zebedee", near: "Zebedee" }],
  ["supplies", { query: "rice" }],
  ["supplies", { category: "water", page: 50 }],
  ["emergency_plans", {}],
  ["emergency_plans", { plan: "Zebedee" }],
  ["emergency_plans", { plan: "power cut", page: 2 }],
  ["weather", { what: "forecast" }],
  ["weather", { what: "warnings" }],
  ["weather", { what: "floods" }],
  ["weather", { what: "levels" }],
  ["sun_and_compass", {}],
  ["sun_and_compass", { near: "Northampton", date: "tomorrow" }],
  ["radio_frequencies", {}],
  ["radio_frequencies", { kind: "marine", near: "Zebedee", band: "HF" }],
  ["repeaters_near", { near: "home", band: "2m", page: 20 }],
  ["saved_predictions", { page: 20 }],
  ["search_catalogue", { subject: "Zebedee" }],
  ["search_catalogue", { subject: "wikipedia medicine first aid", page: 20 }],
  ["board_messages", { page: 10 }],
];

const changes = () => (filled.app.ctx.sqlite.prepare("SELECT total_changes() AS n").get() as { n: number }).n;

describe("off the main path", () => {
  it("every tool, with every argument varied, reads only, and never reads a contact or an encrypted page", async () => {
    const { ctx } = filled.app;
    await ctx.jobs.whenIdle();
    const signal = new AbortController().signal;
    const before = changes();
    const outside = [
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch")),
      vi.spyOn(ctx.jobs, "enqueue"),
      vi.spyOn(ctx.events, "publish"),
    ];
    try {
      for (const [name, args] of calls) {
        const result = await ctx.services.tools.call(name, args, { signal });
        expect(result.text.length, name).toBeLessThanOrEqual(3000);
        // What was asked is said back ("Nothing matches …"); only what the tool found counts.
        const asked = JSON.stringify(args).toLowerCase();
        for (const secret of [SECRET_PHONE, "flowerpot", "Zebedee Lane", "NN1 1ZZ", CIPHER, "bothy combination", "Quill"]) {
          if (!asked.includes(secret.toLowerCase())) expect(result.text, `${name} ${JSON.stringify(args)}`).not.toContain(secret);
        }
      }
      for (const spy of outside) expect(spy, spy.getMockName()).not.toHaveBeenCalled();
      // The server is filled: the same calls do find what is there.
      expect((await ctx.services.tools.call("find_places", { query: "Tesco" }, { signal })).text).toContain("Tesco");
      expect((await ctx.services.tools.call("search_library", { query: "boil water" }, { signal })).held).toBe(true);
    } finally {
      for (const spy of outside) spy.mockRestore();
    }
    expect(changes(), "rows changed in SQLite").toBe(before);
  });

  it("read_passage reads no contact's or encrypted page's passage, whatever number or page is named", async () => {
    const { ctx } = filled.app;
    const signal = new AbortController().signal;
    const most = (ctx.sqlite.prepare("SELECT max(id) AS n FROM chunks").get() as { n: number }).n;
    const contactChunks = ctx.sqlite
      .prepare("SELECT c.id AS id FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id WHERE e.kind = 'contact'")
      .all() as Array<{ id: number }>;
    expect(contactChunks.length).toBeGreaterThan(0);
    for (let passage = 1; passage <= most + 2; passage++) {
      for (const page of [undefined, 1]) {
        const result = await ctx.services.tools.call("read_passage", { passage, ...(page ? { page } : {}) }, { signal });
        for (const secret of [SECRET_PHONE, "flowerpot", "Zebedee Lane", CIPHER, "bothy combination"]) {
          expect(result.text, `passage ${passage}`).not.toContain(secret);
        }
      }
    }
  });
});
