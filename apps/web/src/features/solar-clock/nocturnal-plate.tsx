/**
 * The northern sky as a person facing north sees it at the moment the star clock reading
 * gives, with a nocturnal held up to it: Polaris through the hole at the centre, the
 * handle straight down, and the arm laid along the Plough's pointers. The stars are placed
 * by `angleFromPolaris`, the function the calculator itself reads the time with, so the
 * arm in the picture stands where the reading says.
 */
import { useMemo } from "react";
import {
  type Anchor,
  anchorFor,
  aroundGroup,
  type Box,
  firstFree,
  type Obstacle,
  type Point,
  placeLabel,
  pointBox,
  polar,
  polyline,
} from "@/features/diagrams/geometry";
import { Angle, Label, Line, Path, Plate, type PlateBox, StarDot } from "@/features/diagrams/plate";
import { northSky, type SkyPoint } from "./plates";
import type { Place } from "./recovery";

const PLOUGH_LINES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [3, 4],
  [4, 5],
  [5, 6],
] as const;
const CASSIOPEIA_LINES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
] as const;

/** The nocturnal as drawn on the sky: its discs and handle, in degrees of sky about Polaris. */
const HOUR_DISC = 6.5;
const DATE_DISC = 9;
const HANDLE = 9;

export function NorthSkyPlate({
  place,
  at,
  clockWords,
  timeWords,
  dateWords,
}: {
  place: Place;
  at: number;
  /** Where the hand points, as read: "4 o'clock". */
  clockWords: string;
  /** The time the reading gives, as the answer writes it. */
  timeWords: string;
  dateWords: string;
}) {
  const sky = useMemo(() => northSky(place, at), [place, at]);
  const hand = sky.dubhe.angle;
  const below = sky.horizon[Math.floor(sky.horizon.length / 2)]!.distance < 60;
  return (
    <Plate
      name="north-sky"
      maxWidth={30}
      caption={`Facing north at ${timeWords} on the night of ${dateWords}, with a nocturnal held up at arm's length: Polaris is seen through the hole at the centre, the handle hangs straight down, and the arm is turned to lie along the Plough's two pointer stars, Merak and Dubhe, which point back at Polaris. The arm stands at ${clockWords}.`}
      description={`A chart of the northern sky centred on Polaris. The Plough is drawn ${sideWords(hand)} of Polaris, its pointer stars in line with it, and Cassiopeia on the opposite side. A nocturnal's two discs are drawn round Polaris, its handle pointing down towards the horizon, and its arm running from the centre out through Dubhe at ${clockWords}.${below ? " The north horizon runs across the bottom." : ""}`}
      height={(box) => layout(box).height}
    >
      {(box) => draw(layout(box))}
    </Plate>
  );

  function layout(box: PlateBox) {
    const f = box.font;
    // What is drawn, in degrees of sky about Polaris (x to the right, y down), and its extent.
    const flat = (point: { angle: number; distance: number }): Point => polar(0, 0, point.distance, point.angle);
    const drawn = [...sky.plough, ...sky.cassiopeia, sky.kochab].filter((star) => star.altitude > 0).map(flat);
    drawn.push([-DATE_DISC, -DATE_DISC], [DATE_DISC, DATE_DISC + HANDLE], polar(0, 0, sky.dubhe.distance + 11, hand));
    const northPoint = flat(sky.horizon[Math.floor(sky.horizon.length / 2)]!);
    const lowestStar = Math.max(...drawn.map((point) => point[1]));
    const horizon = northPoint[1] < lowestStar + 16;
    if (horizon) drawn.push(northPoint);
    const xs = drawn.map((point) => point[0]);
    const ys = drawn.map((point) => point[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const side = f * 1.2;
    const top = f * 2.4;
    const k = Math.min((box.width - 2 * side) / (maxX - minX), (box.rem * 24) / (maxY - minY));
    const cx = box.width / 2 - ((minX + maxX) / 2) * k;
    const cy = top - minY * k;
    return { f, k, cx, cy, horizon, height: top + (maxY - minY) * k + f * 1.6, width: box.width };
  }

  function draw({ f, k, cx, cy, height, width, horizon: showHorizon }: ReturnType<typeof layout>) {
    const at = (point: { angle: number; distance: number }): Point => polar(cx, cy, point.distance * k, point.angle);
    const up = (point: SkyPoint) => point.altitude > 0;
    const segments = (stars: SkyPoint[], lines: ReadonlyArray<readonly [number, number]>) =>
      lines
        .filter(([a, b]) => up(stars[a]!) && up(stars[b]!))
        .map(([a, b]) => <Line key={`${a}-${b}`} from={at(stars[a]!)} to={at(stars[b]!)} stroke="guide" />);
    const horizon = sky.horizon.map(at);
    const northPoint = horizon[Math.floor(horizon.length / 2)]!;
    const merak = sky.plough[1]!;
    const dubhe = sky.plough[0]!;
    const armEnd = polar(cx, cy, (dubhe.distance + 11) * k, hand);
    const handleLeft = polar(cx, cy, DATE_DISC * k, 180 - 26);
    const handleRight = polar(cx, cy, DATE_DISC * k, 180 + 26);
    const handleFoot = DATE_DISC * k + HANDLE * k;
    const stars = [...sky.plough, ...sky.cassiopeia, sky.kochab].filter(up);
    const taken: Box[] = [pointBox([cx, cy], 6), ...stars.map((star) => pointBox(at(star), 5))];
    taken.push({
      x: Math.min(handleLeft[0], handleRight[0]),
      y: handleLeft[1],
      width: Math.abs(handleRight[0] - handleLeft[0]),
      height: cy + handleFoot - handleLeft[1],
    });
    const bounds = { width, height };
    // The instrument's outline and the arm are drawn lines too: no label sits across them.
    const avoid: Obstacle[] = [
      { kind: "ring", centre: [cx, cy], r: DATE_DISC * k },
      { kind: "ring", centre: [cx, cy], r: HOUR_DISC * k },
      { kind: "segment", a: [cx, cy], b: armEnd },
      { kind: "segment", a: at(merak), b: polar(cx, cy, (DATE_DISC + 1) * k, hand) },
    ];
    const name = (point: Point, text: string, tone: "name" | "figure" | "accent" = "name", clearance = 5) => {
      const placed = placeLabel(point, text, f, taken, bounds, clearance, avoid);
      return placed ? (
        <Label key={text} at={placed.at} anchor={placed.anchor} tone={tone}>
          {text}
        </Label>
      ) : null;
    };
    /** A pointer star's name, set square to the arm (which runs through the star) so that it never lies across it. */
    const beside = (point: Point, text: string) => {
      const tries: Array<[number, number, Anchor]> = [];
      for (const distance of [f * 0.9, f * 1.4, f * 2]) {
        for (const turn of [90, -90]) {
          const [x, y] = polar(point[0], point[1], distance, hand + turn);
          tries.push([x, y, anchorFor(hand + turn)]);
        }
      }
      const placed = firstFree(tries, text, f, taken, bounds, avoid);
      return placed ? (
        <Label key={text} at={placed.at} anchor={placed.anchor}>
          {text}
        </Label>
      ) : null;
    };
    /** A constellation's name, beside its stars. */
    const outside = (group: SkyPoint[], text: string) => {
      const shown = group.filter(up).map(at);
      if (shown.length === 0) return null;
      const placed = firstFree(aroundGroup(shown, f), text, f, taken, bounds, avoid);
      return placed ? (
        <Label key={text} at={placed.at} anchor={placed.anchor}>
          {text}
        </Label>
      ) : null;
    };
    return (
      <g>
        {showHorizon ? (
          <>
            <path
              d={horizon
                .filter((point, index) => index % 2 === 0 && point[0] > 4 && point[0] < width - 4 && point[1] < height - 6)
                .map(([x, y]) => `M${x.toFixed(1)},${(y + 1).toFixed(1)}l-5,6`)
                .join("")}
              className="stroke-ink-muted"
              strokeWidth={1}
              strokeLinecap="round"
            />
            <Path d={polyline(horizon)} stroke="guide" />
          </>
        ) : null}
        {segments(sky.plough, PLOUGH_LINES)}
        {segments(sky.cassiopeia, CASSIOPEIA_LINES)}
        {/* The nocturnal held up to the sky. */}
        <circle cx={cx} cy={cy} r={DATE_DISC * k} className="fill-page stroke-ink" strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={HOUR_DISC * k} className="stroke-ink-muted" strokeWidth={1} fill="none" />
        <path
          d={`M${handleLeft[0]},${handleLeft[1]}V${cy + handleFoot}H${handleRight[0]}V${handleRight[1]}`}
          className="fill-page stroke-ink"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <Line from={at(merak)} to={polar(cx, cy, (DATE_DISC + 1) * k, hand)} stroke="sight" />
        <Line from={[cx, cy]} to={armEnd} stroke="subject" />
        <Angle at={[cx, cy]} from={0} to={hand} r={(HOUR_DISC - 2.5) * k} label={null} font={f} clockwise />
        <circle cx={cx} cy={cy} r={3.5} className="fill-page stroke-ink" strokeWidth={1.5} />
        <StarDot at={[cx, cy]} magnitude={2} />
        {stars.map((star) => (
          <StarDot key={star.name} at={at(star)} magnitude={star.magnitude} />
        ))}
        {up(dubhe) ? beside(at(dubhe), "Dubhe") : null}
        {up(merak) ? beside(at(merak), "Merak") : null}
        {name(armEnd, clockWords, "accent", 3)}
        {(() => {
          // Polaris is behind the hole, so its name sits outside the instrument with a fine leader in to it.
          const ring = DATE_DISC * k;
          const placed = firstFree(
            [
              [cx - ring - f * 0.8, cy - f * 0.2, "end"],
              [cx - ring * 0.75 - f * 0.5, cy - ring * 0.75 - f * 0.5, "end"],
              [cx + ring + f * 0.8, cy - f * 0.2, "start"],
              [cx - ring - f * 0.8, cy + ring * 0.6, "end"],
            ],
            "Polaris",
            f,
            taken,
            bounds,
            avoid,
          );
          if (!placed) return null;
          const end: Point = [placed.anchor === "end" ? placed.box.x + placed.box.width + 3 : placed.box.x - 3, placed.at[1]];
          const start = polar(cx, cy, 6, (Math.atan2(end[0] - cx, cy - end[1]) * 180) / Math.PI);
          return (
            <>
              <Line from={start} to={end} stroke="guide" />
              <Label at={placed.at} anchor={placed.anchor}>
                Polaris
              </Label>
            </>
          );
        })()}
        {outside(sky.plough, "the Plough")}
        {outside(sky.cassiopeia, "Cassiopeia")}
        {up(sky.kochab) ? name(at(sky.kochab), "Kochab") : null}
        {name([handleRight[0], cy + handleFoot - f * 0.7], "handle", "name", 2)}
        {showHorizon ? name([northPoint[0], northPoint[1] - f * 0.3], "north horizon", "name", 2) : null}
      </g>
    );
  }
}

/** "above and to the right": where a hand angle (clockwise from up) puts the Plough. */
function sideWords(angle: number): string {
  const vertical = Math.cos((angle * Math.PI) / 180);
  const horizontal = Math.sin((angle * Math.PI) / 180);
  const v = vertical > 0.38 ? "above" : vertical < -0.38 ? "below" : "";
  const h = horizontal > 0.38 ? "right" : horizontal < -0.38 ? "left" : "";
  return v && h ? `${v} and to the ${h}` : v || (h ? `to the ${h}` : "beside");
}
