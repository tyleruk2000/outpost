/**
 * The few system calls the propagation engine makes, answered from memory.
 *
 * The engine is a WebAssembly module built for WASI, the standard way for such a module
 * to ask for files and the time. Node has a WASI implementation, but it is marked
 * experimental, prints a warning, and would hand the engine a real folder. The engine
 * needs very little: to open and read its data files, to write a message if it fails,
 * and to read a clock. So those twelve calls are implemented here, over a map of file
 * names to bytes. The engine therefore cannot read or write anything on the computer:
 * the only files it can see are the ones Outpost put in the map.
 *
 * Numbers and layouts are from the WASI preview 1 specification
 * (https://github.com/WebAssembly/WASI/blob/main/legacy/preview1/docs.md).
 */

const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const ERRNO_NOENT = 44;
const ERRNO_ROFS = 69;

const FILETYPE_CHARACTER_DEVICE = 2;
const FILETYPE_DIRECTORY = 3;
const FILETYPE_REGULAR_FILE = 4;

const OFLAGS_CREAT = 1;
const OFLAGS_DIRECTORY = 2;
const OFLAGS_TRUNC = 8;

/** The one folder the engine is given, as file descriptor 3. */
const ROOT_FD = 3;
const ROOT_NAME = "/";

interface OpenFile {
  bytes: Uint8Array;
  position: number;
}

/** Thrown when the engine asks to stop (a Rust panic ends this way). */
export class EngineExit extends Error {
  readonly code: number;
  constructor(code: number, output: string) {
    super(output.trim() || `The engine stopped with code ${code}.`);
    this.name = "EngineExit";
    this.code = code;
  }
}

export interface MemoryWasi {
  /** The functions to hand to WebAssembly as `wasi_snapshot_preview1`. */
  imports: Record<string, (...args: never[]) => number>;
  /** Must be called once the module is instantiated, before anything runs. */
  bind(memory: WebAssembly.Memory): void;
  /** Adds or replaces a file. Paths have no leading slash: "data/coeffs/coeff01w.bin". */
  writeFile(path: string, bytes: Uint8Array): void;
  hasFile(path: string): boolean;
  /** Whatever the engine wrote to its error stream since this was last called. */
  takeOutput(): string;
}

/** "a//b/./c" and "/a/b/c" both name "a/b/c". Anything that climbs out is refused. */
function normalise(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  return parts.join("/");
}

export function createMemoryWasi(): MemoryWasi {
  const files = new Map<string, Uint8Array>();
  const open = new Map<number, OpenFile>();
  let nextFd = ROOT_FD + 1;
  let memory: WebAssembly.Memory | undefined;
  let output = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const view = () => new DataView(memory!.buffer);
  const bytes = (pointer: number, length: number) => new Uint8Array(memory!.buffer, pointer, length);

  const isDirectory = (path: string) => {
    if (path === "") return true;
    const prefix = `${path}/`;
    for (const name of files.keys()) if (name.startsWith(prefix)) return true;
    return false;
  };

  const imports = {
    environ_sizes_get(countPointer: number, sizePointer: number): number {
      view().setUint32(countPointer, 0, true);
      view().setUint32(sizePointer, 0, true);
      return ERRNO_SUCCESS;
    },
    environ_get(): number {
      return ERRNO_SUCCESS;
    },
    clock_time_get(_clock: number, _precision: bigint, timePointer: number): number {
      view().setBigUint64(timePointer, process.hrtime.bigint(), true);
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
    fd_filestat_get(fd: number, pointer: number): number {
      const file = open.get(fd);
      if (!file && fd !== ROOT_FD) return ERRNO_BADF;
      bytes(pointer, 64).fill(0);
      view().setUint8(pointer + 16, file ? FILETYPE_REGULAR_FILE : FILETYPE_DIRECTORY);
      view().setBigUint64(pointer + 24, 1n, true);
      view().setBigUint64(pointer + 32, BigInt(file?.bytes.length ?? 0), true);
      return ERRNO_SUCCESS;
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
      const path = normalise(decoder.decode(bytes(pathPointer, pathLength)));
      if (path === null) return ERRNO_NOENT;
      // Nothing can be made or emptied: the engine only ever reads.
      if (openFlags & (OFLAGS_CREAT | OFLAGS_TRUNC)) return ERRNO_ROFS;
      const found = files.get(path);
      if (!found) return ERRNO_NOENT;
      if (openFlags & OFLAGS_DIRECTORY || isDirectory(path)) return ERRNO_NOENT;
      const fd = nextFd++;
      open.set(fd, { bytes: found, position: 0 });
      view().setUint32(fdPointer, fd, true);
      return ERRNO_SUCCESS;
    },
    fd_read(fd: number, iovsPointer: number, iovsLength: number, readPointer: number): number {
      const file = open.get(fd);
      if (!file) return ERRNO_BADF;
      let total = 0;
      for (let i = 0; i < iovsLength; i++) {
        const pointer = view().getUint32(iovsPointer + i * 8, true);
        const length = view().getUint32(iovsPointer + i * 8 + 4, true);
        const chunk = file.bytes.subarray(file.position, file.position + length);
        bytes(pointer, chunk.length).set(chunk);
        file.position += chunk.length;
        total += chunk.length;
        if (chunk.length < length) break;
      }
      view().setUint32(readPointer, total, true);
      return ERRNO_SUCCESS;
    },
    fd_write(fd: number, iovsPointer: number, iovsLength: number, writtenPointer: number): number {
      if (fd !== 1 && fd !== 2) return ERRNO_BADF;
      let total = 0;
      for (let i = 0; i < iovsLength; i++) {
        const pointer = view().getUint32(iovsPointer + i * 8, true);
        const length = view().getUint32(iovsPointer + i * 8 + 4, true);
        // Kept short: this is only ever a message about why the engine stopped.
        if (output.length < 8_000) output += decoder.decode(bytes(pointer, length));
        total += length;
      }
      view().setUint32(writtenPointer, total, true);
      return ERRNO_SUCCESS;
    },
    fd_close(fd: number): number {
      return open.delete(fd) ? ERRNO_SUCCESS : ERRNO_BADF;
    },
    proc_exit(code: number): number {
      throw new EngineExit(code, output);
    },
  };

  return {
    imports: imports as unknown as MemoryWasi["imports"],
    bind(bound) {
      memory = bound;
    },
    writeFile(path, content) {
      const name = normalise(path);
      if (name === null || name === "") throw new Error(`Not a file name the engine can be given: ${path}`);
      files.set(name, content);
    },
    hasFile(path) {
      const name = normalise(path);
      return name !== null && files.has(name);
    },
    takeOutput() {
      const text = output;
      output = "";
      return text;
    },
  };
}
