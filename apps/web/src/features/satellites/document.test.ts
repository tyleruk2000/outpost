import { parseCelestrakCsv, type SatelliteTransmitter } from "@outpost/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { elevationChart, skyPlot } from "./diagrams";
import { type PassSheet, passDocument, passTitle } from "./document";
import { passSkyPath, predictPasses } from "./engine";

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
  };
}

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
    const pdf = await getDocument({ data: printed.bytes.slice() }).promise;
    let text = "";
    for (let page = 1; page <= pdf.numPages; page += 1)
      text += (await (await pdf.getPage(page)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ");
    expect(text).toContain("Across the sky");
    expect(text).toContain("437.7916 MHz");
    const again = await renderPdf(passDocument(sheet(), "a4"));
    expect(again.bytes).toEqual(printed.bytes);
  }, 60_000);
});
