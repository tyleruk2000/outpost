/**
 * An airport's radio frequencies on its record card, from OurAirports'
 * `airport-frequencies.csv`: what each is for, as the file gives it (a type code is put
 * into words only where its meaning is certain), and the frequency in MHz, tower and
 * information services first. Three states: listed; held but none listed for this
 * airport; not held yet (a pack installed before frequencies were fetched, or one whose
 * frequencies file could not be fetched).
 *
 * The list has a height of its own, about five rows, and scrolls inside the card, so
 * that on a phone the card shows the airport's name, the first rows and the caution in
 * the room a card has over the map (docs/development/web-screens.md, "Things over a
 * map"). The card can also be folded to one line (feature-card.tsx).
 *
 * The caution is on the card in a line, the rest behind one disclosure: a community
 * list, not for navigation, and the radio screens' own line on listening.
 */
import type { AirportFrequenciesDto, AirportFrequencyDto } from "@outpost/shared";
import { Link } from "react-router";

/** The VHF air band's entry on Radio → Frequencies to listen to. */
export const AIR_BAND_LINK = "/radio/frequencies?kind=bands&place=any&band=air-vhf";

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-11-17" as "17 November 2026"; anything else as given. */
function day(asOf: string | null): string | null {
  if (!asOf) return null;
  const time = Date.parse(`${asOf}T00:00:00Z`);
  return Number.isNaN(time) ? asOf : dayFormat.format(time);
}

/** As the radio screens write air band frequencies: three decimals at least (118.5 is 118.500). */
export function formatMhz(mhz: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(mhz.trim());
  if (!match) return mhz;
  return `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}`;
}

function Row({ entry }: { entry: AirportFrequencyDto }) {
  const description = entry.description && entry.description.toLowerCase() !== entry.type.toLowerCase() ? entry.description : "";
  return (
    <li className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="min-w-0">
        <span className="text-small text-ink">
          {entry.typeLabel ?? entry.type}
          {entry.typeLabel && entry.typeLabel.toLowerCase() !== entry.type.toLowerCase() ? (
            <span className="ml-1.5 font-mono text-[0.8125rem] text-ink-muted">{entry.type}</span>
          ) : null}
        </span>
        {description ? <span className="block text-small text-ink-muted [overflow-wrap:anywhere]">{description}</span> : null}
      </span>
      <span className="tabular shrink-0 font-mono text-[0.8125rem] text-ink select-text">{formatMhz(entry.mhz)} MHz</span>
    </li>
  );
}

export function AirportFrequencies({ frequencies }: { frequencies: AirportFrequenciesDto }) {
  const asOf = day(frequencies.asOf);
  return (
    <section aria-labelledby="airport-frequencies-heading" className="mt-2 border-t border-border pt-2">
      <div className="flex items-baseline justify-between gap-4">
        <h3 id="airport-frequencies-heading" className="text-small font-medium text-ink">
          Radio frequencies
        </h3>
        {frequencies.list.length > 0 ? <span className="tabular text-small text-ink-muted">{frequencies.list.length} listed</span> : null}
      </div>
      {!frequencies.held ? (
        <>
          <p className="mt-0.5 text-small text-ink-muted">
            Not held for this airport yet. Update the airports pack in Reference data for the map to get them.
          </p>
          <Link
            to="/maps?reference=manage"
            className="inline-flex min-h-11 items-center text-small text-primary underline underline-offset-2"
          >
            Reference data for the map
          </Link>
        </>
      ) : frequencies.list.length === 0 ? (
        <p className="mt-0.5 text-small text-ink-muted">No frequencies listed in OurAirports' file{asOf ? ` of ${asOf}` : ""}.</p>
      ) : (
        <>
          <ul
            aria-label="Radio frequencies"
            className="scroll-quiet mt-1 max-h-[10.5rem] divide-y divide-border overflow-y-auto overscroll-contain border-y border-border pr-1 sm:max-h-52"
          >
            {frequencies.list.map((entry, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, never reordered, in which two rows may be the same
              <Row key={`${entry.type}-${entry.mhz}-${index}`} entry={entry} />
            ))}
          </ul>
          <p className="mt-1.5 text-small text-ink-muted">
            Not for navigation or flight planning: OurAirports' community list{asOf ? `, as of ${asOf},` : ""} may be out of date or wrong.
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer py-3 text-small font-medium text-ink">About these frequencies</summary>
            <div className="mt-1 grid gap-1 text-small text-ink-muted">
              <p>
                From OurAirports, a community-maintained public-domain dataset. Its contributors list them; Outpost has not checked them.
                The type and description are shown as the file gives them, with a type put into words only where its meaning is certain (TWR
                is the tower).
              </p>
              <p>
                Rules on listening to aviation and other non-broadcast traffic, and on using what is heard, differ by country (in the UK,
                for example, the Wireless Telegraphy Act).
              </p>
              <Link to={AIR_BAND_LINK} className="inline-flex min-h-11 items-center text-primary underline underline-offset-2">
                The VHF air band in Frequencies to listen to
              </Link>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
