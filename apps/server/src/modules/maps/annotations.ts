/**
 * What people add to the map themselves: markers (a named point with a note) and
 * tracks (lines imported from GPX files, or drawn on the map point by point). Both are
 * indexed for the app-wide search.
 */
import {
  type Bbox,
  formatDecimal,
  MARKER_COLORS,
  type MarkerColor,
  type MarkerDto,
  type RouteSaveResponse,
  type TrackDto,
  type TrackImportResponse,
  type TrackWithGeometryDto,
} from "@outpost/shared";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { markers, tracks } from "../../db/schema.ts";
import { buildDrawnLine, type DrawnLine, routePointsSchema } from "./drawn-route.ts";
import type { ElevationSampler } from "./elevation.ts";
import { buildGpx, type GpxWaypoint, parseGpxSafely, splitCollection, type TrackCollection, trackStats } from "./gpx.ts";

type MarkerRow = typeof markers.$inferSelect;
type TrackRow = typeof tracks.$inferSelect;

const color = z.enum(MARKER_COLORS, { error: `Choose one of the marker colours: ${MARKER_COLORS.join(", ")}.` });
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
  isFavorite: z.boolean().optional(),
  noteId: z.string().min(1).max(64).nullish(),
});
export const markerPatchSchema = markerCreateSchema.partial();

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

export interface AnnotationsService {
  listMarkers(): MarkerDto[];
  createMarker(input: z.infer<typeof markerCreateSchema>): MarkerDto;
  updateMarker(id: string, patch: z.infer<typeof markerPatchSchema>): MarkerDto;
  removeMarker(id: string): void;
  listTracks(): TrackDto[];
  getTrack(id: string): TrackWithGeometryDto;
  importTrack(input: TrackImportInput): Promise<TrackImportResponse>;
  /** A route drawn on the map: straight lines between the points given. */
  createRoute(input: z.infer<typeof routeCreateSchema>): Promise<RouteSaveResponse>;
  /** Replaces a track's lines with one drawn through the points given. Its waypoints are kept. */
  replaceRoutePoints(id: string, input: z.infer<typeof routePointsReplaceSchema>): Promise<RouteSaveResponse>;
  updateTrack(id: string, patch: z.infer<typeof trackPatchSchema>): TrackDto;
  removeTrack(id: string): void;
  exportTrack(id: string): { filename: string; gpx: string };
  exportSelection(selection: { markers: boolean; trackIds: string[] }): { filename: string; gpx: string };
  counts(): { markers: number; tracks: number };
}

const asColor = (value: string): MarkerColor => ((MARKER_COLORS as readonly string[]).includes(value) ? (value as MarkerColor) : "teal");

const toMarkerDto = (row: MarkerRow): MarkerDto => ({
  id: row.id,
  name: row.name,
  note: row.note,
  lat: row.lat,
  lon: row.lon,
  color: asColor(row.color),
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

  function insertMarker(input: z.infer<typeof markerCreateSchema>): MarkerRow {
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

      const result = sqlite.transaction((): { track: TrackRow | null; created: MarkerRow[] } => {
        const created: MarkerRow[] = [];
        if (asMarkers) {
          for (const waypoint of waypoints) {
            const [lon, lat] = waypoint.geometry.coordinates as [number, number];
            created.push(
              insertMarker({
                name: waypoint.properties.name ?? "Waypoint",
                note: waypoint.properties.desc ?? "",
                lat,
                lon,
                color: input.color,
              }),
            );
          }
        }
        if (features.length === 0) return { track: null, created };
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
        return { track: row, created };
      })();

      changed();
      return { track: result.track ? toTrackDto(result.track) : null, markers: result.created.map(toMarkerDto) };
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
      const waypoints = ((current.geojson as unknown as TrackCollection).features ?? []).filter(
        (feature) => feature.geometry?.type === "Point",
      );
      const collection: TrackCollection = { type: "FeatureCollection", features: [drawn.feature, ...waypoints] };
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
      const { lines, waypoints } = splitCollection(row.geojson as unknown as TrackCollection);
      // A single unnamed line takes the track's name, so it is not anonymous in other apps.
      if (lines.length === 1 && !lines[0]!.properties.name)
        lines[0] = { ...lines[0]!, properties: { ...lines[0]!.properties, name: row.name } };
      return {
        filename: fileNameOf(row.name),
        gpx: buildGpx({ name: row.name, description: row.description || undefined, lines, waypoints }),
      };
    },

    exportSelection(selection) {
      if (!selection.markers && selection.trackIds.length === 0) {
        throw badRequest("Choose what to export: markers, tracks or both.");
      }
      const rows = selection.trackIds.length > 0 ? db.select().from(tracks).where(inArray(tracks.id, selection.trackIds)).all() : [];
      const missing = selection.trackIds.find((id) => !rows.some((row) => row.id === id));
      if (missing) throw notFound("One of those tracks");
      const document = {
        name: "Outpost export",
        lines: [] as ReturnType<typeof splitCollection>["lines"],
        waypoints: selection.markers ? markerWaypoints() : [],
      };
      for (const row of rows) {
        const { lines, waypoints } = splitCollection(row.geojson as unknown as TrackCollection);
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
