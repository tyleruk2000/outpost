/**
 * The household's own papers laid out with the print kit (features/print-kit): a person's
 * medical sheet, the communication plan a page a person, and the grab cards at their
 * real size. The household book prints the same sections its own way (household-book/
 * book.ts); the binder (binder.ts) still prints the old pages, from the same words
 * (medical-words.ts, comms-words.ts, grab-cards.ts).
 *
 * Names in any script print: `renderPdf` sets letters the book's typeface lacks in a
 * fallback font, so nothing here is lettered or replaced. Pure: data in, document out.
 */
import {
  type CommsPerson,
  type CommsPlan,
  type CommsResolved,
  type FrequencyEntry,
  type GridFormat,
  MEDICAL_CAVEAT,
  type MedicalRecord,
  PACE_LEVELS,
  type PaceLevel,
} from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { CARD_HEIGHT, CARD_WIDTH, type CardPaper } from "@/features/emergency-plans/cards";
import {
  PRINT_COLOURS as C,
  callout,
  cutCard,
  type Drawing,
  dataTable,
  drawing,
  figure,
  heading,
  label,
  measureOf,
  note,
  para,
  printable,
  printDocument,
  stepDisc,
  svgArrowHead,
  svgText,
} from "@/features/print-kit";
import { appLocale } from "@/lib/region";
import { contactLines, levelLabel, stepText } from "./comms-words";
import { A6_HEIGHT, A6_WIDTH, type GrabCardSize, type GrabHousehold, type GrabPerson, gridLines } from "./grab-cards";
import { type ContactsNow, medicineLeftWords, reach } from "./medical-words";

const shortDate = (date: Date) => new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric" }).format(date);
const madeWords = (made: Date) => `Made ${shortDate(made)} in Outpost`;

/** A paper's head: what it is in the accent, its title large, a grey line under it. */
export function paperTitle(kind: string, title: string, subtitle?: string): Content[] {
  return [
    { text: kind, fontSize: 8.5, bold: true, color: C.accent, characterSpacing: 0.4 },
    { text: printable(title), fontSize: 22, bold: true, lineHeight: 1.05, margin: [0, 2, 0, subtitle ? 3 : 10] },
    ...(subtitle ? [{ text: printable(subtitle), fontSize: 10, color: C.muted, margin: [0, 0, 0, 10] } as Content] : []),
  ] as Content[];
}

/** Words that are a person's own, with no **bold** read into them. */
const plain = (text: string): Content => ({ text: printable(text) });

// ── The medical sheet ───────────────────────────────────────────────────────

/** Large facts side by side in a shaded band: "Blood group O+". */
function factBand(facts: Array<[string, string]>): Content {
  return {
    table: {
      widths: facts.map(() => "*"),
      body: [
        facts.map(([name, value]) => ({
          stack: [
            { text: name, fontSize: 7.5, bold: true, color: C.muted, characterSpacing: 0.3 },
            { text: printable(value), fontSize: 16, bold: true, color: C.ink, margin: [0, 1, 0, 0] },
          ],
        })),
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (index: number) => (index === 0 ? 3 : 0),
      vLineColor: () => C.accent,
      fillColor: () => C.accentSoft,
      paddingLeft: () => 9,
      paddingRight: () => 9,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 10],
  } as Content;
}

/** One person's medical sheet, in the order a paramedic asks: who, allergies, medicines, conditions, who to tell. */
export function medicalSheetDocument(input: {
  name: string;
  record: MedicalRecord;
  contacts: ContactsNow;
  today: string;
  made: Date;
  paper?: CardPaper;
}): TDocumentDefinitions {
  const { name, record, contacts, today, made } = input;
  const content: Content[] = [...paperTitle("Medical sheet", name || "Name not given")];
  content.push(
    factBand([
      ["Blood group", record.bloodGroup.trim() || "Not known"],
      ...(record.born ? ([["Born", record.born]] as Array<[string, string]>) : []),
      ["Allergies", record.allergies.length > 0 ? "Yes, see below" : "None recorded"],
    ]),
  );

  if (record.allergies.length > 0)
    content.push(
      callout(
        "warn",
        "Allergies",
        dataTable(
          ["Allergic to", "What happens"],
          record.allergies.map((line) => [printable(line.what), printable(line.reaction)]),
          { bold: [0] },
        ),
      ),
    );
  else content.push(callout("know", "Allergies", para("None recorded.", 0)));

  content.push(heading("Medicines"));
  content.push(
    record.medicines.length > 0
      ? dataTable(
          ["Medicine", "Dose", "When", "Kept", "Left"],
          record.medicines.map((line) => [line.name, line.dose, line.when, line.keptWhere, medicineLeftWords(line, today) ?? ""]),
          { bold: [0] },
        )
      : para("None recorded."),
  );
  if (record.medicines.some((line) => medicineLeftWords(line, today)))
    content.push(note("What is left is the count typed on the sheet, less a day's use for each day since it was counted."));

  content.push(heading("Conditions"));
  content.push(
    record.conditions.length > 0
      ? dataTable(
          ["Condition", "Note"],
          record.conditions.map((line) => [line.what, line.note]),
          { bold: [0] },
        )
      : para("None recorded."),
  );

  const tell: string[][] = [];
  const add = (who: string, entry: Parameters<typeof reach>[0]) => {
    const now = reach(entry, contacts);
    if (!now.name && !now.phone) return;
    tell.push([who, now.name, now.missing ? "No longer in Contacts" : now.phone]);
  };
  add("Doctor", record.gp);
  add("Pharmacy", record.pharmacy);
  for (const kin of record.nextOfKin) add(kin.relation ? `Next of kin (${kin.relation})` : "Next of kin", kin);
  if (tell.length > 0) {
    content.push(heading("Who to tell"));
    content.push(dataTable(["Who", "Name", "Phone"], tell, { bold: [2] }));
  }
  if (record.notes.trim()) content.push(heading("Notes"), para(plain(record.notes.trim())));
  content.push({ text: "", margin: [0, 6, 0, 0] }, note(MEDICAL_CAVEAT));

  return printDocument({
    paper: input.paper ?? "a4",
    title: `Medical sheet, ${name}`,
    made,
    footerName: `Medical sheet · ${name}`,
    footerRight: `${madeWords(made)} · a printed copy does not change`,
    parts: [{ kind: "plain", content }],
  });
}

// ── Keeping in touch ────────────────────────────────────────────────────────

/** Each PACE level's colour, from Outpost's own to red; its letter tells them apart in grey. */
const LEVEL_COLOUR: Record<PaceLevel, string> = { primary: C.accent, alternate: C.know, contingency: C.warn, emergency: C.act };

/** Words broken into lines of about `longest` characters. */
function wrapWords(words: string, longest: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words.split(/\s+/)) {
    if (line && `${line} ${word}`.length > longest) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The four levels of a PACE plan in the order they are tried, each with what it means
 * (Outpost's own words for them, as the screen gives them), an arrow from one to the next.
 */
export function paceLadder(width: number): Drawing {
  const gap = 16;
  const box = (width - gap * (PACE_LEVELS.length - 1)) / PACE_LEVELS.length;
  const height = 50;
  const parts: string[] = [];
  PACE_LEVELS.forEach((level, index) => {
    const x = index * (box + gap);
    const colour = LEVEL_COLOUR[level.id];
    parts.push(
      `<rect x="${x}" y="1" width="${box}" height="${height - 2}" rx="4" fill="#ffffff" stroke="${colour}" stroke-width="1.2"/>`,
      `<rect x="${x}" y="1" width="${box}" height="17" rx="4" fill="${colour}"/>`,
      `<rect x="${x}" y="12" width="${box}" height="6" fill="${colour}"/>`,
      svgText(x + 7, 13.2, `${level.label[0]}  ${level.label}`, { size: 8.5, bold: true, fill: "#ffffff" }),
    );
    wrapWords(level.about, Math.floor(box / 3.7)).forEach((line, row) => {
      parts.push(svgText(x + 7, 29 + row * 9, line, { size: 7.2, fill: C.ink }));
    });
    if (index < PACE_LEVELS.length - 1) {
      const from = x + box + 2;
      parts.push(
        `<line x1="${from}" y1="${height / 2}" x2="${from + gap - 6}" y2="${height / 2}" stroke="${C.muted}" stroke-width="1"/>`,
        svgArrowHead(from + gap - 3, height / 2, 0, C.muted, 4),
      );
    }
  });
  return drawing(width, height, parts.join(""));
}

/** A step: its level's letter in a disc of its colour, the level and what to do. */
function paceStep(level: PaceLevel, text: string, missing: string | null): Content {
  return {
    columns: [
      { svg: stepDisc(levelLabel(level)[0] ?? "", LEVEL_COLOUR[level]), width: 14, height: 14, margin: [0, 0, 0, 0] },
      {
        width: "*",
        margin: [0, 1.5, 0, 0],
        text: [
          { text: `${levelLabel(level)}  `, bold: true, color: LEVEL_COLOUR[level] === C.warn ? C.warnInk : LEVEL_COLOUR[level] },
          printable(text),
          ...(missing ? [{ text: ` (${missing})`, color: C.muted }] : []),
        ],
      },
    ],
    columnGap: 6,
    margin: [0, 0, 0, 5],
    unbreakable: true,
  } as Content;
}

/** One person's page of the plan (or everyone's, for null). */
export function commsContent(
  plan: CommsPlan,
  resolved: CommsResolved,
  person: CommsPerson | null,
  entries: readonly FrequencyEntry[],
  options: { checkIn: boolean; measure: number },
): Content[] {
  const content: Content[] = [
    ...paperTitle(
      "Keeping in touch",
      person ? `For ${person.name}` : "For everyone",
      "What to try, in order, when the phones are down, and when to check in.",
    ),
  ];
  if (person?.note.trim()) content.push(callout("know", `${printable(person.name)}, remember`, para(plain(person.note.trim()), 0)));
  if (plan.checkIns.trim()) content.push(callout("act", "When we check in", para(plain(plan.checkIns.trim()), 0)));
  content.push(
    figure(paceLadder(options.measure).svg, {
      width: options.measure,
      caption: "Try each in turn: the first that works is the one to use. Each situation below gives its own steps.",
    }),
  );
  for (const situation of plan.situations) {
    const block: Content[] = [heading(printable(situation.name))];
    const ordered = PACE_LEVELS.flatMap((level) => situation.steps.filter((step) => step.level === level.id));
    if (ordered.length === 0) block.push(para("No steps yet."));
    for (const step of ordered) {
      const { text, missing } = stepText(step, resolved, entries);
      block.push(paceStep(step.level, text, missing));
    }
    const who = contactLines(situation.contactIds, resolved);
    const aside: Content[] = [];
    if (situation.checkIn.trim()) aside.push(label("Check in", C.know), para(plain(situation.checkIn.trim())));
    if (who.length > 0)
      aside.push(label("Who to contact, in this order", C.know), {
        ol: who.map((line) => printable(line)),
        margin: [0, 0, 0, 2],
      } as Content);
    if (aside.length > 0) block.push({ stack: aside, margin: [20, 0, 0, 4] } as Content);
    content.push({ stack: block, margin: [0, 0, 0, 4] } as Content);
  }
  if (plan.notes.trim()) content.push(heading("Notes"), para(plain(plan.notes.trim())));
  if (options.checkIn)
    content.push(
      callout("know", "Where Outpost is reachable", para("Send a check-in from its Check-in screen: OK, need help, where you are.", 0)),
    );
  content.push(
    note("Our household's own plan, made in advance. In a real emergency, follow the emergency services and official warnings."),
  );
  return content;
}

/** The plan, a page for each person, or one page for everyone when no one is listed. */
export function commsDocument(input: {
  plan: CommsPlan;
  resolved: CommsResolved;
  people: CommsPerson[];
  entries: readonly FrequencyEntry[];
  checkIn: boolean;
  made: Date;
  paper?: CardPaper;
}): TDocumentDefinitions {
  const paper = input.paper ?? "a4";
  const measure = measureOf(paper);
  const pages: Array<CommsPerson | null> = input.people.length > 0 ? input.people : [null];
  return printDocument({
    paper,
    title: "Keeping in touch",
    made: input.made,
    footerName: "Keeping in touch · our household's own plan",
    footerRight: madeWords(input.made),
    parts: pages.map((person) => ({
      kind: "plain" as const,
      content: commsContent(input.plan, input.resolved, person, input.entries, { checkIn: input.checkIn, measure }),
    })),
  });
}

// ── Grab cards ──────────────────────────────────────────────────────────────

/** A run of words on a card, `scale` times the paragraph's type size. */
interface Run {
  text: string;
  bold?: boolean;
  colour?: string;
  scale?: number;
}

/** A paragraph on a card: its runs, its own scale and colour, the room above it (a share of the type size). */
export interface Piece {
  runs: Run[];
  scale?: number;
  bold?: boolean;
  colour?: string;
  gap?: number;
  lineHeight?: number;
}

/** Each card's pieces: the front (who, the number to call, medical lines) and the back (who to contact, where to meet, home). */
function grabPieces(person: GrabPerson, household: GrabHousehold, options: { formats: readonly GridFormat[]; made: Date }) {
  const small = (text: string, colour: string = C.accent): Piece => ({ runs: [{ text }], scale: 0.82, bold: true, colour, gap: 0.35 });
  const line = (text: string, bold = false): Piece => ({ runs: [{ text: printable(text) }], bold });
  const front: Piece[] = [
    { runs: [{ text: "In an emergency" }], scale: 0.9, bold: true, colour: C.act },
    { runs: [{ text: printable(person.name || "Name not given") }], scale: 1.4, bold: true, lineHeight: 1.05, gap: 0.05 },
    {
      runs: [{ text: "Call " }, { text: household.emergencyNumber || "the emergency services", bold: true, colour: C.act, scale: 1.4 }],
      scale: 1.05,
      gap: 0.1,
    },
    ...(household.remember?.[person.name] ?? []).map((text) => line(`Remember: ${text}`)),
  ];
  if (person.sheetLocked) front.push(small("Medical sheet kept encrypted: not on this card.", C.muted));
  else {
    front.push({
      runs: [
        { text: "Blood group: ", colour: C.muted },
        { text: person.bloodGroup || "not known", bold: true },
      ],
      gap: 0.2,
    });
    if (person.allergies.length > 0) front.push(small("Allergies", C.warnInk), line(person.allergies.join("; "), true));
    if (person.needs.length > 0) front.push(small("Medical"), line(person.needs.join("; ")));
    if (person.medicines.length > 0) front.push(small("Medicines"), line(person.medicines.join("; ")));
  }
  const back: Piece[] = [];
  const calls = [...person.contacts, ...household.contacts].filter((entry) => entry.phone).slice(0, 4);
  if (calls.length > 0)
    back.push(
      small("Who to contact"),
      // A number is never broken across lines.
      ...calls.map((entry) => ({
        runs: [{ text: `${printable(entry.label)}  ` }, { text: entry.phone.replace(/ /g, " "), bold: true, scale: 1.05 }],
      })),
    );
  if (household.places.length > 0) back.push(small("Where we meet"), ...household.places.slice(0, 3).map((place) => line(place)));
  if (household.comms.length > 0) back.push(small("Keeping in touch"), ...household.comms.slice(0, 2).map((text) => line(text)));
  if (household.home) {
    // The address first, as the household wrote it; the position after it, in the formats chosen.
    const address = (household.home.address ?? "").split("\n").filter(Boolean);
    const grid = gridLines(household.home.lat, household.home.lon, options.formats);
    if (address.length > 0 || grid.length > 0) back.push(small(`Home: ${printable(household.home.name)}`));
    if (address.length > 0) back.push(line(address.join("\n"), true));
    if (grid.length > 0) back.push(line(grid.join("\n")));
  }
  back.push({
    runs: [{ text: `${madeWords(options.made)}. Our own plan: follow official warnings.` }],
    scale: 0.68,
    colour: C.muted,
    gap: 0.4,
  });
  return { front, back };
}

/** How the kit's typeface sets a line: its box is 1.3 times the size it is set at, times the leading. */
const LINE_BOX = 1.3;

/** Roughly how wide a letter is, as a share of the type size: wider in bold, and Chinese, Japanese and Korean a whole square. */
const letterWidth = (character: string, bold: boolean) => (/[ᄀ-ᇿ⺀-꓏가-힯豈-﫿＀-￯]/.test(character) ? 1 : bold ? 0.53 : 0.49);

/** About how tall the pieces come to at `size`, set `width` points wide, word by word. */
export function piecesHeight(pieces: Piece[], size: number, width: number): number {
  let height = 0;
  for (const piece of pieces) {
    const own = size * (piece.scale ?? 1);
    let lines = 1;
    let used = 0;
    let largest = own;
    for (const run of piece.runs) {
      const fontSize = own * (run.scale ?? 1);
      largest = Math.max(largest, fontSize);
      const bold = run.bold ?? piece.bold ?? false;
      run.text.split("\n").forEach((paragraph, index) => {
        if (index > 0) {
          lines += 1;
          used = 0;
        }
        for (const word of paragraph.split(/(?<= )/)) {
          const wide = [...word].reduce((sum, character) => sum + letterWidth(character, bold) * fontSize, 0);
          if (used > 0 && used + wide > width) {
            lines += 1;
            used = 0;
          }
          used += wide;
          // A word longer than the line runs on to the next.
          while (used > width) {
            used -= width;
            lines += 1;
          }
        }
      });
    }
    height += lines * largest * (piece.lineHeight ?? 1.08) * LINE_BOX + (piece.gap ?? 0) * size;
  }
  return height;
}

const toContent = (pieces: Piece[], size: number): Content[] =>
  pieces.map(
    (piece) =>
      ({
        text: piece.runs.map((run) => ({
          text: run.text,
          ...(run.bold !== undefined ? { bold: run.bold } : {}),
          ...(run.colour ? { color: run.colour } : {}),
          ...(run.scale ? { fontSize: size * (piece.scale ?? 1) * run.scale } : {}),
        })),
        fontSize: size * (piece.scale ?? 1),
        bold: piece.bold ?? false,
        ...(piece.colour ? { color: piece.colour } : {}),
        lineHeight: piece.lineHeight ?? 1.08,
        margin: [0, (piece.gap ?? 0) * size, 0, 0],
      }) as Content,
  );

/** Each size's card, its inset, and the type sizes tried, largest first. */
const CARD_SIZES: Record<GrabCardSize, { width: number; height: number; inset: number; sizes: number[] }> = {
  wallet: { width: CARD_WIDTH, height: CARD_HEIGHT, inset: 9, sizes: [8, 7.5, 7, 6.5, 6, 5.5] },
  a6: { width: A6_WIDTH, height: A6_HEIGHT, inset: 14, sizes: [10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5] },
};

/** One card's panels, each set as large as it fits (the front and the back may differ), and whether one is too much even in the smallest type. */
export function grabKitCard(
  person: GrabPerson,
  household: GrabHousehold,
  options: { size: GrabCardSize; formats: readonly GridFormat[]; made: Date },
): { panels: Content[][]; sizes: number[]; overflow: boolean } {
  const card = CARD_SIZES[options.size];
  const { front, back } = grabPieces(person, household, options);
  const panels = options.size === "wallet" ? [front, back] : [[...front, ...back]];
  const width = card.width - 2 * card.inset;
  // A little room kept back for the estimate's error.
  const room = (card.height - 2 * card.inset) * 0.97;
  const set = panels.map((panel) => {
    const fits = (size: number) => piecesHeight(panel, size, width) <= room;
    const size = card.sizes.find(fits) ?? card.sizes.at(-1)!;
    return { content: toContent(panel, size), size, overflow: !fits(size) };
  });
  return {
    panels: set.map((panel) => panel.content),
    sizes: set.map((panel) => panel.size),
    overflow: set.some((panel) => panel.overflow),
  };
}

/** Which cards hold more than fits, even in the smallest type. */
export function grabOverflow(
  people: GrabPerson[],
  household: GrabHousehold,
  options: { size: GrabCardSize; formats: readonly GridFormat[]; made: Date },
): string[] {
  return people.filter((person) => grabKitCard(person, household, options).overflow).map((person) => person.name);
}

/**
 * The cards at their real size, with corner marks to cut along: wallet size (85.6 by
 * 53.98 mm a half, front and back folded along the broken line) two across and two down,
 * or A6 (105 by 148 mm) two to a sheet laid across.
 */
export function grabCardsDocument(
  people: GrabPerson[],
  household: GrabHousehold,
  options: { size: GrabCardSize; formats: readonly GridFormat[]; made: Date; paper: CardPaper },
): TDocumentDefinitions {
  const wallet = options.size === "wallet";
  const card = CARD_SIZES[options.size];
  const cards = people.map((person) =>
    cutCard(grabKitCard(person, household, options).panels, { width: card.width, height: card.height, inset: card.inset }),
  );
  const content: Content[] = [
    { text: "Grab cards", fontSize: 8.5, bold: true, color: C.accent, characterSpacing: 0.4 },
    {
      text: wallet ? "Wallet size, 85.6 by 54 mm" : "A6, 105 by 148 mm",
      fontSize: 15,
      bold: true,
      margin: [0, 1, 0, 2],
    },
    {
      text: wallet
        ? "Print at actual size (100%). Cut along the corner marks, fold along the broken line, inside to inside."
        : "Print at actual size (100%). Cut along the corner marks.",
      fontSize: 8.5,
      color: C.muted,
      margin: [0, 0, 0, 8],
    },
  ];
  if (cards.length === 0) content.push(para("No one to make a card for yet."));
  const perPage = wallet ? 4 : 2;
  for (let index = 0; index < cards.length; index += 2)
    content.push({
      columns: [cards[index]!, cards[index + 1] ?? { text: "" }],
      columnGap: wallet ? 24 : 14,
      unbreakable: true,
      ...(index > 0 && index % perPage === 0 ? { pageBreak: "before" } : {}),
    } as Content);
  return printDocument({
    paper: options.paper,
    title: `Grab cards, ${wallet ? "wallet size" : "A6"}`,
    made: options.made,
    footerName: "Grab cards · our household's own plan",
    footerRight: madeWords(options.made),
    parts: [
      {
        kind: "plain",
        content,
        // Narrower margins than the book's, so that two cards and their marks sit across the sheet.
        margins: wallet ? [30, 30, 30, 40] : [34, 26, 34, 34],
        ...(wallet ? {} : { orientation: "landscape" as const }),
      },
    ],
  });
}
