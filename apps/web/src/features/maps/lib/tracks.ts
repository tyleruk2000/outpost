/** Words for a track's figures, shared by the routes list, the import result and search. */
import { roadDurationText, type TrackDto } from "@outpost/shared";
import { naismithMinutes } from "@/features/tools/outdoors/formulas";
import { formatDate, plural } from "@/lib/utils";
import { formatDistance, formatDistanceWithMiles, formatHeight } from "./geo";

/** "17.4 km, 1,046 m of ascent" for a list row. */
export function trackSummary(track: Pick<TrackDto, "distanceMeters" | "ascentMeters">): string {
  const distance = formatDistance(track.distanceMeters);
  return track.ascentMeters === null ? distance : `${distance}, ${formatHeight(track.ascentMeters)} of ascent`;
}

/**
 * The time to walk it by Naismith's rule (5 km an hour, and a minute for every 10 m climbed):
 * "about 4 h 05 min". With no heights, the time on the flat, said as such.
 */
/** The time to walk a distance on the flat at Naismith's 5 km an hour: "3 h 22 min". */
export const flatWalk = (distanceMeters: number): string => roadDurationText(naismithMinutes(distanceMeters, 0).total * 60);

export function walkingTime(distanceMeters: number, ascentMeters: number | null): string {
  const time = roadDurationText(naismithMinutes(distanceMeters, ascentMeters ?? 0).total * 60);
  return ascentMeters === null ? `about ${time} on the flat; the climbing is not known` : `about ${time}`;
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
    // A walk's own question is how long it takes: Naismith's rule, worked out here rather than in another screen.
    { label: "Walking time", value: walkingTime(track.distanceMeters, track.ascentMeters) },
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
