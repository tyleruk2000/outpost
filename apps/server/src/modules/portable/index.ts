/**
 * Portable drives: a complete, runnable copy of Outpost on a USB disk.
 *
 * A running Outpost writes the packaged app, a Node runtime for each chosen kind of
 * computer, launch scripts, a narrowed copy of its database and the chosen content to
 * a folder on a removable drive. Plugged into another computer, the drive starts with
 * a double-click and needs no installation, no Docker and no network.
 *
 * Writing a drive again updates it: unchanged files are skipped. Outpost only writes
 * inside the folder it was pointed at, and only into an empty folder or one that is
 * already an Outpost drive. The data the drive held before an update is kept on the
 * drive, never discarded.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict } from "../../core/errors.ts";
import { isInside, resolveInside, sizeOnDisk } from "../../core/fs-safe.ts";
import { createHttpClient, type HttpClient } from "../../core/http.ts";
import { newId } from "../../core/ids.ts";
import { PermanentJobError, toJobDto } from "../../core/jobs.ts";
import { collections, documents } from "../../db/schema.ts";
import { isInsideRoots, SPACE_RESERVE_BYTES } from "../storage/service.ts";
import { VERSION } from "../system/index.ts";
import { prepareDriveDatabase } from "./database.ts";
import {
  currentPlatform,
  linuxLauncher,
  macLauncher,
  PORTABLE_PLATFORMS,
  type PortablePlatform,
  platformLabels,
  readme,
  windowsLauncher,
} from "./launchers.ts";
import {
  binaryName,
  ensureKiwix,
  ensureRuntime,
  KIWIX_DIST_HOST,
  kiwixSupports,
  localKiwix,
  localRuntime,
  NODE_DIST_HOST,
} from "./runtimes.ts";

const MANIFEST = "outpost-portable.json";
const LOCATION_MARKER = ".outpost-location.json";
/** FAT32 cannot hold a file of 4 GiB or more; many USB sticks ship formatted that way. */
const FAT32_LIMIT = 4 * 1024 ** 3 - 1;
/** Rough size of one downloaded runtime, for space planning before it is cached. */
const RUNTIME_ESTIMATE_BYTES = 120 * 1024 * 1024;

const requestSchema = z.object({
  targetPath: z.string().min(1).max(1000),
  platforms: z.array(z.enum(PORTABLE_PLATFORMS)).min(1).max(PORTABLE_PLATFORMS.length),
  collectionIds: z.array(z.string().max(64)).max(5000).default([]),
  documents: z.enum(["all", "none"]).default("all"),
  /** Contacts travel as notes do unless they are left off: a drive may be handed to someone else. */
  contacts: z.enum(["all", "none"]).default("all"),
  /** Also put kiwix-serve on the drive, so reference collections can be read from it. */
  reader: z.boolean().default(false),
  /** Required when the folder is already an Outpost drive: its notes and index will be replaced. */
  replaceExisting: z.boolean().default(false),
});
export type PortableRequest = z.infer<typeof requestSchema>;

interface DriveManifest {
  format: "outpost-portable";
  version: 1;
  appVersion: string;
  nodeVersion: string;
  createdAt: string;
  updatedAt: string;
  platforms: PortablePlatform[];
  locationId: string;
  contents: { collections: number; documents: number; notes: number; bytes: number };
}

interface FileCopy {
  from: string;
  to: string;
  bytes: number;
  label: string;
}

export interface PortablePlan {
  target: {
    path: string;
    exists: boolean;
    isOutpostDrive: boolean;
    freeBytes: number | null;
    totalBytes: number | null;
    lastWritten: string | null;
  };
  app: { available: boolean; bytes: number };
  runtimes: Array<{ platform: PortablePlatform; label: string; cached: boolean }>;
  /** kiwix-serve per chosen platform, when the reader was asked for. */
  reader: Array<{ platform: PortablePlatform; label: string; supported: boolean; cached: boolean }>;
  collections: Array<{ id: string; title: string; kind: string; bytes: number; available: boolean; alreadyOnDrive: boolean }>;
  documents: { count: number; bytes: number };
  /** Bytes that still have to be written, after skipping what is already on the drive. */
  bytesToWrite: number;
  enoughSpace: boolean;
  needsConnection: boolean;
  problems: string[];
  warnings: string[];
}

async function readManifest(target: string): Promise<DriveManifest | undefined> {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(path.join(target, MANIFEST), "utf8")) as DriveManifest;
    return parsed.format === "outpost-portable" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** A file is taken as already copied when it is the same size and not older than its source. */
async function isCurrent(copy: FileCopy): Promise<boolean> {
  try {
    const [source, target] = await Promise.all([fs.promises.stat(copy.from), fs.promises.stat(copy.to)]);
    return target.size === source.size && target.mtimeMs + 2000 >= source.mtimeMs;
  } catch {
    return false;
  }
}

async function listFiles(root: string, relative = ""): Promise<Array<{ rel: string; bytes: number }>> {
  const found: Array<{ rel: string; bytes: number }> = [];
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(path.join(root, relative), { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) found.push(...(await listFiles(root, rel)));
    else if (entry.isFile()) found.push({ rel, bytes: (await fs.promises.stat(path.join(root, rel))).size });
  }
  return found;
}

export async function registerPortable(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { config, db, jobs } = ctx;
  const { storage } = ctx.services;
  const nodeVersion = process.version;
  let http: HttpClient | undefined;
  const client = () => (http ??= createHttpClient({ allowPrivate: config.allowPrivateDownloads }));
  ctx.onClose.push(() => http?.close());

  const bundleAvailable = () => fs.existsSync(path.join(config.appBundleDir, "server", "outpost.mjs"));

  /**
   * This library's identity, made the first time a drive is written. The drive records
   * it, so that when the drive comes home Outpost knows it is its own (modules/merge).
   */
  function libraryId(): string {
    ctx.sqlite.prepare("INSERT OR IGNORE INTO library_meta (key, value) VALUES ('library.id', ?)").run(newId());
    return (ctx.sqlite.prepare("SELECT value FROM library_meta WHERE key = 'library.id'").get() as { value: string }).value;
  }

  /** The folder must be inside a storage root, and must not be somewhere Outpost itself lives. */
  function resolveTarget(input: string): string {
    const target = path.resolve(input);
    if (config.storageRoots.includes(target) || !isInsideRoots(config.storageRoots, target)) {
      throw new AppError("forbidden", "Choose a folder on a drive that is inside one of the storage roots this server allows.");
    }
    if (isInside(config.dataDir, target) || isInside(target, config.dataDir)) {
      throw badRequest("That folder holds Outpost's own data. Choose a folder on the drive you want to take away.");
    }
    for (const location of storage.list()) {
      if (isInside(location.path, target) || isInside(target, location.path)) {
        throw badRequest(`That folder overlaps the storage location "${location.name}". Choose a separate folder on the drive.`);
      }
    }
    return target;
  }

  async function gather(request: PortableRequest) {
    const target = resolveTarget(request.targetPath);
    const problems: string[] = [];
    const warnings: string[] = [];
    const manifest = await readManifest(target);
    const existing = await fs.promises.readdir(target).catch(() => undefined);
    const exists = existing !== undefined;
    if (exists && !manifest && existing.filter((name) => !name.startsWith(".")).length > 0) {
      problems.push(
        "That folder already has files in it that are not an Outpost drive. Choose an empty folder, or make a new one, so nothing of yours is mixed up or overwritten.",
      );
    }
    if (manifest && !request.replaceExisting) {
      warnings.push(
        "This folder is already an Outpost drive. Updating it replaces the notes and library index on the drive with this Outpost's. What the drive holds now is kept in a dated folder on the drive.",
      );
    }

    // Space is measured on the nearest existing folder: the target may not exist yet.
    let probe = target;
    while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
    const space = await fs.promises.statfs(probe).then(
      (stats) => ({ freeBytes: stats.bavail * stats.bsize, totalBytes: stats.blocks * stats.bsize }),
      () => ({ freeBytes: null, totalBytes: null }),
    );

    const copies: FileCopy[] = [];

    // The app itself.
    const appFiles = bundleAvailable() ? await listFiles(config.appBundleDir) : [];
    if (!bundleAvailable()) {
      problems.push(
        "This Outpost is running from source, so there is no packaged app to put on a drive. Run `node scripts/build-app.mjs` first, or use the Docker image or a release build.",
      );
    }
    for (const file of appFiles)
      copies.push({
        from: path.join(config.appBundleDir, file.rel),
        to: path.join(target, "app", file.rel),
        bytes: file.bytes,
        label: "Outpost",
      });

    // Runtimes.
    const runtimes = request.platforms.map((platform) => ({
      platform,
      label: platformLabels[platform],
      cached: Boolean(localRuntime(config.dataDir, nodeVersion, platform)),
    }));

    const reader = request.reader
      ? request.platforms.map((platform) => ({
          platform,
          label: platformLabels[platform],
          supported: kiwixSupports(platform),
          cached: Boolean(localKiwix(config.dataDir, platform)),
        }))
      : [];
    const unsupportedReader = reader.filter((item) => !item.supported);
    if (unsupportedReader.length > 0) {
      warnings.push(
        `Reference collections such as Wikipedia cannot be opened from this drive on ${unsupportedReader.map((item) => item.label).join(" or ")}: the Kiwix project does not publish its reader for that system. Documents, notes, maps and search still work there.`,
      );
    }

    // Collections.
    const wanted = request.collectionIds.length
      ? db.select().from(collections).where(inArray(collections.id, request.collectionIds)).all()
      : [];
    const collectionPlan: PortablePlan["collections"] = [];
    const includedCollectionIds: string[] = [];
    for (const row of wanted) {
      const available = storage.isAvailable(row.locationId) && row.status === "installed";
      let alreadyOnDrive = false;
      if (available) {
        const from = storage.resolve(row.locationId, row.relPath);
        const stat = await fs.promises.stat(from).catch(() => undefined);
        if (!stat) {
          problems.push(`"${row.title}" is missing from its storage location and cannot be copied.`);
        } else {
          const files = stat.isDirectory()
            ? (await listFiles(from)).map((file) => ({ rel: path.join(row.relPath, file.rel), bytes: file.bytes }))
            : [{ rel: row.relPath, bytes: stat.size }];
          const location = storage.get(row.locationId);
          const mine = files.map((file) => ({
            from: resolveInside(location.path, file.rel),
            to: resolveInside(path.join(target, "library"), file.rel),
            bytes: file.bytes,
            label: row.title,
          }));
          alreadyOnDrive = (await Promise.all(mine.map(isCurrent))).every(Boolean);
          copies.push(...mine);
          includedCollectionIds.push(row.id);
          for (const file of files) {
            if (file.bytes > FAT32_LIMIT)
              warnings.push(
                `"${row.title}" is larger than 4 GB. If the drive is formatted as FAT32 it cannot hold it; exFAT, NTFS, APFS and ext4 can.`,
              );
          }
        }
      } else {
        problems.push(`"${row.title}" is on a storage location that is not connected, so it cannot be copied.`);
      }
      collectionPlan.push({ id: row.id, title: row.title, kind: row.kind, bytes: row.sizeBytes, available, alreadyOnDrive });
    }

    // Documents.
    const documentRows = request.documents === "all" ? db.select().from(documents).all() : [];
    const includedDocumentIds: string[] = [];
    let documentBytes = 0;
    let skippedDocuments = 0;
    for (const row of documentRows) {
      if (!storage.isAvailable(row.locationId)) {
        skippedDocuments += 1;
        continue;
      }
      const location = storage.get(row.locationId);
      // Through resolveInside on both sides: a record must never be able to point the copy outside its folder.
      copies.push({
        from: resolveInside(location.path, row.relPath),
        to: resolveInside(path.join(target, "library"), row.relPath),
        bytes: row.sizeBytes,
        label: row.title,
      });
      includedDocumentIds.push(row.id);
      documentBytes += row.sizeBytes;
    }
    if (skippedDocuments > 0)
      warnings.push(
        `${skippedDocuments} document${skippedDocuments === 1 ? " is" : "s are"} on a storage location that is not connected and will be left out.`,
      );

    // Notes attachments and extracted text travel with the database, and so does the
    // copy of VOACAP's coefficients the planner reads, so that the drive predicts offline.
    for (const folder of ["attachments", "extracted", "propagation/voacap-coefficients"]) {
      const root = path.join(config.dataDir, folder);
      for (const file of await listFiles(root)) {
        if (folder === "extracted" && !includedDocumentIds.includes(path.basename(file.rel, ".json"))) continue;
        copies.push({
          from: path.join(root, file.rel),
          to: path.join(target, "data-incoming", folder, file.rel),
          bytes: file.bytes,
          label: folder.startsWith("propagation/") ? "HF propagation data" : "Notes and index",
        });
      }
    }

    return {
      target,
      manifest,
      exists,
      space,
      copies,
      runtimes,
      reader,
      collectionPlan,
      includedCollectionIds,
      includedDocumentIds,
      documentBytes,
      problems,
      warnings,
      appBytes: appFiles.reduce((sum, file) => sum + file.bytes, 0),
    };
  }

  async function plan(request: PortableRequest): Promise<PortablePlan> {
    const gathered = await gather(request);
    const pending = (await Promise.all(gathered.copies.map(async (copy) => ((await isCurrent(copy)) ? 0 : copy.bytes)))).reduce(
      (sum, bytes) => sum + bytes,
      0,
    );
    const databaseBytes = await sizeOnDisk(path.join(config.dataDir, "outpost.db"));
    const missingRuntimes = gathered.runtimes.filter((runtime) => !runtime.cached);
    const missingReader = gathered.reader.filter((item) => item.supported && !item.cached);
    if (missingReader.length > 0) {
      gathered.warnings.push(
        `The reader for reference collections will be downloaded from ${KIWIX_DIST_HOST} for ${missingReader.map((item) => item.label).join(", ")} and kept for next time. This step needs a connection.`,
      );
    }
    const runtimeBytes = gathered.runtimes.length * RUNTIME_ESTIMATE_BYTES;
    const bytesToWrite = pending + databaseBytes + runtimeBytes;
    const enoughSpace = gathered.space.freeBytes === null || gathered.space.freeBytes >= bytesToWrite + SPACE_RESERVE_BYTES;
    if (!enoughSpace) gathered.problems.push("The drive does not have enough free space for this selection.");
    if (missingRuntimes.length > 0) {
      gathered.warnings.push(
        `The programs that run Outpost on ${missingRuntimes.map((runtime) => runtime.label).join(", ")} will be downloaded from nodejs.org (about 50 MB each) and kept for next time. This step needs a connection.`,
      );
    }
    return {
      target: {
        path: gathered.target,
        exists: gathered.exists,
        isOutpostDrive: Boolean(gathered.manifest),
        freeBytes: gathered.space.freeBytes,
        totalBytes: gathered.space.totalBytes,
        lastWritten: gathered.manifest?.updatedAt ?? null,
      },
      app: { available: bundleAvailable(), bytes: gathered.appBytes },
      runtimes: gathered.runtimes,
      reader: gathered.reader,
      collections: gathered.collectionPlan,
      documents: { count: gathered.includedDocumentIds.length, bytes: gathered.documentBytes },
      bytesToWrite,
      enoughSpace,
      needsConnection: missingRuntimes.length > 0 || missingReader.length > 0,
      problems: gathered.problems,
      warnings: [...new Set(gathered.warnings)],
    };
  }

  jobs.register<PortableRequest>("portable.build", {
    queue: "transfer",
    async run({ payload, signal, progress }) {
      const request = requestSchema.parse(payload);
      const gathered = await gather(request);
      if (gathered.problems.length > 0) throw new PermanentJobError(gathered.problems[0]!);
      if (gathered.manifest && !request.replaceExisting) {
        throw new PermanentJobError(
          "This folder is already an Outpost drive. Confirm that its notes and index may be replaced, then try again.",
        );
      }
      const { target } = gathered;
      const total = gathered.copies.reduce((sum, copy) => sum + copy.bytes, 0);
      let done = 0;
      const step = (message: string) => progress({ current: done, total, message });

      await fs.promises.mkdir(path.join(target, "library"), { recursive: true });
      await fs.promises.rm(path.join(target, "data-incoming"), { recursive: true, force: true });

      // 1. Runtimes: the only step that may need the network, so it goes first.
      for (const { platform, label } of gathered.runtimes) {
        signal.throwIfAborted();
        step(`Getting the program that runs Outpost on ${label}`);
        const source = await ensureRuntime({
          dataDir: config.dataDir,
          version: nodeVersion,
          platform,
          http: client(),
          distBase: config.nodeDistUrl,
          signal,
        }).catch((error) => {
          throw error instanceof AppError ? new PermanentJobError(error.message) : error;
        });
        const destination = path.join(target, "runtime", platform, binaryName(platform));
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        if (!(await isCurrent({ from: source, to: destination, bytes: 0, label }))) {
          await fs.promises.copyFile(source, destination);
          await fs.promises.chmod(destination, 0o755).catch(() => {});
        }
      }

      for (const item of gathered.reader) {
        if (!item.supported) continue;
        signal.throwIfAborted();
        step(`Getting the reader for reference collections on ${item.label}`);
        const source = await ensureKiwix({
          dataDir: config.dataDir,
          platform: item.platform,
          http: client(),
          distBase: config.kiwixDistUrl,
          signal,
        }).catch((error) => {
          throw error instanceof AppError ? new PermanentJobError(error.message) : error;
        });
        const destination = path.join(target, "runtime", item.platform, "kiwix-serve");
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        if (!(await isCurrent({ from: source, to: destination, bytes: 0, label: item.label }))) {
          await fs.promises.copyFile(source, destination);
          await fs.promises.chmod(destination, 0o755).catch(() => {});
        }
      }

      // 2. Files: the app, then content. Each is written to a temporary name and
      //    renamed, so an interrupted copy never leaves a half file under its real name.
      for (const copy of gathered.copies) {
        signal.throwIfAborted();
        if (await isCurrent(copy)) {
          done += copy.bytes;
          continue;
        }
        step(`Copying ${copy.label}`);
        await fs.promises.mkdir(path.dirname(copy.to), { recursive: true });
        const partial = `${copy.to}.part`;
        const before = done;
        try {
          await pipeline(
            fs.createReadStream(copy.from, { highWaterMark: 1024 * 1024 }),
            async function* (source) {
              for await (const chunk of source) {
                done += (chunk as Buffer).length;
                progress({ current: done, total, message: `Copying ${copy.label}` });
                yield chunk;
              }
            },
            fs.createWriteStream(partial),
            { signal },
          );
          await fs.promises.rename(partial, copy.to);
        } catch (error) {
          await fs.promises.rm(partial, { force: true });
          done = before;
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "EFBIG")
            throw new PermanentJobError(`"${copy.label}" is too large for this drive's format. Reformat the drive as exFAT and try again.`);
          if (code === "ENOSPC") throw new PermanentJobError("The drive is full. Free some space or choose less to take with you.");
          throw error;
        }
      }

      // 3. The database, narrowed to what is on the drive.
      signal.throwIfAborted();
      step("Writing notes and the library index");
      const markerFile = path.join(target, "library", LOCATION_MARKER);
      let locationId: string;
      try {
        locationId = (JSON.parse(await fs.promises.readFile(markerFile, "utf8")) as { id: string }).id;
      } catch {
        locationId = newId();
        await fs.promises.writeFile(
          markerFile,
          `${JSON.stringify({ id: locationId, name: "This drive", createdAt: Date.now() }, null, 2)}\n`,
        );
      }
      const incoming = path.join(target, "data-incoming");
      await fs.promises.mkdir(incoming, { recursive: true });
      const stagedDb = path.join(incoming, "outpost.db");
      await fs.promises.rm(stagedDb, { force: true });
      await ctx.sqlite.backup(stagedDb);
      const summary = prepareDriveDatabase(stagedDb, {
        locationId,
        locationName: "This drive",
        locationPath: path.join(target, "library"),
        collectionIds: gathered.includedCollectionIds,
        documentIds: gathered.includedDocumentIds,
        madeFrom: libraryId(),
        contacts: request.contacts !== "none",
      });

      // 4. Swap the data folder in. Whatever the drive held is kept beside it.
      const dataDir = path.join(target, "data");
      if (fs.existsSync(dataDir)) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        await fs.promises.rename(dataDir, path.join(target, `data-before-update-${stamp}`));
      }
      await fs.promises.rename(incoming, dataDir);

      // 5. Launchers, notes for the person holding the drive, and the manifest last:
      //    its presence is what marks the drive as complete.
      const now = new Date().toISOString();
      const hasKiwix = gathered.runtimes.some(({ platform }) =>
        fs.existsSync(path.join(target, "runtime", platform, platform.startsWith("win-") ? "kiwix-serve.exe" : "kiwix-serve")),
      );
      const mac = path.join(target, "Start Outpost.command");
      const linux = path.join(target, "start-outpost.sh");
      await fs.promises.writeFile(mac, macLauncher, { mode: 0o755 });
      await fs.promises.writeFile(linux, linuxLauncher, { mode: 0o755 });
      await fs.promises.chmod(mac, 0o755).catch(() => {});
      await fs.promises.chmod(linux, 0o755).catch(() => {});
      await fs.promises.writeFile(path.join(target, "Start Outpost.bat"), windowsLauncher);
      const platforms = PORTABLE_PLATFORMS.filter((platform) =>
        fs.existsSync(path.join(target, "runtime", platform, binaryName(platform))),
      );
      await fs.promises.writeFile(
        path.join(target, "README.txt"),
        readme({ version: VERSION, createdAt: now.slice(0, 10), platforms, hasKiwix }),
      );
      const manifest: DriveManifest = {
        format: "outpost-portable",
        version: 1,
        appVersion: VERSION,
        nodeVersion,
        createdAt: gathered.manifest?.createdAt ?? now,
        updatedAt: now,
        platforms,
        locationId,
        contents: { ...summary, bytes: total },
      };
      await fs.promises.writeFile(path.join(target, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
      progress({ current: total, total, message: "Drive is ready" });
      ctx.events.publish({ type: "portable.changed" });
      return { target, ...summary, platforms, bytes: total };
    },
  });

  jobs.register<{ platforms: PortablePlatform[] }>("portable.runtimes", {
    queue: "download",
    async run({ payload, signal, progress }) {
      let index = 0;
      for (const platform of payload.platforms) {
        progress({ current: index, total: payload.platforms.length, message: `Downloading for ${platformLabels[platform]}` });
        await ensureRuntime({
          dataDir: config.dataDir,
          version: nodeVersion,
          platform,
          http: client(),
          distBase: config.nodeDistUrl,
          signal,
        });
        index += 1;
      }
      ctx.events.publish({ type: "portable.changed" });
      return { platforms: payload.platforms };
    },
  });

  // ── Routes ──
  app.get("/api/portable/status", async () => {
    return {
      runningFromDrive: config.portable,
      packagedAppAvailable: bundleAvailable(),
      nodeVersion,
      thisComputer: currentPlatform() ?? null,
      runtimeSource: NODE_DIST_HOST,
      platforms: PORTABLE_PLATFORMS.map((platform) => ({
        platform,
        label: platformLabels[platform],
        cached: Boolean(localRuntime(config.dataDir, nodeVersion, platform)),
      })),
    };
  });

  app.get<{ Querystring: { path?: string } }>("/api/portable/inspect", async (request) => {
    if (!request.query.path) throw badRequest("Say which folder to look at with ?path=.");
    const target = resolveTarget(request.query.path);
    return { path: target, drive: (await readManifest(target)) ?? null };
  });

  app.post("/api/portable/plan", async (request) => {
    return plan(requestSchema.parse(request.body));
  });

  app.post("/api/portable/build", async (request) => {
    const body = requestSchema.parse(request.body);
    const current = await plan(body);
    if (current.problems.length > 0) throw conflict(current.problems[0]!, { problems: current.problems });
    if (current.target.isOutpostDrive && !body.replaceExisting) {
      throw conflict("This folder is already an Outpost drive. Confirm that its notes and index may be replaced.", {
        needsConfirmation: true,
      });
    }
    if (jobs.list({ states: ["queued", "running"], types: ["portable.build"], limit: 1 }).length > 0) {
      throw conflict("A drive is already being written. Wait for it to finish, or cancel it on the Downloads and tasks screen.");
    }
    const job = jobs.enqueue("portable.build", body, {
      title: `Write portable drive to ${path.basename(current.target.path)}`,
      subject: "portable",
    });
    return { job: toJobDto(job) };
  });

  app.post("/api/portable/runtimes", async (request) => {
    const body = z.object({ platforms: z.array(z.enum(PORTABLE_PLATFORMS)).min(1) }).parse(request.body);
    const job = jobs.enqueue("portable.runtimes", body, {
      title: "Download programs for portable drives",
      subject: "portable-runtimes",
      maxAttempts: 3,
    });
    return { job: toJobDto(job) };
  });
}
