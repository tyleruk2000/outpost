/**
 * The Netherlands: the two registration categories for radio amateurs (F and N) and the
 * licence-free services, as the Dutch regulations give them.
 *
 * Amateur bands and powers are from Bijlage 1 of the Regeling gebruik van frequentieruimte
 * met meldingsplicht 2015 (the version in force from 20 June 2024). Power there is
 * transmitter output in watts PEP unless the table says otherwise. Licence-free services
 * are from the Regeling gebruik van frequentieruimte zonder vergunning en zonder
 * meldingsplicht 2015 (the version in force from 1 July 2025). The Rijksinspectie Digitale
 * Infrastructuur (RDI) registers amateurs.
 */
import type { CountryRadioRules, RadioRulesSource } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const REGELING_MET: RadioRulesSource = {
  publisher: "Overheid.nl (wetten.overheid.nl)",
  title:
    "Regeling gebruik van frequentieruimte met meldingsplicht 2015, version in force from 20 June 2024: articles 4 and 10 and Bijlage 1 (Radiozendamateurs)",
  url: "https://wetten.overheid.nl/BWBR0036375",
  checked: CHECKED,
};
const REGELING_ZONDER: RadioRulesSource = {
  publisher: "Overheid.nl (wetten.overheid.nl)",
  title:
    "Regeling gebruik van frequentieruimte zonder vergunning en zonder meldingsplicht 2015, version in force from 1 July 2025: article 2 and Bijlagen 3 (CB), 4 (PMR446) and 11 (short range devices)",
  url: "https://wetten.overheid.nl/BWBR0036378",
  checked: CHECKED,
};
const RDI_WORDEN: RadioRulesSource = {
  publisher: "Rijksinspectie Digitale Infrastructuur",
  title: "Radiozendamateur worden",
  url: "https://www.rdi.nl/onderwerpen/vergunningen-en-registraties/radiozendamateurs/opleiding-en-examens",
  checked: CHECKED,
};
const RDI_EXAMEN: RadioRulesSource = {
  publisher: "Rijksinspectie Digitale Infrastructuur",
  title: "Examen voor radiozendamateurs",
  url: "https://www.rdi.nl/onderwerpen/vergunningen-en-registraties/radiozendamateurs/examen-doen",
  checked: CHECKED,
};

// ── The rules ───────────────────────────────────────────────────────────────

const NO_DUPLEX = "secondary; duplex contacts not allowed";

export const RULES_NL: CountryRadioRules = {
  country: "NL",
  regulator: "Rijksinspectie Digitale Infrastructuur (RDI)",
  regulatorUrl: RDI_WORDEN.url,
  summary:
    "Radio amateurs pass an exam at the CBR and then register with the RDI. There are two categories: F (full, HAREC level) and N (novice, limited bands and power).",
  classes: [
    {
      id: "nl-f",
      name: "F (full)",
      how: "Pass the RZAM-F theory exam (Radiozendamateur Full) at the CBR, then register with the RDI. A HAREC certificate from another CEPT administration counts as the F exam.",
      privileges: [
        { band: "2200 m", fromKhz: 135.7, toKhz: 137.8, power: "400 W PEP", note: "secondary; A1A (Morse) only" },
        { band: "630 m", fromKhz: 472, toKhz: 479, power: "100 W PEP", note: "secondary; A1A, F1A, G1A and J2A only; no contests" },
        { band: "160 m", fromKhz: 1810, toKhz: 1850, power: "400 W PEP", note: "primary" },
        { band: "160 m", fromKhz: 1850, toKhz: 1880, power: "400 W PEP", note: "secondary" },
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: "400 W PEP", note: "primary" },
        { band: "60 m", fromKhz: 5351.5, toKhz: 5366.5, power: "15 W e.i.r.p.", note: "secondary" },
        { band: "40 m", fromKhz: 7000, toKhz: 7200, power: "400 W PEP", note: "primary" },
        {
          band: "30 m",
          fromKhz: 10100,
          toKhz: 10150,
          power: "400 W PEP",
          note: "secondary; no contests; 10.14 to 10.15 MHz bandwidth at most 500 Hz",
        },
        { band: "20 m", fromKhz: 14000, toKhz: 14350, power: "400 W PEP", note: "primary" },
        { band: "17 m", fromKhz: 18068, toKhz: 18168, power: "400 W PEP", note: "primary" },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: "400 W PEP", note: "primary" },
        { band: "12 m", fromKhz: 24890, toKhz: 24990, power: "400 W PEP", note: "primary" },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: "400 W PEP", note: "primary" },
        { band: "6 m", fromKhz: 50000, toKhz: 50500, power: "120 W PEP", note: "primary" },
        { band: "6 m", fromKhz: 50500, toKhz: 52000, power: "30 W PEP", note: NO_DUPLEX },
        { band: "4 m", fromKhz: 70000, toKhz: 70500, power: "50 W PEP", note: NO_DUPLEX },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "400 W PEP", note: "primary" },
        { band: "70 cm", fromKhz: 430000, toKhz: 436000, power: "400 W PEP", note: "primary" },
        { band: "70 cm", fromKhz: 436000, toKhz: 440000, power: "400 W PEP", note: "secondary" },
        { band: "23 cm", fromKhz: 1240000, toKhz: 1300000, power: "120 W PEP", note: "secondary" },
        { band: "13 cm", fromKhz: 2320000, toKhz: 2400000, power: "120 W PEP", note: "secondary" },
        { band: "13 cm", fromKhz: 2400000, toKhz: 2450000, power: "120 W PEP", note: "secondary; satellite uplink (Earth to space) only" },
        { band: "9 cm", fromKhz: 3400000, toKhz: 3410000, power: "120 W PEP", note: "secondary" },
        { band: "6 cm", fromKhz: 5650000, toKhz: 5850000, power: "120 W PEP", note: "secondary" },
        { band: "3 cm", fromKhz: 10000000, toKhz: 10500000, power: "120 W PEP", note: "secondary" },
        { band: "1.2 cm", fromKhz: 24000000, toKhz: 24050000, power: "120 W PEP", note: "primary" },
        { band: "1.2 cm", fromKhz: 24050000, toKhz: 24250000, power: "120 W PEP", note: "secondary" },
        { band: "6 mm", fromKhz: 47000000, toKhz: 47200000, power: "120 W PEP", note: "primary" },
        { band: "4 mm", fromKhz: 75500000, toKhz: 76000000, power: "120 W PEP", note: "primary" },
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
        "Power is the transmitter's peak envelope power at the antenna connection, except on 60 m where the limit is e.i.r.p.",
        "Home-built transmitters must keep unwanted emissions within the limits in Bijlage 1 (for example −36 dBm or −40 dBc from 1.7 to 35 MHz).",
      ],
      sources: [REGELING_MET, RDI_WORDEN, RDI_EXAMEN],
    },
    {
      id: "nl-n",
      name: "N (novice)",
      how: "Pass the RZAM-N theory exam (Radiozendamateur Novice) at the CBR, then register with the RDI. An equivalent novice certificate under ECC Recommendation (05)06 counts as the N exam.",
      privileges: [
        { band: "40 m", fromKhz: 7000, toKhz: 7200, power: "100 W PEP", note: "primary" },
        { band: "20 m", fromKhz: 14000, toKhz: 14350, power: "100 W PEP", note: "primary" },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: "100 W PEP", note: "primary" },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "25 W PEP", note: "primary" },
        { band: "70 cm", fromKhz: 430000, toKhz: 436000, power: "25 W PEP", note: "primary" },
        { band: "70 cm", fromKhz: 436000, toKhz: 440000, power: "25 W PEP", note: "secondary" },
      ],
      notes: [
        "The RDI says the novice bands and power were widened by a change to the Regeling on 17 June 2021, which also removed the minimum age for both exams.",
      ],
      sources: [REGELING_MET, RDI_WORDEN, RDI_EXAMEN],
    },
  ],
  licenceFree: [
    {
      name: "CB (27 MHz)",
      frequencies: "26.965 to 27.405 MHz, the 40 European channels, 10 kHz wide",
      power: "4 W PEP (on AM/DSB: 1 W carrier power)",
      licence: "No licence and no registration.",
      note: "FM, AM (DSB) and SSB are allowed, all at the same 4 W PEP limit.",
      frequencyEntryId: "lf-cb-cept",
      sources: [REGELING_ZONDER],
    },
    {
      name: "PMR446",
      frequencies: "446.0 to 446.2 MHz, 6.25 or 12.5 kHz channels",
      power: "500 mW e.r.p.",
      licence: "No licence and no registration.",
      note: "The Regeling covers mobile UHF radios meant for general use over short distances.",
      frequencyEntryId: "lf-pmr446-analogue",
      sources: [REGELING_ZONDER],
    },
    {
      name: "SRD 868 MHz (short range devices, LoRa and similar)",
      frequencies:
        "863 to 870 MHz in sub-bands; for general devices 865.0 to 868.6 MHz (25 mW e.r.p.) and 869.4 to 869.65 MHz (500 mW e.r.p.)",
      power:
        "25 mW e.r.p. on 865.0 to 868.6 MHz, duty cycle under 1 %; 500 mW e.r.p. on 869.4 to 869.65 MHz, duty cycle under 10 % (or equivalent access techniques)",
      licence: "No licence and no registration (Bijlage 11, non-specific short range devices, rows H2 and H4).",
      note: "For data and telemetry. Other sub-bands between 863 and 870 MHz carry their own power and duty-cycle limits, and some are reserved for alarms.",
      sources: [REGELING_ZONDER],
    },
    {
      name: "SRD 433 MHz (LPD433)",
      frequencies: "433.05 to 434.79 MHz",
      power: "10 mW e.r.p., duty cycle under 10 % (or equivalent access techniques); 1 mW with no duty-cycle limit",
      licence: "No licence and no registration (Bijlage 11, non-specific short range devices, rows G and G1).",
      note: "Row G2 also allows 10 mW e.r.p. on 434.04 to 434.79 MHz with 25 kHz channels.",
      frequencyEntryId: "lf-lpd433",
      sources: [REGELING_ZONDER],
    },
  ],
  notRead: [
    "RDI permits for higher power on the amateur bands (an application form exists on rdi.nl) were not read.",
    "No new entry class below N was found in the regulation in force; if one is introduced, this entry needs updating.",
  ],
};
