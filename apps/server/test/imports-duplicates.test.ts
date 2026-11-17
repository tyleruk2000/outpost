import fs from "node:fs";
import path from "node:path";
import { encryptedNoteDoc } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyse, buildZip, commit, findNote, getImport, notionZip, titleTree, uploadImport } from "./fixtures/imports/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: responses are read loosely in tests
type Json = Record<string, any>;

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

const notion = async () => [{ name: "Export-trip.zip", content: await notionZip() }];
const allNotes = () =>
  app.ctx.sqlite.prepare("SELECT id, title, updated_at AS updatedAt, import_key AS importKey FROM notes ORDER BY id").all() as Json[];
const countTitled = (title: string) => allNotes().filter((note) => note.title === title).length;
const attachmentCount = () => (app.ctx.sqlite.prepare("SELECT count(*) AS n FROM attachments").get() as { n: number }).n;

describe("importing the same thing again", () => {
  it("recognises every page of an export that was imported before", async () => {
    await commit(app, (await analyse(app, await notion())).id);
    const trip = await findNote(app, "Trip plan");

    const again = await analyse(app, await notion());
    const pages = again.analysis!.items.filter((item) => item.kind === "page" || item.kind === "database");
    expect(pages).toHaveLength(6);
    expect(pages.every((item) => item.duplicateOf?.reason === "imported-before")).toBe(true);
    expect(pages.find((item) => item.title === "Trip plan")!.duplicateOf).toEqual({
      noteId: trip.id,
      title: "Trip plan",
      reason: "imported-before",
    });
    expect(again.analysis!.totals).toMatchObject({ importedBefore: 6, sameContent: 0 });
  });

  it("skip: creates nothing new and leaves the existing pages untouched", async () => {
    await commit(app, (await analyse(app, await notion())).id);
    const before = allNotes();
    const attachments = attachmentCount();

    const dto = await commit(app, (await analyse(app, await notion())).id, { duplicates: "skip" });
    expect(dto.state).toBe("completed");
    expect(allNotes()).toEqual(before);
    expect(attachmentCount()).toBe(attachments);
    expect(dto.report).toMatchObject({ created: [], updated: [], failed: [], attachments: 0 });
    expect(dto.report!.skipped).toHaveLength(6);
    expect(dto.report!.skipped[0]).toMatchObject({
      title: "Trip plan",
      reason: "It was imported before and is left as it is.",
      noteId: before.find((note) => note.title === "Trip plan")!.id,
    });
  });

  it("copy: creates a second set, and a third import still finds exactly one original of each", async () => {
    await commit(app, (await analyse(app, await notion())).id);
    const originals = allNotes();

    const dto = await commit(app, (await analyse(app, await notion())).id, { duplicates: "copy" });
    expect(dto.report!.created).toHaveLength(6);
    expect(dto.report!.skipped).toEqual([]);
    expect(await titleTree(app)).toEqual([
      "Trip plan",
      ["Packing list", "Route", "Tasks", ["Book huts", "Buy maps"]],
      "Trip plan",
      ["Packing list", "Route", "Tasks", ["Book huts", "Buy maps"]],
    ]);
    // The originals are untouched and still hold the keys; the copies hold none.
    expect(allNotes().filter((note) => note.importKey !== null)).toEqual(originals);
    // Links inside the copy lead to the copy, not back to the original.
    const copyIds = new Set(dto.report!.created.map((entry) => entry.noteId));
    const copiedTrip = (await app.api("GET", `/api/notes/${dto.report!.created.find((entry) => entry.title === "Trip plan")!.noteId}`)).body
      .note;
    const link = JSON.stringify(copiedTrip.content).match(/"pageLink","attrs":\{"noteId":"([^"]+)","label":"packing list"/);
    expect(copyIds.has(link![1]!)).toBe(true);

    const third = await analyse(app, await notion());
    const trip = third.analysis!.items.find((item) => item.title === "Trip plan")!;
    expect(trip.duplicateOf).toMatchObject({ noteId: originals.find((note) => note.title === "Trip plan")!.id, reason: "imported-before" });
  });

  it("replace: is refused until it has been confirmed", async () => {
    await commit(app, (await analyse(app, await notion())).id);
    const before = allNotes();
    const again = await analyse(app, await notion());

    const refused = await app.api("POST", `/api/imports/${again.id}/commit`, { duplicates: "replace", pdfs: "library" });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toBe(
      "Replacing overwrites pages that are already in your notes. Confirm that this is what you want, then import again.",
    );
    const explicitNo = await app.api("POST", `/api/imports/${again.id}/commit`, {
      duplicates: "replace",
      pdfs: "library",
      replaceConfirmed: false,
    });
    expect(explicitNo.status).toBe(400);

    await app.ctx.jobs.whenIdle();
    expect((await getImport(app, again.id)).state).toBe("ready");
    expect(allNotes()).toEqual(before);
  });

  it("replace, confirmed: updates the pages from the earlier import in place", async () => {
    await commit(app, (await analyse(app, await notion())).id);
    const route = await findNote(app, "Route");
    // The person edited an imported page and renamed another since.
    await app.api("PATCH", `/api/notes/${route.id}`, {
      title: "Route (edited)",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "My own words." }] }] },
    });
    const ids = allNotes().map((note) => note.id);

    const dto = await commit(app, (await analyse(app, await notion())).id, { duplicates: "replace", replaceConfirmed: true });
    expect(dto.state).toBe("completed");
    expect(dto.report!.created).toEqual([]);
    expect(dto.report!.updated).toHaveLength(6);
    // Same pages, same ids, same place in the tree; the source's title and text are back.
    expect(allNotes().map((note) => note.id)).toEqual(ids);
    const after = (await app.api("GET", `/api/notes/${route.id}`)).body.note;
    expect(after.title).toBe("Route");
    expect(JSON.stringify(after.content)).toContain("Hut to hut, north to south.");
    expect(JSON.stringify(after.content)).not.toContain("My own words.");
    expect(await titleTree(app)).toEqual(["Trip plan", ["Packing list", "Route", "Tasks", ["Book huts", "Buy maps"]]]);
  });

  it("replace, confirmed: leaves a page that has been encrypted since as it is", async () => {
    await commit(app, (await analyse(app, await notion())).id);
    const route = await findNote(app, "Route");
    const armor = fs.readFileSync(path.join(import.meta.dirname, "fixtures/pgp/message-symmetric.asc"), "utf8").trim();
    const current = (await app.api("GET", `/api/notes/${route.id}`)).body.note;
    const encrypted = await app.api("PATCH", `/api/notes/${route.id}`, {
      content: encryptedNoteDoc(armor),
      baseUpdatedAt: current.updatedAt,
    });
    expect(encrypted.status).toBe(200);

    const dto = await commit(app, (await analyse(app, await notion())).id, { duplicates: "replace", replaceConfirmed: true });
    expect(dto.report!.updated.map((entry) => entry.title)).not.toContain("Route");
    expect(dto.report!.skipped).toContainEqual(
      expect.objectContaining({ title: "Route", noteId: route.id, reason: expect.stringContaining("encrypted") }),
    );
    expect((await app.api("GET", `/api/notes/${route.id}`)).body.note.encrypted).toBe(true);
  });

  it("never replaces a page that was written by hand, even with the same title and text", async () => {
    const own = (
      await app.api("POST", "/api/notes", {
        title: "Knots",
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bowline first." }] }] },
      })
    ).body.note;
    const before = allNotes();

    const analysed = await analyse(app, [{ name: "Knots.md", content: "Bowline first.\n" }]);
    expect(analysed.analysis!.items[0]!.duplicateOf).toEqual({ noteId: own.id, title: "Knots", reason: "same-content" });
    expect(analysed.analysis!.totals).toMatchObject({ importedBefore: 0, sameContent: 1 });

    const dto = await commit(app, analysed.id, { duplicates: "replace", replaceConfirmed: true });
    expect(dto.report!.updated).toEqual([]);
    expect(dto.report!.skipped).toEqual([
      {
        path: "Knots.md",
        title: "Knots",
        reason: "A page with the same title and text already exists. It did not come from an import, so it is never overwritten.",
        noteId: own.id,
      },
    ]);
    expect(allNotes()).toEqual(before);

    // Copying it is allowed; the copy carries the key, so the next import knows it.
    const copied = await commit(app, (await analyse(app, [{ name: "Knots.md", content: "Bowline first.\n" }])).id, { duplicates: "copy" });
    expect(copied.report!.created).toHaveLength(1);
    expect(countTitled("Knots")).toBe(2);
    const next = await analyse(app, [{ name: "Knots.md", content: "Bowline first.\n" }]);
    expect(next.analysis!.items[0]!.duplicateOf).toMatchObject({ noteId: copied.report!.created[0]!.noteId, reason: "imported-before" });
  });

  it("does not count pages in the trash as already imported", async () => {
    await commit(app, (await analyse(app, [{ name: "Knots.md", content: "Bowline first.\n" }])).id);
    await app.api("DELETE", `/api/notes/${(await findNote(app, "Knots")).id}`);
    const again = await analyse(app, [{ name: "Knots.md", content: "Bowline first.\n" }]);
    expect(again.analysis!.items[0]!.duplicateOf).toBeUndefined();
    await commit(app, again.id);
    expect((await app.api("GET", "/api/notes/tree")).body.notes).toHaveLength(1);
  });
});

describe("failures, stopping and trying again", () => {
  it("carries on past an item that fails, and a second try imports only what is missing", async () => {
    const analysed = await analyse(app, await notion());
    let failures = 0;
    app.ctx.services.imports.hooks.beforeItem = (item) => {
      if (item.title === "Route") {
        failures += 1;
        throw new Error("disk hiccup");
      }
    };

    const first = await commit(app, analysed.id);
    expect(failures).toBe(1);
    expect(first.state).toBe("failed");
    expect(first.canRetry).toBe(true);
    expect(first.error).toBe("1 item could not be imported. Everything else is in place. Try again, or finish without it.");
    expect(first.report!.failed).toEqual([
      {
        path: expect.stringContaining("Route"),
        title: "Route",
        reason: "Something unexpected went wrong with this item. The server log has the details.",
      },
    ]);
    // One failure did not stop the other five pages, their links or the picture.
    expect(first.report!.created).toHaveLength(5);
    expect(first.report!.attachments).toBe(1);
    expect(await titleTree(app)).toEqual(["Trip plan", ["Packing list", "Tasks", ["Book huts", "Buy maps"]]]);
    expect(fs.existsSync(app.ctx.services.imports.stagingDir(analysed.id))).toBe(true);

    app.ctx.services.imports.hooks.beforeItem = undefined;
    const idsBefore = allNotes().map((note) => note.id);
    const second = await commit(app, analysed.id);
    expect(second.state).toBe("completed");
    expect(second.canRetry).toBe(false);
    expect(second.report!.failed).toEqual([]);
    // The report covers the whole import, and nothing was made twice.
    expect(second.report!.created).toHaveLength(6);
    expect(allNotes()).toHaveLength(6);
    expect(
      allNotes()
        .map((note) => note.id)
        .slice(0, 5),
    ).toEqual(idsBefore);
    for (const title of ["Trip plan", "Packing list", "Route", "Tasks", "Book huts", "Buy maps"]) expect(countTitled(title)).toBe(1);
    expect(attachmentCount()).toBe(1);
    expect(second.report!.attachments).toBe(1);
    expect(fs.existsSync(app.ctx.services.imports.stagingDir(analysed.id))).toBe(false);
  });

  it("finds pages by their import key when the record of a first try is lost", async () => {
    const analysed = await analyse(app, await notion());
    app.ctx.services.imports.hooks.beforeItem = (item) => {
      if (item.title === "Buy maps") throw new Error("disk hiccup");
    };
    await commit(app, analysed.id);
    app.ctx.services.imports.hooks.beforeItem = undefined;
    // As if the process had died before the ledger reached the disk.
    fs.rmSync(path.join(app.ctx.services.imports.stagingDir(analysed.id), "ledger.jsonl"));

    const second = await commit(app, analysed.id);
    expect(second.state).toBe("completed");
    expect(allNotes()).toHaveLength(6);
    expect(second.report!.created.map((entry) => entry.title)).toEqual(["Buy maps"]);
    expect(second.report!.skipped).toHaveLength(5);
  });

  it("can be stopped part-way and finished later without duplicates", async () => {
    const analysed = await analyse(app, await notion());
    let seen = 0;
    app.ctx.services.imports.hooks.beforeItem = () => {
      seen += 1;
      if (seen === 3) app.ctx.services.imports.cancel(analysed.id);
    };
    const stopped = await commit(app, analysed.id);
    expect(stopped.state).toBe("failed");
    expect(stopped.error).toContain("stopped before it finished");
    expect(stopped.report!.stopped).toBe(true);
    expect(stopped.report!.created).toHaveLength(3);
    expect(stopped.canRetry).toBe(true);
    expect(allNotes()).toHaveLength(3);

    app.ctx.services.imports.hooks.beforeItem = undefined;
    const finished = await commit(app, analysed.id);
    expect(finished.state).toBe("completed");
    expect(finished.report).toMatchObject({ stopped: false, failed: [] });
    expect(allNotes()).toHaveLength(6);
    expect(await titleTree(app)).toEqual(["Trip plan", ["Packing list", "Route", "Tasks", ["Book huts", "Buy maps"]]]);
    expect((await findNote(app, "Packing list")).backlinks.map((note: Json) => note.title)).toEqual(["Trip plan"]);
  });

  it("finishing a partly failed import keeps its report", async () => {
    const analysed = await analyse(app, await notion());
    app.ctx.services.imports.hooks.beforeItem = (item) => {
      if (item.title === "Route") throw new Error("disk hiccup");
    };
    await commit(app, analysed.id);
    const closed = (await app.api("DELETE", `/api/imports/${analysed.id}`)).body.import;
    // Pages were brought in, so this is a finished import with one failure, not a discarded one.
    expect(closed.state).toBe("completed");
    expect(closed.report.created).toHaveLength(5);
    expect(closed.report.failed).toHaveLength(1);
    expect(fs.existsSync(app.ctx.services.imports.stagingDir(analysed.id))).toBe(false);
    expect((await app.api("POST", `/api/imports/${analysed.id}/commit`, { duplicates: "skip", pdfs: "library" })).status).toBe(409);
  });
});

describe("discarding and listing", () => {
  it("discard removes the uploaded files and nothing else", async () => {
    const analysed = await analyse(app, await notion());
    const staging = app.ctx.services.imports.stagingDir(analysed.id);
    expect(fs.existsSync(path.join(staging, "tree"))).toBe(true);
    expect(staging.startsWith(path.join(app.dir, "data", "staging"))).toBe(true);

    const discarded = await app.api("DELETE", `/api/imports/${analysed.id}`);
    expect(discarded.status).toBe(200);
    expect(discarded.body.import).toMatchObject({ state: "discarded", canRetry: false });
    expect(fs.existsSync(staging)).toBe(false);
    expect((await app.api("GET", "/api/notes/tree")).body.notes).toEqual([]);

    const commitAfter = await app.api("POST", `/api/imports/${analysed.id}/commit`, { duplicates: "skip", pdfs: "library" });
    expect(commitAfter.status).toBe(409);
    expect(commitAfter.body.error.message).toBe("This import was discarded. Upload the files again.");
  });

  it("can be discarded while it is still being read", async () => {
    const uploaded = await uploadImport(app, await notion());
    const discarded = await app.api("DELETE", `/api/imports/${uploaded.body.import.id}`);
    expect(discarded.body.import.state).toBe("discarded");
    await app.ctx.jobs.whenIdle();
    expect((await getImport(app, uploaded.body.import.id)).state).toBe("discarded");
    expect(fs.existsSync(app.ctx.services.imports.stagingDir(uploaded.body.import.id))).toBe(false);
  });

  it("a finished import keeps its row and report, and cannot be discarded", async () => {
    const done = await commit(app, (await analyse(app, [{ name: "Knots.md", content: "# Knots\n" }])).id);
    const refused = await app.api("DELETE", `/api/imports/${done.id}`);
    expect(refused.status).toBe(409);
    expect((await getImport(app, done.id)).report!.created).toHaveLength(1);
  });

  it("lists recent imports, newest first, without their plans", async () => {
    const first = await commit(app, (await analyse(app, [{ name: "Knots.md", content: "# Knots\n" }])).id);
    const second = await analyse(app, await notion());
    const list = (await app.api("GET", "/api/imports")).body.imports as Json[];
    expect(list.map((entry) => entry.id)).toEqual([second.id, first.id]);
    expect(list[0]).toMatchObject({ state: "ready", originalName: "Export-trip.zip", kind: "notion", counts: null });
    expect(list[1]).toMatchObject({ state: "completed", counts: { created: 1, updated: 0, skipped: 0, failed: 0, documents: 0 } });
    expect(list[0]).not.toHaveProperty("analysis");
    expect((await app.api("GET", "/api/imports/nope")).status).toBe(404);
  });

  it("tells the browser about every change of state", async () => {
    const seen: string[] = [];
    const stop = app.ctx.events.subscribe((event) => {
      if (event.type === "imports.changed") seen.push(app.ctx.services.imports.get(event.id!).state);
    });
    const analysed = await analyse(app, [{ name: "Knots.md", content: "# Knots\n" }]);
    await commit(app, analysed.id);
    stop();
    expect(seen).toEqual(["uploaded", "analysing", "ready", "importing", "completed"]);
  });

  it("clears out uploads that were abandoned more than a week ago when the server starts", async () => {
    const stale = await analyse(app, await notion());
    const fresh = await analyse(app, [{ name: "Knots.md", content: "# Knots\n" }]);
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    app.ctx.sqlite.prepare("UPDATE imports SET created_at = ? WHERE id = ?").run(eightDaysAgo, stale.id);
    const staleDir = app.ctx.services.imports.stagingDir(stale.id);
    const freshDir = app.ctx.services.imports.stagingDir(fresh.id);
    await app.app.close();

    const restarted = await createTestApp({}, app.dir);
    try {
      expect(fs.existsSync(staleDir)).toBe(false);
      expect(fs.existsSync(freshDir)).toBe(true);
      expect((await getImport(restarted, stale.id)).state).toBe("discarded");
      expect((await getImport(restarted, fresh.id)).state).toBe("ready");
    } finally {
      await restarted.close();
      fs.rmSync(app.dir, { recursive: true, force: true });
      // The outer afterEach closes `app` again; closing twice is harmless.
    }
  });
});

describe("pages that sit under a page that already exists", () => {
  it("puts new sub-pages under the existing page when their parent is skipped", async () => {
    await commit(
      app,
      (await analyse(app, [{ name: "book.zip", content: await buildZip([{ name: "Book.md", content: "# Book\n\nIntro.\n" }]) }])).id,
    );
    const book = await findNote(app, "Book");

    const bigger = await buildZip([
      { name: "Book.md", content: "# Book\n\nIntro.\n" },
      { name: "Book/Chapter one.md", content: "# Chapter one\n\nBack to the [book](../Book.md).\n" },
    ]);
    const dto = await commit(app, (await analyse(app, [{ name: "book.zip", content: bigger }])).id);
    expect(dto.report!.skipped.map((entry) => entry.title)).toEqual(["Book"]);
    expect(dto.report!.created).toMatchObject([{ title: "Chapter one", topLevel: false }]);
    expect(await titleTree(app)).toEqual(["Book", ["Chapter one"]]);
    // The new page's link leads to the page that was kept.
    expect((await app.api("GET", `/api/notes/${book.id}`)).body.note.backlinks.map((note: Json) => note.title)).toEqual(["Chapter one"]);
  });
});
