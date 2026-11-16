/**
 * What people add to the map themselves: markers (a named point with a note) and
 * tracks (lines imported from GPX files, or drawn on the map point by point). Both are
 * indexed for the app-wide search.
 */

import {
  asMarkerIcon,
  type Bbox,
  formatDecimal,
  MARKER_COLORS,
  MARKER_ICONS,
  MAX_RECORDING_POINTS,
  type MarkerColor,
  type MarkerDto,
  type RecordingSaveResponse,
  type RouteElevation,
  type RouteSaveResponse,
  readTrackSource,
  type TrackDto,
  type TrackImportResponse,
  type TrackWithGeometryDto,
} from "@outpost/shared";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { yieldToEventLoop } from "../../core/event-loop.ts";
import { newId } from "../../core/ids.ts";
import { markers, tracks } from "../../db/schema.ts";
import { buildDrawnLine, type DrawnLine, routePointsSchema } from "./drawn-route.ts";
import type { ElevationSampler } from "./elevation.ts";
import { buildGpx, type GpxDocument, type GpxWaypoint, parseGpxSafely, splitCollection, type TrackCollection, trackStats } from "./gpx.ts";
import { GPX_LIMITS } from "./gpx-reader.ts";
import { gpxCredit } from "./route-finder/credit.ts";
import { iconForSymbol, symbolForPlace } from "./waypoint-symbols.ts";

type MarkerRow = typeof markers.$inferSelect;
type TrackRow = typeof tracks.$inferSelect;

const color = z.enum(MARKER_COLORS, { error: `Choose one of the marker colours: ${MARKER_COLORS.join(", ")}.` });
const icon = z.enum(MARKER_ICONS, { error: `Choose one of the place icons: ${MARKER_ICONS.join(", ")}.` });
const latitude = z.number().finite().min(-90, "Latitude must be between -90 and 90.").max(90, "Latitude must be between -90 and 90.");
const longitude = z
  .number()
  .finite()
  .min(-180, "Longitude must be between -180 and 180.")
  .max(180, "Longitude must be between -180 and 180.");

export const markerCreateSchema = z.object({
  name: z.string().trim().min(1, "Give the marker a name.").max(200),
  note: z.string().max(20_000).optional(),
  lat: latitude,
  lon: longitude,
  color: color.optional(),
  icon: icon.optional(),
  isFavorite: z.boolean().optional(),
  noteId: z.string().min(1).max(64).nullish(),
});
export const markerPatchSchema = markerCreateSchema.partial();

/**
 * A place as the service takes it. Beyond what a request may say, the server's own
 * callers (a GPX import, a merge from a drive) may give the `<sym>` the place had in
 * the file it came from. It is kept as written and never shown; see `symbolForPlace`.
 */
export type MarkerInput = z.infer<typeof markerCreateSchema> & { gpxSym?: string | null };

export const trackPatchSchema = z.object({
  name: z.string().trim().min(1, "Give the track a name.").max(200).optional(),
  description: z.string().max(20_000).optional(),
  color: color.optional(),
});

export const routeCreateSchema = z.object({
  name: z.string().trim().min(1, "Give the route a name.").max(200),
  description: z.string().max(20_000).optional(),
  color: color.optional(),
  points: routePointsSchema,
});

export const routePointsReplaceSchema = z.object({ points: routePointsSchema });

export interface TrackImportInput {
  /** The GPX file's text. */
  source: string;
  filename?: string;
  name?: string;
  color?: MarkerColor;
  importWaypointsAsMarkers?: boolean;
}

export interface RecordingSaveInput {
  /** The id the recording was given on the device that made it; the track is saved under it. */
  id: string;
  /** The recording as GPX text, built on that device. */
  source: string;
  name: string;
  color?: MarkerColor;
}

/**
 * The lines of a recording, checked and marked as recorded. A recording is tracks and
 * nothing else, with the time each point was taken, and no more points than the map
 * will record. Anything else is a GPX file, and belongs to the import.
 */
function recordedLines(collection: TrackCollection): TrackCollection["features"] {
  let points = 0;
  for (const feature of collection.features) {
    if (feature.geometry.type === "Point" || feature.properties._gpxType !== "trk") {
      throw badRequest("A recording holds a track and nothing else. To bring in a GPX file with routes or waypoints, import it instead.");
    }
    const segments = feature.geometry.type === "LineString" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const times = feature.properties.coordinateProperties?.times;
    const timesBySegment = (feature.geometry.type === "LineString" ? [times] : (times ?? [])) as Array<Array<string | null> | undefined>;
    segments.forEach((segment, index) => {
      points += segment.length;
      const segmentTimes = timesBySegment[index];
      if (!segmentTimes || segmentTimes.length !== segment.length || segmentTimes.includes(null)) {
        throw badRequest(
          "Every point of a recording carries the time it was taken, and some of these do not. Import the file as GPX instead.",
        );
      }
    });
  }
  if (points > MAX_RECORDING_POINTS) {
    throw badRequest(
      `That recording has ${points.toLocaleString("en-GB")} points, and one recording can hold at most ${MAX_RECORDING_POINTS.toLocaleString("en-GB")}.`,
    );
  }
  // The recording's name is the track's own, so that renaming the track renames what is exported.
  return collection.features.map((feature) => {
    const { name: _name, desc: _desc, ...properties } = feature.properties;
    return { ...feature, properties: { ...properties, _recorded: true as const } };
  });
}

export interface AnnotationsService {
  listMarkers(): MarkerDto[];
  createMarker(input: MarkerInput): MarkerDto;
  updateMarker(id: string, patch: Partial<MarkerInput>): MarkerDto;
  removeMarker(id: string): void;
  listTracks(): TrackDto[];
  getTrack(id: string): TrackWithGeometryDto;
  importTrack(input: TrackImportInput): Promise<TrackImportResponse>;
  /**
   * Saves a track recorded on the map under the id its device gave it. Asked twice
   * with the same id, it answers the second time with the track that is already there.
   */
  saveRecording(input: RecordingSaveInput): Promise<RecordingSaveResponse>;
  /** A route drawn on the map: straight lines between the points given. */
  createRoute(input: z.infer<typeof routeCreateSchema>): Promise<RouteSaveResponse>;
  /** Replaces a track's lines with one drawn through the points given. Its waypoints are kept. */
  replaceRoutePoints(id: string, input: z.infer<typeof routePointsReplaceSchema>): Promise<RouteSaveResponse>;
  /**
   * Saves lines that are already made (a route found in a route source), with the
   * credit they carry as the collection's `source`. Nothing is read or sampled here.
   */
  createFromCollection(input: {
    name: string;
    description: string;
    color?: MarkerColor;
    collection: TrackCollection;
    elevation: RouteElevation;
  }): RouteSaveResponse;
  /** Replaces a track's stored lines as they are, keeping its name, colour and description. */
  replaceCollection(id: string, collection: TrackCollection, elevation: RouteElevation): RouteSaveResponse;
  updateTrack(id: string, patch: z.infer<typeof trackPatchSchema>): TrackDto;
  removeTrack(id: string): void;
  exportTrack(id: string): { filename: string; gpx: string };
  exportSelection(selection: { markers: boolean; trackIds: string[] }): { filename: string; gpx: string };
  counts(): { markers: number; tracks: number };
}

/**
 * Waypoints one import may turn into markers: as many as the reader allows in a file.
 * Each marker is a row and a search entry written on the server's own thread, about
 * 0.2 ms apiece, so they are written `MARKER_WRITE_BATCH` at a time with a pause between
 * for requests to be answered. Waypoints kept with their track cost nothing of the kind.
 */
export const MAX_WAYPOINTS_AS_MARKERS = 20_000;
/** Markers written before the server looks up from the work: about a fortieth of a second's worth. */
const MARKER_WRITE_BATCH = 100;

/** Characters kept of the symbol a place had in a GPX file: as many as the reader keeps of one. */
const GPX_SYM_LENGTH = GPX_LIMITS.textLength;

const asColor = (value: string): MarkerColor => ((MARKER_COLORS as readonly string[]).includes(value) ? (value as MarkerColor) : "teal");

const toMarkerDto = (row: MarkerRow): MarkerDto => ({
  id: row.id,
  name: row.name,
  note: row.note,
  lat: row.lat,
  lon: row.lon,
  color: asColor(row.color),
  icon: asMarkerIcon(row.icon),
  isFavorite: row.isFavorite,
  noteId: row.noteId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toTrackDto = (row: Omit<TrackRow, "geojson">): TrackDto => ({
  id: row.id,
  name: row.name,
  description: row.description,
  color: asColor(row.color),
  sourceFilename: row.sourceFilename,
  distanceMeters: row.distanceMeters,
  ascentMeters: row.ascentMeters,
  pointCount: row.pointCount,
  bounds: row.bounds as Bbox | null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** A name fit for a downloaded file. */
function fileNameOf(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N} _.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${cleaned || "outpost"}.gpx`;
}

export function createAnnotationsService(ctx: AppContext, deps: { elevation: ElevationSampler }): AnnotationsService {
  const { db, sqlite } = ctx;
  const { search } = ctx.services;
  const changed = () => ctx.events.publish({ type: "maps.changed" });

  function markerRow(id: string): MarkerRow {
    const row = db.select().from(markers).where(eq(markers.id, id)).get();
    if (!row) throw notFound("Marker");
    return row;
  }

  function trackRow(id: string): TrackRow {
    const row = db.select().from(tracks).where(eq(tracks.id, id)).get();
    if (!row) throw notFound("Track");
    return row;
  }

  function indexMarker(row: MarkerRow): void {
    search.upsert({
      kind: "marker",
      entityId: row.id,
      title: row.name,
      subtitle: formatDecimal(row.lat, row.lon),
      collection: "Map markers",
      url: `/maps?marker=${row.id}`,
      sections: row.note.trim() ? [{ text: row.note }] : [],
    });
  }

  function indexTrack(row: TrackRow): void {
    const kilometres = (row.distanceMeters / 1000).toFixed(1);
    // Names of the lines and waypoints inside are worth finding too ("the bothy on day 2").
    const names = new Set<string>();
    for (const feature of (row.geojson as unknown as TrackCollection).features ?? []) {
      if (feature.properties?.name && feature.properties.name !== row.name) names.add(feature.properties.name);
    }
    const body = [row.description, [...names].join("\n")].filter((part) => part.trim()).join("\n\n");
    search.upsert({
      kind: "track",
      entityId: row.id,
      title: row.name,
      subtitle: `${kilometres} km${row.ascentMeters ? `, ${Math.round(row.ascentMeters)} m of ascent` : ""}`,
      collection: "Map tracks",
      url: `/maps?track=${row.id}`,
      sections: body ? [{ text: body }] : [],
    });
  }

  function insertMarker(input: MarkerInput): MarkerRow {
    const now = Date.now();
    const id = newId();
    db.insert(markers)
      .values({
        id,
        name: input.name,
        note: input.note ?? "",
        lat: input.lat,
        lon: input.lon,
        color: input.color ?? "teal",
        icon: input.icon ?? "pin",
        gpxSym: input.gpxSym?.slice(0, GPX_SYM_LENGTH) || null,
        isFavorite: input.isFavorite ?? false,
        noteId: input.noteId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const row = markerRow(id);
    indexMarker(row);
    return row;
  }

  const trackColumns = {
    id: tracks.id,
    name: tracks.name,
    description: tracks.description,
    color: tracks.color,
    sourceFilename: tracks.sourceFilename,
    distanceMeters: tracks.distanceMeters,
    ascentMeters: tracks.ascentMeters,
    pointCount: tracks.pointCount,
    bounds: tracks.bounds,
    createdAt: tracks.createdAt,
    updatedAt: tracks.updatedAt,
  };

  /**
   * Length, size and extent come from the points as placed. The climb comes from the
   * line sampled between them, so a hill between two distant points is counted.
   */
  function drawnStats(collection: TrackCollection, drawn: DrawnLine) {
    const stats = trackStats(collection);
    const ascentMeters = drawn.profile
      ? trackStats({
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: drawn.profile } }],
        }).ascentMeters
      : null;
    return { ...stats, ascentMeters };
  }

  /** A stored track's lines and waypoints, each line saying where it came from if the track was found in a route source. */
  function credited(row: TrackRow): Pick<GpxDocument, "lines" | "waypoints"> {
    const { lines, waypoints } = splitCollection(row.geojson as unknown as TrackCollection);
    const source = readTrackSource(row.geojson);
    if (!source) return { lines, waypoints };
    const credit = gpxCredit(source);
    return {
      lines: lines.map((line) => ({
        ...line,
        properties: { ...line.properties, src: credit.src, ...(credit.trackLink ? { link: credit.trackLink } : {}) },
      })),
      waypoints,
    };
  }

  const markerWaypoints = (): GpxWaypoint[] =>
    db
      .select()
      .from(markers)
      .orderBy(markers.createdAt)
      .all()
      .map((row) => ({
        name: row.name,
        description: row.note || undefined,
        lat: row.lat,
        lon: row.lon,
        time: new Date(row.createdAt).toISOString(),
        sym: symbolForPlace(asMarkerIcon(row.icon), row.gpxSym),
      }));

  return {
    listMarkers() {
      return db.select().from(markers).orderBy(desc(markers.isFavorite), desc(markers.updatedAt)).all().map(toMarkerDto);
    },

    createMarker(input) {
      const row = insertMarker(input);
      changed();
      return toMarkerDto(row);
    },

    updateMarker(id, patch) {
      markerRow(id);
      const set: Partial<typeof markers.$inferInsert> = { updatedAt: Date.now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.note !== undefined) set.note = patch.note;
      if (patch.lat !== undefined) set.lat = patch.lat;
      if (patch.lon !== undefined) set.lon = patch.lon;
      if (patch.color !== undefined) set.color = patch.color;
      if (patch.icon !== undefined) set.icon = patch.icon;
      if (patch.gpxSym !== undefined) set.gpxSym = patch.gpxSym?.slice(0, GPX_SYM_LENGTH) || null;
      if (patch.isFavorite !== undefined) set.isFavorite = patch.isFavorite;
      if (patch.noteId !== undefined) set.noteId = patch.noteId;
      db.update(markers).set(set).where(eq(markers.id, id)).run();
      const row = markerRow(id);
      indexMarker(row);
      changed();
      return toMarkerDto(row);
    },

    removeMarker(id) {
      markerRow(id);
      db.delete(markers).where(eq(markers.id, id)).run();
      search.remove("marker", id);
      changed();
    },

    listTracks() {
      // Geometry can run to megabytes per track; lists do without it.
      return db.select(trackColumns).from(tracks).orderBy(desc(tracks.createdAt)).all().map(toTrackDto);
    },

    getTrack(id) {
      const row = trackRow(id);
      return { ...toTrackDto(row), geojson: row.geojson as unknown as TrackWithGeometryDto["geojson"] };
    },

    async importTrack(input) {
      const parsed = await parseGpxSafely(input.source);
      const fallbackName = input.filename?.replace(/\.[^.]+$/, "").trim();
      const name = (input.name?.trim() || parsed.name || fallbackName || "Imported track").slice(0, 200);
      const asMarkers = input.importWaypointsAsMarkers === true;
      // Waypoints either stay with the track or become markers; never both, or they would show twice.
      const features = asMarkers
        ? parsed.collection.features.filter((feature) => feature.geometry.type !== "Point")
        : parsed.collection.features;
      const waypoints = parsed.collection.features.filter((feature) => feature.geometry.type === "Point");
      if (asMarkers && waypoints.length > MAX_WAYPOINTS_AS_MARKERS) {
        throw badRequest(
          `That file has ${waypoints.length.toLocaleString("en-GB")} waypoints, and Outpost saves at most ${MAX_WAYPOINTS_AS_MARKERS.toLocaleString("en-GB")} as places from one file. Import it with its waypoints kept on the route, or split it into smaller files.`,
        );
      }

      // Markers go in a batch at a time, each batch a transaction, so that twenty thousand of
      // them do not hold the server for four seconds. The import is still all or nothing:
      // if anything fails, in a later batch or in storing the track, what was written is
      // taken out again. (Only the process dying part of the way through leaves markers
      // without the rest.)
      const created: MarkerRow[] = [];
      const writeMarkers = sqlite.transaction((batch: typeof waypoints): MarkerRow[] =>
        batch.map((waypoint) => {
          const [lon, lat] = waypoint.geometry.coordinates as [number, number];
          return insertMarker({
            name: waypoint.properties.name ?? "Waypoint",
            note: waypoint.properties.desc ?? "",
            lat,
            lon,
            color: input.color,
            // A symbol Outpost knows becomes its icon; any other stays a plain pin. Either way the file's own word is kept.
            icon: iconForSymbol(waypoint.properties.sym),
            gpxSym: waypoint.properties.sym,
          });
        }),
      );
      const takeOut = sqlite.transaction((batch: MarkerRow[]) => {
        for (const row of batch) {
          db.delete(markers).where(eq(markers.id, row.id)).run();
          search.remove("marker", row.id);
        }
      });
      const storeTrack = sqlite.transaction((): TrackRow | null => {
        if (features.length === 0) return null;
        const collection: TrackCollection = { type: "FeatureCollection", features };
        const stats = trackStats(collection);
        const now = Date.now();
        const id = newId();
        db.insert(tracks)
          .values({
            id,
            name,
            description: parsed.description ?? "",
            color: input.color ?? "teal",
            geojson: collection as unknown as Record<string, unknown>,
            sourceFilename: input.filename?.slice(0, 255) ?? null,
            distanceMeters: stats.distanceMeters,
            ascentMeters: stats.ascentMeters,
            pointCount: stats.pointCount,
            bounds: stats.bounds,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        const row = trackRow(id);
        indexTrack(row);
        return row;
      });

      let track: TrackRow | null;
      try {
        if (asMarkers) {
          for (let start = 0; start < waypoints.length; start += MARKER_WRITE_BATCH) {
            if (start > 0) await yieldToEventLoop();
            created.push(...writeMarkers(waypoints.slice(start, start + MARKER_WRITE_BATCH)));
          }
        }
        track = storeTrack();
      } catch (error) {
        for (let start = 0; start < created.length; start += MARKER_WRITE_BATCH) {
          takeOut(created.slice(start, start + MARKER_WRITE_BATCH));
          await yieldToEventLoop();
        }
        if (created.length > 0) changed();
        throw error;
      }
      const result = { track, created };

      changed();
      return { track: result.track ? toTrackDto(result.track) : null, markers: result.created.map(toMarkerDto) };
    },

    async saveRecording(input) {
      const saved = () => {
        const row = db.select(trackColumns).from(tracks).where(eq(tracks.id, input.id)).get();
        return row ? { track: toTrackDto(row), alreadySaved: true } : null;
      };
      // A save whose answer never arrived is sent again: the track is there, and that is the answer.
      const already = saved();
      if (already) return already;
      const parsed = await parseGpxSafely(input.source);
      const features = recordedLines(parsed.collection);
      const collection: TrackCollection = { type: "FeatureCollection", features };
      const stats = trackStats(collection);
      // The file was read away from this thread, and the same recording may have arrived twice at once.
      const meanwhile = saved();
      if (meanwhile) return meanwhile;
      const now = Date.now();
      db.insert(tracks)
        .values({
          id: input.id,
          name: input.name,
          description: "",
          color: input.color ?? "teal",
          geojson: collection as unknown as Record<string, unknown>,
          sourceFilename: null,
          distanceMeters: stats.distanceMeters,
          ascentMeters: stats.ascentMeters,
          pointCount: stats.pointCount,
          bounds: stats.bounds,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = trackRow(input.id);
      indexTrack(row);
      changed();
      return { track: toTrackDto(row), alreadySaved: false };
    },

    async createRoute(input) {
      // Heights are read before anything is written: a slow disk must not hold a transaction open.
      const drawn = await buildDrawnLine(input.points, deps.elevation);
      const collection: TrackCollection = { type: "FeatureCollection", features: [drawn.feature] };
      const stats = drawnStats(collection, drawn);
      const now = Date.now();
      const id = newId();
      db.insert(tracks)
        .values({
          id,
          name: input.name,
          description: input.description ?? "",
          color: input.color ?? "teal",
          geojson: collection as unknown as Record<string, unknown>,
          sourceFilename: null,
          distanceMeters: stats.distanceMeters,
          ascentMeters: stats.ascentMeters,
          pointCount: stats.pointCount,
          bounds: stats.bounds,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = trackRow(id);
      indexTrack(row);
      changed();
      return { track: toTrackDto(row), elevation: drawn.elevation };
    },

    async replaceRoutePoints(id, input) {
      trackRow(id);
      const drawn = await buildDrawnLine(input.points, deps.elevation);
      // Read again: the heights took a moment, and the track may have been renamed or removed meanwhile.
      const current = trackRow(id);
      const previous = current.geojson as unknown as TrackCollection;
      const waypoints = (previous.features ?? []).filter((feature) => feature.geometry?.type === "Point");
      // A route found in a route source is still that source's data after its shape is edited: the credit stays.
      const source = readTrackSource(previous);
      const collection: TrackCollection = {
        type: "FeatureCollection",
        features: [drawn.feature, ...waypoints],
        ...(source ? { source } : {}),
      };
      const stats = drawnStats(collection, drawn);
      db.update(tracks)
        .set({
          geojson: collection as unknown as Record<string, unknown>,
          distanceMeters: stats.distanceMeters,
          ascentMeters: stats.ascentMeters,
          pointCount: stats.pointCount,
          bounds: stats.bounds,
          updatedAt: Date.now(),
        })
        .where(eq(tracks.id, id))
        .run();
      const row = trackRow(id);
      indexTrack(row);
      changed();
      return { track: toTrackDto(row), elevation: drawn.elevation };
    },

    createFromCollection(input) {
      const stats = trackStats(input.collection);
      const now = Date.now();
      const id = newId();
      db.insert(tracks)
        .values({
          id,
          name: input.name,
          description: input.description,
          color: input.color ?? "teal",
          geojson: input.collection as unknown as Record<string, unknown>,
          sourceFilename: null,
          distanceMeters: stats.distanceMeters,
          ascentMeters: stats.ascentMeters,
          pointCount: stats.pointCount,
          bounds: stats.bounds,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = trackRow(id);
      indexTrack(row);
      changed();
      return { track: toTrackDto(row), elevation: input.elevation };
    },

    replaceCollection(id, collection, elevation) {
      trackRow(id);
      const stats = trackStats(collection);
      db.update(tracks)
        .set({
          geojson: collection as unknown as Record<string, unknown>,
          distanceMeters: stats.distanceMeters,
          ascentMeters: stats.ascentMeters,
          pointCount: stats.pointCount,
          bounds: stats.bounds,
          updatedAt: Date.now(),
        })
        .where(eq(tracks.id, id))
        .run();
      const row = trackRow(id);
      indexTrack(row);
      changed();
      return { track: toTrackDto(row), elevation };
    },

    updateTrack(id, patch) {
      trackRow(id);
      const set: Partial<typeof tracks.$inferInsert> = { updatedAt: Date.now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.description !== undefined) set.description = patch.description;
      if (patch.color !== undefined) set.color = patch.color;
      db.update(tracks).set(set).where(eq(tracks.id, id)).run();
      const row = trackRow(id);
      indexTrack(row);
      changed();
      return toTrackDto(row);
    },

    removeTrack(id) {
      trackRow(id);
      db.delete(tracks).where(eq(tracks.id, id)).run();
      search.remove("track", id);
      changed();
    },

    exportTrack(id) {
      const row = trackRow(id);
      const { lines, waypoints } = credited(row);
      // A single unnamed line takes the track's name, so it is not anonymous in other apps.
      if (lines.length === 1 && !lines[0]!.properties.name)
        lines[0] = { ...lines[0]!, properties: { ...lines[0]!.properties, name: row.name } };
      const source = readTrackSource(row.geojson);
      const credit = source ? gpxCredit(source) : null;
      return {
        filename: fileNameOf(row.name),
        gpx: buildGpx({
          name: row.name,
          description: row.description || undefined,
          ...(credit ? { copyright: credit.copyright, link: credit.link } : {}),
          lines,
          waypoints,
        }),
      };
    },

    exportSelection(selection) {
      if (!selection.markers && selection.trackIds.length === 0) {
        throw badRequest("Choose what to export: markers, tracks or both.");
      }
      const rows = selection.trackIds.length > 0 ? db.select().from(tracks).where(inArray(tracks.id, selection.trackIds)).all() : [];
      const missing = selection.trackIds.find((id) => !rows.some((row) => row.id === id));
      if (missing) throw notFound("One of those tracks");
      const document: GpxDocument = {
        name: "Outpost export",
        lines: [],
        waypoints: selection.markers ? markerWaypoints() : [],
      };
      // Each found route says where it came from on its own track. The file as a whole is
      // marked as one party's only when all of it is; otherwise a sentence says some of it is.
      const sources = rows.map((row) => readTrackSource(row.geojson));
      const first = sources[0];
      if (first && !selection.markers && sources.every((source) => source !== null)) {
        const credit = gpxCredit(first);
        document.copyright = credit.copyright;
        document.link = credit.link;
      } else if (sources.some((source) => source !== null)) {
        const any = sources.find((source) => source !== null)!;
        document.description = `Some of the routes in this file contain information from OpenStreetMap, which is made available under the ${any.license}: ${any.creditUrl}. Each says so in its own source.`;
      }
      for (const row of rows) {
        const { lines, waypoints } = credited(row);
        document.lines.push(
          ...lines.map((line) => (line.properties.name ? line : { ...line, properties: { ...line.properties, name: row.name } })),
        );
        document.waypoints.push(...waypoints);
      }
      return {
        filename: fileNameOf(rows.length === 1 && !selection.markers ? rows[0]!.name : "outpost-map-export"),
        gpx: buildGpx(document),
      };
    },

    counts() {
      return {
        markers: db.select({ n: sql<number>`count(*)` }).from(markers).get()?.n ?? 0,
        tracks: db.select({ n: sql<number>`count(*)` }).from(tracks).get()?.n ?? 0,
      };
    },
  };
}
