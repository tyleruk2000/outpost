/**
 * Reference layers on the map: publicly mapped infrastructure, places and boundaries
 * from published datasets, population, and documented historical records. The server
 * keeps them (modules/layers); these are the shapes it answers in.
 *
 * Three things are kept apart everywhere, in the data and on screen: what is publicly
 * mapped today, what historical documents record, and what is modelled or speculative.
 * Nothing here ranks or scores places.
 */
import type { Bbox } from "./maps.ts";

/** The layers features belong to. Population is a layer of its own, drawn from a grid, not from features. */
export const REFERENCE_LAYERS = [
  "military",
  "nuclear",
  "airports",
  "hospitals",
  "emergency",
  "shelters",
  "planning-zones",
  "boundaries",
  "regions",
  "towns",
  "historical",
  "flood-zones",
  "food",
  "routes",
  "rights-of-way",
] as const;
export type ReferenceLayerId = (typeof REFERENCE_LAYERS)[number];

/**
 * Where a thing on the map comes from, as the specification's section 10 names the
 * classes. "modelled" is the effects simulator's; the reference layers never use it.
 */
export const PROVENANCE_CLASSES = ["public-infrastructure", "historical", "modelled", "user", "unverified"] as const;
export type ProvenanceClass = (typeof PROVENANCE_CLASSES)[number];
/** The classes a stored reference feature can have. */
export type FeatureProvenance = Exclude<ProvenanceClass, "modelled">;

export const PROVENANCE_INFO: Record<ProvenanceClass, { label: string; shape: string; about: string }> = {
  "public-infrastructure": {
    label: "Published public record",
    shape: "a filled dot",
    about:
      "Taken from a published dataset (OpenStreetMap, OurAirports, Wikidata, Natural Earth, or an official register). Outpost has not checked it on the ground; it is as its publisher gives it.",
  },
  historical: {
    label: "Historical document",
    shape: "a ring marked H",
    about:
      "What a historical document records, with the document and its date. It describes the past, not the present, and says nothing about any place today.",
  },
  modelled: {
    label: "Modelled estimate",
    shape: "a dashed outline",
    about: "Worked out by a model from assumptions. An educational estimate, not a forecast.",
  },
  user: {
    label: "Your own",
    shape: "a pin",
    about: "Places and routes saved by people using this Outpost.",
  },
  unverified: {
    label: "Unverified or speculative",
    shape: "a ring marked ?",
    about: "Not from a published record: an author's speculation, or data whose source could not be stated. Shown as such.",
  },
};

/** The three kinds of historical record the specification asks to be kept apart. */
export const HISTORICAL_RECORD_TYPES = ["target-list", "assessment", "speculation"] as const;
export type HistoricalRecordType = (typeof HISTORICAL_RECORD_TYPES)[number];
export const HISTORICAL_RECORD_TYPE_LABELS: Record<HistoricalRecordType, string> = {
  "target-list": "An actual historical target list",
  assessment: "A historical assessment of likely targets",
  speculation: "An author's speculation",
};

export interface ReferenceLayerInfo {
  id: ReferenceLayerId;
  label: string;
  /** One or two sentences on what the layer is and what it is not. */
  about: string;
  /** Whether its features are drawn as areas where the source has the outline. */
  areas: boolean;
}

export const REFERENCE_LAYER_INFO: Record<ReferenceLayerId, ReferenceLayerInfo> = {
  military: {
    id: "military",
    label: "Military sites",
    about:
      "Military land and installations as OpenStreetMap contributors have mapped them. Publicly mapped infrastructure: incomplete, and in some countries deliberately left unmapped. Nothing here says anything about any place's importance.",
    areas: true,
  },
  nuclear: {
    id: "nuclear",
    label: "Nuclear facilities",
    about: "Nuclear power stations and other publicly documented nuclear facilities, from OpenStreetMap and Wikidata.",
    areas: true,
  },
  airports: {
    id: "airports",
    label: "Airports and airfields",
    about: "Airports, airfields, heliports and seaplane bases, as OurAirports lists them, with their own types.",
    areas: false,
  },
  hospitals: { id: "hospitals", label: "Hospitals", about: "Hospitals as OpenStreetMap contributors have mapped them.", areas: true },
  emergency: {
    id: "emergency",
    label: "Police, fire and ambulance",
    about: "Police, fire and ambulance stations as OpenStreetMap contributors have mapped them.",
    areas: true,
  },
  shelters: {
    id: "shelters",
    label: "Shelters and assembly points",
    about:
      "Public shelters, bomb and fallout shelters and emergency assembly points as mapped or officially published. A mark on the map does not mean a shelter is open, kept up or meant for you: follow your local authority's instructions.",
    areas: true,
  },
  "planning-zones": {
    id: "planning-zones",
    label: "Emergency planning zones",
    about: "Zones round nuclear sites that authorities publish for emergency planning, from files you import.",
    areas: true,
  },
  boundaries: {
    id: "boundaries",
    label: "Country boundaries",
    about: "Countries as Natural Earth draws them, at 1:50 million.",
    areas: true,
  },
  regions: {
    id: "regions",
    label: "Regions",
    about: "First-level divisions of countries (states, provinces, nations, regions) from Natural Earth.",
    areas: true,
  },
  towns: {
    id: "towns",
    label: "Populated places",
    about: "Cities and towns from Natural Earth, with its population estimates.",
    areas: false,
  },
  historical: {
    id: "historical",
    label: "Historical records",
    about:
      "Places named in declassified historical documents, each with its document, its date and which kind of record it is. History, not a statement about any place today.",
    areas: false,
  },
  "flood-zones": {
    id: "flood-zones",
    label: "Flood zones (England)",
    about:
      "The Environment Agency's Flood Map for Planning: Flood Zones 2 and 3, from rivers and the sea, ignoring the benefits of defences. England only. A planning zone is not a forecast that a place will flood.",
    areas: true,
  },
  food: {
    id: "food",
    label: "Food and supplies",
    about:
      "Shops, markets, food banks, drinking water, fuel and pharmacies as OpenStreetMap volunteers have mapped them, and in the UK the shops registered with the Food Standards Agency. A mark does not mean a place is open, stocked or still there.",
    areas: false,
  },
  routes: {
    id: "routes",
    label: "Walking and cycling routes",
    about:
      "Waymarked walking, hiking, cycling and mountain-bike routes, from long-distance paths that cross countries to local walks, as OpenStreetMap contributors have mapped them. A line on the map is not a promise that the way is open or passable.",
    areas: false,
  },
  "rights-of-way": {
    id: "rights-of-way",
    label: "Rights of way",
    about:
      "Paths with a legal right of way where OpenStreetMap contributors have tagged it: footpaths, bridleways and byways in England and Wales, core paths in Scotland. Only what is tagged: the council's definitive map is the legal record.",
    areas: false,
  },
};

/** Layers drawn as lines, not marks: shown only close enough in that the lines can be told apart. */
export const LINE_LAYERS: ReadonlySet<ReferenceLayerId> = new Set(["routes", "rights-of-way"]);
/** The zoom each line layer is drawn from. */
export const LINE_LAYER_ZOOM: Partial<Record<ReferenceLayerId, number>> = { routes: 8, "rights-of-way": 12 };

/**
 * The Environment Agency's own words for its flood zones, read on data.gov.uk on
 * 16 November 2026 ("Flood Map for Planning (Rivers and Sea) - Flood Zones"), for the
 * legend and the record card.
 */
export const FLOOD_ZONE_WORDS = {
  zone3:
    "Flood Zone 3 – Areas shown to be at a 1% (1 in 100) or greater annual probability of flooding from rivers or, 0.5% (1 in 200) or greater annual probability of flooding from the sea.",
  zone2:
    "Flood Zone 2 – Land having between 0.1% - 1% (1 in 100 to 1 in 1000) annual probability of flooding from rivers or between 0.1% - 0.5% (1 in 200 to 1 in 1000) annual probability of flooding from the sea, and accepted recorded flood outlines.",
  defences: "shows the extent of land at present day risk of flooding from rivers and the sea, ignoring the benefits of defences",
  caveat:
    "The Flood Zones are designed to only give an indication of flood risk to an area of land and are not suitable for showing whether an individual property is at risk of flooding. This is because we cannot know all the details about each property.",
  attribution: "© Environment Agency copyright and/or database right 2025. All rights reserved.",
  /** Outpost's own words, not the Agency's. */
  notForecast:
    "A planning zone says how likely flooding is in a typical year, as modelled for planning. It is not a forecast that a place will flood, and it is not a warning: for those, see Weather and hazards.",
} as const;

/**
 * The kinds of place in the food and supplies layer, in the order the legend and the
 * nearest list give them. Each is a kind a household would look for; the tags or the
 * Agency's business types each is made from are in the server (`adapters/food-tags.ts`).
 */
export const FOOD_KINDS = [
  { kind: "food:supermarket", label: "Supermarket" },
  { kind: "food:small-shop", label: "Small shop" },
  { kind: "food:greengrocer", label: "Greengrocer" },
  { kind: "food:butcher", label: "Butcher" },
  { kind: "food:baker", label: "Baker" },
  { kind: "food:farm-shop", label: "Farm shop" },
  { kind: "food:market", label: "Market" },
  { kind: "food:retailer", label: "Other shop selling food" },
  { kind: "food:food-bank", label: "Food bank" },
  { kind: "food:water", label: "Drinking water" },
  { kind: "food:fuel", label: "Fuel" },
  { kind: "food:pharmacy", label: "Pharmacy" },
] as const;
export type FoodKind = (typeof FOOD_KINDS)[number]["kind"];
export const isFoodKind = (kind: string): kind is FoodKind => FOOD_KINDS.some((entry) => entry.kind === kind);

/** Outpost's words for what the food and supplies layer is and is not, for the card and the Layers tab. */
export const FOOD_WORDS = {
  osm: "What OpenStreetMap volunteers had mapped when it was fetched. It does not say a place is open, has anything in stock or is still there.",
  fsa: "A business registered with its council as selling food, as the Food Standards Agency listed it when it was fetched. It does not say a place is open, has anything in stock or is still there.",
  emergency: "In an emergency shops may be shut or empty, and taps and pumps may not work.",
  coverage:
    "Well mapped in towns in Britain and much of Europe; patchy in the countryside and in many other countries. A place missing here may still be there.",
} as const;

/** What a food and supplies record says, from its source's own fields, for the card. Absent for every other layer. */
export interface FoodFactsDto {
  /** Other kinds the same place is mapped as (a fuel station with a shop), as labels. */
  alsoKinds: string[];
  /** The address as its source gives it, in one line; null where none is given. */
  address: string | null;
  /** OpenStreetMap's `opening_hours`, exactly as mapped; null where none is. */
  openingHours: string | null;
  brand: string | null;
  /** The Food Standards Agency's business type, as it gives it; null for OpenStreetMap. */
  businessType: string | null;
  /** For drinking water: whether it is marked as drinkable, and whether it is seasonal, in words. */
  water: { drinkable: string; seasonal: string | null } | null;
  /** The source and its caution, in Outpost's words (FOOD_WORDS). */
  caution: string;
}

/** One record in the nearest list (`GET /api/reference/nearest`), measured from the point asked about. */
export interface NearestHit {
  id: number;
  name: string;
  kind: string;
  kindLabel: string;
  provider: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  /** Compass bearing from the point asked about, 0 to 360. */
  bearingDegrees: number;
}

export interface NearestResponse {
  /** The kind asked for, or null for the nearest of each kind. */
  kind: string | null;
  /** How far was looked, in metres: nothing further is listed. */
  withinMeters: number;
  hits: NearestHit[];
}

/** A provider of reference data, and what Outpost may do with it. */
export interface ReferenceProviderDto {
  id: string;
  name: string;
  publisher: string;
  url: string;
  license: string;
  licenseUrl: string | null;
  termsUrl: string;
  /** The words of the terms that decide what Outpost does, as read on `termsRead`. */
  termsQuote: string;
  termsRead: string;
  /** "fetch": downloaded on a press; "import": a file the person obtains; "link": the source is linked only. */
  verdict: "fetch" | "import" | "link";
  why: string;
  layers: ReferenceLayerId[];
  /** What a pack can be chosen by. */
  scopes: Array<"country" | "region" | "bbox" | "world">;
  /** For "import": the kinds of file accepted. */
  importFormats: ReferenceImportFormat[];
  /** Said before anything is fetched or shown (the legal caution about mapping military sites, for one). */
  caution: string | null;
  incremental: string;
  /**
   * The name Outpost gives this source when it asks, where the source's policy wants one that says how to reach
   * the project: the application, its version and the project's web address. Shown before anything is asked, and
   * the person agrees to it being sent (`ReferenceEstimateRequest.clientNameAgreed`). Absent or null for a source
   * asked under Outpost's plain name.
   */
  clientName?: string | null;
}

export const REFERENCE_IMPORT_FORMATS = [
  "features-csv",
  "geojson",
  "historical-csv",
  "country-figures-csv",
  "osm-pbf",
  "worldpop-tif",
] as const;
export type ReferenceImportFormat = (typeof REFERENCE_IMPORT_FORMATS)[number];

export interface ReferenceScope {
  /** ISO 3166-1 alpha-2 codes. */
  countries?: string[];
  /** A box drawn on the map. */
  bbox?: Bbox;
  /** Geofabrik extracts by their ids in its index (`us/ohio`, `bayern`): a country's state, Land or county. */
  regions?: string[];
}

export interface ReferenceEstimateRequest {
  provider: string;
  scope: ReferenceScope;
  layers?: ReferenceLayerId[];
  /** True when the person has ticked that the source's `clientName` may be sent. Refused without it where the source has one. */
  clientNameAgreed?: boolean;
}

export interface ReferenceEstimateItem {
  /** Sent back to start this item. */
  key: string;
  title: string;
  layers: ReferenceLayerId[];
  bytes: number;
  /** True when the size is the publisher's own (a HEAD request); false when it is worked out. */
  exact: boolean;
  /** How the size was arrived at, in words. */
  basis: string;
  /** How many records, when the source said. */
  records: number | null;
  host: string;
  /** An installed pack this would replace. */
  replaces: string | null;
  /** A rough allowance for what stays in Outpost's database once the file is read, where the source can say better than the download's size. */
  databaseBytes?: number;
  /** For a file that need not be kept once read (a Geofabrik extract): whether it is kept unless the person says otherwise. */
  fileKeptByDefault?: boolean;
}

export interface ReferenceEstimate {
  /** Sent back to start some of the items; kept by the server for half an hour. */
  estimateId: string;
  provider: string;
  items: ReferenceEstimateItem[];
  totalBytes: number;
  /** The download plus a rough allowance for the records in the database, which is on the data directory's disk. */
  databaseBytes: number;
  /** Things the person should know before starting: a source that only covers part of the world, a caution. */
  notes: string[];
}

export interface ReferenceStartRequest {
  estimateId: string;
  keys: string[];
  locationId?: string;
  /** For a Geofabrik extract: keep the downloaded file once it is read (true), or only the places read from it (false). */
  keepFile?: boolean;
}

/** An installed pack: one downloaded or imported file and the records read from it. */
export interface ReferencePackDto {
  id: string;
  title: string;
  provider: string;
  providerName: string;
  layers: ReferenceLayerId[];
  countries: string[];
  bbox: Bbox | null;
  /** The publisher's version or data date. */
  version: string | null;
  publishedAt: string | null;
  retrievedAt: number;
  records: number;
  figures: number;
  /** How many of its records describe something another pack already has. */
  duplicates: number;
  /** What it holds: its file plus about what its records take in the database. */
  sizeBytes: number;
  publisher: string;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string | null;
  locationId: string;
  locationName: string;
  available: boolean;
  status: "installed" | "missing" | "moving" | "damaged";
  /** "download" can be updated from its source; "import" was a file the person brought. */
  origin: "download" | "import";
  /** The estimate request that made it, to update it from. */
  request: ReferenceEstimateRequest | null;
  /** What the person should know about this pack's contents (frequencies that could not be fetched). */
  notes?: string[];
}

export interface ReferenceLayerSummary {
  id: ReferenceLayerId;
  count: number;
  countries: string[];
  providers: Array<{ id: string; name: string; count: number }>;
  kinds: Array<{ kind: string; label: string; count: number }>;
  provenance: Array<{ provenance: FeatureProvenance; count: number }>;
}

export interface PopulationSetDto {
  id: string;
  country: string;
  product: string;
  year: number;
  bbox: Bbox;
  available: boolean;
  citation: string;
}

export interface ReferenceLayersResponse {
  layers: ReferenceLayerSummary[];
  population: PopulationSetDto[];
  credits: Array<{ provider: string; text: string; url: string | null }>;
}

export interface ReferenceFilter {
  layers: ReferenceLayerId[];
  countries?: string[];
  providers?: string[];
  kinds?: string[];
}

export interface ReferencePoint {
  id: number;
  layer: ReferenceLayerId;
  provenance: FeatureProvenance;
  name: string;
  kind: string;
  lat: number;
  lon: number;
}

/** Many features in one patch of the view, counted, for one layer and one provenance class. */
export interface ReferenceCell {
  layer: ReferenceLayerId;
  provenance: FeatureProvenance;
  count: number;
  lat: number;
  lon: number;
}

export interface ReferenceShape {
  id: number;
  layer: ReferenceLayerId;
  provenance: FeatureProvenance;
  name: string;
  /** The source's own code (a flood zone's is `ea:flood-zone-3` or `ea:flood-zone-2`), for layers drawn by kind. */
  kind: string;
  geometry: { type: string; coordinates: unknown };
}

export interface ReferenceOverlayResponse {
  total: number;
  points: ReferencePoint[];
  cells: ReferenceCell[];
  shapes: ReferenceShape[];
  /** Flood zones are many detailed areas: drawn only close in, and not at all where a view holds too many. Why, when not drawn. */
  floodZones?: "zoom-in" | "too-many" | null;
  /** Routes and rights of way, the same way: why they are not drawn, when they are not. */
  lines?: "zoom-in" | "too-many" | null;
}

export interface ReferenceSourceInfo {
  provider: string;
  providerName: string;
  sourceId: string;
  publisher: string;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  retrievedAt: number;
  accuracy: string;
  accuracyMeters: number | null;
  provenance: FeatureProvenance;
  packId: string;
  packTitle: string;
}

export interface HistoricalRecordDto {
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
  /** A document in the library: opened at /library/documents/<id>. */
  libraryDocument: { id: string; title: string } | null;
  notes: string;
}

export interface ReferenceFeatureDetail {
  id: number;
  layer: ReferenceLayerId;
  kind: string;
  kindLabel: string;
  name: string;
  altNames: string[];
  country: string | null;
  lat: number | null;
  lon: number | null;
  bbox: Bbox | null;
  /** The source's own fields, as text. */
  props: Record<string, string>;
  provenance: FeatureProvenance;
  source: ReferenceSourceInfo;
  /** Other records of the same thing, from other packs or providers. */
  alsoFrom: ReferenceSourceInfo[];
  historical: HistoricalRecordDto | null;
  hasGeometry: boolean;
  /** For an airport from OurAirports: its radio frequencies, or that they are not held. Absent for every other record. */
  airportFrequencies?: AirportFrequenciesDto;
  /** For a place in the food and supplies layer: what its source says about it. Absent for every other record. */
  food?: FoodFactsDto;
}

/** One row of OurAirports' `airport-frequencies.csv` for an airport. */
export interface AirportFrequencyDto {
  /** The file's `type`, as given (TWR, ATIS, CTAF, or anything else a contributor typed). */
  type: string;
  /** The type in words where that is certain (TWR is "Tower"); null where it is not, and the type is shown as given. */
  typeLabel: string | null;
  /** The file's `description`, as given; may be empty. */
  description: string;
  /** The file's `frequency_mhz`, as given. */
  mhz: string;
}

export interface AirportFrequenciesDto {
  /** False for an airport installed before frequencies were fetched, or when the file could not be fetched or read. */
  held: boolean;
  /** The date of the frequencies file (its Last-Modified, or the day it was fetched). */
  asOf: string | null;
  /** Tower first, then information services (ATIS, AFIS, information), then the rest in the file's order. */
  list: AirportFrequencyDto[];
}

/**
 * One historical record as the records browser lists it (`GET /api/reference/historical`):
 * which of the three kinds of record it is, its period and its document. Listed by period
 * and then name, never by anything that could rank places.
 */
export interface HistoricalRecordRow {
  id: number;
  name: string;
  provenance: FeatureProvenance;
  recordType: HistoricalRecordType;
  period: string;
  country: string | null;
  lat: number | null;
  lon: number | null;
  locationText: string;
  documentTitle: string;
  documentDate: string;
  documentUrl: string | null;
  libraryDocument: { id: string; title: string } | null;
}

export interface HistoricalRecordsResponse {
  total: number;
  records: HistoricalRecordRow[];
}

export interface LayerSearchHit {
  id: number;
  layer: ReferenceLayerId;
  provenance: FeatureProvenance;
  name: string;
  kindLabel: string;
  country: string | null;
  lat: number | null;
  lon: number | null;
  /** Asked from a point (`near`): how far it is, in metres. */
  distanceMeters?: number | null;
  /** Asked from a point: the town or village it is in or near, from the Towns layer where it is held. */
  place?: string | null;
}

export interface LayerSearchResponse {
  query: string;
  hits: LayerSearchHit[];
}

export interface PopulationCell {
  west: number;
  south: number;
  east: number;
  north: number;
  /** People per square kilometre. */
  density: number;
}

export interface PopulationGridResponse {
  cells: PopulationCell[];
  /** The edges of the legend's classes, in people per square kilometre. */
  classes: number[];
  sets: Array<{ country: string; product: string; year: number }>;
}

export interface PopulationSumResponse {
  /** Rounded to the precision the product supports; null when no installed grid covers the circle. */
  people: number | null;
  /** The share of the circle's area covered by installed grids, 0 to 1. */
  covered: number;
  sets: Array<{ country: string; product: string; year: number }>;
  note: string;
  /** The area of one cell of the finest grid counted, at the circle's latitude, in square kilometres; null when none was. */
  cellKm2: number | null;
}

export interface CountryFigureDto {
  id: number;
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
  packId: string;
}

export interface ReferenceImportResult {
  pack: ReferencePackDto;
  imported: number;
  skipped: number;
  duplicates: number;
  /** Up to twenty lines saying what was skipped and why. */
  problems: string[];
}

export interface ReferenceCatalogueResponse {
  providers: ReferenceProviderDto[];
  /** Sources the specification names that are linked only, with why. */
  linked: Array<{ id: string; name: string; url: string; why: string; termsQuote: string; termsRead: string }>;
  countries: Array<{ code: string; name: string; bbox: Bbox }>;
}

/** One extract in Geofabrik's index that a person can choose: a country, or a part of one (a state, a Land, a county). */
export interface ReferenceRegionDto {
  /** Geofabrik's id (`us/ohio`, `bayern`, `germany`). */
  id: string;
  /** In English where Geofabrik gives it, otherwise as Geofabrik names it (`Bayern`). */
  name: string;
  /** The country it is in, as two letters; null where Geofabrik gives none. */
  country: string | null;
  /** The extract it is part of, or null for a country. */
  parent: string | null;
  /** 0 for a country, 1 for its parts, 2 for their parts. */
  depth: number;
}

/** Geofabrik's list of extracts as kept on this device (`GET /api/reference/regions`). */
export interface ReferenceRegionsResponse {
  /** False until a person has pressed to read the list. */
  held: boolean;
  /** When it was read, as a time. */
  readAt: number | null;
  /** Where it was read from. */
  source: string;
  /** Countries first in the order of their names, each followed by its parts. */
  regions: ReferenceRegionDto[];
  /** Regions to offer first, worked out from what is held (the home place, packs already held); nothing is asked. */
  suggested: Array<{ id: string; why: string }>;
}
