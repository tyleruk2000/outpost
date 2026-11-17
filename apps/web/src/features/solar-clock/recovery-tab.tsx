/**
 * Clock recovery: the power has been off, the clocks are wrong, there is no internet and
 * perhaps no signal. From a typed date, the place, and something measured about the sun
 * with a stick, string and a ruler, the time to set the clocks by, with an honest range.
 * Nothing here reads this device's clock. The methods are in order of how good they are.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Field } from "@/components/ui/input";
import { type IsoDate, isIsoDate } from "@/features/maps/lib/sun";
import { dateIn, deviceZone } from "@/features/maps/lib/sun-text";
import { useClockStyle } from "@/lib/clock";
import {
  Calculator,
  ChoiceField,
  Formula,
  HowWorkedOut,
  Inputs,
  NumberField,
  type NumberSpec,
  u,
  useChoice,
  useNumber,
} from "../tools/kit";
import { type ChosenPlace, NoPlaceYet } from "./place";
import {
  clockError,
  dateShift,
  HORIZON_REFRACTION_DEGREES,
  halfwayReading,
  noonByEqualShadows,
  noonByShortestShadow,
  type Outcome,
  SHADOW_BLUR_DEGREES,
  timeFromSeaHorizon,
  timeFromShadowBearing,
  timeFromShadowLength,
} from "./recovery";
import { SOLAR_SOURCES as S } from "./sources";
import { TimeResult } from "./time-result";
import { giveOrTake, reading, type ZoneChoice } from "./zone";

const SECTIONS = [
  { id: "recover-noon", title: "Noon from a shadow" },
  { id: "recover-length", title: "The time from a shadow's length" },
  { id: "recover-bearing", title: "The time from a shadow's bearing" },
  { id: "recover-sunrise", title: "Sunrise or sunset on the sea" },
  { id: "recover-date", title: "If the date is not certain" },
  { id: "recover-better", title: "Better sources" },
] as const;

const lengths = [u.cm, u.inch] as const;
const stickSpec: NumberSpec = {
  id: "solar-clock.stick",
  label: "Height of the stick above the ground",
  initial: 100,
  units: lengths,
  above: 0,
  max: 10,
};
const radiusSpec: NumberSpec = {
  id: "solar-clock.radius",
  label: "Radius of the circle",
  initial: 400,
  units: lengths,
  above: 0,
  max: 100,
  hint: "From the foot of the stick to the circle the shadow's tip touches.",
};
const markSpec: NumberSpec = {
  id: "solar-clock.mark",
  label: "How exactly you can mark the shadow's tip",
  initial: 5,
  units: [u.mm, u.inch],
  above: 0,
  max: 0.5,
  hint: "Give or take. The tip is blurred: 5 mm with a 1 m stick is careful work.",
};
const shadowSpec: NumberSpec = {
  id: "solar-clock.shadow",
  label: "Length of the shadow",
  initial: 360,
  units: lengths,
  above: 0,
  max: 1000,
};
const bearingSpec: NumberSpec = {
  id: "solar-clock.bearing",
  label: "Compass bearing of the shadow",
  initial: 330,
  suffix: "°",
  min: 0,
  max: 360,
  hint: "From the foot of the stick to the tip of its shadow.",
};
const declinationSpec: NumberSpec = {
  id: "solar-clock.declination",
  label: "Magnetic declination (east +, west −)",
  initial: "",
  suffix: "°",
  min: -60,
  max: 60,
  optional: true,
  hint: "From a recent map's margin: 1.5 for 1.5° east, −2 for 2° west. Leave empty if you do not know it.",
};
const compassSpec: NumberSpec = {
  id: "solar-clock.compass",
  label: "How exactly you can read the compass",
  initial: 2,
  suffix: "°",
  above: 0,
  max: 45,
};
const eyeSpec: NumberSpec = {
  id: "solar-clock.eye",
  label: "Height of your eye above the sea",
  initial: 2,
  units: [u.m, u.ft],
  min: 0,
  max: 1000,
};

type NoonWay = "equal" | "shortest";
const NOON_WAYS = [
  { value: "equal" as const, label: "Two equal shadows", description: "Better: two marks either side of noon" },
  { value: "shortest" as const, label: "The shortest shadow", description: "Simpler, rougher: one mark at noon" },
];
const HALVES = [
  { value: "morning" as const, label: "Morning" },
  { value: "afternoon" as const, label: "Afternoon" },
];
const EVENTS = [
  { value: "rise" as const, label: "Sunrise" },
  { value: "set" as const, label: "Sunset" },
];

const inputClass =
  "h-9 w-full rounded-control border border-border-strong bg-page px-3 text-body text-ink tabular hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 aria-invalid:border-danger max-md:h-11";

/** Minutes past midnight from "14:05", or null. */
const minutesOf = (text: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
};

function Steps({ children }: { children: string[] }) {
  return (
    <ol className="mt-1 mb-4 grid max-w-[62ch] list-decimal gap-1.5 pl-5 text-body text-ink marker:text-ink-muted">
      {children.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

export function RecoveryTab({ place, zone }: { place: ChosenPlace | null; zone: ZoneChoice }) {
  const style = useClockStyle();
  const [dateText, setDate] = useState<string>(() => dateIn(deviceZone(), Date.now()));
  const date: IsoDate | null = isIsoDate(dateText) ? dateText : null;

  const stick = useNumber(stickSpec);
  const radius = useNumber(radiusSpec);
  const mark = useNumber(markSpec);
  const shadow = useNumber(shadowSpec);
  const bearing = useNumber(bearingSpec);
  const declination = useNumber(declinationSpec);
  const compass = useNumber(compassSpec);
  const eye = useNumber(eyeSpec);
  const [noonWay, setNoonWay] = useChoice<NoonWay>("solar-clock.noon-way", NOON_WAYS, "equal");
  const [half, setHalf] = useChoice<"morning" | "afternoon">("solar-clock.half", HALVES, "morning");
  const [event, setEvent] = useChoice<"rise" | "set">("solar-clock.event", EVENTS, "rise");
  const [firstReading, setFirst] = useState("");
  const [secondReading, setSecond] = useState("");

  const compute = useMemo(() => {
    if (!place) return null;
    const noon =
      stick.value !== null && mark.value !== null && (noonWay === "shortest" || radius.value !== null)
        ? (on: IsoDate) =>
            noonWay === "equal"
              ? noonByEqualShadows(place, on, stick.value!, radius.value!, mark.value!)
              : noonByShortestShadow(place, on, stick.value!, mark.value!)
        : null;
    const length =
      stick.value !== null && shadow.value !== null && mark.value !== null
        ? (on: IsoDate) => timeFromShadowLength(place, on, stick.value!, shadow.value!, half, mark.value!)
        : null;
    const bearingAt =
      bearing.value !== null && compass.value !== null && declination.error === null
        ? (on: IsoDate) => timeFromShadowBearing(place, on, bearing.value!, declination.value, compass.value!)
        : null;
    const sea = eye.value !== null ? (on: IsoDate) => timeFromSeaHorizon(place, on, event, eye.value!) : null;
    return { noon, length, bearing: bearingAt, sea };
  }, [
    place,
    stick.value,
    radius.value,
    mark.value,
    shadow.value,
    bearing.value,
    declination.value,
    declination.error,
    compass.value,
    eye.value,
    noonWay,
    half,
    event,
  ]);

  const outcomes = useMemo(() => {
    if (!compute || !date) return null;
    return {
      noon: compute.noon ? compute.noon(date) : null,
      length: compute.length ? compute.length(date) : null,
      bearing: compute.bearing ? compute.bearing(date) : null,
      sea: compute.sea ? compute.sea(date) : null,
    };
  }, [compute, date]);

  const shifts = useMemo(() => {
    if (!compute || !date) return [];
    const rows: Array<{ name: string; shift: ReturnType<typeof dateShift> }> = [];
    const add = (name: string, method: ((on: IsoDate) => Outcome) | null) => {
      if (method?.(date).ok) rows.push({ name, shift: dateShift(method, date) });
    };
    add(noonWay === "equal" ? "Noon, two equal shadows" : "Noon, the shortest shadow", compute.noon);
    add("The shadow's length", compute.length);
    add("The shadow's bearing", compute.bearing);
    add(event === "rise" ? "Sunrise on the sea" : "Sunset on the sea", compute.sea);
    return rows;
  }, [compute, date, noonWay, event]);

  // The wrong clock's two readings, for the equal shadows.
  const correction = useMemo(() => {
    const first = minutesOf(firstReading);
    const second = minutesOf(secondReading);
    if (first === null || second === null || !outcomes?.noon?.ok || noonWay !== "equal") return null;
    const shouldRead = reading(zone, outcomes.noon.estimate.at).minutes;
    const error = clockError(shouldRead, halfwayReading(first, second));
    const width = (outcomes.noon.estimate.high - outcomes.noon.estimate.low) / 2 / 60_000;
    return { error, width };
  }, [firstReading, secondReading, outcomes, zone, noonWay]);

  const dateError = dateText && !date ? "Not a date. Use the date picker, or type it as 2026-11-17." : undefined;

  return (
    <div>
      <div className="mb-6 grid max-w-[62ch] gap-3 text-body text-ink">
        <p>
          For when the power has been off and the clocks are wrong, with no internet and perhaps no phone signal. You need the date,
          roughly, the place, and a sunny day. Measure something about the sun with a straight stick, level ground, string and a ruler, and
          this gives the time to set your clocks by, with how far to trust it. Nothing here reads this device's clock: every method works
          from what you type, so it works even if this device's own clock is wrong.
        </p>
        <p className="text-ink-muted">
          The methods are in order of how good they are, the noon methods first. Times are written on the clock chosen under "Clocks here
          keep" above: if this device's time zone may be wrong too, choose the offset by hand there.
        </p>
      </div>
      <nav aria-label="Parts of clock recovery" className="mb-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(section.id)?.scrollIntoView({ block: "start" });
                  document.getElementById(`${section.id}-title`)?.focus({ preventScroll: true });
                }}
                className="inline-flex min-h-11 items-center text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2 md:min-h-8"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mb-2 max-w-sm">
        <Field
          label="The date of the measurement"
          error={dateError}
          hint={
            !dateError
              ? "Filled in from this device. Change it if this device's date may be wrong too; a day or two out matters little for noon."
              : undefined
          }
        >
          {(ids) => (
            <input {...ids} type="date" value={dateText} onChange={(event) => setDate(event.target.value)} className={inputClass} />
          )}
        </Field>
      </div>
      {!place ? (
        <div className="mt-6">
          <NoPlaceYet />
        </div>
      ) : null}

      <div className="grid">
        <Calculator
          id="recover-noon"
          title="Noon from a shadow"
          intro="The best of the stick methods. At solar noon the sun is due south (due north in the southern hemisphere) and a shadow is at its shortest. You find that moment, and this says what the clock should read then."
        >
          <div className="mb-4 max-w-sm">
            <ChoiceField label="How" value={noonWay} onChange={setNoonWay} options={NOON_WAYS} />
          </div>
          {noonWay === "equal" ? (
            <Steps>
              {[
                "Push a straight stick into level ground, or stand it in a bucket of sand, upright: check it with a weighted string held beside it, from two sides.",
                "Tie a loop of string round the foot of the stick and, keeping it taut, scratch a circle round the stick on the ground, a little wider than the shadow will be in the morning when you start. Measure its radius.",
                "In the morning, as the shadow shortens, watch for its tip to touch the circle. Note the time on any clock or watch that is running, even if it shows the wrong time.",
                "In the afternoon, as the shadow lengthens again, note the time on the same clock when the tip touches the circle a second time.",
                "Halfway between your two readings, the clock should have read the time below. Type your two readings to see how far the clock is out.",
              ]}
            </Steps>
          ) : (
            <Steps>
              {[
                "Push a straight stick into level ground, upright: check it with a weighted string held beside it, from two sides.",
                "From about half an hour before you expect noon, mark the tip of the shadow every few minutes with a pebble or a peg.",
                "The shadow shortens, stops, then lengthens. Its shortest moment is solar noon: set your clock to the time below then.",
                "It changes very slowly near noon, so the moment is hard to pick: this is why two equal shadows are better.",
              ]}
            </Steps>
          )}
          <Inputs>
            <NumberField input={stick} />
            {noonWay === "equal" ? <NumberField input={radius} /> : null}
            <NumberField input={mark} />
          </Inputs>
          {place && date ? (
            <TimeResult
              outcome={outcomes?.noon ?? null}
              label={noonWay === "equal" ? "The time halfway between the two marks" : "The time at the shortest shadow"}
              lead={
                noonWay === "equal"
                  ? "Halfway between your two marks, the clock should have read"
                  : "At the moment the shadow is shortest, set your clock to"
              }
              zone={zone}
              style={style}
              date={date}
              keepTitle={`Solar noon on ${date} at ${place.name}`}
            />
          ) : null}
          {noonWay === "equal" && place && date && outcomes?.noon?.ok ? (
            <div className="mt-4">
              <p className="mb-2 text-small font-medium text-ink">If a clock was running, what it read (optional)</p>
              <Inputs>
                <Field label="At the morning mark">
                  {(ids) => (
                    <input
                      {...ids}
                      type="time"
                      value={firstReading}
                      onChange={(event) => setFirst(event.target.value)}
                      className={inputClass}
                    />
                  )}
                </Field>
                <Field label="At the afternoon mark">
                  {(ids) => (
                    <input
                      {...ids}
                      type="time"
                      value={secondReading}
                      onChange={(event) => setSecond(event.target.value)}
                      className={inputClass}
                    />
                  )}
                </Field>
              </Inputs>
              {correction ? (
                <p className="mt-3 text-body text-ink" aria-live="polite">
                  {Math.round(correction.error) === 0
                    ? `That clock is right, ${giveOrTake(correction.width)}.`
                    : `That clock is ${Math.abs(Math.round(correction.error))} minutes ${correction.error > 0 ? "slow: put it forward" : "fast: put it back"} by that much, ${giveOrTake(correction.width)}.`}
                </p>
              ) : null}
            </div>
          ) : null}
          <HowWorkedOut
            formula={
              <>
                <p>
                  Solar noon is when the sun crosses the meridian: from NOAA's equations (after Meeus), noon = 12:00 − 4 min × longitude
                  east − equation of time, in UTC, then put on your clock.
                </p>
                <Formula>shadow length = stick height ÷ tan(sun's apparent height)</Formula>
                <p>
                  The shortest shadow: the range is how long the shadow stays within your marking error of its shortest. Two equal shadows:
                  the two moments the sun stands at the height whose shadow reaches the circle are worked out, and so is the moment halfway
                  between them (it differs from noon by seconds, as the sun's declination changes); the range is your marking error divided
                  by how fast the tip is moving then.
                </p>
              </>
            }
            range="Anywhere the sun is at least 3° high at noon. In the polar night there is no shadow; at the poles there is no noon."
            limits="A stick that is not upright or ground that is not level moves the shortest point. Your marking error is yours to state; the screen does not know it."
            sources={[S.noaa, S.ypop, S.usnoCelnav]}
          />
        </Calculator>

        <Calculator
          id="recover-length"
          title="The time from a shadow's length"
          intro="Quicker, with one measurement, and good well away from noon, when the sun climbs or sinks fast. Useless near noon, when its height hardly changes."
        >
          <Steps>
            {[
              "Stand the stick upright on level ground and measure its height above the ground.",
              "Measure the shadow from the foot of the stick to the middle of its blurred tip.",
              "Say whether it is morning or afternoon: the same shadow comes twice a day.",
            ]}
          </Steps>
          <Inputs>
            <NumberField input={stick} />
            <NumberField input={shadow} />
            <NumberField input={mark} />
            <ChoiceField label="When" value={half} onChange={setHalf} options={HALVES} />
          </Inputs>
          {place && date ? (
            <TimeResult
              outcome={outcomes?.length ?? null}
              label="The time when the shadow was measured"
              lead="When you measured it, the time was"
              zone={zone}
              style={style}
              date={date}
              keepTitle={`The time from a shadow on ${date} at ${place.name}`}
            />
          ) : null}
          <HowWorkedOut
            formula={
              <>
                <Formula>apparent height = atan(stick ÷ shadow)</Formula>
                <p>
                  The air's refraction is taken off (NOAA's model) to give the sun's true height, and the time is when the sun stands at
                  that height on that side of noon. The range puts your error on both lengths, and half the sun's width (
                  {SHADOW_BLUR_DEGREES}°, Outpost's own allowance) for the blurred tip, through the same arithmetic.
                </p>
              </>
            }
            range="Good from about two hours from noon until the sun is low. Within an hour or so of noon the range grows to the best part of an hour, and the screen says so."
            limits="A leaning stick or sloping ground changes the shadow's length directly; an error of a degree in the sun's height can be several minutes."
            sources={[S.noaa, S.bowditch]}
          />
        </Calculator>

        <Calculator
          id="recover-bearing"
          title="The time from a shadow's bearing"
          intro="Needs a compass and the magnetic declination, which a compass is out by. Good when the sun is moving fast across the sky."
        >
          <Steps>
            {[
              "Stand the stick upright on level ground.",
              "Hold the compass level over the line of the shadow, away from metal, and read the bearing from the foot of the stick to the tip.",
              "Type the magnetic declination for where you are, from a recent map's margin. Without it the answer is out by an unknown amount.",
            ]}
          </Steps>
          <Inputs>
            <NumberField input={bearing} />
            <NumberField input={declination} />
            <NumberField input={compass} />
          </Inputs>
          {place && date ? (
            <TimeResult
              outcome={outcomes?.bearing ?? null}
              label="The time when the bearing was read"
              lead="When you read the bearing, the time was"
              zone={zone}
              style={style}
              date={date}
              keepTitle={`The time from a shadow's bearing on ${date} at ${place.name}`}
            />
          ) : null}
          <HowWorkedOut
            formula={
              <>
                <Formula>sun's true bearing = shadow's compass bearing + 180° + declination (east positive)</Formula>
                <p>
                  The time is when the sun stands at that bearing between sunrise and sunset; the range is the compass error put through the
                  same.
                </p>
              </>
            }
            range="Anywhere the sun is up. Weak near sunrise and sunset at high latitudes, where the sun's bearing changes slowly."
            limits="Outpost has no model of the Earth's magnetic field, so it cannot give the declination. Iron, steel and cars nearby turn a compass."
            sources={[S.noaa, S.bowditch]}
          />
        </Calculator>

        <Calculator
          id="recover-sunrise"
          title="Sunrise or sunset on the sea"
          intro="A rough check only: the moment the top of the sun clears or leaves a true sea horizon. Do not watch the sun to see it: catch the first or last gleam out of the corner of your eye."
        >
          <Inputs>
            <ChoiceField label="Which" value={event} onChange={setEvent} options={EVENTS} />
            <NumberField input={eye} />
          </Inputs>
          {place && date ? (
            <TimeResult
              outcome={outcomes?.sea ?? null}
              label={event === "rise" ? "The time of sunrise" : "The time of sunset"}
              lead={event === "rise" ? "The sun's top edge cleared the sea at" : "The sun's top edge left the sea at"}
              zone={zone}
              style={style}
              date={date}
              keepTitle={`${event === "rise" ? "Sunrise" : "Sunset"} on ${date} at ${place.name}`}
            />
          ) : null}
          <HowWorkedOut
            formula={
              <>
                <p>The sun's centre 0.833° below a level line at sunrise and sunset (NOAA), lower still by the dip of a sea horizon:</p>
                <Formula>dip = 1.76′ × √(eye height in metres)</Formula>
              </>
            }
            range={`Rough: refraction at the horizon wanders from its average with the air's temperature; Outpost allows ±${HORIZON_REFRACTION_DEGREES}° for it, its own allowance and not a published figure.`}
            limits="Land, haze or cloud on the horizon. Never look at the sun directly."
            sources={[S.noaa, S.bowditch]}
          />
        </Calculator>

        <Calculator
          id="recover-date"
          title="If the date is not certain"
          intro="How far each answer above moves if the date is out by a few days either way. It matters little for noon (only through the equation of time) and more for the others (through the sun's declination as well)."
        >
          {shifts.length === 0 ? (
            <p className="text-body text-ink-muted">Work out a time above and its sensitivity to the date shows here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-small tabular">
                <caption className="sr-only">How much each answer moves for a date wrong by 1, 3 or 7 days</caption>
                <thead>
                  <tr className="border-b border-border text-left text-ink-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Method
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      1 day out
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      3 days
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      A week
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shifts.map((row) => (
                    <tr key={row.name}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-ink">
                        {row.name}
                      </th>
                      {row.shift.map((cell) => (
                        <td key={cell.days} className="py-2 pr-3 whitespace-nowrap text-ink">
                          {cell.minutes === null ? "–" : cell.minutes < 1 ? "under 1 min" : `${Math.round(cell.minutes)} min`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Calculator>

        <Calculator id="recover-better" title="Better sources" intro="When any of these is in reach, it beats a stick by far.">
          <ul className="grid max-w-[62ch] list-disc gap-1.5 pl-5 text-body text-ink">
            <li>
              A radio time signal: shortwave time stations and their frequencies are listed under{" "}
              <Link to="/radio/frequencies" className="text-primary underline underline-offset-2">
                Radio frequencies
              </Link>
              . A broadcast radio's news pips do as well.
            </li>
            <li>A GPS receiver, a satnav or a GPS watch: they take the time from the satellites, with no internet.</li>
            <li>A phone that has had signal since the power came back: it sets its clock from the network.</li>
          </ul>
        </Calculator>
      </div>
    </div>
  );
}
