/**
 * The ground a settlement stands on: drawn up from a seed and a kind of land, the same on
 * every device and every time, or (for a settlement founded before lands could be chosen)
 * Ashgill's small fixed valley.
 *
 * The generator is plain value noise in a few octaves for height and wetness, a river that
 * meanders from north to south, lakes in the hollows, the sea along the west of a coast,
 * and deposits of rock, clay, coal and ore in their own noise. Then it finds a place to
 * found the settlement, and makes sure woods, rock and clay lie within reach of it, so
 * that a new settlement is never stuck.
 */
import { LAND_IDS, LANDS, type LandId } from "./lands.ts";

export const LAND_IDS_SET: ReadonlySet<string> = new Set(LAND_IDS);

export const TERRAIN_IDS = ["meadow", "woods", "rock", "clay", "river", "hill", "coal", "ore", "water"] as const;
export type TerrainId = (typeof TERRAIN_IDS)[number];

/** How a settlement's ground is found again: the land and the seed, or Ashgill's fixed valley. */
export interface SteadingMap {
  land: LandId;
  seed: string;
  /** Ashgill, the 10 by 14 valley of the first settlements. */
  legacy?: boolean;
}

export interface Ground {
  width: number;
  height: number;
  /** The index in TERRAIN_IDS of each square, row by row. */
  tiles: Uint8Array;
  /** Where the storehouse of a new settlement stands. */
  start: { x: number; y: number };
}

/** A generated map is this many squares each way. */
export const MAP_SIZE = 48;

// ── Ashgill ─────────────────────────────────────────────────────────────────

const TERRAIN_CHARS: Record<string, TerrainId> = {
  ".": "meadow",
  T: "woods",
  R: "rock",
  C: "clay",
  "~": "river",
  "^": "hill",
  K: "coal",
};

/**
 * Ashgill, the valley of the first settlements, west to east and north to south: woods on
 * the west side, a rock outcrop or two, clay banks along the river on the east, and a coal
 * seam in the fell at the head of the valley. There is no ore: it comes up the river.
 */
export const VALLEY_ROWS = [
  "TTT..^K^^~",
  "TT.....^.~",
  "T........~",
  "TT...RR..~",
  "T....R...~",
  "........C~",
  "T.......C~",
  "TT.......~",
  "T........~",
  ".........~",
  "T........~",
  "RR......C~",
  "R.......C~",
  "TT.......~",
] as const;
export const VALLEY_WIDTH = 10;
export const VALLEY_HEIGHT = VALLEY_ROWS.length;
export const ASHGILL: SteadingMap = { land: "valley", seed: "ashgill", legacy: true };

function ashgill(): Ground {
  const tiles = new Uint8Array(VALLEY_WIDTH * VALLEY_HEIGHT);
  for (let y = 0; y < VALLEY_HEIGHT; y++)
    for (let x = 0; x < VALLEY_WIDTH; x++)
      tiles[y * VALLEY_WIDTH + x] = TERRAIN_IDS.indexOf(TERRAIN_CHARS[VALLEY_ROWS[y]?.[x] ?? "."] ?? "meadow");
  return { width: VALLEY_WIDTH, height: VALLEY_HEIGHT, tiles, start: { x: 4, y: 7 } };
}

// ── Seeds ───────────────────────────────────────────────────────────────────

/** A seed as kept and shown: lower case letters, digits and hyphens, at most 24. */
export function cleanSeed(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

const SEED_WORDS = [
  "ash",
  "beck",
  "birch",
  "brook",
  "cairn",
  "crag",
  "dale",
  "fern",
  "fold",
  "gill",
  "heath",
  "holm",
  "how",
  "knott",
  "lea",
  "mere",
  "moss",
  "oak",
  "pike",
  "rigg",
  "scar",
  "tarn",
  "thorn",
  "wold",
] as const;

/** A seed that is easy to read out, from any whole number (the screen gives it a random one). */
export function seedFromNumber(n: number): string {
  const v = Math.abs(Math.floor(n)) >>> 0;
  const a = SEED_WORDS[v % SEED_WORDS.length];
  const b = SEED_WORDS[Math.floor(v / SEED_WORDS.length) % SEED_WORDS.length];
  return `${a}-${b}-${(Math.floor(v / 576) % 1000).toString().padStart(3, "0")}`;
}

/** FNV-1a: a seed's text as a 32-bit number. */
function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A number in [0, 1) from a seed and three integers, the same every time. */
function hash3(seed: number, a: number, b: number, c: number): number {
  let h = seed ^ Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise in [0, 1], `octaves` layers from a cell of `scale` squares. */
function noise(seed: number, layer: number, x: number, y: number, scale: number, octaves: number): number {
  let total = 0;
  let weight = 0;
  let amp = 1;
  let s = scale;
  for (let o = 0; o < octaves; o++) {
    const fx = x / s;
    const fy = y / s;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const k = layer * 16 + o;
    const v00 = hash3(seed, ix, iy, k);
    const v10 = hash3(seed, ix + 1, iy, k);
    const v01 = hash3(seed, ix, iy + 1, k);
    const v11 = hash3(seed, ix + 1, iy + 1, k);
    const top = v00 + (v10 - v00) * tx;
    const bottom = v01 + (v11 - v01) * tx;
    total += amp * (top + (bottom - top) * ty);
    weight += amp;
    amp *= 0.5;
    s /= 2;
  }
  return total / weight;
}

// ── The generator ───────────────────────────────────────────────────────────

const T = Object.fromEntries(TERRAIN_IDS.map((id, i) => [id, i])) as Record<TerrainId, number>;

function generate(land: LandId, seedText: string): Ground {
  const n = MAP_SIZE;
  const seed = hashText(`${land}:${seedText}`);
  const p = LANDS[land].map;
  const tiles = new Uint8Array(n * n);
  const height = new Float32Array(n * n);
  const wet = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let h = noise(seed, 1, x, y, 16, 4);
      // A valley shape: the middle lower than the edges, so that fells ring the land.
      const dx = (x - n / 2) / (n / 2);
      h = 0.8 * h + 0.25 * Math.min(1, Math.abs(dx) ** 2);
      if (p.sea > 0) h = Math.min(h, h * 0.4 + 0.6 * Math.min(1, x / (n * p.sea * 2.2)));
      height[y * n + x] = h;
      wet[y * n + x] = noise(seed, 2, x, y, 10, 3);
    }
  for (let i = 0; i < n * n; i++) {
    const h = height[i] as number;
    tiles[i] = h > p.hill ? T.hill : T.meadow;
  }
  // The sea along the west of a coast.
  if (p.sea > 0)
    for (let y = 0; y < n; y++) {
      const shore = Math.round(n * p.sea + (noise(seed, 3, 0, y, 8, 2) - 0.5) * 8);
      for (let x = 0; x < shore; x++) tiles[y * n + x] = T.water;
    }
  // Lakes in the hollows.
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (tiles[i] === T.meadow && noise(seed, 11, x, y, 9, 2) < p.lake) tiles[i] = T.water;
    }
  // The river: from the north edge to the south, meandering, one or two squares wide.
  const riverAt = new Int16Array(n).fill(-1);
  if (p.river) {
    const base = Math.round(n * (p.sea > 0 ? 0.62 : 0.5) + (hash3(seed, 7, 7, 7) - 0.5) * n * 0.3);
    let last = -1;
    for (let y = 0; y < n; y++) {
      let x = Math.round(base + (noise(seed, 4, 0, y, 14, 3) - 0.5) * n * 0.45);
      x = Math.max(2, Math.min(n - 3, x));
      // Keep the river joined: no jump of more than a square from one row to the next.
      if (last >= 0) {
        const step = Math.sign(x - last);
        for (let k = last; k !== x; k += step) tiles[y * n + k] = T.river;
      }
      tiles[y * n + x] = T.river;
      if (noise(seed, 5, x, y, 6, 1) > 0.6 && x + 1 < n) tiles[y * n + x + 1] = T.river;
      riverAt[y] = x;
      last = x;
    }
  }
  const nearWater = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const t = tileAt(tiles, n, n, x + dx, y + dy);
        if (t === T.river || t === T.water) return true;
      }
    return false;
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const t = tiles[i];
      const h = height[i] as number;
      if (t === T.hill) {
        if (noise(seed, 6, x, y, 5, 2) > p.coal) tiles[i] = T.coal;
        else if (noise(seed, 7, x, y, 5, 2) > p.ore) tiles[i] = T.ore;
        continue;
      }
      if (t !== T.meadow) continue;
      if (noise(seed, 8, x, y, 4, 2) > p.rock - (h > p.hill - 0.1 ? 0.12 : 0)) tiles[i] = T.rock;
      else if (noise(seed, 7, x, y, 5, 2) > p.ore + 0.04 && h > p.hill - 0.16) tiles[i] = T.ore;
      else if (nearWater(x, y, 1) && noise(seed, 9, x, y, 4, 2) > p.clay) tiles[i] = T.clay;
      else if (p.woods <= 1 && (wet[i] as number) > p.woods) tiles[i] = T.woods;
      else if (p.woods > 1 && nearWater(x, y, 2) && noise(seed, 10, x, y, 3, 2) > 0.55) tiles[i] = T.woods;
    }
  const start = findStart(tiles, n, seed);
  ensureNear(tiles, n, start, seed);
  return { width: n, height: n, tiles, start };
}

const tileAt = (tiles: Uint8Array, w: number, h: number, x: number, y: number) =>
  x < 0 || y < 0 || x >= w || y >= h ? -1 : (tiles[y * w + x] as number);

/** The squares the first buildings stand on, relative to the storehouse. */
export const FOUNDING_LAYOUT = [
  { kind: "storehouse", dx: 0, dy: 0 },
  { kind: "house", dx: -1, dy: 1 },
  { kind: "house", dx: 1, dy: 1 },
  { kind: "well", dx: 0, dy: 2 },
] as const;

function findStart(tiles: Uint8Array, n: number, seed: number): { x: number; y: number } {
  let best = { x: Math.floor(n / 2), y: Math.floor(n / 2) };
  let bestScore = Number.POSITIVE_INFINITY;
  const nearest = (x: number, y: number, kind: number, cap: number) => {
    for (let r = 1; r <= cap; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (tileAt(tiles, n, n, x + dx, y + dy) === kind) return r;
        }
    return cap + 4;
  };
  for (let y = 4; y < n - 6; y++)
    for (let x = 4; x < n - 4; x++) {
      // The block round the first buildings must be open ground.
      let open = true;
      for (let dy = -1; dy <= 3 && open; dy++)
        for (let dx = -2; dx <= 2 && open; dx++) if (tileAt(tiles, n, n, x + dx, y + dy) !== T.meadow) open = false;
      if (!open) continue;
      const centre = Math.max(Math.abs(x - n / 2), Math.abs(y - n / 2));
      const score =
        nearest(x, y, T.woods, 8) +
        nearest(x, y, T.rock, 10) +
        nearest(x, y, T.clay, 10) +
        0.5 * Math.min(nearest(x, y, T.river, 12), nearest(x, y, T.water, 12)) +
        0.35 * centre +
        hash3(seed, x, y, 99) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  return best;
}

/** Woods, rock and clay within a few squares of the start, made where the land has none near. */
function ensureNear(tiles: Uint8Array, n: number, start: { x: number; y: number }, seed: number): void {
  const want: [number, number][] = [
    [T.woods, 3],
    [T.rock, 2],
    [T.clay, 2],
  ];
  const reserved = (x: number, y: number) => x >= start.x - 2 && x <= start.x + 2 && y >= start.y - 1 && y <= start.y + 3;
  for (const [kind, count] of want) {
    let have = 0;
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) if (tileAt(tiles, n, n, start.x + dx, start.y + dy) === kind) have++;
    // Make the rest in a little patch at a seeded bearing, four to six squares out.
    const angle = hash3(seed, kind, 1, 2) * Math.PI * 2;
    const cx = Math.round(start.x + Math.cos(angle) * 5);
    const cy = Math.round(start.y + 1 + Math.sin(angle) * 5);
    for (let r = 0; have < count && r <= 3; r++)
      for (let dy = -r; dy <= r && have < count; dy++)
        for (let dx = -r; dx <= r && have < count; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (tileAt(tiles, n, n, x, y) !== T.meadow || reserved(x, y)) continue;
          tiles[y * n + x] = kind;
          have++;
        }
  }
}

// ── Reading the ground ──────────────────────────────────────────────────────

const cache = new Map<string, Ground>();

/** The ground of a settlement's map, worked out once and kept. */
export function groundOf(map: SteadingMap): Ground {
  const key = map.legacy ? "ashgill" : `${map.land}:${map.seed}`;
  let ground = cache.get(key);
  if (!ground) {
    ground = map.legacy ? ashgill() : generate(map.land, map.seed);
    if (cache.size > 16) cache.clear();
    cache.set(key, ground);
  }
  return ground;
}

export function terrainAt(map: SteadingMap, x: number, y: number): TerrainId | null {
  const ground = groundOf(map);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const t = tileAt(ground.tiles, ground.width, ground.height, x, y);
  return t < 0 ? null : (TERRAIN_IDS[t] ?? null);
}

/** Squares apart, a step to any of the eight neighbours counting one. */
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Whether any square within `reach` of (x, y) is of this ground. */
export function groundNear(map: SteadingMap, x: number, y: number, kinds: readonly TerrainId[], reach: number): boolean {
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const t = terrainAt(map, x + dx, y + dy);
      if (t && kinds.includes(t)) return true;
    }
  return false;
}
