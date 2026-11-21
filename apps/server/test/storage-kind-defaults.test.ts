import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

describe("a storage location for each kind of content", () => {
  let app: TestApp;
  let nas: { id: string; name: string };
  let internalId: string;

  beforeEach(async () => {
    app = await createTestApp();
    internalId = app.ctx.services.storage.getDefault().id;
    nas = (await app.api("POST", "/api/storage/locations", { name: "NAS", path: path.join(app.dir, "storage", "nas"), kind: "network" })).body
      .location;
  });
  afterEach(() => app.close());

  it("sends a kind with a location of its own there, and every other kind to the default", async () => {
    const { storage } = app.ctx.services;
    expect(storage.defaultFor("documents").id).toBe(internalId);

    const set = await app.api("PUT", "/api/storage/kind-defaults", { kind: "documents", locationId: nas.id });
    expect(set.status).toBe(200);
    expect(set.body.kindDefaults).toEqual({ documents: nas.id });
    expect(storage.defaultFor("documents").id).toBe(nas.id);
    expect(storage.defaultFor("maps").id).toBe(internalId);

    const listed = (await app.api("GET", "/api/storage/locations")).body.locations as Array<{ id: string; defaultFor: string[] }>;
    expect(listed.find((location) => location.id === nas.id)?.defaultFor).toEqual(["documents"]);
    expect(listed.find((location) => location.id === internalId)?.defaultFor).toEqual([]);

    // A document added with no location chosen goes where documents are set to go.
    const source = path.join(app.dir, "water.md");
    fs.writeFileSync(source, "# Water\n\nBoil it.");
    const added = await app.ctx.services.documents.ingestFile({ sourcePath: source, originalName: "water.md" });
    await app.ctx.jobs.whenIdle();
    expect(added.document?.locationId).toBe(nas.id);

    // Back to the default.
    await app.api("PUT", "/api/storage/kind-defaults", { kind: "documents", locationId: null });
    expect(storage.defaultFor("documents").id).toBe(internalId);
  });

  it("refuses a location that does not exist or a kind that is not one, and forgets a location that is removed", async () => {
    expect((await app.api("PUT", "/api/storage/kind-defaults", { kind: "maps", locationId: "nowhere" })).status).toBe(404);
    expect((await app.api("PUT", "/api/storage/kind-defaults", { kind: "socks", locationId: nas.id })).status).toBe(400);

    await app.api("PUT", "/api/storage/kind-defaults", { kind: "maps", locationId: nas.id });
    expect((await app.api("DELETE", `/api/storage/locations/${nas.id}`)).status).toBe(200);
    expect(app.ctx.services.settings.get("storage.kindDefaults")).toEqual({});
    expect(app.ctx.services.storage.defaultFor("maps").id).toBe(internalId);
  });
});
