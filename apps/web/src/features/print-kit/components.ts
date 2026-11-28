/**
 * The printed page's components, as pdfmake content: a section's header, the three kinds
 * of callout, numbered and lettered steps, a table of figures, a checklist with boxes to
 * tick, two columns, a figure with its caption, a card to cut out, the contents, the
 * cover, a page for notes, and the footer and running header.
 *
 * Each is a function from words to content and nothing else: no layout is worked out
 * here, pdfmake does that when the PDF is made (render.ts). The look is the tokens'
 * (tokens.ts). docs/development/printed-pages.md says how to use them.
 */
import type { Content, ContentTable, CustomTableLayout, DynamicContent, TableCell } from "pdfmake/interfaces";
import { startsRightToLeft } from "./order";
import { PRINT_COLOURS as C, PRINT_FONT, PRINT_MARGINS, PRINT_PAPERS, type PrintPaper, PRINT_SPACE as S, PRINT_TYPE as T } from "./tokens";

/**
 * Marks the typeface does not have, written with ones it does: the minutes and seconds of
 * a position (′ ″), arrows, and fractions beyond the halves and quarters.
 */
const STAND_INS: Record<string, string> = { "′": "'", "″": '"', "→": "to", "←": "from", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", µ: "micro" };
export const printable = (text: string): string => text.replace(/[′″→←⅓⅔⅛µ]/g, (mark) => STAND_INS[mark] ?? mark);

/** Words with **bold** runs, as a writer marks them: "**Boil it.** Bring water to…". */
export function rich(words: string): Content {
  const text = printable(words);
  if (!text.includes("**")) return text;
  const parts = text.split("**");
  return parts.filter((part) => part !== "").length === 0
    ? ""
    : { text: parts.map((part, index) => (index % 2 === 1 ? { text: part, bold: true } : part)).filter((part) => part !== "") };
}

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── Text ────────────────────────────────────────────────────────────────────

export const para = (text: string | Content, margin: number = S.paragraph): Content => ({
  text: typeof text === "string" ? (rich(text) as never) : (text as never),
  margin: [0, 0, 0, margin],
});

/** Small grey words: a note under a table, a credit. */
export const note = (text: string): Content => ({
  text: rich(text) as never,
  fontSize: T.small,
  color: C.muted,
  margin: [0, 0, 0, S.paragraph],
});

/** A heading inside a section. Kept with what follows it. */
export const heading = (text: string): Content => ({
  text,
  fontSize: T.heading,
  bold: true,
  color: C.ink,
  margin: [0, S.heading, 0, 4],
  headlineLevel: 2,
});

/** A smaller heading in the accent: a group in a column, a page of the NHS website. */
export const label = (text: string, colour: string = C.accent): Content => ({
  text,
  fontSize: T.label,
  bold: true,
  color: colour,
  margin: [0, 6, 0, 2],
  headlineLevel: 3,
});

export const bullets = (items: Array<string | Content>): Content => ({
  ul: items.map((item) => (typeof item === "string" ? rich(item) : item)) as never,
  markerColor: C.accent,
  margin: [0, 0, 0, S.paragraph + 2],
});

/** Words quoted from a source, in quotation marks, with whose they are after them in grey. */
export const quote = (text: string, who: string): Content => ({
  text: [`“${text}” `, { text: who, color: C.muted, fontSize: T.small }],
  margin: [0, 0, 0, 4],
});

// ── Section header ──────────────────────────────────────────────────────────

export interface SectionHeaderInput {
  number: number | string;
  title: string;
  subtitle?: string;
  /** For the contents' page numbers: the section's first page is looked up by it. */
  id?: string;
}

/** A large number in the accent beside a bold title, a grey line under it, and a rule in the accent across the page. */
export function sectionHeader(input: SectionHeaderInput, measure: number): Content {
  return {
    stack: [
      {
        columns: [
          {
            width: 46,
            text: String(input.number),
            fontSize: T.sectionNumber,
            bold: true,
            color: C.accent,
            lineHeight: 0.9,
          },
          {
            width: "*",
            margin: [0, 4, 0, 0],
            stack: [
              { text: input.title, id: input.id, fontSize: T.title, bold: true, color: C.ink, lineHeight: 1.05 },
              ...(input.subtitle ? [{ text: input.subtitle, fontSize: T.subtitle, color: C.muted, margin: [0, 3, 0, 0] }] : []),
            ],
          },
        ],
        columnGap: 6,
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 1.6, lineColor: C.accent }], margin: [0, 9, 0, 12] },
    ],
  } as Content;
}

// ── Callouts ────────────────────────────────────────────────────────────────

/**
 * - act: do this now. Red, a thick border, a filled disc with "!".
 * - know: know this. Blue, a thin border, a ring with "i".
 * - warn: a warning. Amber, a broken border, a triangle with "!".
 *
 * Each is told from the others by its symbol and its border as well as its colour, so
 * that a black-and-white copy keeps them apart.
 */
export type CalloutKind = "act" | "know" | "warn";

const CALLOUT: Record<CalloutKind, { border: string; soft: string; ink: string; width: number; dash: boolean }> = {
  act: { border: C.act, soft: C.actSoft, ink: C.act, width: 1.6, dash: false },
  know: { border: C.know, soft: C.knowSoft, ink: C.know, width: 0.8, dash: false },
  warn: { border: C.warn, soft: C.warnSoft, ink: C.warnInk, width: 1.1, dash: true },
};

/** The callout's symbol, drawn: 11 points square. */
export function calloutSymbol(kind: CalloutKind): string {
  const { border } = CALLOUT[kind];
  // Drawn, not lettered: the marks are shapes, so that a search of the file finds only the words.
  const bang = (fill: string, top: number) =>
    `<rect x="5.15" y="${top}" width="1.7" height="4.6" rx="0.8" fill="${fill}"/><circle cx="6" cy="${top + 6.3}" r="0.95" fill="${fill}"/>`;
  if (kind === "act")
    return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.6" fill="${border}"/>${bang("#ffffff", 2.4)}</svg>`;
  if (kind === "know")
    return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#ffffff" stroke="${border}" stroke-width="1.3"/><circle cx="6" cy="3.7" r="0.95" fill="${border}"/><rect x="5.2" y="5.2" width="1.6" height="4" rx="0.7" fill="${border}"/></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><path d="M6 0.8 L11.4 11 L0.6 11 Z" fill="${C.warn}" stroke="${C.warnInk}" stroke-width="0.6" stroke-linejoin="round"/>${bang("#ffffff", 3.6)}</svg>`;
}

function boxLayout(border: string, width: number, dash: boolean, fill: string, inset: number = S.inset): CustomTableLayout {
  return {
    hLineWidth: (index, node) => (index === 0 || index === node.table.body.length ? width : 0),
    vLineWidth: (index, node) => (index === 0 || index === (node.table.widths?.length ?? 1) ? width : 0),
    hLineColor: () => border,
    vLineColor: () => border,
    hLineStyle: () => (dash ? { dash: { length: 4, space: 2 } } : null),
    vLineStyle: () => (dash ? { dash: { length: 4, space: 2 } } : null),
    fillColor: () => fill,
    paddingLeft: () => inset + 1,
    paddingRight: () => inset + 1,
    paddingTop: () => inset - 1,
    paddingBottom: () => inset - 2,
  };
}

/** A tinted box with a coloured border and a coloured heading. `keep` holds a short one on one page. */
export function callout(kind: CalloutKind, title: string, body: Content | Content[], options: { keep?: boolean } = {}): Content {
  const style = CALLOUT[kind];
  return {
    table: {
      widths: ["*"],
      dontBreakRows: options.keep ?? true,
      body: [
        [
          {
            stack: [
              {
                columns: [
                  { svg: calloutSymbol(kind), width: 11, height: 11, margin: [0, 0.5, 0, 0] },
                  { text: title, bold: true, fontSize: T.label + 0.5, color: style.ink, width: "*" },
                ],
                columnGap: 5,
                margin: [0, 0, 0, 3],
              },
              ...(Array.isArray(body) ? body : [body]),
            ],
          },
        ],
      ],
    },
    layout: boxLayout(style.border, style.width, style.dash, style.soft),
    margin: [0, 2, 0, S.block],
    unbreakable: options.keep ?? false,
  } as Content;
}

// ── Steps ───────────────────────────────────────────────────────────────────

export type StepMark = "number" | "letter";

/** The disc a step's number or letter sits in. */
export function stepDisc(mark: string, colour: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.6" fill="${colour}"/><text x="8" y="11.3" font-family="${PRINT_FONT}" font-weight="bold" font-size="9.5" text-anchor="middle" fill="#ffffff">${escapeXml(mark)}</text></svg>`;
}

export const stepMark = (index: number, mark: StepMark): string =>
  mark === "number" ? String(index + 1) : String.fromCharCode(97 + (index % 26));

/** Steps in order, each with a number (1, 2, 3) or a letter (a, b, c) in a disc. */
export function steps(items: Array<string | Content>, options: { mark?: StepMark; colour?: string; start?: number } = {}): Content {
  const mark = options.mark ?? "number";
  const colour = options.colour ?? C.accent;
  return {
    stack: items.map((item, index) => ({
      columns: [
        { svg: stepDisc(stepMark(index + (options.start ?? 0), mark), colour), width: 11.5, height: 11.5, margin: [0, 0.5, 0, 0] },
        { stack: [typeof item === "string" ? rich(item) : item], width: "*", margin: [0, 0.5, 0, 0] },
      ],
      columnGap: 5,
      margin: [0, 0, 0, 3],
      unbreakable: true,
    })),
    margin: [0, 0, 0, S.paragraph],
  } as Content;
}

// ── Tables ──────────────────────────────────────────────────────────────────

const ruledLayout: CustomTableLayout = {
  hLineWidth: (index, node) => (index === 0 || index === node.table.body.length ? 0 : index === 1 ? 0.9 : 0.4),
  vLineWidth: () => 0,
  hLineColor: (index) => (index === 1 ? C.muted : C.rule),
  fillColor: (row) => (row === 0 ? C.shade : null),
  paddingLeft: (index) => (index === 0 ? 4 : 5),
  paddingRight: () => 5,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

/**
 * Columns' widths from what is in them, as shares of the page: each as wide as its longest
 * line (no less than a short word, no more than a sentence), so that a table spans the
 * page with its room where the words are.
 */
export function columnWidths(head: string[], rows: string[][]): string[] {
  const longest = head.map((title, column) =>
    Math.min(
      40,
      Math.max(
        5,
        title.length,
        ...rows.flatMap((row) =>
          (row[column] ?? "")
            .replace(/\*\*/g, "")
            .split("\n")
            .map((line) => line.length),
        ),
      ),
    ),
  );
  const total = longest.reduce((sum, length) => sum + length, 0);
  return longest.map((length) => `${((length / total) * 100).toFixed(2)}%`);
}

/** A table of facts or figures: a shaded head, hairlines between rows, figures to the right where asked. */
export function dataTable(
  head: string[],
  /** Each cell is words (with **bold** runs), or content of its own: a licence status, a box to tick. */
  rows: Array<Array<string | Content>>,
  options: { right?: number[]; widths?: Array<number | string>; bold?: number[] } = {},
): Content {
  const right = new Set(options.right ?? []);
  // A column whose words all read right to left (Arabic or Hebrew names) is set against its right, its heading with
  // it. Where it mixes them with left-to-right words, it goes by its heading's direction, so a column keeps one edge.
  head.forEach((title, column) => {
    if (right.has(column)) return;
    const words = rows.map((row) => row[column]).filter((value): value is string => typeof value === "string" && value.trim() !== "");
    const ways = new Set(words.map(startsRightToLeft));
    const readsRight = ways.size === 1 ? ways.has(true) : ways.size > 1 && startsRightToLeft(title);
    if (readsRight) right.add(column);
  });
  const cell = (text: string | Content, column: number, isHead: boolean): TableCell =>
    typeof text === "string"
      ? {
          text: rich(text) as never,
          bold: isHead || options.bold?.includes(column),
          fontSize: isHead ? T.small + 0.5 : T.table,
          color: C.ink,
          // A cell that reads right to left (an Arabic or Hebrew name) is set against the right of its column.
          alignment: right.has(column) ? "right" : "left",
        }
      : (text as TableCell);
  const filled = head.some((title) => title.trim() !== "");
  const body = [
    ...(filled ? [head.map((title, column) => cell(title, column, true))] : []),
    ...rows.map((row) => head.map((_, column) => cell(row[column] ?? "", column, false))),
  ];
  const words = rows.map((row) => row.map((value) => (typeof value === "string" ? value : "xxxxxxxxxxxx")));
  return {
    table: { headerRows: filled ? 1 : 0, widths: options.widths ?? columnWidths(head, words), body, dontBreakRows: true },
    layout: filled
      ? ruledLayout
      : {
          ...ruledLayout,
          fillColor: () => null,
          hLineWidth: (index: number, node: ContentTable) => (index === 0 || index === node.table.body.length ? 0 : 0.4),
        },
    margin: [0, 2, 0, S.block],
  } as Content;
}

// ── Licence status and numbered notes ───────────────────────────────────────

/** Whether a frequency needs a licence: free to talk on, to listen to only, or a licence to talk. */
export type LicenceStatusKind = "free" | "listen" | "licence";

const LICENCE_STATUS: Record<LicenceStatusKind, { words: string; colour: string; mark: string }> = {
  // An open ring, a half-filled ring and a filled square: told apart in grey as well as in colour.
  free: {
    words: "No licence",
    colour: C.accent,
    mark: `<circle cx="4" cy="4" r="3.1" fill="none" stroke="${C.accent}" stroke-width="1.3"/>`,
  },
  listen: {
    words: "Listen only",
    colour: C.know,
    mark: `<circle cx="4" cy="4" r="3.1" fill="none" stroke="${C.know}" stroke-width="1.3"/><path d="M4 0.9 A3.1 3.1 0 0 0 4 7.1 Z" fill="${C.know}"/>`,
  },
  licence: { words: "Licence needed", colour: C.act, mark: `<rect x="0.8" y="0.8" width="6.4" height="6.4" fill="${C.act}"/>` },
};

/** A licence status in two words with its mark, and the numbers of the notes that say why. */
export function licenceStatus(kind: LicenceStatusKind, notes: number[] = []): Content {
  const status = LICENCE_STATUS[kind];
  const cited = [...new Set(notes)].filter((number) => number > 0);
  return {
    columns: [
      {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">${status.mark}</svg>`,
        width: 7,
        margin: [0, 1.5, 0, 0],
      },
      {
        width: "*",
        text: [
          { text: status.words, bold: true, color: status.colour },
          ...(cited.length > 0 ? [{ text: ` ${cited.join(",")}`, sup: true, color: C.muted }] : []),
        ],
        fontSize: T.table,
      },
    ],
    columnGap: 3,
  } as Content;
}

/** The three statuses with their marks, in one line: the key to a table of them. */
export function licenceKey(): Content {
  return {
    columns: (Object.keys(LICENCE_STATUS) as LicenceStatusKind[]).map((kind) => ({ width: "auto", stack: [licenceStatus(kind)] })),
    columnGap: 14,
    margin: [0, 0, 0, S.paragraph + 2],
  } as Content;
}

/**
 * Notes at the end of a section, numbered in the order first cited. The same words cited
 * twice are one note with one number, so rows that rest on the same source share it.
 */
export class NoteList {
  private notes: string[] = [];
  /** The note's number, from 1; 0 for no words. */
  cite(words: string): number {
    const text = words.trim();
    if (!text) return 0;
    const at = this.notes.indexOf(text);
    if (at >= 0) return at + 1;
    this.notes.push(text);
    return this.notes.length;
  }
  get size(): number {
    return this.notes.length;
  }
  /** The notes, numbered, small. */
  content(): Content[] {
    if (this.notes.length === 0) return [];
    return [
      {
        ol: this.notes.map((text) => rich(text)),
        fontSize: T.small,
        color: C.muted,
        markerColor: C.muted,
        lineHeight: 1.12,
        margin: [0, 0, 0, S.paragraph],
      } as Content,
    ];
  }
}

/** A box to tick, drawn. */
const tickBox: Content = {
  canvas: [{ type: "rect", x: 0, y: 0, w: 8, h: 8, lineWidth: 0.8, lineColor: C.ink, r: 1 }],
  alignment: "center",
  margin: [0, 1.5, 0, 0],
} as Content;

export interface ChecklistGroup {
  heading: string;
  rows: Array<{ what: string; amount?: string }>;
}

/** What to have, in groups with a heading in the accent, with a "Got it" and a "To get" box on every line. */
export function checklist(groups: ChecklistGroup[], options: { amount?: string } = {}): Content {
  const headCell = (text: string, alignment: "left" | "center" = "left"): TableCell => ({
    text,
    bold: true,
    fontSize: T.small + 0.5,
    alignment,
  });
  const body: TableCell[][] = [
    [headCell("What"), headCell(options.amount ?? "How much"), headCell("Got it", "center"), headCell("To get", "center")],
  ];
  const groupRows = new Set<number>();
  for (const group of groups) {
    if (group.rows.length === 0) continue;
    groupRows.add(body.length);
    body.push([{ text: group.heading, colSpan: 4, bold: true, color: C.accent, fontSize: T.label, margin: [0, 4, 0, 0] }, {}, {}, {}]);
    for (const row of group.rows)
      body.push([
        { text: rich(row.what) as never, fontSize: T.table },
        { text: rich(row.amount ?? "") as never, fontSize: T.table },
        tickBox,
        tickBox,
      ]);
  }
  return {
    table: { headerRows: 1, widths: ["*", "auto", 30, 30], body, dontBreakRows: true },
    layout: {
      ...ruledLayout,
      hLineWidth: (index: number, node: ContentTable) =>
        index === 0 || index === node.table.body.length
          ? 0
          : index === 1
            ? 0.9
            : groupRows.has(index) || groupRows.has(index - 1)
              ? 0
              : 0.4,
      fillColor: (row: number) => (row === 0 ? C.shade : null),
    },
    margin: [0, 2, 0, S.block],
  } as Content;
}

// ── Arrangement ─────────────────────────────────────────────────────────────

/** Two columns side by side, each a stack. */
export const twoColumns = (left: Content[], right: Content[], options: { widths?: [number | "*", number | "*"] } = {}): Content =>
  ({
    columns: [
      { width: options.widths?.[0] ?? "*", stack: left },
      { width: options.widths?.[1] ?? "*", stack: right },
    ],
    columnGap: S.gutter,
    margin: [0, 0, 0, 2],
  }) as Content;

/** A drawing with a bold title over it and a caption under it, kept on one page. */
export function figure(svg: string, input: { title?: string; caption?: string; width: number }): Content {
  return {
    stack: [
      ...(input.title ? [{ text: input.title, bold: true, fontSize: T.label + 0.5, color: C.ink, margin: [0, 0, 0, 4] }] : []),
      { svg, width: input.width, alignment: "center" },
      ...(input.caption ? [{ text: rich(input.caption), fontSize: T.small, color: C.muted, margin: [0, 4, 0, 0], lineHeight: 1.15 }] : []),
    ],
    unbreakable: true,
    margin: [0, 2, 0, S.block],
  } as Content;
}

/** A card to cut out along a broken line. */
export function card(lines: Array<string | Content>, width: number): Content {
  return {
    table: {
      widths: [width],
      body: [
        [
          {
            stack: lines.map((line, index) =>
              typeof line === "string" ? { text: line, fontSize: index === 0 ? 13 : 10.5, bold: index === 0, margin: [0, 0, 0, 3] } : line,
            ),
          },
        ],
      ],
    },
    layout: boxLayout(C.muted, 0.9, true, C.paper, 10),
    unbreakable: true,
    margin: [0, 0, 0, 12],
  } as Content;
}

/**
 * A card to print at its real size and cut out: each panel `width` by `height` points,
 * panels one above the other with a broken fold line between, and corner marks outside
 * to cut along. A wallet card is two panels (front and back, folded); an A6 card one.
 */
export function cutCard(panels: Content[][], size: { width: number; height: number; inset?: number }): Content {
  const { width, height } = size;
  const inset = size.inset ?? 8;
  const total = height * panels.length;
  const mark = 7;
  const gap = 3;
  const marks = [];
  for (const [x, y, dx, dy] of [
    [0, 0, -1, -1],
    [width, 0, 1, -1],
    [0, total, -1, 1],
    [width, total, 1, 1],
  ] as const) {
    marks.push({ type: "line" as const, x1: x + dx * gap, y1: y, x2: x + dx * (gap + mark), y2: y, lineWidth: 0.5, lineColor: C.ink });
    marks.push({ type: "line" as const, x1: x, y1: y + dy * gap, x2: x, y2: y + dy * (gap + mark), lineWidth: 0.5, lineColor: C.ink });
  }
  for (let index = 1; index < panels.length; index += 1)
    marks.push({
      type: "line" as const,
      x1: 0,
      y1: height * index,
      x2: width,
      y2: height * index,
      lineWidth: 0.5,
      lineColor: C.muted,
      dash: { length: 3, space: 2 },
    });
  return {
    // The marks first, taking the card's room; the card is laid over them, drawn back up by that room.
    stack: [
      { canvas: marks },
      {
        table: {
          widths: [width - 2 * inset],
          heights: panels.map(() => height - 2 * inset),
          body: panels.map((panel) => [{ stack: panel }]),
          dontBreakRows: true,
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => inset,
          paddingRight: () => inset,
          paddingTop: () => inset,
          paddingBottom: () => inset,
        },
        margin: [0, -(total + gap + mark), 0, 0],
      },
    ],
    unbreakable: true,
    width,
    margin: [mark + gap, mark + gap, 0, mark + gap + 4],
  } as Content;
}

// ── Contents, cover, notes ──────────────────────────────────────────────────

export interface ContentsEntry {
  number: number | string;
  label: string;
  /** The id its section header carries: the page number is looked up by it. */
  id: string;
  about?: string;
}

/** Up to this many sections, each has its line of what is in it; more, and the names alone keep the contents to one page. */
const CONTENTS_WITH_ABOUT = 16;

/** Each section with its number, a line of what is in it, and the page it starts on. */
export function contents(entries: ContentsEntry[]): Content {
  return {
    table: {
      widths: [26, "*", 40],
      dontBreakRows: true,
      body: entries.map((entry) => [
        { text: String(entry.number), bold: true, color: C.accent, fontSize: 11 },
        {
          stack: [
            { text: entry.label, bold: true, fontSize: 10 },
            ...(entry.about && entries.length <= CONTENTS_WITH_ABOUT
              ? [{ text: entry.about, fontSize: T.small, color: C.muted, margin: [0, 1, 0, 0] }]
              : []),
          ],
        },
        { pageReference: entry.id, alignment: "right", fontSize: 10, bold: true, noWrap: true },
      ]),
    },
    layout: {
      hLineWidth: (index: number, node: ContentTable) => (index === 0 || index === node.table.body.length ? 0 : 0.4),
      vLineWidth: () => 0,
      hLineColor: () => C.rule,
      paddingTop: () => 2.6,
      paddingBottom: () => 2.6,
      paddingLeft: () => 0,
      paddingRight: () => 0,
    },
    margin: [0, 0, 0, S.block],
  } as Content;
}

export interface CoverInput {
  /** "Household book". */
  kicker: string;
  title: string;
  subtitle: string;
  /** The panel that matters most: "In an emergency, call" and the number. */
  call: { label: string; number: string; note?: string };
  /** Short facts under it: "Home", "Made". */
  facts: Array<[string, string]>;
  measure: number;
}

export function cover(input: CoverInput): Content[] {
  return [
    { canvas: [{ type: "rect", x: 0, y: 0, w: input.measure, h: 10, color: C.accent }], margin: [0, 30, 0, 26] },
    { text: input.kicker, fontSize: 11, bold: true, color: C.accent, characterSpacing: 0.6, margin: [0, 0, 0, 6] },
    { text: input.title, fontSize: T.cover, bold: true, color: C.ink, lineHeight: 1.05, margin: [0, 0, 0, 8] },
    { text: input.subtitle, fontSize: 12, color: C.muted, margin: [0, 0, 0, 36] },
    {
      table: {
        widths: ["*", "auto"],
        body: [
          [
            {
              stack: [
                { text: input.call.label, fontSize: 13, bold: true, color: C.act },
                ...(input.call.note ? [{ text: input.call.note, fontSize: T.body, color: C.ink, margin: [0, 4, 0, 0] }] : []),
              ],
              margin: [0, 6, 0, 0],
            },
            { text: input.call.number, fontSize: 44, bold: true, color: C.act, alignment: "right", lineHeight: 0.95 },
          ],
        ],
      },
      layout: boxLayout(C.act, 2, false, C.actSoft, 14),
      margin: [0, 0, 0, 22],
    },
    {
      table: {
        widths: [90, "*"],
        body: input.facts.map(([name, value]) => [
          { text: name, bold: true, color: C.muted, fontSize: 10 },
          { text: value, fontSize: 10.5 },
        ]),
      },
      layout: {
        hLineWidth: (index: number, node: ContentTable) => (index === 0 ? 0 : index === node.table.body.length ? 0.4 : 0.4),
        vLineWidth: () => 0,
        hLineColor: () => C.rule,
        paddingLeft: () => 0,
        paddingTop: () => 5,
        paddingBottom: () => 5,
      },
      margin: [0, 0, 0, 20],
    },
  ] as Content[];
}

export interface BookCoverInput {
  /** "Household book". */
  kicker: string;
  /** The household's name, large: "The Rowans". */
  title: string;
  /** "Made on 22 November 2026 from what Outpost held then." */
  subtitle: string;
  call: { label: string; number: string; note?: string };
  facts: Array<[string, string]>;
  /** A drawing for the band at the top (contourArt), as wide as the page. */
  art?: string;
  /** A small map of where home is, as SVG, with its caption. */
  locator?: { svg: string; caption: string };
  /** What the book is, at the foot of the cover. */
  footnote?: string;
  paper: PrintPaper;
}

/** The band at the top of the cover, in points. */
export const COVER_BAND = 300;

/**
 * A cover to keep on a shelf: a band of Outpost's colour across the top with a contour
 * drawing in it, the household's name large in the band, then the number to call, the
 * facts beside a small map of where home is, and a line at the foot. Give `background`
 * to the cover part (PrintPart.background) and `content` as its content.
 */
export function bookCover(input: BookCoverInput): { content: Content[]; background: Content } {
  const page = PRINT_PAPERS[input.paper];
  const measure = page.width - PRINT_MARGINS[0] - PRINT_MARGINS[2];
  const background: Content = [
    { canvas: [{ type: "rect", x: 0, y: 0, w: page.width, h: COVER_BAND, color: C.accent }], absolutePosition: { x: 0, y: 0 } },
    ...(input.art ? [{ svg: input.art, width: page.width, absolutePosition: { x: 0, y: 0 } }] : []),
    {
      canvas: [{ type: "line", x1: PRINT_MARGINS[0], y1: 0, x2: page.width - PRINT_MARGINS[2], y2: 0, lineWidth: 0.6, lineColor: C.rule }],
      absolutePosition: { x: 0, y: page.height - 40 },
    },
    ...(input.footnote
      ? [{ text: input.footnote, fontSize: T.small, color: C.muted, absolutePosition: { x: PRINT_MARGINS[0], y: page.height - 34 } }]
      : []),
  ] as Content;
  const facts: Content = {
    table: {
      widths: [62, "*"],
      body: input.facts.map(([name, value]) => [
        { text: name, bold: true, color: C.muted, fontSize: 9 },
        { text: rich(value) as never, fontSize: 10 },
      ]),
    },
    layout: {
      hLineWidth: (index: number) => (index === 0 ? 0 : 0.4),
      vLineWidth: () => 0,
      hLineColor: () => C.rule,
      paddingLeft: () => 0,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  } as Content;
  const content = [
    { text: input.kicker, fontSize: 12, bold: true, color: "#cfe3e6", characterSpacing: 1, margin: [0, 104, 0, 8] },
    { text: printable(input.title), fontSize: T.cover + 4, bold: true, color: "#ffffff", lineHeight: 1.02, margin: [0, 0, 0, 10] },
    { text: input.subtitle, fontSize: 11, color: "#e4f0f2", margin: [0, 0, 0, 0] },
    {
      table: {
        widths: ["*", "auto"],
        body: [
          [
            {
              stack: [
                { text: input.call.label, fontSize: 14, bold: true, color: C.act },
                ...(input.call.note ? [{ text: input.call.note, fontSize: T.body, color: C.ink, margin: [0, 4, 0, 0] }] : []),
              ],
              margin: [0, 8, 0, 0],
            },
            { text: input.call.number, fontSize: 48, bold: true, color: C.act, alignment: "right", lineHeight: 0.95 },
          ],
        ],
      },
      layout: boxLayout(C.act, 2, false, C.actSoft, 14),
      absolutePosition: { x: PRINT_MARGINS[0], y: COVER_BAND + 28 },
    },
    {
      columns: input.locator
        ? [
            { width: measure - 208, stack: [facts] },
            {
              width: 190,
              stack: [
                { svg: input.locator.svg, width: 190 },
                { text: input.locator.caption, fontSize: T.small, color: C.muted, margin: [0, 3, 0, 0] },
              ],
            },
          ]
        : [{ width: "*", stack: [facts] }],
      columnGap: 18,
      absolutePosition: { x: PRINT_MARGINS[0], y: COVER_BAND + 130 },
      width: measure,
    } as Content,
  ];
  return { content: content as Content[], background };
}

/** A page of ruled lines with a heading. */
export function notesPage(measure: number, height: number): Content[] {
  const lines = [];
  for (let y = 0; y < height; y += 24)
    lines.push({ type: "line" as const, x1: 0, y1: y, x2: measure, y2: y, lineWidth: 0.5, lineColor: C.rule });
  return [{ text: "Notes", fontSize: T.title, bold: true, margin: [0, 0, 0, 16] }, { canvas: lines }] as Content[];
}

// ── Footer and running header ───────────────────────────────────────────────

/** The book's name on the left, the page number in the middle, the date on the right: small and grey. */
export function footer(name: string, right: string, margins: [number, number, number, number]): DynamicContent {
  return (page) => ({
    columns: [
      { text: name, bold: true, width: "*" },
      { text: String(page), width: 40, alignment: "center", color: C.ink },
      { text: right, width: "*", alignment: "right" },
    ],
    fontSize: T.footer,
    color: C.muted,
    margin: [margins[0], 22, margins[2], 0],
  });
}

/**
 * The section's number and name at the top of each of its pages but the first, which
 * has the section's own header. `first` says which pages those are (see render.ts).
 */
export function runningHeader(
  words: string,
  margins: [number, number, number, number],
  measure: number,
  isFirst: (page: number) => boolean,
): DynamicContent {
  return (page) =>
    isFirst(page)
      ? null
      : {
          stack: [
            { text: words, fontSize: T.footer, color: C.muted, bold: true, alignment: "right" },
            { canvas: [{ type: "line", x1: 0, y1: 0, x2: measure, y2: 0, lineWidth: 0.4, lineColor: C.rule }], margin: [0, 3, 0, 0] },
          ],
          margin: [margins[0], 26, margins[2], 0],
        };
}
