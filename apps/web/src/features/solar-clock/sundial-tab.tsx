/**
 * Make a sundial: a horizontal dial for the chosen latitude, its hour lines worked out
 * and tabulated, the gnomon, finding true north from a shadow, reading clock time from
 * it (the equation of time and the longitude correction for the place), and a template
 * to print through the shared PDF buttons. Then the simplest dial of all, from a card and
 * a pencil.
 */
import { useMemo } from "react";
import { Notice } from "@/components/page";
import { madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { dateIn, deviceZone } from "@/features/maps/lib/sun-text";
import { useClockStyle } from "@/lib/clock";
import { appLocale } from "@/lib/region";
import { Calculator, Formula, HowWorkedOut } from "../tools/kit";
import { type ChosenPlace, NoPlaceYet } from "./place";
import { ShadowPlan } from "./shadow-plates";
import { SOLAR_SOURCES as S } from "./sources";
import { dialFit, hourLines, signedMinutes, sundialToClock, tableDates } from "./sundial";
import { DialPlate, GnomonSide } from "./sundial-plates";
import { canDrawSundial, latitudeWords, longitudeWords, sundialPdf, sundialTitle } from "./templates";
import { formatOffset, offsetAt, standardOffset, type ZoneChoice } from "./zone";

const twelve = (hour: number) => `${((hour + 11) % 12) + 1} ${hour < 12 ? "am" : "pm"}`.replace("12 pm", "noon");

export function SundialTab({ place, zone }: { place: ChosenPlace | null; zone: ZoneChoice }) {
  const year = new Date().getUTCFullYear();
  const style = useClockStyle();
  // Today, as this device has it: the pictures of the dial and of finding north are drawn for it.
  const [today, summer] = useMemo(() => {
    const now = Date.now();
    return [dateIn(deviceZone(), now), offsetAt(zone, now) - standardOffset(zone, now)] as const;
  }, [zone]);
  const figures = useMemo(() => {
    if (!place) return null;
    const standard = standardOffset(zone, Date.UTC(year, 0, 1));
    const input = { latitude: place.lat, longitude: place.lon, standardOffset: standard, year, placeName: place.name };
    const pdf = canDrawSundial(place.lat)
      ? madePdf(sundialPdf(input), sundialTitle(input), "Sundial template", {
          what: "the solar clock",
          path: "/tools/solar-clock?tab=sundial",
        })
      : null;
    return { standard, pdf, lines: hourLines(place.lat), fit: dialFit(place.lat) };
  }, [place, zone, year]);

  if (!place || !figures) return <NoPlaceYet />;
  const north = place.lat >= 0;
  const pole = north ? "north" : "south";
  const lat = Math.abs(place.lat);
  const { standard, pdf, lines, fit } = figures;
  return (
    <div className="grid">
      <Calculator
        id="sundial-lines"
        title={`A horizontal sundial for ${latitudeWords(place.lat)}`}
        intro={`A flat dial with a triangular gnomon standing on it. The gnomon's sloping edge rises at ${lat.toFixed(1)}°, your latitude, and points to true ${pole}: it is parallel to the Earth's axis, so each hour's shadow falls on the same line all year round.`}
      >
        {fit === "none" ? (
          <Notice tone="warning" title="A horizontal dial does not work on the equator">
            Every hour line falls on the noon line. Make the card-and-pencil dial below instead.
          </Notice>
        ) : fit === "poor" ? (
          <Notice tone="warning" title="A horizontal dial is hard to read this near the equator">
            The hour lines from 9 am to 3 pm crowd within a few degrees of the noon line. It works, but the card-and-pencil dial below is
            easier to read here.
          </Notice>
        ) : fit === "polar" ? (
          <Notice tone="info" title="Inside the polar circle">
            The dial works, but the sun is gone for part of the winter and low for much of the year.
          </Notice>
        ) : null}
        {fit !== "none" ? (
          <>
            <DialPlate latitude={place.lat} longitude={place.lon} standard={standard} summer={summer} date={today} style={style} />
            <GnomonSide latitude={place.lat} />
          </>
        ) : null}
        <table className="mt-4 w-full max-w-md text-small tabular">
          <caption className="sr-only">Hour lines for a horizontal sundial at {latitudeWords(place.lat)}</caption>
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Sundial time
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Angle from the noon line
              </th>
              <th scope="col" className="py-2 font-medium">
                Side
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((line) => (
              <tr key={line.hour}>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                  {twelve(line.hour)}
                </th>
                <td className="py-1.5 pr-3 text-ink">{Math.abs(line.angle).toFixed(1)}°</td>
                <td className="py-1.5 text-ink-muted">{line.fromNoon === 0 ? "the noon line" : line.fromNoon < 0 ? "west" : "east"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 max-w-[62ch] text-small text-ink-muted">
          Angles past 90° run back beyond the east–west line, for the early morning and late evening of summer. Morning hours are on the
          west side, because the morning shadow points west.
        </p>
        <HowWorkedOut
          formula={
            <>
              <Formula>tan(angle from the noon line) = sin(latitude) × tan(15° × hours from noon)</Formula>
              <p>The gnomon's edge rises at the latitude. Worked with atan2 so the lines beyond 6 am and 6 pm fall on the right side.</p>
            </>
          }
          range="Any latitude but the equator itself. Below about 20° the lines crowd near noon; inside the polar circles the sun is away for part of the year. These bounds are Outpost's judgement from the angles."
          limits="The gnomon's thickness (with thick material, split the noon line by its thickness and draw the morning and afternoon lines from each side)."
          sources={[S.nass, S.schoolphysics]}
        />
      </Calculator>

      <Calculator
        id="sundial-north"
        title={`Setting it up: true ${pole} from a shadow`}
        intro="Not a compass: a compass points to magnetic north, which can be degrees away."
      >
        <ol className="grid max-w-[62ch] list-decimal gap-1.5 pl-5 text-body text-ink marker:text-ink-muted">
          <li>On a sunny day, stand a straight stick upright on level ground, with paper or smooth earth round it.</li>
          <li>From late morning to early afternoon, mark the tip of its shadow every 15 minutes.</li>
          <li>
            Join the marks with a smooth curve. The point of the curve nearest the foot of the stick is where the shadow was shortest.
          </li>
          <li>
            The line from the foot of the stick to that point runs true {pole}. Lay the dial's noon line along it, with the gnomon's high
            end towards the {pole}.
          </li>
          <li>Level the dial with a spirit level, or a saucer of water.</li>
        </ol>
        <ShadowPlan place={place} date={today} stick={1} mode={{ kind: "north" }} />
        <p className="mt-3 text-small text-ink-muted">After the Yohkoh Public Outreach Project's "Finding Geographic North".</p>
      </Calculator>

      <Calculator
        id="sundial-reading"
        title="Reading clock time from it"
        intro={`The dial shows sundial time. Add the correction for the date to get clock time on ${formatOffset(standard)}; in summer time add an hour as well.`}
      >
        <table className="w-full max-w-md text-small tabular">
          <caption className="sr-only">
            Minutes to add to the sundial's reading at {longitudeWords(place.lon)} for clocks on {formatOffset(standard)}
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Date
              </th>
              <th scope="col" className="py-2 font-medium">
                Add to the sundial
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tableDates(year).map((date) => (
              <tr key={date}>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                  {new Date(`${date}T00:00:00Z`).toLocaleDateString(appLocale(), { day: "numeric", month: "long", timeZone: "UTC" })}
                </th>
                <td className="py-1.5 text-ink">{signedMinutes(sundialToClock(date, place.lon, standard))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <HowWorkedOut
          formula={
            <>
              <Formula>clock = sundial − equation of time + (zone offset − 4 min × longitude east)</Formula>
              <p>
                The equation of time from NOAA's equations (positive when the sundial is ahead). Here the longitude part is{" "}
                {signedMinutes(standard - 4 * place.lon)}: the place is {Math.abs(place.lon - standard / 4).toFixed(1)}°{" "}
                {place.lon >= standard / 4 ? "east" : "west"} of the meridian of {formatOffset(standard)}, at four minutes a degree.
              </p>
            </>
          }
          range="Every year alike to within a minute: the equation of time repeats closely."
          limits="A home-made dial set with care reads to a few minutes; its blurred shadow makes it hard to read closer."
          sources={[S.noaa, S.bss, S.nass]}
        />
      </Calculator>

      <Calculator
        id="sundial-template"
        title="A template to print"
        intro="The dial plate with every hour and half hour drawn, the gnomon to cut out, how to set it up, and the correction table for this place. Print it at actual size."
      >
        {pdf ? (
          <PdfActions pdf={pdf} />
        ) : (
          <p className="text-body text-ink-muted">No template on the equator: make the card-and-pencil dial below.</p>
        )}
      </Calculator>

      <Calculator
        id="sundial-card"
        title="The simplest dial: a card and a pencil"
        intro="An equatorial dial. It works at every latitude, its hours are evenly spaced, and it needs no table of angles."
      >
        <ol className="grid max-w-[62ch] list-decimal gap-1.5 pl-5 text-body text-ink marker:text-ink-muted">
          <li>
            Draw a circle on a square of stiff card and mark 24 lines from its centre, 15° apart, like a 24-hour clock face. Push a pencil
            through the centre, square to the card.
          </li>
          <li>
            Set the pencil pointing true {pole}, tilted up from the ground at {lat.toFixed(0)}°, your latitude, so that it points at the
            celestial pole. The card is then tilted the other way, parallel to the equator.
          </li>
          <li>Turn the card about the pencil until one line points straight down the card's slope: that is noon.</li>
          <li>
            Number the lines with 6 am on the west side and 6 pm on the east, the hours between in order. Copy the same lines onto the back
            of the card by pricking through.
          </li>
          <li>
            The pencil's shadow falls on the upper face from the {north ? "March" : "September"} equinox to the{" "}
            {north ? "September" : "March"} equinox, and on the lower face for the rest of the year. For a few days at each equinox the sun
            is edge-on and there is no shadow.
          </li>
          <li>It shows sundial time: use the table above to turn it into clock time.</li>
        </ol>
        <p className="mt-3 max-w-[62ch] text-small text-ink-muted">
          Why it works: the card is parallel to the Earth's equator, so the sun's shadow of the pencil turns round it at an even 15° an
          hour. This is Outpost's own description, checked against the geometry; NASS describes the equatorial dial as a simplified
          armillary sphere.
        </p>
      </Calculator>
    </div>
  );
}
