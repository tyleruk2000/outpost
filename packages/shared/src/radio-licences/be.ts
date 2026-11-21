/**
 * Belgium: the three classes of radio amateur operator's certificate (A, B and C) and the
 * licence-free services, as the Belgian Institute for Postal Services and
 * Telecommunications (BIPT) gives them.
 *
 * Bands, powers and status are from Annex 2 of the BIPT Council decision of 24 May 2019
 * on the frequencies, powers and transmission modes radio amateurs may use (read in Dutch,
 * and in BIPT's English extract of the table, revised June 2025), plus the BIPT Council
 * decision of 29 August 2023 opening 40.66 to 40.69 MHz to class A. Power is the maximum
 * transmitter power the table allows, except where it says ERP or EIRP. Licence-free
 * services are from BIPT's page on free use of radio.
 */
import type { CountryRadioRules, RadioRulesSource } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const BESLUIT_2019: RadioRulesSource = {
  publisher: "Belgian Institute for Postal Services and Telecommunications (BIPT)",
  title:
    "Besluit van de Raad van het BIPT van 24 mei 2019 betreffende de frequenties, vermogens en transmissiemodi die mogen worden gebruikt door de radioamateurs: sections 3 and 6 and Bijlage 2",
  url: "https://www.bipt.be/file/cc73d96153bbd5448a56f19d925d05b1379c7f21/ba05ea9d3611d44667462d979daa834bca246b0c/2019-05-24-ram-besluit.pdf",
  checked: CHECKED,
};
const FREQ_EN: RadioRulesSource = {
  publisher: "Belgian Institute for Postal Services and Telecommunications (BIPT)",
  title:
    "Frequency bands and technical characteristics authorised for radio amateurs (extract from the BIPT Council Decision of 24 May 2019), English, file dated 19 June 2025",
  url: "https://www.bipt.be/file/cc73d96153bbd5448a56f19d925d05b1379c7f21/dd6ba0d4094625ded08277255de9ac1143f4976c/freq-en.pdf?name=Freq-EN.pdf&type=application/pdf",
  checked: CHECKED,
};
const BESLUIT_40MHZ: RadioRulesSource = {
  publisher: "Belgian Institute for Postal Services and Telecommunications (BIPT)",
  title:
    "Besluit van de Raad van het BIPT van 29 augustus 2023 inzake toewijzing van het spectrum 40,660 MHz – 40,690 MHz aan private radiostations voor individuele opleiding, technische berichtenwisseling en studies, gebruikt door radioamateurs (copy of the BIPT decision hosted by the UBA, as BIPT's own page returned 404)",
  url: "https://www.uba.be/sites/default/files/media/files/20230829_decision-spectrum-40mhz-nl.pdf",
  checked: CHECKED,
};
const BIPT_RADIOAMATEURS: RadioRulesSource = {
  publisher: "Belgian Institute for Postal Services and Telecommunications (BIPT)",
  title: "Radio amateurs (the regulator's page)",
  url: "https://bipt.be/consumers/radio-frequencies/private-use-hobby/radioamateurs",
  checked: CHECKED,
};
const BIPT_EXAMS: RadioRulesSource = {
  publisher: "Belgian Institute for Postal Services and Telecommunications (BIPT)",
  title: "FAQ: Which exam can I take? Are there different types of exams?",
  url: "https://bipt.be/consumers/faq/which-exam-can-i-take-are-there-different-types-of-exams",
  checked: CHECKED,
};
const BIPT_FREE_USE: RadioRulesSource = {
  publisher: "Belgian Institute for Postal Services and Telecommunications (BIPT)",
  title: "Free use of radio (CB and PMR-446)",
  url: "https://www.bipt.be/consumers/radio-frequencies/private-use-hobby/free-use-of-radio",
  checked: CHECKED,
};

// ── The rules ───────────────────────────────────────────────────────────────

const PEX = "primary and exclusive";
const ON_160_SHARED =
  "secondary; must not interfere with stations of a primary or secondary service and has no protection from primary stations";

export const RULES_BE: CountryRadioRules = {
  country: "BE",
  regulator: "Belgian Institute for Postal Services and Telecommunications (BIPT)",
  regulatorUrl: BIPT_RADIOAMATEURS.url,
  summary:
    "Radio amateurs pass an exam at the BIPT in Brussels for an operator's certificate, valid for five years with a call sign, and also need a station authorisation. There are three classes: A (HAREC), B (novice) and C (basic).",
  classes: [
    {
      id: "be-a",
      name: "Class A operator's certificate (HAREC)",
      how: "Pass examination A at the BIPT: 48 multiple-choice questions (30 technical, 10 legislation, 8 procedures), at least 50 % in each part. Call signs start ON1, ON4, ON5, ON6, ON7, ON8 or ON9.",
      privileges: [
        { band: "2200 m", fromKhz: 135.7, toKhz: 137.8, power: "1 W ERP", note: "secondary" },
        { band: "630 m", fromKhz: 472, toKhz: 479, power: "5 W EIRP", note: "secondary" },
        { band: "600 m", fromKhz: 501, toKhz: 504, power: "5 W EIRP", note: "secondary; A1A only; bandwidth at most 100 Hz" },
        { band: "160 m", fromKhz: 1810, toKhz: 1830, power: "1500 W", note: ON_160_SHARED },
        { band: "160 m", fromKhz: 1830, toKhz: 1850, power: "1500 W", note: PEX },
        { band: "160 m", fromKhz: 1850, toKhz: 2000, power: "150 W", note: "secondary" },
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: "1500 W", note: "primary" },
        { band: "60 m", fromKhz: 5351.5, toKhz: 5366.5, power: "15 W ERP", note: "secondary" },
        { band: "40 m", fromKhz: 7000, toKhz: 7100, power: "1500 W", note: PEX },
        { band: "40 m", fromKhz: 7100, toKhz: 7200, power: "1500 W", note: "secondary" },
        { band: "30 m", fromKhz: 10100, toKhz: 10150, power: "1500 W", note: "secondary" },
        { band: "20 m", fromKhz: 14000, toKhz: 14350, power: "1500 W", note: PEX },
        { band: "17 m", fromKhz: 18068, toKhz: 18168, power: "1500 W", note: PEX },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: "1500 W", note: PEX },
        { band: "12 m", fromKhz: 24890, toKhz: 24990, power: "1500 W", note: PEX },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: "1500 W", note: PEX },
        {
          band: "8 m",
          fromKhz: 40660,
          toKhz: 40690,
          power: "5 W ERP",
          note: "secondary; only with an individual permission from the BIPT (an annex to the station authorisation, renewed each calendar year); A1A, F3E, J2D, J2B and J3E only; log to be sent to the BIPT each year",
        },
        { band: "6 m", fromKhz: 50000, toKhz: 52000, power: "200 W", note: "secondary" },
        { band: "4 m", fromKhz: 69950, toKhz: 69950, power: "10 W EIRP", note: "secondary; bandwidth at most 10 kHz" },
        { band: "4 m", fromKhz: 70112.5, toKhz: 70412.5, power: "50 W", note: "secondary" },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "1500 W", note: PEX },
        { band: "70 cm", fromKhz: 430000, toKhz: 433050, power: "1500 W", note: "primary" },
        {
          band: "70 cm",
          fromKhz: 433050,
          toKhz: 434790,
          power: "200 W",
          note: "primary; ATV and DATV limited to 200 W EIRP",
        },
        {
          band: "70 cm",
          fromKhz: 434790,
          toKhz: 440000,
          power: "1500 W",
          note: "primary; satellite use allowed on 435 to 438 MHz if it causes no harmful interference",
        },
        {
          band: "23 cm",
          fromKhz: 1240000,
          toKhz: 1270000,
          power: "200 W",
          note: "secondary; satellite use on 1260 to 1270 MHz, Earth to space only",
        },
        { band: "23 cm", fromKhz: 1270000, toKhz: 1300000, power: "200 W", note: "secondary; ATV and DATV limited to 20 W ERP" },
        {
          band: "13 cm",
          fromKhz: 2300000,
          toKhz: 2450000,
          power: "200 W",
          note: "secondary; satellite use allowed on 2400 to 2450 MHz; interference from ISM applications must be accepted",
        },
        {
          band: "6 cm",
          fromKhz: 5650000,
          toKhz: 5725000,
          power: "200 W",
          note: "secondary; satellite use on 5650 to 5670 MHz, Earth to space only",
        },
        {
          band: "6 cm",
          fromKhz: 5725000,
          toKhz: 5850000,
          power: "200 W",
          note: "secondary; interference from ISM applications must be accepted",
        },
        { band: "3 cm", fromKhz: 10000000, toKhz: 10450000, power: "200 W", note: "secondary" },
        { band: "3 cm", fromKhz: 10450000, toKhz: 10500000, power: "200 W", note: "secondary" },
        {
          band: "1.2 cm",
          fromKhz: 24000000,
          toKhz: 24050000,
          power: "200 W",
          note: `${PEX}; interference from ISM applications must be accepted`,
        },
        {
          band: "1.2 cm",
          fromKhz: 24050000,
          toKhz: 24250000,
          power: "200 W",
          note: "secondary; interference from ISM applications must be accepted",
        },
        { band: "6 mm", fromKhz: 47000000, toKhz: 47200000, power: "200 W", note: PEX },
        { band: "4 mm", fromKhz: 75500000, toKhz: 76000000, power: "200 W", note: "primary" },
        { band: "4 mm", fromKhz: 76000000, toKhz: 81000000, power: "200 W", note: "secondary" },
        { band: "2.5 mm", fromKhz: 122250000, toKhz: 123000000, power: "200 W", note: "secondary" },
        { band: "2 mm", fromKhz: 142000000, toKhz: 144000000, power: "200 W", note: PEX },
        { band: "2 mm", fromKhz: 144000000, toKhz: 149000000, power: "200 W", note: "secondary" },
        { band: "1 mm", fromKhz: 241000000, toKhz: 248000000, power: "200 W", note: "secondary" },
        { band: "1 mm", fromKhz: 248000000, toKhz: 250000000, power: "200 W", note: PEX },
      ],
      notes: [
        "All classes of emission are allowed except where a row says otherwise.",
        "Only class A holders may build their own equipment.",
        "Equipment held may be rated up to 3 dB above the highest power allowed in any of its bands, but must never transmit more than the table allows.",
        "Satellite communication between amateurs is allowed, with the same status, on 7.0 to 7.1, 14.0 to 14.25 MHz, the whole of 17, 15, 12, 10 and 2 m, 5830 to 5850 MHz, 10.45 to 10.5, 24.0 to 24.05, 47.0 to 47.2, 75.5 to 81, 122.25 to 123, 142 to 149 and 241 to 250 GHz.",
        "The BIPT may grant a temporary authorisation for higher power for exceptional experiments that are well justified and limited in time.",
      ],
      sources: [BESLUIT_2019, FREQ_EN, BESLUIT_40MHZ, BIPT_RADIOAMATEURS, BIPT_EXAMS],
    },
    {
      id: "be-b",
      name: "Class B operator's certificate (novice)",
      how: "Pass examination B at the BIPT: 38 multiple-choice questions (20 technical, 10 legislation, 8 procedures), at least 50 % in each part. Call signs start ON2.",
      privileges: [
        { band: "160 m", fromKhz: 1810, toKhz: 1830, power: "100 W", note: ON_160_SHARED },
        { band: "160 m", fromKhz: 1830, toKhz: 1850, power: "100 W", note: PEX },
        { band: "160 m", fromKhz: 1850, toKhz: 2000, power: "100 W", note: "secondary" },
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: "100 W", note: "primary" },
        { band: "40 m", fromKhz: 7000, toKhz: 7100, power: "100 W", note: PEX },
        { band: "40 m", fromKhz: 7100, toKhz: 7200, power: "100 W", note: "secondary" },
        { band: "30 m", fromKhz: 10100, toKhz: 10150, power: "100 W", note: "secondary" },
        { band: "20 m", fromKhz: 14000, toKhz: 14350, power: "100 W", note: PEX },
        { band: "17 m", fromKhz: 18068, toKhz: 18168, power: "100 W", note: PEX },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: "100 W", note: PEX },
        { band: "12 m", fromKhz: 24890, toKhz: 24990, power: "100 W", note: PEX },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: "100 W", note: PEX },
        { band: "6 m", fromKhz: 50000, toKhz: 52000, power: "100 W", note: "secondary" },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "50 W", note: PEX },
        {
          band: "70 cm",
          fromKhz: 430000,
          toKhz: 440000,
          power: "50 W",
          note: "primary; satellite use allowed on 435 to 438 MHz if it causes no harmful interference",
        },
      ],
      notes: [
        "All classes of emission are allowed except ATV and D-ATV.",
        "Equipment held may be rated up to 3 dB above the power allowed, but must never transmit more than the table allows. Class B holders may not build their own equipment.",
        "Class B matches the novice licence of CEPT ECC Recommendation (05)06.",
      ],
      sources: [BESLUIT_2019, FREQ_EN, BIPT_RADIOAMATEURS, BIPT_EXAMS],
    },
    {
      id: "be-c",
      name: "Class C operator's certificate (basic)",
      how: "Hold a certificate from a practical test run by a radio amateur association the BIPT recognises, then pass examination C at the BIPT: 30 multiple-choice questions, 80 % to pass. Call signs start ON3.",
      privileges: [
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: "25 W", note: "primary" },
        { band: "40 m", fromKhz: 7000, toKhz: 7100, power: "25 W", note: PEX },
        { band: "40 m", fromKhz: 7100, toKhz: 7200, power: "25 W", note: "secondary" },
        { band: "30 m", fromKhz: 10100, toKhz: 10150, power: "25 W", note: "secondary" },
        { band: "20 m", fromKhz: 14000, toKhz: 14350, power: "25 W", note: PEX },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: "25 W", note: PEX },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: "25 W", note: PEX },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "50 W", note: PEX },
        {
          band: "70 cm",
          fromKhz: 430000,
          toKhz: 440000,
          power: "50 W",
          note: "primary; satellite use allowed on 435 to 438 MHz if it causes no harmful interference",
        },
      ],
      notes: [
        "All classes of emission are allowed except ATV and D-ATV.",
        "Class C holders may hold equipment of up to 100 W, but may not use or hold external power amplifiers.",
        "Class C matches the basic licence of CEPT ECC Report 89; few other countries recognise it.",
      ],
      sources: [BESLUIT_2019, FREQ_EN, BIPT_RADIOAMATEURS, BIPT_EXAMS],
    },
  ],
  licenceFree: [
    {
      name: "CB (27 MHz)",
      frequencies: "27 MHz band: 40 channels (FM, or AM, FM and SSB), or 22 channels (AM, FM and SSB)",
      power: "40 channels FM: 4 W; 40 channels AM-FM: 4 W, SSB: 12 W; 22 channels AM-FM-SSB: 0.5 W",
      licence: "No licence; free to use since 1 January 2010 if the radio meets these conditions.",
      note: "Radios must carry the CE marking. Other radios, such as 80-channel sets, are forbidden, and so are gain antennas and data transmission.",
      frequencyEntryId: "lf-cb-cept",
      sources: [BIPT_FREE_USE],
    },
    {
      name: "PMR446 (analogue)",
      frequencies: "8 channels in 446.0 to 446.1 MHz, or 16 channels in 446.0 to 446.2 MHz",
      power: "0.5 W",
      licence: "No licence; free to use since 1 January 2010 if the radio meets these conditions.",
      note: "Radios over 0.5 W are forbidden. The antenna must be built in, with no cable to the radio, and the radio must run on an internal battery. CE marking required.",
      frequencyEntryId: "lf-pmr446-analogue",
      sources: [BIPT_FREE_USE],
    },
    {
      name: "PMR446 (digital)",
      frequencies: "8 or 16 channels in 446.1 to 446.2 MHz, or 16 or 32 channels in 446.0 to 446.2 MHz",
      power: "0.5 W",
      licence: "No licence; free to use since 1 January 2010 if the radio meets these conditions.",
      note: "Same conditions as analogue PMR446: built-in antenna, internal battery, CE marking.",
      frequencyEntryId: "lf-pmr446-digital",
      sources: [BIPT_FREE_USE],
    },
  ],
  notRead: [
    "The royal decree of 18 December 2009 on private radio communications (as amended on 14 December 2018), which defines the three certificate classes, was not read on ejustice.just.fgov.be; the classes here are as the BIPT decision of 24 May 2019 and the BIPT's pages describe them.",
    "BIPT's own page for the 29 August 2023 decision on 40.66 to 40.69 MHz returned 404; the decision was read from the copy the UBA (the national amateur society) hosts.",
    "The BIPT decision of 19 January 2021 on the rules for radio amateur tests and examinations was not read; the exam details are from the BIPT's FAQ. Whether class B also needs a practical test was not confirmed.",
    "The CB page gives the 27 MHz band and channel counts but not the channel frequencies; BIPT's radio interface documents for CB and PMR446, and for short range devices (433 and 868 MHz), were not read.",
    "No later amendment of the 24 May 2019 decision was found; BIPT's English extract of the table (June 2025) matches it.",
  ],
};
