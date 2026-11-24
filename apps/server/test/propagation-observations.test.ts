/**
 * The log of contacts through the API: reading ADIF as its specification (3.1.8)
 * describes it, never giving an end a position its log did not state, dealing with the
 * same contact twice, and comparing what was logged with what the real engine predicts
 * without claiming more than the counts show.
 */
import {
  ANTENNA_PRESETS,
  type ComparisonRequest,
  type ComparisonResult,
  comparableMode,
  comparisonLevel,
  type ObservationImport,
  type ObservationList,
  type PredictionResult,
} from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adifInstant, adifLocation, looksLikeAdif, parseAdif } from "../src/modules/propagation/adif.ts";
import { multipart } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { describeWithVoacapData } from "./voacap-data.ts";

const dipole = ANTENNA_PRESETS.find((preset) => preset.id === "low-dipole")!.spec;

/** One field of an ADI record: the length is counted for the test, as an exporting program counts it. */
const f = (name: string, value: string) => `<${name}:${Buffer.byteLength(value)}>${value}`;
const record = (fields: Record<string, string>) =>
  `${Object.entries(fields)
    .map(([name, value]) => f(name, value))
    .join(" ")} <EOR>\n`;
const header = `Exported for the tests\n${f("ADIF_VER", "3.1.8")} ${f("PROGRAMID", "TestLog")} ${f("PROGRAMVERSION", "2.0")} <EOH>\n`;

/** London to Birmingham on 40 m SSB at noon in November 2026: the acceptance path, as a logging program would write it. */
const acceptance = {
  CALL: "G4BBB",
  STATION_CALLSIGN: "G4AAA",
  QSO_DATE: "20261116",
  TIME_ON: "1204",
  FREQ: "7.1",
  BAND: "40M",
  MODE: "SSB",
  SUBMODE: "LSB",
  RST_SENT: "57",
  RST_RCVD: "55",
  TX_PWR: "5",
  MY_GRIDSQUARE: "IO91WM",
  GRIDSQUARE: "IO92BL",
  MY_ANTENNA: "Low dipole",
  COMMENT: "Sked with Brum",
};

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

const importFile = async (name: string, content: string | Buffer) => {
  const { payload, headers } = multipart({}, [{ name, content: content as string, type: "text/plain" }]);
  return (await app.api("POST", "/api/radio/observations/import", payload, { headers })) as {
    status: number;
    body: { import: ObservationImport; error?: { message: string } };
  };
};
const list = async () => (await app.api<ObservationList>("GET", "/api/radio/observations")).body;
const assumptions: ComparisonRequest = { myAntenna: dipole, theirAntenna: dipole, noise: "city", defaultPowerWatts: null, ssnByMonth: {} };

describe("reading ADIF", () => {
  it("reads data-specifiers by their length, whatever the case, and ignores what is outside them", () => {
    const file = parseAdif(
      Buffer.from(
        `A header with a < in it? No: this line has none.\n<adif_ver:5>3.1.8 <ProgramID:7>MonoLog\n<eoh>\nstray text <call:5:S>G4BBB junk<QSO_DATE:8:d>20261116<time_on:4>1204 <comment:11>a <b> c > d<Eor>\n<CALL:4>M0XX<eor>`,
      ),
    );
    expect(Object.fromEntries(file.header)).toEqual({ ADIF_VER: "3.1.8", PROGRAMID: "MonoLog" });
    expect(file.records).toHaveLength(2);
    expect(Object.fromEntries(file.records[0]!.fields)).toEqual({
      CALL: "G4BBB",
      QSO_DATE: "20261116",
      TIME_ON: "1204",
      COMMENT: "a <b> c > d",
    });
    expect(file.truncated).toBe(0);
  });

  it("reads a file with no header, a zero length, and a field given twice", () => {
    const file = parseAdif(Buffer.from("<CALL:4>M0XX<NAME:0><CALL:5>G4BBB<EOR>"));
    expect(file.header.size).toBe(0);
    expect(Object.fromEntries(file.records[0]!.fields)).toEqual({ CALL: "M0XX", NAME: "" });
  });

  it("counts a record the file stops in the middle of, and reads nothing from a header that never ends", async () => {
    expect(parseAdif(Buffer.from("<CALL:4>M0XX<EOR><CALL:5>G4BBB<QSO_DATE:8>2026")).truncated).toBe(1);
    expect(parseAdif(Buffer.from("<CALL:4>M0XX<EOR><CALL:5>G4BBB")).truncated).toBe(1);
    expect(parseAdif(Buffer.from("Not a log at all <CALL:4>M0XX<EOR>")).records).toEqual([]);
    expect(await looksLikeAdif(Buffer.from("callsign,date\nG4BBB,2026-11-16"))).toBe(false);
  });

  it("takes a byte-order mark or white space before the first data-specifier as no header at all", () => {
    const one = "<CALL:4>M0XX<QSO_DATE:8>20261116<EOR>";
    for (const lead of ["\uFEFF", "\n", " ", "\r\n\r\n", "\uFEFF\r\n \t"]) {
      const file = parseAdif(Buffer.from(lead + one));
      expect(
        file.records.map((item) => Object.fromEntries(item.fields)),
        JSON.stringify(lead),
      ).toEqual([{ CALL: "M0XX", QSO_DATE: "20261116" }]);
      expect(file.header.size).toBe(0);
      expect(file.headerNeverEnds).toBe(false);
    }
    // With an <EOH>, what comes before it is the header, mark or no mark.
    const headed = parseAdif(Buffer.from(`\uFEFF<ADIF_VER:5>3.1.8 <PROGRAMID:7>MonoLog<EOH>${one}`));
    expect(Object.fromEntries(headed.header)).toEqual({ ADIF_VER: "3.1.8", PROGRAMID: "MonoLog" });
    expect(headed.records).toHaveLength(1);
    // Words before the first data-specifier are a header, and one that never ends is said to be so.
    expect(parseAdif(Buffer.from(`Not a log at all ${one}`))).toMatchObject({ records: [], headerNeverEnds: true });
  });

  it("counts lengths in bytes and reads accents written as UTF-8 or as Latin-1", () => {
    const utf8 = parseAdif(Buffer.from(`${f("COMMENT", "café au lait")}${f("CALL", "F4ABC")}<EOR>`));
    expect(Object.fromEntries(utf8.records[0]!.fields)).toEqual({ COMMENT: "café au lait", CALL: "F4ABC" });
    const latin1 = parseAdif(Buffer.from("<COMMENT:4>caf\xe9<CALL:5>F4ABC<EOR>", "latin1"));
    expect(latin1.records[0]!.fields.get("COMMENT")).toBe("café");
  });

  it("takes dates, times and locations only in the forms the specification gives", () => {
    expect(adifInstant("20261116", "1204")).toBe(Date.UTC(2026, 10, 16, 12, 4));
    expect(adifInstant("20261116", "120459")).toBe(Date.UTC(2026, 10, 16, 12, 4, 59));
    expect(adifInstant("20260631", "1204")).toBeNull();
    expect(adifInstant("2026-11-16", "1204")).toBeNull();
    expect(adifInstant("20261116", "2460")).toBeNull();
    expect(adifInstant("20261116", "12")).toBeNull();
    expect(adifLocation("N051 30.444", "lat")).toBeCloseTo(51.5074, 4);
    expect(adifLocation("W000 07.668", "lon")).toBeCloseTo(-0.1278, 4);
    expect(adifLocation("S033 52.000", "lat")).toBeCloseTo(-33.8667, 4);
    expect(adifLocation("W000 07.668", "lat")).toBeNull();
    expect(adifLocation("51.5074", "lat")).toBeNull();
    expect(adifLocation("N051 60.000", "lat")).toBeNull();
    expect(adifLocation("N091 00.000", "lat")).toBeNull();
  });

  it("knows which logged modes have a requirement to compare against", () => {
    expect(comparableMode("SSB/LSB")).toBe("ssb");
    expect(comparableMode("CW")).toBe("cw");
    expect(comparableMode("FT8")).toBe("ft8");
    expect(comparableMode("MFSK/JS8")).toBe("js8");
    expect(comparableMode("MFSK/FT4")).toBeNull();
    expect(comparableMode("RTTY")).toBeNull();
    expect([0.29, 0.3, 0.69, 0.7].map(comparisonLevel)).toEqual(["low", "middling", "middling", "high"]);
  });
});

describe("importing a log", () => {
  it("brings in what it can read, and counts what it cannot with the reason", async () => {
    const file =
      header +
      record(acceptance) +
      // The same contact again, as a second program would export it: no BAND, seconds on the time.
      record({ ...acceptance, TIME_ON: "120430", BAND: "", SUBMODE: "LSB" }) +
      // Explicit coordinates win over the locator; a two-character locator is not a position.
      record({
        CALL: "EA3XYZ",
        STATION_CALLSIGN: "G4AAA",
        QSO_DATE: "20261116",
        TIME_ON: "0903",
        BAND: "20m",
        MODE: "FT8",
        MY_LAT: "N051 30.444",
        MY_LON: "W000 07.668",
        MY_GRIDSQUARE: "JO01",
        GRIDSQUARE: "JN",
        TX_PWR: "10",
      }) +
      // No position for either end: kept, with both ends unknown.
      record({ CALL: "DL1ABC", QSO_DATE: "20261115", TIME_ON: "1830", FREQ: "3.573", MODE: "MFSK", SUBMODE: "JS8" }) +
      // A station heard, not worked.
      record({
        CALL: "OH2XX",
        OPERATOR: "G4AAA",
        QSO_DATE: "20261114",
        TIME_ON: "0700",
        FREQ: "14.074",
        MODE: "FT8",
        SWL: "Y",
        GRIDSQUARE: "KP20",
        MY_GRIDSQUARE: "IO91WM",
        TX_PWR: "5",
      }) +
      // Through a satellite.
      record({
        CALL: "W1AW",
        STATION_CALLSIGN: "G4AAA",
        QSO_DATE: "20261113",
        TIME_ON: "1500",
        FREQ: "145.9",
        BAND: "2m",
        MODE: "SSB",
        PROP_MODE: "SAT",
        GRIDSQUARE: "FN31",
        MY_GRIDSQUARE: "IO91WM",
      }) +
      record({ STATION_CALLSIGN: "G4AAA", QSO_DATE: "20261116", TIME_ON: "1300", BAND: "40m", MODE: "SSB" }) +
      record({ CALL: "G0AAA", QSO_DATE: "16/11/2026", TIME_ON: "1300", BAND: "40m", MODE: "SSB" }) +
      record({ CALL: "G0BBB", TIME_ON: "1300", BAND: "40m", MODE: "SSB" }) +
      record({ CALL: "G0CCC", QSO_DATE: "20261116", TIME_ON: "1300", MODE: "SSB" }) +
      record({ CALL: "G0DDD", QSO_DATE: "20261116", TIME_ON: "1300", BAND: "40m" }) +
      "<CALL:5>G0EEE<QSO_DATE:8>2026";
    const { status, body } = await importFile("test log.adi", file);
    expect(status).toBe(200);
    expect(body.import).toMatchObject({
      fileName: "test log.adi",
      adifVersion: "3.1.8",
      program: "TestLog 2.0",
      records: 12,
      imported: 5,
      duplicates: 1,
    });
    expect(body.import.skipped).toEqual(
      expect.arrayContaining([
        { reason: "No callsign for the station contacted (CALL)", count: 1 },
        { reason: "The date or the time is not one the specification allows", count: 1 },
        { reason: "No date or no time (QSO_DATE, TIME_ON)", count: 1 },
        { reason: "Neither a frequency nor a band (FREQ, BAND)", count: 1 },
        { reason: "No mode (MODE)", count: 1 },
        { reason: "The file ends in the middle of a record", count: 1 },
      ]),
    );
    // Every record is accounted for: brought in, already there, or left out for a stated reason.
    const left = body.import.skipped.reduce((sum, item) => sum + item.count, 0);
    expect(body.import.imported + body.import.duplicates + left).toBe(body.import.records);
    expect(body.import.notes).toEqual(
      expect.arrayContaining([
        { reason: expect.stringContaining("locator had two characters"), count: 1 },
        { reason: "No position was given for the logging station, so that end has none", count: 1 },
        { reason: "No position was given for the contacted station, so that end has none", count: 2 },
      ]),
    );

    const log = await list();
    expect(log.total).toBe(5);
    expect(log.imports).toHaveLength(1);
    const byCall = (call: string) => log.observations.find((item) => item.rx.call === call || item.tx.call === call)!;
    expect(byCall("G4BBB")).toMatchObject({
      at: Date.UTC(2026, 10, 16, 12, 4),
      frequencyMhz: 7.1,
      band: "40m",
      mode: "SSB/LSB",
      outcome: "contact",
      tx: { call: "G4AAA", from: "locator IO91WM" },
      rx: { call: "G4BBB", from: "locator IO92BL" },
      powerWatts: 5,
      antenna: "Low dipole",
      reportSent: "57",
      reportReceived: "55",
      notes: "Sked with Brum",
      source: "adif",
    });
    // The middle of the locator's square, and nothing finer.
    expect(byCall("G4BBB").tx.lat).toBeCloseTo(51.5208, 3);
    expect(byCall("G4BBB").tx.lon).toBeCloseTo(-0.125, 3);
    // Coordinates as stated; the other end had only a field, so it has no position at all.
    expect(byCall("EA3XYZ")).toMatchObject({ tx: { from: "coordinates" }, rx: { call: "EA3XYZ", lat: null, lon: null, from: "" } });
    expect(byCall("EA3XYZ").tx.lat).toBeCloseTo(51.5074, 4);
    expect(byCall("DL1ABC")).toMatchObject({
      mode: "MFSK/JS8",
      band: "80m",
      tx: { call: "", lat: null },
      rx: { lat: null },
      powerWatts: null,
    });
    // Heard: the station heard is the transmitter, and the power in the file is not its power.
    expect(byCall("OH2XX")).toMatchObject({
      outcome: "heard",
      tx: { call: "OH2XX", from: "locator KP20" },
      rx: { call: "G4AAA" },
      powerWatts: null,
    });
    expect(byCall("W1AW")).toMatchObject({ propMode: "SAT", band: "2m" });
  });

  it("does not bring the same contacts in twice", async () => {
    const again = await importFile("again.adi", header + record(acceptance) + record({ ...acceptance, CALL: "G4CCC", TIME_ON: "1210" }));
    expect(again.body.import).toMatchObject({ records: 2, imported: 1, duplicates: 1 });
    expect((await list()).total).toBe(6);
    // Taking an import back removes what it brought in, and only that.
    const removed = await app.api("DELETE", `/api/radio/observations/imports/${again.body.import.id}`);
    expect(removed.body).toEqual({ removed: 1 });
    const log = await list();
    expect(log.total).toBe(5);
    expect(log.imports).toHaveLength(1);
    expect((await app.api("DELETE", "/api/radio/observations/imports/none")).status).toBe(404);
  });

  it("refuses what is not ADIF, in words, and brings nothing in", async () => {
    const csv = await importFile("log.csv", "callsign,date\nG4BBB,2026-11-16\n");
    expect(csv.status).toBe(400);
    expect(csv.body.error!.message).toContain("That is not an ADIF file Outpost can read");
    const none = await app.api("POST", "/api/radio/observations/import", { file: "x" });
    expect(none.status).toBe(400);
    expect((await list()).total).toBe(5);
  });

  it("brings in a file with no header that starts with a byte-order mark or a blank line", async () => {
    const lone = (call: string) => record({ CALL: call, QSO_DATE: "20261101", TIME_ON: "0800", BAND: "40m", MODE: "CW" });
    const marked = await importFile("marked.adi", `\uFEFF${lone("G7AAA")}`);
    expect(marked.status).toBe(200);
    expect(marked.body.import).toMatchObject({ records: 1, imported: 1, skipped: [] });
    const blank = await importFile("blank.adi", `\r\n ${lone("G7BBB")}${lone("G7CCC")}`);
    expect(blank.body.import).toMatchObject({ records: 2, imported: 2 });
    for (const done of [marked, blank]) await app.api("DELETE", `/api/radio/observations/imports/${done.body.import.id}`);
  });

  it("says so when a file has nothing in it to read, and records no import", async () => {
    const before = await list();
    const refused = async (name: string, content: string) => {
      const answer = await importFile(name, content);
      expect(answer.status, name).toBe(400);
      expect((answer.body.error as { details?: { reason?: string } }).details?.reason, name).toBe("nothing-to-read");
      return answer.body.error!.message;
    };
    // A header and no records.
    expect(await refused("empty.adi", header)).toContain("has a header and no contacts after it");
    // Words before the first data-specifier and no <EOH>: a header that never ends.
    expect(
      await refused("words.adi", "Exported by hand <CALL:4>M0XX<QSO_DATE:8>20261116<TIME_ON:4>0800<BAND:3>40m<MODE:2>CW<EOR>"),
    ).toContain("no <EOH> tag");
    // End-of-record tags with nothing between them.
    expect(await refused("tags.adi", "<EOR>\n<EOR>\n")).toContain("no contacts");
    const after = await list();
    expect(after.total).toBe(before.total);
    expect(after.imports).toHaveLength(before.imports.length);
  });
});

describe("an entry typed in", () => {
  const typed = {
    at: "2026-11-16T15:55:00Z",
    frequencyMhz: 7.12,
    band: "",
    mode: "ssb",
    outcome: "failed",
    tx: { call: "g4aaa", lat: 51.5074, lon: -0.1278 },
    rx: { call: "", lat: 52.4862, lon: -1.8904 },
    powerWatts: 5,
    antenna: "Low dipole",
    reportSent: "",
    reportReceived: "",
    notes: "Called for ten minutes.",
  };

  it("is kept with the band its frequency is in, and is not added twice", async () => {
    const made = await app.api("POST", "/api/radio/observations", typed);
    expect(made.status).toBe(200);
    expect(made.body.observation).toMatchObject({
      band: "40m",
      mode: "SSB",
      outcome: "failed",
      tx: { call: "G4AAA", from: "coordinates" },
      rx: { call: "", lat: 52.4862 },
      source: "manual",
    });
    const twice = await app.api("POST", "/api/radio/observations", typed);
    expect(twice.status).toBe(409);
    expect(twice.body.error.message).toContain("already in the log");
    expect((await app.api("DELETE", `/api/radio/observations/${made.body.observation.id}`)).status).toBe(200);
    expect((await app.api("DELETE", `/api/radio/observations/${made.body.observation.id}`)).status).toBe(404);
  });

  it("is checked", async () => {
    const refused = async (patch: Record<string, unknown>) => {
      const { status, body } = await app.api("POST", "/api/radio/observations", { ...typed, ...patch });
      expect(status).toBe(400);
      return JSON.stringify(body.error);
    };
    expect(await refused({ at: "yesterday" })).toContain("Give the date and time in UTC.");
    expect(await refused({ mode: "" })).toContain("Give the mode");
    expect(await refused({ tx: { call: "", lat: 51.5, lon: null } })).toContain("Give both the latitude and the longitude");
    expect(await refused({ frequencyMhz: null, band: "" })).toContain("Give the frequency or the band.");
    expect(await refused({ outcome: "maybe" })).toContain("outcome");
    expect(await refused({ rx: { call: "", lat: 52.5, lon: 13.4, locator: "ZZ99" } })).toContain("Maidenhead locator");
  });

  it("keeps a position typed as a locator as that locator, to be said back as given", async () => {
    const made = await app.api("POST", "/api/radio/observations", {
      ...typed,
      at: "2026-11-16T16:05:00Z",
      rx: { call: "dl1abc", lat: 52.52083, lon: 13.375, locator: "jo62qm" },
    });
    expect(made.status).toBe(200);
    expect(made.body.observation.rx).toMatchObject({ call: "DL1ABC", from: "locator JO62QM" });
    expect(made.body.observation.tx.from).toBe("coordinates");
  });
});

describeWithVoacapData("comparing the log with predictions", () => {
  let result: ComparisonResult;

  it("counts each compared entry where the engine's own figure puts it, and says why the rest are left out", async () => {
    const { status, body } = await app.api("POST", "/api/radio/observations/compare", assumptions);
    expect(status).toBe(200);
    result = body.comparison;
    expect(result.total).toBe(5);
    // Only the acceptance contact has two stated positions, an HF frequency, a mode with a requirement and a power.
    expect(result.compared).toBe(1);
    expect(result.excluded).toEqual(
      expect.arrayContaining([
        { reason: "One end or both have no stated position", count: 2 },
        { reason: expect.stringContaining("PROP_MODE SAT"), count: 1 },
        { reason: "No power was logged, and none was given to assume", count: 1 },
      ]),
    );
    expect(result.compared + result.excluded.reduce((sum, item) => sum + item.count, 0)).toBe(result.total);

    // The one compared: the engine's figure for that path at the nearest whole hour, 12:00.
    const row = result.rows[0]!;
    const square = { tx: { lat: 51.5208, lon: -0.125 }, rx: { lat: 52.4792, lon: -1.875 } };
    const point = (
      await app.api<PredictionResult>("POST", "/api/radio/propagation/predict", {
        tx: { name: "G4AAA", ...square.tx },
        rx: { name: "G4BBB", ...square.rx },
        date: "2026-11-16",
        powerWatts: 5,
        txAntenna: dipole,
        rxAntenna: dipole,
        noise: "city",
        frequencyMhz: 7.1,
        mode: "ssb",
        solar: { source: "table" },
      })
    ).body;
    expect(row).toMatchObject({
      utcHour: 12,
      frequencyMhz: 7.1,
      mode: "ssb",
      outcome: "contact",
      txCall: "G4AAA",
      rxCall: "G4BBB",
      ssn: 83,
    });
    expect(row.reliability).toBe(point.hours[11]!.asked.reliability);
    expect(row.snrDbHz).toBe(point.hours[11]!.asked.snrDbHz);
    expect(row.distanceKm).toBe(point.path.distanceKm);
    expect(row.level).toBe(comparisonLevel(row.reliability));
    expect(result.levels.find((level) => level.id === row.level)).toMatchObject({ contact: 1, heard: 0, failed: 0 });
    expect(result.levels.reduce((sum, level) => sum + level.contact + level.heard + level.failed, 0)).toBe(1);
  });

  it("says what a log cannot show, and never that the engine was right or wrong", () => {
    const words = result.reading.join(" ");
    expect(words).toContain("It does not hold the calls that went unanswered");
    expect(words).toContain("one direction only");
    expect(words).toContain("These counts do not adjust the engine in any way.");
    expect(words).not.toMatch(/\b(right|wrong|accurate|correct)\b(?! to be low)/i);
  });

  it("takes a power to assume for entries that have none, and compares a station heard the other way round", async () => {
    const withPower = (await app.api("POST", "/api/radio/observations/compare", { ...assumptions, defaultPowerWatts: 100 })).body
      .comparison as ComparisonResult;
    expect(withPower.compared).toBe(2);
    const heard = withPower.rows.find((row) => row.outcome === "heard")!;
    expect(heard).toMatchObject({ txCall: "OH2XX", rxCall: "G4AAA", frequencyMhz: 14.07, mode: "ft8", utcHour: 7 });
    expect(withPower.excluded.find((item) => item.reason.startsWith("No power"))).toBeUndefined();
  });

  it("leaves out a month the solar table does not reach until a sunspot number is given for it", async () => {
    await importFile(
      "old.adi",
      header +
        record({ ...acceptance, QSO_DATE: "20140315", CALL: "G4OLD" }) +
        record({ ...acceptance, QSO_DATE: "20140316", CALL: "G4OLD" }),
    );
    const without = (await app.api("POST", "/api/radio/observations/compare", assumptions)).body.comparison as ComparisonResult;
    expect(without.monthsWithoutSsn).toEqual([{ month: "2014-03", count: 2 }]);
    expect(without.excluded).toEqual(
      expect.arrayContaining([{ reason: "The solar table has no sunspot number for that month, and none was given", count: 2 }]),
    );
    expect(without.compared).toBe(1);
    const given = (await app.api("POST", "/api/radio/observations/compare", { ...assumptions, ssnByMonth: { "2014-03": 115 } })).body
      .comparison as ComparisonResult;
    expect(given.monthsWithoutSsn).toEqual([]);
    expect(given.compared).toBe(3);
    expect(given.rows.filter((row) => row.ssn === 115)).toHaveLength(2);
  });

  it("checks the assumptions it is given", async () => {
    expect((await app.api("POST", "/api/radio/observations/compare", { ...assumptions, noise: "quiet" })).status).toBe(400);
    expect((await app.api("POST", "/api/radio/observations/compare", { ...assumptions, ssnByMonth: { "March 2014": 100 } })).status).toBe(
      400,
    );
  });
});
