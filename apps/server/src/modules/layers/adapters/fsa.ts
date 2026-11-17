/**
 * The Food Standards Agency's list of registered food businesses (the food hygiene rating
 * data), for the food and supplies layer: retailers only, in the UK, under the Open
 * Government Licence.
 *
 * The Agency's API ("free … no need to register", read on 17 November 2026) answers a
 * search by centre and distance in miles, by business type, a page at a time. Outpost asks
 * it on a person's press: while estimating, once per business type with a page of one, for
 * the count (`meta.totalCount`); then, for each type, one page of up to `PAGE_SIZE`. The
 * circle asked about holds the box on screen, and only businesses inside the box are kept.
 * Measured on 17 November 2026: a page of 309 "Retailers - other" within 10 miles of
 * Bedford was 243 kB (about 790 bytes a business) and came in 0.19 s; a page size of 5,000
 * was accepted. The Agency says a page "maybe capped by the system", so a page that holds
 * fewer than it should is said on the pack.
 *
 * Its hygiene ratings are not kept or shown: they are not what the layer is for, and the
 * Agency has rules for showing them.
 */
import fs from "node:fs";
import type { Bbox } from "@outpost/shared";
import { AppError, badRequest } from "../../../core/errors.ts";
import { USER_AGENT } from "../../../core/http.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { PROVIDERS } from "../providers.ts";
import { QUERY_FETCHER, type QuerySpec } from "../query-fetcher.ts";
import type { AdapterDeps, ReferenceAdapter } from "../types.ts";
import { FSA_BUSINESS_TYPES } from "./food-tags.ts";
import { fetchText } from "./http.ts";
import { cleanText } from "./osm-tags.ts";
import { foodAreaRefusal } from "./overpass.ts";

export const FSA_API_URL = "https://api.ratings.food.gov.uk";
/** The UK, roughly: an area that misses it is not asked about. */
export const UK_EXTENT: Bbox = [-8.7, 49.8, 1.8, 60.9];
export const PAGE_SIZE = 5_000;
/** Bytes a business took in the answer measured on 17 November 2026. */
const BYTES_PER_BUSINESS = 800;
const MILES = 1609.344;
const HEADERS = { "x-api-version": "2" };

const provider = PROVIDERS.find((entry) => entry.id === "fsa")!;

const round = (value: number, places: number) => Number(value.toFixed(places));

/** The centre of a box and the distance in miles from it to its corners, rounded up, for the Agency's search by distance. */
export function circleAround(bbox: Bbox): { lat: number; lon: number; miles: number } {
  const lat = (bbox[1] + bbox[3]) / 2;
  const lon = (bbox[0] + bbox[2]) / 2;
  const dy = ((bbox[3] - bbox[1]) / 2) * 111_320;
  const dx = ((bbox[2] - bbox[0]) / 2) * 111_320 * Math.cos((lat * Math.PI) / 180);
  return { lat: round(lat, 5), lon: round(lon, 5), miles: Math.max(1, Math.ceil(Math.hypot(dx, dy) / MILES)) };
}

const boxKey = (bbox: Bbox) => bbox.map((value) => value.toFixed(3)).join(",");

export function createFsaAdapter({ ctx, client }: AdapterDeps): ReferenceAdapter {
  const base = (ctx.config.fsaUrl ?? FSA_API_URL).replace(/\/$/, "");
  const host = new URL(base).hostname;
  const searchUrl = (bbox: Bbox, type: number, pageSize: number) => {
    const circle = circleAround(bbox);
    return `${base}/Establishments?latitude=${circle.lat}&longitude=${circle.lon}&maxDistanceLimit=${circle.miles}&businessTypeId=${type}&pageNumber=1&pageSize=${pageSize}`;
  };
  // Supermarkets first, then the other shops.
  const types = [7840, 4613].map((id) => ({ id, ...FSA_BUSINESS_TYPES[id]! }));

  const boxOf = (bbox: Bbox | undefined): Bbox => {
    if (!bbox) throw badRequest("The Food Standards Agency's list is fetched for the area on screen: choose “The area on screen”.");
    const refusal = foodAreaRefusal([], bbox);
    if (refusal) throw badRequest(refusal);
    const [west, south, east, north] = bbox;
    if (east <= UK_EXTENT[0] || west >= UK_EXTENT[2] || north <= UK_EXTENT[1] || south >= UK_EXTENT[3])
      throw badRequest("The Food Standards Agency lists businesses in the United Kingdom only, and this area is outside it.");
    return bbox;
  };

  return {
    provider,
    async estimate(request, signal) {
      const bbox = boxOf(request.scope.bbox);
      const items = [];
      for (const type of types) {
        let total: number;
        try {
          const text = await fetchText(client, searchUrl(bbox, type.id, 1), {
            max: 1_000_000,
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
            headers: { ...HEADERS, accept: "application/json" },
          });
          total = Number((JSON.parse(text) as { meta?: { totalCount?: unknown } }).meta?.totalCount);
        } catch (error) {
          if (error instanceof SyntaxError) throw new AppError("upstream", `${host} did not answer with the list's JSON.`);
          throw error;
        }
        if (!Number.isFinite(total)) throw new AppError("upstream", `${host} did not say how many businesses there are.`);
        if (total > PAGE_SIZE)
          throw badRequest(
            `The Agency lists ${total.toLocaleString("en-GB")} “${type.name}” round this area, more than the ${PAGE_SIZE.toLocaleString("en-GB")} Outpost asks for at once. Zoom in and fetch it in parts.`,
          );
        if (total === 0) continue;
        items.push({
          key: `fsa:${type.id}:${boxKey(bbox)}`,
          title: `${type.kind === "food:supermarket" ? "Supermarkets" : "Other shops selling food"} (Food Standards Agency): the area drawn`,
          layers: ["food" as const],
          bytes: Math.max(1_000, total * BYTES_PER_BUSINESS),
          exact: false,
          basis: `${total.toLocaleString("en-GB")} businesses of the type “${type.name}” within ${circleAround(bbox).miles} miles of the middle of the area, as the Agency counts them, at about 800 bytes each. Only those inside the area are kept.`,
          records: total,
          host,
          replaces: null,
        });
      }
      return {
        items,
        notes: [
          "Businesses registered with their council as selling food, from the Food Standards Agency (UK). Retailers only: not restaurants, cafés or takeaways. Hygiene ratings are not kept or shown.",
          "A business in both this list and OpenStreetMap is shown once, with both sources on its card, when their names agree and they are close; when Outpost is unsure, both are shown.",
        ],
      };
    },
    download(request, item) {
      const bbox = boxOf(request.scope.bbox);
      const type = types.find((entry) => item.key === `fsa:${entry.id}:${boxKey(bbox)}`);
      if (!type) throw badRequest("That item is not part of this request any more. Estimate again.");
      const url = searchUrl(bbox, type.id, PAGE_SIZE);
      const query: QuerySpec = {
        method: "GET",
        url,
        accept: "application/json",
        maxBytes: 64 * 1048576,
        userAgent: USER_AGENT,
        headers: HEADERS,
      };
      return {
        url,
        fetcher: QUERY_FETCHER,
        relPath: `collections/reference/fsa/fsa-${type.id}-${bbox.map((value) => value.toFixed(3)).join("_")}-${new Date().toISOString().slice(0, 23).replace(/[:.]/g, "-")}.json`,
        sizeBytes: item.bytes,
        allowedHosts: [host],
        meta: { sourceUrl: "https://ratings.food.gov.uk/open-data", countries: ["GB"], bbox, layers: ["food"], query } as never,
      };
    },
    async read({ filePath, meta, sink, retrievedAt }) {
      let body: { meta?: { extractDate?: unknown; totalCount?: unknown; itemCount?: unknown }; establishments?: unknown[] };
      try {
        body = JSON.parse(await fs.promises.readFile(filePath, "utf8")) as typeof body;
      } catch {
        throw new PermanentJobError("The answer from the Food Standards Agency is not JSON. Remove the download and try again.");
      }
      if (!Array.isArray(body.establishments))
        throw new PermanentJobError("The answer from the Food Standards Agency holds no businesses.");
      const fetched = new Date(retrievedAt).toISOString().slice(0, 10);
      const extract = typeof body.meta?.extractDate === "string" ? body.meta.extractDate.slice(0, 10) : null;
      const box = meta.bbox;
      let outside = 0;
      for (const raw of body.establishments) {
        const entry = raw as Record<string, unknown> & { geocode?: { latitude?: unknown; longitude?: unknown } | null };
        const id = Number(entry.FHRSID);
        const type = FSA_BUSINESS_TYPES[Number(entry.BusinessTypeID)];
        const name = cleanText(entry.BusinessName);
        if (!Number.isInteger(id) || id <= 0) {
          sink.skip("A business without its Agency number was left out.");
          continue;
        }
        if (!type) {
          sink.skip(`${name || id}: its business type (${cleanText(entry.BusinessType) || "none"}) is not a retailer, so it was left out.`);
          continue;
        }
        const lat = Number(entry.geocode?.latitude);
        const lon = Number(entry.geocode?.longitude);
        if (
          entry.geocode?.latitude == null ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lon) ||
          Math.abs(lat) > 90 ||
          Math.abs(lon) > 180
        ) {
          sink.skip(`${name || id} has no position in the Agency's list.`);
          continue;
        }
        if (box && (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3])) {
          outside += 1;
          continue;
        }
        const props: Record<string, string> = {};
        for (const key of [
          "BusinessName",
          "BusinessType",
          "AddressLine1",
          "AddressLine2",
          "AddressLine3",
          "AddressLine4",
          "PostCode",
          "LocalAuthorityName",
        ]) {
          const value = cleanText(entry[key]);
          if (value) props[key] = value;
        }
        props.FHRSID = String(id);
        await sink.add({
          sourceId: String(id),
          layer: "food",
          kind: type.kind,
          name: name || type.name,
          altNames: "",
          country: "GB",
          lat,
          lon,
          bbox: null,
          geometry: null,
          props,
          provenance: "public-infrastructure",
          accuracy: "The position the Agency publishes for the business's address; it can be that of the postcode rather than the shop",
          accuracyMeters: null,
          publisher: provider.publisher,
          license: "Open Government Licence v3.0",
          sourceUrl: `https://ratings.food.gov.uk/business/${id}`,
          publishedAt: extract ?? fetched,
        });
      }
      if (sink.count === 0 && outside > 0)
        throw new PermanentJobError("None of the businesses the Agency sent is inside the area asked about.");
      const notes: string[] = [];
      const total = Number(body.meta?.totalCount);
      if (Number.isFinite(total) && total > body.establishments.length)
        notes.push(
          `The Agency counted ${total.toLocaleString("en-GB")} but sent ${body.establishments.length.toLocaleString("en-GB")}: some may be missing. Fetch a smaller area to get them all.`,
        );
      if (outside > 0) notes.push(`${outside.toLocaleString("en-GB")} businesses round the area but outside it were not kept.`);
      return { version: extract ?? fetched, publishedAt: extract ?? fetched, countries: ["GB"], bbox: meta.bbox, notes };
    },
  };
}
