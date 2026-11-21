/**
 * The range view (outpost-ywbh.8): from every position one receiver heard, the furthest
 * heard in each direction from Home, joined into an outline of where it heard from, and
 * the furthest single report. Only reports heard directly count towards the outline; those
 * that came through a digipeater are kept apart, with the digipeater's callsign. A mesh
 * report that says it came through other radios (hops) is kept apart too; one that does
 * not say is drawn and counted as unknown, since hops cannot always be told apart.
 *
 * What it is not: an outline of where this receiver heard these radios on these days, not
 * a promise of coverage.
 */
import { type HeardReportsResponse, haversineMeters, initialBearingDeg, RANGE_SECTORS } from "@outpost/shared";

export type RangeReport = HeardReportsResponse["reports"][number];

export interface RangeResult {
  /** The outline, closed, as [lon, lat]; empty with fewer than three directions heard. */
  outline: Array<[number, number]>;
  furthest: (RangeReport & { meters: number; bearing: number }) | null;
  direct: RangeReport[];
  /** Reports that came through a digipeater, by its callsign ("" where it gave none). */
  via: Map<string, RangeReport[]>;
  /** Mesh reports whose hops were not said: they could have come through another radio. */
  unknownHops: number;
  sectorsHeard: number;
}

export function computeRange(reports: RangeReport[], home: { lat: number; lon: number }, sectors = RANGE_SECTORS): RangeResult {
  const direct: RangeReport[] = [];
  const via = new Map<string, RangeReport[]>();
  let unknownHops = 0;
  const best: Array<{ report: RangeReport; meters: number; bearing: number } | undefined> = new Array(sectors);
  let furthest: RangeResult["furthest"] = null;
  for (const report of reports) {
    // A mesh report whose hops were not said is drawn as direct, and counted apart: it may have come through another radio.
    const counts = report.source === "mesh" ? report.hops === 0 || report.hops === null : report.direct;
    if (report.source === "mesh" && report.hops === null) unknownHops += 1;
    if (!counts) {
      const key = report.via ?? "";
      via.set(key, [...(via.get(key) ?? []), report]);
      continue;
    }
    direct.push(report);
    const meters = haversineMeters(home.lat, home.lon, report.lat, report.lon);
    const bearing = initialBearingDeg(home, report);
    const sector = Math.floor((((bearing % 360) + 360) % 360) / (360 / sectors)) % sectors;
    if (!best[sector] || meters > best[sector]!.meters) best[sector] = { report, meters, bearing };
    if (!furthest || meters > furthest.meters) furthest = { ...report, meters, bearing };
  }
  const corners = best.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const outline: Array<[number, number]> =
    corners.length >= 3 ? [...corners.map((entry) => [entry.report.lon, entry.report.lat] as [number, number])] : [];
  if (outline.length > 0) outline.push(outline[0]!);
  return { outline, furthest, direct, via, unknownHops, sectorsHeard: corners.length };
}
