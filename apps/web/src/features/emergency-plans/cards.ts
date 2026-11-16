/**
 * A plan's printable emergency cards, as pages for Outpost's own PDF writer:
 *
 * - wallet cards, one per person: a strip two bank cards tall that folds across the
 *   middle to the size of a bank card (85.6 by 54 mm), four to a sheet of A4 or US
 *   Letter, with marks to cut along at the corners and a broken line to fold along;
 * - the fridge sheet: the steps for during and after, the numbers and the places to
 *   meet, on one page, in type large enough to read at arm's length;
 * - the grab list: what to take if leaving, with a box to tick for each.
 *
 * Black on white, so that a copy in grey reads the same. A phone number is never
 * broken across lines: one too long for its room is set smaller. A name in letters the
 * PDF's typefaces lack is drawn by the browser as a picture with the words hidden over
 * it, for search (maps/print/lettering.ts), exactly as on the contacts' emergency sheet.
 */
import { planCaveat } from "@outpost/shared";
import { measure, wrapLine } from "@/features/contacts/emergency-document";
import { PAPERS, PT_PER_MM } from "@/features/maps/print/paper";
import { INK, MUTED, type Rgb, type Sheet, type SheetItem } from "@/features/maps/print/sheet";
import type { Readable, ReadContact, ReadPerson } from "./printable";

export type CardPaper = "a4" | "letter";

const GREY: Rgb = [0.55, 0.55, 0.55];
export const CARD_WIDTH = 85.6 * PT_PER_MM;
export const CARD_HEIGHT = 53.98 * PT_PER_MM;

const shortDate = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);

/** Text placed with a baseline, at a size that fits `width` without breaking: for a number. */
function unbroken(text: string, x: number, y: number, size: number, width: number, bold = true): SheetItem {
  const fitted = Math.max(5, Math.min(size, (size * width) / Math.max(1, measure(text, size, bold))));
  return { kind: "text", x, y, text, size: fitted, bold, color: INK, fit: width };
}

function dashed(x1: number, y: number, x2: number, color: Rgb = GREY): SheetItem[] {
  const out: SheetItem[] = [];
  for (let x = x1; x < x2; x += 6) out.push({ kind: "line", x1: x, y1: y, x2: Math.min(x + 3, x2), y2: y, color, width: 0.5 });
  return out;
}

/** Marks to cut along, at the four corners of a box, outside it. */
function cropMarks(x: number, y: number, width: number, height: number): SheetItem[] {
  const gap = 3;
  const length = 9;
  const items: SheetItem[] = [];
  for (const [cx, sx] of [
    [x, -1],
    [x + width, 1],
  ] as const)
    for (const [cy, sy] of [
      [y, -1],
      [y + height, 1],
    ] as const) {
      items.push({ kind: "line", x1: cx + sx * gap, y1: cy, x2: cx + sx * (gap + length), y2: cy, color: INK, width: 0.4 });
      items.push({ kind: "line", x1: cx, y1: cy + sy * gap, x2: cx, y2: cy + sy * (gap + length), color: INK, width: 0.4 });
    }
  return items;
}

/** Lines of text written down a box from `top`, wrapped to `width`; how far down they went, and whether they all fitted above `bottom`. */
class Column {
  items: SheetItem[] = [];
  overflow = false;
  x: number;
  y: number;
  width: number;
  bottom: number;
  constructor(x: number, top: number, width: number, bottom: number) {
    this.x = x;
    this.y = top;
    this.width = width;
    this.bottom = bottom;
  }
  text(words: string, size: number, options: { bold?: boolean; color?: Rgb; gap?: number } = {}) {
    for (const line of wrapLine(words, size, this.width, options.bold)) {
      this.y += size * 1.22 + (options.gap ?? 0);
      options.gap = 0;
      if (this.y > this.bottom) {
        this.overflow = true;
        return;
      }
      this.items.push({
        kind: "text",
        x: this.x,
        y: this.y,
        text: line,
        size,
        bold: options.bold,
        color: options.color ?? INK,
        fit: this.width,
      });
    }
  }
  /** A label and a number on one line: the number never broken. */
  number(label: string, value: string, size: number) {
    this.y += size * 1.3;
    if (this.y > this.bottom) {
      this.overflow = true;
      return;
    }
    const labelWidth = label ? Math.min(this.width * 0.45, measure(`${label} `, size * 0.85) + 2) : 0;
    if (label) this.items.push({ kind: "text", x: this.x, y: this.y, text: label, size: size * 0.85, color: MUTED, fit: labelWidth - 2 });
    this.items.push(unbroken(value, this.x + labelWidth, this.y, size, this.width - labelWidth));
  }
  space(points: number) {
    this.y += points;
  }
}

// ── Wallet cards ─────────────────────────────────────────────────────────────

export interface WalletCard {
  person: ReadPerson;
  /** The front and the inside, each the size of a bank card. */
  front: SheetItem[];
  inside: SheetItem[];
  /** Something did not fit even at the smallest size: the screen says so. */
  overflow: boolean;
}

const callable = (contacts: ReadContact[]) => contacts.filter((contact) => !contact.missing && contact.numbers.length > 0);

/** One person's card, laid out with its top-left at 0,0 (the front) and 0,CARD_HEIGHT (the inside). */
export function walletCard(plan: Readable, person: ReadPerson, made: Date): WalletCard {
  const pad = 9;
  const width = CARD_WIDTH - 2 * pad;
  // Tried at a size, then smaller, until it fits.
  for (const size of [10, 9, 8, 7.5, 7, 6.5, 6]) {
    const front = new Column(pad, pad - 2, width, CARD_HEIGHT - pad);
    front.text("In an emergency", size + 3, { bold: true });
    front.text(person.name || "Name not given", size + 1.5, { bold: true, gap: 2 });
    for (const phone of person.numbers.slice(0, 1)) front.number("my number", phone.value, size + 1);
    if (person.medical.trim()) {
      front.text("Medical", size * 0.85, { color: MUTED, gap: 2 });
      front.text(person.medical.trim(), size);
    }
    front.number("emergency services", plan.emergencyNumber, size + 2);
    front.text(`${plan.name}, made ${shortDate(made)}. Our own plan: follow official warnings.`, size * 0.75, { color: MUTED, gap: 1 });

    const inside = new Column(pad, CARD_HEIGHT + pad - 2, width, 2 * CARD_HEIGHT - pad);
    const contacts = callable(plan.contacts);
    const away = contacts.find((contact) => contact.outOfArea);
    const call = contacts.filter((contact) => contact !== away).slice(0, away ? 2 : 3);
    if (call.length > 0) {
      inside.text("Who to call", size * 0.85, { color: MUTED });
      for (const contact of call) inside.number(contact.name, contact.numbers[0]!.value, size + 0.5);
    }
    if (away) {
      inside.text("Out-of-area contact", size * 0.85, { color: MUTED, gap: 2 });
      inside.number(away.name, away.numbers[0]!.value, size + 0.5);
    }
    const places = plan.places.filter((place) => place.role !== "Another place" && !place.missing).slice(0, 2);
    if (places.length > 0) {
      inside.text("Where we meet", size * 0.85, { color: MUTED, gap: 2 });
      for (const place of places) inside.text(`${place.role.replace(/^If /, "if ")}: ${place.name}`, size);
    }
    if (!front.overflow && !inside.overflow) return { person, front: front.items, inside: inside.items, overflow: false };
    if (size === 6) return { person, front: front.items, inside: inside.items, overflow: true };
  }
  throw new Error("unreachable");
}

/** The cards four to a sheet, two across and two down, each a strip two cards tall that folds across its middle. */
export function walletSheets(
  plan: Readable,
  people: ReadPerson[],
  options: { made: Date; paper: CardPaper },
): { pages: Sheet[]; cards: WalletCard[] } {
  const { width: pageWidth, height: pageHeight } = PAPERS[options.paper];
  const gapX = 12 * PT_PER_MM;
  const gapY = 14 * PT_PER_MM;
  const left = (pageWidth - 2 * CARD_WIDTH - gapX) / 2;
  const top = 60;
  const cards = people.map((person) => walletCard(plan, person, options.made));
  const pages: Sheet[] = [];
  for (let start = 0; start < Math.max(1, cards.length); start += 4) {
    const items: SheetItem[] = [
      { kind: "text", x: left, y: 30, text: `Wallet cards: ${plan.name}`, size: 12, bold: true, color: INK, fit: pageWidth - 2 * left },
      {
        kind: "text",
        x: left,
        y: 44,
        text: "Cut along the corner marks, fold along the broken line, inside to inside. Print at actual size (100%).",
        size: 8,
        color: MUTED,
        fit: pageWidth - 2 * left,
      },
    ];
    cards.slice(start, start + 4).forEach((card, index) => {
      const x = left + (index % 2) * (CARD_WIDTH + gapX);
      const y = top + Math.floor(index / 2) * (2 * CARD_HEIGHT + gapY);
      items.push(...cropMarks(x, y, CARD_WIDTH, 2 * CARD_HEIGHT));
      items.push(...dashed(x, y + CARD_HEIGHT, x + CARD_WIDTH));
      items.push({ kind: "rect", x, y, width: CARD_WIDTH, height: 2 * CARD_HEIGHT, stroke: [0.85, 0.85, 0.85], lineWidth: 0.3 });
      for (const item of [...card.front, ...card.inside]) items.push(shift(item, x, y));
    });
    items.push({
      kind: "text",
      x: left,
      y: pageHeight - 24,
      text: planCaveat(plan.emergencyNumber),
      size: 7,
      color: MUTED,
      fit: pageWidth - 2 * left,
    });
    pages.push({ width: pageWidth, height: pageHeight, items });
  }
  return { pages, cards };
}

function shift(item: SheetItem, dx: number, dy: number): SheetItem {
  switch (item.kind) {
    case "text":
    case "image":
    case "rect":
      return { ...item, x: item.x + dx, y: item.y + dy };
    case "line":
      return { ...item, x1: item.x1 + dx, x2: item.x2 + dx, y1: item.y1 + dy, y2: item.y2 + dy };
    case "polygon":
      return { ...item, points: item.points.map(([px, py]) => [px + dx, py + dy] as const) };
  }
}

// ── The fridge sheet ─────────────────────────────────────────────────────────

const MARGIN = 40;

/** Words for the footer of every page. */
const footer = (title: string, made: Date) =>
  `${title}, made ${shortDate(made)} in Outpost. A printed copy does not change when the plan does.`;

/**
 * The plan on one page: the emergency number, the steps for during and after, the
 * numbers to call and the places to meet. Set as large as it will go and still fit
 * (from 20 point for the steps down to 11); past that it runs on to a second page, and
 * says so (`pages` > 1).
 */
export function fridgeSheets(plan: Readable, options: { made: Date; paper: CardPaper }): Sheet[] {
  const { width: pageWidth, height: pageHeight } = PAPERS[options.paper];
  const inner = pageWidth - 2 * MARGIN;
  const bottom = pageHeight - MARGIN - 18;
  const build = (size: number, allowMore: boolean): { pages: SheetItem[][]; overflow: boolean } => {
    const pages: SheetItem[][] = [[]];
    let y = MARGIN;
    let overflow = false;
    const room = (needed: number) => {
      if (y + needed <= bottom) return true;
      overflow = true;
      if (!allowMore) return false;
      pages.push([]);
      y = MARGIN;
      return true;
    };
    const put = (item: SheetItem) => pages[pages.length - 1]!.push(item);
    const para = (words: string, at: number, options: { bold?: boolean; color?: Rgb; x?: number; width?: number } = {}) => {
      for (const line of wrapLine(words, at, options.width ?? inner, options.bold)) {
        if (!room(at * 1.25)) return;
        y += at * 1.25;
        put({
          kind: "text",
          x: options.x ?? MARGIN,
          y,
          text: line,
          size: at,
          bold: options.bold,
          color: options.color ?? INK,
          fit: options.width ?? inner,
        });
      }
    };
    const heading = (words: string) => {
      y += size * 0.5;
      para(words, size * 0.8, { bold: true, color: MUTED });
    };
    para(plan.name, size * 1.3, { bold: true });
    if (room(size * 2)) {
      y += size * 1.9;
      put({ kind: "text", x: MARGIN, y, text: "Emergency services", size: size * 0.9, color: INK });
      put(unbroken(plan.emergencyNumber, MARGIN + measure("Emergency services  ", size * 0.9), y, size * 1.6, inner / 2));
    }
    for (const phase of ["during", "after"] as const) {
      const steps = plan.steps.filter((step) => step.phase === phase);
      if (steps.length === 0) continue;
      heading(phase === "during" ? "During" : "After");
      steps.forEach((step, index) => {
        const mark = `${index + 1}.`;
        const indent = measure("00. ", size);
        const lines = wrapLine(step.text, size, inner - indent);
        lines.forEach((line, at) => {
          if (!room(size * 1.25)) return;
          y += size * 1.25;
          if (at === 0) put({ kind: "text", x: MARGIN, y, text: mark, size, bold: true, color: INK });
          put({ kind: "text", x: MARGIN + indent, y, text: line, size, color: INK, fit: inner - indent });
        });
        y += size * 0.2;
      });
    }
    const contacts = plan.contacts.filter((contact) => contact.numbers.length > 0 || contact.missing);
    if (contacts.length > 0) {
      heading("Who to call, in this order");
      for (const contact of contacts) {
        const name = `${contact.name}${contact.outOfArea ? " (out of area)" : ""}`;
        const nameWidth = inner * 0.5;
        if (contact.missing) {
          para(`${name}: no longer in Contacts`, size * 0.85, { color: MUTED });
          continue;
        }
        const nameLines = wrapLine(name, size * 0.9, nameWidth - 8);
        contact.numbers.slice(0, 2).forEach((phone, index) => {
          if (!room(size * 1.35)) return;
          y += size * 1.35;
          const first = nameLines[0];
          if (index === 0 && first) put({ kind: "text", x: MARGIN, y, text: first, size: size * 0.9, color: INK, fit: nameWidth - 8 });
          put(unbroken(phone.value, MARGIN + nameWidth, y, size * 1.05, inner - nameWidth));
        });
        if (contact.note.trim()) para(contact.note.trim(), size * 0.7, { color: MUTED });
      }
    }
    const places = plan.places;
    if (places.length > 0) {
      heading("Where we meet");
      for (const place of places) {
        para(`${place.role}: ${place.name}${place.missing ? " (no longer on the map)" : ""}`, size * 0.9);
        const detail = [place.note.trim(), place.coords].filter(Boolean).join(". ");
        if (detail) para(detail, size * 0.7, { color: MUTED });
      }
    }
    if (plan.comms.length > 0) {
      heading("If the phones fail");
      for (const line of plan.comms) para(line, size * 0.8);
    }
    y += size * 0.6;
    para(planCaveat(plan.emergencyNumber), Math.max(8, size * 0.55), { color: MUTED });
    for (const line of plan.attributions) para(line, 7, { color: MUTED });
    return { pages, overflow };
  };
  let chosen = build(11, true);
  for (const size of [20, 18, 16, 15, 14, 13, 12, 11]) {
    const tried = build(size, false);
    if (!tried.overflow) {
      chosen = tried;
      break;
    }
  }
  return paged(chosen.pages, pageWidth, pageHeight, footer("Fridge sheet", options.made));
}

function paged(pages: SheetItem[][], width: number, height: number, foot: string): Sheet[] {
  return pages.map((items, index) => ({
    width,
    height,
    items: [
      ...items,
      { kind: "line", x1: MARGIN, y1: height - MARGIN - 4, x2: width - MARGIN, y2: height - MARGIN - 4, color: MUTED, width: 0.4 },
      { kind: "text", x: MARGIN, y: height - MARGIN + 8, text: foot, size: 7, color: MUTED, fit: width - 2 * MARGIN - 60 },
      {
        kind: "text",
        x: width - MARGIN,
        y: height - MARGIN + 8,
        text: `Page ${index + 1} of ${pages.length}`,
        size: 7,
        color: MUTED,
        anchor: "end",
      },
    ],
  }));
}

// ── The grab list ────────────────────────────────────────────────────────────

/** What to take if leaving: each of the plan's supplies with its amount for the household, and a box to tick. */
export function grabSheets(plan: Readable, options: { made: Date; paper: CardPaper }): Sheet[] {
  const { width: pageWidth, height: pageHeight } = PAPERS[options.paper];
  const inner = pageWidth - 2 * MARGIN;
  const bottom = pageHeight - MARGIN - 18;
  const pages: SheetItem[][] = [[]];
  let y = MARGIN;
  const put = (item: SheetItem) => pages[pages.length - 1]!.push(item);
  const next = (height: number) => {
    if (y + height > bottom) {
      pages.push([]);
      y = MARGIN;
    }
    y += height;
  };
  for (const line of wrapLine(`Grab list: ${plan.name}`, 20, inner, true)) {
    next(24);
    put({ kind: "text", x: MARGIN, y, text: line, size: 20, bold: true, color: INK, fit: inner });
  }
  next(16);
  put({
    kind: "text",
    x: MARGIN,
    y,
    text: "What to take if we have to leave. Tick each as it goes in the bag.",
    size: 11,
    color: MUTED,
    fit: inner,
  });
  y += 8;
  const size = 14;
  const box = 11;
  const amountWidth = inner * 0.3;
  for (const supply of plan.supplies) {
    const lines = wrapLine(supply.name, size, inner - box - 12 - amountWidth - 8);
    next(size * 1.6);
    put({ kind: "rect", x: MARGIN, y: y - box + 1, width: box, height: box, stroke: INK, lineWidth: 0.8 });
    lines.forEach((line, index) => {
      if (index > 0) next(size * 1.25);
      put({ kind: "text", x: MARGIN + box + 10, y, text: line, size, color: INK, fit: inner - box - 12 - amountWidth - 8 });
    });
    if (supply.amount)
      put({ kind: "text", x: MARGIN + inner, y, text: supply.amount, size: size * 0.85, color: MUTED, anchor: "end", fit: amountWidth });
    put({ kind: "line", x1: MARGIN, y1: y + 6, x2: MARGIN + inner, y2: y + 6, color: [0.8, 0.8, 0.8], width: 0.4 });
  }
  if (plan.supplies.length === 0) {
    next(16);
    put({ kind: "text", x: MARGIN, y, text: "This plan lists no supplies yet.", size: 12, color: INK, fit: inner });
  }
  next(26);
  put({ kind: "text", x: MARGIN, y, text: "Emergency services", size: 11, color: INK });
  put(unbroken(plan.emergencyNumber, MARGIN + measure("Emergency services  ", 11), y, 16, inner / 2));
  for (const words of [planCaveat(plan.emergencyNumber), ...plan.attributions])
    for (const line of wrapLine(words, 8, inner)) {
      next(11);
      put({ kind: "text", x: MARGIN, y, text: line, size: 8, color: MUTED, fit: inner });
    }
  return paged(pages, pageWidth, pageHeight, footer("Grab list", options.made));
}
