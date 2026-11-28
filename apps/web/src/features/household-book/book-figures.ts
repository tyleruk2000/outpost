/**
 * The household book's own drawings, beside the words they draw: how much water each
 * person needs a day, the steps that make water safe in order, where to go in each case,
 * how long the supplies last against the days wanted, and how long food keeps in a
 * fridge and a freezer with the power off. Each draws figures or words the book already
 * prints, from the same sources, and adds nothing of its own. Labels are real text; every
 * mark differs in grey and in shape, not only in colour.
 */
import { PRINT_COLOURS as C, drawing, round, svgArrowHead, svgText } from "@/features/print-kit";

/** Roughly how wide words are in the book's typeface: a little over half the size a letter. */
const wordsWidth = (words: string, size: number) => words.length * size * 0.52;

/** Words broken into lines no wider than `width`. */
function lines(words: string, width: number, size: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of words.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && wordsWidth(next, size) > width) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

const box = (
  x: number,
  y: number,
  width: number,
  height: number,
  options: { fill?: string; stroke?: string; dash?: boolean; weight?: number } = {},
) =>
  `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="3" fill="${options.fill ?? "#ffffff"}" stroke="${options.stroke ?? C.ink}" stroke-width="${options.weight ?? 0.9}"${options.dash ? ' stroke-dasharray="3 2"' : ""}/>`;

const arrow = (x1: number, y1: number, x2: number, y2: number, colour: string = C.muted) => {
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return `<path d="M${round(x1)},${round(y1)} L${round(x2)},${round(y2)}" stroke="${colour}" stroke-width="1"/>${svgArrowHead(x2, y2, angle, colour, 4.5)}`;
};

/** A box of words, bold title and lighter lines, centred; answers its SVG and height. */
function wordBox(
  x: number,
  y: number,
  width: number,
  title: string,
  body: string[],
  options: { fill?: string; stroke?: string; dash?: boolean; ink?: string; weight?: number; minHeight?: number } = {},
) {
  const titleLines = lines(title, width - 12, 8);
  const bodyLines = body.flatMap((each) => lines(each, width - 12, 7));
  const height = Math.max(options.minHeight ?? 0, 10 + titleLines.length * 10 + bodyLines.length * 9 + 2);
  let svg = box(x, y, width, height, options);
  let at = y + 13;
  for (const line of titleLines) {
    svg += svgText(x + width / 2, at, line, { anchor: "middle", bold: true, size: 8, fill: options.ink ?? C.ink });
    at += 10;
  }
  for (const line of bodyLines) {
    svg += svgText(x + width / 2, at, line, { anchor: "middle", size: 7, fill: options.ink ?? C.ink });
    at += 9;
  }
  return { svg, height };
}

// ── Water a day ─────────────────────────────────────────────────────────────

export interface WaterNeed {
  name: string;
  drinking: number | null;
  allUses: number | null;
}

/** Each person's and pet's litres a day: drinking, and all uses, on one scale, with the figures written on. */
export function waterNeedsDrawing(width: number, needs: WaterNeed[]) {
  const left = 64;
  const right = 34;
  const row = 22;
  const top = 8;
  const most = Math.max(1, ...needs.map((need) => Math.max(need.drinking ?? 0, need.allUses ?? 0)));
  const scale = (litres: number) => ((width - left - right) * litres) / most;
  let body = "";
  needs.forEach((need, index) => {
    const y = top + index * row;
    body += svgText(left - 6, y + 11, need.name.length > 14 ? `${need.name.slice(0, 13)}…` : need.name || "Unnamed", {
      anchor: "end",
      bold: true,
      size: 7.5,
    });
    if (need.allUses !== null) {
      body += `<rect x="${left}" y="${y + 1}" width="${round(scale(need.allUses))}" height="14" fill="#ffffff" stroke="${C.know}" stroke-width="0.8" stroke-dasharray="3 1.5"/>`;
      body += svgText(left + scale(need.allUses) + 3, y + 11, `${need.allUses} l`, { size: 7 });
    }
    if (need.drinking !== null) {
      body += `<rect x="${left}" y="${y + 4}" width="${round(scale(need.drinking))}" height="8" fill="${C.water}" stroke="${C.know}" stroke-width="0.6"/>`;
      const inside = scale(need.drinking) > 22;
      body += svgText(inside ? left + scale(need.drinking) - 2 : left + scale(need.drinking) + 2, y + 10.5, `${need.drinking} l`, {
        size: 6.5,
        bold: true,
        anchor: inside ? "end" : "start",
        fill: C.ink,
      });
    }
  });
  const keyY = top + needs.length * row + 10;
  body += `<rect x="${left}" y="${keyY - 7}" width="14" height="8" fill="${C.water}" stroke="${C.know}" stroke-width="0.6"/>`;
  body += svgText(left + 18, keyY, "to drink", { size: 7 });
  body += `<rect x="${left + 62}" y="${keyY - 8}" width="14" height="10" fill="#ffffff" stroke="${C.know}" stroke-width="0.8" stroke-dasharray="3 1.5"/>`;
  body += svgText(left + 80, keyY, "all uses", { size: 7 });
  return drawing(width, keyY + 6, body);
}

// ── Making water safe ───────────────────────────────────────────────────────

/**
 * The page's two steps in order, from tap-less water to water kept: clear it if it is
 * cloudy (filter or settle), then kill the germs (boil, tablets or drops, or bleach),
 * then keep it in a clean, covered container. The words are the page's own labels.
 */
export function safeWaterFlow(width: number) {
  const gap = 24;
  const columns = 4;
  const w = (width - gap * (columns - 1)) / columns;
  const xs = Array.from({ length: columns }, (_, index) => index * (w + gap));
  let body = "";
  const start = wordBox(xs[0]!, 18, w, "Water from anywhere but a working tap", [], { fill: C.shade, stroke: C.muted });
  // "Cloudy?" splits: yes through step 1, no straight on to step 2.
  const clear = wordBox(xs[1]!, 0, w, "Step 1: clear it", ["filter it,", "or let it settle", "(only if cloudy)"], {
    fill: C.actSoft,
    stroke: C.act,
    weight: 1.2,
  });
  const kill = wordBox(xs[2]!, 18, w, "Step 2: kill the germs", ["boil it,", "or tablets or drops,", "or bleach"], {
    fill: C.knowSoft,
    stroke: C.know,
    weight: 1.2,
  });
  const keep = wordBox(xs[3]!, 18, w, "Keep it clean", ["in a clean,", "covered container"], { stroke: C.ink });
  const height = Math.max(start.height + 18, clear.height, kill.height + 18, keep.height + 18) + 26;
  body += start.svg + clear.svg + kill.svg + keep.svg;
  const midStart = 18 + start.height / 2;
  // Cloudy: up through step 1.
  body += arrow(xs[0]! + w, midStart - 6, xs[1]! - 1, clear.height / 2 + 2);
  body += svgText(xs[0]! + w + gap / 2, midStart - 13, "cloudy", { anchor: "middle", size: 6.5, bold: true, fill: C.act });
  body += arrow(xs[1]! + w, clear.height / 2 + 2, xs[2]! - 1, 18 + kill.height / 2 - 6);
  // Clear: along the foot, straight to step 2.
  const low = Math.max(18 + start.height, clear.height) + 12;
  body += `<path d="M${round(xs[0]! + w / 2)},${round(18 + start.height)} L${round(xs[0]! + w / 2)},${round(low)} L${round(xs[2]! + w / 2)},${round(low)}" fill="none" stroke="${C.muted}" stroke-width="1"/>`;
  body += arrow(xs[2]! + w / 2, low, xs[2]! + w / 2, 18 + kill.height + 1);
  body += svgText((xs[1]! + xs[1]! + w) / 2, low + 9, "clear already", { anchor: "middle", size: 6.5, bold: true, fill: C.muted });
  body += arrow(xs[2]! + w, 18 + kill.height / 2, xs[3]! - 1, 18 + keep.height / 2);
  body += svgText(xs[0]!, height - 2, "Clearing does not make water safe. Only step 2 does.", { size: 7.5, bold: true, fill: C.act });
  return drawing(width, height, body);
}

// ── Where we go ─────────────────────────────────────────────────────────────

export interface GoRow {
  /** When: "If you cannot get home, or must leave". */
  when: string;
  /** Where, in order, each with its number on the map when it has one. */
  places: Array<{ name: string; number: number | null; also?: string }>;
  kind: "near" | "away" | "stay";
}

/** For each case, where to go: the first place, then the next if it cannot be reached, each with its number on the map. */
export function goFlow(width: number, rows: GoRow[]) {
  const whenWidth = Math.min(170, width * 0.34);
  const arrowGap = 26;
  const placeWidth = Math.min(
    150,
    (width - whenWidth - arrowGap - 4) / Math.max(1, Math.min(3, Math.max(...rows.map((row) => row.places.length)))) - 26,
  );
  let y = 8;
  let body = "";
  const colour = (kind: GoRow["kind"]) => (kind === "near" ? C.act : kind === "away" ? C.know : C.accent);
  const soft = (kind: GoRow["kind"]) => (kind === "near" ? C.actSoft : kind === "away" ? C.knowSoft : C.accentSoft);
  for (const row of rows) {
    const shown = row.places.slice(0, 3);
    const boxes = shown.map((place) =>
      wordBox(0, 0, placeWidth, place.name, place.also ? [place.also] : [], { stroke: colour(row.kind), weight: 1.1, minHeight: 30 }),
    );
    const placeHeight = Math.max(30, ...boxes.map((each) => each.height));
    const whenBox = wordBox(0, y, whenWidth, row.when, [], { fill: soft(row.kind), stroke: colour(row.kind), minHeight: placeHeight });
    const height = Math.max(whenBox.height, placeHeight);
    body += wordBox(0, y, whenWidth, row.when, [], { fill: soft(row.kind), stroke: colour(row.kind), minHeight: height }).svg;
    let x = whenWidth + arrowGap;
    body += arrow(whenWidth + 2, y + height / 2, x - 2, y + height / 2, C.ink);
    shown.forEach((place, index) => {
      body += wordBox(x, y, placeWidth, place.name, place.also ? [place.also] : [], {
        stroke: colour(row.kind),
        weight: 1.1,
        minHeight: height,
      }).svg;
      if (place.number !== null) {
        body += `<circle cx="${round(x + 1)}" cy="${round(y + 1)}" r="7" fill="${colour(row.kind)}"/>`;
        body += svgText(x + 1, y + 3.6, String(place.number), { anchor: "middle", bold: true, size: 7.5, fill: "#ffffff" });
      }
      if (index < shown.length - 1) {
        body += arrow(x + placeWidth + 2, y + height / 2, x + placeWidth + 24, y + height / 2);
        body += svgText(x + placeWidth + 13, y + height / 2 - 4, "then", { anchor: "middle", size: 6.5, fill: C.muted });
      }
      x += placeWidth + 26;
    });
    if (row.places.length > 3)
      body += svgText(x - 26, y + height + 8, `and ${row.places.length - 3} more in the table`, {
        anchor: "end",
        size: 6.5,
        fill: C.muted,
      });
    y += height + (row.places.length > 3 ? 18 : 12);
  }
  return drawing(width, Math.max(10, y), body);
}

// ── How long the supplies last ──────────────────────────────────────────────

export interface LastingRow {
  label: string;
  /** Days, or null when it cannot be worked out. */
  days: number | null;
  why?: string;
}

/** Days each kind of supply lasts the household, as Supplies works it out, against the days the household wants to be ready for. */
export function lastingDrawing(width: number, rows: LastingRow[], wanted: number) {
  const left = 112;
  const right = 46;
  const row = 20;
  const top = 16;
  const known = rows.map((each) => each.days ?? 0);
  const end = Math.max(wanted * 1.25, ...known.map((days) => Math.min(days, wanted * 3)));
  const scale = (days: number) => ((width - left - right) * Math.min(days, end)) / end;
  let body = "";
  rows.forEach((each, index) => {
    const y = top + index * row;
    body += svgText(left - 6, y + 10, each.label, { anchor: "end", bold: true, size: 7.5 });
    body += `<rect x="${left}" y="${y + 2}" width="${round(width - left - right)}" height="11" fill="${C.shade}"/>`;
    if (each.days === null) {
      body += svgText(left + 4, y + 10.5, each.why ?? "not worked out", { size: 7, fill: C.muted });
      return;
    }
    const short = each.days < wanted;
    body += `<rect x="${left}" y="${y + 2}" width="${round(Math.max(1.5, scale(each.days)))}" height="11" fill="${short ? "#ffffff" : C.accent}" stroke="${short ? C.act : C.accent}" stroke-width="${short ? 1.2 : 0.5}"${short ? ' stroke-dasharray="3 1.5"' : ""}/>`;
    const words = `${Math.floor(each.days * 10) / 10} ${each.days === 1 ? "day" : "days"}${each.days > end ? " +" : ""}`;
    body += svgText(Math.min(width - 2, left + scale(each.days) + 4), y + 10.5, words, {
      size: 7,
      bold: true,
      fill: short ? C.act : C.ink,
      anchor: left + scale(each.days) + 4 + wordsWidth(words, 7) > width ? "end" : "start",
    });
  });
  // The days wanted, across every row.
  const x = left + scale(wanted);
  const bottom = top + rows.length * row;
  body += `<path d="M${round(x)},${top - 4} L${round(x)},${bottom + 2}" stroke="${C.ink}" stroke-width="1.2"/>`;
  body += svgText(x, top - 6, `${wanted} days wanted`, { anchor: "middle", size: 7, bold: true });
  const step = end <= 8 ? 1 : end <= 16 ? 2 : end <= 40 ? 5 : 10;
  for (let days = 0; days <= end; days += step) {
    body += `<path d="M${round(left + scale(days))},${bottom} L${round(left + scale(days))},${bottom + 3}" stroke="${C.muted}" stroke-width="0.6"/>`;
    body += svgText(left + scale(days), bottom + 11, String(days), { anchor: "middle", size: 6.5, fill: C.muted });
  }
  body += svgText(width - right, bottom + 11, "days", { anchor: "start", size: 6.5, fill: C.muted });
  body += `<rect x="${left}" y="${bottom + 20}" width="12" height="8" fill="${C.accent}"/>`;
  body += svgText(left + 16, bottom + 27, "lasts the days wanted", { size: 7 });
  body += `<rect x="${left + 112}" y="${bottom + 20}" width="12" height="8" fill="#ffffff" stroke="${C.act}" stroke-width="1.2" stroke-dasharray="3 1.5"/>`;
  body += svgText(left + 128, bottom + 27, "runs out sooner", { size: 7 });
  return drawing(width, bottom + 32, body);
}

// ── Food in a power cut ─────────────────────────────────────────────────────

/** The hours after the power goes off, with when the book's sources say to throw away fridge and freezer food. */
export function powerCutTimeline(
  width: number,
  words: { doors: string; fridge: string; freezer: string; fridgeHours: number; freezerHours: number },
) {
  const left = 8;
  const right = 12;
  const end = words.freezerHours + 6;
  const x = (hours: number) => left + ((width - left - right) * hours) / end;
  const axis = 58;
  let body = "";
  // The line of hours.
  body += `<path d="M${left},${axis} L${width - right},${axis}" stroke="${C.ink}" stroke-width="1.2"/>`;
  body += svgArrowHead(width - right + 4, axis, 0, C.ink, 5);
  for (let hours = 0; hours <= end; hours += 2) {
    const big = hours % 4 === 0;
    body += `<path d="M${round(x(hours))},${axis} L${round(x(hours))},${axis + (big ? 5 : 3)}" stroke="${C.ink}" stroke-width="0.7"/>`;
    if (big) body += svgText(x(hours), axis + 14, String(hours), { anchor: "middle", size: 6.5 });
  }
  body += svgText(width - right, axis + 24, "hours since the power went off", { anchor: "end", size: 6.5, fill: C.muted });
  body += svgText(x(0), axis - 50, "Power off", { size: 7.5, bold: true });
  body += `<path d="M${round(x(0))},${axis - 46} L${round(x(0))},${axis}" stroke="${C.ink}" stroke-width="1"/>`;
  // Doors closed, all the while the power is off.
  body += `<rect x="${round(x(0))}" y="${axis - 12}" width="${round(width - right - x(0))}" height="10" fill="${C.knowSoft}" stroke="${C.know}" stroke-width="0.6"/>`;
  body += svgText(x(words.fridgeHours) + 6, axis - 4.5, `${words.doors}, all the while`, { size: 6.5, fill: C.know, bold: true });
  // The fridge, then the freezer.
  const mark = (hours: number, title: string, line: string, y: number) =>
    `<path d="M${round(x(hours))},${y + 4} L${round(x(hours))},${axis}" stroke="${C.act}" stroke-width="1.4"/>` +
    `<circle cx="${round(x(hours))}" cy="${axis}" r="3" fill="${C.act}"/>` +
    svgText(x(hours) + 4, y, title, { size: 7.5, bold: true, fill: C.act }) +
    svgText(x(hours) + 4, y + 9, line, { size: 7 });
  body += mark(words.fridgeHours, `${words.fridgeHours} hours: the fridge`, words.fridge, axis - 38);
  const freezerAt = x(words.freezerHours) + 4 + wordsWidth(words.freezer, 7) > width ? "end" : "start";
  body +=
    `<path d="M${round(x(words.freezerHours))},${axis - 20} L${round(x(words.freezerHours))},${axis}" stroke="${C.act}" stroke-width="1.4"/>` +
    `<circle cx="${round(x(words.freezerHours))}" cy="${axis}" r="3" fill="${C.act}"/>` +
    svgText(x(words.freezerHours) + (freezerAt === "end" ? -4 : 4), axis - 32, `${words.freezerHours} hours: the freezer`, {
      size: 7.5,
      bold: true,
      fill: C.act,
      anchor: freezerAt,
    }) +
    svgText(x(words.freezerHours) + (freezerAt === "end" ? -4 : 4), axis - 23, words.freezer, { size: 7, anchor: freezerAt });
  return drawing(width, axis + 28, body);
}

// ── How a repeater works ────────────────────────────────────────────────────

/** A repeater from the book's own table, to put its figures on the drawing. */
export interface RepeaterExample {
  callsign: string;
  /** "145.6000 MHz". */
  output: string;
  input: string;
  /** "the tone 77 Hz", "DCS 023", or null when none is listed. */
  tone: string | null;
}

/**
 * The words of the repeater table's key, drawn: your radio sends on the input (with the
 * tone, where one is listed), the repeater hears it and sends it out again on the output,
 * and every radio in range, yours too, listens on the output. Two radios that cannot reach
 * each other direct both reach the repeater on its high ground. Given an example, its own
 * frequencies and tone are written on, as the table above gives them.
 */
export function repeaterHowDrawing(width: number, example: RepeaterExample | null) {
  const ground = 150;
  const peak = 78;
  const height = ground + 18;
  const mid = width / 2;
  const hillFrom = width * 0.27;
  const hillTo = width * 0.73;
  const you = 70;
  const other = width - 70;
  const mastTop = 40;
  const send = C.act;
  const hear = C.know;
  let body = "";
  // The ground, and the hill the repeater stands on (a curve whose top is at `peak`).
  body += `<path d="M${round(hillFrom)},${ground} Q${round(mid)},${round(2 * peak - ground)} ${round(hillTo)},${ground} Z" fill="${C.shade}" stroke="${C.muted}" stroke-width="0.8"/>`;
  body += `<path d="M0,${ground} L${width},${ground}" stroke="${C.muted}" stroke-width="1.2"/>`;
  // The mast: a lattice tower, the aerial at its top, the repeater's box at its foot.
  body += `<path d="M${round(mid - 7)},${peak + 1} L${round(mid)},${mastTop} L${round(mid + 7)},${peak + 1}" fill="none" stroke="${C.ink}" stroke-width="1.3" stroke-linejoin="round"/>`;
  for (const at of [0.25, 0.5, 0.75]) {
    const y = mastTop + (peak - mastTop) * at;
    const half = 7 * at;
    body += `<path d="M${round(mid - half)},${round(y)} L${round(mid + half)},${round(y)}" stroke="${C.ink}" stroke-width="0.7"/>`;
  }
  body += `<path d="M${round(mid)},${mastTop} L${round(mid)},${mastTop - 9}" stroke="${C.ink}" stroke-width="1.4" stroke-linecap="round"/>`;
  body += `<circle cx="${round(mid)}" cy="${mastTop - 9}" r="2" fill="${C.ink}"/>`;
  // The repeater itself, in its box at the mast's foot, wired up the mast to the aerial.
  body += `<path d="M${round(mid)},${peak - 7} L${round(mid + 12)},${peak - 7}" stroke="${C.ink}" stroke-width="0.8"/>`;
  body += `<rect x="${round(mid + 12)}" y="${peak - 13}" width="16" height="11" rx="1.5" fill="${C.paper}" stroke="${C.ink}" stroke-width="1"/>`;
  body += `<circle cx="${round(mid + 16)}" cy="${peak - 7.5}" r="1.2" fill="${C.ink}"/><path d="M${round(mid + 19.5)},${peak - 9.5} L${round(mid + 25)},${peak - 9.5} M${round(mid + 19.5)},${peak - 5.5} L${round(mid + 25)},${peak - 5.5}" stroke="${C.ink}" stroke-width="0.6"/>`;
  body += svgText(mid, 12, example ? `Repeater ${example.callsign}` : "Repeater", { anchor: "middle", bold: true, size: 8 });
  body += svgText(mid, 21, "on high ground", { anchor: "middle", size: 7, fill: C.muted });
  // A handheld at each side.
  const handheld = (x: number) =>
    `<rect x="${round(x - 6)}" y="${ground - 27}" width="12" height="25" rx="2.5" fill="${C.paper}" stroke="${C.ink}" stroke-width="1.2"/>` +
    `<rect x="${round(x - 3.5)}" y="${ground - 23}" width="7" height="6" fill="${C.shade}" stroke="${C.ink}" stroke-width="0.5"/>` +
    `<path d="M${round(x - 3)},${ground - 27} L${round(x - 3)},${ground - 44}" stroke="${C.ink}" stroke-width="1.6" stroke-linecap="round"/>`;
  body += handheld(you) + handheld(other);
  body += svgText(you, ground + 12, "Your radio", { anchor: "middle", bold: true, size: 7.5 });
  body += svgText(other, ground + 12, "Another radio", { anchor: "middle", bold: true, size: 7.5 });
  // Straight across, the hill is in the way: a dotted line to the hill's side on each side.
  const lineY = ground - 14;
  // Where the hill's curve (x linear in t, y = ground − 4·(ground − peak)·t(1 − t)) reaches lineY.
  const t = (1 - Math.sqrt(1 - (4 * (ground - lineY)) / (4 * (ground - peak)))) / 2;
  const leftEdge = hillFrom + (hillTo - hillFrom) * t;
  const rightEdge = hillTo - (hillTo - hillFrom) * t;
  const cross = (x: number) =>
    `<path d="M${round(x - 3.5)},${lineY - 3.5} L${round(x + 3.5)},${lineY + 3.5} M${round(x - 3.5)},${lineY + 3.5} L${round(x + 3.5)},${lineY - 3.5}" stroke="${C.muted}" stroke-width="1.1"/>`;
  body += `<path d="M${you + 9},${lineY} L${round(leftEdge - 5)},${lineY} M${round(rightEdge + 5)},${lineY} L${other - 9},${lineY}" stroke="${C.muted}" stroke-width="1" stroke-dasharray="1.5 2"/>`;
  body += cross(leftEdge - 1) + cross(rightEdge + 1);
  body += svgText(mid, ground - 8, "out of reach of each other direct", { anchor: "middle", size: 6.5, fill: C.muted });
  // 1: up from your radio on the input, a solid line.
  const tip = ground - 46;
  const into: [number, number] = [mid - 9, mastTop - 4];
  body += `<path d="M${you + 1},${tip} L${round(into[0])},${into[1]}" stroke="${send}" stroke-width="1.8"/>`;
  body += svgArrowHead(into[0], into[1], (Math.atan2(into[1] - tip, into[0] - you - 1) * 180) / Math.PI, send, 6);
  // 2: out again on the output, dashed, to the other radio and back down to yours.
  const outOf = (x: number, y: number, toX: number, toY: number) =>
    `<path d="M${round(x)},${round(y)} L${round(toX)},${round(toY)}" stroke="${hear}" stroke-width="1.8" stroke-dasharray="6 3"/>` +
    svgArrowHead(toX, toY, (Math.atan2(toY - y, toX - x) * 180) / Math.PI, hear, 6);
  body += outOf(mid + 9, mastTop + 2, other - 1, tip);
  body += outOf(mid - 9, mastTop + 8, you + 4, tip + 9);
  // The words, numbered in the order it happens.
  const step = (x: number, y: number, anchor: "start" | "end", number: string, colour: string, title: string, line: string) => {
    // The disc on the outer side, the words inside it, so both blocks read from the page's edge in.
    const discX = anchor === "start" ? x + 5.5 : x - 5.5;
    const textX = anchor === "start" ? x + 14 : x - 14;
    return (
      `<circle cx="${round(discX)}" cy="${y - 2.7}" r="5.5" fill="${colour}"/>` +
      svgText(discX, y, number, { anchor: "middle", bold: true, size: 7, fill: C.paper }) +
      svgText(textX, y, title, { anchor, bold: true, size: 7.5, fill: colour }) +
      svgText(textX, y + 10, line, { anchor, size: 7 })
    );
  };
  const toneWords = example?.tone ? `, with ${example.tone}` : "";
  body += step(
    4,
    40,
    "start",
    "1",
    send,
    "You send on the input",
    example ? `${example.input}${toneWords}` : "with its tone, if it has one",
  );
  body += step(
    width - 4,
    40,
    "end",
    "2",
    hear,
    "It sends it out again on the output",
    example ? `${example.output}: every radio in range listens there` : "every radio in range listens there",
  );
  return drawing(width, height, body);
}
