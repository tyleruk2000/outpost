/**
 * The line-of-sight tool's words and drawing, apart from React: the bands on offer,
 * what is remembered between visits, the result said in sentences, and the paths its
 * chart draws. The sums themselves are in `@outpost/shared`, where the server's tests
 * check them.
 */
import { FRESNEL_GUIDE, type SightResult, type SightSample, type TerrainProfile } from "@outpost/shared";
import { formatHeight } from "@/lib/heights";
import { formatDistance } from "../lib/geo";

// ── What is asked ───────────────────────────────────────────────────────────

/**
 * A frequency near the middle of each band, which is all the Fresnel zone needs: its
 * radius changes by a few per cent from one edge of a band to the other. The amateur
 * bands are the ones in the United Kingdom licence (see the bundled band sheet).
 */
export const BANDS = [
  { id: "10m", name: "10 m", mhz: 29 },
  { id: "6m", name: "6 m", mhz: 51 },
  { id: "4m", name: "4 m", mhz: 70.25 },
  { id: "2m", name: "2 m", mhz: 145 },
  { id: "70cm", name: "70 cm", mhz: 435 },
  { id: "pmr446", name: "PMR446", mhz: 446.1 },
  { id: "23cm", name: "23 cm", mhz: 1297 },
  { id: "13cm", name: "13 cm", mhz: 2320 },
] as const;

export type BandId = (typeof BANDS)[number]["id"] | "other";

export const MIN_MHZ = 1;
export const MAX_MHZ = 100_000;
export const MAX_ANTENNA_METERS = 1000;

/** Both antennas at once: a handheld held at about head height, or an antenna on a mast. */
export const ANTENNA_PRESETS = [
  { meters: 1.5, label: "Handhelds, 1.5 m" },
  { meters: 10, label: "Masts, 10 m" },
] as const;

/** What the tool remembers in this browser: the heights and the band last used. */
export interface SightSettings {
  antennaFrom: number;
  antennaTo: number;
  band: BandId;
  /** The frequency typed for "Another frequency", in MHz. */
  otherMHz: number;
}

export const DEFAULT_SIGHT_SETTINGS: SightSettings = { antennaFrom: 10, antennaTo: 10, band: "2m", otherMHz: 145 };
export const SIGHT_SETTINGS_KEY = "outpost.maps.sight";

const isHeight = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_ANTENNA_METERS;
export const isFrequency = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= MIN_MHZ && value <= MAX_MHZ;

export function isSightSettings(value: unknown): value is SightSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<SightSettings>;
  return (
    isHeight(settings.antennaFrom) &&
    isHeight(settings.antennaTo) &&
    isFrequency(settings.otherMHz) &&
    (settings.band === "other" || BANDS.some((band) => band.id === settings.band))
  );
}

export function frequencyOf(settings: SightSettings): number {
  return BANDS.find((band) => band.id === settings.band)?.mhz ?? settings.otherMHz;
}

/** "145 MHz", "2.32 GHz" */
export function formatFrequency(mhz: number): string {
  if (mhz >= 1000) return `${Number((mhz / 1000).toPrecision(4))} GHz`;
  return `${Number(mhz.toPrecision(4))} MHz`;
}

/**
 * A height or a clearance, without its sign: to the decimetre under ten metres, where a
 * decimetre matters, and whole metres above; or to the foot (`@/lib/heights`).
 */
export function formatMeters(meters: number): string {
  return formatHeight(Math.abs(meters), "fine");
}

/** "84%" of the zone's radius, or "2.3 times" it. */
function formatShare(share: number): string {
  if (share < 1) return `${Math.max(0, Math.round(share * 100))}%`;
  return `${share >= 10 ? Math.round(share) : share.toFixed(1)} times`;
}

// ── What is said ────────────────────────────────────────────────────────────

export interface SightReading {
  tone: "success" | "warning" | "danger" | "info";
  /** The answer in a word or a few. */
  title: string;
  /** The answer in full: what is in the way or how much is clear, and what the answer rests on. */
  sentences: string[];
  /** A place along the path worth marking on the chart and the map, with a short label. */
  mark: { distanceMeters: number; label: string } | null;
}

const GUIDE = `${Math.round(FRESNEL_GUIDE * 100)}%`;

/** Each stretch of the path with no terrain, in words: "from 4.20 km to 6.90 km". */
export function describeGaps(profile: TerrainProfile): string {
  const stretch = (gap: TerrainProfile["gaps"][number]) =>
    gap.endMeters - gap.startMeters < profile.stepMeters * 1.5
      ? `around ${formatDistance(gap.startMeters)}`
      : `from ${formatDistance(gap.startMeters)} to ${formatDistance(gap.endMeters)}`;
  const shown = profile.gaps.slice(0, 3).map(stretch);
  const more = profile.gaps.length - shown.length;
  const list = shown.length <= 1 ? shown.join("") : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
  return more > 0 ? `${list}, and in ${more} more ${more === 1 ? "place" : "places"}` : list;
}

/** The result of a check in words. Never more certain than the terrain it was made from. */
export function readSight(profile: TerrainProfile, result: SightResult): SightReading {
  const tightest = result.tightest;
  const zone = tightest
    ? `${formatDistance(tightest.distanceMeters)} from A, where the ray passes ${formatMeters(tightest.clearanceMeters)} above the ground and the zone's radius is ${formatMeters(tightest.fresnelRadiusMeters)}`
    : "";
  const missing = `No terrain is installed ${describeGaps(profile)} from A.`;

  switch (result.verdict) {
    case "no-terrain":
      return {
        tone: "info",
        title: "No terrain here",
        sentences: [
          "No terrain is installed along this path, so the ground between the two points is not known and there is nothing to check.",
          "Terrain comes with a map region: download one for this area with its terrain under Offline maps.",
        ],
        mark: null,
      };
    case "end-unknown": {
      const where = result.missingEnd === "both" ? "either end of the path" : result.missingEnd === "from" ? "A" : "B";
      return {
        tone: "warning",
        title: "Not known",
        sentences: [
          `No terrain is installed under ${where}, so there is no ground to stand ${result.missingEnd === "both" ? "the antennas" : "that antenna"} on and no line to draw.`,
          "Move the point onto terrain you have, or download terrain for that area under Offline maps.",
        ],
        mark: null,
      };
    }
    case "blocked": {
      const blocked = result.obstruction!;
      const one = blocked.lastMeters - blocked.firstMeters < profile.stepMeters * 1.5;
      return {
        tone: "danger",
        title: "Blocked",
        sentences: [
          `Ground stands in the way. At its worst, ${formatDistance(blocked.distanceMeters)} from A, it is ${formatMeters(blocked.depthMeters)} above the straight line between the antennas.`,
          one
            ? "That is the only place it rises above the line."
            : `It is above the line for ${formatDistance(blocked.blockedMeters)} of the path, between ${formatDistance(blocked.firstMeters)} and ${formatDistance(blocked.lastMeters)} from A.`,
          ...(profile.coverage === "partial"
            ? [`${missing} That does not change the answer: the ground that is known is already in the way.`]
            : []),
        ],
        mark: { distanceMeters: blocked.distanceMeters, label: `${formatMeters(blocked.depthMeters)} in the way` },
      };
    }
    case "incomplete":
      return {
        tone: "warning",
        title: "Not known",
        sentences: [
          `${missing} That is ${Math.max(1, Math.round((1 - result.knownShare) * 100))}% of the path, and a hill there would not be seen.`,
          tightest
            ? `Nothing is in the way along the rest of it. There, the least of the first Fresnel zone is clear ${zone}: ${formatShare(tightest.share)}${tightest.share < 1 ? " of" : ""} that radius.`
            : "Nothing is in the way along the rest of it.",
        ],
        mark: null,
      };
    case "fresnel":
      return {
        tone: "warning",
        title: "In sight, with the Fresnel zone partly blocked",
        sentences: [
          `Nothing stands in the way of the straight line between the antennas, but the ground comes close to it. The least of the first Fresnel zone is clear ${zone}.`,
          `That is ${formatShare(tightest!.share)} of the radius clear, where the usual guide asks for ${GUIDE}. Below that, ground this close generally costs signal.`,
        ],
        mark: { distanceMeters: tightest!.distanceMeters, label: `${formatShare(tightest!.share)} clear` },
      };
    case "clear":
      return {
        tone: "success",
        title: "Clear",
        sentences: [
          tightest
            ? `Nothing stands in the way, and the first Fresnel zone is clear enough all along. The least of it is clear ${zone}.`
            : "Nothing stands in the way between the two antennas.",
          ...(tightest
            ? [
                tightest.share < 1
                  ? `That is ${formatShare(tightest.share)} of the radius clear; the usual guide asks for ${GUIDE}.`
                  : `That is ${formatShare(tightest.share)} the radius; the usual guide asks for ${GUIDE} of it.`,
              ]
            : []),
        ],
        mark: tightest ? { distanceMeters: tightest.distanceMeters, label: "Tightest" } : null,
      };
  }
}

/** How fine the ground that was read is, in a sentence. */
export function describeTerrain(profile: TerrainProfile): string {
  if (!profile.terrain) return "";
  const { finestCellMeters: finest, coarsestCellMeters: coarsest } = profile.terrain;
  const round = (meters: number) => formatDistance(meters < 100 ? Math.round(meters) : Math.round(meters / 10) * 10);
  const cells = round(finest) === round(coarsest) ? `about ${round(finest)}` : `${round(finest)} to ${round(coarsest)}`;
  const step = `Ground read every ${round(profile.stepMeters)} from installed terrain whose cells are ${cells} wide here`;
  // On a long path the step is wider than the finest terrain, and the heights are averages over more ground.
  return profile.stepMeters > finest * 1.5 && profile.stepMeters > 30
    ? `${step}. On a path this long each height stands for a wider piece of ground, so a narrow ridge reads lower than it is.`
    : `${step}.`;
}

// ── What is drawn ───────────────────────────────────────────────────────────

/** One column of the chart: the samples that fall on one pixel, drawn at the highest ground among them. */
export interface ChartColumn {
  /** The sample this column stands for. */
  index: number;
  distanceMeters: number;
  /** Ground with the Earth's curve added, as drawn; null where no terrain is installed. */
  drawnGround: number | null;
}

export interface SightChartGeometry {
  x(distanceMeters: number): number;
  y(drawnHeight: number): number;
  columns: ChartColumn[];
  /** The ground: a closed shape and its top edge for each run of known terrain. */
  ground: Array<{ area: string; line: string }>;
  /** Runs with no terrain, as pixel spans. */
  gaps: Array<{ x1: number; x2: number }>;
  ray: string;
  /** The first Fresnel zone: a closed shape around the ray. */
  zone: string;
  /** Sea level as this chart draws it (lifted by the curve), when it is within the chart's range of heights. */
  seaLevel: string | null;
  /** The lowest and highest heights on the chart's scale. */
  floor: number;
  ceiling: number;
}

/**
 * The chart's paths inside a box of `width` × `height`, with `pad` kept clear. Heights
 * are drawn with the Earth's curve added to the ground, so that the ray is a straight
 * line: the same picture as a curved Earth under a straight ray, with the curve moved
 * into the ground. No more columns are drawn than there are pixels; where several
 * samples share one, the highest ground among them is the one drawn, so a ridge is
 * never thinned away.
 */
export function sightChartGeometry(
  samples: SightSample[],
  width: number,
  height: number,
  pad: { top: number; right: number; bottom: number; left: number },
): SightChartGeometry {
  const innerWidth = Math.max(1, width - pad.left - pad.right);
  const innerHeight = Math.max(1, height - pad.top - pad.bottom);
  const total = samples.at(-1)!.distanceMeters;

  const count = Math.max(2, Math.min(samples.length, Math.round(innerWidth)));
  const columns: ChartColumn[] = [];
  // The two ends are columns of their own, so the ground meets each mast where it stands;
  // the samples between them are shared out evenly among the other columns.
  const between = samples.length - 2;
  for (let column = 0; column < count; column += 1) {
    const inner = column - 1;
    const start = column === 0 ? 0 : column === count - 1 ? samples.length - 1 : 1 + Math.floor((inner * between) / (count - 2));
    const end = column === 0 || column === count - 1 ? start + 1 : 1 + Math.floor(((inner + 1) * between) / (count - 2));
    let best = start;
    let drawn: number | null = null;
    for (let index = start; index < end; index += 1) {
      const sample = samples[index]!;
      if (sample.groundMeters === null) continue;
      const value = sample.groundMeters + sample.bulgeMeters;
      if (drawn === null || value > drawn) {
        drawn = value;
        best = index;
      }
    }
    columns.push({ index: best, distanceMeters: samples[best]!.distanceMeters, drawnGround: drawn });
  }

  let floor = Math.min(samples[0]!.rayMeters, samples.at(-1)!.rayMeters);
  let ceiling = Math.max(samples[0]!.rayMeters, samples.at(-1)!.rayMeters);
  for (const column of columns) {
    if (column.drawnGround === null) continue;
    floor = Math.min(floor, column.drawnGround);
    ceiling = Math.max(ceiling, column.drawnGround);
  }
  for (const sample of samples) ceiling = Math.max(ceiling, sample.rayMeters + sample.fresnelRadiusMeters);
  // A little air above and below, and never a scale of no height at all.
  const margin = Math.max(1, (ceiling - floor) * 0.06);
  floor -= margin;
  ceiling += margin;

  const x = (distanceMeters: number) => pad.left + (distanceMeters / total) * innerWidth;
  const y = (drawnHeight: number) => pad.top + (1 - (drawnHeight - floor) / (ceiling - floor)) * innerHeight;
  const base = (pad.top + innerHeight).toFixed(1);
  const at = (distanceMeters: number, drawnHeight: number) => `${x(distanceMeters).toFixed(1)},${y(drawnHeight).toFixed(1)}`;

  const ground: SightChartGeometry["ground"] = [];
  const gaps: SightChartGeometry["gaps"] = [];
  let run: ChartColumn[] = [];
  let gapStart: number | null = null;
  const closeRun = () => {
    if (run.length > 0) {
      const line = `M${run.map((column) => at(column.distanceMeters, column.drawnGround!)).join("L")}`;
      ground.push({
        line,
        area: `${line}L${x(run.at(-1)!.distanceMeters).toFixed(1)},${base}L${x(run[0]!.distanceMeters).toFixed(1)},${base}Z`,
      });
    }
    run = [];
  };
  columns.forEach((column, index) => {
    if (column.drawnGround === null) {
      closeRun();
      // A gap reaches from the last known column to the next one.
      if (gapStart === null) gapStart = index === 0 ? x(0) : x(columns[index - 1]!.distanceMeters);
      if (index === columns.length - 1) gaps.push({ x1: gapStart, x2: x(total) });
      return;
    }
    if (gapStart !== null) {
      gaps.push({ x1: gapStart, x2: x(column.distanceMeters) });
      gapStart = null;
    }
    run.push(column);
  });
  closeRun();

  // The ray is straight and the zone is smooth, so a few dozen points draw them exactly enough.
  const pieces = Math.min(samples.length - 1, 96);
  const picked = Array.from({ length: pieces + 1 }, (_, piece) => samples[Math.round((piece * (samples.length - 1)) / pieces)]!);
  const upper = picked.map((sample) => at(sample.distanceMeters, sample.rayMeters + sample.fresnelRadiusMeters));
  const lower = picked.map((sample) => at(sample.distanceMeters, sample.rayMeters - sample.fresnelRadiusMeters)).reverse();
  const highestSea = Math.max(...picked.map((sample) => sample.bulgeMeters));

  return {
    x,
    y,
    columns,
    ground,
    gaps,
    ray: `M${at(0, samples[0]!.rayMeters)}L${at(total, samples.at(-1)!.rayMeters)}`,
    zone: `M${upper.join("L")}L${lower.join("L")}Z`,
    seaLevel: highestSea > floor ? `M${picked.map((sample) => at(sample.distanceMeters, sample.bulgeMeters)).join("L")}` : null,
    floor,
    ceiling,
  };
}

/** The column nearest a distance along the path. */
export function columnAt(columns: ChartColumn[], distanceMeters: number): ChartColumn {
  let low = 0;
  let high = columns.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (columns[middle]!.distanceMeters <= distanceMeters) low = middle;
    else high = middle;
  }
  const a = columns[low]!;
  const b = columns[high]!;
  return Math.abs(a.distanceMeters - distanceMeters) <= Math.abs(b.distanceMeters - distanceMeters) ? a : b;
}

/** What the chart says about one sample: where it is, the ground, the ray, and what is clear between them. */
export function describeSample(sample: SightSample, fromName = "A"): string {
  const where = `${formatDistance(sample.distanceMeters)} from ${fromName}`;
  if (sample.groundMeters === null || sample.clearanceMeters === null) return `${where}: no terrain installed here`;
  const ground = `ground ${formatHeight(sample.groundMeters)}`;
  if (sample.clearanceMeters < 0) return `${where}: ${ground}, ${formatMeters(sample.clearanceMeters)} above the ray`;
  const clear = `${where}: ${ground}, ray ${formatMeters(sample.clearanceMeters)} above it`;
  return sample.fresnelRadiusMeters > 0 ? `${clear}, Fresnel radius ${formatMeters(sample.fresnelRadiusMeters)}` : clear;
}
