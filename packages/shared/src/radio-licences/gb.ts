/**
 * United Kingdom: Ofcom's amateur radio licence (Foundation, Intermediate, Full) and the
 * licence-exempt services a household can use (PMR446, CB, short range devices at 433
 * and 868 MHz).
 *
 * The band tables are Schedule 1 of Ofcom's licence conditions booklet (OFW611, published
 * 21 February 2024, which carries the 2024 changes to the licence), row for row: where
 * Ofcom splits a band into parts with a different status or power, so does this file.
 * Powers are peak envelope power unless the booklet says ERP or EIRP. A row with no
 * airborne figure may not be used airborne (Schedule 1 note f).
 */
import type { FrequencySource } from "../radio-frequencies.ts";
import type { BandPrivilege, CountryRadioRules } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const OFCOM_BOOKLET: FrequencySource = {
  publisher: "Ofcom",
  title: "Amateur Radio Wireless Telegraphy Licence Conditions Booklet (OFW611), published 21 February 2024, Schedule 1",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/emf/emf-amateur-licence-terms-and-conditions.pdf",
  checked: CHECKED,
};
const OFCOM_GUIDANCE: FrequencySource = {
  publisher: "Ofcom",
  title: "Amateur radio guidance, updated 14 October 2025",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/manage-your-licence/amateur/amateur_radio_licence_guidance_for_licensees.pdf",
  checked: CHECKED,
};
const OFCOM_IR2030: FrequencySource = {
  publisher: "Ofcom",
  title: "UK Interface Requirement 2030, Licence exempt Short Range Devices, published 23 October 2026",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir-2030.pdf",
  checked: CHECKED,
};
const OFCOM_IR2027: FrequencySource = {
  publisher: "Ofcom",
  title: "UK Interface Requirement 2027, Citizens' Band (CB) radio, amended January 2018",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir_2027.pdf",
  checked: CHECKED,
};
const OFCOM_IR2027_2: FrequencySource = {
  publisher: "Ofcom",
  title: "UK Interface Requirement 2027.2, Citizens' Band (AM, SSB, DSB), June 2021",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir_2027.2.pdf",
  checked: CHECKED,
};

// ── Wording used in many rows ───────────────────────────────────────────────

const AIR = "500 mW EIRP airborne";
const NIB = "secondary, on the basis of non-interference to other services";
const NIB_ABROAD = "primary; non-interference to other services outside the UK and Crown Dependencies";
const ISM = "secondary; must accept interference from ISM users";
const NO_LONDON = "secondary; not within 100 km of Charing Cross, London";
const CONSENT = "secondary; only with Ofcom's written consent; must accept interference from ISM users";

function row(band: string, fromKhz: number, toKhz: number, power: string, note?: string): BandPrivilege {
  return note ? { band, fromKhz, toKhz, power, note } : { band, fromKhz, toKhz, power };
}

// ── Table A: Foundation ─────────────────────────────────────────────────────

const F25 = "25 W (13.98 dBW) PEP";
const F25A = `${F25}; ${AIR}`;

const FOUNDATION: BandPrivilege[] = [
  row("2200 m", 135.7, 137.8, "1 W (0 dBW) ERP", NIB),
  row("160 m", 1810, 1830, F25A, NIB_ABROAD),
  row("160 m", 1830, 1850, F25A, "primary"),
  row("160 m", 1850, 2000, F25, NIB),
  row("80 m", 3500, 3800, F25A, "primary, shared with other services"),
  row("40 m", 7000, 7100, F25A, "primary; satellite primary"),
  row("40 m", 7100, 7200, F25A, "primary"),
  row("30 m", 10100, 10150, F25, "secondary"),
  row("20 m", 14000, 14250, F25A, "primary; satellite primary"),
  row("20 m", 14250, 14350, F25A, "primary"),
  row("17 m", 18068, 18168, F25A, "primary; satellite primary"),
  row("15 m", 21000, 21450, F25A, "primary; satellite primary"),
  row("12 m", 24890, 24990, F25A, "primary; satellite primary"),
  row("10 m", 28000, 29700, F25A, "primary; satellite primary"),
  row("6 m", 50000, 51000, F25A, NIB_ABROAD),
  row("6 m", 51000, 52000, F25, NIB),
  row("4 m", 70000, 70500, F25, NIB),
  row("2 m", 144000, 146000, F25A, "primary; satellite primary"),
  row("70 cm", 430000, 431000, "25 W (13.98 dBW) ERP", "secondary"),
  row("70 cm", 431000, 432000, "25 W (13.98 dBW) ERP", NO_LONDON),
  row("70 cm", 432000, 435000, F25, "secondary"),
  row("70 cm", 435000, 438000, F25, "secondary; satellite secondary"),
  row("70 cm", 438000, 440000, F25, "secondary"),
  row("13 cm", 2400000, 2450000, "2 W (3 dBW) PEP", `${ISM}; satellite secondary`),
  row("6 cm", 5650000, 5670000, "2 W (3 dBW) PEP", "secondary; satellite Earth to space only"),
  row("6 cm", 5670000, 5680000, "2 W (3 dBW) PEP", "secondary"),
  row("6 cm", 5755000, 5765000, "2 W (3 dBW) PEP", ISM),
  row("6 cm", 5820000, 5830000, "2 W (3 dBW) PEP", ISM),
  row("3 cm", 10000000, 10125000, "1 W (0 dBW) PEP", "secondary"),
  row("3 cm", 10225000, 10450000, "1 W (0 dBW) PEP", "secondary"),
  row("3 cm", 10450000, 10475000, "1 W (0 dBW) PEP", "secondary; satellite secondary"),
  row("3 cm", 10475000, 10500000, "1 W (0 dBW) PEP", "amateur satellite only (secondary)"),
];

// ── Tables B and C share their bands from 1240 MHz up, apart from power ─────

/** Bands at 1240 MHz and above for Intermediate (`low` = 100 W) and Full (`low` = 400 W, `high` = 1000 W). */
function microwave(low: string, high: string): BandPrivilege[] {
  const highAir = `${high}; ${AIR}`;
  return [
    row("23 cm", 1240000, 1260000, low, "secondary"),
    row("23 cm", 1260000, 1270000, low, "secondary; satellite Earth to space only"),
    row("23 cm", 1270000, 1325000, low, "secondary"),
    row("13 cm", 2310000, 2350000, low, NIB),
    row("13 cm", 2390000, 2400000, low, NIB),
    row("13 cm", 2400000, 2450000, low, `${ISM}; satellite secondary`),
    row("9 cm", 3400000, 3410000, low, NIB),
    row("6 cm", 5650000, 5670000, low, "secondary; satellite Earth to space only"),
    row("6 cm", 5670000, 5680000, low, "secondary"),
    row("6 cm", 5755000, 5765000, low, ISM),
    row("6 cm", 5820000, 5830000, low, ISM),
    row("6 cm", 5830000, 5850000, low, `${ISM}; satellite space to Earth only`),
    row("3 cm", 10000000, 10125000, low, "secondary"),
    row("3 cm", 10225000, 10450000, low, "secondary"),
    row("3 cm", 10450000, 10475000, low, "secondary; satellite secondary"),
    row("3 cm", 10475000, 10500000, low, "amateur satellite only (secondary)"),
    row("24 GHz", 24000000, 24050000, highAir, "primary; must accept interference from ISM users; satellite primary"),
    row("24 GHz", 24050000, 24150000, low, CONSENT),
    row("24 GHz", 24150000, 24250000, low, "secondary"),
    row("47 GHz", 47000000, 47200000, highAir, "primary; satellite primary"),
    row("76 GHz", 75500000, 75875000, low, "secondary; satellite secondary"),
    row("76 GHz", 75875000, 76000000, highAir, "primary; satellite primary"),
    row("76 GHz", 76000000, 77500000, low, "secondary; satellite secondary"),
    row("76 GHz", 77500000, 78000000, highAir, "primary; satellite primary"),
    row("76 GHz", 78000000, 79000000, low, "secondary; satellite secondary"),
    row("76 GHz", 79000000, 81000000, low, "secondary; satellite secondary"),
    row("122 GHz", 122250000, 123000000, low, "secondary"),
    row("134 GHz", 134000000, 136000000, highAir, "primary; satellite primary"),
    row("134 GHz", 136000000, 141000000, low, "secondary; satellite secondary"),
    row("241 GHz", 241000000, 248000000, low, "secondary; satellite secondary"),
    row("241 GHz", 248000000, 250000000, highAir, "primary; satellite primary"),
  ];
}

// ── Table B: Intermediate ───────────────────────────────────────────────────

const I100 = "100 W (20 dBW) PEP";
const I100A = `${I100}; ${AIR}`;

const INTERMEDIATE: BandPrivilege[] = [
  row("2200 m", 135.7, 137.8, "1 W (0 dBW) ERP", NIB),
  row("160 m", 1810, 1830, I100A, NIB_ABROAD),
  row("160 m", 1830, 1850, I100A, "primary"),
  row("160 m", 1850, 2000, "32 W (15 dBW) PEP", NIB),
  row("80 m", 3500, 3800, I100A, "primary, shared with other services"),
  row("40 m", 7000, 7100, I100A, "primary; satellite primary"),
  row("40 m", 7100, 7200, I100A, "primary"),
  row("30 m", 10100, 10150, I100, "secondary"),
  row("20 m", 14000, 14250, I100A, "primary; satellite primary"),
  row("20 m", 14250, 14350, I100A, "primary"),
  row("17 m", 18068, 18168, I100A, "primary; satellite primary"),
  row("15 m", 21000, 21450, I100A, "primary; satellite primary"),
  row("12 m", 24890, 24990, I100A, "primary; satellite primary"),
  row("10 m", 28000, 29700, I100A, "primary; satellite primary"),
  row("6 m", 50000, 51000, I100A, NIB_ABROAD),
  row("6 m", 51000, 52000, I100, NIB),
  row("4 m", 70000, 70500, I100, NIB),
  row("2 m", 144000, 146000, I100A, "primary; satellite primary"),
  row("70 cm", 430000, 431000, "40 W (16 dBW) ERP", "secondary"),
  row("70 cm", 431000, 432000, "40 W (16 dBW) ERP", NO_LONDON),
  row("70 cm", 432000, 435000, I100, "secondary"),
  row("70 cm", 435000, 438000, I100, "secondary; satellite secondary"),
  row("70 cm", 438000, 440000, I100, "secondary"),
  ...microwave(I100, I100),
];

// ── Table C: Full ───────────────────────────────────────────────────────────

const K1 = "1000 W (30 dBW) PEP";
const K1A = `${K1}; ${AIR}`;
const W400 = "400 W (26 dBW) PEP";
const FIVE_MHZ_POWER = "100 W (20 dBW) PEP, not exceeding 200 W EIRP";
const FIVE_MHZ_NOTE = "secondary; non-interference to other services inside the UK and Crown Dependencies; see the 5 MHz conditions";

/** The eleven 5 MHz segments of Table C, in kHz. */
const FIVE_MHZ: Array<[number, number]> = [
  [5258.5, 5264],
  [5276, 5284],
  [5288.5, 5292],
  [5298, 5307],
  [5313, 5323],
  [5333, 5338],
  [5354, 5358],
  [5362, 5374.5],
  [5378, 5382],
  [5395, 5401.5],
  [5403.5, 5406.5],
];

const FULL: BandPrivilege[] = [
  row("2200 m", 135.7, 137.8, "1 W (0 dBW) ERP", NIB),
  row("630 m", 472, 479, "5 W (7 dBW) EIRP", "secondary"),
  row("160 m", 1810, 1830, K1A, NIB_ABROAD),
  row("160 m", 1830, 1850, K1A, "primary"),
  row("160 m", 1850, 2000, "32 W (15 dBW) PEP", NIB),
  row("80 m", 3500, 3800, K1A, "primary, shared with other services"),
  ...FIVE_MHZ.map(([from, to]) => row("60 m", from, to, FIVE_MHZ_POWER, FIVE_MHZ_NOTE)),
  row("40 m", 7000, 7100, K1A, "primary; satellite primary"),
  row("40 m", 7100, 7200, K1A, "primary"),
  row("30 m", 10100, 10150, W400, "secondary"),
  row("20 m", 14000, 14250, K1A, "primary; satellite primary"),
  row("20 m", 14250, 14350, K1A, "primary"),
  row("17 m", 18068, 18168, K1A, "primary; satellite primary"),
  row("15 m", 21000, 21450, K1A, "primary; satellite primary"),
  row("12 m", 24890, 24990, K1A, "primary; satellite primary"),
  row("10 m", 28000, 29700, K1A, "primary; satellite primary"),
  row("6 m", 50000, 51000, K1A, NIB_ABROAD),
  row("6 m", 51000, 52000, "100 W (20 dBW) PEP", NIB),
  row("4 m", 70000, 70500, "160 W (22 dBW) PEP", NIB),
  row("2 m", 144000, 146000, K1A, "primary; satellite primary"),
  row("70 cm", 430000, 431000, "40 W (16 dBW) ERP", "secondary"),
  row("70 cm", 431000, 432000, "40 W (16 dBW) ERP", NO_LONDON),
  row("70 cm", 432000, 435000, W400, "secondary"),
  row("70 cm", 435000, 438000, W400, "secondary; satellite secondary"),
  row("70 cm", 438000, 440000, W400, "secondary"),
  ...microwave(W400, K1),
];

// ── Notes that apply to every class ─────────────────────────────────────────

const COMMON_NOTES = [
  "Airborne use is allowed only in the bands with an airborne figure (500 mW EIRP), where amateur radio is the primary user. Elsewhere it is not permitted.",
  "Amateur radio is for self-training and leisure only, never commercial. Transmissions must not be encrypted to hide their meaning, and must be addressed to other amateurs, apart from in an emergency or to support a user service.",
  "Ofcom's guidance: above 10 W EIRP (6.1 W ERP) you must check, before transmitting, that the station keeps within the ICNIRP general public limits for electromagnetic fields.",
  "The licence lasts until it is revoked or surrendered. Ofcom may revoke it if you have not confirmed your details in the past five years, or if you hold more than one personal amateur licence.",
  "Anyone may use your station with your permission and under your direct supervision; you remain responsible.",
];

const FOUNDATION_NOTES = ["Beacons, gateways and data stations up to 5 W ERP are allowed. Repeaters are not.", ...COMMON_NOTES];

const INTERMEDIATE_NOTES = [
  "Repeaters up to 5 W ERP, above 28 MHz only. Beacons and data stations up to 25 W ERP with a call sign from the RSGB (or another body Ofcom names).",
  'A call sign beginning with "2" must carry a regional secondary locator as its second character ("E" for England, "M" for Scotland, "W" for Wales, "I" for Northern Ireland).',
  "Ofcom's guidance (October 2025) says Intermediate holders may also run repeaters of 5 to 25 W ERP; the licence conditions booklet gives that only to Full licences.",
  ...COMMON_NOTES,
];

const FULL_NOTES = [
  "5 MHz (60 m) conditions: double sideband at most 6 kHz wide; at most 200 W EIRP; antenna no higher than 20 m above ground; you must not interfere with the Ministry of Defence and must close down if you do; only at the main station address or a temporary location in the UK or Crown Dependencies, giving your location every 30 minutes to within 5 km when away; you must be reachable by a telephone close by.",
  "Repeaters above 28 MHz up to 25 W ERP, and beacons and data stations up to 25 W ERP, with a call sign from the RSGB (or another body Ofcom names).",
  "Ofcom's guidance: 70.5 to 71.5 MHz, 146 to 147 MHz and frequencies above 275 GHz are available by applying for a notice of variation.",
  "Only the Full licence is a HAREC-level licence for operating abroad under CEPT arrangements.",
  ...COMMON_NOTES,
];

// ── The rules ───────────────────────────────────────────────────────────────

export const RULES_GB: CountryRadioRules = {
  country: "GB",
  regulator: "Ofcom",
  regulatorUrl: "https://www.ofcom.org.uk/spectrum/radio-equipment/amateur-radio-info",
  summary:
    "Ofcom issues three levels of amateur licence: Foundation, Intermediate and Full. Each needs an exam run by the RSGB; the higher levels give more bands and more power. The licence is free to apply for online.",
  classes: [
    {
      id: "gb-foundation",
      name: "Foundation",
      how: "Pass the Foundation exam (run by the RSGB), then apply to Ofcom online with your candidate number. It is free.",
      privileges: FOUNDATION,
      notes: FOUNDATION_NOTES,
      sources: [OFCOM_BOOKLET, OFCOM_GUIDANCE],
    },
    {
      id: "gb-intermediate",
      name: "Intermediate",
      how: "Pass the Intermediate exam (run by the RSGB), then apply to Ofcom online with your candidate number. It is free.",
      privileges: INTERMEDIATE,
      notes: INTERMEDIATE_NOTES,
      sources: [OFCOM_BOOKLET, OFCOM_GUIDANCE],
    },
    {
      id: "gb-full",
      name: "Full",
      how: "Pass the Full exam (run by the RSGB), then apply to Ofcom online with your candidate number. It is free.",
      privileges: FULL,
      notes: FULL_NOTES,
      sources: [OFCOM_BOOKLET, OFCOM_GUIDANCE],
    },
  ],
  licenceFree: [
    {
      name: "PMR446",
      frequencies: "446.0 to 446.2 MHz",
      power: "500 mW e.r.p.",
      licence: "No licence",
      note: "Hand-portable radios with integral antennas only: no base station, repeater or network use, and not airborne (IR 2030/34).",
      frequencyEntryId: "lf-pmr446-analogue",
      sources: [OFCOM_IR2030],
    },
    {
      name: "CB (27 MHz), UK channels",
      frequencies: "27.60125 to 27.99125 MHz, 40 channels, 10 kHz apart, FM only",
      power: "4 W (carrier output; also e.r.p. where the antenna is integral)",
      licence: "No licence",
      note: "Single-frequency simplex. Equipment must meet IR 2027. The UK channels are for the UK only.",
      frequencyEntryId: "lf-cb-uk",
      sources: [OFCOM_IR2027],
    },
    {
      name: "CB (27 MHz), CEPT channels",
      frequencies: "26.965 to 27.405 MHz, 40 channels, 10 kHz apart; FM, AM and SSB",
      power: "FM 4 W (carrier output); AM 4 W e.r.p. (r.m.s.); SSB 12 W e.r.p. (PEP)",
      licence: "No licence",
      note: "FM is under IR 2027, AM and SSB under IR 2027.2 (26.960 to 27.410 MHz band). Ofcom: CB is not afforded any protection against interference.",
      frequencyEntryId: "lf-cb-cept",
      sources: [OFCOM_IR2027, OFCOM_IR2027_2],
    },
    {
      name: "Short range devices at 868 MHz (LoRa, Meshtastic)",
      frequencies: "868.0 to 868.6 MHz; 869.40 to 869.65 MHz",
      power: "868.0 to 868.6 MHz: 25 mW e.r.p.; 869.40 to 869.65 MHz: 500 mW e.r.p.",
      licence: "No licence",
      note: "Duty cycle at most 1 per cent (868.0 to 868.6 MHz) or 10 per cent (869.40 to 869.65 MHz), unless the device uses the spectrum access techniques in the standards (IR 2030/1/16 and 1/19). IR 2030 names no products; it is the band LoRa mesh radios sold for Europe use.",
      sources: [OFCOM_IR2030],
    },
    {
      name: "Short range devices at 433 MHz (LPD433)",
      frequencies: "433.05 to 434.79 MHz",
      power: "10 mW e.r.p.",
      licence: "No licence",
      note: "Duty cycle at most 10 per cent (IR 2030/1/10), or up to 100 per cent from 434.04 to 434.79 MHz with 25 kHz bandwidth or less (IR 2030/1/12).",
      frequencyEntryId: "lf-lpd433",
      sources: [OFCOM_IR2030],
    },
  ],
  notRead: [
    "Ofcom's Notice of Coordination (Table 2), which restricts repeaters, gateways, beacons and data stations in some bands, was not read.",
    "Ofcom's PMR446 information sheet was not read again for this page; the PMR446 figures are from IR 2030.",
  ],
};
