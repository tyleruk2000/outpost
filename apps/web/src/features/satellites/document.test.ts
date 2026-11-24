import fs from "node:fs";
import path from "node:path";
import { parseCelestrakCsv, type SatelliteTransmitter } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { elevationChart, overTheGround, skyPlot } from "./diagrams";
import { type PassSheet, passDocument, passTitle } from "./document";
import { passSkyPath, predictPasses } from "./engine";
import { sampleTrack } from "./ground-track";
import { ESHAIL, FUNCUBE } from "./test-orbits";

const land = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../../public/world/land.json"), "utf8"));

const HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";
// CelesTrak's published elements for the ISS, 21 November 2026.
const ISS_ROW =
  "ISS (ZARYA),1998-067A,2026-11-21T04:54:08.875296,15.49527370,.0007384,51.6319,243.0636,49.3258,310.8372,0,U,25544,999,59609,.2073332E-3,.11207E-3,0";
const [ISS] = parseCelestrakCsv(`${HEADER}\n${ISS_ROW}`, "stations");
const LONDON = { lat: 51.5074, lon: -0.1278 };
const EPOCH = new Date(Date.parse("2026-11-21T04:54:08.875Z"));
const REPEATER: SatelliteTransmitter = {
  id: "t",
  noradId: 25544,
  description: "FM voice repeater",
  alive: true,
  status: "active",
  type: "Transceiver",
  mode: "FM",
  uplinkLowHz: 145_990_000,
  uplinkHighHz: null,
  downlinkLowHz: 437_800_000,
  downlinkHighHz: null,
  invert: false,
  baud: null,
  updatedAt: null,
};

function sheet(): PassSheet {
  const passes = predictPasses(ISS!, LONDON, EPOCH, 24, 1);
  const pass = passes.reduce((best, item) => (item.maxElevationDeg > best.maxElevationDeg ? item : best), passes[0]!);
  return {
    name: "ISS (ZARYA)",
    noradId: 25544,
    epoch: EPOCH.getTime(),
    place: "London",
    pass,
    path: passSkyPath(ISS!, LONDON, pass, Math.max(2, Math.round(pass.durationSeconds / 60))),
    transmitters: [REPEATER],
    written: EPOCH,
    licensed: false,
    ground: {
      samples: sampleTrack(ISS!, LONDON, new Date(pass.aos.getTime() - 45 * 60_000), new Date(pass.los.getTime() + 45 * 60_000)),
      home: LONDON,
      land,
    },
  };
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let page = 1; page <= pdf.numPages; page += 1)
    pages.push((await (await pdf.getPage(page)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" "));
  return pages;
}

const transmitter = (
  id: string,
  description: string,
  type: string,
  mode: string,
  down: number,
  up: number | null,
): SatelliteTransmitter => ({
  ...REPEATER,
  id,
  noradId: 39444,
  description,
  type,
  mode,
  downlinkLowHz: down,
  uplinkLowHz: up,
});

describe("the pass sheet", () => {
  it("draws the sky track with the rise, highest and set marked and timed, inside its box", () => {
    const { pass, path } = sheet();
    const plot = skyPlot(pass, path, 236);
    const words = [...plot.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
    // E is left out: the set's time (in the east) is written where it would go.
    expect(words).toEqual(expect.arrayContaining(["N", "S", "W", "30°", "60°", "14:22", "14:26", "14:31"]));
    expect(words).not.toContain("E");
    for (const match of plot.svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"/g)) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(0);
      expect(Number(match[1])).toBeLessThanOrEqual(236);
      expect(Number(match[2])).toBeLessThanOrEqual(236);
    }
    expect(plot.svg).toContain("<polyline");
    const height = elevationChart(pass, path, 240);
    expect(height.svg).toContain("Highest 12°");
  });

  it("has the times, the drawings, where to point and what to tune to", async () => {
    const doc = passDocument(sheet(), "a4");
    const words = contentText(doc.content);
    expect(words).toContain("ISS (ZARYA)");
    expect(words).toContain("Rises");
    expect(words).toContain("Where to point, minute by minute");
    expect(words).toContain("FM voice repeater, FM");
    expect(words).toContain("437.8084 MHz");
    expect(words).toContain("Uplink (licence needed to send)");
    expect(doc.info?.title).toBe(passTitle(sheet()));

    const printed = await renderPdf(doc);
    writeSample("pass-after", printed.bytes);
    // Where to point on the first page; what to tune to may run onto a second.
    expect(printed.pages).toBeLessThanOrEqual(2);
    const text = (await pageTexts(printed.bytes)).join(" ");
    expect(text).toContain("Across the sky");
    expect(text).toContain("Over the ground");
    expect(text).toMatch(/night shaded as at its highest, \d\d:\d\d UTC/);
    expect(text).toContain("437.7916 MHz");
    const again = await renderPdf(passDocument(sheet(), "a4"));
    expect(again.bytes).toEqual(printed.bytes);
  }, 60_000);

  it("draws the ground under the pass: the track, its ticks timed, Home, the ring and the three moments", () => {
    const value = sheet();
    const drawn = overTheGround(value.pass, value.ground!, 499);
    expect(drawn.width).toBe(499);
    expect(drawn.height).toBe(233);
    const words = [...drawn.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]!);
    expect(words.length).toBeGreaterThan(5);
    for (const word of words) expect(word).toMatch(/^\d\d:\d0$/);
    // Heavy where it is up, the dashed ring, and the rise's open circle, the diamond and the square.
    expect(drawn.svg).toContain('stroke-width="3.2"');
    expect(drawn.svg).toContain('stroke-dasharray="3 2"');
    expect(drawn.svg).toMatch(/<circle[^>]*r="4" fill="#ffffff"/);
    expect(drawn.svg).toMatch(/<rect[^>]*width="8" height="8"/);
  });

  it("prints a geostationary satellite in view as always up: where to point, no rise or set", async () => {
    const from = new Date(Date.parse("2026-11-24T00:00:00Z"));
    const pass = predictPasses(ESHAIL, LONDON, from, 24, 8)[0]!;
    expect(pass.alwaysUp).toBe(true);
    const path = passSkyPath(ESHAIL, LONDON, pass, 2);
    const plot = skyPlot(pass, path, 236);
    expect(plot.svg).not.toContain("<polyline");
    expect(plot.svg).not.toMatch(/<rect[^>]*width="8" height="8"/);
    const value: PassSheet = {
      name: "ES'HAIL 2",
      noradId: 43700,
      epoch: ESHAIL.epoch,
      place: "Home",
      pass,
      path,
      transmitters: [transmitter("q", "QO-100 narrowband", "Transponder", "USB", 10_489_550_000, 2_400_050_000)],
      written: from,
      licensed: true,
      ground: {
        samples: sampleTrack(ESHAIL, LONDON, new Date(pass.tca.getTime() - 45 * 60_000), new Date(pass.tca.getTime() + 45 * 60_000)),
        home: LONDON,
        land,
      },
    };
    const printed = await renderPdf(passDocument(value, "a4"));
    writeSample("pass-eshail", printed.bytes);
    const text = (await pageTexts(printed.bytes)).join(" ");
    expect(text).toContain("Always up: it does not rise or set");
    expect(text).toContain("All day");
    expect(text).not.toContain("Rises");
    expect(text).not.toContain("minute by minute");
    expect(text).toContain("Over the ground");
  }, 60_000);

  it("keeps What to tune to with its first table, for a satellite with three transmitters", async () => {
    const from = new Date(Date.parse("2026-11-24T00:00:00Z"));
    const pass = predictPasses(FUNCUBE, LONDON, from, 24, 8).find((item) => item.maxElevationDeg > 10)!;
    const value: PassSheet = {
      name: "FUNCUBE-1 (AO-73)",
      noradId: 39444,
      epoch: FUNCUBE.epoch,
      place: "Home",
      pass,
      path: passSkyPath(FUNCUBE, LONDON, pass, Math.max(2, Math.round(pass.durationSeconds / 60))),
      transmitters: [
        transmitter("a", "CW Beacon", "Transmitter", "CW", 145_815_000, null),
        transmitter("b", "Mode U/V Linear", "Transponder", "USB", 145_950_000, 435_130_000),
        transmitter("c", "BPSK Telemetry", "Transmitter", "BPSK", 145_935_000, null),
      ],
      written: from,
      licensed: true,
      ground: {
        samples: sampleTrack(FUNCUBE, LONDON, new Date(pass.aos.getTime() - 45 * 60_000), new Date(pass.los.getTime() + 45 * 60_000)),
        home: LONDON,
        land,
      },
    };
    const printed = await renderPdf(passDocument(value, "a4"));
    writeSample("pass-funcube", printed.bytes);
    const pages = await pageTexts(printed.bytes);
    const withHeading = pages.find((page) => page.includes("What to tune to"));
    expect(withHeading).toContain("CW Beacon, CW");
    expect(withHeading).toContain("Listen on");
    expect(pages.join(" ")).toContain("Over the ground");
  }, 60_000);
});
