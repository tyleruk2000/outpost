/**
 * Canada: amateur qualifications (ISED RBR-4, Issue 3, and RIC-3, Issue 5) and the
 * licence-exempt services a household can use (FRS/GMRS under RSS-210 Annex E, and CB,
 * the General Radio Service, under RSS-236 and RIC-18), as read from ISED's own pages
 * on 21 November 2026.
 *
 * Band edges are those of RBR-4 Schedule I, for amateur stations operating in Canada.
 */
import type { FrequencySource } from "../radio-frequencies.ts";
import type { BandPrivilege, CountryRadioRules } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const ISED = "Innovation, Science and Economic Development Canada";

const ISED_RBR4: FrequencySource = {
  publisher: ISED,
  title: "RBR-4, Standards for the Operation of Radio Stations in the Amateur Radio Service, Issue 3, July 2022",
  url: "https://ised-isde.canada.ca/site/spectrum-management-telecommunications/en/licences-and-certificates/regulations-reference-rbr/rbr-4-standards-operation-radio-stations-amateur-radio-service",
  checked: CHECKED,
};
const ISED_RIC3: FrequencySource = {
  publisher: ISED,
  title: "RIC-3, Information on the Amateur Radio Service, Issue 5, March 2022",
  url: "https://ised-isde.canada.ca/site/spectrum-management-telecommunications/en/licences-and-certificates/radiocom-information-circulars-ric/ric-3-information-amateur-radio-service",
  checked: CHECKED,
};
const ISED_RSS210: FrequencySource = {
  publisher: ISED,
  title: "RSS-210, Licence-Exempt Radio Apparatus: Category I Equipment, Issue 11, June 25, 2024, Annex E",
  url: "https://ised-isde.canada.ca/site/spectrum-management-telecommunications/en/devices-and-equipment/radio-equipment-standards/radio-standards-specifications-rss/rss-210-licence-exempt-radio-apparatus-category-i-equipment",
  checked: CHECKED,
};
const ISED_RSS236: FrequencySource = {
  publisher: ISED,
  title: "RSS-236, General Radio Service Equipment Operating in the Band 26.960 to 27.410 MHz (Citizens Band), Issue 2, September 2022",
  url: "https://ised-isde.canada.ca/site/spectrum-management-telecommunications/sites/default/files/attachments/2022/RSS-236-i2-2022-09EN.pdf",
  checked: CHECKED,
};
const ISED_RIC18: FrequencySource = {
  publisher: ISED,
  title: "RIC-18, General Radio Service (GRS), Issue 5, June 2024",
  url: "https://ised-isde.canada.ca/site/spectrum-management-telecommunications/en/licences-and-certificates/radiocom-information-circulars-ric/ric-18-general-radio-service-grs",
  checked: CHECKED,
};

// ── Power (RBR-4 section 10) ────────────────────────────────────────────────

const BASIC_POWER = "250 W DC input; 560 W PEP (SSB) or 190 W carrier (other emissions)";
const ADVANCED_POWER = "1,000 W DC input; 2,250 W PEP (SSB) or 750 W carrier (other emissions)";

// ── Bands (RBR-4 Schedule I) ────────────────────────────────────────────────

/** Schedule I items 1 to 16: below 30 MHz, for Basic with Honours, Basic with Morse, or Basic with Advanced. */
function belowThirtyMhz(power: string): BandPrivilege[] {
  const sixty =
    "Up to 100 W PEP e.r.p.; phone (2K80J3E), data (2K80J2D), RTTY (60H0J2B) and CW (150HA1A) only; no wider than 2.8 kHz. Must not interfere with fixed and mobile services (C21)";
  return [
    { band: "2200 m", fromKhz: 135.7, toKhz: 137.8, power: "1 W e.i.r.p.", note: "Bandwidth 100 Hz at most" },
    {
      band: "630 m",
      fromKhz: 472,
      toKhz: 479,
      power: "1 W e.i.r.p.",
      note: "Bandwidth 1 kHz at most. Must not interfere with aeronautical radionavigation",
    },
    { band: "160 m", fromKhz: 1800, toKhz: 2000, power, note: "Bandwidth 6 kHz at most" },
    { band: "80 m", fromKhz: 3500, toKhz: 4000, power, note: "Bandwidth 6 kHz at most" },
    ...[5332, 5348].map(
      (khz): BandPrivilege => ({ band: "60 m", fromKhz: khz, toKhz: khz, power: "100 W PEP e.r.p.", note: `Centre frequency. ${sixty}` }),
    ),
    { band: "60 m", fromKhz: 5351.5, toKhz: 5366.5, power: "100 W PEP e.r.p.", note: sixty },
    ...[5373, 5405].map(
      (khz): BandPrivilege => ({ band: "60 m", fromKhz: khz, toKhz: khz, power: "100 W PEP e.r.p.", note: `Centre frequency. ${sixty}` }),
    ),
    {
      band: "40 m",
      fromKhz: 7000,
      toKhz: 7300,
      power,
      note: "Bandwidth 6 kHz at most. 7.2 to 7.3 MHz must not constrain broadcasting for Regions 1 and 3",
    },
    {
      band: "30 m",
      fromKhz: 10_100,
      toKhz: 10_150,
      power,
      note: "Bandwidth 1 kHz at most. Must not interfere with the fixed service of other countries, and may have to stop if it does (C6)",
    },
    { band: "20 m", fromKhz: 14_000, toKhz: 14_350, power, note: "Bandwidth 6 kHz at most" },
    { band: "17 m", fromKhz: 18_068, toKhz: 18_168, power, note: "Bandwidth 6 kHz at most" },
    { band: "15 m", fromKhz: 21_000, toKhz: 21_450, power, note: "Bandwidth 6 kHz at most" },
    { band: "12 m", fromKhz: 24_890, toKhz: 24_990, power, note: "Bandwidth 6 kHz at most" },
    { band: "10 m", fromKhz: 28_000, toKhz: 29_700, power, note: "Bandwidth 20 kHz at most" },
  ];
}

const SECONDARY = "Must not interfere with, and is not protected from, other services in the band";

/** Schedule I items 17 to 40: above 30 MHz, for every holder of the Basic Qualification. */
function aboveThirtyMhz(power: string): BandPrivilege[] {
  return [
    { band: "6 m", fromKhz: 50_000, toKhz: 54_000, power, note: "Bandwidth 30 kHz at most" },
    { band: "2 m", fromKhz: 144_000, toKhz: 148_000, power, note: "Bandwidth 30 kHz at most" },
    { band: "1.25 m", fromKhz: 219_000, toKhz: 220_000, power, note: "Bandwidth 100 kHz at most; secondary (C11)" },
    {
      band: "1.25 m",
      fromKhz: 220_000,
      toKhz: 222_000,
      power,
      note: "Exceptional circumstances only, to help disaster relief; secondary (C11)",
    },
    { band: "1.25 m", fromKhz: 222_000, toKhz: 225_000, power, note: "Bandwidth 100 kHz at most" },
    { band: "70 cm", fromKhz: 430_000, toKhz: 450_000, power, note: `Bandwidth 12 MHz at most. ${SECONDARY}` },
    { band: "33 cm", fromKhz: 902_000, toKhz: 928_000, power, note: `Bandwidth 12 MHz at most. ${SECONDARY}` },
    { band: "23 cm", fromKhz: 1_240_000, toKhz: 1_300_000, power, note: SECONDARY },
    { band: "13 cm", fromKhz: 2_300_000, toKhz: 2_450_000, power, note: SECONDARY },
    { band: "9 cm", fromKhz: 3_300_000, toKhz: 3_500_000, power, note: SECONDARY },
    { band: "5 cm", fromKhz: 5_650_000, toKhz: 5_925_000, power, note: SECONDARY },
    { band: "3 cm", fromKhz: 10_000_000, toKhz: 10_500_000, power, note: SECONDARY },
    {
      band: "1.2 cm",
      fromKhz: 24_000_000,
      toKhz: 24_250_000,
      power,
      note: "24.05 to 24.25 GHz: must not interfere with, and is not protected from, other services",
    },
    { band: "6 mm", fromKhz: 47_000_000, toKhz: 47_200_000, power },
    { band: "4 mm", fromKhz: 76_000_000, toKhz: 81_500_000, power, note: "Secondary in 76 to 77.5 and 78 to 81.5 GHz" },
    { band: "2.5 mm", fromKhz: 122_250_000, toKhz: 123_000_000, power, note: SECONDARY },
    { band: "2 mm", fromKhz: 134_000_000, toKhz: 141_000_000, power, note: "Secondary in 136 to 141 GHz" },
    { band: "1 mm", fromKhz: 241_000_000, toKhz: 250_000_000, power, note: "Secondary in 241 to 248 GHz" },
  ];
}

const COMMON_NOTES = [
  "An amplifier must not be able to exceed the power limit by more than 3 dB (RBR-4 10.1).",
  "Identify with the callsign at the start and end of each exchange and at least every 30 minutes, in English or French (RBR-4 9).",
  "Someone without a qualification may use an amateur station if a qualified operator is present to do the control functions (RIC-3 4.5.4).",
];

const BASIC_RIC3_NOTES = [
  "Build only from commercially available transmitter kits of professional design; no home-made transmitters. Reprogramming by computer is allowed; physical changes to the circuitry are not (RIC-3 4.5.1).",
  "No remote control of fixed stations. May use repeaters set up by an Advanced holder, and operate cross-band repeaters (RIC-3 4.5.1).",
];

// ── The rules ───────────────────────────────────────────────────────────────

export const RULES_CA: CountryRadioRules = {
  country: "CA",
  regulator: ISED,
  regulatorUrl: ISED_RIC3.url,
  summary:
    "ISED issues the Amateur Radio Operator Certificate with the Basic Qualification, by exam; Basic alone gives the bands above 30 MHz. A Basic score of 80% or more (Honours), the Morse code qualification or the Advanced Qualification adds the bands below 30 MHz, and Advanced raises the power limit.",
  classes: [
    {
      id: "ca-basic",
      name: "Basic Qualification",
      how: "Pass the Basic exam: 100 questions, pass mark 70% (RIC-3 5.1). There is no age or nationality limit (RIC-3 7.1).",
      privileges: aboveThirtyMhz(BASIC_POWER),
      notes: [...BASIC_RIC3_NOTES, ...COMMON_NOTES],
      sources: [ISED_RBR4, ISED_RIC3],
    },
    {
      id: "ca-basic-honours",
      name: "Basic Qualification with Honours",
      how: "Score 80% or more on the Basic exam (RIC-3 5.1). A Basic certificate issued before 1 April 2002 has the same privileges (RIC-3 4.3).",
      privileges: [...belowThirtyMhz(BASIC_POWER), ...aboveThirtyMhz(BASIC_POWER)],
      notes: [...BASIC_RIC3_NOTES, ...COMMON_NOTES],
      sources: [ISED_RBR4, ISED_RIC3],
    },
    {
      id: "ca-basic-morse",
      name: "Basic and Morse Code (5 w.p.m.) Qualifications",
      how: "Hold the Basic Qualification and pass the Morse code exam: send and receive at 5 words per minute for three minutes (RIC-3 5.2).",
      privileges: [...belowThirtyMhz(BASIC_POWER), ...aboveThirtyMhz(BASIC_POWER)],
      notes: [...BASIC_RIC3_NOTES, ...COMMON_NOTES],
      sources: [ISED_RBR4, ISED_RIC3],
    },
    {
      id: "ca-advanced",
      name: "Basic and Advanced Qualifications",
      how: "Hold the Basic Qualification and pass the Advanced exam: 50 questions, pass mark 70% (RIC-3 5.3).",
      privileges: [...belowThirtyMhz(ADVANCED_POWER), ...aboveThirtyMhz(ADVANCED_POWER)],
      notes: [
        "May build and modify transmitting equipment, set up repeaters and club stations, and control fixed stations remotely, including by radio link (RIC-3 4.5.2).",
        "Visiting authorised foreign amateurs, including CEPT licence holders, operate with these privileges, but not beyond their own licence (RBR-4 3.2, RIC-3).",
        ...COMMON_NOTES,
      ],
      sources: [ISED_RBR4, ISED_RIC3],
    },
  ],
  licenceFree: [
    {
      name: "FRS and GMRS",
      frequencies: "462.5500 to 462.7250 MHz and 467.5625 to 467.7125 MHz, 22 channels",
      power: "2 W e.r.p. (0.5 W e.r.p. on channels 8 to 14)",
      licence: "No licence (licence-exempt certified radios, RSS-210).",
      note: "FRS radios have a fixed antenna. No scrambling or encryption, no telephone interconnection and no store-and-forward data. Short location and text data bursts are allowed. RSS-210 Issue 11 gives no repeater channels.",
      frequencyEntryId: "lf-frs-gmrs-ca",
      sources: [ISED_RSS210],
    },
    {
      name: "CB (27 MHz), the General Radio Service",
      frequencies: "26.965 to 27.405 MHz, 40 channels",
      power: "4 W carrier (AM and FM); 12 W PEP (SSB)",
      licence: "No licence or operator certificate, for certified equipment (RSS-236 3.3, RIC-18 6.1).",
      note: "Channel 9 is reserved for emergencies. Amplifiers (linears) are forbidden. RSS-236 Issue 2 added FM (F3E) to the permitted emissions.",
      frequencyEntryId: "lf-cb-ca",
      sources: [ISED_RSS236, ISED_RIC18],
    },
  ],
  notRead: [
    "The 902 to 928 MHz licence-exempt rules used by Meshtastic and LoRa in Canada (RSS-247) were not read.",
    "RSS-136 was asked for, but ISED's page for it returned not found; the Canadian CB standard read here is RSS-236.",
  ],
};
