/** An ADI file of the tests' own, written as a logging program writes one (ADIF 3.1.8). */
const field = (name: string, value: string) => `<${name}:${Buffer.byteLength(value)}>${value}`;
const record = (fields: Record<string, string>) =>
  `${Object.entries(fields)
    .map(([name, value]) => field(name, value))
    .join(" ")} <EOR>\n`;

/**
 * Seven records from the station `mine`: London to Birmingham on 40 m at noon in
 * November 2026 with both ends' locators (the one that can be compared), the same
 * contact a second time, a contact with no position for the other station, one through
 * a satellite, one with no power, and two that cannot be read at all.
 */
export function adifLog(mine: string): Buffer {
  const base = { STATION_CALLSIGN: mine, QSO_DATE: "20261116", BAND: "40m", MODE: "SSB", MY_GRIDSQUARE: "IO91WM" };
  return Buffer.from(
    `Exported by the end-to-end tests\n${field("ADIF_VER", "3.1.8")} ${field("PROGRAMID", "E2ELog")} <EOH>\n` +
      record({ ...base, CALL: "G4BBB", TIME_ON: "1204", FREQ: "7.1", TX_PWR: "5", GRIDSQUARE: "IO92BL", RST_SENT: "57", RST_RCVD: "55" }) +
      record({ ...base, CALL: "G4BBB", TIME_ON: "120430", FREQ: "7.1", TX_PWR: "5", GRIDSQUARE: "IO92BL" }) +
      record({ ...base, CALL: "EA3XYZ", TIME_ON: "0903", TX_PWR: "5" }) +
      record({ ...base, CALL: "W1AW", TIME_ON: "1500", BAND: "2m", FREQ: "145.9", PROP_MODE: "SAT", GRIDSQUARE: "FN31", TX_PWR: "5" }) +
      record({ ...base, CALL: "G4CCC", TIME_ON: "1310", FREQ: "7.15", GRIDSQUARE: "IO83" }) +
      record({ ...base, TIME_ON: "1400" }) +
      record({ ...base, CALL: "G4DDD", QSO_DATE: "16/11/2026", TIME_ON: "1500" }),
  );
}
