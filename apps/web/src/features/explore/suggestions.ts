/**
 * What Explore suggests downloading for where Home is: the same worldwide base for every
 * country (the map and its terrain, place names, OpenStreetMap's reference layers, the
 * encyclopedia in the country's languages, radio, weather and hazards), with the UK's
 * own sources added in the UK only. Outpost is meant to work anywhere; nothing here
 * assumes Britain.
 *
 * Pure: the screen gives it what it has read (the saved places, the countries' boxes,
 * the map presets and what is installed, the catalogue) and draws the rows it returns.
 */
import {
  type Bbox,
  type CatalogEntryDto,
  type CatalogPack,
  countryAt,
  countryLanguages,
  homePlaceOf,
  type MapOverview,
  type MapRegionPresetStatus,
  METEOALARM_COUNTRIES,
  ownValue,
} from "@outpost/shared";

export interface Suggestion {
  id: string;
  title: string;
  /** What it is and why, in a sentence. */
  about: string;
  /** Where to get it: a screen of Outpost, or a catalogue entry to download from here. */
  to?: string;
  entry?: CatalogEntryDto;
  done: boolean;
  /** One of the UK's own sources, offered in the UK as an addition. */
  uk?: boolean;
}

export interface SuggestionInput {
  markers: ReadonlyArray<{ icon: string; createdAt: number; id: string; lat: number; lon: number }> | undefined;
  countries: ReadonlyArray<{ code: string; name: string; bbox: Bbox }> | undefined;
  presets: MapRegionPresetStatus[] | undefined;
  overview: MapOverview | undefined;
  entries: CatalogEntryDto[];
}

export type Suggestions =
  | { state: "no-home" }
  | { state: "no-country" }
  | { state: "ready"; country: { code: string; name: string }; rows: Suggestion[] };

const contains = (box: Bbox, point: { lat: number; lon: number }) =>
  point.lon >= box[0] && point.lon <= box[2] && point.lat >= box[1] && point.lat <= box[3];
const area = (box: Bbox) => (box[2] - box[0]) * (box[3] - box[1]);

/** Language names for the encyclopedia rows, in English as the screen is. */
const LANGUAGE_NAMES: Record<string, string> = {
  ar: "Arabic",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  pt: "Portuguese",
  ru: "Russian",
  sw: "Swahili",
  zh: "Chinese",
};

export function languageName(code: string): string {
  return ownValue(LANGUAGE_NAMES, code) ?? code;
}

const isInstalled = (entry: CatalogEntryDto) => entry.status === "installed";

export function suggestionsFor(input: SuggestionInput): Suggestions {
  if (!input.markers) return { state: "no-home" };
  const home = homePlaceOf(input.markers);
  if (!home) return { state: "no-home" };
  const code = input.countries ? countryAt(home, input.countries) : null;
  const country = code ? input.countries?.find((entry) => entry.code === code) : undefined;
  if (!country) return { state: "no-country" };
  const uk = country.code === "GB";
  const rows: Suggestion[] = [];

  // The map: the smallest preset that holds Home, not the world overview.
  const holding = (input.presets ?? []).filter((preset) => preset.id !== "world" && contains(preset.bbox, home));
  const preset = holding.sort((a, b) => area(a.bbox) - area(b.bbox))[0];
  const regions = input.overview?.regions ?? [];
  const mapHere = regions.some((region) => region.tileType !== "terrain" && contains(region.bounds, home) && region.maxZoom >= 10);
  const terrainHere = regions.some((region) => region.tileType === "terrain" && contains(region.bounds, home));
  rows.push({
    id: "map",
    title: preset ? `Map of ${preset.name}` : `A map of ${country.name}`,
    about: preset
      ? `The detailed map round Home, from OpenStreetMap, to zoom ${preset.recommendedMaxZoom}.`
      : "No ready-made region holds Home: draw a box round it under Offline maps.",
    to: preset ? `/maps?offline=region&preset=${encodeURIComponent(preset.id)}` : "/maps?offline=region",
    done: mapHere,
  });
  rows.push({
    id: "terrain",
    title: "Terrain round Home",
    about: "Heights for hill shading, contour lines, profiles, the walk reach and the estimated range of a radio.",
    to: preset ? `/maps?offline=region&preset=${encodeURIComponent(preset.id)}` : "/maps?offline=region",
    done: terrainHere,
  });
  const places = input.overview?.places ?? [];
  rows.push({
    id: "places",
    title: `Place names in ${country.name}`,
    about: "Towns, villages and features to search the map by name, from GeoNames.",
    to: "/maps?offline=places",
    done: places.some(
      (dataset) => dataset.source === "geonames" && (dataset.countries.includes(country.code) || dataset.dataset.startsWith("cities")),
    ),
  });
  rows.push({
    id: "layers",
    title: `OpenStreetMap reference layers for ${country.name}`,
    about:
      "Hospitals, police, fire and ambulance, shelters, food and supplies, and walking and cycling routes, read from one Geofabrik extract of the country or a region of it.",
    to: "/maps?reference=manage",
    done: false,
  });

  // The encyclopedia in the country's languages, from the catalogue: English is already the catalogue's own.
  for (const language of countryLanguages(country.code).filter((language) => language !== "en")) {
    const entry = input.entries
      .filter((candidate) => candidate.language === language && candidate.category === "encyclopedias")
      .sort((a, b) => (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0))[0];
    if (!entry) continue;
    rows.push({
      id: `language-${language}`,
      title: entry.name,
      about: `${languageName(language)} is one of the languages of ${country.name}. ${entry.description}`,
      entry,
      done: isInstalled(entry),
    });
  }

  rows.push({
    id: "radio",
    title: `Radio in ${country.name}`,
    about: "Frequencies to listen to and the band plan of the region, and the country's repeater lists where a publisher offers one.",
    to: "/radio/frequencies",
    done: false,
  });
  const europe = ownValue(METEOALARM_COUNTRIES, country.code) !== undefined;
  rows.push({
    id: "weather",
    title: "Weather and hazards",
    about: `A forecast for Home from Open-Meteo, worldwide disasters from GDACS and earthquakes from the USGS${
      europe ? ", and MeteoAlarm's warnings for the country" : country.code === "US" ? ", and the National Weather Service's alerts" : ""
    }.`,
    to: "/prepare/weather",
    done: false,
  });

  if (uk) {
    rows.push(
      {
        id: "uk-os-names",
        title: "Ordnance Survey place names",
        about: "OS Open Names: every named place in Great Britain, with postcodes, beside GeoNames.",
        to: "/maps?offline=places",
        done: places.some((dataset) => dataset.source === "os"),
        uk: true,
      },
      {
        id: "uk-fsa",
        title: "Food shops from the Food Standards Agency",
        about: "Registered food businesses for the area on screen, as an addition to OpenStreetMap's food and supplies.",
        to: "/maps?reference=manage",
        done: false,
        uk: true,
      },
      {
        id: "uk-ea",
        title: "Environment Agency flood zones and river levels",
        about: "England's Flood Map for Planning as a layer, and river and sea levels under Weather and hazards.",
        to: "/maps?reference=manage",
        done: false,
        uk: true,
      },
      {
        id: "uk-met-office",
        title: "Met Office warnings",
        about: "The UK's national severe weather warnings, beside the worldwide forecast.",
        to: "/prepare/weather",
        done: false,
        uk: true,
      },
    );
  }
  return { state: "ready", country: { code: country.code, name: country.name }, rows };
}

/** Packs for Home's country first, then those for everyone, then those for other countries. */
export function packsFor(packs: CatalogPack[], country: string | null): CatalogPack[] {
  const rank = (pack: CatalogPack) => (!pack.countries ? 1 : country && pack.countries.includes(country) ? 0 : 2);
  return packs
    .map((pack, index) => ({ pack, index }))
    .sort((a, b) => rank(a.pack) - rank(b.pack) || a.index - b.index)
    .map(({ pack }) => pack);
}
