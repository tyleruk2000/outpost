import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppEvent } from "../src/core/events.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: responses are read loosely in tests, as in helpers.ts
type Json = Record<string, any>;

const text = (value: string, marks?: Json[]) => (marks ? { type: "text", text: value, marks } : { type: "text", text: value });
const p = (...content: Json[]) => ({ type: "paragraph", content });
const h = (level: number, value: string) => ({ type: "heading", attrs: { level }, content: [text(value)] });
const doc = (...content: Json[]) => ({ type: "doc", content });
const pageLink = (noteId: string, label: string) => ({ type: "pageLink", attrs: { noteId, label } });

describe("notes API", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(() => app.close());

  async function create(body: Json = {}): Promise<Json> {
    const response = await app.api("POST", "/api/notes", body);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body.note;
  }
  const get = async (id: string, query = ""): Promise<Json> => (await app.api("GET", `/api/notes/${id}${query}`)).body.note;
  const tree = async (): Promise<Json[]> => (await app.api("GET", "/api/notes/tree")).body.notes;
  /** Titles of the children of a page (or of the top level), in sidebar order. */
  const titlesUnder = async (parentId: string | null) =>
    (await tree()).filter((note) => note.parentId === parentId).map((note) => note.title);
  const searchIds = async (q: string) =>
    (await app.api("GET", `/api/search?kinds=note&q=${encodeURIComponent(q)}`)).body.results.map((result: Json) => result.entityId);

  describe("creating and reading", () => {
    it("creates an empty page with sensible defaults", async () => {
      const note = await create();
      expect(note).toMatchObject({
        parentId: null,
        title: "",
        icon: null,
        content: doc({ type: "paragraph" }),
        tags: [],
        isFavorite: false,
        isTemplate: false,
        coverUrl: null,
        breadcrumbs: [],
        backlinks: [],
        children: [],
        trashedAt: null,
        lastViewedAt: null,
      });
      expect(note.id).toMatch(/^[0-9a-z]{26}$/);
      expect(note.updatedAt).toBe(note.createdAt);
    });

    it("nests pages and reports the tree flat, ordered by parent then position", async () => {
      const trips = await create({ title: "Trips", icon: "🧭" });
      const alps = await create({ title: "Alps", parentId: trips.id });
      const coast = await create({ title: "Coast", parentId: trips.id });
      const day = await create({ title: "Day 1", parentId: alps.id });
      await create({ title: "Recipes" });

      const notes = await tree();
      expect(notes).toHaveLength(5);
      expect(Object.keys(notes[0]!).sort()).toEqual([
        "childCount",
        "icon",
        "id",
        "isFavorite",
        "parentId",
        "position",
        "title",
        "updatedAt",
      ]);
      expect(notes.find((note) => note.id === trips.id)).toMatchObject({ title: "Trips", icon: "🧭", parentId: null, childCount: 2 });
      expect(notes.find((note) => note.id === alps.id)).toMatchObject({ parentId: trips.id, childCount: 1 });
      expect(await titlesUnder(null)).toEqual(["Trips", "Recipes"]);
      expect(await titlesUnder(trips.id)).toEqual(["Alps", "Coast"]);
      // Within one parent, rows arrive in position order.
      for (const parentId of [null, trips.id]) {
        const positions = notes.filter((note) => note.parentId === parentId).map((note) => note.position);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }

      const page = await get(day.id);
      expect(page.breadcrumbs).toEqual([
        { id: trips.id, title: "Trips", icon: "🧭" },
        { id: alps.id, title: "Alps", icon: null },
      ]);
      expect((await get(trips.id)).children).toEqual([
        { id: alps.id, title: "Alps", icon: null },
        { id: coast.id, title: "Coast", icon: null },
      ]);
    });

    it("places a new page right after a given sibling", async () => {
      const parent = await create({ title: "Parent" });
      const a = await create({ title: "A", parentId: parent.id });
      await create({ title: "B", parentId: parent.id });
      await create({ title: "After A", parentId: parent.id, afterId: a.id });
      // Without a parent, the page goes next to the sibling it follows.
      const sameParent = await create({ title: "After A too", afterId: a.id });
      expect(sameParent.parentId).toBe(parent.id);
      expect(await titlesUnder(parent.id)).toEqual(["A", "After A too", "After A", "B"]);

      const elsewhere = await create({ title: "Elsewhere" });
      expect((await app.api("POST", "/api/notes", { parentId: elsewhere.id, afterId: a.id })).status).toBe(400);
      expect((await app.api("POST", "/api/notes", { afterId: "nope" })).status).toBe(400);
      expect((await app.api("POST", "/api/notes", { parentId: "nope" })).status).toBe(400);
    });

    it("validates input and answers 404 for pages that do not exist", async () => {
      expect((await app.api("GET", "/api/notes/01hxnothere")).status).toBe(404);
      expect((await app.api("PATCH", "/api/notes/01hxnothere", { title: "x" })).status).toBe(404);
      expect((await app.api("POST", "/api/notes", { title: 5 })).status).toBe(400);
      expect((await app.api("POST", "/api/notes", { title: "x".repeat(301) })).status).toBe(400);
      const bad = await app.api("POST", "/api/notes", { content: { type: "paragraph" } });
      expect(bad.status).toBe(400);
      expect(bad.body.error.message).toMatch(/not a document/);
      const note = await create();
      expect((await app.api("PATCH", `/api/notes/${note.id}`, { isFavorite: "yes" })).status).toBe(400);
      expect((await app.api("POST", `/api/notes/${note.id}/move`, {})).status).toBe(400);
    });

    it("sanitises content on the way in", async () => {
      const note = await create({
        title: "Hostile",
        content: doc(
          p(text("click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "sparkle" }])),
          { type: "script", content: [p(text("kept as text"))] },
          { type: "image", attrs: { src: "data:text/html;base64,PHNjcmlwdD4=", alt: null, title: null, onerror: "alert(1)" } },
        ),
      });
      expect(note.content).toEqual(doc(p(text("click")), p(text("kept as text"))));
      const saved = await app.api("PATCH", `/api/notes/${note.id}`, {
        content: doc({ type: "heading", attrs: { level: 9, onclick: "x" }, content: [text("H")] }),
      });
      expect(saved.status).toBe(200);
      expect((await get(note.id)).content).toEqual(doc(h(3, "H")));
    });

    it("records a view only when asked to", async () => {
      const note = await create({ title: "Seen" });
      expect((await get(note.id)).lastViewedAt).toBeNull();
      const viewed = await get(note.id, "?view=1");
      expect(viewed.lastViewedAt).toBeGreaterThan(0);
      // Looking at a page is not editing it.
      expect(viewed.updatedAt).toBe(note.updatedAt);
    });
  });

  describe("moving and ordering", () => {
    it("moves pages between parents and reorders siblings", async () => {
      const a = await create({ title: "A" });
      const b = await create({ title: "B" });
      const c = await create({ title: "C" });
      const d = await create({ title: "D" });
      expect(await titlesUnder(null)).toEqual(["A", "B", "C", "D"]);

      // afterId: null puts a page first; an id puts it right after that page; omitted puts it last.
      expect((await app.api("POST", `/api/notes/${d.id}/move`, { parentId: null, afterId: null })).status).toBe(200);
      expect(await titlesUnder(null)).toEqual(["D", "A", "B", "C"]);
      await app.api("POST", `/api/notes/${d.id}/move`, { parentId: null, afterId: b.id });
      expect(await titlesUnder(null)).toEqual(["A", "B", "D", "C"]);
      await app.api("POST", `/api/notes/${a.id}/move`, { parentId: null });
      expect(await titlesUnder(null)).toEqual(["B", "D", "C", "A"]);

      const moved = await app.api("POST", `/api/notes/${c.id}/move`, { parentId: b.id });
      expect(moved.body.note).toMatchObject({ id: c.id, parentId: b.id, childCount: 0 });
      await app.api("POST", `/api/notes/${d.id}/move`, { parentId: b.id, afterId: null });
      expect(await titlesUnder(null)).toEqual(["B", "A"]);
      expect(await titlesUnder(b.id)).toEqual(["D", "C"]);
      expect((await get(c.id)).breadcrumbs.map((crumb: Json) => crumb.title)).toEqual(["B"]);

      // Moving a page is not an edit of its text.
      expect((await get(c.id)).updatedAt).toBe(c.updatedAt);
    });

    it("refuses to move a page into itself or its own sub-pages", async () => {
      const top = await create({ title: "Top" });
      const middle = await create({ title: "Middle", parentId: top.id });
      const bottom = await create({ title: "Bottom", parentId: middle.id });
      for (const parentId of [top.id, middle.id, bottom.id]) {
        const response = await app.api("POST", `/api/notes/${top.id}/move`, { parentId });
        expect(response.status).toBe(400);
        expect(response.body.error.message).toMatch(/inside itself or one of its own sub-pages/);
      }
      expect((await app.api("POST", `/api/notes/${top.id}/move`, { parentId: null, afterId: top.id })).status).toBe(400);
      expect((await app.api("POST", `/api/notes/${top.id}/move`, { parentId: "01hxnothere" })).status).toBe(400);
      expect((await app.api("POST", `/api/notes/${bottom.id}/move`, { parentId: null, afterId: middle.id })).status).toBe(400);
      // Nothing moved.
      expect((await tree()).map((note) => [note.title, note.parentId])).toEqual([
        ["Top", null],
        ["Middle", top.id],
        ["Bottom", middle.id],
      ]);
      // The other direction is fine.
      expect((await app.api("POST", `/api/notes/${bottom.id}/move`, { parentId: top.id })).status).toBe(200);
    });

    it("keeps the order right through many insertions at the same spot", async () => {
      const first = await create({ title: "first" });
      await create({ title: "last" });
      // Each new page lands between "first" and the page added before it, halving the
      // gap every time. Without renumbering, positions would collide after ~50 rounds.
      const expected: string[] = [];
      for (let round = 0; round < 80; round += 1) {
        await create({ title: `n${round}`, afterId: first.id });
        expected.unshift(`n${round}`);
      }
      expect(await titlesUnder(null)).toEqual(["first", ...expected, "last"]);
      const positions = (await tree()).map((note) => note.position);
      expect(new Set(positions).size).toBe(positions.length);
    });
  });

  describe("saving", () => {
    it("updates fields and returns the new updatedAt", async () => {
      const note = await create({ title: "Draft" });
      const saved = await app.api("PATCH", `/api/notes/${note.id}`, {
        title: "Final",
        icon: "📌",
        content: doc(h(1, "Plan"), p(text("Leave at dawn."))),
        tags: ["Trips", " trips ", "Alps"],
        baseUpdatedAt: note.updatedAt,
      });
      expect(saved.status).toBe(200);
      expect(saved.body.note).toMatchObject({ id: note.id, title: "Final", icon: "📌", tags: ["Alps", "Trips"], isFavorite: false });
      expect(saved.body.note.updatedAt).toBeGreaterThan(note.updatedAt);
      // The answer to a save does not echo the content back.
      expect(saved.body.note.content).toBeUndefined();

      const row = app.ctx.services.notes.getRow(note.id);
      expect(row.contentText).toBe("Plan\nLeave at dawn.");
      expect(row.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect((await get(note.id)).updatedAt).toBe(saved.body.note.updatedAt);

      // Saving the same thing again changes nothing, so the timestamp stays.
      const again = await app.api("PATCH", `/api/notes/${note.id}`, {
        title: "Final",
        content: doc(h(1, "Plan"), p(text("Leave at dawn."))),
        tags: ["alps", "TRIPS"],
      });
      expect(again.body.note.updatedAt).toBe(saved.body.note.updatedAt);
    });

    it("refuses to overwrite a newer version (two tabs, two devices)", async () => {
      const note = await create({ title: "Shared", content: doc(p(text("original"))) });

      // Tab A saves first.
      const a = await app.api("PATCH", `/api/notes/${note.id}`, {
        content: doc(p(text("from tab A"))),
        title: "Shared (A)",
        baseUpdatedAt: note.updatedAt,
      });
      expect(a.status).toBe(200);

      // Tab B still has the version it opened.
      const b = await app.api("PATCH", `/api/notes/${note.id}`, { content: doc(p(text("from tab B"))), baseUpdatedAt: note.updatedAt });
      expect(b.status).toBe(409);
      expect(b.body.error.code).toBe("conflict");
      expect(b.body.error.details).toEqual({ current: { updatedAt: a.body.note.updatedAt, title: "Shared (A)" } });
      expect(b.body.error.message).toMatch(/changed somewhere else/);
      expect((await get(note.id)).content).toEqual(doc(p(text("from tab A"))));

      // After taking the newer version as its base, tab B can save. Tab A keeps saving
      // with the timestamps it gets back and never conflicts with itself.
      const retry = await app.api("PATCH", `/api/notes/${note.id}`, {
        content: doc(p(text("from tab B"))),
        baseUpdatedAt: a.body.note.updatedAt,
      });
      expect(retry.status).toBe(200);
      let base = retry.body.note.updatedAt;
      for (const word of ["one", "two", "three"]) {
        const next = await app.api("PATCH", `/api/notes/${note.id}`, { content: doc(p(text(word))), baseUpdatedAt: base });
        expect(next.status).toBe(200);
        expect(next.body.note.updatedAt).toBeGreaterThan(base);
        base = next.body.note.updatedAt;
      }
      // Without a base the save is unconditional (importers, scripts).
      expect((await app.api("PATCH", `/api/notes/${note.id}`, { title: "Forced" })).status).toBe(200);
    });

    it("does not treat starring a page as an edit", async () => {
      const note = await create({ title: "Star me" });
      const starred = await app.api("PATCH", `/api/notes/${note.id}`, { isFavorite: true });
      expect(starred.body.note).toMatchObject({ isFavorite: true, updatedAt: note.updatedAt });
      // The editor in another tab can still save with the base it had.
      expect((await app.api("PATCH", `/api/notes/${note.id}`, { title: "Edited", baseUpdatedAt: note.updatedAt })).status).toBe(200);
    });

    it("shares tags with the rest of Outpost, case-insensitively", async () => {
      const a = await create({ title: "A" });
      const b = await create({ title: "B" });
      await app.api("PATCH", `/api/notes/${a.id}`, { tags: ["Water", "First aid"] });
      await app.api("PATCH", `/api/notes/${b.id}`, { tags: ["water", "  first   aid  ", "NEW"] });
      // The first spelling wins; no second tag row is made for another capitalisation.
      expect((await get(b.id)).tags).toEqual(["First aid", "NEW", "Water"]);
      const names = app.ctx.sqlite
        .prepare("SELECT name FROM tags ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(names).toEqual(["First aid", "NEW", "Water"]);

      await app.api("PATCH", `/api/notes/${b.id}`, { tags: [] });
      expect((await get(b.id)).tags).toEqual([]);
      expect((await get(a.id)).tags).toEqual(["First aid", "Water"]);
      expect((await app.api("PATCH", `/api/notes/${a.id}`, { tags: ["a,b"] })).status).toBe(400);
      expect((await app.api("PATCH", `/api/notes/${a.id}`, { tags: ["x".repeat(51)] })).status).toBe(400);
    });

    it("announces changes to listeners", async () => {
      const events: AppEvent[] = [];
      const stop = app.ctx.events.subscribe((event) => {
        if (event.type === "notes.changed") events.push(event);
      });
      const note = await create({ title: "Watched" });
      await app.api("PATCH", `/api/notes/${note.id}`, { title: "Renamed" });
      await app.api("PATCH", `/api/notes/${note.id}`, { title: "Renamed" });
      await app.api("POST", `/api/notes/${note.id}/move`, { parentId: null, afterId: null });
      await app.api("DELETE", `/api/notes/${note.id}`);
      await app.api("POST", `/api/notes/${note.id}/restore`);
      stop();
      // Create, rename (the identical second save is silent), move, trash, restore.
      expect(events).toEqual(Array.from({ length: 5 }, () => ({ type: "notes.changed", id: note.id })));
    });
  });

  describe("links and backlinks", () => {
    it("shows backlinks as links are added and removed", async () => {
      const target = await create({ title: "Target" });
      const viaAtom = await create({ title: "Mentions it", icon: "🔗" });
      const viaHref = await create({ title: "Links to it" });
      expect((await get(target.id)).backlinks).toEqual([]);

      await app.api("PATCH", `/api/notes/${viaAtom.id}`, {
        content: doc(p(text("See "), pageLink(target.id, "Target"), pageLink(target.id, "again"))),
      });
      await app.api("PATCH", `/api/notes/${viaHref.id}`, {
        content: doc(p(text("here", [{ type: "link", attrs: { href: `/notes/${target.id}` } }]), text(" and a manual")), {
          type: "documentEmbed",
          attrs: { documentId: "01hxdoc", title: "Manual" },
        }),
      });
      // A page linking to itself is not a backlink.
      await app.api("PATCH", `/api/notes/${target.id}`, { content: doc(p(pageLink(target.id, "me"))) });

      expect((await get(target.id)).backlinks).toEqual([
        { id: viaHref.id, title: "Links to it", icon: null },
        { id: viaAtom.id, title: "Mentions it", icon: "🔗" },
      ]);
      const links = app.ctx.sqlite.prepare("SELECT source_id AS s, target_id AS t, target_kind AS k FROM note_links ORDER BY k, s").all();
      expect(links).toEqual(
        [
          { s: viaHref.id, t: "01hxdoc", k: "document" },
          { s: viaAtom.id, t: target.id, k: "note" },
          { s: viaHref.id, t: target.id, k: "note" },
        ].sort((x, y) => (x.k + x.s).localeCompare(y.k + y.s)),
      );

      // Remove one link by editing; trash the other page.
      await app.api("PATCH", `/api/notes/${viaAtom.id}`, { content: doc(p(text("See nothing."))) });
      expect((await get(target.id)).backlinks.map((link: Json) => link.id)).toEqual([viaHref.id]);
      await app.api("DELETE", `/api/notes/${viaHref.id}`);
      expect((await get(target.id)).backlinks).toEqual([]);
      await app.api("POST", `/api/notes/${viaHref.id}/restore`);
      expect((await get(target.id)).backlinks.map((link: Json) => link.id)).toEqual([viaHref.id]);
    });
  });

  describe("search", () => {
    it("finds page text, and follows edits and renames", async () => {
      const parent = await create({ title: "Bushcraft" });
      const note = await create({
        title: "Shelter",
        parentId: parent.id,
        content: doc(h(2, "Tarp"), p(text("Pitch it low in a storm.")), {
          type: "callout",
          attrs: { variant: "warning" },
          content: [p(text("Check for widowmakers overhead."))],
        }),
      });
      await app.api("PATCH", `/api/notes/${note.id}`, { tags: ["camping"] });

      expect(await searchIds("widowmakers ")).toEqual([note.id]);
      expect(await searchIds("tarp ")).toEqual([note.id]);
      expect(await searchIds("camping ")).toEqual([note.id]);
      const { body } = await app.api("GET", "/api/search?q=storm+");
      expect(body.results[0]).toMatchObject({
        kind: "note",
        entityId: note.id,
        title: "Shelter",
        url: `/notes/${note.id}`,
        subtitle: "Bushcraft",
        tags: ["camping"],
      });
      expect(body.results[0].passages[0].heading).toBe("Tarp");

      // New text is found, old text is forgotten.
      await app.api("PATCH", `/api/notes/${note.id}`, { content: doc(h(2, "Tarp"), p(text("Use a ridgeline."))) });
      expect(await searchIds("ridgeline ")).toEqual([note.id]);
      expect(await searchIds("widowmakers ")).toEqual([]);

      // A heading renamed over unchanged text is picked up too.
      await app.api("PATCH", `/api/notes/${note.id}`, { content: doc(h(2, "Bivouac"), p(text("Use a ridgeline."))) });
      expect(await searchIds("bivouac ")).toEqual([note.id]);
      expect(await searchIds("tarp ")).toEqual([]);

      // Renaming the page, and renaming its parent (shown as the path of the result).
      await app.api("PATCH", `/api/notes/${note.id}`, { title: "Overnight cover" });
      expect(await searchIds("overnight ")).toEqual([note.id]);
      expect(await searchIds("shelter ")).toEqual([]);
      await app.api("PATCH", `/api/notes/${parent.id}`, { title: "Woodcraft" });
      const renamed = await app.api("GET", "/api/search?kinds=note&q=ridgeline+");
      expect(renamed.body.results[0]).toMatchObject({ title: "Overnight cover", subtitle: "Woodcraft" });

      // Moving the page changes its path as well.
      await app.api("POST", `/api/notes/${note.id}/move`, { parentId: null });
      expect((await app.api("GET", "/api/search?kinds=note&q=ridgeline+")).body.results[0].subtitle).toBeNull();
    });

    it("keeps an untitled, empty page findable only once it has something to find", async () => {
      const note = await create();
      expect(app.ctx.services.search.stats().entities).toEqual({ note: 1 });
      await app.api("PATCH", `/api/notes/${note.id}`, { title: "Zanzibar" });
      expect(await searchIds("zanzibar ")).toEqual([note.id]);
    });
  });

  describe("trash", () => {
    it("moves a page and its sub-pages to the trash and restores them together", async () => {
      const keep = await create({ title: "Keep" });
      const parent = await create({ title: "Project", content: doc(p(text("quokka notes"))) });
      const child = await create({ title: "Child", parentId: parent.id, content: doc(p(text("wombat notes"))) });
      const grandchild = await create({ title: "Grandchild", parentId: child.id });

      // A sub-page deleted on its own earlier stays in the trash when the rest comes back.
      const early = await create({ title: "Deleted earlier", parentId: parent.id });
      expect((await app.api("DELETE", `/api/notes/${early.id}`)).body).toEqual({ trashed: [early.id] });

      const trashed = await app.api("DELETE", `/api/notes/${parent.id}`);
      expect(trashed.status).toBe(200);
      expect(trashed.body.trashed.sort()).toEqual([parent.id, child.id, grandchild.id].sort());
      expect((await tree()).map((note) => note.title)).toEqual(["Keep"]);
      expect(await searchIds("quokka ")).toEqual([]);
      expect(await searchIds("wombat ")).toEqual([]);
      // Deleting again is harmless.
      expect((await app.api("DELETE", `/api/notes/${parent.id}`)).body).toEqual({ trashed: [] });

      // The trash lists what was deleted, not every page that went along.
      const trash = (await app.api("GET", "/api/notes/trash")).body.notes;
      expect(trash.map((note: Json) => [note.title, note.descendantCount])).toEqual([
        ["Project", 2],
        ["Deleted earlier", 0],
      ]);
      expect(trash[0].trashedAt).toBeGreaterThan(trash[1].trashedAt);

      // Pages in the trash can be read but not edited, moved into, or added to.
      expect((await get(parent.id)).trashedAt).toBe(trash[0].trashedAt);
      expect((await app.api("PATCH", `/api/notes/${parent.id}`, { title: "x" })).status).toBe(409);
      expect((await app.api("POST", "/api/notes", { parentId: parent.id })).status).toBe(400);
      expect((await app.api("POST", `/api/notes/${keep.id}/move`, { parentId: parent.id })).status).toBe(400);

      const restored = await app.api("POST", `/api/notes/${parent.id}/restore`);
      expect(restored.status).toBe(200);
      expect(restored.body.note).toMatchObject({ id: parent.id, trashedAt: null, parentId: null });
      expect((await tree()).map((note) => note.title).sort()).toEqual(["Child", "Grandchild", "Keep", "Project"]);
      expect(await searchIds("quokka ")).toEqual([parent.id]);
      expect(await searchIds("wombat ")).toEqual([child.id]);
      expect((await app.api("GET", "/api/notes/trash")).body.notes.map((note: Json) => note.title)).toEqual(["Deleted earlier"]);

      // The one deleted earlier goes back under its parent, which is there again.
      expect((await app.api("POST", `/api/notes/${early.id}/restore`)).body.note.parentId).toBe(parent.id);
    });

    it("restores to the top level when the old parent is gone or still in the trash", async () => {
      const parent = await create({ title: "Parent" });
      const child = await create({ title: "Child", parentId: parent.id });
      await app.api("DELETE", `/api/notes/${parent.id}`);

      const restored = await app.api("POST", `/api/notes/${child.id}/restore`);
      expect(restored.body.note).toMatchObject({ parentId: null, trashedAt: null, breadcrumbs: [] });
      expect(await titlesUnder(null)).toEqual(["Child"]);

      // Restoring the parent afterwards does not pull the child back under it or duplicate it.
      await app.api("POST", `/api/notes/${parent.id}/restore`);
      expect((await tree()).map((note) => [note.title, note.parentId])).toEqual([
        ["Parent", null],
        ["Child", null],
      ]);
    });

    it("deletes for good only from the trash, with attachments nothing else uses", async () => {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
      const dir = `${app.dir}/in`;
      const fs = await import("node:fs");
      fs.mkdirSync(dir);
      fs.writeFileSync(`${dir}/pic.png`, png);
      const { notes } = app.ctx.services;

      const doomed = await create({ title: "Doomed", tags: ["only-here"] });
      await app.api("PATCH", `/api/notes/${doomed.id}`, { tags: ["only-here"] });
      const sub = await create({ title: "Sub", parentId: doomed.id });
      const survivor = await create({ title: "Survivor" });

      const own = await notes.createAttachmentFromFile({ sourcePath: `${dir}/pic.png`, filename: "own.png", noteId: doomed.id });
      const shared = await notes.createAttachmentFromFile({ sourcePath: `${dir}/pic.png`, filename: "shared.png", noteId: sub.id });
      const cover = await notes.createAttachmentFromFile({ sourcePath: `${dir}/pic.png`, filename: "cover.png" });
      const image = (id: string) => ({ type: "image", attrs: { src: `/api/attachments/${id}`, alt: null, title: null } });
      await app.api("PATCH", `/api/notes/${doomed.id}`, { content: doc(image(own.id)), coverAttachmentId: cover.id });
      await app.api("PATCH", `/api/notes/${sub.id}`, { content: doc(image(shared.id)) });
      await app.api("PATCH", `/api/notes/${survivor.id}`, { content: doc(image(shared.id), p(pageLink(doomed.id, "Doomed"))) });

      // Not in the trash yet: refused.
      const early = await app.api("DELETE", `/api/notes/${doomed.id}?permanent=true`);
      expect(early.status).toBe(409);
      expect(early.body.error.message).toMatch(/trash first/);

      await app.api("DELETE", `/api/notes/${doomed.id}`);
      const gone = await app.api("DELETE", `/api/notes/${doomed.id}?permanent=true`);
      expect(gone.status).toBe(200);
      expect(gone.body).toEqual({ deletedNotes: 2, deletedAttachments: 2 });

      expect((await app.api("GET", `/api/notes/${doomed.id}`)).status).toBe(404);
      expect((await app.api("GET", `/api/notes/${sub.id}`)).status).toBe(404);
      expect((await app.api("GET", "/api/notes/trash")).body.notes).toEqual([]);
      expect((await app.api("GET", `/api/attachments/${own.id}`)).status).toBe(404);
      expect((await app.api("GET", `/api/attachments/${cover.id}`)).status).toBe(404);
      // The picture another page still shows is kept, and no longer tied to the deleted page.
      const kept = await app.api("GET", `/api/attachments/${shared.id}`);
      expect(kept.status).toBe(200);
      expect(app.ctx.sqlite.prepare("SELECT note_id AS noteId FROM attachments").all()).toEqual([{ noteId: null }]);
      // Files are gone from disk, not just from the database.
      const left = fs.readdirSync(`${app.dir}/data/attachments`, { recursive: true }).filter((name) => String(name).endsWith(".png"));
      expect(left).toHaveLength(1);
      expect(String(left[0])).toMatch(/shared\.png$/);

      expect(app.ctx.sqlite.prepare("SELECT count(*) AS n FROM note_links WHERE source_id IN (?, ?)").get(doomed.id, sub.id)).toEqual({
        n: 0,
      });
      expect(app.ctx.sqlite.prepare("SELECT count(*) AS n FROM tags WHERE name = 'only-here'").get()).toEqual({ n: 0 });
      expect((await get(survivor.id)).content.content).toHaveLength(2);
    });
  });

  describe("favourites, recents and lookup", () => {
    it("lists starred pages and recently opened pages", async () => {
      const a = await create({ title: "Alpha" });
      const b = await create({ title: "beta" });
      const c = await create({ title: "Gamma" });

      await app.api("PATCH", `/api/notes/${c.id}`, { isFavorite: true });
      await app.api("PATCH", `/api/notes/${b.id}`, { isFavorite: true });
      const favourites = (await app.api("GET", "/api/notes/favorites")).body.notes;
      expect(favourites.map((note: Json) => note.title)).toEqual(["beta", "Gamma"]);
      expect(favourites[0]).toMatchObject({ id: b.id, isFavorite: true, parentId: null, icon: null });
      expect((await tree()).filter((note) => note.isFavorite).map((note) => note.title)).toEqual(["beta", "Gamma"]);

      expect((await app.api("GET", "/api/notes/recent")).body.notes).toEqual([]);
      for (const note of [a, b, c, a]) {
        await get(note.id, "?view=1");
        await new Promise((resolve) => setTimeout(resolve, 3));
      }
      const recent = (await app.api("GET", "/api/notes/recent")).body.notes;
      expect(recent.map((note: Json) => note.title)).toEqual(["Alpha", "Gamma", "beta"]);
      expect((await app.api("GET", "/api/notes/recent?limit=2")).body.notes).toHaveLength(2);
      expect((await app.api("GET", "/api/notes/recent?limit=0")).status).toBe(400);

      // Pages in the trash drop out of both lists.
      await app.api("DELETE", `/api/notes/${c.id}`);
      expect((await app.api("GET", "/api/notes/favorites")).body.notes.map((note: Json) => note.title)).toEqual(["beta"]);
      expect((await app.api("GET", "/api/notes/recent")).body.notes.map((note: Json) => note.title)).toEqual(["Alpha", "beta"]);
    });

    it("looks pages up by title for the link menu", async () => {
      const trips = await create({ title: "Trips" });
      const first = await create({ title: "Water filters", parentId: trips.id });
      const second = await create({ title: "Rainwater" });
      const third = await create({ title: "Water purification" });
      await create({ title: "100% wool" });
      const trashed = await create({ title: "Water in the trash" });
      await app.api("DELETE", `/api/notes/${trashed.id}`);
      // Make the order of edits unambiguous.
      await new Promise((resolve) => setTimeout(resolve, 3));
      await app.api("PATCH", `/api/notes/${first.id}`, { icon: "💧" });

      const lookup = async (q: string, extra = "") =>
        (await app.api("GET", `/api/notes/lookup?q=${encodeURIComponent(q)}${extra}`)).body.notes;
      // Titles starting with the text first (most recently edited first), then titles containing it.
      expect((await lookup("water")).map((note: Json) => note.id)).toEqual([first.id, third.id, second.id]);
      expect((await lookup("WATER F"))[0]).toEqual({
        id: first.id,
        title: "Water filters",
        icon: "💧",
        path: "Trips",
        updatedAt: expect.any(Number),
      });
      expect(await lookup("nothing like this")).toEqual([]);
      // LIKE wildcards typed by a person are literal.
      expect((await lookup("%")).map((note: Json) => note.title)).toEqual(["100% wool"]);
      expect(await lookup("_")).toEqual([]);
      expect(await lookup("water", "&limit=1")).toHaveLength(1);
      // Nothing typed yet: the pages edited last.
      expect((await lookup(""))[0].id).toBe(first.id);
    });
  });

  describe("templates and duplicates", () => {
    it("offers the built-in templates and makes pages from them", async () => {
      const { body } = await app.api("GET", "/api/notes/templates");
      expect(body.templates.map((template: Json) => template.id)).toEqual([
        "builtin:meeting-notes",
        "builtin:trip-plan",
        "builtin:kit-list",
        "builtin:reference-card",
        "builtin:daily-log",
      ]);
      for (const template of body.templates) {
        expect(template).toMatchObject({ builtin: true, title: expect.any(String), icon: expect.any(String) });
        expect(template.description.length).toBeGreaterThan(20);
      }

      const parent = await create({ title: "2026" });
      const kit = await create({ templateId: "builtin:kit-list", parentId: parent.id });
      expect(kit).toMatchObject({ title: "Kit list", icon: "🎒", parentId: parent.id, isTemplate: false });
      expect(kit.content.content.some((block: Json) => block.type === "taskList")).toBe(true);
      expect(await searchIds("purification tablets ")).toEqual([kit.id]);

      const card = await create({ templateId: "builtin:reference-card", title: "Stove" });
      expect(card.title).toBe("Stove");
      expect(card.content.content.map((block: Json) => block.type)).toEqual(expect.arrayContaining(["callout", "table", "orderedList"]));
      expect((await app.api("POST", "/api/notes", { templateId: "builtin:nope" })).status).toBe(404);
      expect((await app.api("POST", "/api/notes", { templateId: parent.id })).status).toBe(404);
    });

    it("lets a page become a template of your own", async () => {
      const parent = await create({ title: "Parent" });
      const page = await create({
        title: "Weekly review",
        icon: "📝",
        parentId: parent.id,
        content: doc(h(2, "Wins"), p(text("What went well this week?"))),
      });
      await app.api("PATCH", `/api/notes/${page.id}`, { isFavorite: true });

      // A page with sub-pages cannot become a template.
      const refused = await app.api("PATCH", `/api/notes/${parent.id}`, { isTemplate: true });
      expect(refused.status).toBe(409);
      expect(refused.body.error.message).toMatch(/sub-pages/);

      const made = await app.api("PATCH", `/api/notes/${page.id}`, { isTemplate: true });
      expect(made.body.note).toMatchObject({ isTemplate: true, isFavorite: false });
      // Templates live outside the tree, the lists and search.
      expect((await tree()).map((note) => note.title)).toEqual(["Parent"]);
      expect((await tree())[0]!.childCount).toBe(0);
      expect(await searchIds("wins ")).toEqual([]);
      expect((await app.api("GET", "/api/notes/lookup?q=weekly")).body.notes).toEqual([]);
      expect((await app.api("POST", "/api/notes", { parentId: page.id })).status).toBe(400);
      expect((await app.api("POST", `/api/notes/${page.id}/move`, { parentId: parent.id })).status).toBe(409);

      const templates = (await app.api("GET", "/api/notes/templates")).body.templates;
      expect(templates).toHaveLength(6);
      expect(templates[5]).toEqual({
        id: page.id,
        title: "Weekly review",
        icon: "📝",
        description: "Wins What went well this week?",
        builtin: false,
      });

      const fromOwn = await create({ templateId: page.id, parentId: parent.id });
      expect(fromOwn).toMatchObject({ title: "Weekly review", icon: "📝", isTemplate: false, parentId: parent.id });
      expect(fromOwn.content).toEqual(page.content);
      expect(await searchIds("wins ")).toEqual([fromOwn.id]);

      // Turning it back into a page returns it to the top level.
      await app.api("PATCH", `/api/notes/${page.id}`, { isTemplate: false });
      expect(await titlesUnder(null)).toEqual(["Parent", "Weekly review"]);
      expect((await app.api("GET", "/api/notes/templates")).body.templates).toHaveLength(5);
    });

    it("duplicates a page, optionally with its sub-pages", async () => {
      const parent = await create({ title: "Parent" });
      const original = await create({ title: "Original", icon: "⭐", parentId: parent.id, content: doc(p(text("copied text narwhal"))) });
      await app.api("PATCH", `/api/notes/${original.id}`, { tags: ["x"], isFavorite: true });
      const childA = await create({ title: "Child A", parentId: original.id });
      await create({ title: "Grandchild", parentId: childA.id, content: doc(p(pageLink(original.id, "Original"))) });
      await create({ title: "Child B", parentId: original.id });
      await create({ title: "Sibling", parentId: parent.id });

      const shallow = (await app.api("POST", `/api/notes/${original.id}/duplicate`)).body.note;
      expect(shallow).toMatchObject({
        title: "Original (copy)",
        icon: "⭐",
        parentId: parent.id,
        tags: ["x"],
        isFavorite: false,
        children: [],
      });
      expect(shallow.content).toEqual(doc(p(text("copied text narwhal"))));
      expect(shallow.id).not.toBe(original.id);
      // The copy sits right after the original.
      expect(await titlesUnder(parent.id)).toEqual(["Original", "Original (copy)", "Sibling"]);
      expect((await searchIds("narwhal ")).sort()).toEqual([original.id, shallow.id].sort());

      const deep = (await app.api("POST", `/api/notes/${original.id}/duplicate`, { withChildren: true })).body.note;
      expect(deep.children.map((child: Json) => child.title)).toEqual(["Child A", "Child B"]);
      const copiedChild = await get(deep.children[0].id);
      expect(copiedChild.children.map((child: Json) => child.title)).toEqual(["Grandchild"]);
      expect(await titlesUnder(parent.id)).toEqual(["Original", "Original (copy)", "Original (copy)", "Sibling"]);
      expect(await tree()).toHaveLength(1 + 5 + 1 + 4);
      // The original is untouched.
      expect((await get(original.id)).children.map((child: Json) => child.title)).toEqual(["Child A", "Child B"]);
    });
  });

  describe("the service, for importers", () => {
    it("creates, updates and finds pages by import key", async () => {
      const { notes } = app.ctx.services;
      const { doc: content } = notes.content.markdownToDoc("# Imported\n\nSome **text**.\n");
      const created = notes.create({ title: "From a file", content, tags: ["imported"], importKey: "notion:abc" });
      expect(created.tags).toEqual(["imported"]);
      expect(notes.findByImportKey("notion:abc")?.id).toBe(created.id);
      expect(notes.findByImportKey("notion:other")).toBeUndefined();

      const other = notes.create({ title: "Second" });
      notes.setImportKey(other.id, "md:notes/second.md");
      expect(notes.findByImportKey("md:notes/second.md")?.id).toBe(other.id);
      notes.setImportKey(other.id, null);
      expect(notes.findByImportKey("md:notes/second.md")).toBeUndefined();
      expect(() => notes.setImportKey("01hxnothere", "x")).toThrow(/not found/);

      const saved = notes.update(created.id, { content: notes.content.markdownToDoc("Rewritten.").doc });
      expect(saved.updatedAt).toBeGreaterThan(created.updatedAt);
      expect(notes.get(created.id).content).toEqual(doc(p(text("Rewritten."))));
      expect(notes.content.docToMarkdown(notes.get(created.id).content)).toBe("Rewritten.\n");
    });
  });
});
