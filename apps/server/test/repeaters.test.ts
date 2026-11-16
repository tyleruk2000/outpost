import fs from "node:fs";
import path from "node:path";
import {
  bandOfHz,
  formatAge,
  formatMHz,
  formatShift,
  REPEATER_BANDS,
  type RepeaterDetailResponse,
  type RepeaterDto,
  type RepeaterImportPreview,
  type RepeaterImportResult,
  type RepeaterListResponse,
  type RepeaterOverlayResponse,
  type RepeatersOverview,
  repeaterDataAge,
  type SearchResponse,
} from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHIRP_COLUMNS,
  createRowReader,
  detectFormat,
  parseFrequencyHz,
  parseModes,
  parseStatus,
  type ReadRow,
  readFrequency,
  readTable,
  unitOfHeading,
} from "../src/modules/repeaters/formats.ts";
import { tokensOf } from "../src/modules/repeaters/service.ts";
import { multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures/repeaters", name), "utf8");

/** Every usable row of a file, read as the importer reads it. */
async function rowsOf(text: string, mapping?: Record<string, string>): Promise<{ format: string; rows: ReadRow[]; reasons: string[] }> {
  const table = await readTable(text);
  const detected = detectFormat(table.columns);
  const reader = createRowReader(table.columns, mapping ?? detected.mapping, detected.format);
  const rows: ReadRow[] = [];
  const reasons: string[] = [];
  for (const row of table.rows) {
    const outcome = reader.read(row);
    if (outcome.ok) rows.push(outcome.row);
    else reasons.push(`${outcome.line}: ${outcome.reason}`);
  }
  return { format: detected.format, rows, reasons };
}

const byCall = (rows: ReadRow[], callsign: string) => rows.find((row) => row.callsign === callsign)!;

// ── Reading files ───────────────────────────────────────────────────────────

describe("reading a file of repeaters", () => {
  it("reads the ETCC's list with status: output and input the right way round, access, position and how exact it is", async () => {
    const { format, rows, reasons } = await rowsOf(fixture("etcc-status.csv"));
    expect(format).toBe("etcc-status");
    expect(rows.map((row) => row.callsign)).toEqual(["QZ3AB", "QZ7CD", "QZ3EF", "QZ3GH", "QZ7IJ", "QZ3KL"]);

    const fm = byCall(rows, "QZ3AB");
    // "TX MHz" is what the repeater transmits: the output. Its input is 600 kHz lower.
    expect(fm.outputHz).toBe(145_662_500);
    expect(fm.inputHz).toBe(145_062_500);
    expect(formatShift(fm.outputHz, fm.inputHz)).toBe("-0.6 MHz");
    expect(fm).toMatchObject({
      band: "2m",
      modes: ["fm"],
      ctcssHz: 94.8,
      channel: "RV53",
      place: "THORNWICK",
      region: "NOR",
      keeper: "QZ4AAA",
      locator: "IO84KM",
      lat: 54.521,
      lon: -3.123,
      antennaMeters: 12,
      status: "operational",
      statusText: "OPERATIONAL",
      key: "id:9001",
    });
    // Three decimal places: within about 56 m.
    expect(fm.positionPrecisionMeters).toBe(56);

    // One decimal place and a four-character locator: the list has blurred the site, to about 5.6 km.
    const dmr = byCall(rows, "QZ7CD");
    expect(dmr).toMatchObject({ modes: ["dmr"], dmrColourCode: 3, ctcssHz: null, lat: 54.6, lon: -2.9, locator: "IO84" });
    expect(dmr.positionPrecisionMeters).toBe(5560);

    expect(byCall(rows, "QZ3EF")).toMatchObject({ modes: ["fm", "fusion"], status: "off-air", inputHz: 438_475_000 });
    expect(byCall(rows, "QZ3GH")).toMatchObject({ band: "6m", dcsCode: "023", ctcssHz: null, status: "reduced" });
    // A gateway that listens where it transmits.
    expect(byCall(rows, "QZ7IJ")).toMatchObject({ modes: ["dstar"], inputHz: 144_962_500 });
    expect(formatShift(144_962_500, 144_962_500)).toBe("simplex");
    // 1750 in the tone column is a tone burst, not a CTCSS tone.
    expect(byCall(rows, "QZ3KL")).toMatchObject({ band: "23cm", ctcssHz: null, accessNote: "1750 Hz tone burst." });

    expect(reasons).toEqual([
      "8: No callsign.",
      "9: The output frequency “not listed” is not a frequency.",
      "10: The position “123.0, -3.1” is not a latitude and longitude in degrees.",
    ]);
  });

  it("reads the ETCC's voice list, where one column holds a tone or a colour code", async () => {
    const { format, rows } = await rowsOf(fixture("etcc-voice.csv"));
    expect(format).toBe("etcc-voice");
    expect(byCall(rows, "QZ3AB")).toMatchObject({ ctcssHz: 94.8, dmrColourCode: null, key: "QZ3AB|145662500" });
    expect(byCall(rows, "QZ7CD")).toMatchObject({ ctcssHz: null, dmrColourCode: 3 });
    // "67" with no decimal point is still a tone: colour codes stop at 15.
    expect(byCall(rows, "QZ3QR")).toMatchObject({ ctcssHz: 67, dmrColourCode: null });
  });

  it("reads the ETCC's all-modes list, where each mode is a column of its own", async () => {
    const { format, rows } = await rowsOf(fixture("etcc-all.csv"));
    expect(format).toBe("etcc-all");
    expect(byCall(rows, "QZ3EF").modes).toEqual(["fm", "fusion"]);
    expect(byCall(rows, "QZ7ST").modes).toEqual(["dmr", "dstar"]);
    expect(byCall(rows, "QZ3AB")).toMatchObject({ outputHz: 145_662_500, inputHz: 145_062_500, ctcssHz: 94.8 });
  });

  it("reads a CHIRP file: only the tone the Tone column says is in use, and the shift each way", async () => {
    const { format, rows } = await rowsOf(fixture("chirp.csv"));
    expect(format).toBe("chirp");
    expect(rows).toHaveLength(7);
    expect(byCall(rows, "QZ3AB")).toMatchObject({
      outputHz: 145_662_500,
      inputHz: 145_062_500,
      ctcssHz: 94.8,
      dcsCode: null,
      modes: ["fm"],
    });
    // TSQL uses cToneFreq; rToneFreq is CHIRP's default and means nothing.
    expect(byCall(rows, "QZ3EF")).toMatchObject({ inputHz: 438_475_000, ctcssHz: 110.9 });
    expect(byCall(rows, "QZ3GH")).toMatchObject({ ctcssHz: null, dcsCode: "023", inputHz: 51_290_000 });
    // No tone mode: the 88.5 in the tone columns is a default, not a tone to send.
    expect(byCall(rows, "QZ7CD")).toMatchObject({ ctcssHz: null, dcsCode: null, modes: ["dmr"] });
    // No duplex: it transmits where it listens. A name that is not a callsign keeps its case.
    expect(byCall(rows, "Calling")).toMatchObject({ inputHz: 145_500_000 });
    expect(byCall(rows, "QZ3UV")).toMatchObject({ inputHz: 434_600_000, ctcssHz: 77 });
    // "off" means the radio must not transmit there: no input is known.
    expect(byCall(rows, "Listen")).toMatchObject({ inputHz: null });
    // CHIRP holds no positions.
    expect(rows.every((row) => row.lat === null && row.positionPrecisionMeters === null)).toBe(true);
  });

  it("matches the headings of an unknown list by what they usually mean, and takes a corrected matching", async () => {
    const table = await readTable(fixture("club-list.csv"));
    const detected = detectFormat(table.columns);
    expect(detected.format).toBe("csv");
    expect(detected.mapping).toEqual({
      callsign: "Station",
      output: "Freq",
      offset: "Shift",
      ctcss: "Access tone",
      locator: "Grid",
      place: "Town",
      notes: "Remarks",
    });

    const guessed = await rowsOf(fixture("club-list.csv"));
    // A decimal comma, a lower-case callsign, a signed shift.
    expect(byCall(guessed.rows, "QZ3WX")).toMatchObject({ outputHz: 145_737_500, inputHz: 145_137_500, ctcssHz: 88.5, modes: [] });
    // No coordinates: the middle of the locator square, and marked as no more exact than the square.
    const placed = byCall(guessed.rows, "QZ3WX");
    expect(placed.locator).toBe("IO84HP");
    expect(placed.lat).toBeCloseTo(54.646, 2);
    expect(placed.lon).toBeCloseTo(-3.375, 2);
    expect(placed.positionPrecisionMeters).toBeGreaterThan(3000);
    expect(placed.positionPrecisionMeters).toBeLessThan(4500);
    expect(byCall(guessed.rows, "QZ7YZ").positionPrecisionMeters).toBeGreaterThan(60_000);
    // No shift given: the input is not known. No locator: no position.
    expect(byCall(guessed.rows, "QZ3AA")).toMatchObject({ inputHz: null, lat: null, notes: 'Says "listen first"' });

    const corrected = await rowsOf(fixture("club-list.csv"), { ...detected.mapping, modes: "Kind", keeper: "Looked after by" });
    expect(byCall(corrected.rows, "QZ7YZ")).toMatchObject({ modes: ["dmr", "fusion"], keeper: "QZ4LLL" });
  });

  it("tells megahertz, kilohertz and hertz apart, and refuses what is not a frequency", () => {
    expect(parseFrequencyHz("145.775")).toBe(145_775_000);
    expect(parseFrequencyHz("145.775 MHz")).toBe(145_775_000);
    expect(parseFrequencyHz("145775")).toBe(145_775_000);
    expect(parseFrequencyHz("145775000")).toBe(145_775_000);
    expect(parseFrequencyHz("433,2")).toBe(433_200_000);
    expect(parseFrequencyHz("10368.2")).toBe(10_368_200_000);
    expect(parseFrequencyHz("")).toBeNull();
    expect(parseFrequencyHz("RV53")).toBeNull();
    expect(parseFrequencyHz("-145.5")).toBeNull();
    expect(parseFrequencyHz("0.1")).toBeNull();
  });

  it("takes the unit a column's heading names, and reads the microwave bands in megahertz", async () => {
    // What the column says wins over any guess from the size of the number.
    expect(parseFrequencyHz("24048.9", "mhz")).toBe(24_048_900_000);
    expect(parseFrequencyHz("47088", "mhz")).toBe(47_088_000_000);
    expect(parseFrequencyHz("7100", "khz")).toBe(7_100_000);
    expect(parseFrequencyHz("24.0489", "ghz")).toBe(24_048_900_000);
    expect(parseFrequencyHz("145662500", "hz")).toBe(145_662_500);
    // What is written after the number wins over the column.
    expect(parseFrequencyHz("145662.5 kHz", "mhz")).toBe(145_662_500);
    expect(parseFrequencyHz("10.368 GHz")).toBe(10_368_000_000);
    // In the column's unit it is outside what a frequency can be: not guessed at.
    expect(parseFrequencyHz("145662500", "mhz")).toBeNull();
    expect(unitOfHeading("TX MHz")).toBe("mhz");
    expect(unitOfHeading("output_mhz")).toBe("mhz");
    expect(unitOfHeading("RXMHz")).toBe("mhz");
    expect(unitOfHeading("Frequency (kHz)")).toBe("khz");
    expect(unitOfHeading("Freq GHz")).toBe("ghz");
    expect(unitOfHeading("Output Hz")).toBe("hz");
    expect(unitOfHeading("Frequency")).toBeNull();
    expect(unitOfHeading("Kilohertz? No: Shiftzhz")).toBeNull();

    // With no unit anywhere, the amateur band a reading falls in decides, up to 250 GHz.
    expect(parseFrequencyHz("24048.9")).toBe(24_048_900_000);
    expect(parseFrequencyHz("47088.1")).toBe(47_088_100_000);
    expect(parseFrequencyHz("76032.5")).toBe(76_032_500_000);
    expect(parseFrequencyHz("122250.5")).toBe(122_250_500_000);
    expect(parseFrequencyHz("134928")).toBe(134_928_000_000);
    expect(parseFrequencyHz("241920")).toBe(241_920_000_000);
    expect(bandOfHz(24_048_900_000)).toBe("1.2cm");
    expect(bandOfHz(47_088_000_000)).toBe("6mm");
    expect(bandOfHz(76_032_000_000)).toBe("4mm");
    // Only one reading is a frequency at all: no band is needed to tell.
    expect(parseFrequencyHz("462.5625")).toBe(462_562_500);
    expect(parseFrequencyHz("27.185")).toBe(27_185_000);
    expect(parseFrequencyHz("462562.5")).toBe(462_562_500);
    expect(parseFrequencyHz("462562500")).toBe(462_562_500);
    // Two readings are frequencies and neither is in an amateur band: not stored as a guess.
    expect(parseFrequencyHz("7100")).toBeNull();
    expect(parseFrequencyHz("156800")).toBeNull();
    expect(parseFrequencyHz("156800000")).toBeNull();
    expect(readFrequency("7100")).toEqual({ hz: null, readings: [7_100_000_000, 7_100_000] });
    expect(readFrequency("RV53")).toEqual({ hz: null, readings: [] });

    const file = [
      "Callsign,TX MHz,RX MHz,Mode",
      "QZ3MWA,24048.9,24048.9,FM",
      "QZ3MWB,47088.2,47088.2,FM",
      "QZ3MWC,76032.5,76032.5,FM",
      "QZ3UHF,433.375,434.975,FM",
    ].join("\n");
    const { rows, reasons } = await rowsOf(file);
    expect(reasons).toEqual([]);
    expect(rows.map((row) => [row.callsign, row.outputHz, row.inputHz, row.band])).toEqual([
      ["QZ3MWA", 24_048_900_000, 24_048_900_000, "1.2cm"],
      ["QZ3MWB", 47_088_200_000, 47_088_200_000, "6mm"],
      ["QZ3MWC", 76_032_500_000, 76_032_500_000, "4mm"],
      ["QZ3UHF", 433_375_000, 434_975_000, "70cm"],
    ]);

    // A column that names kilohertz, and one that names nothing where a row cannot be told apart.
    // (Headings Outpost does not match by name: the person matches them in the import dialog.)
    const inKilohertz = await rowsOf(["Callsign,Output kHz,Shift kHz", "QZ3HF,29650,-100", "QZ3VHF,145662.5,-600"].join("\n"), {
      callsign: "Callsign",
      output: "Output kHz",
      offset: "Shift kHz",
    });
    expect(inKilohertz.rows.map((row) => [row.outputHz, row.inputHz])).toEqual([
      [29_650_000, 29_550_000],
      [145_662_500, 145_062_500],
    ]);
    const unsaid = await rowsOf(["Callsign,Frequency", "QZ3HF,7100", "QZ3VHF,145.6625"].join("\n"));
    expect(unsaid.rows.map((row) => row.outputHz)).toEqual([145_662_500]);
    expect(unsaid.reasons).toEqual([
      "2: The output frequency “7100” could be 7100.0000 MHz or 7.1000 MHz, and nothing says which. Name the unit in the column's heading (such as “Output MHz”) or after the number.",
    ]);
  });

  it("has no number that is in an amateur band both as megahertz and as kilohertz, or as kilohertz and as hertz", () => {
    // The guess for a number with no unit rests on this: a band may be added only if it keeps it true.
    const megahertz = REPEATER_BANDS.map((band) => [band.fromMHz, band.toMHz] as const);
    const overlap = (a: readonly [number, number], b: readonly [number, number]) => a[0] <= b[1] && b[0] <= a[1];
    for (const a of megahertz) {
      for (const b of megahertz) {
        expect(overlap(a, [b[0] * 1e3, b[1] * 1e3]), `${a} MHz against ${b} MHz written in kHz`).toBe(false);
        expect(overlap(a, [b[0] * 1e6, b[1] * 1e6]), `${a} MHz against ${b} MHz written in Hz`).toBe(false);
      }
    }
  });

  it("reads modes and statuses as lists write them", () => {
    expect(parseModes("ADF", "etcc-letters")).toEqual(["fm", "dstar", "fusion"]);
    expect(parseModes("M:1", "etcc-letters")).toEqual(["dmr"]);
    expect(parseModes("FM / D-STAR, C4FM", "words")).toEqual(["fm", "dstar", "fusion"]);
    expect(parseModes("USB", "words")).toEqual([]);
    expect(parseModes("constructor __proto__ fm", "words")).toEqual(["fm"]);
    expect(parseStatus("OPERATIONAL")).toBe("operational");
    expect(parseStatus("Not operational")).toBe("off-air");
    expect(parseStatus("REDUCED OUTPUT")).toBe("reduced");
    expect(parseStatus("")).toBe("unknown");
    expect(parseStatus("Awaiting site access")).toBe("unknown");
  });

  it("says plainly what is wrong with a file it cannot read", async () => {
    await expect(readTable("")).rejects.toThrow("That file is empty.");
    await expect(readTable("\u0000\u0001\u0002PK\u0003\u0004 radio image")).rejects.toThrow(/not a text file/);
    await expect(readTable("just one column\nQZ3AB\n")).rejects.toThrow(/no row of column headings/);
    // Headings that name neither a callsign nor a frequency: nothing can be read until the person says which is which.
    const table = await readTable("alpha,beta\n1,2\n");
    const detected = detectFormat(table.columns);
    expect(createRowReader(table.columns, detected.mapping, detected.format).problem).toMatch(/callsign/);
  });

  it("gives two rows for the same callsign and frequency keys of their own", async () => {
    const { rows } = await rowsOf("callsign,frequency\nQZ3AB,145.6625\nQZ3AB,145.6625\nQZ3AB,433.05\n");
    expect(rows.map((row) => row.key)).toEqual(["QZ3AB|145662500", "QZ3AB|145662500#2", "QZ3AB|433050000"]);
  });
});

describe("small sums and words", () => {
  it("names the band a frequency is in", () => {
    expect(bandOfHz(145_500_000)).toBe("2m");
    expect(bandOfHz(433_000_000)).toBe("70cm");
    expect(bandOfHz(70_250_000)).toBe("4m");
    expect(bandOfHz(1_297_000_000)).toBe("23cm");
    expect(bandOfHz(446_006_250)).toBe("70cm");
    expect(bandOfHz(156_800_000)).toBe("other");
  });

  it("writes frequencies and shifts as they are said", () => {
    expect(formatMHz(145_775_000)).toBe("145.7750");
    expect(formatMHz(433_200_000)).toBe("433.2000");
    expect(formatMHz(144_962_550)).toBe("144.962550");
    expect(formatShift(430_875_000, 438_475_000)).toBe("+7.6 MHz");
    expect(formatShift(145_787_500, 434_600_000)).toBe("+288.8125 MHz");
    expect(formatShift(145_500_000, null)).toBe("not listed");
  });

  it("marks a list by its age", () => {
    const day = 86_400_000;
    const now = Date.UTC(2026, 10, 16);
    expect(repeaterDataAge(now - 30 * day, now)).toEqual({ days: 30, age: "current" });
    expect(repeaterDataAge(now - 200 * day, now)).toEqual({ days: 200, age: "old" });
    expect(repeaterDataAge(now - 400 * day, now)).toEqual({ days: 400, age: "very-old" });
    expect(formatAge(0)).toBe("today");
    expect(formatAge(45)).toBe("45 days");
    expect(formatAge(200)).toBe("6 months");
    expect(formatAge(800)).toBe("2 years");
  });

  it("reads what is typed as frequencies and words", () => {
    expect(tokensOf("145.7 thornwick")).toEqual([
      { kind: "frequency", fromHz: 145_700_000, toHz: 145_800_000 },
      { kind: "text", text: "thornwick" },
    ]);
    // A whole number is also looked for as part of a name.
    expect(tokensOf("433")).toEqual([{ kind: "frequency", fromHz: 433_000_000, toHz: 434_000_000, text: "433" }]);
    expect(tokensOf("145.6625")).toEqual([{ kind: "frequency", fromHz: 145_662_500, toHz: 145_662_600 }]);
    expect(tokensOf("QZ3AB")).toEqual([{ kind: "text", text: "qz3ab" }]);
  });
});

// ── The API ─────────────────────────────────────────────────────────────────

describe("repeaters API", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(async () => {
    await app.close();
  });

  const send = (url: string, name: string, content: string, fields: Record<string, string> = {}) => {
    const { payload, headers } = multipart(fields, [{ name, content, type: "text/csv" }]);
    return app.api("POST", url, payload, { headers });
  };
  const preview = async (name: string, content: string, fields: Record<string, string> = {}) =>
    (await send("/api/repeaters/import/preview", name, content, fields)) as { status: number; body: RepeaterImportPreview };
  const importFile = async (name: string, content: string, fields: Record<string, string> = {}) =>
    (await send("/api/repeaters/import", name, content, fields)) as { status: number; body: RepeaterImportResult };
  const list = async (query = "") => (await app.api<RepeaterListResponse>("GET", `/api/repeaters${query}`)).body;
  const calls = async (query = "") => (await list(query)).repeaters.map((repeater) => repeater.callsign);
  const find = async (callsign: string) => (await list(`?q=${callsign}`)).repeaters.find((repeater) => repeater.callsign === callsign)!;

  const importStatus = () =>
    importFile("etcc-status.csv", fixture("etcc-status.csv"), { name: "North list", source: "A made-up society", dataDate: "2026-10-01" });

  it("shows what a file would bring in, and keeps nothing until asked", async () => {
    const { status, body } = await preview("etcc-status.csv", fixture("etcc-status.csv"));
    expect(status).toBe(200);
    expect(body).toMatchObject({
      fileName: "etcc-status.csv",
      format: "etcc-status",
      formatName: "RSGB ETCC list: voice repeaters and gateways, with status",
      rows: 9,
      usable: 6,
      skippedCount: 3,
      withPosition: 6,
      approximatePositions: 3,
      bands: { "2m": 2, "70cm": 2, "6m": 1, "23cm": 1 },
      update: null,
    });
    expect(body.columns.slice(0, 3)).toEqual(["id", "callsign", "band"]);
    expect(body.mapping.output).toBe("TX MHz");
    expect(body.skipped.map((row) => row.line)).toEqual([8, 9, 10]);
    expect(body.skipped[0]!.text).toContain("NOWHERE");
    expect(body.sample[0]).toMatchObject({ callsign: "QZ3AB", line: 2, outputHz: 145_662_500 });
    expect(body.warnings.join(" ")).toMatch(/3 of the positions are written to the nearest few kilometres/);

    expect((await app.api<RepeatersOverview>("GET", "/api/repeaters/overview")).body).toMatchObject({ total: 0, lists: [] });
  });

  it("imports a list with its source and the date of its data, and counts what is held", async () => {
    const { status, body } = await importStatus();
    expect(status).toBe(200);
    expect(body).toMatchObject({ added: 6, updated: 0, unchanged: 0, removed: 0, keptEdits: 0, skipped: 3 });
    expect(body.list).toMatchObject({
      name: "North list",
      source: "A made-up society",
      format: "etcc-status",
      fileName: "etcc-status.csv",
      dataDate: Date.UTC(2026, 9, 1),
      count: 6,
      editedCount: 0,
    });

    const overview = (await app.api<RepeatersOverview>("GET", "/api/repeaters/overview")).body;
    expect(overview).toMatchObject({
      total: 6,
      ownCount: 0,
      withPosition: 6,
      bands: { "2m": 2, "70cm": 2, "6m": 1, "23cm": 1 },
      modes: { fm: 4, dmr: 1, dstar: 1, fusion: 1 },
    });
    expect(overview.lists).toHaveLength(1);
  });

  it("refuses a date in the future, a file with nothing usable and a file whose columns cannot be told", async () => {
    const future = await importFile("etcc-status.csv", fixture("etcc-status.csv"), { dataDate: "2999-01-01" });
    expect(future.status).toBe(400);
    const nothing = await importFile("empty.csv", "callsign,frequency\n,145.5\n");
    expect(nothing.status).toBe(400);
    expect((nothing.body as unknown as { error: { message: string } }).error.message).toMatch(/nothing was imported/);
    const unmapped = await importFile("odd.csv", "alpha,beta\n1,2\n");
    expect(unmapped.status).toBe(400);
    expect((await app.api<RepeatersOverview>("GET", "/api/repeaters/overview")).body.lists).toEqual([]);
    // Not multipart at all.
    expect((await app.api("POST", "/api/repeaters/import", {})).status).toBe(400);
  });

  it("filters by band and mode, and finds by callsign, town and frequency", async () => {
    await importStatus();
    expect(await calls()).toEqual(["QZ3AB", "QZ3EF", "QZ3GH", "QZ3KL", "QZ7CD", "QZ7IJ"]);
    expect(await calls("?band=2m")).toEqual(["QZ3AB", "QZ7IJ"]);
    expect(await calls("?band=70cm&mode=fusion")).toEqual(["QZ3EF"]);
    expect(await calls("?mode=dmr")).toEqual(["QZ7CD"]);
    expect(await calls("?hideOffAir=1&band=70cm")).toEqual(["QZ7CD"]);
    // Callsign, in either case, and the start of one.
    expect(await calls("?q=qz3ab")).toEqual(["QZ3AB"]);
    expect(await calls("?q=QZ7")).toEqual(["QZ7CD", "QZ7IJ"]);
    // Town, and part of a town.
    expect(await calls("?q=marrowby")).toEqual(["QZ7CD"]);
    expect(await calls("?q=fell")).toEqual(["QZ3KL"]);
    // Frequency: the output or the input, by how much of it was typed.
    expect(await calls("?q=145.6625")).toEqual(["QZ3AB"]);
    expect(await calls("?q=145")).toEqual(["QZ3AB"]);
    expect(await calls("?q=438.475")).toEqual(["QZ3EF"]);
    expect(await calls("?q=43")).toEqual([]);
    expect(await calls("?q=430 eskerdale")).toEqual(["QZ3EF"]);
    // Keeper, channel and locator.
    expect(await calls("?q=QZ4DDD")).toEqual(["QZ3GH"]);
    expect(await calls("?q=rv53")).toEqual(["QZ3AB"]);
    expect(await calls("?q=IO94")).toEqual(["QZ7IJ"]);
    // Nothing a LIKE would treat as a wildcard matches everything.
    expect(await calls("?q=%25")).toEqual([]);
    expect(await calls("?q=_")).toEqual([]);

    const page = await list("?limit=2&offset=2");
    expect(page.total).toBe(6);
    expect(page.repeaters.map((repeater) => repeater.callsign)).toEqual(["QZ3GH", "QZ3KL"]);
    expect((await app.api("GET", "/api/repeaters?band=11m")).status).toBe(400);
  });

  it("sorts by distance from a place, with the bearing, and keeps to a distance limit exactly", async () => {
    await importStatus();
    // From a point beside QZ3AB (54.521, -3.123).
    const near = await list("?near=54.5,-3.1");
    expect(near.repeaters.map((repeater) => repeater.callsign)).toEqual(["QZ3AB", "QZ3KL", "QZ7CD", "QZ7IJ", "QZ3EF", "QZ3GH"]);
    const first = near.repeaters[0]!;
    expect(first.distanceMeters).toBeGreaterThan(2700);
    expect(first.distanceMeters).toBeLessThan(2800);
    // North-west of the point.
    expect(first.bearingDegrees).toBeGreaterThan(320);
    expect(first.bearingDegrees).toBeLessThan(330);

    // QZ7CD is 17.0 km away: inside 17.1 km and outside 16.9 km.
    const marrowby = near.repeaters[2]!;
    expect(marrowby.distanceMeters).toBeGreaterThan(16_900);
    expect(marrowby.distanceMeters).toBeLessThan(17_100);
    expect(await calls("?near=54.5,-3.1&withinKm=17.1")).toEqual(["QZ3AB", "QZ3KL", "QZ7CD"]);
    expect(await calls("?near=54.5,-3.1&withinKm=16.9")).toEqual(["QZ3AB", "QZ3KL"]);
    expect((await list("?near=54.5,-3.1&withinKm=16.9")).total).toBe(2);
    expect(await calls("?near=54.5,-3.1&withinKm=200&band=70cm")).toEqual(["QZ7CD", "QZ3EF"]);
    expect((await app.api("GET", "/api/repeaters?near=95,0")).status).toBe(400);
    expect((await app.api("GET", "/api/repeaters?near=somewhere")).status).toBe(400);
  });

  it("lists entries with no position after those with one, and leaves them out of a distance limit", async () => {
    await importStatus();
    await importFile("chirp.csv", fixture("chirp.csv"), { name: "My radio" });
    const all = await list("?near=54.5,-3.1&limit=200");
    expect(all.total).toBe(13);
    expect(all.withoutPosition).toBe(7);
    expect(all.repeaters.slice(0, 6).every((repeater) => repeater.distanceMeters !== undefined)).toBe(true);
    expect(all.repeaters.slice(6).map((repeater) => repeater.callsign)).toEqual([
      "Calling",
      "Listen",
      "QZ3AB",
      "QZ3EF",
      "QZ3GH",
      "QZ3UV",
      "QZ7CD",
    ]);
    // Paging carries on from the placed ones into the unplaced.
    const page = await list("?near=54.5,-3.1&limit=4&offset=4");
    expect(page.repeaters.map((repeater) => repeater.callsign)).toEqual(["QZ3EF", "QZ3GH", "Calling", "Listen"]);
    expect((await list("?near=54.5,-3.1&withinKm=500")).total).toBe(6);
  });

  it("brings a list up to date without overwriting what the person changed or bringing back what they removed", async () => {
    const first = await importStatus();
    const listId = first.body.list.id;

    // The person corrects a tone, and removes a repeater they know has closed.
    const edited = await find("QZ3AB");
    const patched = await app.api<{ repeater: RepeaterDto }>("PATCH", `/api/repeaters/${edited.id}`, {
      ctcssHz: 77,
      notes: "Tone changed in March",
    });
    expect(patched.body.repeater).toMatchObject({ ctcssHz: 77, edited: true });
    const alsoEdited = await find("QZ7IJ");
    await app.api("PATCH", `/api/repeaters/${alsoEdited.id}`, { notes: "Works from the car park" });
    const removed = await find("QZ3GH");
    expect((await app.api("DELETE", `/api/repeaters/${removed.id}`)).status).toBe(200);
    expect(await calls()).not.toContain("QZ3GH");

    // A newer copy: QZ3AB's place is respelt (the person had changed it), QZ7IJ is as it was (the person had
    // changed it too), QZ7CD has a new colour code, QZ3EF is back on the air, QZ3KL is gone, and QZ3ZZ is new.
    const newer = fixture("etcc-status.csv")
      .replace("THORNWICK", "THORNWICK MOOR")
      .replace(",M,IO84,MARROWBY,MB2,NOR,,3,", ",M,IO84,MARROWBY,MB2,NOR,,5,")
      .replace("NOT OPERATIONAL", "OPERATIONAL")
      .replace(/^9006,.*\n/m, "")
      .concat("9010,QZ3ZZ,2M,RV60,145.750000,145.150000,9,10,A,IO84,NEWBIGGIN TARN,,NOR,82.5,,QZ4NNN,54.7,-3.3,OPERATIONAL,\n");

    const plan = (await preview("etcc-status-new.csv", newer, { listId })).body.update!;
    expect(plan).toMatchObject({
      listId,
      listName: "North list",
      added: 1,
      changed: 2,
      unchanged: 0,
      gone: 1,
      editedSame: 1,
      editedDiffering: 1,
      editedExamples: [{ callsign: "QZ3AB", outputHz: 145_662_500 }],
      removedByYou: 1,
      editedGone: 0,
    });
    // Asking changed nothing.
    expect((await find("QZ7CD")).dmrColourCode).toBe(3);

    const applied = await importFile("etcc-status-new.csv", newer, { listId, dataDate: "2026-11-10" });
    expect(applied.body).toMatchObject({ added: 1, updated: 2, unchanged: 0, removed: 1, keptEdits: 2, replacedEdits: 0 });
    expect(applied.body.list).toMatchObject({ id: listId, name: "North list", dataDate: Date.UTC(2026, 10, 10), count: 5, editedCount: 2 });

    // The person's entry is as they left it, and says what the list now says beside it.
    const kept = (await app.api<RepeaterDetailResponse>("GET", `/api/repeaters/${edited.id}`)).body;
    expect(kept.repeater).toMatchObject({ ctcssHz: 77, place: "THORNWICK", notes: "Tone changed in March", edited: true });
    expect(kept.asListed).toMatchObject({ ctcssHz: 94.8, place: "THORNWICK MOOR", notes: "" });
    expect(kept.list).toMatchObject({ id: listId });
    // The rest follow the list.
    expect((await find("QZ7CD")).dmrColourCode).toBe(5);
    expect((await find("QZ3EF")).status).toBe("operational");
    expect(await calls()).toEqual(["QZ3AB", "QZ3EF", "QZ3ZZ", "QZ7CD", "QZ7IJ"]);

    // The same file again: nothing to do, and the difference already kept is not asked about twice.
    const again = (await preview("etcc-status-new.csv", newer, { listId })).body.update!;
    expect(again).toMatchObject({ added: 0, changed: 0, unchanged: 3, gone: 0, editedSame: 2, editedDiffering: 0, removedByYou: 1 });

    // Putting an entry back to what its list says.
    const reverted = await app.api<{ repeater: RepeaterDto }>("POST", `/api/repeaters/${edited.id}/revert`);
    expect(reverted.body.repeater).toMatchObject({ ctcssHz: 94.8, place: "THORNWICK MOOR", notes: "", edited: false });
    expect((await app.api("POST", `/api/repeaters/${edited.id}/revert`)).status).toBe(400);

    // Bringing back what was removed.
    expect((await app.api("POST", `/api/repeaters/lists/${listId}/restore-removed`)).body).toEqual({ restored: 1 });
    expect(await calls()).toContain("QZ3GH");
  });

  it("replaces the person's changes with the list's only when told to, and keeps what is gone when asked", async () => {
    const listId = (await importStatus()).body.list.id;
    const edited = await find("QZ3AB");
    await app.api("PATCH", `/api/repeaters/${edited.id}`, { ctcssHz: 77 });
    const newer = fixture("etcc-status.csv")
      .replace("THORNWICK", "THORNWICK MOOR")
      .replace(/^9006,.*\n/m, "");

    const applied = await importFile("newer.csv", newer, { listId, edited: "replace", gone: "keep" });
    expect(applied.body).toMatchObject({ added: 0, updated: 0, unchanged: 4, removed: 0, keptEdits: 0, replacedEdits: 1 });
    expect(await find("QZ3AB")).toMatchObject({ ctcssHz: 94.8, place: "THORNWICK MOOR", edited: false });
    // Gone from the file, kept because the person asked.
    expect(await calls()).toContain("QZ3KL");
  });

  it("keeps an entry the person changed when it is gone from the list, and says so", async () => {
    const listId = (await importStatus()).body.list.id;
    const edited = await find("QZ3KL");
    await app.api("PATCH", `/api/repeaters/${edited.id}`, { notes: "Mine" });
    const newer = fixture("etcc-status.csv").replace(/^9006,.*\n/m, "");
    expect((await preview("newer.csv", newer, { listId })).body.update).toMatchObject({ gone: 0, editedGone: 1 });
    const applied = await importFile("newer.csv", newer, { listId });
    expect(applied.body).toMatchObject({ removed: 0, keptEdits: 1 });
    expect(await find("QZ3KL")).toMatchObject({ notes: "Mine", edited: true });
  });

  it("removes a list with everything in it, and nothing else", async () => {
    const listId = (await importStatus()).body.list.id;
    await importFile("chirp.csv", fixture("chirp.csv"), { name: "My radio" });
    await app.api("POST", "/api/repeaters", { callsign: "QZ3HAND", outputHz: 145_725_000 });
    expect((await app.api("DELETE", `/api/repeaters/lists/${listId}`)).body).toEqual({ removed: 6 });
    const overview = (await app.api<RepeatersOverview>("GET", "/api/repeaters/overview")).body;
    expect(overview).toMatchObject({ total: 8, ownCount: 1 });
    expect(overview.lists.map((item) => item.name)).toEqual(["My radio"]);
    expect((await app.api("DELETE", `/api/repeaters/lists/${listId}`)).status).toBe(404);
  });

  it("renames a list and corrects the date of its data", async () => {
    const listId = (await importStatus()).body.list.id;
    const patched = await app.api("PATCH", `/api/repeaters/lists/${listId}`, {
      name: "North of England",
      sourceUrl: "https://example.org/list",
      dataDate: "2026-09-15",
    });
    expect(patched.body.list).toMatchObject({
      name: "North of England",
      sourceUrl: "https://example.org/list",
      dataDate: Date.UTC(2026, 8, 15),
    });
    expect((await app.api("PATCH", `/api/repeaters/lists/${listId}`, { name: "  " })).status).toBe(400);
    expect((await app.api("PATCH", `/api/repeaters/lists/${listId}`, { sourceUrl: "javascript:alert(1)" })).status).toBe(400);
  });

  it("takes coordinates as exact unless told how roughly they are known", async () => {
    const add = (extra: object) =>
      app.api<{ repeater: RepeaterDto }>("POST", "/api/repeaters", {
        callsign: "QZ3SQ",
        outputHz: 145_725_000,
        lat: 56.31,
        lon: -3.39,
        ...extra,
      });
    // Typed coordinates: exact.
    expect((await add({})).body.repeater.positionPrecisionMeters).toBe(0);
    // The middle of a 10 km grid square: known to 10 km, and said to be.
    const square = (await add({ positionPrecisionMeters: 10_000 })).body.repeater;
    expect(square).toMatchObject({ lat: 56.31, lon: -3.39, positionPrecisionMeters: 10_000 });
    // Moving it to typed coordinates makes it exact again.
    const moved = await app.api<{ repeater: RepeaterDto }>("PATCH", `/api/repeaters/${square.id}`, { lat: 56.3201, lon: -3.4012 });
    expect(moved.body.repeater.positionPrecisionMeters).toBe(0);
    expect((await add({ positionPrecisionMeters: -5 })).status).toBe(400);
  });

  it("adds, changes and removes an entry made by hand", async () => {
    const created = await app.api<{ repeater: RepeaterDto }>("POST", "/api/repeaters", {
      callsign: " qz3hand ",
      outputHz: 433_375_000,
      inputHz: 434_975_000,
      modes: ["fm"],
      ctcssHz: 82.5,
      place: "Garth Head",
      locator: "io84ej",
    });
    expect(created.status).toBe(200);
    const repeater = created.body.repeater;
    expect(repeater).toMatchObject({
      listId: null,
      callsign: "qz3hand",
      band: "70cm",
      locator: "IO84EJ",
      edited: false,
      status: "unknown",
    });
    // A locator alone: the middle of its square, and no more exact than the square.
    expect(repeater.lat).toBeCloseTo(54.3958, 3);
    expect(repeater.lon).toBeCloseTo(-3.625, 3);
    expect(repeater.positionPrecisionMeters).toBeGreaterThan(3000);

    // Coordinates the person gives are taken as exact.
    const moved = await app.api<{ repeater: RepeaterDto }>("PATCH", `/api/repeaters/${repeater.id}`, {
      lat: 54.4012,
      lon: -3.6101,
      status: "operational",
    });
    expect(moved.body.repeater).toMatchObject({
      lat: 54.4012,
      lon: -3.6101,
      positionPrecisionMeters: 0,
      status: "operational",
      edited: false,
    });
    // A new locator with no coordinates moves it to that square.
    const relocated = await app.api<{ repeater: RepeaterDto }>("PATCH", `/api/repeaters/${repeater.id}`, { locator: "IO84KM" });
    expect(relocated.body.repeater.lat).toBeCloseTo(54.5208, 3);
    expect(await calls("?q=garth")).toEqual(["qz3hand"]);
    expect(await calls("?list=own")).toEqual(["qz3hand"]);

    expect((await app.api("PATCH", `/api/repeaters/${repeater.id}`, { locator: "ZZ99" })).status).toBe(400);
    expect((await app.api("PATCH", `/api/repeaters/${repeater.id}`, { lat: 54.4, lon: null })).status).toBe(400);
    expect((await app.api("POST", "/api/repeaters", { callsign: "", outputHz: 145_000_000 })).status).toBe(400);
    expect((await app.api("POST", "/api/repeaters", { callsign: "QZ3X", outputHz: 12 })).status).toBe(400);
    expect((await app.api("POST", "/api/repeaters", { callsign: "QZ3X", outputHz: 145_000_000, dcsCode: "999" })).status).toBe(400);

    expect((await app.api("DELETE", `/api/repeaters/${repeater.id}`)).status).toBe(200);
    expect((await app.api("GET", `/api/repeaters/${repeater.id}`)).status).toBe(404);
    expect((await app.api<RepeatersOverview>("GET", "/api/repeaters/overview")).body.total).toBe(0);
  });

  it("gives the map each repeater when there are few, and counts by patch when there are many", async () => {
    await importStatus();
    const few = (await app.api<RepeaterOverlayResponse>("GET", "/api/repeaters/overlay?bbox=-4,54,-2,55")).body;
    expect(few.total).toBe(3);
    expect(few.cells).toEqual([]);
    expect(few.points.map((point) => point.callsign).sort()).toEqual(["QZ3AB", "QZ3KL", "QZ7CD"]);
    expect(few.points[0]).toEqual({
      id: expect.any(String),
      callsign: "QZ3AB",
      lat: 54.521,
      lon: -3.123,
      outputHz: 145_662_500,
      band: "2m",
      status: "operational",
    });
    // The same filters as the list.
    const fm = (await app.api<RepeaterOverlayResponse>("GET", "/api/repeaters/overlay?bbox=-6,53,0,56&band=70cm")).body;
    expect(fm.points.map((point) => point.callsign).sort()).toEqual(["QZ3EF", "QZ7CD"]);

    // 1,200 more in a grid over the same hills, and one far away on its own.
    const lines = ["callsign,frequency,lat,lon"];
    for (let index = 0; index < 1200; index += 1) {
      lines.push(
        `QZ9${String(index).padStart(4, "0")},145.${String(1000 + index)},${(54 + (index % 40) * 0.025).toFixed(3)},${(-4 + Math.floor(index / 40) * 0.066).toFixed(3)}`,
      );
    }
    lines.push("QZ9FAR,145.2000,58.5,-6.5");
    expect((await importFile("many.csv", lines.join("\n"), { name: "Many" })).body.added).toBe(1201);

    const sum = (overlay: RepeaterOverlayResponse) => overlay.cells.reduce((total, cell) => total + cell.count, 0) + overlay.points.length;
    const wide = (await app.api<RepeaterOverlayResponse>("GET", "/api/repeaters/overlay?bbox=-8,52,0,60")).body;
    expect(wide.total).toBe(1207);
    // Every repeater is in exactly one patch or is a point of its own.
    expect(sum(wide)).toBe(1207);
    expect(wide.cells.length).toBeGreaterThanOrEqual(1);
    // The one on its own is a point that can be opened, not a patch of one.
    expect(wide.points.map((point) => point.callsign)).toContain("QZ9FAR");

    const hills = (await app.api<RepeaterOverlayResponse>("GET", "/api/repeaters/overlay?bbox=-4.5,53.8,-1.5,55.3")).body;
    expect(hills.total).toBe(1204);
    expect(sum(hills)).toBe(1204);
    expect(hills.cells.length).toBeGreaterThan(8);
    expect(hills.cells.length).toBeLessThan(60);
    expect(
      hills.cells.every((cell) => cell.count > 1 && cell.lat >= 53.8 && cell.lat <= 55.3 && cell.lon >= -4.5 && cell.lon <= -1.5),
    ).toBe(true);

    // Zoomed in, they are themselves again.
    const close = (await app.api<RepeaterOverlayResponse>("GET", "/api/repeaters/overlay?bbox=-4.01,54,-3.9,54.3")).body;
    expect(close.cells).toEqual([]);
    expect(close.points.length).toBe(close.total);
    expect(close.total).toBeGreaterThan(10);

    // A view across the 180° meridian has its west edge east of its east edge.
    await app.api("POST", "/api/repeaters", { callsign: "QZ0DATE", outputHz: 145_000_000, lat: -17.5, lon: 179.5 });
    const dateline = (await app.api<RepeaterOverlayResponse>("GET", "/api/repeaters/overlay?bbox=170,-30,-170,0")).body;
    expect(dateline.points.map((point) => point.callsign)).toEqual(["QZ0DATE"]);
    expect((await app.api("GET", "/api/repeaters/overlay?bbox=1,2,3")).status).toBe(400);
    expect((await app.api("GET", "/api/repeaters/overlay?bbox=0,60,10,50")).status).toBe(400);
  });

  it("writes a set out for CHIRP and reads it back the same", async () => {
    await importStatus();
    const response = await app.api<string>("GET", "/api/repeaters/export?format=chirp&near=54.5,-3.1&withinKm=200");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toMatch(/^attachment; filename="repeaters-chirp-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers["content-security-policy"]).toBe("sandbox; default-src 'none'");
    expect(response.headers["x-outpost-repeater-count"]).toBe("6");

    const lines = response.body.trimEnd().split("\r\n");
    expect(lines[0]).toBe(CHIRP_COLUMNS.join(","));
    // Nearest first, numbered from 1, with the output as the frequency the radio listens on.
    expect(lines[1]).toBe(
      '1,QZ3AB,145.662500,-,0.600000,Tone,94.8,94.8,023,NN,023,Tone->Tone,FM,12.50,,,"THORNWICK; listed as operational; A made-up society, 2026-10-01",,,,',
    );

    const back = await rowsOf(response.body);
    expect(back.format).toBe("chirp");
    const original = (await list("?near=54.5,-3.1&limit=200")).repeaters;
    expect(back.rows.map((row) => row.callsign)).toEqual(original.map((repeater) => repeater.callsign));
    for (const [index, row] of back.rows.entries()) {
      const repeater = original[index]!;
      expect({ callsign: row.callsign, outputHz: row.outputHz, inputHz: row.inputHz, ctcssHz: row.ctcssHz, dcsCode: row.dcsCode }).toEqual({
        callsign: repeater.callsign,
        outputHz: repeater.outputHz,
        inputHz: repeater.inputHz,
        ctcssHz: repeater.ctcssHz,
        dcsCode: repeater.dcsCode,
      });
    }
    // CHIRP has one mode to a channel: FM where the repeater takes it, otherwise its digital mode.
    expect(byCall(back.rows, "QZ3EF").modes).toEqual(["fm"]);
    expect(byCall(back.rows, "QZ7CD").modes).toEqual(["dmr"]);
    expect(byCall(back.rows, "QZ7IJ").modes).toEqual(["dstar"]);
    // What CHIRP has no column for goes in the comment.
    expect(lines.find((line) => line.includes("QZ7CD"))).toContain("colour code 3");
    expect(lines.find((line) => line.includes("QZ3KL"))).toContain("1750 Hz tone burst.");

    // The filters choose the set, and a limit takes the nearest.
    const two = await app.api<string>("GET", "/api/repeaters/export?format=chirp&near=54.5,-3.1&limit=2");
    expect(
      two.body
        .trimEnd()
        .split("\r\n")
        .slice(1)
        .map((line) => line.split(",")[1]),
    ).toEqual(["QZ3AB", "QZ3KL"]);
    expect((await app.api("GET", "/api/repeaters/export?format=chirp&band=3cm")).status).toBe(404);
    expect((await app.api("GET", "/api/repeaters/export?format=adif")).status).toBe(400);
  });

  it("writes a repeater with no listed input so that a radio will not transmit there", async () => {
    await app.api("POST", "/api/repeaters", { callsign: "QZ3RX", outputHz: 145_800_000 });
    const body = (await app.api<string>("GET", "/api/repeaters/export?format=chirp")).body;
    expect(body.split("\r\n")[1]).toMatch(/^1,QZ3RX,145\.800000,off,0\.000000,,/);
  });

  it("writes everything out in Outpost's own layout and reads it back without loss", async () => {
    await importStatus();
    const edited = await find("QZ7CD");
    await app.api("PATCH", `/api/repeaters/${edited.id}`, {
      talkgroups: "TG 235, TG 9",
      notes: 'Keeper says "ask first", =SUM(1)',
      status: "reduced",
      country: "Nowhere",
    });
    const response = await app.api<string>("GET", "/api/repeaters/export?format=outpost");
    expect(response.status).toBe(200);
    expect(response.body.split("\r\n")[0]).toBe(
      "callsign,output_mhz,input_mhz,band,modes,ctcss_hz,dcs_code,dmr_colour_code,talkgroups,access_note,channel,place,region,country,latitude,longitude,locator,position_precision_m,antenna_m,keeper,status,status_as_listed,notes,source,data_date",
    );

    const fresh = await createTestApp();
    try {
      const { payload, headers } = multipart({ name: "Copy" }, [{ name: "copy.csv", content: response.body, type: "text/csv" }]);
      const imported = await fresh.api<RepeaterImportResult>("POST", "/api/repeaters/import", payload, { headers });
      expect(imported.body).toMatchObject({ added: 6, skipped: 0 });
      expect(imported.body.list.format).toBe("outpost");
      const copy = (await fresh.api<RepeaterListResponse>("GET", "/api/repeaters?limit=200")).body.repeaters;
      const original = (await list("?limit=200")).repeaters;
      const comparable = (repeater: RepeaterDto) => {
        const { id: _id, listId: _listId, edited: _edited, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = repeater;
        return rest;
      };
      expect(copy.map(comparable)).toEqual(original.map(comparable));
      expect(copy.find((repeater) => repeater.callsign === "QZ7CD")).toMatchObject({
        talkgroups: "TG 235, TG 9",
        notes: 'Keeper says "ask first", =SUM(1)',
        status: "reduced",
        positionPrecisionMeters: 5560,
      });
    } finally {
      await fresh.close();
    }
  });

  it("is found by callsign, town and frequency in the search across everything", async () => {
    await importStatus();
    await app.api("POST", "/api/notes", { title: "Thornwick walk" });
    await app.ctx.jobs.whenIdle();

    const byCallsign = (await app.api<SearchResponse>("GET", "/api/search?q=QZ3AB")).body;
    expect(byCallsign.results).toHaveLength(1);
    expect(byCallsign.results[0]).toMatchObject({
      kind: "repeater",
      title: "QZ3AB",
      subtitle: "145.6625 MHz, THORNWICK",
      collection: "Repeaters",
    });
    expect(byCallsign.results[0]!.url).toMatch(/^\/radio\/repeaters\/[0-9a-z]{26}$/);
    expect(byCallsign.results[0]!.titleSegments).toEqual([{ text: "QZ3AB", hit: true }]);
    expect(byCallsign.results[0]!.passages[0]!.segments[0]!.text).toBe(
      "FM, shift -0.6 MHz, CTCSS 94.8 Hz. From A made-up society, data of 2026-10-01.",
    );
    expect(byCallsign.facets).toEqual({ repeater: 1 });

    // A town: the page of notes and the repeater, each under its own kind.
    const byTown = (await app.api<SearchResponse>("GET", "/api/search?q=thornwick")).body;
    expect(byTown.results.map((result) => result.kind).sort()).toEqual(["note", "repeater"]);
    expect(byTown.facets).toEqual({ note: 1, repeater: 1 });
    expect((await app.api<SearchResponse>("GET", "/api/search?q=430.875")).body.results.map((result) => result.title)).toEqual(["QZ3EF"]);

    // Narrowed to one kind, or to another.
    expect(
      (await app.api<SearchResponse>("GET", "/api/search?q=thornwick&kinds=repeater")).body.results.map((result) => result.kind),
    ).toEqual(["repeater"]);
    expect((await app.api<SearchResponse>("GET", "/api/search?q=thornwick&kinds=note")).body.results.map((result) => result.kind)).toEqual([
      "note",
    ]);
    // A removed entry is not found.
    const gone = await find("QZ3AB");
    await app.api("DELETE", `/api/repeaters/${gone.id}`);
    expect((await app.api<SearchResponse>("GET", "/api/search?q=QZ3AB")).body.results).toEqual([]);
  });

  it("does not hand repeaters to the model as sources for an answer", async () => {
    await importStatus();
    expect(await app.ctx.services.retrieval.retriever.retrieve({ query: "thornwick" })).toEqual([]);
  });
});
