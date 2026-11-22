import {
  formatDecimal,
  formatDms,
  formatOsGridRef,
  haversineMeters,
  initialBearingDeg,
  type ParsedCoordinate,
  parseCoordinates,
  toMaidenhead,
} from "@outpost/shared";
import { useMemo } from "react";
import { Link } from "react-router";
import { Field } from "@/components/ui/input";
import { formatBearing, formatDistanceWithMiles } from "@/features/maps/lib/geo";
import { moonPhase } from "@/features/maps/lib/moon";
import { dayLengthChange, isIsoDate, sunDay } from "@/features/maps/lib/sun";
import { dateIn, deviceZone, sunRows } from "@/features/maps/lib/sun-text";
import { useClockStyle } from "@/lib/clock";
import {
  allValues,
  Calculator,
  ChoiceField,
  Formula,
  formatDuration,
  formatFigure,
  HowWorkedOut,
  Inputs,
  NumberField,
  type NumberSpec,
  Result,
  ROUGH_MINUTES_WORDS,
  roughMinutes,
  ToolScreen,
  u,
  useChoice,
  useNumber,
  useText,
} from "../kit";
import { gradient, heatIndexCategory, heatIndexF, naismithMinutes, toC, toF, windChill } from "./formulas";
import { HikingCalculator } from "./hiking";
import { OUTDOOR_SOURCES as S, windChillRisk } from "./sources";
import { TRANTER_FITNESS, tranterMinutes } from "./tranter";

const CALCULATORS = [
  { id: "walking-time", title: "Walking time" },
  { id: "gradient", title: "Gradient" },
  { id: "distance", title: "Distance, bearing and coordinates" },
  { id: "sun", title: "Sunrise, sunset and daylight" },
  { id: "wind-chill", title: "Wind chill" },
  { id: "heat-index", title: "Heat index" },
  { id: "hiking", title: "Water and food for a walk" },
] as const;

export default function OutdoorsPage() {
  return (
    <ToolScreen
      title="Outdoors"
      description="Walking time, gradients, distances and bearings, the sun's day, wind chill and heat, and water and food for a walk."
      calculators={CALCULATORS}
      footer={
        <>
          General information, not a substitute for judgement on the hill. Weather, ground, the party and the light decide what is safe; a
          calculator knows none of them.
        </>
      }
    >
      <WalkingTimeCalculator />
      <GradientCalculator />
      <DistanceCalculator />
      <SunCalculator />
      <WindChillCalculator />
      <HeatIndexCalculator />
      <HikingCalculator />
    </ToolScreen>
  );
}

// ── Walking time ────────────────────────────────────────────────────────────

const wtDistance: NumberSpec = { id: "outdoors.walk.distance", label: "Distance", initial: 12, units: u.units.distance, min: 0 };
const wtAscent: NumberSpec = { id: "outdoors.walk.ascent", label: "Total climb", initial: 600, units: u.units.height, min: 0 };
const wtGentle: NumberSpec = {
  id: "outdoors.walk.gentle",
  label: "Gentle descent (5° to 12°)",
  initial: 0,
  units: u.units.height,
  min: 0,
  hint: "For Langmuir's correction. Leave at 0 to ignore descent, as Naismith does.",
};
const wtSteep: NumberSpec = { id: "outdoors.walk.steep", label: "Steep descent (over 12°)", initial: 0, units: u.units.height, min: 0 };

type Correction = "none" | "tranter";
const CORRECTIONS = [
  { value: "none", label: "Naismith" },
  { value: "tranter", label: "With Tranter's" },
] as const satisfies ReadonlyArray<{ value: Correction; label: string }>;

function WalkingTimeCalculator() {
  const distance = useNumber(wtDistance);
  const ascent = useNumber(wtAscent);
  const gentle = useNumber(wtGentle);
  const steep = useNumber(wtSteep);
  const [correction, setCorrection] = useChoice<Correction>("outdoors.walk.correction", CORRECTIONS, "none");
  const [fitness, setFitness] = useChoice("outdoors.walk.fitness", TRANTER_FITNESS, TRANTER_FITNESS[2]!.value);
  const values = allValues(distance, ascent, gentle, steep);
  const time = values ? naismithMinutes(...values) : null;
  const tranter = time && correction === "tranter" ? tranterMinutes(time.total, fitness) : null;
  const shown = correction === "tranter" ? tranter : time ? { ok: true as const, minutes: time.total } : null;
  return (
    <Calculator
      id="walking-time"
      title="Walking time"
      intro="Naismith's rule for how long a walk takes, with Langmuir's corrections for descent and Tranter's for fitness and ground, each as an option."
    >
      <Inputs>
        <NumberField input={distance} />
        <NumberField input={ascent} />
        <NumberField input={gentle} />
        <NumberField input={steep} />
        <ChoiceField label="Correct for fitness" value={correction} onChange={setCorrection} options={CORRECTIONS} />
        {correction === "tranter" ? (
          <ChoiceField
            label="Time to climb 300 m over 800 m"
            value={fitness}
            onChange={setFitness}
            options={TRANTER_FITNESS}
            hint="Tranter's fitness measure, timed on a steady climb."
          />
        ) : null}
      </Inputs>
      <Result
        label="Walking time"
        figure={shown?.ok ? formatDuration(roughMinutes(shown.minutes)) : null}
        refusal={shown && !shown.ok ? shown.reason : undefined}
        keep={
          time && shown?.ok
            ? {
                title: `Walking time, ${formatFigure(values![0] / 1000)} km with ${formatFigure(values![1], { decimals: 0 })} m of climb`,
                lines: [
                  `${formatDuration(roughMinutes(shown.minutes))} (${correction === "tranter" ? "Naismith with Tranter's corrections" : "Naismith"}${time.descent ? ", Langmuir's descent" : ""})`,
                  "Without stops.",
                ],
              }
            : undefined
        }
      >
        {time && shown?.ok ? (
          <p>
            {formatDuration(roughMinutes(time.flat))} for the distance and {formatDuration(roughMinutes(time.ascent))} for the climb
            {time.descent
              ? `, ${time.descent > 0 ? "plus" : "less"} ${formatDuration(roughMinutes(Math.abs(time.descent)))} for the descent`
              : ""}
            {correction === "tranter"
              ? `: ${formatDuration(roughMinutes(time.total))} by Naismith, which Tranter's table turns into the time above`
              : ""}
            . Stops are not included. {ROUGH_MINUTES_WORDS}
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>time = distance ÷ 5 km/h + 1 minute for every 10 m of climb</Formula>
            <p>
              Naismith's rule as it is taught in Britain. Naismith's own words, in 1892, were an hour for every three miles on the map and
              an hour for every 2,000 feet of ascent. Langmuir's corrections: take off 10 minutes for every 300 m of gentle descent (5° to
              12°), add 10 minutes for every 300 m of steep descent (over 12°).
            </p>
            <p>
              Tranter's corrections take the Naismith time and a measure of fitness (how long it takes to climb 300 m over 800 m) and read
              the time from his table. A dash in the table means that walk is beyond that level of fitness.
            </p>
          </>
        }
        range="A reasonably fit walker on paths or open hill in fair weather, carrying a day pack."
        limits="Rest stops, navigation, heavy packs, snow, darkness, rough ground and the slowest member of the group. Add time for each."
        sources={[S.naismith, S.langmuir, S.tranter]}
      />
    </Calculator>
  );
}

// ── Gradient ────────────────────────────────────────────────────────────────

const grRise: NumberSpec = { id: "outdoors.gradient.rise", label: "Height gained or lost", initial: 150, units: u.units.height, min: 0 };
const grRun: NumberSpec = {
  id: "outdoors.gradient.run",
  label: "Distance on the map",
  initial: 1,
  units: [u.km, u.m, u.mile, u.ft],
  above: 0,
  hint: "Measured flat, as on a map, not along the slope.",
};

function GradientCalculator() {
  const rise = useNumber(grRise);
  const run = useNumber(grRun);
  const values = allValues(rise, run);
  const result = values ? gradient(values[0], values[1]) : null;
  return (
    <Calculator
      id="gradient"
      title="Gradient"
      intro={
        <>
          The steepness of a slope from heights and distances you type. For a route you have drawn, the{" "}
          <Link to="/maps" className="text-primary underline underline-offset-2">
            map's Routes panel
          </Link>{" "}
          shows the height profile from the terrain.
        </>
      }
    >
      <Inputs>
        <NumberField input={rise} />
        <NumberField input={run} />
      </Inputs>
      <Result
        label="Gradient"
        figure={result ? `${formatFigure(result.percent, { decimals: 1 })}%` : null}
        keep={
          result
            ? {
                title: "Gradient",
                lines: [
                  `${formatFigure(result.percent, { decimals: 1 })}%, ${formatFigure(result.degrees, { decimals: 1 })}°${Number.isFinite(result.oneIn) ? `, 1 in ${formatFigure(result.oneIn, { decimals: 1 })}` : ""}`,
                ],
              }
            : undefined
        }
      >
        {result ? (
          <p>
            {formatFigure(result.degrees, { decimals: 1 })}° from the horizontal
            {Number.isFinite(result.oneIn) ? `, or 1 in ${formatFigure(result.oneIn, { decimals: 1 })}` : ""}.
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={<Formula>per cent = rise ÷ distance × 100; angle = arctan(rise ÷ distance); 1 in (distance ÷ rise)</Formula>}
        range="An average over the distance typed."
        limits="Steeper and gentler parts within it: a 10% average can hide a short section at 40%."
        sources={[S.geometry]}
      />
    </Calculator>
  );
}

// ── Distance, bearing and coordinates ───────────────────────────────────────

function pointText(point: ParsedCoordinate): string[] {
  const grid = formatOsGridRef(point.lat, point.lon, 10);
  return [
    `Decimal: ${formatDecimal(point.lat, point.lon)}`,
    `Degrees, minutes, seconds: ${formatDms(point.lat, point.lon)}`,
    ...(grid ? [`British grid: ${grid}`] : []),
    `Maidenhead: ${toMaidenhead(point.lat, point.lon, 6) ?? "–"}`,
  ];
}

function CoordinateInput({
  id,
  label,
  value,
  onChange,
  point,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  point: ParsedCoordinate | null;
}) {
  const error = value.trim() && !point ? "Not a position Outpost reads. Try 54.4609, -3.0886, or NY 34200 07100, or IO84ik." : undefined;
  return (
    <Field
      label={label}
      error={error}
      hint={!error ? "Decimal degrees, degrees and minutes, a British grid reference or a Maidenhead locator." : undefined}
    >
      {(ids) => (
        <input
          {...ids}
          name={id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full rounded-control border border-border-strong bg-page px-3 font-mono text-small text-ink hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 aria-invalid:border-danger max-md:h-11"
        />
      )}
    </Field>
  );
}

function DistanceCalculator() {
  const [fromText, setFrom] = useText("outdoors.distance.from", "NY 21540 07220");
  const [toText, setTo] = useText("outdoors.distance.to", "54.4542, -3.2115");
  const from = useMemo(() => parseCoordinates(fromText), [fromText]);
  const to = useMemo(() => parseCoordinates(toText), [toText]);
  const meters = from && to ? haversineMeters(from.lat, from.lon, to.lat, to.lon) : null;
  const bearing = from && to ? initialBearingDeg(from, to) : null;
  return (
    <Calculator
      id="distance"
      title="Distance, bearing and coordinates"
      intro={
        <>
          The straight-line distance and bearing between two positions, and each written in the other systems. To measure on the map
          instead, use its “Measure a distance” tool on{" "}
          <Link to="/maps" className="text-primary underline underline-offset-2">
            Maps
          </Link>
          .
        </>
      }
    >
      <Inputs>
        <CoordinateInput id="from" label="From" value={fromText} onChange={setFrom} point={from} />
        <CoordinateInput id="to" label="To" value={toText} onChange={setTo} point={to} />
      </Inputs>
      <Result
        label="Distance"
        figure={meters !== null ? formatDistanceWithMiles(meters) : null}
        keep={
          meters !== null && bearing !== null && from && to
            ? {
                title: "Distance and bearing",
                lines: [
                  `${formatDistanceWithMiles(meters)}, setting out on a bearing of ${formatBearing(bearing)} (true)`,
                  "From:",
                  ...pointText(from),
                  "To:",
                  ...pointText(to),
                ],
              }
            : undefined
        }
      >
        {bearing !== null && from && to ? (
          <>
            <p>Set out on {formatBearing(bearing)}, a true bearing: add or take off the magnetic variation for a compass.</p>
            <div className="mt-2 grid gap-3 text-small sm:grid-cols-2">
              {[
                ["From", from],
                ["To", to],
              ].map(([name, point]) => (
                <div key={name as string}>
                  <p className="font-semibold">{name as string}</p>
                  <ul className="font-mono text-ink-muted">
                    {pointText(point as ParsedCoordinate).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <p>
            The great-circle distance by the haversine formula on a sphere of the Earth's mean radius (6,371 km), and the initial bearing of
            the great circle. British grid references are converted with the Ordnance Survey's transformation, and Maidenhead locators name
            the middle of their square. These are the same sums the map uses.
          </p>
        }
        range="Anywhere; British grid references only in Great Britain."
        limits="Height: this is the distance as a crow flies over sea level, not along the ground. On a sphere the result can differ from the ellipsoid by up to about 0.5%."
        sources={[S.haversine, S.osgb, S.maidenhead]}
      />
    </Calculator>
  );
}

// ── Sun ─────────────────────────────────────────────────────────────────────

function SunCalculator() {
  const style = useClockStyle();
  const [placeText, setPlace] = useText("outdoors.sun.place", "54.4609, -3.0886");
  const [date, setDate] = useText("outdoors.sun.date", "");
  const place = useMemo(() => parseCoordinates(placeText), [placeText]);
  const zone = deviceZone();
  const day = date && isIsoDate(date) ? date : dateIn(zone, Date.now());
  const rows = useMemo(() => {
    if (!place) return null;
    const sun = sunDay(place.lat, place.lon, day);
    return sunRows(sun, dayLengthChange(place.lat, place.lon, day), moonPhase(sun.noon), zone, { style });
  }, [place, day, zone, style]);
  return (
    <Calculator
      id="sun"
      title="Sunrise, sunset and daylight"
      intro={
        <>
          The sun's day at a position. On{" "}
          <Link to="/maps" className="text-primary underline underline-offset-2">
            Maps
          </Link>
          , the Sun tab gives the same for wherever the map is, with a month at a time and a sheet to print.
        </>
      }
    >
      <Inputs>
        <CoordinateInput id="place" label="Position" value={placeText} onChange={setPlace} point={place} />
        <Field label="Date" hint="Today if left empty.">
          {(ids) => (
            <input
              {...ids}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-9 w-full rounded-control border border-border-strong bg-page px-3 text-body text-ink focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 max-md:h-11"
            />
          )}
        </Field>
      </Inputs>
      <Result
        label={`On ${day}, in this device's time (${zone})`}
        figure={rows ? (rows.find((row) => row.key === "sunrise")?.value ?? rows[0]?.value ?? "") : null}
        keep={
          rows && place
            ? {
                title: `The sun on ${day} at ${formatDecimal(place.lat, place.lon, 4)}`,
                lines: rows.map((row) => `${row.label}: ${row.value}${row.detail ? ` (${row.detail})` : ""}`),
              }
            : undefined
        }
      >
        {rows ? (
          <dl className="mt-1 grid grid-cols-[fit-content(50%)_minmax(0,1fr)] break-words gap-x-4 gap-y-1 text-small tabular">
            {rows.map((row) => (
              <div key={row.key} className="contents">
                <dt className="text-ink-muted">{row.label}</dt>
                <dd>
                  {row.value}
                  {row.detail ? <span className="text-ink-muted"> · {row.detail}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <p>
            The sun's position from the NOAA solar calculator's equations (after Meeus); sunrise and sunset when the centre of the sun is
            0.833° below the horizon, allowing for refraction and the sun's size. Civil twilight ends at 6° below. Times are on this
            device's clock, because Outpost cannot know a place's time zone offline.
          </p>
        }
        range="NOAA gives the method as good to about a minute between 72° north and south, and to about ten minutes beyond."
        limits="A flat horizon at sea level is assumed: hills and the height you stand at change when the sun actually appears."
        sources={[S.noaaSun]}
      />
    </Calculator>
  );
}

// ── Wind chill ──────────────────────────────────────────────────────────────

const wcAir: NumberSpec = { id: "outdoors.windchill.air", label: "Air temperature", initial: -5, units: u.units.temperature, min: -60 };
const wcWind: NumberSpec = { id: "outdoors.windchill.wind", label: "Wind speed", initial: 30, units: u.units.wind, min: 0, max: 200 };

function WindChillCalculator() {
  const air = useNumber(wcAir);
  const wind = useNumber(wcWind);
  const values = allValues(air, wind);
  const result = values ? windChill(values[0], values[1]) : null;
  const both = (c: number) => `${formatFigure(c, { decimals: 0 })} °C (${formatFigure(toF(c), { decimals: 0 })} °F)`;
  return (
    <Calculator
      id="wind-chill"
      title="Wind chill"
      intro="How cold the wind makes it feel on exposed skin, by the index weather services use."
    >
      <Inputs>
        <NumberField input={air} />
        <NumberField input={wind} />
      </Inputs>
      <Result
        label="Feels like"
        figure={result?.ok ? both(result.value) : null}
        refusal={result && !result.ok ? result.reason : undefined}
        keep={
          result?.ok && values
            ? {
                title: "Wind chill",
                lines: [
                  `${both(result.value)}, for air at ${both(values[0])} and wind of ${formatFigure(values[1], { decimals: 0 })} km/h`,
                ],
              }
            : undefined
        }
      >
        {result?.ok ? (
          <p>
            The temperature at which still air would cool bare skin as fast.
            {windChillRisk(result.value) ? <> Environment Canada, for this band: “{windChillRisk(result.value)}”.</> : null} The NWS adds
            that bright sunshine may raise the wind chill by 10 °F to 18 °F (about 6 °C to 10 °C).
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <Formula>W = 13.12 + 0.6215 T − 11.37 V^0.16 + 0.3965 T V^0.16</Formula>
            <p>
              T in °C, V the wind at 10 m in km/h, as in Environment Canada's own calculator. The NWS gives the same index in °F and mph:
              35.74 + 0.6215 T − 35.75 V^0.16 + 0.4275 T V^0.16. Both write the answer as a whole number of degrees.
            </p>
          </>
        }
        range="Air at 10 °C (50 °F) or colder and wind of 4.8 km/h (3 mph) or more, the NWS's range; outside it nothing is worked out. Environment Canada reports wind chill from 0 °C and 5 km/h."
        limits="Sunshine, which makes it feel warmer, and wet clothing, which makes it far colder. It is for exposed skin of the face, not a whole body."
        sources={[S.nwsWindChill, S.eccWindChill]}
      />
    </Calculator>
  );
}

// ── Heat index ──────────────────────────────────────────────────────────────

const hiAir: NumberSpec = { id: "outdoors.heat.air", label: "Air temperature", initial: 32, units: u.units.temperature };
const hiRh: NumberSpec = { id: "outdoors.heat.rh", label: "Relative humidity", initial: 60, suffix: "%", min: 0, max: 100 };

function HeatIndexCalculator() {
  const air = useNumber(hiAir);
  const rh = useNumber(hiRh);
  const values = allValues(air, rh);
  const result = values ? heatIndexF(toF(values[0]), values[1]) : null;
  const category = result?.ok ? heatIndexCategory(result.value) : null;
  const both = (f: number) => `${formatFigure(toC(f), { decimals: 0 })} °C (${formatFigure(f, { decimals: 0 })} °F)`;
  return (
    <Calculator
      id="heat-index"
      title="Heat index"
      intro="How hot it feels when humidity stops sweat from cooling the body, by the US National Weather Service's formula."
    >
      <Inputs>
        <NumberField input={air} />
        <NumberField input={rh} />
      </Inputs>
      <Result
        label="Feels like"
        figure={result?.ok ? both(result.value) : null}
        refusal={result && !result.ok ? result.reason : undefined}
        keep={result?.ok ? { title: "Heat index", lines: [`${both(result.value)}${category ? `: ${category}` : ""}`] } : undefined}
      >
        {result?.ok && category ? (
          <p>
            In the NWS's words, <span className="font-semibold">{category.toLowerCase()}</span>. The index is for shade and light wind: full
            sun can add up to 8 °C (15 °F).
          </p>
        ) : null}
      </Result>
      <HowWorkedOut
        formula={
          <>
            <p>Steadman's simple formula first:</p>
            <Formula>HI = 0.5 × (T + 61 + (T − 68) × 1.2 + RH × 0.094)</Formula>
            <p>
              If that, averaged with the temperature, is 80 °F or more, the Rothfusz regression, with the NWS's adjustments for humidity
              under 13% and over 85%:
            </p>
            <Formula>
              HI = −42.379 + 2.04901523 T + 10.14333127 RH − 0.22475541 T RH − 0.00683783 T² − 0.05481717 RH² + 0.00122874 T² RH +
              0.00085282 T RH² − 0.00000199 T² RH²
            </Formula>
            <p>
              T in °F, RH in per cent; the NWS gives the regression an error of ±1.3 °F. Categories: caution from 80 °F, extreme caution
              from 90 °F, danger from 103 °F, extreme danger from 125 °F.
            </p>
          </>
        }
        range="Air from 80 °F (27 °C), where the NWS applies it, to 110 °F (43 °C). The NWS says the regression is not valid beyond the range of Steadman's data; Outpost stops at 110 °F, near the top of the NWS's chart, rather than guess where that is."
        limits="Sun, wind, clothing, effort and the person: children, older people and anyone unwell are at risk at lower values."
        sources={[S.nwsHeatIndex, S.nwsHeatChart]}
      />
    </Calculator>
  );
}
