/**
 * What Explore suggests for where Home is: the same worldwide rows in any country, the
 * encyclopedia in the country's languages, the UK's own sources in the UK only, and packs
 * for Home's country first.
 */
import { type CatalogEntryDto, type CatalogPack, countryLanguages, type MapRegionPresetStatus } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { packsFor, suggestionsFor } from "./suggestions";

const countries = [
  { code: "GB", name: "United Kingdom", bbox: [-8.65, 49.85, 1.77, 60.86] as [number, number, number, number] },
  { code: "KE", name: "Kenya", bbox: [33.9, -4.7, 41.9, 5.0] as [number, number, number, number] },
  { code: "FR", name: "France", bbox: [-5.1, 41.3, 9.6, 51.1] as [number, number, number, number] },
];
const home = (lat: number, lon: number) => [{ id: "h", icon: "home", createdAt: 1, lat, lon }];
const preset = (id: string, name: string, bbox: [number, number, number, number]): MapRegionPresetStatus => ({
  id,
  name,
  group: "",
  bbox,
  recommendedMaxZoom: 12,
  installed: false,
  collectionIds: [],
  downloadId: null,
});
const presets = [
  preset("world", "World overview", [-180, -85, 180, 85]),
  preset("country-ke", "Kenya", [33.9, -4.7, 41.9, 5.0]),
  preset("united-kingdom", "United Kingdom", [-8.65, 49.85, 1.77, 60.86]),
  preset("lake-district", "Lake District", [-3.6, 54.2, -2.6, 54.8]),
];
const entry = (id: string, language: string, sizeBytes: number) =>
  ({
    id,
    name: id,
    description: "An encyclopedia.",
    language,
    category: "encyclopedias",
    sizeBytes,
    status: "not_installed",
  }) as CatalogEntryDto;
const entries = [
  entry("wiki-sw", "sw", 260e6),
  entry("wiki-fr-mini", "fr", 5e9),
  entry("wiki-fr-nopic", "fr", 12e9),
  entry("wiki-en", "en", 1e9),
];

describe("suggestions for where Home is", () => {
  it("asks for a home place when there is none", () => {
    expect(suggestionsFor({ markers: [], countries, presets, overview: undefined, entries }).state).toBe("no-home");
  });

  it("suggests the worldwide base in Kenya, with Swahili, and none of the UK's sources", () => {
    const found = suggestionsFor({ markers: home(-1.29, 36.82), countries, presets, overview: undefined, entries });
    if (found.state !== "ready") throw new Error(found.state);
    expect(found.country.name).toBe("Kenya");
    expect(found.rows.map((row) => row.id)).toEqual(["map", "nearby", "language-sw", "radio", "weather"]);
    expect(found.rows[0]!.title).toBe("Map of Kenya");
    expect(found.rows[0]!.to).toBe("/maps/data?add=1&countries=KE");
    expect(found.rows.some((row) => row.uk)).toBe(false);
    expect(found.rows.find((row) => row.id === "weather")!.about).not.toMatch(/MeteoAlarm/);
  });

  it("offers the smallest region round Home and the smallest edition in the language, and MeteoAlarm in Europe", () => {
    const france = suggestionsFor({ markers: home(48.85, 2.35), countries, presets, overview: undefined, entries });
    if (france.state !== "ready") throw new Error(france.state);
    expect(france.rows.find((row) => row.id === "language-fr")!.entry!.id).toBe("wiki-fr-mini");
    expect(france.rows.find((row) => row.id === "weather")!.about).toMatch(/MeteoAlarm/);
    const lakes = suggestionsFor({ markers: home(54.45, -3.1), countries, presets, overview: undefined, entries });
    if (lakes.state !== "ready") throw new Error(lakes.state);
    expect(lakes.rows[0]!.title).toBe("Map of Lake District");
  });

  it("adds the UK's own sources in the UK, after the worldwide ones", () => {
    const found = suggestionsFor({ markers: home(51.5, -0.12), countries, presets, overview: undefined, entries });
    if (found.state !== "ready") throw new Error(found.state);
    const ids = found.rows.map((row) => row.id);
    expect(ids.slice(0, 4)).toEqual(["map", "nearby", "radio", "weather"]);
    expect(found.rows.filter((row) => row.uk).map((row) => row.id)).toEqual(["uk-os-names", "uk-fsa", "uk-ea", "uk-met-office"]);
  });

  it("says what is already here", () => {
    const overview = {
      regions: [
        { tileType: "vector", bounds: [33, -5, 42, 5], maxZoom: 13 },
        { tileType: "terrain", bounds: [33, -5, 42, 5], maxZoom: 12 },
      ],
      places: [{ source: "geonames", dataset: "KE", countries: ["KE"] }],
      counts: { markers: 1, tracks: 0, places: 1 },
    } as never;
    const found = suggestionsFor({ markers: home(-1.29, 36.82), countries, presets, overview, entries });
    if (found.state !== "ready") throw new Error(found.state);
    expect(found.rows.filter((row) => row.done).map((row) => row.id)).toEqual(["map"]);
  });

  it("reads the languages of a country from GeoNames' list", () => {
    expect(countryLanguages("KE")).toEqual(["en", "sw"]);
    expect(countryLanguages("fr")[0]).toBe("fr");
    expect(countryLanguages("XX")).toEqual([]);
  });
});

describe("packs for Home's country", () => {
  const pack = (id: string, countries?: string[]): CatalogPack => ({
    id,
    name: id,
    description: "",
    entryIds: [],
    ...(countries ? { countries } : {}),
  });
  const packs = [pack("first-things"), pack("weather-in-britain", ["GB"]), pack("radio-us", ["US"]), pack("repair")];
  it("puts a country's own packs first there, and last elsewhere", () => {
    expect(packsFor(packs, "US").map((entry) => entry.id)).toEqual(["radio-us", "first-things", "repair", "weather-in-britain"]);
    expect(packsFor(packs, "KE").map((entry) => entry.id)).toEqual(["first-things", "repair", "weather-in-britain", "radio-us"]);
    expect(packsFor(packs, null).map((entry) => entry.id)).toEqual(["first-things", "repair", "weather-in-britain", "radio-us"]);
  });
});
