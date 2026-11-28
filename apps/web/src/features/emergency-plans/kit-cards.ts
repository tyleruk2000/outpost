/**
 * A plan's cards laid out with the print kit (features/print-kit): the same three papers
 * as cards.ts, which the household binder still prints the old way.
 *
 * - Wallet cards: each a strip two bank cards tall (85.6 by 53.98 mm a half, exactly as
 *   cards.ts has them) that folds across the middle, four to a sheet, with marks to cut
 *   along. A card is drawn as one picture at its printed size, its words real text in the
 *   kit's typeface, set as large as they will go and still fit.
 * - The fridge sheet: the number to call in a red panel, the steps for during and after in
 *   numbered discs, who to call and where to meet in blue panels; set as large as it can be
 *   and stay on one page.
 * - The grab list: what to take, with the amount and a box to tick for each.
 *
 * Words are measured with the old writer's Helvetica widths (contacts/emergency-document),
 * which are a little wider than the kit's typeface, so that what is found to fit does.
 * Names in other scripts are set in the kit's fallback typefaces (print-kit/fallback.ts),
 * inside the card drawings too. Pure: a plan in, a document out.
 */
import { planCaveat } from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { measure, wrapLine } from "@/features/contacts/emergency-document";
import {
  PRINT_COLOURS as C,
  callout,
  type Drawing,
  drawing,
  label,
  note,
  PRINT_PAPERS,
  printable,
  printDocument,
  round,
  stepDisc,
  svgArrowHead,
  svgText,
} from "@/features/print-kit";
import { appLocale } from "@/lib/region";
import { CARD_HEIGHT, CARD_WIDTH, type CardPaper } from "./cards";
import type { Readable, ReadContact, ReadPerson } from "./printable";

const shortDate = (date: Date) => new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric" }).format(date);

const footerRight = (made: Date) => `Made ${shortDate(made)} in Outpost · print again after a change`;

/** " · For Caravan" after a heading when there are several households; nothing with one. */
const forHousehold = (plan: Readable) => (plan.household ? ` · For ${printable(plan.household)}` : "");

// ── Wallet cards ─────────────────────────────────────────────────────────────

export interface KitWalletCard {
  person: ReadPerson;
  /** The strip, front above the fold and inside below, CARD_WIDTH by 2 × CARD_HEIGHT points. */
  svg: string;
  /** Something did not fit even at the smallest size: the screen says so. */
  overflow: boolean;
}

const callable = (contacts: ReadContact[]) => contacts.filter((contact) => !contact.missing && contact.numbers.length > 0);

/** Words written down a box, each line at a baseline; how far they went and whether all of them fitted. */
class Writer {
  svg = "";
  overflow = false;
  y: number;
  x: number;
  width: number;
  bottom: number;
  constructor(x: number, top: number, width: number, bottom: number) {
    this.x = x;
    this.y = top;
    this.width = width;
    this.bottom = bottom;
  }
  private room(height: number) {
    if (this.y + height > this.bottom + 0.01) {
      this.overflow = true;
      return false;
    }
    this.y += height;
    return true;
  }
  text(words: string, size: number, options: { bold?: boolean; fill?: string; gap?: number } = {}) {
    if (options.gap) this.y += options.gap;
    for (const line of wrapLine(printable(words), size, this.width, options.bold)) {
      if (!this.room(size * 1.22)) return;
      this.svg += svgText(this.x, this.y, line, { size, bold: options.bold, fill: options.fill ?? C.ink });
    }
  }
  /** A name and a number on one line: the number whole and bold at the right, the name made smaller if it must be to fit beside it. */
  number(name: string, value: string, size: number) {
    const numberSize = Math.max(5, Math.min(size, (size * this.width * 0.62) / Math.max(1, measure(value, size, true))));
    const numberWidth = measure(value, numberSize, true);
    const nameRoom = Math.max(10, this.width - numberWidth - 6);
    const nameSize = name ? Math.max(4.5, Math.min(size * 0.88, (size * 0.88 * nameRoom) / Math.max(1, measure(name, size * 0.88)))) : 0;
    if (!this.room(size * 1.32)) return;
    if (name) this.svg += svgText(this.x, this.y, printable(name), { size: nameSize, fill: C.ink });
    this.svg += svgText(this.x + this.width, this.y, value, { size: numberSize, bold: true, fill: C.ink, anchor: "end" });
  }
  heading(words: string, size: number, colour: string, gap = 0) {
    this.text(words, size * 0.8, { bold: true, fill: colour, gap });
  }
}

/** One person's card, front above the fold and inside below, at its printed size. */
export function kitWalletCard(plan: Readable, person: ReadPerson, made: Date): KitWalletCard {
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const pad = 9;
  const band = 30;
  const inner = W - 2 * pad;
  const number = plan.emergencyNumber.trim() || "not given";
  for (const size of [9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6]) {
    let svg = "";
    // The front: a red band with the number to call, then who this card is for.
    svg += `<rect x="0" y="0" width="${round(W)}" height="${band}" fill="${C.act}"/>`;
    const numberSize = Math.min(20, (20 * inner * 0.45) / Math.max(1, measure(number, 20, true)));
    svg += svgText(pad, 13, "In an emergency", { size: 8.5, bold: true, fill: C.paper });
    svg += svgText(pad, 23.5, "call", { size: 7.5, fill: C.paper });
    svg += svgText(W - pad, 22, number, { size: numberSize, bold: true, fill: C.paper, anchor: "end" });
    const front = new Writer(pad, band + 2, inner, H - pad - 12);
    front.text(person.name || "Name not given", size + 2, { bold: true, gap: 2 });
    for (const phone of person.numbers.slice(0, 1)) front.number("my number", phone.value, size + 0.5);
    if (person.medical.trim()) {
      front.heading("Medical", size, C.act, 2);
      front.text(person.medical.trim(), size);
    }
    // The foot of the front: the plan and the caveat, small and grey, set from the bottom up.
    const owner = plan.household ? `, for ${printable(plan.household)}` : "";
    const foot = wrapLine(`${printable(plan.name)}${owner}, made ${shortDate(made)}. Our own plan: follow official warnings.`, 5.6, inner);
    foot.slice(-2).forEach((line, index, lines) => {
      svg += svgText(pad, H - 5 - (lines.length - 1 - index) * 6.8, line, { size: 5.6, fill: C.muted });
    });
    if (foot.length > 2 || front.y > H - 5 - foot.slice(-2).length * 6.8) front.overflow = true;

    // The inside: who to call, the out-of-area contact, where to meet.
    const inside = new Writer(pad, H + 3, inner, 2 * H - pad);
    const contacts = callable(plan.contacts);
    const away = contacts.find((contact) => contact.outOfArea);
    const call = contacts.filter((contact) => contact !== away).slice(0, away ? 2 : 3);
    if (call.length > 0) {
      inside.heading("Who to call", size, C.know, 1);
      for (const contact of call) inside.number(contact.name, contact.numbers[0]!.value, size + 0.5);
    }
    if (away) {
      inside.heading("Out-of-area contact", size, C.know, 3);
      inside.number(away.name, away.numbers[0]!.value, size + 0.5);
    }
    const places = plan.places.filter((place) => place.role !== "Another place" && !place.missing).slice(0, 2);
    if (places.length > 0) {
      inside.heading("Where we meet", size, C.accent, 3);
      for (const place of places) inside.text(`${place.role.replace(/^If /, "if ")}: ${place.name}`, size);
    }
    if (call.length === 0 && !away && places.length === 0) inside.text("No contacts or places in the plan yet.", size, { fill: C.muted });
    svg += front.svg + inside.svg;
    // A thin band down the inside's left edge, so that the two halves are told apart once folded.
    svg += `<rect x="0" y="${round(H)}" width="3" height="${round(H)}" fill="${C.know}"/>`;
    // The fold, and the card's edge.
    svg += `<line x1="0" y1="${round(H)}" x2="${round(W)}" y2="${round(H)}" stroke="${C.muted}" stroke-width="0.6" stroke-dasharray="3 3"/>`;
    svg += `<rect x="0" y="0" width="${round(W)}" height="${round(2 * H)}" fill="none" stroke="${C.rule}" stroke-width="0.4"/>`;
    const overflow = front.overflow || inside.overflow;
    if (!overflow || size === 6) return { person, svg, overflow };
  }
  throw new Error("unreachable");
}

/** Marks to cut along, at the four corners of a box, outside it. */
function cropMarks(x: number, y: number, width: number, height: number): string {
  const gap = 3;
  const length = 9;
  let out = "";
  for (const [cx, sx] of [
    [x, -1],
    [x + width, 1],
  ] as const)
    for (const [cy, sy] of [
      [y, -1],
      [y + height, 1],
    ] as const)
      out +=
        `<line x1="${round(cx + sx * gap)}" y1="${round(cy)}" x2="${round(cx + sx * (gap + length))}" y2="${round(cy)}" stroke="${C.ink}" stroke-width="0.4"/>` +
        `<line x1="${round(cx)}" y1="${round(cy + sy * gap)}" x2="${round(cx)}" y2="${round(cy + sy * (gap + length))}" stroke="${C.ink}" stroke-width="0.4"/>`;
  return out;
}

/** How a card is made: cut out the strip, fold it along the broken line, printed sides out. */
export function foldDiagram(): Drawing {
  let body = "";
  // 1. The strip as cut, front above the fold.
  body += `<rect x="4" y="4" width="26" height="16" fill="${C.actSoft}" stroke="${C.ink}" stroke-width="0.7"/><rect x="4" y="4" width="26" height="4" fill="${C.act}"/>`;
  body += `<rect x="4" y="20" width="26" height="16" fill="${C.knowSoft}" stroke="${C.ink}" stroke-width="0.7"/>`;
  body += `<line x1="1" y1="20" x2="33" y2="20" stroke="${C.muted}" stroke-width="0.7" stroke-dasharray="2 2"/>`;
  body += svgText(17, 46, "1 Cut out", { anchor: "middle", size: 6.5, bold: true });
  // 2. Fold back along the line.
  body += `<path d="M42,20 L60,20" stroke="${C.muted}" stroke-width="0.8"/>${svgArrowHead(64, 20, 0, C.muted, 4)}`;
  body += `<rect x="72" y="4" width="26" height="16" fill="${C.actSoft}" stroke="${C.ink}" stroke-width="0.7"/><rect x="72" y="4" width="26" height="4" fill="${C.act}"/>`;
  body += `<path d="M98,20 C108,22 108,34 98,36" fill="none" stroke="${C.know}" stroke-width="0.9"/>${svgArrowHead(97, 35.6, 170, C.know, 3.6)}`;
  body += `<path d="M72,20 L98,20" stroke="${C.muted}" stroke-width="0.7" stroke-dasharray="2 2"/>`;
  body += svgText(86, 46, "2 Fold back", { anchor: "middle", size: 6.5, bold: true });
  // 3. A card the size of a bank card, printed on both sides.
  body += `<path d="M114,20 L128,20" stroke="${C.muted}" stroke-width="0.8"/>${svgArrowHead(132, 20, 0, C.muted, 4)}`;
  body += `<rect x="138" y="8" width="26" height="16" rx="1.5" fill="${C.actSoft}" stroke="${C.ink}" stroke-width="0.9"/><rect x="138" y="8" width="26" height="4" fill="${C.act}"/>`;
  body += svgText(151, 46, "3 Wallet size", { anchor: "middle", size: 6.5, bold: true });
  return drawing(178, 50, body);
}

/** The cards four to a sheet, two across and two down, each at its printed size. */
export function walletDocument(
  plan: Readable,
  people: ReadPerson[],
  options: { made: Date; paper: CardPaper },
): { doc: TDocumentDefinitions; cards: KitWalletCard[] } {
  const paper = PRINT_PAPERS[options.paper];
  const gapX = 12 * (72 / 25.4);
  // The room under the cards on US Letter is less than on A4: the gap between rows is as large as each allows.
  const gapY = options.paper === "letter" ? 18 : 14 * (72 / 25.4);
  const left = (paper.width - 2 * CARD_WIDTH - gapX) / 2;
  const top = 110;
  const overhang = 14;
  const cards = people.map((person) => kitWalletCard(plan, person, options.made));
  const fold = foldDiagram();
  const content: Content[] = [];
  for (let start = 0; start < Math.max(1, cards.length); start += 4) {
    const page = cards.slice(start, start + 4);
    let grid = "";
    page.forEach((card, index) => {
      const x = left + (index % 2) * (CARD_WIDTH + gapX);
      const y = overhang + Math.floor(index / 2) * (2 * CARD_HEIGHT + gapY);
      grid += cropMarks(x, y, CARD_WIDTH, 2 * CARD_HEIGHT);
      grid += `<g transform="translate(${round(x)} ${round(y)})">${card.svg}</g>`;
    });
    const height = 2 * overhang + 4 * CARD_HEIGHT + gapY;
    content.push(
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: `Wallet cards · ${printable(plan.name)}${forHousehold(plan)}`, fontSize: 14, bold: true, lineHeight: 1 },
              {
                text: "Cut along the corner marks, fold along the broken line, printed sides out. Print at actual size (100%): each card is then the size of a bank card.",
                fontSize: 7.5,
                color: C.ink,
                margin: [0, 2, 0, 0],
                lineHeight: 1.05,
              },
            ],
          },
          { width: fold.width, svg: fold.svg, height: fold.height },
        ],
        columnGap: 14,
        pageBreak: start > 0 ? "before" : undefined,
      } as Content,
      { svg: drawing(paper.width, height, grid).svg, width: paper.width, height, absolutePosition: { x: 0, y: top - overhang } } as Content,
    );
  }
  const doc = printDocument({
    paper: options.paper,
    title: `Wallet cards, ${plan.name}`,
    made: options.made,
    footerName: `Wallet cards · ${printable(plan.name)}${forHousehold(plan)}`,
    footerRight: footerRight(options.made),
    parts: [{ kind: "plain", content }],
  });
  return { doc, cards };
}

// ── The fridge sheet ─────────────────────────────────────────────────────────

/** Steps in discs, at a size: the disc grows with the words. */
function bigSteps(items: string[], size: number, colour: string): Content {
  const disc = Math.max(14, size * 1.25);
  return {
    stack: items.map((item, index) => ({
      columns: [
        { svg: stepDisc(String(index + 1), colour), width: disc, height: disc, margin: [0, size * 0.05, 0, 0] },
        { text: printable(item), fontSize: size, lineHeight: 1.08, width: "*", margin: [0, size * 0.02, 0, 0] },
      ],
      columnGap: size * 0.55,
      margin: [0, 0, 0, size * 0.36],
      unbreakable: true,
    })),
    margin: [0, 0, 0, 4],
  } as Content;
}

/** How tall the fridge sheet's words come to at a size, roughly and on the generous side: to choose the size. */
function fridgeHeight(plan: Readable, size: number, measureWidth: number): number {
  const line = (points: number) => points * 1.3 * 1.08;
  const disc = Math.max(14, size * 1.25);
  const stepWidth = measureWidth - disc - size * 0.55;
  let height = 22 + 34 + 64; // the kicker and title, the panel with the number, and their spaces
  for (const phase of ["during", "after"] as const) {
    const steps = plan.steps.filter((step) => step.phase === phase);
    if (steps.length === 0) continue;
    height += 22;
    for (const step of steps) height += Math.max(disc, wrapLine(step.text, size, stepWidth).length * line(size)) + size * 0.36;
  }
  const column = (measureWidth - 16) / 2 - 20;
  const small = Math.max(9.5, size * 0.72);
  const contacts = plan.contacts.filter((contact) => contact.numbers.length > 0 || contact.missing);
  let left = contacts.length > 0 ? 30 : 0;
  for (const contact of contacts)
    left +=
      wrapLine(contact.name, small, column).length * line(small) +
      (contact.missing ? 0 : Math.min(2, contact.numbers.length) * line(small * 1.15)) +
      (contact.note.trim() ? wrapLine(contact.note, small * 0.85, column).length * line(small * 0.85) : 0) +
      4;
  let right = plan.places.length > 0 ? 30 : 0;
  for (const place of plan.places)
    right +=
      wrapLine(`${place.role}: ${place.name}`, small, column).length * line(small) +
      wrapLine([place.note, place.coords].filter(Boolean).join(". "), small * 0.85, column).length * line(small * 0.85) +
      4;
  if (plan.comms.length > 0)
    right += 40 + plan.comms.reduce((sum, words) => sum + wrapLine(words, small * 0.9, column).length * line(small * 0.9), 0);
  height += Math.max(left, right) + 10;
  height += 30 + plan.attributions.length * 10;
  // Callouts' borders and insets, and the spaces pdfmake keeps, come to a little more.
  return height * 1.03 + 24;
}

const FRIDGE_SIZES = [17, 16, 15, 14, 13.5, 13, 12.5, 12, 11.5, 11];

/** The size the fridge sheet's steps are set at: the largest that keeps it to one page. */
export function fridgeSize(plan: Readable, paper: CardPaper): number {
  const sheet = PRINT_PAPERS[paper];
  const room = sheet.height - 54 - 54 - 6;
  const width = sheet.width - 96;
  return FRIDGE_SIZES.find((size) => fridgeHeight(plan, size, width) <= room) ?? FRIDGE_SIZES.at(-1)!;
}

/** The plan on one page, as large as it will go: the number, the steps for during and after, who to call and where to meet. */
export function fridgeDocument(plan: Readable, options: { made: Date; paper: CardPaper; size?: number }): TDocumentDefinitions {
  const size = options.size ?? fridgeSize(plan, options.paper);
  const small = Math.max(9.5, size * 0.72);
  const content: Content[] = [
    {
      text: `Fridge sheet · ${printable(plan.kind)}${forHousehold(plan)}`,
      fontSize: 8.5,
      bold: true,
      color: C.accent,
      characterSpacing: 0.4,
    },
    { text: printable(plan.name), fontSize: 22, bold: true, lineHeight: 1.05, margin: [0, 2, 0, 8] },
    callout(
      "act",
      "In an emergency, call",
      { text: plan.emergencyNumber.trim() || "not given", fontSize: 26, bold: true, color: C.act, lineHeight: 1 },
      { keep: true },
    ),
  ];
  for (const phase of ["during", "after"] as const) {
    const steps = plan.steps.filter((step) => step.phase === phase);
    if (steps.length === 0) continue;
    content.push(
      label(phase === "during" ? "During" : "After", phase === "during" ? C.act : C.accent),
      bigSteps(
        steps.map((step) => step.text),
        size,
        phase === "during" ? C.act : C.accent,
      ),
    );
  }
  const contacts = plan.contacts.filter((contact) => contact.numbers.length > 0 || contact.missing);
  const who: Content[] = contacts.map(
    (contact, index) =>
      ({
        stack: [
          {
            text: [
              { text: `${index + 1}  `, bold: true, color: C.know },
              { text: printable(contact.name), bold: true },
              ...(contact.outOfArea ? [{ text: " (out of area)", color: C.muted }] : []),
            ],
            fontSize: small,
          },
          ...(contact.missing
            ? [{ text: "No longer in Contacts", fontSize: small * 0.85, color: C.muted }]
            : contact.numbers.slice(0, 2).map((phone) => ({ text: phone.value, fontSize: small * 1.15, bold: true, noWrap: true }))),
          ...(contact.note.trim() ? [{ text: printable(contact.note.trim()), fontSize: small * 0.85, color: C.muted }] : []),
        ],
        lineHeight: 1.08,
        margin: [0, 0, 0, 4],
        unbreakable: true,
      }) as Content,
  );
  const where: Content[] = plan.places.map(
    (place) =>
      ({
        stack: [
          {
            text: [
              { text: `${printable(place.role)}: `, color: C.muted },
              { text: printable(place.name), bold: true },
              ...(place.missing ? [{ text: " (no longer on the map)", color: C.muted }] : []),
            ],
            fontSize: small,
          },
          ...([place.note.trim(), place.coords].filter(Boolean).length > 0
            ? [{ text: printable([place.note.trim(), place.coords].filter(Boolean).join(". ")), fontSize: small * 0.85, color: C.muted }]
            : []),
        ],
        lineHeight: 1.08,
        margin: [0, 0, 0, 4],
        unbreakable: true,
      }) as Content,
  );
  const right: Content[] = [
    ...(where.length > 0 ? [callout("know", "Where we meet", where)] : []),
    ...(plan.comms.length > 0
      ? [callout("know", "If the phones fail", { stack: plan.comms.map((line) => ({ text: printable(line), fontSize: small * 0.9 })) })]
      : []),
  ];
  const left: Content[] = who.length > 0 ? [callout("know", "Who to call, in this order", who)] : [];
  if (left.length > 0 || right.length > 0)
    content.push({
      columns: [
        { width: "*", stack: left.length > 0 ? left : right },
        { width: "*", stack: left.length > 0 ? right : [] },
      ],
      columnGap: 16,
      margin: [0, 4, 0, 0],
    } as Content);
  content.push(note(planCaveat(plan.emergencyNumber)), ...plan.attributions.map((line) => note(line)));
  return printDocument({
    paper: options.paper,
    title: `Fridge sheet, ${plan.name}`,
    made: options.made,
    footerName: `Fridge sheet · ${printable(plan.name)}${forHousehold(plan)}`,
    footerRight: footerRight(options.made),
    parts: [{ kind: "plain", content }],
  });
}

// ── The grab list ────────────────────────────────────────────────────────────

/** What to take if leaving: each supply with its amount for the household, and a box to tick. */
export function grabDocument(plan: Readable, options: { made: Date; paper: CardPaper }): TDocumentDefinitions {
  const box = { canvas: [{ type: "rect", x: 0, y: 0, w: 11, h: 11, lineWidth: 1, lineColor: C.ink, r: 1.5 }], margin: [0, 2, 0, 0] };
  const content: Content[] = [
    { text: `Grab list · ${printable(plan.kind)}${forHousehold(plan)}`, fontSize: 8.5, bold: true, color: C.accent, characterSpacing: 0.4 },
    { text: printable(plan.name), fontSize: 22, bold: true, lineHeight: 1.05, margin: [0, 2, 0, 4] },
    { text: "What to take if we have to leave. Tick each as it goes in the bag.", fontSize: 11, color: C.muted, margin: [0, 0, 0, 10] },
  ];
  if (plan.supplies.length === 0) content.push({ text: "This plan lists no supplies yet.", fontSize: 12, margin: [0, 0, 0, 10] });
  else
    content.push({
      table: {
        headerRows: 1,
        widths: [16, "*", "auto"],
        dontBreakRows: true,
        body: [
          [
            { text: "", border: [false, false, false, false] },
            { text: "What", bold: true, fontSize: 9, color: C.ink },
            { text: "For us", bold: true, fontSize: 9, color: C.ink, alignment: "right" },
          ],
          ...plan.supplies.map((supply) => [
            box,
            { text: printable(supply.name), fontSize: 13 },
            {
              text: printable(supply.amount),
              fontSize: 11.5,
              bold: true,
              color: C.accent,
              alignment: "right",
              noWrap: true,
              margin: [0, 1.5, 0, 0],
            },
          ]),
        ],
      },
      layout: {
        hLineWidth: (index: number, node: { table: { body: unknown[] } }) =>
          index === 0 || index === node.table.body.length ? 0 : index === 1 ? 0.9 : 0.4,
        vLineWidth: () => 0,
        hLineColor: (index: number) => (index === 1 ? C.muted : C.rule),
        fillColor: (row: number) => (row === 0 ? C.shade : row % 2 === 0 ? C.accentSoft : null),
        paddingLeft: (index: number) => (index === 0 ? 6 : 6),
        paddingRight: () => 6,
        paddingTop: () => 5,
        paddingBottom: () => 5,
      },
      margin: [0, 0, 0, 14],
    } as Content);
  content.push(
    callout(
      "act",
      "In an emergency, call",
      { text: plan.emergencyNumber.trim() || "not given", fontSize: 22, bold: true, color: C.act, lineHeight: 1 },
      { keep: true },
    ),
    note(planCaveat(plan.emergencyNumber)),
    ...plan.attributions.map((line) => note(line)),
  );
  return printDocument({
    paper: options.paper,
    title: `Grab list, ${plan.name}`,
    made: options.made,
    footerName: `Grab list · ${printable(plan.name)}${forHousehold(plan)}`,
    footerRight: footerRight(options.made),
    parts: [{ kind: "plain", content }],
  });
}
