#!/usr/bin/env node
/**
 * Builds the country outlines Outpost uses to say which country a point is in
 * (packages/shared/src/country-at.ts), once, from Natural Earth's 1:10m Admin 0 Countries
 * (public domain). Run by hand when Natural Earth is updated; the output is committed.
 *
 *   curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson
 *   node scripts/build-borders.mjs ne_10m_admin_0_countries.geojson
 *
 * Each ring is simplified (Douglas-Peucker, TOLERANCE degrees, the optional second argument)
 * and its points kept as whole thousandths of a degree (about 110 m), the first as it is and
 * each after it as the step from the one before, so the file stays small enough to bundle.
 * Output: apps/server/src/modules/layers/borders.json,
 *   { source, tolerance, scale, countries: [{ code, bbox: [w,s,e,n], rings: [[x0,y0,dx1,dy1,…], …] }] }
 */
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("Give the path to ne_10m_admin_0_countries.geojson.");
  process.exit(1);
}
const TOLERANCE = Number(process.argv[3] ?? 0.008);
const SCALE = 1000;
const out = path.resolve(import.meta.dirname, "../apps/server/src/modules/layers/borders.json");

function simplify(points, tolerance) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let worst = -1;
    let at = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      const distance = length === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
      if (distance > worst) {
        worst = distance;
        at = i;
      }
    }
    if (worst > tolerance) {
      keep[at] = 1;
      stack.push([first, at], [at, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const data = JSON.parse(fs.readFileSync(input, "utf8"));
const byCode = new Map();
for (const feature of data.features) {
  const p = feature.properties;
  // Natural Earth leaves ISO_A2 as -99 for a few (France, Norway, Kosovo): the "EH" field holds it.
  const code = [p.ISO_A2, p.ISO_A2_EH, p.WB_A2].find((each) => typeof each === "string" && /^[A-Z]{2}$/.test(each));
  if (!code) continue;
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const entry = byCode.get(code) ?? { code, rings: [] };
  for (const polygon of polygons)
    for (const ring of polygon) {
      const simple = simplify(ring, TOLERANCE);
      const flat = [];
      for (const [x, y] of simple) {
        const qx = Math.round(x * SCALE);
        const qy = Math.round(y * SCALE);
        if (flat.length && flat.at(-2) === qx && flat.at(-1) === qy) continue;
        flat.push(qx, qy);
      }
      if (flat.length >= 6) entry.rings.push(flat);
    }
  byCode.set(code, entry);
}
const countries = [...byCode.values()]
  .filter((entry) => entry.rings.length)
  .map((entry) => {
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (const ring of entry.rings)
      for (let i = 0; i < ring.length; i += 2) {
        w = Math.min(w, ring[i]);
        e = Math.max(e, ring[i]);
        s = Math.min(s, ring[i + 1]);
        n = Math.max(n, ring[i + 1]);
      }
    // Each ring after its first point is written as steps from the point before (smaller numbers).
    const rings = entry.rings.map((ring) => ring.map((value, i) => (i < 2 ? value : value - ring[i - 2])));
    return { code: entry.code, bbox: [w, s, e, n], rings };
  })
  .sort((a, b) => a.code.localeCompare(b.code));
fs.writeFileSync(
  out,
  JSON.stringify({
    source: "Natural Earth 1:10m Admin 0 Countries v5.1.2 (public domain), simplified",
    tolerance: TOLERANCE,
    scale: SCALE,
    countries,
  }),
);
console.log(`${countries.length} countries, ${(fs.statSync(out).size / 1024).toFixed(0)} KiB: ${out}`);
