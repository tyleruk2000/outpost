/**
 * How the repeater database behaves with a worldwide list: 50,000 made-up stations.
 *
 * It is a measurement, so it is not part of the ordinary run (a loaded machine would
 * make its timings mean nothing). Run it by hand:
 *
 *   OUTPOST_SCALE=1 pnpm exec vitest run test/repeaters-scale.test.ts
 *
 * It prints the time each thing took and checks only that the answers are right.
 */
import type { RepeaterImportResult, RepeaterListResponse, RepeaterOverlayResponse, SearchResponse } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const COUNT = 50_000;

/** The same numbers every run, so that timings can be compared. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function worldwideList(changed = false): string {
  const next = random(73);
  const bands: Array<[string, number, number, number]> = [
    ["2M", 145.6, 0.2, -0.6],
    ["70CM", 430.8, 8.6, 7.6],
    ["6M", 50.7, 0.2, 0.5],
    ["23CM", 1297, 0.4, -6],
  ];
  const modes = ["A", "A", "A", "AF", "M", "D", "F", "AM"];
  const tones = ["67.0", "71.9", "77.0", "82.5", "88.5", "94.8", "103.5", "110.9", "118.8", ""];
  const lines = [
    '"id","callsign","band","channel","TX MHz","RX MHz","magl","ERP[dBW]","modes","QTHR","where","postcode","ETCC region","ctcss","dmrcc","keeper","lat","lon","status",',
  ];
  for (let index = 0; index < COUNT; index += 1) {
    const [band, base, spread, shift] = bands[index % 10 < 4 ? 0 : index % 10 < 9 ? 1 : index % 2 ? 2 : 3]!;
    const output = base + Math.floor((next() * spread) / 0.0125) * 0.0125;
    // Land is where the people are: most of them between 60° south and 70° north.
    const lat = (next() * 130 - 60).toFixed(index % 7 === 0 ? 1 : 3);
    const lon = (next() * 360 - 180).toFixed(index % 7 === 0 ? 1 : 3);
    const mode = modes[Math.floor(next() * modes.length)]!;
    const tone = changed && index % 100 === 0 ? "123.0" : tones[Math.floor(next() * tones.length)]!;
    const status = next() < 0.92 ? "OPERATIONAL" : "NOT OPERATIONAL";
    lines.push(
      `${index + 1},QZ${index % 10}${index.toString(36).toUpperCase().padStart(4, "A")},${band},,${output.toFixed(6)},${(output + shift).toFixed(6)},${5 + (index % 30)},10,${mode},,TOWN ${index % 4000} ${index % 13 === 0 ? "MOOR" : "HILL"},,R${index % 50},${tone},${mode.includes("M") ? index % 16 : ""},QZ4K${index % 900},${lat},${lon},${status},`,
    );
  }
  return `${lines.join("\n")}\n`;
}

describe.runIf(process.env.OUTPOST_SCALE === "1")("repeaters at the size of a worldwide list", () => {
  let app: TestApp;
  const timings: Array<[string, number]> = [];

  async function timed<T>(label: string, work: () => Promise<T>, runs = 5): Promise<T> {
    let best = Number.POSITIVE_INFINITY;
    let result!: T;
    for (let run = 0; run < runs; run += 1) {
      const started = performance.now();
      result = await work();
      best = Math.min(best, performance.now() - started);
    }
    timings.push([label, best]);
    return result;
  }

  const get = async <T>(url: string) => (await app.api<T>("GET", url)).body;
  const send = (content: string, fields: Record<string, string>) => {
    const { payload, headers } = multipart(fields, [{ name: "world.csv", content, type: "text/csv" }]);
    return app.api<RepeaterImportResult>("POST", "/api/repeaters/import", payload, { headers });
  };

  beforeAll(async () => {
    app = await createTestApp();
  }, 60_000);
  afterAll(async () => {
    console.log(
      ["", `Repeaters, ${COUNT.toLocaleString("en-GB")} entries (best of several runs):`]
        .concat(timings.map(([label, ms]) => `  ${label.padEnd(58)} ${ms.toFixed(1).padStart(8)} ms`))
        .join("\n"),
    );
    await app.close();
  });

  it("imports, lists, draws, finds, exports and updates", async () => {
    const file = worldwideList();
    console.log(`  the file is ${(Buffer.byteLength(file) / 1e6).toFixed(1)} MB`);

    const imported = await timed("import a new list", () => send(file, { name: "World" }), 1);
    expect(imported.body.added).toBe(COUNT);
    const listId = imported.body.list.id;

    const first = await timed("list: first page, by callsign", () => get<RepeaterListResponse>("/api/repeaters"));
    expect(first.total).toBe(COUNT);
    await timed("list: band and mode", () => get<RepeaterListResponse>("/api/repeaters?band=70cm&mode=dmr"));
    const nearest = await timed("list: all of them by distance from a place", () =>
      get<RepeaterListResponse>("/api/repeaters?near=54.5,-3.1"),
    );
    expect(nearest.repeaters[0]!.distanceMeters).toBeLessThan(nearest.repeaters[49]!.distanceMeters!);
    const within = await timed("list: within 100 km of a place, one band", () =>
      get<RepeaterListResponse>("/api/repeaters?near=54.5,-3.1&withinKm=100&band=2m"),
    );
    expect(within.repeaters.every((repeater) => repeater.distanceMeters! <= 100_000 && repeater.band === "2m")).toBe(true);

    expect((await timed("find: a callsign", () => get<RepeaterListResponse>("/api/repeaters?q=QZ0AARS"))).total).toBeGreaterThan(0);
    expect((await timed("find: part of a town", () => get<RepeaterListResponse>("/api/repeaters?q=town+1234"))).total).toBeGreaterThan(0);
    expect((await timed("find: a frequency", () => get<RepeaterListResponse>("/api/repeaters?q=145.7"))).total).toBeGreaterThan(0);
    expect((await timed("find: nothing matches", () => get<RepeaterListResponse>("/api/repeaters?q=zzzzzz"))).total).toBe(0);

    const world = await timed("map: the whole world", () => get<RepeaterOverlayResponse>("/api/repeaters/overlay?bbox=-180,-70,180,75"));
    expect(world.cells.reduce((sum, cell) => sum + cell.count, 0) + world.points.length).toBe(world.total);
    console.log(
      `  the whole world is ${world.cells.length} patches and ${world.points.length} points, ${JSON.stringify(world).length} bytes`,
    );
    const country = await timed("map: a country", () => get<RepeaterOverlayResponse>("/api/repeaters/overlay?bbox=-8,50,2,59"));
    console.log(`  a country is ${country.cells.length} patches and ${country.points.length} points of ${country.total}`);
    const valley = await timed("map: a valley", () => get<RepeaterOverlayResponse>("/api/repeaters/overlay?bbox=-3.5,54.2,-2.5,54.8"));
    expect(valley.cells).toEqual([]);

    const everything = await timed("search across everything: a callsign", () => get<SearchResponse>("/api/search?q=QZ0AARS"));
    expect(everything.results[0]!.kind).toBe("repeater");
    await timed("search across everything: two words that match nothing", () => get<SearchResponse>("/api/search?q=water+purification"));

    const chirp = await timed(
      "export: the nearest 200 for CHIRP",
      () => get<string>("/api/repeaters/export?format=chirp&near=54.5,-3.1&limit=200"),
      3,
    );
    expect(chirp.trimEnd().split("\r\n")).toHaveLength(201);
    await timed("export: all of them in Outpost's layout", () => get<string>("/api/repeaters/export?format=outpost"), 1);

    const same = await timed("update: the same file again", () => send(file, { listId }), 1);
    expect(same.body).toMatchObject({ added: 0, updated: 0, unchanged: COUNT });
    const newer = await timed("update: a newer file, 500 changed", () => send(worldwideList(true), { listId }), 1);
    expect(newer.body.updated).toBeGreaterThan(400);
    expect(newer.body.added).toBe(0);
  }, 600_000);
});
