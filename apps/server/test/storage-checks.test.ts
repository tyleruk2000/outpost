/**
 * The regular check of storage locations runs on a quiet server for months. It must not
 * tell every open screen that storage changed when only a little free space came and
 * went, and it must not crawl the storage roots every half minute for a drive that is away.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOT_ANSWERING } from "../src/modules/storage/service.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

const GiB = 1024 ** 3;

function freeSpace(free: () => number) {
  const real = fs.promises.statfs.bind(fs.promises);
  return vi.spyOn(fs.promises, "statfs").mockImplementation((async (target: fs.PathLike) => {
    const stats = await real(target);
    // 1 KiB blocks, so that bavail * bsize is exactly what the test says.
    return { ...stats, bsize: 1024, blocks: (500 * GiB) / 1024, bavail: Math.round(free() / 1024) };
  }) as typeof fs.promises.statfs);
}

function changes(server: TestApp) {
  const seen: string[] = [];
  server.ctx.events.subscribe((event) => {
    if (event.type === "storage.changed") seen.push(event.type);
  });
  return seen;
}

describe("the regular storage check", () => {
  it("never announces free space moving, but records it once it has moved noticeably", async () => {
    app = await createTestApp();
    let free = 100 * GiB;
    freeSpace(() => free);
    await app.ctx.services.storage.refresh();
    const seen = changes(app);
    const shown = async () => (await app!.api("GET", "/api/storage/locations")).body.locations[0].freeBytes;

    free += 3 * 1024 * 1024; // a log line, a thumbnail
    await app.ctx.services.storage.refresh();
    expect(await shown()).toBe(100 * GiB);

    free -= 20 * GiB; // a download landed
    await app.ctx.services.storage.refresh();
    expect(await shown()).toBe(free);
    // Reading the list, or checking again, tells no other screen anything.
    await app.ctx.services.storage.refresh();
    expect(seen).toHaveLength(0);
  });

  it("records gigabytes freed on a large disk, which a download's choice of location reads", async () => {
    app = await createTestApp();
    let free = 100 * GiB;
    const real = fs.promises.statfs.bind(fs.promises);
    vi.spyOn(fs.promises, "statfs").mockImplementation((async (target: fs.PathLike) => {
      const stats = await real(target);
      return { ...stats, bsize: 1024, blocks: (4096 * GiB) / 1024, bavail: Math.round(free / 1024) };
    }) as typeof fs.promises.statfs);
    await app.ctx.services.storage.refresh();

    free += 10 * GiB; // a large collection removed, to make room for a download
    await app.api("POST", "/api/storage/refresh");
    expect((await app.api("GET", "/api/storage/locations")).body.locations[0].freeBytes).toBe(free);
  });

  it("does announce a location going away", async () => {
    app = await createTestApp();
    const storage = app.ctx.services.storage;
    const usb = path.join(app.dir, "storage", "usb");
    await storage.add({ name: "USB", path: usb, kind: "external" });
    const seen = changes(app);
    fs.rmSync(usb, { recursive: true, force: true });
    await storage.refresh();
    expect(seen).toHaveLength(1);
  });

  it("looks for a missing location's marker when asked, not on every tick", async () => {
    app = await createTestApp();
    const storage = app.ctx.services.storage;
    const elsewhere = path.join(app.dir, "storage", "usb");
    const added = await storage.add({ name: "USB", path: elsewhere, kind: "external" });
    fs.rmSync(elsewhere, { recursive: true, force: true });

    const readdir = vi.spyOn(fs.promises, "readdir");
    await storage.refresh();
    expect(storage.get(added.id).status).toBe("unavailable");
    const searched = readdir.mock.calls.length;
    expect(searched).toBeGreaterThan(0);

    readdir.mockClear();
    await storage.refresh({ search: false });
    await storage.refresh({ search: false });
    expect(readdir).not.toHaveBeenCalled();
    expect(storage.get(added.id).status).toBe("unavailable");
  });
});

/**
 * A network share whose server is switched off does not fail: every file call on it waits for the server, about ten
 * seconds a time on the first Raspberry Pi (18 November 2026). The check was made with calls that held the whole
 * server while they waited, so the map, on the device's own disk, stopped answering too. Here such a share is stood
 * in for by a location whose marker file is never read.
 */
describe("a location that stops answering", () => {
  function hangReadsUnder(folder: string) {
    const real = fs.promises.readFile.bind(fs.promises);
    const waiting: Array<() => void> = [];
    let hanging = true;
    const spy = vi.spyOn(fs.promises, "readFile").mockImplementation(((file: fs.PathLike, ...rest: unknown[]) => {
      if (hanging && String(file).startsWith(folder)) {
        return new Promise((resolve, reject) => {
          waiting.push(() => (real as (...args: unknown[]) => Promise<unknown>)(file, ...rest).then(resolve, reject));
        });
      }
      return (real as (...args: unknown[]) => Promise<unknown>)(file, ...rest);
    }) as typeof fs.promises.readFile);
    return {
      spy,
      /** The server answers again: what was waiting goes through. */
      answer() {
        hanging = false;
        for (const go of waiting.splice(0)) go();
      },
      get waiting() {
        return waiting.length;
      },
    };
  }

  it("is given up on in time, said to be not answering, and does not hold up the server or the other locations", async () => {
    app = await createTestApp({ OUTPOST_STORAGE_PROBE_TIMEOUT_MS: "300" });
    const storage = app.ctx.services.storage;
    const share = path.join(app.dir, "storage", "nas");
    const added = await storage.add({ name: "docs on the NAS", path: share, kind: "network" });
    const internal = storage.list().find((location) => location.id !== added.id)!;
    const seen = changes(app);
    const nas = hangReadsUnder(share);

    const started = Date.now();
    // Meanwhile the server answers as usual: the check is not holding it.
    const [, health] = await Promise.all([storage.refresh(), app.api("GET", "/api/health")]);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(health.status).toBe(200);
    expect(storage.get(added.id)).toMatchObject({ status: "unavailable", statusDetail: NOT_ANSWERING });
    expect(storage.get(internal.id).status).toBe("available");
    expect(seen).toHaveLength(1);
    // A file asked for there now fails at once, saying why, rather than waiting on the share.
    expect(() => storage.resolve(added.id, "documents/a.pdf")).toThrow(/"docs on the NAS" is not connected/);

    // The next checks do not pile more waiting calls onto a share that has not answered the last.
    const before = nas.waiting;
    await storage.refresh({ search: false });
    await storage.refresh({ search: false });
    expect(nas.waiting).toBe(before);
    expect(seen).toHaveLength(1);

    // It answers again: the check that was waiting finds it, and every open screen is told.
    nas.answer();
    await vi.waitFor(() => expect(storage.get(added.id).status).toBe("available"));
    await vi.waitFor(() => expect(seen).toHaveLength(2));
  });
});
