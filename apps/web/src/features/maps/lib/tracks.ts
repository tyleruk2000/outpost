/** Words for a track's figures, shared by the routes list, the import result and search. */
import type { TrackDto } from "@outpost/shared";
import { formatDate, plural } from "@/lib/utils";
import { formatDistance, formatDistanceWithMiles, formatHeight } from "./geo";

/** "17.4 km, 1,046 m of ascent" for a list row. */
export function trackSummary(track: Pick<TrackDto, "distanceMeters" | "ascentMeters">): string {
  const distance = formatDistance(track.distanceMeters);
  return track.ascentMeters === null ? distance : `${distance}, ${formatHeight(track.ascentMeters)} of ascent`;
}

export interface TrackFact {
  label: string;
  value: string;
}

/**
 * The facts shown for one track: distance with miles, ascent (or its absence, said
 * plainly), points. A drawn route has no file to lack heights: it lacks them because no
 * terrain is installed where it runs. A track recorded on the map lacks them when the
 * device that recorded it reported none.
 */
export function trackFacts(
  track: Pick<TrackDto, "distanceMeters" | "ascentMeters" | "pointCount">,
  options: { drawn?: boolean; recorded?: boolean } = {},
): TrackFact[] {
  const noHeights = options.drawn
    ? "Not known: no terrain installed here"
    : options.recorded
      ? "No heights from the device that recorded it"
      : "No heights in this file";
  return [
    { label: "Distance", value: formatDistanceWithMiles(track.distanceMeters) },
    { label: "Ascent", value: track.ascentMeters === null ? noHeights : formatHeight(track.ascentMeters) },
    { label: "Points", value: plural(track.pointCount, "point") },
  ];
}

/** "20261114" as "14 Nov 2026"; anything else as it came. */
export function formatBuild(build: string | null): string | null {
  if (!build) return null;
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(build);
  if (!match) return build;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(time) ? build : formatDate(time);
}
