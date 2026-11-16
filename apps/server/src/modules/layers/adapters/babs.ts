/**
 * Switzerland's emergency meeting points (Notfalltreffpunkte), published by the Federal
 * Office for Civil Protection as one GeoJSON file in the Swiss LV95 grid. They are the
 * places people are told to go when telephones fail or in an emergency; each canton's
 * page about them is kept with the point.
 */
import { PermanentJobError } from "../../../core/jobs.ts";
import { countryOf } from "../countries.ts";
import { PROVIDERS } from "../providers.ts";
import type { AdapterDeps, ReferenceAdapter } from "../types.ts";
import { readGeoJsonFile, textProp } from "./geojson.ts";
import { headSize } from "./http.ts";

export const BABS_URL = "https://data.geo.admin.ch/ch.babs.notfalltreffpunkte/notfalltreffpunkte/notfalltreffpunkte.geojson";
/** Read by HEAD on 16 November 2026. */
const KNOWN_BYTES = 1_473_452;
const provider = PROVIDERS.find((entry) => entry.id === "babs")!;

export function createBabsAdapter({ client }: AdapterDeps): ReferenceAdapter {
  return {
    provider,
    async estimate(request, signal) {
      const countries = request.scope.countries ?? [];
      if (countries.length > 0 && !countries.includes("CH")) {
        return { items: [], notes: ["This list covers Switzerland only. Choose Switzerland to get it."] };
      }
      const head = await headSize(client, BABS_URL, signal);
      return {
        items: [
          {
            key: "babs-meeting-points",
            title: "Emergency meeting points, Switzerland (BABS)",
            layers: ["shelters"],
            bytes: head.bytes ?? KNOWN_BYTES,
            exact: head.bytes !== null,
            basis:
              head.bytes !== null
                ? "The size the publisher's server gives for today's file."
                : "The size the file had on 16 November 2026.",
            records: null,
            host: new URL(BABS_URL).host,
            replaces: null,
          },
        ],
        notes: ["Positions are given in the Swiss grid (LV95) and converted with swisstopo's published formulas, good to about a metre."],
      };
    },
    download() {
      return {
        url: BABS_URL,
        relPath: `collections/reference/babs/notfalltreffpunkte-${new Date().toISOString().slice(0, 10)}.geojson`,
        sizeBytes: KNOWN_BYTES,
        allowedHosts: [new URL(BABS_URL).hostname],
        meta: { sourceUrl: "https://www.babs.admin.ch/de/ntp", countries: ["CH"], bbox: countryOf("CH")?.bbox ?? null },
      };
    },
    async read({ filePath, sink, sourceDate }) {
      const { crs } = await readGeoJsonFile(filePath, {
        onSkip: (reason) => sink.skip(reason),
        async onFeature(feature) {
          const p = feature.properties;
          const id = textProp(p, "ntp-id");
          const building = textProp(p, "gebbezeichnung");
          const place = textProp(p, "ort", "gemeinde");
          if (!id) {
            sink.skip("A meeting point without its id was left out.");
            return;
          }
          const props: Record<string, string> = {
            id,
            address: [textProp(p, "strasse"), textProp(p, "nummer")].filter(Boolean).join(" "),
            postcode: textProp(p, "plz"),
            place,
            municipality: textProp(p, "gemeinde"),
            canton: textProp(p, "kanton"),
            canton_page: textProp(p, "linkkanton"),
            notes: textProp(p, "bemerkungen"),
          };
          for (const key of Object.keys(props)) if (!props[key]) delete props[key];
          await sink.add({
            sourceId: id,
            layer: "shelters",
            kind: "babs:meeting-point",
            name: [building, place].filter(Boolean).join(", ") || id,
            altNames: id,
            country: "CH",
            lat: feature.lat,
            lon: feature.lon,
            bbox: null,
            geometry: null,
            props,
            provenance: "public-infrastructure",
            accuracy: "As published, converted from the Swiss grid (LV95) to within about a metre",
            accuracyMeters: 1,
            publisher: provider.publisher,
            license: provider.license,
            sourceUrl: textProp(p, "linkbabs") || "https://www.babs.admin.ch/de/ntp",
            publishedAt: sourceDate,
          });
        },
      });
      if (sink.count === 0) throw new PermanentJobError("The file held no meeting points Outpost could use.");
      return {
        version: sourceDate,
        publishedAt: sourceDate,
        countries: ["CH"],
        bbox: countryOf("CH")?.bbox ?? null,
        extra: { crs: crs.name },
      };
    },
  };
}
