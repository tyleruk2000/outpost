/**
 * Two of the radio calculators drawn: where the wire goes for each kind of antenna, with
 * the lengths the calculator gives, and why two antennas' horizons add up, over an
 * Earth drawn small enough for its curve to show.
 */

import { type Point, polar, textWidth } from "@/features/diagrams/geometry";
import { Arrow, Label, Line, Mark, Path, Plate, type PlateBox } from "@/features/diagrams/plate";
import { formatFigure } from "../kit";
import type { AntennaKind } from "./formulas";

const metres = (value: number) => `${formatFigure(value, { decimals: 2 })} m`;
const km = (value: number) => `${formatFigure(value / 1000, { decimals: 1 })} km`;

/** A dimension: a line with open heads at both ends and its figure beside it. */
function Dimension({ from, to, text, font, below = false }: { from: Point; to: Point; text: string; font: number; below?: boolean }) {
  const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const vertical = Math.abs(to[0] - from[0]) < 1;
  return (
    <g>
      <Arrow from={from} to={to} stroke="guide" both />
      <Label
        at={vertical ? [mid[0] + font * 0.6, mid[1]] : [mid[0], mid[1] + (below ? font * 0.95 : -font * 0.95)]}
        anchor={vertical ? "start" : "middle"}
        tone="figure"
      >
        {text}
      </Label>
    </g>
  );
}

export function AntennaPlate({ kind, total, leg }: { kind: AntennaKind; total: number; leg: number | null }) {
  const words =
    kind === "dipole"
      ? `A half-wave dipole: two legs of ${metres(leg!)} either side of the feed point, ${metres(total)} tip to tip, the coax joined at the middle.`
      : kind === "efhw"
        ? `An end-fed half-wave: one wire of ${metres(total)}, fed at one end through a matching transformer.`
        : `A quarter-wave vertical: an upright of ${metres(total)} fed at its foot, working against radials or a ground plane.`;
  return (
    <Plate
      name={`antenna-${kind}`}
      maxWidth={32}
      caption={words}
      description={`A drawing of the antenna with its lengths marked. ${words}`}
      height={(box) => (kind === "quarter" ? Math.min(box.rem * 14, box.width * 0.7) : box.font * 9.6)}
    >
      {(box) => (kind === "quarter" ? vertical(box) : wire(box))}
    </Plate>
  );

  function wire(box: PlateBox) {
    const f = box.font;
    const left = f * 1.2;
    const right = box.width - f * 1.2;
    const y = f * 3;
    const feedX = kind === "dipole" ? (left + right) / 2 : left + f * 1.6;
    const wireLeft = kind === "dipole" ? left : feedX;
    return (
      <g>
        <line x1={wireLeft} y1={y} x2={right} y2={y} className="stroke-ink" strokeWidth={2} strokeLinecap="round" />
        <circle cx={wireLeft} cy={y} r={3} className="fill-page stroke-ink" strokeWidth={1.5} />
        <circle cx={right} cy={y} r={3} className="fill-page stroke-ink" strokeWidth={1.5} />
        {kind === "dipole" ? (
          <>
            <Dimension from={[left, y - f * 1.1]} to={[feedX - 3, y - f * 1.1]} text={metres(leg!)} font={f} />
            <Dimension from={[feedX + 3, y - f * 1.1]} to={[right, y - f * 1.1]} text={metres(leg!)} font={f} />
            <Mark at={[feedX, y]} accent />
            <Line from={[feedX, y + 4]} to={[feedX, y + f * 3.4]} stroke="object" />
            <Label at={[feedX + f * 0.6, y + f * 2.4]} anchor="start">
              coax to the radio
            </Label>
            <Dimension from={[left, y + f * 4.4]} to={[right, y + f * 4.4]} text={`${metres(total)} tip to tip`} font={f} below />
          </>
        ) : (
          <>
            <rect
              x={left - f * 0.7}
              y={y - f * 0.55}
              width={f * 1.4}
              height={f * 1.1}
              rx={2}
              className="fill-page stroke-primary"
              strokeWidth={2}
            />
            <Label at={[left - f * 0.7, y + f * 1.5]} anchor="start">
              matching transformer
            </Label>
            <Line from={[left, y + f * 0.55]} to={[left, y + f * 3.6]} stroke="object" />
            <Label at={[left + f * 0.6, y + f * 3.1]} anchor="start">
              coax
            </Label>
            <Dimension from={[feedX, y - f * 1.1]} to={[right, y - f * 1.1]} text={metres(total)} font={f} />
          </>
        )}
      </g>
    );
  }

  function vertical(box: PlateBox) {
    const f = box.font;
    const height = Math.min(box.rem * 14, box.width * 0.7);
    const x = box.width * 0.45;
    const top = f * 1;
    const foot = height - f * 3.2;
    const radial = Math.min(box.width * 0.3, f * 8);
    return (
      <g>
        <line x1={x} y1={top} x2={x} y2={foot - 4} className="stroke-ink" strokeWidth={2} strokeLinecap="round" />
        <circle cx={x} cy={top} r={3} className="fill-page stroke-ink" strokeWidth={1.5} />
        <Mark at={[x, foot]} accent />
        {[-1, 1].map((side) => (
          <Line key={side} from={[x, foot]} to={[x + side * radial, foot + radial * 0.32]} stroke="object" />
        ))}
        <Dimension from={[x + f * 1.2, top]} to={[x + f * 1.2, foot - 4]} text={metres(total)} font={f} />
        <Label at={[x - radial, foot + radial * 0.32 + f * 1.1]} anchor="start">
          radials or a ground plane
        </Label>
        <Label at={[x - f * 0.7, foot - f * 0.2]} anchor="end">
          feed
        </Label>
      </g>
    );
  }
}

/**
 * Two antennas over a smooth Earth, the line of sight between their tops just grazing it.
 * The Earth is drawn far smaller than it is, with its curve and the masts in the right
 * proportion to each other: each distance is the real one written beside it.
 */
export function HorizonPlate({
  heightA,
  heightB,
  horizonA,
  horizonB,
}: {
  heightA: number;
  heightB: number;
  horizonA: number;
  horizonB: number;
}) {
  const total = horizonA + horizonB;
  return (
    <Plate
      name="radio-horizon"
      maxWidth={34}
      caption={`The line of sight from the top of one antenna to the other just grazes the Earth's curve. Each antenna sees ${heightB > 0 ? "its own horizon" : "to its horizon"}: ${km(horizonA)} for yours${heightB > 0 ? `, ${km(horizonB)} for the other` : ""}; together ${km(total)}. The Earth is drawn far smaller than it is so that its curve shows.`}
      description={`An arc of the Earth with an antenna at each end. A straight line from the top of one to the top of the other touches the Earth at one point between them, ${km(horizonA)} from yours and ${km(horizonB)} from the other.`}
      height={(box) => layout(box).height}
    >
      {(box) => draw(layout(box))}
    </Plate>
  );

  function layout(box: PlateBox) {
    const f = box.font;
    const spread = 46;
    const a = total > 0 ? (spread * horizonA) / total : spread / 2;
    const b = spread - a;
    const tan = (deg: number) => Math.tan((deg * Math.PI) / 180);
    const side = Math.max(f * 1.2, textWidth(`${formatFigure(Math.max(heightA, heightB))} m`, f) + f);
    const r = (box.width - 2 * side) / (tan(a) + tan(b));
    const drop = (deg: number) => r * (1 - Math.cos((deg * Math.PI) / 180));
    const deepest = Math.max(drop(a + 4), drop(b + 4));
    const top = f * 3;
    return { f, a, b, r, side, top, height: top + deepest + f * 3.4, width: box.width, tan };
  }

  function draw({ f, a, b, r, side, top, height, tan }: ReturnType<typeof layout>) {
    const touch: Point = [side + r * tan(a), top];
    const centre: Point = [touch[0], top + r];
    const footA = polar(centre[0], centre[1], r, -a);
    const footB = polar(centre[0], centre[1], r, b);
    const topA: Point = [touch[0] - r * tan(a), top];
    const topB: Point = [touch[0] + r * tan(b), top];
    const arc = Array.from({ length: 41 }, (_, i) => polar(centre[0], centre[1], r, -(a + 4) + ((a + b + 8) * i) / 40));
    const ticks = arc
      .filter((_, i) => i % 2 === 0)
      .map(([x, y]) => {
        const [ix, iy] = polar(x, y, 7, 180 + (Math.atan2(x - centre[0], centre[1] - y) * 180) / Math.PI - 30);
        return `M${x.toFixed(1)},${(y + 1).toFixed(1)}L${ix.toFixed(1)},${iy.toFixed(1)}`;
      })
      .join("");
    const dimY = height - f * 1.4;
    return (
      <g>
        <path d={ticks} className="stroke-ink-muted" strokeWidth={1} strokeLinecap="round" />
        <Path d={arc.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("")} stroke="object" />
        <Line from={topA} to={topB} stroke="subject" />
        <Line from={footA} to={topA} stroke="object" />
        {heightB > 0 ? <Line from={footB} to={topB} stroke="object" /> : null}
        <Mark at={touch} accent r={3.5} />
        <Label at={[(topA[0] + footA[0]) / 2 - f * 0.5, (topA[1] + footA[1]) / 2]} anchor="end" tone="figure">
          {`${formatFigure(heightA)} m`}
        </Label>
        {heightB > 0 ? (
          <Label at={[(topB[0] + footB[0]) / 2 + f * 0.5, (topB[1] + footB[1]) / 2]} anchor="start" tone="figure">
            {`${formatFigure(heightB)} m`}
          </Label>
        ) : null}
        <Dimension from={[topA[0], top - f * 1.3]} to={[touch[0], top - f * 1.3]} text={km(horizonA)} font={f} />
        {heightB > 0 ? <Dimension from={[touch[0], top - f * 1.3]} to={[topB[0], top - f * 1.3]} text={km(horizonB)} font={f} /> : null}
        <Dimension from={[topA[0], dimY]} to={[topB[0], dimY]} text={`${km(horizonA + horizonB)} in all`} font={f} below={false} />
      </g>
    );
  }
}
