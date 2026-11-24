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
import { type RoadRouteResult, roadDistanceText, roadDurationText, type StreetDirections, type StreetsRouteResult } from "@outpost/shared";
import type { Content, TableCell } from "pdfmake/interfaces";
import { PRINT_COLOURS as C, callout, chart, measureOf, type PrintPaper, para, printable, printDocument } from "@/features/print-kit";
import type { CardRoute, RouteMap } from "./route-map";
import { climbText, endTurnsTitle, steepestText, streetsTitle, streetsTotals, turnsSummary } from "./street-words";
import { countriesText, endLine, routeTitle, startLine } from "./words";

export interface RouteCardInput {
  /** Outpost's road route; or a route planned on streets: a door-to-door drive, a walk or a ride. */
  route: CardRoute;
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

/** The directions as a table: a box to tick, the line and its detail, distance and time. With `door`, the streets at each end. */
export function directionsTable(route: RoadRouteResult, door?: StreetsRouteResult): Content {
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
  // The turns at an end of a door-to-door drive: a band with what they are, then each turn smaller, with its distance.
  const turns = (title: string, directions: StreetDirections) => {
    bands.set(body.length, C.shade);
    body.push([
      { text: printable(`${title} (${turnsSummary(directions, units)})`), colSpan: 4, bold: true, fontSize: 10, margin: [0, 1, 0, 1] },
      {},
      {},
      {},
    ]);
    for (const turn of directions.lines)
      body.push([
        cell(tickBox),
        { text: printable(turn.text), fontSize: 10.5 },
        { text: turn.distanceText, alignment: "right", fontSize: 9, margin: [0, 1.5, 0, 0] },
        "",
      ]);
  };
  const start = startLine(route);
  if (door?.start) turns(endTurnsTitle(door, "start"), door.start);
  else if (start) body.push([cell(tickBox), cell(line(`Start: ${start.title}`, start.detail, { size: 12 })), "", ""]);
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
  if (door?.end) turns(endTurnsTitle(door, "end"), door.end);
  else if (end) body.push([cell(tickBox), cell(line(`End: ${end.title}`, end.detail, { size: 12 })), "", ""]);
  const summary = door?.summary ?? route.summary;
  body.push([
    "",
    { text: "All told", bold: true, fontSize: 10 },
    { text: roadDistanceText(summary.distanceM, units), bold: true, alignment: "right", fontSize: 10 },
    { text: roadDurationText(summary.durationS), bold: true, alignment: "right", fontSize: 10 },
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

/**
 * A walk, a ride or a short drive on streets all the way: the turns, each with a box, its distance and, with `times`,
 * the time to the next (re-timed over the terrain on a walk or a ride).
 */
export function streetTurnsTable(directions: StreetDirections, units: "km" | "miles", times = false): Content {
  const head = (text: string): TableCell => ({ text, bold: true, fontSize: 8, color: C.muted, alignment: "right" });
  const body: TableCell[][] = [
    [{ text: "", fontSize: 8 }, { text: "Turn", bold: true, fontSize: 8, color: C.muted }, head("Then"), ...(times ? [head("Time")] : [])],
  ];
  for (const turn of directions.lines)
    body.push([
      tickBox as TableCell,
      { text: printable(turn.text), fontSize: 12 },
      { text: turn.distanceText, alignment: "right", fontSize: 10, margin: [0, 2, 0, 0] },
      ...(times
        ? [
            {
              text: turn.durationS >= 30 ? roadDurationText(turn.durationS) : "",
              alignment: "right",
              fontSize: 10,
              margin: [0, 2, 0, 0],
            } as TableCell,
          ]
        : []),
    ]);
  body.push(
    times
      ? [
          "",
          { text: "All told", bold: true, fontSize: 10 },
          { text: roadDistanceText(directions.distanceM, units), bold: true, alignment: "right", fontSize: 10 },
          { text: roadDurationText(directions.durationS), bold: true, alignment: "right", fontSize: 10 },
        ]
      : [
          "",
          { text: "All told", bold: true, fontSize: 10 },
          {
            text: `${roadDistanceText(directions.distanceM, units)}, ${roadDurationText(directions.durationS)}`,
            bold: true,
            alignment: "right",
            fontSize: 10,
          },
        ],
  );
  const last = body.length - 1;
  return {
    table: { headerRows: 1, widths: times ? [16, "*", 62, 62] : [16, "*", 96], body, dontBreakRows: true },
    layout: {
      hLineWidth: (index: number) => (index === 0 ? 0 : index === 1 || index === last ? 1 : 0.5),
      vLineWidth: () => 0,
      hLineColor: (index: number) => (index === 1 || index === last ? C.ink : C.rule),
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: (index: number) => (index === 0 ? 2 : 6),
      paddingRight: () => 4,
    },
    margin: [0, 4, 0, 10],
  } as Content;
}

const KIND_WORDS = { "drive-door": "Door to door", walk: "Walk", cycle: "Ride" } as const;

/**
 * The heights along a walk or a ride as a profile: distance along the bottom, height up the side, the steepest
 * stretch shaded; in ink only, so it reads in grey.
 */
export function hillsProfile(route: StreetsRouteResult, width: number): Content | null {
  const hills = route.hills;
  if (!hills || hills.profile.length < 2) return null;
  const units = route.request.units ?? "km";
  const miles = units === "miles";
  const per = miles ? 1609.344 : 1000;
  const xs = hills.profile.map(([along]) => along / per);
  const low = Math.max(0, Math.floor((hills.lowestM - 10) / 50) * 50);
  const high = Math.max(low + 100, Math.ceil((hills.highestM + 10) / 50) * 50);
  const steepest = hills.steepest;
  const drawn = chart({
    width,
    height: 150,
    xs,
    series: [
      { kind: "line", name: "Height above sea level", values: hills.profile.map(([, height]) => height), colour: C.ink, width: 1.4 },
    ],
    yDomain: [low, high],
    xDomain: [0, xs.at(-1)!],
    xTick: (x) => `${Math.round(x * 10) / 10}`,
    yTick: (y) => `${Math.round(y)}`,
    xLabel: miles ? "Miles from the start" : "Kilometres from the start",
    yLabel: "Metres",
    ...(steepest
      ? {
          spans: [
            {
              from: steepest.fromM / per,
              to: (steepest.fromM + steepest.lengthM) / per,
              words: "Steepest",
              fill: C.rule,
            },
          ],
        }
      : {}),
    key: false,
  });
  return { svg: drawn.svg, width: drawn.width, margin: [0, 2, 0, 6] } as Content;
}

/** The climb, the descent, the highest point and the steepest stretch in words, for paper. */
export function hillsFacts(route: StreetsRouteResult): string | null {
  const hills = route.hills;
  if (!hills) return null;
  const steepest = steepestText(route);
  return `${climbText(hills).words}; highest ${hills.highestM} m, lowest ${hills.lowestM} m above sea level.${steepest ? ` ${steepest}` : ""}`;
}

/** The card for a route on streets all the way: the map, then the turns. */
function streetsCardDocument(input: RouteCardInput & { route: StreetsRouteResult }) {
  const { route, paper } = input;
  const measure = measureOf(paper);
  const units = route.request.units ?? "km";
  const planned = plannedDay(route.plannedAt);
  const directions = route.streets;
  const hills = route.hills ?? null;
  const first: Content[] = [
    { text: KIND_WORDS[route.mode], fontSize: 8, bold: true, color: C.accent, characterSpacing: 0.4 },
    { text: printable(input.name), fontSize: 22, bold: true, margin: [0, 2, 0, 2] },
    { text: printable(streetsTitle(route)), fontSize: 11 },
    { text: printable(`${streetsTotals(route)}; planned ${planned}.`), color: C.muted, margin: [0, 2, 0, 0] },
    ...(hills ? [{ text: printable(hillsFacts(route)!), margin: [0, 2, 0, 0] } as Content] : []),
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 1.6, lineColor: C.accent }], margin: [0, 8, 0, 10] },
    input.map
      ? ({ svg: input.map.svg, width: input.map.width, margin: [0, 0, 0, 8] } as Content)
      : para("No overview map was drawn for this card. The turns follow."),
    callout(
      "warn",
      "Planned in advance, not live",
      para(
        printable(
          hills
            ? `Planned on ${planned} from street data installed on this device, timed over the installed terrain${hills.terrain ? ` (${hills.terrain})` : ""}: ${route.mode === "walk" ? "Tobler's hiking function for a fit adult with no load" : "the streets service's own speeds for each slope"}, with no stops${route.mode === "walk" ? " or rests" : ""}. It knows nothing of closures, works or the weather. Follow the signs.`
            : `Planned on ${planned} from street data installed on this device, at an even pace with no stops. It knows nothing of closures, works or the weather. Follow the signs.`,
        ),
      ),
    ),
  ];
  const profile = hillsProfile(route, measure);
  const turns: Content[] = [
    ...(profile
      ? [
          { text: "Heights along the way", fontSize: 16, bold: true, margin: [0, 0, 0, 2] } as Content,
          { text: printable(hillsFacts(route)!), color: C.muted, margin: [0, 0, 0, 2] } as Content,
          profile,
        ]
      : []),
    { text: "Turns", fontSize: 16, bold: true, margin: [0, 0, 0, 2] },
    {
      text: hills
        ? "Each line is a turn, how far to go before the next and how long that takes over the hills. Tick each as you go."
        : "Each line is a turn, and how far to go before the next. Tick each as you go.",
      color: C.muted,
      margin: [0, 0, 0, 4],
    },
    directions ? streetTurnsTable(directions, units, hills !== null) : para("No turns were given for this route."),
    ...route.warnings.map((warning) => para(printable(warning))),
    {
      text: printable(`Planned in advance, not live, on ${planned}. ${route.credit}`),
      fontSize: 7.5,
      color: C.muted,
      margin: [0, 6, 0, 0],
    },
  ];
  return printDocument({
    paper,
    title: `${KIND_WORDS[route.mode]}: ${input.name}`,
    subject: streetsTitle(route),
    made: input.made,
    footerName: printable(input.name),
    footerRight: `Planned ${planned}`,
    parts: [
      { kind: "plain", content: first },
      { kind: "section", running: printable(`Turns · ${input.name}`), content: turns },
    ],
  });
}

export function routeCardDocument(input: RouteCardInput) {
  const door = "mode" in input.route ? input.route : undefined;
  if (door && !door.road) return streetsCardDocument({ ...input, route: door });
  const route = door?.road ?? (input.route as RoadRouteResult);
  const { paper } = input;
  const measure = measureOf(paper);
  const units = route.request.units ?? "km";
  const planned = plannedDay(route.plannedAt);
  const crossings = route.summary.crossings.map((crossing) => crossing.name).join(", ");
  const totals = door?.summary ?? route.summary;
  const facts = [
    `${roadDistanceText(totals.distanceM, units)}, about ${roadDurationText(totals.durationS)}${crossings ? " with the crossing" : door ? " door to door" : " driving"}`,
    `through ${countriesText(route.summary.countries)}`,
    crossings ? `crossing by ${crossings}` : "",
    `planned ${planned}`,
  ].filter(Boolean);

  const first: Content[] = [
    { text: door ? "Door to door" : "Road route", fontSize: 8, bold: true, color: C.accent, characterSpacing: 0.4 },
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
    directionsTable(route, door),
    ...(door ?? route).warnings.map((warning) => para(printable(warning))),
    {
      text: printable(
        `Planned in advance, not live, on ${planned}. Check the signs and closures. Junction numbers and signs are as mapped in OpenStreetMap; signs change. ${route.credit.line}${door ? ` ${door.credit}` : ""}`,
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
