/**
 * Which OpenStreetMap objects belong to which reference layer, by their tags.
 *
 * The tags are those the OpenStreetMap wiki documents, read on 16 November 2026 (see
 * docs/reference-layers.md for each page and its status). Nothing is guessed from a
 * name. What is left out is left out on purpose and said there:
 *
 * - `military=bunker` on its own: most are pillboxes and gun emplacements from past wars,
 *   over a hundred thousand of them. A bunker is kept only where `bunker_type` says it
 *   is a shelter for people (bomb, air-raid or fallout shelter), in the shelters layer.
 * - `military=naval_base` is deprecated on the wiki but still in use (506 objects); it is
 *   read as a base.
 * - `power=generator` with `generator:source=nuclear` (a reactor inside a station) is
 *   left out: the station it stands in is the facility, and counting reactors would
 *   list one station several times.
 * - There is no documented tag for a research reactor; Wikidata is used for those.
 */
import type { ReferenceLayerId } from "@outpost/shared";
import { cleanText as routeCleanText } from "../../maps/route-finder/overpass.ts";

export type OsmLayer = Extract<ReferenceLayerId, "military" | "nuclear" | "hospitals" | "emergency" | "shelters">;
export const OSM_LAYERS: OsmLayer[] = ["military", "nuclear", "hospitals", "emergency", "shelters"];

export const MILITARY_VALUES = [
  "base",
  "airfield",
  "barracks",
  "naval_base",
  "range",
  "training_area",
  "danger_area",
  "academy",
  "office",
  "checkpoint",
  "school",
  "nuclear_explosion_site",
] as const;
export const SHELTER_BUNKER_TYPES = ["bomb_shelter", "air_raid_shelter", "nuclear"] as const;

const KIND_LABELS: Record<string, string> = {
  "landuse=military": "Military land",
  "military=base": "Military base",
  "military=airfield": "Military airfield",
  "military=barracks": "Barracks",
  "military=naval_base": "Naval base",
  "military=range": "Firing range",
  "military=training_area": "Training area",
  "military=danger_area": "Danger area",
  "military=academy": "Military academy",
  "military=office": "Military office",
  "military=checkpoint": "Checkpoint",
  "military=school": "Military school",
  "military=nuclear_explosion_site": "Nuclear explosion site (historical test)",
  "plant:source=nuclear": "Nuclear power station",
  "amenity=hospital": "Hospital",
  "healthcare=hospital": "Hospital",
  "amenity=police": "Police station",
  "amenity=fire_station": "Fire station",
  "emergency=ambulance_station": "Ambulance station",
  "shelter_type=bomb_shelter": "Bomb shelter",
  "bunker_type=bomb_shelter": "Bomb shelter",
  "bunker_type=air_raid_shelter": "Air-raid shelter",
  "bunker_type=nuclear": "Fallout shelter",
  "emergency=assembly_point": "Emergency assembly point",
};

export function osmKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** The layer and kind of an object, or null if it belongs to none of them. */
export function classifyOsm(tags: Record<string, string>): { layer: OsmLayer; kind: string } | null {
  if (tags["plant:source"] === "nuclear" && tags.power === "plant") return { layer: "nuclear", kind: "plant:source=nuclear" };
  const military = tags.military;
  if (military && (MILITARY_VALUES as readonly string[]).includes(military)) return { layer: "military", kind: `military=${military}` };
  if (tags.landuse === "military") return { layer: "military", kind: "landuse=military" };
  if (tags.amenity === "hospital") return { layer: "hospitals", kind: "amenity=hospital" };
  if (tags.healthcare === "hospital") return { layer: "hospitals", kind: "healthcare=hospital" };
  if (tags.amenity === "police") return { layer: "emergency", kind: "amenity=police" };
  if (tags.amenity === "fire_station") return { layer: "emergency", kind: "amenity=fire_station" };
  if (tags.emergency === "ambulance_station") return { layer: "emergency", kind: "emergency=ambulance_station" };
  const bunker = tags.bunker_type;
  if (bunker && (SHELTER_BUNKER_TYPES as readonly string[]).includes(bunker)) return { layer: "shelters", kind: `bunker_type=${bunker}` };
  if (tags.amenity === "shelter" && tags.shelter_type === "bomb_shelter") return { layer: "shelters", kind: "shelter_type=bomb_shelter" };
  if (tags.emergency === "assembly_point") return { layer: "shelters", kind: "emergency=assembly_point" };
  return null;
}

/** The Overpass filters that find a layer's objects: one line per tag test, joined in a union. */
export function overpassFilters(layer: OsmLayer): string[] {
  switch (layer) {
    case "military":
      return ['["landuse"="military"]', `["military"~"^(${MILITARY_VALUES.join("|")})$"]`];
    case "nuclear":
      return ['["power"="plant"]["plant:source"="nuclear"]'];
    case "hospitals":
      return ['["amenity"="hospital"]', '["healthcare"="hospital"]'];
    case "emergency":
      return ['["amenity"~"^(police|fire_station)$"]', '["emergency"="ambulance_station"]'];
    case "shelters":
      return [
        `["bunker_type"~"^(${SHELTER_BUNKER_TYPES.join("|")})$"]`,
        '["amenity"="shelter"]["shelter_type"="bomb_shelter"]',
        '["emergency"="assembly_point"]',
      ];
  }
}

/** Tag keys kept with a feature and shown in its drawer. Everything else is passed over. */
export const KEPT_OSM_TAGS = new Set([
  "name",
  "name:en",
  "alt_name",
  "official_name",
  "short_name",
  "operator",
  "military",
  "military_service",
  "landuse",
  "amenity",
  "healthcare",
  "emergency",
  "power",
  "plant:source",
  "plant:method",
  "plant:output:electricity",
  "bunker_type",
  "shelter_type",
  "building",
  "capacity",
  "access",
  "opening_hours",
  "emergency:phone",
  "phone",
  "website",
  "addr:street",
  "addr:housenumber",
  "addr:city",
  "addr:postcode",
  "start_date",
  "end_date",
  "disused",
  "abandoned",
  "historic",
  "wikidata",
  "wikipedia",
  "ref",
  "description",
  "note",
  "source",
]);

/** Text fit to show: no control or direction characters, spaces collapsed, cut to length; empty if there is none. */
export function cleanText(value: unknown, max = 200): string {
  return routeCleanText(value, max) ?? "";
}

export function keptTags(tags: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!KEPT_OSM_TAGS.has(key) && !/^name:[a-z]{2,3}$/.test(key)) continue;
    const text = cleanText(value, 300);
    if (text) kept[key] = text;
  }
  return kept;
}

/** A name for a feature: its own, in English where given, or nothing. */
export function osmName(tags: Record<string, string>): { name: string; altNames: string } {
  const name = cleanText(tags.name) || cleanText(tags["name:en"]) || cleanText(tags.official_name);
  const others = new Set<string>();
  for (const key of ["name:en", "alt_name", "official_name", "short_name"]) {
    const value = cleanText(tags[key]);
    if (value && value !== name) others.add(value);
  }
  return { name, altNames: [...others].join(",") };
}
