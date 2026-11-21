/**
 * The night sky's two plates: the whole sky as a round chart, and the view towards the
 * pole with the stars that find it. Drawn with the diagram kit from `model.ts`.
 */
import { type Box, type Obstacle, type Point, placeLabel, pointBox, polyline } from "@/features/diagrams/geometry";
import { Arrow, Label, Line, Mark, Path, Plate, type PlateBox, StarDot } from "@/features/diagrams/plate";
import type { ChartModel, PoleView } from "./model";

export function SkyChartPlate({ model, when, placeName }: { model: ChartModel; when: string; placeName: string }) {
  const labelled = model.bodies.map((b) => b.name);
  return (
    <Plate
      name="sky-chart"
      maxWidth={36}
      caption={`The sky over ${placeName} at ${when}. Hold it overhead with the top towards north: east is then on your left. The rim is the horizon and the centre is straight up.`}
      description={`A round chart of the whole sky with north at the top, east on the left, west on the right and south at the bottom. ${model.stars.length} stars are drawn as dots sized by brightness, with the constellation figures joined by thin lines${labelled.length ? `, and ${labelled.join(", ")} marked and named` : ""}.`}
      height={(box) => Math.min(box.width, box.rem * 36) + box.font * 3}
    >
      {(box) => <Chart box={box} model={model} />}
    </Plate>
  );
}

function Chart({ box, model }: { box: PlateBox; model: ChartModel }) {
  const f = box.font;
  const size = Math.min(box.width, box.rem * 36);
  const r = size / 2 - f * 1.6;
  const cx = box.width / 2;
  const cy = f * 1.5 + size / 2;
  const at = ([x, y]: [number, number]): Point => [cx + x * r, cy + y * r];
  const bounds = { width: box.width, height: size + f * 3 };
  const taken: Box[] = [];
  const avoid: Obstacle[] = [{ kind: "ring", centre: [cx, cy], r }];
  const compass = [
    { text: "N", at: [cx, cy - r - f * 0.9] as Point },
    { text: "S", at: [cx, cy + r + f * 0.9] as Point },
    { text: "E", at: [cx - r - f * 0.8, cy] as Point },
    { text: "W", at: [cx + r + f * 0.8, cy] as Point },
  ];
  for (const c of compass) taken.push(pointBox(c.at, f * 0.7));
  for (const star of model.stars) taken.push(pointBox(at(star.at), 3));
  for (const body of model.bodies) taken.push(pointBox(at(body.at), 6));
  // Labels: the Moon and planets first, then the brightest named stars, each only where it fits.
  const labels = [
    ...model.bodies.map((b) => ({ text: b.name, point: at(b.at), tone: "figure" as const })),
    ...model.stars
      .filter((s) => s.name && s.magnitude <= 1.6)
      .sort((a, b) => a.magnitude - b.magnitude)
      .map((s) => ({ text: s.name!, point: at(s.at), tone: "name" as const })),
  ];
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} className="fill-surface stroke-ink-muted" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r * (2 / 3)} className="stroke-border" strokeWidth={1} fill="none" />
      <circle cx={cx} cy={cy} r={r / 3} className="stroke-border" strokeWidth={1} fill="none" />
      {model.lines.map((line) => (
        <Line key={line.key} from={at(line.from)} to={at(line.to)} stroke="guide" />
      ))}
      {model.stars.map((star) => (
        <StarDot key={star.key} at={at(star.at)} magnitude={star.magnitude} />
      ))}
      {model.bodies.map((body) =>
        body.kind === "moon" ? (
          <circle key={body.key} cx={at(body.at)[0]} cy={at(body.at)[1]} r={6} className="fill-page stroke-ink" strokeWidth={1.5} />
        ) : body.kind === "sun" ? (
          <g key={body.key}>
            <circle cx={at(body.at)[0]} cy={at(body.at)[1]} r={7} className="fill-page stroke-ink" strokeWidth={1.5} />
            <circle cx={at(body.at)[0]} cy={at(body.at)[1]} r={1.6} className="fill-ink" />
          </g>
        ) : (
          <Mark key={body.key} at={at(body.at)} accent r={4.5} />
        ),
      )}
      {compass.map((c) => (
        <Label key={c.text} at={c.at} anchor="middle" tone="figure" halo={false}>
          {c.text}
        </Label>
      ))}
      {labels.map((label) => {
        const placed = placeLabel(label.point, label.text, f, taken, bounds, 5, avoid);
        return placed ? (
          <Label key={label.text} at={placed.at} anchor={placed.anchor} tone={label.tone}>
            {label.text}
          </Label>
        ) : null;
      })}
    </g>
  );
}

export function PoleFindingPlate({ view, placeName }: { view: PoleView; placeName: string }) {
  const north = view.finding.hemisphere === "north";
  const [first, second] = north ? ["Merak", "Dubhe"] : ["Gacrux", "Acrux"];
  const pointersUp = Boolean(view.pointers.from && view.pointers.to);
  const caption = north
    ? `Facing north from ${placeName}. The two stars at the end of the Plough's bowl, ${first} and ${second}, point to Polaris, about five times their distance apart. Below Polaris on the horizon is true north. Cassiopeia, the W, is on the other side of Polaris.`
    : `Facing south from ${placeName}. Carry the long axis of the Southern Cross, from ${first} to ${second}, on about four and a half times its length: that point in the sky is the south pole of the sky, and below it on the horizon is true south.`;
  return (
    <Plate
      name="pole-finding"
      maxWidth={32}
      caption={caption}
      description={`A view of the ${north ? "northern" : "southern"} sky as seen facing ${north ? "north" : "south"}, with the horizon across the bottom. ${pointersUp ? `A dashed line runs from ${first} through ${second} to the pole of the sky, and a line drops from the pole to the horizon, marked true ${north ? "north" : "south"}.` : `${first} and ${second} are below the horizon now, so only the pole of the sky and the line down to true ${north ? "north" : "south"} are drawn.`}`}
      height={(box) => Math.min(box.width * 0.85, box.rem * 26) + box.font * 2}
    >
      {(box) => <PoleDrawing box={box} view={view} north={north} />}
    </Plate>
  );
}

function PoleDrawing({ box, view, north }: { box: PlateBox; view: PoleView; north: boolean }) {
  const f = box.font;
  const height = Math.min(box.width * 0.85, box.rem * 26) + f * 2;
  // Fit what is drawn: the stars that are up, the pole, and the horizon's middle.
  const pts: Array<[number, number]> = [view.pole, ...view.stars.flatMap((s) => (s.at ? [s.at] : []))];
  const horizonMid = view.horizon.reduce<[number, number] | null>(
    (best, p) => (!best || Math.abs(p[0]) < Math.abs(best[0]) ? p : best),
    null,
  );
  if (horizonMid) pts.push(horizonMid);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const span = Math.max(0.3, Math.max(...xs) - Math.min(...xs));
  const rise = Math.max(0.3, Math.max(...ys) - Math.min(...ys));
  const pad = f * 2;
  const k = Math.min((box.width - 2 * pad) / span, (height - 2 * pad) / rise);
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const top = Math.max(...ys);
  const at = ([x, y]: [number, number]): Point => [box.width / 2 + (x - midX) * k, pad + (top - y) * k];
  const bounds = { width: box.width, height };
  const pole = at(view.pole);
  const ground = horizonMid ? at(horizonMid) : ([pole[0], height - f] as Point);
  const taken: Box[] = [pointBox(pole, 8), ...view.stars.flatMap((s) => (s.at ? [pointBox(at(s.at), 5)] : []))];
  const avoid: Obstacle[] = [{ kind: "segment", a: pole, b: ground }];
  const from = view.pointers.from ? at(view.pointers.from) : null;
  const to = view.pointers.to ? at(view.pointers.to) : null;
  if (from && to) avoid.push({ kind: "segment", a: from, b: pole });
  const horizonPath = polyline(view.horizon.map(at).filter((p) => p[0] >= 0 && p[0] <= box.width && p[1] >= 0 && p[1] <= height));
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
      {horizonPath ? <Path d={horizonPath} stroke="object" /> : null}
      {view.lines.map((line) => (
        <Line key={`${line.from.join()}-${line.to.join()}`} from={at(line.from)} to={at(line.to)} stroke="guide" />
      ))}
      {from && to ? <Line from={from} to={pole} stroke="sight" /> : null}
      <Arrow from={pole} to={ground} stroke="subject" />
      {view.stars.map((s) => (s.at ? <StarDot key={s.key} at={at(s.at)} magnitude={s.magnitude} ring={s.name === "Polaris"} /> : null))}
      {north ? null : <Mark at={pole} accent />}
      {label(ground, north ? "True north" : "True south", "accent")}
      {north ? null : label(pole, "Pole of the sky")}
      {view.stars.filter((s) => s.at && s.name).map((s) => label(at(s.at!), s.name!))}
    </g>
  );
}
