/**
 * The one line on every screen of Heard on the radio that says what a listener may do
 * and what needs a licence (rule 4 of the epic). Kept in this one place so that the
 * setting for licensed and listen-only operators (outpost-ywbh.1) can put its own
 * component here; until then everyone sees the listen-only wording.
 *
 * Sources, read 21 November 2026:
 * - Ofcom, "Rules on using radio equipment" (ofcom.org.uk/spectrum/radio-equipment/radio-spectrum-and-the-law):
 *   "Generally, the use of radio receivers is exempt from requiring a licence unless it is also capable of
 *   transmission." and "Typically, receivers and scanners can only be used for 'general reception'".
 * - Wireless Telegraphy Act 2006, section 48 (legislation.gov.uk): the offence of using apparatus to obtain the
 *   contents of a message of which one is not an intended recipient.
 * - 18 U.S.C. 2511(2)(g)(ii) (law.cornell.edu): not unlawful to intercept radio communication transmitted
 *   "by a station operating on an authorized frequency within the bands allocated to the amateur ... service"
 *   or "by any marine or aeronautical communications system".
 */
import type { HeardSourceId } from "@outpost/shared";
import { ExternalLink, Headphones } from "lucide-react";

const OFCOM = "https://www.ofcom.org.uk/spectrum/radio-equipment/radio-spectrum-and-the-law";
const US_LAW = "https://www.law.cornell.edu/uscode/text/18/2511";

const WHAT: Record<HeardSourceId | "all", string> = {
  all: "Outpost only listens: it never sends on any of these, and has no setting that would.",
  aprs: "Sending APRS, even a position beacon, needs an amateur radio licence, and Outpost never does it.",
  adsb: "Aircraft are heard, never answered: nothing here transmits.",
  ais: "Ships are heard, never answered: nothing here transmits.",
  mesh: "Meshtastic radios use a licence-exempt band.",
};

const KNOWN: Record<HeardSourceId | "all", string> = {
  all: "In the UK a receiver needs no licence, for general reception. In the US, receiving amateur, marine and aeronautical radio is lawful. Elsewhere, and whether a country counts aircraft and ships as general reception, Outpost does not know: check your regulator.",
  aprs: "In the UK a receiver needs no licence, for general reception; in the US, receiving amateur radio is lawful. Elsewhere, Outpost does not know: check your regulator.",
  adsb: "In the US, receiving aeronautical radio is lawful. In the UK a receiver needs no licence but may be used only for general reception, and Ofcom's guidance does not say whether that includes aircraft; Outpost does not know. Check your regulator.",
  ais: "In the US, receiving marine radio is lawful. In the UK a receiver needs no licence but may be used only for general reception, and Ofcom's guidance does not say whether that includes ships; Outpost does not know. Check your regulator.",
  mesh: "",
};

const link = "text-primary underline underline-offset-2";

/** "Listening: no licence needed" with what it rests on. */
export function ListenOnly({ source = "all" }: { source?: HeardSourceId | "all" }) {
  return (
    <div className="flex items-start gap-2.5 text-small text-ink">
      <Headphones aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      <p className="min-w-0">
        <span className="font-semibold">Listening only.</span> {WHAT[source]} {KNOWN[source]}{" "}
        <span className="text-ink-muted">
          Sources:{" "}
          <a href={OFCOM} target="_blank" rel="noopener noreferrer" className={link}>
            Ofcom, rules on using radio equipment
            <ExternalLink aria-hidden className="ml-1 inline size-3.5 -translate-y-px" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          ;{" "}
          <a href={US_LAW} target="_blank" rel="noopener noreferrer" className={link}>
            18 U.S.C. 2511
            <ExternalLink aria-hidden className="ml-1 inline size-3.5 -translate-y-px" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          ; read 21 Nov 2026.
        </span>
      </p>
    </div>
  );
}
