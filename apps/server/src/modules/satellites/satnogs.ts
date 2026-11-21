/**
 * SatNOGS DB's transmitter list (`/api/transmitters/?format=json`), read as LogBook73's
 * parser read it, with the uplink, the type and the inversion kept as well, so that a
 * transponder's up and down frequencies can both be corrected for Doppler. Only the
 * satellites whose elements are kept are read; anything malformed is left out.
 */
import type { SatelliteTransmitter } from "@outpost/shared";

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
