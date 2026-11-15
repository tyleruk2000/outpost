import fs from "node:fs";
import type { ImportDto, ImportItem } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyse, commit, findNote, NOTION, notionZip, titleTree } from "./fixtures/imports/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: page content is read loosely in tests
type Json = Record<string, any>;

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

const itemTitled = (dto: ImportDto, title: string): ImportItem => {
  const found = dto.analysis!.items.filter((item) => item.title === title);
  expect(found, `items titled "${title}"`).toHaveLength(1);
  return found[0]!;
};

/** Every node of a page document, depth first. */
function nodes(doc: Json): Json[] {
  const out: Json[] = [];
  const visit = (node: Json) => {
    out.push(node);
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return out;
}

describe("a Notion export: the plan", () => {
  it("reads the hierarchy, titles and kinds from the file layout", async () => {
    const dto = await analyse(app, [{ name: "Export-trip.zip", content: await notionZip() }]);
    expect(dto.state).toBe("ready");
    expect(dto.kind).toBe("notion");
    const analysis = dto.analysis!;
    expect(analysis.source).toBe("notion");
    expect(analysis.problems).toEqual([]);

    // The 32-digit ids are gone from every title.
    expect(analysis.items.filter((item) => item.kind !== "attachment").map((item) => item.title)).toEqual([
      "Trip plan",
      "Packing list",
      "Route",
      "Tasks",
      "Book huts",
      "Buy maps",
    ]);
    expect(analysis.items.every((item) => !/[0-9a-f]{32}/.test(item.title))).toBe(true);

    const trip = itemTitled(dto, "Trip plan");
    const tasks = itemTitled(dto, "Tasks");
    expect(trip).toMatchObject({ kind: "page", parentPath: null, importKey: `notion:${NOTION.trip}`, format: "markdown" });
    expect(itemTitled(dto, "Packing list")).toMatchObject({ kind: "page", parentPath: trip.path, importKey: `notion:${NOTION.packing}` });
    expect(itemTitled(dto, "Route").parentPath).toBe(trip.path);
    expect(tasks).toMatchObject({ kind: "database", parentPath: trip.path, importKey: `notion:${NOTION.tasks}` });
    // Row pages hang under the database, not under the folder that holds them.
    expect(itemTitled(dto, "Book huts")).toMatchObject({ kind: "page", parentPath: tasks.path });
    expect(itemTitled(dto, "Buy maps").parentPath).toBe(tasks.path);

    const map = analysis.items.find((item) => item.path.endsWith("map.png"))!;
    expect(map).toMatchObject({ kind: "attachment", title: "map.png" });

    expect(analysis.totals).toMatchObject({
      pages: 5,
      databases: 1,
      attachments: 1,
      documents: 0,
      skipped: 0,
      importedBefore: 0,
      sameContent: 0,
    });
    expect(analysis.totals.bytes).toBeGreaterThan(0);
  });

  it("uses the fuller of Notion's two database files and lists it once", async () => {
    const dto = await analyse(app, [{ name: "Export-trip.zip", content: await notionZip() }]);
    const tasks = itemTitled(dto, "Tasks");
    expect(tasks.path.endsWith(`Tasks ${NOTION.tasks}.csv`)).toBe(true);
    expect(tasks.source?.endsWith(`Tasks ${NOTION.tasks}_all.csv`)).toBe(true);
    expect(dto.analysis!.items.filter((item) => item.path.endsWith(".csv"))).toHaveLength(1);
  });

  it("says what will not come across intact, and what was converted", async () => {
    const dto = await analyse(app, [{ name: "Export-trip.zip", content: await notionZip() }]);
    const trip = itemTitled(dto, "Trip plan");
    const unsupported = Object.fromEntries(dto.analysis!.unsupported.map((entry) => [entry.kind, entry]));
    // One block equation and one inline one.
    expect(unsupported.equation).toEqual({ kind: "equation", count: 2, example: trip.path });
    // The database shown inside the page becomes a link to its own page.
    expect(unsupported["embedded-database"]).toMatchObject({ count: 1, example: trip.path });
    // The callout is supported, so it is reported as converted and not as a loss.
    expect(dto.analysis!.converted).toEqual([{ kind: "callout", count: 1, example: trip.path }]);
    expect(unsupported.callout).toBeUndefined();
    expect(unsupported["missing-link"]).toBeUndefined();
  });

  it("does not touch the notes while it works out the plan", async () => {
    await app.api("POST", "/api/notes", { title: "Already here" });
    const before = (await app.api("GET", "/api/notes/tree")).body;
    const attachments = app.ctx.sqlite.prepare("SELECT count(*) AS n FROM attachments").get();
    await analyse(app, [{ name: "Export-trip.zip", content: await notionZip() }]);
    expect((await app.api("GET", "/api/notes/tree")).body).toEqual(before);
    expect(app.ctx.sqlite.prepare("SELECT count(*) AS n FROM attachments").get()).toEqual(attachments);
    expect(app.ctx.sqlite.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 0 });
  });
});

describe("a Notion export: the import", () => {
  async function imported(): Promise<{ dto: ImportDto; parentId: string }> {
    const parentId = (await app.api("POST", "/api/notes", { title: "From Notion" })).body.note.id as string;
    const analysed = await analyse(app, [{ name: "Export-trip.zip", content: await notionZip() }]);
    return { dto: await commit(app, analysed.id, { parentId }), parentId };
  }

  it("creates the tree under the chosen page and reports it", async () => {
    const { dto, parentId } = await imported();
    expect(dto.state).toBe("completed");
    expect(dto.error).toBeNull();
    expect(await titleTree(app)).toEqual(["From Notion", ["Trip plan", ["Packing list", "Route", "Tasks", ["Book huts", "Buy maps"]]]]);

    const report = dto.report!;
    expect(report.created.map((entry) => entry.title).sort()).toEqual([
      "Book huts",
      "Buy maps",
      "Packing list",
      "Route",
      "Tasks",
      "Trip plan",
    ]);
    expect(report.created.filter((entry) => entry.topLevel).map((entry) => entry.title)).toEqual(["Trip plan"]);
    expect(report).toMatchObject({ updated: [], skipped: [], failed: [], attachments: 1, documents: [], stopped: false });
    expect(report.unsupported.map((entry) => entry.kind)).toContain("equation");
    expect(report.durationMs).toBeGreaterThanOrEqual(0);

    const trip = await findNote(app, "Trip plan");
    expect(trip.parentId).toBe(parentId);
    // The staged files are gone as soon as the import has finished.
    expect(fs.existsSync(app.ctx.services.imports.stagingDir(dto.id))).toBe(false);
  });

  it("turns a link written as a URL-encoded relative path into a link to the created page", async () => {
    await imported();
    const trip = await findNote(app, "Trip plan");
    const packing = await findNote(app, "Packing list");

    const link = nodes(trip.content).find((node) => node.type === "pageLink" && node.attrs.label === "packing list");
    expect(link?.attrs.noteId).toBe(packing.id);
    expect(packing.backlinks.map((note: Json) => note.id)).toEqual([trip.id]);
    // The link back up (`../Trip plan ….md`) resolves as well.
    expect(trip.backlinks.map((note: Json) => note.title)).toContain("Packing list");
    // The title heading is the page's title and is not repeated in its text.
    expect(nodes(trip.content).some((node) => node.type === "heading")).toBe(false);
  });

  it("stores the picture as an attachment and points the page at it", async () => {
    await imported();
    const trip = await findNote(app, "Trip plan");
    const image = nodes(trip.content).find((node) => node.type === "image");
    expect(image?.attrs.alt).toBe("The map");
    expect(image?.attrs.src).toMatch(/^\/api\/attachments\/[a-z0-9]+$/);
    const served = await app.api("GET", image!.attrs.src);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(app.ctx.sqlite.prepare("SELECT note_id AS noteId, filename FROM attachments").all()).toEqual([
      { noteId: trip.id, filename: "map.png" },
    ]);
  });

  it("keeps the callout, and keeps equations as their text", async () => {
    await imported();
    const trip = await findNote(app, "Trip plan");
    const callout = nodes(trip.content).find((node) => node.type === "callout");
    expect(JSON.stringify(callout)).toContain("Check the weather the night before.");
    expect(JSON.stringify(trip.content)).toContain("E = mc^2");
  });

  it("makes the database a table page whose first column links to the row pages", async () => {
    await imported();
    const tasks = await findNote(app, "Tasks");
    const huts = await findNote(app, "Book huts");
    const maps = await findNote(app, "Buy maps");
    expect(tasks.children.map((note: Json) => note.title)).toEqual(["Book huts", "Buy maps"]);

    const table = tasks.content.content[0];
    expect(table.type).toBe("table");
    const rows = table.content as Json[];
    expect(rows).toHaveLength(3);
    expect(rows[0]!.content.map((cell: Json) => cell.type)).toEqual(["tableHeader", "tableHeader"]);
    expect(rows[0]!.content.map((cell: Json) => cell.content[0].content[0].text)).toEqual(["Name", "Status"]);
    expect(rows[1]!.content[0].content[0].content[0]).toEqual({ type: "pageLink", attrs: { noteId: huts.id, label: "Book huts" } });
    expect(rows[2]!.content[0].content[0].content[0]).toEqual({ type: "pageLink", attrs: { noteId: maps.id, label: "Buy maps" } });
    expect(rows[2]!.content[1].content[0].content[0].text).toBe("To do");

    // The database shown inside the parent page is now a link to this page.
    const trip = await findNote(app, "Trip plan");
    expect(nodes(trip.content).some((node) => node.type === "pageLink" && node.attrs.noteId === tasks.id)).toBe(true);
    expect(huts.backlinks.map((note: Json) => note.id)).toEqual([tasks.id]);
  });

  it("records where each page came from", async () => {
    await imported();
    const keys = app.ctx.sqlite
      .prepare("SELECT title, import_key AS importKey FROM notes WHERE import_key IS NOT NULL ORDER BY title")
      .all();
    expect(keys).toEqual([
      { title: "Book huts", importKey: `notion:${NOTION.huts}` },
      { title: "Buy maps", importKey: `notion:${NOTION.maps}` },
      { title: "Packing list", importKey: `notion:${NOTION.packing}` },
      { title: "Route", importKey: `notion:${NOTION.route}` },
      { title: "Tasks", importKey: `notion:${NOTION.tasks}` },
      { title: "Trip plan", importKey: `notion:${NOTION.trip}` },
    ]);
  });
});
