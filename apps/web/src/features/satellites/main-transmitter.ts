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

export interface TransmitterGroup {
  id: "all" | "work" | "listen" | "quiet" | "uplink";
  /** Empty for "all", the one table of a satellite with few transmitters. */
  title: string;
  transmitters: SatelliteTransmitter[];
  /** Folded under its title, to be opened: the long lists of beacons and telemetry on a satellite like the ISS. */
  folded: boolean;
}

/** Up to this many, a satellite's transmitters are one table; more, and they are grouped by what each is for. */
export const ONE_TABLE_UP_TO = 10;

const sameRecord = (item: SatelliteTransmitter) =>
  JSON.stringify([
    item.description.trim().toLowerCase(),
    item.mode,
    item.type,
    item.uplinkLowHz,
    item.uplinkHighHz,
    item.downlinkLowHz,
    item.downlinkHighHz,
    item.invert,
    item.baud,
  ]);

/**
 * A satellite's transmitters as the screen lists them. SatNOGS DB gives some satellites dozens (the ISS has some
 * forty): those are grouped into what can be worked through (an uplink and a downlink), what can be listened to,
 * beacons and telemetry, and uplinks alone, and the last two are folded. A record listed twice over, the same in
 * every field shown, is listed once.
 */
export function transmitterGroups(transmitters: SatelliteTransmitter[]): TransmitterGroup[] {
  const seen = new Set<string>();
  const unique = transmitters.filter((item) => {
    const key = sameRecord(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length <= ONE_TABLE_UP_TO) return [{ id: "all", title: "", transmitters: unique, folded: false }];
  const groups: TransmitterGroup[] = [
    { id: "work", title: "To work through", transmitters: [], folded: false },
    { id: "listen", title: "To listen to", transmitters: [], folded: false },
    { id: "quiet", title: "Beacons and telemetry", transmitters: [], folded: true },
    { id: "uplink", title: "Uplinks alone", transmitters: [], folded: true },
  ];
  const into = (id: TransmitterGroup["id"], item: SatelliteTransmitter) => groups.find((group) => group.id === id)?.transmitters.push(item);
  for (const item of unique) {
    if (item.downlinkLowHz === null) into("uplink", item);
    else if (item.uplinkLowHz !== null) into("work", item);
    else if (QUIET.test(`${item.description} ${item.mode ?? ""}`)) into("quiet", item);
    else into("listen", item);
  }
  const kept = groups.filter((group) => group.transmitters.length > 0);
  // Nothing to work or listen to: the first group there is is open, rather than every one folded.
  if (kept.length > 0 && kept.every((group) => group.folded)) kept[0]!.folded = false;
  return kept;
}
