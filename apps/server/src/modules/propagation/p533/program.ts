/**
 * Runs the ITU's ITURHFProp once, as the command-line program it is: an input file in
 * the ITU's own format goes in, the report it writes comes out.
 *
 * Every run gets a fresh instance of the compiled module, with its own memory. The
 * program is written to run once and exit, keeps state in global variables, and frees
 * little of what it allocates; a fresh instance makes each answer independent of the
 * one before, and costs about a millisecond. The compiled module itself is reused.
 *
 * Runs in the propagation worker thread, never in the server's own.
 */

import { type WasmMemory, wasm } from "../voacap/wasm-types.ts";
import { createP533Wasi, ProgramExit } from "./wasi.ts";

/** Where the input and the report are, in the program's view of the world. */
export const INPUT_PATH = "outpost/input.txt";
export const REPORT_PATH = "outpost/report.txt";
/** A day of eleven frequencies writes about 300 kB; this is far above it. */
const REPORT_LIMIT = 32 * 1024 * 1024;

export interface ProgramRun {
  /** The program's exit status: 0 when it finished its analysis. */
  code: number;
  report: string;
  /** What it printed to its screen. */
  console: string;
  /** How large the program's memory grew, in bytes. */
  memoryBytes: number;
}

/** The program could not be run at all, or stopped part way (a trap, not an exit). */
export class ProgramFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgramFailed";
  }
}

interface ProgramExports {
  memory: WasmMemory;
  _start(): void;
}

/** Compiles the module once; `run` instantiates it afresh each time. */
export function compileProgram(bytes: Uint8Array): object {
  return new wasm.Module(bytes);
}

/**
 * @param files the data files by path (for example "Data/ionos11.bin"), and any others
 *   the input names. The input is added at {@link INPUT_PATH}.
 * @param flags ITURHFProp's own options, such as "-s" (silent).
 */
export function runProgram(module: object, input: string, files: Map<string, Uint8Array>, flags: string[] = ["-s"]): ProgramRun {
  const all = new Map(files);
  all.set(INPUT_PATH, new TextEncoder().encode(input));
  const wasi = createP533Wasi({
    args: ["ITURHFProp", ...flags, `/${INPUT_PATH}`, `/${REPORT_PATH}`],
    files: all,
    outputPath: REPORT_PATH,
    outputLimit: REPORT_LIMIT,
  });
  const instance = new wasm.Instance(module, { wasi_snapshot_preview1: wasi.imports });
  const exports = instance.exports as unknown as ProgramExports;
  wasi.bind(exports.memory);
  let code = 0;
  try {
    exports._start();
  } catch (error) {
    if (error instanceof ProgramExit) code = error.code;
    else {
      const said = wasi.console().trim();
      throw new ProgramFailed(
        `The P.533 engine stopped while working: ${said || (error instanceof Error ? error.message : String(error))}`,
      );
    }
  }
  const report = wasi.output();
  return {
    code,
    report: report ? new TextDecoder().decode(report) : "",
    console: wasi.console(),
    memoryBytes: exports.memory.buffer.byteLength,
  };
}
