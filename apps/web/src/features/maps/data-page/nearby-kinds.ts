/**
 * The kinds of nearby places (the layers on the map) that Add a place offers under Nearby places,
 * by the place it is for: a country's are read from its source file, with a few national sets
 * from their own publishers; World basics are the worldwide sets; a drawn area's are asked of
 * the sources that answer by area. Each kind says its source as a detail line.
 */
import type { ReferenceEstimateRequest, ReferenceLayerId, ReferenceLayersResponse, ReferenceScope } from "@outpost/shared";

/** The source file: read on this device for routes and nearby places, nothing more downloaded for these. */
export const SOURCE_FILE = "osm-extract";

export interface NearbyKind {
  /** Its own id in links (`&layers=hospitals`): the layer it adds, or "population". */
  id: string;
  name: string;
  /** What it holds, where the name does not say. */
  detail?: string;
  /** Who it comes from, said as a detail line. */
  source: string;
  /** The source asked: the source file, or another publisher's set. */
  provider: string;
  /** The layers it adds to the map; none for population, which is a grid. */
  layers: ReferenceLayerId[];
  /** Ticked when Nearby places is first ticked. */
  usual?: boolean;
}

const OSM_FILE = "OpenStreetMap, read from the source file";
const OSM_ASKED = "OpenStreetMap, asked of an Overpass server for the area";

/** Kinds read from a country's source file: nothing more is downloaded for them. */
const FROM_FILE: NearbyKind[] = [
  { id: "hospitals", name: "Hospitals", source: OSM_FILE, provider: SOURCE_FILE, layers: ["hospitals"], usual: true },
  { id: "emergency", name: "Police, fire and ambulance", source: OSM_FILE, provider: SOURCE_FILE, layers: ["emergency"], usual: true },
  { id: "shelters", name: "Shelters and assembly points", source: OSM_FILE, provider: SOURCE_FILE, layers: ["shelters"], usual: true },
  {
    id: "food",
    name: "Food and supplies",
    detail: "Shops, markets, fuel, drinking water, food banks and pharmacies",
    source: OSM_FILE,
    provider: SOURCE_FILE,
    layers: ["food"],
    usual: true,
  },
  { id: "military", name: "Military sites", source: OSM_FILE, provider: SOURCE_FILE, layers: ["military"], usual: true },
  { id: "nuclear", name: "Nuclear facilities", source: OSM_FILE, provider: SOURCE_FILE, layers: ["nuclear"], usual: true },
  {
    id: "routes",
    name: "Waymarked routes",
    detail: "Signed walking, hiking and cycling routes, drawn as lines",
    source: OSM_FILE,
    provider: SOURCE_FILE,
    layers: ["routes"],
  },
  {
    id: "rights-of-way",
    name: "Rights of way",
    detail: "Paths whose right of way is mapped",
    source: OSM_FILE,
    provider: SOURCE_FILE,
    layers: ["rights-of-way"],
  },
];

const POPULATION: NearbyKind = {
  id: "population",
  name: "Population density",
  detail: "Modelled estimates of where people lived in 2020, about 1 km across",
  source: "WorldPop, CC BY 4.0",
  provider: "worldpop",
  layers: [],
};

const SWISS_POINTS: NearbyKind = {
  id: "meeting-points",
  name: "Emergency meeting points",
  detail: "Where people in Switzerland are told to go in an emergency",
  source: "Federal Office for Civil Protection (BABS)",
  provider: "babs",
  layers: ["shelters"],
};

/** World basics: the worldwide sets. */
const WORLD: NearbyKind[] = [
  {
    id: "boundaries",
    name: "Country boundaries",
    source: "Natural Earth, public domain",
    provider: "natural-earth",
    layers: ["boundaries"],
    usual: true,
  },
  {
    id: "regions",
    name: "Regions",
    detail: "States, provinces and nations",
    source: "Natural Earth, public domain",
    provider: "natural-earth",
    layers: ["regions"],
  },
  {
    id: "towns",
    name: "Populated places",
    detail: "Cities and towns, with population estimates",
    source: "Natural Earth, public domain",
    provider: "natural-earth",
    layers: ["towns"],
  },
  {
    id: "airports",
    name: "Airports and airfields",
    source: "OurAirports, public domain",
    provider: "ourairports",
    layers: ["airports"],
    usual: true,
  },
  {
    id: "nuclear",
    name: "Nuclear power stations and research reactors",
    source: "Wikidata, CC0",
    provider: "wikidata",
    layers: ["nuclear"],
  },
];

/** A drawn area: asked of the sources that answer by area. */
const AREA: NearbyKind[] = [
  ...FROM_FILE.filter((kind) => kind.id !== "routes" && kind.id !== "rights-of-way").map((kind) => ({
    ...kind,
    source: OSM_ASKED,
    provider: "osm",
    // Food and supplies is asked of a public server only for an area about a county across.
    detail: kind.id === "food" ? `${kind.detail}. For an area up to about a county across` : kind.detail,
    usual: kind.id === "hospitals" || kind.id === "emergency" || kind.id === "shelters",
  })),
  {
    id: "food-register",
    name: "Registered food shops (UK)",
    detail: "Every shop registered with its council as selling food",
    source: "Food Standards Agency, Open Government Licence",
    provider: "fsa",
    layers: ["food"],
  },
  {
    id: "flood-zones",
    name: "Flood zones (England)",
    detail: "For an area up to about 20 km across. A planning zone, not a forecast",
    source: "Environment Agency, Open Government Licence",
    provider: "ea-flood-zones",
    layers: ["flood-zones"],
  },
  { id: "airports", name: "Airports and airfields", source: "OurAirports, public domain", provider: "ourairports", layers: ["airports"] },
];

export type NearbyPlace = { type: "country"; code: string | null } | { type: "world" } | { type: "area" };

/** The kinds offered for a place. */
export function nearbyKindsFor(place: NearbyPlace): NearbyKind[] {
  if (place.type === "world") return WORLD;
  if (place.type === "area") return AREA;
  return [...FROM_FILE, POPULATION, ...(place.code === "CH" ? [SWISS_POINTS] : [])];
}

/** The layers that are only ever worldwide sets: offered for the whole world. */
export const WORLD_LAYERS: ReferenceLayerId[] = ["boundaries", "regions", "towns", "airports"];

/** The layers a country's source file can give. */
export const COUNTRY_LAYERS: ReferenceLayerId[] = FROM_FILE.flatMap((kind) => kind.layers);

/** Whether a kind is held for the place already, from the layers on this device. */
export function heldKind(kind: NearbyKind, place: NearbyPlace, summary: ReferenceLayersResponse | undefined): boolean {
  if (!summary) return false;
  if (kind.id === "population")
    return place.type === "country" && summary.population.some((set) => set.country.toUpperCase() === place.code);
  return kind.layers.every((layer) => {
    const held = summary.layers.find((each) => each.id === layer);
    if (!held) return false;
    if (place.type === "country") return place.code !== null && held.countries.includes(place.code);
    if (place.type === "world") return held.providers.some((provider) => provider.id === kind.provider);
    return false;
  });
}

/** The questions to ask the other sources for the kinds chosen, one for each source. */
export function otherRequests(
  kinds: NearbyKind[],
  scope: ReferenceScope,
  agreed: Set<string>,
  needsAgreement: (provider: string) => boolean,
): ReferenceEstimateRequest[] {
  const byProvider = new Map<string, ReferenceLayerId[]>();
  for (const kind of kinds) {
    if (kind.provider === SOURCE_FILE) continue;
    byProvider.set(kind.provider, [...(byProvider.get(kind.provider) ?? []), ...kind.layers]);
  }
  return [...byProvider].map(([provider, layers]) => ({
    provider,
    scope,
    ...(layers.length > 0 ? { layers: [...new Set(layers)] } : {}),
    ...(needsAgreement(provider) ? { clientNameAgreed: agreed.has(provider) } : {}),
  }));
}

/** "Add hospitals for United Kingdom", "Add country boundaries for the whole world". */
export function addLayerText(label: string, where: string): string {
  return `Add ${label.charAt(0).toLowerCase()}${label.slice(1)} for ${where}`;
}

/** The link that opens Add a place with one kind ticked. */
export function addLayerLink(kind: string, where: { country: string } | { world: true }): string {
  const place = "world" in where ? "world=1" : `country=${where.country}`;
  return `/maps/data?add=1&${place}&kinds=places&layers=${encodeURIComponent(kind)}`;
}
