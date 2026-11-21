/**
 * United States: amateur licence classes (47 CFR Part 97) and the licence-free and
 * personal radio services (47 CFR Part 95 and Part 15), as read from the eCFR on
 * 21 November 2026 (the eCFR was then up to date as of 19 November 2026).
 *
 * Band edges are those for a station in ITU Region 2, which takes in the United States,
 * Puerto Rico and the US Virgin Islands (note to 47 CFR 97.303). Every figure below is
 * from the sections named in the sources.
 */
import type { FrequencySource } from "../radio-frequencies.ts";
import type { BandPrivilege, CountryRadioRules, LicenceFreeService } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const ecfr = (section: string, name: string, amended: string): FrequencySource => ({
  publisher: "Electronic Code of Federal Regulations (eCFR), Office of the Federal Register",
  title: `47 CFR ${section}, ${name} (eCFR, up to date as of 19 November 2026; section last amended ${amended})`,
  url: `https://www.ecfr.gov/current/title-47/section-${section}`,
  checked: CHECKED,
});

const CFR_97_9 = ecfr("97.9", "Operator license grant", "15 December 2010");
const CFR_97_17 = ecfr("97.17", "Application for new license grant", "15 December 2010");
const CFR_97_301 = ecfr("97.301", "Authorized frequency bands", "14 January 2026 (91 FR 1430)");
const CFR_97_303 = ecfr("97.303", "Frequency sharing requirements", "14 January 2026 (91 FR 1430)");
const CFR_97_305 = ecfr("97.305", "Authorized emission types", "14 January 2026 (91 FR 1431)");
const CFR_97_307 = ecfr("97.307", "Emission standards", "14 January 2026 (91 FR 1431)");
const CFR_97_313 = ecfr("97.313", "Transmitter power standards", "14 January 2026 (91 FR 1431)");
const CFR_97_501 = ecfr("97.501", "Qualifying for an amateur operator license", "24 January 2007");

const PART_97: FrequencySource[] = [CFR_97_301, CFR_97_303, CFR_97_305, CFR_97_307, CFR_97_313];

const CFR_95: FrequencySource = {
  publisher: "Electronic Code of Federal Regulations (eCFR), Office of the Federal Register",
  title:
    "47 CFR Part 95, Personal Radio Services (eCFR, up to date as of 19 November 2026), sections 95.305, 95.563, 95.567, 95.587, 95.931, 95.963, 95.967, 95.1705, 95.1763, 95.1767, 95.2763, 95.2767",
  url: "https://www.ecfr.gov/current/title-47/chapter-I/subchapter-D/part-95",
  checked: CHECKED,
};

const CFR_15: FrequencySource = {
  publisher: "Electronic Code of Federal Regulations (eCFR), Office of the Federal Register",
  title:
    "47 CFR 15.1, Scope of this part, and 15.247, Operation within the bands 902-928 MHz, 2400-2483.5 MHz, and 5725-5850 MHz (eCFR, up to date as of 19 November 2026; 15.247 last amended 1 April 2020)",
  url: "https://www.ecfr.gov/current/title-47/section-15.247",
  checked: CHECKED,
};

// ── Shared pieces ───────────────────────────────────────────────────────────

/** 47 CFR 97.313(b). */
const MAX = "1.5 kW PEP";

/** 47 CFR 97.301(a): the bands from 6 m up, for Technician, General, Advanced and Amateur Extra (Region 2). */
const FROM_6_M: BandPrivilege[] = [
  { band: "6 m", fromKhz: 50_000, toKhz: 54_000, power: MAX, note: "CW only below 50.1 MHz" },
  { band: "2 m", fromKhz: 144_000, toKhz: 148_000, power: MAX, note: "CW only below 144.1 MHz" },
  {
    band: "1.25 m",
    fromKhz: 219_000,
    toKhz: 220_000,
    power: "50 W PEP",
    note: "Fixed point-to-point digital message forwarding only; give written notice of the station's location at least 30 days before (97.303(l))",
  },
  { band: "1.25 m", fromKhz: 222_000, toKhz: 225_000, power: MAX },
  {
    band: "70 cm",
    fromKhz: 420_000,
    toKhz: 450_000,
    power: MAX,
    note: "Must accept interference from US Government radiolocation. No transmitting north of Line A in 420 to 430 MHz. 50 W PEP in areas near certain military bases (97.313(f))",
  },
  {
    band: "33 cm",
    fromKhz: 902_000,
    toKhz: 928_000,
    power: MAX,
    note: "Must accept interference from US Government stations, Location and Monitoring Service and ISM equipment. 50 W PEP within 241 km of White Sands Missile Range; no transmitting inside its boundaries",
  },
  {
    band: "23 cm",
    fromKhz: 1_240_000,
    toKhz: 1_300_000,
    power: MAX,
    note: "Must accept interference from radiolocation and radionavigation",
  },
  { band: "13 cm", fromKhz: 2_300_000, toKhz: 2_310_000, power: MAX, note: "Must accept interference from fixed and mobile services" },
  { band: "13 cm", fromKhz: 2_390_000, toKhz: 2_450_000, power: MAX, note: "Must accept interference from ISM equipment above 2400 MHz" },
  { band: "5 cm", fromKhz: 5_650_000, toKhz: 5_925_000, power: MAX, note: "Must accept interference from radiolocation and ISM equipment" },
  { band: "3 cm", fromKhz: 10_000_000, toKhz: 10_500_000, power: MAX, note: "Must accept interference from US Government radiolocation" },
  { band: "1.2 cm", fromKhz: 24_000_000, toKhz: 24_250_000, power: MAX, note: "Must accept interference from ISM equipment" },
  { band: "6 mm", fromKhz: 47_000_000, toKhz: 47_200_000, power: MAX },
  { band: "4 mm", fromKhz: 76_000_000, toKhz: 81_000_000, power: "316 W peak EIRP", note: "Must accept interference from radiolocation" },
  {
    band: "2.5 mm",
    fromKhz: 122_250_000,
    toKhz: 123_000_000,
    power: MAX,
    note: "Must accept interference from fixed, inter-satellite and mobile services",
  },
  { band: "2 mm", fromKhz: 134_000_000, toKhz: 141_000_000, power: MAX },
  { band: "1 mm", fromKhz: 241_000_000, toKhz: 250_000_000, power: MAX, note: "Also all frequencies above 275 GHz (97.301(a))" },
];

/** 47 CFR 97.301(b) to (d): the LF and MF bands for General, Advanced and Amateur Extra. */
const LF_MF: BandPrivilege[] = [
  {
    band: "2200 m",
    fromKhz: 135.7,
    toKhz: 137.8,
    power: "1.5 kW PEP, 1 W EIRP",
    note: "Fixed stations only; notify the Utilities Telecom Council 30 days before; not within 1 km of a power line carrier line on the band",
  },
  {
    band: "630 m",
    fromKhz: 472,
    toKhz: 479,
    power: "500 W PEP, 5 W EIRP",
    note: "Fixed stations only; notify the Utilities Telecom Council 30 days before. 1 W EIRP in Alaska within 800 km of Russia",
  },
  { band: "160 m", fromKhz: 1800, toKhz: 2000, power: MAX, note: "CW, RTTY, data, phone and image" },
];

/** 47 CFR 97.303(h), 97.305(c), 97.313(i): the 60 m channels and segment, for General, Advanced and Amateur Extra. */
const SIXTY_M: BandPrivilege[] = [
  ...[5332, 5348, 5373, 5405].map(
    (khz): BandPrivilege => ({
      band: "60 m",
      fromKhz: khz,
      toKhz: khz,
      power: "100 W ERP",
      note: "Channel centre frequency; phone, RTTY, data and CW, no wider than 2.8 kHz. Must accept interference from the fixed service",
    }),
  ),
  {
    band: "60 m",
    fromKhz: 5351.5,
    toKhz: 5366.5,
    power: "9.15 W ERP",
    note: "Phone, RTTY, data and CW, no wider than 2.8 kHz. Must accept interference from the fixed service",
  },
];

const THIRTY_M: BandPrivilege = {
  band: "30 m",
  fromKhz: 10_100,
  toKhz: 10_150,
  power: "200 W PEP",
  note: "CW, RTTY and data. Must accept interference from the fixed service of other nations",
};
const SEVENTEEN_M: BandPrivilege = {
  band: "17 m",
  fromKhz: 18_068,
  toKhz: 18_168,
  power: MAX,
  note: "RTTY and data to 18.110 MHz; phone and image from 18.110 MHz",
};
const TWELVE_M: BandPrivilege = {
  band: "12 m",
  fromKhz: 24_890,
  toKhz: 24_990,
  power: MAX,
  note: "RTTY and data to 24.93 MHz; phone and image from 24.93 MHz",
};
const TEN_M: BandPrivilege = {
  band: "10 m",
  fromKhz: 28_000,
  toKhz: 29_700,
  power: MAX,
  note: "RTTY and data to 28.3 MHz; phone and image from 28.3 MHz",
};

/** 47 CFR 97.301(e), 97.305(c), 97.307(f)(9) and (10), 97.313(c)(2): HF for Novice and Technician. */
const NOVICE_TECHNICIAN_HF: BandPrivilege[] = [
  { band: "80 m", fromKhz: 3525, toKhz: 3600, power: "200 W PEP", note: "CW only" },
  { band: "40 m", fromKhz: 7025, toKhz: 7125, power: "200 W PEP", note: "CW only" },
  { band: "15 m", fromKhz: 21_025, toKhz: 21_200, power: "200 W PEP", note: "CW only" },
  {
    band: "10 m",
    fromKhz: 28_000,
    toKhz: 28_500,
    power: "200 W PEP",
    note: "CW, RTTY and data to 28.3 MHz; CW and single-sideband phone (J3E, R3E) from 28.3 MHz",
  },
];

const COMMON_NOTES = [
  "CW may be sent on any frequency the licence allows (97.305(a)). Use the least power needed (97.313(a)).",
  "Spread spectrum: 10 W PEP at most (97.313(j)).",
  "Edges are for ITU Region 2 (the United States, Puerto Rico and the US Virgin Islands). Some HF edges differ in Regions 1 and 3 (97.301).",
];

// ── Licence-free and personal radio ─────────────────────────────────────────

const LICENCE_FREE: LicenceFreeService[] = [
  {
    name: "FRS",
    frequencies: "462.5625 to 462.7250 MHz and 467.5625 to 467.7125 MHz, 22 channels of 12.5 kHz",
    power: "2 W ERP (0.5 W ERP on channels 8 to 14)",
    licence: "No licence (authorised by rule, 47 CFR 95.305).",
    note: "Radios must have a fixed antenna and only the 22 FRS channels. All FRS channels are shared with GMRS. Short location and text data bursts are allowed; no store-and-forward packet.",
    frequencyEntryId: "lf-frs",
    sources: [CFR_95],
  },
  {
    name: "GMRS",
    frequencies: "462 and 467 MHz: 16 main channels and 14 interstitial channels (the FRS channels 1 to 14)",
    power:
      "50 W transmitter output on main channels (15 W for fixed stations); 5 W ERP on 462 MHz interstitials; 0.5 W ERP on 467 MHz interstitials",
    licence: "Individual FCC licence needed, for anyone 18 or over; the rules set no exam (47 CFR 95.1705).",
    note: "The licence covers the holder's immediate family. Anyone may use a licensee's station to pass an emergency message. Repeaters are allowed; 467 MHz main channels are for talking through a repeater.",
    frequencyEntryId: "lf-gmrs",
    sources: [CFR_95],
  },
  {
    name: "MURS",
    frequencies: "151.820, 151.880, 151.940, 154.570 and 154.600 MHz, 5 channels",
    power: "2 W transmitter output",
    licence: "No licence (authorised by rule, 47 CFR 95.305).",
    frequencyEntryId: "lf-murs",
    sources: [CFR_95],
  },
  {
    name: "CB (27 MHz)",
    frequencies: "26.965 to 27.405 MHz, 40 channels",
    power: "4 W mean carrier power (AM or FM); 12 W PEP (SSB)",
    licence: "No licence (authorised by rule, 47 CFR 95.305).",
    note: "Channel 9 is for emergency communications and traveller assistance only. Emergency messages have priority on every channel (95.931).",
    frequencyEntryId: "lf-cb-us",
    sources: [CFR_95],
  },
  {
    name: "900 MHz ISM (Part 15), used by Meshtastic and LoRa",
    frequencies: "902 to 928 MHz",
    power:
      "1 W peak conducted output (frequency hopping with at least 50 channels, or digital modulation); 0.25 W for hopping on 25 to 49 channels",
    licence: "No licence for certified Part 15 devices that follow the rules (47 CFR 15.1).",
    note: "Above 6 dBi antenna gain the output power must be cut by the excess (15.247(b)(4)). Part 15 devices must accept interference, including from Government radar and ISM equipment.",
    sources: [CFR_15],
  },
];

// ── The rules ───────────────────────────────────────────────────────────────

export const RULES_US: CountryRadioRules = {
  country: "US",
  regulator: "Federal Communications Commission",
  regulatorUrl: "https://www.ecfr.gov/current/title-47/chapter-I/subchapter-D/part-97",
  summary:
    "The FCC licenses amateur operators in three classes now issued: Technician, General and Amateur Extra, each by exam. Novice and Advanced licences are no longer issued, but holders keep their privileges.",
  classes: [
    {
      id: "us-technician",
      name: "Technician",
      how: "Pass exam element 2 (47 CFR 97.501).",
      privileges: [...NOVICE_TECHNICIAN_HF, ...FROM_6_M],
      notes: COMMON_NOTES,
      sources: [CFR_97_501, ...PART_97],
    },
    {
      id: "us-general",
      name: "General",
      how: "Pass exam elements 2 and 3 (47 CFR 97.501).",
      privileges: [
        ...LF_MF,
        { band: "80 m", fromKhz: 3525, toKhz: 3600, power: MAX, note: "CW, RTTY and data" },
        { band: "75 m", fromKhz: 3800, toKhz: 4000, power: MAX, note: "CW, phone and image" },
        ...SIXTY_M,
        { band: "40 m", fromKhz: 7025, toKhz: 7125, power: MAX, note: "CW, RTTY and data" },
        {
          band: "40 m",
          fromKhz: 7175,
          toKhz: 7300,
          power: MAX,
          note: "CW, phone and image. Above 7.2 MHz, must accept interference from broadcasting for Regions 1 and 3",
        },
        THIRTY_M,
        { band: "20 m", fromKhz: 14_025, toKhz: 14_150, power: MAX, note: "CW, RTTY and data" },
        { band: "20 m", fromKhz: 14_225, toKhz: 14_350, power: MAX, note: "CW, phone and image" },
        SEVENTEEN_M,
        { band: "15 m", fromKhz: 21_025, toKhz: 21_200, power: MAX, note: "CW, RTTY and data" },
        { band: "15 m", fromKhz: 21_275, toKhz: 21_450, power: MAX, note: "CW, phone and image" },
        TWELVE_M,
        TEN_M,
        ...FROM_6_M,
      ],
      notes: COMMON_NOTES,
      sources: [CFR_97_501, ...PART_97],
    },
    {
      id: "us-extra",
      name: "Amateur Extra",
      how: "Pass exam elements 2, 3 and 4 (47 CFR 97.501).",
      privileges: [
        ...LF_MF,
        { band: "80 m", fromKhz: 3500, toKhz: 3600, power: MAX, note: "CW, RTTY and data" },
        { band: "75 m", fromKhz: 3600, toKhz: 4000, power: MAX, note: "CW, phone and image" },
        ...SIXTY_M,
        {
          band: "40 m",
          fromKhz: 7000,
          toKhz: 7300,
          power: MAX,
          note: "RTTY and data to 7.125 MHz; phone and image from 7.125 MHz. Above 7.2 MHz, must accept interference from broadcasting for Regions 1 and 3",
        },
        THIRTY_M,
        { band: "20 m", fromKhz: 14_000, toKhz: 14_350, power: MAX, note: "RTTY and data to 14.15 MHz; phone and image from 14.15 MHz" },
        SEVENTEEN_M,
        { band: "15 m", fromKhz: 21_000, toKhz: 21_450, power: MAX, note: "RTTY and data to 21.2 MHz; phone and image from 21.2 MHz" },
        TWELVE_M,
        TEN_M,
        ...FROM_6_M,
      ],
      notes: COMMON_NOTES,
      sources: [CFR_97_501, ...PART_97],
    },
    {
      id: "us-advanced",
      name: "Advanced",
      how: "No longer issued: no new Advanced licence is granted (47 CFR 97.17). It is still a class in the rules (97.9).",
      privileges: [
        ...LF_MF,
        { band: "80 m", fromKhz: 3525, toKhz: 3600, power: MAX, note: "CW, RTTY and data" },
        { band: "75 m", fromKhz: 3700, toKhz: 4000, power: MAX, note: "CW, phone and image" },
        ...SIXTY_M,
        {
          band: "40 m",
          fromKhz: 7025,
          toKhz: 7300,
          power: MAX,
          note: "RTTY and data to 7.125 MHz; phone and image from 7.125 MHz. Above 7.2 MHz, must accept interference from broadcasting for Regions 1 and 3",
        },
        THIRTY_M,
        { band: "20 m", fromKhz: 14_025, toKhz: 14_150, power: MAX, note: "CW, RTTY and data" },
        { band: "20 m", fromKhz: 14_175, toKhz: 14_350, power: MAX, note: "CW, phone and image" },
        SEVENTEEN_M,
        { band: "15 m", fromKhz: 21_025, toKhz: 21_200, power: MAX, note: "CW, RTTY and data" },
        { band: "15 m", fromKhz: 21_225, toKhz: 21_450, power: MAX, note: "CW, phone and image" },
        TWELVE_M,
        TEN_M,
        ...FROM_6_M,
      ],
      notes: COMMON_NOTES,
      sources: [CFR_97_9, CFR_97_17, ...PART_97],
    },
    {
      id: "us-novice",
      name: "Novice",
      how: "No longer issued: no new Novice licence is granted (47 CFR 97.17). It is still a class in the rules (97.9).",
      privileges: [
        ...NOVICE_TECHNICIAN_HF,
        { band: "1.25 m", fromKhz: 222_000, toKhz: 225_000, power: "25 W PEP" },
        {
          band: "23 cm",
          fromKhz: 1_270_000,
          toKhz: 1_295_000,
          power: "5 W PEP",
          note: "Must accept interference from radiolocation and radionavigation",
        },
      ],
      notes: COMMON_NOTES,
      sources: [CFR_97_9, CFR_97_17, ...PART_97],
    },
  ],
  licenceFree: LICENCE_FREE,
  notRead: [
    "Band edges for US stations in ITU Regions 1 and 3 (some Pacific insular areas) are in 47 CFR 97.301 but are not listed here.",
    "The detailed emission standards of 47 CFR 97.307 and the digital codes of 97.309 are summarised only where they limit a class (for example, CW only).",
  ],
};
