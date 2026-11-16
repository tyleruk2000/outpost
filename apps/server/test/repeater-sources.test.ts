import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  DUPLICATE_HZ,
  type RepeaterDetailResponse,
  type RepeaterDuplicatesResponse,
  type RepeaterFetchResponse,
  type RepeaterFields,
  type RepeaterImportPreview,
  type RepeaterImportResult,
  type RepeaterListResponse,
  type RepeaterMergeResult,
  type RepeaterOverlayResponse,
  type RepeaterSourcesResponse,
  type RepeatersOverview,
} from "@outpost/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/core/errors.ts";
import { createHttpClient } from "../src/core/http.ts";
import { byHandOf, callsignKey, fold, groupSame, isPossiblySame, isSame, pairsPossiblySame } from "../src/modules/repeaters/duplicates.ts";
import { createRepeaterFetchClient } from "../src/modules/repeaters/fetch.ts";
import { createRowReader, detectFormat, type ReadRow, readTable } from "../src/modules/repeaters/formats.ts";
import { REPEATER_FETCH_USER_AGENT } from "../src/modules/repeaters/index.ts";
import { loadRepeaterSources, type RepeaterSource, repeaterSourcesSchema } from "../src/modules/repeaters/sources.ts";
import { multipart } from "./fixtures/documents/builders.ts";
import { createRepeaterSourceStandIn } from "./fixtures/repeaters/source-stand-in.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures/repeaters", name), "utf8");

async function rowsOf(text: string): Promise<{ format: string; rows: ReadRow[]; reasons: string[]; ignored: number }> {
  const table = await readTable(text);
  const detected = detectFormat(table.columns, table.kind);
  const reader = createRowReader(table.columns, detected.mapping, detected.format);
  const rows: ReadRow[] = [];
  const reasons: string[] = [];
  let ignored = 0;
  for (const row of table.rows) {
    const outcome = reader.read(row);
    if (outcome.ok) rows.push(outcome.row);
    else if ("ignored" in outcome) ignored += 1;
    else reasons.push(`${outcome.line}: ${outcome.reason}`);
  }
  return { format: detected.format, rows, reasons, ignored };
}
const byCall = (rows: ReadRow[], callsign: string) => rows.find((row) => row.callsign === callsign)!;

// ── The stand-in publisher ──────────────────────────────────────────────────

const standIn = createRepeaterSourceStandIn();
let server: http.Server;
let port = 0;
beforeAll(async () => {
  server = http.createServer((request, response) => standIn.handle(request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
const at = (name: string) => `http://127.0.0.1:${port}/repeater-lists/${name}`;

// ── Layouts added for the sources ───────────────────────────────────────────

describe("reading the layouts the sources offer", () => {
  it("reads Hearham's JSON list: hertz, a signed shift, and one field for whatever gets you in", async () => {
    const { format, rows, reasons } = await rowsOf(fixture("hearham.json"));
    expect(format).toBe("hearham");
    expect(rows.map((row) => row.callsign)).toEqual(["QZ3AB", "QZ7CD", "QZ3EF", "QZ3GH", "QZ7WX", "QZ3AB", "QZ7CD B"]);
    expect(rows[0]).toMatchObject({
      outputHz: 145_662_500,
      inputHz: 145_062_500,
      modes: ["fm"],
      ctcssHz: 94.8,
      place: "Thornwick, Northshire",
      lat: 54.5212,
      lon: -3.1229,
      status: "operational",
      notes: "On the hill above the town.",
      key: "id:501",
    });
    expect(byCall(rows, "QZ7CD")).toMatchObject({ modes: ["dmr"], dmrColourCode: 3, ctcssHz: null, accessNote: "Internet node 235999." });
    expect(byCall(rows, "QZ3EF")).toMatchObject({ inputHz: 438_475_000, modes: ["fm", "fusion"], status: "off-air", accessNote: "CLOSED" });
    expect(byCall(rows, "QZ3GH")).toMatchObject({ dcsCode: "023", ctcssHz: null });
    // Several modes written with nothing between them, and a tone, a colour code and something else in one field.
    expect(byCall(rows, "QZ7WX")).toMatchObject({
      modes: ["fm", "dmr", "dstar", "fusion", "nxdn", "p25"],
      ctcssHz: 100,
      dmrColourCode: 7,
      accessNote: "Access as listed: NAC 293.",
      inputHz: 433_100_000,
    });
    // A whole number of degrees is a position known to the nearest fifty kilometres or so.
    expect(byCall(rows, "QZ7WX").positionPrecisionMeters).toBeGreaterThan(50_000);
    expect(reasons).toEqual([
      "9: The output frequency “477” is not a frequency.",
      "10: The position “91.5, -1234.5” is not a latitude and longitude in degrees.",
    ]);
  });

  it("reads the WIA's directory: sections name the mode, and a repeater listed under two modes is one entry", async () => {
    const { format, rows, reasons, ignored } = await rowsOf(fixture("wia.csv"));
    expect(format).toBe("wia");
    expect(reasons).toEqual([]);
    // Five rows that head or end a section, and one second listing.
    expect(ignored).toBe(6);
    expect(rows.map((row) => `${row.callsign} ${row.outputHz}`)).toEqual([
      "QZ2RAA 146700000",
      "QZ2RBB 146850000",
      "QZ2RAA 438525000",
      "QZ2RTV 446500000",
    ]);
    expect(rows[0]).toMatchObject({
      inputHz: 146_100_000,
      modes: ["fm"],
      ctcssHz: 91.5,
      place: "Mt Madeup",
      region: "Northtown",
      country: "Australia",
      keeper: "2AAA",
      status: "operational",
      lat: null,
      notes: "",
    });
    // A letter the page that offers the file does not explain is kept as written, not guessed at.
    expect(rows[1]).toMatchObject({ status: "unknown", statusText: "status LN in the directory", ctcssHz: null });
    expect(rows[2]).toMatchObject({ modes: ["fm", "dstar"], ctcssHz: 123, status: "operational" });
    // "Various" for an input is no frequency, and no reason to lose the entry.
    expect(rows[3]).toMatchObject({ inputHz: null, modes: [] });
  });

  it("tells the town from the callsign in a CHIRP name, and still matches a list it read before", async () => {
    const heading = fixture("chirp.csv").split("\n")[0]!;
    const { rows } = await rowsOf(
      [
        heading,
        "1,QZ3AB Thornwick Hill,145.662500,-,0.600000,Tone,94.8,88.5,023,NN,023,Tone->Tone,FM,12.50,,,,,,,",
        "2,Hut 12,145.500000,,0.600000,,88.5,88.5,023,NN,023,Tone->Tone,FM,12.50,,,,,,,",
      ].join("\n"),
    );
    expect(rows[0]).toMatchObject({ callsign: "QZ3AB", place: "Thornwick Hill", key: "QZ3AB THORNWICK HILL|145662500" });
    expect(rows[1]).toMatchObject({ callsign: "Hut 12", place: "" });
  });

  it("reads any JSON list of records by its field names, and one inside an object", async () => {
    const list = [
      { Callsign: "QZ3AB", "Output MHz": 145.6625, Shift: -0.6, Town: "Thornwick", Lat: 54.521, Lon: -3.123, tags: ["a"], open: true },
      { Callsign: "QZ7CD", "Output MHz": "439.4625", Shift: "-9", Town: "Marrowby", Lat: 54.6, Lon: -2.9 },
    ];
    for (const text of [JSON.stringify(list), JSON.stringify({ count: 2, results: list })]) {
      const { format, rows } = await rowsOf(text);
      expect(format).toBe("json");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ callsign: "QZ3AB", outputHz: 145_662_500, inputHz: 145_062_500, place: "Thornwick", lat: 54.521 });
    }
    await expect(readTable('{"error": "not found"}')).rejects.toThrow(/not a list of records/);
    await expect(readTable("[1, 2, 3]")).rejects.toThrow(/not a list of records/);
    await expect(readTable("[{")).rejects.toThrow(/could not be read as JSON/);
  });

  it("refuses a web page saved in place of the file", async () => {
    await expect(readTable("<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>")).rejects.toThrow(
      /That is a web page, not a list of repeaters/,
    );
  });
});

// ── Telling duplicates, and making one of two ───────────────────────────────

const entry = (over: Partial<RepeaterFields> = {}): RepeaterFields => ({
  callsign: "QZ3AB",
  outputHz: 145_662_500,
  inputHz: 145_062_500,
  modes: ["fm"],
  ctcssHz: 94.8,
  dcsCode: null,
  dmrColourCode: null,
  talkgroups: "",
  accessNote: "",
  channel: "",
  place: "THORNWICK",
  region: "",
  country: "",
  lat: 54.521,
  lon: -3.123,
  locator: "",
  positionPrecisionMeters: 56,
  antennaMeters: null,
  keeper: "",
  status: "operational",
  statusText: "OPERATIONAL",
  notes: "",
  ...over,
});

describe("the same repeater twice", () => {
  it("takes the same callsign on the same frequency, to within a small tolerance, as one repeater", () => {
    expect(callsignKey("gb3-ab")).toBe(callsignKey("GB3 AB"));
    expect(isSame(entry(), entry({ callsign: "qz3-ab", outputHz: 145_663_000 }))).toBe(true);
    expect(isSame(entry(), entry({ outputHz: 145_662_500 + DUPLICATE_HZ }))).toBe(true);
    // The next channel up is 12.5 kHz away, and the narrowest in use 6.25 kHz: neither is the same repeater.
    expect(isSame(entry(), entry({ outputHz: 145_675_000 }))).toBe(false);
    expect(isSame(entry(), entry({ outputHz: 145_668_750 }))).toBe(false);
    expect(isSame(entry(), entry({ callsign: "QZ3AC" }))).toBe(false);
    expect(isSame(entry({ callsign: "-" }), entry({ callsign: " " }))).toBe(false);
  });

  it("offers, and only offers, a different callsign on the same frequency at nearly the same place", () => {
    const other = entry({ callsign: "QZ3AB-L", lat: 54.53, lon: -3.12 });
    expect(isSame(entry(), other)).toBe(false);
    expect(isPossiblySame(entry(), other)).toBe(true);
    // Forty kilometres off is another repeater on the same channel.
    expect(isPossiblySame(entry(), entry({ callsign: "QZ3ZZ", lat: 54.9, lon: -3.123 }))).toBe(false);
    // Two positions blurred to five kilometres each cannot be told apart ten kilometres off, but never beyond fifteen.
    const blurred = entry({ callsign: "QZ3ZZ", lat: 54.6, lon: -3.1, positionPrecisionMeters: 5560 });
    expect(isPossiblySame(entry({ positionPrecisionMeters: 5560 }), blurred)).toBe(true);
    expect(isPossiblySame(entry({ positionPrecisionMeters: 50_000 }), entry({ callsign: "QZ3ZZ", lat: 54.7, lon: -3.123 }))).toBe(false);
    // With no position there is nothing to go on.
    expect(isPossiblySame(entry(), entry({ callsign: "QZ3ZZ", lat: null, lon: null }))).toBe(false);
    expect(isPossiblySame(entry(), entry({ callsign: "QZ3ZZ", outputHz: 433_000_000 }))).toBe(false);
  });

  it("gathers entries into groups, each in one group, and pairs the possible ones once", () => {
    const items = [
      { id: "a", ...entry() },
      { id: "b", ...entry({ callsign: "qz3ab", outputHz: 145_663_000 }) },
      { id: "c", ...entry({ outputHz: 433_000_000 }) },
      { id: "d", ...entry({ callsign: "QZ3AB/R", lat: 54.522 }) },
      { id: "e", ...entry({ callsign: "QZ9ZZ", outputHz: 51_000_000 }) },
    ];
    expect(groupSame(items).map((group) => group.map((item) => item.id).sort())).toEqual([["a", "b"]]);
    expect(
      pairsPossiblySame(items)
        .map(([a, b]) => `${a.id}${b.id}`)
        .sort(),
    ).toEqual(["ad", "bd"]);
  });

  it("makes one of two without losing what a person typed", () => {
    const listed = entry();
    const hand = entry({
      ctcssHz: 77,
      notes: "Opens with 77 Hz since the spring.",
      lat: 54.5213,
      lon: -3.1227,
      positionPrecisionMeters: 0,
      place: "",
    });
    // A list's entry is kept; the one typed by hand is folded in: its tone, its notes and its exact position win.
    const kept = fold({ fields: listed, byHand: new Set() }, [{ fields: hand, byHand: byHandOf(hand, null, false) }]);
    expect(kept).toMatchObject({
      ctcssHz: 77,
      notes: "Opens with 77 Hz since the spring.",
      lat: 54.5213,
      positionPrecisionMeters: 0,
      place: "THORNWICK",
    });

    // The other way about: the entry typed by hand is kept, and the list fills only what was left empty.
    const filled = fold({ fields: hand, byHand: byHandOf(hand, null, false) }, [
      { fields: entry({ keeper: "QZ4AAA", modes: ["fm", "dmr"] }), byHand: new Set() },
    ]);
    expect(filled).toMatchObject({ ctcssHz: 77, place: "THORNWICK", keeper: "QZ4AAA", lat: 54.5213, modes: ["fm"] });

    // An entry of a list that the person changed: only what they changed is theirs.
    const changed = entry({ ctcssHz: 88.5, place: "THORNWICK" });
    expect([...byHandOf(changed, listed, true)]).toEqual(["ctcssHz"]);
    expect([...byHandOf(listed, listed, false)]).toEqual([]);
    const newer = entry({ ctcssHz: 103.5, place: "THORNWICK HILL", keeper: "QZ4NEW" });
    expect(fold({ fields: newer, byHand: new Set() }, [{ fields: changed, byHand: byHandOf(changed, listed, true) }])).toMatchObject({
      ctcssHz: 88.5,
      place: "THORNWICK HILL",
      keeper: "QZ4NEW",
    });

    // Two lists that disagree about modes: the repeater has both. Notes on both sides are both kept.
    const both = fold({ fields: entry({ notes: "Mine." }), byHand: new Set(["notes"]) }, [
      { fields: entry({ modes: ["dmr"], notes: "Also mine." }), byHand: new Set(["notes"]) },
    ]);
    expect(both.modes).toEqual(["fm", "dmr"]);
    expect(both.notes).toBe("Mine.\nAlso mine.");

    // For an import, only what the person typed is carried: the new row is not filled in from another list's.
    const bare = entry({ keeper: "", ctcssHz: null });
    expect(
      fold({ fields: bare, byHand: new Set() }, [{ fields: entry({ keeper: "QZ4OLD" }), byHand: new Set(["notes"]) }], { fillGaps: false }),
    ).toMatchObject({
      keeper: "",
      ctcssHz: null,
    });
  });
});

// ── The declared sources ────────────────────────────────────────────────────

describe("repeater sources", () => {
  const repoCatalog = path.resolve(import.meta.dirname, "../../../catalog");
  let dir: string;
  beforeEach(() => {
    dir = tempDir("outpost-repeater-sources-");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const writeOwn = (content: unknown) => {
    fs.mkdirSync(path.join(dir, "data", "catalog", "repeaters"), { recursive: true });
    fs.writeFileSync(path.join(dir, "data", "catalog", "repeaters", "repeater-sources.json"), JSON.stringify(content));
  };
  const base = { pageUrl: "https://example.org/lists", termsUrl: "https://example.org/terms", termsNote: "Read.", termsRead: "2026-11-16" };

  it("ships a file that is valid, with every kind, https only, and terms read for each", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(repoCatalog, "repeater-sources.json"), "utf8"));
    expect(() => repeaterSourcesSchema.parse(raw)).not.toThrow();
    const loaded = loadRepeaterSources({ catalogDir: repoCatalog, dataDir: path.join(dir, "data") });
    expect(loaded.problems).toEqual([]);
    expect(new Set(loaded.sources.map((source) => source.kind))).toEqual(new Set(["fetch", "link", "none"]));
    for (const source of loaded.sources) {
      expect(source.termsRead, source.id).toMatch(/^2026-\d\d-\d\d$/);
      expect(source.why.length, source.id).toBeGreaterThan(40);
      expect(
        loaded.regions.some((region) => region.id === source.region),
        source.id,
      ).toBe(true);
      if (source.kind === "fetch") {
        expect(source.fetch!.url, source.id).toMatch(/^https:\/\//);
        expect(source.fetch!.waitSeconds, source.id).toBeGreaterThanOrEqual(10);
        // The file comes from the publisher whose terms were read, not from somewhere else.
        expect(new URL(source.pageUrl).hostname.replace(/^www\./, ""), source.id).toBe(
          new URL(source.fetch!.url).hostname.replace(/^www\./, ""),
        );
      } else expect(source.fetch, source.id).toBeNull();
      if (source.kind === "link") expect(source.steps.length, source.id).toBeGreaterThan(1);
    }
    // The two that forbid a program, or check for a browser, are never fetched.
    expect(loaded.sources.find((source) => source.id === "world-repeaterbook")!.kind).toBe("link");
    expect(loaded.sources.find((source) => source.id === "gb-etcc")!.kind).toBe("link");
  });

  it("lets a person change what is done with a shipped source, and add their own", () => {
    writeOwn({
      schemaVersion: 1,
      regions: [{ id: "valley", name: "My valley", bbox: [-4, 54, -2, 55] }],
      sources: [
        {
          ...base,
          id: "ie-irts-chirp",
          region: "ie",
          publisher: "IRTS",
          name: "Irish list",
          covers: "Ireland.",
          kind: "link",
          why: "I would rather fetch it myself.",
          steps: ["Download it."],
        },
        {
          ...base,
          id: "club",
          region: "valley",
          publisher: "The club",
          name: "Club list",
          covers: "The valley.",
          kind: "fetch",
          why: "It is ours.",
          fetch: { url: "http://192.168.1.20/list.csv", waitSeconds: 0 },
        },
      ],
    });
    const loaded = loadRepeaterSources({ catalogDir: repoCatalog, dataDir: path.join(dir, "data") });
    expect(loaded.problems).toEqual([]);
    expect(loaded.sources.find((source) => source.id === "ie-irts-chirp")).toMatchObject({ kind: "link", fetch: null, allowHost: null });
    expect(loaded.sources.find((source) => source.id === "club")).toMatchObject({
      kind: "fetch",
      allowHost: "192.168.1.20",
      fetch: { host: "192.168.1.20", url: "http://192.168.1.20/list.csv", waitSeconds: 0 },
    });
    expect(loaded.regions.map((region) => region.id)).toContain("valley");
    expect(loaded.sources.find((source) => source.id === "world-hearham")!.kind).toBe("fetch");
  });

  it("reports a file it cannot use, and uses none of it", () => {
    for (const bad of [
      { ...base, id: "a", region: "world", publisher: "P", name: "N", covers: "C", kind: "fetch", why: "W" },
      { ...base, id: "a", region: "world", publisher: "P", name: "N", covers: "C", kind: "link", why: "W" },
      {
        ...base,
        id: "a",
        region: "world",
        publisher: "P",
        name: "N",
        covers: "C",
        kind: "none",
        why: "W",
        fetch: { url: "https://example.org/a.csv" },
      },
      {
        ...base,
        id: "a",
        region: "world",
        publisher: "P",
        name: "N",
        covers: "C",
        kind: "fetch",
        why: "W",
        fetch: { url: "ftp://example.org/a.csv" },
      },
      {
        ...base,
        id: "a",
        region: "world",
        publisher: "P",
        name: "N",
        covers: "C",
        kind: "fetch",
        why: "W",
        fetch: { url: "https://me:secret@example.org/a.csv" },
      },
    ]) {
      writeOwn({ schemaVersion: 1, regions: [{ id: "world", name: "World" }], sources: [bad] });
      const loaded = loadRepeaterSources({ catalogDir: path.join(dir, "no-catalog"), dataDir: path.join(dir, "data") });
      expect(loaded.sources).toEqual([]);
      expect(loaded.problems.join(" ")).toMatch(/is not a repeater source file Outpost can use/);
    }
    // The published format holds a shipped source to https and to the ten seconds.
    const shipped = (fetch: unknown) =>
      repeaterSourcesSchema.safeParse({
        schemaVersion: 1,
        sources: [{ ...base, id: "a", region: "world", publisher: "P", name: "N", covers: "C", kind: "fetch", why: "W", fetch }],
      }).success;
    expect(shipped({ url: "https://example.org/a.csv", waitSeconds: 10 })).toBe(true);
    expect(shipped({ url: "http://example.org/a.csv" })).toBe(false);
    expect(shipped({ url: "https://example.org/a.csv", waitSeconds: 1 })).toBe(false);
    // A source whose region nobody declared is left out and said.
    writeOwn({
      schemaVersion: 1,
      sources: [{ ...base, id: "a", region: "atlantis", publisher: "P", name: "N", covers: "C", kind: "none", why: "W" }],
    });
    const loaded = loadRepeaterSources({ catalogDir: path.join(dir, "no-catalog"), dataDir: path.join(dir, "data") });
    expect(loaded.sources).toEqual([]);
    expect(loaded.problems.join(" ")).toMatch(/names the region "atlantis"/);
  });
});

// ── Fetching ────────────────────────────────────────────────────────────────

describe("fetching a list from a source", () => {
  const source = (name: string, waitSeconds = 10): RepeaterSource => ({
    id: name.replace(/\W/g, "-"),
    region: "world",
    publisher: "A made-up society",
    name: "Stand-in list",
    covers: "A made-up hillside.",
    pageUrl: "https://example.org/lists",
    kind: "fetch",
    why: "It is the tests' own.",
    termsUrl: "https://example.org/terms",
    termsNote: "Read.",
    termsRead: "2026-11-16",
    attribution: "",
    fetch: { host: `127.0.0.1:${port}`, url: at(name), waitSeconds },
    steps: [],
    allowHost: "127.0.0.1",
  });
  let clock = 1_800_000_000_000;
  const client = (options: { timeoutMs?: number; maxBytes?: number; allowPrivate?: boolean } = {}) => {
    const http = createHttpClient({ allowPrivate: options.allowPrivate ?? true });
    return {
      http,
      fetcher: createRepeaterFetchClient(http, { userAgent: REPEATER_FETCH_USER_AGENT, now: () => clock, ...options }),
    };
  };
  const failure = async (promise: Promise<unknown>): Promise<AppError> => {
    const error = await promise.then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  };
  beforeEach(() => {
    standIn.requests.length = 0;
  });

  it("fetches the one file, once, naming itself plainly and sending nothing else", async () => {
    const { http, fetcher } = client();
    const got = await fetcher.get(source("north.csv"));
    expect(got.text).toBe(fixture("etcc-status.csv"));
    expect(got).toMatchObject({ url: at("north.csv"), fileName: "north.csv", sizeBytes: Buffer.byteLength(fixture("etcc-status.csv")) });
    // The publisher's own date for the file, where it gives one.
    expect(new Date(got.lastModified!).toISOString()).toBe("2026-10-01T09:00:00.000Z");
    expect(standIn.requests).toEqual([{ path: "/repeater-lists/north.csv", userAgent: REPEATER_FETCH_USER_AGENT, cookie: undefined }]);
    expect(REPEATER_FETCH_USER_AGENT).toMatch(/^Outpost\/\d+\.\d+\.\d+ \(self-hosted offline library; \+https:\/\/github\.com\//);
    await http.close();
  });

  it("keeps a file whose name in the address cannot be decoded, under the name as it is written", async () => {
    const { http, fetcher } = client();
    // "%E9" is é in Latin-1 and not UTF-8 at all: decoding it as an address part throws.
    const got = await fetcher.get(source("r%E9p.csv"));
    expect(got.text).toBe(fixture("etcc-status.csv"));
    expect(got.fileName).toBe("r_E9p.csv");
    expect(standIn.requests.map((request) => request.path)).toEqual(["/repeater-lists/r%E9p.csv"]);
    // One that can be decoded still is.
    clock += 60_000;
    expect((await fetcher.get(source("north.csv"))).fileName).toBe("north.csv");
    await http.close();
  });

  it("leaves a host alone for as long as its source asks, and says how long is left", async () => {
    const { http, fetcher } = client();
    await fetcher.get(source("north.csv", 10));
    expect(fetcher.waitFor(source("north.csv", 10))).toBe(10);
    clock += 4_000;
    const early = await failure(fetcher.get(source("world.json", 10)));
    expect(early.code).toBe("conflict");
    expect(early.message).toMatch(/was asked a moment ago\. Outpost leaves it alone between requests: try again in 6 seconds\./);
    // Refusing costs the publisher nothing: no request was made.
    expect(standIn.requests).toHaveLength(1);
    clock += 6_000;
    expect(fetcher.waitFor(source("world.json", 10))).toBe(0);
    expect((await fetcher.get(source("world.json", 10))).text).toContain('"callsign": "QZ3AB"');
    expect(standIn.requests).toHaveLength(2);
    await http.close();
  });

  it("stays away from a source that says it is busy for as long as it says", async () => {
    const { http, fetcher } = client();
    const busy = await failure(fetcher.get(source("busy", 0)));
    expect(busy.code).toBe("upstream");
    expect(busy.message).toMatch(/is busy and turned the request away \(HTTP 503\)\. Outpost will not ask it again for 2 minutes\./);
    clock += 60_000;
    expect((await failure(fetcher.get(source("north.csv", 0)))).message).toMatch(/try again in 60 seconds/);
    expect(standIn.requests).toHaveLength(1);
    clock += 61_000;
    await fetcher.get(source("north.csv", 0));
    await http.close();
  });

  it("does not get round a refusal or a check for a browser: it says so, and says to download by hand", async () => {
    for (const name of ["refused", "browser-check", "page-as-text"]) {
      clock += 3_600_000;
      const { http, fetcher } = client();
      const error = await failure(fetcher.get(source(name, 0)));
      expect(error.code, name).toBe("upstream");
      expect(error.message, name).toMatch(/Outpost does not get round/);
      expect(error.message, name).toMatch(
        /Download the file yourself from https:\/\/example\.org\/lists and bring it in with “Import a list”\./,
      );
      // One request, no second try with another name or a cookie, and the host is left alone for a while after.
      expect(
        standIn.requests.filter((request) => request.path.endsWith(name)),
        name,
      ).toHaveLength(1);
      expect(fetcher.waitFor(source(name, 0)), name).toBeGreaterThan(200);
      await http.close();
    }
  });

  it("says plainly when the file has gone, is empty, is too large or never finishes", async () => {
    const cases: Array<[string, RegExp, { timeoutMs?: number; maxBytes?: number }]> = [
      ["gone", /The file is no longer at the address Outpost has for it \(HTTP 404\)/, {}],
      ["empty", /answered with an empty file/, {}],
      [
        "huge",
        /is larger than 1 MB, which is more than Outpost reads as a list of repeaters\. Nothing was kept\./,
        { maxBytes: 1024 * 1024 },
      ],
      ["slow", /did not send the whole file within 1 second\. Nothing was kept\./, { timeoutMs: 400 }],
    ];
    for (const [name, message, options] of cases) {
      const { http, fetcher } = client(options);
      const error = await failure(fetcher.get(source(name, 0)));
      expect(error.message, name).toMatch(message);
      await http.close();
    }
  });

  it("follows no redirect to another host, and asks nothing on a private network unless allowed", async () => {
    const one = client();
    const moved = await failure(one.fetcher.get(source("elsewhere", 0)));
    expect(moved.message).toMatch(
      /sent Outpost on to another site for the file\. Outpost fetches a list only from the host its source names\./,
    );
    await one.http.close();

    const guarded = client({ allowPrivate: false });
    standIn.requests.length = 0;
    const blocked = await failure(guarded.fetcher.get(source("north.csv", 0)));
    expect(blocked.code).toBe("forbidden");
    expect(blocked.message).toMatch(/because it is on this computer or a private network/);
    expect(standIn.requests).toEqual([]);
    await guarded.http.close();
  });

  it("fetches only a source of the kind that may be fetched", async () => {
    const { http, fetcher } = client();
    const error = await failure(fetcher.get({ ...source("north.csv"), kind: "link", fetch: null, allowHost: null }));
    expect(error.message).toMatch(/Outpost does not fetch “Stand-in list”\. Download the file yourself/);
    expect(standIn.requests).toEqual([]);
    await http.close();
  });
});

// ── Through the API ─────────────────────────────────────────────────────────

/** A server whose repeater sources are the stand-in's, in place of those shipped. */
async function appWithSources(): Promise<TestApp> {
  const dir = tempDir("outpost-test-");
  fs.mkdirSync(path.join(dir, "data", "catalog", "repeaters"), { recursive: true });
  const base = {
    pageUrl: "https://example.org/lists",
    termsUrl: "https://example.org/terms",
    termsNote: "The page says: free to fetch.",
    termsRead: "2026-11-16",
  };
  fs.writeFileSync(
    path.join(dir, "data", "catalog", "repeaters", "repeater-sources.json"),
    JSON.stringify({
      schemaVersion: 1,
      replaceShipped: true,
      regions: [
        { id: "north", name: "The north", bbox: [-4, 54, -2, 56] },
        { id: "world", name: "Worldwide" },
      ],
      sources: [
        {
          ...base,
          id: "north-list",
          region: "north",
          publisher: "A made-up society",
          name: "North list",
          covers: "A made-up hillside.",
          kind: "fetch",
          why: "It offers the file.",
          attribution: "Made-up society data",
          fetch: { url: at("north.csv"), waitSeconds: 0 },
        },
        {
          ...base,
          id: "world-list",
          region: "world",
          publisher: "A made-up directory",
          name: "World list",
          covers: "Everywhere.",
          kind: "fetch",
          why: "It says so.",
          fetch: { url: `http://localhost:${port}/repeater-lists/world.json` },
        },
        {
          ...base,
          id: "checked",
          region: "world",
          publisher: "Behind a check",
          name: "Checked list",
          covers: "Somewhere.",
          kind: "fetch",
          why: "It did once.",
          fetch: { url: at("browser-check"), waitSeconds: 0 },
        },
        {
          ...base,
          id: "not-a-list",
          region: "world",
          publisher: "Something else",
          name: "Not a list",
          covers: "Nothing.",
          kind: "fetch",
          why: "It did once.",
          fetch: { url: at("not-a-list"), waitSeconds: 0 },
        },
        {
          ...base,
          id: "by-hand",
          region: "north",
          publisher: "A careful society",
          name: "By-hand list",
          covers: "The same hillside.",
          kind: "link",
          why: "Its terms forbid a program.",
          steps: ["Open the page.", "Save the file.", "Import it here."],
        },
        {
          ...base,
          id: "nothing",
          region: "world",
          publisher: "Nobody",
          name: "Nothing",
          covers: "Nowhere.",
          kind: "none",
          why: "A map only.",
        },
      ],
    }),
  );
  const app = await createTestApp({}, dir);
  return {
    ...app,
    async close() {
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("sources and duplicates through the API", () => {
  let app: TestApp;
  beforeEach(async () => {
    standIn.requests.length = 0;
    standIn.north = fixture("etcc-status.csv");
    app = await appWithSources();
  });
  afterEach(() => app.close());

  const send = (url: string, name: string, content: string, fields: Record<string, string> = {}) => {
    const { payload, headers } = multipart(fields, [{ name, content, type: "text/csv" }]);
    return app.api("POST", url, payload, { headers });
  };
  const preview = async (name: string, content: string, fields: Record<string, string> = {}) =>
    (await send("/api/repeaters/import/preview", name, content, fields)) as { status: number; body: RepeaterImportPreview };
  const importFile = async (name: string, content: string, fields: Record<string, string> = {}) =>
    (await send("/api/repeaters/import", name, content, fields)) as { status: number; body: RepeaterImportResult };
  const list = async (query = "") => (await app.api<RepeaterListResponse>("GET", `/api/repeaters${query}`)).body;
  const shown = async (query = "") => (await list(query)).repeaters.map((repeater) => `${repeater.callsign} ${repeater.outputHz}`).sort();
  const overview = async () => (await app.api<RepeatersOverview>("GET", "/api/repeaters/overview")).body;
  const detail = async (id: string) => (await app.api<RepeaterDetailResponse>("GET", `/api/repeaters/${id}`)).body;
  const find = async (callsign: string) =>
    (await list(`?q=${encodeURIComponent(callsign)}`)).repeaters.filter((repeater) => repeater.callsign === callsign);
  const importNorth = () =>
    importFile("etcc-status.csv", fixture("etcc-status.csv"), { name: "North list", source: "A made-up society", dataDate: "2026-10-01" });
  const world = fixture("hearham.json");
  const all = (sql: string, ...args: unknown[]) => app.ctx.sqlite.prepare(sql).all(...args) as Array<Record<string, unknown>>;

  it("lists the sources by kind, with the reason and the terms as read, and never asks anybody to do it", async () => {
    const { status, body } = await app.api<RepeaterSourcesResponse>("GET", "/api/repeaters/sources");
    expect(status).toBe(200);
    expect(body.problems).toEqual([]);
    expect(body.regions).toEqual([
      { id: "north", name: "The north", bbox: [-4, 54, -2, 56] },
      { id: "world", name: "Worldwide", bbox: null },
    ]);
    expect(body.sources.map((source) => `${source.id}:${source.kind}`)).toEqual([
      "north-list:fetch",
      "world-list:fetch",
      "checked:fetch",
      "not-a-list:fetch",
      "by-hand:link",
      "nothing:none",
    ]);
    expect(body.sources[0]).toMatchObject({
      publisher: "A made-up society",
      why: "It offers the file.",
      termsNote: "The page says: free to fetch.",
      termsRead: "2026-11-16",
      fetch: { host: `127.0.0.1:${port}`, url: at("north.csv"), waitSeconds: 0 },
      held: null,
    });
    // A source that does not say how long to wait is given ten seconds.
    expect(body.sources[1]!.fetch!.waitSeconds).toBe(10);
    expect(body.sources[4]).toMatchObject({ fetch: null, steps: ["Open the page.", "Save the file.", "Import it here."] });
    expect(JSON.stringify(body)).not.toContain("allowHost");
    expect(standIn.requests).toEqual([]);
  });

  it("gets a list on one press: one request, the usual preview, nothing kept until it is imported, and a record of where it came from", async () => {
    const fetched = await app.api<RepeaterFetchResponse>("POST", "/api/repeaters/sources/north-list/fetch");
    expect(fetched.status).toBe(200);
    expect(standIn.requests.map((request) => request.path)).toEqual(["/repeater-lists/north.csv"]);
    expect(fetched.body.preview).toMatchObject({ format: "etcc-status", rows: 9, usable: 6, skippedCount: 3, update: null });
    expect(fetched.body.fetched).toMatchObject({ sourceId: "north-list", url: at("north.csv"), fileName: "north.csv", listId: null });
    expect(fetched.body.fetched.token).toMatch(/^[a-f0-9]{32}$/);
    expect((await overview()).total).toBe(0);

    // The held file can be read again without asking the publisher again.
    const token = fetched.body.fetched.token;
    const again = await app.api<RepeaterImportPreview>("POST", `/api/repeaters/fetched/${token}/preview`, { duplicates: "skip" });
    expect(again.body.usable).toBe(6);
    expect(standIn.requests).toHaveLength(1);

    const imported = await app.api<RepeaterImportResult>("POST", `/api/repeaters/fetched/${token}/import`, {});
    expect(imported.status).toBe(200);
    expect(imported.body).toMatchObject({ added: 6, skipped: 3 });
    // The date of the data is the publisher's own for the file; the record says where it was fetched from, when, and the terms as read.
    expect(imported.body.list).toMatchObject({
      name: "North list",
      source: "A made-up society",
      sourceUrl: "https://example.org/lists",
      fileName: "north.csv",
      count: 6,
      fetched: {
        sourceId: "north-list",
        url: at("north.csv"),
        publisher: "A made-up society",
        termsUrl: "https://example.org/terms",
        termsNote: "The page says: free to fetch.",
        termsRead: "2026-11-16",
        attribution: "Made-up society data",
      },
    });
    expect(new Date(imported.body.list.dataDate).toISOString()).toBe("2026-10-01T09:00:00.000Z");
    expect(Date.now() - imported.body.list.fetched!.fetchedAt).toBeLessThan(60_000);
    expect(standIn.requests).toHaveLength(1);
    // Once kept, the held copy is gone.
    expect((await app.api("POST", `/api/repeaters/fetched/${token}/import`, {})).status).toBe(404);

    const { body } = await app.api<RepeaterSourcesResponse>("GET", "/api/repeaters/sources");
    expect(body.sources[0]!.held).toMatchObject({ listId: imported.body.list.id, name: "North list", count: 6 });
  });

  it("brings a fetched list up to date with the same button, keeping what the person changed", async () => {
    const first = await app.api<RepeaterFetchResponse>("POST", "/api/repeaters/sources/north-list/fetch");
    const kept = await app.api<RepeaterImportResult>("POST", `/api/repeaters/fetched/${first.body.fetched.token}/import`, {});
    const listId = kept.body.list.id;
    const [mine] = await find("QZ3AB");
    await app.api("PATCH", `/api/repeaters/${mine!.id}`, { ctcssHz: 77 });

    // The publisher's file moves on: one tone changed, one repeater gone, one new.
    standIn.north = fixture("etcc-status.csv")
      .replace(
        "9002,QZ7CD,70CM,DVU37,439.462500,430.462500,8,7,M,IO84,MARROWBY,MB2,NOR,,3,",
        "9002,QZ7CD,70CM,DVU37,439.462500,430.462500,8,7,M,IO84,MARROWBY,MB2,NOR,,5,",
      )
      .replace(/^9006,.*\n/m, "")
      .concat("9010,QZ3NW,2M,RV60,145.750000,145.150000,9,10,A,IO84,NEWBIGGIN,,NOR,88.5,,QZ4JJJ,54.7,-3.0,OPERATIONAL,\n");
    const second = await app.api<RepeaterFetchResponse>("POST", "/api/repeaters/sources/north-list/fetch");
    expect(second.status).toBe(200);
    expect(second.body.fetched.listId).toBe(listId);
    expect(second.body.preview.update).toMatchObject({ listId, added: 1, changed: 1, gone: 1, editedSame: 1, unchanged: 3 });
    const updated = await app.api<RepeaterImportResult>("POST", `/api/repeaters/fetched/${second.body.fetched.token}/import`, { listId });
    expect(updated.body).toMatchObject({ added: 1, updated: 1, removed: 1, keptEdits: 1 });
    expect((await overview()).lists).toHaveLength(1);
    expect((await find("QZ3AB"))[0]).toMatchObject({ ctcssHz: 77, edited: true });
    expect((await find("QZ7CD"))[0]!.dmrColourCode).toBe(5);
  });

  it("asks a host again no sooner than its source allows", async () => {
    expect((await app.api("POST", "/api/repeaters/sources/world-list/fetch")).status).toBe(200);
    const early = await app.api("POST", "/api/repeaters/sources/world-list/fetch");
    expect(early.status).toBe(409);
    expect(early.body.error.message).toMatch(
      /was asked a moment ago\. Outpost leaves it alone between requests: try again in \d+ seconds\./,
    );
    expect(standIn.requests).toHaveLength(1);
  });

  it("keeps nothing when the source sends a page, or something that is not the list", async () => {
    const other = await app.api("POST", "/api/repeaters/sources/not-a-list/fetch");
    expect(other.status).toBe(502);
    expect(other.body.error.message).toMatch(/sent a file, but it is not the list Outpost expected: .* Nothing was kept\./);
    const page = await app.api("POST", "/api/repeaters/sources/checked/fetch");
    expect(page.status).toBe(502);
    expect(page.body.error.message).toMatch(
      /answered with a web page in place of the file\. It may be checking that its visitor is a browser/,
    );
    // After that the host is left alone for a while, whichever of its lists is asked for.
    const after = await app.api("POST", "/api/repeaters/sources/north-list/fetch");
    expect(after.status).toBe(409);
    expect(standIn.requests.map((request) => request.path)).toEqual(["/repeater-lists/not-a-list", "/repeater-lists/browser-check"]);
    expect((await overview()).total).toBe(0);
    expect(all("SELECT id FROM repeater_lists")).toEqual([]);
  });

  it("fetches nothing for a source that is to be had by hand, or that is not declared", async () => {
    const byHand = await app.api("POST", "/api/repeaters/sources/by-hand/fetch");
    expect(byHand.status).toBe(400);
    expect(byHand.body.error.message).toMatch(
      /Outpost does not fetch “By-hand list”\. Download the file yourself from https:\/\/example\.org\/lists/,
    );
    expect((await app.api("POST", "/api/repeaters/sources/nothing/fetch")).status).toBe(400);
    expect((await app.api("POST", "/api/repeaters/sources/nowhere/fetch")).status).toBe(404);
    expect((await app.api("POST", "/api/repeaters/sources/..%2Fetc/fetch")).status).toBe(400);
    // Only a request from Outpost's own pages may make it reach out at all.
    const foreign = await app.app.inject({
      method: "POST",
      url: "/api/repeaters/sources/north-list/fetch",
      headers: { host: "localhost" },
    });
    expect(foreign.statusCode).toBe(403);
    expect(standIn.requests).toEqual([]);
  });

  it("says in the preview how many rows are already held, repeat within the file or may be the same, and shows them side by side", async () => {
    await importNorth();
    const { body: hand } = await app.api("POST", "/api/repeaters", {
      callsign: "QZ3GH",
      outputHz: 50_790_000,
      notes: "Works from the bothy.",
    });
    expect(hand.repeater.listId).toBeNull();

    const { body } = await preview("world.json", world, { dataDate: "2026-11-10" });
    expect(body.format).toBe("hearham");
    // QZ3AB, QZ7CD, QZ3EF and QZ3GH are held (QZ3GH in the list and by hand); QZ3AB is in the file twice; "QZ7CD B" may be QZ7CD.
    expect(body.duplicates).toMatchObject({ held: 5, heldByHand: 1, withinFile: 1, possible: 1 });
    const pairs = body.duplicates.examples;
    const held = pairs.find((pair) => pair.against === "held" && pair.strength === "same" && pair.incoming.callsign === "QZ3AB")!;
    expect(held.incoming).toMatchObject({ id: null, line: 2, listName: null, place: "Thornwick, Northshire", byHand: false });
    expect(held.existing).toMatchObject({
      line: null,
      listName: "North list",
      dataDate: Date.UTC(2026, 9, 1),
      place: "THORNWICK",
      channel: "RV53",
      byHand: false,
    });
    expect(held.distanceMeters).toBeLessThan(50);
    expect(pairs.find((pair) => pair.against === "file")).toMatchObject({
      incoming: { line: 7, notes: "Listed a second time." },
      existing: { line: 2, id: null },
    });
    // The person's own entry is the one put beside the row, when a row matches both it and a list.
    expect(pairs.find((pair) => pair.incoming.callsign === "QZ3GH")!.existing).toMatchObject({
      listName: null,
      line: null,
      dataDate: null,
      byHand: true,
    });
    expect(pairs.find((pair) => pair.strength === "possible")).toMatchObject({
      incoming: { callsign: "QZ7CD B" },
      existing: { callsign: "QZ7CD" },
    });
    // Asking changed nothing.
    expect((await overview()).total).toBe(7);
  });

  it("keeps both unless told otherwise: nothing held is touched and nothing is left out", async () => {
    await importNorth();
    const before = all("SELECT * FROM repeaters ORDER BY id");
    const { body } = await importFile("world.json", world, { name: "World list", dataDate: "2026-11-10" });
    expect(body).toMatchObject({ added: 7, duplicatesSetAside: 0, heldSetAside: 0, carriedEdits: 0 });
    expect(all("SELECT * FROM repeaters WHERE list_id != ? ORDER BY id", body.list.id)).toEqual(before);
    expect((await overview()).total).toBe(13);
    expect(await find("QZ3AB")).toHaveLength(3);
  });

  it("skips the incoming ones when asked: what is held stays as it is, and each repeater is shown once", async () => {
    const north = await importNorth();
    const before = all("SELECT * FROM repeaters ORDER BY id");
    const { body } = await importFile("world.json", world, { name: "World list", dataDate: "2026-11-10", duplicates: "skip" });
    // Four rows are held already and one repeats an earlier row: five set aside, two new. The possible one is not acted on.
    expect(body).toMatchObject({ added: 2, duplicatesSetAside: 5, heldSetAside: 0, carriedEdits: 0 });
    expect(body.list).toMatchObject({ count: 2, setAsideCount: 5 });
    expect(all("SELECT * FROM repeaters WHERE list_id = ? ORDER BY id", north.body.list.id)).toEqual(before);
    expect(await shown()).toEqual([
      "QZ3AB 145662500",
      "QZ3EF 430875000",
      "QZ3GH 50790000",
      "QZ3KL 1297350000",
      "QZ7CD 439462500",
      "QZ7CD B 439462500",
      "QZ7IJ 144962500",
      "QZ7WX 433100000",
    ]);
    expect((await overview()).total).toBe(8);
    // The same on the map, and in an export.
    const overlay = await app.api<RepeaterOverlayResponse>("GET", "/api/repeaters/overlay?bbox=-10,49,5,61");
    expect(overlay.body.total).toBe(8);
    expect(overlay.body.points.filter((point) => point.callsign === "QZ3AB")).toHaveLength(1);
    // The one shown says what was set aside for it, and they come back when separated.
    const [kept] = await find("QZ3AB");
    expect(kept!.listId).toBe(north.body.list.id);
    const { merged } = await detail(kept!.id);
    expect(merged.map((item) => item.listName)).toEqual(["World list", "World list"]);

    // A newer copy of the world list does not bring the skipped ones back, and does not ask again.
    const update = await preview("world.json", world, { listId: body.list.id });
    expect(update.body.update).toMatchObject({ added: 0, unchanged: 2, setAside: 5, removedByYou: 0 });
    expect(update.body.duplicates).toMatchObject({ held: 0, withinFile: 0 });
    await importFile("world.json", world, { listId: body.list.id, duplicates: "skip" });
    expect((await overview()).total).toBe(8);
    // "Bring back what I removed" is for what the person removed, not for duplicates.
    expect((await app.api("POST", `/api/repeaters/lists/${body.list.id}/restore-removed`)).body).toEqual({ restored: 0 });

    expect((await app.api("POST", `/api/repeaters/${kept!.id}/separate`)).body).toEqual({ separated: 2 });
    expect(await find("QZ3AB")).toHaveLength(3);
  });

  it("sees, when a list is brought up to date, a new row that repeats an entry the list already has", async () => {
    const first = ["callsign,frequency,lat,lon", "QZ3AB,145.6625,54.521,-3.123", "QZ9ZZ,433.05,54.9,-3.4"].join("\n");
    const { body: made } = await importFile("club.csv", first, { name: "Club list", dataDate: "2026-10-01" });
    expect(made).toMatchObject({ added: 2 });
    // The next copy lists QZ3AB a second time, and once more under another spelling ahead of the row that has not changed.
    const next = [
      "callsign,frequency,lat,lon",
      "QZ-3AB,145.6625,54.521,-3.123",
      "QZ3AB,145.6625,54.521,-3.123",
      "QZ9ZZ,433.05,54.9,-3.4",
      "QZ3AB,145.6625,54.521,-3.123",
    ].join("\n");
    const asked = await preview("club.csv", next, { listId: made.list.id });
    expect(asked.body.update).toMatchObject({ added: 2, unchanged: 2 });
    expect(asked.body.duplicates).toMatchObject({ held: 0, withinFile: 2 });
    expect(asked.body.duplicates.examples.filter((pair) => pair.against === "file")).toHaveLength(2);

    // As a list of its own the same file sets the two repeats aside; brought up to date it does the same.
    const { body: updated } = await importFile("club.csv", next, { listId: made.list.id, duplicates: "skip" });
    expect(updated).toMatchObject({ added: 0, unchanged: 2, duplicatesSetAside: 2 });
    expect(updated.list).toMatchObject({ count: 2, setAsideCount: 2 });
    expect(await shown()).toEqual(["QZ3AB 145662500", "QZ9ZZ 433050000"]);
    const [kept] = await find("QZ3AB");
    expect((await detail(kept!.id)).merged).toHaveLength(2);
  });

  it("does the same when the newer data is preferred: an entry of the list itself is not displaced by its own repeat", async () => {
    const first = ["callsign,frequency,lat,lon", "QZ3AB,145.6625,54.521,-3.123"].join("\n");
    const { body: made } = await importFile("club.csv", first, { name: "Club list", dataDate: "2026-10-01" });
    const next = `${first}\nQZ3AB,145.6625,54.521,-3.123`;
    const { body: updated } = await importFile("club.csv", next, { listId: made.list.id, duplicates: "prefer-newer" });
    expect(updated).toMatchObject({ added: 0, unchanged: 1, duplicatesSetAside: 1, heldSetAside: 0 });
    expect(await shown()).toEqual(["QZ3AB 145662500"]);
  });

  it("prefers the newer data when asked, and carries over what the person typed or changed", async () => {
    const north = await importNorth();
    // The person corrects a tone in the list, and has an entry of their own for another repeater.
    const [ab] = await find("QZ3AB");
    await app.api("PATCH", `/api/repeaters/${ab!.id}`, { ctcssHz: 77, notes: "Checked on the air in October." });
    const hand = await app.api("POST", "/api/repeaters", {
      callsign: "qz7cd",
      outputHz: 439_463_000,
      dmrColourCode: 9,
      notes: "Colour code 9 since the move.",
    });

    const { body } = await importFile("world.json", world, { name: "World list", dataDate: "2026-11-10", duplicates: "prefer-newer" });
    // Seven rows: one repeats an earlier row; the other six are shown, four of them in place of five held entries.
    expect(body).toMatchObject({ added: 6, duplicatesSetAside: 1, heldSetAside: 5, carriedEdits: 2 });
    expect((await overview()).total).toBe(8);

    // The newer list's entry is shown, with the person's tone and notes on it, and what the list says kept beside it.
    const [shownAb] = await find("QZ3AB");
    expect(shownAb).toMatchObject({
      listId: body.list.id,
      ctcssHz: 77,
      notes: "Checked on the air in October.",
      place: "Thornwick, Northshire",
      edited: true,
    });
    const abDetail = await detail(shownAb!.id);
    expect(abDetail.asListed).toMatchObject({ ctcssHz: 94.8, notes: "On the hill above the town." });
    expect(abDetail.merged.map((item) => item.listName).sort()).toEqual(["North list", "World list"]);

    // The entry made by hand: every part the person typed is kept, on the entry that is shown.
    const [cd] = await find("QZ7CD");
    expect(cd).toBeUndefined();
    const [shownCd] = await find("qz7cd");
    expect(shownCd).toMatchObject({
      listId: body.list.id,
      callsign: "qz7cd",
      outputHz: 439_463_000,
      dmrColourCode: 9,
      notes: "Colour code 9 since the move.",
      edited: true,
    });
    expect((await detail(shownCd!.id)).asListed).toMatchObject({ callsign: "QZ7CD", outputHz: 439_462_500, dmrColourCode: 3 });
    // Nothing was deleted to do it: the person's own entry is set aside, whole.
    expect(all("SELECT notes, merged_into FROM repeaters WHERE id = ?", hand.body.repeater.id)).toEqual([
      { notes: "Colour code 9 since the move.", merged_into: shownCd!.id },
    ]);
    // An entry nobody had changed is simply the newer list's now.
    expect((await find("QZ3EF"))[0]).toMatchObject({ listId: body.list.id, edited: false, status: "off-air" });
    expect((await overview()).lists.find((item) => item.id === north.body.list.id)).toMatchObject({ count: 2, setAsideCount: 4 });

    // Removing the newer list puts back everything it was shown in place of, the person's entries included.
    await app.api("DELETE", `/api/repeaters/lists/${body.list.id}`);
    expect((await overview()).total).toBe(7);
    expect((await find("QZ3AB"))[0]).toMatchObject({ listId: north.body.list.id, ctcssHz: 77, notes: "Checked on the air in October." });
    expect((await find("qz7cd"))[0]).toMatchObject({ listId: null, dmrColourCode: 9 });
  });

  it("keeps what is held when it is the newer of the two", async () => {
    await importNorth();
    const { body } = await importFile("world.json", world, { name: "Old world list", dataDate: "2026-01-05", duplicates: "prefer-newer" });
    expect(body).toMatchObject({ added: 2, duplicatesSetAside: 5, heldSetAside: 0 });
    expect((await find("QZ3AB"))[0]).toMatchObject({ place: "THORNWICK", channel: "RV53" });
  });

  it("finds duplicates already held, shows them side by side, and merges a group keeping the person's notes and edits", async () => {
    const north = await importNorth();
    const worldList = await importFile("world.json", world, { name: "World list", dataDate: "2026-11-10" });
    const [fromNorth] = (await find("QZ3GH")).filter((item) => item.listId === north.body.list.id);
    await app.api("PATCH", `/api/repeaters/${fromNorth!.id}`, { notes: "Dead spot by the weir." });
    const mine = await app.api("POST", "/api/repeaters", { callsign: "QZ3KL", outputHz: 1_297_350_000, keeper: "QZ4MINE", notes: "Mine." });

    const { body } = await app.api<RepeaterDuplicatesResponse>("GET", "/api/repeaters/duplicates");
    expect(body.sameTotal).toBe(5);
    expect(body.same.map((group) => `${group.entries[0]!.callsign} x${group.entries.length}`)).toEqual([
      "QZ3AB x3",
      "QZ3EF x2",
      "QZ3GH x2",
      "QZ3KL x2",
      "QZ7CD x2",
    ]);
    // QZ7CD and "QZ7CD B" are offered as possibly one; never as the same.
    expect(body.possibleTotal).toBe(2);
    expect(body.possible[0]!.entries.map((item) => item.callsign).sort()).toEqual(["QZ7CD", "QZ7CD B"]);

    const gh = body.same.find((group) => group.entries[0]!.callsign === "QZ3GH")!;
    expect(
      gh.entries.map((item) => `${item.listName}, ${new Date(item.dataDate!).toISOString().slice(0, 10)}, ${item.byHand}`).sort(),
    ).toEqual(["North list, 2026-10-01, true", "World list, 2026-11-10, false"]);
    // The newer data is the one Outpost would keep.
    const keep = gh.entries.find((item) => item.listName === "World list")!;
    expect(gh.keepId).toBe(keep.id);
    expect(gh.spreadMeters).toBeLessThan(100);
    const kl = body.same.find((group) => group.entries[0]!.callsign === "QZ3KL")!;
    expect(kl.keepId).toBe(kl.entries.find((item) => !item.byHand)!.id);

    // Merge one group: the kept entry carries the person's notes, the other is set aside, and it is shown once.
    const merged = await app.api<RepeaterMergeResult>("POST", "/api/repeaters/duplicates/merge", {
      keepId: gh.keepId,
      mergeIds: gh.entries.map((item) => item.id!).filter((id) => id !== gh.keepId),
    });
    expect(merged.body).toEqual({ merged: 1, setAside: 1, kept: [gh.keepId] });
    expect(await find("QZ3GH")).toHaveLength(1);
    expect((await find("QZ3GH"))[0]).toMatchObject({
      id: gh.keepId,
      notes: "Dead spot by the weir.",
      listId: worldList.body.list.id,
      channel: "R50-10",
      edited: true,
    });
    expect((await detail(gh.keepId)).merged).toMatchObject([{ id: fromNorth!.id, listName: "North list" }]);

    // The person may keep the other one instead: their own entry, with the list filling what they left empty.
    const keptMine = await app.api<RepeaterMergeResult>("POST", "/api/repeaters/duplicates/merge", {
      keepId: mine.body.repeater.id,
      mergeIds: kl.entries.map((item) => item.id!).filter((id) => id !== mine.body.repeater.id),
    });
    expect(keptMine.status).toBe(200);
    expect((await find("QZ3KL"))[0]).toMatchObject({
      listId: null,
      keeper: "QZ4MINE",
      notes: "Mine.",
      place: "HIGH FELLGATE",
      accessNote: "1750 Hz tone burst.",
      inputHz: 1_291_350_000,
    });

    // Entries that are not one repeater are not merged, whatever is asked.
    const [ij] = await find("QZ7IJ");
    const refused = await app.api("POST", "/api/repeaters/duplicates/merge", { keepId: gh.keepId, mergeIds: [ij!.id] });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toMatch(/are not on one frequency at one place, so Outpost will not make one entry of them/);

    // Merge all the rest that are certain. The possible pair is left for a person to decide.
    const rest = await app.api<RepeaterMergeResult>("POST", "/api/repeaters/duplicates/merge-all");
    expect(rest.body).toMatchObject({ merged: 3, setAside: 4 });
    const after = await app.api<RepeaterDuplicatesResponse>("GET", "/api/repeaters/duplicates");
    expect(after.body.sameTotal).toBe(0);
    expect(after.body.possibleTotal).toBe(1);
    expect(await shown()).toEqual([
      "QZ3AB 145662500",
      "QZ3EF 430875000",
      "QZ3GH 50790000",
      "QZ3KL 1297350000",
      "QZ7CD 439462500",
      "QZ7CD B 439462500",
      "QZ7IJ 144962500",
      "QZ7WX 433100000",
    ]);
    expect((await overview()).total).toBe(8);
    expect((await app.api<RepeaterOverlayResponse>("GET", "/api/repeaters/overlay?bbox=-10,49,5,61")).body.total).toBe(8);
    // The search across everything finds one of each.
    const hits = app.ctx.services.repeaters.search("QZ3AB", 10);
    expect(hits).toHaveLength(1);

    // The possible pair, merged because a person said so of that pair.
    const pair = after.body.possible[0]!;
    const one = await app.api<RepeaterMergeResult>("POST", "/api/repeaters/duplicates/merge", {
      keepId: pair.keepId,
      mergeIds: pair.entries.map((item) => item.id!).filter((id) => id !== pair.keepId),
    });
    expect(one.body.setAside).toBe(1);
    expect((await overview()).total).toBe(7);
  });

  it("offers two repeaters that may be one even when each of them is also held twice", async () => {
    // QZ1AA twice and QZ1BB twice, all four on one frequency at one place: two groups, and four pairs between them.
    const ids: Record<string, string[]> = { QZ1AA: [], QZ1BB: [] };
    for (const callsign of ["QZ1AA", "QZ1BB", "QZ1AA", "QZ1BB"]) {
      const made = await app.api("POST", "/api/repeaters", { callsign, outputHz: 145_750_000, lat: 54.5, lon: -3.1 });
      expect(made.status).toBe(200);
      ids[callsign]!.push(made.body.repeater.id);
    }
    const { body } = await app.api<RepeaterDuplicatesResponse>("GET", "/api/repeaters/duplicates");
    expect(body.sameTotal).toBe(2);
    expect(body.possibleTotal).toBe(4);
    expect(body.possible.map((pair) => pair.entries.map((item) => item.callsign).sort())).toEqual(Array(4).fill(["QZ1AA", "QZ1BB"]));
    // No pair is of two entries of one group: those are the same, not possibly the same.
    for (const pair of body.possible) {
      const [a, b] = pair.entries.map((item) => item.id);
      expect(ids.QZ1AA!.includes(a!) && ids.QZ1AA!.includes(b!)).toBe(false);
      expect(ids.QZ1BB!.includes(a!) && ids.QZ1BB!.includes(b!)).toBe(false);
    }
  });

  it("leaves every other list exactly as it was when an update that prefers newer data cannot be finished", async () => {
    await importNorth();
    const first = await importFile("world.json", JSON.stringify(JSON.parse(world).slice(4, 5)), {
      name: "World list",
      dataDate: "2026-11-01",
    });
    const listId = first.body.list.id;
    const snapshot = () => ({
      lists: all("SELECT * FROM repeater_lists ORDER BY id"),
      rows: all("SELECT * FROM repeaters ORDER BY id"),
    });
    const before = snapshot();
    // The newer copy holds repeaters the north list has too. Writing one of them fails, as a full disk would make it.
    app.ctx.sqlite.exec(
      "CREATE TRIGGER fail_part_way BEFORE INSERT ON repeaters WHEN NEW.place = 'Calderholm' BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );
    const failed = await importFile("world.json", world, { listId, dataDate: "2026-11-12", duplicates: "prefer-newer" });
    expect(failed.status).toBeGreaterThanOrEqual(400);
    expect(snapshot()).toEqual(before);
    app.ctx.sqlite.exec("DROP TRIGGER fail_part_way");

    // And when the last step itself fails, setting the other list's entries aside, the same holds.
    app.ctx.sqlite.exec(
      "CREATE TRIGGER fail_at_the_end BEFORE UPDATE OF merged_into ON repeaters WHEN NEW.merged_into IS NOT NULL AND OLD.place = 'ESKERDALE' BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );
    const late = await importFile("world.json", world, { listId, dataDate: "2026-11-12", duplicates: "prefer-newer" });
    expect(late.status).toBeGreaterThanOrEqual(400);
    expect(snapshot()).toEqual(before);
    app.ctx.sqlite.exec("DROP TRIGGER fail_at_the_end");

    const done = await importFile("world.json", world, { listId, dataDate: "2026-11-12", duplicates: "prefer-newer" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ added: 5, unchanged: 1, duplicatesSetAside: 1, heldSetAside: 4 });
    expect((await overview()).total).toBe(8);
  });

  it("removes a repeater, not one of its listings, when the one shown is removed", async () => {
    await importNorth();
    await importFile("world.json", world, { name: "World list", dataDate: "2026-11-10", duplicates: "prefer-newer" });
    const [ef] = await find("QZ3EF");
    await app.api("DELETE", `/api/repeaters/${ef!.id}`);
    expect(await find("QZ3EF")).toEqual([]);
    expect((await overview()).total).toBe(7);
  });
});
