/**
 * Numbers as spreadsheets write them, read the same way by every CSV importer.
 *
 * The decimal mark is decided from the file, not from each cell: a file whose cells are
 * separated by semicolons is what a spreadsheet set to a decimal comma writes, and a file
 * separated by commas cannot use the comma as its decimal mark (every such number would
 * split the row). A file separated by tabs says nothing either way, so its own cells are
 * looked at: "2,5" or "1.234,5" can only be decimal comma, "2.5" or "1,234.5" only
 * decimal point.
 *
 * Some cells mean one thing whatever the file: "1.234,5" and "1,234.5" are both 1234.5,
 * "2,5" is 2.5 (a thousands separator is followed by three digits), "1,234,567" is a
 * whole number. "1,234" and "1.234" are the cells that need the file's decimal mark;
 * where the file does not settle it, the cell is reported as ambiguous and not guessed.
 */

export type DecimalMark = "," | ".";

export type SpreadsheetNumber =
  | { kind: "empty" }
  | { kind: "number"; value: number /** How the cell was read, when it was not a plain number. */; note: string | null }
  | { kind: "ambiguous"; message: string }
  | { kind: "invalid" };

/** The decimal mark a file's cell separator implies; null for a tab or anything else that does not decide it. */
export function decimalMarkOfDelimiter(delimiter: string): DecimalMark | null {
  if (delimiter === ";") return ",";
  if (delimiter === ",") return ".";
  return null;
}

const NUMBER_SHAPE = /^[+-]?(?:\d[\d.,]*|[.,]\d+)$/;

/** Takes off a unit written after the number ("330 g", "1,5 l", "45%"). */
function core(text: string): string | null {
  const match = /^([+-]?[\d.,]*\d[\d.,]*|[+-]?[.,]\d+)\s*[a-zA-Z%]*$/.exec(text.trim());
  return match && NUMBER_SHAPE.test(match[1]!) ? match[1]! : null;
}

/** Whether "1,234,567" (or with points) is grouped in threes after the first group. */
const grouped = (digits: string, separator: string) => {
  const parts = digits.split(separator);
  return (
    parts[0]!.replace(/^[+-]/, "").length >= 1 &&
    parts[0]!.replace(/^[+-]/, "").length <= 3 &&
    parts.slice(1).every((part) => /^\d{3}$/.test(part))
  );
};

/** What a cell could mean on its own: a value, or the two readings that only the decimal mark can choose between. */
function readings(text: string): { comma: number | null; point: number | null } | null {
  const hasComma = text.includes(",");
  const hasPoint = text.includes(".");
  const plain = (value: string) => Number(value);
  if (!hasComma && !hasPoint) return { comma: plain(text), point: plain(text) };
  if (hasComma && hasPoint) {
    // The last mark is the decimal one; the other groups the thousands.
    const decimal = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const group = decimal === "," ? "." : ",";
    const [whole, fraction, extra] = text.split(decimal);
    if (extra !== undefined || !fraction || !/^\d+$/.test(fraction) || !grouped(whole!, group)) return null;
    const value = plain(`${whole!.replaceAll(group, "")}.${fraction}`);
    return { comma: value, point: value };
  }
  const separator = hasComma ? "," : ".";
  const parts = text.split(separator);
  if (parts.length > 2) {
    // Two or more of the same mark can only be grouping.
    if (!grouped(text, separator)) return null;
    const value = plain(text.replaceAll(separator, ""));
    return { comma: value, point: value };
  }
  const [whole, fraction] = parts as [string, string];
  if (!/^\d+$/.test(fraction)) return null;
  const asDecimal = plain(`${whole || "0"}.${fraction}`);
  const digits = whole.replace(/^[+-]/, "");
  // Not three digits after it, or nothing or a nought before it: it cannot be a thousands separator.
  if (fraction.length !== 3 || digits === "" || digits === "0" || digits.length > 3) return { comma: asDecimal, point: asDecimal };
  const asWhole = plain(`${whole}${fraction}`);
  return separator === "," ? { comma: asDecimal, point: asWhole } : { comma: asWhole, point: asDecimal };
}

const show = (value: number) => String(value);

/** One cell, read with the file's decimal mark (null when the file does not decide it). */
export function readSpreadsheetNumber(text: string, mark: DecimalMark | null): SpreadsheetNumber {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "empty" };
  const cell = core(trimmed);
  if (!cell) return { kind: "invalid" };
  const read = readings(cell);
  if (!read || read.comma === null || read.point === null || !Number.isFinite(read.comma) || !Number.isFinite(read.point))
    return { kind: "invalid" };
  let value: number;
  if (read.comma === read.point) value = read.comma;
  else if (mark === ",") value = read.comma;
  else if (mark === ".") value = read.point;
  else
    return {
      kind: "ambiguous",
      message: `“${trimmed}” could be ${show(read.point)} or ${show(read.comma)}, and the file does not show which mark it uses for decimals. Write it as ${show(read.point)} or ${show(read.comma)}.`,
    };
  const isPlain = /^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(cell);
  return { kind: "number", value, note: isPlain ? null : `“${trimmed}” read as ${show(value)}.` };
}

/**
 * The decimal mark a file's numbers show between them, for a file whose separator does not
 * decide it: null when none of its cells settles it, or when they disagree.
 */
export function decimalMarkOfCells(cells: Iterable<string>): DecimalMark | null {
  let comma = false;
  let point = false;
  for (const text of cells) {
    const cell = core(text);
    if (!cell) continue;
    const read = readings(cell);
    if (!read || read.comma === null || read.point === null) continue;
    if (cell.includes(",") && cell.includes(".")) {
      if (cell.lastIndexOf(",") > cell.lastIndexOf(".")) comma = true;
      else point = true;
    } else if (read.comma === read.point && /^[+-]?\d*[.,]\d+$/.test(cell)) {
      // A single mark that cannot be grouping ("2,5", "0.125") shows the decimal mark.
      if (cell.includes(",")) comma = true;
      else point = true;
    }
  }
  return comma === point ? null : comma ? "," : ".";
}
