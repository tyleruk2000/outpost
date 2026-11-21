/**
 * Aircraft, from the BaseStation ("SBS") text a decoder such as readsb or dump1090 offers
 * on its port 30003. Chosen over Beast after reading both: Beast is the raw Mode S
 * frames in a binary wrapper (Jetvision's "Mode-S Beast: Data Output Formats"), which
 * would leave Outpost to decode Mode S and its compact position reporting itself; SBS
 * is the decoder's own decoded result, one line of text a message, with the position
 * already worked out.
 *
 * The fields, from "SBS BaseStation Article 4.2: Socket Data and BST files" (woodair.net,
 * read 21 November 2026): `MSG,<transmission type>,<session>,<aircraft>,<hex ident>,
 * <flight>,<date and time generated and logged x4>,<callsign>,<altitude>,<ground speed>,
 * <track>,<latitude>,<longitude>,<vertical rate>,<squawk>,<alert>,<emergency>,<SPI>,
 * <on ground>`. A message carries only what its type gives (1 the callsign, 3 the
 * position and altitude, 4 the speed, track and vertical rate, 5 and 6 the altitude and
 * squawk), so what is known of an aircraft is put together from several. Flags are -1
 * for true, 0 for false. Checked against what readsb 3.16 writes (test/heard-sbs.test.ts).
 */

export const MAX_SBS_LINE = 300;
const FEET = 0.3048;

export interface SbsUpdate {
  icao: string;
  callsign?: string;
  /** Metres. */
  altitude?: number;
  speed?: number;
  course?: number;
  lat?: number;
  lon?: number;
  verticalRate?: number;
  squawk?: string;
  onGround?: boolean;
}

const number = (text: string | undefined) => {
  if (!text || !/^-?\d+(\.\d+)?$/.test(text.trim())) return undefined;
  return Number(text);
};

/** One line, or why it is not an SBS message. Lines that are not "MSG" (a selection, a new aircraft) give null. */
export function parseSbs(raw: string): SbsUpdate | { error: string } | null {
  const line = raw.trim();
  if (!line) return null;
  if (line.length > MAX_SBS_LINE) return { error: "line too long" };
  const fields = line.split(",");
  if (fields[0] !== "MSG") return ["SEL", "ID", "AIR", "STA", "CLK"].includes(fields[0]!) ? null : { error: "not SBS" };
  if (fields.length < 22) return { error: "too few fields" };
  const type = Number(fields[1]);
  if (!Number.isInteger(type) || type < 1 || type > 8) return { error: "transmission type" };
  const icao = fields[4]!.trim().toUpperCase();
  // A hex ident of six digits; a "~" in front marks a non-ICAO address (TIS-B), kept as it is.
  if (!/^~?[0-9A-F]{6}$/.test(icao)) return { error: "hex ident" };
  const update: SbsUpdate = { icao };
  const callsign = fields[10]!.trim();
  if (callsign && /^[A-Z0-9 ]{1,8}$/i.test(callsign)) update.callsign = callsign.toUpperCase();
  const altitude = number(fields[11]);
  if (altitude !== undefined && altitude > -2000 && altitude < 100_000) update.altitude = altitude * FEET;
  const speed = number(fields[12]);
  if (speed !== undefined && speed >= 0 && speed < 5000) update.speed = speed;
  const course = number(fields[13]);
  if (course !== undefined && course >= 0 && course <= 360) update.course = course % 360;
  const lat = number(fields[14]);
  const lon = number(fields[15]);
  if (lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) {
    update.lat = lat;
    update.lon = lon;
  }
  const rate = number(fields[16]);
  if (rate !== undefined && Math.abs(rate) < 100_000) update.verticalRate = rate;
  const squawk = fields[17]!.trim();
  if (/^[0-7]{4}$/.test(squawk)) update.squawk = squawk;
  const ground = fields[21]!.trim();
  if (ground === "-1" || ground === "1") update.onGround = true;
  else if (ground === "0") update.onGround = false;
  return update;
}
