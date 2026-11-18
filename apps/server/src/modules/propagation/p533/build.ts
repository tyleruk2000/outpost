/**
 * "Build the P.533 engine": the second model's engine compiled by Outpost itself, as a
 * job, for someone who has no shell on the computer that runs it (a Raspberry Pi in a
 * cupboard, Outpost in a container, where `scripts/build-p533-engine.mjs` cannot run).
 *
 * What the script does with git and Docker is done here without either:
 *
 *   1. The ITU's source, the 39 files that are compiled, each fetched from the ITU's
 *      repository at the pinned commit and held to its own checksum (`manifest.json`,
 *      `source.compiled`; together they are the script's tree checksum).
 *   2. The compiler, wasi-sdk at the pinned version for this kind of computer, fetched
 *      from its project's releases and held to its checksum before a byte of it is run.
 *   3. `engines/p533/build/compile.sh`, the same recipe the container runs, from a folder
 *      of its own in the data directory, with an environment of seven names and no more.
 *   4. The result, which must be the recorded file byte for byte. Only then is it put
 *      where the engine is looked for; anything else is thrown away and said.
 *
 * The folder, with the compiler in it (about 800 MB while it lasts), is deleted whether
 * the build worked or not. Nothing is fetched until a person presses for it, and nothing
 * of the ITU's or of the compiler's is kept but the one built file.
 *
 * This is the one place where Outpost runs a program it downloaded. It is a compiler,
 * pinned by SHA-256, run as the server's own user on the ITU's source and Outpost's glue,
 * started with `execFile` and a list of arguments.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AppContext } from "../../../core/context.ts";
import { createHttpClient, type HttpClient } from "../../../core/http.ts";
import { type JobRow, PermanentJobError } from "../../../core/jobs.ts";
import { appRoot } from "../../../core/paths.ts";
import { enginePaths, P533_MANIFEST } from "./files.ts";

export const BUILD_JOB = "propagation.p533-build";
/** A queue of its own (one at a time): a queue of large downloads must not hold a build up. */
const BUILD_QUEUE = "engine-build";

/**
 * Where github.com, which the compiler is asked of (the address is in `manifest.json`),
 * sends the request on to: the one host besides the first that the download may reach.
 */
const TOOLCHAIN_FILES_HOST = "release-assets.githubusercontent.com";

export interface BuildFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface Toolchain {
  url: string;
  /** The folder the archive unpacks to. */
  folder: string;
  bytes: number;
  sha256: string;
}

/** Everything a build needs to know. The built-in one is read from `manifest.json`. */
export interface BuildManifest {
  source: { baseUrl: string; committedAt: string; compiled: BuildFile[] };
  /** By `process.platform` and `process.arch`: "linux-arm64". */
  toolchains: Record<string, Toolchain>;
  /** Room the unpacked compiler takes, for the free-space check. */
  unpackedBytes: number;
  wasm: { file: string; bytes: number; sha256: string };
}

const builtIn: BuildManifest = {
  source: P533_MANIFEST.source,
  toolchains: P533_MANIFEST.build.toolchains,
  unpackedBytes: P533_MANIFEST.build.unpackedBytes,
  wasm: P533_MANIFEST.wasm,
};

/**
 * The built-in list, or for testing one named by OUTPOST_P533_BUILD_MANIFEST (a JSON
 * file of the same shape), so that the whole path can be tried against a local server
 * with a stand-in for the compiler.
 */
export function buildManifest(overridePath: string | null): BuildManifest {
  if (!overridePath) return builtIn;
  return JSON.parse(fs.readFileSync(overridePath, "utf8")) as BuildManifest;
}

const platformKey = () => `${process.platform}-${process.arch}`;
const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/** Outpost's own two parts of the build: the recipe and the glue. */
const recipe = () => ({ script: path.join(appRoot, "engines/p533/build/compile.sh"), glue: path.join(appRoot, "engines/p533/glue") });

export interface BuildOffer {
  /** Whether a build can be started on this computer. */
  possible: boolean;
  /** When it cannot: why, in a sentence. */
  reason: string | null;
  /** What a build downloads, and the room it needs while it runs. */
  downloadBytes: number;
  neededBytes: number;
}

/** Whether this computer can build the engine, without asking anyone. */
export function buildOffer(manifest: BuildManifest): BuildOffer {
  const toolchain = manifest.toolchains[platformKey()];
  const sourceBytes = manifest.source.compiled.reduce((sum, file) => sum + file.bytes, 0);
  const downloadBytes = (toolchain?.bytes ?? 0) + sourceBytes;
  const neededBytes = toolchain ? toolchain.bytes + manifest.unpackedBytes + 20_000_000 : 0;
  const { script, glue } = recipe();
  const reason = !toolchain
    ? `Outpost cannot build the engine on this kind of computer (${platformKey()}): the compiler it uses is not published for it. Build it with node scripts/build-p533-engine.mjs, which needs Docker.`
    : !fs.existsSync(script) || !fs.existsSync(glue)
      ? "This copy of Outpost does not hold the build recipe (engines/p533), so it cannot build the engine itself."
      : null;
  return { possible: reason === null, reason, downloadBytes, neededBytes };
}

const run = (program: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv; signal: AbortSignal }) =>
  new Promise<void>((resolve, reject) => {
    execFile(program, args, { ...options, maxBuffer: 4 * 1024 * 1024 }, (error, _out, stderr) => {
      if (!error) return resolve();
      if (options.signal.aborted) return reject(options.signal.reason ?? error);
      // The last of what it said: a compiler's first lines are rarely the reason.
      const said = String(stderr).trim().split("\n").slice(-6).join(" ").slice(-600);
      reject(new PermanentJobError(`${path.basename(program)} failed${said ? `: ${said}` : ` (${error.message})`}`));
    });
  });

async function fetchFile(
  client: HttpClient,
  url: string,
  to: string,
  expected: { bytes: number; sha256: string },
  options: { allowedHosts: string[]; name: string; signal: AbortSignal; onBytes?: (bytes: number) => void },
): Promise<void> {
  const { response } = await client.fetch(url, {
    headers: { "accept-encoding": "identity" },
    signal: options.signal,
    allowedHosts: options.allowedHosts,
    // Each hop is held to the hosts named: the compiler comes from its project's releases and nowhere else.
    everyHop: true,
  });
  if (response.status === 404 || response.status === 410) {
    await response.body?.cancel();
    throw new PermanentJobError(
      `${options.name} is no longer at its address (${new URL(url).hostname}), so the engine was not built.`,
      "not_found",
    );
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`${new URL(url).hostname} did not send ${options.name} (HTTP ${response.status}). Outpost will try again.`);
  }
  const hash = createHash("sha256");
  let received = 0;
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await pipeline(
    Readable.fromWeb(response.body as never),
    async function* count(chunks: AsyncIterable<Buffer>) {
      for await (const chunk of chunks) {
        received += chunk.length;
        // The size is known in advance: more than that is not the file listed.
        if (received > expected.bytes)
          throw new PermanentJobError(`${options.name} is larger than the file Outpost expects, so it was not used.`);
        hash.update(chunk);
        options.onBytes?.(received);
        yield chunk;
      }
    },
    fs.createWriteStream(to),
    { signal: options.signal },
  );
  if (received < expected.bytes) throw new Error(`The connection closed before ${options.name} was complete. Outpost will try again.`);
  if (hash.digest("hex") !== expected.sha256) {
    await fs.promises.rm(to, { force: true });
    throw new PermanentJobError(
      `${options.name} is not the file Outpost expects (its checksum differs), so it was not used and the engine was not built.`,
    );
  }
}

export interface EngineBuild {
  offer(): BuildOffer;
  /** The newest build job, whatever became of it. */
  latest(): JobRow | undefined;
  /** Starts a build, or gives the one already queued or under way. */
  start(): JobRow;
}

export function registerEngineBuild(ctx: AppContext): EngineBuild {
  const manifest = () => buildManifest(ctx.config.p533BuildManifest);
  const client = createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads });
  ctx.onClose.push(() => client.close());

  ctx.jobs.register(BUILD_JOB, {
    queue: BUILD_QUEUE,
    async run({ signal, progress }) {
      const list = manifest();
      const offer = buildOffer(list);
      const toolchain = list.toolchains[platformKey()];
      if (!offer.possible || !toolchain) throw new PermanentJobError(offer.reason ?? "The engine cannot be built here.");
      const home = path.dirname(enginePaths(ctx.config.dataDir)[0]!);
      const work = path.join(home, ".build");
      // Whatever an attempt that was cut off left behind.
      await fs.promises.rm(work, { recursive: true, force: true });
      await fs.promises.mkdir(work, { recursive: true });
      try {
        const { bavail, bsize } = await fs.promises.statfs(work);
        if (bavail * bsize < offer.neededBytes)
          throw new PermanentJobError(
            `Building the engine needs about ${megabytes(offer.neededBytes)} free where Outpost keeps its data, for the compiler while it is used; ${megabytes(bavail * bsize)} is free.`,
          );

        // 1. The ITU's source, each file by its own checksum.
        const sourceHosts = [new URL(list.source.baseUrl).hostname];
        for (const [index, file] of list.source.compiled.entries()) {
          signal.throwIfAborted();
          progress({
            current: 0,
            total: toolchain.bytes,
            message: `Fetching the ITU's source: ${index + 1} of ${list.source.compiled.length}`,
          });
          const url = new URL(file.path.split("/").map(encodeURIComponent).join("/"), list.source.baseUrl).toString();
          await fetchFile(client, url, path.join(work, "src", file.path), file, {
            allowedHosts: sourceHosts,
            name: path.basename(file.path),
            signal,
          });
        }

        // 2. The compiler, by its checksum, then unpacked and the archive dropped.
        const archive = path.join(work, "toolchain.tar.gz");
        await fetchFile(client, toolchain.url, archive, toolchain, {
          // The release's address answers with a redirect to where its files are kept.
          allowedHosts: [new URL(toolchain.url).hostname, TOOLCHAIN_FILES_HOST],
          name: "the compiler (wasi-sdk)",
          signal,
          onBytes: (bytes) => progress({ current: bytes, total: toolchain.bytes, message: "Fetching the compiler" }),
        });
        progress({ current: toolchain.bytes, total: toolchain.bytes, message: "Unpacking the compiler" });
        await run("tar", ["-xzf", "toolchain.tar.gz"], { cwd: work, signal });
        await fs.promises.rm(archive, { force: true });
        await fs.promises.rename(path.join(work, toolchain.folder), path.join(work, "sdk"));

        // 3. The same recipe as the container's, in this folder, by names without spaces in them.
        progress({ message: "Compiling" });
        const { script, glue } = recipe();
        await fs.promises.cp(glue, path.join(work, "glue"), { recursive: true });
        await fs.promises.mkdir(path.join(work, "out"));
        await run("sh", [script], {
          cwd: work,
          signal,
          env: {
            PATH: process.env.PATH ?? "/usr/bin:/bin",
            // The commit's time, so the compile time the program prints is the same everywhere.
            SOURCE_DATE_EPOCH: String(Math.floor(Date.parse(list.source.committedAt) / 1000)),
            P533_SRC: "src",
            P533_GLUE: "glue",
            P533_OUT: "out",
            P533_WORK: "work",
            WASI_SDK: "sdk",
          },
        });

        // 4. Byte for byte the recorded file, or nothing.
        const built = await fs.promises.readFile(path.join(work, "out", list.wasm.file));
        const sha256 = createHash("sha256").update(built).digest("hex");
        if (sha256 !== list.wasm.sha256)
          throw new PermanentJobError(
            `This build gave a file with checksum ${sha256.slice(0, 16)}… (${built.length} bytes), not the recorded ${list.wasm.sha256.slice(0, 16)}…, so it was not installed.`,
          );
        const target = path.join(home, list.wasm.file);
        await fs.promises.writeFile(`${target}.part`, built);
        await fs.promises.rename(`${target}.part`, target);
        return { file: target, bytes: built.length, sha256 };
      } finally {
        await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
      }
    },
    onSettled() {
      ctx.events.publish({ type: "propagation.changed" });
    },
  });

  const latest = () => ctx.jobs.list({ types: [BUILD_JOB], limit: 1 })[0];

  return {
    offer: () => buildOffer(manifest()),
    latest,
    start() {
      const running = latest();
      if (running && (running.state === "queued" || running.state === "running")) return running;
      // Three tries: a connection that drops part of the way through 190 MB is not a reason to give up.
      const job = ctx.jobs.enqueue(BUILD_JOB, {}, { title: "Building the P.533 engine", maxAttempts: 3 });
      ctx.events.publish({ type: "propagation.changed" });
      return job;
    },
  };
}
