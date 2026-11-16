/**
 * The emergency sheet as pages of a PDF: the same entries as the sheet on screen, in
 * the same order and the same words, laid out by Outpost's own PDF writer.
 *
 * Each entry is a name, the lines under it (title and organisation, the note), and a
 * table of two columns: what each thing is, and the thing. The second column wraps,
 * except for a phone number or a callsign, which is never broken across lines: a
 * number split in two can be read as two numbers. One too long for the column is set
 * smaller instead. An entry is kept on one page unless it is taller than a page.
 *
 * Every value is printed exactly as it is kept. A name, an address or anything else in
 * letters the PDF's typefaces cannot write is drawn as a picture by the browser (see
 * maps/print/lettering.ts), not changed. The sheet says when it was made, because a
 * printed or saved copy does not change when a contact does.
 *
 * Nothing here touches the page or the network: contacts in, pages out.
 */
import { addressLines, type ContactDto } from "@outpost/shared";
import { textWidth } from "@/features/maps/print/helvetica";
import { UNWRITABLE_MARK, writable } from "@/features/maps/print/lettering";
import { PAPERS } from "@/features/maps/print/paper";
import { INK, MUTED, type Rgb, type Sheet, type SheetItem } from "@/features/maps/print/sheet";
import { type ClockStyle, clockText } from "@/lib/clock";
import { plural } from "@/lib/utils";
import { labelOr } from "./contacts-data";

export type SheetPaper = "a4" | "letter";

const MARGIN = 42;
const LABEL = 100;
const RULE: Rgb = [0.6, 0.6, 0.6];

/** One row of an entry's table. */
export interface EntryRow {
  label: string;
  value: string;
  /** A phone number or a callsign: large, bold, and never broken. */
  number?: boolean;
  /** Set in bold before the rest of the value: a frequency before its mode. */
  lead?: string;
  /** Said quietly after the value: a place's coordinates. */
  quiet?: string;
}

export interface Entry {
  name: string;
  lines: string[];
  rows: EntryRow[];
}

/** A contact as the sheet has it: the same rows, in the same order, as the sheet on screen (emergency-sheet.tsx). */
export function entryOf(contact: ContactDto): Entry {
  const lines = [
    contact.kind === "person" ? [contact.title, contact.organisation].filter(Boolean).join(", ") : contact.department,
    contact.emergencyNote,
  ].filter(Boolean);
  const rows: EntryRow[] = [
    ...contact.phones.map((phone) => ({ label: labelOr(phone.label, "phone"), value: phone.value, number: true })),
    ...(contact.callsign ? [{ label: "callsign", value: contact.callsign, number: true }] : []),
    ...contact.channels.map((channel, index) => ({ label: index === 0 ? "radio" : "", lead: channel.frequency, value: channel.mode })),
    ...contact.emails.map((email, index) => ({ label: index === 0 ? "email" : "", value: email.value })),
    ...contact.addresses.map((address) => ({ label: labelOr(address.label, "address"), value: addressLines(address).join(", ") })),
    ...(contact.place
      ? [{ label: "on the map", value: contact.place.name, quiet: `${contact.place.lat.toFixed(5)}, ${contact.place.lon.toFixed(5)}` }]
      : []),
  ];
  return { name: contact.displayName, lines, rows };
}

/** Every piece of text of an entry, as it is printed. */
const entryTexts = (entry: Entry) => [
  entry.name,
  ...entry.lines,
  ...entry.rows.flatMap((row) => [row.label, row.lead ?? "", row.value, row.quiet ?? ""]),
];

/** How many entries hold letters the PDF's typefaces cannot write. */
export const entriesWithUnwritable = (contacts: ContactDto[]): number =>
  contacts.filter((contact) => entryTexts(entryOf(contact)).some((text) => !writable(text))).length;

/**
 * The width of text as the page will have it. Letters the typeface lacks are drawn as
 * pictures in the device's type; a Chinese or Japanese character there is a full em
 * wide, so they are counted as that, and anything else the typeface lacks as an average letter.
 */
function measure(text: string, size: number, bold = false): number {
  let width = 0;
  for (const character of text) {
    if (writable(character)) width += textWidth(character, size, bold);
    else width += (character.codePointAt(0)! >= 0x2e80 ? 1 : 0.6) * size;
  }
  return width;
}

/** Breaks text into lines no wider than `width`, at spaces, and inside a word only where the word is wider than a line. */
export function wrapLine(text: string, size: number, width: number, bold = false): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (word: string) => {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, size, bold) <= width) {
      line = candidate;
      return;
    }
    if (line) lines.push(line);
    line = "";
    // A word wider than the line (a long email address, a name with no spaces) is broken between its characters.
    let piece = "";
    for (const character of word) {
      if (piece && measure(piece + character, size, bold) > width) {
        lines.push(piece);
        piece = "";
      }
      piece += character;
    }
    line = piece;
  };
  for (const word of text.split(/\s+/).filter(Boolean)) push(word);
  if (line) lines.push(line);
  return lines;
}

const longDate = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
const shortDate = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);

/** "16 November 2026 at 14:05": when the sheet was made, on this device's clock. */
export const madeWords = (made: Date, style: ClockStyle) => `${longDate(made)} at ${clockText(made.getHours(), made.getMinutes(), style)}`;

/** What the library calls it. */
export const emergencyTitle = (contacts: ContactDto[], made: Date) =>
  `Emergency sheet, ${plural(contacts.length, "contact")}, made ${shortDate(made)}`;

export interface EmergencyOptions {
  made: Date;
  style: ClockStyle;
  paper?: SheetPaper;
  /** Entries whose letters this device could not draw, which are printed with "[?]". Said at the top when there are any. */
  marked?: number;
}

/** The sheet as pages. */
export function emergencySheets(contacts: ContactDto[], options: EmergencyOptions): Sheet[] {
  const { width: pageWidth, height: pageHeight } = PAPERS[options.paper ?? "a4"];
  const inner = pageWidth - 2 * MARGIN;
  const valueX = MARGIN + LABEL;
  const valueWidth = inner - LABEL;
  const bottom = pageHeight - MARGIN - 16;
  const pages: SheetItem[][] = [[]];
  let y = MARGIN;
  const page = () => pages[pages.length - 1]!;
  const text = (line: string, size: number, at: { x?: number; bold?: boolean; color?: Rgb; fit?: number } = {}) =>
    page().push({
      kind: "text",
      x: at.x ?? MARGIN,
      y,
      text: line,
      size,
      bold: at.bold,
      color: at.color ?? INK,
      fit: at.fit ?? (at.x === undefined ? inner : MARGIN + inner - at.x),
    });
  const para = (words: string, size: number, color: Rgb = INK, leading = size * 1.35) => {
    for (const line of wrapLine(words, size, inner)) {
      y += leading;
      text(line, size, { color });
    }
  };

  for (const line of wrapLine("In an emergency", 20, inner, true)) {
    y += 22;
    text(line, 20, { bold: true });
  }
  y += 4;
  para(`${plural(contacts.length, "contact")}, as kept in Outpost on ${madeWords(options.made, options.style)}.`, 10, MUTED);
  para(
    "These are other people's details. Keep the sheet where those who may need it can find it. A printed or saved copy does not change when a contact does: make it again after a number changes.",
    10,
    MUTED,
  );
  if (options.marked) {
    para(
      `${plural(options.marked, "entry", "entries")} ${options.marked === 1 ? "has" : "have"} letters this device could not put on the page; each place they belong is marked ${UNWRITABLE_MARK}. The Contacts screen in Outpost has them in full.`,
      10,
      INK,
    );
  }
  y += 8;

  /** An entry laid out from `top`: what to draw and how tall it is. */
  const layout = (entry: Entry, top: number): { items: SheetItem[]; height: number } => {
    const items: SheetItem[] = [];
    let at = top;
    const put = (line: string, size: number, x: number, bold?: boolean, color: Rgb = INK, fit = MARGIN + inner - x) =>
      items.push({ kind: "text", x, y: at, text: line, size, bold, color, fit });
    items.push({ kind: "line", x1: MARGIN, y1: at, x2: MARGIN + inner, y2: at, color: RULE, width: 0.75 });
    at += 4;
    for (const line of wrapLine(entry.name, 13, inner, true)) {
      at += 16;
      put(line, 13, MARGIN, true);
    }
    for (const line of entry.lines.flatMap((words) => wrapLine(words, 10, inner))) {
      at += 13.5;
      put(line, 10, MARGIN);
    }
    at += 3;
    for (const row of entry.rows) {
      const labels = row.label ? wrapLine(row.label, 9.5, LABEL - 10) : [];
      let values: Array<{ text: string; size: number; bold?: boolean; color?: Rgb; x?: number }> = [];
      let leading = 14;
      if (row.number) {
        // Never broken: a long one is set smaller to fit the column.
        const size = Math.max(7, Math.min(13, (13 * valueWidth) / Math.max(1, measure(row.value, 13, true))));
        values = [{ text: row.value, size, bold: true }];
        leading = Math.max(14, size * 1.35);
      } else {
        const lead = row.lead ? measure(row.lead, 10.5, true) + 5 : 0;
        const first = row.lead ? wrapLine(row.value, 10.5, Math.max(40, valueWidth - lead)) : [];
        // The mode goes on the frequency's line when it fits there whole; otherwise on the lines below.
        const sameLine = row.lead !== undefined && first.length === 1;
        if (row.lead) values.push({ text: row.lead, size: 10.5, bold: true });
        const rest = sameLine ? [] : wrapLine(row.value, 10.5, valueWidth);
        if (sameLine && row.value) values.push({ text: row.value, size: 10.5, x: valueX + lead });
        values.push(...rest.map((line) => ({ text: line, size: 10.5 })));
        if (row.quiet) values.push({ text: row.quiet, size: 9.5, color: MUTED });
        leading = 14;
      }
      // Lines of a value, each below the last; a value that shares the line before it does not move down.
      const rowTop = at;
      let line = 0;
      let lastY = rowTop;
      for (const value of values) {
        const shares = value.x !== undefined;
        if (!shares) line += 1;
        lastY = rowTop + line * leading;
        items.push({
          kind: "text",
          x: value.x ?? valueX,
          y: lastY,
          text: value.text,
          size: value.size,
          bold: value.bold,
          color: value.color ?? INK,
          fit: MARGIN + inner - (value.x ?? valueX),
        });
      }
      // The label stands on the same baseline as the first line of its value.
      labels.forEach((label, index) => {
        items.push({ kind: "text", x: MARGIN, y: rowTop + leading + index * 12, text: label, size: 9.5, color: MUTED, fit: LABEL - 10 });
      });
      at = Math.max(lastY, labels.length ? rowTop + leading + (labels.length - 1) * 12 : rowTop) + 4;
    }
    at += 6;
    return { items, height: at - top };
  };

  for (const contact of contacts) {
    const entry = entryOf(contact);
    let laid = layout(entry, y);
    if (y + laid.height > bottom && y > MARGIN + 1) {
      pages.push([]);
      y = MARGIN;
      laid = layout(entry, y);
    }
    page().push(...laid.items);
    y += laid.height;
  }

  const footer = `Emergency sheet, made ${madeWords(options.made, options.style)} · Outpost`;
  return pages.map((items, index) => ({
    width: pageWidth,
    height: pageHeight,
    items: [
      ...items,
      {
        kind: "line",
        x1: MARGIN,
        y1: pageHeight - MARGIN - 4,
        x2: pageWidth - MARGIN,
        y2: pageHeight - MARGIN - 4,
        color: MUTED,
        width: 0.4,
      },
      { kind: "text", x: MARGIN, y: pageHeight - MARGIN + 8, text: footer, size: 7, color: MUTED, fit: inner - 60 },
      {
        kind: "text",
        x: pageWidth - MARGIN,
        y: pageHeight - MARGIN + 8,
        text: `Page ${index + 1} of ${pages.length}`,
        size: 7,
        color: MUTED,
        anchor: "end",
      },
    ],
  }));
}
