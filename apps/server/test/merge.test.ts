/**
 * Bringing a portable drive's changes home, with two real libraries on temporary
 * directories: "home" is a real server; the drive is written by the real portable
 * code and then run as a real second server ("travelling") to change things on it.
 *
 * Every test that reads a drive hashes every file on it before and afterwards.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MergeAnalysis, MergeChoice, MergeDto, MergeItem } from "@outpost/shared";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { type BuiltApp, buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { collections } from "../src/db/schema.ts";
import { cleanTrack, safeTags } from "../src/modules/merge/apply.ts";
import { diffLibraries } from "../src/modules/merge/diff.ts";
import { fileInside } from "../src/modules/merge/drive.ts";
import type { PageState, Snapshot } from "../src/modules/merge/fingerprint.ts";
import { cachePath } from "../src/modules/portable/runtimes.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const gpx = (name: string, lat = 54.5) =>
  `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name}</name><trkseg>` +
  `<trkpt lat="${lat}" lon="-3.1"><ele>100</ele></trkpt><trkpt lat="${lat + 0.01}" lon="-3.11"><ele>150</ele></trkpt></trkseg></trk></gpx>`;

const para = (...content: unknown[]) => ({ type: "paragraph", content });
const words = (text: string) => ({ type: "text", text });
const doc = (...blocks: unknown[]) => ({ type: "doc", content: blocks });
const textDoc = (text: string) => doc(para(words(text)));

/** Every file under a folder with its checksum: what "nothing on the drive changed" is checked against. */
function fingerprintOf(root: string): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (relative: string) => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const rel = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        found[`${rel}/`] = "folder";
        walk(rel);
      } else if (entry.isSymbolicLink()) found[rel] = `link:${fs.readlinkSync(path.join(root, rel))}`;
      else
        found[rel] = createHash("sha256")
          .update(fs.readFileSync(path.join(root, rel)))
          .digest("hex");
    }
  };
  walk("");
  return found;
}

interface World {
  home: TestApp;
  drive: string;
  ids: Record<string, string>;
  /** Writes the drive again from home, as "Update this drive" does. */
  writeDrive(): Promise<void>;
  /** Runs Outpost from the drive, as on another computer, and stops it again. */
  travel(work: (away: BuiltApp, api: TestApp["api"]) => Promise<void>): Promise<void>;
}

async function addFile(
  app: Pick<BuiltApp, "ctx">,
  dir: string,
  name: string,
  text: string,
  options: { title?: string; tags?: string[] } = {},
) {
  const file = path.join(dir, `source-${Date.now()}-${Math.round(Math.random() * 1e9)}-${name}`);
  fs.writeFileSync(file, text);
  const outcome = await app.ctx.services.documents.ingestFile({ sourcePath: file, originalName: name, ...options });
  fs.rmSync(file);
  await app.ctx.jobs.whenIdle();
  return outcome.document.id;
}

async function makeWorld(): Promise<World> {
  const bundle = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "outpost-bundle-"));
  cleanups.push(() => fs.rmSync(bundle, { recursive: true, force: true }));
  fs.mkdirSync(path.join(bundle, "server"), { recursive: true });
  fs.writeFileSync(path.join(bundle, "server", "outpost.mjs"), "console.log('outpost')\n");
  fs.mkdirSync(path.join(bundle, "web"));
  fs.writeFileSync(path.join(bundle, "web", "index.html"), "<!doctype html>");
  const home = await createTestApp({ OUTPOST_APP_DIR: bundle });
  cleanups.push(() => home.close());
  const runtime = cachePath(home.ctx.config.dataDir, process.version, "linux-x64");
  fs.mkdirSync(path.dirname(runtime), { recursive: true });
  fs.writeFileSync(runtime, "runtime");

  const ids: Record<string, string> = {};
  const page = async (key: string, title: string, text: string, parent?: string) => {
    const { body } = await home.api("POST", "/api/notes", { title, content: textDoc(text), parentId: parent ? ids[parent] : null });
    ids[key] = body.note.id;
  };
  await page("plan", "Passage plan", "Leave on the ebb.");
  await page("kit", "Kit list", "Stove, fuel, matches.");
  await page("log", "Log", "Where we went.");
  await page("dayOne", "Day one", "Fog until noon.", "log");
  await page("both", "Anchorages", "Shelter from the west.");
  await page("doomed", "Old plans", "No longer wanted.");
  await page("doomedChild", "Old plan B", "Nor this.", "doomed");
  await page("homeEdit", "Radio schedule", "Call at eight.");
  await page("mover", "Tide notes", "Springs on the fourth.");
  await home.api("PATCH", `/api/notes/${ids.kit}`, { tags: ["Gear"] });

  ids.tides = await addFile(home, home.dir, "Tide tables.txt", "High water at Dover is at noon.", { tags: ["tides"] });
  ids.charts = await addFile(home, home.dir, "Charts.txt", "Chart 1410: St George's Channel.");

  const { annotations } = home.ctx.services.maps;
  ids.harbour = annotations.createMarker({ name: "Harbour", lat: 54.1, lon: -3.2, note: "Fuel berth" }).id;
  ids.anchorage = annotations.createMarker({ name: "Anchorage", lat: 54.2, lon: -3.3 }).id;
  ids.wreck = annotations.createMarker({ name: "Wreck", lat: 54.3, lon: -3.4 }).id;
  ids.ridge = (await annotations.importTrack({ source: gpx("Ridge walk"), filename: "ridge.gpx" })).track!.id;

  const drive = path.join(home.dir, "storage", "usb", "Outpost");
  fs.mkdirSync(path.dirname(drive), { recursive: true });
  let written = false;
  const writeDrive = async () => {
    const started = await home.api("POST", "/api/portable/build", {
      targetPath: drive,
      platforms: ["linux-x64"],
      collectionIds: [],
      documents: "all",
      replaceExisting: written,
    });
    expect(started.status).toBe(200);
    await home.ctx.jobs.whenIdle();
    const built = (await home.api("GET", `/api/jobs/${started.body.job.id}`)).body.job;
    expect(built.error).toBeNull();
    expect(built.state).toBe("succeeded");
    written = true;
  };
  await writeDrive();

  const travel: World["travel"] = async (work) => {
    const away = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        OUTPOST_PORTABLE: "true",
        OUTPOST_DATA_DIR: path.join(drive, "data"),
        OUTPOST_STORAGE_ROOTS: path.join(drive, "library"),
        OUTPOST_WEB_DIR: path.join(drive, "app/web"),
        OUTPOST_CATALOG_DIR: path.join(drive, "app/catalog"),
      }),
    );
    await away.app.ready();
    const api: TestApp["api"] = async (method, url, body) => {
      const response = await away.app.inject({
        method: method as "GET",
        url,
        payload: body as never,
        headers: { host: "localhost", "x-outpost-request": "1" },
      });
      return { status: response.statusCode, body: response.json() as never, headers: response.headers };
    };
    try {
      await work(away, api);
      await away.ctx.jobs.whenIdle();
    } finally {
      await away.app.close();
    }
  };
  return { home, drive, ids, writeDrive, travel };
}

/** A trip's worth of changes on the drive, one of every kind. */
async function goTravelling(world: World): Promise<void> {
  const { ids } = world;
  await world.travel(async (away, api) => {
    const { notes, maps } = away.ctx.services;
    // A new document, a new page that shows it, a picture, and a sub-page that links back.
    ids.pilot = await addFile(away, path.join(world.drive, "library"), "Pilot notes.txt", "Keep the red buoy to port.", {
      tags: ["pilotage"],
    });
    const picture = path.join(world.drive, "library", "picture-source.png");
    fs.writeFileSync(picture, PNG);
    const attachment = await notes.createAttachmentFromFile({ sourcePath: picture, filename: "sketch.png" });
    fs.rmSync(picture);
    ids.sketch = attachment.id;
    const trip = await api("POST", "/api/notes", {
      title: "Trip notes",
      content: doc(
        para(words("Written at anchor. See "), { type: "pageLink", attrs: { noteId: ids.plan, label: "Passage plan" } }),
        { type: "image", attrs: { src: `/api/attachments/${attachment.id}`, alt: "sketch", title: null } },
        { type: "documentEmbed", attrs: { documentId: ids.pilot, title: "Pilot notes" } },
      ),
    });
    ids.trip = trip.body.note.id;
    await api("PATCH", `/api/notes/${ids.trip}`, { tags: ["Trip"] });
    const dayTwo = await api("POST", "/api/notes", {
      title: "Trip day two",
      parentId: ids.trip,
      content: doc(para(words("Back to "), { type: "pageLink", attrs: { noteId: ids.trip, label: "Trip notes" } })),
    });
    ids.dayTwo = dayTwo.body.note.id;

    await api("PATCH", `/api/notes/${ids.kit}`, { content: textDoc("Stove, fuel, matches, and a spare gas canister.") });
    await api("PATCH", `/api/notes/${ids.both}`, { content: textDoc("Shelter from the west. Poor holding in the north bay.") });
    await api("DELETE", `/api/notes/${ids.doomed}`);
    await api("POST", `/api/notes/${ids.mover}/move`, { parentId: ids.log });

    await api("PATCH", `/api/documents/${ids.tides}`, { title: "Tide tables 2026", tags: ["tides", "dover"] });

    ids.cove = maps.annotations.createMarker({ name: "Cove", lat: 54.4, lon: -3.5, noteId: ids.trip }).id;
    maps.annotations.updateMarker(ids.harbour!, { note: "Fuel berth; closed on Sundays" });
    maps.annotations.removeMarker(ids.wreck!);
    ids.coast = (await maps.annotations.importTrack({ source: gpx("Coast path", 55), filename: "coast.gpx" })).track!.id;
    maps.annotations.updateTrack(ids.ridge!, { name: "Ridge walk (north side)" });
  });
}

async function preview(world: World, source?: string): Promise<MergeDto> {
  const started = await world.home.api("POST", "/api/merge", { path: world.drive, source });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  await world.home.ctx.jobs.whenIdle();
  return (await world.home.api("GET", `/api/merge/${started.body.merge.id}`)).body.merge;
}

async function commit(
  world: World,
  merge: MergeDto,
  choices: Record<string, MergeChoice> = {},
  deletionsConfirmed = false,
): Promise<MergeDto> {
  const sent = await world.home.api("POST", `/api/merge/${merge.id}/commit`, { choices, deletionsConfirmed });
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  await world.home.ctx.jobs.whenIdle();
  return (await world.home.api("GET", `/api/merge/${merge.id}`)).body.merge;
}

const itemsOf = (merge: MergeDto) => (merge.analysis as MergeAnalysis).items;
const find = (merge: MergeDto, kind: string, change: string, title?: string): MergeItem => {
  const found = itemsOf(merge).find(
    (item) => item.kind === kind && item.change === change && (title === undefined || item.title === title),
  );
  if (!found)
    throw new Error(
      `No ${change} ${kind} ${title ?? ""} in ${JSON.stringify(itemsOf(merge).map((item) => [item.kind, item.change, item.title]))}`,
    );
  return found;
};
const summary = (merge: MergeDto) =>
  itemsOf(merge)
    .map((item) => `${item.kind} ${item.change}: ${item.title}`)
    .sort();
const noteText = async (app: TestApp, id: string) => app.ctx.services.notes.getRow(id).contentText;

describe("the record a drive carries", () => {
  it("is written with the drive, names the library that made it, and leaves home's own records behind", async () => {
    const world = await makeWorld();
    const db = new Database(path.join(world.drive, "data/outpost.db"), { readonly: true });
    try {
      const meta = Object.fromEntries(
        (db.prepare("SELECT key, value FROM library_meta").all() as Array<{ key: string; value: string }>).map((row) => [
          row.key,
          row.value,
        ]),
      );
      expect(meta["drive.madeFrom"]).toBe(world.home.ctx.services.merge.libraryId());
      expect(meta["drive.baseline"]).toBe("1");
      expect(Number(meta["drive.writtenAt"])).toBeGreaterThan(Date.now() - 60_000);
      expect(meta["library.id"]).toBeUndefined();
      const counts = Object.fromEntries(
        (db.prepare("SELECT kind, count(*) AS n FROM drive_baseline GROUP BY kind").all() as Array<{ kind: string; n: number }>).map(
          (row) => [row.kind, row.n],
        ),
      );
      expect(counts).toEqual({ page: 9, document: 2, place: 3, track: 1 });
      expect(db.prepare("SELECT count(*) AS n FROM drive_merges").get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });
});

describe("looking at a drive", () => {
  it("recognises an Outpost drive and nothing else, inside the storage roots only", async () => {
    const world = await makeWorld();
    const { home, drive } = world;
    const found = (await home.api("GET", `/api/merge/inspect?path=${encodeURIComponent(drive)}`)).body;
    expect(found.problem).toBeNull();
    expect(found.drive.sources).toEqual([expect.objectContaining({ folder: "data", current: true })]);

    const notDrive = (await home.api("GET", `/api/merge/inspect?path=${encodeURIComponent(path.dirname(drive))}`)).body;
    expect(notDrive.drive).toBeNull();
    expect(notDrive.problem).toMatch(/not an Outpost drive/);

    expect((await home.api("GET", "/api/merge/inspect?path=/etc")).status).toBe(403);
    expect((await home.api("POST", "/api/merge", { path: "/etc" })).status).toBe(403);
    expect((await home.api("POST", "/api/merge", { path: drive, source: "../data" })).status).toBe(400);
    expect((await home.api("GET", `/api/merge/inspect?path=${encodeURIComponent(home.ctx.config.dataDir)}`)).status).not.toBe(200);
  });

  it("finds nothing to bring back from a drive nobody has used", async () => {
    const world = await makeWorld();
    const before = fingerprintOf(world.drive);
    const merge = await preview(world);
    expect(merge.state).toBe("ready");
    expect(merge.baseline).toBe("recorded");
    expect(itemsOf(merge)).toEqual([]);
    expect(merge.analysis!.unchanged).toEqual({ pages: 9, documents: 2, places: 3, tracks: 1 });
    expect(fingerprintOf(world.drive)).toEqual(before);
  });
});

describe("a drive that has been travelling", () => {
  it("shows what changed on each side, grouped and countable, without touching either", async () => {
    const world = await makeWorld();
    const { home, ids } = world;
    await goTravelling(world);
    await home.api("PATCH", `/api/notes/${ids.both}`, { content: textDoc("Shelter from the west. Good holding in sand.") });
    await home.api("PATCH", `/api/notes/${ids.homeEdit}`, { content: textDoc("Call at nine.") });
    await home.api("POST", "/api/notes", { title: "Written at home", content: textDoc("After the drive left.") });

    const before = fingerprintOf(world.drive);
    const notesBefore = home.ctx.sqlite.prepare("SELECT id, content, updated_at FROM notes ORDER BY id").all();
    const merge = await preview(world);
    expect(merge.baseline).toBe("recorded");
    expect(summary(merge)).toEqual(
      [
        "document added: Pilot notes",
        "document edited: Tide tables",
        "page added: Trip day two",
        "page added: Trip notes",
        "page conflict: Anchorages",
        "page deleted: Old plans",
        "page edited: Kit list",
        "page moved: Tide notes",
        "place added: Cove",
        "place deleted: Wreck",
        "place edited: Harbour",
        "track added: Coast path",
        "track edited: Ridge walk",
      ].sort(),
    );
    // Defaults: new things and one-sided edits come across; a conflict keeps both; a deletion deletes nothing.
    expect(find(merge, "page", "added", "Trip notes")).toMatchObject({ defaultChoice: "apply", choices: ["apply", "skip"] });
    expect(find(merge, "page", "conflict")).toMatchObject({
      defaultChoice: "both",
      choices: ["both", "home", "drive"],
      conflict: "both-edited",
    });
    const deleted = find(merge, "page", "deleted");
    expect(deleted).toMatchObject({ defaultChoice: "skip", choices: ["skip", "apply"] });
    expect(deleted.notes.join(" ")).toMatch(/1 of its sub-pages was deleted on the drive too/);
    expect(find(merge, "place", "deleted")).toMatchObject({ defaultChoice: "skip" });
    expect(find(merge, "page", "added", "Trip day two").context).toBe("Trip notes");
    expect(merge.analysis!.attachments).toEqual({ count: 1, bytes: PNG.length });
    // What changed only at home is counted, and is not something to bring back.
    expect(merge.analysis!.homeOnly.pages).toBe(1);

    // Both versions of the conflict, as text, side by side.
    const compared = (await home.api("GET", `/api/merge/${merge.id}/compare?key=${find(merge, "page", "conflict").key}`)).body;
    expect(compared.home.text).toContain("Good holding in sand.");
    expect(compared.drive.text).toContain("Poor holding in the north bay.");

    // A preview changes nothing at home, and nothing on the drive.
    expect(home.ctx.sqlite.prepare("SELECT id, content, updated_at FROM notes ORDER BY id").all()).toEqual(notesBefore);
    expect(fingerprintOf(world.drive)).toEqual(before);
  });

  it("merges by the defaults: adds, updates, keeps both sides of a conflict, deletes nothing", async () => {
    const world = await makeWorld();
    const { home, ids } = world;
    await goTravelling(world);
    await home.api("PATCH", `/api/notes/${ids.both}`, { content: textDoc("Shelter from the west. Good holding in sand.") });
    const before = fingerprintOf(world.drive);

    const merged = await commit(world, await preview(world));
    expect(merged.state).toBe("completed");
    expect(merged.report!.counts).toMatchObject({ failed: 0, skipped: 0 });
    const { notes, documents, maps } = home.ctx.services;

    // New pages, with their tree, tags, links, picture and document pointing at home's copies.
    const trip = notes.get(ids.trip!);
    expect(trip.title).toBe("Trip notes");
    expect(trip.tags).toEqual(["Trip"]);
    expect(trip.children.map((child) => child.title)).toEqual(["Trip day two"]);
    const content = JSON.stringify(trip.content);
    const pilot = documents.list({ q: "Pilot" }).documents[0]!;
    expect(pilot.tags).toEqual(["pilotage"]);
    expect(content).toContain(`"documentId":"${pilot.id}"`);
    expect(pilot.id).not.toBe(ids.pilot);
    expect(fs.readFileSync(documents.absolutePath(pilot.id), "utf8")).toBe("Keep the red buoy to port.");
    const picture = home.ctx.sqlite.prepare("SELECT id, sha256, rel_path FROM attachments").all() as Array<{
      id: string;
      sha256: string;
      rel_path: string;
    }>;
    expect(picture).toHaveLength(1);
    expect(picture[0]!.sha256).toBe(createHash("sha256").update(PNG).digest("hex"));
    expect(content).toContain(`/api/attachments/${picture[0]!.id}`);
    expect(fs.readFileSync(path.join(home.ctx.config.dataDir, "attachments", picture[0]!.rel_path)).equals(PNG)).toBe(true);
    expect(notes.get(ids.plan!).backlinks.map((link) => link.title)).toEqual(["Trip notes"]);
    expect((await home.api("GET", "/api/search?q=anchor")).body.total).toBeGreaterThan(0);

    // A page edited only on the drive is updated; what home had is kept in the record.
    expect(await noteText(home, ids.kit!)).toContain("spare gas canister");
    expect(notes.get(ids.kit!).tags).toEqual(["Gear"]);
    const undoOfKit = home.ctx.sqlite
      .prepare("SELECT undo FROM drive_merge_actions WHERE home_item_id = ? AND outcome = 'updated'")
      .get(ids.kit) as { undo: string };
    expect(undoOfKit.undo).toContain("Stove, fuel, matches.");

    // The conflict: home's version is untouched, the drive's arrives beside it, named for where it came from.
    expect(await noteText(home, ids.both!)).toContain("Good holding in sand.");
    const sibling = notes.tree().find((page) => page.title.startsWith("Anchorages (from drive usb/Outpost, "));
    expect(sibling).toBeDefined();
    expect(await noteText(home, sibling!.id)).toContain("Poor holding in the north bay.");

    // Deleted on the drive: still here.
    expect(notes.get(ids.doomed!).trashedAt).toBeNull();
    expect(notes.get(ids.doomedChild!).trashedAt).toBeNull();
    expect(maps.annotations.listMarkers().map((marker) => marker.name)).toContain("Wreck");
    // Moved on the drive: moved here too.
    expect(notes.get(ids.mover!).parentId).toBe(ids.log);

    expect(documents.get(ids.tides!)).toMatchObject({ title: "Tide tables 2026", tags: ["dover", "tides"] });
    const markers = maps.annotations.listMarkers();
    expect(markers.find((marker) => marker.name === "Cove")).toMatchObject({ lat: 54.4, lon: -3.5, noteId: ids.trip });
    expect(markers.find((marker) => marker.name === "Harbour")!.note).toBe("Fuel berth; closed on Sundays");
    expect(
      maps.annotations
        .listTracks()
        .map((track) => track.name)
        .sort(),
    ).toEqual(["Coast path", "Ridge walk (north side)"]);

    // The record says what was done, in words.
    const said = merged.report!.actions.map((action) => `${action.kind} ${action.outcome}: ${action.title}`);
    expect(said).toContain("page added: Trip notes");
    expect(said).toContain("page kept: Old plans");
    expect(said.some((line) => line.startsWith("page copied: Anchorages (from drive"))).toBe(true);
    expect(said).toContain("attachment added: sketch.png");
    expect(fs.existsSync(path.join(home.ctx.config.dataDir, "merges", merged.id))).toBe(false);

    // Nothing on the drive was written, moved or removed.
    expect(fingerprintOf(world.drive)).toEqual(before);

    // The same drive again: nothing new.
    const again = await preview(world);
    expect(itemsOf(again)).toEqual([]);
    expect(again.analysis!.alreadyMerged).toBeGreaterThan(5);
    const count = () => (home.ctx.sqlite.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n;
    const pagesBefore = count();
    const second = await commit(world, again);
    expect(second.state).toBe("completed");
    expect(count()).toBe(pagesBefore);
    expect(fingerprintOf(world.drive)).toEqual(before);

    // More work on the same drive after the merge, without updating it: only that comes next time.
    await world.travel(async (_away, api) => {
      await api("PATCH", `/api/notes/${ids.trip}`, { content: textDoc("Rewritten on the second leg.") });
      await api("PATCH", `/api/notes/${ids.both}`, { content: textDoc("The drive's Anchorages, changed again.") });
    });
    const third = await preview(world);
    expect(summary(third)).toEqual([`page edited: ${sibling!.title}`, "page edited: Trip notes"].sort());
    await commit(world, third);
    expect(await noteText(home, ids.trip!)).toBe("Rewritten on the second leg.");
    // The drive's line of the conflict carries on in the page that was made for it; home's is still home's.
    expect(await noteText(home, sibling!.id)).toBe("The drive's Anchorages, changed again.");
    expect(await noteText(home, ids.both!)).toContain("Good holding in sand.");
  });

  it("follows each choice: keep home, use the drive's, tick a deletion, leave something on the drive", async () => {
    const world = await makeWorld();
    const { home, ids } = world;
    await goTravelling(world);
    await home.api("PATCH", `/api/notes/${ids.both}`, { content: textDoc("Home's Anchorages.") });
    await home.api("POST", "/api/notes", {
      title: "Home sub-page",
      parentId: ids.doomed,
      content: textDoc("Added at home under a page the drive deleted."),
    });
    await home.ctx.services.maps.annotations.updateMarker(ids.harbour!, { note: "Home's note" });
    const before = fingerprintOf(world.drive);

    const merge = await preview(world);
    const conflict = find(merge, "page", "conflict");
    const place = find(merge, "place", "conflict");
    expect(place.title).toBe("Harbour");
    const doomed = find(merge, "page", "deleted");
    expect(doomed.notes.join(" ")).toMatch(/1 sub-page at home was not deleted on the drive and would go to the trash with it/);
    const choices: Record<string, MergeChoice> = {
      [conflict.key]: "drive",
      [place.key]: "home",
      [doomed.key]: "apply",
      [find(merge, "place", "deleted").key]: "apply",
      [find(merge, "page", "added", "Trip day two").key]: "skip",
      [find(merge, "track", "added").key]: "skip",
    };

    // Removing anything at home needs the person to have said so twice.
    const refused = await home.api("POST", `/api/merge/${merge.id}/commit`, { choices });
    expect(refused.status).toBe(409);
    expect(refused.body.error.details).toMatchObject({ needsConfirmation: true, removing: ["Old plans", "Wreck"] });
    expect((await home.api("POST", `/api/merge/${merge.id}/commit`, { choices: { [conflict.key]: "apply" } })).status).toBe(400);
    expect((await home.api("POST", `/api/merge/${merge.id}/commit`, { choices: { "page:nope": "skip" } })).status).toBe(400);

    const merged = await commit(world, merge, choices, true);
    expect(merged.state).toBe("completed");
    const { notes, maps } = home.ctx.services;
    expect(await noteText(home, ids.both!)).toContain("Poor holding in the north bay.");
    expect(notes.tree().some((page) => page.title.startsWith("Anchorages (from drive"))).toBe(false);
    expect(maps.annotations.listMarkers().find((marker) => marker.name === "Harbour")!.note).toBe("Home's note");
    // Ticked deletions: the page is in the trash (not gone), the place is removed.
    expect(notes.get(ids.doomed!).trashedAt).not.toBeNull();
    expect(notes.listTrash().map((page) => page.title)).toEqual(["Old plans"]);
    expect(maps.annotations.listMarkers().map((marker) => marker.name)).not.toContain("Wreck");
    expect(notes.tree().some((page) => page.title === "Trip day two")).toBe(false);
    expect(maps.annotations.listTracks().map((track) => track.name)).not.toContain("Coast path");
    expect(fingerprintOf(world.drive)).toEqual(before);

    // What was left on the drive is offered again; what was decided is not asked again.
    const again = await preview(world);
    expect(summary(again)).toEqual(["page added: Trip day two", "track added: Coast path"]);

    // Undo puts back what can be put back, from the record.
    const undone = (await home.api("POST", `/api/merge/${merged.id}/undo`, {})).body.merge as MergeDto;
    expect(undone.undoneAt).not.toBeNull();
    expect(await noteText(home, ids.both!)).toBe("Home's Anchorages.");
    expect(notes.get(ids.doomed!).trashedAt).toBeNull();
    expect(notes.get(ids.trip!).trashedAt).not.toBeNull();
    expect(await noteText(home, ids.kit!)).toBe("Stove, fuel, matches.");
    expect(notes.get(ids.mover!).parentId).toBeNull();
    expect(maps.annotations.listMarkers().map((marker) => marker.name)).toContain("Wreck");
    expect(maps.annotations.listMarkers().map((marker) => marker.name)).not.toContain("Cove");
    // A copied document is a file: it stays unless the person asks for it to go.
    expect(home.ctx.services.documents.list({ q: "Pilot" }).documents).toHaveLength(1);
    expect(undone.report!.actions.find((action) => action.kind === "document" && action.outcome === "added")).toMatchObject({
      undo: "left",
    });
    expect((await home.api("POST", `/api/merge/${merged.id}/undo`, {})).status).toBe(409);
    expect(fingerprintOf(world.drive)).toEqual(before);
  });

  it("undo never overwrites what was written since: the earlier version comes back as its own page", async () => {
    const world = await makeWorld();
    const { home, ids } = world;
    await goTravelling(world);
    const merged = await commit(world, await preview(world));
    await home.api("PATCH", `/api/notes/${ids.kit}`, { content: textDoc("Edited at home after the merge.") });
    const undone = (await home.api("POST", `/api/merge/${merged.id}/undo`, { removeDocuments: true })).body.merge as MergeDto;
    expect(await noteText(home, ids.kit!)).toBe("Edited at home after the merge.");
    const earlier = home.ctx.services.notes.tree().find((page) => page.title.startsWith("Kit list (as it was before the merge of "));
    expect(earlier).toBeDefined();
    expect(await noteText(home, earlier!.id)).toBe("Stove, fuel, matches.");
    expect(home.ctx.services.documents.list({ q: "Pilot" }).documents).toHaveLength(0);
    expect(undone.report!.actions.find((action) => action.title === "Tide tables 2026")).toMatchObject({ undo: "done" });
    expect(home.ctx.services.documents.get(ids.tides!).title).toBe("Tide tables");
  });

  it("does not overwrite a page that changed at home between the preview and the merge", async () => {
    const world = await makeWorld();
    const { home, ids } = world;
    await goTravelling(world);
    const merge = await preview(world);
    await home.api("PATCH", `/api/notes/${ids.kit}`, { content: textDoc("Changed while the preview was open.") });
    const merged = await commit(world, merge);
    expect(await noteText(home, ids.kit!)).toBe("Changed while the preview was open.");
    expect(merged.report!.actions.find((action) => action.title === "Kit list")).toMatchObject({ outcome: "skipped" });
    // It is a conflict now, and says so next time.
    expect(find(await preview(world), "page", "conflict").title).toBe("Kit list");
  });

  it("does nothing when the drive has been unplugged, and carries on when it is back", async () => {
    const world = await makeWorld();
    const { home, ids } = world;
    await goTravelling(world);
    const merge = await preview(world);
    const pages = home.ctx.services.notes.tree().length;
    const elsewhere = `${world.drive}-unplugged`;
    fs.renameSync(world.drive, elsewhere);

    const waiting = await commit(world, merge);
    expect(waiting.state).toBe("ready");
    expect(waiting.error).toMatch(/drive is not connected, so nothing was brought back/);
    expect(waiting.report).toBeNull();
    expect(home.ctx.services.notes.tree()).toHaveLength(pages);
    expect(await noteText(home, ids.kit!)).toBe("Stove, fuel, matches.");

    fs.renameSync(elsewhere, world.drive);
    const merged = await commit(world, waiting);
    expect(merged.state).toBe("completed");
    expect(merged.error).toBeNull();
    expect(merged.report!.counts.failed).toBe(0);
    expect(await noteText(home, ids.kit!)).toContain("spare gas canister");
  });

  it("stops, rather than bring pages without their pictures, when the drive goes part-way through", async () => {
    const world = await makeWorld();
    const { home } = world;
    await goTravelling(world);
    const merge = await preview(world);
    const elsewhere = `${world.drive}-unplugged`;
    const sent = await home.api("POST", `/api/merge/${merge.id}/commit`, { choices: {} });
    expect(sent.status).toBe(200);
    // The job has not run yet: the drive is there when it starts, and gone when it reaches the first file.
    const unsubscribe = home.ctx.events.subscribe((event) => {
      if (event.type === "job.updated" && fs.existsSync(world.drive) && (event.data as { state?: string }).state === "running") {
        fs.renameSync(world.drive, elsewhere);
      }
    });
    await home.ctx.jobs.whenIdle();
    unsubscribe();
    const after = (await home.api("GET", `/api/merge/${merge.id}`)).body.merge as MergeDto;
    expect(after.state).toBe("failed");
    expect(after.error).toMatch(/drive was disconnected before everything had been brought back/);
    expect(home.ctx.services.notes.tree().some((page) => page.title === "Trip notes")).toBe(false);
    expect(home.ctx.services.documents.list({ q: "Pilot" }).documents).toEqual([]);

    fs.renameSync(elsewhere, world.drive);
    const again = await commit(world, await preview(world));
    expect(again.state).toBe("completed");
    expect(home.ctx.services.notes.get(world.ids.trip!).title).toBe("Trip notes");
    expect(home.ctx.sqlite.prepare("SELECT count(*) AS n FROM attachments").get()).toEqual({ n: 1 });
  });

  it("can be stopped part-way, leaving a whole library and a record of how far it got", async () => {
    const world = await makeWorld();
    const { home } = world;
    await goTravelling(world);
    const before = fingerprintOf(world.drive);
    const merge = await preview(world);

    const sent = await home.api("POST", `/api/merge/${merge.id}/commit`, { choices: {} });
    const jobId = sent.body.merge.job.id as string;
    let stopped = false;
    const unsubscribe = home.ctx.events.subscribe((event) => {
      // The first page has just been written: stop now.
      if (event.type === "notes.changed" && !stopped) {
        stopped = true;
        home.ctx.jobs.cancel(jobId);
      }
    });
    await home.ctx.jobs.whenIdle();
    unsubscribe();

    const after = (await home.api("GET", `/api/merge/${merge.id}`)).body.merge as MergeDto;
    expect(after.state).toBe("stopped");
    expect((await home.api("GET", `/api/jobs/${jobId}`)).body.job.state).toBe("cancelled");
    const done = after.report!.actions.filter((action) => action.kind === "page");
    expect(done.map((action) => `${action.outcome}: ${action.title}`)).toEqual(["added: Trip notes"]);
    // Whole: the page that was added is complete and indexed, its sub-page simply is not here yet.
    const { notes } = home.ctx.services;
    expect(notes.get(world.ids.trip!).children).toEqual([]);
    expect(notes.get(world.ids.kit!).content).toEqual(textDoc("Stove, fuel, matches."));
    expect(home.ctx.sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(fingerprintOf(world.drive)).toEqual(before);

    // Carrying on is another look at the drive: what was done is not done twice.
    const rest = await preview(world);
    expect(summary(rest)).not.toContain("page added: Trip notes");
    expect(summary(rest)).toContain("page added: Trip day two");
    const finished = await commit(world, rest);
    expect(finished.state).toBe("completed");
    expect(notes.get(world.ids.trip!).children.map((child) => child.title)).toEqual(["Trip day two"]);
    expect(notes.tree().filter((page) => page.title === "Trip notes")).toHaveLength(1);
    expect(fingerprintOf(world.drive)).toEqual(before);
  });

  it("offers a collection downloaded on the drive, off by default, and copies it with its checksum when asked", async () => {
    const world = await makeWorld();
    const { home } = world;
    const archive = Buffer.from("ZIM archive bytes that stand in for a reference collection");
    await world.travel(async (away) => {
      const location = away.ctx.services.storage.getDefault();
      const relPath = "collections/zim/knots.zim";
      fs.mkdirSync(path.dirname(path.join(location.path, relPath)), { recursive: true });
      fs.writeFileSync(path.join(location.path, relPath), archive);
      const now = Date.now();
      away.ctx.db
        .insert(collections)
        .values({
          id: "c-knots",
          kind: "zim",
          title: "Knots",
          locationId: location.id,
          relPath,
          sizeBytes: archive.length,
          sha256: createHash("sha256").update(archive).digest("hex"),
          meta: { zim: { bookName: "knots", uuid: "0000" } },
          installedAt: now,
          updatedAt: now,
        })
        .run();
    });
    const before = fingerprintOf(world.drive);
    const merge = await preview(world);
    const offered = find(merge, "collection", "added");
    expect(offered).toMatchObject({ title: "Knots", defaultChoice: "skip", bytes: archive.length, blocked: null });
    await commit(world, merge);
    expect(home.ctx.services.collections.list()).toEqual([]);

    const again = await preview(world);
    const merged = await commit(world, again, { [find(again, "collection", "added").key]: "apply" });
    expect(merged.report!.actions.map((action) => `${action.kind} ${action.outcome}`)).toEqual(["collection added"]);
    const [copied] = home.ctx.services.collections.list();
    expect(copied).toMatchObject({ title: "Knots", kind: "zim", status: "installed" });
    expect(fs.readFileSync(home.ctx.services.collections.absolutePath(copied!.id)).equals(archive)).toBe(true);
    expect(itemsOf(await preview(world))).toEqual([]);
    expect(fingerprintOf(world.drive)).toEqual(before);
  });
});

describe("a drive that was updated from home", () => {
  it("has nothing to bring back afterwards, and still offers the notes it held before", async () => {
    const world = await makeWorld();
    const { home, ids } = world;
    await goTravelling(world);
    // Updated without bringing anything back first: what the drive held is set aside on the drive.
    await world.writeDrive();
    const before = fingerprintOf(world.drive);

    const inspected = (await home.api("GET", `/api/merge/inspect?path=${encodeURIComponent(world.drive)}`)).body;
    expect(inspected.drive.sources.map((source: { current: boolean }) => source.current)).toEqual([true, false]);
    const kept = inspected.drive.sources[1].folder as string;
    expect(kept).toMatch(/^data-before-update-/);

    expect(itemsOf(await preview(world))).toEqual([]);

    const older = await preview(world, kept);
    expect(older.baseline).toBe("recorded");
    expect(summary(older)).toContain("page added: Trip notes");
    expect(summary(older)).toContain("page edited: Kit list");
    const merged = await commit(world, older);
    expect(merged.report!.counts.failed).toBe(0);
    expect(await noteText(home, ids.kit!)).toContain("spare gas canister");
    expect(home.ctx.services.notes.get(ids.trip!).title).toBe("Trip notes");
    // Its documents are still in the drive's library folder, which an update leaves alone.
    expect(home.ctx.services.documents.list({ q: "Pilot" }).documents).toHaveLength(1);
    expect(itemsOf(await preview(world, kept))).toEqual([]);
    expect(fingerprintOf(world.drive)).toEqual(before);
  });

  it("brings changes back, is updated, and then matches home", async () => {
    const world = await makeWorld();
    await goTravelling(world);
    await commit(world, await preview(world));
    await world.writeDrive();
    const merge = await preview(world);
    expect(itemsOf(merge)).toEqual([]);
    expect(merge.analysis!.homeOnly).toEqual({ pages: 0, documents: 0, places: 0, tracks: 0 });
  });
});

/** Makes a drive look as one written before drives carried a record: the tables are not there at all. */
function forgetBaseline(drive: string): void {
  const db = new Database(path.join(drive, "data/outpost.db"));
  try {
    db.exec("DROP TABLE drive_baseline; DROP TABLE library_meta; DROP TABLE drive_merge_actions; DROP TABLE drive_merges;");
    db.exec("DELETE FROM __drizzle_migrations WHERE id = (SELECT max(id) FROM __drizzle_migrations)");
  } finally {
    db.close();
  }
}

describe("a drive made before drives carried a record", () => {
  it("is compared by content and dates, and what cannot be decided is a conflict", async () => {
    const world = await makeWorld();
    const { home, ids } = world;
    // The clocks of the two computers are the only evidence there is; let them move on.
    await new Promise((resolve) => setTimeout(resolve, 30));
    await goTravelling(world);
    forgetBaseline(world.drive);
    await home.api("PATCH", `/api/notes/${ids.both}`, { content: textDoc("Home's Anchorages.") });
    await home.api("PATCH", `/api/notes/${ids.homeEdit}`, { content: textDoc("Call at nine.") });
    await home.api("POST", "/api/notes", { title: "Written at home", content: textDoc("After the drive left.") });
    // A page that differs with nothing in the dates to say why: both sides claim to be older than the drive.
    const stale = new Database(path.join(world.drive, "data/outpost.db"));
    stale
      .prepare("UPDATE notes SET content = ?, content_text = 'Mystery', updated_at = created_at WHERE id = ?")
      .run(JSON.stringify(textDoc("Mystery")), ids.plan);
    stale.close();
    const before = fingerprintOf(world.drive);

    const merge = await preview(world);
    expect(merge.baseline).toBe("dates");
    const lines = summary(merge);
    expect(lines).toContain("page added: Trip notes");
    expect(lines).toContain("page edited: Kit list");
    expect(lines).toContain("page conflict: Anchorages");
    expect(lines).toContain("page conflict: Passage plan");
    expect(find(merge, "page", "conflict", "Passage plan")).toMatchObject({ conflict: "unsure", defaultChoice: "both" });
    expect(lines).toContain("page deleted: Old plans");
    expect(lines).toContain("document added: Pilot notes");
    expect(lines).toContain("place added: Cove");
    expect(lines).toContain("place deleted: Wreck");
    // Pages made at home since are not "deleted on the drive", and a page edited only at home is left alone.
    expect(lines).not.toContain("page deleted: Written at home");
    expect(lines.some((line) => line.includes("Radio schedule"))).toBe(false);
    // Without a record there is no saying where a page used to be, so moves are not guessed at.
    expect(lines.some((line) => line.startsWith("page moved"))).toBe(false);

    const merged = await commit(world, merge);
    expect(merged.report!.counts.failed).toBe(0);
    expect(await noteText(home, ids.plan!)).toBe("Leave on the ebb.");
    expect(home.ctx.services.notes.tree().some((page) => page.title.startsWith("Passage plan (from drive"))).toBe(true);
    expect(home.ctx.services.notes.get(ids.doomed!).trashedAt).toBeNull();
    expect(itemsOf(await preview(world))).toEqual([]);
    expect(fingerprintOf(world.drive)).toEqual(before);
  });
});

describe("a drive from somewhere else", () => {
  it("made by another library: nothing on it is taken for an older copy of something here", async () => {
    const world = await makeWorld();
    const other = await makeWorld();
    await other.travel(async (_away, api) => {
      await api("POST", "/api/notes", { title: "A stranger's page", content: textDoc("From another Outpost.") });
    });
    // The other library's drive, plugged in here.
    const visiting = path.join(world.home.dir, "storage", "visitor", "Outpost");
    fs.cpSync(other.drive, visiting, { recursive: true });
    const before = fingerprintOf(visiting);
    const started = await world.home.api("POST", "/api/merge", { path: visiting });
    await world.home.ctx.jobs.whenIdle();
    const merge = (await world.home.api("GET", `/api/merge/${started.body.merge.id}`)).body.merge as MergeDto;
    expect(merge.baseline).toBe("other-library");
    const lines = summary(merge);
    expect(lines).toContain("page added: A stranger's page");
    expect(lines).toContain("page added: Passage plan");
    expect(lines.some((line) => line.includes("deleted"))).toBe(false);
    const count = () => (world.home.ctx.sqlite.prepare("SELECT count(*) AS n FROM notes").get() as { n: number }).n;
    const pages = count();
    await commit({ ...world, drive: visiting }, merge);
    expect(count()).toBe(pages + 10);
    // Home's own page of the same name is untouched.
    expect(await noteText(world.home, world.ids.plan!)).toBe("Leave on the ebb.");
    expect(fingerprintOf(visiting)).toEqual(before);
  });

  it("a page with the same id as one at home is not the same page", async () => {
    const world = await makeWorld();
    const { home, ids } = world;
    // On the drive, a new page happens to carry the id of a page made at home after the drive left.
    const mine = (await home.api("POST", "/api/notes", { title: "Mine", content: textDoc("Home's own page.") })).body.note.id as string;
    await world.travel(async (away) => {
      away.ctx.sqlite
        .prepare(
          "INSERT INTO notes (id, title, content, content_text, position, created_at, updated_at) VALUES (?, 'Theirs', ?, 'x', 99, ?, ?)",
        )
        .run(
          mine,
          JSON.stringify(doc(para(words("See "), { type: "pageLink", attrs: { noteId: ids.plan, label: "plan" } }))),
          Date.now(),
          Date.now(),
        );
    });
    const merge = await preview(world);
    expect(summary(merge)).toEqual(["page added: Theirs"]);
    await commit(world, merge);
    const pages = home.ctx.services.notes.tree();
    expect(await noteText(home, mine)).toBe("Home's own page.");
    const theirs = pages.find((page) => page.title === "Theirs")!;
    expect(theirs.id).not.toBe(mine);
    expect(itemsOf(await preview(world))).toEqual([]);
  });

  it("refuses, clearly, a drive made by a newer Outpost or one whose notes it cannot read", async () => {
    const world = await makeWorld();
    await goTravelling(world);
    const dbFile = path.join(world.drive, "data/outpost.db");
    const edit = (sql: string) => {
      const db = new Database(dbFile);
      db.exec(sql);
      db.close();
    };
    edit("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('from-the-future', 99999999999999)");
    let before = fingerprintOf(world.drive);
    const newer = await preview(world);
    expect(newer.state).toBe("failed");
    expect(newer.error).toMatch(/made by a newer Outpost \(0\.1\.0\).*Update this Outpost/);
    expect(fingerprintOf(world.drive)).toEqual(before);

    edit("DELETE FROM __drizzle_migrations WHERE hash = 'from-the-future'; ALTER TABLE markers RENAME COLUMN note TO remarks;");
    before = fingerprintOf(world.drive);
    const older = await preview(world);
    expect(older.state).toBe("failed");
    expect(older.error).toMatch(/whose notes this one cannot read/);

    fs.writeFileSync(dbFile, "this is not a database at all");
    const junk = await preview(world);
    expect(junk.state).toBe("failed");
    expect(junk.error).toMatch(/damaged or is not an Outpost database/);
    // Nothing was added, and the copy that was being read is gone.
    expect(world.home.ctx.services.notes.tree()).toHaveLength(9);
    expect(fs.readdirSync(path.join(world.home.ctx.config.dataDir, "merges"))).toEqual([]);
  });
});

describe("a hostile drive", () => {
  it("cannot reach outside itself, overfill a page, run anything, or smuggle tables in", async () => {
    const world = await makeWorld();
    const { home, ids } = world;
    await goTravelling(world);
    const secret = path.join(home.dir, "secret.txt");
    fs.writeFileSync(secret, "the owner's private file");

    const db = new Database(path.join(world.drive, "data/outpost.db"));
    const insertNote = db.prepare(
      "INSERT INTO notes (id, title, content, content_text, position, created_at, updated_at) VALUES (?, ?, ?, '', 50, ?, ?)",
    );
    const now = Date.now();
    // A file name that climbs out of the drive, for a document and for a picture.
    db.prepare("UPDATE documents SET rel_path = ? WHERE id = ?").run(path.relative(path.join(world.drive, "library"), secret), ids.pilot);
    db.prepare("UPDATE attachments SET rel_path = ? WHERE id = ?").run("../../../../../../secret.txt", ids.sketch);
    // A page far larger than a page can be.
    insertNote.run("huge", "Enormous", JSON.stringify(textDoc("x".repeat(6 * 1024 * 1024))), now, now);
    // A page that tries to carry script, a foreign node and a link scheme that runs code.
    insertNote.run(
      "sneaky",
      "Sneaky",
      JSON.stringify(
        doc(
          { type: "script", content: [words("alert(1)")] },
          para({ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }),
          { type: "image", attrs: { src: "javascript:alert(2)", onerror: "alert(3)" } },
          para(words("plain words survive")),
        ),
      ),
      now,
      now,
    );
    insertNote.run("notjson", "Not JSON", "{{{{", now, now);
    // Rows of the wrong shape, a table Outpost never made, and a trigger and a view that should never run.
    db.prepare("INSERT INTO notes (id, title, content, content_text, position, created_at, updated_at) VALUES (?, ?, ?, '', 1, ?, ?)").run(
      "../../etc/passwd",
      "Bad id",
      "{}",
      now,
      now,
    );
    db.exec(`
      CREATE TABLE smuggled (id TEXT PRIMARY KEY, payload TEXT);
      INSERT INTO smuggled VALUES ('1', 'DROP TABLE notes');
      CREATE VIEW loud AS SELECT * FROM smuggled;
      CREATE TRIGGER boom AFTER INSERT ON notes BEGIN DELETE FROM notes; END;
      INSERT INTO markers (id, name, note, lat, lon, color, is_favorite, created_at, updated_at) VALUES ('m-far', 'Nowhere', '', 5000, 9000, 'teal', 0, ${now}, ${now});
      INSERT INTO tracks (id, name, description, color, geojson, distance_meters, point_count, created_at, updated_at)
        VALUES ('t-bad', 'Broken track', '', 'teal', '{"type":"FeatureCollection","features":[{"geometry":{"type":"Polygon","coordinates":"<x>"}}]}', 0, 0, ${now}, ${now});
    `);
    db.close();
    // A link on the drive that points at a file elsewhere on this computer.
    const linked = path.join(world.drive, "library", "documents", "linked");
    fs.mkdirSync(linked, { recursive: true });
    fs.symlinkSync(secret, path.join(linked, "secret.txt"));
    expect(await fileInside(path.join(world.drive, "library"), "documents/linked/secret.txt")).toBeNull();
    expect(await fileInside(path.join(world.drive, "library"), "../../secret.txt")).toBeNull();

    const before = fingerprintOf(world.drive);
    const merge = await preview(world);
    expect(merge.state).toBe("ready");
    expect(find(merge, "document", "added").blocked).toMatch(/not on the drive/);
    expect(find(merge, "page", "added", "Enormous")).toMatchObject({ choices: ["skip"] });
    expect(find(merge, "page", "added", "Enormous").blocked).toMatch(/larger than a page can be/);
    expect(find(merge, "page", "added", "Not JSON").blocked).toMatch(/could not be read/);
    expect(merge.analysis!.warnings.join(" ")).toMatch(/1 record on the drive could not be read/);
    // A blocked item cannot be forced through.
    expect(
      (await home.api("POST", `/api/merge/${merge.id}/commit`, { choices: { [find(merge, "page", "added", "Enormous").key]: "apply" } }))
        .status,
    ).toBe(400);

    const merged = await commit(world, merge);
    expect(merged.state).toBe("completed");
    const { notes } = home.ctx.services;
    const pages = notes.tree();
    expect(pages.some((page) => page.title === "Enormous" || page.title === "Not JSON" || page.title === "Bad id")).toBe(false);
    const sneaky = JSON.stringify(notes.get("sneaky").content);
    expect(sneaky).toContain("plain words survive");
    expect(sneaky).not.toMatch(/javascript:|onerror|script|alert\(3\)/);
    // The picture's path left the drive, so it was not copied; the page came without it and the record says so.
    expect(home.ctx.sqlite.prepare("SELECT count(*) AS n FROM attachments").get()).toEqual({ n: 0 });
    expect(merged.report!.actions.find((action) => action.title === "Trip notes")!.message).toMatch(
      /1 picture or file in it could not be copied/,
    );
    expect(home.ctx.services.documents.list({ q: "Pilot" }).documents).toEqual([]);
    for (const file of fs.readdirSync(path.join(home.ctx.config.dataDir), { recursive: true }) as string[]) {
      const full = path.join(home.ctx.config.dataDir, file);
      if (fs.statSync(full).isFile() && fs.statSync(full).size < 1000) expect(fs.readFileSync(full, "utf8")).not.toContain("private file");
    }
    const failed = merged.report!.actions.filter((action) => action.outcome === "failed").map((action) => action.title);
    expect(failed.sort()).toEqual(["Broken track", "Nowhere"]);
    // Home's own tables are as they were: nothing came across but rows of the kinds a merge reads.
    expect(home.ctx.sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('smuggled', 'loud', 'boom')").all()).toEqual([]);
    expect(notes.get(ids.plan!).title).toBe("Passage plan");
    expect(fs.readFileSync(secret, "utf8")).toBe("the owner's private file");
    expect(fingerprintOf(world.drive)).toEqual(before);
  });

  it("reads the newest changes from a drive that was pulled out without stopping Outpost", async () => {
    const world = await makeWorld();
    const { home } = world;
    // What an unclean stop leaves: the last writes are in the write-ahead log, not in the database file.
    const dbFile = path.join(world.drive, "data/outpost.db");
    const live = new Database(dbFile);
    live.pragma("journal_mode = WAL");
    live.pragma("wal_autocheckpoint = 0");
    const now = Date.now();
    live
      .prepare(
        "INSERT INTO notes (id, title, content, content_text, position, created_at, updated_at) VALUES ('late', 'Written last', ?, 'x', 60, ?, ?)",
      )
      .run(JSON.stringify(textDoc("Only in the log.")), now, now);
    fs.copyFileSync(`${dbFile}-wal`, `${dbFile}-wal.kept`);
    fs.copyFileSync(dbFile, `${dbFile}.kept`);
    live.close();
    fs.renameSync(`${dbFile}.kept`, dbFile);
    fs.renameSync(`${dbFile}-wal.kept`, `${dbFile}-wal`);
    fs.rmSync(`${dbFile}-shm`, { force: true });
    expect(fs.existsSync(`${dbFile}-wal`)).toBe(true);

    const before = fingerprintOf(world.drive);
    const merge = await preview(world);
    expect(summary(merge)).toEqual(["page added: Written last"]);
    await commit(world, merge);
    expect(await noteText(home, "late")).toBe("Only in the log.");
    // Not even the files SQLite likes to make beside a database appeared on the drive.
    expect(fingerprintOf(world.drive)).toEqual(before);
  });
});

describe("the comparison itself", () => {
  const page = (id: string, hash: string, extra: Partial<PageState> = {}): PageState => ({
    id,
    parentId: null,
    title: id,
    icon: null,
    coverAttachmentId: null,
    isTemplate: false,
    isFavorite: false,
    trashedAt: null,
    createdAt: 100,
    updatedAt: 100,
    tags: [],
    contentBytes: 10,
    hash,
    ...extra,
  });
  const snapshot = (pages: PageState[]): Snapshot => ({
    pages: new Map(pages.map((entry) => [entry.id, entry])),
    documents: new Map(),
    places: new Map(),
    tracks: new Map(),
    attachments: new Map(),
    collections: [],
    chapterDocumentIds: new Set(),
    unreadable: {},
  });
  const recorded = (pages: Array<[string, string]>) => ({
    madeFrom: "home",
    writtenAt: 500,
    pages: new Map(pages.map(([id, hash]) => [id, { hash, parentId: null, trashed: false }])),
    documents: new Map(),
    places: new Map(),
    tracks: new Map(),
  });

  it("uses the drive's record: who changed what is known, not guessed from dates", () => {
    const result = diffLibraries({
      mode: "recorded",
      writtenAt: 500,
      baseline: recorded([
        ["same", "a"],
        ["drive", "a"],
        ["home", "a"],
        ["both", "a"],
        ["agree", "a"],
        ["gone-home", "a"],
        ["gone-home-edited", "a"],
      ]),
      // Dates are deliberately misleading: the record decides.
      drive: snapshot([
        page("same", "a"),
        page("drive", "b", { updatedAt: 1 }),
        page("home", "a", { updatedAt: 9999 }),
        page("both", "b"),
        page("agree", "c"),
        page("gone-home", "a"),
        page("gone-home-edited", "b"),
        page("new", "n"),
        page("new-in-trash", "n", { trashedAt: 900 }),
      ]),
      home: snapshot([
        page("same", "a"),
        page("drive", "a", { updatedAt: 9999 }),
        page("home", "b", { updatedAt: 1 }),
        page("both", "c"),
        page("agree", "c"),
      ]),
      memory: new Map(),
    });
    expect(result.items.map((item) => `${item.change}:${item.driveItemId}:${item.conflict ?? ""}`).sort()).toEqual(
      ["edited:drive:", "conflict:both:both-edited", "conflict:gone-home-edited:deleted-at-home", "added:new:"].sort(),
    );
    expect(result.unchanged.pages).toBe(2);
    expect(result.homeOnly.pages).toBe(2);
  });

  it("remembers what an earlier merge of the same drive decided", () => {
    const input = {
      mode: "recorded" as const,
      writtenAt: 500,
      baseline: recorded([
        ["kept-home", "a"],
        ["kept-deleted", "a"],
      ]),
      drive: snapshot([page("kept-home", "b"), page("made", "n")]),
      home: snapshot([page("kept-home", "c"), page("kept-deleted", "a"), page("h-made", "n")]),
    };
    const memory = new Map([
      ["page:kept-home", { homeItemId: "kept-home", driveHash: "b", homeHash: null }],
      ["page:kept-deleted", { homeItemId: "kept-deleted", driveHash: "deleted", homeHash: null }],
      ["page:made", { homeItemId: "h-made", driveHash: "n", homeHash: "n" }],
    ]);
    expect(diffLibraries({ ...input, memory }).items).toEqual([]);
    expect(diffLibraries({ ...input, memory }).alreadyMerged).toBe(3);
    // The drive's page changes again after "keep home's": the two were left to differ, so it is a conflict, never a quiet update.
    const later = diffLibraries({ ...input, drive: snapshot([page("kept-home", "b2"), page("made", "n2")]), memory });
    expect(later.items.map((item) => `${item.change}:${item.driveItemId}:${item.homeItemId}`).sort()).toEqual([
      "conflict:kept-home:kept-home",
      "edited:made:h-made",
    ]);
  });

  it("without a record, a page older than the drive that home no longer has is a conflict, not a guess", () => {
    const result = diffLibraries({
      mode: "dates",
      writtenAt: 500,
      baseline: null,
      drive: snapshot([page("shared", "a"), page("old", "a"), page("new", "n", { createdAt: 900, updatedAt: 900 })]),
      home: snapshot([page("shared", "a"), page("home-old", "a"), page("home-new", "a", { createdAt: 900 })]),
      memory: new Map(),
    });
    expect(result.items.map((item) => `${item.change}:${item.driveItemId}:${item.conflict ?? ""}:${item.defaultChoice}`).sort()).toEqual(
      ["conflict:old:missing-at-home:both", "added:new::apply", "deleted:home-old::skip"].sort(),
    );
  });

  it("keeps only tags the library can hold, and only the parts of a track that are a track", () => {
    expect(safeTags(["Water", "water", "a,b", "x".repeat(60), "  ok  ", ""])).toEqual(["Water", "ok"]);
    const cleaned = cleanTrack(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Line", evil: "<script>" },
            geometry: {
              type: "LineString",
              coordinates: [
                [1, 2, 3],
                ["x", 2],
                [200, 100],
                [4, 5],
              ],
            },
          },
          { type: "Feature", properties: null, geometry: { type: "Polygon", coordinates: [] } },
        ],
      }),
    );
    expect(cleaned.features).toHaveLength(1);
    expect(cleaned.features[0]!.geometry.coordinates).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    expect(cleaned.features[0]!.properties).toEqual({ name: "Line" });
    expect(() => cleanTrack("not json")).toThrow(/could not be read/);
  });
});
