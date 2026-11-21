/**
 * Switzerland: the two kinds of amateur certificate (CEPT, call signs HB9, and NOVICE,
 * call signs HB3) and the licence-free services, as the Federal Office of Communications
 * (OFCOM, BAKOM in German) and the Federal Council give them.
 *
 * The certificates and what they allow are in Articles 44 to 47 and 51 of the Verordnung
 * über die Nutzung des Funkfrequenzspektrums (VNF, SR 784.102.1). Band edges and powers
 * are from Anhang 4 of OFCOM's Verordnung über die Nutzung des Funkfrequenzspektrums
 * (VVNF, SR 784.102.11) in the version in force since 1 January 2026 (AS 2025 736). Power
 * is the most a transmitter may give at its output, as PEP (footnote a), unless the table
 * gives ERP or EIRP. PMR446 and CB are from OFCOM's radio interface regulations (RIR).
 */
import type { CountryRadioRules, RadioRulesSource } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const VNF: RadioRulesSource = {
  publisher: "Swiss Federal Chancellery (fedlex)",
  title:
    "Verordnung über die Nutzung des Funkfrequenzspektrums (VNF) of 18 November 2020, SR 784.102.1, status 1 January 2024: Articles 8, 33 and 44 to 51",
  url: "https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/2020/1024/20240101/de/pdf-a/fedlex-data-admin-ch-eli-cc-2020-1024-20240101-de-pdf-a.pdf",
  checked: CHECKED,
};
const VVNF: RadioRulesSource = {
  publisher: "Swiss Federal Chancellery (fedlex)",
  title:
    "Verordnung des BAKOM über die Nutzung des Funkfrequenzspektrums (VVNF) of 18 November 2020, SR 784.102.11, status 1 January 2026: Articles 6 and 7 and Anhang 4 (as amended on 12 November 2025, AS 2025 736)",
  url: "https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/2020/914/20260101/de/pdf-a/fedlex-data-admin-ch-eli-cc-2020-914-20260101-de-pdf-a.pdf",
  checked: CHECKED,
};
const OFCOM_MERKBLATT: RadioRulesSource = {
  publisher: "Federal Office of Communications (OFCOM)",
  title: "Amateurfunkdienst: Erläuternde Angaben zum Amateurfunkdienst (Merkblatt Amateurfunk), edition of 30 September 2026",
  url: "https://www.bakom.admin.ch/dam/de/sd-web/o7l5gAQXyfUB/Merkblatt%20Amateurfunk_DE.pdf",
  checked: CHECKED,
};
const OFCOM_AMATEUR: RadioRulesSource = {
  publisher: "Federal Office of Communications (OFCOM)",
  title: "Amateur radio (the regulator's amateur radio page)",
  url: "https://www.bakom.admin.ch/en/amateur-radio",
  checked: CHECKED,
};
const RIR_PMR446: RadioRulesSource = {
  publisher: "Federal Office of Communications (OFCOM)",
  title:
    "RIR0507-35, PMR 446 (analogue/digital), Radio Interface Regulation for Switzerland and Liechtenstein, edition 3.1 of 1 January 2020",
  url: "https://www.ofcomnet.ch/api/rir/0507/35",
  checked: CHECKED,
};
const OFCOM_PMR446: RadioRulesSource = {
  publisher: "Federal Office of Communications (OFCOM)",
  title: "PMR 446 (the regulator's page, published 5 September 2022)",
  url: "https://www.bakom.admin.ch/en/pmr446_en",
  checked: CHECKED,
};
const RIR_CB: RadioRulesSource = {
  publisher: "Federal Office of Communications (OFCOM)",
  title: "RIR1102-02, CB radio, Radio Interface Regulation for Switzerland and Liechtenstein, edition 6.1 of 1 January 2023",
  url: "https://www.ofcomnet.ch/api/rir/1102/02",
  checked: CHECKED,
};
const OFCOM_CB: RadioRulesSource = {
  publisher: "Federal Office of Communications (OFCOM)",
  title: "Citizens band (CB) radio (the regulator's page, published 16 April 2026)",
  url: "https://www.bakom.admin.ch/en/citizens-band-cb-radio",
  checked: CHECKED,
};

// ── Shared conditions from Anhang 4 ────────────────────────────────────────

const NO_SAT = "satellite not permitted";
const NOTIFY = "may be used only after notifying OFCOM in advance (Art. 33(1)(d) VNF)";
const NOTIFY_20W = "above 20 W only after notifying OFCOM in advance (Art. 33(1)(d) VNF)";

// ── The rules ───────────────────────────────────────────────────────────────

export const RULES_CH: CountryRadioRules = {
  country: "CH",
  regulator: "Federal Office of Communications (OFCOM)",
  regulatorUrl: OFCOM_AMATEUR.url,
  summary:
    "OFCOM sets the exams and assigns call signs; no individual licence is issued, but a certificate and a call sign are needed. There are two kinds: the full certificate (CEPT, HB9 call signs) and the entry certificate (Einsteigerausweis, NOVICE, HB3 call signs).",
  classes: [
    {
      id: "ch-cept",
      name: "Fähigkeitszeugnis für den Amateurfunk (CEPT, HB9)",
      how: "Pass OFCOM's CEPT exam, then apply for a call sign; the radiotelegraphist's and radiotelephonist's certificates for amateur radio give the same rights. A call sign needs residence in Switzerland for at least three months.",
      privileges: [
        { band: "2200 m", fromKhz: 135.7, toKhz: 137.8, power: "1 W ERP", note: `secondary; ${NO_SAT}` },
        { band: "630 m", fromKhz: 472, toKhz: 479, power: "5 W EIRP", note: `secondary; ${NO_SAT}` },
        { band: "160 m", fromKhz: 1810, toKhz: 1850, power: "1000 W PEP", note: `primary; ${NO_SAT}` },
        { band: "160 m", fromKhz: 1850, toKhz: 2000, power: "1000 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: "1000 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "60 m", fromKhz: 5351.5, toKhz: 5366.5, power: "15 W EIRP", note: `secondary; ${NO_SAT}` },
        { band: "40 m", fromKhz: 7000, toKhz: 7200, power: "1000 W PEP", note: "primary; satellite primary" },
        { band: "30 m", fromKhz: 10100, toKhz: 10150, power: "1000 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "20 m", fromKhz: 14000, toKhz: 14250, power: "1000 W PEP", note: "primary; satellite primary" },
        { band: "20 m", fromKhz: 14250, toKhz: 14350, power: "1000 W PEP", note: `primary; ${NO_SAT}` },
        { band: "17 m", fromKhz: 18068, toKhz: 18168, power: "1000 W PEP", note: "primary; satellite primary" },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: "1000 W PEP", note: "primary; satellite primary" },
        { band: "12 m", fromKhz: 24890, toKhz: 24990, power: "1000 W PEP", note: "primary; satellite primary" },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: "1000 W PEP", note: "primary; satellite primary" },
        { band: "6 m", fromKhz: 50000, toKhz: 52000, power: "100 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "4 m", fromKhz: 70000, toKhz: 70037.5, power: "25 W ERP", note: `secondary; ${NO_SAT}` },
        { band: "4 m", fromKhz: 70112.5, toKhz: 70500, power: "25 W ERP", note: `secondary; ${NO_SAT}` },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "1000 W PEP", note: "primary; satellite primary" },
        { band: "70 cm", fromKhz: 430000, toKhz: 435000, power: "1000 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "70 cm", fromKhz: 435000, toKhz: 438000, power: "1000 W PEP", note: "primary; satellite secondary" },
        { band: "70 cm", fromKhz: 438000, toKhz: 440000, power: "1000 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "23 cm", fromKhz: 1240000, toKhz: 1260000, power: "1000 W PEP", note: `secondary; ${NOTIFY}; ${NO_SAT}` },
        {
          band: "23 cm",
          fromKhz: 1260000,
          toKhz: 1270000,
          power: "1000 W PEP",
          note: "secondary; satellite secondary, Earth to satellite only",
        },
        { band: "23 cm", fromKhz: 1270000, toKhz: 1300000, power: "1000 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "13 cm", fromKhz: 2300000, toKhz: 2400000, power: "100 W PEP", note: `secondary; ${NOTIFY_20W}; ${NO_SAT}` },
        {
          band: "13 cm",
          fromKhz: 2400000,
          toKhz: 2450000,
          power: "100 W PEP",
          note: `secondary; satellite secondary; ${NOTIFY_20W}`,
        },
        {
          band: "6 cm",
          fromKhz: 5650000,
          toKhz: 5670000,
          power: "100 W PEP",
          note: "secondary; satellite secondary, Earth to satellite only",
        },
        { band: "6 cm", fromKhz: 5670000, toKhz: 5850000, power: "100 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "3 cm", fromKhz: 10000000, toKhz: 10450000, power: "100 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "3 cm", fromKhz: 10450000, toKhz: 10500000, power: "100 W PEP", note: "secondary; satellite secondary" },
        { band: "1.2 cm", fromKhz: 24000000, toKhz: 24050000, power: "10 W PEP", note: "primary; satellite primary" },
        { band: "1.2 cm", fromKhz: 24050000, toKhz: 24250000, power: "10 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "6 mm", fromKhz: 47000000, toKhz: 47200000, power: "10 W PEP", note: "primary; satellite primary" },
        { band: "4 mm", fromKhz: 76000000, toKhz: 77500000, power: "10 W PEP", note: "secondary; satellite secondary" },
        { band: "4 mm", fromKhz: 77500000, toKhz: 78000000, power: "10 W PEP", note: "primary; satellite primary" },
        { band: "4 mm", fromKhz: 78000000, toKhz: 81500000, power: "10 W PEP", note: "secondary; satellite secondary" },
        { band: "2.5 mm", fromKhz: 122250000, toKhz: 123000000, power: "10 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "2 mm", fromKhz: 134000000, toKhz: 136000000, power: "10 W PEP", note: "primary; satellite primary" },
        { band: "2 mm", fromKhz: 136000000, toKhz: 141000000, power: "10 W PEP", note: "secondary; satellite secondary" },
        { band: "1 mm", fromKhz: 241000000, toKhz: 248000000, power: "10 W PEP", note: "secondary; satellite secondary" },
        { band: "1 mm", fromKhz: 248000000, toKhz: 250000000, power: "10 W PEP", note: "primary; satellite primary" },
      ],
      notes: [
        '"Secondary" means the band is also open to other users, who have priority.',
        "Holders may use all amateur bands for Morse telegraphy, telephony, facsimile and television, and may build and modify their own equipment without OFCOM's consent. Digital modes are allowed where the transmission method is publicly available.",
        "Unattended stations may be put into operation only by amateur radio clubs, and unattended and remote-controlled stations must be notified to OFCOM before use.",
        "Holders must keep documentation of their station (transmitters and receivers, bands, modes, power, antennas, and circuit diagrams of home-built equipment) and show it to OFCOM on request.",
        'Operating in Liechtenstein, put "HBØ/" before the call sign.',
        "OFCOM applies CEPT T/R 61-01: HB9 holders may operate for up to three months in other countries that apply it, carrying the call sign assignment and the certificate.",
      ],
      sources: [VNF, VVNF, OFCOM_MERKBLATT, OFCOM_AMATEUR],
    },
    {
      id: "ch-novice",
      name: "Einsteigerausweis für Funkamateurinnen und Funkamateure (NOVICE, HB3)",
      how: "Pass OFCOM's NOVICE exam, then apply for a call sign. A call sign needs residence in Switzerland for at least three months.",
      privileges: [
        { band: "160 m", fromKhz: 1810, toKhz: 1850, power: "100 W PEP", note: `primary; ${NO_SAT}` },
        { band: "160 m", fromKhz: 1850, toKhz: 2000, power: "100 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: "100 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: "100 W PEP", note: "primary; satellite primary" },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: "100 W PEP", note: "primary; satellite primary" },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "50 W PEP", note: "primary; satellite primary" },
        { band: "70 cm", fromKhz: 430000, toKhz: 435000, power: "50 W PEP", note: `secondary; ${NO_SAT}` },
        { band: "70 cm", fromKhz: 435000, toKhz: 438000, power: "50 W PEP", note: "primary; satellite secondary" },
        { band: "70 cm", fromKhz: 438000, toKhz: 440000, power: "50 W PEP", note: `secondary; ${NO_SAT}` },
      ],
      notes: [
        '"Secondary" means the band is also open to other users, who have priority.',
        "Holders may use Morse telegraphy, telephony and facsimile (not television) on these bands; digital modes are allowed where the transmission method is publicly available.",
        "Holders may operate only commercially available equipment; changes are allowed if they do not touch the transmitter.",
        "A NOVICE holder may use a club's station under the club call sign only under the supervision of a CEPT (HB9) holder with access to all bands and modes.",
        'Operating in Liechtenstein, put "HBØY/" before the call sign.',
        "OFCOM applies CEPT ECC/REC/(05)06 for HB3 holders on short stays abroad, carrying the call sign assignment and the certificate.",
      ],
      sources: [VNF, VVNF, OFCOM_MERKBLATT, OFCOM_AMATEUR],
    },
  ],
  licenceFree: [
    {
      name: "PMR446",
      frequencies: "446.000 to 446.200 MHz, 6.25 or 12.5 kHz channels (analogue 12.5 kHz; digital 6.25 or 12.5 kHz)",
      power: "0.5 W e.r.p.",
      licence: "No licence: exempt in Switzerland (a general authorisation is needed in Liechtenstein).",
      note: "Hand-held radios with an integral antenna; no base stations, repeaters or fixed infrastructure. Transmissions time out after at most 180 seconds. Amateur radio equipment may not transmit on these channels.",
      frequencyEntryId: "lf-pmr446-analogue",
      sources: [RIR_PMR446, OFCOM_PMR446],
    },
    {
      name: "CB (27 MHz)",
      frequencies: "26.960 to 27.410 MHz, 10 kHz channels, excluding the centre frequencies 26.995, 27.045, 27.095, 27.145 and 27.195 MHz",
      power: "4 W on FM and AM, 12 W PEP on SSB (conducted)",
      licence: "No licence since 1 January 2013 (a general authorisation is needed in Liechtenstein).",
      note: "External antennas are allowed; with an internal antenna the same figures apply as e.r.p. No external power amplifiers, no music or broadcast programmes. Packet radio on CB needs a call sign from OFCOM.",
      frequencyEntryId: "lf-cb-cept",
      sources: [RIR_CB, OFCOM_CB],
    },
  ],
  notRead: [
    "The newest consolidated VNF on fedlex is the version of 1 January 2024; any later amendment to Articles 44 to 51 was not found.",
    "Anhang 1 of the VVNF (licence-free uses such as short range devices at 433 and 868 MHz, Fassung 8 of 12 November 2025) is published only by reference on fedlex, whose page needs JavaScript and could not be read, so short range devices are not listed here.",
    "The exam regulations (Prüfungsvorschriften, edition 4) for the CEPT and NOVICE certificates were not read, so what each exam covers is not given.",
    "The band plan within each amateur band is set by the amateur society (USKA), not by OFCOM, and is not included.",
  ],
};
