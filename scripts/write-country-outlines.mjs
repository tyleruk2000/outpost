#!/usr/bin/env node
/**
 * Writes apps/server/src/modules/roads/country-outlines.json: every country's outline from
 * Natural Earth's 1:50 million admin-0 countries (v5.1.2, public domain), simplified to
 * about 3 km, small islands left out, and rounded to 0.01°, for telling which country a
 * point is in with no network (road routes: "No road network is installed for France"). Good to a few kilometres,
 * which is all that question needs.
 *
 *   node scripts/write-country-outlines.mjs path/to/ne_50m_admin_0_countries.geojson
 *
 * The file is the one the reference layers fetch (sha256 3e458fc0…7fdeb); download it from
 * https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED = "3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb";
const TOLERANCE = 0.03;
/** Islands smaller than this (square degrees, about 15 km across in Europe) are left out, except a country's largest part. */
const SMALLEST_PART = 0.02;
const input = process.argv[2];
if (!input) {
  console.error("Give the path of ne_50m_admin_0_countries.geojson.");
  process.exit(1);
}
const bytes = fs.readFileSync(input);
const sha = crypto.createHash("sha256").update(bytes).digest("hex");
if (sha !== EXPECTED) {
  console.error(`That is not the Natural Earth 5.1.2 file (sha256 ${sha}).`);
  process.exit(1);
}

function simplify(points) {
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = TOLERANCE;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i];
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const out = {};
for (const feature of JSON.parse(bytes.toString("utf8")).features) {
  const p = feature.properties;
  const code = [p.ISO_A2, p.ISO_A2_EH].find((c) => typeof c === "string" && /^[A-Z]{2}$/.test(c));
  if (!code) continue;
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const area = (ring) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    return Math.abs(sum / 2);
  };
  // The outer rings only: lakes inside a country are still that country for this purpose.
  const rings = polygons.map((polygon) => polygon[0]).sort((a, b) => area(b) - area(a));
  rings.forEach((outer, index) => {
    if (index > 0 && area(outer) < SMALLEST_PART) return;
    const round = (points) => points.map(([x, y]) => [Math.round(x * 100), Math.round(y * 100)]);
    let ring = round(simplify(outer));
    // A country too small to simplify (Monaco, the Vatican) keeps its outline as drawn.
    if (ring.length < 4 && index === 0) ring = round(outer);
    if (ring.length < 4) return;
    if (!out[code]) out[code] = [];
    out[code].push(ring.flat());
  });
}
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), "../apps/server/src/modules/roads/country-outlines.json");
fs.writeFileSync(
  target,
  `${JSON.stringify({
    description:
      "Country outlines from Natural Earth 1:50m admin-0 countries v5.1.2 (public domain), outer rings simplified to about 3 km and islands under 0.02 square degrees left out, in hundredths of a degree as [lon, lat, lon, lat, …]. Written by scripts/write-country-outlines.mjs.",
    countries: out,
  })}\n`,
);
console.log(`${Object.keys(out).length} countries, ${fs.statSync(target).size} bytes`);
