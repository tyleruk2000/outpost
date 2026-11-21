/**
 * Heard on the radio: what the household's receivers hear (APRS stations, aircraft and
 * ships), read from a decoder's network port. Outpost only listens: it never sends on any
 * of these paths. Each source has the same shape: a receiver (an address and a port),
 * whether it is connected and when the last packet came, the stations heard, kept until a
 * person clears them.
 *
 * Units throughout: speed in knots, course and heading in degrees from true north,
 * altitude in metres, times in milliseconds since 1970.
 */
import type { SettingRight } from "./common.ts";

/** The kinds of receiver Outpost reads. Mesh radios report through the mesh link and are listed with these. */
export const RECEIVER_KINDS = ["aprs", "adsb", "ais"] as const;
export type ReceiverKind = (typeof RECEIVER_KINDS)[number];

/** Every source of what is heard, in the order the map lists them. */
export const HEARD_SOURCE_IDS = ["mesh", "aprs", "adsb", "ais"] as const;
export type HeardSourceId = (typeof HEARD_SOURCE_IDS)[number];

export const HEARD_SOURCE_NAMES: Record<HeardSourceId, string> = {
  mesh: "Mesh radios",
  aprs: "APRS",
  adsb: "Aircraft",
  ais: "Ships",
};

/** What each kind of receiver reads, and the port its usual decoder offers it on. */
export const RECEIVER_FORMATS: Record<ReceiverKind, { format: string; port: number; udp: boolean }> = {
  // Dire Wolf's KISS TCP port (its user guide: KISSPORT, 8001 by default).
  aprs: { format: "KISS over TCP", port: 8001, udp: false },
  // The BaseStation (SBS) text port that dump1090 and readsb offer (30003 by default).
  adsb: { format: "BaseStation (SBS) text", port: 30003, udp: false },
  // NMEA sentences (!AIVDM); AIS-catcher's TCP server (-S) has no fixed port; 10110 is rtl-ais's default and the one the guide uses.
  ais: { format: "NMEA sentences (!AIVDM)", port: 10110, udp: true },
};

export type ReceiverTransport = "tcp" | "udp";

/** Body of `POST /api/heard/receivers` and `PUT /api/heard/receivers/:id`. */
export interface HeardReceiverInput {
  kind: ReceiverKind;
  name: string;
  /** For TCP, the decoder's address; for UDP, the one address datagrams are taken from. */
  host: string;
  /** For TCP, the decoder's port; for UDP, the port Outpost listens on. */
  port: number;
  transport: ReceiverTransport;
  enabled: boolean;
}

export type ReceiverState = "off" | "connecting" | "connected" | "listening" | "away";

export interface ReceiverStatus {
  state: ReceiverState;
  /** When the state last changed. */
  since: number | null;
  /** When the last packet of any kind came. */
  lastPacketAt: number | null;
  /** Since Outpost started: packets read, those with a position, those that could not be read, and datagrams from another address. */
  packets: number;
  positions: number;
  malformed: number;
  refused: number;
  lastError: string | null;
  retryAt: number | null;
}

export interface HeardReceiver extends HeardReceiverInput {
  id: string;
  createdAt: number;
  status: ReceiverStatus;
}

export interface AprsWeather {
  /** Degrees, the direction the wind blows from. */
  windDirection: number | null;
  /** Knots, sustained over a minute, and the peak gust over five minutes. */
  windSpeed: number | null;
  windGust: number | null;
  temperatureC: number | null;
  /** Millimetres of rain in the last hour, the last 24 hours, and since midnight. */
  rain1hMm: number | null;
  rain24hMm: number | null;
  rainMidnightMm: number | null;
  humidity: number | null;
  /** Hectopascals (millibars), as the station sends it. */
  pressureHpa: number | null;
}

export interface ShipDetails {
  mmsi: string;
  /** "vessel", a base station on shore, or an aid to navigation (a buoy, a light). */
  kind: "vessel" | "base" | "aid";
  /** "A" or "B" for a vessel, by the reports it sends. */
  aisClass: "A" | "B" | null;
  callsign: string | null;
  imo: number | null;
  shipType: number | null;
  typeWords: string | null;
  lengthM: number | null;
  beamM: number | null;
  draughtM: number | null;
  destination: string | null;
  status: string | null;
  heading: number | null;
}

export interface AircraftDetails {
  icao: string;
  squawk: string | null;
  onGround: boolean | null;
  /** Feet per minute, as SBS gives it. */
  verticalRate: number | null;
}

export interface HeardDetails {
  weather?: (AprsWeather & { at: number }) | null;
  ship?: ShipDetails;
  aircraft?: AircraftDetails;
  /** An APRS object or item: the station that sent it. */
  sentBy?: string | null;
  /** An APRS object or item its sender has taken off the map. */
  killed?: boolean;
  mesh?: { hops: number | null; snr: number | null; rssi: number | null };
}

export interface HeardStation {
  id: string;
  source: HeardSourceId;
  /** The callsign, the aircraft's hex code, or the ship's MMSI. */
  key: string;
  /** The name to show: a callsign, a flight number, a ship's name; the key when there is none. */
  name: string;
  /** What it is in words: "Car", "Weather station", "Cargo ship", "Aircraft". */
  kindWords: string | null;
  /** APRS symbol: its table and code, two characters. */
  symbol: string | null;
  receiverId: string | null;
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  course: number | null;
  speed: number | null;
  comment: string | null;
  /** Heard straight from the station, or through a digipeater (`via` names it when known). */
  direct: boolean;
  via: string | null;
  firstAt: number;
  /** When it was last heard, and when its last position was. */
  lastAt: number;
  positionAt: number | null;
  reports: number;
  /** One of the household's own: kept on top of the map, under the name given. */
  pinned: boolean;
  pinName: string | null;
  details: HeardDetails;
}

/** One position as it was heard: a point of a trail, and of the range view. */
export interface HeardReport {
  at: number;
  lat: number;
  lon: number;
  altitude: number | null;
  receiverId: string | null;
  direct: boolean;
  via: string | null;
  snr: number | null;
  rssi: number | null;
  hops: number | null;
}

export interface HeardSpace {
  stations: number;
  reports: number;
  /** Bytes the tables take in the database, as SQLite reports them; null where it cannot say. */
  bytes: number | null;
  bySource: Record<HeardSourceId, { stations: number; reports: number }>;
}

export interface HeardStationsResponse {
  stations: HeardStation[];
}

export interface HeardStationResponse {
  station: HeardStation;
  trail: HeardReport[];
}

export interface HeardReceiversResponse {
  receivers: HeardReceiver[];
  right: SettingRight;
  space: HeardSpace;
  /** Aircraft are many: keep only the last so many hours of them; 0 keeps them until cleared. */
  aircraftHours: number;
  /** The decoders on the Raspberry Pi Outpost runs on, when its installer set them up. */
  pi: PiDecodersStatus | null;
}

/** Body of `POST /api/heard/clear`: all of it, one source, older than a time, or both. */
export interface HeardClearInput {
  source?: HeardSourceId;
  /** Clear what was last heard before this time. */
  before?: number;
}

export interface HeardClearResponse {
  stations: number;
  reports: number;
}

/** Body of `PUT /api/heard/stations/:id/pin`. */
export interface HeardPinInput {
  pinned: boolean;
  name?: string | null;
}

/** `GET /api/heard/reports`: every position one receiver heard (or every receiver), for the range view. */
export interface HeardReportsResponse {
  reports: Array<HeardReport & { stationId: string; name: string; source: HeardSourceId }>;
  /** Cut at this many, the newest kept. */
  limited: boolean;
}

/** A range test kept by name: one station, one receiver, a time span. */
export interface RangeTest {
  id: string;
  name: string;
  receiverId: string | null;
  stationId: string | null;
  from: number;
  to: number;
  createdAt: number;
}

export type RangeTestInput = Omit<RangeTest, "id" | "createdAt">;

export interface RangeTestsResponse {
  tests: RangeTest[];
}

// ── Decoders on the Raspberry Pi Outpost runs on (deploy/pi/install.sh) ──

export const PI_DECODERS = ["direwolf", "readsb", "ais-catcher"] as const;
export type PiDecoder = (typeof PI_DECODERS)[number];

export interface PiDecoderStatus {
  id: PiDecoder;
  installed: boolean;
  running: boolean;
  /** The sound device or SDR chosen, as the helper names it. */
  device: string | null;
  /** The last lines the decoder wrote, for the audio level. */
  log: string[];
}

export interface PiDecodersStatus {
  /** When the helper last wrote what it knows. */
  at: number | null;
  decoders: PiDecoderStatus[];
  /** Sound devices and SDRs the helper found on the Pi. */
  devices: Array<{ id: string; name: string; kind: "sound" | "sdr" }>;
  /** A request left for the helper that it has not answered yet. */
  pending: boolean;
  lastError: string | null;
}

/** Body of `POST /api/heard/pi`: switch one decoder on or off, with the device it uses. */
export interface PiDecoderInput {
  decoder: PiDecoder;
  action: "start" | "stop" | "refresh";
  device?: string | null;
}

/** The furthest-heard outline of a range view: the furthest direct report in each sector of the compass. */
export const RANGE_SECTORS = 36;
