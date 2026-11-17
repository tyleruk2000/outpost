/**
 * The regular check of storage locations runs on a quiet server for months. It must not
 * tell every open screen that storage changed when only a little free space came and
 * went, and it must not crawl the storage roots every half minute for a drive that is away.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
