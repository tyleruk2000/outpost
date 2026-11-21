/**
 * Spain: the amateur bands and powers, as the ministry sets them, with PMR446 and CB-27.
 *
 * Powers are from the Reglamento de uso del dominio público radioeléctrico por
 * radioaficionados (Orden IET/1311/2013), Anexo I, apartado 3, read in the BOE's
 * consolidated text (last amended 10 April 2015 by Orden IET/614/2015, which changed only
 * the list of bands needing a special authorisation). The power table there gives one
 * figure to a run of bands; which bands share each figure was read from the layout of the
 * table in the 2013 BOE PDF. The table sends the band edges to the CNAF, so the edges, and
 * whether the amateur service is primary or secondary in Spain, are from the national
 * allocation column of the Cuadro Nacional de Atribución de Frecuencias approved by Orden
 * TDF/732/2026 (in force from 18 July 2026), which replaced the 2021 table. Apartado 3.2
 * caps power on bands where the amateur service is secondary at half the table figure;
 * the powers below apply that. PMR446 and CB-27 are from CNAF notes UN-110 and UN-3.
 */
import type { CountryRadioRules, RadioRulesSource } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const REGLAMENTO: RadioRulesSource = {
  publisher: "Boletín Oficial del Estado (Ministerio de Industria, Energía y Turismo)",
  title:
    "Orden IET/1311/2013, de 9 de julio, por la que se aprueba el Reglamento de uso del dominio público radioeléctrico por radioaficionados (BOE-A-2013-7624, consolidated text, last amended 10 April 2015): articles 5, 10 and 16, disposición adicional segunda, Anexo I apartado 3",
  url: "https://www.boe.es/buscar/pdf/2013/BOE-A-2013-7624-consolidado.pdf",
  checked: CHECKED,
};
const REGLAMENTO_2013: RadioRulesSource = {
  publisher: "Boletín Oficial del Estado (Ministerio de Industria, Energía y Turismo)",
  title:
    "Orden IET/1311/2013, de 9 de julio, «BOE» núm. 166, de 12 de julio de 2013 (original publication, for the layout of the power table in Anexo I apartado 3.1)",
  url: "https://boe.es/boe/dias/2013/07/12/pdfs/BOE-A-2013-7624.pdf",
  checked: CHECKED,
};
const CNAF: RadioRulesSource = {
  publisher: "Boletín Oficial del Estado (Ministerio para la Transformación Digital y de la Función Pública)",
  title:
    "Orden TDF/732/2026, de 10 de julio, por la que se aprueba el Cuadro Nacional de Atribución de Frecuencias (BOE-A-2026-15661, «BOE» núm. 173, de 17 de julio de 2026): national allocation column and notes UN-3, UN-100, UN-108, UN-110, UN-122 and UN-132",
  url: "https://www.boe.es/boe/dias/2026/07/17/pdfs/BOE-A-2026-15661.pdf",
  checked: CHECKED,
};
const MINISTRY_LEGISLACION: RadioRulesSource = {
  publisher: "Ministerio para la Transformación Digital y de la Función Pública",
  title: "Radioaficionados y CB-27: legislación",
  url: "https://digital.gob.es/telecomunicaciones-infraestructuras-digitales/areas-interes/espectro-radioelectrico/radioaficionados-cb27/legislacion",
  checked: CHECKED,
};

// ── The rules ───────────────────────────────────────────────────────────────

const SEC = "secondary: half the table figure";
const SPECIAL = "special authorisation needed";

export const RULES_ES: CountryRadioRules = {
  country: "ES",
  regulator:
    "Secretaría de Estado de Telecomunicaciones e Infraestructuras Digitales (Ministerio para la Transformación Digital y de la Función Pública)",
  regulatorUrl: MINISTRY_LEGISLACION.url,
  summary:
    "The ministry runs the exam, issues the HAREC certificate and grants the radio amateur authorisation (autorización de radioaficionado) with a callsign. There is a single class: every holder may use every amateur band at the powers in the Reglamento, within the edges the national frequency table (CNAF) sets.",
  classes: [
    {
      id: "es-radioaficionado",
      name: "Autorización de radioaficionado",
      how: "Pass the ministry's two-part exam (electricity and radio, and regulations), which gives the HAREC certificate, then apply for the authorisation. Foreign residents holding a HAREC certificate, or a licence from a country with a reciprocity agreement, may apply without the exam.",
      privileges: [
        {
          band: "2200 m",
          fromKhz: 135.7,
          toKhz: 137.8,
          power: "1 W e.i.r.p.",
          note: "secondary; do not interfere with maritime mobile and fixed stations",
        },
        {
          band: "630 m",
          fromKhz: 472,
          toKhz: 479,
          power: "1 W e.i.r.p.",
          note: "secondary; up to 5 W e.i.r.p. in areas more than 800 km from the borders of African countries",
        },
        { band: "160 m", fromKhz: 1810, toKhz: 1830, power: "500 W PEP", note: SEC },
        { band: "160 m", fromKhz: 1830, toKhz: 1850, power: "1000 W PEP", note: "primary" },
        { band: "80 m", fromKhz: 3500, toKhz: 3800, power: "1000 W PEP", note: "primary, shared with fixed and mobile" },
        { band: "60 m", fromKhz: 5351.5, toKhz: 5366.5, power: "15 W e.i.r.p.", note: "secondary (Radio Regulations 5.133B)" },
        { band: "40 m", fromKhz: 7000, toKhz: 7200, power: "1000 W PEP", note: "primary" },
        { band: "30 m", fromKhz: 10100, toKhz: 10150, power: "500 W PEP", note: SEC },
        { band: "20 m", fromKhz: 14000, toKhz: 14350, power: "1000 W PEP", note: "primary" },
        { band: "17 m", fromKhz: 18068, toKhz: 18168, power: "1000 W PEP", note: "primary" },
        { band: "15 m", fromKhz: 21000, toKhz: 21450, power: "1000 W PEP", note: "primary" },
        { band: "12 m", fromKhz: 24890, toKhz: 24990, power: "1000 W PEP", note: "primary" },
        { band: "10 m", fromKhz: 28000, toKhz: 29700, power: "1000 W PEP", note: "primary" },
        {
          band: "6 m",
          fromKhz: 50000,
          toKhz: 52000,
          power: "300 W PEP",
          note: `${SEC}; must not interfere with, or claim protection from, television in neighbouring countries`,
        },
        { band: "4 m", fromKhz: 70150, toKhz: 70250, power: "300 W PEP", note: SEC },
        { band: "2 m", fromKhz: 144000, toKhz: 146000, power: "600 W PEP", note: "primary" },
        { band: "70 cm", fromKhz: 430000, toKhz: 440000, power: "300 W PEP", note: "primary, shared with radiolocation" },
        {
          band: "23 cm",
          fromKhz: 1240000,
          toKhz: 1300000,
          power: "500 W e.i.r.p.",
          note: `${SEC}; on 1258 to 1300 MHz follow the measures in ECC/DEC(25)01 to protect Galileo`,
        },
        { band: "13 cm", fromKhz: 2300000, toKhz: 2450000, power: "500 W e.i.r.p.", note: `${SEC}; ${SPECIAL} except on 2316 to 2332 MHz` },
        {
          band: "6 cm",
          fromKhz: 5650000,
          toKhz: 5850000,
          power: "500 W e.i.r.p.",
          note: `${SEC}; ${SPECIAL} except on 5700 to 5720 MHz and 5760 to 5762 MHz`,
        },
        { band: "3 cm", fromKhz: 10000000, toKhz: 10500000, power: "500 W e.i.r.p.", note: SEC },
        { band: "1.2 cm", fromKhz: 24000000, toKhz: 24050000, power: "1000 W e.i.r.p.", note: "primary" },
        { band: "1.2 cm", fromKhz: 24050000, toKhz: 24250000, power: "500 W e.i.r.p.", note: `${SEC}; ${SPECIAL}` },
        { band: "6 mm", fromKhz: 47000000, toKhz: 47200000, power: "1000 W e.i.r.p.", note: "primary" },
        { band: "4 mm", fromKhz: 76000000, toKhz: 77500000, power: "500 W e.i.r.p.", note: SEC },
        { band: "4 mm", fromKhz: 77500000, toKhz: 78000000, power: "1000 W e.i.r.p.", note: "primary" },
        { band: "4 mm", fromKhz: 78000000, toKhz: 81000000, power: "500 W e.i.r.p.", note: SEC },
        { band: "2.5 mm", fromKhz: 122250000, toKhz: 123000000, power: "500 W e.i.r.p.", note: SEC },
        { band: "2 mm", fromKhz: 134000000, toKhz: 136000000, power: "1000 W e.i.r.p.", note: "primary" },
        { band: "2 mm", fromKhz: 136000000, toKhz: 141000000, power: "500 W e.i.r.p.", note: SEC },
        { band: "1 mm", fromKhz: 241000000, toKhz: 248000000, power: "500 W e.i.r.p.", note: SEC },
        { band: "1 mm", fromKhz: 248000000, toKhz: 250000000, power: "1000 W e.i.r.p.", note: "primary" },
      ],
      notes: [
        "The Reglamento's table gives 1000 W PEP (potencia de cresta de la envolvente) for 160 m to 10 m, 600 W PEP for 6 m, 4 m and 2 m, 300 W PEP for 70 cm, and 1000 W e.i.r.p. for 23 cm and above. On bands where the amateur service is secondary the most power is half of that (Anexo I, 3.2); the figures above already apply this.",
        "On 2200 m and 630 m the table gives the e.i.r.p. limit directly, and CNAF note UN-108 sets 1 W e.i.r.p. on 2200 m.",
        "For moonbounce (EME) and meteor scatter, in the IARU-recommended sub-bands and always away from built-up areas, up to 1000 W PEP may be used.",
        "Bandwidths should, as a rule, follow the IARU Region 1 band plan. Power and time on air must be kept to what is strictly needed.",
        "Stations on 433.05 to 434.79 MHz, 2400 to 2450 MHz, 5725 to 5800 MHz and 24 to 24.25 GHz must accept interference from industrial, scientific and medical (ICM) equipment.",
        "Keep the radio-frequency field below 3.5 mW/cm² wherever people have access or pass by, cutting power if needed.",
        "Unattended automatic stations (repeaters, beacons) are held by recognised associations; on VHF and UHF their transmitter output is limited to 50 W outside built-up areas and 10 W inside them, with antenna gain at most 6 dBd, and to 50 W output on HF.",
        "Satellite operation is allowed only on bands the CNAF allocates to the amateur-satellite service. Using a portable station must be notified to the provincial telecommunications inspectorate at least 5 days ahead, except for occasional use of at most 15 days in a row.",
      ],
      sources: [REGLAMENTO, REGLAMENTO_2013, CNAF],
    },
  ],
  licenceFree: [
    {
      name: "PMR446 (analogue)",
      frequencies: "446.0 to 446.2 MHz, 12.5 kHz channels, the first at 446.00625 MHz",
      power: "500 mW e.r.p.",
      licence: "No licence: PMR446 radios are exempt from an individual licence (CNAF note UN-110).",
      note: "Handheld radios with built-in antennas only; simplex; not as a base station or repeater, and not connected to other networks.",
      frequencyEntryId: "lf-pmr446-analogue",
      sources: [CNAF],
    },
    {
      name: "PMR446 (digital)",
      frequencies: "446.0 to 446.2 MHz, 6.25 kHz channels from 446.003125 MHz or 12.5 kHz channels from 446.00625 MHz",
      power: "500 mW e.r.p.",
      licence: "No licence: PMR446 radios are exempt from an individual licence (CNAF note UN-110).",
      note: "Handheld radios with built-in antennas only; simplex; not as a base station or repeater, and not connected to other networks.",
      frequencyEntryId: "lf-pmr446-digital",
      sources: [CNAF],
    },
    {
      name: "CB (27 MHz)",
      frequencies: "26.965 to 27.405 MHz, the 40 European channels, 10 kHz apart (the band is 26.960 to 27.410 MHz)",
      power: "4 W (FM, AM and digital); 12 W PEP on SSB",
      licence: "No licence: the CNAF classes CB-27 as common use (uso común) (note UN-3).",
      note: "Only for non-profit activities. Simplex only; antenna gain at most 6 dB and not directional in the horizontal plane; no amplifiers, no stations on aircraft, no repeaters or satellite links, no continuous unmodulated carrier. Channel 9 (27.065 MHz) is kept for distress and urgency traffic.",
      frequencyEntryId: "lf-cb-cept",
      sources: [CNAF],
    },
  ],
  notRead: [
    "The rule halving power on secondary bands (Anexo I, 3.2) is not spelt out for the 2200 m and 630 m e.i.r.p. figures; the figures shown are the table's own.",
    "The SETSI may update the list of bands needing a special authorisation; no update after the 2015 amendment was found.",
    "Short range devices (433 MHz and 868 MHz, CNAF notes UN-30 and UN-111) were not read for the licence-free list.",
    "The ministry's exam page and the resolution setting exam conditions and callsign rules were not read; the exam and class details here are from the Reglamento itself.",
    "The Canary Islands, Ceuta and Melilla are covered by the same documents; no separate rules for them were looked for.",
  ],
};
