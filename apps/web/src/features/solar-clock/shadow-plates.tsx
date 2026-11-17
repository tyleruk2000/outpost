/**
 * Pictures of a stick and its shadow, for clock recovery and for finding true north: the
 * ground seen from above with the shadow's tip moving across it, the stick seen from the
 * side with the sun's height, and the compass's view of the shadow. Each is drawn from the
 * figures typed into the screen and from the same sun the answers use (plates.ts).
 */
import { useMemo } from "react";
import { exaggeration, heading, type Point, polar, polyline, textWidth } from "@/features/diagrams/geometry";
import { Angle, Arrow, Ground, Label, Line, Mark, Path, Plate, type PlateBox, ScaleBar, SunSign } from "@/features/diagrams/plate";
import type { IsoDate } from "@/features/maps/lib/sun";
import { equalShadows, noonWord, shortestShadow, type Tip } from "./plates";
import type { Place } from "./recovery";

const round = (value: number, places = 0) => Number(value.toFixed(places));

/** A length in metres as the screen writes it: "4 m", "85 cm". */
export function metresWords(metres: number): string {
  return metres >= 1 ? `${round(metres, metres >= 10 ? 0 : 1)} m` : `${round(metres * 100)} cm`;
}

/** A bar of a round length that is between about 40 and 110 pixels at a scale. */
function scaleLength(pixelsPerMetre: number): number {
  for (const metres of [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50]) if (metres * pixelsPerMetre >= 40) return metres;
  return 100;
}

/** A north arrow: a line with an open head and "N" above it. */
function NorthArrow({ at, length, font }: { at: Point; length: number; font: number }) {
  const [x, y] = at;
  return (
    <g>
      <Arrow from={[x, y]} to={[x, y - length]} stroke="object" />
      <Label at={[x, y - length - font * 0.8]} anchor="middle" tone="figure">
        N
      </Label>
    </g>
  );
}

interface Frame {
  x: (east: number) => number;
  y: (north: number) => number;
  scale: number;
  height: number;
}

/** Fits points in metres (east, north) into a plate, north up, with room for labels round it. */
function fitPlan(points: Array<[number, number]>, box: PlateBox, side: number, top: number, bottom: number, tallest: number): Frame {
  const east = points.map((point) => point[0]);
  const north = points.map((point) => point[1]);
  const [minE, maxE, minN, maxN] = [Math.min(...east), Math.max(...east), Math.min(...north), Math.max(...north)];
  const spanE = Math.max(maxE - minE, 1e-6);
  const spanN = Math.max(maxN - minN, 1e-6);
  const scale = Math.min((box.width - 2 * side) / spanE, tallest / spanN);
  const left = (box.width - spanE * scale) / 2;
  return {
    x: (e) => left + (e - minE) * scale,
    y: (n) => top + (maxN - n) * scale,
    scale,
    height: top + spanN * scale + bottom,
  };
}

// ── Noon from a shadow, and true north, seen from above ─────────────────────

export type ShadowPlanMode = { kind: "equal"; radius: number } | { kind: "shortest" } | { kind: "north" };

/**
 * The ground round the stick seen from above, north up, with the path the tip of the
 * shadow takes on the date. Two equal shadows: the circle, the two marks where the tip
 * touches it and the noon line halfway between them. The shortest shadow (and finding
 * north): a peg every quarter of an hour, and the shortest, which points along the meridian.
 */
export function ShadowPlan({ place, date, stick, mode }: { place: Place; date: IsoDate; stick: number; mode: ShadowPlanMode }) {
  const figures = useMemo(() => {
    if (mode.kind === "equal") {
      const equal = equalShadows(place, date, stick, mode.radius);
      return equal ? { kind: "equal" as const, ...equal, radius: mode.radius } : null;
    }
    const shortest = shortestShadow(place, date, stick);
    return shortest ? { kind: mode.kind, ...shortest } : null;
  }, [place, date, stick, mode]);
  if (!figures) return null;

  const pole = noonWord(figures.noon.bearing);
  const morningSide = figures.kind === "equal" ? (figures.before.east < 0 ? "west" : "east") : null;
  const caption =
    figures.kind === "equal"
      ? `Seen from above, north up, on ${date}: the shadow's tip follows the dashed path and touches the circle twice, at the 1st mark in the morning and the 2nd in the afternoon. The line from the stick to halfway between the marks is the noon line, and points ${pole}.`
      : figures.kind === "shortest"
        ? `Seen from above, north up, on ${date}: a peg every quarter of an hour from two hours before noon to two after. The shadow shortens, stops and lengthens; the shortest, nearest the stick, is noon. The pegs near it are close together, which is why the moment is hard to pick.`
        : `Seen from above, north up, drawn for a 1 m stick on ${date}: a mark every quarter of an hour through the middle of the day. The mark nearest the foot of the stick is the shortest shadow, and the line from the stick to it points ${pole}.`;
  const description =
    figures.kind === "equal"
      ? `A plan of the ground. The stick stands at the centre of a circle of radius ${metresWords(figures.radius)}. The tip of its ${metresWords(stick)} shadow traces a curve ${pole === "true north" ? "on the north side of" : "on the south side of"} the stick, touching the circle first on the ${morningSide} side and later on the other. The shortest shadow, at noon, is ${metresWords(figures.noon.length)} long. A line from the stick through the point halfway between the two marks runs ${pole}.`
      : `A plan of the ground with ${figures.marks.length} pegs along a curve ${pole === "true north" ? "north" : "south"} of the stick, one every 15 minutes. The pegs crowd together near the shortest shadow, ${metresWords(figures.noon.length)} long, which points ${pole} from the stick.`;

  return (
    <Plate name={`shadow-plan-${figures.kind}`} caption={caption} description={description} height={(box) => layout(box).frame.height}>
      {(box) => draw(layout(box), box)}
    </Plate>
  );

  function layout(box: PlateBox) {
    const f = box.font;
    const points: Array<[number, number]> = [[0, 0], ...figures!.track.map((tip): [number, number] => [tip.east, tip.north])];
    if (figures!.kind === "equal") {
      const r = figures!.radius;
      const noonAt = figures!.noon.bearing * (Math.PI / 180);
      points.push([r, 0], [-r, 0], [0, r], [0, -r], [1.42 * r * Math.sin(noonAt), 1.42 * r * Math.cos(noonAt)]);
    } else {
      const reach = figures!.noon.length * 1.3;
      points.push([reach * Math.sin(figures!.noon.bearing * (Math.PI / 180)), reach * Math.cos(figures!.noon.bearing * (Math.PI / 180))]);
      // Room on the other side of the stick for its name.
      points.push([0, -Math.sign(Math.cos(figures!.noon.bearing * (Math.PI / 180))) * figures!.noon.length * 0.18]);
    }
    const side = Math.max(textWidth("2nd mark", f) + f * 1.2, 24);
    const frame = fitPlan(points, box, side, f * 2.4, f * 3.6, Math.max(box.rem * 14, Math.min(box.width * 0.85, box.rem * 22)));
    return { frame, f };
  }

  function draw({ frame, f }: ReturnType<typeof layout>, box: PlateBox) {
    const { x, y } = frame;
    const at = (tip: Tip): Point => [x(tip.east), y(tip.north)];
    const foot: Point = [x(0), y(0)];
    const track = polyline(figures!.track.map(at));
    const bar = scaleLength(frame.scale);
    // The stick's name goes on the side of it away from the noon shadow.
    const away = (figures!.noon.bearing + 180) % 360;
    const stickLabel = polar(foot[0], foot[1], f * 1.3, away);
    const bottom = frame.height - f * 1.2;
    const common = (
      <>
        <Path d={track} stroke="sight" />
        <ScaleBar at={[f * 0.2, bottom]} length={bar * frame.scale} label={metresWords(bar)} font={f} />
        <NorthArrow at={[box.width - f * 1.2, bottom]} length={f * 1.8} font={f} />
      </>
    );
    if (figures!.kind === "equal") {
      const { before, after, radius } = figures!;
      const r = radius * frame.scale;
      const middle: Point = [(x(before.east) + x(after.east)) / 2, (y(before.north) + y(after.north)) / 2];
      const toward = heading(foot, middle);
      const end = polar(foot[0], foot[1], r * 1.22, toward);
      const endLabel = polar(end[0], end[1], f * 0.95, toward);
      const radiusAt = (toward + 180 + 70) % 360;
      const radiusEnd = polar(foot[0], foot[1], r, radiusAt);
      const radiusLabel = polar(foot[0], foot[1], r * 0.55, radiusAt + 12);
      const markLabel = (tip: Tip, words: string) => {
        const [mx, my] = at(tip);
        const left = mx < foot[0];
        return (
          <Label at={[mx + (left ? -f * 0.8 : f * 0.8), my - f * 0.9]} anchor={left ? "end" : "start"}>
            {words}
          </Label>
        );
      };
      return (
        <g>
          <circle cx={foot[0]} cy={foot[1]} r={r} className="stroke-ink-muted" strokeWidth={1} fill="none" />
          <Line from={foot} to={radiusEnd} stroke="sight" />
          <Label at={radiusLabel} anchor="middle" tone="figure">
            {metresWords(radius)}
          </Label>
          {common}
          <Line from={foot} to={at(before)} stroke="object" />
          <Line from={foot} to={at(after)} stroke="object" />
          <Line from={at(before)} to={at(after)} stroke="sight" />
          <Arrow from={foot} to={end} stroke="subject" />
          <Mark at={middle} accent r={3.5} />
          <Mark at={at(before)} />
          <Mark at={at(after)} />
          {markLabel(before, "1st mark")}
          {markLabel(after, "2nd mark")}
          <Label at={endLabel} anchor="middle" tone="accent">
            noon line
          </Label>
          <circle cx={foot[0]} cy={foot[1]} r={4} className="fill-page stroke-ink" strokeWidth={1.5} />
          <Label at={stickLabel} anchor="middle">
            stick
          </Label>
        </g>
      );
    }
    const { marks, noon } = figures!;
    const reach = polar(foot[0], foot[1], noon.length * frame.scale * 1.28, noon.bearing);
    const [nx, ny] = at(noon);
    const noonRight = Math.sin(noon.bearing * (Math.PI / 180)) <= 0;
    return (
      <g>
        {common}
        <Line from={foot} to={at(noon)} stroke="subject" />
        <Arrow from={at(noon)} to={reach} stroke="subject-sight" />
        {marks.map((tip) => (tip === marks.find((m) => m.at === noon.at) ? null : <Mark key={tip.at} at={at(tip)} r={3} />))}
        <Mark at={[nx, ny]} accent r={4.5} />
        <Label at={[nx + (noonRight ? f * 0.7 : -f * 0.7), ny + f * 1.1]} anchor={noonRight ? "start" : "end"} tone="accent">
          {figures!.kind === "north" ? "nearest" : "shortest"}
        </Label>
        <Label
          at={[reach[0], reach[1] + (Math.cos(noon.bearing * (Math.PI / 180)) >= 0 ? -f * 0.9 : f * 0.9)]}
          anchor="middle"
          tone="accent"
        >
          {pole}
        </Label>
        <circle cx={foot[0]} cy={foot[1]} r={4} className="fill-page stroke-ink" strokeWidth={1.5} />
        <Label at={stickLabel} anchor="middle">
          stick
        </Label>
      </g>
    );
  }
}

// ── The stick from the side: the sun's height from a shadow's length ───────

/**
 * The stick, its shadow and the sun's ray over the top of the stick to the tip, drawn to
 * the lengths typed: the angle at the tip is the sun's height, the one the answer uses.
 */
export function StickSide({ stick, shadow }: { stick: number; shadow: number }) {
  const angle = (Math.atan(stick / shadow) * 180) / Math.PI;
  const angleText = `${angle.toFixed(1)}°`;
  return (
    <Plate
      name="stick-side"
      caption={`Seen from the side, to scale: the sun's rays graze the top of the ${metresWords(stick)} stick and end at the tip of its ${metresWords(shadow)} shadow. The angle there, ${angleText}, is the sun's height, before the air's bending is taken off.`}
      description={`A side view of an upright stick on level ground with its shadow lying along the ground. A dashed line from the sun passes over the top of the stick and meets the ground at the end of the shadow, making an angle of ${angleText} with the ground.`}
      height={(box) => layout(box).height}
      maxWidth={34}
    >
      {(box) => draw(layout(box))}
    </Plate>
  );

  function layout(box: PlateBox) {
    const f = box.font;
    const left = f * 0.8;
    const sunReach = Math.min(f * 3.6, 60);
    const right = Math.max(textWidth(metresWords(stick), f) + f * 1.2, sunReach * Math.cos(Math.atan(stick / shadow)) + 12);
    const top = Math.max(f * 1.6, sunReach * Math.sin(Math.atan(stick / shadow)) + 12);
    const tallest = box.rem * 11;
    const scale = Math.min((box.width - left - right) / shadow, tallest / stick);
    const groundY = top + stick * scale;
    return { f, left, scale, groundY, height: groundY + f * 2.6, width: box.width };
  }

  function draw({ f, left, scale, groundY }: ReturnType<typeof layout>) {
    // The stick stands at the right of the shadow's foot: the shadow runs off to the left of it, away from the sun.
    const footX = left + shadow * scale;
    const tipX = left;
    const top: Point = [footX, groundY - stick * scale];
    const tip: Point = [tipX, groundY];
    const toward = heading(tip, top);
    const sun = polar(top[0], top[1], Math.min(f * 3.6, 60), toward);
    const arc = Math.max(f * 2.2, 30);
    const angleLabel = polar(tip[0], tip[1], arc + f * 0.4 + textWidth(angleText, f) / 2, toward);
    const level = 90; // along the ground towards the stick
    return (
      <g>
        <Ground x1={tipX - f * 0.6} x2={footX + f * 1.2} y={groundY} />
        <line x1={tipX} y1={groundY} x2={footX} y2={groundY} className="stroke-ink" strokeWidth={4} strokeLinecap="butt" />
        <Line from={[footX, groundY]} to={top} stroke="object" />
        <Line from={tip} to={sun} stroke="sight" />
        <SunSign at={sun} r={7} />
        <Angle at={tip} from={level} to={toward} r={arc} label={null} font={f} />
        <Label at={[angleLabel[0], angleLabel[1] - f * 0.95]} anchor="middle" tone="figure">
          {angleText}
        </Label>
        <Label at={[footX + f * 0.6, (groundY + top[1]) / 2]} anchor="start" tone="figure">
          {metresWords(stick)}
        </Label>
        <Label at={[(tipX + footX) / 2, groundY + f * 1.6]} anchor="middle" tone="figure">
          {metresWords(shadow)}
        </Label>
      </g>
    );
  }
}

// ── The compass's view: the shadow's bearing and the sun's ──────────────────

/**
 * The ground from above with magnetic north up, as the compass sees it: the shadow at the
 * bearing typed, the sun directly behind the stick from it, and true north turned from
 * magnetic by the declination (enlarged, and said so, when it is too small to see).
 */
export function BearingPlan({ bearing, declination }: { bearing: number; declination: number | null }) {
  const factor = declination === null ? 1 : exaggeration([declination], 8, 30);
  const sunTrue = (((bearing + 180 + (declination ?? 0)) % 360) + 360) % 360;
  const enlarged = factor > 1 ? ` The angle between the norths is drawn ${factor} times its size so that it can be seen.` : "";
  return (
    <Plate
      name="bearing-plan"
      caption={`Seen from above, magnetic north up. The compass reads the shadow from the stick's foot to its tip: ${Math.round(bearing)}°. The sun is straight behind the stick, ${Math.round((bearing + 180) % 360)}° on the compass${declination === null ? "" : `, ${Math.round(sunTrue)}° from true north`}.${enlarged}`}
      description={`A plan with the stick at the centre. Its shadow points to a compass bearing of ${Math.round(bearing)} degrees. An arrow on the far side of the stick points towards the sun.${declination === null ? " No declination is given, so true north is not drawn." : ` True north is drawn ${Math.abs(declination)} degrees ${declination >= 0 ? "west" : "east"} of magnetic north${factor > 1 ? `, enlarged ${factor} times` : ""}.`}`}
      height={(box) => Math.min(box.width, box.rem * 19)}
      maxWidth={30}
    >
      {(box) => {
        const f = box.font;
        const h = Math.min(box.width, box.rem * 19);
        const c: Point = [box.width / 2, h / 2 + f * 0.4];
        const r = h / 2 - f * 2.2;
        const shadowEnd = polar(c[0], c[1], r * 0.72, bearing);
        const sunAt = polar(c[0], c[1], r * 0.9, bearing + 180);
        const magnetic = polar(c[0], c[1], r, 0);
        const trueDir = declination === null ? null : -declination * factor;
        const trueEnd = trueDir === null ? null : polar(c[0], c[1], r, trueDir);
        const arcR = Math.max(f * 2.4, r * 0.32);
        return (
          <g>
            <circle cx={c[0]} cy={c[1]} r={r} className="stroke-border-strong" strokeWidth={1} fill="none" />
            {[90, 180, 270].map((d) => (
              <Line key={d} from={polar(c[0], c[1], r - 6, d)} to={polar(c[0], c[1], r, d)} stroke="guide" />
            ))}
            <Arrow from={c} to={magnetic} stroke="object" />
            <Label at={[magnetic[0], magnetic[1] - f * 0.9]} anchor="middle" tone="figure">
              magnetic
            </Label>
            {trueEnd ? (
              <>
                <Arrow from={c} to={trueEnd} stroke="guide" />
                <Label
                  at={[trueEnd[0] + (trueDir! < 0 ? -f * 0.4 : f * 0.4), trueEnd[1] + f * 0.3]}
                  anchor={trueDir! < 0 ? "end" : "start"}
                >
                  true
                </Label>
              </>
            ) : null}
            <Angle at={c} from={0} to={bearing} r={arcR} label={`${Math.round(bearing)}°`} font={f} clockwise labelAt={bearing - 22} />
            <line x1={c[0]} y1={c[1]} x2={shadowEnd[0]} y2={shadowEnd[1]} className="stroke-ink" strokeWidth={4} strokeLinecap="round" />
            <Label at={polar(shadowEnd[0], shadowEnd[1], f * 1.4, bearing)} anchor="middle">
              shadow
            </Label>
            <Arrow from={polar(c[0], c[1], f * 0.8, bearing + 180)} to={polar(c[0], c[1], r * 0.72, bearing + 180)} stroke="sight" />
            <SunSign at={sunAt} r={7} />
            <circle cx={c[0]} cy={c[1]} r={4} className="fill-page stroke-ink" strokeWidth={1.5} />
          </g>
        );
      }}
    </Plate>
  );
}
