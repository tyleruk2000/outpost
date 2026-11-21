/**
 * What the night-sky screen draws, worked out from the sky in `@outpost/shared/sky`:
 * where each star and planet falls on a round chart of the whole sky, the short lists of
 * what is up, and the view towards the pole for finding north. Pure, so the tests can
 * hold a known case to a known answer in both hemispheres.
 */
import { compassPoint } from "@outpost/shared";
import { CONSTELLATION_FIGURES, type PoleFinding, poleFinding, type SkyObject, skyAt, starByName } from "@outpost/shared/sky";

const DEG = Math.PI / 180;

/**
 * A point on the round chart, radius 1: the zenith at the centre, the horizon at the rim,
 * north at the top. Held overhead and looked up at, east is then on the left and west on
 * the right, as on any star chart. Equal steps of altitude are equal steps of radius.
 */
export function chartPoint(altitude: number, azimuth: number): [number, number] {
  const r = (90 - altitude) / 90;
  return [-r * Math.sin(azimuth * DEG), -r * Math.cos(azimuth * DEG)];
}

export interface ChartModel {
  stars: Array<{ key: string; name: string | null; magnitude: number; at: [number, number]; navigational: boolean }>;
  lines: Array<{ key: string; from: [number, number]; to: [number, number] }>;
  bodies: Array<{ key: string; name: string; kind: SkyObject["kind"]; at: [number, number]; magnitude: number }>;
  /** The Sun above the horizon (the stars cannot then be seen), or below by how much. */
  sunAltitude: number;
}

/** The chart for a moment and a place: stars up to the faintest magnitude asked for, the figures whose two ends are both up, and the bodies. */
export function chartModel(sky: SkyObject[], faintest = 4.5): ChartModel {
  const up = new Map<number, [number, number]>();
  const stars: ChartModel["stars"] = [];
  const bodies: ChartModel["bodies"] = [];
  let sunAltitude = -90;
  for (const object of sky) {
    if (object.kind === "sun") sunAltitude = object.apparentAltitude;
    if (object.apparentAltitude < 0) continue;
    const at = chartPoint(object.apparentAltitude, object.azimuth);
    if (object.kind === "star" && object.star) {
      up.set(object.star.hr, at);
      if (object.magnitude <= faintest)
        stars.push({ key: object.key, name: object.name, magnitude: object.magnitude, at, navigational: object.star.navNumber !== null });
    } else if (object.kind !== "star") {
      bodies.push({ key: object.key, name: object.name ?? object.key, kind: object.kind, at, magnitude: object.magnitude });
    }
  }
  const lines: ChartModel["lines"] = [];
  for (const figure of CONSTELLATION_FIGURES) {
    for (const [a, b] of figure.pairs) {
      const from = up.get(a);
      const to = up.get(b);
      if (from && to) lines.push({ key: `${figure.abbr}-${a}-${b}`, from, to });
    }
  }
  return { stars, lines, bodies, sunAltitude };
}

export interface UpNow {
  key: string;
  name: string;
  kind: SkyObject["kind"];
  magnitude: number;
  altitude: number;
  azimuth: number;
  /** "Low in the SW, 12° up". */
  where: string;
}

const describe = (object: SkyObject): string => {
  const point = compassPoint(object.azimuth);
  const alt = Math.round(object.apparentAltitude);
  const height = alt >= 70 ? "Nearly overhead" : alt < 15 ? `Low in the ${point}` : `In the ${point}`;
  return `${height}, ${alt}° up`;
};

/** The Moon and the planets above the horizon, and the brightest named stars, brightest first. */
export function upNow(sky: SkyObject[], stars = 10): { bodies: UpNow[]; stars: UpNow[] } {
  const row = (object: SkyObject): UpNow => ({
    key: object.key,
    name: object.name ?? object.key,
    kind: object.kind,
    magnitude: object.magnitude,
    altitude: object.apparentAltitude,
    azimuth: object.azimuth,
    where: describe(object),
  });
  const visible = sky.filter((o) => o.apparentAltitude > 0);
  return {
    bodies: visible.filter((o) => o.kind === "moon" || o.kind === "planet").map(row),
    stars: visible
      .filter((o) => o.kind === "star" && o.name)
      .sort((a, b) => a.magnitude - b.magnitude)
      .slice(0, stars)
      .map(row),
  };
}

/** Which constellations of the figures have most of their stars up, by name. */
export function constellationsUp(sky: SkyObject[]): string[] {
  const up = new Set(sky.filter((o) => o.kind === "star" && o.apparentAltitude > 5 && o.star).map((o) => o.star!.hr));
  return CONSTELLATION_FIGURES.filter((figure) => {
    const hrs = new Set(figure.pairs.flat());
    let count = 0;
    for (const hr of hrs) if (up.has(hr)) count++;
    return count / hrs.size >= 0.75;
  }).map((figure) => figure.name);
}

export interface PoleView {
  finding: PoleFinding;
  /** Points in the plane facing the pole: x to the right, y up, in units where 1 is 45° from the pole. Null when below the horizon. */
  stars: Array<{ name: string | null; magnitude: number; at: [number, number] | null; key: string }>;
  lines: Array<{ from: [number, number]; to: [number, number] }>;
  /** The method's pointer pair, from the first to the second, and where the pole is. */
  pointers: { from: [number, number] | null; to: [number, number] | null };
  pole: [number, number];
  /** The horizon across the view, left to right. */
  horizon: Array<[number, number]>;
  /** The figures drawn, by name. */
  figures: string[];
}

/**
 * The view towards the pole of the sky, as a person facing it sees it: a gnomonic
 * projection centred on the pole, so that a straight line through two stars on the sky
 * stays straight in the drawing, and the pointers really point at the pole. In the north
 * the Plough and Cassiopeia round Polaris; in the south, the Southern Cross.
 */
export function poleView(ms: number, latitude: number, longitude: number): PoleView {
  const finding = poleFinding(ms, latitude, longitude);
  const north = finding.hemisphere === "north";
  const phi = Math.abs(latitude) * DEG;
  // Horizon frame: x north, y east, z up.
  const P = north ? [Math.cos(phi), 0, Math.sin(phi)] : [-Math.cos(phi), 0, Math.sin(phi)];
  const R = north ? [0, 1, 0] : [0, -1, 0];
  const U = [P[1]! * R[2]! - P[2]! * R[1]!, P[2]! * R[0]! - P[0]! * R[2]!, P[0]! * R[1]! - P[1]! * R[0]!];
  const project = (altitude: number, azimuth: number): [number, number] | null => {
    const v = [
      Math.cos(altitude * DEG) * Math.cos(azimuth * DEG),
      Math.cos(altitude * DEG) * Math.sin(azimuth * DEG),
      Math.sin(altitude * DEG),
    ];
    const d = v[0]! * P[0]! + v[1]! * P[1]! + v[2]! * P[2]!;
    if (d < 0.35) return null;
    return [(v[0]! * R[0]! + v[1]! * R[1]! + v[2]! * R[2]!) / d, (v[0]! * U[0]! + v[1]! * U[1]! + v[2]! * U[2]!) / d];
  };
  const sky = skyAt(ms, latitude, longitude);
  const figureNames = north ? ["UMa", "Cas", "UMi"] : ["Cru", "Cen"];
  const figures = CONSTELLATION_FIGURES.filter((f) => figureNames.includes(f.abbr));
  const byHr = new Map(sky.filter((o) => o.star).map((o) => [o.star!.hr, o]));
  const at = (o: SkyObject | undefined) => (o && o.apparentAltitude > 0 ? project(o.apparentAltitude, o.azimuth) : null);
  const hrs = new Set(figures.flatMap((f) => f.pairs.flat()));
  const stars = [...hrs].map((hr) => {
    const o = byHr.get(hr);
    return { name: o?.name ?? null, magnitude: o?.magnitude ?? 6, at: at(o), key: `hr:${hr}` };
  });
  const lines: PoleView["lines"] = [];
  for (const figure of figures)
    for (const [a, b] of figure.pairs) {
      const from = at(byHr.get(a));
      const to = at(byHr.get(b));
      if (from && to) lines.push({ from, to });
    }
  const named = (name: string) => at(sky.find((o) => o.star && o.star.hr === starByName(name)?.hr));
  const pointers = north ? { from: named("Merak"), to: named("Dubhe") } : { from: named("Gacrux"), to: named("Acrux") };
  const horizon: Array<[number, number]> = [];
  for (let offset = -80; offset <= 80; offset += 4) {
    const point = project(0, (north ? 0 : 180) + offset);
    if (point) horizon.push(point);
  }
  return {
    finding,
    stars,
    lines,
    pointers,
    pole: [0, 0],
    horizon,
    figures: figures.map((f) => f.name),
  };
}
