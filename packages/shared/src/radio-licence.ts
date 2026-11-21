/**
 * Licensed and listen-only operators (Settings → Radio licence), and what each may do.
 *
 * Outpost transmits nothing on APRS or on any amateur frequency, whichever is chosen:
 * the setting records only that someone in the household holds an amateur licence, and
 * changes what the radio screens explain. With it off (the default), every radio screen
 * says in one line whether what it is for needs a licence. With it on, the reminders
 * that transmitting needs a licence are left out; nothing else changes. Warnings that
 * are not about the licence (a public mesh channel can be read by anyone; radio is not a
 * way to call for help) stay for everyone.
 *
 * The statements behind the lines, each from the regulator's own text with the day it
 * was read, are in `radio-licence-statements.ts` and are listed on the Help page
 * "What needs a radio licence".
 */
import type { FrequencySource } from "./radio-frequencies.ts";

// ── The setting ────────────────────────────────────────────────────────────

/** What the household has said about itself under Settings → Radio licence. */
export interface RadioLicence {
  licensed: boolean;
  /** The callsign, upper case, or "" when none was given. */
  callsign: string;
}

export const NO_RADIO_LICENCE: RadioLicence = { licensed: false, callsign: "" };

/** The words beside the switch. */
export const RADIO_LICENCE_SETTING = {
  label: "I hold an amateur radio licence",
  callsignLabel: "Callsign",
  about:
    "This only records that you hold a licence, so that the radio screens stop reminding you that transmitting needs one. Outpost does not transmit, and nothing is ever sent with or because of this callsign.",
} as const;

/** A callsign as people write them: letters and digits with at most one or two strokes ("M7ABC", "EI/G4XYZ/P"). */
export function normaliseCallsign(text: string): string {
  return text.trim().toUpperCase().replace(/\s+/g, "");
}

export function isPlausibleCallsignText(text: string): boolean {
  return /^[A-Z0-9]{1,4}(\/[A-Z0-9]{1,8}){0,2}$|^[A-Z0-9]{1,4}\/[A-Z0-9]{3,8}(\/[A-Z0-9]{1,4})?$/.test(text) && /\d/.test(text);
}

// ── The one line on every radio screen ──────────────────────────────────────

/**
 * What a screen is for, as far as a licence goes:
 * - `listen`: receiving only (time signals, broadcasts, amateur signals, satellites, APRS heard).
 * - `listen-restricted`: receiving what the law limits listening to or passing on (aircraft, ships).
 * - `licence-free`: transmitting on a licence-free service (PMR446, CB, Meshtastic on its licence-exempt band).
 * - `transmit`: planning or practising something that is transmitting on an amateur band.
 * - `listen-and-transmit`: a screen that serves both (the HF planner, repeaters).
 */
export type RadioUse = "listen" | "listen-restricted" | "licence-free" | "transmit" | "listen-and-transmit";

export interface LicenceLine {
  /** The line itself: "Listening: no licence needed." */
  text: string;
  /** Whether the line is a reminder that transmitting needs a licence (left out for a licensed household). */
  licenceReminder: boolean;
}

/** The one plain line for a screen, or null when there is nothing to say to this household. */
export function licenceLine(use: RadioUse, licence: Pick<RadioLicence, "licensed">): LicenceLine | null {
  switch (use) {
    case "listen":
      return { text: "Listening: no licence needed.", licenceReminder: false };
    case "listen-restricted":
      return {
        text: "Listening: no licence needed for a receive-only radio, but the law limits what may be listened to and passed on.",
        licenceReminder: false,
      };
    case "licence-free":
      return { text: "Licence-free radio: no licence needed, within the power and equipment limits.", licenceReminder: false };
    case "transmit":
      return licence.licensed
        ? null
        : { text: "Transmitting: needs an amateur licence. Here it is practice and planning only.", licenceReminder: true };
    case "listen-and-transmit":
      return licence.licensed
        ? { text: "Listening: no licence needed.", licenceReminder: false }
        : { text: "Listening: no licence needed. Transmitting: needs an amateur licence.", licenceReminder: true };
  }
}

/** The statements each kind of screen's line rests on (ids in LICENCE_STATEMENTS), listed under the line. */
export const LICENCE_LINE_STATEMENTS: Record<RadioUse, readonly string[]> = {
  listen: ["receive-broadcast-time", "receive-amateur"],
  "listen-restricted": ["receive-aircraft", "receive-ships", "receive-other"],
  "licence-free": ["pmr446-cb", "meshtastic"],
  transmit: ["transmit-amateur"],
  "listen-and-transmit": ["receive-amateur", "transmit-amateur"],
};

/** The Help page that lists every statement. */
export const LICENCE_HELP_PATH = "/help/radio-licences";

// ── The statements (data in radio-licence-statements.ts) ──────────────────────

export type LicenceStatementGroup = "listen" | "licence-free" | "needs-licence";

export const LICENCE_STATEMENT_GROUPS: ReadonlyArray<{ id: LicenceStatementGroup; title: string }> = [
  { id: "listen", title: "Listening" },
  { id: "licence-free", title: "Radio anyone may use" },
  { id: "needs-licence", title: "Transmitting on amateur bands" },
];

/** What one regulator's text says about one activity. */
export interface LicenceRule {
  /** "GB" or "US". */
  country: string;
  /** What the rule means for a household, in a sentence or two, in plain words. */
  says: string;
  /** The regulator's own words, quoted exactly, where a short quotation carries it. */
  quote?: string;
  sources: FrequencySource[];
}

export interface LicenceStatement {
  /** Unique, lower case with hyphens: "receive-aircraft". */
  id: string;
  group: LicenceStatementGroup;
  /** The activity, in a few words: "Receiving aircraft (ADS-B and airband voice)". */
  topic: string;
  rules: LicenceRule[];
  /** Where Outpost does not know, said plainly ("Other countries: not read."). */
  unknown?: string;
}
