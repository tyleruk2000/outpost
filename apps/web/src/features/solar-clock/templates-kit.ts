/**
 * The sundial and the nocturnal to cut out, laid out with the print kit. The pieces to
 * cut out are the very drawings templates.ts makes (in the kit's colours), each page put
 * down whole as one picture the size of the page at (0, 0): a point of the drawing is a
 * point of the page, so every piece prints at exactly the size it always did, with the
 * 100 mm bar to check the printer. The words that ran on under the drawings are a third
 * page of their own: steps, drawings of what they say, and callouts.
 *
 * A4, as before: every piece also lies inside what US Letter holds.
 */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Rgb, Sheet } from "@/features/maps/print/sheet";
import {
  PRINT_COLOURS as C,
  callout,
  dataTable,
  figure,
  label,
  measureOf,
  note,
  para,
  printable,
  printDocument,
  sheetItemsToSvg,
  steps,
  twoColumns,
} from "@/features/print-kit";
import { appLocale } from "@/lib/region";
import { findNorth, gnomonSide, nocturnalSighting } from "./diagrams";
import { signedMinutes, sundialToClock, tableDates } from "./sundial";
import {
  gnomonGeometry,
  longitudeWords,
  type NocturnalInput,
  nocturnalSheets,
  nocturnalTitle,
  type SundialInput,
  sundialSheets,
  sundialTitle,
  type TemplateLook,
} from "./templates";
import { formatOffset } from "./zone";

const LEFT = 12 * (72 / 25.4);

const rgb = (hex: string): Rgb => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255) as unknown as Rgb;

export const KIT_LOOK: TemplateLook = {
  kit: true,
  hour: rgb(C.accent),
  noon: rgb(C.act),
  strong: rgb(C.accent),
  second: rgb(C.know),
  tint: rgb(C.accentSoft),
  pages: 3,
};

const kicker = (words: string): Content => ({ text: words, fontSize: 8, bold: true, color: C.accent, characterSpacing: 0.4 });
const title = (words: string): Content => ({ text: printable(words), fontSize: 15, bold: true, margin: [0, 1, 0, 0] });

/** A drawn page, whole, at its own size: one point of the drawing to one point of paper. */
export const wholePage = (page: Sheet): Content =>
  ({
    svg: sheetItemsToSvg(page.items, { x: 0, y: 0, width: page.width, height: page.height }),
    width: page.width,
    height: page.height,
    absolutePosition: { x: 0, y: 0 },
  }) as Content;

const made = (year: number) => new Date(Date.UTC(year, 0, 1));

// ── The sundial ─────────────────────────────────────────────────────────────

export function sundialDocument(input: SundialInput): TDocumentDefinitions {
  const [one, two] = sundialSheets(input, KIT_LOOK) as [Sheet, Sheet];
  const north = input.latitude >= 0;
  const pole = north ? "north" : "south";
  const lat = Math.abs(input.latitude);
  const measure = measureOf("a4");
  const name = sundialTitle(input);

  const dates = tableDates(input.year);
  const day = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString(appLocale(), { day: "numeric", month: "short", timeZone: "UTC" });
  const add = (date: string) => printable(signedMinutes(sundialToClock(date, input.longitude, input.standardOffset)));
  const rows = Array.from({ length: 6 }, (_, row) =>
    [0, 1, 2, 3].flatMap((column) => {
      const date = dates[column * 6 + row];
      return date ? [day(date), `**${add(date)}**`] : ["", ""];
    }),
  );
  const correction: Content = {
    absolutePosition: { x: LEFT, y: gnomonGeometry(input.latitude).below },
    stack: [
      label(
        printable(
          `Add to the sundial's reading, for clock time on ${formatOffset(input.standardOffset)} at ${longitudeWords(input.longitude)} (${input.year})`,
        ),
      ),
      dataTable(["Date", "Add", "Date", "Add", "Date", "Add", "Date", "Add"], rows, {
        right: [1, 3, 5, 7],
        widths: ["*", "*", "*", "*", "*", "*", "*", "*"],
      }),
      note(
        printable(
          `Then add an hour in summer time. The correction is minus the equation of time (NOAA's equations after Meeus, Astronomical Algorithms) plus 4 minutes for every degree the place lies west of the clock's meridian (${(input.standardOffset / 4).toFixed(1)}° for ${formatOffset(input.standardOffset)}). Between the dates given, take the nearer.`,
        ),
      ),
    ],
  } as Content;

  const column = (measure - 16) / 2;
  const howTo: Content[] = [
    kicker("Sundial template · page 3 of 3"),
    title("Setting it up and reading it"),
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 1.6, lineColor: C.accent }], margin: [0, 8, 0, 12] },
    twoColumns(
      [
        figure(findNorth(input.latitude, column, 160).svg, {
          title: `1. Find true ${pole}`,
          width: column,
          caption: `Mark the tip of a stick's shadow through the middle of the day: the nearest mark is true ${pole}.`,
        }),
      ],
      [
        figure(gnomonSide(input.latitude, column, 160).svg, {
          title: "2. Stand the gnomon on the noon line",
          width: column,
          caption: `Its sloping edge rises at ${lat.toFixed(1)}°, your latitude, and points to the true pole of the sky.`,
        }),
      ],
    ),
    steps([
      `**Find true ${pole}, not a compass's.** On a sunny day stand a stick upright on level ground and mark the tip of its shadow every 15 minutes through the middle of the day. The line from the foot of the stick to the nearest mark points true ${pole}.`,
      `**Glue the gnomon upright on the noon line**, its low corner on the centre mark and its sloping edge rising towards the ${pole} end. Stiffen thin card first: a thick gnomon shifts the afternoon lines by its thickness.`,
      `**Set the dial level** (a spirit level, or water in a saucer) with the noon line along your true ${pole} line.`,
      "**Read the hour** where the edge of the gnomon's shadow falls. That is sundial time. Then add the correction in the table on page 2 for the date: the result is clock time without summer time. In summer time, add an hour as well.",
    ]),
    callout("act", "Never look at the sun", para("Never look at the sun directly, through anything or not.")),
    callout(
      "know",
      "Printing it",
      para(
        "Print at 100% (actual size), not fitted to the page: the bar on pages 1 and 2 should measure 100 mm. A home-made dial is good to a few minutes when carefully set; the sun's blurred shadow makes it hard to read closer.",
      ),
    ),
  ];

  return printDocument({
    paper: "a4",
    title: name,
    made: made(input.year),
    footerName: printable(name),
    footerRight: "Outpost",
    parts: [
      { kind: "cover", content: [kicker("Sundial template · page 1 of 3 · the dial plate"), title(name), wholePage(one)] },
      {
        kind: "cover",
        content: [kicker("Sundial template · page 2 of 3 · the gnomon"), title("The gnomon, and clock time"), wholePage(two), correction],
      },
      { kind: "plain", content: howTo },
    ],
  });
}

// ── The nocturnal ───────────────────────────────────────────────────────────

export function nocturnalDocument(input: NocturnalInput): TDocumentDefinitions {
  const [one, two] = nocturnalSheets(input, KIT_LOOK) as [Sheet, Sheet];
  const measure = measureOf("a4");
  const name = nocturnalTitle(input);
  const offset = formatOffset(input.standardOffset);
  const howTo: Content[] = [
    kicker("Nocturnal template · page 3 of 3"),
    title("Making it and telling the time by it"),
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 1.6, lineColor: C.accent }], margin: [0, 8, 0, 12] },
    twoColumns(
      [
        label("Make it"),
        steps(
          [
            `Glue the date disc (page 1) to stiff card and cut it out along the outer line, handle and all. Make a hole at the centre about 5 mm across: Polaris is seen through it.`,
            "Cut out the hour disc and the arm (page 2) the same way.",
            "Assemble: the date disc at the back, the hour disc on it, the arm on top, all three held at the centre by a hollow rivet, an eyelet or a short length of tube, so that Polaris can be seen through the middle and the hour disc and the arm still turn.",
          ],
          { mark: "letter" },
        ),
        label("Tell the time"),
        steps([
          "Turn the hour disc until the tooth marked **Plough** points to tonight's date (or Kochab's tooth, to use Kochab).",
          "Face north and hold the nocturnal upright at arm's length by the handle, straight down.",
          "Sight Polaris through the centre hole.",
          "Turn the arm until its centre line runs through the two pointer stars of the Plough (**Merak and Dubhe**, the end of the bowl), or through Kochab.",
          `Where the arm crosses the hour disc is the time on clocks on ${offset}. In summer time, add an hour.`,
        ]),
      ],
      [
        figure(nocturnalSighting(220, 190).svg, {
          title: "Sighting it",
          width: 220,
          caption: "Not to scale: the pointers are shown where the arm meets them.",
        }),
      ],
      { widths: ["*", 220] },
    ),
    callout(
      "know",
      "Why the date",
      para(
        "The stars turn once in a sidereal day, 23 h 56 min 4 s, so they come round about 4 minutes earlier each night, two hours a month. The date ring takes that up.",
      ),
    ),
    callout(
      "warn",
      "How good, and where",
      para(
        `Royal Museums Greenwich gives navigators' wooden nocturnals as good to within 15 minutes. This one takes Polaris to be at the pole, as every nocturnal does, which Outpost measured as costing up to about 8 minutes at 51° N. It works only in the northern hemisphere, with Polaris well above the horizon. Made for clocks on ${offset} at ${longitudeWords(input.longitude)}, for ${input.year} (good for some years either side: leap years move it by about 4 minutes).`,
      ),
    ),
    note("Print at 100% (actual size), not fitted to the page: the bar on pages 1 and 2 should measure 100 mm."),
  ];
  return printDocument({
    paper: "a4",
    title: name,
    made: made(input.year),
    footerName: printable(name),
    footerRight: "Outpost",
    parts: [
      { kind: "cover", content: [kicker("Nocturnal template · page 1 of 3 · the date disc"), title(name), wholePage(one)] },
      { kind: "cover", content: [kicker("Nocturnal template · page 2 of 3"), title("The hour disc and the arm"), wholePage(two)] },
      { kind: "plain", content: howTo },
    ],
  });
}
