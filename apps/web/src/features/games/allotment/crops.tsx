/**
 * A bed and what grows in it. A bed is a timber-edged box of dug soil; a sowing is a
 * raked drill with the seed packet on a stick at its end; then each crop comes up as
 * itself: seed leaves, a young plant, and the ripe crop with the thing you eat showing
 * (a red radish shoulder, a pod, a squash). Watered soil is darker and glistens.
 */
import { type Bed, type BedStage, type CropId, stageOf } from "@outpost/shared/games/allotment";
import { type Box, circles, leafShape, scatter, strokes, type Tone, v } from "./paint";

const PACKET: Record<CropId, Tone> = {
  radishes: "berry",
  salad: "leaf-light",
  peas: "leaf",
  carrots: "root",
  beetroot: "beet",
  potatoes: "tuber",
  leeks: "leaf-blue",
  squash: "bloom",
};

/** `n` leaves fanned upwards from (0, base), `spread` radians across. */
function fan(n: number, spread: number, len: number, wide: number, base = 0): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 - spread / 2 + (n === 1 ? spread / 2 : (spread * i) / (n - 1));
    d += leafShape(Math.cos(a) * len, base + Math.sin(a) * len, a, len, wide);
  }
  return d;
}

/** Leaves laid round a centre, pointing out: a rosette. */
function rosette(n: number, radius: number, len: number, wide: number, turn = 0): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = turn + (2 * Math.PI * i) / n;
    d += leafShape(Math.cos(a) * radius, Math.sin(a) * radius, a, len, wide);
  }
  return d;
}

/** Lines from (0, base) out to each tip. */
const rays = (tips: Array<[number, number]>, base = 0) => strokes(tips.map(([x, y]) => [0, base, x, y]));

function Plant({ crop, stage }: { crop: CropId; stage: Exclude<BedStage, "empty" | "sown"> }) {
  const ripe = stage === "ripe";
  switch (crop) {
    case "radishes":
      if (stage === "shoots")
        return (
          <path
            d={circles([
              [-1.8, -1, 1.8],
              [1.8, -1, 1.8],
            ])}
            fill={v("leaf-light")}
          />
        );
      return (
        <>
          <path d={ripe ? fan(5, 2.5, 4.6, 1.9, 1) : fan(4, 2.2, 3.6, 1.6, 1)} fill={v("leaf")} />
          {ripe ? (
            <>
              <circle cx={0} cy={3.2} r={4.3} fill={v("berry")} />
              <circle cx={-1.5} cy={1.8} r={1.3} fill={v("blossom")} />
              <path d="M-1 7.2 L0 9.6 L1 7.2 Z" fill={v("petal")} />
            </>
          ) : null}
        </>
      );
    case "salad":
      if (stage === "shoots")
        return (
          <path
            d={circles([
              [0, -1.8, 1.6],
              [-1.6, 1, 1.6],
              [1.6, 1, 1.6],
            ])}
            fill={v("leaf-light")}
          />
        );
      if (stage === "growing")
        return (
          <>
            <path d={rosette(6, 3.4, 3.2, 1.7)} fill={v("leaf")} />
            <path d={rosette(3, 1.6, 2, 1.2, 0.5)} fill={v("leaf-light")} />
          </>
        );
      return (
        <>
          <path d={rosette(8, 5.4, 4.4, 2.6, 0.2)} fill={v("leaf")} />
          <circle r={5.4} fill={v("leaf-light")} />
          <circle r={5.4} fill="none" stroke={v("leaf")} strokeWidth={0.7} strokeDasharray="2 1.4" />
          <circle r={2.6} fill={v("stem-pale")} />
        </>
      );
    case "peas":
      if (stage === "shoots")
        return (
          <>
            <path d="M0 3 V-3 M0 -3 q2 -1.5 1 -3.5" stroke={v("leaf-deep")} strokeWidth={0.9} fill="none" />
            <path
              d={circles([
                [-1.9, -2.2, 1.5],
                [1.9, -1, 1.5],
              ])}
              fill={v("leaf-light")}
            />
          </>
        );
      return (
        <>
          {/* Twiggy pea sticks, and the vine climbing them. */}
          <path
            d={rays(
              [
                [-6, -10],
                [0, -11],
                [6, -10],
                [-3, -11],
                [3, -11],
              ],
              9,
            )}
            stroke={v("wood-deep")}
            strokeWidth={0.8}
          />
          <path d="M0 8 L-2 4 L2 0 L-2 -4 L1 -8" stroke={v("leaf")} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
          <path
            d={circles([
              [-4, 4, 2],
              [3.6, 1, 2],
              [-3.8, -3, 2],
              [3, -6, 1.8],
              [0, -9, 1.6],
            ])}
            fill={v(ripe ? "leaf" : "leaf-light")}
          />
          {ripe ? (
            <>
              <path
                d={`${leafShape(-5.2, 1, 1.35, 3.6, 1.2)}${leafShape(5.4, -3, 1.75, 3.6, 1.2)}${leafShape(5, 5, 1.45, 3.4, 1.2)}`}
                fill={v("leaf-light")}
                stroke={v("leaf-deep")}
                strokeWidth={0.6}
              />
              <path
                d={circles([
                  [-1.2, -6.4, 1.3],
                  [1.8, 5, 1.2],
                ])}
                fill={v("petal")}
              />
            </>
          ) : null}
        </>
      );
    case "carrots": {
      if (stage === "shoots")
        return <path d={`${leafShape(-1.8, -1.6, -2.4, 2.6, 0.5)}${leafShape(1.8, -1.6, -0.7, 2.6, 0.5)}`} fill={v("leaf-light")} />;
      const len = ripe ? 9 : 6.5;
      const tips: Array<[number, number]> = [-2.3, -1.9, -1.57, -1.25, -0.85].map((a) => [Math.cos(a) * len, 1 + Math.sin(a) * len]);
      return (
        <>
          <path d={rays(tips, 1.5)} stroke={v("leaf")} strokeWidth={0.9} />
          <path
            d={circles(tips.flatMap(([x, y]) => [[x, y, 1.5] as const, [x * 0.6, 1 + (y - 1) * 0.6, 1.3] as const]))}
            fill={v("leaf-light")}
          />
          {ripe ? (
            <>
              <ellipse cx={0} cy={3.4} rx={3.6} ry={2.8} fill={v("root")} />
              <path d="M-2.2 3 Q0 1.6 2.2 3" stroke={v("bloom")} strokeWidth={0.6} fill="none" />
            </>
          ) : null}
        </>
      );
    }
    case "beetroot":
      if (stage === "shoots")
        return (
          <>
            <path d="M0 3 V0" stroke={v("beet")} strokeWidth={0.9} />
            <path d={`${leafShape(-2, -1.4, -2.5, 2.6, 0.8)}${leafShape(2, -1.4, -0.65, 2.6, 0.8)}`} fill={v("leaf")} />
          </>
        );
      return (
        <>
          <path d={ripe ? fan(4, 2.2, 5, 2.4, 1) : fan(3, 1.8, 4, 1.9, 1)} fill={v("leaf-deep")} />
          <path
            d={rays(
              (ripe ? [-2.66, -1.93, -1.21, -0.48] : [-2.47, -1.57, -0.67]).map((a) => [
                Math.cos(a) * (ripe ? 8 : 6.4),
                1 + Math.sin(a) * (ripe ? 8 : 6.4),
              ]),
              1,
            )}
            stroke={v("beet")}
            strokeWidth={0.7}
          />
          {ripe ? (
            <>
              <circle cx={0} cy={3.6} r={4.5} fill={v("beet")} />
              <circle cx={-1.6} cy={2.2} r={1.2} fill={v("berry")} />
              <path d="M0 8 V10.5" stroke={v("beet")} strokeWidth={0.8} />
            </>
          ) : null}
        </>
      );
    case "potatoes": {
      const mound = <ellipse cx={0} cy={2.5} rx={9} ry={4} fill={v("soil-crumb")} />;
      if (stage === "shoots")
        return (
          <>
            {mound}
            <path d={fan(3, 1.7, 2.4, 1.2, 1.5)} fill={v("leaf-deep")} />
          </>
        );
      const s = ripe ? 1.25 : 1;
      return (
        <>
          {mound}
          <path
            d={circles([
              [-3 * s, -1, 3.6 * s],
              [3 * s, -1, 3.6 * s],
              [0, -4 * s, 3.6 * s],
              [0, 1.5, 3.4 * s],
            ])}
            fill={v("leaf-deep")}
          />
          <path
            d={circles([
              [-2.6 * s, -2.4, 1.7],
              [2.4 * s, -2.6, 1.5],
              [0, -5 * s, 1.4],
            ])}
            fill={v("leaf")}
          />
          {ripe ? (
            <>
              <path
                d={circles([
                  [-2.4, -4, 1.4],
                  [2.8, -1.4, 1.4],
                  [-0.6, 1.2, 1.3],
                ])}
                fill={v("petal")}
              />
              <path
                d={circles([
                  [-2.4, -4, 0.5],
                  [2.8, -1.4, 0.5],
                  [-0.6, 1.2, 0.5],
                ])}
                fill={v("bloom")}
              />
              <ellipse cx={-7.4} cy={7.6} rx={2.8} ry={2} fill={v("tuber")} />
              <ellipse cx={6.6} cy={8.2} rx={2.4} ry={1.8} fill={v("tuber")} />
            </>
          ) : null}
        </>
      );
    }
    case "leeks":
      if (stage === "shoots") return <path d="M0 3 L-1 -4 M0 3 L1.4 -3.4" stroke={v("leaf-blue")} strokeWidth={1} strokeLinecap="round" />;
      return (
        <>
          <ellipse cx={0} cy={ripe ? 8 : 5} rx={4} ry={1.8} fill={v("soil-crumb")} />
          <rect x={ripe ? -2 : -1.3} y={ripe ? -2 : 0} width={ripe ? 4 : 2.6} height={ripe ? 10 : 5.4} rx={1.4} fill={v("stem-pale")} />
          <path
            d={
              ripe
                ? rays(
                    [
                      [-7, -8],
                      [-2.6, -11],
                      [2.6, -11],
                      [7, -8],
                    ],
                    -1,
                  )
                : rays(
                    [
                      [-4.6, -5],
                      [-1.6, -7],
                      [1.8, -7],
                      [4.6, -5],
                    ],
                    0.5,
                  )
            }
            stroke={v("leaf-blue")}
            strokeWidth={ripe ? 2.6 : 1.7}
            strokeLinecap="round"
          />
          {ripe ? (
            <path
              d={rays(
                [
                  [-6.2, -7.2],
                  [2.3, -10],
                ],
                -1,
              )}
              stroke={v("leaf-deep")}
              strokeWidth={0.6}
            />
          ) : null}
        </>
      );
    case "squash":
      if (stage === "shoots")
        return (
          <>
            <circle r={6} cy={1} fill={v("soil-crumb")} />
            <path d={`${leafShape(-2.8, -0.6, -2.7, 3.2, 1.9)}${leafShape(2.8, -0.6, -0.45, 3.2, 1.9)}`} fill={v("leaf-light")} />
          </>
        );
      return (
        <>
          <path d="M-12 8 q-2 -4 2 -6 M11 -6 q4 -1 3 -5" stroke={v("leaf")} strokeWidth={1.2} fill="none" strokeLinecap="round" />
          <path
            d={circles(
              ripe
                ? [
                    [-8, -7, 7],
                    [8, -8, 7],
                    [-10, 6, 6.4],
                    [9, 7, 5.8],
                  ]
                : [
                    [-5, -4, 6],
                    [5.5, -5, 6],
                    [0, 5, 5.6],
                  ],
            )}
            fill={v("leaf-deep")}
          />
          <path
            d={rays(
              ripe
                ? [
                    [-12, -11],
                    [12, -12],
                    [-14, 9],
                    [12, 11],
                  ]
                : [
                    [-8, -8],
                    [9, -9],
                    [0, 9],
                  ],
              0,
            )}
            stroke={v("leaf")}
            strokeWidth={0.8}
          />
          {ripe ? (
            <>
              <ellipse cx={1} cy={1} rx={9.6} ry={7.6} fill={v("root")} />
              <path
                d="M1 -6.6 V8.6 M-4.4 -5.6 Q-7 1 -4.4 7.6 M6.4 -5.6 Q9 1 6.4 7.6"
                stroke={v("wood-deep")}
                strokeWidth={0.7}
                fill="none"
                opacity={0.55}
              />
              <ellipse cx={-3.4} cy={-2.4} rx={2.4} ry={1.4} fill={v("bloom")} opacity={0.75} />
              <rect x={0} y={-9.6} width={2.2} height={3.6} rx={0.8} fill={v("wood-deep")} />
            </>
          ) : (
            <circle cx={1} cy={-1} r={2} fill={v("bloom")} />
          )}
        </>
      );
  }
}

/** Where the plants sit in a bed: three across and two down, or two for squash. */
function plantSpots(box: Box, crop: CropId): Array<[number, number]> {
  const across = crop === "squash" ? 2 : 3;
  const down = crop === "squash" ? 1 : 2;
  const spots: Array<[number, number]> = [];
  for (let row = 0; row < down; row++)
    for (let col = 0; col < across; col++)
      spots.push([box.x + (box.w * (col + 0.5)) / across, box.y + 5 + ((box.h - 8) * (row + 0.5)) / down]);
  return spots;
}

/** Just sown: the raked drills, the way each crop goes in. */
function Sowing({ crop, soil, spots }: { crop: CropId; soil: Box; spots: Array<[number, number]> }) {
  const rows = [...new Set(spots.map(([, y]) => y))];
  const left = soil.x + 4;
  const right = soil.x + soil.w - 4;
  if (crop === "potatoes")
    return (
      <>
        {rows.map((y) => (
          <g key={y}>
            <rect x={left} y={y - 3} width={right - left} height={7} rx={3.5} fill={v("soil-crumb")} />
            <path d={`M${left + 3} ${y + 4} H${right - 3}`} stroke={v("soil-edge")} strokeWidth={1} />
          </g>
        ))}
      </>
    );
  if (crop === "leeks" || crop === "squash")
    return (
      <>
        <path d={circles(spots.map(([x, y]) => [x, y, crop === "squash" ? 6 : 2.4]))} fill={v("soil-crumb")} />
        <path d={circles(spots.map(([x, y]) => [x, y + 0.4, crop === "squash" ? 1.8 : 1.2]))} fill={v("soil-edge")} />
      </>
    );
  const twin = crop === "peas";
  return (
    <>
      {rows.flatMap((y) =>
        (twin ? [y - 2.2, y + 2.2] : [y]).map((at) => (
          <g key={at}>
            <path d={`M${left} ${at - 1.3} H${right}`} stroke={v("soil-crumb")} strokeWidth={0.9} />
            <path d={`M${left} ${at} H${right}`} stroke={v("soil-edge")} strokeWidth={1.5} strokeLinecap="round" />
          </g>
        )),
      )}
    </>
  );
}

/** The seed packet, pushed in on a stick at the end of the bed, with the crop's colour on it. */
function Packet({ crop, x, y }: { crop: CropId; x: number; y: number }) {
  return (
    <g>
      <path d={`M${x + 4} ${y + 9} V${y + 14}`} stroke={v("wood-light")} strokeWidth={1.2} />
      <rect x={x} y={y} width={8} height={10} rx={0.8} fill={v("petal")} stroke={v("soil-edge")} strokeWidth={0.5} />
      <rect x={x} y={y} width={8} height={3.2} rx={0.8} fill={v(PACKET[crop])} />
      <circle cx={x + 4} cy={y + 6.6} r={1.7} fill={v(PACKET[crop])} />
    </g>
  );
}

/** Clods of freshly dug soil, the same for a bed every time. */
function Clods({ soil, seed }: { soil: Box; seed: number }) {
  const lumps = scatter(seed, 16, { x: soil.x + 3, y: soil.y + 3, w: soil.w - 6, h: soil.h - 6 }).map(
    ([x, y, rng]) => [x, y, 1.1 + rng() * 1.3] as const,
  );
  return (
    <>
      <path d={circles(lumps.map(([x, y, r]) => [x + 0.5, y + 0.7, r]))} fill={v("soil-edge")} />
      <path d={circles(lumps)} fill={v("soil-crumb")} />
    </>
  );
}

export function BedDrawing({ bed, box, index, frost }: { bed: Bed; box: Box; index: number; frost: boolean }) {
  const stage = stageOf(bed);
  const soil = { x: box.x + 3.5, y: box.y + 3.5, w: box.w - 7, h: box.h - 7 };
  const wet = bed.watered && bed.crop !== null && stage !== "ripe";
  const crop = bed.crop;
  const spots = crop ? plantSpots(box, crop) : [];
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={2.5} fill={v("wood")} />
      <path
        d={`M${box.x + 2} ${box.y + 1.1} H${box.x + box.w - 2} M${box.x + 1.1} ${box.y + 2} V${box.y + box.h - 2}`}
        stroke={v(frost ? "frost" : "wood-light")}
        strokeWidth={1.1}
      />
      {/* The plank ends at the corners. */}
      <path
        d={strokes([
          [box.x + 3.5, box.y, box.x + 3.5, box.y + 3.5],
          [box.x + box.w - 3.5, box.y + box.h - 3.5, box.x + box.w - 3.5, box.y + box.h],
        ])}
        stroke={v("wood-deep")}
        strokeWidth={0.7}
      />
      <rect x={soil.x} y={soil.y} width={soil.w} height={soil.h} rx={1} fill={v(wet ? "soil-wet" : "soil")} />
      <rect x={soil.x} y={soil.y} width={soil.w} height={soil.h} fill="url(#allotment-crumbs)" />
      <path
        d={`M${soil.x} ${soil.y + soil.h} V${soil.y} H${soil.x + soil.w}`}
        stroke={v("soil-edge")}
        strokeWidth={1.6}
        fill="none"
        opacity={0.7}
      />
      {!crop ? <Clods soil={soil} seed={index * 7919 + 13} /> : null}
      {wet ? (
        <path
          d={scatter(index * 104729 + 7, 6, { x: soil.x + 5, y: soil.y + 5, w: soil.w - 10, h: soil.h - 10 })
            .map(([x, y, rng]) => leafShape(x, y, 0.2 - rng() * 0.4, 0.9 + rng() * 0.8, 0.7))
            .join("")}
          fill={v("water-light")}
          opacity={0.75}
        />
      ) : null}
      {crop ? (
        // Keyed by what is drawn, so a change (sown, sprouting, ripe) fades in rather than jumping.
        <g key={`${crop}-${stage}`} className="motion-safe:animate-fade">
          {stage === "sown" ? <Sowing crop={crop} soil={soil} spots={spots} /> : null}
          {stage !== "sown" && stage !== "empty"
            ? spots.map(([x, y]) => (
                <g key={`${x}-${y}`} transform={`translate(${x} ${y})${stage === "shoots" ? " scale(1.35)" : ""}`}>
                  <Plant crop={crop} stage={stage} />
                </g>
              ))
            : null}
          {stage === "sown" || stage === "shoots" ? <Packet crop={crop} x={box.x + box.w - 13} y={box.y + box.h - 19} /> : null}
        </g>
      ) : null}
    </g>
  );
}
