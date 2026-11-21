/**
 * Storage roots are the boundary set when the server starts, and they can change
 * between starts. A location recorded outside them must not go on being used there.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const MARKER = ".outpost-location.json";

let dir: string;
let app: TestApp | undefined;

beforeEach(() => {
  dir = tempDir("outpost-roots-");
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Starts (or restarts) the server on the same data directory with the given roots. */
async function start(...roots: string[]): Promise<TestApp> {
  await app?.close();
  app = await createTestApp({ OUTPOST_STORAGE_ROOTS: roots.map((root) => path.join(dir, root)).join(",") }, dir);
  return app;
}

async function locations(server: TestApp) {
  const { body } = await server.api("GET", "/api/storage/locations");
  return body.locations as Array<{ id: string; name: string; path: string; status: string; statusDetail: string | null }>;
}

/** A server whose library lives under "old", holding one file a person put there. */
async function withLibraryInOld(): Promise<{ id: string; oldPath: string }> {
  const server = await start("old");
  const oldPath = path.join(dir, "old", "library");
  const created = await server.api("POST", "/api/storage/locations", {
    name: "Library",
    path: oldPath,
    kind: "external",
    makeDefault: true,
  });
  expect(created.status).toBe(200);
  fs.writeFileSync(path.join(oldPath, "kept.txt"), "a person's file");
  return { id: created.body.location.id, oldPath };
}

describe("a location recorded outside the storage roots", () => {
  it("is relinked at start to a copy, marker included, inside the roots", async () => {
    const { id, oldPath } = await withLibraryInOld();
    const newPath = path.join(dir, "new", "library");
    fs.cpSync(oldPath, newPath, { recursive: true });

    const server = await start("new");
    const library = (await locations(server)).find((location) => location.id === id)!;
    expect(library).toMatchObject({ status: "available", path: newPath, statusDetail: null });
    // Files are read and written at the new place, never at the old one.
    expect(server.ctx.services.storage.resolve(id, "kept.txt")).toBe(path.join(newPath, "kept.txt"));
    // Nothing was moved or deleted: the old folder is exactly as it was.
    expect(fs.readFileSync(path.join(oldPath, "kept.txt"), "utf8")).toBe("a person's file");
    expect(fs.existsSync(path.join(oldPath, MARKER))).toBe(true);
  });

  it("is not used where it was, and says why, when there is no copy inside the roots", async () => {
    const { id, oldPath } = await withLibraryInOld();

    // The old folder is still there with the right marker in it, but it is no longer allowed.
    let server = await start("new");
    let library = (await locations(server)).find((location) => location.id === id)!;
    expect(library.status).toBe("unavailable");
    expect(library.path).toBe(oldPath);
    expect(library.statusDetail).toMatch(/outside the folders Outpost is allowed to use/);
    expect(library.statusDetail).toContain("OUTPOST_STORAGE_ROOTS");
    expect(() => server.ctx.services.storage.resolve(id, "kept.txt")).toThrow(/not connected/);
    expect(server.ctx.services.storage.isAvailable(id)).toBe(false);
    // Its record is kept, like any disconnected location's.
    expect((await locations(server)).map((location) => location.name)).toContain("Library");

    // A copy made while the server runs is picked up by the next check.
    const newPath = path.join(dir, "new", "library");
    fs.cpSync(oldPath, newPath, { recursive: true });
    const refreshed = await server.api("POST", "/api/storage/refresh");
    library = refreshed.body.locations.find((location: { id: string }) => location.id === id);
    expect(library).toMatchObject({ status: "available", path: newPath });

    // Without the copy, it comes back when the roots include the old place again.
    fs.rmSync(newPath, { recursive: true });
    server = await start("new");
    expect((await locations(server)).find((location) => location.id === id)!.status).toBe("unavailable");
    server = await start("new", "old");
    library = (await locations(server)).find((location) => location.id === id)!;
    expect(library).toMatchObject({ status: "available", path: oldPath, statusDetail: null });
    expect(fs.readFileSync(path.join(oldPath, "kept.txt"), "utf8")).toBe("a person's file");
  });

  it("is not relinked when two folders inside the roots carry its marker", async () => {
    const { id, oldPath } = await withLibraryInOld();
    const first = path.join(dir, "new", "copy-a");
    const second = path.join(dir, "new", "deeper", "copy-b");
    fs.cpSync(oldPath, first, { recursive: true });
    fs.cpSync(oldPath, second, { recursive: true });

    const server = await start("new");
    let library = (await locations(server)).find((location) => location.id === id)!;
    expect(library.status).toBe("unavailable");
    expect(library.path).toBe(oldPath);
    expect(library.statusDetail).toMatch(/Two folders carry this location's marker/);
    expect(library.statusDetail).toContain(first);
    expect(library.statusDetail).toContain(second);

    // Once the person has decided which one it is, the next check uses it.
    fs.rmSync(path.join(first, MARKER));
    const refreshed = await server.api("POST", "/api/storage/refresh");
    library = refreshed.body.locations.find((location: { id: string }) => location.id === id);
    expect(library).toMatchObject({ status: "available", path: second, statusDetail: null });
  });

  it("is relinked when the two folders are one folder reached two ways", async () => {
    // A network share connected twice shows one folder at two paths. The marker is then
    // the very same file through both, which a hard link stands in for here.
    const { id, oldPath } = await withLibraryInOld();
    const first = path.join(dir, "new", "mount-a");
    const second = path.join(dir, "new", "mount-b");
    fs.cpSync(oldPath, first, { recursive: true });
    fs.mkdirSync(second, { recursive: true });
    fs.linkSync(path.join(first, MARKER), path.join(second, MARKER));

    const server = await start("new");
    const library = (await locations(server)).find((location) => location.id === id)!;
    expect(library).toMatchObject({ status: "available", statusDetail: null });
    expect([first, second]).toContain(library.path);
  });

  it("refuses to add a folder outside the roots, as before", async () => {
    const server = await start("new");
    const outside = await server.api("POST", "/api/storage/locations", { name: "Old", path: path.join(dir, "old", "x"), kind: "external" });
    expect(outside.status).toBe(403);
  });
});

describe("a location inside the storage roots", () => {
  it("is unaffected, across restarts and with a second root added", async () => {
    let server = await start("old");
    const inside = path.join(dir, "old", "library");
    const created = await server.api("POST", "/api/storage/locations", { name: "Library", path: inside, kind: "external" });
    server = await start("old", "new");
    const library = (await locations(server)).find((location) => location.id === created.body.location.id)!;
    expect(library).toMatchObject({ status: "available", path: inside, statusDetail: null });
    // The location made on first start is where it was too.
    expect((await locations(server)).every((location) => location.status === "available")).toBe(true);
  });

  it("that has moved is still found by its marker, and a second copy is still not chosen silently", async () => {
    const server = await start("old");
    const usb = path.join(dir, "old", "usb");
    const created = await server.api("POST", "/api/storage/locations", { name: "USB", path: usb, kind: "external" });
    const id = created.body.location.id as string;

    fs.renameSync(usb, path.join(dir, "old", "usb-renamed"));
    let refreshed = await server.api("POST", "/api/storage/refresh");
    expect(refreshed.body.locations.find((location: { id: string }) => location.id === id)).toMatchObject({
      status: "available",
      path: path.join(dir, "old", "usb-renamed"),
    });

    // While the location is where it was recorded, a stray copy elsewhere changes nothing.
    fs.cpSync(path.join(dir, "old", "usb-renamed"), path.join(dir, "old", "usb-copy"), { recursive: true });
    refreshed = await server.api("POST", "/api/storage/refresh");
    expect(refreshed.body.locations.find((location: { id: string }) => location.id === id)).toMatchObject({
      status: "available",
      path: path.join(dir, "old", "usb-renamed"),
    });
  });
});

describe("a symbolic link inside a root that leads outside it", () => {
  // macOS puts one in the default root itself: /Volumes/Macintosh HD is a link to /.
  // Through it every folder on the computer would be "inside /Volumes".
  async function withLinkOut(): Promise<{ server: TestApp; through: string; outside: string }> {
    const server = await start("vol");
    const outside = path.join(dir, "outside");
    fs.mkdirSync(path.join(outside, "home", "secret"), { recursive: true });
    fs.symlinkSync(outside, path.join(dir, "vol", "Macintosh HD"));
    return { server, through: path.join(dir, "vol", "Macintosh HD"), outside };
  }

  it("cannot be browsed through", async () => {
    const { server, through } = await withLinkOut();
    const listing = await server.api("GET", `/api/storage/browse?path=${encodeURIComponent(path.join(through, "home"))}`);
    expect(listing.status).toBe(403);
    expect(JSON.stringify(listing.body)).not.toContain("secret");
  });

  it("cannot be made a storage location, and nothing is written there", async () => {
    const { server, through, outside } = await withLinkOut();
    const added = await server.api("POST", "/api/storage/locations", { name: "Home", path: path.join(through, "home"), kind: "external" });
    expect(added.status).toBe(403);
    expect(fs.readdirSync(path.join(outside, "home"))).toEqual(["secret"]);
  });

  it("cannot be chosen for a portable drive or looked at as one", async () => {
    const { server, through } = await withLinkOut();
    const plan = await server.api("POST", "/api/portable/plan", { targetPath: path.join(through, "drive"), platforms: ["linux-x64"] });
    expect(plan.status).toBe(403);
    const inspect = await server.api("GET", `/api/merge/inspect?path=${encodeURIComponent(path.join(through, "home"))}`);
    expect(inspect.status).toBe(403);
  });

  it("does not stop a folder reached through a link that stays inside the roots", async () => {
    const server = await start("vol");
    fs.mkdirSync(path.join(dir, "vol", "real", "library"), { recursive: true });
    fs.symlinkSync(path.join(dir, "vol", "real"), path.join(dir, "vol", "alias"));
    const added = await server.api("POST", "/api/storage/locations", {
      name: "Alias",
      path: path.join(dir, "vol", "alias", "library"),
      kind: "external",
    });
    expect(added.status).toBe(200);
  });
});

describe("a symbolic link inside a storage location", () => {
  it("is followed to another location or under the roots, and refused when it leads anywhere else", async () => {
    const server = await start("media");
    const usb = path.join(dir, "media", "usb");
    const nas = path.join(dir, "media", "nas");
    const elsewhere = path.join(dir, "home-folder");
    for (const folder of [usb, nas, elsewhere]) fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(elsewhere, "secret.txt"), "private");
    fs.writeFileSync(path.join(nas, "map.pmtiles"), "tiles");
    const created = await server.api("POST", "/api/storage/locations", { name: "USB", path: usb, kind: "external" });
    expect(created.status).toBe(200);
    const id = created.body.location.id as string;
    fs.symlinkSync(elsewhere, path.join(usb, "escape"));
    fs.symlinkSync(nas, path.join(usb, "on-the-nas"));

    const storage = server.ctx.services.storage;
    await expect(storage.resolveFollowingLinks(id, "escape/secret.txt")).rejects.toThrow(/symbolic link to a folder outside every storage/);
    expect(await storage.resolveFollowingLinks(id, "on-the-nas/map.pmtiles")).toBe(path.join(usb, "on-the-nas", "map.pmtiles"));
    expect(await storage.resolveFollowingLinks(id, "plain/new-file.zim")).toBe(path.join(usb, "plain", "new-file.zim"));
    // And through the route a person uses: importing an archive from storage.
    const zim = await server.api("POST", "/api/kiwix/import", { locationId: id, relPath: "escape/secret.txt" });
    expect(zim.status).toBe(403);
  });
});
