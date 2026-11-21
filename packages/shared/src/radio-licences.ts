/**
 * Band plans and licence rules by country (Radio → Licences and band plans): what each
 * class of amateur licence may use and at what power, and the licence-free services
 * (PMR446, FRS and GMRS, CB, UHF CB) a household can use, for the countries Outpost has
 * read the regulator's own documents for. Chosen by where Home is.
 *
 * Every figure names the document it was read from and the day it was read; nothing is
 * fetched. A country whose rules have not been read is listed in RADIO_RULES_NOT_READ
 * with the regulator to ask, so that the screen can say so rather than guess. The data
 * is in the files under `radio-licences/`.
 */
import type { FrequencySource } from "./radio-frequencies.ts";

export type { FrequencySource as RadioRulesSource };

/** One stretch of spectrum a licence class may transmit on. Edges in kHz, inclusive. */
export interface BandPrivilege {
  /** The band as people name it: "80 m", "2 m", "70 cm". */
  band: string;
  fromKhz: number;
  toKhz: number;
  /**
   * The most power allowed, in the regulator's own terms: "400 W PEP", "25 W", "26 dBW".
   * Where the regulator gives it as a figure and a unit, keep both.
   */
  power: string;
  /** Conditions in a few words, as the regulator gives them: "secondary", "CW only", "not to be used for satellite". */
  note?: string;
}

/** One class (or grade) of amateur licence. */
export interface LicenceClass {
  /** Unique, lower case with hyphens, starting with the country: "gb-full", "us-extra". */
  id: string;
  /** The class's name as the regulator gives it: "Full", "Amateur Extra", "Klasse A". */
  name: string;
  /** How a person gets it, in a sentence, where the regulator says: "Pass the Full exam". */
  how?: string;
  privileges: BandPrivilege[];
  /** Anything else a holder needs to know that the table does not say. */
  notes?: string[];
  sources: FrequencySource[];
}

/** A radio service a household can use with no amateur licence. */
export interface LicenceFreeService {
  /** "PMR446", "FRS", "GMRS", "CB (27 MHz)", "UHF CB". */
  name: string;
  /** The frequencies in words: "446.00625 to 446.19375 MHz, 16 channels". */
  frequencies: string;
  /** The power limit as the regulator gives it: "500 mW e.r.p.", "4 W carrier (AM)". */
  power: string;
  /** Whether a licence is needed, in a sentence: "No licence", "Licence needed, no exam". */
  licence: string;
  /** What a person should know: "Handheld radios with fixed antennas only". */
  note?: string;
  /** The id of the matching entry under Frequencies to listen to, where there is one ("lf-pmr446-analogue"). */
  frequencyEntryId?: string;
  sources: FrequencySource[];
}

/** One country's amateur licence classes and licence-free services. */
export interface CountryRadioRules {
  /** ISO 3166-1 alpha-2: "GB". */
  country: string;
  /** "Ofcom", "Federal Communications Commission". */
  regulator: string;
  /** The regulator's own page for amateur radio, for "read more". */
  regulatorUrl: string;
  /** One or two sentences: who licenses, what the classes are. */
  summary: string;
  classes: LicenceClass[];
  licenceFree: LicenceFreeService[];
  /** What could not be read from a primary source, said plainly. */
  notRead?: string[];
}

/** A country whose rules Outpost has not read, with the regulator to ask. */
export interface RadioRulesNotRead {
  country: string;
  regulator: string;
  url: string;
  /** Why it is not here: "Not read yet", "The regulator's page would not load". */
  reason: string;
}

/** "3.5 to 3.8 MHz", "135.7 to 137.8 kHz", "1240 to 1300 MHz", "10 to 10.5 GHz". */
export function formatPrivilegeRange(fromKhz: number, toKhz: number): string {
  const trim = (value: number, digits: number) => {
    const text = value.toFixed(digits);
    return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
  };
  if (fromKhz === toKhz) {
    if (toKhz < 1000) return `${trim(fromKhz, 3)} kHz`;
    return toKhz < 10_000_000 ? `${trim(fromKhz / 1000, 4)} MHz` : `${trim(fromKhz / 1_000_000, 4)} GHz`;
  }
  if (toKhz < 1000) return `${trim(fromKhz, 3)} to ${trim(toKhz, 3)} kHz`;
  if (toKhz < 10_000_000) return `${trim(fromKhz / 1000, 4)} to ${trim(toKhz / 1000, 4)} MHz`;
  return `${trim(fromKhz / 1_000_000, 4)} to ${trim(toKhz / 1_000_000, 4)} GHz`;
}
