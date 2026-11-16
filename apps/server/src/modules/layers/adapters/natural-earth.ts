/**
 * Natural Earth: country outlines at 1:50 million, first-level divisions and populated
 * places at 1:10 million. Public domain. Fetched as GeoJSON from the project's own
 * repository at a fixed release, so the same request always gets the same file; the
 * chosen countries are kept from it.
 */
import type { ReferenceEstimateItem, ReferenceLayerId } from "@outpost/shared";
import { PermanentJobError } from "../../../core/jobs.ts";
import { boxOfCountries } from "../countries.ts";
import { PROVIDERS } from "../providers.ts";
import type { AdapterDeps, ReferenceAdapter } from "../types.ts";
import { readGeoJsonFile, textProp } from "./geojson.ts";
import { headSize } from "./http.ts";

export const NATURAL_EARTH_VERSION = "5.1.2";
export const NATURAL_EARTH_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v${NATURAL_EARTH_VERSION}/geojson/`;

interface NeFile {
  key: string;
  layer: ReferenceLayerId;
  file: string;
  title: string;
  /** Read by HEAD on 16 November 2026. */
  bytes: number;
  /** Worked out by Outpost from the file it fetched on that day, where it did; the publisher gives none. */
  sha256?: string;
  accuracy: string;
  accuracyMeters: number;
}

export const NATURAL_EARTH_FILES: NeFile[] = [
  {
    key: "ne-countries",
    layer: "boundaries",
    file: "ne_50m_admin_0_countries.geojson",
    title: "Country boundaries (Natural Earth 1:50m)",
    bytes: 3_083_490,
    sha256: "3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb",
    accuracy: "Drawn at 1:50 million: outlines are simplified, by up to a few kilometres",
    accuracyMeters: 5_000,
  },
  {
    key: "ne-regions",
    layer: "regions",
    file: "ne_10m_admin_1_states_provinces.geojson",
    title: "Regions (Natural Earth 1:10m)",
    bytes: 40_726_851,
    accuracy: "Drawn at 1:10 million: outlines are simplified, by up to about a kilometre",
    accuracyMeters: 1_000,
  },
  {
    key: "ne-towns",
    layer: "towns",
    file: "ne_10m_populated_places.geojson",
    title: "Populated places (Natural Earth 1:10m)",
    bytes: 19_359_003,
    accuracy: "A point for the whole town, chosen for a 1:10 million map",
    accuracyMeters: 2_000,
  },
];

const provider = PROVIDERS.find((entry) => entry.id === "natural-earth")!;

export function createNaturalEarthAdapter({ client }: AdapterDeps): ReferenceAdapter {
  return {
    provider,
    async estimate(request, signal) {
      const wanted = request.layers?.length
        ? NATURAL_EARTH_FILES.filter((file) => request.layers!.includes(file.layer))
        : NATURAL_EARTH_FILES;
      const items: ReferenceEstimateItem[] = [];
      for (const file of wanted) {
        const url = NATURAL_EARTH_BASE + file.file;
        const head = await headSize(client, url, signal);
        items.push({
          key: file.key,
          title: file.title,
          layers: [file.layer],
          bytes: head.bytes ?? file.bytes,
          exact: head.bytes !== null,
          basis: head.bytes !== null ? "The size the publisher's server gives for the file." : "The size the file had on 16 November 2026.",
          records: null,
          host: new URL(url).host,
          replaces: null,
        });
      }
      const countries = request.scope.countries ?? [];
      return {
        items,
        notes: [
          countries.length > 0
            ? "The file is for the whole world; only the countries you chose are kept from it, and the file itself is kept so that it can be read again."
            : "The whole world is kept.",
        ],
      };
    },
    download(_request, item) {
      const file = NATURAL_EARTH_FILES.find((entry) => entry.key === item.key);
      if (!file) throw new PermanentJobError("That is not one of Natural Earth's files.");
      const url = NATURAL_EARTH_BASE + file.file;
      return {
        url,
        relPath: `collections/reference/natural-earth/${file.file.replace(/\.geojson$/, "")}-v${NATURAL_EARTH_VERSION}-${new Date().toISOString().slice(0, 10)}.geojson`,
        sizeBytes: file.bytes,
        ...(file.sha256 ? { sha256: file.sha256 } : {}),
        allowedHosts: [new URL(url).hostname],
        meta: { sourceUrl: "https://www.naturalearthdata.com/downloads/" },
      };
    },
    async read({ filePath, meta, sink }) {
      const file = NATURAL_EARTH_FILES.find((entry) => entry.key === meta.key);
      if (!file) throw new PermanentJobError("This download is not one of Natural Earth's files.");
      const keep = new Set(meta.countries.map((code) => code.toUpperCase()));
      const seen = new Set<string>();
      await readGeoJsonFile(filePath, {
        onSkip: (reason) => sink.skip(reason),
        async onFeature(feature) {
          const p = feature.properties;
          const code = (() => {
            const a2 = textProp(p, "ISO_A2_EH", "ISO_A2", "iso_a2");
            return a2 && a2 !== "-99" ? a2.toUpperCase() : null;
          })();
          if (keep.size > 0 && (!code || !keep.has(code))) return;
          let name: string;
          let kind: string;
          let sourceId: string;
          const props: Record<string, string> = {};
          if (file.layer === "boundaries") {
            name = textProp(p, "NAME_EN", "NAME", "ADMIN");
            kind = "ne:country";
            sourceId = `admin0:${textProp(p, "ADM0_A3", "ISO_A3") || name}`;
            props.formal_name = textProp(p, "FORMAL_EN");
            props.sovereign = textProp(p, "SOVEREIGNT");
          } else if (file.layer === "regions") {
            name = textProp(p, "name_en", "name");
            kind = `ne:region:${textProp(p, "type_en") || "Region"}`;
            sourceId = `admin1:${textProp(p, "adm1_code", "iso_3166_2") || name}`;
            props.iso_3166_2 = textProp(p, "iso_3166_2");
            props.local_name = textProp(p, "name_local", "name");
          } else {
            name = textProp(p, "NAME", "NAMEASCII");
            const featureClass = textProp(p, "FEATURECLA");
            kind = /admin-0 capital/i.test(featureClass) ? "ne:capital" : "ne:populated-place";
            sourceId = `place:${textProp(p, "ne_id", "GEONAMEID") || `${name}:${feature.lat}:${feature.lon}`}`;
            props.population_estimate = textProp(p, "POP_MAX");
            props.feature_class = featureClass;
            props.region = textProp(p, "ADM1NAME");
          }
          if (!name) {
            sink.skip("A feature without a name was left out.");
            return;
          }
          if (seen.has(sourceId)) return;
          seen.add(sourceId);
          for (const key of Object.keys(props)) if (!props[key]) delete props[key];
          await sink.add({
            sourceId,
            layer: file.layer,
            kind,
            name,
            altNames: textProp(p, "NAME_LONG", "name_alt", "NAMEALT")
              .split("|")
              .filter((alt) => alt && alt !== name)
              .join(","),
            country: code,
            lat: feature.lat,
            lon: feature.lon,
            bbox: feature.bbox,
            geometry: feature.geometry,
            props,
            provenance: "public-infrastructure",
            accuracy: file.accuracy,
            accuracyMeters: file.accuracyMeters,
            publisher: provider.publisher,
            license: provider.license,
            sourceUrl: "https://www.naturalearthdata.com/downloads/",
            publishedAt: `v${NATURAL_EARTH_VERSION} (2022-05-13)`,
          });
        },
      });
      return { version: `v${NATURAL_EARTH_VERSION}`, publishedAt: "2022-05-13", countries: [...keep], bbox: boxOfCountries([...keep]) };
    },
  };
}
