/**
 * Files a person brings: for sources that do not allow Outpost to fetch them, or that
 * publish only for people to download themselves. Four forms, each documented in
 * docs/reference-layers.md with a template at /api/reference/templates/<form>.csv:
 *
 * - features CSV: one place per row, with its layer, publisher, licence, accuracy and
 *   provenance (a published record, or unverified);
 * - GeoJSON: points, lines or areas (an emergency planning zone), with those details
 *   given once for the whole file;
 * - historical records CSV: the fields of the specification's section 6, among them
 *   which of the three kinds of record each is, required on every row;
 * - country figures CSV: a figure for a country from a published report, with its
 *   citation.
 *
 * A row that lacks what is required is skipped with a reason, never stored half-said.
 */
import type { FeatureProvenance, HistoricalRecordType, ReferenceLayerId } from "@outpost/shared";
import { HISTORICAL_RECORD_TYPES, REFERENCE_LAYERS } from "@outpost/shared";
import type { AppContext } from "../../../core/context.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { readSpreadsheetNumber } from "../../../core/spreadsheet-number.ts";
import { COUNTRIES, countryOf } from "../countries.ts";
import { type Crs, CrsError, crsFromName, toWgs84 } from "../crs.ts";
import { PROVIDERS } from "../providers.ts";
import type { FeatureSink, ReadContext, ReadResult } from "../types.ts";
import { csvRecords } from "./csv.ts";
import { readGeoJsonFile, textProp } from "./geojson.ts";
import { cleanText } from "./osm-tags.ts";

export const provider = PROVIDERS.find((entry) => entry.id === "import")!;

/** Layers a features file may put things in. Historical records have their own form; boundaries come from Natural Earth. */
export const IMPORTABLE_LAYERS: ReferenceLayerId[] = [
  "shelters",
  "planning-zones",
  "military",
  "nuclear",
  "hospitals",
  "emergency",
  "airports",
  "towns",
];

export const TEMPLATES: Record<string, string[]> = {
  "features-csv": [
    "name",
    "latitude",
    "longitude",
    "layer",
    "kind",
    "country",
    "provenance",
    "publisher",
    "license",
    "source_url",
    "published",
    "accuracy",
    "accuracy_m",
    "source_id",
    "notes",
  ],
  "historical-csv": [
    "record_id",
    "name",
    "latitude",
    "longitude",
    "location_text",
    "country",
    "period",
    "record_type",
    "document_title",
    "document_publisher",
    "document_date",
    "archive_ref",
    "classification",
    "target_category",
    "evidence_quality",
    "geographic_precision",
    "citations",
    "document_url",
    "library_document_id",
    "publisher",
    "license",
    "notes",
  ],
  "country-figures-csv": [
    "country",
    "indicator",
    "value",
    "unit",
    "year",
    "source_title",
    "publisher",
    "published",
    "url",
    "page",
    "license",
    "notes",
  ],
};

export function provenanceOf(text: string | undefined): FeatureProvenance | null {
  const value = (text ?? "").trim().toLowerCase();
  if (["public-record", "public record", "published", "public-infrastructure", "official"].includes(value)) return "public-infrastructure";
  if (["unverified", "speculative", "speculation", "unknown"].includes(value)) return "unverified";
  return null;
}

function countryCode(text: string | undefined): string | null {
  const value = (text ?? "").trim();
  if (!value) return null;
  if (/^[A-Za-z]{2}$/.test(value)) return countryOf(value)?.code ?? null;
  const folded = value.toLowerCase();
  return COUNTRIES.find((country) => country.name.toLowerCase() === folded || country.iso3.toLowerCase() === folded)?.code ?? null;
}

function position(row: Record<string, string>, crs: Crs): { lat: number; lon: number } | null | string {
  const latText = row.latitude ?? row.lat ?? "";
  const lonText = row.longitude ?? row.lon ?? row.lng ?? "";
  const xText = row.x ?? row.easting ?? "";
  const yText = row.y ?? row.northing ?? "";
  if (!latText && !lonText && !xText && !yText) return null;
  try {
    if (xText || yText) {
      const [lon, lat] = toWgs84(crs, Number(xText), Number(yText));
      return { lat, lon };
    }
    const [lon, lat] = toWgs84(crs, Number(lonText), Number(latText));
    return { lat, lon };
  } catch (error) {
    return error instanceof CrsError ? error.message : String(error);
  }
}

const required = (row: Record<string, string>, names: string[]) => names.filter((name) => !cleanText(row[name]));

async function readFeaturesCsv(context: ReadContext, crs: Crs): Promise<void> {
  const { sink, meta } = context;
  const defaults = meta.options ?? {};
  for await (const { row, line } of csvRecords(context.filePath, context.signal)) {
    const merged: Record<string, string> = { ...defaults, ...Object.fromEntries(Object.entries(row).filter(([, value]) => value !== "")) };
    const missing = required(merged, ["name", "layer", "provenance", "publisher", "license", "accuracy"]);
    if (missing.length > 0) {
      sink.skip(`Line ${line}: no ${missing.join(", ")}.`);
      continue;
    }
    const layer = merged.layer!.trim() as ReferenceLayerId;
    if (!IMPORTABLE_LAYERS.includes(layer)) {
      sink.skip(
        `Line ${line}: "${cleanText(merged.layer, 40)}" is not a layer a place can be imported into (${IMPORTABLE_LAYERS.join(", ")}).`,
      );
      continue;
    }
    const provenance = provenanceOf(merged.provenance);
    if (!provenance) {
      sink.skip(`Line ${line}: provenance must be "public-record" or "unverified".`);
      continue;
    }
    const at = position(merged, crs);
    if (at === null || typeof at === "string") {
      sink.skip(`Line ${line}: ${typeof at === "string" ? at : "no position"}.`);
      continue;
    }
    await sink.add({
      sourceId: cleanText(merged.source_id, 120) || `line-${line}`,
      layer,
      kind: `import:${cleanText(merged.kind, 80) || "Imported place"}`,
      name: cleanText(merged.name),
      altNames: "",
      country: countryCode(merged.country),
      lat: at.lat,
      lon: at.lon,
      bbox: null,
      geometry: null,
      props: merged.notes ? { notes: cleanText(merged.notes, 1000) } : {},
      provenance,
      accuracy:
        cleanText(merged.accuracy, 300) + (crs.errorMeters ? `; converted from ${crs.name}, adding up to about ${crs.errorMeters} m` : ""),
      accuracyMeters: Number(merged.accuracy_m) > 0 ? Number(merged.accuracy_m) + crs.errorMeters : null,
      publisher: cleanText(merged.publisher),
      license: cleanText(merged.license),
      sourceUrl: cleanUrl(merged.source_url),
      publishedAt: cleanText(merged.published, 40) || null,
    });
  }
}

function cleanUrl(text: string | undefined): string | null {
  const value = (text ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function readGeoJson(context: ReadContext): Promise<string> {
  const { sink, meta } = context;
  const options = meta.options ?? {};
  const missing = required(options, ["layer", "provenance", "publisher", "license", "accuracy"]);
  if (missing.length > 0) throw new PermanentJobError(`Say the ${missing.join(", ")} of the file's features before importing it.`);
  const layer = options.layer as ReferenceLayerId;
  if (!IMPORTABLE_LAYERS.includes(layer)) throw new PermanentJobError(`"${options.layer}" is not a layer a file can be imported into.`);
  const provenance = provenanceOf(options.provenance);
  if (!provenance) throw new PermanentJobError('Provenance must be "public-record" or "unverified".');
  let index = 0;
  const { crs } = await readGeoJsonFile(context.filePath, {
    crsName: options.crs || null,
    onSkip: (reason) => sink.skip(reason),
    async onFeature(feature) {
      index += 1;
      const p = feature.properties;
      const name =
        textProp(p, options.nameField ?? "", "name", "NAME", "Name", "title", "label") || `${options.kind || "Feature"} ${index}`;
      const props: Record<string, string> = {};
      for (const [key, value] of Object.entries(p).slice(0, 30)) {
        const text =
          typeof value === "string" ? cleanText(value, 300) : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
        if (text && cleanText(key, 60)) props[cleanText(key, 60)] = text;
      }
      await sink.add({
        sourceId: textProp(p, "id", "ID", "fid", "OBJECTID") || `feature-${index}`,
        layer,
        kind: `import:${cleanText(options.kind, 80) || (layer === "planning-zones" ? "Emergency planning zone" : "Imported feature")}`,
        name,
        altNames: "",
        country: countryCode(options.country),
        lat: feature.lat,
        lon: feature.lon,
        bbox: feature.bbox,
        geometry: feature.geometry,
        props,
        provenance,
        accuracy: cleanText(options.accuracy, 300),
        accuracyMeters: null,
        publisher: cleanText(options.publisher),
        license: cleanText(options.license),
        sourceUrl: cleanUrl(options.sourceUrl),
        publishedAt: cleanText(options.publishedAt, 40) || null,
      });
    },
  });
  return crs.name;
}

async function readHistoricalCsv(context: ReadContext, ctx: AppContext, crs: Crs): Promise<void> {
  const { sink } = context;
  const documentExists = ctx.sqlite.prepare("SELECT 1 FROM documents WHERE id = ?");
  const seen = new Set<string>();
  for await (const { row, line } of csvRecords(context.filePath, context.signal)) {
    const missing = required(row, [
      "record_id",
      "period",
      "record_type",
      "document_title",
      "evidence_quality",
      "geographic_precision",
      "citations",
      "publisher",
      "license",
    ]);
    if (missing.length > 0) {
      sink.skip(`Line ${line}: no ${missing.join(", ")}. Every historical record needs them.`);
      continue;
    }
    const recordType = row.record_type!.trim().toLowerCase() as HistoricalRecordType;
    if (!(HISTORICAL_RECORD_TYPES as readonly string[]).includes(recordType)) {
      sink.skip(
        `Line ${line}: record_type must be one of ${HISTORICAL_RECORD_TYPES.join(", ")}, saying whether it is an actual target list, an assessment of likely targets, or an author's speculation.`,
      );
      continue;
    }
    const recordId = cleanText(row.record_id, 120);
    if (seen.has(recordId)) {
      sink.skip(`Line ${line}: record ${recordId} is in the file twice; the first was kept.`);
      continue;
    }
    seen.add(recordId);
    const at = position(row, crs);
    if (typeof at === "string") {
      sink.skip(`Line ${line}: ${at}`);
      continue;
    }
    const citations = row
      .citations!.split("|")
      .map((citation) => cleanText(citation, 600))
      .filter(Boolean);
    let libraryDocumentId: string | null = cleanText(row.library_document_id, 60) || null;
    if (libraryDocumentId && !documentExists.get(libraryDocumentId)) {
      sink.skip(`Line ${line}: library document ${libraryDocumentId} is not in the library; the record was kept without the link.`);
      libraryDocumentId = null;
    }
    const name = cleanText(row.name) || cleanText(row.location_text) || recordId;
    await sink.add({
      sourceId: recordId,
      layer: "historical",
      kind: `import:${cleanText(row.target_category, 80) || "Historical record"}`,
      name,
      altNames: recordId,
      country: countryCode(row.country),
      lat: at?.lat ?? null,
      lon: at?.lon ?? null,
      bbox: null,
      geometry: null,
      props: {},
      provenance: recordType === "speculation" ? "unverified" : "historical",
      accuracy: cleanText(row.geographic_precision, 300),
      accuracyMeters: null,
      publisher: cleanText(row.publisher),
      license: cleanText(row.license),
      sourceUrl: cleanUrl(row.document_url),
      publishedAt: cleanText(row.document_date, 40) || null,
      historical: {
        recordType,
        period: cleanText(row.period, 80),
        locationText: cleanText(row.location_text, 300),
        documentTitle: cleanText(row.document_title, 400),
        documentPublisher: cleanText(row.document_publisher, 200),
        documentDate: cleanText(row.document_date, 40),
        archiveRef: cleanText(row.archive_ref, 200),
        classification: cleanText(row.classification, 200),
        targetCategory: cleanText(row.target_category, 120),
        evidenceQuality: cleanText(row.evidence_quality, 300),
        geographicPrecision: cleanText(row.geographic_precision, 300),
        citations,
        documentUrl: cleanUrl(row.document_url),
        libraryDocumentId,
        notes: cleanText(row.notes, 2000),
      },
    });
  }
}

async function readFiguresCsv(context: ReadContext): Promise<void> {
  const { sink } = context;
  for await (const { row, line } of csvRecords(context.filePath, context.signal)) {
    const missing = required(row, ["country", "indicator", "source_title", "publisher"]);
    if (missing.length > 0) {
      sink.skip(`Line ${line}: no ${missing.join(", ")}. A figure is kept only with its source.`);
      continue;
    }
    const country = countryCode(row.country);
    if (!country) {
      sink.skip(`Line ${line}: "${cleanText(row.country, 40)}" is not a country Outpost knows; give its two-letter code.`);
      continue;
    }
    // The file is separated by commas, so its decimal mark is the point; "1,5" can still only be a decimal.
    // Words after it ("5 million") are kept as text, not read as the number before them.
    const raw = (row.value ?? "").trim();
    const read = readSpreadsheetNumber(/^[+-]?[\d.,]+$/.test(raw) ? raw : "", ".");
    const value = read.kind === "number" ? read.value : null;
    await sink.figure({
      country,
      indicator: cleanText(row.indicator, 200),
      value,
      valueText: value === null ? cleanText(row.value, 120) : "",
      unit: cleanText(row.unit, 60),
      year: cleanText(row.year, 20),
      sourceTitle: cleanText(row.source_title, 400),
      publisher: cleanText(row.publisher, 200),
      publishedAt: cleanText(row.published, 40),
      url: cleanUrl(row.url),
      page: cleanText(row.page, 40),
      license: cleanText(row.license, 200),
      notes: cleanText(row.notes, 1000),
    });
  }
}

/** Reads an imported file of one of the CSV or GeoJSON forms. A `.osm.pbf` goes to the extract reader instead. */
export async function readImport(context: ReadContext, ctx: AppContext, sink: FeatureSink): Promise<ReadResult> {
  const format = context.meta.format;
  let crsName = "WGS 84";
  let crs: Crs;
  try {
    crs = crsFromName(context.meta.options?.crs || null);
  } catch (error) {
    throw new PermanentJobError((error as Error).message);
  }
  if (format === "features-csv") await readFeaturesCsv(context, crs);
  else if (format === "geojson") crsName = await readGeoJson(context);
  else if (format === "historical-csv") await readHistoricalCsv(context, ctx, crs);
  else if (format === "country-figures-csv") await readFiguresCsv(context);
  else throw new PermanentJobError("Outpost does not know that kind of file.");
  if (crs.convert) crsName = crs.name;
  if (sink.count === 0) {
    throw new PermanentJobError("Nothing in the file could be used. The reasons for the first rows are listed with the import.");
  }
  return { version: null, publishedAt: null, extra: { crs: crsName } };
}

export { REFERENCE_LAYERS };
