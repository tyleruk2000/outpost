/**
 * The reference features in SQLite: writing them in batches, finding the same thing
 * described twice, and answering the map's questions through the spatial index.
 *
 * A view of the map is answered from `reference_features_rtree`. Where few enough
 * features are in it, each is sent; where there are more, they are counted by patch,
 * separately for each layer and each provenance class, so that a historical record and
 * a mapped installation are never folded into one mark. Areas (a military range, a
 * country) are sent as shapes, simplified to the view's scale.
 *
 * Nothing here orders places by anything but name or distance from a press. There is
 * no score.
 */
import type {
  Bbox,
  CountryFigureDto,
  FeatureProvenance,
  HistoricalRecordDto,
  HistoricalRecordRow,
  HistoricalRecordsResponse,
  HistoricalRecordType,
  LayerSearchHit,
  ReferenceCell,
  ReferenceFeatureDetail,
  ReferenceFilter,
  ReferenceLayerId,
  ReferenceLayerSummary,
  ReferenceOverlayResponse,
  ReferencePoint,
  ReferenceShape,
  ReferenceSourceInfo,
} from "@outpost/shared";
import { haversineMeters, ownValue } from "@outpost/shared";
import type { Statement } from "better-sqlite3";
import type { AppContext } from "../../core/context.ts";
import { yieldToEventLoop } from "../../core/event-loop.ts";
import { splitFrequencies } from "./adapters/ourairports-frequencies.ts";
import { kindLabel } from "./kinds.ts";
import type { FeatureSink, GeoJsonGeometry, NewCountryFigure, NewFeature } from "./types.ts";

const INSERT_BATCH = 2_000;
const DELETE_BATCH = 5_000;
/** More features than this in a view are counted by patch rather than sent one by one. */
export const POINT_LIMIT = 1_500;
/** At most this many shapes in one answer. */
const SHAPE_LIMIT = 600;
/** Layers whose areas are the point of them, drawn at every zoom. */
const AREA_LAYERS = new Set<ReferenceLayerId>(["boundaries", "regions", "planning-zones", "flood-zones"]);
/**
 * Flood zones are many detailed areas (about 250 in a box 7 km across round Bedford): drawn
 * only from this zoom in, at most this many in a view, and never as points or patches.
 */
const FLOOD_ZOOM = 11;
const FLOOD_SHAPE_LIMIT = 3_000;
/** Other layers' areas are drawn from this zoom in. */
const SHAPE_ZOOM = 9;
/** How far apart two records of one thing from different sources may be placed. */
const SAME_PLACE_METRES = 1_000;

interface FeatureRow {
  id: number;
  collectionId: string;
  provider: string;
  sourceId: string;
  layer: ReferenceLayerId;
  kind: string;
  name: string;
  altNames: string;
  country: string | null;
  lat: number | null;
  lon: number | null;
  minLon: number | null;
  minLat: number | null;
  maxLon: number | null;
  maxLat: number | null;
  geometry: string | null;
  props: string;
  provenance: FeatureProvenance;
  accuracy: string;
  accuracyMeters: number | null;
  publisher: string;
  license: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  retrievedAt: number;
  duplicateOf: number | null;
}

const COLUMNS = `f.id AS id, f.collection_id AS collectionId, f.provider AS provider, f.source_id AS sourceId, f.layer AS layer,
  f.kind AS kind, f.name AS name, f.alt_names AS altNames, f.country AS country, f.lat AS lat, f.lon AS lon,
  f.min_lon AS minLon, f.min_lat AS minLat, f.max_lon AS maxLon, f.max_lat AS maxLat, f.geometry AS geometry, f.props AS props,
  f.provenance AS provenance, f.accuracy AS accuracy, f.accuracy_m AS accuracyMeters, f.publisher AS publisher, f.license AS license,
  f.source_url AS sourceUrl, f.published_at AS publishedAt, f.retrieved_at AS retrievedAt, f.duplicate_of AS duplicateOf`;

/** Lower case, without accents or punctuation: how two names are compared for being the same thing. */
export function foldName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Whether two names plausibly name the same thing: equal once folded, or one wholly inside the other. */
export function sameName(a: string, b: string): boolean {
  const x = foldName(a);
  const y = foldName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.length >= 5 && ` ${long} `.includes(` ${short} `);
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

type Ring = number[][];

function perpendicular(p: number[], a: number[], b: number[]): number {
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  if (dx === 0 && dy === 0) return Math.hypot(p[0]! - a[0]!, p[1]! - a[1]!);
  const t = Math.max(0, Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0]! - (a[0]! + t * dx), p[1]! - (a[1]! + t * dy));
}

/** Douglas–Peucker, iterative so that a long coast cannot overflow the stack. */
export function simplifyLine(points: Ring, tolerance: number): Ring {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = from + 1; i < to; i += 1) {
      const d = perpendicular(points[i]!, points[from]!, points[to]!);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolerance && at > 0) {
      keep[at] = 1;
      stack.push([from, at], [at, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function ringExtent(ring: Ring): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x!);
    maxX = Math.max(maxX, x!);
    minY = Math.min(minY, y!);
    maxY = Math.max(maxY, y!);
  }
  return Math.max(maxX - minX, maxY - minY);
}

/** A geometry simplified for drawing at a scale; rings smaller than the tolerance are dropped. Null if nothing is left. */
export function simplifyGeometry(geometry: GeoJsonGeometry, tolerance: number): GeoJsonGeometry | null {
  const ring = (points: Ring, closed: boolean): Ring | null => {
    if (closed && ringExtent(points) < tolerance * 2) return null;
    const simple = simplifyLine(points, tolerance);
    return closed ? (simple.length >= 4 ? simple : null) : simple.length >= 2 ? simple : null;
  };
  const polygon = (rings: Ring[]): Ring[] | null => {
    const outer = rings[0] ? ring(rings[0], true) : null;
    if (!outer) return null;
    return [
      outer,
      ...rings
        .slice(1)
        .map((hole) => ring(hole, true))
        .filter((hole): hole is Ring => hole !== null),
    ];
  };
  switch (geometry.type) {
    case "Polygon": {
      const result = polygon(geometry.coordinates as Ring[]);
      return result ? { type: "Polygon", coordinates: result } : null;
    }
    case "MultiPolygon": {
      const parts = (geometry.coordinates as Ring[][]).map((part) => polygon(part)).filter((part): part is Ring[] => part !== null);
      return parts.length > 0 ? { type: "MultiPolygon", coordinates: parts } : null;
    }
    case "LineString": {
      const result = ring(geometry.coordinates as Ring, false);
      return result ? { type: "LineString", coordinates: result } : null;
    }
    case "MultiLineString": {
      const parts = (geometry.coordinates as Ring[]).map((line) => ring(line, false)).filter((line): line is Ring => line !== null);
      return parts.length > 0 ? { type: "MultiLineString", coordinates: parts } : null;
    }
    default:
      return null;
  }
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

/** Whether a point is inside a Polygon or MultiPolygon. */
export function containsPoint(geometry: GeoJsonGeometry, lon: number, lat: number): boolean {
  const polygon = (rings: Ring[]) =>
    rings.length > 0 && inRing(lon, lat, rings[0]!) && !rings.slice(1).some((hole) => inRing(lon, lat, hole));
  if (geometry.type === "Polygon") return polygon(geometry.coordinates as Ring[]);
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as Ring[][]).some(polygon);
  return false;
}

/** The box of a geometry's positions. */
export function geometryBbox(geometry: GeoJsonGeometry): Bbox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const walk = (value: unknown, depth: number): void => {
    if (depth > 6 || !Array.isArray(value)) return;
    if (typeof value[0] === "number") {
      const [x, y] = value as number[];
      minX = Math.min(minX, x!);
      maxX = Math.max(maxX, x!);
      minY = Math.min(minY, y!);
      maxY = Math.max(maxY, y!);
      return;
    }
    for (const child of value) walk(child, depth + 1);
  };
  walk(geometry.coordinates, 0);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

// ── The store ───────────────────────────────────────────────────────────────

export interface FilterQuery extends ReferenceFilter {
  bbox: Bbox;
  zoom: number;
}

export interface ReferenceStore {
  /** A sink that writes under `owner`. `flush` writes what is left. */
  sink(owner: string, provider: string, retrievedAt: number): FeatureSink & { flush(): Promise<void>; problems: string[]; skipped: number };
  removeRows(owner: string): Promise<number>;
  removeRowsNow(owner: string): number;
  /** Hands the rows written under `from` to `to`, and removes those of `replaced` packs, in one transaction. */
  adopt(from: string, to: string, replaced: string[]): void;
  /** Marks this pack's records that describe something already held; returns how many. */
  findDuplicates(collectionId: string): Promise<number>;
  /** After a pack has gone: records that were hidden as its duplicates are looked at again. */
  releaseDuplicates(): Promise<void>;
  overlay(query: FilterQuery): ReferenceOverlayResponse;
  /** Areas that contain a point, for a press on the map where no mark is. */
  at(query: ReferenceFilter & { lat: number; lon: number }): LayerSearchHit[];
  detail(id: number, packs: Map<string, { title: string }>): ReferenceFeatureDetail | null;
  search(query: string, filter: Partial<ReferenceFilter>, limit: number): LayerSearchHit[];
  summary(providerNames: Map<string, string>): ReferenceLayerSummary[];
  countsOf(collectionId: string): { records: number; duplicates: number; figures: number; layers: ReferenceLayerId[] };
  figures(country?: string): CountryFigureDto[];
  /** Historical records for the records browser, by period and then name. */
  historical(query: { recordType: HistoricalRecordType | null; limit: number; offset: number }): HistoricalRecordsResponse;
  owners(): string[];
  total(): number;
}

export function createReferenceStore(ctx: AppContext, providerName: (id: string) => string): ReferenceStore {
  const { sqlite } = ctx;
  /**
   * Answers to recent views, cleared whenever a record is written or removed. Counting a
   * few hundred thousand features into patches for a view of the world takes about a
   * second on a laptop; zooming out and in again asks the same few questions.
   */
  const answers = new Map<string, ReferenceOverlayResponse>();
  const forget = () => answers.clear();
  /**
   * Statements for the map's questions, kept by their text: a view asks the same few each
   * time it moves, and preparing one costs several times what running it on a small view does.
   */
  const statements = new Map<string, Statement<unknown[]>>();
  const prepared = (sql: string) => {
    let statement = statements.get(sql);
    if (statement) {
      statements.delete(sql);
    } else {
      statement = sqlite.prepare(sql);
      if (statements.size >= 64) statements.delete(statements.keys().next().value as string);
    }
    statements.set(sql, statement);
    return statement;
  };

  const insertFeature = sqlite.prepare(
    `INSERT INTO reference_features (collection_id, provider, source_id, layer, kind, name, alt_names, country, lat, lon, min_lon, min_lat,
      max_lon, max_lat, geometry, props, provenance, accuracy, accuracy_m, publisher, license, source_url, published_at, retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertHistorical = sqlite.prepare(
    `INSERT INTO historical_records (feature_id, record_type, period, location_text, document_title, document_publisher, document_date,
      archive_ref, classification, target_category, evidence_quality, geographic_precision, citations, document_url, library_document_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFigure = sqlite.prepare(
    `INSERT INTO country_figures (collection_id, country, indicator, value, value_text, unit, year, source_title, publisher, published_at,
      url, page, license, notes, retrieved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const deleteHistorical = sqlite.prepare(
    "DELETE FROM historical_records WHERE feature_id IN (SELECT id FROM reference_features WHERE collection_id = ? LIMIT ?)",
  );
  const deleteFeatures = sqlite.prepare(
    "DELETE FROM reference_features WHERE id IN (SELECT id FROM reference_features WHERE collection_id = ? LIMIT ?)",
  );
  const deleteFigures = sqlite.prepare("DELETE FROM country_figures WHERE collection_id = ?");

  const writeBatch = sqlite.transaction(
    (owner: string, provider: string, retrievedAt: number, features: NewFeature[], figures: NewCountryFigure[]) => {
      for (const f of features) {
        const box = f.bbox;
        const { lastInsertRowid } = insertFeature.run(
          owner,
          provider,
          f.sourceId,
          f.layer,
          f.kind,
          f.name,
          f.altNames,
          f.country,
          f.lat,
          f.lon,
          box?.[0] ?? null,
          box?.[1] ?? null,
          box?.[2] ?? null,
          box?.[3] ?? null,
          f.geometry ? JSON.stringify(f.geometry) : null,
          JSON.stringify(f.props),
          f.provenance,
          f.accuracy,
          f.accuracyMeters,
          f.publisher,
          f.license,
          f.sourceUrl,
          f.publishedAt,
          retrievedAt,
        );
        const h = f.historical;
        if (h) {
          insertHistorical.run(
            lastInsertRowid,
            h.recordType,
            h.period,
            h.locationText,
            h.documentTitle,
            h.documentPublisher,
            h.documentDate,
            h.archiveRef,
            h.classification,
            h.targetCategory,
            h.evidenceQuality,
            h.geographicPrecision,
            JSON.stringify(h.citations),
            h.documentUrl,
            h.libraryDocumentId,
            h.notes,
          );
        }
      }
      for (const g of figures) {
        insertFigure.run(
          owner,
          g.country,
          g.indicator,
          g.value,
          g.valueText,
          g.unit,
          g.year,
          g.sourceTitle,
          g.publisher,
          g.publishedAt,
          g.url,
          g.page,
          g.license,
          g.notes,
          retrievedAt,
        );
      }
    },
  );

  function removeRowsNow(owner: string): number {
    forget();
    let removed = 0;
    for (;;) {
      deleteHistorical.run(owner, DELETE_BATCH);
      const { changes } = deleteFeatures.run(owner, DELETE_BATCH);
      removed += changes;
      if (changes < DELETE_BATCH) break;
    }
    deleteFigures.run(owner);
    return removed;
  }

  const filterSql = (filter: Partial<ReferenceFilter>, alias = "f"): { sql: string; args: unknown[] } => {
    const parts = [`${alias}.duplicate_of IS NULL`, `${alias}.collection_id NOT LIKE 'pending:%'`];
    const args: unknown[] = [];
    const list = (column: string, values: string[] | undefined) => {
      if (!values || values.length === 0) return;
      parts.push(`${alias}.${column} IN (${values.map(() => "?").join(",")})`);
      args.push(...values);
    };
    list("layer", filter.layers);
    list("country", filter.countries);
    list("provider", filter.providers);
    list("kind", filter.kinds);
    return { sql: parts.join(" AND "), args };
  };

  /** The R*Tree boxes for a view; a view across the 180° meridian is two. */
  const boxesOf = ([west, south, east, north]: Bbox): Bbox[] =>
    west <= east
      ? [[west, south, east, north]]
      : [
          [west, south, 180, north],
          [-180, south, east, north],
        ];

  // CROSS JOIN keeps SQLite from starting at the layer index and visiting the spatial index once per row.
  const rtreeJoin = "FROM reference_features_rtree r CROSS JOIN reference_features f ON f.id = r.id";
  const rtreeWhere = "r.max_lon >= ? AND r.min_lon <= ? AND r.max_lat >= ? AND r.min_lat <= ?";

  function sourceInfo(row: FeatureRow, packs: Map<string, { title: string }>): ReferenceSourceInfo {
    return {
      provider: row.provider,
      providerName: providerName(row.provider),
      sourceId: row.sourceId,
      publisher: row.publisher,
      license: row.license,
      licenseUrl: licenseUrlOf(row.license),
      sourceUrl: row.sourceUrl,
      publishedAt: row.publishedAt,
      retrievedAt: row.retrievedAt,
      accuracy: row.accuracy,
      accuracyMeters: row.accuracyMeters,
      provenance: row.provenance,
      packId: row.collectionId,
      packTitle: packs.get(row.collectionId)?.title ?? "",
    };
  }

  const markDuplicate = sqlite.prepare("UPDATE reference_features SET duplicate_of = ? WHERE id = ?");

  async function findDuplicates(collectionId: string): Promise<number> {
    forget();
    const rows = sqlite
      .prepare(
        `SELECT id, provider, source_id AS sourceId, layer, name, lat, lon, props FROM reference_features
         WHERE collection_id = ? AND duplicate_of IS NULL ORDER BY id`,
      )
      .all(collectionId) as Array<{
      id: number;
      provider: string;
      sourceId: string;
      layer: string;
      name: string;
      lat: number | null;
      lon: number | null;
      props: string;
    }>;
    const sameRecord = sqlite.prepare(
      `SELECT id FROM reference_features WHERE provider = ? AND source_id = ? AND collection_id != ? AND collection_id NOT LIKE 'pending:%'
       AND duplicate_of IS NULL LIMIT 1`,
    );
    // An OpenStreetMap object that names its Wikidata item, and the item itself.
    const byWikidata = sqlite.prepare(
      `SELECT id FROM reference_features WHERE provider = 'wikidata' AND source_id = ? AND collection_id NOT LIKE 'pending:%' AND duplicate_of IS NULL LIMIT 1`,
    );
    const linksTo = sqlite.prepare(
      `SELECT id FROM reference_features WHERE provider IN ('osm', 'osm-extract') AND json_extract(props, '$.wikidata') = ?
       AND collection_id NOT LIKE 'pending:%' AND duplicate_of IS NULL AND id != ? LIMIT 1`,
    );
    const near = sqlite.prepare(
      `SELECT f.id AS id, f.name AS name, f.lat AS lat, f.lon AS lon ${rtreeJoin}
       WHERE ${rtreeWhere} AND f.layer = ? AND f.provider != ? AND f.collection_id != ? AND f.collection_id NOT LIKE 'pending:%' AND f.duplicate_of IS NULL`,
    );
    let found = 0;
    let done = 0;
    for (const row of rows) {
      let original: number | undefined;
      original = (sameRecord.get(row.provider, row.sourceId, collectionId) as { id: number } | undefined)?.id;
      if (original === undefined && (row.provider === "osm" || row.provider === "osm-extract")) {
        const wikidata = (JSON.parse(row.props) as Record<string, string>).wikidata;
        if (wikidata && /^Q\d+$/.test(wikidata)) {
          // The Wikidata item is the duplicate: the mapped object has the outline.
          const item = (byWikidata.get(wikidata) as { id: number } | undefined)?.id;
          if (item !== undefined) {
            markDuplicate.run(row.id, item);
            found += 1;
          }
        }
      }
      if (original === undefined && row.provider === "wikidata") {
        original = (linksTo.get(row.sourceId, row.id) as { id: number } | undefined)?.id;
      }
      if (original === undefined && row.lat !== null && row.lon !== null && row.name) {
        const dLat = SAME_PLACE_METRES / 111_000;
        const dLon = dLat / Math.max(0.05, Math.cos((row.lat * Math.PI) / 180));
        const candidates = near.all(
          row.lon - dLon,
          row.lon + dLon,
          row.lat - dLat,
          row.lat + dLat,
          row.layer,
          row.provider,
          collectionId,
        ) as Array<{
          id: number;
          name: string;
          lat: number;
          lon: number;
        }>;
        original = candidates.find(
          (candidate) =>
            sameName(candidate.name, row.name) && haversineMeters(row.lat!, row.lon!, candidate.lat, candidate.lon) <= SAME_PLACE_METRES,
        )?.id;
      }
      if (original !== undefined && original !== row.id) {
        markDuplicate.run(original, row.id);
        found += 1;
      }
      done += 1;
      if (done % 2_000 === 0) await yieldToEventLoop();
    }
    return found;
  }

  const store: ReferenceStore = {
    sink(owner, provider, retrievedAt) {
      let features: NewFeature[] = [];
      let figures: NewCountryFigure[] = [];
      const problems: string[] = [];
      let skipped = 0;
      let count = 0;
      const flush = async () => {
        if (features.length === 0 && figures.length === 0) return;
        writeBatch(owner, provider, retrievedAt, features, figures);
        forget();
        count += features.length + figures.length;
        features = [];
        figures = [];
        await yieldToEventLoop();
      };
      return {
        get count() {
          return count + features.length + figures.length;
        },
        problems,
        get skipped() {
          return skipped;
        },
        async add(feature) {
          features.push(feature);
          if (features.length >= INSERT_BATCH) await flush();
        },
        async figure(figure) {
          figures.push(figure);
          if (figures.length >= INSERT_BATCH) await flush();
        },
        skip(reason) {
          skipped += 1;
          if (problems.length < 20) problems.push(reason);
        },
        flush,
      };
    },

    removeRowsNow,

    async removeRows(owner) {
      forget();
      let removed = 0;
      for (;;) {
        deleteHistorical.run(owner, DELETE_BATCH);
        const { changes } = deleteFeatures.run(owner, DELETE_BATCH);
        removed += changes;
        if (changes < DELETE_BATCH) break;
        await yieldToEventLoop();
      }
      deleteFigures.run(owner);
      return removed;
    },

    adopt(from, to, replaced) {
      forget();
      sqlite.transaction(() => {
        for (const old of replaced) removeRowsNow(old);
        sqlite.prepare("UPDATE reference_features SET collection_id = ? WHERE collection_id = ?").run(to, from);
        sqlite.prepare("UPDATE country_figures SET collection_id = ? WHERE collection_id = ?").run(to, from);
      })();
    },

    findDuplicates,

    async releaseDuplicates() {
      forget();
      const orphans = sqlite
        .prepare(
          `SELECT DISTINCT f.collection_id AS owner FROM reference_features f
           WHERE f.duplicate_of IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reference_features o WHERE o.id = f.duplicate_of)`,
        )
        .all() as Array<{ owner: string }>;
      sqlite
        .prepare(
          `UPDATE reference_features SET duplicate_of = NULL
           WHERE duplicate_of IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reference_features o WHERE o.id = reference_features.duplicate_of)`,
        )
        .run();
      for (const { owner } of orphans) if (!owner.startsWith("pending:")) await findDuplicates(owner);
    },

    overlay({ bbox, zoom, ...filter }) {
      const boxes = boxesOf(bbox);
      const pointLayers = filter.layers.filter((layer) => !AREA_LAYERS.has(layer) || layer === "planning-zones");
      const pointWhere = filterSql({ ...filter, layers: pointLayers });
      // Only whether there are more than can be sent is counted here; when there are, the patches' counts give the total.
      let total = boxes.reduce(
        (sum, box) =>
          sum +
          (pointLayers.length === 0
            ? 0
            : (
                prepared(`SELECT count(*) AS n FROM (SELECT 1 ${rtreeJoin} WHERE ${rtreeWhere} AND ${pointWhere.sql} LIMIT ?)`).get(
                  box[0],
                  box[2],
                  box[1],
                  box[3],
                  ...pointWhere.args,
                  POINT_LIMIT + 1,
                ) as { n: number }
              ).n),
        0,
      );
      let points: ReferencePoint[] = [];
      let cells: ReferenceCell[] = [];
      if (pointLayers.length > 0 && total <= POINT_LIMIT) {
        points = boxes.flatMap(
          (box) =>
            prepared(
              `SELECT f.id AS id, f.layer AS layer, f.provenance AS provenance, f.name AS name, f.kind AS kind, f.lat AS lat, f.lon AS lon
                 ${rtreeJoin} WHERE ${rtreeWhere} AND ${pointWhere.sql} ORDER BY f.id`,
            ).all(box[0], box[2], box[1], box[3], ...pointWhere.args) as ReferencePoint[],
        );
      } else if (pointLayers.length > 0) {
        // Patches a power of two of a degree on a fixed grid, about eight to the height of the view.
        const height = Math.max(bbox[3] - bbox[1], 1e-6);
        const latSize = 2 ** Math.round(Math.log2(height / 8));
        const middle = Math.min(85, Math.abs((bbox[1] + bbox[3]) / 2));
        const lonSize = 2 ** Math.round(Math.log2(latSize / Math.cos((middle * Math.PI) / 180)));
        cells = boxes.flatMap(
          (box) =>
            prepared(
              `SELECT f.layer AS layer, f.provenance AS provenance, count(*) AS count, avg(f.lat) AS lat, avg(f.lon) AS lon
                 ${rtreeJoin} WHERE ${rtreeWhere} AND ${pointWhere.sql}
                 GROUP BY f.layer, f.provenance, CAST((f.lat + 90) / ? AS INTEGER), CAST((f.lon + 180) / ? AS INTEGER)`,
            ).all(box[0], box[2], box[1], box[3], ...pointWhere.args, latSize, lonSize) as ReferenceCell[],
        );
        total = cells.reduce((sum, cell) => sum + cell.count, 0);
      }
      // Areas: those of the area layers at any zoom, the rest from close in, and never more than the limit.
      const shapeLayers = filter.layers.filter((layer) => layer !== "flood-zones" && (AREA_LAYERS.has(layer) || zoom >= SHAPE_ZOOM));
      const tolerance = (360 / (256 * 2 ** Math.max(0, zoom))) * 0.75;
      const shapesOf = (layers: ReferenceLayerId[], limit: number): ReferenceShape[] | null => {
        const shapeWhere = filterSql({ ...filter, layers });
        const rows = boxes.flatMap(
          (box) =>
            prepared(
              `SELECT f.id AS id, f.layer AS layer, f.provenance AS provenance, f.name AS name, f.kind AS kind, f.geometry AS geometry
                 ${rtreeJoin} WHERE ${rtreeWhere} AND ${shapeWhere.sql} AND f.geometry IS NOT NULL
                 AND (r.max_lon - r.min_lon > ? OR r.max_lat - r.min_lat > ?) LIMIT ?`,
            ).all(box[0], box[2], box[1], box[3], ...shapeWhere.args, tolerance * 2, tolerance * 2, limit + 1) as Array<{
              id: number;
              layer: ReferenceLayerId;
              provenance: FeatureProvenance;
              name: string;
              kind: string;
              geometry: string;
            }>,
        );
        if (rows.length > limit) return null;
        return rows.flatMap((row) => {
          const simple = simplifyGeometry(JSON.parse(row.geometry) as GeoJsonGeometry, tolerance);
          return simple
            ? [{ id: row.id, layer: row.layer, provenance: row.provenance, name: row.name, kind: row.kind, geometry: simple }]
            : [];
        });
      };
      let shapes: ReferenceShape[] = shapeLayers.length > 0 ? (shapesOf(shapeLayers, SHAPE_LIMIT) ?? []) : [];
      let floodZones: "zoom-in" | "too-many" | null = null;
      if (filter.layers.includes("flood-zones")) {
        if (zoom < FLOOD_ZOOM) floodZones = "zoom-in";
        else {
          const flood = shapesOf(["flood-zones"], FLOOD_SHAPE_LIMIT);
          if (flood) shapes = [...flood, ...shapes];
          else floodZones = "too-many";
        }
      }
      return { total, points, cells, shapes, floodZones };
    },

    at({ lat, lon, ...filter }) {
      const where = filterSql(filter);
      const rows = prepared(
        `SELECT f.id AS id, f.layer AS layer, f.provenance AS provenance, f.name AS name, f.kind AS kind, f.country AS country,
             f.lat AS lat, f.lon AS lon, f.geometry AS geometry, (r.max_lon - r.min_lon) * (r.max_lat - r.min_lat) AS area
           ${rtreeJoin} WHERE ${rtreeWhere} AND ${where.sql} AND f.geometry IS NOT NULL ORDER BY area LIMIT 200`,
      ).all(lon, lon, lat, lat, ...where.args) as Array<{
        id: number;
        layer: ReferenceLayerId;
        provenance: FeatureProvenance;
        name: string;
        kind: string;
        country: string | null;
        lat: number;
        lon: number;
        geometry: string;
      }>;
      return rows
        .filter((row) => containsPoint(JSON.parse(row.geometry) as GeoJsonGeometry, lon, lat))
        .slice(0, 10)
        .map((row) => ({
          id: row.id,
          layer: row.layer,
          provenance: row.provenance,
          name: row.name,
          kindLabel: kindLabel(row.kind),
          country: row.country,
          lat: row.lat,
          lon: row.lon,
        }));
    },

    detail(id, packs) {
      const row = prepared(`SELECT ${COLUMNS} FROM reference_features f WHERE f.id = ?`).get(id) as FeatureRow | undefined;
      if (!row || row.collectionId.startsWith("pending:")) return null;
      const primary =
        row.duplicateOf !== null
          ? ((prepared(`SELECT ${COLUMNS} FROM reference_features f WHERE f.id = ?`).get(row.duplicateOf) as FeatureRow | undefined) ?? row)
          : row;
      const others = (
        prepared(`SELECT ${COLUMNS} FROM reference_features f WHERE f.duplicate_of = ? ORDER BY f.id`).all(primary.id) as FeatureRow[]
      ).filter((other) => !other.collectionId.startsWith("pending:"));
      const h = prepared("SELECT * FROM historical_records WHERE feature_id = ?").get(primary.id) as Record<string, unknown> | undefined;
      let historical: HistoricalRecordDto | null = null;
      if (h) {
        const documentId = (h.library_document_id as string | null) ?? null;
        const document = documentId
          ? (prepared("SELECT id, title FROM documents WHERE id = ?").get(documentId) as { id: string; title: string } | undefined)
          : undefined;
        historical = {
          recordType: h.record_type as HistoricalRecordType,
          period: String(h.period),
          locationText: String(h.location_text),
          documentTitle: String(h.document_title),
          documentPublisher: String(h.document_publisher),
          documentDate: String(h.document_date),
          archiveRef: String(h.archive_ref),
          classification: String(h.classification),
          targetCategory: String(h.target_category),
          evidenceQuality: String(h.evidence_quality),
          geographicPrecision: String(h.geographic_precision),
          citations: JSON.parse(String(h.citations)) as string[],
          documentUrl: (h.document_url as string | null) ?? null,
          libraryDocument: document ? { id: document.id, title: document.title } : null,
          notes: String(h.notes),
        };
      }
      const bbox: Bbox | null =
        primary.minLon !== null && primary.minLat !== null && primary.maxLon !== null && primary.maxLat !== null
          ? [primary.minLon, primary.minLat, primary.maxLon, primary.maxLat]
          : null;
      return {
        id: primary.id,
        layer: primary.layer,
        kind: primary.kind,
        kindLabel: kindLabel(primary.kind),
        name: primary.name,
        altNames: primary.altNames ? primary.altNames.split(",").filter(Boolean) : [],
        country: primary.country,
        lat: primary.lat,
        lon: primary.lon,
        bbox,
        ...splitFrequencies(primary.provider, primary.layer, JSON.parse(primary.props) as Record<string, string>),
        provenance: primary.provenance,
        source: sourceInfo(primary, packs),
        alsoFrom: others.map((other) => sourceInfo(other, packs)),
        historical,
        hasGeometry: primary.geometry !== null,
      };
    },

    search(query, filter, limit) {
      const tokens = query
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .slice(0, 8);
      if (tokens.length === 0) return [];
      const match = tokens.map((token) => `"${token.replaceAll('"', "")}"*`).join(" ");
      const where = filterSql(filter);
      const rows = prepared(
        `SELECT f.id AS id, f.layer AS layer, f.provenance AS provenance, f.name AS name, f.kind AS kind, f.country AS country,
             f.lat AS lat, f.lon AS lon
           FROM reference_features_fts JOIN reference_features f ON f.id = reference_features_fts.rowid
           WHERE reference_features_fts MATCH ? AND ${where.sql} ORDER BY bm25(reference_features_fts, 10.0, 1.0) LIMIT ?`,
      ).all(match, ...where.args, Math.min(100, Math.max(1, limit))) as Array<Omit<LayerSearchHit, "kindLabel"> & { kind: string }>;
      return rows.map(({ kind, ...row }) => ({ ...row, kindLabel: kindLabel(kind) }));
    },

    summary(providerNames) {
      const live = "duplicate_of IS NULL AND collection_id NOT LIKE 'pending:%'";
      const layers = prepared(`SELECT layer, count(*) AS n FROM reference_features WHERE ${live} GROUP BY layer`).all() as Array<{
        layer: ReferenceLayerId;
        n: number;
      }>;
      return layers.map(({ layer, n }) => {
        const countries = (
          prepared(
            `SELECT DISTINCT country FROM reference_features WHERE ${live} AND layer = ? AND country IS NOT NULL ORDER BY country`,
          ).all(layer) as Array<{ country: string }>
        ).map((row) => row.country);
        const providers = (
          prepared(
            `SELECT provider, count(*) AS n FROM reference_features WHERE ${live} AND layer = ? GROUP BY provider ORDER BY provider`,
          ).all(layer) as Array<{
            provider: string;
            n: number;
          }>
        ).map((row) => ({ id: row.provider, name: providerNames.get(row.provider) ?? row.provider, count: row.n }));
        const kinds = (
          prepared(`SELECT kind, count(*) AS n FROM reference_features WHERE ${live} AND layer = ? GROUP BY kind ORDER BY kind`).all(
            layer,
          ) as Array<{
            kind: string;
            n: number;
          }>
        ).map((row) => ({ kind: row.kind, label: kindLabel(row.kind), count: row.n }));
        const provenance = (
          prepared(`SELECT provenance, count(*) AS n FROM reference_features WHERE ${live} AND layer = ? GROUP BY provenance`).all(
            layer,
          ) as Array<{
            provenance: FeatureProvenance;
            n: number;
          }>
        ).map((row) => ({ provenance: row.provenance, count: row.n }));
        return { id: layer, count: n, countries, providers, kinds, provenance };
      });
    },

    countsOf(collectionId) {
      const records = (prepared("SELECT count(*) AS n FROM reference_features WHERE collection_id = ?").get(collectionId) as { n: number })
        .n;
      const duplicates = (
        prepared("SELECT count(*) AS n FROM reference_features WHERE collection_id = ? AND duplicate_of IS NOT NULL").get(collectionId) as {
          n: number;
        }
      ).n;
      const figures = (prepared("SELECT count(*) AS n FROM country_figures WHERE collection_id = ?").get(collectionId) as { n: number }).n;
      const layers = (
        prepared("SELECT DISTINCT layer FROM reference_features WHERE collection_id = ?").all(collectionId) as Array<{
          layer: ReferenceLayerId;
        }>
      ).map((row) => row.layer);
      return { records, duplicates, figures, layers };
    },

    figures(country) {
      const rows = prepared(
        `SELECT id, country, indicator, value, value_text AS valueText, unit, year, source_title AS sourceTitle, publisher,
             published_at AS publishedAt, url, page, license, notes, collection_id AS packId
           FROM country_figures WHERE collection_id NOT LIKE 'pending:%' ${country ? "AND country = ?" : ""} ORDER BY country, indicator, year`,
      ).all(...(country ? [country] : [])) as CountryFigureDto[];
      return rows;
    },

    historical({ recordType, limit, offset }) {
      const where = `f.duplicate_of IS NULL AND f.collection_id NOT LIKE 'pending:%' ${recordType ? "AND h.record_type = ?" : ""}`;
      const args = recordType ? [recordType] : [];
      const from =
        "FROM historical_records h JOIN reference_features f ON f.id = h.feature_id LEFT JOIN documents d ON d.id = h.library_document_id";
      const total = (prepared(`SELECT count(*) AS n ${from} WHERE ${where}`).get(...args) as { n: number }).n;
      const rows = prepared(
        `SELECT f.id AS id, f.name AS name, f.provenance AS provenance, h.record_type AS recordType, h.period AS period,
             f.country AS country, f.lat AS lat, f.lon AS lon, h.location_text AS locationText, h.document_title AS documentTitle,
             h.document_date AS documentDate, h.document_url AS documentUrl, d.id AS documentId, d.title AS documentName
           ${from} WHERE ${where} ORDER BY h.period, f.name, f.id LIMIT ? OFFSET ?`,
      ).all(...args, limit, offset) as Array<
        Omit<HistoricalRecordRow, "libraryDocument"> & { documentId: string | null; documentName: string | null }
      >;
      return {
        total,
        records: rows.map(({ documentId, documentName, ...row }) => ({
          ...row,
          libraryDocument: documentId ? { id: documentId, title: documentName ?? "" } : null,
        })),
      };
    },

    owners() {
      return (
        prepared(
          "SELECT DISTINCT collection_id AS id FROM reference_features UNION SELECT DISTINCT collection_id AS id FROM country_figures",
        ).all() as Array<{ id: string }>
      ).map((row) => row.id);
    },

    total() {
      return (prepared("SELECT count(*) AS n FROM reference_features").get() as { n: number }).n;
    },
  };
  const answer = store.overlay;
  store.overlay = (query) => {
    const key = JSON.stringify(query);
    const known = answers.get(key);
    if (known) return known;
    const found = answer(query);
    if (answers.size >= 64) answers.delete(answers.keys().next().value as string);
    answers.set(key, found);
    return found;
  };
  return store;
}

/** Addresses of the licences records carry, for the drawer's link. */
export const LICENSE_URLS: Record<string, string> = {
  "ODbL 1.0": "https://opendatacommons.org/licenses/odbl/1-0/",
  "CC0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "Open Government Licence v3.0": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
};

/** The address of a licence's text, by the name a source or an import gave it; null for any other name. */
export const licenseUrlOf = (license: string): string | null => ownValue(LICENSE_URLS, license) ?? null;
