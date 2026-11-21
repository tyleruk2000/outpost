/**
 * The printable sight form and the worked example on it. The example is worked by the
 * same functions as the screen: a sight of the Sun's lower limb is made up for a known
 * place, so that working it forward from a position a few miles off finds that place
 * again, and every figure on the sheet can be checked by hand.
 */
import { almanacFor, correctSight, reduce, type SightInput } from "@outpost/shared/sky";
import type { Block } from "../tools/kit/sheet";
import { formatAngle, formatLatLon } from "./sights";

export const FORM_TITLE = "Celestial navigation sight form";

export const EXAMPLE = {
  /** Where the observer really was. */
  truth: { lat: 50, lon: -5 },
  /** The position the sight is worked from. */
  dr: { lat: 50 + 10 / 60, lon: -(4 + 40 / 60) },
  at: Date.UTC(2026, 5, 21, 14, 30, 0),
  indexError: 2,
  heightOfEye: 3,
} as const;

/** The example sight: the sextant altitude that the true place would have given, and its working from the DR. */
export function workedExample() {
  const body = { kind: "body", id: "sun" } as const;
  const almanac = almanacFor(body, EXAMPLE.at);
  const target = reduce(almanac, 0, EXAMPLE.truth).hc;
  const input = (hs: number): SightInput => ({
    body,
    at: EXAMPLE.at,
    hs,
    indexError: EXAMPLE.indexError,
    heightOfEye: EXAMPLE.heightOfEye,
    horizon: "sea",
    limb: "lower",
  });
  // The sextant reading that the corrections take to the true altitude, rounded to a tenth of a minute as a sextant is read.
  let hs = target;
  for (let pass = 0; pass < 8; pass++) hs += target - correctSight(input(hs), almanac).ho;
  hs = Math.round(hs * 600) / 600;
  const { steps, ho } = correctSight(input(hs), almanac);
  const reduction = reduce(almanac, ho, EXAMPLE.dr);
  return { hs, almanac, steps, ho, reduction };
}

const signed = (minutes: number) => `${minutes >= 0 ? "+" : "−"}${Math.abs(minutes).toFixed(1)}′`;

export function formBlocks(): Block[] {
  const ex = workedExample();
  const blank = ["", "", ""];
  const rows = [
    "Body (limb)",
    "Date and time (UT)",
    "Sextant altitude Hs",
    "Index error (on −, off +)",
    "Dip (−1.76′ × √height of eye in m)",
    "Apparent altitude Ha",
    "Refraction (−)",
    "Semi-diameter (lower +, upper −)",
    "Parallax (+ HP × cos Ha)",
    "Observed altitude Ho",
    "GHA",
    "Declination",
    "Latitude worked from",
    "Longitude worked from",
    "LHA (GHA + longitude east, − west)",
    "Computed altitude Hc",
    "Azimuth Zn",
    "Intercept Ho − Hc (towards +, away −)",
  ].map((step) => [step, ...blank]);
  const stepRow = (label: string) => ex.steps.find((s) => s.label === label);
  const example: string[][] = [
    ["Body (limb)", "Sun, lower limb"],
    ["Date and time (UT)", "21 June 2026, 14:30:00"],
    ["Sextant altitude Hs", formatAngle(ex.hs)],
    ["Index error, 2.0′ on the arc", signed(stepRow("Index error")?.minutes ?? 0)],
    [`Dip, height of eye ${EXAMPLE.heightOfEye} m`, signed(stepRow("Dip")?.minutes ?? 0)],
    ["Apparent altitude Ha", formatAngle(stepRow("Dip")?.after ?? 0)],
    ["Refraction", signed(stepRow("Refraction")?.minutes ?? 0)],
    [`Semi-diameter (${(ex.almanac.sd).toFixed(1)}′)`, signed(stepRow("Semi-diameter")?.minutes ?? 0)],
    [`Parallax (HP ${ex.almanac.hp.toFixed(2)}′)`, signed(stepRow("Parallax")?.minutes ?? 0)],
    ["Observed altitude Ho", formatAngle(ex.ho)],
    ["GHA", formatAngle(ex.almanac.gha)],
    ["Declination", formatLatLon(ex.almanac.dec, "lat")],
    ["Latitude worked from", formatLatLon(EXAMPLE.dr.lat, "lat")],
    ["Longitude worked from", formatLatLon(EXAMPLE.dr.lon, "lon")],
    ["LHA", formatAngle(ex.reduction.lha)],
    ["Computed altitude Hc", formatAngle(ex.reduction.hc)],
    ["Azimuth Zn", `${ex.reduction.zn.toFixed(1)}°`],
    ["Intercept", `${Math.abs(ex.reduction.intercept).toFixed(1)} nautical miles ${ex.reduction.intercept >= 0 ? "towards" : "away"}`],
  ];
  return [
    { kind: "title", text: FORM_TITLE },
    {
      kind: "para",
      text: "For learning, and as a fallback when nothing else is left. Not for navigating a vessel: use proper charts, a published almanac and the means of navigation the law and good seamanship require.",
    },
    { kind: "heading", text: "Sights" },
    { kind: "table", head: ["Step", "Sight 1", "Sight 2", "Sight 3"], rows },
    {
      kind: "list",
      items: [
        "Time every sight to the second by a clock checked against a radio time signal. Four seconds of error is a minute of longitude, a nautical mile at the equator.",
        "Sin Hc = sin lat × sin dec + cos lat × cos dec × cos LHA. A declination of the other name from the latitude is negative.",
        "Zn: tan Z = sin LHA ÷ (cos lat × tan dec − sin lat × cos LHA), turned to a bearing from true north.",
        "Plot: from the position worked from, go the intercept along Zn (towards) or against it (away), and draw the line of position square to Zn.",
      ],
    },
    { kind: "heading", text: "Worked example" },
    {
      kind: "para",
      text: `A sight of the Sun's lower limb on 21 June 2026 at 14:30:00 UT, worked from ${formatLatLon(EXAMPLE.dr.lat, "lat")}, ${formatLatLon(EXAMPLE.dr.lon, "lon")}. The observer was really at 50° 00.0′ N, 5° 00.0′ W: the line of position passes within a tenth of a mile of it.`,
    },
    { kind: "table", head: ["Step", "Figure"], rows: example, right: [1] },
  ];
}
