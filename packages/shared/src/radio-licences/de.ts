/**
 * Germany: the three classes of amateur licence (Klasse A, E and N) and the licence-free
 * services, as the Bundesnetzagentur and the Amateurfunkverordnung give them.
 *
 * Band edges and powers are from Anlage 1 of the Amateurfunkverordnung (AFuV) as last
 * amended on 27 May 2024, which added Klasse N. Power is as the table gives it: PEP
 * (Spitzenleistung) or ERP (effektive Strahlungsleistung). Licence-free services are from
 * the Bundesnetzagentur's general assignments (Allgemeinzuteilungen).
 */
import type { CountryRadioRules, RadioRulesSource } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const AFUV: RadioRulesSource = {
  publisher: "Bundesministerium der Justiz (gesetze-im-internet.de)",
  title:
    "Amateurfunkverordnung (AFuV) of 15 February 2005, as last amended by Article 1 of the Verordnung of 27 May 2024 (BGBl. 2024 I Nr. 175): §§ 4, 6 and 13a and Anlage 1",
  url: "https://www.gesetze-im-internet.de/afuv_2005/BJNR024200005.html",
  checked: CHECKED,
};
const BNETZA_AFU: RadioRulesSource = {
  publisher: "Bundesnetzagentur",
  title: "Amateurfunk (the regulator's amateur radio page)",
  url: "https://www.bundesnetzagentur.de/DE/Fachthemen/Telekommunikation/Frequenzen/SpezielleAnwendungen/Amateurfunk/start.html",
  checked: CHECKED,
};
const BNETZA_CB: RadioRulesSource = {
  publisher: "Bundesnetzagentur",
  title: "Vfg Nr. 21/2021, Allgemeinzuteilung von Frequenzen für den CB-Funk",
  url: "https://www.bundesnetzagentur.de/DE/Fachthemen/Telekommunikation/Frequenzen/Allgemeinzuteilungen/_DL/MobilfunkDectWlanCBFunk/vfg21_2021.pdf?__blob=publicationFile&v=2",
  checked: CHECKED,
};
const BNETZA_SRD: RadioRulesSource = {
  publisher: "Bundesnetzagentur",
  title: "Vfg. 91/2025, Allgemeinzuteilung von Frequenzen zur Nutzung durch Geräte geringer Reichweite (SRD), November 2025",
  url: "https://www.bundesnetzagentur.de/DE/Fachthemen/Telekommunikation/Frequenzen/Allgemeinzuteilungen/_DL/vfg91_2025.pdf?__blob=publicationFile&v=3",
  checked: CHECKED,
};

// ── Shared conditions from Anlage 1, part B ────────────────────────────────

const BW_HF = "occupied bandwidth at most 2.7 kHz";
const WEEKEND_160 = "at weekends Klasse A may use 750 W PEP, Klasse E 100 W PEP, and contests are allowed";

// ── The rules ───────────────────────────────────────────────────────────────

export const RULES_DE: CountryRadioRules = {
  country: "DE",
  regulator: "Bundesnetzagentur",
  regulatorUrl: BNETZA_AFU.url,
  summary:
    "The Bundesnetzagentur licenses amateurs after its own exam. There are three classes: Klasse N (entry, since 24 June 2024: 10 m, 2 m and 70 cm only), Klasse E (novice) and Klasse A (full, HAREC).",
  classes: [
    {
      id: "de-klasse-a",
      name: "Klasse A",
      how: "Pass the Bundesnetzagentur exam for Klasse A: full technical knowledge, operating practice and regulations. Holders of Klasse N or E take an extra technical exam.",
      privileges: [
        {
          band: "2200 m",
          fromKhz: 135.7,
          toKhz: 137.8,
          power: "1 W ERP",
          note: "secondary; bandwidth at most 800 Hz; the site must be notified to the Bundesnetzagentur",
        },
        { band: "630 m", fromKhz: 472, toKhz: 479, power: "1 W ERP", note: "secondary; bandwidth at most 800 Hz" },
        { band: "160 m", fromKhz: 1810, toKhz: 1850, power: "750 W PEP", note: `primary; ${BW_HF}` },
        {
          band: "160 m",
          fromKhz: 1850,
          toKhz: 1890,
          power: "75 W PEP",
          note: `secondary; ${BW_HF}; no remote stations and no contests, except that ${WEEKEND_160}`,
        },
        {
          band: "160 m",
          fromKhz: 1890,
          toKhz: 2000,
          power: "10 W PEP",
          note: `secondary; ${BW_HF}; no remote stations and no contests, except that ${WEEKEND_160}`,
        },
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: "750 W PEP", note: `primary; ${BW_HF}` },
        { band: "60 m", fromKhz: 5351.5, toKhz: 5366.5, power: "9.14 W ERP", note: `secondary; ${BW_HF}` },
        { band: "40 m", fromKhz: 7000, toKhz: 7200, power: "750 W PEP", note: `primary; ${BW_HF}` },
        {
          band: "30 m",
          fromKhz: 10100,
          toKhz: 10150,
          power: "150 W PEP",
          note: "secondary; bandwidth at most 800 Hz; no remote stations and no contests",
        },
        { band: "20 m", fromKhz: 14000, toKhz: 14350, power: "750 W PEP", note: `primary; ${BW_HF}` },
        { band: "17 m", fromKhz: 18068, toKhz: 18168, power: "750 W PEP", note: `primary; ${BW_HF}` },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: "750 W PEP", note: `primary; ${BW_HF}` },
        { band: "12 m", fromKhz: 24890, toKhz: 24990, power: "750 W PEP", note: `primary; ${BW_HF}` },
        {
          band: "10 m",
          fromKhz: 28000,
          toKhz: 29700,
          power: "750 W PEP",
          note: "primary; bandwidth at most 7 kHz below 29 MHz, 40 kHz above",
        },
        {
          band: "6 m",
          fromKhz: 50000,
          toKhz: 50400,
          power: "750 W PEP",
          note: "secondary; fixed stations only, horizontal polarisation only; bandwidth at most 12 kHz",
        },
        {
          band: "6 m",
          fromKhz: 50400,
          toKhz: 52000,
          power: "25 W PEP",
          note: "secondary; fixed stations only, horizontal polarisation only; bandwidth at most 12 kHz",
        },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "750 W PEP", note: "primary; bandwidth at most 40 kHz" },
        {
          band: "70 cm",
          fromKhz: 430000,
          toKhz: 440000,
          power: "750 W PEP",
          note: "primary; bandwidth at most 2 MHz (7 MHz for AM television)",
        },
        { band: "23 cm", fromKhz: 1240000, toKhz: 1300000, power: "750 W PEP", note: "secondary; 1247 to 1263 MHz at most 3.05 W ERP" },
        { band: "13 cm", fromKhz: 2320000, toKhz: 2450000, power: "75 W PEP", note: "secondary" },
        { band: "9 cm", fromKhz: 3400000, toKhz: 3475000, power: "75 W PEP", note: "secondary" },
        { band: "6 cm", fromKhz: 5650000, toKhz: 5850000, power: "75 W PEP", note: "secondary" },
        { band: "3 cm", fromKhz: 10000000, toKhz: 10500000, power: "75 W PEP", note: "secondary" },
        { band: "1.2 cm", fromKhz: 24000000, toKhz: 24050000, power: "75 W PEP", note: "primary" },
        { band: "1.2 cm", fromKhz: 24050000, toKhz: 24250000, power: "75 W PEP", note: "secondary" },
        { band: "6 mm", fromKhz: 47000000, toKhz: 47200000, power: "75 W PEP", note: "primary" },
        { band: "4 mm", fromKhz: 76000000, toKhz: 81000000, power: "75 W PEP", note: "secondary" },
        { band: "2.5 mm", fromKhz: 122250000, toKhz: 123000000, power: "75 W PEP", note: "secondary" },
        { band: "2 mm", fromKhz: 134000000, toKhz: 136000000, power: "75 W PEP", note: "primary" },
        { band: "2 mm", fromKhz: 136000000, toKhz: 141000000, power: "75 W PEP", note: "secondary" },
        { band: "1 mm", fromKhz: 241000000, toKhz: 248000000, power: "75 W PEP", note: "secondary" },
        { band: "1 mm", fromKhz: 248000000, toKhz: 250000000, power: "75 W PEP", note: "primary" },
      ],
      notes: [
        "Only Klasse A holders may operate a station by remote control over a network (Remote-Betrieb, § 13a).",
        "Remote-controlled and automatic stations need their own callsign and may use at most 50 W ERP above 30 MHz.",
        "Visitors with a CEPT licence (T/R 61-01) may operate with Klasse A privileges for up to three months a stay, signing DL/ before their own callsign.",
      ],
      sources: [AFUV, BNETZA_AFU],
    },
    {
      id: "de-klasse-e",
      name: "Klasse E",
      how: "Pass the Bundesnetzagentur exam for Klasse E: the basics of the technical knowledge, with the same operating and regulations parts as Klasse A.",
      privileges: [
        { band: "160 m", fromKhz: 1810, toKhz: 1850, power: "100 W PEP", note: `primary; ${BW_HF}` },
        {
          band: "160 m",
          fromKhz: 1850,
          toKhz: 1890,
          power: "75 W PEP",
          note: `secondary; ${BW_HF}; no remote stations and no contests, except that ${WEEKEND_160}`,
        },
        {
          band: "160 m",
          fromKhz: 1890,
          toKhz: 2000,
          power: "10 W PEP",
          note: `secondary; ${BW_HF}; no remote stations and no contests, except that ${WEEKEND_160}`,
        },
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: "100 W PEP", note: `primary; ${BW_HF}` },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: "100 W PEP", note: `primary; ${BW_HF}` },
        {
          band: "10 m",
          fromKhz: 28000,
          toKhz: 29700,
          power: "100 W PEP",
          note: "primary; bandwidth at most 7 kHz below 29 MHz, 40 kHz above",
        },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "75 W PEP", note: "primary; bandwidth at most 40 kHz" },
        {
          band: "70 cm",
          fromKhz: 430000,
          toKhz: 440000,
          power: "75 W PEP",
          note: "primary; bandwidth at most 2 MHz (7 MHz for AM television)",
        },
        { band: "23 cm", fromKhz: 1240000, toKhz: 1300000, power: "75 W PEP", note: "secondary; 1247 to 1263 MHz at most 3.05 W ERP" },
        { band: "13 cm", fromKhz: 2320000, toKhz: 2450000, power: "5 W PEP", note: "secondary" },
        { band: "9 cm", fromKhz: 3400000, toKhz: 3475000, power: "5 W PEP", note: "secondary" },
        { band: "6 cm", fromKhz: 5650000, toKhz: 5850000, power: "5 W PEP", note: "secondary" },
        { band: "3 cm", fromKhz: 10000000, toKhz: 10500000, power: "5 W PEP", note: "secondary" },
        { band: "1.2 cm", fromKhz: 24000000, toKhz: 24050000, power: "5 W PEP", note: "primary" },
        { band: "1.2 cm", fromKhz: 24050000, toKhz: 24250000, power: "5 W PEP", note: "secondary" },
        { band: "6 mm", fromKhz: 47000000, toKhz: 47200000, power: "5 W PEP", note: "primary" },
        { band: "4 mm", fromKhz: 76000000, toKhz: 81000000, power: "5 W PEP", note: "secondary" },
        { band: "2.5 mm", fromKhz: 122250000, toKhz: 123000000, power: "5 W PEP", note: "secondary" },
        { band: "2 mm", fromKhz: 134000000, toKhz: 136000000, power: "5 W PEP", note: "primary" },
        { band: "2 mm", fromKhz: 136000000, toKhz: 141000000, power: "5 W PEP", note: "secondary" },
        { band: "1 mm", fromKhz: 241000000, toKhz: 248000000, power: "5 W PEP", note: "secondary" },
        { band: "1 mm", fromKhz: 248000000, toKhz: 250000000, power: "5 W PEP", note: "primary" },
      ],
      notes: [
        "Klasse E has no 2200 m, 630 m, 60 m, 40 m, 30 m, 20 m, 17 m, 12 m or 6 m privileges.",
        "Visitors with a CEPT Novice licence (ECC/REC/(05)06) may operate with Klasse E privileges for up to three months a stay, signing DO/ before their own callsign.",
      ],
      sources: [AFUV, BNETZA_AFU],
    },
    {
      id: "de-klasse-n",
      name: "Klasse N",
      how: "Pass the Bundesnetzagentur exam for Klasse N (entry class, since 24 June 2024): the essential basics of the technical knowledge, with the same operating and regulations parts as the other classes.",
      privileges: [
        {
          band: "10 m",
          fromKhz: 28000,
          toKhz: 29700,
          power: "10 W ERP",
          note: "primary; bandwidth at most 7 kHz below 29 MHz, 40 kHz above",
        },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "6.1 W ERP", note: "primary; bandwidth at most 40 kHz" },
        {
          band: "70 cm",
          fromKhz: 430000,
          toKhz: 440000,
          power: "6.1 W ERP",
          note: "primary; bandwidth at most 2 MHz (7 MHz for AM television)",
        },
      ],
      notes: [
        "Klasse N power is given as ERP (radiated, antenna gain included), not as transmitter output.",
        "Holders move up to Klasse E or A with an extra exam on the technical part only.",
      ],
      sources: [AFUV, BNETZA_AFU],
    },
  ],
  licenceFree: [
    {
      name: "CB (27 MHz)",
      frequencies: "26.565 to 27.405 MHz, 80 channels: 1 to 40 are the European channels, 41 to 80 (26.565 to 26.955 MHz) are national",
      power: "4 W ERP on FM (channels 1 to 80); 4 W ERP on AM and 12 W PEP on SSB (channels 1 to 40 only)",
      licence: "No licence: a general assignment (Allgemeinzuteilung) open to everyone, valid until 31 December 2030.",
      note: "Not for commercial use. Fixed stations may not use channels 41 to 80 in the border districts listed in the assignment. No beacons, broadcasting or continuous transmissions.",
      frequencyEntryId: "lf-cb-de",
      sources: [BNETZA_CB],
    },
    {
      name: "PMR446",
      frequencies: "446.0 to 446.2 MHz",
      power: "500 mW ERP",
      licence: "No licence: covered by the general assignment for short range devices (band 83), valid until 31 December 2035.",
      note: "Hand-held radios with built-in antennas only, used radio to radio: no base stations, repeaters or network infrastructure.",
      frequencyEntryId: "lf-pmr446-analogue",
      sources: [BNETZA_SRD],
    },
    {
      name: "SRD 868 MHz (short range devices, LoRa and similar)",
      frequencies: "863 to 870 MHz in sub-bands; for general devices 868.0 to 868.6 MHz (25 mW ERP) and 869.4 to 869.65 MHz (500 mW ERP)",
      power:
        "25 mW ERP on 868.0 to 868.6 MHz, duty cycle at most 1 %; 500 mW ERP on 869.4 to 869.65 MHz, duty cycle at most 10 % (or equivalent access techniques)",
      licence: "No licence: general assignment for short range devices (bands 48 and 54), valid until 31 December 2035.",
      note: "For data and telemetry, not speech. Other sub-bands between 863 and 870 MHz carry their own power and duty-cycle limits, and some are reserved for alarms.",
      sources: [BNETZA_SRD],
    },
    {
      name: "SRD 433 MHz (LPD433)",
      frequencies: "433.05 to 434.79 MHz",
      power: "10 mW ERP",
      licence:
        "No licence: general assignment for short range devices (bands 44a, 44b and 45c, with the national band D44b), valid until 31 December 2035.",
      note: "The European rows limit 10 mW to a duty cycle of 10 % (or 100 % in 434.04 to 434.79 MHz with 25 kHz or less bandwidth); Germany's national row D44b gives 10 mW ERP across the whole band and lists no duty cycle or other restriction.",
      frequencyEntryId: "lf-lpd433",
      sources: [BNETZA_SRD],
    },
  ],
  notRead: [
    "The band plan within each amateur band (where CW, SSB and FM sit) is set by the amateur societies, not by the Verordnung, and is not included.",
    "Bands above 275 GHz (Anlage 1, part B, note 14) have conditions published separately in the Bundesnetzagentur's Amtsblatt, which was not read.",
  ],
};
