/**
 * A stand-in for OurAirports' data repository (davidmegginson.github.io/ourairports-data/),
 * for the server tests and the end-to-end suite: `airports.csv` and
 * `airport-frequencies.csv` under `/ourairports/`.
 *
 * FREQUENCIES_CSV is 33 real rows of `airport-frequencies.csv`, copied unchanged (header
 * included) from the file fetched once from
 * https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv on 17 November
 * 2026 (Last-Modified: Tue, 17 Nov 2026 02:53:56 GMT; 1,302,744 bytes, 30,397 rows). The
 * data is public domain (the repository's LICENSE: the Unlicense). The rows were chosen
 * for London Heathrow, London City, Shoreham and Luxembourg, and for a few odd ones: a
 * quoted description, a description with a comma, an empty description, a type that is a
 * number and a frequency of 0. The rest of the file was deleted.
 *
 * AIRPORTS_CSV is written for the tests in airports.csv's layout. Its identifiers are the
 * real ones the frequency rows name; its positions are approximate, and "Made-up
 * airfield (test)" is not a real place (it has no frequency rows).
 */
import type http from "node:http";

export const FREQUENCIES_HEADER = `"id","airport_ref","airport_ident","type","description","frequency_mhz"`;

export const FREQUENCIES_CSV = `${[
  FREQUENCIES_HEADER,
  `307581,6589,"01FL","ARCAL",,122.9`,
  `75239,6589,"01FL","CTAF","CEDAR KNOLL TRAFFIC",122.8`,
  `328118,38713,"AR-0038","CTAF","""Alvear""",123.5`,
  `75491,41098,"CA-0159","ATF","Pontiac Traffic, 5nm below 3300 ASL",123.2`,
  `75492,41098,"CA-0159","VFR Advisory","Ottawa Terminal",127.7`,
  `298892,4970,"DN56",131.7,"ESCRAVOS TOWER",0`,
  `58102,2427,"EGKA","A/G","RDO",123.155`,
  `58103,2427,"EGKA","APP","APP",123.155`,
  `58104,2427,"EGKA","ATIS","ATIS",130.975`,
  `58105,2427,"EGKA","TWR","TWR",125.405`,
  `58212,2430,"EGLC","APP","APP",132.7`,
  `58213,2430,"EGLC","ATIS","ATIS",136.35`,
  `58214,2430,"EGLC","GND","GND",121.825`,
  `58215,2430,"EGLC","TWR","TWR",118.075`,
  `323434,2434,"EGLL","ATIS","Heathrow ATIS",113.75`,
  `323435,2434,"EGLL","ATIS","Heathrow ATIS (Arrival)",115.1`,
  `319776,2434,"EGLL","ATIS","Heathrow ATIS (Departure)",121.935`,
  `319777,2434,"EGLL","ATIS","Heathrow ATIS",128.075`,
  `58109,2434,"EGLL","CLD","Heathrow Delivery",121.975`,
  `58107,2434,"EGLL","DIR","Heathrow Director",119.725`,
  `323436,2434,"EGLL","DIR","Heathrow Director",120.4`,
  `323437,2434,"EGLL","DIR","Heathrow Director",127.525`,
  `323438,2434,"EGLL","DIR","Heathrow Director",134.975`,
  `58110,2434,"EGLL","GND","Heathrow Ground",121.7`,
  `323431,2434,"EGLL","GND","Heathrow Ground",121.85`,
  `323430,2434,"EGLL","GND","Heathrow Ground",121.9`,
  `58111,2434,"EGLL","TWR","Heathrow Tower",118.5`,
  `323432,2434,"EGLL","TWR","Heathrow Tower",118.7`,
  `323433,2434,"EGLL","TWR","Heathrow Tower",124.475`,
  `55203,2563,"ELLX","APP","Luxembourg Approach",120.885`,
  `55204,2563,"ELLX","ATIS","ATIS",134.755`,
  `55205,2563,"ELLX","TWR","Luxembourg Tower",118.105`,
  `352867,2563,"ELLX","VDF","Homer",118.105`,
].join("\n")}\n`;

const AIRPORTS_HEADER =
  "id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,icao_code,iata_code,gps_code,local_code,home_link,wikipedia_link,keywords";

export const AIRPORTS_CSV = `${[
  AIRPORTS_HEADER,
  "2434,EGLL,large_airport,London Heathrow Airport,51.4706,-0.461941,83,EU,GB,GB-ENG,London,yes,EGLL,LHR,EGLL,,,,",
  "2430,EGLC,medium_airport,London City Airport,51.505299,0.055278,19,EU,GB,GB-ENG,London,yes,EGLC,LCY,EGLC,,,,",
  "2427,EGKA,medium_airport,Brighton City Airport,50.835602,-0.297222,7,EU,GB,GB-ENG,Shoreham-by-Sea,no,EGKA,ESH,EGKA,,,,",
  "900001,GB-T001,small_airport,Made-up airfield (test),54.52,-3.05,300,EU,GB,GB-ENG,,no,,,,,,,",
  "2563,ELLX,large_airport,Luxembourg-Findel International Airport,49.6233333,6.2044444,1234,EU,LU,LU-L,Luxembourg,yes,ELLX,LUX,ELLX,,,,",
].join("\n")}\n`;

export const LAST_MODIFIED = "Tue, 17 Nov 2026 02:53:56 GMT";

/** Answers `/ourairports/<file>`, HEAD or GET, from `files` (the two above unless told otherwise); anything else is 404. */
export function serveOurAirportsStandIn(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  files: Record<string, string | undefined> = { "airports.csv": AIRPORTS_CSV, "airport-frequencies.csv": FREQUENCIES_CSV },
): void {
  const name = decodeURIComponent(new URL(request.url ?? "/", "http://stand-in").pathname.replace(/^\/ourairports\//, ""));
  const body = files[name];
  if (body === undefined) {
    response.statusCode = 404;
    response.end();
    return;
  }
  const bytes = Buffer.from(body, "utf8");
  response.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-length": bytes.length, "last-modified": LAST_MODIFIED });
  response.end(request.method === "HEAD" ? undefined : bytes);
}
