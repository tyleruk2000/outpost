/**
 * France: the amateur bands and powers by class of operator's certificate, as ARCEP sets
 * them, for metropolitan France (ITU Region 1).
 *
 * Bands and powers are from ARCEP décision n° 2012-1241 as amended, in the annex as last
 * replaced by décision n° 2019-1412 (homologated by arrêté of 5 February 2020). The table
 * there gives one power to a run of bands; the 120 W figure for every band from 50 MHz
 * upwards was checked against the same table in the original 2012 decision, where it is
 * on one page. Bands the table marks "non attribuée" in Region 1 are left out (they apply
 * only in the overseas territories in Region 2). The licence-free services are not here:
 * see notRead.
 */
import type { CountryRadioRules, RadioRulesSource } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const ARCEP_2019_1412: RadioRulesSource = {
  publisher: "Autorité de régulation des communications électroniques, des postes et de la distribution de la presse (Arcep)",
  title:
    "Décision n° 2019-1412 du 24 septembre 2019 modifiant la décision n° 2012-1241 modifiée fixant les conditions d'utilisation des fréquences par les stations radioélectriques du service d'amateur ou du service d'amateur par satellite (annex, paragraphs 1 and 2)",
  url: "https://arcep.fr/uploads/tx_gsavis/19-1412.pdf",
  checked: CHECKED,
};
const ARCEP_2012_1241: RadioRulesSource = {
  publisher: "Autorité de régulation des communications électroniques, des postes et de la distribution de la presse (Arcep)",
  title:
    "Décision n° 2012-1241 du 2 octobre 2012 fixant les conditions d'utilisation des fréquences par les stations radioélectriques du service d'amateur ou du service d'amateur par satellite (annex, paragraph 3, still in force)",
  url: "https://www.arcep.fr/uploads/tx_gsavis/12-1241.pdf",
  checked: CHECKED,
};
const ANFR_CADRE: RadioRulesSource = {
  publisher: "Agence nationale des fréquences (ANFR)",
  title: "Radioamateurs: cadre juridique",
  url: "https://www.anfr.fr/gerer/radioamateurs/cadre-juridique",
  checked: CHECKED,
};
const ANFR_CERTIFICATS: RadioRulesSource = {
  publisher: "Agence nationale des fréquences (ANFR)",
  title: "Radioamateurs: les certificats",
  url: "https://www.anfr.fr/gerer/radioamateurs/les-certificats",
  checked: CHECKED,
};

// ── The rules ───────────────────────────────────────────────────────────────

const BW_HF = "occupied bandwidth at most 6 kHz";

export const RULES_FR: CountryRadioRules = {
  country: "FR",
  regulator: "Arcep (bands and power) and ANFR (exams and callsigns)",
  regulatorUrl: ANFR_CADRE.url,
  summary:
    "The ANFR runs the exam for the operator's certificate (certificat d'opérateur des services d'amateur), which is HAREC level, and issues callsigns. Arcep sets the bands and power: one table for every certificate class except class 3, and a separate one for class 3 (2 m only).",
  classes: [
    {
      id: "fr-harec",
      name: "Certificat d'opérateur (classes other than classe 3)",
      how: "Pass the ANFR exam: 20 multiple-choice questions on regulations and 20 on technique, with at least half marks in each. The certificate is HAREC level. There has been no Morse test since 2012.",
      privileges: [
        { band: "2200 m", fromKhz: 135.7, toKhz: 137.8, power: "1 W e.i.r.p.", note: "secondary" },
        { band: "630 m", fromKhz: 472, toKhz: 479, power: "1 W e.i.r.p.", note: "secondary" },
        { band: "160 m", fromKhz: 1810, toKhz: 1850, power: "500 W PEP", note: `primary; ${BW_HF}` },
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: "500 W PEP", note: `primary, shared with other primary services; ${BW_HF}` },
        { band: "60 m", fromKhz: 5351.5, toKhz: 5366.5, power: "15 W e.i.r.p.", note: `secondary; ${BW_HF}` },
        { band: "40 m", fromKhz: 7000, toKhz: 7200, power: "500 W PEP", note: `primary; ${BW_HF}` },
        { band: "30 m", fromKhz: 10100, toKhz: 10150, power: "500 W PEP", note: `secondary; ${BW_HF}` },
        { band: "20 m", fromKhz: 14000, toKhz: 14350, power: "500 W PEP", note: `primary; ${BW_HF}` },
        { band: "17 m", fromKhz: 18068, toKhz: 18168, power: "500 W PEP", note: `primary; ${BW_HF}` },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: "500 W PEP", note: `primary; ${BW_HF}` },
        { band: "12 m", fromKhz: 24890, toKhz: 24990, power: "500 W PEP", note: `primary; ${BW_HF}` },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: "250 W PEP", note: "primary; occupied bandwidth at most 12 kHz" },
        { band: "6 m", fromKhz: 50000, toKhz: 52000, power: "120 W PEP", note: "secondary; occupied bandwidth at most 12 kHz" },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "120 W PEP", note: "primary; occupied bandwidth at most 20 kHz" },
        { band: "70 cm", fromKhz: 430000, toKhz: 434000, power: "120 W PEP", note: "secondary" },
        { band: "70 cm", fromKhz: 434000, toKhz: 440000, power: "120 W PEP", note: "primary, shared with other primary services" },
        { band: "23 cm", fromKhz: 1240000, toKhz: 1300000, power: "120 W PEP", note: "secondary" },
        { band: "13 cm", fromKhz: 2300000, toKhz: 2450000, power: "120 W PEP", note: "secondary" },
        { band: "6 cm", fromKhz: 5650000, toKhz: 5850000, power: "120 W PEP", note: "secondary" },
        { band: "3 cm", fromKhz: 10000000, toKhz: 10450000, power: "120 W PEP", note: "secondary" },
        {
          band: "3 cm",
          fromKhz: 10450000,
          toKhz: 10500000,
          power: "120 W PEP",
          note: "secondary, primary under the national frequency table",
        },
        { band: "1.2 cm", fromKhz: 24000000, toKhz: 24050000, power: "120 W PEP", note: "primary" },
        { band: "1.2 cm", fromKhz: 24050000, toKhz: 24250000, power: "120 W PEP", note: "secondary" },
        { band: "6 mm", fromKhz: 47000000, toKhz: 47200000, power: "120 W PEP", note: "primary" },
        { band: "4 mm", fromKhz: 76000000, toKhz: 77500000, power: "120 W PEP", note: "secondary" },
        { band: "4 mm", fromKhz: 77500000, toKhz: 78000000, power: "120 W PEP", note: "primary" },
        { band: "4 mm", fromKhz: 78000000, toKhz: 81500000, power: "120 W PEP", note: "secondary" },
        { band: "2.5 mm", fromKhz: 122250000, toKhz: 123000000, power: "120 W PEP", note: "secondary" },
        { band: "2 mm", fromKhz: 134000000, toKhz: 136000000, power: "120 W PEP", note: "primary" },
        { band: "2 mm", fromKhz: 136000000, toKhz: 141000000, power: "120 W PEP", note: "secondary" },
        { band: "1 mm", fromKhz: 241000000, toKhz: 248000000, power: "120 W PEP", note: "secondary" },
        { band: "1 mm", fromKhz: 248000000, toKhz: 250000000, power: "120 W PEP", note: "primary" },
      ],
      notes: [
        "PEP is peak envelope power at the transmitter output; on 2200 m, 630 m and 60 m the figure is e.i.r.p.",
        "The French table also lists bands for ITU Region 2 (1800 to 1810 kHz, 1850 to 2000 kHz, 3800 to 4000 kHz, 7200 to 7300 kHz, 52 to 54 MHz, 146 to 148 MHz, 220 to 225 MHz, 3300 to 3500 MHz, 5850 to 5925 MHz) that are not allocated in metropolitan France.",
        "Before transmitting, check that the frequency is not already in use; do not hold one frequency permanently; the station must have a power indicator.",
      ],
      sources: [ARCEP_2019_1412, ARCEP_2012_1241, ANFR_CERTIFICATS],
    },
    {
      id: "fr-classe-3",
      name: "Classe 3",
      privileges: [{ band: "2 m", fromKhz: 144000, toKhz: 146000, power: "10 W PEP", note: "primary; occupied bandwidth at most 20 kHz" }],
      notes: ["Classe 3 holders may use only the emission classes A1A, A2A, A3E, G3E, J3E and F3E (Morse, AM, SSB and FM speech)."],
      sources: [ARCEP_2019_1412, ARCEP_2012_1241],
    },
  ],
  licenceFree: [],
  notRead: [
    "The certificate classes themselves are defined by the arrêté of 21 September 2000 as amended (last on 2 March 2021). Légifrance would not load, so which classes exist today and how classe 3 is obtained were not read; the ANFR's own pages describe only the single HAREC-level exam.",
    "PMR446, CB and 868 MHz short range devices: Arcep's short range device decision n° 2014-1263 was last amended by décision n° 2023-1412 (6 July 2023), which could not be found on arcep.fr. The French CB conditions were not found in a document that could be read. None of these are listed here until they are read.",
    "Arcep consulted from 11 September to 10 November 2026 on replacing the annex of décision n° 2014-1263; the result was not known on the day checked.",
    "Bands for the overseas territories in ITU Region 2, and the arrêté of 2 March 2021 for New Caledonia, French Polynesia, Wallis and Futuna and the TAAF, are not included.",
  ],
};
