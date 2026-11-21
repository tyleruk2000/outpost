/**
 * A release, and the file it comes in.
 *
 * A release is described by `release.json`, signed with minisign as
 * `release.json.minisig`. The manifest names, for each platform, the Docker image file
 * (made with `docker save`, then gzip), its size and its SHA-256. So the signature
 * vouches for the manifest, and the manifest for the image.
 *
 * The release file a person carries on a USB stick, or uploads, is one zip,
 * `outpost-<release>-linux-<arch>.outpost-update`, holding the three: `release.json`,
 * `release.json.minisig` and the image. The release page also serves `latest.json`
 * (the same manifest with each platform's release file address) and its signature.
 *
 * Checking unpacks the image into the data directory while hashing it; nothing is used
 * until the signature and the hash both match. See docs/development/releases.md.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReleaseInfo } from "@outpost/shared";
import yauzl from "yauzl";
import { z } from "zod";
import { type PublicKey, parsePublicKey, SignatureError, verifyBytes } from "./minisign.ts";

export const MANIFEST = "release.json";
export const SIGNATURE = "release.json.minisig";
export const IMAGE = "image.tar.gz";
/** The largest image accepted: Outpost's image is a few hundred megabytes. */
export const MAX_IMAGE_BYTES = 4 * 1024 ** 3;
const MAX_SMALL = 256 * 1024;

const RELEASE = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.]{1,40})?$/;

const manifestSchema = z.object({
  format: z.literal("outpost-release"),
  version: z.literal(1),
  release: z.string().regex(RELEASE),
  publishedAt: z.string().max(40).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  platforms: z.record(
    z.string().regex(/^linux\/(arm64|amd64)$/),
    z.object({
      file: z.string().max(200),
      bytes: z.number().int().positive().max(MAX_IMAGE_BYTES),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      image: z.string().regex(/^outpost:[0-9A-Za-z.-]{1,60}$/),
      /** In latest.json only: where this platform's release file is. */
      url: z.string().url().optional(),
    }),
  ),
});
export type ReleaseManifest = z.infer<typeof manifestSchema>;

export class ReleaseRefused extends Error {}

/** This computer's platform as Docker names it. */
export function thisPlatform(arch: string = process.arch): string {
  return `linux/${arch === "x64" ? "amd64" : arch}`;
}

/** The release key in use, or null when this build has none. */
export function releaseKey(configured: string | null, builtIn: string): PublicKey | null {
  const text = (configured ?? builtIn).trim();
  return text ? parsePublicKey(text) : null;
}

/** Compares two releases, "0.10.0" after "0.9.2"; a release with a suffix ("-rc.1") before the same without. */
export function compareReleases(a: string, b: string): number {
  const split = (value: string) => {
    const [main = "", suffix = ""] = value.split("-", 2);
    return { parts: main.split(".").map(Number), suffix };
  };
  const x = split(a);
  const y = split(b);
  for (let index = 0; index < 3; index += 1) {
    const difference = (x.parts[index] ?? 0) - (y.parts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  if (x.suffix === y.suffix) return 0;
  if (!x.suffix) return 1;
  if (!y.suffix) return -1;
  return x.suffix < y.suffix ? -1 : 1;
}

/** Checks a signed manifest and picks this computer's image from it. Throws `ReleaseRefused` in words for a person. */
export function checkManifest(
  text: Buffer,
  signature: string,
  key: PublicKey,
  platform: string,
): { manifest: ReleaseManifest; info: ReleaseInfo } {
  let signedComment: string;
  try {
    signedComment = verifyBytes(text, signature, key);
  } catch (error) {
    throw new ReleaseRefused(
      error instanceof SignatureError ? `This is not a release signed by Outpost's release key. ${error.message}` : String(error),
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.toString("utf8"));
  } catch {
    throw new ReleaseRefused("Its manifest is signed but is not JSON.");
  }
  const result = manifestSchema.safeParse(parsed);
  if (!result.success) throw new ReleaseRefused("Its manifest is signed but is not one this version of Outpost understands.");
  const manifest = result.data;
  const entry = manifest.platforms[platform];
  if (!entry)
    throw new ReleaseRefused(
      `Release ${manifest.release} has no image for this computer (${platform}). Get the release file for ${platform}.`,
    );
  return {
    manifest,
    info: {
      release: manifest.release,
      publishedAt: manifest.publishedAt ?? null,
      notes: manifest.notes ?? null,
      platform,
      image: entry.image,
      bytes: entry.bytes,
      sha256: entry.sha256,
      signedComment,
    },
  };
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) =>
      error ? reject(new ReleaseRefused("It is not a release file (it does not open as one).")) : resolve(zip),
    ),
  );
}

const streamOf = (zip: yauzl.ZipFile, entry: yauzl.Entry) =>
  new Promise<NodeJS.ReadableStream>((resolve, reject) =>
    zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream))),
  );

/**
 * Checks a release file and unpacks it into `target` (an empty folder in the data
 * directory): the manifest's signature first, then the image against the size and hash
 * the manifest gives, as it is written. Throws `ReleaseRefused`; `target` may then hold
 * part of an image, and the caller removes it.
 */
export async function unpackRelease(
  file: string,
  target: string,
  key: PublicKey,
  platform: string,
  signal?: AbortSignal,
): Promise<ReleaseInfo> {
  const zip = await openZip(file);
  const small = new Map<string, Buffer>();
  const entries: yauzl.Entry[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry: yauzl.Entry) => {
        void (async () => {
          entries.push(entry);
          if (entry.fileName === MANIFEST || entry.fileName === SIGNATURE) {
            if (entry.uncompressedSize > MAX_SMALL) throw new ReleaseRefused(`Its ${entry.fileName} is far larger than one is.`);
            const chunks: Buffer[] = [];
            for await (const chunk of await streamOf(zip, entry)) chunks.push(chunk as Buffer);
            small.set(entry.fileName, Buffer.concat(chunks));
          }
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
    const text = small.get(MANIFEST);
    const signature = small.get(SIGNATURE);
    if (!text || !signature) throw new ReleaseRefused("It is not a release file: it has no signed release.json.");
    const { info, manifest } = checkManifest(text, signature.toString("utf8"), key, platform);
    const name = manifest.platforms[platform]!.file;
    const image = entries.find((entry) => entry.fileName === name);
    if (!image) throw new ReleaseRefused(`It has no ${name}, the image its manifest names.`);
    if (image.uncompressedSize !== info.bytes) throw new ReleaseRefused(`Its image is not the size its signed manifest gives.`);
    await fs.promises.writeFile(path.join(target, MANIFEST), text);
    await fs.promises.writeFile(path.join(target, SIGNATURE), signature);
    // Read again by position: the entries were listed in one pass, and the image is read now.
    const hash = crypto.createHash("sha256");
    let seen = 0;
    const counting = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        seen += chunk.length;
        if (seen > info.bytes) return done(new ReleaseRefused("Its image is larger than its signed manifest gives."));
        hash.update(chunk);
        done(null, chunk);
      },
    });
    const again = await openZip(file);
    try {
      const entry = await new Promise<yauzl.Entry>((resolve, reject) => {
        again.on("error", reject);
        again.on("entry", (candidate: yauzl.Entry) => (candidate.fileName === name ? resolve(candidate) : again.readEntry()));
        again.on("end", () => reject(new ReleaseRefused("Its image could not be read.")));
        again.readEntry();
      });
      await pipeline(await streamOf(again, entry), counting, fs.createWriteStream(path.join(target, IMAGE), { flags: "wx" }), { signal });
    } finally {
      again.close();
    }
    if (hash.digest("hex") !== info.sha256)
      throw new ReleaseRefused("Its image does not match the checksum in its signed manifest: it is damaged or has been changed.");
    return info;
  } finally {
    zip.close();
  }
}
