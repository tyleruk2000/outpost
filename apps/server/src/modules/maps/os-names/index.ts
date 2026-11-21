/**
 * Place names for Great Britain from Ordnance Survey's OS Open Names: checked, fetched
 * and installed on a press, into the same `places` table and search as GeoNames.
 *
 * - "Check the size" asks OS for the current edition, its size and its checksum
 *   (`POST /api/maps/places/os-names/check`). Nothing is fetched before that press.
 * - "Download" starts a job in the download manager from that answer, which is kept
 *   here for half an hour (`POST /api/maps/places/os-names`).
 * - The installer checks the file against OS's MD5, reads it into rows under a
 *   temporary owner, records a collection, hands the rows over, and only then removes
 *   any older edition: an update replaces the pack whole, and a failed one leaves the
 *   pack that was held as it was.
 * - Removing it is the same as any place names (`DELETE /api/maps/places/datasets/:id`).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { OS_NAMES_DATASET, type OsNamesCheck, osEditionLabel } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import yauzl from "yauzl";
import { z } from "zod";
import type { AppContext } from "../../../core/context.ts";
import { AppError, conflict } from "../../../core/errors.ts";
import { yieldToEventLoop } from "../../../core/event-loop.ts";
import type { HttpClient } from "../../../core/http.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import type { DownloadRow, Installer } from "../../downloads/types.ts";
import {
  columnIndex,
  OS_NAMES_HEADER,
  OsNamesConverter,
  opensQuote,
  type PlaceValues,
  parseCsvLine,
  standardStatement,
  statementFromLicence,
} from "./convert.ts";
import { OS_NAMES_LICENCE } from "./credit.ts";
import { fetchOffer, type OsNamesOffer } from "./source.ts";

const CHECK_KEPT_MS = 30 * 60_000;
const INSERT_BATCH = 2_000;
const DELETE_BATCH = 5_000;

export const startSchema = z.object({
  locationId: z.string().min(1).optional(),
  /** Streets and numbered roads: about 890,000 rows, a third of the room in the database. */
  roads: z.boolean().default(true),
});

const metaSchema = z.object({
  dataset: z.literal(OS_NAMES_DATASET),
  edition: z.string().regex(/^\d{4}-\d{2}$/),
  md5: z.string().regex(/^[0-9a-f]{32}$/),
  roads: z.boolean(),
});

/** Whether a places download is OS Open Names (and so this module's to install). */
export function isOsNamesDownload(download: DownloadRow): boolean {
  return (download.meta as { dataset?: unknown } | null)?.dataset === OS_NAMES_DATASET;
}

async function md5File(filePath: string, signal: AbortSignal): Promise<string> {
  const hash = crypto.createHash("md5");
  for await (const chunk of fs.createReadStream(filePath, { signal })) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

interface ZipFile {
  entries: yauzl.Entry[];
  read(entry: yauzl.Entry): Promise<NodeJS.ReadableStream>;
  close(): void;
}

function openZip(filePath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (openError, zip) => {
      if (openError || !zip) {
        reject(new PermanentJobError("The place names file is not a readable zip archive. Remove the download and try again."));
        return;
      }
      const entries: yauzl.Entry[] = [];
      zip.on("entry", (entry: yauzl.Entry) => {
        entries.push(entry);
        zip.readEntry();
      });
      zip.on("error", reject);
      zip.on("end", () =>
        resolve({
          entries,
          close: () => zip.close(),
          read: (entry) =>
            new Promise((done, fail) =>
              zip.openReadStream(entry, (error, stream) => (error || !stream ? fail(error ?? new Error("unreadable")) : done(stream))),
            ),
        }),
      );
      zip.readEntry();
    });
  });
}

async function readWhole(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export interface OsNamesService {
  check(signal?: AbortSignal): Promise<OsNamesCheck>;
  start(input: z.infer<typeof startSchema>): Promise<DownloadRow>;
  installer: Installer;
}

export function createOsNamesService(ctx: AppContext, options: { client: HttpClient; base?: string }): OsNamesService {
  const { sqlite } = ctx;
  const { collections, downloads, storage } = ctx.services;
  let last: { offer: OsNamesOffer; at: number } | null = null;

  const insert = sqlite.prepare(
    `INSERT INTO places (collection_id, geoname_id, name, ascii_name, alt_names, lat, lon, feature_class, feature_code, country, admin1, population, elevation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertBatch = sqlite.transaction((owner: string, rows: PlaceValues[]) => {
    for (const row of rows) insert.run(owner, ...row);
  });
  const deleteBatch = sqlite.prepare("DELETE FROM places WHERE id IN (SELECT id FROM places WHERE collection_id = ? LIMIT ?)");
  async function removeRows(owner: string) {
    for (;;) {
      if (deleteBatch.run(owner, DELETE_BATCH).changes < DELETE_BATCH) return;
      await yieldToEventLoop();
    }
  }

  /** The installed editions (normally one; two only for a moment while an update is handed over). */
  const held = () => collections.list({ kind: "places" }).filter((row) => row.meta.dataset === OS_NAMES_DATASET);

  function describe(offer: OsNamesOffer, at: number): OsNamesCheck {
    const current = held()[0];
    const edition = typeof current?.meta.edition === "string" ? current.meta.edition : null;
    return {
      edition: offer.edition,
      editionLabel: osEditionLabel(offer.edition),
      sizeBytes: offer.sizeBytes,
      md5: offer.md5,
      fileName: offer.fileName,
      host: new URL(offer.url).hostname,
      installed: current && edition ? { id: current.id, edition, editionLabel: osEditionLabel(edition) } : null,
      updateAvailable: Boolean(edition && edition < offer.edition),
      checkedAt: at,
    };
  }

  const installer: Installer = async ({ download, filePath, sizeBytes, sha256, signal, progress }) => {
    const meta = metaSchema.safeParse(download.meta);
    if (!meta.success) throw new PermanentJobError("This place names download is missing its details. Remove it and start it again.");
    const { edition, md5, roads } = meta.data;

    progress(0, sizeBytes, "Checking the file against Ordnance Survey's checksum");
    if ((await md5File(filePath, signal)) !== md5) {
      throw new PermanentJobError(
        "The file does not match the checksum Ordnance Survey publishes for it. Remove this download and start it again.",
      );
    }

    const owner = `pending:${download.id}`;
    await removeRows(owner);
    const zip = await openZip(filePath);
    let count = 0;
    try {
      const doc = (name: string) => zip.entries.find((entry) => entry.fileName.toLowerCase() === name.toLowerCase());
      const headerEntry = doc("Doc/OS_Open_Names_Header.csv");
      const header = headerEntry ? (await readWhole(await zip.read(headerEntry))).toString("utf8") : OS_NAMES_HEADER;
      const index = columnIndex(header);
      if (!index) throw new PermanentJobError("This file's columns are not the ones OS Open Names has. Outpost cannot read it.");
      const licenceEntry = doc("Doc/licence.txt");
      const statement =
        (licenceEntry ? statementFromLicence((await readWhole(await zip.read(licenceEntry))).toString("latin1")) : null) ??
        standardStatement(Number(edition.slice(0, 4)));

      const files = zip.entries.filter((entry) => /^data\/[^/]+\.csv$/i.test(entry.fileName));
      if (files.length === 0) throw new PermanentJobError("The place names archive has no data files in it.");
      const total = files.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
      const converter = new OsNamesConverter(index);
      let read = 0;
      let batch: PlaceValues[] = [];
      const flush = async () => {
        if (batch.length === 0) return;
        insertBatch(owner, batch);
        count += batch.length;
        batch = [];
        progress(read, total, `Indexing place names (${count.toLocaleString("en-GB")})`);
        await yieldToEventLoop();
        signal.throwIfAborted();
      };
      const take = async (record: string) => {
        if (!record.trim()) return;
        const row = converter.convert(parseCsvLine(record));
        if (row && (roads || row[6] !== "R")) batch.push(row);
        if (batch.length >= INSERT_BATCH) await flush();
      };

      for (const entry of files) {
        const decoder = new TextDecoder("utf-8");
        let rest = "";
        let first = true;
        for await (const chunk of await zip.read(entry)) {
          read += (chunk as Buffer).length;
          let text = rest + decoder.decode(chunk as Buffer, { stream: true });
          if (first) {
            text = text.replace(/^﻿/, "");
            first = false;
          }
          const lines = text.split("\n");
          rest = lines.pop() ?? "";
          let pending = "";
          for (const line of lines) {
            const record = pending ? `${pending}\n${line}` : line;
            if (opensQuote(record)) {
              pending = record;
              continue;
            }
            pending = "";
            await take(record.replace(/\r$/, ""));
          }
          if (pending) rest = `${pending}\n${rest}`;
        }
        await take((rest + decoder.decode()).replace(/\r$/, ""));
      }
      batch.push(...converter.areaRows());
      await flush();
      if (count === 0) throw new PermanentJobError("The place names file had no places Outpost could use.");

      const label = osEditionLabel(edition);
      const collection = await collections.create({
        kind: "places",
        title: download.title,
        description: `${count.toLocaleString("en-GB")} places, roads and postcodes in Great Britain, ${label} edition`,
        category: "Maps",
        publisher: "Ordnance Survey",
        license: OS_NAMES_LICENCE,
        attribution: statement,
        version: edition,
        catalogEntryId: download.catalogEntryId,
        locationId: download.locationId,
        relPath: download.relPath,
        sizeBytes,
        sha256,
        meta: {
          places: { countries: ["GB"], count },
          dataset: OS_NAMES_DATASET,
          edition,
          roads,
          statement,
          kept: converter.counts,
        },
      });
      sqlite.prepare("UPDATE places SET collection_id = ? WHERE collection_id = ?").run(collection.id, owner);
      // The edition this replaces goes only now that the new one is in.
      for (const older of held()) {
        if (older.id === collection.id) continue;
        await collections.remove(older.id, { deleteFiles: storage.isAvailable(older.locationId) });
      }
      ctx.events.publish({ type: "maps.changed" });
      return { collectionId: collection.id };
    } catch (error) {
      await removeRows(owner);
      throw error;
    } finally {
      zip.close();
    }
  };

  return {
    installer,

    async check(signal) {
      const offer = await fetchOffer(options.client, { base: options.base, signal });
      last = { offer, at: Date.now() };
      return describe(offer, last.at);
    },

    async start(input) {
      if (!last || Date.now() - last.at > CHECK_KEPT_MS) {
        throw conflict("Check the size first: Outpost asks Ordnance Survey for the current edition before downloading it.");
      }
      const { offer } = last;
      const current = held().find((row) => row.meta.edition === offer.edition);
      if (current && current.meta.roads === input.roads) {
        throw conflict(`The ${osEditionLabel(offer.edition)} edition is already installed. Remove it first if you want a fresh copy.`);
      }
      try {
        const download = await downloads.start({
          kind: "places",
          title: `Place names for Great Britain (OS Open Names, ${osEditionLabel(offer.edition)})`,
          url: offer.url,
          locationId: input.locationId,
          relPath: `collections/places/os-open-names-${offer.edition}${input.roads ? "" : "-no-roads"}.zip`,
          sizeBytes: offer.sizeBytes,
          allowedHosts: offer.hosts,
          // OS's API and its file store, and no other host, even through a redirect.
          everyHop: true,
          meta: { dataset: OS_NAMES_DATASET, edition: offer.edition, md5: offer.md5, roads: input.roads },
        });
        ctx.events.publish({ type: "maps.changed" });
        return download;
      } catch (error) {
        if (error instanceof AppError && error.code === "conflict") {
          throw conflict(`These place names are already downloaded or on their way. ${error.message}`);
        }
        throw error;
      }
    },
  };
}

/** The routes. Removal and the list of datasets are the places routes' own (maps/index.ts). */
export function registerOsNames(app: FastifyInstance, ctx: AppContext, client: HttpClient): OsNamesService {
  const service = createOsNamesService(ctx, { client, base: ctx.config.osDownloadsUrl });
  ctx.services.downloads.registerInstaller("places", service.installer, isOsNamesDownload);

  app.post("/api/maps/places/os-names/check", async () => service.check());

  app.post("/api/maps/places/os-names", async (request) => {
    const download = await service.start(startSchema.parse(request.body ?? {}));
    return { download: ctx.services.downloads.toDto(download) };
  });
  return service;
}
