/**
 * The printed route card, laid out with the print kit: the first page an overview map of
 * the whole route, then the directions in large type in the owner's own style (each road's
 * line bold, the quieter part small under it), with the distance and time of each line in
 * columns, the crossing in a band of its own, a via point as a band across, and a box to
 * tick each line off on the way. At the foot: planned, not live; the day it was planned;
 * check the signs and closures; the OpenStreetMap credit. No junction maps.
 *
 * Pure: the route and the drawn map in, pdfmake's document out.
 */
import { type RoadRouteResult, roadDistanceText, roadDurationText } from "@outpost/shared";
import type { Content, TableCell } from "pdfmake/interfaces";
import { PRINT_COLOURS as C, callout, measureOf, type PrintPaper, para, printable, printDocument } from "@/features/print-kit";
import type { RouteMap } from "./route-map";
import { countriesText, endLine, routeTitle, startLine } from "./words";

export interface RouteCardInput {
  route: RoadRouteResult;
  /** The name the route is saved under, or its ends. */
  name: string;
  paper: PrintPaper;
  /** The overview map, drawn beforehand; null when there is none. */
  map: RouteMap | null;
  made: Date;
}

const plannedDay = (ms: number) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(ms);

const tickBox: Content = {
  canvas: [{ type: "rect", x: 0, y: 0, w: 12, h: 12, lineWidth: 1, lineColor: C.ink, r: 1.5 }],
  margin: [0, 3, 0, 0],
} as Content;

/** "Leatherhead, via Reims, to Chamonix". */
function pointsLine(route: RoadRouteResult): string {
  const names = route.snapped.map((point, index) => point.input.name ?? `Point ${index + 1}`);
  if (names.length <= 2) return names.join(" to ");
  return `${names[0]}, via ${names.slice(1, -1).join(", ")}, to ${names.at(-1)}`;
}

/** The directions as a table: a box to tick, the line and its detail, distance and time. */
export function directionsTable(route: RoadRouteResult): Content {
  const units = route.request.units ?? "km";
  const head = (text: string, alignment: "left" | "right" = "left"): TableCell => ({
    text,
    bold: true,
    fontSize: 8,
    color: C.muted,
    alignment,
  });
  const body: TableCell[][] = [[head(""), head("Road and signs to follow"), head("Distance", "right"), head("Time", "right")]];
  const bands = new Map<number, string>();
  const line = (title: string, detail: string, options: { size?: number } = {}): Content => ({
    stack: [
      { text: printable(title), bold: true, fontSize: options.size ?? 15, lineHeight: 1.1 },
      ...(detail
        ? [{ text: printable(detail), fontSize: 8.5, color: C.muted, margin: [0, 1.5, 0, 0] as [number, number, number, number] }]
        : []),
    ],
  });
  const cell = (content: Content) => content as TableCell;
  const start = startLine(route);
  if (start) body.push([cell(tickBox), cell(line(`Start: ${start.title}`, start.detail, { size: 12 })), "", ""]);
  for (const leg of route.legs) {
    if (leg.kind === "via") {
      bands.set(body.length, C.accentSoft);
      body.push([
        { text: printable(leg.title), colSpan: 4, bold: true, fontSize: 11, color: C.accent, alignment: "center", margin: [0, 1, 0, 1] },
        {},
        {},
        {},
      ]);
      continue;
    }
    const crossing = leg.kind === "crossing";
    if (crossing) bands.set(body.length, C.shade);
    body.push([
      cell(tickBox),
      cell(
        crossing
          ? { stack: [{ text: "Crossing", bold: true, fontSize: 8, color: C.accent }, line(leg.title, leg.detail)] }
          : line(leg.title, leg.detail),
      ),
      { text: roadDistanceText(leg.distanceM, units), alignment: "right", fontSize: 10, margin: [0, 3, 0, 0] },
      { text: roadDurationText(leg.durationS), alignment: "right", fontSize: 10, margin: [0, 3, 0, 0] },
    ]);
  }
  const end = endLine(route);
  if (end) body.push([cell(tickBox), cell(line(`End: ${end.title}`, end.detail, { size: 12 })), "", ""]);
  body.push([
    "",
    { text: "All told", bold: true, fontSize: 10 },
    { text: roadDistanceText(route.summary.distanceM, units), bold: true, alignment: "right", fontSize: 10 },
    { text: roadDurationText(route.summary.durationS), bold: true, alignment: "right", fontSize: 10 },
  ]);
  const last = body.length - 1;
  return {
    table: { headerRows: 1, widths: [16, "*", 52, 62], body, dontBreakRows: true },
    layout: {
      hLineWidth: (index: number) => (index === 0 ? 0 : index === 1 || index === last ? 1 : 0.5),
      vLineWidth: () => 0,
      hLineColor: (index: number) => (index === 1 || index === last ? C.ink : C.rule),
      fillColor: (row: number) => bands.get(row) ?? null,
      paddingTop: () => 5,
      paddingBottom: () => 5,
      paddingLeft: (index: number) => (index === 0 ? 2 : 6),
      paddingRight: () => 4,
    },
    margin: [0, 4, 0, 10],
  } as Content;
}

export function routeCardDocument(input: RouteCardInput) {
  const { route, paper } = input;
  const measure = measureOf(paper);
  const units = route.request.units ?? "km";
  const planned = plannedDay(route.plannedAt);
  const crossings = route.summary.crossings.map((crossing) => crossing.name).join(", ");
  const facts = [
    `${roadDistanceText(route.summary.distanceM, units)}, about ${roadDurationText(route.summary.durationS)}${crossings ? " with the crossing" : " driving"}`,
    `through ${countriesText(route.summary.countries)}`,
    crossings ? `crossing by ${crossings}` : "",
    `planned ${planned}`,
  ].filter(Boolean);

  const first: Content[] = [
    { text: "Road route", fontSize: 8, bold: true, color: C.accent, characterSpacing: 0.4 },
    { text: printable(input.name), fontSize: 22, bold: true, margin: [0, 2, 0, 2] },
    { text: printable(pointsLine(route)), fontSize: 11 },
    { text: printable(`${facts.join("; ")}.`), color: C.muted, margin: [0, 2, 0, 0] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 1.6, lineColor: C.accent }], margin: [0, 8, 0, 10] },
    input.map
      ? ({ svg: input.map.svg, width: input.map.width, margin: [0, 0, 0, 8] } as Content)
      : para("No overview map was drawn for this card. The directions follow."),
    callout(
      "warn",
      "Planned in advance, not live",
      para(
        printable(
          `Planned on ${planned} from road data installed on this device, for free-flowing traffic with no stops. It knows nothing of traffic, roadworks or closures. Follow the signs, and check closures before you go.${route.summary.crossings.length > 0 ? " Crossings are booked and timetabled: book ahead, and allow for check-in and waiting." : ""}`,
        ),
      ),
    ),
  ];

  const directions: Content[] = [
    { text: "Directions", fontSize: 16, bold: true, margin: [0, 0, 0, 2] },
    {
      text: "Each line is a road to follow and the place on its signs. Under it: which way, the junctions to join and leave at, distance and time. Tick each line as you go.",
      color: C.muted,
      margin: [0, 0, 0, 4],
    },
    directionsTable(route),
    ...route.warnings.map((warning) => para(printable(warning))),
    {
      text: printable(
        `Planned in advance, not live, on ${planned}. Check the signs and closures. Junction numbers and signs are as mapped in OpenStreetMap; signs change. ${route.credit.line}`,
      ),
      fontSize: 7.5,
      color: C.muted,
      margin: [0, 6, 0, 0],
    },
  ];

  return printDocument({
    paper,
    title: `Road route: ${input.name}`,
    subject: routeTitle(route),
    made: input.made,
    footerName: printable(input.name),
    footerRight: `Planned ${planned}`,
    parts: [
      { kind: "plain", content: first },
      { kind: "section", running: printable(`Directions · ${input.name}`), content: directions },
    ],
  });
}
