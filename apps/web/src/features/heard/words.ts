/**
 * What Heard on the radio says, in one place: a receiver's state, how a report came,
 * the units each source is read in, and the distance and bearing from Home.
 */
import {
  HEARD_SOURCE_NAMES,
  type HeardReceiver,
  type HeardSourceId,
  type HeardStation,
  haversineMeters,
  initialBearingDeg,
  type ReceiverKind,
} from "@outpost/shared";
import { formatBearing, formatDistance } from "@/features/maps/lib/geo";
import { formatNumber, timeAgo } from "@/lib/utils";

/** Not yet tried with a real radio: said on every screen of this epic until the owner has (rule 8). */
export const UNTRIED = "Built against recorded packets and a stand-in decoder; not yet tried with a real radio.";

export const KIND_NAMES: Record<ReceiverKind, string> = { aprs: "APRS", adsb: "Aircraft (ADS-B)", ais: "Ships (AIS)" };

export const sourceName = (source: HeardSourceId) => HEARD_SOURCE_NAMES[source];

export function stateWords(receiver: HeardReceiver): string {
  const { status } = receiver;
  const where = receiver.transport === "udp" ? `port ${receiver.port}` : `${receiver.host}:${receiver.port}`;
  switch (status.state) {
    case "off":
      return "Switched off.";
    case "connecting":
      return `Connecting to ${where}…`;
    case "connected":
      return `Connected to ${where}.`;
    case "listening":
      return `Listening on port ${receiver.port} for ${receiver.host}.`;
    case "away":
      return `Not connected. ${status.lastError ?? ""}`.trim();
  }
}

export function lastPacketWords(receiver: HeardReceiver): string {
  const { status } = receiver;
  if (status.state === "off") return "";
  if (!status.lastPacketAt) return "Nothing has come from it since Outpost started.";
  const parts = [`Last packet ${timeAgo(status.lastPacketAt)}`, `${formatNumber(status.packets)} read`];
  if (status.positions) parts.push(`${formatNumber(status.positions)} with a position`);
  if (status.malformed) parts.push(`${formatNumber(status.malformed)} could not be read and were dropped`);
  if (status.refused) parts.push(`${formatNumber(status.refused)} from another address ignored`);
  return `${parts.join(", ")}.`;
}

/** Generic digipeater aliases: one marked as used says a digipeater passed it on, but not which. */
const GENERIC = /^(WIDE|RELAY|TRACE|RFONLY|NOGATE|TEMP|ECHO|GATE)\d*(-\d+)?$/;

/** How the report reached the receiver, for APRS; nothing for sources that are always heard directly. */
export function pathWords(station: Pick<HeardStation, "source" | "direct" | "via">): string | null {
  if (station.source !== "aprs") return null;
  if (station.direct) return "Heard directly";
  if (!station.via || GENERIC.test(station.via)) return "Heard through a digipeater that did not give its callsign";
  return `Heard through ${station.via}`;
}

export interface Home {
  lat: number;
  lon: number;
  name: string;
}

export function fromHome(home: Home | null, point: { lat: number | null; lon: number | null }): string | null {
  if (!home || point.lat === null || point.lon === null) return null;
  const meters = haversineMeters(home.lat, home.lon, point.lat, point.lon);
  if (meters < 30) return "At home";
  return `${formatDistance(meters)} ${formatBearing(initialBearingDeg(home, { lat: point.lat, lon: point.lon }))} from home`;
}

export const metersFromHome = (home: Home | null, point: { lat: number | null; lon: number | null }) =>
  home && point.lat !== null && point.lon !== null ? haversineMeters(home.lat, home.lon, point.lat, point.lon) : null;

/** Speed in the source's own terms: knots at sea and in the air; km/h with knots for APRS. */
export function speedWords(source: HeardSourceId, knots: number | null): string | null {
  if (knots === null) return null;
  if (source === "aprs" || source === "mesh") return `${Math.round(knots * 1.852)} km/h`;
  return `${Math.round(knots)} knots`;
}

/** Altitude: in feet for aircraft, as aviation gives it; in metres otherwise. */
export function altitudeWords(source: HeardSourceId, meters: number | null): string | null {
  if (meters === null) return null;
  if (source === "adsb") return `${formatNumber(Math.round(meters / 0.3048 / 25) * 25)} ft`;
  return `${formatNumber(Math.round(meters))} m up`;
}

export const courseWords = (degrees: number | null) => (degrees === null ? null : `heading ${formatBearing(degrees)}`);

export const displayName = (station: Pick<HeardStation, "name" | "pinName" | "pinned">) =>
  station.pinned && station.pinName ? station.pinName : station.name;
