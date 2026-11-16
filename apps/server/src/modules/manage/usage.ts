/**
 * What is taking the space: by kind of thing, and by storage location.
 *
 * Three kinds of figure, and each row says which it is. "records" is what Outpost wrote
 * down when the thing was installed, available at once and for locations that are not
 * connected. "disk" was measured from the files by the survey, and is as old as the
 * survey. "estimate" is worked out: the database is one file, so what search passages
 * and vectors take inside it can only be reckoned from what they hold.
 */
import fs from "node:fs";
import path from "node:path";
import type { ManagedKind, Tally, UsageId, UsageLocation, UsageResponse, UsageRow } from "@outpost/shared";
import { ne } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { downloads as downloadsTable } from "../../db/schema.ts";
import type { Cleanup } from "./cleanup.ts";
import type { Inventory } from "./inventory.ts";
import type { Surveyor } from "./survey.ts";

const CONTENT_KINDS: ManagedKind[] = ["zim", "map", "terrain", "places", "sheet", "file", "model", "dataset", "document"];
/** The word index SQLite keeps beside passage text comes to roughly half the text again. */
const INDEX_OVERHEAD = 1.5;

export function createUsage(ctx: AppContext, inventory: Inventory, survey: Surveyor, cleanup: Cleanup): () => Promise<UsageResponse> {
  const { db, sqlite, config } = ctx;
  const { storage } = ctx.services;

  return async function usage(): Promise<UsageResponse> {
    const latest = survey.latest();
    const entries = inventory.entries();
    const rows: UsageRow[] = [];
    const row = (id: UsageId, bytes: number | null, count: number | null, basis: UsageRow["basis"], extra: Partial<UsageRow> = {}) =>
      rows.push({ id, bytes, count, basis, disconnectedBytes: 0, within: null, ...extra });

    for (const kind of CONTENT_KINDS) {
      const of = entries.filter((entry) => entry.item.kind === kind);
      row(
        kind,
        of.reduce((sum, entry) => sum + entry.item.sizeBytes, 0),
        of.length,
        "records",
        { disconnectedBytes: of.filter((entry) => !entry.item.locationAvailable).reduce((sum, entry) => sum + entry.item.sizeBytes, 0) },
      );
    }

    const attachments = sqlite.prepare("SELECT count(*) AS count, coalesce(sum(size_bytes), 0) AS bytes FROM attachments").get() as Tally;
    row("attachments", latest ? latest.data.attachments : attachments.bytes, attachments.count, latest ? "disk" : "records");

    const derived = cleanup.derivedStatus();
    row("database", derived.databaseBytes, null, "disk");
    const passages = (sqlite.prepare("SELECT count(*) AS n FROM chunks").get() as { n: number }).n;
    row("passages", latest ? Math.round(latest.passageBytes * INDEX_OVERHEAD) : null, passages, "estimate", { within: "database" });
    row("vectors", derived.vectors.bytes, derived.vectors.count, "estimate", { within: "database" });

    row("extracted", latest?.data.extracted ?? null, null, "disk");
    row("runtimes", latest?.data.runtimes ?? null, null, "disk");
    row("models", latest?.data.models ?? null, null, "disk");
    row(
      "previous",
      latest ? latest.data.previous.reduce((sum, entry) => sum + entry.bytes, 0) : null,
      latest?.data.previous.length ?? null,
      "disk",
    );

    const unfinished = db.select().from(downloadsTable).where(ne(downloadsTable.state, "completed")).all();
    let partial = 0;
    let partialMeasured = unfinished.length > 0;
    for (const download of unfinished) {
      const measured = latest?.locations.get(download.locationId);
      if (measured) partial += measured.partial.get(download.id) ?? 0;
      else {
        // Its location is not connected or not yet walked: what the download last recorded.
        partial += download.receivedBytes;
        partialMeasured = false;
      }
    }
    row("unfinished", partial, unfinished.length, partialMeasured || unfinished.length === 0 ? "disk" : "records");

    if (latest) {
      let bytes = 0;
      let count = 0;
      for (const found of latest.locations.values()) {
        bytes += found.untrackedTotal.bytes + found.uploads.reduce((sum, file) => sum + file.bytes, 0);
        count += found.untrackedTotal.count + found.uploads.length;
      }
      row("untracked", bytes, count, "disk");
      row("other", latest.data.other + latest.data.snapshots.reduce((sum, entry) => sum + entry.bytes, 0), null, "disk");
    } else {
      row("untracked", null, null, "disk");
      row("other", null, null, "disk");
    }

    const locations: UsageLocation[] = storage.list().map((location) => {
      const here = entries.filter((entry) => entry.item.locationId === location.id);
      const byKind = CONTENT_KINDS.map((kind) => {
        const of = here.filter((entry) => entry.item.kind === kind);
        return { kind, count: of.length, bytes: of.reduce((sum, entry) => sum + entry.item.sizeBytes, 0) };
      }).filter((bucket) => bucket.count > 0);
      const available = location.status === "available";
      return {
        id: location.id,
        name: location.name,
        path: location.path,
        kind: location.kind,
        isDefault: location.isDefault,
        available,
        statusDetail: location.statusDetail,
        lastSeenAt: location.lastSeenAt,
        totalBytes: location.totalBytes,
        freeBytes: location.freeBytes,
        recorded: { count: here.length, bytes: here.reduce((sum, entry) => sum + entry.item.sizeBytes, 0) },
        byKind,
        measuredBytes: available ? (latest?.locations.get(location.id)?.measuredBytes ?? null) : null,
      };
    });

    const space = await fs.promises.statfs(config.dataDir).catch(() => undefined);
    return {
      rows,
      locations,
      dataDir: {
        path: path.resolve(config.dataDir),
        totalBytes: space ? space.blocks * space.bsize : null,
        freeBytes: space ? space.bavail * space.bsize : null,
        measuredBytes: latest ? latest.data.total + derived.databaseBytes : null,
      },
      measuredAt: latest?.measuredAt ?? null,
      measuring: survey.measuring(),
    };
  };
}
