/**
 * The ITU's maps for P.533: an optional download, through the download manager, when a
 * person asks for it.
 *
 * They are 25 files in the ITU's own repository, at the same pinned commit as the
 * source: twelve monthly ionospheric maps (ionos01.bin to ionos12.bin, 11.2 MB each),
 * P.372's twelve monthly noise tables (COEFF01W.txt to COEFF12W.txt) and the P.1239
 * decile factors, 137 MB in all. They are fetched one after another into a single file
 * on the storage location chosen (the "bundle"), so that they are one row on the
 * Downloads screen, one collection under "Manage and clean up", and one thing to move
 * or remove. The engine reads each file from its place in the bundle and checks it
 * against its own checksum (`files.ts`).
 *
 * Fetching is resumable: what is already in the partial bundle is kept, and the file it
 * stops in is asked for from that byte on. The bundle's own checksum is verified by the
 * download manager before anything is installed, and every file's again here.
 */
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AppContext } from "../../../core/context.ts";
import { AppError, conflict } from "../../../core/errors.ts";
import { createHttpClient } from "../../../core/http.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { syncedWriteStream } from "../../../core/synced-write.ts";
import type { CollectionRow } from "../../collections/service.ts";
import type { DownloadRow, Fetcher, Installer } from "../../downloads/types.ts";
import { MapsBundle, type MapsManifest, P533_MANIFEST } from "./files.ts";

/** What marks a download or a collection as the P.533 maps. */
export const P533_MAPS = "p533-maps";
export const MAPS_FETCHER = "p533-maps";

export const isMapsDownload = (download: DownloadRow) => (download.meta as Record<string, unknown> | null)?.dataset === P533_MAPS;

const THROTTLE_SLICE_BYTES = 16 * 1024;

function fileUrl(maps: MapsManifest, path: string): string {
  return new URL(path.split("/").map(encodeURIComponent).join("/"), maps.baseUrl).toString();
}

/**
 * Fetches the files of a list like this one, one after another, into one bundle. Also
 * used for VOACAP's coefficients (`../engine-data.ts`), with its own words for where they
 * are and what they are.
 */
export function createMapsFetcher(
  ctx: AppContext,
  maps: () => MapsManifest,
  words: { where: string; what: string } = { where: "the ITU's repository", what: "the maps" },
): Fetcher {
  const client = createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads });
  ctx.onClose.push(() => client.close());
  return async (context) => {
    const manifest = maps();
    const { partPath, signal } = context;
    let have = 0;
    try {
      have = (await fs.promises.stat(partPath)).size;
    } catch {
      have = 0;
    }
    if (have > manifest.bytes) {
      await fs.promises.rm(partPath, { force: true });
      have = 0;
    }
    context.progress(have, manifest.bytes);
    for (const file of manifest.files) {
      const end = file.offset + file.bytes;
      if (have >= end) continue;
      const from = have - file.offset;
      const headers: Record<string, string> = { "accept-encoding": "identity", connection: "close" };
      if (from > 0) headers.range = `bytes=${from}-`;
      const { response } = await client.fetch(fileUrl(manifest, file.path), { headers, signal, allowedHosts: context.allowedHosts });
      if (response.status === 404 || response.status === 410) {
        await response.body?.cancel();
        throw new PermanentJobError(`${file.name} is no longer at its address in ${words.where}.`, "not_found");
      }
      if (response.status >= 500 || response.status === 429) {
        await response.body?.cancel();
        throw new Error(`The server is busy or having trouble (HTTP ${response.status}). Outpost will try again.`);
      }
      if (response.status !== 200 && response.status !== 206) {
        await response.body?.cancel();
        throw new PermanentJobError(`The server refused ${file.name} (HTTP ${response.status}).`, "upstream");
      }
      // A server that ignores the range sends the whole file: drop what was there of it.
      if (from > 0 && response.status === 200) {
        await fs.promises.truncate(partPath, file.offset);
        have = file.offset;
      }
      // The size is known in advance: a file of another size is not the one listed.
      const length = Number(response.headers.get("content-length") ?? Number.NaN);
      if (Number.isFinite(length) && length !== end - have) {
        await response.body?.cancel();
        throw new PermanentJobError(
          `${file.name} on the server is ${length} bytes, not the ${file.bytes} Outpost expects, so ${words.what} were not downloaded.`,
          "upstream",
        );
      }
      if (!response.body) throw new Error(`The server sent nothing for ${file.name}. Outpost will try again.`);
      await pipeline(
        Readable.fromWeb(response.body as never),
        async function* count(chunks: AsyncIterable<Buffer>) {
          for await (const chunk of chunks) {
            for (let offset = 0; offset < chunk.length; offset += THROTTLE_SLICE_BYTES) {
              const slice = chunk.subarray(offset, offset + THROTTLE_SLICE_BYTES);
              if (have + slice.length > end) throw new Error(`More arrived for ${file.name} than it should hold. Outpost will try again.`);
              await context.throttle(slice.length);
              have += slice.length;
              context.progress(have, manifest.bytes, `Fetching ${file.name}`);
              yield slice;
            }
          }
        },
        syncedWriteStream(partPath, { flags: "a" }),
        { signal },
      );
      if (have < end)
        throw new Error(`The connection closed before ${file.name} was complete. Outpost will continue from where it stopped.`);
    }
    context.progress(have, manifest.bytes);
  };
}

export function createMapsInstaller(ctx: AppContext, maps: () => MapsManifest): Installer {
  return async ({ download, filePath, sizeBytes, sha256, progress }) => {
    const manifest = maps();
    if (sizeBytes !== manifest.bytes || sha256 !== manifest.sha256)
      throw new PermanentJobError("The downloaded maps are not the files Outpost expects, so they were not used.");
    // Each file once more, by its own checksum, before anything is recorded.
    const bundle = new MapsBundle(filePath, manifest);
    manifest.files.forEach((file, index) => {
      progress(index, manifest.files.length, `Checking ${file.name}`);
      bundle.read(file.name);
    });
    const collection = await ctx.services.collections.create({
      kind: "dataset",
      title: "ITU-R P.533 ionospheric and noise maps",
      description:
        "The ITU's monthly ionospheric maps for Recommendation P.533 and P.372's noise tables, as published in the ITU's ITU-R-HF repository. Used only by the second HF propagation model.",
      category: "Radio",
      publisher: "ITU-R Study Group 3",
      license: "The ITU's terms; not an open-source licence (see engines/p533/NOTICE.txt)",
      attribution: "International Telecommunication Union, ITU-R Study Group 3",
      version: `${P533_MANIFEST.source.commit.slice(0, 12)}`,
      locationId: download.locationId,
      relPath: download.relPath,
      sizeBytes,
      sha256,
      meta: { dataset: P533_MAPS },
    });
    ctx.events.publish({ type: "propagation.changed" });
    return { collectionId: collection.id };
  };
}

/** The installed maps, if any: the newest collection that is the P.533 maps and is in place. */
export function installedMaps(ctx: AppContext): { collection: CollectionRow; file: string } | null {
  const rows = ctx.services.collections
    .list({ kind: "dataset" })
    .filter((row) => (row.meta as Record<string, unknown> | null)?.dataset === P533_MAPS && row.status === "installed");
  for (const row of rows) {
    try {
      return { collection: row, file: ctx.services.collections.absolutePath(row.id) };
    } catch {
      // Its storage location is not connected: try the next.
    }
  }
  return null;
}

export async function startMapsDownload(ctx: AppContext, maps: MapsManifest, locationId?: string): Promise<DownloadRow> {
  const host = new URL(maps.baseUrl).hostname;
  try {
    return await ctx.services.downloads.start({
      kind: "dataset",
      title: "ITU-R P.533 ionospheric and noise maps",
      url: maps.baseUrl,
      fetcher: MAPS_FETCHER,
      locationId,
      relPath: `collections/propagation/itu-p533-maps-${P533_MANIFEST.source.commit.slice(0, 12)}.bin`,
      sizeBytes: maps.bytes,
      sha256: maps.sha256,
      allowedHosts: [host],
      meta: { dataset: P533_MAPS },
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "conflict")
      throw conflict(`The P.533 maps are already downloaded or on their way. ${error.message}`);
    throw error;
  }
}
