/**
 * Writes a gzip and a Brotli copy beside each built file that is worth compressing, once,
 * at build time. The server hands out whichever the browser accepts (`preCompressed` in
 * the server's static files) and never compresses a response itself, which would cost
 * the processor of a Raspberry Pi the same work on every request.
 *
 * Browsers ask for Brotli only over HTTPS; at a plain http address, which is how most
 * people reach Outpost on a home network, they are given the gzip copy.
 */
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";
import type { Plugin } from "vite";

const COMPRESSIBLE = new Set([".js", ".mjs", ".css", ".svg", ".json", ".webmanifest", ".wasm", ".pbf", ".bcmap", ".txt"]);
/** Too small to gain from it. */
const SMALLEST = 1024;
const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

export function precompress(): Plugin {
  let outDir = "";
  return {
    name: "outpost:precompress",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      order: "post",
      sequential: true,
      async handler() {
        const files = [...walk(outDir)].filter((file) => COMPRESSIBLE.has(path.extname(file)) && fs.statSync(file).size >= SMALLEST);
        // A few at a time: zlib's work runs on Node's small thread pool either way.
        for (let i = 0; i < files.length; i += 16) {
          await Promise.all(
            files.slice(i, i + 16).map(async (file) => {
              const bytes = await fs.promises.readFile(file);
              const [gz, br] = await Promise.all([
                gzip(bytes, { level: 9 }),
                brotli(bytes, {
                  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: bytes.length },
                }),
              ]);
              // Kept only where it saves something worth a second file.
              if (gz.length < bytes.length * 0.9) await fs.promises.writeFile(`${file}.gz`, gz);
              if (br.length < bytes.length * 0.9) await fs.promises.writeFile(`${file}.br`, br);
            }),
          );
        }
      },
    },
  };
}
