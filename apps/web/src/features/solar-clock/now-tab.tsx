/**
 * Now: where the sun is at the place by this device's clock, sundial time beside clock
 * time, the equation of time and the longitude correction, today's solar noon, and the
 * sun's path through today. The one part of the solar clock that trusts the device's
 * clock, and it says so.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { formatBearing } from "@/features/maps/lib/geo";
import { apparentSolarHours, sunAt, sunDay } from "@/features/maps/lib/sun";
import { clockText, useClockStyle } from "@/lib/clock";
import { Formula, HowWorkedOut } from "../tools/kit";
import { type ChosenPlace, NoPlaceYet } from "./place";
import { SOLAR_SOURCES as S } from "./sources";
import { SunPathChart, sunPath } from "./sun-path-chart";
import { clockAt, formatOffset, offsetAt, reading, standardOffset, type ZoneChoice } from "./zone";

const MINUTE = 60_000;

/**
 * The device's clock, read again at the turn of each minute: the tab shows minutes and
 * tenths of a degree, which change no faster. Not read at all while the page is hidden;
 * read at once when it is shown again.
 */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    const next = () => {
      const at = Date.now();
      timer = window.setTimeout(tick, MINUTE - (at % MINUTE));
    };
    const tick = () => {
      setNow(Date.now());
      next();
    };
    const onVisibility = () => {
      window.clearTimeout(timer);
      timer = undefined;
      if (document.visibilityState === "hidden") return;
      tick();
    };
    if (document.visibilityState !== "hidden") next();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return now;
}

/** "+15 min 3 s", "−3 min 34 s". */
export function minutesAndSeconds(minutes: number): string {
  const total = Math.round(Math.abs(minutes) * 60);
  const sign = minutes < 0 ? "−" : "+";
  const whole = Math.floor(total / 60);
  const seconds = total % 60;
  return `${sign}${whole} min${seconds ? ` ${seconds} s` : ""}`;
}

export function NowTab({ place, zone }: { place: ChosenPlace | null; zone: ZoneChoice }) {
  const now = useMinuteClock();
  const style = useClockStyle();
  const figures = useMemo(() => {
    if (!place) return null;
    const sun = sunAt(now, place.lat, place.lon);
    const today = reading(zone, now).date;
    const day = sunDay(place.lat, place.lon, today);
    const solar = apparentSolarHours(now, place.lon);
    const offset = offsetAt(zone, now);
    const standard = standardOffset(zone, now);
    // Four minutes for each degree the place lies west of the meridian its clock keeps (15° for each hour of the offset): added to sundial time.
    const longitudeMinutes = standard - 4 * place.lon;
    const points = sunPath(now, place.lat, place.lon, zone);
    return { sun, day, solar, offset, standard, longitudeMinutes, points, today };
  }, [place, zone, now]);

  if (!place || !figures) return <NoPlaceYet />;
  const { sun, day, solar, offset, standard, longitudeMinutes, points, today } = figures;
  const solarHour = Math.floor(solar);
  const solarMinute = Math.floor((solar - solarHour) * 60);
  const summer = offset !== standard;
  const rows: Array<[string, string, string?]> = [
    [
      "Height of the sun",
      sun.apparentAltitude >= 0
        ? `${sun.apparentAltitude.toFixed(1)}° above the horizon`
        : `${Math.abs(sun.apparentAltitude).toFixed(1)}° below the horizon`,
      "as seen, with the air's refraction",
    ],
    ["Bearing of the sun", formatBearing(sun.azimuth), "true, not magnetic"],
    ["Sundial time here", clockText(solarHour, solarMinute, style), "local apparent solar time"],
    [
      "This device's clock",
      clockAt(now, zone, style),
      zone.kind === "device" ? `${zone.zone.replace(/_/g, " ")}, ${formatOffset(offset)}` : `${formatOffset(offset)}, set by hand`,
    ],
    [
      "Equation of time today",
      minutesAndSeconds(sun.equationOfTime),
      sun.equationOfTime >= 0 ? "a sundial runs ahead of a clock by this" : "a sundial runs behind a clock by this",
    ],
    [
      "Longitude correction",
      minutesAndSeconds(longitudeMinutes),
      `added to sundial time: the place is ${Math.abs(place.lon - standard / 4).toFixed(1)}° ${place.lon >= standard / 4 ? "east" : "west"} of the meridian of ${formatOffset(standard)}${summer ? " (summer time adds its hour on top)" : ""}`,
    ],
    [
      "Solar noon today",
      clockAt(day.noon, zone, style, today),
      `the sun ${day.noonAltitude >= -0.833 ? `${day.noonAltitude.toFixed(1)}° high` : "below the horizon all day"}`,
    ],
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-small">
        {rows.map(([label, value, detail]) => (
          <div key={label} className="contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="text-ink">
              <span className="tabular font-semibold">{value}</span>
              {detail ? <span className="text-ink-muted"> · {detail}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="mb-2 text-lead font-semibold text-ink">The sun's path today</h3>
        <SunPathChart
          points={points}
          now={now}
          current={{ at: now, altitude: sun.apparentAltitude, azimuth: sun.azimuth }}
          zone={zone}
          style={style}
        />
        {day.sun.kind === "below" ? (
          <p className="mt-1 text-small text-ink-muted">The sun stays below the horizon all day here today: the polar night.</p>
        ) : day.sun.kind === "above" ? (
          <p className="mt-1 text-small text-ink-muted">The sun stays above the horizon all day here today: the midnight sun.</p>
        ) : null}
      </div>
      <p className="max-w-[60ch] text-body text-ink">
        Everything on this tab trusts this device's clock. If that clock may be wrong (after a power cut, say), use{" "}
        <Link to="?tab=recover" className="text-primary underline underline-offset-2">
          Clock recovery
        </Link>
        : nothing there reads it.
      </p>
      <HowWorkedOut
        formula={
          <>
            <p>
              The sun's declination and the equation of time from NOAA's equations (after Meeus), then the hour angle and the navigational
              triangle:
            </p>
            <Formula>hour angle = (UTC minutes + equation of time + 4 × longitude) ÷ 4 − 180°</Formula>
            <Formula>sin height = sin lat × sin dec + cos lat × cos dec × cos hour angle</Formula>
            <Formula>bearing = atan2(sin HA, cos HA × sin lat − tan dec × cos lat) + 180°</Formula>
            <p>Clock time = sundial time − equation of time + (zone offset − 4 min × longitude east).</p>
          </>
        }
        range="Held to the US Naval Observatory to within 0.02° in height and bearing and 4 seconds in the equation of time, from the equator to 89.9° north and 55° south. At the poles themselves the bearing has no meaning; a hair from them it is kept."
        limits="A flat horizon. The refraction is an average; near the horizon the real figure varies."
        sources={[S.noaa, S.bowditch, S.usnoCelnav]}
      />
    </div>
  );
}
