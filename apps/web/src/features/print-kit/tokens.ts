/**
 * The printed page's tokens: colours, type sizes, spacing and paper. Paper has no themes,
 * so these are not the screen's tokens (styles/tokens.css); they are chosen for ink.
 *
 * Every colour is one a four-colour press or an office inkjet reaches (no screen-only
 * saturation), and each prints as a distinct grey on a black-and-white printer. Colour is
 * never the only mark of anything: a callout's kind is also its symbol and its border,
 * a step is also its number or letter, a section is also its number and title.
 */

/** Ink colours, as hex. The comment gives the approximate CMYK each was chosen against. */
export const PRINT_COLOURS = {
  /** Text. C70 M50 Y45 K85: a rich near-black that stays black in greyscale. */
  ink: "#1d2327",
  /** Secondary text: subtitles, captions, the footer. Still 7:1 on white. */
  muted: "#4f5b63",
  /** Hairlines and table rules. */
  rule: "#b9c2c7",
  /** The band behind a table head and every other row. */
  shade: "#eef1f2",
  /** Outpost's own colour: section numbers, rules under titles, step circles, group headings. C85 M35 Y40 K25. */
  accent: "#1f6470",
  /** The accent, washed, behind a group heading or a contents row. */
  accentSoft: "#e3eff0",
  /** "Do this now": a deep red. C10 M95 Y90 K15. */
  act: "#a8241c",
  actSoft: "#fbe9e7",
  /** "Know this": a steady blue. C90 M60 Y5 K10. */
  know: "#24569e",
  knowSoft: "#e8eff9",
  /** "Warning": amber for the border, a dark brown-amber for words on it. C5 M45 Y100 K15. */
  warn: "#b7791f",
  warnInk: "#7a4d06",
  warnSoft: "#fdf3dc",
  /** Water in a drawing. */
  water: "#7fb2dc",
  paper: "#ffffff",
} as const;

export type PrintColour = keyof typeof PRINT_COLOURS;

/** The type scale, in points. The body is 9 pt, the least for a book read at arm's length in poor light; nothing a person must act on is smaller. */
export const PRINT_TYPE = {
  /** The cover's title. */
  cover: 34,
  /** A section's big number. */
  sectionNumber: 28,
  /** A section's title. */
  title: 18,
  /** A section's grey line under the title. */
  subtitle: 9,
  /** A heading inside a section. */
  heading: 11.5,
  /** A callout's or a group's heading. */
  label: 9.5,
  body: 9,
  /** Tables of places and figures. */
  table: 8,
  /** Captions, credits, notes under a table. */
  small: 7,
  /** The footer and running header. */
  footer: 7,
  /** Leading: line height as a multiple of the size. */
  leading: 1.18,
} as const;

/** Spacing, in points. */
export const PRINT_SPACE = {
  /** Between paragraphs. */
  paragraph: 3.5,
  /** Above a heading. */
  heading: 8,
  /** Between blocks: a callout, a table, a figure. */
  block: 8,
  /** Inside a callout or a box. */
  inset: 6,
  /** Between two columns. */
  gutter: 14,
} as const;

export type PrintPaper = "a4" | "letter";

/** Paper sizes in points, and the margins. Letter is wider and shorter: the same margins, a different measure. */
export const PRINT_PAPERS: Record<PrintPaper, { width: number; height: number; label: string }> = {
  a4: { width: 595.28, height: 841.89, label: "A4" },
  letter: { width: 612, height: 792, label: "US Letter" },
};

/** Left, top, right, bottom. The bottom leaves room for the footer, the top for the running header. */
export const PRINT_MARGINS: [number, number, number, number] = [42, 50, 42, 50];

/** The width text runs across on a page of this paper. */
export const measureOf = (paper: PrintPaper): number => PRINT_PAPERS[paper].width - PRINT_MARGINS[0] - PRINT_MARGINS[2];

/** The typeface's family name in the document; also the `font-family` drawings use. */
export const PRINT_FONT = "Atkinson";
