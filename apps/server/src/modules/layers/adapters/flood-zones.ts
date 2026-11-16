/**
 * The Environment Agency's flood zones (Flood Map for Planning, Rivers and Sea: Flood
 * Zones 2 and 3), for England, under the Open Government Licence.
 *
 * The Agency publishes them through an OGC API Features service that answers by box,
 * in WGS 84 (`content-crs` CRS84) as GeoJSON. Outpost asks it twice, each on a person's
 * press: once with `limit=1` while estimating, for the count of areas in the box
 * (`numberMatched`), and once to download them all in one answer. Read on
 * 16 November 2026: a box about 7 km across round Bedford held 248 areas and came to
 * 4.6 MB (about 19 kB an area), answered in under half a second; a box 20 km by 17 km
 * was not answered within 90 seconds. Hence the limits below, which are Outpost's.
 *
 * Every area that touches the box comes whole, as the Agency says ("Some polygons may be
 * quite large and extend beyond the drawn area of interest"), so the size is "about".
 */
import { type Bbox, FLOOD_ZONE_WORDS } from "@outpost/shared";
import { AppError, badRequest } from "../../../core/errors.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { PROVIDERS } from "../providers.ts";
import type { AdapterDeps, ReferenceAdapter } from "../types.ts";
import { readGeoJsonFile, textProp } from "./geojson.ts";
import { fetchText } from "./http.ts";

/** The collection's address, as the service's own landing page gives it (data.gov.uk lists the `spatialdata/…` alias). */
export const FLOOD_ZONES_URL =
  "https://environment.data.gov.uk/geoservices/datasets/04532375-a198-476e-985e-0579a0a11b47/ogc/features/v1/collections/Flood_Zones_2_3_Rivers_and_Sea";
/** The collection's extent, as the service gives it. Boxes that miss it are not asked about. */
export const ENGLAND_EXTENT: Bbox = [-6.987, 49.881, 2.074, 55.811];
/** The largest box asked for: about 22 km north to south and 20 km east to west in the Midlands. */
export const MAX_FLOOD_BOX = { lat: 0.2, lon: 0.3 } as const;
/** The most areas taken in one pack; past this the box is too busy and must be smaller. */
export const MAX_FLOOD_AREAS = 5_000;
/** Bytes an area took on average in the box measured on 16 November 2026. */
const BYTES_PER_AREA = 19_000;

const provider = PROVIDERS.find((entry) => entry.id === "ea-flood-zones")!;

const round = (value: number) => Math.round(value * 1000) / 1000;
/** The box rounded outwards to a thousandth of a degree, as the key of the pack and in the address. */
export function floodBox(bbox: Bbox): Bbox {
  return [
    Math.floor(bbox[0] * 1000) / 1000,
    Math.floor(bbox[1] * 1000) / 1000,
    Math.ceil(bbox[2] * 1000) / 1000,
    Math.ceil(bbox[3] * 1000) / 1000,
  ];
}

/** Why a box cannot be asked for, or null. */
export function floodBoxRefusal(bbox: Bbox): string | null {
  const [west, south, east, north] = bbox;
  if (east <= ENGLAND_EXTENT[0] || west >= ENGLAND_EXTENT[2] || north <= ENGLAND_EXTENT[1] || south >= ENGLAND_EXTENT[3])
    return "Flood zones are published for England only, and this area is outside it.";
  if (north - south > MAX_FLOOD_BOX.lat || east - west > MAX_FLOOD_BOX.lon)
    return `The area on screen is too large to fetch flood zones for in one go (at most ${MAX_FLOOD_BOX.lat}° north to south and ${MAX_FLOOD_BOX.lon}° east to west, about 20 km across). Zoom in, then try again; several areas can be kept side by side.`;
  return null;
}

export function createFloodZonesAdapter({ ctx, client }: AdapterDeps): ReferenceAdapter {
  const base = ctx.config.floodZonesUrl ?? FLOOD_ZONES_URL;
  const itemsUrl = (bbox: Bbox, limit: number) =>
    `${base}/items?f=application%2Fgeo%2Bjson&bbox=${bbox.map(round).join("%2C")}&limit=${limit}`;
  const host = new URL(base).hostname;

  return {
    provider,
    async estimate(request, signal) {
      if (!request.scope.bbox) throw badRequest("Flood zones are fetched for the area on screen: choose “The area on screen”.");
      const bbox = floodBox(request.scope.bbox);
      const refusal = floodBoxRefusal(bbox);
      if (refusal) return { items: [], notes: [refusal] };
      let count: number | null = null;
      try {
        // One area at most comes back; the count of all of them is in `numberMatched`.
        const text = await fetchText(client, itemsUrl(bbox, 1), {
          max: 8 * 1024 * 1024,
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
          headers: { accept: "application/geo+json" },
        });
        const matched = (JSON.parse(text) as { numberMatched?: unknown }).numberMatched;
        count = typeof matched === "number" && Number.isFinite(matched) ? matched : null;
      } catch (error) {
        if (error instanceof SyntaxError) throw new AppError("upstream", `${host} did not answer with GeoJSON.`);
        if (error instanceof Error && error.name === "TimeoutError")
          throw new AppError("upstream", `${host} did not say how many flood areas there are within a minute. Try a smaller area.`);
        throw error;
      }
      if (count === 0)
        return { items: [], notes: ["The Environment Agency has no Flood Zone 2 or 3 in this area: all of it is in Flood Zone 1."] };
      if (count !== null && count > MAX_FLOOD_AREAS)
        return {
          items: [],
          notes: [
            `This area holds ${count.toLocaleString("en-GB")} flood areas, more than ${MAX_FLOOD_AREAS.toLocaleString("en-GB")}. Zoom in and fetch a smaller area.`,
          ],
        };
      const areas = count ?? 250;
      return {
        items: [
          {
            key: `flood-zones:${bbox.join(",")}`,
            title: `Flood zones, England, ${bbox[1].toFixed(3)}° to ${bbox[3].toFixed(3)}° N, ${bbox[0].toFixed(3)}° to ${bbox[2].toFixed(3)}° E`,
            layers: ["flood-zones"],
            bytes: areas * BYTES_PER_AREA,
            exact: false,
            basis:
              count === null
                ? "The service did not give a count; worked out for 250 areas at about 19 kB each."
                : `${count.toLocaleString("en-GB")} areas, as the service counts them, at about 19 kB each (the average measured on 16 November 2026). Areas that cross the edge come whole, so it can be more.`,
            records: count,
            host,
            replaces: null,
          },
        ],
        notes: [
          "England only. Flood Zones 2 and 3 from rivers and the sea, ignoring the benefits of defences.",
          `The Environment Agency: “${FLOOD_ZONE_WORDS.caveat.split(". ")[0]}.”`,
        ],
      };
    },
    download(request, item) {
      const bbox = floodBox(request.scope.bbox!);
      return {
        url: itemsUrl(bbox, MAX_FLOOD_AREAS),
        relPath: `collections/reference/flood-zones/flood-zones-${bbox.join("_")}-${new Date().toISOString().slice(0, 10)}.geojson`,
        sizeBytes: item.bytes,
        allowedHosts: [host],
        meta: { sourceUrl: provider.url, countries: ["GB"], bbox },
      };
    },
    async read({ filePath, sink, sourceDate, retrievedAt, meta }) {
      const fetched = new Date(retrievedAt).toISOString().slice(0, 10);
      await readGeoJsonFile(filePath, {
        onSkip: (reason) => sink.skip(reason),
        async onFeature(feature) {
          const p = feature.properties;
          const zone = textProp(p, "flood_zone").toUpperCase();
          if (zone !== "FZ2" && zone !== "FZ3") {
            sink.skip(`An area with flood zone “${zone || "none"}” was left out.`);
            return;
          }
          if (!feature.geometry) {
            sink.skip("A flood area without its outline was left out.");
            return;
          }
          const number = zone === "FZ3" ? "3" : "2";
          const source = textProp(p, "flood_source");
          const origin = textProp(p, "origin");
          const from = source === "river" ? "rivers" : source === "sea" ? "the sea" : source;
          await sink.add({
            sourceId: feature.id ?? `${zone}:${feature.lat.toFixed(6)},${feature.lon.toFixed(6)}`,
            layer: "flood-zones",
            kind: `ea:flood-zone-${number}`,
            name: `Flood Zone ${number}${from && from !== "unknown" ? `, from ${from}` : ""}`,
            altNames: "",
            country: "GB",
            lat: feature.lat,
            lon: feature.lon,
            bbox: feature.bbox,
            geometry: feature.geometry,
            props: Object.fromEntries(
              Object.entries({
                flood_zone: zone,
                flood_source: source,
                origin,
                definition: number === "3" ? FLOOD_ZONE_WORDS.zone3 : FLOOD_ZONE_WORDS.zone2,
                caveat: FLOOD_ZONE_WORDS.caveat,
              }).filter(([, value]) => value),
            ),
            provenance: "public-infrastructure",
            accuracy:
              "As the Environment Agency publishes it: an indication of flood risk to an area of land, not suitable for showing whether an individual property is at risk",
            accuracyMeters: null,
            publisher: provider.publisher,
            license: `${provider.license}. ${FLOOD_ZONE_WORDS.attribution}`,
            sourceUrl: provider.url,
            publishedAt: sourceDate ?? fetched,
          });
        },
      });
      if (sink.count === 0) throw new PermanentJobError("The answer held no Flood Zone 2 or 3 areas Outpost could use.");
      return { version: fetched, publishedAt: sourceDate ?? fetched, countries: ["GB"], bbox: meta.bbox };
    },
  };
}
