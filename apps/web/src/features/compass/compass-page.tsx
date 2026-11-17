/**
 * Tools → Compass: the three norths at a place (true, magnetic and, in Great Britain, the
 * Ordnance Survey grid), the rule a person with a paper map and a compass needs there,
 * the phone's own compass corrected by them, and a bearing converted between them.
 *
 * Worked out on this device from the World Magnetic Model (packages/shared/src/wmm.ts)
 * with no internet. The place is the home place unless another is chosen (a saved place,
 * the middle of the map, where the device is, or typed); the map's centre card opens this
 * screen with `?lat=&lon=`. The choice is a preference of this browser, nothing more.
 */
import { type Norths, northsAt } from "@outpost/shared";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { OriginPicker, useOrigin } from "@/features/repeaters/origin";
import { Calculator, Formula, HowWorkedOut, Result, ToolScreen } from "../tools/kit";
import { BearingConverter } from "./bearing-converter";
import { LiveCompass } from "./live-compass";
import { NorthsAnswer } from "./norths-answer";
import { NorthsRose } from "./norths-plates";
import { COMPASS_SOURCES as S } from "./sources";

const CALCULATORS = [
  { id: "norths", title: "North here" },
  { id: "live", title: "Live compass" },
  { id: "convert", title: "Convert a bearing" },
] as const;

const KEYS = { choice: "outpost.compass.from", typed: "outpost.compass.fromTyped" };

/** A position handed in by the address, as the map's centre card gives it. */
function givenPosition(params: URLSearchParams): { lat: number; lon: number } | null {
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!params.has("lat") || !params.has("lon") || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export default function CompassPage() {
  const [params] = useSearchParams();
  const [given] = useState(() => givenPosition(params));
  const origin = useOrigin(given, KEYS);
  // The date the figures are for: today, as this device's clock has it when the screen is opened.
  const [now] = useState(() => Date.now());
  const position = origin.position;
  const norths: Norths | null = useMemo(() => (position ? northsAt(position.lat, position.lon, now) : null), [position, now]);

  return (
    <ToolScreen
      title="Compass"
      description="Where magnetic north and the map's grid north lie from true north at a place, what to add or subtract between map and compass, and the phone's own compass corrected by them. Worked out on this device with no internet."
      calculators={CALCULATORS}
      footer={
        <>
          General information for finding your way, not a substitute for a compass checked against the ground. The model gives the Earth's
          main field; rocks, iron and power lines nearby can move a needle further than any figure here.
        </>
      }
    >
      <section aria-label="Place" className="mb-2 grid gap-4 sm:grid-cols-2">
        <OriginPicker origin={origin} label="Place" />
        {position ? (
          <p className="self-end font-mono text-small text-ink-muted sm:col-span-2">
            {origin.name ? `${origin.name} · ` : ""}
            {position.lat.toFixed(4)}, {position.lon.toFixed(4)}
          </p>
        ) : null}
      </section>

      <Calculator
        id="norths"
        title="North here"
        intro="True north is along the meridian, magnetic north is where a compass needle points, and grid north is up the lines of an Ordnance Survey map."
      >
        {norths ? (
          <>
            <NorthsAnswer norths={norths} at={now} placeName={origin.name} />
            <NorthsRose norths={norths} />
          </>
        ) : (
          <Result
            label="North here"
            figure={null}
            refusal={
              origin.locating ? (
                "Finding where this device is."
              ) : (
                <>
                  Choose a place above: a saved place, the middle of the map, where you are, or a position or grid reference typed in. To
                  start from your home, mark it on{" "}
                  <Link to="/maps" className="text-primary underline underline-offset-2">
                    Maps
                  </Link>{" "}
                  with the home icon.
                </>
              )
            }
          />
        )}
        <HowWorkedOut
          formula={
            <>
              <p>Magnetic north from true north, the declination D, is from the World Magnetic Model:</p>
              <Formula>D = atan2(Y, X)</Formula>
              <p>
                where X and Y are the field's north and east parts, from the model's spherical-harmonic coefficients to degree 12 for
                today's date, at the place's latitude and longitude on the ground. Grid north from true north, the convergence C, is the
                direction a meridian runs on the National Grid, worked from the grid's own projection, as the map draws it. Then:
              </p>
              <Formula>grid magnetic angle = D − C</Formula>
              <Formula>bearing on the compass = bearing on the map − grid magnetic angle</Formula>
              <p>
                East counts as plus and west as minus. The rule is rounded to whole degrees, as a hand compass is set and read; the figures
                above it are to a tenth.
              </p>
            </>
          }
          range={
            <>
              The model is for 2025 to 2029 and anywhere on Earth, except close to the magnetic poles (NOAA's blackout and caution zones,
              which are said when a place is in one). The grid is Great Britain's National Grid only: maps of Ireland and Northern Ireland
              use the Irish Grid, which is not worked out here.
            </>
          }
          limits={
            <>
              Local magnetism (magnetic rocks, iron, cables), which in some hills moves a needle by several degrees; the daily swing and
              magnetic storms; and height, which changes nothing a compass could show.
            </>
          }
          sources={[S.wmm, S.report, S.osgb]}
        />
      </Calculator>

      <LiveCompass norths={norths} />

      <BearingConverter norths={norths} />
    </ToolScreen>
  );
}
