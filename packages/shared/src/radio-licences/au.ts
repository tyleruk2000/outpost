/**
 * Australia: amateur qualifications (Foundation, Standard, Advanced) and licence-free
 * services, from the ACMA's instruments on the Federal Register of Legislation.
 *
 * Since 19 February 2024 most amateur operation is authorised by the Radiocommunications
 * (Amateur Stations) Class Licence 2023: a qualified person needs no licence in their own
 * name. The band tables below are its Schedule 2 (tables A, B and C). Power is given in
 * the regulator's own terms: pX, pY and pZ are defined in the Radiocommunications
 * (Interpretation) Determination 2015, which was not read here.
 */
import type { CountryRadioRules, RadioRulesSource } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

const ACMA_AMATEUR_CL_2023: RadioRulesSource = {
  publisher: "Australian Communications and Media Authority (Federal Register of Legislation)",
  title:
    "Radiocommunications (Amateur Stations) Class Licence 2023, F2023L01648 (as made, in force from 19 February 2024; no compilations)",
  url: "https://www.legislation.gov.au/F2023L01648/asmade/2023-12-12/text/original/pdf",
  checked: CHECKED,
};
const ACMA_CB_2025: RadioRulesSource = {
  publisher: "Australian Communications and Media Authority (Federal Register of Legislation)",
  title: "Radiocommunications (Citizen Band Radio Stations) Class Licence 2025, F2025L01088",
  url: "https://www.legislation.gov.au/F2025L01088/asmade/2025-09-15/text/original/pdf",
  checked: CHECKED,
};
const ACMA_LIPD_2025: RadioRulesSource = {
  publisher: "Australian Communications and Media Authority (Federal Register of Legislation)",
  title: "Radiocommunications (Low Interference Potential Devices) Class Licence 2025, F2025L01047 (in force from 1 October 2025)",
  url: "https://www.legislation.gov.au/F2025L01047/asmade/2025-09-05/text/original/pdf",
  checked: CHECKED,
};

// Schedule 2 column 3 limitations, in a few words.
const PSD_8K = "Above 8 kHz bandwidth, at most 1 W per 100 kHz";
const MAX_8K = "Bandwidth at most 8 kHz";
const PSD_16K = "Above 16 kHz bandwidth, at most 1 W per 100 kHz";
const MAX_100K = "Bandwidth at most 100 kHz";

const FOUNDATION_POWER = "10 W pX";
const STANDARD_POWER = "100 W pX (J3E or R3E); 30 W pY otherwise";
const STANDARD_POWER_6M = "100 W pX (C3F, J3E or R3E); 30 W pY otherwise";
const ADVANCED_POWER = "400 W pX (C3F, J3E or R3E); 120 W pY otherwise";

const CLASS_NOTES = [
  "The class licence covers anyone who holds an ACMA recognition certificate or a recognised qualification, and anyone they supervise. There is no licence in your own name.",
  "Give your call sign at the start and end of each transmission, and at least every 10 minutes during a long one (every 30 minutes in emergency services operations or training).",
  "Repeaters and beacons are not covered: they need a transmitter licence.",
  "Encoding to hide the meaning is not allowed, except to control a satellite or an unattended station, or in emergency services operations and training.",
  "A station left running unattended must be in an automatic or computer controlled mode, with a timer that shuts it down after 10 minutes of unintended transmission.",
  "No operation in the Western Australia radio quiet zone, or on frequencies and in areas covered by a spectrum licence.",
];

export const RULES_AU: CountryRadioRules = {
  country: "AU",
  regulator: "Australian Communications and Media Authority",
  regulatorUrl: "https://www.acma.gov.au/amateur-class-licence",
  summary:
    "The ACMA authorises amateur operation through a class licence, by qualification: Foundation, Standard or Advanced. You need an ACMA recognition certificate or a recognised qualification, and a call sign.",
  classes: [
    {
      id: "au-foundation",
      name: "Foundation",
      how: "Pass an examination with an ACMA accredited assessor and get an ACMA recognition certificate (Foundation).",
      privileges: [
        { band: "80 m", fromKhz: 3500, toKhz: 3700, power: FOUNDATION_POWER, note: PSD_8K },
        { band: "40 m", fromKhz: 7000, toKhz: 7100, power: FOUNDATION_POWER, note: PSD_8K },
        { band: "40 m", fromKhz: 7100, toKhz: 7300, power: FOUNDATION_POWER, note: MAX_8K },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: FOUNDATION_POWER, note: PSD_8K },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: FOUNDATION_POWER, note: PSD_16K },
        { band: "2 m", fromKhz: 144000, toKhz: 148000, power: FOUNDATION_POWER },
        { band: "70 cm", fromKhz: 430000, toKhz: 450000, power: FOUNDATION_POWER },
      ],
      notes: CLASS_NOTES,
      sources: [ACMA_AMATEUR_CL_2023],
    },
    {
      id: "au-standard",
      name: "Standard",
      how: "Pass an examination with an ACMA accredited assessor and get an ACMA recognition certificate (Standard).",
      privileges: [
        { band: "80 m", fromKhz: 3500, toKhz: 3700, power: STANDARD_POWER, note: PSD_8K },
        { band: "40 m", fromKhz: 7000, toKhz: 7100, power: STANDARD_POWER, note: PSD_8K },
        { band: "40 m", fromKhz: 7100, toKhz: 7300, power: STANDARD_POWER, note: MAX_8K },
        { band: "20 m", fromKhz: 14000, toKhz: 14350, power: STANDARD_POWER, note: PSD_8K },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: STANDARD_POWER, note: PSD_8K },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: STANDARD_POWER, note: PSD_16K },
        { band: "6 m", fromKhz: 50000, toKhz: 52000, power: STANDARD_POWER_6M, note: MAX_100K },
        { band: "6 m", fromKhz: 52000, toKhz: 54000, power: STANDARD_POWER },
        { band: "2 m", fromKhz: 144000, toKhz: 148000, power: STANDARD_POWER },
        { band: "70 cm", fromKhz: 430000, toKhz: 450000, power: STANDARD_POWER },
        { band: "23 cm", fromKhz: 1240000, toKhz: 1300000, power: STANDARD_POWER },
        { band: "13 cm", fromKhz: 2400000, toKhz: 2450000, power: STANDARD_POWER },
        { band: "6 cm", fromKhz: 5650000, toKhz: 5850000, power: STANDARD_POWER },
      ],
      notes: CLASS_NOTES,
      sources: [ACMA_AMATEUR_CL_2023],
    },
    {
      id: "au-advanced",
      name: "Advanced",
      how: "Pass an examination with an ACMA accredited assessor and get an ACMA recognition certificate (Advanced).",
      privileges: [
        { band: "2200 m", fromKhz: 135.7, toKhz: 137.8, power: "1 W pX EIRP", note: "Bandwidth at most 2.1 kHz" },
        { band: "630 m", fromKhz: 472, toKhz: 479, power: "5 W pX EIRP", note: "Bandwidth at most 3 kHz" },
        { band: "160 m", fromKhz: 1800, toKhz: 1875, power: ADVANCED_POWER, note: PSD_8K },
        { band: "80 m", fromKhz: 3500, toKhz: 3700, power: ADVANCED_POWER, note: PSD_8K },
        { band: "80 m", fromKhz: 3776, toKhz: 3800, power: ADVANCED_POWER, note: MAX_8K },
        { band: "40 m", fromKhz: 7000, toKhz: 7100, power: ADVANCED_POWER, note: PSD_8K },
        { band: "40 m", fromKhz: 7100, toKhz: 7300, power: ADVANCED_POWER, note: MAX_8K },
        { band: "30 m", fromKhz: 10100, toKhz: 10150, power: ADVANCED_POWER, note: MAX_8K },
        { band: "20 m", fromKhz: 14000, toKhz: 14350, power: ADVANCED_POWER, note: PSD_8K },
        { band: "17 m", fromKhz: 18068, toKhz: 18168, power: ADVANCED_POWER, note: PSD_8K },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: ADVANCED_POWER, note: PSD_8K },
        { band: "12 m", fromKhz: 24890, toKhz: 24990, power: ADVANCED_POWER, note: PSD_8K },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: ADVANCED_POWER, note: PSD_16K },
        { band: "6 m", fromKhz: 50000, toKhz: 52000, power: ADVANCED_POWER, note: MAX_100K },
        { band: "6 m", fromKhz: 52000, toKhz: 54000, power: ADVANCED_POWER },
        { band: "2 m", fromKhz: 144000, toKhz: 148000, power: ADVANCED_POWER },
        { band: "70 cm", fromKhz: 430000, toKhz: 450000, power: ADVANCED_POWER },
        { band: "23 cm", fromKhz: 1240000, toKhz: 1300000, power: ADVANCED_POWER },
        { band: "13 cm", fromKhz: 2300000, toKhz: 2302000, power: ADVANCED_POWER },
        { band: "13 cm", fromKhz: 2400000, toKhz: 2450000, power: ADVANCED_POWER },
        { band: "9 cm", fromKhz: 3300000, toKhz: 3400000, power: ADVANCED_POWER },
        {
          band: "9 cm",
          fromKhz: 3400000,
          toKhz: 3600000,
          power: ADVANCED_POWER,
          note: "Not in the areas listed in Schedule 3 of the class licence",
        },
        { band: "6 cm", fromKhz: 5650000, toKhz: 5850000, power: ADVANCED_POWER },
        { band: "3 cm", fromKhz: 10000000, toKhz: 10500000, power: ADVANCED_POWER },
        { band: "12 mm", fromKhz: 24000000, toKhz: 24250000, power: ADVANCED_POWER },
        { band: "6 mm", fromKhz: 47000000, toKhz: 47200000, power: ADVANCED_POWER },
        { band: "4 mm", fromKhz: 76000000, toKhz: 81000000, power: ADVANCED_POWER },
        { band: "2.5 mm", fromKhz: 122250000, toKhz: 123000000, power: ADVANCED_POWER },
        { band: "2 mm", fromKhz: 134000000, toKhz: 141000000, power: ADVANCED_POWER },
        { band: "1 mm", fromKhz: 241000000, toKhz: 250000000, power: ADVANCED_POWER },
      ],
      notes: CLASS_NOTES,
      sources: [ACMA_AMATEUR_CL_2023],
    },
  ],
  licenceFree: [
    {
      name: "UHF CB",
      frequencies: "476.425 to 477.4125 MHz: 80 channels of 12.5 kHz, or 40 channels of 25 kHz on older sets",
      power: "5 W pZ (transmitter power); channels 22 and 23 also 8.3 W EIRP",
      licence: "No licence: the Citizen Band Radio Stations Class Licence 2025 covers anyone using a compliant set.",
      note: "Channels 5 and 35 are for emergencies only. Channels 22 and 23 are for telemetry and data, at most 10 seconds an hour. Repeaters are licensed separately.",
      frequencyEntryId: "lf-uhf-cb-au",
      sources: [ACMA_CB_2025],
    },
    {
      name: "CB (27 MHz)",
      frequencies: "26.965 to 27.405 MHz, 40 channels",
      power: "4 W pZ (AM or FM); 12 W pX (SSB)",
      licence: "No licence: the Citizen Band Radio Stations Class Licence 2025 covers anyone using a compliant set.",
      note: "Channel 9 (27.065 MHz) is for emergencies only. Channel 16 is lower sideband only.",
      frequencyEntryId: "lf-cb-au-hf",
      sources: [ACMA_CB_2025],
    },
    {
      name: "Low power devices, 915 to 928 MHz (LoRa, Meshtastic)",
      frequencies: "915 to 928 MHz",
      power: "1 W EIRP (frequency hopping on at least 20 frequencies, or digital modulation at most 25 mW per 3 kHz); 3 mW EIRP otherwise",
      licence: "No licence: the Low Interference Potential Devices Class Licence 2025 covers compliant devices.",
      note: "A receiver gets no protection from interference by other devices, nor from industrial, scientific and medical uses in 918 to 926 MHz.",
      sources: [ACMA_LIPD_2025],
    },
  ],
  notRead: [
    "The Radiocommunications (Interpretation) Determination 2015, which defines pX, pY and pZ, was not read; the power figures keep the instruments' own terms.",
    "Amateur licences issued before 19 February 2024 still run under the Radiocommunications Licence Conditions (Amateur Licence) Determination 2025 (F2025L01087), whose Schedule 1 was read only in part. The ACMA expects the last of them to expire in June 2028. The figures above are the class licence's.",
    "The ACMA's own web pages on how to sit the examinations were not read, so the class descriptions say only what the class licence says.",
  ],
};
