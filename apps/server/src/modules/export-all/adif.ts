/**
 * Writes the contact log as ADIF (the ADI form), the file logging programs read.
 *
 * Written from the same specification the reader in modules/propagation/adif.ts was
 * written from: ADIF 3.1.8 (adif.org/318/ADIF_318.htm, read on 16 November 2026),
 * section IV.A "ADI File Format" and the QSO field definitions. A data-specifier is
 * `<NAME:LENGTH>DATA`; a header is text that does not start with `<`, ended by `<EOH>`;
 * each record ends with `<EOR>`. Dates are YYYYMMDD and times HHMMSS, both UTC;
 * positions are `XDDD MM.MMM`. It writes the fields the reader reads, the other way
 * round, so that a log taken out of Outpost comes back in as it was.
 *
 * Only contacts made and stations heard are QSO records. An attempt that failed is not
 * a QSO; those are in the CSV beside it.
 */

export interface LogRow {
  at: number;
  frequencyMhz: number | null;
  band: string;
  mode: string;
  outcome: "contact" | "heard" | "failed";
  txCall: string;
  txLat: number | null;
  txLon: number | null;
  rxCall: string;
  rxLat: number | null;
  rxLon: number | null;
  powerWatts: number | null;
  antenna: string;
  reportSent: string;
  reportReceived: string;
  notes: string;
  propMode: string;
}

/** ADI data is ASCII; anything else is replaced, so that lengths count characters and bytes alike. */
const ascii = (value: string) => value.replace(/[^\x20-\x7e\n\r\t]/g, "?");

function field(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const text = ascii(String(value));
  return `<${name}:${text.length}>${text} `;
}

/** `XDDD MM.MMM`: N or S for latitude, E or W for longitude. */
export function adifLocation(value: number, axis: "lat" | "lon"): string {
  const letter = axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  const absolute = Math.abs(value);
  let degrees = Math.floor(absolute);
  let minutes = Math.round((absolute - degrees) * 60 * 1000) / 1000;
  if (minutes >= 60) {
    degrees += 1;
    minutes = 0;
  }
  return `${letter}${String(degrees).padStart(3, "0")} ${minutes.toFixed(3).padStart(6, "0")}`;
}

const BAND = /^\d+(\.\d+)?(m|cm|mm)$/i;

export function writeAdif(rows: LogRow[], now: number, version: string): string {
  const created = new Date(now).toISOString();
  const lines = [
    `Contact log exported from Outpost on ${created.slice(0, 10)}.`,
    `${field("ADIF_VER", "3.1.8")}${field("PROGRAMID", "Outpost")}${field("PROGRAMVERSION", version)}${field(
      "CREATED_TIMESTAMP",
      `${created.slice(0, 10).replaceAll("-", "")} ${created.slice(11, 19).replaceAll(":", "")}`,
    )}<EOH>`,
  ];
  for (const row of rows) {
    if (row.outcome === "failed") continue;
    const heard = row.outcome === "heard";
    // A contact is logged by the station that sent; a station heard is logged by the one that heard it.
    const mine = heard ? { call: row.rxCall, lat: row.rxLat, lon: row.rxLon } : { call: row.txCall, lat: row.txLat, lon: row.txLon };
    const theirs = heard ? { call: row.txCall, lat: row.txLat, lon: row.txLon } : { call: row.rxCall, lat: row.rxLat, lon: row.rxLon };
    const date = new Date(row.at).toISOString();
    const [mode, submode] = row.mode.split("/");
    let line = "";
    line += field("CALL", theirs.call);
    line += field("QSO_DATE", date.slice(0, 10).replaceAll("-", ""));
    line += field("TIME_ON", date.slice(11, 19).replaceAll(":", ""));
    line += field("FREQ", row.frequencyMhz === null ? null : String(row.frequencyMhz));
    line += field("BAND", BAND.test(row.band) ? row.band.toLowerCase() : null);
    line += field("MODE", mode);
    line += field("SUBMODE", submode);
    line += field("STATION_CALLSIGN", mine.call);
    if (mine.lat !== null && mine.lon !== null)
      line += field("MY_LAT", adifLocation(mine.lat, "lat")) + field("MY_LON", adifLocation(mine.lon, "lon"));
    if (theirs.lat !== null && theirs.lon !== null)
      line += field("LAT", adifLocation(theirs.lat, "lat")) + field("LON", adifLocation(theirs.lon, "lon"));
    if (!heard) line += field("TX_PWR", row.powerWatts);
    line += field("MY_ANTENNA", row.antenna);
    line += field("RST_SENT", row.reportSent);
    line += field("RST_RCVD", row.reportReceived);
    // NOTES, not COMMENT: a note can run to several lines, which only a MultilineString field may hold.
    line += field("NOTES", row.notes);
    line += field("PROP_MODE", row.propMode);
    if (heard) line += field("SWL", "Y");
    lines.push(`${line}<EOR>`);
  }
  return `${lines.join("\n")}\n`;
}
