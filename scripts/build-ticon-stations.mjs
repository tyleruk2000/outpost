#!/usr/bin/env node
/**
 * Makes the worldwide table of tide stations that Tide times works from beside NOAA's
 * (apps/server/src/modules/tides/data/ticon4-harmonic.json), from TICON-4.
 *
 *   curl -L -o TICON_4.csv https://www.seanoe.org/data/00980/109129/data/122848.csv
 *   node scripts/build-ticon-stations.mjs TICON_4.csv
 *
 * TICON-4 (Hart-Davis, Dettmering and Seitz, DGFI-TUM, 2025; SEANOE,
 * https://doi.org/10.17882/109129) gives 50 harmonic constituents (amplitude in
 * centimetres, Greenwich phase lag in degrees) worked out from the GESLA-4 sea-level
 * records of 4,838 tide gauges. Its licence is Creative Commons Attribution 4.0 (the
 * SEANOE page, read 21 November 2026); the file and the screen name it.
 *
 * What is kept, and why:
 * - Lake gauges are left out (no tide worth predicting). River gauges are kept and marked.
 * - The same gauge often comes from several providers. Gauges are ranked (no quality
 *   remark first, then the longest record) and a gauge within 2 km of one already kept,
 *   or of one of NOAA's stations, is left out: NOAA's own constants come with a chart
 *   datum, and the longest record is the steadiest.
 * - Constituents are kept only where Outpost has the arguments and node factors for the
 *   name as TICON uses it (Table 1 of the user manual, by Doodson number). Left out:
 *   M1 and S1 (conventions differ between programs), and SIGMA1, MTM, MSQM, MKS2, 3N2,
 *   3L2, T3, S3, R3. These are small; the script prints the largest left out.
 *
 * Reads only the local file: no network.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/build-ticon-stations.mjs TICON_4.csv");
  process.exit(1);
}
const dataDir = path.join(import.meta.dirname, "../apps/server/src/modules/tides/data");
const out = path.join(dataDir, "ticon4-harmonic.json");
const noaa = JSON.parse(fs.readFileSync(path.join(dataDir, "noaa-harmonic.json"), "utf8"));

/** TICON's name → Outpost's (packages/shared/src/tides.ts). */
const NAMES = {
  M2: "M2",
  S2: "S2",
  N2: "N2",
  K2: "K2",
  K1: "K1",
  O1: "O1",
  P1: "P1",
  Q1: "Q1",
  "2Q1": "2Q1",
  RHO1: "RHO",
  J1: "J1",
  OO1: "OO1",
  "2N2": "2N2",
  MU2: "MU2",
  NU2: "NU2",
  LAMBDA2: "LAM2",
  L2: "L2",
  T2: "T2",
  R2: "R2",
  "2SM2": "2SM2",
  EP2: "EPS2",
  MA2: "MA2",
  MB2: "MB2",
  M3: "M3",
  M4: "M4",
  MS4: "MS4",
  MN4: "MN4",
  N4: "N4",
  S4: "S4",
  "2MK5": "2MK5",
  "2MO5": "2MO5",
  M6: "M6",
  "2MS6": "2MS6",
  M8: "M8",
  SA: "SA",
  SSA: "SSA",
  MM: "MM",
  MSF: "MSF",
  MF: "MF",
};
const CONSTITUENTS = Object.values(NAMES);

/** ISO 3166-1 alpha-3 → alpha-2, for the countries TICON-4 names. */
const ISO2 = {
  AGO: "AO",
  ARG: "AR",
  ASM: "AS",
  ATA: "AQ",
  AUS: "AU",
  BEL: "BE",
  BGD: "BD",
  BGR: "BG",
  BHR: "BH",
  BHS: "BS",
  BLZ: "BZ",
  BRA: "BR",
  BRB: "BB",
  CAN: "CA",
  CHL: "CL",
  CHN: "CN",
  CIV: "CI",
  CMR: "CM",
  COG: "CG",
  COK: "CK",
  COL: "CO",
  CPV: "CV",
  CRI: "CR",
  CUB: "CU",
  CUW: "CW",
  DEU: "DE",
  DJI: "DJ",
  DMA: "DM",
  DNK: "DK",
  DOM: "DO",
  ECU: "EC",
  EGY: "EG",
  ESP: "ES",
  EST: "EE",
  FIN: "FI",
  FJI: "FJ",
  FRA: "FR",
  FSM: "FM",
  GBR: "GB",
  GHA: "GH",
  GRC: "GR",
  GRD: "GD",
  GRL: "GL",
  GTM: "GT",
  HKG: "HK",
  HND: "HN",
  HRV: "HR",
  HTI: "HT",
  IDN: "ID",
  IND: "IN",
  IRL: "IE",
  IRN: "IR",
  ISL: "IS",
  ITA: "IT",
  JAM: "JM",
  JPN: "JP",
  KEN: "KE",
  KIR: "KI",
  LKA: "LK",
  LTU: "LT",
  LVA: "LV",
  MDG: "MG",
  MDV: "MV",
  MEX: "MX",
  MHL: "MH",
  MMR: "MM",
  MNP: "MP",
  MOZ: "MZ",
  MRT: "MR",
  MUS: "MU",
  MYS: "MY",
  NAM: "NA",
  NGA: "NG",
  NIU: "NU",
  NLD: "NL",
  NOR: "NO",
  NRU: "NR",
  NZL: "NZ",
  OMN: "OM",
  PAK: "PK",
  PAN: "PA",
  PER: "PE",
  PHL: "PH",
  PLW: "PW",
  PNG: "PG",
  POL: "PL",
  PRI: "PR",
  PRT: "PT",
  PYF: "PF",
  ROU: "RO",
  RUS: "RU",
  SEN: "SN",
  SGP: "SG",
  SHN: "SH",
  SLB: "SB",
  SLV: "SV",
  STP: "ST",
  SVN: "SI",
  SWE: "SE",
  SYC: "SC",
  THA: "TH",
  TON: "TO",
  TTO: "TT",
  TUR: "TR",
  TUV: "TV",
  TWN: "TW",
  TZA: "TZ",
  UKR: "UA",
  USA: "US",
  VCT: "VC",
  VEN: "VE",
  VNM: "VN",
  VUT: "VU",
  WSM: "WS",
  YEM: "YE",
  ZAF: "ZA",
};
const regionNames = new Intl.DisplayNames(["en-GB"], { type: "region" });
const country = (iso3) => (ISO2[iso3] ? regionNames.of(ISO2[iso3]) : iso3);

/** "aberdeen-abe-gbr-bodc" → "Aberdeen"; "boulogne_sur_mer-111-fra-refmar" → "Boulogne Sur Mer". */
function placeName(gauge) {
  const head = gauge
    .split("-")[0]
    .replace(/tg(_\d+minute)?$/, "")
    .replace(/_/g, " ")
    .trim();
  const words = head.split(/\s+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  // A last word of two letters is a province or state ("vancouver_bc", "ilha_fiscal_rj").
  const last = words.length - 1;
  if (last > 0 && words[last].length === 2) words[last] = words[last].toUpperCase();
  return words.join(" ");
}

// One CSV row per gauge and constituent. TICON's fields contain no quoted commas.
const lines = fs.readFileSync(input, "utf8").split(/\r?\n/);
const header = lines[0].split(",");
const col = Object.fromEntries(header.map((name, i) => [name, i]));
const gauges = new Map();
for (const line of lines.slice(1)) {
  if (!line) continue;
  const f = line.split(",");
  const key = `${f[col.gesla_source]}|${f[col.tide_gauge_name]}`;
  let gauge = gauges.get(key);
  if (!gauge) {
    gauge = {
      key,
      lat: Number(f[col.lat]),
      lon: Number(f[col.lon]),
      gauge: f[col.tide_gauge_name],
      type: f[col.type],
      country: f[col.country],
      quality: f[col.record_quality],
      years: Number(f[col.years_of_obs]),
      cons: new Map(),
    };
    gauges.set(key, gauge);
  }
  gauge.cons.set(f[col.con], { amp: Number(f[col.amp]), pha: Number(f[col.pha]) });
}

const R = 6_371_000;
const toRad = Math.PI / 180;
function km(aLat, aLon, bLat, bLon) {
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(h))) / 1000;
}

const ranked = [...gauges.values()]
  .filter((g) => g.type !== "Lake" && Number.isFinite(g.lat) && Number.isFinite(g.lon) && g.cons.get("M2")?.amp > 0)
  .sort((a, b) => (a.quality === "No obvious issues" ? 0 : 1) - (b.quality === "No obvious issues" ? 0 : 1) || b.years - a.years);

const kept = [];
const taken = noaa.stations.map((row) => [row[3], row[4]]);
let nearNoaa = 0;
let duplicate = 0;
for (const g of ranked) {
  if (taken.some(([lat, lon]) => Math.abs(lat - g.lat) < 0.05 && km(lat, lon, g.lat, g.lon) < 2)) {
    if (noaa.stations.some((row) => km(row[3], row[4], g.lat, g.lon) < 2)) nearNoaa++;
    else duplicate++;
    continue;
  }
  taken.push([g.lat, g.lon]);
  kept.push(g);
}

let worstLeftOut = { amp: 0 };
const stations = kept.map((g) => {
  for (const [name, c] of g.cons) {
    if (!(name in NAMES) && c.amp > worstLeftOut.amp) worstLeftOut = { amp: c.amp, name, gauge: g.gauge };
  }
  const id = `T${createHash("sha1").update(g.key).digest("hex").slice(0, 8)}`;
  const amplitudes = Object.keys(NAMES).map((name) => Math.round((g.cons.get(name)?.amp ?? 0) * 10));
  const phases = Object.keys(NAMES).map((name) => Math.round(((((g.cons.get(name)?.pha ?? 0) % 360) + 360) % 360) * 10) % 3600);
  return [
    id,
    placeName(g.gauge),
    country(g.country),
    +g.lat.toFixed(4),
    +g.lon.toFixed(4),
    null,
    amplitudes,
    phases,
    g.type === "River" ? 1 : 0,
  ];
});
stations.sort((a, b) => a[0].localeCompare(b[0]));
if (new Set(stations.map((s) => s[0])).size !== stations.length) throw new Error("Two stations share an id");

const data = {
  source: "TICON-4: TIdal CONstants based on GESLA-4 sea-level records (Hart-Davis, Dettmering and Seitz, DGFI-TUM, 2025)",
  url: "https://doi.org/10.17882/109129",
  licence: "CC BY 4.0; cite Hart-Davis, Dettmering and Seitz (2025), SEANOE.",
  read: "2026-11-21",
  constituents: CONSTITUENTS,
  fields: ["id", "name", "country", "lat", "lon", "mslAboveMllwMm", "amplitudesMm", "phasesGreenwichTenthsDeg", "river"],
  stations,
};
fs.writeFileSync(out, `${JSON.stringify(data)}\n`);
console.log(
  `${gauges.size} gauges read; ${ranked.length} outside lakes; ${nearNoaa} left to NOAA's stations, ${duplicate} duplicates; kept ${stations.length}.`,
);
console.log(`Largest constituent left out: ${worstLeftOut.name} ${worstLeftOut.amp} cm at ${worstLeftOut.gauge}.`);
console.log(`${(fs.statSync(out).size / 1024).toFixed(0)} KB in ${path.relative(process.cwd(), out)}.`);
