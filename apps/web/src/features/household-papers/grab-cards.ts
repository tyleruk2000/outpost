/**
 * Grab cards: one for each person, to carry. What a stranger helping them needs, and
 * what they need to find the others: name, medical needs and medicines, allergies,
 * blood group if known, who to contact, where the household meets, how to keep in touch,
 * and where home is in several grid formats.
 *
 * Two sizes, as pages for Outpost's own PDF writer:
 * - wallet: a strip two bank cards tall (85.6 by 54 mm each half) that folds across the
 *   middle, four to a sheet, as the plans' wallet cards are;
 * - A6: one 105 by 148 mm card, two to a sheet of A4 or US Letter turned sideways (two
 *   A6 cards are the whole width of A4, more than a printer reaches), with corner marks.
 *
 * Black on white. A number is never broken across lines. What does not fit at the
 * smallest size is said (`overflow`), never silently dropped.
 */
import { formatDecimal, formatDms, formatOsGridRef, type GridFormat, toMaidenhead } from "@outpost/shared";
import { CARD_HEIGHT, CARD_WIDTH, type CardPaper, Column, cropMarks, dashed, shift } from "@/features/emergency-plans/cards";
import { PAPERS, PT_PER_MM } from "@/features/maps/print/paper";
import { INK, MUTED, type Sheet, type SheetItem } from "@/features/maps/print/sheet";
import { appLocale } from "@/lib/region";

export type GrabCardSize = "wallet" | "a6";
export const A6_WIDTH = 105 * PT_PER_MM;
export const A6_HEIGHT = 148 * PT_PER_MM;

export interface GrabPerson {
  name: string;
  bloodGroup: string;
  allergies: string[];
  /** Conditions, and anything else medical. */
  needs: string[];
  medicines: string[];
  /** Next of kin and the GP: "Mum, 07700 900123". */
  contacts: Array<{ label: string; phone: string }>;
  /** True when the person has an encrypted sheet that is not open on this device: the card has no medical lines. */
  sheetLocked: boolean;
}

export interface GrabHousehold {
  emergencyNumber: string;
  /** People to call, first the out-of-area one if any. */
  contacts: Array<{ label: string; phone: string }>;
  /** "If the home cannot be used: Number 12's porch". */
  places: string[];
  /** The first steps of the communication plan: "Phones down: phone, then mesh, then PMR446 channel 3 on the hour". */
  comms: string[];
  /**
   * A fixed household's home: its address as the household wrote it (printed first, as a stranger reads it), then
   * its position. A portable household has none on its cards: `travelling` says who and what instead.
   */
  home: { name: string; lat: number; lon: number; address?: string } | null;
  /** Each person's own line from the plans ("Fetch Sam from school"), by name. */
  remember?: Record<string, string[]>;
  /** A household that moves: its name, its people and its kit, printed where a fixed household's home would be. */
  travelling?: { household: string; people: string[]; kit: string | null } | null;
}

/** Home's position in each chosen format; a grid that does not reach it (British National Grid abroad) is left out. */
export function gridLines(lat: number, lon: number, formats: readonly GridFormat[]): string[] {
  return formats
    .map((format) => {
      if (format === "decimal") return formatDecimal(lat, lon, 5);
      if (format === "dms") return formatDms(lat, lon, 0);
      if (format === "osgb") {
        const reference = formatOsGridRef(lat, lon, 10);
        return reference ? `OS grid ${reference}` : null;
      }
      const locator = toMaidenhead(lat, lon, 8);
      return locator ? `Locator ${locator}` : null;
    })
    .filter((line): line is string => line !== null);
}

export interface GrabCard {
  person: GrabPerson;
  items: SheetItem[];
  overflow: boolean;
}

const shortDate = (date: Date) => new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric" }).format(date);

function write(
  front: Column,
  back: Column,
  person: GrabPerson,
  household: GrabHousehold,
  formats: readonly GridFormat[],
  made: Date,
  size: number,
) {
  front.text("In an emergency", size + 3, { bold: true });
  front.text(person.name || "Name not given", size + 1.5, { bold: true, gap: 2 });
  front.number("emergency services", household.emergencyNumber.trim() || "not given", size + 2);
  for (const line of household.remember?.[person.name] ?? []) front.text(`Remember: ${line}`, size, { gap: 2 });
  if (person.sheetLocked) front.text("Medical sheet kept encrypted: not on this card.", size * 0.85, { color: MUTED, gap: 2 });
  else {
    front.text(`Blood group: ${person.bloodGroup || "not known"}`, size, { gap: 2 });
    if (person.allergies.length > 0) {
      front.text("Allergies", size * 0.85, { color: MUTED, gap: 2 });
      front.text(person.allergies.join("; "), size, { bold: true });
    }
    if (person.needs.length > 0) {
      front.text("Medical", size * 0.85, { color: MUTED, gap: 2 });
      front.text(person.needs.join("; "), size);
    }
    if (person.medicines.length > 0) {
      front.text("Medicines", size * 0.85, { color: MUTED, gap: 2 });
      front.text(person.medicines.join("; "), size);
    }
  }
  const calls = [...person.contacts, ...household.contacts].filter((entry) => entry.phone).slice(0, 4);
  if (calls.length > 0) {
    back.text("Who to contact", size * 0.85, { color: MUTED });
    for (const entry of calls) back.number(entry.label, entry.phone, size + 0.5);
  }
  if (household.places.length > 0) {
    back.text("Where we meet", size * 0.85, { color: MUTED, gap: 2 });
    for (const place of household.places.slice(0, 3)) back.text(place, size);
  }
  if (household.comms.length > 0) {
    back.text("Keeping in touch", size * 0.85, { color: MUTED, gap: 2 });
    for (const line of household.comms.slice(0, 2)) back.text(line, size);
  }
  if (household.home) {
    back.text(`Home: ${household.home.name}`, size * 0.85, { color: MUTED, gap: 2 });
    for (const line of (household.home.address ?? "").split("\n").filter(Boolean)) back.text(line, size, { bold: true });
    for (const line of gridLines(household.home.lat, household.home.lon, formats)) back.text(line, size, { bold: false });
  }
  if (household.travelling) {
    back.text(`Travelling with ${household.travelling.household}`, size * 0.85, { color: MUTED, gap: 2 });
    if (household.travelling.people.length > 0) back.text(household.travelling.people.join(", "), size);
    if (household.travelling.kit) back.text(`Kit: ${household.travelling.kit}`, size);
  }
  back.text(`Made ${shortDate(made)} in Outpost. Our own plan: follow official warnings.`, size * 0.7, { color: MUTED, gap: 2 });
}

/** One card, top-left at 0,0. A wallet card is two panels, one above the other; an A6 card is one panel with the back below the front. */
export function grabCard(
  person: GrabPerson,
  household: GrabHousehold,
  options: { size: GrabCardSize; formats: readonly GridFormat[]; made: Date },
): GrabCard {
  const pad = options.size === "wallet" ? 9 : 14;
  const width = (options.size === "wallet" ? CARD_WIDTH : A6_WIDTH) - 2 * pad;
  const sizes = options.size === "wallet" ? [9, 8, 7.5, 7, 6.5, 6, 5.5] : [11, 10, 9, 8, 7.5, 7, 6.5];
  for (const size of sizes) {
    let front: Column;
    let back: Column;
    if (options.size === "wallet") {
      front = new Column(pad, pad - 2, width, CARD_HEIGHT - pad);
      back = new Column(pad, CARD_HEIGHT + pad - 2, width, 2 * CARD_HEIGHT - pad);
      write(front, back, person, household, options.formats, options.made, size);
    } else {
      // One panel: the back carries on under the front.
      front = new Column(pad, pad - 2, width, A6_HEIGHT - pad);
      write(front, front, person, household, options.formats, options.made, size);
      back = front;
    }
    const overflow = front.overflow || back.overflow;
    const items = back === front ? front.items : [...front.items, ...back.items];
    if (!overflow || size === sizes.at(-1)) return { person, items, overflow };
  }
  throw new Error("unreachable");
}

/** The cards laid out on sheets of paper, with marks to cut along. */
export function grabSheets(
  people: GrabPerson[],
  household: GrabHousehold,
  options: { size: GrabCardSize; formats: readonly GridFormat[]; made: Date; paper: CardPaper },
): { pages: Sheet[]; cards: GrabCard[] } {
  const wallet = options.size === "wallet";
  const sheet = PAPERS[options.paper];
  // A6 cards go on the sheet turned sideways: two across, one down.
  const pageWidth = wallet ? sheet.width : sheet.height;
  const pageHeight = wallet ? sheet.height : sheet.width;
  const cards = people.map((person) => grabCard(person, household, options));
  const cardWidth = wallet ? CARD_WIDTH : A6_WIDTH;
  const cardHeight = wallet ? 2 * CARD_HEIGHT : A6_HEIGHT;
  const gapX = (wallet ? 12 : 6) * PT_PER_MM;
  const gapY = (wallet ? 14 : 6) * PT_PER_MM;
  const top = wallet ? 60 : 50;
  const down = Math.max(1, Math.floor((pageHeight - top - 30 + gapY) / (cardHeight + gapY)));
  const perPage = 2 * down;
  const left = (pageWidth - 2 * cardWidth - gapX) / 2;
  const pages: Sheet[] = [];
  for (let start = 0; start < Math.max(1, cards.length); start += perPage) {
    const items: SheetItem[] = [
      {
        kind: "text",
        x: left,
        y: 26,
        text: wallet ? "Grab cards, wallet size" : "Grab cards, A6",
        size: 12,
        bold: true,
        color: INK,
        fit: pageWidth - 2 * left,
      },
      {
        kind: "text",
        x: left,
        y: 40,
        text: wallet
          ? "Cut along the corner marks, fold along the broken line, inside to inside. Print at actual size (100%)."
          : "Cut along the corner marks. Print at actual size (100%).",
        size: 8,
        color: MUTED,
        fit: pageWidth - 2 * left,
      },
    ];
    cards.slice(start, start + perPage).forEach((card, index) => {
      const x = left + (index % 2) * (cardWidth + gapX);
      const y = top + Math.floor(index / 2) * (cardHeight + gapY);
      items.push(...cropMarks(x, y, cardWidth, cardHeight));
      if (wallet) items.push(...dashed(x, y + CARD_HEIGHT, x + CARD_WIDTH));
      items.push({ kind: "rect", x, y, width: cardWidth, height: cardHeight, stroke: [0.85, 0.85, 0.85], lineWidth: 0.3 });
      for (const item of card.items) items.push(shift(item, x, y));
    });
    pages.push({ width: pageWidth, height: pageHeight, items });
  }
  return { pages, cards };
}
