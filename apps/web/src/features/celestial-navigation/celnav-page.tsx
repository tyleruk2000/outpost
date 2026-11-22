/**
 * Tools → Celestial navigation: a position from sextant sights, with the almanac worked
 * out on this device. Three tabs: Sights and fix (any body, lines of position, the fix
 * on a plotting sheet and on the map), Noon and Polaris (latitude the old ways), and
 * Without a sextant. The sights are kept on this device as typed.
 */

import { compassPoint } from "@outpost/shared";
import {
  clockErrorMiles,
  NAVIGATIONAL_STARS,
  noonLatitude,
  noonLongitude,
  polarisLatitude,
  STARS,
  starsToShoot,
} from "@outpost/shared/sky";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { ALMANAC_ACCURACY, SKY_SOURCES as S } from "../night-sky/sources";
import { useMinuteClock } from "../solar-clock/now-tab";
import { NoPlaceYet, usePlaceAndZone } from "../solar-clock/place";
import { HowWorkedOut } from "../tools/kit";
import { readPref, writePref } from "../tools/kit/device-pref";
import { SheetPdfActions, useSheetPdf } from "../tools/kit/sheet-pdf";
import { EXAMPLE, FORM_TITLE, workedExample } from "./form";
import { PlotPlate } from "./plot-plate";
import { formDocument } from "./print";
import {
  BODY_OPTIONS,
  formatAngle,
  formatLatLon,
  type Horizon,
  hasLimb,
  PLOT_KEY,
  plotOf,
  type Run,
  readAngle,
  type SightRecord,
  sightInstant,
  workSights,
} from "./sights";

const SIGHTS_KEY = "celnav.sights";
const RUN_KEY = "celnav.run";
const TABS = ["sights", "noon", "no-sextant"] as const;
type Tab = (typeof TABS)[number];

const todayUt = () => new Date().toISOString().slice(0, 10);
const newId = () => `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const blankSight = (): SightRecord => ({
  id: newId(),
  body: "sun",
  limb: "lower",
  date: todayUt(),
  time: "",
  hs: "",
  indexError: "0",
  heightOfEye: "2",
  horizon: "sea",
});

function readJson<T>(key: string, fallback: T, ok: (value: unknown) => boolean): T {
  try {
    const raw = readPref(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as unknown;
    return ok(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function CelestialNavigationPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab: Tab = TABS.includes(asked as Tab) ? (asked as Tab) : "sights";
  const setTab = (next: string) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === "sights") copy.delete("tab");
        else copy.set("tab", next);
        return copy;
      },
      { replace: true },
    );
  const { place, picker } = usePlaceAndZone();

  return (
    <Page width="reading">
      <PageHeader
        title="Celestial navigation"
        description="Where you are from sextant sights of the Sun, the Moon, the planets and the stars, with the almanac worked out on this device: no printed almanac, no tables, no internet."
      />
      <Notice tone="warning" title="For learning, and as a fallback" className="mb-6">
        Not for navigating a vessel. Never look at the Sun through a sextant without its shades. The almanac here is checked against the US
        Naval Observatory's but is not a published almanac.
      </Notice>
      <section aria-label="Position worked from" className="mb-8">
        <p className="mb-3 text-small text-ink-muted">
          The position the sights are worked from: your best estimate (dead reckoning), a saved place, or Home.
        </p>
        {picker}
      </section>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6" aria-label="Celestial navigation">
          <TabsTrigger value="sights">Sights and fix</TabsTrigger>
          <TabsTrigger value="noon">Noon and Polaris</TabsTrigger>
          <TabsTrigger value="no-sextant">Without a sextant</TabsTrigger>
        </TabsList>
        <TabsContent value="sights">{place ? <SightsTab dr={place} /> : <NoPlaceYet />}</TabsContent>
        <TabsContent value="noon">{place ? <NoonTab dr={place} /> : <NoPlaceYet />}</TabsContent>
        <TabsContent value="no-sextant">
          <NoSextantTab />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function SightsTab({ dr }: { dr: { lat: number; lon: number; name: string } }) {
  const [sights, setSightsState] = useState<SightRecord[]>(() =>
    readJson<SightRecord[]>(SIGHTS_KEY, [blankSight()], (v) => Array.isArray(v) && v.every((s) => typeof s === "object" && s && "id" in s)),
  );
  const [run, setRunState] = useState<Run>(() =>
    readJson<Run>(RUN_KEY, { course: "", speed: "" }, (v) => typeof v === "object" && v !== null),
  );
  const setSights = (next: SightRecord[]) => {
    setSightsState(next);
    writePref(SIGHTS_KEY, JSON.stringify(next));
  };
  const setRun = (next: Run) => {
    setRunState(next);
    writePref(RUN_KEY, JSON.stringify(next));
  };
  const update = (id: string, change: Partial<SightRecord>) => setSights(sights.map((s) => (s.id === id ? { ...s, ...change } : s)));
  const result = useMemo(() => workSights(sights, dr, run), [sights, dr, run]);
  const plot = useMemo(() => plotOf(result.worked, result.fix, dr, result.fixAt ?? 0), [result, dr]);
  const navigate = useNavigate();
  const showOnMap = () => {
    writePref(PLOT_KEY, JSON.stringify(plot));
    const centre = plot.fix ?? plot.dr;
    navigate(`/maps?celnav=1&lat=${centre.lat.toFixed(4)}&lon=${centre.lon.toFixed(4)}&z=8`);
  };
  const now = useMinuteClock();
  const toShoot = useMemo(() => starsToShoot(STARS, now, dr.lat, dr.lon), [now, dr.lat, dr.lon]);
  const pdf = useSheetPdf(formDocument, {
    title: FORM_TITLE,
    kind: "Form",
    from: { what: "Celestial navigation", path: "/tools/celestial-navigation" },
  });
  const fix = result.fix;
  const fixWords = fix ? `${formatLatLon(fix.position.lat, "lat")}, ${formatLatLon(fix.position.lon, "lon")}` : null;
  const fromDr = fix ? Math.hypot(fix.position.lat - dr.lat, (fix.position.lon - dr.lon) * Math.cos((dr.lat * Math.PI) / 180)) * 60 : 0;

  return (
    <div>
      <Section
        title="Stars to shoot now"
        description="The navigational stars best placed from the position above at this moment: well up, bright, and spread round the sky so that their lines cross well."
      >
        {toShoot.length === 0 ? (
          <p className="text-small text-ink-muted">No navigational star is between 15° and 70° up just now.</p>
        ) : (
          <Rows>
            {toShoot.map((s) => (
              <li key={s.star.hr} className="flex flex-wrap justify-between gap-x-3 py-2 text-small">
                <span className="text-ink">
                  {s.star.name} <span className="text-ink-muted">({s.star.navNumber})</span>
                </span>
                <span className="tabular text-ink-muted">
                  {Math.round(s.altitude)}° up, bearing {Math.round(s.azimuth)}° ({compassPoint(s.azimuth)})
                </span>
              </li>
            ))}
          </Rows>
        )}
        <p className="mt-2 text-small text-ink-muted">
          Star sights need the stars and the horizon together: in the twilight after sunset or before dawn.
        </p>
      </Section>

      <Section title="Sights" description="Times in UT, to the second. Altitudes as degrees and minutes, as 34 12.5.">
        <div className="grid gap-6">
          {sights.map((sight, index) => {
            const worked = result.worked.find((w) => w.record.id === sight.id);
            const problem = result.problems.find((p) => p.id === sight.id)?.problem;
            return (
              <SightEditor
                key={sight.id}
                index={index}
                sight={sight}
                onChange={(change) => update(sight.id, change)}
                onRemove={sights.length > 1 ? () => setSights(sights.filter((s) => s.id !== sight.id)) : undefined}
                worked={worked}
                problem={problem}
              />
            );
          })}
        </div>
        <Button
          className="mt-4"
          onClick={() =>
            setSights([
              ...sights,
              {
                ...blankSight(),
                date: sights.at(-1)?.date ?? todayUt(),
                indexError: sights.at(-1)?.indexError ?? "0",
                heightOfEye: sights.at(-1)?.heightOfEye ?? "2",
                horizon: sights.at(-1)?.horizon ?? "sea",
              },
            ])
          }
        >
          <Plus aria-hidden className="size-4" />
          Add a sight
        </Button>
      </Section>

      <Section
        title="Running between sights"
        description="For a running fix: the course and speed made good between the sights. Leave the speed empty if you stayed put."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Course, degrees true">
            {(ids) => (
              <Input {...ids} inputMode="decimal" value={run.course} onChange={(e) => setRun({ ...run, course: e.target.value })} />
            )}
          </Field>
          <Field label="Speed, knots">
            {(ids) => <Input {...ids} inputMode="decimal" value={run.speed} onChange={(e) => setRun({ ...run, speed: e.target.value })} />}
          </Field>
        </div>
      </Section>

      <Section title="Fix">
        {result.worked.length === 0 ? (
          <p className="text-small text-ink-muted">Fill in a sight above to see its line of position.</p>
        ) : (
          <>
            {fix ? (
              <p className="text-body text-ink">
                <span className="font-mono">{fixWords}</span>, {fromDr.toFixed(1)} nautical miles from the position worked from. Nineteen
                times in twenty it lies within {(fix.ellipse.major * 2.4477).toFixed(1)} miles along a bearing of{" "}
                {Math.round(fix.ellipse.bearing)}° and {(fix.ellipse.minor * 2.4477).toFixed(1)} miles across, if each sight is as good as
                allowed for (a minute of arc for a sextant).
                {fix.cut < 30
                  ? " The lines cross at a narrow angle, so the fix is weak along them: take a sight of a body about 90° round."
                  : ""}
                {fix.worstResidual > 3 ? ` One line is ${fix.worstResidual.toFixed(1)} miles from the fix: check that sight.` : ""}
              </p>
            ) : (
              <p className="text-body text-ink">
                {result.worked.length === 1
                  ? "One line of position: you are somewhere on it. A sight of another body, well round from this one, gives a fix."
                  : "The lines are too nearly parallel to cross well: take a sight of a body about 90° round from these."}
              </p>
            )}
            <div className="mt-4">
              <PlotPlate plot={plot} />
            </div>
            <Button className="mt-4" variant="soft" onClick={showOnMap}>
              Show on the map
            </Button>
          </>
        )}
        <ClockNote latitude={dr.lat} />
        <HowWorkedOut
          formula={
            <div className="grid gap-2">
              <p>
                For each sight: the Greenwich hour angle and declination of the body at that second, worked out here; the sextant altitude
                corrected step by step to the observed altitude; the altitude and azimuth the body would have from the position worked from;
                and the intercept, observed less computed altitude, a minute of arc to a nautical mile, towards the body or away.
              </p>
              <p>
                With two or more lines, the fix is the point closest to all of them (least squares, each sight weighted by how good it is
                likely to be), worked again from that point until it settles. For a running fix, each earlier sight is worked from where you
                were when you took it: the fix less the run since.
              </p>
            </div>
          }
          range={`The almanac within ${ALMANAC_ACCURACY.stars}′ of arc of the US Naval Observatory's for the stars and the Sun, and within ${ALMANAC_ACCURACY.moon}′ for the Moon and the planets, from 2026 to 2035. A minute of arc is a nautical mile of position.`}
          limits="The Moon's augmentation (a few tenths of a minute), the air's temperature and pressure in refraction, and any error of the clock."
          sources={[S.bowditch, S.noaa, S.schlyter, S.circular179, S.bsc, S.usnoSidereal, S.usnoDeltaT, S.usnoCelnav]}
        />
      </Section>

      <Section
        title="Sight form"
        description="A form to fill in by hand, with every step, and a worked example to check the arithmetic against."
      >
        <WorkedExample />
        <SheetPdfActions made={pdf} className="mt-4" />
      </Section>
    </div>
  );
}

function SightEditor({
  index,
  sight,
  onChange,
  onRemove,
  worked,
  problem,
}: {
  index: number;
  sight: SightRecord;
  onChange: (change: Partial<SightRecord>) => void;
  onRemove?: () => void;
  worked: ReturnType<typeof workSights>["worked"][number] | undefined;
  problem: string | undefined;
}) {
  const hsValue = readAngle(sight.hs);
  return (
    <fieldset className="rounded-panel border border-border p-4">
      <legend className="px-1 text-body font-semibold text-ink">Sight {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Body">
          {(ids) => (
            <Select
              id={ids.id}
              aria-describedby={ids["aria-describedby"]}
              value={sight.body}
              onChange={(body) => onChange({ body })}
              options={BODY_OPTIONS}
            />
          )}
        </Field>
        {hasLimb(sight.body) ? (
          <Field label="Limb brought to the horizon">
            {(ids) => (
              <Select
                id={ids.id}
                value={sight.limb}
                onChange={(limb) => onChange({ limb })}
                options={[
                  { value: "lower", label: "Lower limb" },
                  { value: "upper", label: "Upper limb" },
                  { value: "centre", label: "Centre" },
                ]}
              />
            )}
          </Field>
        ) : (
          <div />
        )}
        <Field label="Date (UT)">
          {(ids) => <Input {...ids} type="date" value={sight.date} onChange={(e) => onChange({ date: e.target.value })} />}
        </Field>
        <Field label="Time (UT)" hint="Hours, minutes and seconds: 15:04:30.">
          {(ids) => (
            <Input
              {...ids}
              inputMode="numeric"
              placeholder="15:04:30"
              value={sight.time}
              onChange={(e) => onChange({ time: e.target.value })}
            />
          )}
        </Field>
        <Field label="Sextant altitude" hint={hsValue !== null ? formatAngle(hsValue) : "Degrees and minutes: 34 12.5."}>
          {(ids) => (
            <Input {...ids} inputMode="decimal" placeholder="34 12.5" value={sight.hs} onChange={(e) => onChange({ hs: e.target.value })} />
          )}
        </Field>
        <Field label="Index error, minutes" hint="+ if the sextant reads high (on the arc), − if low.">
          {(ids) => (
            <Input {...ids} inputMode="decimal" value={sight.indexError} onChange={(e) => onChange({ indexError: e.target.value })} />
          )}
        </Field>
        <Field label="Horizon">
          {(ids) => (
            <Select
              id={ids.id}
              value={sight.horizon}
              onChange={(horizon) => onChange({ horizon: horizon as Horizon })}
              options={[
                { value: "sea", label: "Sea horizon" },
                { value: "artificial", label: "Artificial horizon (dish of water)" },
                { value: "plumb", label: "Plumb line (quadrant or protractor)" },
              ]}
            />
          )}
        </Field>
        {sight.horizon === "sea" ? (
          <Field label="Height of eye, metres">
            {(ids) => (
              <Input {...ids} inputMode="decimal" value={sight.heightOfEye} onChange={(e) => onChange({ heightOfEye: e.target.value })} />
            )}
          </Field>
        ) : null}
      </div>
      {problem && (sight.time || sight.hs) ? <p className="mt-3 text-small text-ink-muted">{problem}</p> : null}
      {worked ? (
        <div className="mt-4">
          <table className="w-full text-small">
            <caption className="sr-only">Corrections for sight {index + 1}</caption>
            <tbody className="divide-y divide-border">
              <tr>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-muted">
                  Sextant altitude
                </th>
                <td className="py-1.5 text-right tabular text-ink" />
                <td className="py-1.5 pl-3 text-right tabular text-ink">{formatAngle(readAngle(sight.hs) ?? 0)}</td>
              </tr>
              {worked.steps.map((step) => (
                <tr key={step.label}>
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-muted">
                    {step.label}
                    <span className="block text-micro">{step.how}</span>
                  </th>
                  <td className="py-1.5 text-right tabular text-ink">
                    {step.minutes === null ? "÷ 2" : `${step.minutes >= 0 ? "+" : "−"}${Math.abs(step.minutes).toFixed(1)}′`}
                  </td>
                  <td className="py-1.5 pl-3 text-right tabular text-ink">{formatAngle(step.after)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-ink">
                  Observed altitude
                </th>
                <td />
                <td className="py-1.5 pl-3 text-right font-semibold tabular text-ink">{formatAngle(worked.ho)}</td>
              </tr>
            </tbody>
          </table>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-small sm:grid-cols-3">
            <Pair term="GHA" value={formatAngle(worked.almanac.gha)} />
            <Pair term="Declination" value={formatLatLon(worked.almanac.dec, "lat")} />
            <Pair term="LHA" value={formatAngle(worked.reduction.lha)} />
            <Pair term="Computed altitude" value={formatAngle(worked.reduction.hc)} />
            <Pair term="Azimuth" value={`${worked.reduction.zn.toFixed(1)}°`} />
            <Pair
              term="Intercept"
              value={`${Math.abs(worked.reduction.intercept).toFixed(1)} mi ${worked.reduction.intercept >= 0 ? "towards" : "away"}`}
            />
          </dl>
        </div>
      ) : null}
      {onRemove ? (
        <Button variant="ghost" size="sm" className="mt-3" onClick={onRemove}>
          <Trash2 aria-hidden className="size-4" />
          Remove sight {index + 1}
        </Button>
      ) : null}
    </fieldset>
  );
}

function Pair({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{term}</dt>
      <dd className="tabular text-ink">{value}</dd>
    </div>
  );
}

function WorkedExample() {
  const ex = useMemo(() => workedExample(), []);
  return (
    <details className="rounded-panel border border-border p-4">
      <summary className="cursor-default text-small font-medium text-ink">Worked example: a Sun sight on 21 June 2026</summary>
      <div className="mt-3 grid gap-2 text-small text-ink">
        <p>
          The Sun's lower limb at 14:30:00 UT, sextant altitude {formatAngle(ex.hs)}, index error {EXAMPLE.indexError}′ on the arc, height
          of eye {EXAMPLE.heightOfEye} m. Worked from {formatLatLon(EXAMPLE.dr.lat, "lat")}, {formatLatLon(EXAMPLE.dr.lon, "lon")}.
        </p>
        <Rows>
          {ex.steps.map((step) => (
            <li key={step.label} className="flex justify-between gap-3 py-1.5">
              <span className="text-ink-muted">{step.label}</span>
              <span className="tabular">
                {step.minutes === null ? "÷ 2" : `${step.minutes >= 0 ? "+" : "−"}${Math.abs(step.minutes).toFixed(1)}′`} →{" "}
                {formatAngle(step.after)}
              </span>
            </li>
          ))}
        </Rows>
        <p>
          GHA {formatAngle(ex.almanac.gha)}, declination {formatLatLon(ex.almanac.dec, "lat")}, LHA {formatAngle(ex.reduction.lha)},
          computed altitude {formatAngle(ex.reduction.hc)}, azimuth {ex.reduction.zn.toFixed(1)}°. Intercept{" "}
          {Math.abs(ex.reduction.intercept).toFixed(1)} miles {ex.reduction.intercept >= 0 ? "towards" : "away"}. The observer was really at
          50° 00.0′ N, 5° 00.0′ W, on that line.
        </p>
      </div>
    </details>
  );
}

function ClockNote({ latitude }: { latitude: number }) {
  return (
    <Notice tone="info" title="The clock matters" className="mt-6">
      Four seconds of clock error is a minute of longitude: {clockErrorMiles(4, latitude).toFixed(1)} nautical miles here. Set your watch by
      a radio time signal (see{" "}
      <Link to="/radio/frequencies?kind=time-signals" className="text-primary underline underline-offset-2">
        Frequencies
      </Link>
      ), and check the server's clock on{" "}
      <Link to="/settings/status" className="text-primary underline underline-offset-2">
        Server status
      </Link>
      .
    </Notice>
  );
}

function NoonTab({ dr }: { dr: { lat: number; lon: number; name: string } }) {
  const [date, setDate] = useState(todayUt());
  const [time, setTime] = useState("");
  const [hs, setHs] = useState("");
  const [ie, setIe] = useState("0");
  const [hoe, setHoe] = useState("2");
  const [bears, setBears] = useState<"south" | "north">(dr.lat >= 0 ? "south" : "north");
  const [polarisHs, setPolarisHs] = useState("");
  const [polarisTime, setPolarisTime] = useState("");

  const noon = useMemo(() => {
    const at = sightInstant(date, time);
    const angle = readAngle(hs);
    if (at === null || angle === null) return null;
    const result = workSights(
      [{ id: "noon", body: "sun", limb: "lower", date, time, hs, indexError: ie, heightOfEye: hoe, horizon: "sea" }],
      dr,
      { course: "", speed: "" },
    ).worked[0];
    if (!result) return null;
    return { lat: noonLatitude(result.ho, result.almanac.dec, bears), lon: noonLongitude(at), ho: result.ho, dec: result.almanac.dec };
  }, [date, time, hs, ie, hoe, bears, dr]);

  const polaris = useMemo(() => {
    const star = NAVIGATIONAL_STARS.find((s) => s.navNumber === 0)!;
    const record: SightRecord = {
      id: "polaris",
      body: `hr:${star.hr}`,
      limb: "centre",
      date,
      time: polarisTime,
      hs: polarisHs,
      indexError: ie,
      heightOfEye: hoe,
      horizon: "sea",
    };
    const worked = workSights([record], dr, { course: "", speed: "" }).worked[0];
    return worked ? polarisLatitude(worked.almanac, worked.ho, dr.lon) : null;
  }, [date, polarisTime, polarisHs, ie, hoe, dr]);

  return (
    <div>
      <Section
        title="Latitude from the Sun at noon"
        description="Bring the Sun's lower limb down to the horizon and follow it up until it stops rising: that highest altitude, at local noon, gives the latitude with no other sight."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date (UT)">{(ids) => <Input {...ids} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Time of the highest altitude (UT)" hint="To the minute is enough for latitude.">
            {(ids) => <Input {...ids} placeholder="12:15" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
          <Field label="Highest sextant altitude, lower limb">
            {(ids) => <Input {...ids} placeholder="62 05.4" value={hs} onChange={(e) => setHs(e.target.value)} />}
          </Field>
          <Field label="Index error, minutes">{(ids) => <Input {...ids} value={ie} onChange={(e) => setIe(e.target.value)} />}</Field>
          <Field label="Height of eye, metres">{(ids) => <Input {...ids} value={hoe} onChange={(e) => setHoe(e.target.value)} />}</Field>
          <div className="grid gap-1.5">
            <span className="text-small font-medium text-ink">The Sun bore</span>
            <Segmented
              label="The Sun bore"
              value={bears}
              onChange={setBears}
              options={[
                { value: "south", label: "South" },
                { value: "north", label: "North" },
              ]}
            />
          </div>
        </div>
        {noon ? (
          <p className="mt-4 text-body text-ink">
            Latitude <span className="font-mono">{formatLatLon(noon.lat, "lat")}</span>: 90° less the observed altitude{" "}
            {formatAngle(noon.ho)}, {bears === "south" ? "added to" : "taken from"} the declination {formatLatLon(noon.dec, "lat")}.
            Longitude from the time of noon: <span className="font-mono">{formatLatLon(noon.lon, "lon")}</span>, but the top of the Sun's
            climb is flat, so a minute's doubt in its time is a quarter of a degree of longitude.
          </p>
        ) : (
          <p className="mt-4 text-small text-ink-muted">Give the date, the time and the altitude to work out the latitude.</p>
        )}
      </Section>

      <Section
        title="Latitude from Polaris"
        description="In the northern hemisphere, in twilight, Polaris's altitude is within about a degree of your latitude. Worked out here exactly for the moment."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Time (UT)">
            {(ids) => <Input {...ids} placeholder="18:20:00" value={polarisTime} onChange={(e) => setPolarisTime(e.target.value)} />}
          </Field>
          <Field label="Sextant altitude of Polaris">
            {(ids) => <Input {...ids} placeholder="50 12.0" value={polarisHs} onChange={(e) => setPolarisHs(e.target.value)} />}
          </Field>
        </div>
        <p className="mt-2 text-small text-ink-muted">Uses the date, index error and height of eye above.</p>
        {polaris !== null ? (
          <p className="mt-4 text-body text-ink">
            Latitude <span className="font-mono">{formatLatLon(polaris, "lat")}</span>, at the longitude worked from (
            {formatLatLon(dr.lon, "lon")}).
          </p>
        ) : null}
      </Section>
    </div>
  );
}

function NoSextantTab() {
  return (
    <div className="grid gap-4 text-body text-ink">
      <p>
        A sextant measures the angle between a body and the horizon to a tenth of a minute of arc. Without one, a protractor or a home-made
        quadrant with a plumb line measures the angle from the vertical instead, so there is no horizon to find and no dip to allow for.
      </p>
      <h3 className="text-lead font-semibold">A quadrant</h3>
      <ol className="list-decimal space-y-1 pl-6">
        <li>Mark a quarter circle on stiff card or wood, 0° to 90°, from one straight edge round to the other.</li>
        <li>Hang a thread with a small weight from the corner, so it crosses the scale.</li>
        <li>Sight the star along the top edge (for the Sun, let its light through two pinholes on to the card; never look at it).</li>
        <li>Pinch the thread to the scale and read the altitude where it crosses. Enter it as a sight with the plumb line horizon.</li>
      </ol>
      <h3 className="text-lead font-semibold">How rough it is</h3>
      <p>
        A minute of arc is a nautical mile, so a degree is 60 miles. A quadrant read to half a degree puts a line of position anywhere
        within about 30 miles of where it should be; a whole degree, 60. The fix here allows thirty minutes of arc for each plumb-line
        sight. That is still enough to know which coast you are off, and Polaris's altitude alone gives the latitude to about the same.
      </p>
      <p className="text-small text-ink-muted">
        Timing matters as much: a watch a minute wrong moves the longitude by a quarter of a degree, 15 miles at the equator.
      </p>
    </div>
  );
}
