/**
 * The one plain line every radio screen carries about the licence (outpost-ywbh.1), and
 * the household's setting it depends on. A screen says what it is for:
 *
 *   <LicenceLine use="listen" />           Listening: no licence needed.
 *   <LicenceLine use="listen-restricted" /> aircraft, ships
 *   <LicenceLine use="licence-free" />     PMR446, CB, Meshtastic
 *   <LicenceLine use="transmit" />         planning or practising a transmission
 *   <LicenceLine use="listen-and-transmit" />
 *
 * The words come from `licenceLine` (packages/shared/src/radio-licence.ts); the line
 * names the regulators' documents it rests on, with the day each was read, and links to
 * Help → What needs a radio licence. For a licensed household the reminders that
 * transmitting needs a licence are left out and nothing else changes. `useRadioLicence`
 * is for a screen that words something differently for a listen-only household.
 */
import {
  checkedOn,
  LICENCE_HELP_PATH,
  LICENCE_LINE_STATEMENTS,
  LICENCE_STATEMENTS,
  licenceLine,
  NO_RADIO_LICENCE,
  type RadioLicence,
  type RadioUse,
} from "@outpost/shared";
import { Info } from "lucide-react";
import { Link } from "react-router";
import { useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** What the household has said under Settings → Radio licence; listen-only until the settings say otherwise. */
export function useRadioLicence(): RadioLicence {
  const settings = useSettings();
  if (!settings.data) return NO_RADIO_LICENCE;
  return { licensed: settings.data["radio.licensed"] === true, callsign: settings.data["radio.callsign"] ?? "" };
}

/** The publishers and the latest day read, for the statements a line rests on: "Ofcom, FCC (read 21 Nov 2026)". */
export function licenceLineBasis(use: RadioUse): string {
  const statements = LICENCE_STATEMENTS.filter((statement) => LICENCE_LINE_STATEMENTS[use].includes(statement.id));
  const sources = statements.flatMap((statement) => statement.rules.flatMap((rule) => rule.sources));
  const countries = [...new Set(statements.flatMap((statement) => statement.rules.map((rule) => rule.country)))];
  const day = sources
    .map((source) => source.checked)
    .sort()
    .at(-1);
  const who = countries
    .map((country) => (country === "GB" ? "UK law and Ofcom" : country === "US" ? "US law and the FCC" : country))
    .join("; ");
  return day ? `${who}, read ${checkedOn(day)}` : who;
}

export function LicenceLine({ use, className }: { use: RadioUse; className?: string }) {
  const licence = useRadioLicence();
  const line = licenceLine(use, licence);
  if (!line) return null;
  // A licensed household has said it knows the rules: one short line, the sources one press away on the Help page.
  if (licence.licensed)
    return (
      <p className={cn("flex items-start gap-2 text-small text-ink-muted", className)} data-licence-line={use}>
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          {line.text}{" "}
          <Link to={LICENCE_HELP_PATH} className="text-primary underline underline-offset-2">
            The rules
          </Link>
        </span>
      </p>
    );
  return (
    <p className={cn("flex items-start gap-2 text-small text-ink-muted", className)} data-licence-line={use}>
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="text-ink">{line.text}</span> From {licenceLineBasis(use)}.{" "}
        <Link to={LICENCE_HELP_PATH} className="text-primary underline underline-offset-2">
          What needs a radio licence
        </Link>
      </span>
    </p>
  );
}
