/**
 * Carrying out a merge, one thing at a time, and undoing one.
 *
 * Every change at home goes through the service that owns the thing (notes, documents,
 * maps, collections), so a page from a drive is sanitised, indexed and linked exactly
 * like a page typed here, and a document is checked, hashed and read like an upload.
 * Each change is written to the merge's record in the same transaction, with whatever
 * was there before, so that stopping part-way leaves a library that is whole and a
 * record that says exactly how far it got.
 *
 * Nothing here writes to the drive. Files are only ever read from it, through
 * `fileInside`, and each is hashed against the drive's own record before it is used.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { MergeAnalysis, MergeChoice, MergeItem, NoteNodeJson } from "@outpost/shared";
import { asMarkerIcon, MARKER_COLORS, type MarkerColor } from "@outpost/shared";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, messageOf } from "../../core/errors.ts";
import { safeFileName } from "../../core/fs-safe.ts";
import { sha256File } from "../../core/hashing.ts";
import { newId } from "../../core/ids.ts";
import { driveMergeActions, type driveMerges } from "../../db/schema.ts";
import { buildGpx, splitCollection, type TrackCollection, type TrackFeature } from "../maps/gpx.ts";
import { GONE, type MemoryEntry } from "./diff.ts";
import { fileInside, openStaged } from "./drive.ts";
import {
  currentDocumentHash,
  currentPageHash,
  currentPlaceHash,
  currentTrackHash,
  LIMITS,
  type PageState,
  type PlaceState,
  readBaseline,
  readSnapshot,
  tagKey,
} from "./fingerprint.ts";

export type MergeRow = typeof driveMerges.$inferSelect;

/** The drive went away while it was being read. Nothing more is attempted: half a page's pictures is not a page. */
export class DriveGone extends AppError {
  constructor() {
    super(
      "storage_unavailable",
      "The drive was disconnected before everything had been brought back. Plug it in and look at it again; what is already here is not brought back twice.",
    );
  }
}

/** True while the drive's folder is still where it was. */
export const driveIsThere = (merge: Pick<MergeRow, "drivePath">): boolean =>
  fs.existsSync(path.join(merge.drivePath, "outpost-portable.json"));
type ActionRow = typeof driveMergeActions.$inferSelect;
type NewAction = Omit<typeof driveMergeActions.$inferInsert, "mergeId" | "seq" | "createdAt">;

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const PREFIX = { note: "/notes/", document: "/library/documents/", attachment: "/api/attachments/" } as const;
const SUPPORTED_COLLECTIONS = ["zim", "map", "terrain"] as const;

const dateWords = (time: number) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(time);

/** Tags the notes and documents services will accept: theirs refuse a whole save for one bad tag. */
export function safeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of tags) {
    const name = raw
      .normalize("NFC")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what is being removed
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name || name.includes(",") || name.length > 50 || seen.has(tagKey(name)) || kept.length >= 50) continue;
    seen.add(tagKey(name));
    kept.push(name);
  }
  return kept;
}

const asColor = (value: string): MarkerColor => ((MARKER_COLORS as readonly string[]).includes(value) ? (value as MarkerColor) : "teal");

// ── A track's geometry, cleaned ─────────────────────────────────────────────

const short = (value: unknown, max: number): string | undefined => (typeof value === "string" && value ? value.slice(0, max) : undefined);

function position(value: unknown): [number, number] | [number, number, number] | null {
  if (!Array.isArray(value)) return null;
  const [lon, lat, ele] = value as unknown[];
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return typeof ele === "number" && Number.isFinite(ele) ? [lon, lat, ele] : [lon, lat];
}

const line = (value: unknown): Array<[number, number] | [number, number, number]> =>
  Array.isArray(value) ? value.map(position).filter((point): point is NonNullable<typeof point> => point !== null) : [];

/**
 * Rebuilds a stored track from untrusted JSON, keeping only what a track is made of:
 * lines, waypoints, and their names. It is then written out as GPX and read back in
 * through the same parser as any GPX file, which is what finally decides what is valid.
 */
export function cleanTrack(raw: string): TrackCollection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw badRequest("Its route on the drive could not be read.");
  }
  const input = (parsed as { features?: unknown } | null)?.features;
  if (!Array.isArray(input)) throw badRequest("Its route on the drive could not be read.");
  const features: TrackFeature[] = [];
  for (const feature of input.slice(0, 20_000) as Array<{
    geometry?: { type?: unknown; coordinates?: unknown };
    properties?: Record<string, unknown>;
  }>) {
    const geometry = feature?.geometry;
    const given = feature?.properties && typeof feature.properties === "object" ? feature.properties : {};
    const properties: TrackFeature["properties"] = {};
    const name = short(given.name, 200);
    const desc = short(given.desc, 20_000);
    const time = short(given.time, 40);
    const sym = short(given.sym, 100);
    if (name) properties.name = name;
    if (desc) properties.desc = desc;
    if (time) properties.time = time;
    if (sym) properties.sym = sym;
    if (given._gpxType === "rte" || given._gpxType === "trk") properties._gpxType = given._gpxType;
    if (geometry?.type === "Point") {
      const point = position(geometry.coordinates);
      if (point) features.push({ type: "Feature", properties, geometry: { type: "Point", coordinates: point } });
    } else if (geometry?.type === "LineString") {
      const coordinates = line(geometry.coordinates);
      if (coordinates.length > 0) features.push({ type: "Feature", properties, geometry: { type: "LineString", coordinates } });
    } else if (geometry?.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
      const coordinates = geometry.coordinates.map(line).filter((segment) => segment.length > 0);
      if (coordinates.length > 0) features.push({ type: "Feature", properties, geometry: { type: "MultiLineString", coordinates } });
    }
  }
  if (features.length === 0) throw badRequest("Its route on the drive has no lines or waypoints in it.");
  return { type: "FeatureCollection", features };
}

function trackGpx(name: string, description: string, raw: string): string {
  const { lines, waypoints } = splitCollection(cleanTrack(raw));
  if (lines.length === 1 && !lines[0]!.properties.name) lines[0] = { ...lines[0]!, properties: { ...lines[0]!.properties, name } };
  return buildGpx({ name, description: description || undefined, lines, waypoints });
}

const collectionMeta = z.object({
  zim: z
    .object({
      bookName: z.string().max(300),
      uuid: z.string().max(100),
      articleCount: z.number().int().nonnegative().optional(),
      flavour: z.string().max(100).optional(),
    })
    .optional(),
  map: z
    .object({
      bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      minZoom: z.number().int().min(0).max(30),
      maxZoom: z.number().int().min(0).max(30),
      tileType: z.enum(["vector", "terrain"]),
      sourceBuild: z.string().max(100).optional(),
      format: z.enum(["pmtiles", "mbtiles"]),
    })
    .optional(),
});

// ── Applying ────────────────────────────────────────────────────────────────

export interface ApplyInput {
  merge: MergeRow;
  analysis: MergeAnalysis;
  choices: Record<string, MergeChoice>;
  stagedFile: string;
  homeMigrations: number;
  memory: Map<string, MemoryEntry>;
  signal: AbortSignal;
  progress: (update: { current: number; total: number; message: string }) => void;
}

export async function applyMerge(ctx: AppContext, input: ApplyInput): Promise<void> {
  const { db, sqlite } = ctx;
  const { notes, documents, maps, collections, storage } = ctx.services;
  const { merge, analysis, memory, signal } = input;
  const annotations = maps.annotations;

  const libraryRoot = path.join(merge.drivePath, "library");
  const attachmentsRoot = path.join(merge.drivePath, merge.sourceFolder, "attachments");
  const from = `from drive ${merge.driveLabel}, ${dateWords(Date.now())}`;

  const staged = openStaged(input.stagedFile, input.homeMigrations, analysis.driveAppVersion);
  try {
    const drive = await readSnapshot(staged.db, signal);
    const baseline = analysis.baseline === "recorded" ? readBaseline(staged.db) : null;

    // ── The record ──
    const earlier = db.select().from(driveMergeActions).where(eq(driveMergeActions.mergeId, merge.id)).all();
    const done = new Set(earlier.map((action) => action.itemKey).filter((key): key is string => key !== null));
    let seq = earlier.reduce((max, action) => Math.max(max, action.seq), 0) + 1;
    const record = (action: NewAction): void => {
      db.insert(driveMergeActions)
        .values({ ...action, mergeId: merge.id, seq, createdAt: Date.now() })
        .run();
      seq += 1;
    };
    /** A change and its line in the record, together or not at all. */
    const together = <T>(work: () => T): T => sqlite.transaction(work).immediate();

    const choiceOf = (item: MergeItem): MergeChoice => {
      if (item.blocked) return "skip";
      const chosen = input.choices[item.key];
      return chosen && item.choices.includes(chosen) ? chosen : item.defaultChoice;
    };

    // ── Where the drive's things are at home ──
    const allocated = new Map<string, string>();
    const documentIds = new Map<string, string>();
    const attachmentIds = new Map<string, string | null>();

    const homePage = (id: string) =>
      sqlite
        .prepare(
          "SELECT id, parent_id AS parentId, trashed_at AS trashedAt, is_template AS isTemplate, created_at AS createdAt FROM notes WHERE id = ?",
        )
        .get(id) as { id: string; parentId: string | null; trashedAt: number | null; isTemplate: number; createdAt: number } | undefined;
    const usablePage = (id: string | null): boolean => {
      const row = id ? homePage(id) : undefined;
      return row !== undefined && row.trashedAt === null;
    };

    function resolvePage(driveId: string): string | null {
      const fresh = allocated.get(driveId);
      if (fresh) return fresh;
      const remembered = memory.get(`page:${driveId}`);
      if (remembered?.homeItemId && remembered.driveHash !== GONE) return remembered.homeItemId;
      const row = homePage(driveId);
      if (!row) return null;
      if (baseline?.pages.has(driveId)) return driveId;
      return analysis.baseline !== "recorded" && drive.pages.get(driveId)?.createdAt === row.createdAt ? driveId : null;
    }

    function resolveDocument(driveId: string): string | null {
      const fresh = documentIds.get(driveId);
      if (fresh) return fresh;
      const remembered = memory.get(`document:${driveId}`);
      if (remembered?.homeItemId && remembered.driveHash !== GONE) return remembered.homeItemId;
      const theirs = drive.documents.get(driveId);
      const row = sqlite.prepare("SELECT created_at AS createdAt FROM documents WHERE id = ?").get(driveId) as
        | { createdAt: number }
        | undefined;
      if (row && (baseline?.documents.has(driveId) || (analysis.baseline !== "recorded" && theirs?.createdAt === row.createdAt)))
        return driveId;
      if (!theirs) return null;
      const same = sqlite.prepare("SELECT id FROM documents WHERE sha256 = ? ORDER BY created_at LIMIT 1").get(theirs.sha256) as
        | { id: string }
        | undefined;
      return same?.id ?? null;
    }

    /** The attachment at home that holds the same bytes, copying it from the drive when there is none. */
    async function ensureAttachment(driveId: string): Promise<string | null> {
      if (attachmentIds.has(driveId)) return attachmentIds.get(driveId)!;
      const found = await (async (): Promise<string | null> => {
        const theirs = drive.attachments.get(driveId);
        if (!theirs) return null;
        const sameId = sqlite.prepare("SELECT sha256 FROM attachments WHERE id = ?").get(driveId) as { sha256: string } | undefined;
        if (sameId?.sha256 === theirs.sha256) return driveId;
        const sameBytes = sqlite.prepare("SELECT id FROM attachments WHERE sha256 = ? LIMIT 1").get(theirs.sha256) as
          | { id: string }
          | undefined;
        if (sameBytes) return sameBytes.id;
        const source = await fileInside(attachmentsRoot, theirs.relPath);
        if (!source || source.size > MAX_ATTACHMENT_BYTES) return null;
        if ((await sha256File(source.file, { signal })) !== theirs.sha256) return null;
        try {
          const saved = await notes.createAttachmentFromFile({ sourcePath: source.file, filename: theirs.filename });
          if (saved.sha256 !== theirs.sha256) {
            await notes.deleteAttachment(saved.id).catch(() => undefined);
            return null;
          }
          record({
            kind: "attachment",
            outcome: "added",
            title: saved.filename,
            message: "Copied from the drive and checked against its checksum.",
            driveItemId: driveId,
            homeItemId: saved.id,
          });
          return saved.id;
        } catch (error) {
          if (error instanceof AppError) return null;
          throw error;
        }
      })();
      attachmentIds.set(driveId, found);
      return found;
    }

    /** A page's content from the drive, sanitised, with everything it points at pointing at home's copies. */
    async function contentOf(driveId: string): Promise<{ doc: unknown; missing: number }> {
      const row = staged.db.prepare(`SELECT content FROM notes WHERE id = ? AND length(content) <= ${LIMITS.pageBytes}`).get(driveId) as
        | { content: unknown }
        | undefined;
      if (typeof row?.content !== "string")
        throw new AppError("too_large", "This page is too large or could not be read, so it was left on the drive.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.content);
      } catch {
        throw badRequest("This page's content on the drive could not be read.");
      }
      // The same sanitiser as imports and the editor: only the page model's own nodes survive, to a bounded depth.
      const doc = notes.content.sanitizeDoc(parsed) as unknown as NoteNodeJson;
      let missing = 0;
      for (const id of notes.content.extractLinks(doc).attachmentIds.slice(0, 5000)) {
        if (!(await ensureAttachment(id))) missing += 1;
      }
      // One picture that cannot be copied is reported; a drive that has gone is a reason to stop.
      if (missing > 0 && !driveIsThere(merge)) throw new DriveGone();
      const mapHref = (href: string): string => {
        const target = notes.content.parseInAppHref(href);
        if (!target) return href;
        const [prefix, old, next] =
          target.type === "note"
            ? [PREFIX.note, target.noteId, resolvePage(target.noteId)]
            : target.type === "document"
              ? [PREFIX.document, target.documentId, resolveDocument(target.documentId)]
              : [PREFIX.attachment, target.attachmentId, attachmentIds.get(target.attachmentId) ?? null];
        return next && next !== old ? `${prefix}${next}${href.slice(prefix.length + old.length)}` : href;
      };
      const visit = (node: NoteNodeJson): void => {
        if (node.type === "pageLink" && typeof node.attrs?.noteId === "string") {
          node.attrs.noteId = resolvePage(node.attrs.noteId) ?? node.attrs.noteId;
        } else if (node.type === "documentEmbed" && typeof node.attrs?.documentId === "string") {
          node.attrs.documentId = resolveDocument(node.attrs.documentId) ?? node.attrs.documentId;
        } else if (node.type === "image" && typeof node.attrs?.src === "string") {
          node.attrs.src = mapHref(node.attrs.src);
        }
        for (const mark of node.marks ?? []) {
          if (mark.type === "link" && typeof mark.attrs?.href === "string") mark.attrs.href = mapHref(mark.attrs.href);
        }
        for (const child of node.content ?? []) visit(child);
      };
      visit(doc);
      return { doc, missing };
    }

    async function coverOf(page: PageState): Promise<string | null> {
      if (!page.coverAttachmentId) return null;
      const id = await ensureAttachment(page.coverAttachmentId);
      if (!id) return null;
      const row = sqlite.prepare("SELECT mime FROM attachments WHERE id = ?").get(id) as { mime: string } | undefined;
      return row?.mime.startsWith("image/") ? id : null;
    }

    const missingWords = (missing: number) =>
      missing > 0
        ? ` ${missing} picture${missing === 1 ? "" : "s"} or file${missing === 1 ? "" : "s"} in it could not be copied from the drive.`
        : "";

    const drivePage = (item: MergeItem): PageState => {
      const page = drive.pages.get(item.driveItemId);
      if (!page || page.hash === null) throw badRequest("This page could not be read from the drive.");
      return page;
    };

    /** Home must still be what the preview showed. If it is not, nothing is overwritten. */
    const CHANGED_SINCE =
      "It changed at home after the preview was made, so it was left alone. Look at the drive again to see it as it is now.";

    // ── Pages ──

    async function createPage(item: MergeItem, options: { beside?: string } = {}): Promise<void> {
      const page = drivePage(item);
      const { doc, missing } = await contentOf(page.id);
      const cover = await coverOf(page);
      let parentId: string | null = null;
      let afterId: string | undefined;
      let note = "";
      let id: string;
      let title = page.title;
      if (options.beside) {
        // The drive's version of a page that also changed at home: a sibling, named for where it came from.
        const mine = homePage(options.beside);
        parentId = mine && usablePage(mine.parentId) ? mine.parentId : null;
        if (mine && mine.trashedAt === null && !mine.isTemplate && mine.parentId === parentId) afterId = mine.id;
        id = newId();
        title = `${page.title.trim() || "Untitled"} (${from})`.slice(0, 300);
      } else {
        const wanted = page.parentId ? resolvePage(page.parentId) : null;
        if (wanted && usablePage(wanted) && !homePage(wanted)?.isTemplate) parentId = wanted;
        else if (page.parentId) note = " The page it sat under is not at home, so it is at the top level.";
        id = allocated.get(page.id) ?? newId();
        if (homePage(id)) id = newId();
      }
      together(() => {
        const created = notes.adopt({
          id,
          parentId,
          afterId,
          title,
          icon: page.icon,
          content: doc,
          tags: safeTags(page.tags),
          coverAttachmentId: cover,
          isTemplate: page.isTemplate,
          isFavorite: options.beside ? false : page.isFavorite,
          // A copy beside home's page is a new page here; a page brought across keeps the dates it was written.
          createdAt: options.beside ? undefined : page.createdAt,
          updatedAt: options.beside ? undefined : page.updatedAt,
        });
        record({
          itemKey: item.key,
          kind: "page",
          outcome: options.beside ? "copied" : "added",
          title: created.title.trim() || "Untitled",
          message:
            (options.beside ? "Home’s version was kept; the drive’s version was added beside it." : "Added from the drive.") +
            note +
            missingWords(missing),
          driveItemId: page.id,
          homeItemId: created.id,
          driveHash: page.hash,
          homeHash: currentPageHash(sqlite, created.id),
        });
      });
    }

    async function updatePage(item: MergeItem): Promise<void> {
      const page = drivePage(item);
      const id = item.homeItemId!;
      const { doc, missing } = await contentOf(page.id);
      const cover = await coverOf(page);
      together(() => {
        const row = homePage(id);
        if (!row || row.trashedAt !== null || currentPageHash(sqlite, id) !== item.homeHash) {
          record({ itemKey: item.key, kind: "page", outcome: "skipped", title: item.title, message: CHANGED_SINCE, homeItemId: id });
          return;
        }
        const before = notes.get(id);
        notes.update(id, { title: page.title, icon: page.icon, content: doc, tags: safeTags(page.tags), coverAttachmentId: cover });
        record({
          itemKey: item.key,
          kind: "page",
          outcome: "updated",
          title: page.title.trim() || "Untitled",
          message: `Updated from the drive. The version from before is kept in this record.${missingWords(missing)}`,
          driveItemId: page.id,
          homeItemId: id,
          driveHash: page.hash,
          homeHash: currentPageHash(sqlite, id),
          undo: {
            type: "page",
            title: before.title,
            icon: before.icon,
            content: before.content,
            tags: before.tags,
            coverAttachmentId: before.coverAttachmentId,
          },
        });
      });
    }

    function keep(item: MergeItem, kind: NewAction["kind"], message: string, gone = false): void {
      record({
        itemKey: item.key,
        kind,
        outcome: "kept",
        title: item.title,
        message,
        driveItemId: item.driveItemId,
        homeItemId: item.homeItemId,
        driveHash: gone ? GONE : item.driveHash,
        // Null: the two sides are known to differ, so the next change on the drive is a conflict again.
        homeHash: null,
      });
      if (gone) {
        for (const member of item.members ?? []) {
          record({
            kind,
            outcome: "kept",
            title: item.title,
            message: "Kept with the page above it.",
            driveItemId: member,
            driveHash: GONE,
          });
        }
      }
    }

    function movePage(item: MergeItem): void {
      const page = drive.pages.get(item.driveItemId);
      const id = item.homeItemId!;
      const row = homePage(id);
      const was = baseline?.pages.get(item.driveItemId);
      if (!page || !row || row.trashedAt !== null || !was || row.parentId !== was.parentId) {
        record({
          itemKey: item.key,
          kind: "page",
          outcome: "skipped",
          title: item.title,
          message: "It was moved or removed at home in the meantime, so it stays where it is.",
          homeItemId: id,
        });
        return;
      }
      const target = page.parentId ? resolvePage(page.parentId) : null;
      if (page.parentId && (!target || !usablePage(target))) {
        record({
          itemKey: item.key,
          kind: "page",
          outcome: "skipped",
          title: item.title,
          message: "The page it was moved under is not at home, so it stays where it is.",
          homeItemId: id,
        });
        return;
      }
      together(() => {
        notes.move(id, { parentId: target });
        record({
          itemKey: item.key,
          kind: "page",
          outcome: "moved",
          title: item.title,
          message: target ? "Moved as it was on the drive." : "Moved to the top level, as it was on the drive.",
          driveItemId: item.driveItemId,
          homeItemId: id,
          undo: { type: "move", parentId: row.parentId, movedTo: target },
        });
      });
    }

    function trashPage(item: MergeItem): void {
      const id = item.homeItemId!;
      together(() => {
        const row = homePage(id);
        if (!row || row.trashedAt !== null) {
          record({
            itemKey: item.key,
            kind: "page",
            outcome: "skipped",
            title: item.title,
            message: "It is no longer among your pages.",
            homeItemId: id,
            driveItemId: item.driveItemId,
            driveHash: GONE,
          });
          return;
        }
        if (currentPageHash(sqlite, id) !== item.homeHash) {
          record({ itemKey: item.key, kind: "page", outcome: "skipped", title: item.title, message: CHANGED_SINCE, homeItemId: id });
          return;
        }
        const went = notes.trash(id);
        record({
          itemKey: item.key,
          kind: "page",
          outcome: "trashed",
          title: item.title,
          message:
            went.length > 1
              ? `Moved to the trash with ${went.length - 1} sub-page${went.length === 2 ? "" : "s"}. Restore it from the trash in Notes, or undo this merge.`
              : "Moved to the trash. Restore it from the trash in Notes, or undo this merge.",
          driveItemId: item.driveItemId,
          homeItemId: id,
          driveHash: GONE,
          undo: { type: "trash" },
        });
        for (const member of item.members ?? []) {
          record({
            kind: "page",
            outcome: "trashed",
            title: item.title,
            message: "Went to the trash with the page above it.",
            driveItemId: member,
            driveHash: GONE,
          });
        }
      });
    }

    // ── Documents ──

    async function addDocument(item: MergeItem): Promise<void> {
      const theirs = drive.documents.get(item.driveItemId);
      if (!theirs) throw badRequest("This document's record could not be read from the drive.");
      const source = await fileInside(libraryRoot, theirs.relPath);
      if (!source && !driveIsThere(merge)) throw new DriveGone();
      if (!source) throw badRequest("Its file is not on the drive, so it was not added.");
      if ((await sha256File(source.file, { signal })) !== theirs.sha256) {
        throw badRequest("The file on the drive does not match its checksum. It may be damaged, so it was not added.");
      }
      // Copies: the file on the drive is never moved, renamed or removed.
      const outcome = await documents.ingestFile({
        sourcePath: source.file,
        originalName: theirs.originalName,
        title: theirs.title,
        category: theirs.category,
        tags: safeTags(theirs.tags),
      });
      const id = outcome.document.id;
      documentIds.set(theirs.id, id);
      if (outcome.status === "duplicate") {
        record({
          itemKey: item.key,
          kind: "document",
          outcome: "already",
          title: outcome.document.title,
          message: "The same file is already in your library, so it was not copied again.",
          driveItemId: theirs.id,
          homeItemId: id,
          driveHash: theirs.hash,
          homeHash: currentDocumentHash(sqlite, id),
        });
        return;
      }
      if ((await sha256File(documents.absolutePath(id), { signal })) !== theirs.sha256) {
        await documents.remove(id);
        documentIds.delete(theirs.id);
        throw badRequest("The copy did not match the file on the drive, so it was removed again. Try once more.");
      }
      if (theirs.description || theirs.author || theirs.source || theirs.language) {
        await documents.update(id, {
          description: theirs.description,
          author: theirs.author,
          source: theirs.source,
          language: theirs.language,
        });
      }
      record({
        itemKey: item.key,
        kind: "document",
        outcome: "added",
        title: outcome.document.title,
        message: "Copied from the drive and checked against its checksum.",
        driveItemId: theirs.id,
        homeItemId: id,
        driveHash: theirs.hash,
        homeHash: currentDocumentHash(sqlite, id),
      });
    }

    async function updateDocument(item: MergeItem): Promise<void> {
      const theirs = drive.documents.get(item.driveItemId);
      const id = item.homeItemId!;
      if (!theirs) throw badRequest("This document's record could not be read from the drive.");
      if (currentDocumentHash(sqlite, id) !== item.homeHash) {
        record({ itemKey: item.key, kind: "document", outcome: "skipped", title: item.title, message: CHANGED_SINCE, homeItemId: id });
        return;
      }
      const before = documents.get(id);
      await documents.update(id, {
        title: theirs.title.trim() || before.title,
        category: theirs.category,
        description: theirs.description,
        author: theirs.author,
        source: theirs.source,
        language: theirs.language,
        tags: safeTags(theirs.tags),
      });
      record({
        itemKey: item.key,
        kind: "document",
        outcome: "updated",
        title: theirs.title.trim() || before.title,
        message: "Its details were updated from the drive. What they were is kept in this record.",
        driveItemId: theirs.id,
        homeItemId: id,
        driveHash: theirs.hash,
        homeHash: currentDocumentHash(sqlite, id),
        undo: {
          type: "document",
          title: before.title,
          category: before.category,
          description: before.description,
          author: before.author,
          source: before.source,
          language: before.language,
          tags: before.tags,
        },
      });
    }

    async function removeDocument(item: MergeItem): Promise<void> {
      const id = item.homeItemId!;
      if (currentDocumentHash(sqlite, id) !== item.homeHash) {
        record({ itemKey: item.key, kind: "document", outcome: "skipped", title: item.title, message: CHANGED_SINCE, homeItemId: id });
        return;
      }
      await documents.remove(id);
      record({
        itemKey: item.key,
        kind: "document",
        outcome: "removed",
        title: item.title,
        message: "Removed from your library, with its file, because you ticked it. This cannot be undone.",
        driveItemId: item.driveItemId,
        homeItemId: id,
        driveHash: GONE,
      });
    }

    // ── Saved places ──

    const placeFields = (place: PlaceState) => ({
      name: place.name.trim().slice(0, 200) || "Saved place",
      note: place.note,
      lat: place.lat,
      lon: place.lon,
      color: asColor(place.color),
      // A drive from before places had icons says nothing about them: what home has is then left as it is.
      ...(place.icon === null ? {} : { icon: asMarkerIcon(place.icon), gpxSym: place.gpxSym }),
      isFavorite: place.isFavorite,
      noteId: place.noteId ? (resolvePage(place.noteId) ?? null) : null,
    });
    const placeNow = (id: string) =>
      sqlite
        .prepare(
          "SELECT name, note, lat, lon, color, icon, gpx_sym AS gpxSym, is_favorite AS isFavorite, note_id AS noteId FROM markers WHERE id = ?",
        )
        .get(id) as
        | {
            name: string;
            note: string;
            lat: number;
            lon: number;
            color: string;
            icon: string;
            gpxSym: string | null;
            isFavorite: number;
            noteId: string | null;
          }
        | undefined;

    function drivePlace(item: MergeItem): PlaceState {
      const place = drive.places.get(item.driveItemId);
      if (!place) throw badRequest("This saved place could not be read from the drive.");
      if (place.lat < -90 || place.lat > 90 || place.lon < -180 || place.lon > 180)
        throw badRequest("Its position on the drive is not a place on the map.");
      return place;
    }

    function addPlace(item: MergeItem, beside: boolean): void {
      const place = drivePlace(item);
      const fields = placeFields(place);
      if (beside) fields.name = `${fields.name} (${from})`.slice(0, 200);
      together(() => {
        const created = annotations.createMarker(fields);
        record({
          itemKey: item.key,
          kind: "place",
          outcome: beside ? "copied" : "added",
          title: created.name,
          message: beside ? "Home’s was kept; the drive’s was added beside it." : "Added from the drive.",
          driveItemId: place.id,
          homeItemId: created.id,
          driveHash: place.hash,
          homeHash: currentPlaceHash(sqlite, created.id),
        });
      });
    }

    function updatePlace(item: MergeItem): void {
      const place = drivePlace(item);
      const id = item.homeItemId!;
      together(() => {
        const before = placeNow(id);
        if (!before || currentPlaceHash(sqlite, id) !== item.homeHash) {
          record({ itemKey: item.key, kind: "place", outcome: "skipped", title: item.title, message: CHANGED_SINCE, homeItemId: id });
          return;
        }
        annotations.updateMarker(id, placeFields(place));
        record({
          itemKey: item.key,
          kind: "place",
          outcome: "updated",
          title: place.name,
          message: "Updated from the drive. What it was is kept in this record.",
          driveItemId: place.id,
          homeItemId: id,
          driveHash: place.hash,
          homeHash: currentPlaceHash(sqlite, id),
          undo: { type: "place", ...before, isFavorite: before.isFavorite === 1 },
        });
      });
    }

    function removePlace(item: MergeItem): void {
      const id = item.homeItemId!;
      together(() => {
        const before = placeNow(id);
        if (!before || currentPlaceHash(sqlite, id) !== item.homeHash) {
          record({ itemKey: item.key, kind: "place", outcome: "skipped", title: item.title, message: CHANGED_SINCE, homeItemId: id });
          return;
        }
        annotations.removeMarker(id);
        record({
          itemKey: item.key,
          kind: "place",
          outcome: "removed",
          title: item.title,
          message: "Removed because you ticked it. Undoing this merge adds it again.",
          driveItemId: item.driveItemId,
          homeItemId: id,
          driveHash: GONE,
          undo: { type: "place-removed", ...before, isFavorite: before.isFavorite === 1 },
        });
      });
    }

    // ── Tracks ──

    const trackNow = (id: string) =>
      sqlite.prepare("SELECT name, description, color, source_filename AS sourceFilename, geojson FROM tracks WHERE id = ?").get(id) as
        | { name: string; description: string; color: string; sourceFilename: string | null; geojson: string }
        | undefined;

    function driveTrack(item: MergeItem) {
      const state = drive.tracks.get(item.driveItemId);
      const row = staged.db
        .prepare(`SELECT geojson FROM tracks WHERE id = ? AND length(geojson) <= ${LIMITS.trackBytes}`)
        .get(item.driveItemId) as { geojson: unknown } | undefined;
      if (!state || state.hash === null || typeof row?.geojson !== "string")
        throw badRequest("This track could not be read from the drive.");
      return { state, geojson: row.geojson };
    }

    async function importTrack(name: string, description: string, color: string, sourceFilename: string | null, geojson: string) {
      const imported = await annotations.importTrack({
        source: trackGpx(name, description, geojson),
        filename: sourceFilename ? safeFileName(sourceFilename, "track.gpx") : undefined,
        name: name.trim().slice(0, 200) || "Track",
        color: asColor(color),
        importWaypointsAsMarkers: false,
      });
      if (!imported.track) throw badRequest("This track has no line in it, so it was not added.");
      if (description.trim()) annotations.updateTrack(imported.track.id, { description: description.slice(0, 20_000) });
      return imported.track;
    }

    async function addTrack(item: MergeItem, beside: boolean): Promise<void> {
      const { state, geojson } = driveTrack(item);
      const name = beside ? `${state.name.trim() || "Track"} (${from})`.slice(0, 200) : state.name;
      const created = await importTrack(name, state.description, state.color, state.sourceFilename, geojson);
      record({
        itemKey: item.key,
        kind: "track",
        outcome: beside ? "copied" : "added",
        title: created.name,
        message: beside ? "Home’s was kept; the drive’s was added beside it." : "Added from the drive.",
        driveItemId: state.id,
        homeItemId: created.id,
        driveHash: state.hash,
        homeHash: currentTrackHash(sqlite, created.id),
      });
    }

    async function updateTrack(item: MergeItem): Promise<void> {
      const { state, geojson } = driveTrack(item);
      const id = item.homeItemId!;
      const before = trackNow(id);
      if (!before || currentTrackHash(sqlite, id) !== item.homeHash) {
        record({ itemKey: item.key, kind: "track", outcome: "skipped", title: item.title, message: CHANGED_SINCE, homeItemId: id });
        return;
      }
      if (before.geojson === geojson) {
        together(() => {
          annotations.updateTrack(id, {
            name: state.name.trim().slice(0, 200) || before.name,
            description: state.description,
            color: asColor(state.color),
          });
          record({
            itemKey: item.key,
            kind: "track",
            outcome: "updated",
            title: state.name,
            message: "Its name, description or colour was updated from the drive.",
            driveItemId: state.id,
            homeItemId: id,
            driveHash: state.hash,
            homeHash: currentTrackHash(sqlite, id),
            undo: { type: "track", name: before.name, description: before.description, color: before.color },
          });
        });
        return;
      }
      // The line itself changed. The drive's is added first; home's goes only once that has worked.
      const created = await importTrack(state.name, state.description, state.color, state.sourceFilename, geojson);
      together(() => {
        annotations.removeTrack(id);
        record({
          itemKey: item.key,
          kind: "track",
          outcome: "updated",
          title: created.name,
          message: "Replaced with the drive’s. The one that was here is kept in this record.",
          driveItemId: state.id,
          homeItemId: created.id,
          driveHash: state.hash,
          homeHash: currentTrackHash(sqlite, created.id),
          undo: { type: "track-replaced", ...before },
        });
      });
    }

    function removeTrack(item: MergeItem): void {
      const id = item.homeItemId!;
      together(() => {
        const before = trackNow(id);
        if (!before || currentTrackHash(sqlite, id) !== item.homeHash) {
          record({ itemKey: item.key, kind: "track", outcome: "skipped", title: item.title, message: CHANGED_SINCE, homeItemId: id });
          return;
        }
        annotations.removeTrack(id);
        record({
          itemKey: item.key,
          kind: "track",
          outcome: "removed",
          title: item.title,
          message: "Removed because you ticked it. Undoing this merge adds it again.",
          driveItemId: item.driveItemId,
          homeItemId: id,
          driveHash: GONE,
          undo: { type: "track-removed", ...before },
        });
      });
    }

    // ── Collections ──

    async function copyCollection(item: MergeItem, onBytes: (label: string) => void): Promise<void> {
      const row = staged.db
        .prepare(
          "SELECT kind, title, catalog_entry_id, description, category, language, publisher, license, attribution, version, rel_path, size_bytes, sha256, meta FROM collections WHERE id = ?",
        )
        .get(item.driveItemId) as Record<string, unknown> | undefined;
      const theirs = drive.collections.find((entry) => entry.id === item.driveItemId);
      if (!row || !theirs) throw badRequest("This collection's record could not be read from the drive.");
      const kind = SUPPORTED_COLLECTIONS.find((supported) => supported === theirs.kind);
      if (!kind || theirs.isBook) throw badRequest("A merge copies reference collections and maps only.");
      let meta: z.infer<typeof collectionMeta>;
      try {
        meta = collectionMeta.parse(JSON.parse(String(row.meta)));
      } catch {
        throw badRequest("Its record on the drive is incomplete, so it was not copied. Download it at home from Explore instead.");
      }
      const source = await fileInside(libraryRoot, theirs.relPath);
      if (!source && !driveIsThere(merge)) throw new DriveGone();
      if (!source) throw badRequest("Its file is not on the drive, so it was not copied.");

      const location = storage.getDefault();
      const fileName = safeFileName(path.basename(theirs.relPath.replaceAll("\\", "/")), `collection-${item.driveItemId}`);
      // The same folders a download uses: collections/zim, collections/maps, collections/terrain.
      const relPath = `collections/${kind === "map" ? "maps" : kind}/${fileName}`;
      const target = storage.resolve(location.id, relPath);
      if (fs.existsSync(target)) {
        throw badRequest(`A file named “${fileName}” is already in your library’s folder, so nothing was copied over it.`);
      }
      await storage.assertSpace(location.id, source.size);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      const partial = `${target}.part`;
      try {
        await pipeline(
          fs.createReadStream(source.file, { highWaterMark: 1024 * 1024 }),
          async function* (chunks) {
            for await (const chunk of chunks) {
              onBytes(`Copying ${theirs.title}`);
              yield chunk;
            }
          },
          fs.createWriteStream(partial, { flags: "wx" }),
          { signal },
        );
        const expected = theirs.sha256?.toLowerCase() ?? null;
        const actual = await sha256File(partial, { signal });
        if (expected ? actual !== expected : (await sha256File(source.file, { signal })) !== actual) {
          throw badRequest("The copy does not match the file on the drive (or the drive’s checksum for it), so it was not kept.");
        }
        await fs.promises.rename(partial, target);
        const text = (value: unknown, max: number) => (typeof value === "string" && value ? value.slice(0, max) : null);
        const created = await collections.create({
          kind,
          title: theirs.title.trim() || fileName,
          locationId: location.id,
          relPath,
          catalogEntryId: theirs.catalogEntryId,
          description: text(row.description, 20_000),
          category: text(row.category, 200),
          language: text(row.language, 64),
          publisher: text(row.publisher, 300),
          license: text(row.license, 300),
          attribution: text(row.attribution, 2000),
          version: theirs.version,
          sizeBytes: source.size,
          sha256: actual,
          meta,
        });
        record({
          itemKey: item.key,
          kind: "collection",
          outcome: "added",
          title: created.title,
          message: "Copied from the drive and checked against its checksum.",
          driveItemId: item.driveItemId,
          homeItemId: created.id,
        });
      } catch (error) {
        await fs.promises.rm(partial, { force: true });
        throw error;
      }
    }

    // ── The order of work ──

    interface Work {
      item: MergeItem;
      label: string;
      kind: NewAction["kind"];
      run: () => void | Promise<void>;
    }
    const work: Work[] = [];
    const items = analysis.items.filter((item) => !done.has(item.key) && !item.blocked);
    const of = (kind: MergeItem["kind"]) => items.filter((item) => item.kind === kind);
    const bringsBack = (item: MergeItem) => item.conflict === "deleted-at-home" || item.conflict === "missing-at-home";

    // Documents first, so that pages which show them can point at home's copies.
    for (const item of of("document")) {
      const choice = choiceOf(item);
      if ((item.change === "added" && choice === "apply") || (item.change === "conflict" && bringsBack(item) && choice === "both")) {
        work.push({ item, kind: "document", label: `Copying ${item.title}`, run: () => addDocument(item) });
      }
    }

    // New pages: parents before their sub-pages, and every id settled before the first page is
    // written, so that links between new pages are right the first time.
    const creating = of("page").filter((item) => {
      const choice = choiceOf(item);
      return (item.change === "added" && choice === "apply") || (item.change === "conflict" && bringsBack(item) && choice === "both");
    });
    const depthOf = (id: string): number => {
      let depth = 0;
      const seen = new Set<string>();
      let current = drive.pages.get(id)?.parentId ?? null;
      while (current && !seen.has(current) && depth < 200) {
        seen.add(current);
        depth += 1;
        current = drive.pages.get(current)?.parentId ?? null;
      }
      return depth;
    };
    creating.sort((a, b) => depthOf(a.driveItemId) - depthOf(b.driveItemId));
    for (const item of creating) {
      // The same id as on the drive when nothing at home has it: an id is random enough that
      // a clash means the two are different pages, and then the page gets a new one.
      allocated.set(item.driveItemId, homePage(item.driveItemId) ? newId() : item.driveItemId);
      work.push({ item, kind: "page", label: `Adding ${item.title}`, run: () => createPage(item) });
    }

    for (const item of of("page")) {
      const choice = choiceOf(item);
      if (item.change === "edited" && choice === "apply")
        work.push({ item, kind: "page", label: `Updating ${item.title}`, run: () => updatePage(item) });
      else if (item.change === "conflict") {
        if (choice === "home") {
          work.push({
            item,
            kind: "page",
            label: item.title,
            run: () =>
              keep(
                item,
                "page",
                bringsBack(item)
                  ? "Left as it is at home; the drive’s version was not brought back."
                  : "Home’s version was kept. The drive’s version stays on the drive.",
              ),
          });
        } else if (!bringsBack(item) && choice === "drive") {
          work.push({ item, kind: "page", label: `Updating ${item.title}`, run: () => updatePage(item) });
        } else if (!bringsBack(item) && choice === "both") {
          work.push({ item, kind: "page", label: `Adding ${item.title}`, run: () => createPage(item, { beside: item.homeItemId! }) });
        }
      }
    }
    for (const item of of("page")) {
      if (item.change === "moved" && choiceOf(item) === "apply")
        work.push({ item, kind: "page", label: `Moving ${item.title}`, run: () => movePage(item) });
    }
    for (const item of of("page")) {
      if (item.change !== "deleted") continue;
      if (choiceOf(item) === "apply")
        work.push({ item, kind: "page", label: `Moving ${item.title} to the trash`, run: () => trashPage(item) });
      else work.push({ item, kind: "page", label: item.title, run: () => keep(item, "page", "Deleted on the drive; kept at home.", true) });
    }

    for (const item of of("document")) {
      const choice = choiceOf(item);
      if (item.change === "edited" && choice === "apply")
        work.push({ item, kind: "document", label: `Updating ${item.title}`, run: () => updateDocument(item) });
      else if (item.change === "conflict" && choice === "home") {
        work.push({
          item,
          kind: "document",
          label: item.title,
          run: () => keep(item, "document", bringsBack(item) ? "Left out of your library, as it is at home." : "Home’s details were kept."),
        });
      } else if (item.change === "conflict" && !bringsBack(item) && choice === "drive") {
        work.push({ item, kind: "document", label: `Updating ${item.title}`, run: () => updateDocument(item) });
      } else if (item.change === "deleted") {
        if (choice === "apply") work.push({ item, kind: "document", label: `Removing ${item.title}`, run: () => removeDocument(item) });
        else
          work.push({
            item,
            kind: "document",
            label: item.title,
            run: () => keep(item, "document", "Removed on the drive; kept at home.", true),
          });
      }
    }

    for (const kind of ["place", "track"] as const) {
      const add = (item: MergeItem, beside: boolean) => (kind === "place" ? addPlace(item, beside) : addTrack(item, beside));
      const update = (item: MergeItem) => (kind === "place" ? updatePlace(item) : updateTrack(item));
      const remove = (item: MergeItem) => (kind === "place" ? removePlace(item) : removeTrack(item));
      for (const item of of(kind)) {
        const choice = choiceOf(item);
        if (item.change === "added" && choice === "apply")
          work.push({ item, kind, label: `Adding ${item.title}`, run: () => add(item, false) });
        else if (item.change === "edited" && choice === "apply")
          work.push({ item, kind, label: `Updating ${item.title}`, run: () => update(item) });
        else if (item.change === "conflict") {
          if (choice === "home") work.push({ item, kind, label: item.title, run: () => keep(item, kind, "Home’s was kept.") });
          else if (choice === "drive" && !bringsBack(item))
            work.push({ item, kind, label: `Updating ${item.title}`, run: () => update(item) });
          else if (choice === "both") work.push({ item, kind, label: `Adding ${item.title}`, run: () => add(item, !bringsBack(item)) });
        } else if (item.change === "deleted") {
          if (choice === "apply") work.push({ item, kind, label: `Removing ${item.title}`, run: () => remove(item) });
          else work.push({ item, kind, label: item.title, run: () => keep(item, kind, "Removed on the drive; kept at home.", true) });
        }
      }
    }

    // The large things last: stopping during one loses nothing that came before it.
    let current = 0;
    for (const item of of("collection")) {
      if (choiceOf(item) !== "apply") continue;
      work.push({
        item,
        kind: "collection",
        label: `Copying ${item.title}`,
        run: () => copyCollection(item, (message) => input.progress({ current, total: work.length, message })),
      });
    }

    for (const step of work) {
      signal.throwIfAborted();
      input.progress({ current, total: work.length, message: step.label });
      try {
        await step.run();
      } catch (error) {
        if (signal.aborted || error instanceof DriveGone) throw error;
        ctx.log.warn({ err: error, item: step.item.key }, "merge item failed");
        const known = error instanceof AppError || error instanceof z.ZodError;
        record({
          itemKey: step.item.key,
          kind: step.kind,
          outcome: "failed",
          title: step.item.title,
          message: known
            ? error instanceof z.ZodError
              ? (error.issues[0]?.message ?? "It is not something Outpost can hold.")
              : error.message
            : `Something went wrong: ${messageOf(error)}`,
          homeItemId: step.item.homeItemId,
        });
      }
      current += 1;
    }
    input.progress({ current: work.length, total: work.length, message: "Done" });
  } finally {
    staged.close();
  }
}

// ── Undoing ─────────────────────────────────────────────────────────────────

interface PageBefore {
  title: string;
  icon: string | null;
  content: unknown;
  tags: string[];
  coverAttachmentId: string | null;
}

export async function undoMerge(ctx: AppContext, merge: MergeRow, options: { removeDocuments: boolean }): Promise<void> {
  const { db, sqlite } = ctx;
  const { notes, documents, maps } = ctx.services;
  const annotations = maps.annotations;
  const actions = db
    .select()
    .from(driveMergeActions)
    .where(and(eq(driveMergeActions.mergeId, merge.id), isNull(driveMergeActions.undoneAt)))
    .all()
    .sort((a, b) => b.seq - a.seq);

  const settle = (action: ActionRow, undone: boolean, message: string | null) => {
    db.update(driveMergeActions)
      .set({ undoneAt: undone ? Date.now() : null, undoMessage: message })
      .where(and(eq(driveMergeActions.mergeId, merge.id), eq(driveMergeActions.seq, action.seq)))
      .run();
  };
  const pageRow = (id: string) =>
    sqlite.prepare("SELECT id, parent_id AS parentId, trashed_at AS trashedAt FROM notes WHERE id = ?").get(id) as
      | { id: string; parentId: string | null; trashedAt: number | null }
      | undefined;
  const alive = (id: string | null) => {
    const row = id ? pageRow(id) : undefined;
    return row !== undefined && row.trashedAt === null;
  };
  const CHANGED = "It has been changed since the merge, so it was left as it is.";

  async function undoOne(action: ActionRow): Promise<void> {
    const id = action.homeItemId;
    const undo = action.undo as Record<string, unknown> | null;
    // A decision with nothing to put back is simply forgotten, so the drive's version is offered again.
    if (["kept", "already", "skipped", "failed"].includes(action.outcome) || action.kind === "attachment") {
      if (action.kind !== "attachment" && action.outcome !== "skipped" && action.outcome !== "failed") settle(action, true, null);
      return;
    }
    if (!id) return settle(action, true, null);

    if (action.kind === "page") {
      const row = pageRow(id);
      if (action.outcome === "added" || action.outcome === "copied") {
        if (!row || row.trashedAt !== null) return settle(action, true, "It was already in the trash or gone.");
        const children = sqlite.prepare("SELECT count(*) AS n FROM notes WHERE parent_id = ? AND trashed_at IS NULL").get(id) as {
          n: number;
        };
        if (children.n > 0) return settle(action, false, "It has sub-pages that were added since, so it was left where it is.");
        notes.trash(id);
        return settle(action, true, "Moved to the trash.");
      }
      if (action.outcome === "updated" && undo) {
        const before = undo as unknown as PageBefore;
        if (!row)
          return settle(action, false, "The page no longer exists. The version from before the merge is still kept in this record.");
        const unchanged = row.trashedAt === null && currentPageHash(sqlite, id) === action.homeHash;
        const cover =
          before.coverAttachmentId && sqlite.prepare("SELECT 1 FROM attachments WHERE id = ?").get(before.coverAttachmentId)
            ? before.coverAttachmentId
            : null;
        if (unchanged) {
          notes.update(id, {
            title: before.title,
            icon: before.icon,
            content: before.content,
            tags: safeTags(before.tags),
            coverAttachmentId: cover,
          });
          return settle(action, true, "Put back as it was before the merge.");
        }
        // Never over what a person has written since: the earlier version comes back as a page of its own.
        const parentId = row.trashedAt === null && alive(row.parentId) ? row.parentId : null;
        notes.adopt({
          parentId,
          afterId: row.trashedAt === null && row.parentId === parentId ? id : undefined,
          title: `${before.title.trim() || "Untitled"} (as it was before the merge of ${dateWords(merge.createdAt)})`.slice(0, 300),
          icon: before.icon,
          content: before.content,
          tags: safeTags(before.tags),
          coverAttachmentId: cover,
        });
        return settle(
          action,
          true,
          "The page has changed since the merge, so the version from before it was added beside it as a page of its own.",
        );
      }
      if (action.outcome === "moved" && undo) {
        if (!row || row.trashedAt !== null || row.parentId !== (undo.movedTo ?? null))
          return settle(action, false, "It has been moved again since, so it was left where it is.");
        const back = typeof undo.parentId === "string" && alive(undo.parentId) ? undo.parentId : null;
        notes.move(id, { parentId: back });
        return settle(action, true, "Moved back.");
      }
      if (action.outcome === "trashed") {
        if (!undo) return settle(action, true, null);
        if (!row) return settle(action, false, "It has been deleted for good since, so it cannot be brought back.");
        if (row.trashedAt !== null) notes.restore(id);
        return settle(action, true, "Restored from the trash.");
      }
      return settle(action, true, null);
    }

    if (action.kind === "document") {
      const exists = sqlite.prepare("SELECT 1 FROM documents WHERE id = ?").get(id) !== undefined;
      if (action.outcome === "added") {
        if (!exists) return settle(action, true, "It was already removed.");
        if (!options.removeDocuments) return settle(action, false, "Still in your library. Remove it there if you do not want it.");
        await documents.remove(id);
        return settle(action, true, "Removed from your library.");
      }
      if (action.outcome === "updated" && undo) {
        if (!exists || currentDocumentHash(sqlite, id) !== action.homeHash) return settle(action, false, CHANGED);
        await documents.update(id, {
          title: String(undo.title),
          category: undo.category as string | null,
          description: undo.description as string | null,
          author: undo.author as string | null,
          source: undo.source as string | null,
          language: undo.language as string | null,
          tags: safeTags(undo.tags as string[]),
        });
        return settle(action, true, "Its details were put back.");
      }
      if (action.outcome === "removed") return settle(action, false, "Its file was deleted, so it cannot be brought back.");
      return settle(action, true, null);
    }

    if (action.kind === "place") {
      const exists = sqlite.prepare("SELECT 1 FROM markers WHERE id = ?").get(id) !== undefined;
      const fields = (value: Record<string, unknown>) => ({
        name: String(value.name),
        note: String(value.note ?? ""),
        lat: value.lat as number,
        lon: value.lon as number,
        color: asColor(String(value.color)),
        // A record made before places had icons has neither: the place goes back to a plain pin, which is what it was.
        icon: asMarkerIcon(value.icon),
        gpxSym: typeof value.gpxSym === "string" ? value.gpxSym : null,
        isFavorite: value.isFavorite === true,
        noteId: typeof value.noteId === "string" && pageRow(value.noteId) ? value.noteId : null,
      });
      if (action.outcome === "added" || action.outcome === "copied") {
        if (!exists) return settle(action, true, "It was already removed.");
        if (currentPlaceHash(sqlite, id) !== action.homeHash) return settle(action, false, CHANGED);
        annotations.removeMarker(id);
        return settle(action, true, "Removed.");
      }
      if (action.outcome === "updated" && undo) {
        if (!exists || currentPlaceHash(sqlite, id) !== action.homeHash) return settle(action, false, CHANGED);
        annotations.updateMarker(id, fields(undo));
        return settle(action, true, "Put back as it was.");
      }
      if (action.outcome === "removed" && undo) {
        annotations.createMarker(fields(undo));
        return settle(action, true, "Added again.");
      }
      return settle(action, true, null);
    }

    if (action.kind === "track") {
      const exists = sqlite.prepare("SELECT 1 FROM tracks WHERE id = ?").get(id) !== undefined;
      const again = async (value: Record<string, unknown>) => {
        const imported = await annotations.importTrack({
          source: trackGpx(String(value.name), String(value.description ?? ""), String(value.geojson)),
          filename: typeof value.sourceFilename === "string" ? value.sourceFilename : undefined,
          name: String(value.name),
          color: asColor(String(value.color)),
          importWaypointsAsMarkers: false,
        });
        if (imported.track && String(value.description ?? "").trim()) {
          annotations.updateTrack(imported.track.id, { description: String(value.description) });
        }
      };
      if (action.outcome === "added" || action.outcome === "copied") {
        if (!exists) return settle(action, true, "It was already removed.");
        if (currentTrackHash(sqlite, id) !== action.homeHash) return settle(action, false, CHANGED);
        annotations.removeTrack(id);
        return settle(action, true, "Removed.");
      }
      if (action.outcome === "updated" && undo) {
        if (!exists || currentTrackHash(sqlite, id) !== action.homeHash) return settle(action, false, CHANGED);
        if (undo.type === "track-replaced") {
          await again(undo);
          annotations.removeTrack(id);
          return settle(action, true, "The track that was here before the merge was put back.");
        }
        annotations.updateTrack(id, {
          name: String(undo.name),
          description: String(undo.description ?? ""),
          color: asColor(String(undo.color)),
        });
        return settle(action, true, "Put back as it was.");
      }
      if (action.outcome === "removed" && undo) {
        await again(undo);
        return settle(action, true, "Added again.");
      }
      return settle(action, true, null);
    }

    if (action.kind === "collection") return settle(action, false, "Still in your library. Remove it there if you do not want it.");
  }

  for (const action of actions) {
    try {
      await undoOne(action);
    } catch (error) {
      ctx.log.warn({ err: error, merge: merge.id, seq: action.seq }, "undoing a merge action failed");
      settle(action, false, `Could not be undone: ${messageOf(error)}`);
    }
  }
}
