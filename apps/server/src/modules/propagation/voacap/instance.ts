/**
 * One loaded copy of the VOACAP engine: the WebAssembly module, its memory, and the
 * data files it can see. A request goes in as JSON and an answer comes back as JSON;
 * `engines/voacap/wrapper/src/lib.rs` is the other side of this.
 *
 * Runs in the propagation worker thread, never in the server's own.
 */

import { createMemoryWasi, EngineExit, type MemoryWasi } from "./wasi.ts";
import { type WasmMemory, wasm } from "./wasm-types.ts";

/** Where the data files are put in the engine's view of the world. */
export const ENGINE_ROOT = "/data";
const ROOT_PREFIX = "data/";

interface EngineExports {
  memory: WasmMemory;
  outpost_alloc(length: number): number;
  outpost_free(pointer: number, length: number): void;
  outpost_run(pointer: number, length: number): number;
}

/** The engine refused the request, or failed while working on it. The message is the engine's own. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

export class VoacapInstance {
  private readonly wasi: MemoryWasi;
  private readonly exports: EngineExports;
  private broken: string | null = null;

  constructor(bytes: Uint8Array, files: Iterable<[string, Uint8Array]>) {
    this.wasi = createMemoryWasi();
    for (const [path, content] of files) this.wasi.writeFile(ROOT_PREFIX + path, content);
    const module = new wasm.Module(bytes);
    const instance = new wasm.Instance(module, { wasi_snapshot_preview1: this.wasi.imports });
    this.exports = instance.exports as unknown as EngineExports;
    this.wasi.bind(this.exports.memory);
  }

  /** Adds or replaces one data file, by its path inside the engine's data folder ("antennas/outpost/tx"). */
  writeFile(path: string, bytes: Uint8Array): void {
    this.wasi.writeFile(ROOT_PREFIX + path, bytes);
  }

  /** Whether the engine can go on being used. After a trap its memory cannot be trusted. */
  get usable(): boolean {
    return this.broken === null;
  }

  /** Sends one request (without `root`, which is added here) and returns the parsed answer. */
  run<T>(request: Record<string, unknown>): T {
    if (this.broken) throw new EngineError(this.broken);
    const input = new TextEncoder().encode(JSON.stringify({ ...request, root: ENGINE_ROOT }));
    const { outpost_alloc, outpost_free, outpost_run, memory } = this.exports;
    let ok: boolean;
    let text: string;
    try {
      const inPointer = outpost_alloc(input.length);
      new Uint8Array(memory.buffer, inPointer, input.length).set(input);
      const outPointer = outpost_run(inPointer, input.length);
      outpost_free(inPointer, input.length);
      const length = new DataView(memory.buffer).getUint32(outPointer, true);
      ok = new Uint8Array(memory.buffer, outPointer + 4, 1)[0] === 1;
      text = new TextDecoder().decode(new Uint8Array(memory.buffer, outPointer + 5, length));
      outpost_free(outPointer, length + 5);
    } catch (error) {
      // A trap (a Rust panic, an out-of-bounds read) leaves the module's memory in an
      // unknown state, so this copy is never used again.
      const said = this.wasi.takeOutput().trim();
      const detail = error instanceof EngineExit ? error.message : said || (error instanceof Error ? error.message : String(error));
      this.broken = `The propagation engine stopped while working: ${detail}`;
      throw new EngineError(this.broken);
    }
    if (!ok) throw new EngineError(text);
    return JSON.parse(text) as T;
  }
}
