/**
 * The two things to print and cut out: a horizontal sundial for a latitude, and a
 * nocturnal for a place and its clock. Each is drawn at actual size on A4, inside the
 * part of the page that US Letter also holds, with a 100 mm bar to check the printer
 * did not scale it. Written by the map's own PDF writer (maps/print/pdf.ts) in
 * Helvetica, so the words are real text. Pure: figures in, pages or bytes out.
 */

import type { IsoDate } from "@/features/maps/lib/sun";
import { wrapText } from "@/features/maps/print/helvetica";
import { PAPERS, PT_PER_MM } from "@/features/maps/print/paper";
import { writePdfPages } from "@/features/maps/print/pdf";
import { INK, MUTED, type Rgb, type Sheet, type SheetItem } from "@/features/maps/print/sheet";
import { appLocale } from "@/lib/region";
import { plainForPdf } from "../tools/kit/sheet";
import { dateRingAngle, kochabTooth } from "./nocturnal";
import { dialDrawing, dialFit, signedMinutes, sundialToClock, tableDates } from "./sundial";
import { formatOffset } from "./zone";

const mm = (value: number) => value * PT_PER_MM;
const PAGE = PAPERS.a4;
/** The left edge, and the widest and deepest the drawing goes, so that US Letter (216 × 279 mm) holds it too. */
const LEFT = mm(12);
const WIDTH = mm(186);
const FOOT = mm(268);
const FAINT: Rgb = [0.6, 0.63, 0.65];
const DEG = Math.PI / 180;

type Items = SheetItem[];

function text(
  items: Items,
  x: number,
  y: number,
  words: string,
  size: number,
  options: { bold?: boolean; anchor?: "start" | "middle" | "end"; muted?: boolean } = {},
) {
  items.push({
    kind: "text",
    x,
    y,
    text: plainForPdf(words),
    size,
    bold: options.bold,
    anchor: options.anchor,
    color: options.muted ? MUTED : INK,
  });
}

/** A paragraph from the top of its first line; returns where the next one starts. */
function paragraph(
  items: Items,
  x: number,
  y: number,
  width: number,
  words: string,
  size = 9,
  options: { bold?: boolean; muted?: boolean } = {},
): number {
  let at = y;
  for (const line of wrapText(plainForPdf(words), size, width, options.bold)) {
    at += size * 1.35;
    text(items, x, at, line, size, options);
  }
  return at + size * 0.5;
}

function line(items: Items, x1: number, y1: number, x2: number, y2: number, width = 0.6, color: Rgb = INK) {
  items.push({ kind: "line", x1, y1, x2, y2, width, color });
}

/** A line drawn as dashes: for folding. */
function dashed(items: Items, x1: number, y1: number, x2: number, y2: number, width = 0.6) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const dash = mm(2.5);
  for (let at = 0; at < length; at += dash * 2) {
    const end = Math.min(length, at + dash);
    line(
      items,
      x1 + ((x2 - x1) * at) / length,
      y1 + ((y2 - y1) * at) / length,
      x1 + ((x2 - x1) * end) / length,
      y1 + ((y2 - y1) * end) / length,
      width,
      MUTED,
    );
  }
}

function circle(items: Items, cx: number, cy: number, r: number, width = 0.8, color: Rgb = INK) {
  const steps = Math.max(48, Math.round(r / 2));
  for (let step = 0; step < steps; step += 1) {
    const a = (step / steps) * 2 * Math.PI;
    const b = ((step + 1) / steps) * 2 * Math.PI;
    line(items, cx + r * Math.sin(a), cy - r * Math.cos(a), cx + r * Math.sin(b), cy - r * Math.cos(b), width, color);
  }
}

/** A point at a distance and an angle clockwise from straight up. */
const polar = (cx: number, cy: number, r: number, degrees: number): [number, number] => [
  cx + r * Math.sin(degrees * DEG),
  cy - r * Math.cos(degrees * DEG),
];

/** The bar that says whether the page was printed at actual size. */
function scaleBar(items: Items, y: number) {
  line(items, LEFT, y, LEFT + mm(100), y, 1);
  for (const at of [0, 50, 100]) line(items, LEFT + mm(at), y - mm(1.5), LEFT + mm(at), y + mm(1.5), 1);
  text(items, LEFT + mm(104), y - 1, "This bar should measure 100 mm.", 7.5, { muted: true });
  text(items, LEFT + mm(104), y + 8, "If not, print again at 100% (actual size).", 7.5, { muted: true });
}

function footer(items: Items, words: string, page: number, pages: number) {
  line(items, LEFT, FOOT + mm(3), LEFT + WIDTH, FOOT + mm(3), 0.4, MUTED);
  text(items, LEFT, FOOT + mm(7), words, 7.5, { muted: true });
  text(items, LEFT + WIDTH, FOOT + mm(7), `Page ${page} of ${pages}`, 7.5, { muted: true, anchor: "end" });
}

const sheet = (items: Items): Sheet => ({ width: PAGE.width, height: PAGE.height, items });

/** "51.5° N", "33.9° S". */
export const latitudeWords = (latitude: number) => `${Math.abs(latitude).toFixed(1)}° ${latitude >= 0 ? "N" : "S"}`;
export const longitudeWords = (longitude: number) => `${Math.abs(longitude).toFixed(1)}° ${longitude >= 0 ? "E" : "W"}`;

// ── The sundial ─────────────────────────────────────────────────────────────

export interface SundialInput {
  latitude: number;
  longitude: number;
  /** The clock's offset without summer time, in minutes. */
  standardOffset: number;
  /** The year the correction table is for. */
  year: number;
  /** Whose words the place is known by: "Home", or the coordinates. */
  placeName: string;
}

export const sundialTitle = (input: SundialInput) => `Horizontal sundial for ${latitudeWords(input.latitude)} (${input.placeName})`;

const twelveHour = (hour: number) => String(((hour + 11) % 12) + 1);

export function sundialSheets(input: SundialInput): Sheet[] {
  const north = input.latitude >= 0;
  const lat = Math.abs(input.latitude);
  const pole = north ? "north" : "south";
  const footerWords = `${sundialTitle(input)} · Outpost`;

  // Page 1: the dial plate.
  const one: Items = [];
  text(one, LEFT, mm(18), sundialTitle(input), 14, { bold: true });
  paragraph(
    one,
    LEFT,
    mm(20),
    WIDTH,
    `Cut out along the outer line. Glue it to card or board, level, with the noon line pointing true ${pole}. The gnomon is on page 2.`,
    9,
  );
  const box = { left: LEFT + mm(4), top: mm(36), right: LEFT + WIDTH - mm(4), bottom: mm(220) };
  one.push({ kind: "rect", x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, stroke: INK, lineWidth: 1 });
  // The same layout as the dial drawn on the screen (dialDrawing in sundial.ts).
  const dial = dialDrawing(input.latitude, box, mm(9), mm(5));
  const [rootX, rootY] = dial.root;
  for (const lineAt of dial.hours) {
    line(one, rootX, rootY, lineAt.end[0], lineAt.end[1], lineAt.fromNoon === 0 ? 1.4 : 0.8);
    text(one, lineAt.label[0], lineAt.label[1] + 3.5, twelveHour(lineAt.hour), 10, { bold: true, anchor: "middle" });
  }
  // Half hours, shorter, after each hour but the last.
  for (const half of dial.halves) line(one, half.from[0], half.from[1], half.to[0], half.to[1], 0.5, MUTED);
  // The gnomon's foot: its slot along the noon line from the centre mark.
  const gnomonBase = Math.min(mm(80), mm(80) / Math.max(Math.tan(lat * DEG), 0.01));
  line(one, rootX - mm(3), rootY, rootX + mm(3), rootY, 1);
  text(one, rootX, rootY + mm(30), "Centre: the gnomon's low corner", 7.5, { muted: true, anchor: "middle" });
  dashed(one, rootX, rootY, rootX, rootY - Math.min(gnomonBase, rootY - box.top - mm(12)), 1);
  text(one, rootX, box.top - mm(2), `True ${pole} this way`, 8, { anchor: "middle", muted: true });
  text(one, box.left + mm(3), rootY - mm(2), north ? "West" : "East", 8, { muted: true });
  text(one, box.right - mm(3), rootY - mm(2), north ? "East" : "West", 8, { muted: true, anchor: "end" });
  paragraph(
    one,
    LEFT,
    box.bottom + mm(2),
    WIDTH,
    `Hour lines: tan(angle from the noon line) = sin(${lat.toFixed(1)}°) × tan(15° × hours from noon). Half hours are the short lines. The dial shows sundial time: page 2 says how to turn it into clock time.`,
    8,
    { muted: true },
  );
  scaleBar(one, mm(255));
  footer(one, footerWords, 1, 2);

  // Page 2: the gnomon, setting up and reading.
  const two: Items = [];
  text(two, LEFT, mm(18), "The gnomon, setting it up, and reading clock time", 14, { bold: true });
  const baseLeft = LEFT + mm(8);
  const baseY = mm(36) + gnomonBase * Math.tan(lat * DEG);
  const tipX = baseLeft + gnomonBase;
  const tipY = baseY - gnomonBase * Math.tan(lat * DEG);
  line(two, tipX, baseY, tipX, tipY, 1);
  line(two, baseLeft, baseY, tipX, tipY, 1.4);
  // A tab to fold under and glue along the noon line.
  dashed(two, baseLeft, baseY, tipX, baseY, 0.8);
  line(two, baseLeft, baseY, baseLeft, baseY + mm(10), 1);
  line(two, baseLeft, baseY + mm(10), tipX, baseY + mm(10), 1);
  line(two, tipX, baseY, tipX, baseY + mm(10), 1);
  text(two, baseLeft + mm(2), baseY + mm(6.5), "Fold under along the dashed line; glue to the noon line", 7.5, { muted: true });
  text(two, baseLeft + mm(3), baseY - mm(2), `${lat.toFixed(1)}°`, 9, { bold: true });
  text(two, tipX + mm(3), tipY + mm(4), "Cut out along the solid lines.", 8, { muted: true });
  text(two, tipX + mm(3), tipY + mm(9), `The sloping edge rises at ${lat.toFixed(1)}°, your latitude,`, 8, { muted: true });
  text(two, tipX + mm(3), tipY + mm(14), "and points to the true pole of the sky.", 8, { muted: true });
  text(two, tipX + mm(3), tipY + mm(19), "Its low corner stands on the dial's centre mark.", 8, { muted: true });

  let y = baseY + mm(16);
  const steps = [
    `1. Find true ${pole}, not a compass's: on a sunny day stand a stick upright on level ground and mark the tip of its shadow every 15 minutes through the middle of the day. The line from the foot of the stick to the nearest mark points true ${pole}.`,
    `2. Glue the gnomon upright on the noon line, its low corner on the centre mark and its sloping edge rising towards the ${north ? "north" : "south"} end. Stiffen thin card first: a thick gnomon shifts the afternoon lines by its thickness.`,
    `3. Set the dial level (a spirit level, or water in a saucer) with the noon line along your true ${pole} line.`,
    "4. Read the hour where the edge of the gnomon's shadow falls. That is sundial time. Then add the correction in the table for the date: the result is clock time without summer time. In summer time, add an hour as well.",
    "Never look at the sun directly, through anything or not.",
  ];
  for (const step of steps) y = paragraph(two, LEFT, y, WIDTH, step, 8.5) + mm(0.5);
  y += mm(2);
  text(
    two,
    LEFT,
    y + mm(3),
    `Add to the sundial's reading, for clock time on ${formatOffset(input.standardOffset)} at ${longitudeWords(input.longitude)} (${input.year}):`,
    9,
    { bold: true },
  );
  y += mm(5);
  const dates = tableDates(input.year);
  const columnWidth = WIDTH / 4;
  dates.forEach((date, index) => {
    const column = Math.floor(index / 6);
    const row = index % 6;
    const day = new Date(`${date}T00:00:00Z`).toLocaleDateString(appLocale(), { day: "numeric", month: "short", timeZone: "UTC" });
    const cx = LEFT + column * columnWidth;
    const cy = y + mm(5) + row * mm(5);
    text(two, cx, cy, day, 8.5);
    text(two, cx + mm(30), cy, signedMinutes(sundialToClock(date, input.longitude, input.standardOffset)), 8.5, {
      anchor: "end",
      bold: true,
    });
  });
  y += mm(36);
  paragraph(
    two,
    LEFT,
    y,
    WIDTH,
    `The correction is minus the equation of time (NOAA's equations after Meeus, Astronomical Algorithms) plus 4 minutes for every degree the place lies west of the clock's meridian (${(input.standardOffset / 4).toFixed(1)}° for ${formatOffset(input.standardOffset)}). Between the dates given, take the nearer. A home-made dial is good to a few minutes when carefully set; the sun's blurred shadow makes it hard to read closer.`,
    8,
    { muted: true },
  );
  scaleBar(two, mm(255));
  footer(two, footerWords, 2, 2);
  return [sheet(one), sheet(two)];
}

/** Whether a horizontal dial can be drawn at all: not on the equator, where every hour line is the noon line. */
export const canDrawSundial = (latitude: number) => dialFit(latitude) !== "none";

export function sundialPdf(input: SundialInput): Uint8Array {
  return writePdfPages({ pages: sundialSheets(input), title: sundialTitle(input), created: new Date(Date.UTC(input.year, 0, 1)) });
}

// ── The nocturnal ───────────────────────────────────────────────────────────

export interface NocturnalInput {
  longitude: number;
  latitude: number;
  standardOffset: number;
  year: number;
  placeName: string;
}

export const nocturnalTitle = (input: NocturnalInput) =>
  `Nocturnal for ${longitudeWords(input.longitude)}, ${formatOffset(input.standardOffset)} (${input.placeName})`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const iso = (year: number, month: number, day: number): IsoDate =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function nocturnalSheets(input: NocturnalInput): Sheet[] {
  const footerWords = `${nocturnalTitle(input)} · Outpost`;
  const angle = (date: IsoDate) => dateRingAngle(date, input.longitude, input.standardOffset);

  // Page 1: the date disc and its handle.
  const one: Items = [];
  text(one, LEFT, mm(18), nocturnalTitle(input), 14, { bold: true });
  paragraph(
    one,
    LEFT,
    mm(20),
    WIDTH,
    `The date disc. Glue to stiff card and cut out along the outer line, handle and all. Make a hole at the centre about 5 mm across: Polaris is seen through it. Made for clocks on ${formatOffset(input.standardOffset)} at ${longitudeWords(input.longitude)}, for ${input.year} (good for some years either side: leap years move it by about 4 minutes).`,
    9,
  );
  const cx = LEFT + WIDTH / 2;
  const cy = mm(130);
  const outer = mm(92);
  // The handle, below the disc.
  const handleHalf = mm(16);
  const rim = Math.sqrt(outer ** 2 - handleHalf ** 2);
  line(one, cx - handleHalf, cy + rim, cx - handleHalf, cy + outer + mm(22), 1);
  line(one, cx + handleHalf, cy + rim, cx + handleHalf, cy + outer + mm(22), 1);
  line(one, cx - handleHalf, cy + outer + mm(22), cx + handleHalf, cy + outer + mm(22), 1);
  text(one, cx, cy + outer + mm(9), "Handle", 9, { bold: true, anchor: "middle" });
  text(one, cx, cy + outer + mm(14), "hold straight down", 7.5, { anchor: "middle", muted: true });
  // The outline, broken where the handle joins.
  const steps = 180;
  const gap = Math.asin(handleHalf / outer) / DEG;
  for (let step = 0; step < steps; step += 1) {
    const a = (step / steps) * 360;
    const b = ((step + 1) / steps) * 360;
    if (Math.abs((((a + b) / 2 - 180 + 540) % 360) - 180) < gap) continue;
    const [x1, y1] = polar(cx, cy, outer, a);
    const [x2, y2] = polar(cx, cy, outer, b);
    line(one, x1, y1, x2, y2, 1);
  }
  circle(one, cx, cy, mm(80), 0.5, MUTED);
  // A day tick for every day, longer for the 1st, 10th and 20th, with the months named.
  for (let month = 0; month < 12; month += 1) {
    for (let day = 1; day <= daysIn(input.year, month); day += 1) {
      const at = angle(iso(input.year, month, day));
      const inner = day === 1 ? mm(67) : day % 10 === 0 ? mm(73) : mm(76);
      const [x1, y1] = polar(cx, cy, inner, at);
      const [x2, y2] = polar(cx, cy, mm(80), at);
      line(one, x1, y1, x2, y2, day === 1 ? 1 : 0.45);
      if (day % 10 === 0) {
        const [lx, ly] = polar(cx, cy, mm(70.5), at);
        text(one, lx, ly + 2, String(day), 5.5, { anchor: "middle", muted: true });
      }
    }
    const [mx, my] = polar(cx, cy, mm(86), angle(iso(input.year, month, 15)));
    text(one, mx, my + 3, MONTHS[month]!, 8.5, { bold: true, anchor: "middle" });
  }
  // The centre.
  circle(one, cx, cy, mm(2.5), 0.8);
  line(one, cx - mm(4), cy, cx + mm(4), cy, 0.4, MUTED);
  line(one, cx, cy - mm(4), cx, cy + mm(4), 0.4, MUTED);
  scaleBar(one, mm(255));
  footer(one, footerWords, 1, 2);

  // Page 2: the hour disc, the arm, and how to use it.
  const two: Items = [];
  text(two, LEFT, mm(18), "The hour disc and the arm", 14, { bold: true });
  const hx = LEFT + mm(66);
  const hy = mm(92);
  const radius = mm(58);
  circle(two, hx, hy, radius, 1);
  const tooth = (at: number, label: string) => {
    const [ax, ay] = polar(hx, hy, radius - mm(0.5), at - 4);
    const [bx, by] = polar(hx, hy, radius + mm(7), at);
    const [qx, qy] = polar(hx, hy, radius - mm(0.5), at + 4);
    line(two, ax, ay, bx, by, 1);
    line(two, bx, by, qx, qy, 1);
    const [lx, ly] = polar(hx, hy, radius - mm(20), at);
    text(two, lx, ly + 2.5, label, 7, { bold: true, anchor: "middle" });
  };
  tooth(0, "Plough");
  tooth(kochabTooth(input.year), "Kochab");
  // Hours run anticlockwise from the Plough's tooth, which marks midnight; quarter hours between.
  for (let quarter = 0; quarter < 96; quarter += 1) {
    const at = (-quarter * 3.75 + 360) % 360;
    const hour = quarter % 4 === 0;
    const [x1, y1] = polar(hx, hy, radius - (hour ? mm(6) : mm(3)), at);
    const [x2, y2] = polar(hx, hy, radius, at);
    line(two, x1, y1, x2, y2, hour ? 0.8 : 0.4);
    if (hour) {
      const [lx, ly] = polar(hx, hy, radius - mm(9.5), at);
      text(two, lx, ly + 3, String(quarter / 4), 8, { anchor: "middle", bold: quarter / 4 === 0 });
    }
  }
  circle(two, hx, hy, mm(2.5), 0.8);
  text(two, hx, hy + mm(22), "Hours on the clock: 0 is midnight", 7, { anchor: "middle", muted: true });
  // The arm, upright beside the disc.
  const armLeft = LEFT + mm(150);
  const armTop = mm(30);
  const armLength = mm(110);
  two.push({ kind: "rect", x: armLeft, y: armTop, width: mm(12), height: armLength, stroke: INK, lineWidth: 1 });
  circle(two, armLeft + mm(6), armTop + armLength - mm(8), mm(2.5), 0.8);
  line(two, armLeft + mm(6), armTop, armLeft + mm(6), armTop + armLength - mm(8), 0.4, FAINT);
  text(two, armLeft + mm(6), armTop + armLength + mm(5), "The arm", 8, { bold: true, anchor: "middle" });
  paragraph(
    two,
    armLeft - mm(18),
    armTop + armLength + mm(6),
    mm(48),
    "Its centre line is the reading edge. The hole goes over the centre; the long end towards the stars.",
    7,
    { muted: true },
  );
  let y = hy + radius + mm(26);
  const how = [
    "Assemble: the date disc at the back, the hour disc on it, the arm on top, all three held at the centre by a hollow rivet, an eyelet or a short length of tube, so that Polaris can be seen through the middle and the hour disc and the arm still turn.",
    "1. Turn the hour disc until the tooth marked Plough points to tonight's date (or Kochab's tooth, to use Kochab).",
    "2. Face north and hold the nocturnal upright at arm's length by the handle, straight down.",
    "3. Sight Polaris through the centre hole.",
    "4. Turn the arm until its centre line runs through the two pointer stars of the Plough (Merak and Dubhe, the end of the bowl), or through Kochab.",
    `5. Where the arm crosses the hour disc is the time on clocks on ${formatOffset(input.standardOffset)}. In summer time, add an hour.`,
    "Why the date: the stars turn once in a sidereal day, 23 h 56 min 4 s, so they come round about 4 minutes earlier each night, two hours a month. The date ring takes that up.",
    "How good: Royal Museums Greenwich gives navigators' wooden nocturnals as good to within 15 minutes. This one takes Polaris to be at the pole, as every nocturnal does, which Outpost measured as costing up to about 8 minutes at 51° N. It works only in the northern hemisphere, with Polaris well above the horizon.",
  ];
  for (const step of how) y = paragraph(two, LEFT, y, WIDTH, step, 8.5) + mm(0.5);
  scaleBar(two, mm(255));
  footer(two, footerWords, 2, 2);
  return [sheet(one), sheet(two)];
}

export function nocturnalPdf(input: NocturnalInput): Uint8Array {
  return writePdfPages({ pages: nocturnalSheets(input), title: nocturnalTitle(input), created: new Date(Date.UTC(input.year, 0, 1)) });
}

/** Every line of text on the pages, for tests and for checking nothing runs off the page. */
export const sheetText = (pages: Sheet[]) =>
  pages.flatMap((page) => page.items.flatMap((item) => (item.kind === "text" ? [item.text] : [])));
