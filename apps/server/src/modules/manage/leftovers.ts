/**
 * Leftovers: what is on disk or in the records that no longer serves anything.
 *
 * Finding them is the survey's work. This file turns what it found into a list a person
 * can read, and clears the ones they choose. Nothing is cleared that was not chosen by
 * name, and every choice is checked again at the moment of clearing: a file is deleted
 * only if it is still inside one of the folders Outpost made, still a plain file, and
 * still not something a record, a download or a move lays claim to.
 */
import fs from "node:fs";
import path from "node:path";
import type { ClearLeftoversResponse, Leftover, LeftoverKind, LeftoversResponse, Tally } from "@outpost/shared";
import { eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, messageOf } from "../../core/errors.ts";
import { resolveInside, resolveInsideReal } from "../../core/fs-safe.ts";
import { downloads as downloadsTable, jobs as jobsTable } from "../../db/schema.ts";
import { type Inventory, OUTPOST_FOLDERS } from "./inventory.ts";
import { removeEntry } from "./remove.ts";
import { STALE_UPLOAD_MS, type Surveyor } from "./survey.ts";

/** How many of one kind are listed one by one. */
const LISTED = 200;
const UNFINISHED = ["failed", "cancelled", "paused"] as const;
const PREVIOUS_DATA = /^before-restore-[0-9A-Za-z-]+$/;
const SNAPSHOT = /^backup-snapshot-\d+\.db(-journal|-wal|-shm)?$/;

export interface Leftovers {
  list(): LeftoversResponse;
  clear(ids: string[]): Promise<ClearLeftoversResponse>;
}

export function createLeftovers(ctx: AppContext, inventory: Inventory, survey: Surveyor): Leftovers {
  const { db, sqlite, config } = ctx;
  const { storage, downloads, documents } = ctx.services;

  const locationOf = (id: string) => storage.list().find((location) => location.id === id);

  /** Finished jobs that nothing still needs. A failed download keeps its job, which is how it is retried. */
  const clearableJobs = () =>
    sqlite
      .prepare(
        `SELECT id FROM jobs WHERE state IN ('succeeded', 'failed', 'cancelled')
           AND id NOT IN (SELECT job_id FROM downloads WHERE job_id IS NOT NULL AND state IN ('failed', 'cancelled'))`,
      )
      .all() as Array<{ id: string }>;

  function list(): LeftoversResponse {
    const latest = survey.latest();
    const items: Leftover[] = [];
    const more: Partial<Record<LeftoverKind, Tally>> = {};
    const push = (item: Leftover, listed: number) => {
      if (listed < LISTED) {
        items.push(item);
        return;
      }
      const tally = more[item.kind] ?? { count: 0, bytes: 0 };
      tally.count += 1;
      tally.bytes += item.bytes ?? 0;
      more[item.kind] = tally;
    };

    // Downloads that stopped, with whatever part of the file arrived.
    let listed = 0;
    for (const row of db
      .select()
      .from(downloadsTable)
      .where(inArray(downloadsTable.state, [...UNFINISHED]))
      .all()) {
      const location = locationOf(row.locationId);
      const onDisk = latest?.locations.get(row.locationId)?.partial.get(row.id);
      push(
        {
          id: `download:${row.id}`,
          kind: "download",
          title: row.title,
          detail: `${location ? path.join(location.path, row.relPath) : row.relPath}.part`,
          // Measured when the location has been walked; otherwise what the download last recorded.
          bytes: onDisk ?? (latest?.locations.has(row.locationId) ? 0 : row.receivedBytes),
          count: null,
          locationName: location?.name ?? "Unknown location",
          href: `/downloads/${row.id}`,
          what: row.state,
        },
        listed,
      );
      listed += 1;
    }

    // Records whose file has gone from a location that is connected.
    listed = 0;
    for (const entry of inventory.entries()) {
      if (entry.item.state !== "missing") continue;
      const location = locationOf(entry.item.locationId);
      push(
        {
          id: `missing:${entry.item.key}`,
          kind: "missing",
          title: entry.item.title,
          detail: location ? path.join(location.path, entry.item.relPath) : entry.item.relPath,
          bytes: null,
          count: null,
          locationName: entry.item.locationName,
          href: entry.item.catalogEntryId ? `/explore?entry=${encodeURIComponent(entry.item.catalogEntryId)}` : null,
          what: entry.item.origin,
        },
        listed,
      );
      listed += 1;
    }

    for (const [locationId, found] of latest?.locations ?? []) {
      const location = locationOf(locationId);
      if (!location) continue;
      listed = 0;
      for (const file of found.untracked) {
        push(
          {
            id: `file:${locationId}:${file.relPath}`,
            kind: "untracked",
            title: path.basename(file.relPath),
            detail: path.join(location.path, file.relPath),
            bytes: file.bytes,
            count: null,
            locationName: location.name,
            href: null,
            what: null,
          },
          listed,
        );
        listed += 1;
      }
      // Beyond what the survey kept one by one.
      const beyond = found.untrackedTotal.count - found.untracked.length;
      if (beyond > 0) {
        const tally = more.untracked ?? { count: 0, bytes: 0 };
        tally.count += beyond;
        tally.bytes += found.untrackedTotal.bytes - found.untracked.reduce((sum, file) => sum + file.bytes, 0);
        more.untracked = tally;
      }
      listed = 0;
      for (const file of found.uploads) {
        push(
          {
            id: `upload:${locationId}:${file.relPath}`,
            kind: "upload",
            title: "Part of an upload that did not finish",
            detail: path.join(location.path, file.relPath),
            bytes: file.bytes,
            count: null,
            locationName: location.name,
            href: null,
            what: null,
          },
          listed,
        );
        listed += 1;
      }
    }

    const finishedJobs = clearableJobs().length;
    if (finishedJobs > 0) {
      items.push({
        id: "history:jobs",
        kind: "history",
        title: "Finished work",
        detail: null,
        bytes: null,
        count: finishedJobs,
        locationName: null,
        href: "/downloads",
        what: "jobs",
      });
    }
    const finishedDownloads = db
      .select({ id: downloadsTable.id })
      .from(downloadsTable)
      .where(eq(downloadsTable.state, "completed"))
      .all().length;
    if (finishedDownloads > 0) {
      items.push({
        id: "history:downloads",
        kind: "history",
        title: "Finished downloads",
        detail: null,
        bytes: null,
        count: finishedDownloads,
        locationName: null,
        href: "/downloads",
        what: "downloads",
      });
    }

    if (latest) {
      const cache = (id: string, title: string, bytes: number, detail: string, count: number | null = null) => {
        if (bytes > 0 || (count ?? 0) > 0) {
          items.push({ id: `cache:${id}`, kind: "cache", title, detail, bytes, count, locationName: null, href: null, what: id });
        }
      };
      cache("runtimes", "Programs fetched for portable drives", latest.data.runtimes, path.join(config.dataDir, "runtimes"));
      cache("models", "Search model files from an earlier version", latest.data.models, path.join(config.dataDir, "models"));
      cache(
        "text",
        "Text kept for documents that are no longer in the library",
        latest.orphanText.bytes,
        path.join(config.dataDir, "extracted"),
        latest.orphanText.files.length,
      );
      cache(
        "snapshots",
        "Database copies left by a backup that was cut off",
        latest.data.snapshots.reduce((sum, entry) => sum + entry.bytes, 0),
        config.dataDir,
        latest.data.snapshots.length,
      );
      for (const entry of latest.data.previous) {
        items.push({
          id: `previous:${entry.name}`,
          kind: "previous",
          title: "Data set aside by a restore",
          detail: path.join(config.dataDir, entry.name),
          bytes: entry.bytes,
          count: null,
          locationName: null,
          href: null,
          what: null,
        });
      }
    }

    return { items, more, measuredAt: latest?.measuredAt ?? null, measuring: survey.measuring() };
  }

  // ── Clearing ──

  /** Deletes one file inside a folder Outpost made, having checked that it is still nobody's. */
  async function deleteLooseFile(locationId: string, relPath: string, upload: boolean): Promise<number> {
    const location = storage.get(locationId);
    const absolute = storage.resolve(locationId, relPath);
    const relative = path.relative(location.path, absolute).split(path.sep).join("/");
    const folder = OUTPOST_FOLDERS.find((name) => relative.startsWith(`${name}/`));
    if (!folder) throw badRequest("That file is not inside a folder Outpost made, so Outpost will not delete it.");
    // A link somewhere along the way must not lead the delete out of the location.
    if (resolveInsideReal(location.path, relative) !== path.join(fs.realpathSync(location.path), relative)) {
      throw badRequest("That path passes through a link, so Outpost will not delete it.");
    }
    const stat = await fs.promises.lstat(absolute).catch(() => undefined);
    if (!stat) return 0;
    if (!stat.isFile()) throw badRequest("That is not a plain file, so Outpost will not delete it.");
    if (upload) {
      if (!relative.startsWith("documents/.incoming/") || Date.now() - stat.mtimeMs < STALE_UPLOAD_MS) {
        throw conflict("That upload may still be arriving. It was left alone.");
      }
    } else if (survey.claims().has(locationId, relative)) {
      throw conflict("Something in your library uses that file now. It was left alone.");
    }
    await fs.promises.rm(absolute);
    // Folders this emptied go too, but never the top folder itself.
    let parent = path.dirname(absolute);
    const top = path.join(location.path, folder);
    while (parent !== top && parent.startsWith(`${top}${path.sep}`)) {
      try {
        await fs.promises.rmdir(parent);
      } catch {
        break;
      }
      parent = path.dirname(parent);
    }
    return stat.size;
  }

  async function removeDataEntry(name: string): Promise<void> {
    await fs.promises.rm(resolveInside(config.dataDir, name), { recursive: true, force: true });
  }

  async function clearOne(id: string): Promise<{ title: string; bytes: number; count: number }> {
    const separator = id.indexOf(":");
    const kind = separator === -1 ? id : id.slice(0, separator);
    const rest = separator === -1 ? "" : id.slice(separator + 1);
    const latest = survey.latest();

    if (kind === "download") {
      const row = downloads.get(rest);
      if (!row) return { title: "A download", bytes: 0, count: 0 };
      if (!(UNFINISHED as readonly string[]).includes(row.state)) {
        throw conflict(`The download of "${row.title}" is ${row.state}. Only downloads that have stopped are cleared from here.`);
      }
      const bytes = latest?.locations.get(row.locationId)?.partial.get(row.id) ?? row.receivedBytes;
      if (row.state === "paused") downloads.cancel(row.id);
      await downloads.remove(row.id);
      return { title: row.title, bytes: storage.isAvailable(row.locationId) ? bytes : 0, count: 1 };
    }

    if (kind === "missing") {
      const entry = inventory.pick([rest]).entries[0];
      if (!entry) return { title: "A record", bytes: 0, count: 0 };
      if (entry.item.state !== "missing") throw conflict(`The file of "${entry.item.title}" is there after all. It was left alone.`);
      // Only the record goes: there is no file, and nothing else is looked for.
      const outcome = await removeEntry(ctx, inventory, entry, { files: "keep", disconnected: "leave", outside: "forget" });
      if (outcome.outcome === "failed") throw new AppError("conflict", outcome.reason);
      return { title: entry.item.title, bytes: 0, count: 1 };
    }

    if (kind === "file" || kind === "upload") {
      const split = rest.indexOf(":");
      if (split === -1) throw badRequest("That is not something Outpost listed.");
      const relPath = rest.slice(split + 1);
      const locationId = rest.slice(0, split);
      const bytes = await deleteLooseFile(locationId, relPath, kind === "upload");
      survey.amend((found) => {
        const there = found.locations.get(locationId);
        if (!there) return;
        const before = there.untracked.length;
        there.untracked = there.untracked.filter((file) => file.relPath !== relPath);
        if (there.untracked.length < before) {
          there.untrackedTotal.count -= 1;
          there.untrackedTotal.bytes -= bytes;
        }
        there.uploads = there.uploads.filter((file) => file.relPath !== relPath);
        there.measuredBytes -= bytes;
      });
      return { title: path.basename(relPath), bytes, count: 1 };
    }

    if (id === "history:jobs") {
      const ids = clearableJobs().map((row) => row.id);
      for (let start = 0; start < ids.length; start += 400) {
        db.delete(jobsTable)
          .where(inArray(jobsTable.id, ids.slice(start, start + 400)))
          .run();
      }
      return { title: "Finished work", bytes: 0, count: ids.length };
    }
    if (id === "history:downloads") {
      let count = 0;
      for (const row of db.select({ id: downloadsTable.id }).from(downloadsTable).where(eq(downloadsTable.state, "completed")).all()) {
        // A finished download's file is an installed collection now; only the record goes.
        await downloads.remove(row.id);
        count += 1;
      }
      return { title: "Finished downloads", bytes: 0, count };
    }

    if (id === "cache:runtimes") {
      if (ctx.jobs.list({ states: ["queued", "running", "paused"] }).some((job) => job.type.startsWith("portable."))) {
        throw conflict("A portable drive is being written and is using these programs. Try again when it has finished.");
      }
      await removeDataEntry("runtimes");
      const bytes = latest?.data.runtimes ?? 0;
      survey.amend((found) => {
        found.data.total -= found.data.runtimes;
        found.data.runtimes = 0;
      });
      return { title: "Programs fetched for portable drives", bytes, count: 1 };
    }
    if (id === "cache:models") {
      await removeDataEntry("models");
      const bytes = latest?.data.models ?? 0;
      survey.amend((found) => {
        found.data.total -= found.data.models;
        found.data.models = 0;
      });
      return { title: "Search model files from an earlier version", bytes, count: 1 };
    }
    if (id === "cache:text") {
      let bytes = 0;
      let count = 0;
      for (const name of latest?.orphanText.files ?? []) {
        const documentId = /^([^.]+)(\.ocr)?\.json$/.exec(name)?.[1];
        if (!documentId) continue;
        // Asked again: the document may have come back since the count (a restore, an import).
        try {
          documents.get(documentId);
          continue;
        } catch {
          // Still gone.
        }
        const file = resolveInside(path.join(config.dataDir, "extracted"), name);
        const stat = await fs.promises.lstat(file).catch(() => undefined);
        if (!stat?.isFile()) continue;
        await fs.promises.rm(file, { force: true });
        bytes += stat.size;
        count += 1;
      }
      survey.amend((found) => {
        found.data.extracted -= bytes;
        found.data.total -= bytes;
        found.orphanText = { files: [], bytes: 0 };
      });
      return { title: "Text kept for documents that are no longer in the library", bytes, count };
    }
    if (id === "cache:snapshots") {
      let bytes = 0;
      let count = 0;
      for (const entry of latest?.data.snapshots ?? []) {
        if (!SNAPSHOT.test(entry.name)) continue;
        await removeDataEntry(entry.name);
        bytes += entry.bytes;
        count += 1;
      }
      survey.amend((found) => {
        found.data.total -= bytes;
        found.data.snapshots = [];
      });
      return { title: "Database copies left by a backup that was cut off", bytes, count };
    }
    if (kind === "previous") {
      if (!PREVIOUS_DATA.test(rest)) throw badRequest("That is not something Outpost listed.");
      const bytes = latest?.data.previous.find((entry) => entry.name === rest)?.bytes ?? 0;
      await removeDataEntry(rest);
      survey.amend((found) => {
        found.data.total -= bytes;
        found.data.previous = found.data.previous.filter((entry) => entry.name !== rest);
      });
      return { title: "Data set aside by a restore", bytes, count: 1 };
    }
    throw badRequest("That is not something Outpost listed.");
  }

  return {
    list,

    async clear(ids) {
      const cleared: Tally = { count: 0, bytes: 0 };
      const failed: ClearLeftoversResponse["failed"] = [];
      for (const id of new Set(ids)) {
        try {
          const done = await clearOne(id);
          cleared.count += done.count;
          cleared.bytes += done.bytes;
        } catch (error) {
          failed.push({ id, title: list().items.find((item) => item.id === id)?.title ?? id, reason: messageOf(error) });
        }
      }
      // What was listed is no longer what is there; forget it rather than show it again.
      survey.ensure({ force: true });
      ctx.events.publish({ type: "manage.changed" });
      return { cleared, failed };
    },
  };
}
