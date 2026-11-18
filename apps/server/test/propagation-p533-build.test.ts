/**
 * "Build the P.533 engine": Outpost fetching the ITU's source and a compiler and
 * building the second model's engine itself, on a real server.
 *
 * Nothing of the ITU's and no compiler is in the repository, and no test reaches the
 * internet. The source here is stand-in files under the ITU's names, each saying it is
 * one; the compiler is a stand-in too, two shell scripts in an archive, which copies
 * what it is given: a "compiled" file is its source, and the "linked" program is its
 * objects one after another. That is enough to hold the job to its promises: every file
 * by its checksum, the real recipe run, the result installed only when it is the
 * recorded one, and nothing left behind.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { SecondModelStatus } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { appRoot } from "../src/core/paths.ts";
import { BUILD_JOB, type BuildManifest } from "../src/modules/propagation/p533/build.ts";
import { P533_MANIFEST } from "../src/modules/propagation/p533/files.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const here = `${process.platform}-${process.arch}`;
/** A developer who has built the real engine has it in the repository's folder, where the server also looks. */
const builtHere = fs.existsSync(path.join(appRoot, "engines/p533/engine", P533_MANIFEST.wasm.file));

const CLANG = `#!/bin/sh
# A stand-in for the compiler, for Outpost's tests. It compiles nothing: what it writes
# is what it was given, one file after another.
case "$1" in --version) echo "clang version stand-in"; exit 0 ;; esac
out=""
inputs=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    *.c|*.o) inputs="$inputs $1" ;;
  esac
  shift
done
cat $inputs > "$out"
`;
const NM = "#!/bin/sh\n# A stand-in: no symbols, so nothing is defined twice.\nexit 0\n";

/** The ITU's file names, each with a few bytes that say what they are. */
const sources = P533_MANIFEST.source.compiled.map((file) => ({
  path: file.path,
  bytes: Buffer.from(`/* A stand-in for ${path.basename(file.path)}, written for Outpost's tests: not the ITU's source. */\n`),
}));

/** What the recipe gives with the stand-in compiler: the objects of the files it names, in the order the shell lists them. */
function expectedProgram(): Buffer {
  const recipe = fs.readFileSync(path.join(appRoot, "engines/p533/build/compile.sh"), "utf8").replace(/\\\n/g, " ");
  const objects: Array<{ name: string; bytes: Buffer }> = [];
  for (const [, module, files] of recipe.matchAll(/^compile (\S+) (?:-std=\S+|"") (.+)$/gm)) {
    for (const file of files!.trim().split(/\s+/)) {
      const source = sources.find((candidate) => candidate.path === `${module}/${file}`);
      if (!source) throw new Error(`The recipe compiles ${module}/${file}, which the manifest does not list.`);
      objects.push({ name: `${path.basename(module!)}-${path.basename(file, ".c")}.o`, bytes: source.bytes });
    }
  }
  objects.push({ name: "outpost-dl.o", bytes: fs.readFileSync(path.join(appRoot, "engines/p533/glue/outpost-dl.c")) });
  objects.sort((a, b) => (a.name < b.name ? -1 : 1));
  return Buffer.concat(objects.map((object) => object.bytes));
}

let app: TestApp | undefined;
let server: http.Server | undefined;
const scratch = tempDir("outpost-p533-build-");
const asked: string[] = [];

afterEach(async () => {
  await app?.close();
  app = undefined;
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(null)));
  server = undefined;
  asked.length = 0;
});

/** A server with the stand-in source and compiler, and an Outpost told to build from it. */
async function outpost(change: (manifest: BuildManifest) => void = () => {}) {
  const sdk = path.join(scratch, "stand-in-sdk");
  fs.rmSync(sdk, { recursive: true, force: true });
  fs.mkdirSync(path.join(sdk, "bin"), { recursive: true });
  fs.writeFileSync(path.join(sdk, "bin/clang"), CLANG, { mode: 0o755 });
  fs.writeFileSync(path.join(sdk, "bin/llvm-nm"), NM, { mode: 0o755 });
  execFileSync("tar", ["-czf", "stand-in-sdk.tar.gz", "stand-in-sdk"], { cwd: scratch });
  const archive = fs.readFileSync(path.join(scratch, "stand-in-sdk.tar.gz"));
  const files = new Map<string, Buffer>([
    ["toolchain/stand-in-sdk.tar.gz", archive],
    ...sources.map((file) => [file.path, file.bytes] as const),
  ]);

  server = http.createServer((request, response) => {
    const name = decodeURIComponent((request.url ?? "/").slice(1));
    asked.push(name);
    const bytes = files.get(name);
    if (!bytes) return void response.writeHead(404).end();
    response.writeHead(200, { "content-length": bytes.length }).end(bytes);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  const manifest: BuildManifest = {
    source: {
      baseUrl: base,
      committedAt: P533_MANIFEST.source.committedAt,
      compiled: sources.map((file) => ({ path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes) })),
    },
    toolchains: {
      [here]: { url: `${base}toolchain/stand-in-sdk.tar.gz`, folder: "stand-in-sdk", bytes: archive.length, sha256: sha256(archive) },
    },
    unpackedBytes: 1_000_000,
    wasm: { file: P533_MANIFEST.wasm.file, bytes: expectedProgram().length, sha256: sha256(expectedProgram()) },
  };
  change(manifest);
  const file = path.join(scratch, "build.json");
  fs.writeFileSync(file, JSON.stringify(manifest));
  app = await createTestApp({ OUTPOST_P533_BUILD_MANIFEST: file });
  return app;
}

const status = async (target: TestApp) => (await target.api<SecondModelStatus>("GET", "/api/radio/propagation/second-model")).body;
const home = (target: TestApp) => path.join(target.ctx.config.dataDir, "propagation/p533");

/** Presses the button, or where the real engine is already on this computer (and the button is not offered), queues the same job. */
async function build(target: TestApp) {
  if (builtHere) target.ctx.jobs.enqueue(BUILD_JOB, {}, { title: "Building the P.533 engine" });
  else expect((await target.api("POST", "/api/radio/propagation/second-model/engine/build", {})).status).toBe(200);
  await target.ctx.jobs.whenIdle();
  return target.ctx.jobs.list({ types: [BUILD_JOB], limit: 1 })[0]!;
}

describe("the list of what a build fetches", () => {
  it("names the 39 files the script's tree checksum is made of", () => {
    const { compiled, treeSha256, files, bytes } = P533_MANIFEST.source;
    const lines = compiled.map((file) => `${file.path} ${file.sha256}`);
    expect(compiled).toHaveLength(files);
    expect(sha256(lines.join("\n"))).toBe(treeSha256);
    expect(compiled.reduce((sum, file) => sum + file.bytes, 0)).toBe(bytes);
    expect(P533_MANIFEST.source.baseUrl).toBe(
      `https://raw.githubusercontent.com/ITU-R-Study-Group-3/ITU-R-HF/${P533_MANIFEST.source.commit}/`,
    );
  });

  it("takes the compiler from its project's releases, at the version the container's is pinned to", () => {
    const toolchains = Object.entries(P533_MANIFEST.build.toolchains);
    expect(toolchains.map(([kind]) => kind).sort()).toEqual(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]);
    for (const [, toolchain] of toolchains) {
      expect(toolchain.url).toBe(`https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-34/${toolchain.folder}.tar.gz`);
      expect(toolchain.folder).toContain(`wasi-sdk-${P533_MANIFEST.build.wasiSdk}-`);
      expect(toolchain.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe.skipIf(process.platform === "win32")("building the engine from inside Outpost", () => {
  it("offers it, with what it downloads, and asks nobody until it is pressed", async () => {
    const target = await outpost();
    const state = await status(target);
    expect(state.engine.build).toMatchObject({ possible: true, reason: null, running: false, progress: null, failed: null });
    expect(state.engine.build.downloadBytes).toBeGreaterThan(sources.reduce((sum, file) => sum + file.bytes.length, 0));
    if (!builtHere) expect(state.line).toContain("press Build the P.533 engine");
    expect(asked).toEqual([]);
  });

  it("fetches the source and the compiler, runs the recipe, installs the recorded file and leaves nothing else", async () => {
    const target = await outpost();
    const job = await build(target);
    expect(job.error).toBeNull();
    expect(job.state).toBe("succeeded");
    // Every file the manifest lists, and the compiler, once each.
    expect(asked.slice().sort()).toEqual([...sources.map((file) => file.path), "toolchain/stand-in-sdk.tar.gz"].sort());
    expect(fs.readdirSync(home(target))).toEqual([P533_MANIFEST.wasm.file]);
    expect(fs.readFileSync(path.join(home(target), P533_MANIFEST.wasm.file)).equals(expectedProgram())).toBe(true);
    expect(job.result).toMatchObject({ bytes: expectedProgram().length, sha256: sha256(expectedProgram()) });
    // A stand-in is never taken for the ITU's program: the engine itself is still held to the recorded checksum.
    const state = await status(target);
    expect(state.offered).toBe(false);
    expect(state.engine.problem).toContain("is not the file Outpost expects");
  });

  it("installs nothing when the build is not, byte for byte, the recorded file", async () => {
    const target = await outpost((manifest) => {
      manifest.wasm.sha256 = "0".repeat(64);
    });
    const job = await build(target);
    expect(job.state).toBe("failed");
    expect(job.attempts).toBe(1);
    expect(job.error).toMatch(/not the recorded 0000000000000000…, so it was not installed/);
    expect(fs.readdirSync(home(target))).toEqual([]);
    if (!builtHere) expect((await status(target)).engine.build.failed).toContain("was not installed");
  });

  it("never runs a compiler that is not the one recorded", async () => {
    const target = await outpost((manifest) => {
      manifest.toolchains[here]!.sha256 = "0".repeat(64);
    });
    const job = await build(target);
    expect(job.state).toBe("failed");
    expect(job.error).toContain("the compiler (wasi-sdk) is not the file Outpost expects");
    expect(fs.readdirSync(home(target))).toEqual([]);
  });

  it("stops at a source file that is not the one recorded, before the compiler is asked for", async () => {
    const target = await outpost((manifest) => {
      manifest.source.compiled[3]!.sha256 = "0".repeat(64);
    });
    const job = await build(target);
    expect(job.state).toBe("failed");
    expect(job.error).toContain(`${path.basename(sources[3]!.path)} is not the file Outpost expects`);
    expect(asked).not.toContain("toolchain/stand-in-sdk.tar.gz");
    expect(fs.readdirSync(home(target))).toEqual([]);
  });

  it("says so where the compiler is not published for this kind of computer, and starts nothing", async () => {
    const target = await outpost((manifest) => {
      manifest.toolchains = {};
    });
    const state = await status(target);
    expect(state.engine.build.possible).toBe(false);
    expect(state.engine.build.reason).toContain("node scripts/build-p533-engine.mjs");
    const pressed = await target.api("POST", "/api/radio/propagation/second-model/engine/build", {});
    expect(pressed.status).toBe(builtHere ? 409 : 415);
    expect(target.ctx.jobs.list({ types: [BUILD_JOB] })).toEqual([]);
    expect(asked).toEqual([]);
  });
});
