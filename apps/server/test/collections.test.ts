import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CollectionRow, CreateCollection, MovedFrom } from "../src/modules/collections/index.ts";
import { hashTree } from "../src/modules/collections/transfer.ts";
import { testBytes, waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

let app: TestApp | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

const service = () => app!.ctx.services.collections;

/** Puts a file in a storage location and records it as a collection. */
async function install(
  body: Buffer,
  relPath = "collections/files/manual.bin",
  extra: Partial<CreateCollection> = {},
): Promise<CollectionRow> {
  const location = extra.locationId ? app!.ctx.services.storage.get(extra.locationId) : app!.ctx.services.storage.getDefault();
  const file = path.join(location.path, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return service().create({
    kind: "file",
    title: "Field manual",
    description: "Splints, tourniquets and wound care",
    category: "medicine",
    locationId: location.id,
    relPath,
    sha256: sha256(body),
    ...extra,
  });
}

async function addLocation(name = "USB drive", folder = "usb") {
  return app!.ctx.services.storage.add({ name, path: path.join(app!.dir, "storage", folder), kind: "external" });
}

async function finished(jobId: string) {
  return waitFor(() => {
    const job = app!.ctx.jobs.get(jobId)!;
    return ["succeeded", "failed", "cancelled"].includes(job.state) ? job : undefined;
  }, "the job to finish");
}

describe("installed collections", () => {
  it("lists collections with their location, size and state", async () => {
    app = await createTestApp();
    const body = testBytes(5000);
    const row = await install(body);
    await install(testBytes(100, 2), "maps/alps.pmtiles", { kind: "map", title: "Alps" });

    const all = await app.api("GET", "/api/collections");
    expect(all.body.collections).toHaveLength(2);
    const maps = await app.api("GET", "/api/collections?kind=map");
    expect(maps.body.collections.map((dto: { title: string }) => dto.title)).toEqual(["Alps"]);
    expect((await app.api("GET", "/api/collections?kind=nonsense")).status).toBe(400);

    const one = await app.api("GET", `/api/collections/${row.id}`);
    expect(one.body.collection).toMatchObject({
      id: row.id,
      kind: "file",
      title: "Field manual",
      category: "medicine",
      locationName: "Internal storage",
      locationAvailable: true,
      relPath: "collections/files/manual.bin",
      sizeBytes: 5000,
      sha256: sha256(body),
      status: "installed",
      updateAvailable: false,
    });
    expect((await app.api("GET", "/api/collections/nope")).status).toBe(404);
    expect(service().absolutePath(row.id)).toBe(path.join(app.ctx.services.storage.getDefault().path, "collections/files/manual.bin"));
  });

  it("refuses records for files that are not there, outside the location, or already recorded", async () => {
    app = await createTestApp();
    const row = await install(testBytes(10));
    const base = { kind: "file" as const, title: "x", locationId: row.locationId };
    await expect(service().create({ ...base, relPath: "missing.bin" })).rejects.toMatchObject({ code: "bad_request" });
    await expect(service().create({ ...base, relPath: "../outside.bin" })).rejects.toMatchObject({ code: "bad_request" });
    await expect(service().create({ ...base, relPath: "." })).rejects.toMatchObject({ code: "bad_request" });
    await expect(service().create({ ...base, relPath: row.relPath })).rejects.toMatchObject({ code: "conflict" });
  });

  it("is findable in search and leaves the index when removed", async () => {
    app = await createTestApp();
    const row = await install(testBytes(10));
    const found = await app.ctx.services.search.search({ q: "tourniquets" });
    expect(found.results[0]).toMatchObject({
      kind: "collection",
      entityId: row.id,
      url: `/library/collections/${row.id}`,
      collection: "medicine",
    });

    service().update(row.id, { description: "Knots and lashings" });
    expect((await app.ctx.services.search.search({ q: "tourniquets" })).results).toHaveLength(0);
    expect((await app.ctx.services.search.search({ q: "lashings" })).results).toHaveLength(1);

    await service().remove(row.id, { deleteFiles: false });
    expect((await app.ctx.services.search.search({ q: "lashings" })).results).toHaveLength(0);
  });

  it("tells listeners about installs and removals, and asks update checks", async () => {
    app = await createTestApp();
    const seen: string[] = [];
    service().onInstalled((collection) => void seen.push(`installed:${collection.title}`));
    service().onRemoved((collection, options) => void seen.push(`removed:${collection.title}:${options.deleteFiles}`));
    service().onInstalled(() => {
      throw new Error("a listener that fails must not break the install");
    });
    service().addUpdateCheck((collection) => collection.version === "2024-01");

    const old = await install(testBytes(10), "a.bin", { version: "2024-01" });
    const current = await install(testBytes(10), "b.bin", { version: "2026-10", title: "Current" });
    expect(service().toDto(old).updateAvailable).toBe(true);
    expect(service().toDto(current).updateAvailable).toBe(false);
    await service().remove(old.id, { deleteFiles: true });
    expect(seen).toEqual(["installed:Field manual", "installed:Current", "removed:Field manual:true"]);
  });
});

describe("verifying a collection", () => {
  it("confirms an intact file, flags a damaged one, and notices a missing one", async () => {
    app = await createTestApp();
    const body = testBytes(200_000);
    const row = await install(body);
    const file = service().absolutePath(row.id);

    const ok = await app.api("POST", `/api/collections/${row.id}/verify`);
    expect(ok.status).toBe(200);
    expect(ok.body.job).toMatchObject({ type: "collection.verify", queue: "transfer" });
    expect((await finished(ok.body.job.id)).result).toMatchObject({ outcome: "ok", sha256: sha256(body) });
    expect(service().get(row.id)).toMatchObject({ status: "installed" });
    expect(service().get(row.id)!.verifiedAt).toBeGreaterThan(0);

    // One flipped byte.
    const damaged = Buffer.from(body);
    damaged[1000] = damaged[1000]! ^ 0xff;
    fs.writeFileSync(file, damaged);
    const bad = await finished(service().verify(row.id).id);
    expect(bad.state).toBe("succeeded");
    expect(bad.result).toMatchObject({ outcome: "damaged" });
    expect(String(bad.result!.message)).toMatch(/no longer matches the checksum/);
    expect(service().get(row.id)!.status).toBe("damaged");
    expect((await app.api("GET", `/api/collections/${row.id}`)).body.collection.status).toBe("damaged");

    // Restored from a backup: a new check clears the flag.
    fs.writeFileSync(file, body);
    expect((await finished(service().verify(row.id).id)).result).toMatchObject({ outcome: "ok" });
    expect(service().get(row.id)!.status).toBe("installed");

    fs.rmSync(file);
    const gone = await finished(service().verify(row.id).id);
    expect(gone.result).toMatchObject({ outcome: "missing" });
    expect(service().get(row.id)!.status).toBe("missing");
  });

  it("records a checksum when none was known, and refuses when the drive is unplugged", async () => {
    app = await createTestApp();
    const usb = await addLocation();
    const body = testBytes(3000);
    const row = await install(body, "x.bin", { sha256: null, locationId: usb.id });
    expect(row.sha256).toBeNull();

    const job = await finished(service().verify(row.id).id);
    expect(job.result).toMatchObject({ outcome: "recorded", sha256: sha256(body) });
    expect(service().get(row.id)!.sha256).toBe(sha256(body));

    fs.renameSync(usb.path, path.join(app.dir, "unplugged"));
    await app.ctx.services.storage.refresh();
    const refused = await app.api("POST", `/api/collections/${row.id}/verify`);
    expect(refused.status).toBe(503);
    expect(refused.body.error.code).toBe("storage_unavailable");
    expect(service().get(row.id)!.status).toBe("installed");
  });
});

describe("moving a collection", () => {
  it("copies, verifies, switches over and only then removes the original", async () => {
    app = await createTestApp();
    const usb = await addLocation();
    const body = testBytes(700_000, 3);
    const row = await install(body, "collections/zim/big.zim", { kind: "zim" });
    const source = service().absolutePath(row.id);
    const moves: Array<{ to: string; from: MovedFrom; originalStillThere: boolean; status: string }> = [];
    service().onMoved((collection, from) => {
      moves.push({ to: collection.locationId, from, originalStillThere: fs.existsSync(from.path), status: collection.status });
    });

    const started = await app.api("POST", `/api/collections/${row.id}/move`, { locationId: usb.id });
    expect(started.status).toBe(200);
    expect(started.body.job).toMatchObject({ type: "collection.move", queue: "transfer" });
    const job = await finished(started.body.job.id);

    expect(job.state).toBe("succeeded");
    expect(job.result).toMatchObject({ originalRemoved: true, sha256: sha256(body) });
    const target = path.join(usb.path, "collections/zim/big.zim");
    expect(fs.existsSync(source)).toBe(false);
    expect(sha256(fs.readFileSync(target))).toBe(sha256(body));
    expect(fs.existsSync(`${target}.part`)).toBe(false);
    expect(service().get(row.id)).toMatchObject({
      locationId: usb.id,
      relPath: "collections/zim/big.zim",
      status: "installed",
      sizeBytes: body.length,
    });
    expect(service().absolutePath(row.id)).toBe(target);
    expect(moves).toEqual([
      {
        to: usb.id,
        from: { locationId: row.locationId, relPath: row.relPath, path: source },
        originalStillThere: true,
        status: "installed",
      },
    ]);
    expect((await app.api("GET", `/api/collections/${row.id}`)).body.collection.locationName).toBe("USB drive");
  });

  it("moves a folder collection, with everything inside it", async () => {
    app = await createTestApp();
    const usb = await addLocation();
    const root = app.ctx.services.storage.getDefault().path;
    const folder = path.join(root, "places/europe");
    fs.mkdirSync(path.join(folder, "tiles/deep"), { recursive: true });
    fs.mkdirSync(path.join(folder, "empty"));
    fs.writeFileSync(path.join(folder, "index.db"), testBytes(40_000, 4));
    fs.writeFileSync(path.join(folder, "tiles/deep/a.bin"), testBytes(9000, 5));
    fs.writeFileSync(path.join(folder, "tiles/b.bin"), "");
    const before = await hashTree(folder);
    const row = await service().create({
      kind: "places",
      title: "Places: Europe",
      locationId: app.ctx.services.storage.getDefault().id,
      relPath: "places/europe",
    });
    expect(row.sizeBytes).toBe(49_000);

    const job = await finished((await service().move(row.id, usb.id)).id);
    expect(job.state).toBe("succeeded");
    const target = path.join(usb.path, "places/europe");
    expect(await hashTree(target)).toEqual(before);
    expect(fs.statSync(path.join(target, "empty")).isDirectory()).toBe(true);
    expect(fs.existsSync(folder)).toBe(false);
    expect(service().get(row.id)).toMatchObject({ locationId: usb.id, sha256: before.sha256, status: "installed" });
  });

  it("leaves the original untouched and cleans up when the copy fails part-way", async () => {
    app = await createTestApp();
    const usb = await addLocation();
    const body = testBytes(3_000_000, 6);
    const row = await install(body, "collections/zim/big.zim", { kind: "zim" });
    const source = service().absolutePath(row.id);
    const moved = vi.fn();
    service().onMoved(moved);

    // The target drive fails after the first megabyte or so.
    const realCreate = fs.createWriteStream;
    let written = 0;
    vi.spyOn(fs, "createWriteStream").mockImplementation(((file: fs.PathLike, options?: unknown) => {
      const stream = realCreate(file, options as never);
      if (String(file).endsWith(".part")) {
        const realWrite = stream._write.bind(stream);
        stream._write = (chunk, encoding, callback) => {
          written += (chunk as Buffer).length;
          if (written > 1_500_000) callback(Object.assign(new Error("EIO: i/o error, write"), { code: "EIO" }));
          else realWrite(chunk, encoding, callback);
        };
      }
      return stream;
    }) as typeof fs.createWriteStream);

    const job = await finished((await service().move(row.id, usb.id)).id);

    expect(job.state).toBe("failed");
    expect(job.error).toMatch(/EIO/);
    expect(written).toBeGreaterThan(1_500_000);
    expect(sha256(fs.readFileSync(source))).toBe(sha256(body));
    const target = path.join(usb.path, "collections/zim/big.zim");
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(`${target}.part`)).toBe(false);
    expect(service().get(row.id)).toMatchObject({ locationId: row.locationId, relPath: row.relPath, status: "installed" });
    expect(moved).not.toHaveBeenCalled();

    // With the fault gone, the same move works.
    vi.restoreAllMocks();
    expect((await finished((await service().move(row.id, usb.id)).id)).state).toBe("succeeded");
    expect(sha256(fs.readFileSync(target))).toBe(sha256(body));
    expect(fs.existsSync(source)).toBe(false);
  });

  it("discards a copy that does not match the original", async () => {
    app = await createTestApp();
    const usb = await addLocation();
    const body = testBytes(300_000, 7);
    const row = await install(body, "big.bin");
    const source = service().absolutePath(row.id);

    // A drive that silently stores one wrong byte.
    const realCreate = fs.createWriteStream;
    vi.spyOn(fs, "createWriteStream").mockImplementation(((file: fs.PathLike, options?: unknown) => {
      const stream = realCreate(file, options as never);
      if (String(file).endsWith(".part")) {
        const realWrite = stream._write.bind(stream);
        let first = true;
        stream._write = (chunk, encoding, callback) => {
          const copy = Buffer.from(chunk as Buffer);
          if (first) copy[10] = copy[10]! ^ 0x01;
          first = false;
          realWrite(copy, encoding, callback);
        };
      }
      return stream;
    }) as typeof fs.createWriteStream);

    const job = await finished((await service().move(row.id, usb.id)).id);
    expect(job.state).toBe("failed");
    expect(job.error).toMatch(/did not match the original, so it was discarded/);
    expect(sha256(fs.readFileSync(source))).toBe(sha256(body));
    expect(fs.readdirSync(usb.path).filter((name) => !name.startsWith("."))).toEqual([]);
    expect(service().get(row.id)).toMatchObject({ locationId: row.locationId, status: "installed" });
  });

  it("puts everything back when the move is cancelled during the copy", async () => {
    app = await createTestApp();
    const usb = await addLocation();
    const body = testBytes(4_000_000, 8);
    const row = await install(body, "big.bin");
    const source = service().absolutePath(row.id);

    // Slow the target down so the cancel lands mid-copy.
    const realCreate = fs.createWriteStream;
    vi.spyOn(fs, "createWriteStream").mockImplementation(((file: fs.PathLike, options?: unknown) => {
      const stream = realCreate(file, options as never);
      if (String(file).endsWith(".part")) {
        const realWrite = stream._write.bind(stream);
        stream._write = (chunk, encoding, callback) =>
          void setTimeout(() => (stream.destroyed ? callback(null) : realWrite(chunk, encoding, callback)), 40);
      }
      return stream;
    }) as typeof fs.createWriteStream);

    const job = await service().move(row.id, usb.id);
    await waitFor(
      () => service().get(row.id)!.status === "moving" && fs.existsSync(path.join(usb.path, "big.bin.part")),
      "the copy to start",
    );
    await expect(service().remove(row.id, { deleteFiles: true })).rejects.toMatchObject({ code: "conflict" });
    app.ctx.jobs.cancel(job.id);

    expect((await finished(job.id)).state).toBe("cancelled");
    expect(fs.existsSync(path.join(usb.path, "big.bin.part"))).toBe(false);
    expect(fs.existsSync(path.join(usb.path, "big.bin"))).toBe(false);
    expect(sha256(fs.readFileSync(source))).toBe(sha256(body));
    expect(service().get(row.id)).toMatchObject({ locationId: row.locationId, status: "installed" });
  });

  it("refuses moves that cannot work, before starting", async () => {
    app = await createTestApp();
    const usb = await addLocation();
    const row = await install(testBytes(1000), "big.bin");

    expect((await app.api("POST", `/api/collections/${row.id}/move`, { locationId: row.locationId })).status).toBe(409);
    expect((await app.api("POST", `/api/collections/${row.id}/move`, { locationId: "nope" })).status).toBe(404);
    expect((await app.api("POST", `/api/collections/${row.id}/move`, {})).status).toBe(400);

    fs.writeFileSync(path.join(usb.path, "big.bin"), "someone's own file");
    const taken = await app.api("POST", `/api/collections/${row.id}/move`, { locationId: usb.id });
    expect(taken.status).toBe(409);
    expect(taken.body.error.message).toMatch(/will not overwrite/);
    expect(fs.readFileSync(path.join(usb.path, "big.bin"), "utf8")).toBe("someone's own file");
    fs.rmSync(path.join(usb.path, "big.bin"));

    fs.renameSync(usb.path, path.join(app.dir, "unplugged"));
    await app.ctx.services.storage.refresh();
    const unplugged = await app.api("POST", `/api/collections/${row.id}/move`, { locationId: usb.id });
    expect(unplugged.status).toBe(503);
    expect(service().get(row.id)!.status).toBe("installed");
  });
});

describe("removing a collection", () => {
  it("requires saying what happens to the file", async () => {
    app = await createTestApp();
    const row = await install(testBytes(100));
    const file = service().absolutePath(row.id);

    const vague = await app.api("DELETE", `/api/collections/${row.id}`);
    expect(vague.status).toBe(400);
    expect(vague.body.error.message).toMatch(/deleteFiles/);
    expect((await app.api("DELETE", `/api/collections/${row.id}?deleteFiles=maybe`)).status).toBe(400);
    expect(service().get(row.id)).toBeDefined();
    expect(fs.existsSync(file)).toBe(true);
  });

  it("removes only the record when deleteFiles is false", async () => {
    app = await createTestApp();
    const row = await install(testBytes(100));
    const file = service().absolutePath(row.id);

    const removed = await app.api("DELETE", `/api/collections/${row.id}?deleteFiles=false`);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ ok: true, deletedFiles: false });
    expect(service().get(row.id)).toBeUndefined();
    expect(fs.existsSync(file)).toBe(true);
  });

  it("deletes the file too when deleteFiles is true (query or body)", async () => {
    app = await createTestApp();
    const one = await install(testBytes(100), "one.bin");
    const two = await install(testBytes(100), "sub/two.bin");
    const fileOne = service().absolutePath(one.id);
    const fileTwo = service().absolutePath(two.id);

    expect((await app.api("DELETE", `/api/collections/${one.id}?deleteFiles=true`)).status).toBe(200);
    expect((await app.api("DELETE", `/api/collections/${two.id}`, { deleteFiles: true })).status).toBe(200);
    expect(fs.existsSync(fileOne)).toBe(false);
    expect(fs.existsSync(fileTwo)).toBe(false);
    expect(service().list()).toHaveLength(0);
    // Only the collection's own file goes; the folder it was in is not Outpost's to remove.
    expect(fs.existsSync(path.dirname(fileTwo))).toBe(true);
  });

  it("only allows removing the record while the storage location is unplugged", async () => {
    app = await createTestApp();
    const usb = await addLocation();
    const row = await install(testBytes(100), "x.bin", { locationId: usb.id });
    const unplugged = path.join(app.dir, "unplugged");
    fs.renameSync(usb.path, unplugged);
    await app.ctx.services.storage.refresh();

    const dto = (await app.api("GET", `/api/collections/${row.id}`)).body.collection;
    expect(dto).toMatchObject({ locationAvailable: false, status: "installed" });

    const withFiles = await app.api("DELETE", `/api/collections/${row.id}?deleteFiles=true`);
    expect(withFiles.status).toBe(503);
    expect(withFiles.body.error.message).toMatch(/not connected/);
    expect(service().get(row.id)).toBeDefined();

    expect((await app.api("DELETE", `/api/collections/${row.id}?deleteFiles=false`)).status).toBe(200);
    expect(fs.existsSync(path.join(unplugged, "x.bin"))).toBe(true);
  });
});

describe("keeping in step with storage", () => {
  it("marks a collection missing when its file goes from a connected location, and back", async () => {
    app = await createTestApp();
    const usb = await addLocation();
    const here = await install(testBytes(100), "here.bin");
    const away = await install(testBytes(100), "away.bin", { locationId: usb.id });
    const file = service().absolutePath(here.id);
    const aside = `${file}.aside`;

    fs.renameSync(file, aside);
    app.ctx.events.publish({ type: "storage.changed" });
    await waitFor(() => service().get(here.id)!.status === "missing", "the collection to be marked missing");

    fs.renameSync(aside, file);
    app.ctx.events.publish({ type: "storage.changed" });
    await waitFor(() => service().get(here.id)!.status === "installed", "the collection to come back");

    // An unplugged drive says nothing about the files on it.
    fs.renameSync(usb.path, path.join(app.dir, "unplugged"));
    await app.ctx.services.storage.refresh();
    await service().reconcile();
    expect(service().get(away.id)!.status).toBe("installed");
  });

  it("checks at startup", async () => {
    const first = await createTestApp();
    try {
      app = first;
      const row = await install(testBytes(100));
      const file = service().absolutePath(row.id);
      await first.app.close();
      fs.rmSync(file);

      app = await createTestApp({}, first.dir);
      expect(service().get(row.id)!.status).toBe("missing");
    } finally {
      await app?.close();
      app = undefined;
      fs.rmSync(first.dir, { recursive: true, force: true });
    }
  });
});
