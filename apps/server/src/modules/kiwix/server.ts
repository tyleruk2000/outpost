/**
 * The kiwix-serve process Outpost reads reference collections through.
 *
 * Two ways to have one:
 *  - an address (`OUTPOST_KIWIX_URL`): a server someone else runs, which in the Compose
 *    stack is the `kiwix` container;
 *  - a program (`OUTPOST_KIWIX_BIN`): Outpost starts kiwix-serve itself on a private
 *    port and restarts it if it stops. Portable drives and installs without Docker use
 *    this.
 *
 * Either way kiwix-serve is never exposed directly: browsers reach it only through
 * Outpost's own proxy.
 */
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import type { FastifyBaseLogger } from "fastify";

export interface KiwixConnection {
  readonly mode: "external" | "managed" | "none";
  /** Base address when a server is expected to be there. */
  baseUrl(): string | undefined;
  /** True when kiwix-serve answered recently. */
  isUp(): Promise<boolean>;
  /** Why reference collections cannot be read, in plain words; undefined when they can. */
  problem(): string | undefined;
  close(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

export function createKiwixConnection(options: { url?: string; bin?: string; libraryPath: string; log: FastifyBaseLogger }): KiwixConnection {
  const { log, libraryPath } = options;
  let base = options.url;
  let child: ChildProcess | undefined;
  let stopping = false;
  let restarts = 0;
  let lastProblem: string | undefined;
  let lastCheck = { at: 0, up: false };

  const mode: KiwixConnection["mode"] = options.url ? "external" : options.bin ? "managed" : "none";

  async function start(): Promise<void> {
    if (stopping || !options.bin) return;
    if (!fs.existsSync(options.bin)) {
      lastProblem = `The kiwix-serve program was not found at ${options.bin}.`;
      return;
    }
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(options.bin, ["--port", String(port), "--address", "127.0.0.1", "--library", "--monitorLibrary", "--nodatealiases", libraryPath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on("error", (error) => {
      lastProblem = `kiwix-serve could not be started: ${error.message}`;
      log.error({ err: error }, "kiwix-serve failed to start");
    });
    child.on("exit", (code) => {
      child = undefined;
      lastCheck = { at: 0, up: false };
      if (stopping) return;
      restarts += 1;
      lastProblem = `kiwix-serve stopped (code ${code}). ${stderr.trim().split("\n").at(-1) ?? ""}`.trim();
      log.warn({ code, restarts }, "kiwix-serve exited; restarting");
      // Back off so a binary that cannot run does not spin the processor.
      setTimeout(() => void start(), Math.min(30_000, 1000 * 2 ** Math.min(restarts, 5))).unref();
    });
    lastProblem = undefined;
  }

  if (mode === "managed") void start();

  return {
    mode,
    baseUrl: () => base,
    async isUp() {
      if (!base) return false;
      if (Date.now() - lastCheck.at < 5_000) return lastCheck.up;
      let up = false;
      try {
        const response = await fetch(`${base}/catalog/v2/root.xml`, { signal: AbortSignal.timeout(2500) });
        await response.body?.cancel();
        up = response.ok;
      } catch {
        up = false;
      }
      lastCheck = { at: Date.now(), up };
      if (up) restarts = 0;
      return up;
    },
    problem() {
      if (mode === "none") {
        return "Reading reference collections needs the kiwix-serve program, which this installation does not have. With Docker it is the “kiwix” service in compose.yaml; otherwise set OUTPOST_KIWIX_BIN to the program's path.";
      }
      if (lastCheck.at > 0 && !lastCheck.up) {
        return lastProblem ?? (mode === "external" ? `The Kiwix server at ${base} is not answering. Check that its container is running.` : "kiwix-serve is starting.");
      }
      return lastProblem;
    },
    async close() {
      stopping = true;
      if (child) {
        const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
        child.kill("SIGTERM");
        await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
      }
    },
  };
}
