/**
 * Tools → Night sky: the Moon tonight, a chart of the whole sky for the chosen place now
 * or at a chosen time, what is up, and how to find north (or south) by the stars. Worked
 * out on this device from a bundled star catalogue and the orbits of the Moon and the
 * planets; nothing is fetched. The place and the clock are the Solar clock's, chosen once
 * and remembered on this device.
 */
import { moonRiseSet, moonState, nextPhases, skyAt } from "@outpost/shared/sky";
import { useMemo, useState } from "react";
import { Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { formatShortDate } from "@/features/maps/lib/sun-text";
import { useClockStyle } from "@/lib/clock";
import { useMinuteClock } from "../solar-clock/now-tab";
import { NoPlaceYet, usePlaceAndZone } from "../solar-clock/place";
import { clockAt, offsetAt, reading, type ZoneChoice } from "../solar-clock/zone";
import { HowWorkedOut } from "../tools/kit";
import { chartModel, constellationsUp, poleView, upNow } from "./model";
import { PoleFindingPlate, SkyChartPlate } from "./plates";
import { ALMANAC_ACCURACY, SKY_SOURCES as S } from "./sources";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The instant a clock reading names: a date and "HH:MM" on the chosen clock. Null if either is not usable. */
export function instantOf(date: string, time: string, zone: ZoneChoice): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const guess = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  if (!Number.isFinite(guess)) return null;
  // The offset at the guess, then again at the answer, so that a change of summer time between the two is caught.
  const first = guess - offsetAt(zone, guess) * MINUTE;
  return guess - offsetAt(zone, first) * MINUTE;
}

export default function NightSkyPage() {
  const { place, zone, picker } = usePlaceAndZone();
  const now = useMinuteClock();
  const style = useClockStyle();
  const [mode, setMode] = useState<"now" | "chosen">("now");
  const today = reading(zone, now);
  const [date, setDate] = useState(today.date);
  const [time, setTime] = useState("22:00");
  const chosen = instantOf(date, time, zone);
  const at = mode === "now" ? now : chosen;

  return (
    <Page width="reading">
      <PageHeader
        title="Night sky"
        description="The Moon tonight, a chart of the stars and planets for your place now or at another time, and finding north by the stars. Worked out on this device with no internet."
      />
      <section aria-label="Place and clock" className="mb-6">
        {picker}
      </section>
      <section aria-label="When" className="mb-8 grid gap-3">
        <Segmented
          label="When"
          value={mode}
          onChange={setMode}
          options={[
            { value: "now", label: "Now" },
            { value: "chosen", label: "Another time" },
          ]}
        />
        {mode === "chosen" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">{(ids) => <Input {...ids} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label="Time" hint="On the clock chosen above." error={chosen === null ? "Choose a date and a time." : undefined}>
              {(ids) => <Input {...ids} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
            </Field>
          </div>
        ) : null}
      </section>
      {!place ? <NoPlaceYet /> : at === null ? null : <Sky place={place} at={at} zone={zone} style={style} />}
    </Page>
  );
}

function Sky({
  place,
  at,
  zone,
  style,
}: {
  place: { lat: number; lon: number; name: string };
  at: number;
  zone: ZoneChoice;
  style: ReturnType<typeof useClockStyle>;
}) {
  const sky = useMemo(() => skyAt(at, place.lat, place.lon), [at, place.lat, place.lon]);
  const chart = useMemo(() => chartModel(sky), [sky]);
  const up = useMemo(() => upNow(sky), [sky]);
  const constellations = useMemo(() => constellationsUp(sky), [sky]);
  const pole = useMemo(() => poleView(at, place.lat, place.lon), [at, place.lat, place.lon]);
  const moon = useMemo(() => moonState(at), [at]);
  const { date: day } = reading(zone, at);
  // "Tonight": from midday on the chosen clock's day (the day before, in the small hours) to the next midday.
  const local = reading(zone, at);
  const noon = instantOf(local.date, "12:00", zone) ?? at;
  const start = local.minutes < 12 * 60 ? noon - 24 * HOUR : noon;
  const riseSet = useMemo(() => moonRiseSet(start, start + 24 * HOUR, place.lat, place.lon), [start, place.lat, place.lon]);
  const phases = useMemo(() => nextPhases(at).slice(0, 4), [at]);
  const when = `${clockAt(at, zone, style)} on ${formatShortDate(day)}`;
  const clock = (ms: number) => clockAt(ms, zone, style, day);
  const sunUp = chart.sunAltitude > -6;

  return (
    <div>
      <Section title="The Moon">
        <p className="text-body text-ink">
          {moon.name}, {Math.round(moon.illuminated * 100)}% lit
          {moon.name.includes("crescent") || moon.name.includes("gibbous") ? (moon.waxing ? ", growing" : ", shrinking") : ""}.{" "}
          {riseSet.rise !== null || riseSet.set !== null ? (
            <>
              {riseSet.rise !== null ? `Rises at ${clock(riseSet.rise)}` : "Does not rise"}
              {riseSet.set !== null ? `${riseSet.rise !== null ? ", sets at" : " and sets at"} ${clock(riseSet.set)}` : ", does not set"}{" "}
              between midday and midday.
            </>
          ) : (
            "It neither rises nor sets between midday and midday: it is up, or down, the whole time."
          )}
        </p>
        <Rows className="mt-3">
          {phases.map((phase) => (
            <li key={phase.name} className="flex justify-between gap-3 py-2 text-small">
              <span className="text-ink">{phase.name}</span>
              <span className="tabular text-ink-muted">
                {formatShortDate(reading(zone, phase.at).date)}, {clockAt(phase.at, zone, style)}
              </span>
            </li>
          ))}
        </Rows>
        <HowWorkedOut
          formula={
            <p>
              The Moon's place from its orbit and its twelve largest disturbances by the Sun; the lit part from its angle from the Sun. It
              rises or sets when the top of its disc is on a level horizon, allowing 34′ for the air's bending, its own size and its
              parallax.
            </p>
          }
          range={`Rising and setting to within about three minutes of the US Naval Observatory's times; phases to within ten minutes.`}
          limits="Hills, trees and the height you stand at, which move rising and setting by minutes; the air on the night, which can move it by a minute or more."
          sources={[S.schlyter, S.usnoRst, S.usnoMoon]}
        />
      </Section>

      <Section title="The sky" description={`At ${when}, from ${place.name}.`}>
        {sunUp ? (
          <Notice tone="info" title={chart.sunAltitude > 0 ? "The Sun is up" : "It is still twilight"} className="mb-4">
            The stars on the chart are there but will not be seen until the Sun is more than about 6° below the horizon. Choose a later time
            to see the night's sky.
          </Notice>
        ) : null}
        <SkyChartPlate model={chart} when={when} placeName={place.name} />
        {constellations.length ? (
          <p className="mt-3 text-small text-ink-muted">Constellations drawn that are well up: {constellations.join(", ")}.</p>
        ) : null}
        <h3 className="mt-6 text-body font-semibold text-ink">What is up</h3>
        {up.bodies.length === 0 && up.stars.length === 0 ? (
          <p className="mt-2 text-small text-ink-muted">Nothing bright is above the horizon at this moment.</p>
        ) : (
          <Rows className="mt-2">
            {[...up.bodies, ...up.stars].map((object) => (
              <li key={object.key} className="flex flex-wrap justify-between gap-x-3 py-2 text-small">
                <span className="text-ink">
                  {object.name}
                  {object.kind === "planet" ? <span className="text-ink-muted"> (planet)</span> : null}
                </span>
                <span className="text-ink-muted">
                  {object.where}, magnitude <span className="tabular">{object.magnitude.toFixed(1)}</span>
                </span>
              </li>
            ))}
          </Rows>
        )}
        <HowWorkedOut
          formula={
            <p>
              Each star's catalogue place carried on by its own motion, then turned for precession, nutation and the aberration of light to
              the day; the planets from their orbits, allowing for the time light takes to reach us. The Earth's turning then gives each
              one's direction and height from your place. Lower magnitudes are brighter; the faintest drawn is 4.5, which a dark country sky
              shows easily.
            </p>
          }
          range={`Stars within ${ALMANAC_ACCURACY.stars}′ of arc of the US Naval Observatory's places, the planets within ${ALMANAC_ACCURACY.planets}′, from 2026 to 2035.`}
          limits="Stars fainter than magnitude 4.5, Uranus and Neptune, and Saturn's rings in its brightness. The figures are the usual stick figures of 27 constellations, drawn for Outpost."
          sources={[S.bsc, S.schlyter, S.circular179, S.usnoSidereal, S.usnoDeltaT, S.usnoCelnav]}
        />
      </Section>

      <Section
        title={pole.finding.hemisphere === "north" ? "Finding north by the stars" : "Finding south by the stars"}
        description={`Drawn for ${place.name} at ${when}.`}
      >
        <PoleFindingPlate view={pole} placeName={place.name} />
        <p className="mt-3 text-body text-ink">
          {pole.finding.hemisphere === "north"
            ? `Polaris stands ${Math.round(Math.abs(place.lat))}° above the horizon here, the same as your latitude. It is within a degree of true north all night; everything else turns round it once a day, anticlockwise.`
            : `There is no bright star at the south pole of the sky. It stands ${Math.round(Math.abs(place.lat))}° above the horizon here, the same as your latitude, and the Cross turns round it once a day, clockwise.`}{" "}
          {pole.finding.stars.every((s) => s.up)
            ? ""
            : pole.finding.hemisphere === "north"
              ? "Part of the Plough is below the horizon now: Cassiopeia, on the opposite side of Polaris, will be higher."
              : "The Cross is below the horizon now: try later in the night or later in the year."}
        </p>
        <p className="mt-3 text-small text-ink-muted">
          Mark the direction with two sticks in the ground and it will still be there by day. North found this way is true north, not the
          compass's: see{" "}
          <a href="/tools/compass" className="text-primary underline underline-offset-2">
            Compass
          </a>{" "}
          for the difference where you are.
        </p>
        <HowWorkedOut
          formula={
            <p>
              The method is the US Army survival manual's. The drawing is the sky of that moment, centred on the pole and drawn so that a
              straight line on the sky stays straight on the page.
            </p>
          }
          sources={[S.fm2176, S.bsc]}
        />
      </Section>
    </div>
  );
}
