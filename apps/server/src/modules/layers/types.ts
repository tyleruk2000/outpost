/**
 * The contract every provider of reference data works to.
 *
 * An adapter describes its source and licence, says what it offers for a scope (a set of
 * countries or a box) with an honest size, says how to fetch each thing it offers, and
 * reads a fetched or imported file into normalised features. The service around it does
 * the rest the same way for all of them: the download manager fetches, rows are written
 * under a temporary owner and handed to the pack only when the whole file was read,
 * duplicates are found, versions and dates are kept, and a pack that is updated is
 * replaced in one transaction once its successor is in.
 */
import type {
  Bbox,
  FeatureProvenance,
  HistoricalRecordType,
  ReferenceEstimateItem,
  ReferenceEstimateRequest,
  ReferenceLayerId,
  ReferenceProviderDto,
} from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import type { HttpClient } from "../../core/http.ts";
import type { StartDownload } from "../downloads/types.ts";

export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface HistoricalInput {
  recordType: HistoricalRecordType;
  period: string;
  locationText: string;
  documentTitle: string;
  documentPublisher: string;
  documentDate: string;
  archiveRef: string;
  classification: string;
  targetCategory: string;
  evidenceQuality: string;
  geographicPrecision: string;
  citations: string[];
  documentUrl: string | null;
  libraryDocumentId: string | null;
  notes: string;
}

/** A feature as an adapter hands it over: WGS 84, cleaned, with its provenance. */
export interface NewFeature {
  sourceId: string;
  layer: ReferenceLayerId;
  kind: string;
  name: string;
  altNames: string;
  country: string | null;
  lat: number | null;
  lon: number | null;
  bbox: Bbox | null;
  geometry: GeoJsonGeometry | null;
  props: Record<string, string>;
  provenance: FeatureProvenance;
  accuracy: string;
  accuracyMeters: number | null;
  publisher: string;
  license: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  historical?: HistoricalInput;
}

export interface NewCountryFigure {
  country: string;
  indicator: string;
  value: number | null;
  valueText: string;
  unit: string;
  year: string;
  sourceTitle: string;
  publisher: string;
  publishedAt: string;
  url: string | null;
  page: string;
  license: string;
  notes: string;
}

/** Where an adapter puts what it reads. Batches are written as they fill. */
export interface FeatureSink {
  add(feature: NewFeature): Promise<void>;
  figure(figure: NewCountryFigure): Promise<void>;
  /** A record that could not be used, and why; up to twenty reasons are kept for the person. */
  skip(reason: string): void;
  readonly count: number;
}

export interface ReadContext {
  filePath: string;
  /** The download's or import's `meta.reference`. */
  meta: ReferenceMeta;
  sink: FeatureSink;
  signal: AbortSignal;
  progress(current: number, total: number | null, message: string): void;
  retrievedAt: number;
  /** The date the publisher's server gave the file (its Last-Modified), as YYYY-MM-DD, when there was one. */
  sourceDate: string | null;
}

/** What the source says about the version read. */
export interface ReadResult {
  version: string | null;
  publishedAt: string | null;
  /** The countries the records are in, when the adapter knows better than the request. */
  countries?: string[];
  bbox?: Bbox | null;
  /** Anything else worth keeping on the pack (a population grid's product and year). */
  extra?: Record<string, unknown>;
}

/** What is kept on a reference download and on the pack it becomes. */
export interface ReferenceMeta {
  provider: string;
  key: string;
  title: string;
  layers: ReferenceLayerId[];
  request: ReferenceEstimateRequest | null;
  countries: string[];
  bbox: Bbox | null;
  sourceUrl: string | null;
  /** For an import: what the file is, and what the person said about it. */
  format?: string;
  options?: Record<string, string>;
  /** An MD5 the publisher gives beside the file (Geofabrik), checked before reading. */
  md5?: string;
  origin: "download" | "import";
}

/** An item as the server keeps it between estimate and download: with what the adapter needs that the browser does not (a dated address, a checksum). */
export type EstimatedItem = ReferenceEstimateItem & { extra?: Record<string, string> };

export interface AdapterDeps {
  ctx: AppContext;
  client: HttpClient;
}

export interface ReferenceAdapter {
  readonly provider: ReferenceProviderDto;
  /** What the source offers for this request, each with its size. May ask the source (a press). */
  estimate?(request: ReferenceEstimateRequest, signal?: AbortSignal): Promise<{ items: EstimatedItem[]; notes: string[] }>;
  /** How to fetch one offered item. */
  download?(
    request: ReferenceEstimateRequest,
    item: EstimatedItem,
  ): Omit<StartDownload, "kind" | "title" | "locationId" | "meta"> & { meta?: Partial<ReferenceMeta> };
  /** Reads a fetched or imported file into features. Throws `PermanentJobError` for a file that cannot be read. */
  read(context: ReadContext): Promise<ReadResult>;
}
