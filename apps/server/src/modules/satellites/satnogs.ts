/**
 * SatNOGS DB's transmitter list (`/api/transmitters/?format=json`), read as LogBook73's
 * parser read it, with the uplink, the type and the inversion kept as well, so that a
 * transponder's up and down frequencies can both be corrected for Doppler. Only the
 * satellites whose elements are kept are read; anything malformed is left out.
 *
 * And its satellite list (`/api/satellites/?format=json`): the facts it keeps of each
 * satellite, for the same satellites. Its images are not read.
 */
import type { SatelliteAbout, SatelliteTransmitter } from "@outpost/shared";

const hz = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null);
const text = (value: unknown, max = 200): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

export function parseSatnogsTransmitters(raw: unknown, wanted: ReadonlySet<number>): SatelliteTransmitter[] {
  if (!Array.isArray(raw)) throw new Error("SatNOGS DB's answer is not a list of transmitters.");
  const out: SatelliteTransmitter[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const noradId = Number(row.norad_cat_id);
    const id = text(row.uuid, 64);
    const description = text(row.description);
    if (!id || !description || !wanted.has(noradId) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      noradId,
      description,
      alive: row.alive === true,
      status: text(row.status, 40) ?? "unknown",
      type: text(row.type, 40),
      mode: text(row.mode, 60),
      uplinkLowHz: hz(row.uplink_low),
      uplinkHighHz: hz(row.uplink_high),
      downlinkLowHz: hz(row.downlink_low),
      downlinkHighHz: hz(row.downlink_high),
      invert: row.invert === true,
      baud: typeof row.baud === "number" && Number.isFinite(row.baud) ? row.baud : null,
      updatedAt: text(row.updated, 40),
    });
  }
  return out;
}

const date = (value: unknown): string | null => {
  const raw = text(value, 40);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
};

const webAddress = (value: unknown): string | null => {
  const raw = text(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};

/** "ZARYA, RS0ISS, NA1SS" into its names, leaving out blanks, repeats and the satellite's own name. */
function otherNames(value: unknown, own: string): string[] {
  const seen = new Set([own.toLowerCase()]);
  const out: string[] = [];
  for (const name of (text(value, 1000) ?? "").split(",")) {
    const trimmed = name.trim().slice(0, 100);
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    out.push(trimmed);
  }
  return out;
}

/** The satellites in SatNOGS DB's list whose elements are kept. Associated satellites are named from the whole list. */
export function parseSatnogsSatellites(raw: unknown, wanted: ReadonlySet<number>): SatelliteAbout[] {
  if (!Array.isArray(raw)) throw new Error("SatNOGS DB's answer is not a list of satellites.");
  const rows = raw.filter((value): value is Record<string, unknown> => !!value && typeof value === "object");
  const nameOf = new Map<string, string>();
  for (const row of rows) {
    const id = text(row.sat_id, 64);
    const name = text(row.name, 100);
    if (id && name) nameOf.set(id, name);
  }
  const out: SatelliteAbout[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const noradId = Number(row.norad_cat_id);
    const name = text(row.name, 100);
    if (row.norad_cat_id === null || !Number.isInteger(noradId) || !name || !wanted.has(noradId) || seen.has(noradId)) continue;
    seen.add(noradId);
    const operator = text(row.operator, 200);
    out.push({
      noradId,
      name,
      otherNames: otherNames(row.names, name),
      status: text(row.status, 40) ?? "unknown",
      launched: date(row.launched),
      deployed: date(row.deployed),
      decayed: date(row.decayed),
      website: webAddress(row.website),
      operator: operator && operator !== "None" ? operator : null,
      countries: [
        ...new Set(
          (text(row.countries, 200) ?? "")
            .split(",")
            .map((code) => code.trim().toUpperCase())
            .filter((code) => /^[A-Z]{2}$/.test(code)),
        ),
      ],
      citation: text(row.citation, 300),
      frequencyViolator: row.is_frequency_violator === true,
      associated: (Array.isArray(row.associated_satellites) ? row.associated_satellites : [])
        .map((id) => (typeof id === "string" ? nameOf.get(id) : undefined))
        .filter((found): found is string => found !== undefined),
    });
  }
  return out;
}
