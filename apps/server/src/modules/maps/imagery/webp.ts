/**
 * Encoding image tiles as WebP.
 *
 * libwebp compiled to WebAssembly, as published in `@jsquash/webp` (Apache-2.0; libwebp
 * itself is BSD-3-Clause). It runs wherever Node runs, with no native build step. The
 * codec's own loader is bypassed: the `.wasm` file is read from disk and handed to it,
 * so nothing is looked up by URL. In the packaged app the file sits in
 * `server/imagery/` (scripts/build-app.mjs).
 *
 * WebP rather than JPEG because a tile at the edge of an area must be transparent
 * outside it, so that the coarser imagery underneath shows through; JPEG has no
 * transparency. At the quality chosen it is also about a third smaller than JPEG.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isBundled } from "../../../core/paths.ts";

/** Chosen by looking at Sentinel-2 and Blue Marble tiles side by side at 70, 75, 80 and 90 (docs/maps.md). */
export const WEBP_QUALITY = 78;

interface Codec {
  encode(data: Uint8ClampedArray | Uint8Array, width: number, height: number, options: Record<string, number>): Uint8Array | null;
}

/** libwebp's defaults as `@jsquash/webp` passes them (its meta.js), with our quality. */
const OPTIONS: Record<string, number> = {
  quality: WEBP_QUALITY,
  target_size: 0,
  target_PSNR: 0,
  method: 4,
  sns_strength: 50,
  filter_strength: 60,
  filter_sharpness: 0,
  filter_type: 1,
  partitions: 0,
  segments: 4,
  pass: 1,
  show_compressed: 0,
  preprocessing: 0,
  autofilter: 0,
  partition_limit: 0,
  alpha_compression: 1,
  alpha_filtering: 1,
  alpha_quality: 100,
  lossless: 0,
  exact: 0,
  image_hint: 0,
  emulate_jpeg_size: 0,
  thread_level: 0,
  low_memory: 0,
  near_lossless: 100,
  use_delta_palette: 0,
  use_sharp_yuv: 0,
};

let codec: Promise<Codec> | undefined;

function codecDir(): string {
  if (isBundled) return path.join(import.meta.dirname, "imagery");
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve("@jsquash/webp/package.json")), "codec/enc");
}

async function load(): Promise<Codec> {
  const dir = codecDir();
  const tryLoad = async (name: string): Promise<Codec> => {
    const factory = (await import(pathToFileURL(path.join(dir, `${name}.js`)).href)).default as (
      options: Record<string, unknown>,
    ) => Promise<Codec>;
    return factory({ wasmBinary: fs.readFileSync(path.join(dir, `${name}.wasm`)), noInitialRun: true });
  };
  // The SIMD build is about twice as fast; every current Node has SIMD, but keep the plain one as a fallback.
  return tryLoad("webp_enc_simd").catch(() => tryLoad("webp_enc"));
}

/** WebP of an RGBA picture, `width` × `height`. */
export async function encodeWebp(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  codec ??= load();
  const loaded = await codec;
  const out = loaded.encode(rgba, width, height, OPTIONS);
  if (!out) throw new Error("A map tile could not be encoded as WebP.");
  return new Uint8Array(out);
}
