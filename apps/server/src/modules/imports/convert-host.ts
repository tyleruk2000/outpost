/**
 * Converts imported files to pages in a process of their own.
 *
 * What converting a file costs depends on what is in it, not on its size: the Markdown
 * parser takes fourteen seconds over 120 kB of `*x*` written forty thousand times, and
 * an ordinary file of a few megabytes takes seconds and a gigabyte or more of memory
 * however well it is written. On the server's own thread either would stop every other
 * request being answered for that long, and the memory would be the server's.
 *
 * A worker thread would free the server's thread but not protect its memory: a worker
 * that runs out of its heap is ended alone most of the time, and has also been seen to
 * end the whole process (sixteen such crash reports were on the machine this was written
 * on, from another reader). A process that runs out of memory takes nothing with it. So
 * the converter is a child process with a heap limit of its own, and a file that runs
 * out of time or memory is reported as a file that could not be converted.
 *
 * One converter is kept while an import is using it, because starting one costs more
 * than converting a small file and an import is hundreds of small files. It is ended
 * when nothing has been asked of it for a while, when a file runs out of time, and when
 * the job that is waiting is stopped. Ending it is always safe: it holds nothing but the
 * text it was given.
 */
import { type ChildProcess, fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ImportConstructKind, ImportItemFormat } from "@outpost/shared";
import { AppError, type ErrorCode } from "../../core/errors.ts";
import { workerUrl } from "../../core/paths.ts";
import type { InAppTarget } from "../notes/content/index.ts";
import type { ConvertedPage } from "./convert.ts";

export type PageFormat = Exclude<ImportItemFormat, "csv" | "folder">;

export interface ConvertRequest {
  id: number;
  format: PageFormat;
  raw: string;
  /** What each address in the file points to inside Outpost, for the ones that point to anything. */
  links?: Record<string, InAppTarget>;
  /** Also count what the source holds that a page cannot (`scanConstructs`). */
  scan: boolean;
}

export type Constructs = Partial<Record<ImportConstructKind, number>>;

export type ConvertAnswer =
  | { id: number; ok: true; page: ConvertedPage; constructs: Constructs }
  | { id: number; ok: false; code: ErrorCode; message: string };

export interface ConvertOptions {
  links?: Record<string, InAppTarget>;
  scan?: boolean;
  /** Stops waiting, and ends the converter, when the job is paused, cancelled or shut down. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** A tighter heap than usual, for tests that show what running out of it does. */
  heapMb?: number;
}

/**
 * Longest one file may take. The largest file an import reads (4 MB) takes a few seconds
 * on a desktop computer; this leaves room for a Raspberry Pi and still ends a file that
 * would never finish.
 */
export const CONVERT_TIMEOUT_MS = 60_000;
/** How long the converter is kept after the last file, so that the next one need not start it again. */
const IDLE_MS = 10_000;
/**
 * JavaScript heap the converter may use. The heaviest 4 MB files measured needed 1.6 GB
 * to convert on the server's own thread, and every one of those becomes a page too large
 * to save; the largest file that does become a page needed about 0.6 GB.
 */
const CONVERTER_HEAP_MB = 1024;

const TOO_SLOW = "This file took too long to convert, so Outpost stopped.";
const STOPPED = "Converting this file stopped unexpectedly.";
const TOO_MUCH_MEMORY = "Converting this file needed more memory than Outpost allows.";

interface Waiting {
  resolve(answer: Extract<ConvertAnswer, { ok: true }>): void;
  reject(error: unknown): void;
}

let converter: ChildProcess | undefined;
let converterHeapMb = 0;
let nextId = 1;
let idle: NodeJS.Timeout | undefined;
/** The file the converter is on. Files are converted one at a time, in the order they were asked for. */
let current: { id: number; waiting: Waiting } | undefined;
let line: Promise<unknown> = Promise.resolve();

/** Whether a converter process is running, for tests. */
export const converterRunning = () => converter !== undefined;

function end(): void {
  clearTimeout(idle);
  idle = undefined;
  const ending = converter;
  converter = undefined;
  if (ending) {
    ending.removeAllListeners();
    ending.kill("SIGKILL");
  }
}

/** Ends the converter and tells whoever is waiting on it why. */
function fail(error: unknown): void {
  const waiting = current?.waiting;
  current = undefined;
  end();
  waiting?.reject(error);
}

function start(heapMb: number): ChildProcess {
  converterHeapMb = heapMb;
  const started = fork(fileURLToPath(workerUrl(new URL("./convert.worker.ts", import.meta.url), "convert")), [], {
    // Nothing of how this process was started is passed on but the limit on its memory.
    execArgv: [`--max-old-space-size=${heapMb}`],
    serialization: "advanced",
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  // The converter never keeps the server from stopping.
  started.unref();
  started.channel?.unref();
  started.on("message", (answer: ConvertAnswer) => {
    if (!current || answer.id !== current.id) return;
    const { waiting } = current;
    current = undefined;
    if (answer.ok) waiting.resolve(answer);
    else waiting.reject(new AppError(answer.code, answer.message));
  });
  started.on("error", () => fail(new AppError("unsupported", STOPPED)));
  // Out of memory, V8 ends the process itself: an abort signal, or its own exit status on Windows.
  started.on("exit", (code, signal) =>
    fail(new AppError("unsupported", signal === "SIGABRT" || signal === "SIGTRAP" || code === 134 ? TOO_MUCH_MEMORY : STOPPED)),
  );
  return started;
}

function convertNow(format: PageFormat, raw: string, options: ConvertOptions): Promise<Extract<ConvertAnswer, { ok: true }>> {
  const { signal } = options;
  return new Promise((resolve, reject) => {
    const stoppedBy = () => (signal?.reason instanceof Error ? signal.reason : new Error("Stopped"));
    if (signal?.aborted) {
      reject(stoppedBy());
      return;
    }
    clearTimeout(idle);
    idle = undefined;
    const heapMb = options.heapMb ?? CONVERTER_HEAP_MB;
    if (converter && converterHeapMb !== heapMb) end();
    converter ??= start(heapMb);
    const id = nextId++;
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (converter) {
        idle = setTimeout(end, IDLE_MS);
        idle.unref();
      }
    };
    current = {
      id,
      waiting: {
        resolve(answer) {
          done();
          resolve(answer);
        },
        reject(error) {
          done();
          reject(error);
        },
      },
    };
    const onAbort = () => fail(stoppedBy());
    const timer = setTimeout(() => fail(new AppError("unsupported", TOO_SLOW)), options.timeoutMs ?? CONVERT_TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      converter.send({ id, format, raw, links: options.links, scan: options.scan === true } satisfies ConvertRequest);
    } catch {
      // It died between files, and its exit has not been told yet.
      fail(new AppError("unsupported", STOPPED));
    }
  });
}

/**
 * Converts one file outside the server's process, in its turn. Rejects with an
 * `AppError` that says why in a sentence, or with the signal's reason when stopped.
 */
export function convertPageApart(
  format: PageFormat,
  raw: string,
  options: ConvertOptions = {},
): Promise<{ page: ConvertedPage; constructs: Constructs }> {
  const turn = line.then(() => convertNow(format, raw, options));
  line = turn.catch(() => {});
  return turn.then(({ page, constructs }) => ({ page, constructs }));
}
