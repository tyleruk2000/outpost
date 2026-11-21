/**
 * What each map layer holds: counted away from the server's thread and kept in the
 * database, so that the first map after a restart is answered from the kept count while
 * a fresh one is made in the background.
 */
import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SUMMARY_KEY } from "../src/modules/layers/summary.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const dir = tempDir("outpost-layers-summary-");
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const sheltersCount = async (app: TestApp) => {
  const response = await app.api("GET", "/api/reference/layers");
  expect(response.status).toBe(200);
  return (response.body.layers as Array<{ id: string; count: number }>).find((layer) => layer.id === "shelters")?.count ?? 0;
};

describe("the map layers' summary", () => {
  it("is counted after a change, kept in the database, answered from the kept copy after a restart, and counted again then", async () => {
    let app = await createTestApp({}, dir);
    const location = app.ctx.services.storage.getDefault();
    const root = app.ctx.services.storage.resolve(location.id, "");
    fs.mkdirSync(path.join(root, "imports"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "imports/shelters.csv"),
      [
        "name,lat,lon,layer,kind,country,provenance,publisher,license,accuracy",
        "Rest centre: Town Hall,51.5,-0.12,shelters,Rest centre,GB,public-record,Example Council,Open Government Licence v3.0,To the building",
      ].join("\n"),
    );
    expect(await sheltersCount(app)).toBe(0);
    const started = await app.api("POST", "/api/reference/imports/from-storage", {
      format: "features-csv",
      locationId: location.id,
      relPath: "imports/shelters.csv",
      title: "Rest centres",
      options: {},
    });
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    // The change dropped the kept count; the next request waits for the worker's new one.
    expect(await sheltersCount(app)).toBe(1);
    const kept = app.ctx.sqlite.prepare("SELECT value FROM library_meta WHERE key = ?").get(SUMMARY_KEY) as { value: string };
    expect(JSON.parse(kept.value).layers[0]).toMatchObject({ id: "shelters", count: 1, providers: [{ id: "import", count: 1 }] });
    await app.close();

    // A place added while Outpost was not looking (as if by another version) is not in the kept copy.
    app = await createTestApp({}, dir);
    app.ctx.sqlite
      .prepare(
        `INSERT INTO reference_features (collection_id, provider, source_id, layer, kind, name, alt_names, country, lat, lon, props,
          provenance, accuracy, publisher, license, retrieved_at)
         SELECT collection_id, provider, source_id || '-again', layer, kind, name, alt_names, country, lat, lon, props, provenance,
          accuracy, publisher, license, retrieved_at FROM reference_features LIMIT 1`,
      )
      .run();
    // Answered at once from what was kept, without counting.
    expect(await sheltersCount(app)).toBe(1);
    // What runs once the server is listening brings it up to date.
    await app.ctx.services.layers.countLayers();
    expect(await sheltersCount(app)).toBe(2);
    await app.close();
  });
});
