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
import { PRINT_COLOURS as C, PRINT_FONT, PRINT_SPACE as S, PRINT_TYPE as T } from "./tokens";

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
        { svg: stepDisc(stepMark(index + (options.start ?? 0), mark), colour), width: 14, height: 14 },
        { stack: [typeof item === "string" ? rich(item) : item], width: "*", margin: [0, 1, 0, 0] },
      ],
      columnGap: 7,
      margin: [0, 0, 0, 5],
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
  paddingTop: () => 2.6,
  paddingBottom: () => 2.6,
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
  rows: string[][],
  options: { right?: number[]; widths?: Array<number | "*" | "auto">; bold?: number[] } = {},
): Content {
  const right = new Set(options.right ?? []);
  const cell = (text: string, column: number, isHead: boolean): TableCell => ({
    text: rich(text) as never,
    bold: isHead || options.bold?.includes(column),
    fontSize: isHead ? T.small + 0.5 : T.table,
    color: isHead ? C.ink : C.ink,
    alignment: right.has(column) ? "right" : "left",
  });
  const filled = head.some((title) => title.trim() !== "");
  const body = [
    ...(filled ? [head.map((title, column) => cell(title, column, true))] : []),
    ...rows.map((row) => head.map((_, column) => cell(row[column] ?? "", column, false))),
  ];
  return {
    table: { headerRows: filled ? 1 : 0, widths: options.widths ?? columnWidths(head, rows), body, dontBreakRows: true },
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
