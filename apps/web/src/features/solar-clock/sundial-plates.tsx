/**
 * The sundial drawn: the dial plate seen from above, laid out by the same function as the
 * printed template (`dialDrawing`), so the two match line for line; and the gnomon from
 * the side, its edge rising at the latitude towards the celestial pole.
 */
import { useMemo } from "react";
import { type Anchor, type Box, firstFree, labelBox, overlaps, polar, textWidth } from "@/features/diagrams/geometry";
import { Angle, Arrow, Ground, Label, Line, Plate, type PlateBox, StarDot } from "@/features/diagrams/plate";
import { type ClockStyle, clockText } from "@/lib/clock";
import { dialDrawing, hourLines, signedMinutes, sundialToClock } from "./sundial";
import { latitudeWords } from "./templates";

const DEG = Math.PI / 180;
/** The template's dial box, in millimetres: 178 wide, 184 deep (templates.ts). */
const TEMPLATE = { width: 178, height: 184, inset: 9, gap: 5 };
/** The hour the plate shows a shadow on: three in the afternoon, sundial time. */
const SHOWN = 3;

const twelveHour = (hour: number) => String(((hour + 11) % 12) + 1);

export function DialPlate({
  latitude,
  longitude,
  standard,
  summer,
  date,
  style,
}: {
  latitude: number;
  longitude: number;
  /** The clock's offset without summer time, minutes. */
  standard: number;
  /** Minutes summer time adds today (0 in winter). */
  summer: number;
  date: string;
  style: ClockStyle;
}) {
  const north = latitude >= 0;
  const pole = north ? "north" : "south";
  const correction = useMemo(() => sundialToClock(date, longitude, standard), [date, longitude, standard]);
  const clockMinutes = Math.round((12 + SHOWN) * 60 + correction + summer);
  const clock = clockText(Math.floor(clockMinutes / 60) % 24, ((clockMinutes % 60) + 60) % 60, style);
  return (
    <Plate
      name="dial-plate"
      maxWidth={26}
      caption={`The dial plate for ${latitudeWords(latitude)}, as the template prints it, seen from above with true ${pole} at the top. The gnomon stands on the noon line. At ${SHOWN} o'clock sundial time the shadow of its sloping edge lies along the ${SHOWN} line; today, ${date}, add ${signedMinutes(correction)}${summer ? " and an hour for summer time" : ""}: the clock reads ${clock}.`}
      description={`A rectangle with hour lines fanning out from a point two thirds of the way down, labelled with the hours ${dialHours(latitude)}. The noon line runs straight up to true ${pole}, the gnomon along it. Morning hours are on the ${north ? "left, the west" : "right, the west"} side. A shadow lies along the ${SHOWN} o'clock line.`}
      height={(box) => layout(box).height}
    >
      {(box) => draw(layout(box))}
    </Plate>
  );

  function layout(box: PlateBox) {
    const f = box.font;
    const top = f * 1.8;
    const width = box.width;
    const unit = width / TEMPLATE.width;
    const dialBox = { left: 0.75, top, right: width - 0.75, bottom: top + TEMPLATE.height * unit };
    const dial = dialDrawing(latitude, dialBox, Math.max(TEMPLATE.inset * unit, f * 2.2), Math.max(TEMPLATE.gap * unit, f * 1));
    return { f, unit, dialBox, dial, height: dialBox.bottom + f * 1.8 };
  }

  function draw({ f, unit, dialBox, dial }: ReturnType<typeof layout>) {
    const [rx, ry] = dial.root;
    // The gnomon's foot along the noon line: as long as the template's, at most to near the top of the plate.
    const gnomon = Math.min(80 * unit, (80 * unit) / Math.max(Math.tan(Math.abs(latitude) * DEG), 0.01), ry - dialBox.top - 12 * unit);
    const shown = dial.hours.find((line) => line.fromNoon === SHOWN);
    const placed: Box[] = [];
    const figures = [...dial.hours]
      .sort((a, b) => Math.abs(a.fromNoon) - Math.abs(b.fromNoon))
      .map((line) => {
        const text = twelveHour(line.hour);
        const box = labelBox(line.label[0], line.label[1], text, f, "middle");
        if (placed.some((other) => overlaps(box, other, 2))) return null;
        placed.push(box);
        return (
          <Label key={line.fromNoon} at={line.label} anchor="middle" tone="figure" halo={false}>
            {text}
          </Label>
        );
      });
    const shadowEnd = shown ? polar(rx, ry, Math.hypot(shown.end[0] - rx, shown.end[1] - ry) * 0.92, shown.paper) : null;
    const wedge = shown
      ? [polar(rx, ry, 0, 0), polar(rx, ry, Math.hypot(shown.end[0] - rx, shown.end[1] - ry) * 0.92, shown.paper - 1.6), shadowEnd!]
      : null;
    const westLeft = north;
    const bounds = { width: dialBox.right + 1, height: dialBox.bottom };
    const name = (text: string, tries: Array<[number, number, Anchor]>) => {
      const free = firstFree(tries, text, f, placed, bounds);
      return free ? (
        <Label at={free.at} anchor={free.anchor}>
          {text}
        </Label>
      ) : null;
    };
    return (
      <g>
        <rect
          x={dialBox.left}
          y={dialBox.top}
          width={dialBox.right - dialBox.left}
          height={dialBox.bottom - dialBox.top}
          className="fill-surface stroke-ink"
          strokeWidth={1.5}
        />
        {wedge ? <polygon points={wedge.map((p) => p.join(",")).join(" ")} className="fill-ink" opacity={0.22} /> : null}
        {dial.halves.map((half) => (
          <Line key={`${half.from[0]}-${half.from[1]}`} from={half.from} to={half.to} stroke="guide" />
        ))}
        {dial.hours.map((line) => (
          <line
            key={line.fromNoon}
            x1={rx}
            y1={ry}
            x2={line.end[0]}
            y2={line.end[1]}
            className={line.fromNoon === SHOWN ? "stroke-primary" : "stroke-ink"}
            strokeWidth={line.fromNoon === 0 ? 1.75 : line.fromNoon === SHOWN ? 2 : 1}
            strokeLinecap="round"
          />
        ))}
        {figures}
        <line x1={rx} y1={ry} x2={rx} y2={ry - gnomon} className="stroke-ink" strokeWidth={5} strokeLinecap="butt" />
        {name("gnomon", [
          [rx - f * 0.7, ry - gnomon * 0.55, "end"],
          [rx + f * 0.7, ry - gnomon * 0.55, "start"],
          [rx - f * 0.7, ry - gnomon * 0.85, "end"],
        ])}
        {shadowEnd
          ? name(
              "shadow",
              [0.55, 0.4, 0.7].map((share): [number, number, Anchor] => {
                const [px, py] = polar(rx, ry, Math.hypot(shadowEnd[0] - rx, shadowEnd[1] - ry) * share, shown!.paper + (north ? 9 : -9));
                return [px, py, north ? "start" : "end"];
              }),
            )
          : null}
        <Arrow from={[rx, dialBox.top - 2]} to={[rx, dialBox.top - f * 1.5]} stroke="object" />
        <Label at={[rx + f * 0.6, dialBox.top - f * 0.9]} anchor="start">
          {`true ${pole}`}
        </Label>
        <Label at={[dialBox.left, dialBox.bottom + f * 0.9]} anchor="start">
          {westLeft ? "west" : "east"}
        </Label>
        <Label at={[dialBox.right, dialBox.bottom + f * 0.9]} anchor="end">
          {westLeft ? "east" : "west"}
        </Label>
      </g>
    );
  }
}

function dialHours(latitude: number): string {
  const lines = hourLines(latitude);
  return `${twelveHour(lines[0]!.hour)} in the morning to ${twelveHour(lines.at(-1)!.hour)} in the evening`;
}

/**
 * The gnomon from the side: a triangle on the dial whose sloping edge rises at the
 * latitude, and that edge carried on to the celestial pole, which stands at the same
 * height above the horizon as the latitude.
 */
export function GnomonSide({ latitude }: { latitude: number }) {
  const lat = Math.abs(latitude);
  const north = latitude >= 0;
  const pole = north ? "north" : "south";
  const angleText = `${lat.toFixed(1)}°`;
  return (
    <Plate
      name="gnomon-side"
      maxWidth={34}
      caption={`The gnomon from the side. Its sloping edge rises at ${angleText}, your latitude, so it points along the Earth's axis at the celestial pole${north ? ", close to Polaris" : ""}, which stands ${angleText} above the true ${pole} horizon.`}
      description={`A side view of a triangular gnomon standing on a level dial. The angle between the dial and the gnomon's sloping edge is marked ${angleText}. A dashed line continues the edge up into the sky to a point marked the celestial pole${north ? ", where Polaris is" : ""}, over the ${pole} horizon on the right.`}
      height={(box) => layout(box).height}
    >
      {(box) => draw(layout(box))}
    </Plate>
  );

  function layout(box: PlateBox) {
    const f = box.font;
    const tan = Math.tan(lat * DEG);
    const left = f * 0.8;
    const base = Math.min(box.width * 0.42, (box.rem * 9) / Math.max(tan, 0.05));
    const gnomonHeight = base * tan;
    const poleWords = textWidth("celestial", f) + f * 1.4;
    const reachX = box.width - left - Math.min(poleWords, box.width * 0.45);
    const sightTop = Math.min(reachX * tan, box.rem * 11);
    const top = f * 2.4;
    const groundY = top + Math.max(gnomonHeight + f, sightTop);
    return { f, left, base, gnomonHeight, groundY, height: groundY + f * 2.4, width: box.width };
  }

  function draw({ f, left, base, gnomonHeight, groundY, width }: ReturnType<typeof layout>) {
    const corner: [number, number] = [left + f * 0.4, groundY];
    const back: [number, number] = [corner[0] + base, groundY];
    const tip: [number, number] = [back[0], groundY - gnomonHeight];
    const rise = 90 - lat;
    const room = Math.min(textWidth("celestial", f) + f * 1.4, width * 0.45);
    const reach = Math.min((width - corner[0] - room) / Math.cos(lat * DEG), (groundY - f * 2.2) / Math.max(Math.sin(lat * DEG), 0.05));
    const poleRight = poleAtX(reach) + f * 0.9 + textWidth("celestial pole", f) <= width;
    const poleAt = polar(corner[0], corner[1], reach, rise);
    function poleAtX(distance: number) {
      return polar(corner[0], corner[1], distance, rise)[0];
    }
    return (
      <g>
        <Ground x1={left} x2={width - f * 0.5} y={groundY} />
        <polygon
          points={[corner, back, tip].map((p) => p.join(",")).join(" ")}
          className="fill-surface-strong stroke-ink"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <Line from={tip} to={poleAt} stroke="sight" />
        <Angle at={corner} from={90} to={rise} r={Math.max(f * 2.6, 34)} label={angleText} font={f} />
        {north ? (
          <StarDot at={poleAt} magnitude={2} ring />
        ) : (
          <circle cx={poleAt[0]} cy={poleAt[1]} r={4} className="stroke-ink fill-page" strokeWidth={1.5} />
        )}
        {poleRight ? (
          <Label at={[poleAt[0] + f * 0.9, poleAt[1]]} anchor="start">
            celestial pole
          </Label>
        ) : (
          <>
            <Label at={[poleAt[0] + f * 0.9, poleAt[1] - f * 0.7]} anchor="start">
              celestial
            </Label>
            <Label at={[poleAt[0] + f * 0.9, poleAt[1] + f * 0.7]} anchor="start">
              pole
            </Label>
          </>
        )}
        <Label at={[back[0] - f * 0.5, groundY - gnomonHeight * 0.42]} anchor="end" halo={false}>
          {base > textWidth("gnomon", f) * 1.6 ? "gnomon" : ""}
        </Label>
        <Label at={[left + f * 0.2, groundY + f * 1.5]} anchor="start">
          dial, level
        </Label>
        <Label at={[width - f * 0.5, groundY + f * 1.5]} anchor="end">
          {`true ${pole}`}
        </Label>
      </g>
    );
  }
}
