import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultCatalogDir } from "../src/core/paths.ts";
import { loadCatalog } from "../src/modules/catalog/manifest.ts";
import { loadPacks } from "../src/modules/catalog/packs.ts";
import { buildPdf } from "./fixtures/documents/builders.ts";
import { type FileServer, startFileServer, waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
let server: FileServer | undefined;
afterEach(async () => {
  await app?.close();
  await server?.close();
  app = undefined;
  server = undefined;
});

const entry = (id: string, name: string, source: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  description: `${name}, for the tests.`,
  category: "preparedness",
  publisher: "Tests",
  language: "en",
  format: "pdf",
  license: "Public domain",
  attribution: "Tests",
  homepage: "https://example.org/",
  lastVerified: "2026-11-15",
  source,
  ...extra,
});

/** A small catalogue: two PDFs on a local server, a sheet that ships with the app, and packs over them. */
async function setup(packs: unknown) {
  app = await createTestApp();
  server = await startFileServer();
  const files = { first: buildPdf([["First aid at home"]]), water: buildPdf([["Making water safe"]]) };
  server.routes.set("/first.pdf", { body: files.first });
  server.routes.set("/water.pdf", { body: files.water, chunkBytes: 100, delayMs: 5 });
  const catalogDir = path.join(app.dir, "catalog");
  fs.mkdirSync(path.join(catalogDir, "manifests"), { recursive: true });
  fs.mkdirSync(path.join(catalogDir, "bundled"), { recursive: true });
  fs.writeFileSync(path.join(catalogDir, "bundled", "channels.md"), "# Radio channels\n\nChannel 16 is for distress.\n");
  const http = (name: keyof typeof files) => ({
    type: "http",
    url: server!.url(`/${name}.pdf`),
    sha256: createHash("sha256").update(files[name]).digest("hex"),
    sizeBytes: files[name].length,
  });
  fs.writeFileSync(
    path.join(catalogDir, "manifests", "test.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "test",
      name: "Test",
      description: "Test",
      maintainers: ["Tests"],
      downloadHosts: ["127.0.0.1"],
      entries: [
        entry("t.first-aid", "First aid at home", http("first")),
        entry("t.water", "Making water safe", http("water")),
        entry(
          "t.channels",
          "Radio channels",
          { type: "bundled", file: "channels.md", version: "1" },
          { format: "markdown", category: "radio" },
        ),
      ],
    }),
  );
  fs.writeFileSync(path.join(catalogDir, "packs.json"), JSON.stringify(packs));
  app.ctx.services.catalog.reload();
  return app;
}

const starter = {
  id: "starter",
  name: "Starter",
  description: "The first things to fetch.",
  entries: ["t.first-aid", "t.water", "t.channels"],
};

describe("the packs that ship with Outpost", () => {
  it("are made only of things the catalogue really lists", () => {
    const catalog = loadCatalog([path.join(defaultCatalogDir, "manifests")]);
    const { packs, problems } = loadPacks([path.join(defaultCatalogDir, "packs.json")], new Set(catalog.entries.map((item) => item.id)));
    expect(problems).toEqual([]);
    expect(packs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(packs.map((pack) => pack.id)).size).toBe(packs.length);
    expect(new Set(packs.map((pack) => pack.name)).size).toBe(packs.length);
    for (const pack of packs) {
      expect(pack.entryIds.length, pack.id).toBeGreaterThanOrEqual(3);
      expect(new Set(pack.entryIds).size, pack.id).toBe(pack.entryIds.length);
      // A pack is a starting point: nothing in it should need a whole evening to fetch on a home connection.
      const sizes = pack.entryIds.map((id) => catalog.entries.find((item) => item.id === id)?.sizeBytes ?? 0);
      expect(Math.max(...sizes), pack.id).toBeLessThan(1_500_000_000);
    }
  });
});

describe("packs", () => {
  it("are listed with the catalogue, without the entries nobody can find", async () => {
    const target = await setup({
      schemaVersion: 1,
      packs: [starter, { id: "odd", name: "Odd", description: "Names things that are not there.", entries: ["t.water", "t.nowhere"] }],
    });
    const { body } = await target.api("GET", "/api/catalog");
    expect(body.packs).toEqual([
      { id: "starter", name: "Starter", description: "The first things to fetch.", entryIds: ["t.first-aid", "t.water", "t.channels"] },
      { id: "odd", name: "Odd", description: "Names things that are not there.", entryIds: ["t.water"] },
    ]);
    expect(body.problems).toEqual([expect.objectContaining({ file: "packs.json", message: expect.stringMatching(/"odd".*t\.nowhere/) })]);
  });

  it("carries on without packs when the file is missing or broken", async () => {
    const target = await setup("this is not a packs file");
    const { body } = await target.api("GET", "/api/catalog");
    expect(body.packs).toEqual([]);
    expect(body.entries).toHaveLength(3);
    expect(body.problems[0]).toMatchObject({ file: "packs.json" });
  });

  it("fetches everything in a pack that is not already here, in one request", async () => {
    const target = await setup({ schemaVersion: 1, packs: [starter] });
    // One of the three is already installed.
    const first = await target.api("POST", "/api/catalog/entries/t.first-aid/download", {});
    await waitFor(() => target.ctx.services.downloads.get(first.body.download.id)?.state === "completed", "the first download", 15_000);

    const got = await target.api("POST", "/api/catalog/packs/starter/install", {});
    expect(got.status).toBe(200);
    expect(got.body.queued.map((download: { catalogEntryId: string }) => download.catalogEntryId)).toEqual(["t.water"]);
    // The sheet that ships with Outpost is simply added: nothing to wait for.
    expect(got.body.added).toEqual([{ entryId: "t.channels", name: "Radio channels", documentId: expect.any(String) }]);
    expect(got.body.already).toBe(1);
    expect(got.body.failed).toEqual([]);

    await waitFor(() => target.ctx.services.downloads.get(got.body.queued[0].id)?.state === "completed", "the pack's download", 15_000);
    const after = (await target.api("GET", "/api/catalog")).body.entries;
    expect(after.map((item: { status: string }) => item.status)).toEqual(["installed", "installed", "installed"]);

    // Asking again finds nothing left to do.
    const again = await target.api("POST", "/api/catalog/packs/starter/install", {});
    expect(again.body).toMatchObject({ queued: [], added: [], already: 3, failed: [] });
  });

  it("takes only the chosen items, and does not start a second copy of one already on its way", async () => {
    const target = await setup({ schemaVersion: 1, packs: [starter] });
    const chosen = await target.api("POST", "/api/catalog/packs/starter/install", { entryIds: ["t.water"] });
    expect(chosen.body.queued).toHaveLength(1);
    expect(chosen.body.added).toEqual([]);
    const again = await target.api("POST", "/api/catalog/packs/starter/install", { entryIds: ["t.water"] });
    expect(again.body).toMatchObject({ queued: [], already: 1 });
    expect(target.ctx.services.downloads.list().filter((row) => row.catalogEntryId === "t.water")).toHaveLength(1);

    expect((await target.api("POST", "/api/catalog/packs/starter/install", { entryIds: ["t.elsewhere"] })).status).toBe(400);
    expect((await target.api("POST", "/api/catalog/packs/nope/install", {})).status).toBe(404);
  });

  it("reports the items it could not start and still starts the rest", async () => {
    const target = await setup({ schemaVersion: 1, packs: [starter] });
    const location = target.ctx.services.storage.getDefault();
    // Something is in the way of one file.
    fs.mkdirSync(path.join(location.path, "collections", "files"), { recursive: true });
    fs.writeFileSync(path.join(location.path, "collections", "files", "first.pdf"), "already here");
    const got = await target.api("POST", "/api/catalog/packs/starter/install", {});
    expect(got.status).toBe(200);
    expect(got.body.failed).toEqual([{ entryId: "t.first-aid", name: "First aid at home", reason: expect.any(String) }]);
    expect(got.body.queued.map((download: { catalogEntryId: string }) => download.catalogEntryId)).toEqual(["t.water"]);
    expect(got.body.added).toHaveLength(1);
  });
});
