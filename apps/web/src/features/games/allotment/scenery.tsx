/**
 * Everything on the plot that is not a bed: the lawn, the hedge, the gravel paths, the
 * fence and gate, the flower border, the shed, the tap and the barrow, and the six
 * lasting things, drawn as what they are once bought and as pegged-out ground before.
 * The season dresses it (blossom, fallen leaves, frost and a little snow) and the time
 * of day lights it: shadows that lengthen when the sun is low, and a lit shed window
 * under a blue night.
 */
import type { Season } from "@outpost/shared/games/allotment";
import type { ReactNode } from "react";
import { type Box, circles, leafShape, scatter, strokes, type Tone, tuft, v } from "./paint";

export const VIEW = { width: 360, height: 432 };

/** The fixed places on the plot. */
export const AT = {
  shed: { x: 10, y: 12, w: 62, h: 78 },
  waterButt: { x: 72, y: 46, w: 46, h: 46 },
  compostBin: { x: 118, y: 44, w: 46, h: 48 },
  greenhouse: { x: 192, y: 10, w: 156, h: 84 },
  hens: { x: 10, y: 334, w: 148, h: 76 },
  beehive: { x: 198, y: 336, w: 52, h: 72 },
  appleTree: { x: 256, y: 332, w: 94, h: 80 },
} satisfies Record<string, Box>;

const lawnKeep = (x: number, y: number) => x > 9 && x < 351 && y > 9 && y < 418;

// ── The ground, made once ──────────────────────────────────────────────────

const TUFTS = strokes(scatter(11, 90, { x: 0, y: 0, w: 360, h: 432 }).flatMap(([x, y, rng]) => tuft(x, y, 0.8 + rng() * 0.6)));
const DAISIES = scatter(23, 26, { x: 12, y: 12, w: 336, h: 400 }, lawnKeep).map(([x, y]) => [x, y, 1.3] as const);
const FALLEN = scatter(37, 46, { x: 0, y: 0, w: 360, h: 432 })
  .map(([x, y, rng]) => leafShape(x, y, rng() * 6.3, 1.9, 1))
  .join("");
const FROST = circles(scatter(41, 150, { x: 0, y: 0, w: 360, h: 432 }).map(([x, y, rng]) => [x, y, 0.45 + rng() * 0.5]));

/** The gravel paths: along the top, along the bottom, and out to the gate. */
const GRAVEL: Box[] = [
  { x: 9, y: 97, w: 342, h: 10 },
  { x: 9, y: 320, w: 342, h: 10 },
  { x: 164, y: 330, w: 28, h: 89 },
];
const STONES = GRAVEL.flatMap((box, i) => scatter(50 + i, Math.round((box.w * box.h) / 26), box));
const STONE_DARK = circles(STONES.filter((_, i) => i % 3 === 0).map(([x, y, rng]) => [x, y, 0.5 + rng() * 0.6]));
const STONE_LIGHT = circles(STONES.filter((_, i) => i % 3 === 1).map(([x, y, rng]) => [x, y, 0.5 + rng() * 0.5]));
/** Stepping stones down the middle, between the beds. */
const STEPS = Array.from({ length: 16 }, (_, i) => ({ x: 172.5 + (i % 2) * 0.8, y: 109.5 + i * 13.2 }));

/** A hedge round three sides: a dark mass, rounded bumps, and lit tops. */
const HEDGE_LINE: Array<[number, number]> = [
  ...Array.from({ length: 62 }, (_, i): [number, number] => [i * 6 - 3, 5]),
  ...Array.from({ length: 70 }, (_, i): [number, number] => [5, 8 + i * 6]),
  ...Array.from({ length: 70 }, (_, i): [number, number] => [355, 8 + i * 6]),
];
const HEDGE_BUMPS = circles(HEDGE_LINE.map(([x, y], i) => [x + ((i * 7) % 3) - 1, y + ((i * 5) % 3) - 1, 4.6 + ((i * 13) % 5) * 0.45]));
const HEDGE_TOPS = circles(HEDGE_LINE.filter((_, i) => i % 2 === 0).map(([x, y], i) => [x - 1.4, y - 1.6, 1.6 + ((i * 3) % 4) * 0.35]));
/** Snow lying along the foot of the hedge and the fence: overlapping lumps, one drift. */
const drift = (n: number, at: (i: number) => [number, number], seed: number) =>
  Array.from({ length: n }, (_, i) => {
    const [x, y] = at(i);
    return [x, y, 2.2 + (((i + seed) * 7) % 5) * 0.32] as const;
  });
const SNOW_EDGE = circles([
  ...drift(82, (i) => [i * 4.4, 10.4], 1),
  ...drift(92, (i) => [10.2, 12 + i * 4.4], 2),
  ...drift(92, (i) => [349.8, 12 + i * 4.4], 3),
  ...drift(80, (i) => [9 + i * 4.3, 416.6], 4),
]);

/** The flower border inside the fence, a clump at a time. */
const CLUMPS = scatter(61, 34, { x: 12, y: 410, w: 336, h: 6 }, (x) => x < 158 || x > 198);
const FLOWERS: Record<Season, Tone[]> = {
  spring: ["bloom", "petal", "blossom"],
  summer: ["berry", "flower-blue", "petal", "bloom"],
  autumn: ["flower-blue", "bloom", "leaf-fall"],
  winter: ["petal"],
};
const CLUMP_LEAVES = CLUMPS.map(
  ([x, y], i) => leafShape(x - 1.6, y, -2.4 + (i % 3) * 0.3, 2.6, 1) + leafShape(x + 1.6, y, -0.7, 2.6, 1),
).join("");

/** The fence along the bottom, with a gate where the path goes out. */
const PICKETS = [...Array.from({ length: 31 }, (_, i) => 11 + i * 5), ...Array.from({ length: 31 }, (_, i) => 195 + i * 5)]
  .map((x) => `M${x} 418.5h3v8h-3z`)
  .join("");

export function Defs() {
  return (
    <defs>
      <pattern id="allotment-crumbs" width={9} height={8} patternUnits="userSpaceOnUse">
        <path
          d={circles([
            [1.5, 1.5, 0.7],
            [6, 3.4, 0.6],
            [3.2, 6.2, 0.8],
          ])}
          fill={v("soil-crumb")}
        />
        <path
          d={circles([
            [7.6, 7, 0.6],
            [4.4, 1, 0.5],
          ])}
          fill={v("soil-edge")}
        />
      </pattern>
      <pattern id="allotment-blades" width={12} height={10} patternUnits="userSpaceOnUse">
        <path d="M2 8 l-1 -3 M3 8 l1 -3.4 M8 4 l-0.8 -3 M9 4 l1 -2.6" stroke={v("grass-shade")} strokeWidth={0.7} />
      </pattern>
      <pattern id="allotment-mesh" width={5} height={5} patternUnits="userSpaceOnUse">
        <path d="M0 0 L5 5 M5 0 L0 5" stroke={v("string")} strokeWidth={0.4} opacity={0.75} />
      </pattern>
      <radialGradient id="allotment-glow">
        <stop offset="0" stopColor={v("glow")} stopOpacity={0.75} />
        <stop offset="1" stopColor={v("glow")} stopOpacity={0} />
      </radialGradient>
    </defs>
  );
}

export function Ground({ season }: { season: Season }) {
  const tones = FLOWERS[season];
  return (
    <g>
      <rect width={VIEW.width} height={VIEW.height} fill={v(`grass-${season}`)} />
      {/* Mown stripes, the way a kept lawn looks. */}
      <path d={Array.from({ length: 9 }, (_, i) => `M${i * 40 + 20} 0h20v432h-20z`).join("")} fill={v("grass-light")} />
      <rect width={VIEW.width} height={VIEW.height} fill="url(#allotment-blades)" />
      <path d={TUFTS} stroke={v("grass-shade")} strokeWidth={0.8} strokeLinecap="round" />
      {season === "spring" || season === "summer" ? (
        <>
          <path d={circles(DAISIES.slice(0, season === "spring" ? 14 : 26))} fill={v("petal")} />
          <path d={circles(DAISIES.slice(0, season === "spring" ? 14 : 26).map(([x, y]) => [x, y, 0.5]))} fill={v("bloom")} />
        </>
      ) : null}
      {season === "autumn" ? <path d={FALLEN} fill={v("leaf-fall")} opacity={0.85} /> : null}
      {season === "winter" ? <path d={FROST} fill={v("frost")} /> : null}
      {/* Gravel. */}
      {GRAVEL.map((box) => (
        <rect key={`${box.x}-${box.y}`} x={box.x} y={box.y} width={box.w} height={box.h} rx={2} fill={v("path")} />
      ))}
      <path d={STONE_DARK} fill={v("path-stone")} />
      <path d={STONE_LIGHT} fill={v("path-edge")} opacity={0.6} />
      <path d={GRAVEL.map(({ x, y, w, h }) => `M${x} ${y}h${w}M${x} ${y + h}h${w}`).join("")} stroke={v("path-edge")} strokeWidth={0.8} />
      {STEPS.map(({ x, y }) => (
        <rect key={y} x={x} y={y} width={10.6} height={9.2} rx={2.6} fill={v("path-stone")} stroke={v("path-edge")} strokeWidth={0.6} />
      ))}
      {/* The flower border. */}
      <path d={CLUMP_LEAVES} fill={v("leaf-deep")} />
      {tones.map((tone, t) => (
        <path
          key={tone}
          d={circles(
            CLUMPS.filter((_, i) => i % tones.length === t && (season !== "winter" || i % 3 === 0)).flatMap(([x, y, rng]) => [
              [x - 1, y - 2.4, 1.5 + rng() * 0.7],
              [x + 1.8, y - 1, 1.3 + rng() * 0.6],
            ]),
          )}
          fill={v(tone)}
        />
      ))}
    </g>
  );
}

/** The hedge, the fence and gate, and a little snow along them in winter. */
export function Edges({ season }: { season: Season }) {
  const winter = season === "winter";
  return (
    <g>
      <path d="M0 0H360V418H351V9H9V418H0Z" fill={v("hedge-deep")} />
      <path d={HEDGE_BUMPS} fill={v("hedge")} />
      <path d={HEDGE_TOPS} fill={v(winter ? "frost" : "hedge-light")} opacity={winter ? 0.5 : 1} />
      {season === "autumn" ? <path d={HEDGE_TOPS} fill={v("leaf-fall")} opacity={0.35} transform="translate(2.2 2)" /> : null}
      {winter ? <path d={SNOW_EDGE} fill={v("snow")} /> : null}
      {/* The fence and its gate. */}
      <path d="M9 421.5H164M192 421.5H351M9 425H164M192 425H351" stroke={v("wood-deep")} strokeWidth={1.4} />
      <path d={PICKETS} fill={v("wood-light")} />
      <path d={[9, 40, 70, 100, 130, 160, 192, 222, 252, 282, 312, 347].map((x) => `M${x} 417h4v11h-4z`).join("")} fill={v("wood-deep")} />
      <path d="M165 419h26v8h-26z" fill={v("wood")} />
      <path d="M166 420.5H190M166 426H190M166 426L190 420.5" stroke={v("wood-deep")} strokeWidth={1.1} />
    </g>
  );
}

// ── Pegged out, waiting ────────────────────────────────────────────────────

/** Ground marked out for something not yet bought or dug: longer grass, four pegs and string. */
export function MarkedOut({ box, seed, round }: { box: Box; seed: number; round?: boolean }) {
  const { x, y, w, h } = box;
  const patch = round ? (
    <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={v("rough-ground")} />
  ) : (
    <rect x={x} y={y} width={w} height={h} rx={4} fill={v("rough-ground")} />
  );
  const pegs: Array<[number, number]> = round
    ? [[x + w / 2, y + h / 2]]
    : [
        [x + 1, y + 1],
        [x + w - 1, y + 1],
        [x + w - 1, y + h - 1],
        [x + 1, y + h - 1],
      ];
  return (
    <g>
      {patch}
      <path
        d={strokes(
          scatter(seed, Math.max(3, Math.round((w * h) / 260)), { x: x + 3, y: y + 5, w: w - 6, h: h - 7 }).flatMap(([px, py, rng]) =>
            tuft(px, py, 1 + rng() * 0.5),
          ),
        )}
        stroke={v("rough")}
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      {round ? (
        <ellipse
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2 - 4}
          ry={h / 2 - 4}
          fill="none"
          stroke={v("string")}
          strokeWidth={0.8}
          strokeDasharray="0.1 3.5"
          strokeLinecap="round"
        />
      ) : (
        <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} fill="none" stroke={v("string")} strokeWidth={0.7} />
      )}
      <path
        d={pegs.map(([px, py]) => `M${px - 1.4} ${py - 1.4}h2.8v2.8h-2.8z`).join("")}
        fill={v("wood-light")}
        stroke={v("wood-deep")}
        strokeWidth={0.6}
      />
      {round ? <path d={`M${x + w / 2} ${y + h / 2} v-14`} stroke={v("wood-light")} strokeWidth={1.4} strokeLinecap="round" /> : null}
    </g>
  );
}

// ── The shed, the tap and the barrow ───────────────────────────────────────

export function Shed({ season }: { season: Season }) {
  const winter = season === "winter";
  return (
    <g>
      {/* The roof: two felted slopes, the far one catching the light. */}
      <rect x={8} y={12} width={66} height={44} rx={1.5} fill={v("roof")} />
      <rect x={8} y={12} width={66} height={19} rx={1.5} fill={v(winter ? "snow" : "roof-light")} />
      {winter ? <path d="M8 31h66v6c-8 2-14-2-22 1s-16-2-24 0-14 1-20-1z" fill={v("snow")} /> : null}
      <path d="M8 31H74" stroke={v("roof")} strokeWidth={1.2} />
      <path d="M8 22H74M8 43H74M8 50H74" stroke={v(winter ? "roof-light" : "roof-light")} strokeWidth={0.5} opacity={0.45} />
      {/* The front wall: painted boards, a window and a door. */}
      <rect x={11} y={56} width={60} height={31} fill={v("shed")} />
      <path d={Array.from({ length: 11 }, (_, i) => `M${16 + i * 5} 58V87`).join("")} stroke={v("shed-deep")} strokeWidth={0.5} />
      <rect x={11} y={56} width={60} height={2.6} fill={v("shed-deep")} />
      <rect x={18} y={62} width={17} height={13} fill={v("window")} stroke={v("petal")} strokeWidth={1.4} />
      <path d="M26.5 62V75M18 68.5H35" stroke={v("petal")} strokeWidth={0.9} />
      <path d="M20 73 L25 64" stroke={v("glint")} strokeWidth={1.2} />
      <rect x={45} y={61} width={15} height={26} fill={v("shed-deep")} />
      <path d="M50 62V87M55 62V87" stroke={v("shed")} strokeWidth={0.5} />
      <circle cx={57.5} cy={75} r={0.9} fill={v("metal")} />
      <rect x={43} y={87} width={19} height={4.5} rx={1} fill={v("path-stone")} />
      {/* A pot by the door. */}
      <path d="M64 83h6l-1 7h-4z" fill={v("root")} />
      <path
        d={circles([
          [67, 81, 2.4],
          [65.2, 79.4, 1.6],
          [68.8, 79.2, 1.6],
        ])}
        fill={v(winter ? "leaf-deep" : "leaf")}
      />
      {!winter ? <circle cx={67} cy={79} r={1.1} fill={v(season === "autumn" ? "flower-blue" : "berry")} /> : null}
    </g>
  );
}

/** The shed's window, lit, with its glow on the ground: drawn over the night. */
export function LitWindow({ glow }: { glow: boolean }) {
  return (
    <g pointerEvents="none">
      {glow ? <ellipse cx={26.5} cy={80} rx={30} ry={22} fill="url(#allotment-glow)" /> : null}
      <rect x={18} y={62} width={17} height={13} fill={v("window-lit")} />
      <path d="M26.5 62V75M18 68.5H35" stroke={v("shed-deep")} strokeWidth={0.9} />
    </g>
  );
}

export function TapAndBarrow({ season, moon }: { season: Season; moon: boolean }) {
  return (
    <g>
      {/* A standpipe by the path, a drip, and the watering can beside it. */}
      <ellipse cx={178} cy={93} rx={5} ry={2} fill={v("water")} opacity={0.45} />
      {moon ? <ellipse cx={180} cy={93} rx={1.4} ry={0.8} fill={v("moon")} /> : null}
      <rect x={176.5} y={70} width={3} height={23} rx={1} fill={v("metal")} />
      <path d="M175 72h8v3h-2v3h-2v-3h-4z" fill={v("metal-deep")} />
      <circle cx={178} cy={70} r={2.2} fill={v("berry")} />
      <rect x={156} y={80} width={13} height={10} rx={2.4} fill={v("leaf-deep")} />
      <path d="M169 83 L175 78" stroke={v("leaf-deep")} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M158 81 Q162.5 75 167 81" stroke={v("leaf-deep")} strokeWidth={1.2} fill="none" />
      {/* The barrow, with a load of soil. */}
      <path d="M88 24 L78 19.5 M88 31 L78 35.5" stroke={v("wood-deep")} strokeWidth={2} strokeLinecap="round" />
      <path d="M86 17 H114 L121 26.5 L114 37 H86 Z" fill={v("leaf-deep")} />
      <path d="M89 20 H112 L117 26.5 L112 34 H89 Z" fill={v(season === "winter" ? "snow" : "soil")} />
      <path
        d={circles([
          [95, 25, 1.4],
          [103, 29, 1.6],
          [108, 23.6, 1.2],
        ])}
        fill={v(season === "winter" ? "frost" : "soil-crumb")}
      />
      <rect x={119} y={22} width={6} height={9} rx={2.2} fill={v("metal-deep")} />
    </g>
  );
}

// ── The lasting things ─────────────────────────────────────────────────────

export function WaterButt({ moon }: { moon: boolean }) {
  return (
    <g>
      <path d="M71 42 H86 V56" stroke={v("metal-deep")} strokeWidth={2} fill="none" strokeLinejoin="round" />
      <rect x={76} y={60} width={22} height={28} rx={3.5} fill={v("wood")} />
      <path d="M77 68H97M77 81H97" stroke={v("metal-deep")} strokeWidth={1.3} />
      <path d="M80 62V87M87 62V88M94 62V87" stroke={v("wood-deep")} strokeWidth={0.5} opacity={0.6} />
      <ellipse cx={87} cy={60} rx={11} ry={4.4} fill={v("wood-deep")} />
      <ellipse cx={87} cy={60.3} rx={8.6} ry={3.2} fill={v("water")} />
      {moon ? (
        <circle cx={89.5} cy={60} r={1.6} fill={v("moon")} />
      ) : (
        <path d="M82 60 Q85 58.6 88 59.4" stroke={v("water-light")} strokeWidth={0.8} fill="none" />
      )}
      <rect x={95} y={80} width={4} height={2.4} rx={0.8} fill={v("metal-deep")} />
    </g>
  );
}

export function CompostBin({ compost }: { compost: number }) {
  const heap = Math.min(compost, 8);
  return (
    <g>
      <rect x={120} y={50} width={42} height={38} rx={1.5} fill={v("wood")} />
      <rect x={124} y={54} width={34} height={30} fill={v("soil-wet")} />
      {heap > 0 ? (
        <>
          <ellipse cx={141} cy={70} rx={6 + heap * 1.6} ry={4 + heap * 1.1} fill={v("soil")} />
          <path
            d={circles(
              scatter(71, 3 + heap, { x: 134 - heap, y: 64 - heap * 0.6, w: 14 + heap * 2, h: 10 + heap }).map(([x, y]) => [x, y, 0.9]),
            )}
            fill={v("leaf")}
          />
          <path
            d={circles(
              scatter(73, 2 + heap, { x: 134 - heap, y: 64 - heap * 0.6, w: 14 + heap * 2, h: 10 + heap }).map(([x, y]) => [x, y, 0.8]),
            )}
            fill={v("root")}
          />
        </>
      ) : null}
      <path
        d="M120 59H124M158 59H162M120 68H124M158 68H162M120 77H124M158 77H162M131 50V54M141 50V54M151 50V54"
        stroke={v("wood-deep")}
        strokeWidth={0.8}
      />
      <rect x={120} y={84} width={42} height={4} fill={v("wood-light")} />
    </g>
  );
}

export function GreenhouseFloor() {
  const { x, y, w, h } = AT.greenhouse;
  return <rect x={x} y={y} width={w} height={h} rx={2} fill={v("path-stone")} />;
}

export function GreenhouseGlass({ winter }: { winter: boolean }) {
  const { x, y, w, h } = AT.greenhouse;
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} rx={2} fill={v("glass")} />
      {winter ? <rect x={x} y={y + h - 9} width={w} height={9} fill={v("frost")} opacity={0.35} /> : null}
      <path
        d={Array.from({ length: 11 }, (_, i) => `M${x + 13 * (i + 1)} ${y}V${y + h}`).join("")}
        stroke={v("glass-bar")}
        strokeWidth={0.7}
        opacity={0.8}
      />
      <path d={`M${x} ${y + h / 2}H${x + w}`} stroke={v("glass-bar")} strokeWidth={2} />
      <path
        d={`M${x + 8} ${y + 34} L${x + 30} ${y + 6} M${x + 18} ${y + 38} L${x + 40} ${y + 10} M${x + 86} ${y + 78} L${x + 106} ${y + 50}`}
        stroke={v("glint")}
        strokeWidth={2}
      />
      <rect x={x} y={y} width={w} height={h} rx={2} fill="none" stroke={v("glass-bar")} strokeWidth={2.4} />
      <path d={`M${x + 70} ${y + h}V${y + h - 12}H${x + 86}V${y + h}`} stroke={v("glass-bar")} strokeWidth={1.6} fill="none" />
    </g>
  );
}

function Hen({ x, y, flip }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})${flip ? " scale(-1 1)" : ""}`}>
      <path d="M-5 3 V6 M-1 3 V6" stroke={v("bloom")} strokeWidth={0.8} />
      <path d="M-4 -1 L-9 -6 L-7.6 0.6 Z" fill={v("wood-deep")} />
      <ellipse cx={-2} cy={0} rx={6} ry={4.4} fill={v("hen")} />
      <path d="M-5 -0.4 Q-2 2.4 1.6 -0.2" stroke={v("wood-deep")} strokeWidth={0.6} fill="none" />
      <circle cx={3.6} cy={-3.6} r={2.6} fill={v("hen")} />
      <path d="M2.4 -6 q0.6 -1.6 1.4 -0.4 q0.8 -1.4 1.4 0.2 Z" fill={v("berry")} />
      <path d="M6 -3.8 L8 -3 L6 -2.4 Z" fill={v("bloom")} />
      <circle cx={4.4} cy={-4} r={0.5} fill={v("soil-edge")} />
    </g>
  );
}

export function HenHouse({ eggs, roosting }: { eggs: number; roosting: boolean }) {
  return (
    <g>
      {/* The run, wire on posts, the ground in it scratched over. */}
      <rect x={64} y={344} width={90} height={60} rx={2} fill={v("rough-ground")} />
      <rect x={64} y={344} width={90} height={60} rx={2} fill="url(#allotment-mesh)" stroke={v("metal")} strokeWidth={0.8} />
      <path
        d={circles([
          [64, 344, 1.6],
          [154, 344, 1.6],
          [154, 404, 1.6],
          [64, 404, 1.6],
          [109, 344, 1.4],
          [109, 404, 1.4],
        ])}
        fill={v("wood-deep")}
      />
      {roosting ? null : (
        <>
          <Hen x={90} y={366} />
          <Hen x={128} y={378} flip />
          <Hen x={100} y={392} />
        </>
      )}
      {/* The house: a gable, a pop hole and a ramp, a nest box on the side. */}
      <rect x={16} y={358} width={42} height={34} fill={v("wood")} />
      <path
        d="M22 358V392M28 358V392M34 358V392M40 358V392M46 358V392M52 358V392"
        stroke={v("wood-deep")}
        strokeWidth={0.5}
        opacity={0.6}
      />
      <path d="M12 360 L37 339 L62 360 Z" fill={v("roof")} />
      <path d="M12 360 L37 339" stroke={v("roof-light")} strokeWidth={1.2} />
      <rect x={57} y={366} width={8} height={16} fill={v("wood-deep")} />
      <path d="M56 365h10v3h-10z" fill={v("roof")} />
      <path d={roosting ? "M32 378h10v14h-10z" : "M32 392V383a5 5 0 0 1 10 0V392Z"} fill={v(roosting ? "wood-deep" : "soil-edge")} />
      <path d="M33 392 L30 404 H44 L41 392Z" fill={v("wood-light")} />
      <path d="M31 396H43M30.5 400H43.5" stroke={v("wood-deep")} strokeWidth={0.6} />
      {/* The straw, and the eggs waiting in it. */}
      <ellipse cx={22} cy={402} rx={10} ry={4} fill={v("bloom")} opacity={0.55} />
      {eggs > 0 ? (
        <path
          d={Array.from({ length: Math.min(eggs, 6) }, (_, i) => {
            const ex = 14 + (i % 3) * 5.5 + Math.floor(i / 3) * 2.6;
            const ey = 401 + Math.floor(i / 3) * -3.6;
            return `M${ex} ${ey}a2.2 2.8 0 1 0 4.4 0a2.2 2.8 0 1 0 -4.4 0`;
          }).join("")}
          fill={v("egg")}
          stroke={v("wood-deep")}
          strokeWidth={0.5}
        />
      ) : null}
    </g>
  );
}

export function Hive({ honey, bees }: { honey: number; bees: boolean }) {
  const cx = 224;
  return (
    <g>
      <path
        d={`M${cx - 11} 376 L${cx - 13} 386 M${cx + 11} 376 L${cx + 13} 386`}
        stroke={v("wood-deep")}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <rect x={cx - 14} y={363} width={28} height={14} fill={v("hive")} />
      <rect x={cx - 16} y={354} width={32} height={9.5} fill={v("hive")} />
      <rect x={cx - 15} y={346} width={30} height={8.5} fill={v("hive")} />
      <path
        d={`M${cx - 16} 363.5H${cx + 16}M${cx - 15} 354.5H${cx + 15}M${cx - 14} 376.5H${cx + 14}`}
        stroke={v("hive-shade")}
        strokeWidth={1.4}
      />
      <path d={`M${cx - 19} 347 L${cx} 336 L${cx + 19} 347 Z`} fill={v("hive-shade")} />
      <path d={`M${cx - 19} 347 L${cx} 336`} stroke={v("hive")} strokeWidth={1.2} />
      <rect x={cx - 6} y={372} width={12} height={2.2} fill={v("soil-edge")} />
      <rect x={cx - 8} y={374.5} width={16} height={2.2} fill={v("wood")} />
      {bees ? (
        <g>
          {[
            [cx + 9, 370],
            [cx - 12, 368],
            [cx + 17, 360],
            [cx + 4, 382],
          ].map(([bx, by]) => (
            <g key={`${bx}-${by}`}>
              <ellipse cx={bx! - 0.4} cy={by! - 1.4} rx={1.2} ry={0.9} fill={v("petal")} opacity={0.85} />
              <ellipse cx={bx} cy={by} rx={1.6} ry={1.1} fill={v("honey")} />
              <path d={`M${bx} ${by! - 1.1}V${by! + 1.1}`} stroke={v("soil-edge")} strokeWidth={0.6} />
            </g>
          ))}
        </g>
      ) : null}
      {/* A bench, and the jars of honey waiting on it. */}
      <rect x={202} y={398} width={44} height={3} rx={0.8} fill={v("wood")} />
      {[205, 215.4, 225.8, 236.2].slice(0, Math.min(honey, 4)).map((x) => (
        <g key={x}>
          <rect x={x} y={389.5} width={7.4} height={8.5} rx={1.6} fill={v("honey")} />
          <rect x={x + 0.4} y={388} width={6.6} height={2.2} rx={0.6} fill={v("petal")} />
          <rect x={x} y={392.6} width={7.4} height={2.4} fill={v("petal")} opacity={0.7} />
        </g>
      ))}
    </g>
  );
}

const CANOPY = Array.from({ length: 9 }, (_, i) => {
  const a = (2 * Math.PI * i) / 9;
  return [308 + Math.cos(a) * 17, 362 + Math.sin(a) * 15, 13 + (i % 3) * 1.6] as const;
});
const CANOPY_LIGHT = CANOPY.filter((_, i) => i >= 4 && i <= 8).map(([x, y, r]) => [x + 3, y + 1, r * 0.55] as const);
const BLOSSOM = scatter(83, 26, { x: 282, y: 338, w: 52, h: 48 }).map(([x, y]) => [x, y, 1.7] as const);
const APPLES_ON = [
  [296, 352],
  [318, 348],
  [324, 368],
  [302, 374],
  [288, 366],
  [312, 360],
  [330, 356],
] as const;
const BOUGHS = strokes([
  [308, 378, 290, 352],
  [308, 378, 326, 350],
  [308, 376, 308, 344],
  [298, 364, 284, 362],
  [318, 362, 334, 366],
  [292, 355, 294, 343],
  [324, 353, 320, 343],
  [308, 356, 300, 346],
  [308, 356, 316, 346],
]);

export function AppleTree({ month, apples, season }: { month: number; apples: number; season: Season }) {
  const bare = season === "winter";
  const blossom = month >= 2 && month <= 4;
  // Apples hang from late summer through the autumn; those waiting to be picked up are in the crate.
  const fruit = month >= 7 && month <= 10;
  return (
    <g>
      <path d="M305.5 378 L303 402 H313 L310.5 378 Z" fill={v("wood-deep")} />
      {bare ? (
        <>
          <path d={BOUGHS} stroke={v("wood-deep")} strokeWidth={2.4} strokeLinecap="round" />
          <path d={BOUGHS} stroke={v("frost")} strokeWidth={0.7} strokeLinecap="round" transform="translate(-0.6 -0.8)" />
        </>
      ) : (
        <>
          <path d={circles([...CANOPY, [308, 362, 16]])} fill={v("leaf-deep")} />
          <path d={circles(CANOPY_LIGHT.map(([x, y, r]) => [x - 8, y - 9, r]))} fill={v(season === "autumn" ? "leaf-fall" : "leaf")} />
          {season === "autumn" ? (
            <path d={circles(CANOPY_LIGHT.map(([x, y, r]) => [x - 2, y - 2, r * 0.6]))} fill={v("bloom")} opacity={0.7} />
          ) : null}
        </>
      )}
      {blossom ? (
        <>
          <path d={circles(BLOSSOM)} fill={v("blossom")} />
          <path d={circles(BLOSSOM.filter((_, i) => i % 3 === 0).map(([x, y]) => [x + 0.8, y - 0.6, 1.1]))} fill={v("petal")} />
        </>
      ) : null}
      {fruit ? (
        <>
          <path d={circles(APPLES_ON.map(([x, y]) => [x, y, 2.8]))} fill={v("berry")} />
          <path d={circles(APPLES_ON.map(([x, y]) => [x - 0.9, y - 0.9, 0.8]))} fill={v("blossom")} />
        </>
      ) : null}
      {/* The crate below, with the apples waiting to be picked up. */}
      <rect x={258} y={398} width={42} height={12} rx={1.2} fill={v("wood")} />
      <path d="M258 404H300M272 398V410M286 398V410" stroke={v("wood-deep")} strokeWidth={0.6} />
      {apples > 0 ? (
        <path
          d={circles(
            Array.from({ length: Math.min(apples, 12) }, (_, i) => [262.5 + (i % 6) * 6.6, 401 + Math.floor(i / 6) * 5.4, 2.7] as const),
          )}
          fill={v("berry")}
          stroke={v("wood-deep")}
          strokeWidth={0.4}
        />
      ) : null}
    </g>
  );
}

/** Shadows of the tall things, all thrown one way, as one soft layer. */
export function Shadows({ shadow, footprints }: { shadow: { dx: number; dy: number } | null; footprints: ReactNode }) {
  if (!shadow) return null;
  return (
    <g transform={`translate(${shadow.dx} ${shadow.dy})`} fill={v("shadow")} opacity={0.16} pointerEvents="none">
      {footprints}
    </g>
  );
}
