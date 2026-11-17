/**
 * How a reading becomes a time: the sun's height (or bearing) through the day at the place
 * and date, the reading laid across it, and the time where they meet, with the range the
 * answer gives drawn as a band rather than a point. Drawn from the answer itself and from
 * `sunAt`, so the picture and the figure above it are the same.
 */
import { useMemo } from "react";
import { type Box, labelBox, niceStep, overlaps, polyline, textWidth } from "@/features/diagrams/geometry";
import { Ground, Label, Line, Path, Plate, type PlateBox, Spread, SunSign } from "@/features/diagrams/plate";
import { type IsoDate, sunAt, sunDay } from "@/features/maps/lib/sun";
import type { ClockStyle } from "@/lib/clock";
import { dayWords, sunThroughDay, unwrapNear, wrapBearing } from "./plates";
import type { Estimate, Place } from "./recovery";
import { timeWords } from "./time-result";
import { clockAt, type ZoneChoice } from "./zone";

const HOUR = 3_600_000;

export type AnswerKind = "noon" | "height" | "bearing";

export function AnswerOnDay({
  place,
  date,
  estimate,
  kind,
  measured,
  zone,
  style,
}: {
  place: Place;
  date: IsoDate;
  estimate: Estimate;
  kind: AnswerKind;
  /** The reading: the sun's apparent height in degrees, or its true bearing; none for noon. */
  measured?: number;
  zone: ZoneChoice;
  style: ClockStyle;
}) {
  const figures = useMemo(() => {
    const day = sunDay(place.lat, place.lon, date);
    const from =
      day.sun.kind === "crosses" && day.sun.begin !== null ? Math.max(day.sun.begin - HOUR / 3, day.noon - 9 * HOUR) : day.noon - 9 * HOUR;
    const to =
      day.sun.kind === "crosses" && day.sun.end !== null ? Math.min(day.sun.end + HOUR / 3, day.noon + 9 * HOUR) : day.noon + 9 * HOUR;
    const curve = sunThroughDay(place, from, to, kind === "bearing" ? "bearing" : "height");
    const sun = sunAt(estimate.at, place.lat, place.lon);
    const noonBearing = sunAt((from + to) / 2, place.lat, place.lon).azimuth;
    const value =
      kind === "bearing"
        ? unwrapNear(measured ?? sun.azimuth, noonBearing)
        : kind === "height"
          ? (measured ?? sun.apparentAltitude)
          : sun.apparentAltitude;
    return { from, to, curve, value };
  }, [place, date, estimate.at, kind, measured]);

  const words = timeWords({ ok: true, estimate }, zone, style, date);
  const unit = kind === "bearing" ? "bearing" : "height";
  const what =
    kind === "noon"
      ? "the sun at its highest"
      : kind === "height"
        ? `a height of ${figures.value.toFixed(1)}°`
        : `a bearing of ${Math.round(wrapBearing(figures.value))}°`;
  const caption =
    kind === "noon"
      ? `The sun's height through ${dayWords(date)} here. Noon is the top of the curve; the band is the range the answer gives, ${words.low} to ${words.high}: the flatter the curve, the wider it is.`
      : `The sun's ${unit} through ${dayWords(date)} here. Your reading, ${kind === "height" ? `${figures.value.toFixed(1)}°` : `${Math.round(wrapBearing(figures.value))}°`}, meets the curve at ${words.figure}; the band is the range the answer gives, ${words.low} to ${words.high}.`;
  const description = `A line chart of the sun's ${unit} against the time of day, from ${clockAt(figures.from, zone, style)} to ${clockAt(figures.to, zone, style)}. ${
    kind === "noon" ? "The curve peaks at" : `A horizontal line at ${what} crosses the curve at`
  } ${words.figure}, marked with the sun's sign, inside a shaded band from ${words.low} to ${words.high}.`;

  return (
    <Plate name={`answer-${kind}`} caption={caption} description={description} height={(box) => layout(box).height}>
      {(box) => draw(layout(box))}
    </Plate>
  );

  function layout(box: PlateBox) {
    const f = box.font;
    const values = figures.curve.map((point) => point.value);
    let low = Math.min(...values, figures.value);
    let high = Math.max(...values, figures.value);
    if (kind !== "bearing") {
      low = Math.min(low, -2);
      high = Math.max(high, 5);
    }
    const step = kind === "bearing" ? (high - low > 150 ? 45 : 30) : niceStep(high - low, 4);
    const floor = Math.floor(low / step) * step;
    const ceiling = Math.ceil(high / step) * step;
    const ticks: number[] = [];
    for (let value = floor; value <= ceiling + 1e-9; value += step) ticks.push(value);
    const tickText = (value: number) => (kind === "bearing" ? `${Math.round(wrapBearing(value))}°` : `${Math.round(value)}°`);
    const left = Math.max(...ticks.map((tick) => textWidth(tickText(tick), f))) + f * 0.8;
    const right = f * 0.8;
    const top = f * 1.2;
    const plot = Math.max(box.rem * 10, Math.min(box.width * 0.42, box.rem * 15));
    const bottom = f * 3.4;
    const x = (at: number) => left + ((at - figures.from) / (figures.to - figures.from)) * (box.width - left - right);
    const y = (value: number) => top + ((ceiling - value) / (ceiling - floor)) * plot;
    return { f, x, y, ticks, tickText, left, right, top, plot, height: top + plot + bottom, width: box.width };
  }

  function draw({ f, x, y, ticks, tickText, left, top, plot, width, right }: ReturnType<typeof layout>) {
    const base = top + plot;
    const point: [number, number] = [x(estimate.at), y(figures.value)];
    // Times along the foot: the answer under its point, the band's ends beside it if they fit, then whole hours where room is left.
    const timeY = base + f * 1.3;
    const placed: Box[] = [];
    const time = (at: number, text: string, tone: "accent" | "name") => {
      const anchor = x(at) - textWidth(text, f) / 2 < 0 ? "start" : x(at) + textWidth(text, f) / 2 > width ? "end" : "middle";
      const box = labelBox(x(at), timeY, text, f, anchor);
      if (placed.some((other) => overlaps(box, other, f * 0.5))) return null;
      placed.push(box);
      return (
        <Label key={`${text}-${at}`} at={[x(at), timeY]} anchor={anchor} tone={tone === "accent" ? "accent" : "name"}>
          {text}
        </Label>
      );
    };
    const labels = [
      time(estimate.at, words.figure, "accent"),
      time(estimate.low, words.low, "name"),
      time(estimate.high, words.high, "name"),
    ];
    const hours: number[] = [];
    const firstHour = Math.ceil(figures.from / (3 * HOUR)) * 3 * HOUR;
    for (let at = firstHour; at <= figures.to; at += 3 * HOUR) hours.push(at);
    const hourLabels = hours.map((at) => time(at, clockAt(at, zone, style), "name"));
    const measuredLabel =
      kind === "noon" ? null : kind === "height" ? `${figures.value.toFixed(1)}°` : `${Math.round(wrapBearing(figures.value))}°`;
    return (
      <g>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} style={{ stroke: "var(--chart-grid)" }} strokeWidth={1} />
            <Label at={[left - f * 0.5, y(tick)]} anchor="end" halo={false}>
              {tickText(tick)}
            </Label>
          </g>
        ))}
        <Spread x1={x(estimate.low)} x2={x(estimate.high)} y1={top} y2={base} />
        {kind !== "bearing" && y(0) <= base + 0.5 ? <Ground x1={left} x2={width - right} y={y(0)} /> : null}
        <Line from={[left, base]} to={[width - right, base]} stroke="guide" />
        {hours.map((at) => (
          <Line key={at} from={[x(at), base]} to={[x(at), base + 4]} stroke="guide" />
        ))}
        <Path d={polyline(figures.curve.map((each) => [x(each.at), y(each.value)] as const))} stroke="object" />
        {measuredLabel ? (
          <>
            <Line from={[left, point[1]]} to={[width - right, point[1]]} stroke="subject-sight" />
            <Label at={[left + f * 0.4, point[1] - f * 0.9]} anchor="start" tone="accent">
              {measuredLabel}
            </Label>
          </>
        ) : null}
        <Line from={point} to={[point[0], base]} stroke="subject-sight" />
        <SunSign at={point} r={7} accent />
        {labels}
        {hourLabels}
      </g>
    );
  }
}
