/**
 * Which published transmitter to tune to through a pass when the person has not chosen:
 * the one most people listen for. A transponder first (the linear one on FUNcube-1), then
 * a repeater or other transceiver, then a downlink that is not a beacon or telemetry, and
 * only then a beacon. Among equals, the order SatNOGS DB gives.
 */
import type { SatelliteTransmitter } from "@outpost/shared";

const QUIET = /beacon|telemetry|\btlm\b|\bcw\b/i;

function rank(transmitter: SatelliteTransmitter): number {
  const type = (transmitter.type ?? "").toLowerCase();
  if (type === "transponder") return 0;
  if (type === "transceiver") return 1;
  if (!QUIET.test(`${transmitter.description} ${transmitter.mode ?? ""}`)) return 2;
  return 3;
}

/** The transmitters with a downlink, the main one first. */
export function byMain(transmitters: SatelliteTransmitter[]): SatelliteTransmitter[] {
  return transmitters
    .filter((item) => item.downlinkLowHz !== null)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
}
