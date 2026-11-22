/**
 * The radio papers' drawings, as SVG for the print kit.
 *
 * - `skyWaveDiagram` and `nvisDiagram` teach how HF travels. Their words and every figure
 *   in them are the Australian Bureau of Meteorology's, *Introduction to HF radio
 *   propagation* (Space Weather Services, 2016), sections 1.1, 2.1, 2.2, 2.6 and 2.7 (read
 *   22 November 2026; docs/sources.md): the regions' heights (D 50 to 90 km, E 90 to 140,
 *   F1 140 to 210, F2 over 210), the ground wave's reach (up to 100 km over land and 300
 *   km over sea), the rays of its figure 2.8 (at a fixed frequency, steeper rays come down
 *   nearer until the steepest that still returns; steeper still goes through; a skip zone
 *   forms inside), and the case of no skip zone (a frequency the ionosphere returns
 *   straight up comes back at every angle). The heights are drawn to scale; distances
 *   across are not, and the captions say so.
 * - `pathSection` draws one prediction's own path: the engine's hops, virtual height and
 *   take-off angle, over the regions, by the textbook triangle the planner already uses
 *   (the mirror at the virtual height, as `steepPathGeometry` in @outpost/shared has it).
 *   Heights are stretched against distances by a stated factor.
 * - `greyLineSketch` draws day and night on the world at an instant with the map's own
 *   arithmetic (maps/grey-line/geometry.ts, Meeus), over Natural Earth's outline.
 */
import { greyLineData } from "@/features/maps/grey-line/geometry";
import { PRINT_COLOURS as C, type Drawing, drawing, round, svgArrowHead, svgText } from "@/features/print-kit";

/** The regions by day, in km (BoM section 1.1). F2 is "over 210 km"; it is drawn to 400. */
export const REGIONS = [
  { id: "D", from: 50, to: 90, fill: "#f6dcd8", words: "D, 50 to 90 km: absorbs, by day only" },
  { id: "E", from: 90, to: 140, fill: "#e4ecf6", words: "E, 90 to 140 km: by day" },
  { id: "F1", from: 140, to: 210, fill: "#d3e2f2", words: "F1, 140 to 210 km: by day" },
  { id: "F2", from: 210, to: 400, fill: "#bdd3ec", words: "F2, over 210 km: day and night" },
] as const;

const RAY = C.know;
const GROUND = "#8a7a5c";

/** The regions as bands across a drawing: `y(km)` places a height. */
function regionBands(left: number, right: number, y: (km: number) => number, labelAt: "left" | "right", fade = true): string {
  let out = "";
  for (const region of REGIONS) {
    const top = y(region.to);
    const bottom = y(region.from);
    out += `<rect x="${left}" y="${round(top)}" width="${right - left}" height="${round(bottom - top)}" fill="${region.fill}"${
      fade && region.id === "F2" ? ' fill-opacity="0.85"' : ""
    }/>`;
    const words = labelAt === "left" ? region.words.split(":")[0]! : region.words;
    out += svgText(labelAt === "left" ? left + 3 : right - 3, round((top + bottom) / 2 + 2.5), words, {
      size: 6.5,
      anchor: labelAt === "left" ? "start" : "end",
      fill: region.id === "D" ? C.act : C.know,
      bold: region.id === "F2",
    });
  }
  return out;
}

/** A ray from (x1, ground) up to `apex` and down at x2, as the smooth curve a refracted ray makes. */
function ray(x1: number, x2: number, groundY: number, apexY: number, colour: string, width = 1.3, dash = ""): string {
  const controlY = 2 * apexY - groundY;
  return `<path d="M${round(x1)},${groundY} Q${round((x1 + x2) / 2)},${round(controlY)} ${round(x2)},${groundY}" fill="none" stroke="${colour}" stroke-width="${width}"${
    dash ? ` stroke-dasharray="${dash}"` : ""
  }/>`;
}

function antenna(x: number, groundY: number, words?: string): string {
  return (
    `<path d="M${x},${groundY} L${x},${groundY - 13} M${x - 4},${groundY - 13} L${x + 4},${groundY - 13}" stroke="${C.ink}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<circle cx="${x}" cy="${groundY - 13}" r="1.6" fill="${C.ink}"/>` +
    (words ? svgText(x, groundY + 10, words, { anchor: "middle", size: 6.5, bold: true }) : "")
  );
}

/**
 * At one frequency, rays leaving at steeper and steeper angles: the lowest goes furthest
 * and hops on; each steeper one comes down nearer, from higher up; the steepest that still
 * returns marks the outer edge of the skip zone; a steeper one goes through. The ground
 * wave runs out first. BoM figure 2.8, redrawn with the regions to scale in height.
 */
export function skyWaveDiagram(width: number): Drawing {
  const height = 214;
  const ground = 186;
  const top = 18;
  const y = (km: number) => ground - ((ground - top) * km) / 400;
  const tx = 34;
  // The rays keep to the left; the regions' names have the right-hand column to themselves.
  const raysRight = width - 128;
  const s = (fraction: number) => tx + (raysRight - tx) * fraction;
  let body = "";
  body += regionBands(0, width, y, "right");
  // The ground.
  body += `<rect x="0" y="${ground}" width="${width}" height="${height - ground}" fill="#efe8d8"/><line x1="0" y1="${ground}" x2="${width}" y2="${ground}" stroke="${GROUND}" stroke-width="1.2"/>`;
  // The ground wave, then the skip zone.
  const groundWaveEnd = s(0.12);
  const skipEnd = s(0.36);
  body += `<path d="M${tx},${ground - 2} L${round(groundWaveEnd)},${ground - 2}" stroke="${C.accent}" stroke-width="3" stroke-linecap="round"/>`;
  body += `<rect x="${round(groundWaveEnd)}" y="${ground + 1}" width="${round(skipEnd - groundWaveEnd)}" height="9" fill="${C.warnSoft}" stroke="${C.warn}" stroke-width="0.7" stroke-dasharray="3 2"/>`;
  body += svgText((groundWaveEnd + skipEnd) / 2, ground + 8, "skip zone", { anchor: "middle", size: 6.5, bold: true, fill: C.warnInk });
  // The rays: 5 goes through; 4 is the steepest that returns; 3, 2 and 1 come down further out; 1 hops on.
  const apex = (km: number) => y(km);
  const landings = [s(0.88), s(0.66), s(0.5), skipEnd];
  const apexes = [235, 255, 285, 330];
  landings.forEach((at, index) => {
    body += ray(tx, at, ground, apex(apexes[index]!), RAY, index === 3 ? 1.6 : 1.2);
  });
  // The second hop of ray 1, off the ground and up again.
  const hopOn = landings[0]! - tx;
  body += `<clipPath id="hop"><rect x="0" y="0" width="${round(raysRight + 30)}" height="${height}"/></clipPath><path clip-path="url(#hop)" d="M${round(landings[0]!)},${ground} Q${round(landings[0]! + hopOn / 2)},${round(2 * apex(235) - ground)} ${round(landings[0]! + hopOn)},${ground}" fill="none" stroke="${RAY}" stroke-width="1.2" stroke-dasharray="4 2"/>`;
  // Ray 5: through the regions and away.
  const through = `M${tx},${ground} Q${round(tx + 40)},${round(y(220))} ${round(tx + 70)},${round(y(400))}`;
  body += `<path d="${through}" fill="none" stroke="${C.muted}" stroke-width="1.2" stroke-dasharray="2 2"/>${svgArrowHead(tx + 70, y(400), -45, C.muted)}`;
  // Ray numbers, where each comes down.
  ["1", "2", "3", "4"].forEach((number, index) => {
    body += `<circle cx="${round(landings[index]!)}" cy="${ground}" r="2.2" fill="${RAY}"/>`;
    body += svgText(landings[index]! + 4, ground - 4, number, { size: 6.5, bold: true, fill: RAY });
  });
  body += svgText(tx + 74, y(385), "5: through, and away", { size: 6.5, fill: C.muted });
  body += antenna(tx, ground);
  body += svgText(tx, ground + 10, "transmitter", { anchor: "middle", size: 6.5, bold: true });
  body += svgText(tx + 4, ground - 6, "ground wave", { size: 6.5, fill: C.accent, bold: true });
  body += svgText(landings[0]! + 6, ground + 9, "second hop", { size: 6.5, fill: RAY });
  // The words under the drawing.
  body += svgText(width - 3, height - 3, "Heights to scale; distances across are not.", { anchor: "end", size: 6.5, fill: C.muted });
  return drawing(width, height, body);
}

/**
 * A frequency the ionosphere returns straight up comes back at every angle: no skip zone,
 * and the steep rays fill in round the station. BoM section 2.6.
 */
export function nvisDiagram(width: number): Drawing {
  const height = 168;
  const ground = 142;
  const top = 12;
  const y = (km: number) => ground - ((ground - top) * km) / 400;
  const tx = width / 2;
  let body = "";
  body += regionBands(0, width, y, "left");
  body += `<rect x="0" y="${ground}" width="${width}" height="${height - ground}" fill="#efe8d8"/><line x1="0" y1="${ground}" x2="${width}" y2="${ground}" stroke="${GROUND}" stroke-width="1.2"/>`;
  // Rays at steep angles each way, coming back close in, from F2.
  const spreads = [0.06, 0.13, 0.2, 0.27];
  for (const spread of spreads)
    for (const side of [-1, 1]) {
      const at = tx + side * width * spread;
      body += ray(tx, at, ground, y(250 + (0.27 - spread) * 60), RAY, 1.1);
    }
  // Where they come down: all round the station, with no gap.
  const reach = width * 0.33;
  body += `<rect x="${round(tx - reach)}" y="${ground + 1}" width="${round(2 * reach)}" height="9" fill="${C.accentSoft}" stroke="${C.accent}" stroke-width="0.7"/>`;
  body += svgText(tx, ground + 8, "comes down all round: no skip zone", { anchor: "middle", size: 6.5, bold: true, fill: C.accent });
  body += antenna(tx, ground);
  body += svgText(tx, ground + 21, "transmitter, rays sent steeply up", { anchor: "middle", size: 6.5 });
  return drawing(width, height, body);
}

export interface PathSectionInput {
  distanceKm: number;
  hops: number;
  /** The engine's virtual height of the reflection, km. */
  virtualHeightKm: number;
  /** The engine's take-off angle, degrees. */
  takeoffDeg: number;
  layer: string;
  from: string;
  to: string;
}

/**
 * The path in section: the ground drawn flat with the regions over it, and the engine's
 * hops as the mirror triangle at its virtual height. Heights are stretched by `stretch`
 * against distances so that a long path still shows its layers; the caption gives the
 * figure. The ground wave's reach over land (BoM: up to 100 km) is marked at each end.
 */
export function pathSection(width: number, input: PathSectionInput): { drawing: Drawing; stretch: number } {
  const height = 166;
  const ground = 140;
  const left = 30;
  const right = width - 30;
  const kmAcross = (right - left) / Math.max(input.distanceKm, 1);
  // Heights to 400 km fill the room above the ground, whatever the distance.
  const kmUp = (ground - 16) / 400;
  const stretch = kmUp / kmAcross;
  const x = (km: number) => left + km * kmAcross;
  const y = (km: number) => ground - km * kmUp;
  let body = regionBands(0, width, y, "left");
  body += `<rect x="0" y="${ground}" width="${width}" height="${height - ground}" fill="#efe8d8"/><line x1="0" y1="${ground}" x2="${width}" y2="${ground}" stroke="${GROUND}" stroke-width="1.2"/>`;
  // Ground wave over land, from each end.
  const groundWave = Math.min(100, input.distanceKm / 2);
  body += `<path d="M${x(0)},${ground - 2} L${round(x(groundWave))},${ground - 2}" stroke="${C.accent}" stroke-width="3" stroke-linecap="round"/>`;
  // The hops.
  const hops = Math.max(1, input.hops);
  const hop = input.distanceKm / hops;
  let path = `M${x(0)},${ground}`;
  for (let index = 0; index < hops; index += 1) {
    path += ` L${round(x(hop * index + hop / 2))},${round(y(input.virtualHeightKm))} L${round(x(hop * (index + 1)))},${ground}`;
  }
  body += `<path d="${path}" fill="none" stroke="${RAY}" stroke-width="1.8" stroke-linejoin="round"/>`;
  for (let index = 0; index < hops; index += 1)
    body += `<circle cx="${round(x(hop * index + hop / 2))}" cy="${round(y(input.virtualHeightKm))}" r="2.4" fill="#ffffff" stroke="${RAY}" stroke-width="1.2"/>`;
  // The take-off angle, drawn at the transmitter as the triangle gives it, labelled with the engine's figure.
  const arcRadius = 22;
  const drawnAngle = Math.atan((y(0) - y(input.virtualHeightKm)) / (x(hop / 2) - x(0)));
  body += `<path d="M${x(0) + arcRadius},${ground} A${arcRadius},${arcRadius} 0 0 0 ${round(x(0) + arcRadius * Math.cos(drawnAngle))},${round(ground - arcRadius * Math.sin(drawnAngle))}" fill="none" stroke="${C.ink}" stroke-width="0.7"/>`;
  body += svgText(x(0) + arcRadius + 4, ground - 4, `${Math.round(input.takeoffDeg)}° up`, { size: 6.5, bold: true });
  body += svgText(
    x(hop / 2),
    y(input.virtualHeightKm) - 6,
    `${input.layer || "reflection"} at ${Math.round(input.virtualHeightKm)} km (virtual height)`,
    { anchor: "middle", size: 6.5, bold: true, fill: RAY },
  );
  body += antenna(x(0), ground) + antenna(x(input.distanceKm), ground);
  body += svgText(x(0), ground + 10, input.from, { anchor: "start", size: 7, bold: true });
  body += svgText(x(input.distanceKm), ground + 10, input.to, { anchor: "end", size: 7, bold: true });
  body += svgText(
    width / 2,
    ground + 20,
    `${Math.round(input.distanceKm)} km, ${hops} ${hops === 1 ? "hop" : "hops"} of ${Math.round(hop)} km`,
    { anchor: "middle", size: 7 },
  );
  return { drawing: drawing(width, height, body), stretch };
}

// ── The world, day and night ────────────────────────────────────────────────

export interface LandShapes {
  features: Array<{ geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] } }>;
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

const DEG = Math.PI / 180;

/** Points along the great circle between two places, for drawing the path on the world. */
export function greatCircle(a: Place, b: Place, steps = 64): Array<[number, number]> {
  const toXyz = (place: Place) => [
    Math.cos(place.lat * DEG) * Math.cos(place.lon * DEG),
    Math.cos(place.lat * DEG) * Math.sin(place.lon * DEG),
    Math.sin(place.lat * DEG),
  ];
  const p = toXyz(a);
  const q = toXyz(b);
  const dot = Math.min(1, Math.max(-1, p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!));
  const omega = Math.acos(dot);
  const out: Array<[number, number]> = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const [s1, s2] = omega < 1e-9 ? [1 - t, t] : [Math.sin((1 - t) * omega) / Math.sin(omega), Math.sin(t * omega) / Math.sin(omega)];
    const v = [s1 * p[0]! + s2 * q[0]!, s1 * p[1]! + s2 * q[1]!, s1 * p[2]! + s2 * q[2]!];
    out.push([Math.atan2(v[1]!, v[0]!) / DEG, Math.asin(Math.max(-1, Math.min(1, v[2]!))) / DEG]);
  }
  return out;
}

/** The shades from the grey line to night, lightest first: each lies over the one before. */
const NIGHT = ["#7d8a99", "#5d6b7c", "#46546a", "#2f3c52"];

/**
 * The world at an instant: land, the night side shaded in four steps from the line where
 * the Sun sets to full night, the line itself, the Sun overhead, and the places with the
 * great circle between them. Longitude across, latitude down, from 70° south to 80° north.
 */
export function greyLineSketch(width: number, ms: number, places: Place[], land: LandShapes | null): Drawing {
  const north = 80;
  const south = -70;
  const height = Math.round((width * (north - south)) / 360);
  const px = (lon: number) => round(((lon + 180) / 360) * width);
  const py = (lat: number) => round(((north - lat) / (north - south)) * height);
  const ring = (points: number[][], step = 1) =>
    `M${points
      .filter((_, index) => index % step === 0 || index === points.length - 1)
      .map(([lon, lat]) => `${px(lon!)},${py(lat!)}`)
      .join("L")}Z`;
  let body = `<clipPath id="world"><rect x="0" y="0" width="${width}" height="${height}"/></clipPath><g clip-path="url(#world)">`;
  body += `<rect x="0" y="0" width="${width}" height="${height}" fill="#eaf2f8"/>`;
  if (land) {
    const shapes = land.features
      .flatMap((feature) => (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates))
      .map((polygon) => polygon.map((points) => ring(points)).join(""))
      .join("");
    body += `<path d="${shapes}" fill="#d9dccb" stroke="#a9ad97" stroke-width="0.3"/>`;
  }
  // Lines of latitude and longitude every 30°.
  for (let lon = -150; lon <= 150; lon += 30)
    body += `<line x1="${px(lon)}" y1="0" x2="${px(lon)}" y2="${height}" stroke="#ffffff" stroke-width="0.4" stroke-opacity="0.8"/>`;
  for (let lat = -60; lat <= 60; lat += 30)
    body += `<line x1="0" y1="${py(lat)}" x2="${width}" y2="${py(lat)}" stroke="#ffffff" stroke-width="${lat === 0 ? 0.8 : 0.4}" stroke-opacity="0.8"/>`;
  const data = greyLineData(ms);
  for (const feature of data.features) {
    const properties = feature.properties as { kind: string; step?: number };
    const geometry = feature.geometry as { type: string; coordinates: unknown };
    if (properties.kind === "shade" && geometry.type === "MultiPolygon") {
      const shapes = (geometry.coordinates as number[][][][]).map((polygon) => polygon.map((points) => ring(points)).join("")).join("");
      body += `<path d="${shapes}" fill="${NIGHT[properties.step ?? 0]}" fill-opacity="0.32"/>`;
    }
  }
  for (const feature of data.features) {
    const properties = feature.properties as { kind: string; step?: number };
    const geometry = feature.geometry as { type: string; coordinates: unknown };
    if (properties.kind === "edge" && properties.step === 0 && geometry.type === "MultiLineString")
      for (const line of geometry.coordinates as number[][][])
        body += `<path d="M${line
          .filter((_, index) => index % 4 === 0 || index === line.length - 1)
          .map(([lon, lat]) => `${px(lon!)},${py(lat!)}`)
          .join("L")}" fill="none" stroke="${C.warn}" stroke-width="1.4"/>`;
    if (properties.kind === "sun" && geometry.type === "Point") {
      const [lon, lat] = geometry.coordinates as [number, number];
      const cx = px(lon);
      const cy = py(lat);
      let rays = "";
      for (let index = 0; index < 8; index += 1) {
        const angle = (index * Math.PI) / 4;
        rays += `M${round(cx + 6 * Math.cos(angle))},${round(cy + 6 * Math.sin(angle))} L${round(cx + 9 * Math.cos(angle))},${round(cy + 9 * Math.sin(angle))} `;
      }
      body += `<path d="${rays}" stroke="${C.warnInk}" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="4.2" fill="#f2c14e" stroke="${C.warnInk}" stroke-width="0.8"/>`;
    }
  }
  // The path, split where it crosses the date line.
  if (places.length >= 2) {
    const points = greatCircle(places[0]!, places[1]!);
    let piece = "";
    points.forEach(([lon, lat], index) => {
      const jump = index > 0 && Math.abs(lon - points[index - 1]![0]) > 180;
      piece += `${index === 0 || jump ? "M" : "L"}${px(lon)},${py(lat)}`;
    });
    body += `<path d="${piece}" fill="none" stroke="#ffffff" stroke-width="3"/><path d="${piece}" fill="none" stroke="${C.act}" stroke-width="1.5"/>`;
  }
  places.forEach((place, index) => {
    const cx = px(place.lon);
    const cy = py(place.lat);
    body += `<circle cx="${cx}" cy="${cy}" r="2.8" fill="${C.act}" stroke="#ffffff" stroke-width="1"/>`;
    const rightSide = cx < width - 90;
    body += svgText(rightSide ? cx + 5 : cx - 5, cy + (index === 0 ? -4 : 9), place.name, {
      size: 7,
      bold: true,
      anchor: rightSide ? "start" : "end",
    });
  });
  body += "</g>";
  body += `<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="${C.muted}" stroke-width="0.6"/>`;
  return drawing(width, height, body);
}

/** The key under the world sketch. */
export function greyLineKey(width: number): Drawing {
  let body = "";
  let x = 0;
  const item = (swatch: string, words: string) => {
    body += swatch + svgText(x + 16, 9, words, { size: 7 });
    x += 16 + words.length * 3.7 + 14;
  };
  item(`<rect x="${x}" y="2" width="11" height="8" fill="#eaf2f8" stroke="${C.rule}" stroke-width="0.6"/>`, "day");
  item(`<line x1="${x}" y1="6" x2="${x + 11}" y2="6" stroke="${C.warn}" stroke-width="1.6"/>`, "grey line: the Sun rising or setting");
  item(
    `<rect x="${x}" y="2" width="11" height="8" fill="${NIGHT[0]}" fill-opacity="0.32"/><rect x="${x + 5.5}" y="2" width="5.5" height="8" fill="${NIGHT[3]}" fill-opacity="0.9"/>`,
    "twilight, then night",
  );
  item(`<circle cx="${x + 5}" cy="6" r="3.5" fill="#f2c14e" stroke="${C.warnInk}" stroke-width="0.8"/>`, "Sun overhead");
  item(`<line x1="${x}" y1="6" x2="${x + 11}" y2="6" stroke="${C.act}" stroke-width="1.6"/>`, "the path");
  return drawing(width, 13, body);
}
