/**
 * The credit a found route carries: who the data belongs to, under what licence, which
 * element of OpenStreetMap it is, and when and from where it was fetched.
 *
 * What the licence asks, read on 16 November 2026 (see docs/sources.md): a route's
 * points kept as data (in Outpost's database, in a GPX file) are an extract of the
 * OpenStreetMap database, so they stay under the Open Database Licence and the notice
 * must stay with them (ODbL 1.0, section 4.2). A map drawn with the route on it is a
 * "produced work", which needs a notice that it contains information from
 * OpenStreetMap under that licence whenever it is shown to other people (section 4.3).
 * So the notice is stored with the route, written into its description (which every
 * program that reads GPX keeps), written into the fields GPX has for copyright and
 * source, and handed to the map's credits.
 */
import type { FoundRouteRef, TrackSource } from "@outpost/shared";
import { OSM_CREDIT } from "./sources.ts";

/** "2026-11-16T10:20:30.000Z" as "16 November 2026", in UTC so the words do not depend on the server's time zone. */
export function longDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(time);
}

export function buildTrackSource(input: {
  ref: FoundRouteRef;
  name: string;
  wayIds: number[];
  server: string;
  dataAsOf: string | null;
  fetchedAt: Date;
}): TrackSource {
  const relationId = input.ref.type === "relation" ? input.ref.id : null;
  const ways = input.wayIds.length;
  return {
    provider: "openstreetmap",
    attribution: OSM_CREDIT.attribution,
    license: OSM_CREDIT.license,
    licenseUrl: OSM_CREDIT.licenseUrl,
    creditUrl: OSM_CREDIT.url,
    url: relationId === null ? null : `https://www.openstreetmap.org/relation/${relationId}`,
    element: relationId === null ? `${ways} ${ways === 1 ? "way" : "ways"} named ${input.name}` : `relation ${relationId}`,
    relationId,
    // Enough to find the path again; a long path's full list would only swell the row.
    wayIds: relationId === null ? input.wayIds.slice(0, 500) : [],
    fetchedAt: input.fetchedAt.toISOString(),
    dataAsOf: input.dataAsOf,
    server: input.server,
  };
}

/** One sentence that says it all, for a route's description and for the `<src>` of its GPX track. */
export function creditLine(source: TrackSource): string {
  return `From OpenStreetMap (${source.element}), fetched ${longDate(source.fetchedAt)} from ${source.server}. ${source.attribution}, ${source.license}: ${source.creditUrl}`;
}

export interface GpxCredit {
  /** `<copyright author>`, `<year>` and `<license>` of the file's metadata. */
  copyright: { author: string; year: string; license: string };
  /** `<link>` of the file's metadata: where the credit is explained. */
  link: { href: string; text: string };
  /** `<src>` of the track: where its points came from. */
  src: string;
  /** `<link>` of the track: the route's own page, when it has one. */
  trackLink: { href: string; text: string } | null;
}

export function gpxCredit(source: TrackSource): GpxCredit {
  return {
    // GPX puts the © itself in front of the author when it is shown.
    copyright: { author: source.attribution.replace(/^©\s*/, ""), year: source.fetchedAt.slice(0, 4), license: source.licenseUrl },
    link: { href: source.creditUrl, text: `${source.attribution}, ${source.license}` },
    src: creditLine(source),
    trackLink: source.url ? { href: source.url, text: `OpenStreetMap ${source.element}` } : null,
  };
}
