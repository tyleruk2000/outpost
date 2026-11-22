/**
 * Make a nocturnal, and read the star clock: telling the time at night from the stars
 * turning about Polaris. The instrument to print (through the shared PDF buttons), how to
 * use it, the arithmetic behind its date ring, and a calculator that turns a date and
 * the pointer's position on an imagined clock face into the time. Northern hemisphere
 * only, and it says so.
 */
import { useMemo, useState } from "react";
import { Notice } from "@/components/page";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/misc";
import { type IsoDate, isIsoDate } from "@/features/maps/lib/sun";
import { dateIn, deviceZone } from "@/features/maps/lib/sun-text";
import { useClockStyle } from "@/lib/clock";
import { Calculator, ChoiceField, Formula, HowWorkedOut, Inputs, useChoice } from "../tools/kit";
import { CLOCK_POSITIONS, type PointerStar, timeFromPointer } from "./nocturnal";
import { NorthSkyPlate } from "./nocturnal-plate";
import { type ChosenPlace, NoPlaceYet } from "./place";
import { dayWords } from "./plates";
import { SOLAR_SOURCES as S } from "./sources";
import { TemplatePdf } from "./template-pdf";
import { nocturnalTitle } from "./templates";
import { nocturnalDocument } from "./templates-kit";
import { TimeResult, timeWords } from "./time-result";
import { standardOffset, type ZoneChoice } from "./zone";

const STAR_CHOICES = [
  { value: "dubhe" as const, label: "The Plough's pointers" },
  { value: "kochab" as const, label: "Kochab" },
];

const inputClass =
  "h-9 w-full rounded-control border border-border-strong bg-page px-3 text-body text-ink tabular hover:border-ink-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus aria-invalid:border-danger max-md:h-11";

export function NocturnalTab({ place, zone }: { place: ChosenPlace | null; zone: ZoneChoice }) {
  const style = useClockStyle();
  const year = new Date().getUTCFullYear();
  const [dateText, setDate] = useState<string>(() => dateIn(deviceZone(), Date.now()));
  const date: IsoDate | null = isIsoDate(dateText) ? dateText : null;
  const [star, setStar] = useChoice<PointerStar>("solar-clock.star", STAR_CHOICES, "dubhe");
  const [position, setPosition] = useState<string>("4");

  const pdf = useMemo(() => {
    if (!place || place.lat < 0) return null;
    const input = {
      latitude: place.lat,
      longitude: place.lon,
      standardOffset: standardOffset(zone, Date.UTC(year, 0, 1)),
      year,
      placeName: place.name,
    };
    return { make: () => nocturnalDocument(input), title: nocturnalTitle(input) };
  }, [place, zone, year]);

  const outcome = useMemo(
    () => (place && date ? timeFromPointer(place, date, star, Number(position) / 2) : null),
    [place, date, star, position],
  );

  if (!place) return <NoPlaceYet />;
  const south = place.lat < 0;
  const dateError = dateText && !date ? "Not a date. Use the date picker, or type it as 2026-11-17." : undefined;
  return (
    <div className="grid">
      {south ? (
        <Notice tone="warning" title="Not for the southern hemisphere">
          South of the equator Polaris is below the horizon, and there is no bright star at the south pole of the sky. Outpost does not
          offer a southern method: none was found from a source it could check, so none is given rather than one that might be wrong.
        </Notice>
      ) : null}
      <Calculator
        id="nocturnal-how"
        title="How a nocturnal tells the time"
        intro="Facing north at night, the stars turn anticlockwise about Polaris, once in a sidereal day. A line from Polaris to the Plough's pointer stars is the hand of a star clock; a nocturnal reads it."
      >
        <ol className="grid max-w-[62ch] list-decimal gap-1.5 pl-5 text-body text-ink marker:text-ink-muted">
          <li>Turn the hour disc until its tooth points to tonight's date on the date ring.</li>
          <li>Face north and hold the nocturnal upright at arm's length, by its handle, straight down.</li>
          <li>Sight Polaris through the hole at the centre.</li>
          <li>
            Turn the arm until its edge runs through the two pointer stars of the Plough, Merak and Dubhe, at the end of its bowl (or
            through Kochab, with Kochab's tooth set to the date).
          </li>
          <li>Read the time where the arm crosses the hour disc.</li>
        </ol>
        {!south && date && outcome?.ok ? (
          <NorthSkyPlate
            place={place}
            at={outcome.estimate.at}
            clockWords={(CLOCK_POSITIONS.find((each) => each.value === position)?.label ?? "").replace(/ \(.*\)$/, "").toLowerCase()}
            timeWords={timeWords(outcome, zone, style, date).figure}
            dateWords={dayWords(date)}
          />
        ) : null}
        <p className="mt-3 max-w-[62ch] text-small text-ink-muted">
          After Royal Museums Greenwich, "What is a nocturnal?", which gives navigators' wooden nocturnals as good to within 15 minutes and
          the stars as most useful between about 40° and 60° north.
        </p>
        <HowWorkedOut
          formula={
            <>
              <p>
                The stars turn once in a sidereal day, 23 h 56 min 4 s: a mean solar day holds 1.0027379 of them. So each night they come
                round about 3 min 56 s earlier, about two hours a month, and a full turn in a year. The date ring takes that up: the tooth
                set to the date turns the hour disc by about a degree a day.
              </p>
              <Formula>
                local sidereal time = GMST + longitude ÷ 15; GMST = 18.697375 + 24.065709824279 × days from 2000 Jan 1 12h UT
              </Formula>
              <Formula>the pointer's angle, clockwise from straight up = −15° × (local sidereal time − the star's right ascension)</Formula>
              <p>
                The date ring is drawn for this place's longitude and its clocks' standard time, so no correction is needed beyond summer
                time. Star places from the US Naval Observatory for 2026 and 2046.
              </p>
            </>
          }
          range="The northern hemisphere, with Polaris clear of the horizon: refused below 5° north, and best well north of that. The printed nocturnal takes Polaris to be at the pole, as every nocturnal does; Outpost measured that as costing up to 6 minutes at 30° north, 8 at 51° and 12 at 70°."
          limits="Your eye's reading of the arm. Leap years move the date ring by about 4 minutes."
          sources={[S.rmg, S.usnoSidereal, S.usnoCelnav, S.bowditch]}
        />
      </Calculator>

      <Calculator
        id="nocturnal-template"
        title="A nocturnal to print"
        intro="A date disc with a handle, an hour disc with teeth for the Plough and for Kochab, and an arm. Glue to stiff card, cut out, and join at the centre with a hollow rivet or an eyelet so you can see through it."
      >
        {pdf ? (
          <TemplatePdf make={pdf.make} title={pdf.title} kind="Nocturnal template" path="/tools/solar-clock?tab=nocturnal" />
        ) : (
          <p className="text-body text-ink-muted">No nocturnal for a place south of the equator.</p>
        )}
      </Calculator>

      <Calculator
        id="nocturnal-read"
        title="Read the star clock now"
        intro="No nocturnal? Imagine a clock face on the sky with Polaris at its centre and 12 straight up. Read the line from Polaris through the pointer stars as its hour hand."
      >
        <Inputs>
          <Field
            label="The date the night began"
            error={dateError}
            hint={!dateError ? "After midnight, still give the evening's date." : undefined}
          >
            {(ids) => (
              <input {...ids} type="date" value={dateText} onChange={(event) => setDate(event.target.value)} className={inputClass} />
            )}
          </Field>
          <ChoiceField label="Which star" value={star} onChange={setStar} options={STAR_CHOICES} />
          <Field label="Where the hand points">
            {(ids) => (
              <Select
                id={ids.id}
                aria-describedby={ids["aria-describedby"]}
                value={position}
                onChange={setPosition}
                options={CLOCK_POSITIONS}
              />
            )}
          </Field>
        </Inputs>
        {date ? (
          <TimeResult
            outcome={outcome}
            label="The time from the stars"
            lead="With the hand there, the time is"
            zone={zone}
            style={style}
            date={date}
            keepTitle={`The time from the stars on the night of ${date} at ${place.name}`}
          />
        ) : null}
      </Calculator>
    </div>
  );
}
