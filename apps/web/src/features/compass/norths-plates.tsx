/**
 * The three norths at the place as a small rose, and a bearing taken off the map turned
 * into one for the compass, drawn from the same figures as the words beside them
 * (`northsAt`, `convertBearing`). The angles between the norths are a degree or two in
 * Britain, too small to see, so they are drawn enlarged by a stated whole factor; every
 * figure written on the drawing is the real one.
 */
import { angleInWords, convertBearing, type Norths } from "@outpost/shared";
import { arcPath, type Box, bisector, exaggeration, firstFree, type Point, polar } from "@/features/diagrams/geometry";
import { Arrow, Label, Path, Plate, type PlateBox, type Stroke } from "@/features/diagrams/plate";
import { threeFigures } from "./live-compass";

/** The enlargement used for the angles between the norths at a place, and the angles drawn. */
export function rose(norths: Norths) {
  const grid = norths.convergence;
  const factor = exaggeration([norths.declination, grid ?? 0, norths.gridMagneticAngle ?? 0], 10, 32);
  return { factor, trueAt: 0, gridAt: grid === null ? null : grid * factor, magneticAt: norths.declination * factor };
}

const enlargedWords = (factor: number) =>
  factor > 1
    ? ` The angles between them are drawn ${factor} times their real size so that they can be seen; the figures are the real ones.`
    : "";

interface Ray {
  name: string;
  at: number;
  length: number;
  stroke: Stroke;
}

/** Labels at the tips of the rays, kept apart: the longest above its tip, the others beside theirs, on the side away from the true line. */
function tipLabels(rays: Ray[], c: Point, f: number, taken: Box[], bounds: { width: number; height: number }) {
  const longest = Math.max(...rays.map((ray) => ray.length));
  const others = rays.filter((ray) => ray.length < longest);
  return rays.map((ray) => {
    const tip = polar(c[0], c[1], ray.length, ray.at);
    // Which side to try first: away from the other leaning rays, so names do not cross lines.
    const lean = ray.at !== 0 ? Math.sign(ray.at) : 1;
    const neighbour = others.find((other) => other !== ray);
    const side = neighbour && Math.sign(neighbour.at) === lean && Math.abs(neighbour.at) > Math.abs(ray.at) ? -lean : lean;
    const beside: Array<[number, number, "start" | "end" | "middle"]> = [
      [tip[0] + side * f * 0.6, tip[1] + f * 0.1, side > 0 ? "start" : "end"],
      [tip[0] - side * f * 0.6, tip[1] + f * 0.1, side > 0 ? "end" : "start"],
    ];
    const above: [number, number, "middle"] = [tip[0], tip[1] - f * 1.1, "middle"];
    const placed = firstFree(ray.length === longest ? [above, ...beside] : [...beside, above], ray.name, f, taken, bounds);
    return placed ? (
      <Label key={ray.name} at={placed.at} anchor={placed.anchor} tone={ray.stroke === "subject" ? "accent" : "figure"}>
        {ray.name}
      </Label>
    ) : null;
  });
}

/** An arc between two rays with its real value beside it, placed clear of what is already there. */
function arcWithValue(
  c: Point,
  r: number,
  from: number,
  to: number,
  text: string,
  f: number,
  taken: Box[],
  bounds: { width: number; height: number },
  clockwise = false,
  stroke: Stroke = "subject",
) {
  const middle = bisector(from, to, clockwise);
  const end = polar(c[0], c[1], r, to);
  const side = Math.sin((middle * Math.PI) / 180) >= 0 ? 1 : -1;
  const [mx, my] = polar(c[0], c[1], r, middle);
  const placed = firstFree(
    [
      [mx + side * f * 0.6, my, side > 0 ? "start" : "end"],
      [end[0], end[1] + f * 1.1, "middle"],
      [end[0] + side * f * 0.6, end[1], side > 0 ? "start" : "end"],
      [mx, my - f * 1.1, "middle"],
      [mx - side * f * 0.6, my + f * 1.1, side > 0 ? "end" : "start"],
    ],
    text,
    f,
    taken,
    bounds,
  );
  return (
    <g key={text + r}>
      <Path d={arcPath(c[0], c[1], r, from, to, clockwise)} stroke={stroke} />
      {placed ? (
        <Label at={placed.at} anchor={placed.anchor} tone="figure">
          {text}
        </Label>
      ) : null}
    </g>
  );
}

export function NorthsRose({ norths }: { norths: Norths }) {
  const { factor, gridAt, magneticAt } = rose(norths);
  const onGrid = gridAt !== null;
  const words = [
    `Magnetic north is ${angleInWords(norths.declination)} of true north`,
    ...(onGrid ? [`grid north ${angleInWords(norths.convergence!)} of it`] : []),
  ].join(", ");
  return (
    <Plate
      name="norths-rose"
      maxWidth={24}
      caption={`The norths here, as a map's margin draws them. ${words}.${enlargedWords(factor)}`}
      description={`Three arrows from one point: true north straight up${onGrid ? `, grid north turned ${gridAt! >= 0 ? "right" : "left"} of it` : ""}, and magnetic north turned ${magneticAt >= 0 ? "right" : "left"} of true north, the angles between them marked with their values.`}
      height={(box) => box.font * 2.4 + Math.min(box.rem * 12, box.width * 0.6) + box.font * 1.2}
    >
      {(box) => draw(box)}
    </Plate>
  );

  function draw(box: PlateBox) {
    const f = box.font;
    const length = Math.min(box.rem * 12, box.width * 0.6);
    const height = f * 2.4 + length + f * 1.2;
    const c: Point = [box.width / 2, f * 2.4 + length];
    const rays: Ray[] = [
      { name: "true", at: 0, length, stroke: "object" },
      ...(gridAt !== null ? [{ name: "grid", at: gridAt, length: length * 0.86, stroke: "guide" as const }] : []),
      { name: "magnetic", at: magneticAt, length: length * 0.72, stroke: "subject" as const },
    ];
    const bounds = { width: box.width, height };
    const taken: Box[] = [];
    const labels = tipLabels(rays, c, f, taken, bounds);
    const arcs = [
      ...(gridAt !== null
        ? [
            arcWithValue(
              c,
              length * 0.5,
              0,
              gridAt,
              angleInWords(norths.convergence!).replace("east", "E").replace("west", "W"),
              f,
              taken,
              bounds,
            ),
          ]
        : []),
      gridAt !== null
        ? arcWithValue(
            c,
            length * 0.34,
            gridAt,
            magneticAt,
            angleInWords(norths.gridMagneticAngle!).replace("east", "E").replace("west", "W"),
            f,
            taken,
            bounds,
          )
        : arcWithValue(
            c,
            length * 0.42,
            0,
            magneticAt,
            angleInWords(norths.declination).replace("east", "E").replace("west", "W"),
            f,
            taken,
            bounds,
          ),
    ];
    return (
      <g>
        {rays.map((ray) => (
          <Arrow key={ray.name} from={c} to={polar(c[0], c[1], ray.length, ray.at)} stroke={ray.stroke} />
        ))}
        {arcs}
        <circle cx={c[0]} cy={c[1]} r={3} className="fill-ink" />
        {labels}
      </g>
    );
  }
}

/**
 * Map to compass, as a picture: the direction to somewhere taken off the map from the
 * map's north, and the same direction measured from magnetic north, which is what the
 * compass is set to.
 */
export function MapToCompass({ norths, mapBearing }: { norths: Norths; mapBearing: number }) {
  const { factor, gridAt, magneticAt } = rose(norths);
  const onGrid = gridAt !== null;
  const mapNorth = onGrid ? "grid" : "true";
  const offsets = { declination: norths.declination, convergence: norths.convergence };
  const compass = convertBearing(mapBearing, mapNorth, "magnetic", offsets) ?? mapBearing;
  // Drawn on the map, whose north is up: magnetic north turned from it by the (enlarged) angle between them.
  const magneticDrawn = onGrid ? magneticAt - gridAt! : magneticAt;
  const change = Math.round(compass) - Math.round(mapBearing);
  const wrapped = ((change + 540) % 360) - 180;
  const rule =
    wrapped === 0
      ? "the two read the same to the whole degree"
      : `${wrapped < 0 ? "subtract" : "add"} ${Math.abs(wrapped)}° from the map's bearing`;
  return (
    <Plate
      name="map-to-compass"
      maxWidth={26}
      caption={`Off the map, the way is ${threeFigures(mapBearing)} from ${mapNorth} north. The compass measures from magnetic north, so the same way reads ${threeFigures(compass)} on it: ${rule}.${enlargedWords(factor)}`}
      description={`From one point, the map's ${mapNorth} north straight up, magnetic north turned ${magneticDrawn >= 0 ? "right" : "left"} of it, and a line to where you are going. Two arcs measure that line clockwise: ${threeFigures(mapBearing)} from ${mapNorth} north and ${threeFigures(compass)} from magnetic north.`}
      height={(box) => fitted(box).height}
    >
      {(box) => draw(box)}
    </Plate>
  );

  /** The rays' reach from the centre, fitted to the plate with room for their names. */
  function fitted(box: PlateBox) {
    const f = box.font;
    const r = Math.min(box.width / 2 - f * 5.5, box.rem * 9);
    const points = [[0, 0] as Point, polar(0, 0, r, 0), polar(0, 0, r * 0.8, magneticDrawn), polar(0, 0, r, mapBearing)];
    // The map's arc, which can swing round below the centre.
    for (let angle = 0; angle <= mapBearing; angle += 10) points.push(polar(0, 0, r * 0.46 + f, angle));
    const ys = points.map((point) => point[1]);
    const xs = points.map((point) => point[0]);
    const top = f * 2.4;
    const c: Point = [box.width / 2 - (Math.min(...xs) + Math.max(...xs)) / 2, top - Math.min(...ys)];
    return { r, c, height: top + Math.max(...ys) - Math.min(...ys) + f * 2.2 };
  }

  function draw(box: PlateBox) {
    const f = box.font;
    const { r, c, height } = fitted(box);
    const target = polar(c[0], c[1], r, mapBearing);
    const bounds = { width: box.width, height };
    const taken: Box[] = [];
    const rays: Ray[] = [
      { name: `${mapNorth} north`, at: 0, length: r, stroke: "object" },
      { name: "magnetic", at: magneticDrawn, length: r * 0.8, stroke: "subject" },
    ];
    const labels = tipLabels(rays, c, f, taken, bounds);
    const targetLabel = firstFree(
      [
        [target[0] + f * 1, target[1], "start"],
        [target[0] - f * 1, target[1], "end"],
        [target[0], target[1] + f * 1.1, "middle"],
        [target[0], target[1] - f * 1.1, "middle"],
      ],
      "the way",
      f,
      taken,
      bounds,
    );
    const mapText = `map ${threeFigures(mapBearing)}`;
    const compassText = `compass ${threeFigures(compass)}`;
    return (
      <g>
        {rays.map((ray) => (
          <Arrow key={ray.name} from={c} to={polar(c[0], c[1], ray.length, ray.at)} stroke={ray.stroke} />
        ))}
        <Arrow from={c} to={target} stroke="object" />
        {arcWithValue(c, r * 0.46, 0, mapBearing, mapText, f, taken, bounds, true, "object")}
        {arcWithValue(c, r * 0.3, magneticDrawn, mapBearing, compassText, f, taken, bounds, true)}
        <circle cx={c[0]} cy={c[1]} r={3} className="fill-ink" />
        {labels}
        {targetLabel ? (
          <Label at={targetLabel.at} anchor={targetLabel.anchor}>
            the way
          </Label>
        ) : null}
      </g>
    );
  }
}
