/**
 * The sight form as a printed sheet, laid out with the print kit: a form with room to
 * write three sights, the formulas it works by, and the worked example with a drawing of
 * its own plot. The drawing shows what the form's last line says ("from the position
 * worked from, go the intercept along Zn (towards) or against it (away), and draw the
 * line of position square to Zn") with the example's own figures, and the true place it
 * was made up from.
 */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  bullets,
  PRINT_COLOURS as C,
  callout,
  type Drawing,
  dataTable,
  drawing,
  figure,
  heading,
  measureOf,
  PRINT_TYPE,
  type PrintPaper,
  para,
  printable,
  round,
  svgArrowHead,
  svgText,
  twoColumns,
} from "@/features/print-kit";
import { guidanceDocument } from "../tools/kit/sheet";
import { EXAMPLE, FORM_TITLE, formBlocks, workedExample } from "./form";
import { formatLatLon } from "./sights";

/** The form's own parts, from formBlocks: the steps to fill in, the notes under them, the example's table. */
function formParts() {
  const blocks = formBlocks();
  const tables = blocks.filter((block) => block.kind === "table");
  const list = blocks.find((block) => block.kind === "list");
  const paras = blocks.filter((block) => block.kind === "para");
  return {
    steps: tables[0]!.rows.map((row) => row[0]!),
    notes: list?.kind === "list" ? list.items : [],
    caution: paras[0]?.kind === "para" ? paras[0].text : "",
    exampleWords: paras[1]?.kind === "para" ? paras[1].text : "",
    example: tables[1]!.rows,
  };
}

/** The blank form: each step with three tall boxes to write a sight in. */
function writingTable(steps: string[]): Content {
  const head = ["Step", "Sight 1", "Sight 2", "Sight 3"].map((words) => ({
    text: words,
    bold: true,
    fontSize: PRINT_TYPE.small + 0.5,
    fillColor: C.shade,
  }));
  const answer = (step: string) => /^(Observed altitude|Intercept)/.test(step);
  return {
    table: {
      headerRows: 1,
      widths: [170, "*", "*", "*"],
      dontBreakRows: true,
      body: [
        head,
        ...steps.map((step) => [
          {
            text: printable(step),
            fontSize: PRINT_TYPE.table,
            bold: answer(step),
            color: answer(step) ? C.accent : C.ink,
            margin: [0, 4, 0, 4],
          },
          ...[0, 1, 2].map(() => ({ text: "", fillColor: answer(step) ? C.accentSoft : null })),
        ]),
      ],
    },
    layout: {
      hLineWidth: (index: number) => (index === 1 ? 0.9 : 0.5),
      vLineWidth: (index: number) => (index === 0 ? 0 : 0.5),
      hLineColor: () => C.rule,
      vLineColor: () => C.rule,
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 2.5,
      paddingBottom: () => 2.5,
    },
    margin: [0, 2, 0, 10],
  } as Content;
}

/**
 * The example's plot, to scale in nautical miles: the position worked from, the azimuth
 * Zn, the intercept along it (towards), the line of position square to Zn through its
 * end, and the true place the sight was made up from.
 */
export function plotDiagram(width: number): Drawing {
  const ex = workedExample();
  const { zn, intercept } = ex.reduction;
  const z = (zn * Math.PI) / 180;
  // East and north of the position worked from, in nautical miles.
  const foot = { east: intercept * Math.sin(z), north: intercept * Math.cos(z) };
  const truth = {
    east: (EXAMPLE.truth.lon - EXAMPLE.dr.lon) * 60 * Math.cos((EXAMPLE.dr.lat * Math.PI) / 180),
    north: (EXAMPLE.truth.lat - EXAMPLE.dr.lat) * 60,
  };
  const height = 230;
  const span = 30; // nautical miles across the drawing's height
  const perMile = (height - 30) / span;
  // Centred between the position worked from and the foot of the intercept.
  const cx = width / 2 - (foot.east / 2) * perMile;
  const cy = height / 2 + (foot.north / 2) * perMile - 6;
  const at = (east: number, north: number) => ({ x: cx + east * perMile, y: cy - north * perMile });
  const dr = at(0, 0);
  const end = at(foot.east, foot.north);
  const place = at(truth.east, truth.north);
  // The line of position: square to Zn through the foot, a long way each side.
  const along = { east: Math.cos(z), north: -Math.sin(z) };
  const lop1 = at(foot.east + along.east * 15, foot.north + along.north * 15);
  const lop2 = at(foot.east - along.east * 15, foot.north - along.north * 15);
  // Zn drawn on past the foot, faint, towards the body.
  const beyond = at(Math.sin(z) * (intercept + 9), Math.cos(z) * (intercept + 9));
  let body = "";
  body += `<rect x="0" y="0" width="${width}" height="${height}" fill="${C.knowSoft}" fill-opacity="0.45"/>`;
  // A north arrow.
  body += `<line x1="${width - 22}" y1="44" x2="${width - 22}" y2="14" stroke="${C.ink}" stroke-width="1.2"/>${svgArrowHead(width - 22, 12, -90, C.ink)}`;
  body += svgText(width - 22, 54, "N", { anchor: "middle", bold: true, size: 8 });
  // Zn and the intercept.
  body += `<line x1="${round(end.x)}" y1="${round(end.y)}" x2="${round(beyond.x)}" y2="${round(beyond.y)}" stroke="${C.muted}" stroke-width="0.8" stroke-dasharray="3 2"/>`;
  body += `<line x1="${round(dr.x)}" y1="${round(dr.y)}" x2="${round(end.x)}" y2="${round(end.y)}" stroke="${C.accent}" stroke-width="2"/>`;
  body += svgArrowHead(end.x, end.y, round(zn - 90), C.accent, 6);
  // The line of position.
  body += `<line x1="${round(lop1.x)}" y1="${round(lop1.y)}" x2="${round(lop2.x)}" y2="${round(lop2.y)}" stroke="${C.act}" stroke-width="2"/>`;
  // A square mark where it meets Zn.
  const s = 6;
  const back = { x: -Math.sin(z) * s, y: Math.cos(z) * s };
  const side = { x: Math.cos(z) * s, y: Math.sin(z) * s };
  body += `<polyline points="${round(end.x + back.x)},${round(end.y + back.y)} ${round(end.x + back.x + side.x)},${round(end.y + back.y + side.y)} ${round(end.x + side.x)},${round(end.y + side.y)}" fill="none" stroke="${C.act}" stroke-width="0.8"/>`;
  // The points.
  body += `<circle cx="${round(dr.x)}" cy="${round(dr.y)}" r="3.4" fill="#ffffff" stroke="${C.ink}" stroke-width="1.4"/>`;
  body += `<path d="M${round(place.x - 4)},${round(place.y - 4)} L${round(place.x + 4)},${round(place.y + 4)} M${round(place.x - 4)},${round(place.y + 4)} L${round(place.x + 4)},${round(place.y - 4)}" stroke="${C.ink}" stroke-width="1.4"/>`;
  // Labels.
  body += svgText(dr.x + 8, dr.y - 4, "Position worked from", { bold: true, size: 7.5 });
  body += svgText(dr.x + 8, dr.y + 6, printable(`${formatLatLon(EXAMPLE.dr.lat, "lat")}, ${formatLatLon(EXAMPLE.dr.lon, "lon")}`), {
    size: 7,
    fill: C.muted,
  });
  const mid = { x: (dr.x + end.x) / 2, y: (dr.y + end.y) / 2 };
  body += svgText(mid.x + 10, mid.y + 4, `Intercept ${Math.abs(intercept).toFixed(1)} miles ${intercept >= 0 ? "towards" : "away"}`, {
    bold: true,
    size: 7.5,
    fill: C.accent,
  });
  body += svgText(mid.x + 10, mid.y + 13, `along Zn ${zn.toFixed(1)}°`, { size: 7, fill: C.accent });
  body += svgText(lop2.x + 4, lop2.y - 2, "Line of position", { bold: true, size: 7.5, fill: C.act });
  body += svgText(lop2.x + 4, lop2.y + 7, "square to Zn", { size: 7, fill: C.act });
  body += svgText(beyond.x + 4, beyond.y + 10, "towards the Sun", { size: 7, fill: C.muted });
  body += svgText(place.x - 12, place.y + 3, "Where the observer was", { size: 7, anchor: "end" });
  // A scale bar of 5 miles.
  body += `<line x1="12" y1="${height - 12}" x2="${round(12 + 5 * perMile)}" y2="${height - 12}" stroke="${C.ink}" stroke-width="1.4"/>`;
  body += svgText(12, height - 17, "5 nautical miles", { size: 6.5, fill: C.muted });
  return drawing(width, height, body);
}

/** The sight form, laid out with the print kit. */
export function formDocument(paper: PrintPaper): TDocumentDefinitions {
  const measure = measureOf(paper);
  const parts = formParts();
  const plot = plotDiagram(Math.round(measure * 0.56));
  const [timing, ...formulas] = parts.notes.map(printable);
  const plotLine = formulas.find((line) => line.startsWith("Plot"));
  return guidanceDocument({
    paper,
    title: FORM_TITLE,
    subject: "A form for working sights by hand, with a worked example.",
    made: new Date("2026-11-21T00:00:00Z"),
    footerName: FORM_TITLE,
    footerRight: "For learning, not for navigating a vessel",
    sections: [
      {
        title: "Sights",
        subtitle: "Three sights, worked by hand from the top down. Write each figure in its box.",
        content: [callout("warn", "For learning", para(printable(parts.caution), 0)), writingTable(parts.steps)],
      },
      {
        title: "Worked example",
        subtitle: "A sight of the Sun's lower limb on 21 June 2026, worked through the form.",
        content: [
          callout("know", "Working it", bullets([timing ?? "", ...formulas.filter((line) => line !== plotLine)])),
          para(printable(parts.exampleWords)),
          twoColumns(
            [heading("The figures"), dataTable(["Step", "Figure"], parts.example, { right: [1], widths: ["*", 92] })],
            [
              heading("The plot"),
              figure(plot.svg, {
                width: plot.width,
                caption: plotLine ? `${plotLine} Drawn to scale from the example's figures.` : "Drawn to scale from the example's figures.",
              }),
            ],
            { widths: ["*", plot.width] },
          ),
        ],
      },
    ],
  });
}
