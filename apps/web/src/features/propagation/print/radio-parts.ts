/**
 * Pieces the radio papers share: a row of key figures, a grid of hours shaded by how
 * good each is, the usable frequencies through the day as a chart, the teaching page on
 * how HF travels, and the world at the best hour.
 */
import { coverageClasses, HF_BANDS, type PredictionResult, utcLabel } from "@outpost/shared";
import type { Content, ContentTable, TableCell } from "pdfmake/interfaces";
import { sunAltitude } from "@/features/maps/grey-line/geometry";
import { SUNRISE_ALTITUDE } from "@/features/maps/lib/sun";
import { PRINT_COLOURS as C, callout, chart, figure, heading, note, para, PRINT_TYPE as T, twoColumns } from "@/features/print-kit";
import { PAPER_SHADES } from "../coverage-map/coverage-document";
import { greyLineKey, greyLineSketch, type LandShapes, nvisDiagram, type Place, skyWaveDiagram } from "./radio-diagrams";

// ── Key figures ─────────────────────────────────────────────────────────────

/** Up to five figures in a row, each a big number over its name, in a tinted box. */
export function keyFigures(items: Array<{ value: string; label: string; tone?: "accent" | "act" | "know" }>): Content {
  const colour = (tone?: string) => (tone === "act" ? C.act : tone === "know" ? C.know : C.accent);
  return {
    table: {
      widths: items.map(() => "*"),
      body: [
        items.map(
          (item): TableCell => ({
            stack: [
              { text: item.value, fontSize: 15, bold: true, color: colour(item.tone), lineHeight: 1 },
              { text: item.label, fontSize: T.small, color: C.muted, margin: [0, 2, 0, 0] },
            ],
            fillColor: C.accentSoft,
          }),
        ),
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (index: number, node: ContentTable) => (index === 0 || index === (node.table.widths?.length ?? 0) ? 0 : 3),
      vLineColor: () => "#ffffff",
      paddingLeft: () => 8,
      paddingRight: () => 6,
      paddingTop: () => 7,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 10],
  } as Content;
}

// ── A grid of hours ─────────────────────────────────────────────────────────

/** The class of a share of days, by the coverage map's classes: 0 under 10%, 1 to 5 up to 90% or more. */
export function shareLevel(share: number | null): number | null {
  if (share === null || !Number.isFinite(share)) return null;
  const classes = coverageClasses("reliability");
  let level = 0;
  classes.forEach((each, index) => {
    if (share >= each.from) level = index + 1;
  });
  return level;
}

export interface HeatRow {
  label: string;
  /** Each hour's words, and its class (0 to 5) or null for no figure. */
  cells: Array<{ text: string; level: number | null }>;
}

/**
 * Rows of hours, each cell shaded by its class in the coverage map's shades (one hue from
 * pale to dark, so they keep their order in grey) and with its figure in it, so that the
 * shade is never the only mark.
 */
export function heatGrid(head: string[], rows: HeatRow[], measure: number, options: { labelWidth?: number } = {}): Content {
  const labelWidth = options.labelWidth ?? 40;
  // Each cell's padding (1 a side) and rule (0.6) come on top of its width.
  const cellWidth = (measure - labelWidth - (head.length + 1) * 2.6 - 0.5) / Math.max(1, head.length);
  const fill = (level: number | null) => (level === null || level === 0 ? null : PAPER_SHADES[level - 1]!);
  const ink = (level: number | null) => (level !== null && level >= 4 ? "#ffffff" : level === null ? C.muted : C.ink);
  return {
    table: {
      headerRows: 1,
      widths: [labelWidth, ...head.map(() => cellWidth)],
      dontBreakRows: true,
      body: [
        [
          { text: "UTC", fontSize: 6.5, bold: true, color: C.muted },
          ...head.map((hour) => ({ text: hour, fontSize: 6.5, bold: true, color: C.muted, alignment: "center" })),
        ],
        ...rows.map((row) => [
          { text: row.label, fontSize: 7.5, bold: true },
          ...row.cells.map((cell) => ({
            text: cell.text,
            fontSize: 6.5,
            alignment: "center",
            color: ink(cell.level),
            fillColor: fill(cell.level),
          })),
        ]),
      ],
    },
    layout: {
      hLineWidth: (index: number) => (index === 1 ? 0.8 : 0.6),
      vLineWidth: (index: number) => (index === 1 ? 0.8 : 0.6),
      hLineColor: (index: number) => (index === 1 ? C.muted : "#ffffff"),
      vLineColor: (index: number) => (index === 1 ? C.muted : "#ffffff"),
      paddingLeft: () => 1,
      paddingRight: () => 1,
      paddingTop: () => 2.4,
      paddingBottom: () => 1.6,
    },
    margin: [0, 2, 0, 4],
  } as Content;
}

/** The key to the shades: each class with its words. */
export function heatKey(measure: number): Content {
  const classes = coverageClasses("reliability");
  return {
    columns: [
      { text: "Share of days:", fontSize: T.small, color: C.muted, width: "auto", margin: [0, 1, 4, 0] },
      ...[{ from: 0, label: "under 10%" }, ...classes].map((each, index) => ({
        width: "auto",
        columns: [
          {
            canvas: [
              {
                type: "rect",
                x: 0,
                y: 1,
                w: 10,
                h: 8,
                color: index === 0 ? "#ffffff" : PAPER_SHADES[index - 1],
                lineColor: C.rule,
                lineWidth: 0.5,
              },
            ],
            width: 12,
          },
          { text: each.label, fontSize: T.small, width: "auto", margin: [0, 1, 6, 0] },
        ],
      })),
    ],
    columnGap: 2,
    margin: [0, 0, 0, 8],
    width: measure,
  } as Content;
}

// ── Usable frequencies through the day ──────────────────────────────────────

/** Hours at which the Sun is down at a place, as spans for a chart: from half an hour before each hour to half an hour after. */
export function darkSpans(
  dateIso: string,
  place: { lat: number; lon: number },
  words = "dark",
): Array<{ from: number; to: number; words?: string; fill: string }> {
  const start = Date.parse(`${dateIso}T00:00:00Z`);
  const spans: Array<{ from: number; to: number; words?: string; fill: string }> = [];
  for (let utc = 1; utc <= 24; utc += 1) {
    if (sunAltitude(place.lat, place.lon, start + utc * 3_600_000) >= SUNRISE_ALTITUDE) continue;
    const last = spans.at(-1);
    if (last && last.to === utc - 0.5) last.to = utc + 0.5;
    else spans.push({ from: utc - 0.5, to: utc + 0.5, fill: "#e6e9ee" });
  }
  for (const span of spans) span.words = words;
  return spans;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * The engine's frequencies for the path through the day: the band between the one open
 * on one day in ten and the one open on nine in ten, the MUF (half the days), the lowest
 * usable frequency where it gave one, and the frequency asked about as a line across.
 * The hours of darkness at the path's middle are shaded.
 */
export function usableFrequencyChart(result: PredictionResult, width: number) {
  const xs = result.hours.map((hour) => hour.utc);
  const asked = result.request.frequencyMhz;
  const highs = result.hours.map((hour) => (finite(hour.hpfMhz) ? hour.hpfMhz : null));
  const top = Math.max(asked, ...highs.filter(finite), ...result.hours.map((hour) => hour.mufMhz).filter(finite)) * 1.1;
  const anyLuf = result.hours.some((hour) => finite(hour.lufMhz));
  return chart({
    width,
    height: 200,
    xs,
    xDomain: [0.5, 24.5],
    xTicks: [3, 6, 9, 12, 15, 18, 21, 24],
    xTick: (hour) => `${String(hour).padStart(2, "0")}:00`,
    xLabel: "Hour, UTC",
    yLabel: "MHz",
    yDomain: [0, Math.ceil(top)],
    spans: darkSpans(result.request.date, result.path.midpoint, "Sun down mid-path"),
    series: [
      {
        kind: "band",
        name: "open 1 day in 10 to 9 in 10",
        low: result.hours.map((hour) => (finite(hour.fotMhz) ? hour.fotMhz : null)),
        high: highs,
        colour: C.know,
        opacity: 0.2,
      },
      {
        kind: "line",
        name: "MUF: open half the days",
        values: result.hours.map((hour) => (finite(hour.mufMhz) ? hour.mufMhz : null)),
        colour: C.know,
        width: 2,
        smooth: true,
      },
      {
        kind: "line",
        name: "FOT: 9 days in 10",
        values: result.hours.map((hour) => (finite(hour.fotMhz) ? hour.fotMhz : null)),
        colour: C.accent,
        width: 1.3,
        dash: "4 2",
        smooth: true,
      },
      ...(anyLuf
        ? [
            {
              kind: "line" as const,
              name: "LUF",
              values: result.hours.map((hour) => (finite(hour.lufMhz) ? hour.lufMhz : null)),
              colour: C.act,
              width: 1.3,
              dash: "1.5 2",
              dots: true,
            },
          ]
        : []),
    ],
    rules: [{ y: asked, words: `${asked} MHz asked`, colour: C.act, dash: "5 2" }],
  });
}

/** The bands that lie under the chart's top, as words for its caption. */
export const bandsUnder = (top: number) =>
  HF_BANDS.filter((band) => band.mhz <= top)
    .map((band) => `${band.label} ${band.mhz}`)
    .join(", ");

// ── How HF travels ──────────────────────────────────────────────────────────

/** A page on how a signal gets there: the regions, the ground wave, sky wave, the skip zone, and coming back straight down. */
export function howHfTravels(measure: number): Content[] {
  const half = (measure - 16) / 2;
  return [
    heading("How HF gets there"),
    para(
      "The ionosphere is air high up made electric by the Sun. In daylight it has four regions; at night the D, E and F1 regions all but go, and only F2 is left, weaker by the hour until dawn.",
    ),
    figure(skyWaveDiagram(measure).svg, {
      width: measure,
      title: "One frequency, sent up at steeper and steeper angles",
      caption:
        "Rays 1 to 3 come down further out the lower they leave. Ray 4 is the steepest that still comes back: inside it is the **skip zone**, which neither the ground wave nor the sky wave reaches. Ray 5, steeper still, goes through. Each pass through the D region by day weakens a signal, and weakens lower frequencies more. After the Australian Bureau of Meteorology, Introduction to HF radio propagation (2016), figures 2.1 and 2.8.",
    }),
    twoColumns(
      [
        figure(nvisDiagram(half).svg, {
          width: half,
          title: "Close in: send it straight up",
          caption:
            "If the frequency is one the ionosphere returns straight up, the wave comes back at every angle and there is no skip zone. To reach into a skip zone, use a lower frequency. Often called NVIS, near-vertical incidence sky wave.",
        }),
      ],
      [
        callout("know", "Three ways a signal travels", [
          para("**Ground wave**: along the ground, up to about 100 km over land and 300 km over sea."),
          para("**Direct wave**: in a straight line, where you can see the other station."),
          para("**Sky wave**: bent back down by the ionosphere, to any distance, in one hop or several."),
        ]),
        callout("warn", "Too high, too low", [
          para(
            "Above the highest frequency the ionosphere returns on a path, the signal goes through it. Low frequencies are soaked up by the D region by day. The usable frequencies lie between, and move with the hour, the season and the Sun's cycle.",
          ),
        ]),
      ],
    ),
    note(
      "Words and heights from the Bureau of Meteorology's Space Weather Services, Introduction to HF radio propagation, 2016, sections 1.1, 2.1, 2.2, 2.6 and 2.7.",
    ),
  ];
}

/** The world at an instant, with day and night, the grey line and the path. */
export function greyLineFigure(
  measure: number,
  at: number,
  places: Place[],
  land: LandShapes | null,
  words: { title: string; caption: string },
): Content[] {
  return [
    figure(greyLineSketch(measure, at, places, land).svg, { width: measure, title: words.title }),
    { svg: greyLineKey(measure).svg, width: measure, margin: [0, -6, 0, 3] } as Content,
    note(words.caption),
  ];
}

export const hourLabel = (utc: number) => `${utcLabel(utc)} UTC`;

/** Content kept on one page: a heading with what it heads. */
export const kept = (...content: Content[]): Content => ({ stack: content, unbreakable: true }) as Content;
