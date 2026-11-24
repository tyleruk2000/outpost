/**
 * "About this satellite": a plain description built from facts only, from what SatNOGS
 * DB keeps of a satellite (names, launch, countries, status), what its kept orbital
 * elements say of the orbit, and what SatNOGS lists among its transmitters. Nothing is
 * said that one of those does not say.
 */
import { type OmmElements, orbitFacts, type SatelliteAbout, type SatelliteTransmitter } from "@outpost/shared";
import { appLocale } from "@/lib/region";
import { formatNumber } from "@/lib/utils";

/** "A", "A and B", "A, B and C". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Countries whose English names are said with "the". */
const WITH_THE = new Set(["US", "GB", "NL", "PH", "AE", "BS", "GM", "MV", "MH", "SB", "KY", "VA", "KM", "SC", "CF", "DO"]);

/** A country in words from its ISO code, in the English of this device's region: "the United States". */
export function countryWords(code: string): string {
  let name = code;
  try {
    name = new Intl.DisplayNames([appLocale()], { type: "region" }).of(code) ?? code;
  } catch {
    // An unknown code is given as it is.
  }
  return WITH_THE.has(code) ? `the ${name}` : name;
}

/** A day SatNOGS gives (midnight UTC) in words: "20 November 1998", or "November 20, 1998" in the United States. */
export function dayInWords(iso: string): string {
  return new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(Date.parse(iso));
}

const degrees = (value: number) => `${value.toFixed(1)}°`;
const km = (value: number) => `${formatNumber(Math.round(value / 10) * 10)} km`;

function periodWords(minutes: number): string {
  if (minutes < 120) return `every ${Math.round(minutes)} minutes`;
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `every ${hours} hours` : `every ${hours} h ${rest} min`;
}

/**
 * The orbit in words, from the kept elements: "about 420 km up, going round every 93
 * minutes at 51.6° to the equator, so it passes over places between 51.6° N and 51.6° S."
 */
export function orbitWords(elements: Pick<OmmElements, "MEAN_MOTION" | "ECCENTRICITY" | "INCLINATION">): string {
  const orbit = orbitFacts(elements);
  if (orbit.geostationary) {
    return `about ${km(orbit.meanHeightKm)} up, going round once a day as the Earth turns: it is geostationary, so it stays over one point on the equator.`;
  }
  const height =
    orbit.apogeeKm - orbit.perigeeKm > 200
      ? `between ${km(orbit.perigeeKm)} and ${km(orbit.apogeeKm)} up`
      : `about ${km(orbit.meanHeightKm)} up`;
  const way = orbit.retrograde ? ", against the way the Earth turns" : "";
  const band =
    orbit.latitudeReachDeg < 0.5
      ? "so it stays over the equator"
      : `so it passes over places between ${degrees(orbit.latitudeReachDeg)} N and ${degrees(orbit.latitudeReachDeg)} S`;
  const sun = orbit.sunSynchronous ? " Its orbit is sun-synchronous: it crosses each latitude at about the same local time every day." : "";
  return `${height}, going round ${periodWords(orbit.periodMinutes)} at ${degrees(orbit.inclinationDeg)} to the equator${way}, ${band}.${sun}`;
}

/** What one transmitter is, in words, or null when it is none of the kinds below. */
function kindOf(transmitter: SatelliteTransmitter): string | null {
  const mode = (transmitter.mode ?? "").toUpperCase();
  const text = `${transmitter.description} ${transmitter.mode ?? ""}`;
  const up = transmitter.uplinkLowHz !== null;
  if (transmitter.type === "Transponder" && up)
    return transmitter.invert || /SSB|USB|LSB|CW/.test(mode) ? "a linear transponder" : "a transponder";
  if (/APRS|DIGI/i.test(text) && up) return "an APRS digipeater";
  if (/APRS/i.test(text)) return "APRS";
  if (up && mode === "FM") return "an FM voice repeater";
  if (/SSTV/i.test(text)) return "SSTV pictures";
  if (mode === "APT" || mode === "LRPT" || mode === "HRPT") return `${mode} weather pictures`;
  if (/DVB|HAMTV/i.test(text)) return "digital television (DVB-S)";
  if (/beacon/i.test(text)) return mode === "CW" ? "a CW beacon" : "a beacon";
  if (/telemetry|\bTLM\b/i.test(text)) return "telemetry";
  return null;
}

const KIND_ORDER = [
  "a linear transponder",
  "a transponder",
  "an FM voice repeater",
  "an APRS digipeater",
  "APRS",
  "SSTV pictures",
  "APT weather pictures",
  "LRPT weather pictures",
  "HRPT weather pictures",
  "digital television (DVB-S)",
  "a CW beacon",
  "a beacon",
  "telemetry",
];

/**
 * What SatNOGS lists it as carrying, from the transmitters it lists as in use: "SatNOGS
 * DB lists 3 transmitters in use: an FM voice repeater, an APRS digipeater and a CW beacon."
 */
export function carriesWords(transmitters: readonly SatelliteTransmitter[]): string | null {
  const live = transmitters.filter((transmitter) => transmitter.alive);
  if (live.length === 0) return null;
  const kinds = live.map(kindOf);
  const named = KIND_ORDER.filter((kind) => kinds.includes(kind));
  const count = live.length === 1 ? "1 transmitter" : `${formatNumber(live.length)} transmitters`;
  if (named.length === 0) return `SatNOGS DB lists ${count} in use.`;
  const others = kinds.some((kind) => kind === null);
  return `SatNOGS DB lists ${count} in use${others ? ", among them" : ":"} ${listWords(named)}.`;
}

const plainName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * CelesTrak and SatNOGS DB give one catalogue number names with nothing in common: as
 * on 24 November 2026, CelesTrak called 53109 "GREENCUBE (IO-117)" and SatNOGS DB "MTCube
 * 2" (GREENCUBE is 53106). Either may have the wrong satellite under the number. False
 * when they share a name, or one begins another ("DIWATA-2" and "DIWATA-2B").
 */
export function namesDisagree(celestrakName: string, about: Pick<SatelliteAbout, "name" | "otherNames"> | null): boolean {
  if (!about || !celestrakName.trim()) return false;
  const bracketed = /^(.*?)\s*\((.+)\)\s*$/.exec(celestrakName);
  const theirs = [celestrakName, bracketed?.[1], bracketed?.[2]].map((name) => plainName(name ?? "")).filter((name) => name.length >= 2);
  const ours = [about.name, ...about.otherNames].map(plainName).filter((name) => name.length >= 2);
  if (theirs.length === 0 || ours.length === 0) return false;
  return !theirs.some((a) => ours.some((b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)))));
}

/** The description's sentences, in order. `transmitters` are this satellite's. */
export function aboutSentences(
  about: SatelliteAbout | null,
  elements: Pick<OmmElements, "MEAN_MOTION" | "ECCENTRICITY" | "INCLINATION"> | null,
  transmitters: readonly SatelliteTransmitter[],
): string[] {
  const out: string[] = [];
  if (about && about.otherNames.length > 0) out.push(`Also called ${listWords(about.otherNames)}.`);
  if (about) {
    const from = about.countries.length > 0 ? `from ${listWords(about.countries.map(countryWords))}` : null;
    const deployed = about.deployed && about.deployed.slice(0, 10) !== about.launched?.slice(0, 10) ? about.deployed : null;
    if (about.status === "future") {
      out.push(about.launched ? `Not launched yet; SatNOGS DB gives ${dayInWords(about.launched)} for its launch.` : "Not launched yet.");
      if (from) out.push(`${from[0]!.toUpperCase()}${from.slice(1)}.`);
    } else if (about.launched) {
      out.push(
        `Launched ${dayInWords(about.launched)}${from ? `, ${from}` : ""}${deployed ? `, and set free in orbit ${dayInWords(deployed)}` : ""}.`,
      );
    } else if (from) {
      out.push(`${from[0]!.toUpperCase()}${from.slice(1)}.`);
    }
    if (about.operator) out.push(`Run by ${about.operator}.`);
  }
  const reentered = about?.status === "re-entered";
  if (reentered)
    out.push(about?.decayed ? `It re-entered the atmosphere on ${dayInWords(about.decayed)}.` : "It has re-entered the atmosphere.");
  if (elements && !reentered && about?.status !== "future") {
    const words = orbitWords(elements);
    out.push(about?.status === "in orbit" ? `In orbit, ${words}` : `${words[0]!.toUpperCase()}${words.slice(1)}`);
  }
  const carries = carriesWords(transmitters);
  if (carries) out.push(carries);
  return out;
}
