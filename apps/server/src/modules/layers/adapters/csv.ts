/** Reading a CSV file row by row as records keyed by its header, without holding the file in memory. */
import fs from "node:fs";
import { parse } from "csv-parse";
import { PermanentJobError } from "../../../core/jobs.ts";

export async function* csvRecords(filePath: string, signal?: AbortSignal): AsyncGenerator<{ row: Record<string, string>; line: number }> {
  const source = fs.createReadStream(filePath);
  const parser = source.pipe(
    parse({
      columns: (header: string[]) => header.map((name) => name.trim().toLowerCase().replace(/^﻿/, "")),
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }),
  );
  // pipe() does not pass a read error on: a file that has gone, or a drive unplugged
  // mid-read, would emit "error" with no listener and end the process.
  source.on("error", (error) => parser.destroy(error));
  let line = 1;
  try {
    for await (const record of parser) {
      line += 1;
      signal?.throwIfAborted();
      yield { row: record as Record<string, string>, line };
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && "code" in error && String((error as { code?: unknown }).code).startsWith("CSV_")) {
      throw new PermanentJobError(`The file could not be read as CSV near line ${line + 1}: ${error.message}`);
    }
    throw error;
  } finally {
    source.destroy();
  }
}
