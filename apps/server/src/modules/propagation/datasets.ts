/**
 * The data HF propagation rests on: what is installed, how big, how old, whether it
 * still matches its checksums, and fetching a newer solar cycle table.
 *
 * Two sets are needed and both ship with Outpost: the engine's coefficients, and a
 * solar cycle table. Only the table goes out of date, and only it can be fetched
 * again, when a person asks, through the download manager.
 */
import fs from "node:fs";
import type { PropagationDataset, PropagationDatasets } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict } from "../../core/errors.ts";
import { PermanentJobError } from "../../core/jobs.ts";
import type { DownloadRow, Installer } from "../downloads/types.ts";
import { EngineUnavailable } from "./engine.ts";
import {
  currentSolarTable,
  daysBetween,
  downloadedSolarTable,
  forgetDownloadedTable,
  includedManifest,
  includedSolarTable,
  keepDownloadedTable,
  MAX_TABLE_BYTES,
  parseSolarTable,
  SolarTableError,
} from "./solar.ts";
import { datasetFingerprint, findDataset, loadDataset, type VoacapPaths } from "./voacap/files.ts";

/** What marks a download or a collection as the solar table. */
const SOLAR = "solar-cycle";

const NOT_OFFERED: PropagationDatasets["notOffered"] = [
  {
    title: "Measured sunspot numbers (SILSO, Royal Observatory of Belgium)",
    reason:
      "Published under CC BY-NC 4.0, which does not allow commercial use, so Outpost neither ships nor fetches them. NOAA's observed-indices file repeats the same numbers and is left alone for the same reason. A sunspot number you look up yourself can be typed into the planner.",
  },
  {
    title: "Ionosonde observations (GIRO, Lowell Digisonde International)",
    reason:
      "Released under CC BY-NC-SA 4.0 and shared only with people who hold an account with the data centre, so they cannot be fetched for you. An foF2 you read from an ionosonde yourself can be typed into the planner.",
  },
  {
    title: "URSI-88 foF2 maps",
    reason:
      "VOACAP can read these in place of the CCIR maps. The engine's project does not carry them because, unlike the CCIR maps, the ITU does not publish them itself. Outpost uses the CCIR maps only.",
  },
  {
    title: "Measured antenna patterns",
    reason: "None is bundled or fetched. Antennas are the engine's own models; a gain figure of your own can be added to any of them.",
  },
];

export interface DatasetsService {
  list(): PropagationDatasets;
  /** Starts fetching a newer solar cycle table into a storage location. */
  downloadSolar(locationId?: string): Promise<DownloadRow>;
  installer: Installer;
}

export function createDatasetsService(ctx: AppContext, paths: VoacapPaths): DatasetsService {
  const today = () => new Date().toISOString().slice(0, 10);

  function coefficients(): PropagationDataset {
    const base = {
      id: "voacap-coefficients",
      title: "Ionospheric and noise coefficients",
      kind: "required" as const,
      licence:
        'Not under an open-source licence. Part is NTIA/ITS work (United States Government); the foF2, M(3000)F2 and noise maps are CCIR data that the ITU publishes for implementers "free from any copyright assertions". See engines/voacap/NOTICE.txt.',
      downloadable: false,
      dataDate: null,
    };
    try {
      const found = findDataset(paths);
      const description = found.manifest.groups.map((group) => group.description).join(" ");
      const where = found.included ? "Included with Outpost" : `A copy in the data directory (${found.dir})`;
      const source = `${found.manifest.source.repository} at ${found.manifest.source.commit.slice(0, 12)}, ${found.manifest.source.path}`;
      try {
        const loaded = loadDataset(paths);
        return {
          ...base,
          description,
          where,
          source,
          installed: true,
          version: found.manifest.version,
          bytes: loaded.bytes,
          files: loaded.files.length,
          verified: true,
          sha256: datasetFingerprint(found.dir),
          note: null,
        };
      } catch (error) {
        return {
          ...base,
          description,
          where,
          source,
          installed: true,
          version: found.manifest.version,
          bytes: null,
          files: null,
          verified: false,
          sha256: datasetFingerprint(found.dir),
          note: error instanceof Error ? error.message : String(error),
        };
      }
    } catch (error) {
      return {
        ...base,
        description: "Monthly maps of the ionosphere and of radio noise that the engine reads.",
        where: "Not found",
        source: "",
        installed: false,
        version: null,
        bytes: null,
        files: null,
        verified: null,
        sha256: null,
        note: error instanceof EngineUnavailable ? error.message : String(error),
      };
    }
  }

  function solar(): PropagationDataset {
    const manifest = includedManifest();
    const downloaded = downloadedSolarTable(ctx.config.dataDir);
    let table: ReturnType<typeof currentSolarTable> | null = null;
    let problem: string | null = null;
    try {
      table = currentSolarTable(ctx.config.dataDir);
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    const age = table ? Math.max(0, daysBetween(table.dataDate, today())) : null;
    return {
      id: SOLAR,
      title: "Solar cycle prediction",
      description:
        "NOAA's forecast of the smoothed sunspot number for each month. It gives a prediction its sunspot number unless you type one.",
      kind: "required",
      where: !table
        ? "Not found"
        : table.origin === "included"
          ? "Included with Outpost"
          : "Downloaded; a working copy is kept in the data directory",
      installed: table !== null,
      version: table ? `${table.dataDate}` : null,
      dataDate: table?.dataDate ?? null,
      bytes: table?.bytes ?? null,
      files: table ? 1 : null,
      verified: table !== null,
      sha256: table?.sha256 ?? null,
      licence: manifest.licence,
      source: manifest.source,
      downloadable: true,
      note:
        problem ??
        (downloaded && table?.origin === "included"
          ? `A downloaded table dated ${downloaded.dataDate} is older than the included one and is not used.`
          : age !== null
            ? `${table!.months[0]!.month} to ${table!.months[table!.months.length - 1]!.month}. ${age === 0 ? "Dated today." : `${age} day${age === 1 ? "" : "s"} old.`} NOAA republishes it about once a month.`
            : null),
    };
  }

  const installer: Installer = async ({ download, filePath, sizeBytes, sha256 }) => {
    if ((download.meta as Record<string, unknown> | null)?.dataset !== SOLAR)
      throw new PermanentJobError("Outpost does not know what kind of data this download is.");
    if (sizeBytes > MAX_TABLE_BYTES) throw new PermanentJobError("The file is far larger than a solar cycle table, so it was not used.");
    const text = await fs.promises.readFile(filePath, "utf8");
    let months: ReturnType<typeof parseSolarTable>;
    try {
      months = parseSolarTable(text);
    } catch (error) {
      throw new PermanentJobError(
        error instanceof SolarTableError ? `${error.message} It was not used; the table already installed still is.` : String(error),
      );
    }
    const dataDate = today();
    const collection = await ctx.services.collections.create({
      kind: "dataset",
      title: `Solar cycle prediction, ${dataDate}`,
      description: `NOAA's forecast of the smoothed sunspot number, ${months[0]!.month} to ${months[months.length - 1]!.month}. Used by HF propagation.`,
      category: "Radio",
      publisher: "NOAA Space Weather Prediction Center",
      license: "Public domain (US Government work)",
      attribution: "NOAA Space Weather Prediction Center",
      version: dataDate,
      locationId: download.locationId,
      relPath: download.relPath,
      sizeBytes,
      sha256,
      meta: { dataset: SOLAR },
    });
    keepDownloadedTable(ctx.config.dataDir, text, { dataDate, source: download.url, collectionId: collection.id });
    ctx.events.publish({ type: "propagation.changed" });
    return { collectionId: collection.id };
  };

  // Removing the collection takes the working copy with it, and the included table is used again.
  ctx.services.collections.onRemoved((row) => {
    if (row.kind !== "dataset") return;
    forgetDownloadedTable(ctx.config.dataDir, row.id);
    ctx.events.publish({ type: "propagation.changed" });
  });

  return {
    installer,
    list() {
      const table = (() => {
        try {
          return currentSolarTable(ctx.config.dataDir);
        } catch {
          return includedSolarTable();
        }
      })();
      return {
        datasets: [coefficients(), solar()],
        notOffered: NOT_OFFERED,
        solar: {
          dataDate: table.dataDate,
          origin: table.origin,
          ageDays: Math.max(0, daysBetween(table.dataDate, today())),
          months: table.months,
        },
      };
    },
    async downloadSolar(locationId) {
      const url = new URL(ctx.config.solarTableUrl);
      try {
        const download = await ctx.services.downloads.start({
          kind: "dataset",
          title: "Solar cycle prediction (NOAA)",
          url: url.toString(),
          locationId,
          relPath: `collections/propagation/solar-cycle-${today()}.json`,
          sizeBytes: includedManifest().bytes,
          allowedHosts: [url.hostname],
          meta: { dataset: SOLAR },
        });
        ctx.events.publish({ type: "propagation.changed" });
        return download;
      } catch (error) {
        if (error instanceof AppError && error.code === "conflict")
          throw conflict(`Today's solar cycle table is already downloaded or on its way. ${error.message}`);
        throw error;
      }
    },
  };
}
