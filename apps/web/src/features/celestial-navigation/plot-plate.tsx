/**
 * A plotting sheet drawn for the sights: the position worked from, each line of position,
 * the fix and the ellipse it is likely to lie in, on a flat chart a few tens of miles
 * across, north up. It needs no map, so it is there with no map installed.
 */
import { type Box, labelBox, niceStep, type Obstacle, type Point, placeLabel, pointBox } from "@/features/diagrams/geometry";
import { Arrow, Label, Line, Mark, Path, Plate, type PlateBox, ScaleBar } from "@/features/diagrams/plate";
import type { CelnavPlot } from "./sights";

const NM_PER_DEG = 60;

export function PlotPlate({ plot }: { plot: CelnavPlot }) {
  const names = plot.lines.map((l) => l.label);
  return (
    <Plate
      name="celnav-plot"
      maxWidth={34}
      caption={
        plot.fix
          ? "The lines of position from your sights, north up. Where they cross is the fix; the shaded ring is where it lies nineteen times in twenty."
          : "The lines of position from your sights, north up. A second line that crosses this one gives a fix."
      }
      description={`A plotting sheet with north at the top. An open circle marks the position the sights were worked from. ${names.length} straight ${names.length === 1 ? "line crosses" : "lines cross"} the sheet, one for each sight (${names.join(", ")})${plot.fix ? ", and a filled dot in a shaded ellipse marks the fix where they meet" : ""}.`}
      height={(box) => Math.min(box.width, box.rem * 30)}
    >
      {(box) => <Sheet box={box} plot={plot} />}
    </Plate>
  );
}

/** Nautical miles east and north of the sheet's centre: the fix, or with none the position worked from. */
function milesFrom(plot: CelnavPlot) {
  const centre = plot.fix ?? plot.dr;
  const cosLat = Math.cos((centre.lat * Math.PI) / 180);
  return (p: { lat: number; lon: number }): [number, number] => [
    (((p.lon - centre.lon + 540) % 360) - 180) * NM_PER_DEG * cosLat,
    (p.lat - centre.lat) * NM_PER_DEG,
  ];
}

/**
 * How many miles the sheet reaches from its centre to its edge: room for the position worked
 * from, the fix's ellipse and every line of position. A line passes the position worked from
 * at its intercept, which can be tens of miles; a sheet that stopped short drew no line at all.
 */
export function plotReach(plot: CelnavPlot): number {
  const nm = milesFrom(plot);
  const dr = nm(plot.dr);
  const passes = plot.lines.map((line) => {
    const a = nm(line.ends[0]);
    const b = nm(line.ends[1]);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // The line's distance from the centre: the cross product of its ends over its length.
    return length > 0 ? Math.abs(a[0] * b[1] - a[1] * b[0]) / length : Math.hypot(a[0], a[1]);
  });
  return Math.max(8, Math.abs(dr[0]) * 1.4, Math.abs(dr[1]) * 1.4, (plot.fix?.major ?? 0) * 1.6, ...passes.map((d) => d * 1.4));
}

function Sheet({ box, plot }: { box: PlateBox; plot: CelnavPlot }) {
  const f = box.font;
  const height = Math.min(box.width, box.rem * 30);
  const nm = milesFrom(plot);
  const drNm = nm(plot.dr);
  const reach = plotReach(plot);
  const pad = f * 1.5;
  const k = (Math.min(box.width, height) / 2 - pad) / reach;
  const cx = box.width / 2;
  const cy = height / 2;
  const at = ([e, n]: [number, number]): Point => [cx + e * k, cy - n * k];
  const bounds = { width: box.width, height };
  /** The line through a and b (miles), cut to the sheet (pixels): Liang and Barsky's clipping, on the infinite line. */
  const clip = (a: [number, number], b: [number, number]): [Point, Point] | null => {
    const p = at(a);
    const q = at(b);
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    let t0 = Number.NEGATIVE_INFINITY;
    let t1 = Number.POSITIVE_INFINITY;
    const edges: Array<[number, number]> = [
      [-dx, p[0] - 1],
      [dx, box.width - 1 - p[0]],
      [-dy, p[1] - 1],
      [dy, height - 1 - p[1]],
    ];
    for (const [d, room] of edges) {
      if (d === 0) {
        if (room < 0) return null;
        continue;
      }
      const t = room / d;
      if (d < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    if (t0 > t1) return null;
    return [
      [p[0] + dx * t0, p[1] + dy * t0],
      [p[0] + dx * t1, p[1] + dy * t1],
    ];
  };
  const lines = plot.lines.flatMap((line) => {
    const ends = clip(nm(line.ends[0]), nm(line.ends[1]));
    return ends ? [{ label: line.label, ends }] : [];
  });
  const taken: Box[] = [pointBox(at(drNm), 6)];
  const avoid: Obstacle[] = lines.map((l) => ({ kind: "segment" as const, a: l.ends[0], b: l.ends[1] }));
  let ellipse: string | null = null;
  if (plot.fix) {
    taken.push(pointBox(at([0, 0]), 7));
    const b = (plot.fix.bearing * Math.PI) / 180;
    const pts: string[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * 2 * Math.PI;
      const along = Math.max(0.1, plot.fix.major) * Math.cos(t);
      const across = Math.max(0.1, plot.fix.minor) * Math.sin(t);
      const p = at([along * Math.sin(b) + across * Math.cos(b), along * Math.cos(b) - across * Math.sin(b)]);
      pts.push(`${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`);
    }
    ellipse = `${pts.join(" ")} Z`;
  }
  const scale = niceStep(reach, 2);
  const scaleText = `${scale} nautical miles`;
  // The scale bar and its words, and the north arrow, are drawn first: no name may be put over them.
  taken.push({ x: pad, y: height - pad - 6, width: scale * k, height: 8 });
  taken.push(labelBox(pad + scale * k + f * 0.4, height - pad - 2, scaleText, f));
  taken.push({ x: box.width - pad - f - 4, y: pad + f * 0.6, width: 8, height: f * 2.4 });
  const label = (point: Point, text: string, tone: "name" | "figure" | "accent" = "name") => {
    const placed = placeLabel(point, text, f, taken, bounds, 6, avoid);
    return placed ? (
      <Label key={text} at={placed.at} anchor={placed.anchor} tone={tone}>
        {text}
      </Label>
    ) : null;
  };
  return (
    <g>
      <rect x={0.5} y={0.5} width={box.width - 1} height={height - 1} className="fill-none stroke-border" />
      {ellipse ? <Path d={ellipse} stroke="sight" fill="fill-primary-soft" /> : null}
      {lines.map((line) => (
        <Line key={line.label + line.ends[0].join()} from={line.ends[0]} to={line.ends[1]} stroke="object" />
      ))}
      <circle cx={at(drNm)[0]} cy={at(drNm)[1]} r={5} className="fill-page stroke-ink" strokeWidth={1.5} />
      {plot.fix ? <Mark at={at([0, 0])} accent r={5} /> : null}
      {/* A letter's width in from the edge, so that the N beside the arrow is not cut by the sheet's edge. */}
      <Arrow from={[box.width - pad - f, pad + f * 3]} to={[box.width - pad - f, pad + f * 0.6]} stroke="guide" />
      {label([box.width - pad - f, pad + f * 3.4], "N", "figure")}
      <ScaleBar at={[pad, height - pad]} length={scale * k} label={scaleText} font={f} />
      {plot.fix ? label(at([0, 0]), "Fix", "accent") : null}
      {label(at(drNm), "Worked from")}
      {lines.map((line) => {
        // Name each line near the sheet's edge, where the lines are apart.
        const a = line.ends[0];
        const b = line.ends[1];
        const near: Point = [a[0] + (b[0] - a[0]) * 0.12, a[1] + (b[1] - a[1]) * 0.12];
        return label(near, line.label);
      })}
    </g>
  );
}
