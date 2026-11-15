/**
 * Node runtimes for portable drives.
 *
 * A drive needs one `node` binary per kind of computer it should start on. They come
 * from nodejs.org's official builds for the same Node version this server runs, are
 * checked against the published SHA-256 list, and are cached in the data directory so
 * that later drives can be made without a connection.
 *
 * The binary this server itself runs on is deliberately not copied: a Node installed
 * by a package manager is often linked against libraries that exist only on this
 * machine, and would not start anywhere else.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import { appRoot, isBundled } from "../../core/paths.ts";
import type { PortablePlatform } from "./launchers.ts";
import { extractOneFromTarGz } from "./tar.ts";

export const NODE_DIST_HOST = "nodejs.org";

export function binaryName(platform: PortablePlatform): string {
  return platform.startsWith("win-") ? "node.exe" : "node";
}

/** Name of the file on nodejs.org that holds the runtime for a platform. */
export function distFile(version: string, platform: PortablePlatform): string {
  return platform.startsWith("win-") ? `${platform}/node.exe` : `node-${version}-${platform}.tar.gz`;
}

export function cachePath(dataDir: string, version: string, platform: PortablePlatform): string {
  return path.join(dataDir, "runtimes", `node-${version}`, platform, binaryName(platform));
}

/**
 * A runtime that is already on this machine: in the cache, or, when Outpost is itself
 * running from a portable drive, in that drive's runtime folder.
 */
export function localRuntime(dataDir: string, version: string, platform: PortablePlatform): string | undefined {
  const cached = cachePath(dataDir, version, platform);
  if (fs.existsSync(cached)) return cached;
  if (isBundled) {
    const sibling = path.join(appRoot, "..", "runtime", platform, binaryName(platform));
    if (fs.existsSync(sibling)) return sibling;
  }
  return undefined;
}

export function parseShasums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([0-9a-f]{64})\s+(\S+)$/.exec(line.trim());
    if (match) sums.set(match[2]!, match[1]!);
  }
  return sums;
}

export interface RuntimeFetchOptions {
  dataDir: string;
  version: string;
  platform: PortablePlatform;
  http: HttpClient;
  /** Base address of the Node distribution; overridable for mirrors and tests. */
  distBase?: string;
  signal?: AbortSignal;
  onProgress?: (receivedBytes: number, totalBytes: number | null) => void;
}

/** Returns the path of a verified runtime for `platform`, downloading it if it is not cached. */
export async function ensureRuntime(options: RuntimeFetchOptions): Promise<string> {
  const { dataDir, version, platform, http, signal } = options;
  const existing = localRuntime(dataDir, version, platform);
  if (existing) return existing;

  const base = (options.distBase ?? `https://${NODE_DIST_HOST}/dist`).replace(/\/+$/, "");
  const host = new URL(base).hostname;
  const file = distFile(version, platform);

  const sumsResponse = await http.fetch(`${base}/${version}/SHASUMS256.txt`, { allowedHosts: [host], signal });
  if (!sumsResponse.response.ok) {
    throw new AppError("upstream", `The checksum list for Node ${version} could not be fetched (${sumsResponse.response.status}).`);
  }
  const expected = parseShasums(await sumsResponse.response.text()).get(file);
  if (!expected) throw new AppError("upstream", `Node ${version} has no official build for ${platform}.`);

  const destination = cachePath(dataDir, version, platform);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const archive = `${destination}.download`;
  const { response } = await http.fetch(`${base}/${version}/${file}`, { allowedHosts: [host], signal });
  if (!response.ok || !response.body) throw new AppError("upstream", `The Node runtime for ${platform} could not be downloaded (${response.status}).`);
  const total = Number(response.headers.get("content-length")) || null;

  const hash = createHash("sha256");
  let received = 0;
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      async function* (source) {
        for await (const chunk of source) {
          hash.update(chunk as Buffer);
          received += (chunk as Buffer).length;
          options.onProgress?.(received, total);
          yield chunk;
        }
      },
      fs.createWriteStream(archive),
      { signal },
    );
    if (hash.digest("hex") !== expected) {
      throw new AppError("upstream", `The Node runtime for ${platform} did not match its published checksum, so it was discarded.`);
    }
    if (file.endsWith(".tar.gz")) {
      const unpacked = `${destination}.unpack`;
      const found = await extractOneFromTarGz(fs.createReadStream(archive), (entry) => /^[^/]+\/bin\/node$/.test(entry), unpacked);
      if (!found) throw new AppError("upstream", `The Node archive for ${platform} did not contain the expected program.`);
      await fs.promises.rename(unpacked, destination);
    } else {
      await fs.promises.rename(archive, destination);
    }
    await fs.promises.chmod(destination, 0o755).catch(() => {});
    return destination;
  } finally {
    await fs.promises.rm(archive, { force: true });
    await fs.promises.rm(`${destination}.unpack`, { force: true });
  }
}
