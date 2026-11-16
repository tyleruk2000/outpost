/**
 * Flood zones from the Environment Agency, as a reference layer: the estimate against a
 * local stand-in for its OGC API Features service (nothing here reaches the internet),
 * the file read in the service's own format, and the map's answers for them.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { ReferenceFeatureDetail, ReferenceOverlayResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DownloadRow } from "../src/modules/downloads/types.ts";
import { floodBoxRefusal } from "../src/modules/layers/adapters/flood-zones.ts";
import type { ReferenceMeta } from "../src/modules/layers/types.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const square = (west: number, south: number, size: number) => [
  [
    [west, south],
    [west + size, south],
    [west + size, south + size],
    [west, south + size],
    [west, south],
  ],
];

/** Made-up areas near Bedford, in the shape the service answers in (properties and ids as it gives them). */
const ANSWER = {
  type: "FeatureCollection",
  numberMatched: 3,
  numberReturned: 3,
  features: [
    {
      type: "Feature",
      id: "Flood_Zones_2_3_Rivers_and_Sea.1",
      properties: { origin: "modelled", flood_zone: "FZ3", flood_source: "river" },
      geometry: { type: "MultiPolygon", coordinates: [square(-0.47, 52.13, 0.004)] },
    },
    {
      type: "Feature",
      id: "Flood_Zones_2_3_Rivers_and_Sea.2",
      properties: { origin: "modelled and recorded", flood_zone: "FZ2", flood_source: "river" },
      geometry: { type: "MultiPolygon", coordinates: [square(-0.475, 52.125, 0.012)] },
    },
    {
      type: "Feature",
      id: "Flood_Zones_2_3_Rivers_and_Sea.3",
      properties: { flood_zone: "FZ1" },
      geometry: { type: "Polygon", coordinates: square(-0.4, 52.1, 0.01) },
    },
  ],
};

let app: TestApp;
let standIn: http.Server;
const asked: string[] = [];

beforeAll(async () => {
  standIn = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stand-in");
    asked.push(`${url.pathname}?${url.searchParams.toString()}`);
    response.writeHead(200, { "content-type": "application/geo+json", "content-crs": "<http://www.opengis.net/def/crs/OGC/1.3/CRS84>" });
    response.end(
      JSON.stringify(url.searchParams.get("limit") === "1" ? { ...ANSWER, numberReturned: 1, features: [ANSWER.features[0]] } : ANSWER),
    );
  });
  await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}/ogc/features/v1/collections/Flood_Zones_2_3_Rivers_and_Sea`;
  app = await createTestApp({ OUTPOST_FLOOD_ZONES_URL: base });
});
afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve) => standIn.close(() => resolve()));
});

async function install(relPath: string, meta: Partial<ReferenceMeta>) {
  const location = app.ctx.services.storage.getDefault();
  const root = app.ctx.services.storage.resolve(location.id, "");
  const filePath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(ANSWER));
  const reference: ReferenceMeta = {
    provider: "ea-flood-zones",
    key: "flood-zones:-0.48,52.12,-0.44,52.14",
    title: "Flood zones test",
    layers: ["flood-zones"],
    request: { provider: "ea-flood-zones", scope: { bbox: [-0.48, 52.12, -0.44, 52.14] } },
    countries: ["GB"],
    bbox: [-0.48, 52.12, -0.44, 52.14],
    sourceUrl: null,
    origin: "download",
    ...meta,
  };
  const download = {
    id: `test-${Math.random().toString(36).slice(2)}`,
    kind: "dataset",
    locationId: location.id,
    relPath,
    meta: { reference },
  };
  return app.ctx.services.layers.installer({
    download: download as unknown as DownloadRow,
    filePath,
    sizeBytes: fs.statSync(filePath).size,
    sha256: "0".repeat(64),
    signal: new AbortController().signal,
    progress: () => {},
  });
}

describe("flood zones from the Environment Agency", () => {
  it("refuses an area outside England or larger than about 20 km before asking anything", () => {
    expect(floodBoxRefusal([-3.3, 55.9, -3.1, 56.0])).toMatch(/England only/);
    expect(floodBoxRefusal([-1, 52, 0, 52.5])).toMatch(/too large/);
    expect(floodBoxRefusal([-0.48, 52.12, -0.44, 52.14])).toBeNull();
  });

  it("estimates by asking for one area and the count, states the size as about, and quotes the Agency's caveat", async () => {
    asked.length = 0;
    const estimate = await app.api("POST", "/api/reference/estimate", {
      provider: "ea-flood-zones",
      scope: { bbox: [-0.48, 52.12, -0.44, 52.14] },
    });
    expect(estimate.status).toBe(200);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("bbox=-0.48%2C52.12%2C-0.44%2C52.14");
    expect(asked[0]).toContain("limit=1");
    expect(estimate.body.items[0]).toMatchObject({ layers: ["flood-zones"], records: 3, bytes: 3 * 19_000, exact: false });
    expect(estimate.body.notes.join(" ")).toMatch(/England only/);
    expect(estimate.body.notes.join(" ")).toMatch(/not suitable for showing whether an individual property is at risk of flooding/);

    asked.length = 0;
    const tooBig = await app.api("POST", "/api/reference/estimate", { provider: "ea-flood-zones", scope: { bbox: [-1, 52, 0, 52.5] } });
    expect(tooBig.body.items).toEqual([]);
    expect(tooBig.body.notes.join(" ")).toMatch(/too large/);
    expect((await app.api("POST", "/api/reference/estimate", { provider: "ea-flood-zones", scope: { countries: ["GB"] } })).status).toBe(
      400,
    );
    expect(asked).toEqual([]);
  });

  it("reads the service's answer: zones 2 and 3 as areas with the Agency's words, Flood Zone 1 left out", async () => {
    const result = await install("collections/reference/flood-zones/test.geojson", {});
    expect(result).toBeTruthy();
    const close = (await app.api("GET", "/api/reference/features?bbox=-0.5,52.1,-0.4,52.16&zoom=13&layers=flood-zones"))
      .body as ReferenceOverlayResponse;
    expect(close.points).toEqual([]);
    expect(close.cells).toEqual([]);
    expect(close.floodZones).toBeNull();
    expect(close.shapes.map((shape) => shape.kind).sort()).toEqual(["ea:flood-zone-2", "ea:flood-zone-3"]);
    // Far out, they are not drawn, and the answer says why.
    const far = (await app.api("GET", "/api/reference/features?bbox=-2,51,1,53&zoom=8&layers=flood-zones"))
      .body as ReferenceOverlayResponse;
    expect(far.shapes).toEqual([]);
    expect(far.floodZones).toBe("zoom-in");

    const at = await app.api("GET", "/api/reference/at?lat=52.132&lon=-0.468&layers=flood-zones");
    expect(at.body.hits.map((hit: { name: string }) => hit.name)).toEqual(["Flood Zone 3, from rivers", "Flood Zone 2, from rivers"]);
    const detail = (await app.api("GET", `/api/reference/features/${at.body.hits[0].id}`)).body as ReferenceFeatureDetail;
    expect(JSON.stringify(detail)).toContain("1% (1 in 100) or greater annual probability of flooding from rivers");
    expect(JSON.stringify(detail)).toContain("not suitable for showing whether an individual property is at risk of flooding");
    expect(JSON.stringify(detail)).toContain("public-infrastructure");

    const layers = await app.api("GET", "/api/reference/layers");
    expect(layers.body.credits.map((credit: { text: string }) => credit.text)).toContain(
      "Flood zones: © Environment Agency copyright and/or database right 2025, OGL v3.0",
    );
  });
});
