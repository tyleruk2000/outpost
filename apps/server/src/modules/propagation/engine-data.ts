/**
 * VOACAP's coefficients in the running server: whether they are here, fetching them when
 * a person presses Download, taking over an earlier installation's copy, and removing
 * them. What the files are and how they are checked is in `voacap/coefficients.ts`.
 *
 * A download goes through the download manager like any other: the size is known before
 * it starts, it can be paused and resumed, and the bundle's checksum is checked before
 * anything is installed. The bundle stays on the storage location it was downloaded to, as
 * a collection, so that it is listed under "Manage and clean up" and removed from there; the
 * engine reads its own copy in the data directory, so a location that is away does not
 * stop predictions. Removing the collection removes that copy too.
 *
 * Nothing here makes a request except as the direct result of a person pressing Download.
 */
import fs from "node:fs";
import path from "node:path";
import type { EngineDataStatus } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict } from "../../core/errors.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import type { CollectionRow } from "../collections/service.ts";
import type { DownloadRow, Installer } from "../downloads/types.ts";
import type { EngineHost } from "./host.ts";
import { createMapsFetcher } from "./p533/maps.ts";
import {
  adoptCoefficients,
  type CoefficientsManifest,
  EngineDataMissing,
  missingLine,
  OLD_APP_COPY,
  readCoefficients,
  readInstalledInfo,
  removeWorkingCopy,
  splitBundle,
  updateInstalledInfo,
  workingCopyDir,
  writeWorkingCopy,
} from "./voacap/coefficients.ts";

/** What marks a download or a collection as these files. */
export const VOACAP_DATA = "voacap-coefficients";
const FETCHER = "voacap-coefficients";

export const WHY_NOT_SHIPPED =
  "They are CCIR data (the foF2, M(3000)F2 and radio noise maps of CCIR Reports 340 and 322), and the ITU has not given Outpost permission to pass them on, so they are fetched from the engine's own project when you ask.";
const REMOVAL_WARNING =
  "Without these files the HF propagation planner, coverage maps, radio plans and the log's comparison with predictions stop working until they are downloaded again.";

const ACTIVE = ["queued", "downloading", "verifying", "installing", "paused"];
const isOurs = (meta: unknown) => (meta as Record<string, unknown> | null)?.dataset === VOACAP_DATA;

export interface EngineData {
  status(): EngineDataStatus;
  /** Throws `EngineDataMissing` when the engine cannot run for want of these files. Cheap: sizes and dates, checksums once per change. */
  ready(): void;
  owns(download: DownloadRow): boolean;
  installer: Installer;
}

export function registerEngineData(
  app: FastifyInstance,
  ctx: AppContext,
  host: () => EngineHost,
  manifest: () => CoefficientsManifest,
): EngineData {
  const dataDir = ctx.config.dataDir;
  const dir = workingCopyDir(dataDir);

  // An installation from before these files left the repository has them in its app
  // folder; so may a copy placed by hand where an earlier Outpost looked for one.
  try {
    const adopted = adoptCoefficients(dataDir, manifest(), [OLD_APP_COPY, path.join(dataDir, "propagation/voacap-data/itshfbc")]);
    if (adopted) ctx.log.info({ from: adopted.from, to: dir }, "VOACAP's coefficients were taken over from an earlier installation");
  } catch (error) {
    ctx.log.warn({ err: error }, "VOACAP's coefficients could not be taken over from an earlier installation");
  }

  /** What the files on disk were found to be, kept until any of them changes. */
  let checked: { signature: string; problem: string | null } | null = null;
  function check(): string | null {
    const list = manifest();
    const parts: string[] = [];
    for (const entry of list.files) {
      try {
        const stat = fs.statSync(path.join(dir, entry.path));
        parts.push(`${stat.size}:${stat.mtimeMs}`);
      } catch {
        parts.push("-");
      }
    }
    const signature = `${list.sha256} ${parts.join(" ")}`;
    if (checked?.signature !== signature) {
      let problem: string | null = null;
      if (parts.every((part) => part === "-")) problem = missingLine(list);
      else {
        try {
          readCoefficients(dir, list);
        } catch (error) {
          problem = error instanceof Error ? error.message : String(error);
        }
      }
      checked = { signature, problem };
    }
    return checked.problem;
  }

  const ourCollections = (): CollectionRow[] =>
    ctx.services.collections.list({ kind: "dataset" }).filter((row) => isOurs(row.meta) && row.status === "installed");

  /** Something changed: a loaded engine is put away so that the next question reads the files afresh. */
  async function changed(reason: string) {
    checked = null;
    await host().reset(reason);
    ctx.events.publish({ type: "propagation.changed" });
  }

  function status(): EngineDataStatus {
    const list = manifest();
    const problem = check();
    const info = problem ? null : readInstalledInfo(dir);
    const downloading = ctx.services.downloads.list().some((row) => isOurs(row.meta) && ACTIVE.includes(row.state));
    return {
      installed: problem === null,
      line: problem,
      why: WHY_NOT_SHIPPED,
      bytes: list.bytes,
      files: list.files.length,
      downloading,
      how: info?.how ?? null,
      at: info?.at ?? null,
      from: info?.from ?? null,
      source: `${list.source.repository} at ${list.source.commit.slice(0, 12)}, ${list.source.path}`,
      version: list.version,
      sha256: list.sha256,
      collectionId: problem ? null : (info?.collectionId ?? ourCollections()[0]?.id ?? null),
      removalWarning: REMOVAL_WARNING,
    };
  }

  ctx.services.downloads.registerFetcher(
    FETCHER,
    createMapsFetcher(
      ctx,
      () => {
        const list = manifest();
        return {
          baseUrl: list.source.baseUrl,
          bytes: list.bytes,
          sha256: list.sha256,
          files: list.files.map((file) => ({
            name: file.path,
            path: file.path,
            offset: file.offset,
            bytes: file.bytes,
            sha256: file.sha256,
          })),
        };
      },
      { where: "the engine's repository", what: "VOACAP's data files" },
    ),
  );

  const installer: Installer = async ({ download, filePath, sizeBytes, sha256 }) => {
    const list = manifest();
    if (sizeBytes !== list.bytes || sha256 !== list.sha256)
      throw new PermanentJobError("The downloaded VOACAP data is not the set Outpost expects, so it was not used.");
    let files: Map<string, Uint8Array>;
    try {
      files = splitBundle(new Uint8Array(await fs.promises.readFile(filePath)), list);
    } catch (error) {
      throw new PermanentJobError(error instanceof Error ? error.message : String(error));
    }
    writeWorkingCopy(dataDir, list, (entry) => files.get(entry.path)!, {
      how: "downloaded",
      from: list.source.baseUrl,
      at: new Date().toISOString(),
    });
    const collection = await ctx.services.collections.create({
      kind: "dataset",
      title: "VOACAP ionospheric and noise coefficients",
      description:
        "The foF2, M(3000)F2 and radio noise maps VOACAP reads (CCIR Reports 340 and 322, with NTIA/ITS tables), as published in the engine's own repository. The HF propagation planner needs them; it reads its own copy in the data directory.",
      category: "Radio",
      publisher: "hfcast (from the VOACAP distribution of NTIA/ITS)",
      license: "Not an open-source licence: CCIR data under the ITU's terms, with NTIA/ITS work (see engines/voacap/NOTICE.txt)",
      attribution: "CCIR (ITU-R); NTIA/ITS; hfcast by Jonathan McSweet",
      version: list.version,
      locationId: download.locationId,
      relPath: download.relPath,
      sizeBytes,
      sha256,
      meta: { dataset: VOACAP_DATA, removalWarning: REMOVAL_WARNING },
    });
    updateInstalledInfo(dataDir, { collectionId: collection.id });
    await changed("VOACAP's data was installed.");
    return { collectionId: collection.id };
  };

  // Removing the collection, from anywhere, takes the copy the engine reads with it.
  ctx.services.collections.onRemoved((row) => {
    if (!isOurs(row.meta)) return;
    removeWorkingCopy(dataDir);
    void changed("VOACAP's data was removed.");
  });

  app.get("/api/radio/propagation/engine-data", async () => status());

  app.post("/api/radio/propagation/engine-data/download", async () => {
    const list = manifest();
    if (check() === null) throw conflict("VOACAP's data is already on this computer.");
    // A collection that is here but whose copy in the data directory went: put the copy back from it.
    for (const row of ourCollections()) {
      try {
        const files = splitBundle(new Uint8Array(fs.readFileSync(ctx.services.collections.absolutePath(row.id))), list);
        writeWorkingCopy(dataDir, list, (entry) => files.get(entry.path)!, {
          how: "downloaded",
          from: list.source.baseUrl,
          at: new Date(row.installedAt).toISOString(),
          collectionId: row.id,
        });
        await changed("VOACAP's data was put back.");
        return { download: null, status: status() };
      } catch {
        // Away, or not the files: it is removed below, and the files fetched again.
        await ctx.services.collections.remove(row.id, { deleteFiles: ctx.services.storage.isAvailable(row.locationId) });
      }
    }
    const locations = ctx.services.storage.list().filter((location) => location.status === "available");
    const location = locations.find((candidate) => candidate.isDefault) ?? locations[0];
    if (!location) throw new AppError("storage_unavailable", "No storage location is connected to download VOACAP's data into.");
    const host = new URL(list.source.baseUrl).hostname;
    try {
      const download = await ctx.services.downloads.start({
        kind: "dataset",
        title: "VOACAP ionospheric and noise coefficients",
        url: list.source.baseUrl,
        fetcher: FETCHER,
        locationId: location.id,
        relPath: `collections/propagation/voacap-coefficients-${list.source.commit.slice(0, 12)}.bin`,
        sizeBytes: list.bytes,
        sha256: list.sha256,
        allowedHosts: [host],
        meta: { dataset: VOACAP_DATA },
      });
      ctx.events.publish({ type: "propagation.changed" });
      return { download: ctx.services.downloads.toDto(download), status: status() };
    } catch (error) {
      if (error instanceof AppError && error.code === "conflict")
        throw conflict(`VOACAP's data is already downloaded or on its way. ${error.message}`);
      throw error;
    }
  });

  app.delete("/api/radio/propagation/engine-data", async () => {
    if (ctx.services.downloads.list().some((row) => isOurs(row.meta) && ACTIVE.includes(row.state)))
      throw conflict("VOACAP's data is being downloaded. Wait for it to finish, or cancel it under Downloads.");
    for (const row of ourCollections()) {
      if (ctx.services.collections.isBusy(row.id)) throw conflict("VOACAP's data is being moved or checked. Wait for that to finish.");
      await ctx.services.collections.remove(row.id, { deleteFiles: ctx.services.storage.isAvailable(row.locationId) });
    }
    removeWorkingCopy(dataDir);
    await changed("VOACAP's data was removed.");
    return status();
  });

  return {
    status,
    ready() {
      const problem = check();
      if (problem) throw new EngineDataMissing(problem);
    },
    owns: (download) => isOurs(download.meta),
    installer,
  };
}
