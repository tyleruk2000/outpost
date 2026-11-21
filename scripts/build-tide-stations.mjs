#!/usr/bin/env node
/**
 * Makes the table of tide stations that Tide times works from
 * (apps/server/src/modules/tides/data/noaa-harmonic.json), from NOAA CO-OPS's metadata API.
 *
 *   node scripts/build-tide-stations.mjs
 *
 * For every station NOAA lists with harmonic constituents (stations.json?type=harcon), it
 * reads the station's constituents (harcon.json, metric) and its datums (datums.json,
 * metric), and keeps: the id, name, state, latitude and longitude; the height of mean sea
 * level above mean lower low water, in millimetres (the harmonic amplitudes are about mean
 * sea level, and NOAA's predictions are given above mean lower low water); and, for each of
 * NOAA's 37 constituents in NOAA's own order, the amplitude in millimetres and the Greenwich
 * phase (phase_GMT) in tenths of a degree, as published. Great Lakes stations are left out:
 * they have no astronomical tide worth predicting.
 *
 * The data are a work of the US Government and in the public domain: "The information on
 * government servers are in the public domain, unless specifically annotated otherwise, and
 * may be used freely by the public" (tidesandcurrents.noaa.gov/disclaimers.html, read
 * 21 November 2026). NOS asks that it be named as the source, which the file and the
 * screen do.
 *
 * It needs the network and nothing but Node 24. It makes about 2,800 requests, four at a
 * time, and takes a few minutes.
 */
import fs from "node:fs";
import path from "node:path";

const API = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi";
const out = path.join(import.meta.dirname, "../apps/server/src/modules/tides/data/noaa-harmonic.json");

/** NOAA's 37 constituents, in the order its harcon.json numbers them. */
const CONSTITUENTS = [
  "M2",
  "S2",
  "N2",
  "K1",
  "M4",
  "O1",
  "M6",
  "MK3",
  "S4",
  "MN4",
  "NU2",
  "S6",
  "MU2",
  "2N2",
  "OO1",
  "LAM2",
  "S1",
  "M1",
  "J1",
  "MM",
  "SSA",
  "SA",
  "MSF",
  "MF",
  "RHO",
  "Q1",
  "T2",
  "R2",
  "2Q1",
  "P1",
  "2SM2",
  "M3",
  "L2",
  "2MK3",
  "K2",
  "M8",
  "MS4",
];

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      if (attempt >= 6) throw new Error(`${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
    }
  }
}

const list = await getJson(`${API}/stations.json?type=harcon`);
const candidates = list.stations.filter((station) => !station.greatlakes);
console.log(`${list.stations.length} stations listed with harmonic constituents; ${candidates.length} outside the Great Lakes.`);

const stations = [];
const skipped = [];
let next = 0;
async function worker() {
  while (next < candidates.length) {
    const station = candidates[next++];
    try {
      const [harcon, datums] = await Promise.all([
        getJson(`${API}/stations/${station.id}/harcon.json?units=metric`),
        getJson(`${API}/stations/${station.id}/datums.json?units=metric`).catch(() => null),
      ]);
      const byName = new Map((harcon.HarmonicConstituents ?? []).map((c) => [c.name, c]));
      if (byName.size === 0 || !byName.has("M2")) {
        skipped.push(`${station.id} (no constituents)`);
        continue;
      }
      const amplitudes = CONSTITUENTS.map((name) => Math.round((byName.get(name)?.amplitude ?? 0) * 1000));
      const phases = CONSTITUENTS.map((name) => Math.round((byName.get(name)?.phase_GMT ?? 0) * 10));
      const datum = (name) => datums?.datums?.find((d) => d.name === name)?.value;
      const msl = datum("MSL");
      const mllw = datum("MLLW");
      const mslAboveMllw = Number.isFinite(msl) && Number.isFinite(mllw) && msl !== mllw ? Math.round((msl - mllw) * 1000) : null;
      stations.push([
        station.id,
        station.name,
        station.state ?? "",
        +station.lat.toFixed(4),
        +station.lng.toFixed(4),
        mslAboveMllw,
        amplitudes,
        phases,
      ]);
    } catch (error) {
      skipped.push(`${station.id} (${error.message})`);
    }
    if (stations.length % 100 === 0) process.stdout.write(`${stations.length} `);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
stations.sort((a, b) => a[0].localeCompare(b[0]));

const data = {
  source: "NOAA Center for Operational Oceanographic Products and Services (CO-OPS), harmonic constituents and datums",
  url: "https://api.tidesandcurrents.noaa.gov/mdapi/prod/",
  licence: "Public domain (US Government work); NOAA/NOS asks to be named as the source.",
  read: new Date().toISOString().slice(0, 10),
  constituents: CONSTITUENTS,
  fields: ["id", "name", "state", "lat", "lon", "mslAboveMllwMm", "amplitudesMm", "phasesGmtTenthsDeg"],
  stations,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(data)}\n`);
console.log(
  `\nKept ${stations.length} stations, ${(fs.statSync(out).size / 1024).toFixed(0)} KB, in ${path.relative(process.cwd(), out)}.`,
);
if (skipped.length) console.log(`Skipped ${skipped.length}: ${skipped.join(", ")}`);
