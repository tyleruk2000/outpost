/**
 * The system calls the ITU's ITURHFProp makes, answered from memory.
 *
 * ITURHFProp is a command-line program: it reads an input file named on its command
 * line, reads its data files, and writes a report to a second file. Built for WASI it
 * asks for exactly those things through thirteen calls, implemented here over a map of
 * file names to bytes. It is given:
 *
 * - its command line, as Outpost writes it;
 * - the files Outpost puts in the map (the input, the month's maps, the noise and
 *   decile tables), which it can read and seek in and never change;
 * - one file it may create and write, the report, held in memory up to a fixed size.
 *
 * It cannot see or touch anything else on the computer: there is no real folder behind
 * any of this. `..` at the top of the tree stays at the top, as it does on a real disk,
 * so the ITU's own `DataFilePath "../Data/"` finds `Data/`.
 *
 * Numbers and layouts are from the WASI preview 1 specification
 * (https://github.com/WebAssembly/WASI/blob/main/legacy/preview1/docs.md). The VOACAP
 * engine has its own, read-only shim (`../voacap/wasi.ts`); this one is kept apart so
 * that neither engine's needs widen the other's.
 */

import type { WasmMemory } from "../voacap/wasm-types.ts";

const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const ERRNO_FBIG = 22;
const ERRNO_INVAL = 28;
const ERRNO_NOENT = 44;
const ERRNO_ROFS = 69;

const FILETYPE_CHARACTER_DEVICE = 2;
const FILETYPE_DIRECTORY = 3;
const FILETYPE_REGULAR_FILE = 4;

const OFLAGS_CREAT = 1;
const OFLAGS_DIRECTORY = 2;
const OFLAGS_TRUNC = 8;

const WHENCE_SET = 0;
const WHENCE_CUR = 1;
const WHENCE_END = 2;

/** The one folder the program is given, as file descriptor 3. */
const ROOT_FD = 3;
const ROOT_NAME = "/";

/** What the program wrote to its own screen, kept only to explain a failure. */
const CONSOLE_LIMIT = 16_000;

interface OpenFile {
  path: string;
  /** Read-only files share the bytes they were given. */
  bytes: Uint8Array;
  position: number;
  writable: boolean;
}

/** Thrown when the program ends, normally or not; `code` is its exit status. */
export class ProgramExit extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`The program ended with code ${code}.`);
    this.name = "ProgramExit";
    this.code = code;
  }
}

export interface P533Wasi {
  imports: Record<string, (...args: never[]) => number>;
  bind(memory: WasmMemory): void;
  /** What the program wrote to the one file it may write, or null if it never opened it. */
  output(): Uint8Array | null;
  /** What it printed (standard output and error together), up to a limit. */
  console(): string;
}

export interface P533WasiOptions {
  /** The command line, program name first. */
  args: string[];
  /** Files the program may read, by path without a leading slash. */
  files: Map<string, Uint8Array>;
  /** The one path it may create and write. */
  outputPath: string;
  /** Largest report it may write, in bytes. */
  outputLimit: number;
}

/** "a//b/./c", "/a/b/c" and "../a/b/c" all name "a/b/c". */
export function normalisePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export function createP533Wasi(options: P533WasiOptions): P533Wasi {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  for (const [name, bytes] of options.files) files.set(normalisePath(name), bytes);
  const outputPath = normalisePath(options.outputPath);
  const args = options.args.map((arg) => encoder.encode(`${arg}\0`));

  const open = new Map<number, OpenFile>();
  let nextFd = ROOT_FD + 1;
  let memory: WasmMemory | undefined;
  let consoleText = "";
  /** The report as written so far: chunks, and the length of the file. */
  let report: { chunks: Uint8Array[]; length: number } | null = null;

  const view = () => new DataView(memory!.buffer);
  const bytes = (pointer: number, length: number) => new Uint8Array(memory!.buffer, pointer, length);

  const reportBytes = (): Uint8Array => {
    if (!report) return new Uint8Array(0);
    if (report.chunks.length === 1) return report.chunks[0]!;
    const joined = new Uint8Array(report.length);
    let at = 0;
    for (const chunk of report.chunks) {
      joined.set(chunk, at);
      at += chunk.length;
    }
    report.chunks = [joined];
    return joined;
  };

  const isDirectory = (path: string) => {
    if (path === "") return true;
    const prefix = `${path}/`;
    for (const name of files.keys()) if (name.startsWith(prefix)) return true;
    return false;
  };

  const imports = {
    args_sizes_get(countPointer: number, sizePointer: number): number {
      view().setUint32(countPointer, args.length, true);
      view().setUint32(
        sizePointer,
        args.reduce((sum, arg) => sum + arg.length, 0),
        true,
      );
      return ERRNO_SUCCESS;
    },
    args_get(argvPointer: number, bufferPointer: number): number {
      let at = bufferPointer;
      args.forEach((arg, i) => {
        view().setUint32(argvPointer + i * 4, at, true);
        bytes(at, arg.length).set(arg);
        at += arg.length;
      });
      return ERRNO_SUCCESS;
    },
    clock_time_get(_clock: number, _precision: bigint, timePointer: number): number {
      // Only ever printed, as the time the analysis was prepared.
      view().setBigUint64(timePointer, BigInt(Date.now()) * 1_000_000n, true);
      return ERRNO_SUCCESS;
    },
    fd_prestat_get(fd: number, pointer: number): number {
      if (fd !== ROOT_FD) return ERRNO_BADF;
      view().setUint8(pointer, 0);
      view().setUint32(pointer + 4, encoder.encode(ROOT_NAME).length, true);
      return ERRNO_SUCCESS;
    },
    fd_prestat_dir_name(fd: number, pointer: number, length: number): number {
      if (fd !== ROOT_FD) return ERRNO_BADF;
      bytes(pointer, length).set(encoder.encode(ROOT_NAME).subarray(0, length));
      return ERRNO_SUCCESS;
    },
    fd_fdstat_get(fd: number, pointer: number): number {
      const type = fd <= 2 ? FILETYPE_CHARACTER_DEVICE : fd === ROOT_FD ? FILETYPE_DIRECTORY : open.has(fd) ? FILETYPE_REGULAR_FILE : -1;
      if (type < 0) return ERRNO_BADF;
      bytes(pointer, 24).fill(0);
      view().setUint8(pointer, type);
      // Every right: what may be done is decided by the calls below, not by these bits.
      view().setBigUint64(pointer + 8, 0xffff_ffff_ffff_ffffn, true);
      view().setBigUint64(pointer + 16, 0xffff_ffff_ffff_ffffn, true);
      return ERRNO_SUCCESS;
    },
    fd_fdstat_set_flags(fd: number): number {
      return fd <= 2 || open.has(fd) ? ERRNO_SUCCESS : ERRNO_BADF;
    },
    path_open(
      dirFd: number,
      _dirFlags: number,
      pathPointer: number,
      pathLength: number,
      openFlags: number,
      _rights: bigint,
      _inheriting: bigint,
      _fdFlags: number,
      fdPointer: number,
    ): number {
      if (dirFd !== ROOT_FD) return ERRNO_BADF;
      const path = normalisePath(decoder.decode(bytes(pathPointer, pathLength)));
      if (openFlags & OFLAGS_DIRECTORY || isDirectory(path)) return ERRNO_NOENT;
      let file: OpenFile;
      if (path === outputPath) {
        // The report: made empty when opened for writing, as "w" does.
        if (openFlags & (OFLAGS_CREAT | OFLAGS_TRUNC) || !report) report = { chunks: [], length: 0 };
        file = { path, bytes: new Uint8Array(0), position: 0, writable: true };
      } else {
        if (openFlags & (OFLAGS_CREAT | OFLAGS_TRUNC)) return ERRNO_ROFS;
        const found = files.get(path);
        if (!found) return ERRNO_NOENT;
        file = { path, bytes: found, position: 0, writable: false };
      }
      const fd = nextFd++;
      open.set(fd, file);
      view().setUint32(fdPointer, fd, true);
      return ERRNO_SUCCESS;
    },
    fd_read(fd: number, iovsPointer: number, iovsLength: number, readPointer: number): number {
      const file = open.get(fd);
      if (!file) return ERRNO_BADF;
      const source = file.writable ? reportBytes() : file.bytes;
      let total = 0;
      for (let i = 0; i < iovsLength; i++) {
        const pointer = view().getUint32(iovsPointer + i * 8, true);
        const length = view().getUint32(iovsPointer + i * 8 + 4, true);
        const chunk = source.subarray(file.position, file.position + length);
        bytes(pointer, chunk.length).set(chunk);
        file.position += chunk.length;
        total += chunk.length;
        if (chunk.length < length) break;
      }
      view().setUint32(readPointer, total, true);
      return ERRNO_SUCCESS;
    },
    fd_seek(fd: number, offset: bigint, whence: number, resultPointer: number): number {
      const file = open.get(fd);
      if (!file) return ERRNO_BADF;
      const size = file.writable ? (report?.length ?? 0) : file.bytes.length;
      const base = whence === WHENCE_SET ? 0 : whence === WHENCE_CUR ? file.position : whence === WHENCE_END ? size : -1;
      if (base < 0) return ERRNO_INVAL;
      const position = base + Number(offset);
      if (position < 0 || (file.writable && position !== size)) return ERRNO_INVAL;
      file.position = position;
      view().setBigUint64(resultPointer, BigInt(position), true);
      return ERRNO_SUCCESS;
    },
    fd_write(fd: number, iovsPointer: number, iovsLength: number, writtenPointer: number): number {
      const file = fd > 2 ? open.get(fd) : undefined;
      if (fd > 2 && !file?.writable) return ERRNO_BADF;
      let total = 0;
      for (let i = 0; i < iovsLength; i++) {
        const pointer = view().getUint32(iovsPointer + i * 8, true);
        const length = view().getUint32(iovsPointer + i * 8 + 4, true);
        if (file && report) {
          if (report.length + length > options.outputLimit) return ERRNO_FBIG;
          report.chunks.push(bytes(pointer, length).slice());
          report.length += length;
          file.position = report.length;
        } else if (consoleText.length < CONSOLE_LIMIT) {
          consoleText += decoder.decode(bytes(pointer, length));
        }
        total += length;
      }
      view().setUint32(writtenPointer, total, true);
      return ERRNO_SUCCESS;
    },
    fd_close(fd: number): number {
      return open.delete(fd) ? ERRNO_SUCCESS : ERRNO_BADF;
    },
    proc_exit(code: number): number {
      throw new ProgramExit(code);
    },
  };

  return {
    imports: imports as unknown as P533Wasi["imports"],
    bind(bound) {
      memory = bound;
    },
    output() {
      return report ? reportBytes() : null;
    },
    console() {
      return consoleText;
    },
  };
}
