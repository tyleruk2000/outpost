/**
 * A CSV file as a page: one table, header row from the CSV's header.
 *
 * This is how a Notion database arrives. Notion exports the database as a CSV and
 * each row's own page as a file in a folder beside it; here the table's first column
 * (the row's name) links to that page when the names match.
 *
 * A page is a document people read and edit, not a spreadsheet, so very long and very
 * wide tables are cut to a size the editor handles well. The cut is always reported,
 * and on import the complete CSV is attached to the page so nothing is lost.
 */
import fs from "node:fs";
import type { NoteDoc } from "@outpost/shared";
import { parse } from "csv-parse/sync";
import type { PMNode } from "../notes/content/schema.ts";

export const MAX_TABLE_ROWS = 500;
export const MAX_TABLE_COLUMNS = 30;
const MAX_CELL_CHARS = 2_000;
/** Text across the whole table. Keeps the page well under the size a page may have, whatever the cells hold. */
const MAX_TABLE_CHARS = 2_000_000;
/** The parser holds the whole file in memory; a CSV larger than this is not a page-sized table anyway. */
export const MAX_CSV_BYTES = 32 * 1024 * 1024;

export interface CsvTable {
  header: string[];
  /** Data rows, already cut to the limits. */
  rows: string[][];
  /** Rows and columns the file really has. */
  totalRows: number;
  totalColumns: number;
  truncated: boolean;
}

/** Reads and parses a CSV file. Throws when it is not readable as CSV. */
export async function readCsv(file: string): Promise<string[][]> {
  const text = await fs.promises.readFile(file, "utf8");
  return parse(text, { bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true }) as string[][];
}

/** The number of data rows in a CSV file, or 0 when it cannot be read. Used to choose between Notion's two copies. */
export async function countCsvRows(file: string): Promise<number> {
  try {
    return Math.max(0, (await readCsv(file)).length - 1);
  } catch {
    return 0;
  }
}

export function toTable(records: string[][]): CsvTable {
  const [first = [], ...data] = records;
  const totalColumns = Math.max(first.length, ...data.map((row) => row.length), 0);
  const columns = Math.min(totalColumns, MAX_TABLE_COLUMNS);
  let cut = false;
  const cell = (value: string | undefined): string => {
    const text = (value ?? "").trim();
    if (text.length <= MAX_CELL_CHARS) return text;
    cut = true;
    return `${text.slice(0, MAX_CELL_CHARS)}…`;
  };
  const shape = (row: string[]) => Array.from({ length: columns }, (_, index) => cell(row[index]));
  const rows: string[][] = [];
  let chars = 0;
  for (const record of data.slice(0, MAX_TABLE_ROWS)) {
    const row = shape(record);
    chars += row.reduce((total, value) => total + value.length, 0);
    if (chars > MAX_TABLE_CHARS) break;
    rows.push(row);
  }
  return {
    header: shape(first),
    rows,
    totalRows: data.length,
    totalColumns,
    truncated: cut || rows.length < data.length || totalColumns > MAX_TABLE_COLUMNS,
  };
}

/** What was cut, in words for the person importing; undefined when the table is whole. */
export function truncationNote(table: CsvTable): string | undefined {
  if (!table.truncated) return undefined;
  const parts: string[] = [];
  if (table.rows.length < table.totalRows)
    parts.push(`the first ${table.rows.length.toLocaleString("en")} of its ${table.totalRows.toLocaleString("en")} rows`);
  if (table.totalColumns > MAX_TABLE_COLUMNS) parts.push(`the first ${MAX_TABLE_COLUMNS} of its ${table.totalColumns} columns`);
  const kept =
    parts.length > 0 ? `This table is imported with ${parts.join(" and ")}.` : "Some very long cells in this table are shortened.";
  return `${kept} The complete CSV file is attached to the page.`;
}

export interface TableDocOptions {
  /** The page of the row whose first cell is `name`, when the row has a page of its own. Called once per row, in order. */
  rowPage?: (name: string) => string | undefined;
  /** Where the complete CSV can be opened, when the table was cut. */
  fullCsv?: { href: string; filename: string };
}

const textCell = (type: "tableHeader" | "tableCell", content: PMNode[]): PMNode => ({
  type,
  content: [content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" }],
});

export function tableDoc(table: CsvTable, options: TableDocOptions = {}): NoteDoc {
  const blocks: PMNode[] = [];
  if (table.header.length > 0) {
    const headerRow: PMNode = {
      type: "tableRow",
      content: table.header.map((value) => textCell("tableHeader", value ? [{ type: "text", text: value }] : [])),
    };
    const dataRows = table.rows.map(
      (row): PMNode => ({
        type: "tableRow",
        content: row.map((value, column) => {
          const noteId = column === 0 && value ? options.rowPage?.(value) : undefined;
          if (noteId) return textCell("tableCell", [{ type: "pageLink", attrs: { noteId, label: value } }]);
          return textCell("tableCell", value ? [{ type: "text", text: value }] : []);
        }),
      }),
    );
    blocks.push({ type: "table", content: [headerRow, ...dataRows] });
  }
  if (options.fullCsv) {
    blocks.push({
      type: "paragraph",
      content: [
        { type: "text", text: "The complete table: " },
        { type: "text", text: options.fullCsv.filename, marks: [{ type: "link", attrs: { href: options.fullCsv.href } }] },
      ],
    });
  }
  return { type: "doc", content: blocks.length > 0 ? blocks : [{ type: "paragraph" }] } as unknown as NoteDoc;
}

/**
 * Hands out the page of each row by name. Rows are matched in order, so two rows with
 * the same name get their own pages as long as there are pages left for that name.
 */
export function rowPageMatcher(pages: Array<{ title: string; noteId: string }>): (name: string) => string | undefined {
  const key = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  const byName = new Map<string, string[]>();
  for (const page of pages) {
    const list = byName.get(key(page.title)) ?? [];
    list.push(page.noteId);
    byName.set(key(page.title), list);
  }
  return (name) => {
    const list = byName.get(key(name));
    if (!list || list.length === 0) return undefined;
    // The last page of a name keeps answering, so a name repeated more often than it has pages still links somewhere.
    return list.length > 1 ? list.shift() : list[0];
  };
}
