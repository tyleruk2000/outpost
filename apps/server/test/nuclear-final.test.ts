/**
 * The nuclear preparedness module's third sitting, on a real test server: saved sets of
 * scenarios (and that nothing is added up across them), a scenario attached to an
 * emergency plan as an illustration, the radiation emergency template's sources, the
 * historical records list, a WorldPop grid brought as a file, and the size of a grid's
 * cell given with a count of people within a distance.
 */
import fs from "node:fs";
import path from "node:path";
import { PLAN_TEMPLATES, planFromTemplate, SOURCE_TERMS, sourceById, termsOf } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTiff } from "./fixtures/layers/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
let storageRoot: string;
let locationId: string;

const write = (relPath: string, content: string | Buffer) => {
  const file = path.join(storageRoot, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return relPath;
};

async function importFile(format: string, relPath: string, options: Record<string, string>, title: string) {
  const started = await app.api("POST", "/api/reference/imports/from-storage", { format, locationId, relPath, title, options });
  if (started.status !== 200) return { state: "refused", error: started.body.error?.message as string };
  await app.ctx.jobs.whenIdle();
  const job = await app.api("GET", `/api/jobs/${started.body.jobId}`);
  return job.body.job ?? job.body;
}

const member = (letter: string, over: Record<string, unknown> = {}) => ({
  letter,
  hidden: false,
  name: `Scenario ${letter}`,
  notes: "",
  lat: 54.5,
  lon: -3.05,
  effects: { yieldKt: 15, burst: { kind: "surface" }, wind: { fromDegrees: 270, kmh: 24 } },
  ...over,
});

beforeAll(async () => {
  app = await createTestApp();
  locationId = app.ctx.services.storage.getDefault().id;
  storageRoot = app.ctx.services.storage.resolve(locationId, "");
});

afterAll(async () => {
  await app.close();
});

describe("sets of scenarios", () => {
  it("are saved, listed, reopened and changed, each member only as typed", async () => {
    const made = await app.api("POST", "/api/nuclear/sets", {
      name: "Three yields at the lake",
      members: [
        member("A"),
        member("B", { hidden: true, effects: { yieldKt: 100, burst: { kind: "optimum", psi: 5 }, wind: null } }),
        member("C"),
      ],
    });
    expect(made.status).toBe(201);
    const listed = (await app.api("GET", "/api/nuclear/sets")).body.sets;
    expect(listed).toHaveLength(1);
    const opened = (await app.api("GET", `/api/nuclear/sets/${made.body.id}`)).body;
    expect(opened.members.map((each: { letter: string; hidden: boolean }) => [each.letter, each.hidden])).toEqual([
      ["A", false],
      ["B", true],
      ["C", false],
    ]);
    const changed = await app.api("PATCH", `/api/nuclear/sets/${made.body.id}`, { name: "Two", members: [member("A"), member("D")] });
    expect(changed.status).toBe(200);
    expect(changed.body.members).toHaveLength(2);
  });

  it("hold no total or figure for the set as a whole, in what is stored or answered", async () => {
    const made = await app.api("POST", "/api/nuclear/sets", { name: "Pair", members: [member("A"), member("B")] });
    const keys = (value: unknown, out = new Set<string>()): Set<string> => {
      if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) out.add(key) && keys(inner, out);
      return out;
    };
    const seen = [...keys(made.body), ...keys((await app.api("GET", "/api/nuclear/sets")).body)];
    expect(seen.filter((key) => /total|people|population|sum|combined|casualt|affected/i.test(key))).toEqual([]);
    const row = app.ctx.sqlite.prepare("SELECT * FROM nuclear_scenario_sets WHERE id = ?").get(made.body.id) as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(["created_at", "id", "members", "name", "updated_at"]);
    // No route of the module answers a figure across scenarios.
    for (const route of ["/api/nuclear/sets/total", "/api/nuclear/total", "/api/nuclear/population"])
      expect((await app.api("GET", route)).status).toBe(404);
  });

  it("refuse more than six, a letter twice, and a member the model cannot answer, with the reason", async () => {
    const seven = await app.api("POST", "/api/nuclear/sets", {
      name: "Too many",
      members: ["A", "B", "C", "D", "E", "F", "A"].map((letter) => member(letter)),
    });
    expect(seven.status).toBe(400);
    const twice = await app.api("POST", "/api/nuclear/sets", { name: "Twice", members: [member("A"), member("A")] });
    expect(twice.status).toBe(400);
    expect(twice.body.error.message).toMatch(/letter of its own/);
    const bad = await app.api("POST", "/api/nuclear/sets", {
      name: "Bad",
      members: [member("A", { effects: { yieldKt: 50_000, burst: { kind: "surface" }, wind: null } })],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/^A, Scenario A: /);
  });

  it("are counted with saved scenarios, and go with erase everything", async () => {
    const before = app.ctx.services.nuclear.count();
    await app.api("POST", "/api/nuclear/scenarios", { name: "Single", notes: "", lat: 54, lon: -3, effects: member("A").effects });
    expect(app.ctx.services.nuclear.count()).toBe(before + 1);
    const sets = (await app.api("GET", "/api/nuclear/sets")).body.sets.length;
    expect(sets).toBeGreaterThan(0);
    expect(app.ctx.services.nuclear.eraseAll()).toBe(before + 1);
    expect((await app.api("GET", "/api/nuclear/sets")).body.sets).toEqual([]);
  });
});

describe("a scenario attached to an emergency plan", () => {
  it("is held as a link, named as it is now, said to be missing once deleted, and changes no step", async () => {
    const scenario = (
      await app.api("POST", "/api/nuclear/scenarios", {
        name: "Fifteen kilotons",
        notes: "",
        lat: 54,
        lon: -3,
        effects: member("A").effects,
      })
    ).body;
    const template = PLAN_TEMPLATES.find((each) => each.id === "radiation")!;
    let n = 0;
    const input = planFromTemplate(template, () => `s${++n}`, "999");
    input.body.links = [{ kind: "scenario", id: scenario.id }];
    const made = await app.api("POST", "/api/emergency-plans", input);
    expect(made.status).toBe(200);
    expect(made.body.resolved.links).toEqual([{ kind: "scenario", id: scenario.id, title: "Fifteen kilotons" }]);
    expect(made.body.plan.body.steps.map((step: { origin: string }) => step.origin)).toEqual(template.steps.map((step) => step.id));
    const summary = (await app.api("GET", "/api/emergency-plans")).body.plans.find((each: { id: string }) => each.id === made.body.plan.id);
    expect(summary).toMatchObject({
      templateId: "radiation",
      kind: "shelter-at-home",
      kindText: "Radiation emergency",
      scenarios: [scenario.id],
    });
    await app.api("DELETE", `/api/nuclear/scenarios/${scenario.id}`);
    const after = (await app.api("GET", `/api/emergency-plans/${made.body.plan.id}`)).body;
    expect(after.resolved.links).toEqual([{ kind: "scenario", id: scenario.id, title: null }]);
    expect(after.plan.body.steps).toHaveLength(template.steps.length);
  });
});

describe("the radiation emergency template", () => {
  it("quotes the UK Health Security Agency's dated GOV.UK pages under the Open Government Licence, and points to Ready.gov", () => {
    const template = PLAN_TEMPLATES.find((each) => each.id === "radiation")!;
    const sources = new Set([...template.steps, ...template.supplies, ...template.where].map((line) => line.source));
    expect(sources).toContain("ukhsa-radiation-what-to-do");
    expect(sources).toContain("ukhsa-self-decontamination");
    for (const id of ["ukhsa-radiation-what-to-do", "ukhsa-self-decontamination"]) {
      const source = sourceById(id)!;
      expect(source.pageDate).toBe("Updated 10 September 2024");
      expect(termsOf(source)?.cleared).toBe(true);
    }
    const pointer = template.steps.find((step) => step.source === "readygov-radiation")!;
    expect(pointer.pointer).toBe(true);
    expect(pointer.quote).toBe("");
    // The ICRP's terms were read and are not cleared; the IAEA's were, and nothing of theirs is used.
    expect(SOURCE_TERMS.find((terms) => terms.id === "icrp")?.cleared).toBe(false);
    expect(SOURCE_TERMS.find((terms) => terms.id === "iaea")).toBeDefined();
    // Where the guidance says nothing, it asks.
    expect(template.prompts.some((prompt) => /nuclear explosion/.test(prompt))).toBe(true);
    expect(template.steps.some((step) => /go in, stay in and tune in/.test(step.quote))).toBe(true);
  });
});

describe("historical records and population grids for the workspace", () => {
  it("lists historical records by period, each with its kind, filtered by kind", async () => {
    write(
      "imports/history.csv",
      [
        "record_id,name,latitude,longitude,location_text,country,period,record_type,document_title,document_publisher,document_date,archive_ref,classification,target_category,evidence_quality,geographic_precision,citations,document_url,library_document_id,publisher,license,notes",
        "T-2,Second place,54.5,-3.0,,GB,1960,assessment,A planning paper,An archive,1960,REF 2,Declassified,Category,Stated,About 5 km,p. 4,https://example.org/doc,,The tests,Made up,",
        "T-1,First place,54.6,-3.1,,GB,1956,target-list,A target list,An archive,1956,REF 1,Declassified,Category,Stated,About 5 km,p. 2,,,The tests,Made up,",
        "T-3,A guess,54.7,-3.2,,GB,1980,speculation,A book,A publisher,1980,,,Category,An author's view,About 20 km,p. 9,,,The tests,Made up,",
      ].join("\n"),
    );
    const job = await importFile("historical-csv", "imports/history.csv", {}, "History (test)");
    expect(job.state).toBe("succeeded");
    const all = (await app.api("GET", "/api/reference/historical")).body;
    expect(all.total).toBe(3);
    expect(all.records.map((record: { period: string; recordType: string }) => [record.period, record.recordType])).toEqual([
      ["1956", "target-list"],
      ["1960", "assessment"],
      ["1980", "speculation"],
    ]);
    expect(all.records[1]).toMatchObject({
      documentTitle: "A planning paper",
      documentUrl: "https://example.org/doc",
      provenance: "historical",
    });
    expect(all.records[2].provenance).toBe("unverified");
    const some = (await app.api("GET", "/api/reference/historical?recordType=assessment")).body;
    expect(some.records.map((record: { name: string }) => record.name)).toEqual(["Second place"]);
    expect((await app.api("GET", "/api/reference/historical?recordType=modern")).status).toBe(400);
  });

  it("imports a WorldPop grid a person downloaded, credits it as WorldPop's, and counts people within a distance with the cell size", async () => {
    const values = new Float32Array(60 * 60).fill(100);
    const relPath = write(
      "imports/gbr_ppp_2020_1km_Aggregated_UNadj.tif",
      buildTiff({ width: 60, height: 60, values, originLon: -3.3, originLat: 54.75, pixel: 1 / 120, nodata: -99999 }),
    );
    const refused = await importFile("worldpop-tif", "imports/gbr_ppp_2020_1km_Aggregated_UNadj.tif", { country: "LU" }, "Wrong country");
    expect(refused.state).toBe("failed");
    expect(JSON.stringify(refused)).toMatch(/lux_ppp_2020_1km_Aggregated_UNadj\.tif/);
    const job = await importFile("worldpop-tif", relPath, { country: "GB" }, "Population, test");
    expect(job.state).toBe("succeeded");
    const layers = (await app.api("GET", "/api/reference/layers")).body;
    expect(layers.population).toEqual([expect.objectContaining({ country: "United Kingdom", year: 2020 })]);
    const sum = (await app.api("GET", "/api/reference/population/sum?lat=54.5&lon=-3.05&radiusKm=5")).body;
    expect(sum.people).toBeGreaterThan(10_000);
    expect(sum.covered).toBe(1);
    // A cell of 30 arc-seconds at 54.5° N: about 0.93 km by 0.54 km.
    expect(sum.cellKm2).toBeGreaterThan(0.45);
    expect(sum.cellKm2).toBeLessThan(0.55);
    // A circle over the grid's edge: counted in part, and said to be.
    const edge = (await app.api("GET", "/api/reference/population/sum?lat=54.75&lon=-3.05&radiusKm=5")).body;
    expect(edge.covered).toBeLessThan(0.7);
    expect(edge.note).toMatch(/Only \d+% of the circle is covered/);
  });
});
