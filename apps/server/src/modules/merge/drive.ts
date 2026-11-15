/**
 * Finding an Outpost drive and reading it without changing it.
 *
 * A drive is untrusted input: it has been in other computers, and nothing says the
 * files on it are the ones Outpost wrote. So:
 *
 * - Nothing is ever written to the drive. Its database is not even opened there,
 *   because opening a SQLite database can create files beside it. The database (and a
 *   write-ahead log left by an unclean stop, which holds the newest changes) is copied
 *   into Outpost's own data directory and read from the copy.
 * - The copy is opened read-only, with SQLite's defences for schemas it did not write,
 *   and only the tables a merge needs are read, after checking that each is a real
 *   table with the columns expected. Anything else in the file is never looked at.
 * - Every path that comes from the drive's database is resolved inside the drive's own
 *   folder, links are not followed out of it, and only regular files are read.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { DriveInspection, DriveSource } from "@outpost/shared";
import Database from "better-sqlite3";
import type { Config } from "../../config.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { isInside, resolveInside } from "../../core/fs-safe.ts";

type Sqlite = InstanceType<typeof Database>;

const MANIFEST = "outpost-portable.json";
const MAX_MANIFEST_BYTES = 64 * 1024;
/** The largest drive database that will be copied in to be read. */
export const MAX_DATABASE_BYTES = 32 * 1024 ** 3;
const SPACE_RESERVE = 512 * 1024 * 1024;
const KEPT_FOLDER = /^data-before-update-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/;
const MAX_KEPT_FOLDERS = 50;

/** Tables a merge reads, and the columns it needs from each. */
const REQUIRED: Record<string, string[]> = {
  notes: [
    "id",
    "parent_id",
    "title",
    "icon",
    "cover_attachment_id",
    "content",
    "is_template",
    "is_favorite",
    "trashed_at",
    "created_at",
    "updated_at",
  ],
  tags: ["id", "name"],
  note_tags: ["note_id", "tag_id"],
  document_tags: ["document_id", "tag_id"],
  attachments: ["id", "filename", "size_bytes", "sha256", "rel_path"],
  documents: [
    "id",
    "title",
    "original_name",
    "ext",
    "size_bytes",
    "sha256",
    "rel_path",
    "category",
    "description",
    "author",
    "source",
    "language",
    "created_at",
    "updated_at",
  ],
  markers: ["id", "name", "note", "lat", "lon", "color", "is_favorite", "note_id", "created_at", "updated_at"],
  tracks: [
    "id",
    "name",
    "description",
    "color",
    "geojson",
    "source_filename",
    "distance_meters",
    "point_count",
    "created_at",
    "updated_at",
  ],
  collections: ["id", "kind", "title", "catalog_entry_id", "version", "rel_path", "size_bytes", "sha256", "meta"],
  storage_locations: ["id", "created_at"],
};

interface DriveManifest {
  format?: unknown;
  appVersion?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  locationId?: unknown;
}

const isoOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : null;

/**
 * The drive's folder, checked: inside a storage root, and not a folder this Outpost
 * itself lives in. Reading is all that happens there, but the browser must still not be
 * able to point the server at any folder on the machine.
 */
export function resolveDriveFolder(config: Config, input: string): string {
  if (input.includes("\0")) throw badRequest("That path is not valid.");
  const target = path.resolve(input);
  if (!config.storageRoots.some((root) => isInside(root, target))) {
    throw new AppError("forbidden", "Choose the drive's folder inside one of the storage roots this server allows.");
  }
  if (isInside(config.dataDir, target) || isInside(target, config.dataDir)) {
    throw badRequest(
      config.portable
        ? "That is the drive this Outpost is running from. Plug the drive into the computer that runs your main Outpost, and bring its changes back from there."
        : "That folder holds this Outpost's own data, so there is nothing to bring back from it.",
    );
  }
  return target;
}

const statOrNull = (target: string) => fs.promises.lstat(target).catch(() => undefined);

/** Whether a folder is an Outpost drive, and which sets of notes it holds. Reads two small files and lists one folder. */
export async function inspectDrive(config: Config, input: string): Promise<DriveInspection> {
  const target = resolveDriveFolder(config, input);
  const none = (problem: string): DriveInspection => ({ path: target, drive: null, problem });

  const folder = await statOrNull(target);
  if (!folder?.isDirectory()) return none("That folder could not be opened. Check that the drive is plugged in.");

  const manifestStat = await statOrNull(path.join(target, MANIFEST));
  if (!manifestStat?.isFile()) {
    return none(
      "This folder is not an Outpost drive. Open the folder on the drive that holds “Start Outpost” and the file outpost-portable.json.",
    );
  }
  if (manifestStat.size > MAX_MANIFEST_BYTES)
    return none("This folder's description of itself is not one Outpost wrote, so it was not read.");
  let manifest: DriveManifest;
  try {
    manifest = JSON.parse(await fs.promises.readFile(path.join(target, MANIFEST), "utf8")) as DriveManifest;
  } catch {
    return none("This folder's description of itself could not be read. The drive may be damaged.");
  }
  if (manifest === null || typeof manifest !== "object" || manifest.format !== "outpost-portable") {
    return none("This folder is not an Outpost drive.");
  }
  const id = typeof manifest.locationId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(manifest.locationId) ? manifest.locationId : null;
  if (!id) return none("This drive does not say which drive it is, so its changes cannot be told apart from another drive's.");

  const sources: DriveSource[] = [];
  const databaseBytes = async (name: string): Promise<number | null> => {
    const dir = await statOrNull(path.join(target, name));
    const file = await statOrNull(path.join(target, name, "outpost.db"));
    return dir?.isDirectory() && file?.isFile() ? file.size : null;
  };
  const current = await databaseBytes("data");
  if (current !== null) sources.push({ folder: "data", current: true, setAsideAt: null, databaseBytes: current });
  const names = (await fs.promises.readdir(target).catch(() => [] as string[]))
    .filter((name) => KEPT_FOLDER.test(name))
    .sort()
    .reverse()
    .slice(0, MAX_KEPT_FOLDERS);
  for (const name of names) {
    const bytes = await databaseBytes(name);
    if (bytes === null) continue;
    const [, y, mo, d, h, mi, s] = KEPT_FOLDER.exec(name)!;
    sources.push({ folder: name, current: false, setAsideAt: `${y}-${mo}-${d}T${h}:${mi}:${s}Z`, databaseBytes: bytes });
  }
  if (sources.length === 0)
    return none("This drive has no notes database on it. It may not have been finished; write it again from Storage.");

  return {
    path: target,
    drive: {
      id,
      appVersion: typeof manifest.appVersion === "string" ? manifest.appVersion.slice(0, 40) : "an unknown version",
      createdAt: isoOrNull(manifest.createdAt),
      updatedAt: isoOrNull(manifest.updatedAt),
      sources,
    },
    problem: null,
  };
}

/** The name of a set of notes on the drive, checked against what a drive can hold. */
export function sourceFolderOf(inspection: DriveInspection, wanted: string | undefined): DriveSource {
  const sources = inspection.drive?.sources ?? [];
  const source = wanted ? sources.find((entry) => entry.folder === wanted) : (sources.find((entry) => entry.current) ?? sources[0]);
  if (!source) throw badRequest("That set of notes is not on the drive any more. Look at the drive again.");
  return source;
}

/** A regular file inside `root`, reached without leaving it through a link. Null when it is anything else. */
export async function fileInside(root: string, relative: string): Promise<{ file: string; size: number } | null> {
  let resolved: string;
  try {
    resolved = resolveInside(root, relative);
  } catch {
    return null;
  }
  if (resolved === root) return null;
  const stat = await statOrNull(resolved);
  if (!stat?.isFile()) return null;
  // A folder on the way may itself be a link out of the drive.
  try {
    const [realRoot, real] = await Promise.all([fs.promises.realpath(root), fs.promises.realpath(resolved)]);
    if (!isInside(realRoot, real)) return null;
  } catch {
    return null;
  }
  return { file: resolved, size: stat.size };
}

/**
 * Copies the drive's database into `stagingDir` and returns the copy's path. The
 * write-ahead log comes too when there is one: it holds whatever was written last if
 * Outpost on the drive was not shut down cleanly.
 */
export async function stageDatabase(input: {
  driveFolder: string;
  sourceFolder: string;
  stagingDir: string;
  signal: AbortSignal;
  onProgress: (bytes: number, total: number) => void;
}): Promise<string> {
  const dataDir = resolveInside(input.driveFolder, input.sourceFolder);
  const database = await fileInside(dataDir, "outpost.db");
  if (!database) {
    throw new AppError("storage_unavailable", "The drive's notes database could not be found. Check that the drive is still plugged in.");
  }
  const wal = await fileInside(dataDir, "outpost.db-wal");
  const total = database.size + (wal?.size ?? 0);
  if (total > MAX_DATABASE_BYTES) {
    throw new AppError("too_large", "The database on this drive is larger than Outpost will copy in to read (32 GB).");
  }
  await fs.promises.rm(input.stagingDir, { recursive: true, force: true });
  await fs.promises.mkdir(input.stagingDir, { recursive: true });
  const space = await fs.promises.statfs(input.stagingDir).catch(() => undefined);
  if (space && space.bavail * space.bsize < total + SPACE_RESERVE) {
    throw new AppError(
      "insufficient_space",
      "There is not enough free space where Outpost keeps its data to read this drive. Free some space and try again.",
    );
  }

  let done = 0;
  const copy = async (from: string, name: string) => {
    await pipeline(
      fs.createReadStream(from, { highWaterMark: 1024 * 1024 }),
      async function* (source) {
        for await (const chunk of source) {
          done += (chunk as Buffer).length;
          input.onProgress(done, total);
          yield chunk;
        }
      },
      fs.createWriteStream(path.join(input.stagingDir, name), { flags: "wx" }),
      { signal: input.signal },
    );
  };
  await copy(database.file, "drive.db");
  if (wal) await copy(wal.file, "drive.db-wal");
  return path.join(input.stagingDir, "drive.db");
}

export interface StagedDatabase {
  db: Sqlite;
  /** How many migrations the drive's database has had. */
  migrations: number;
  /** When the drive's own storage location was written into this database: the moment the drive was made. */
  locationCreatedAt: number | null;
  close(): void;
}

const NOT_OUTPOST = "The database on this drive is damaged or is not an Outpost database, so nothing was read from it.";

/**
 * Opens the staged copy for reading and checks that it is something this version can
 * read. `homeMigrations` is how many migrations this Outpost has: a drive with more was
 * written by a newer Outpost, whose tables this one does not know.
 */
export function openStaged(file: string, homeMigrations: number, appVersion: string): StagedDatabase {
  let db: Sqlite;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
  } catch {
    throw badRequest(NOT_OUTPOST);
  }
  try {
    // A schema Outpost did not write gets no benefit of the doubt.
    db.pragma("trusted_schema = OFF");
    db.pragma("cell_size_check = ON");
    db.pragma("mmap_size = 0");
    db.pragma("query_only = ON");

    let migrations: number;
    try {
      migrations = (db.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n;
    } catch {
      throw badRequest(NOT_OUTPOST);
    }
    if (migrations > homeMigrations) {
      throw new AppError(
        "conflict",
        `This drive was made by a newer Outpost (${appVersion}) than the one running here. Update this Outpost, then bring the changes back.`,
        { reason: "newer" },
      );
    }

    const real = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: unknown }>)
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string"),
    );
    for (const [table, columns] of Object.entries(REQUIRED)) {
      const info = real.has(table)
        ? (db.prepare(`SELECT name, hidden FROM pragma_table_xinfo('${table}')`).all() as Array<{ name: string; hidden: number }>)
        : [];
      // A generated column is an expression the drive chose; only plain stored columns are read.
      const plain = new Set(info.filter((column) => column.hidden === 0).map((column) => column.name));
      const missing = columns.filter((column) => !plain.has(column));
      if (missing.length > 0) {
        throw new AppError(
          "conflict",
          `This drive was made by a version of Outpost (${appVersion}) whose notes this one cannot read. Start Outpost from the drive and export what you need from there.`,
          { reason: "unreadable", table },
        );
      }
    }

    const location = db.prepare("SELECT created_at AS at FROM storage_locations ORDER BY created_at LIMIT 1").get() as
      | { at: unknown }
      | undefined;
    return {
      db,
      migrations,
      locationCreatedAt: typeof location?.at === "number" && Number.isFinite(location.at) ? location.at : null,
      close: () => db.close(),
    };
  } catch (error) {
    db.close();
    if (error instanceof AppError) throw error;
    throw badRequest(NOT_OUTPOST);
  }
}
