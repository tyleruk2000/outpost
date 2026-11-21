/**
 * Ireland: ComReg's amateur station licence (CEPT Class 1 and CEPT Class 2) and the
 * licence-exempt services a household can use (PMR446, CB, short range devices at 868 MHz).
 *
 * The band table is Annex 1 of ComReg's Amateur Station Licence Guidelines (ComReg 09/45R6,
 * 29 May 2023), Tables 2 and 3, row for row. Both classes have the same bands and powers
 * (A 1.2); the only difference is the Morse test. Powers are peak envelope power at the
 * output of the transmitter or amplifier unless the table says e.i.r.p. (A 2.10).
 * Licence-free services are from ComReg's Permitted Short Range Devices in Ireland
 * (02/71 R16) and the exemption orders on the Irish Statute Book.
 */
import type { FrequencySource } from "../radio-frequencies.ts";
import type { BandPrivilege, CountryRadioRules } from "../radio-licences.ts";

const CHECKED = "2026-11-21";

// ── Sources ─────────────────────────────────────────────────────────────────

const COMREG_0945: FrequencySource = {
  publisher: "Commission for Communications Regulation (ComReg)",
  title: "Amateur Station Licence Guidelines, ComReg 09/45R6, 29 May 2023, Annex 1",
  url: "https://www.comreg.ie/media/2023/05/ComReg-0945R6.pdf",
  checked: CHECKED,
};
const COMREG_SRD: FrequencySource = {
  publisher: "Commission for Communications Regulation (ComReg)",
  title: "Permitted Short Range Devices in Ireland, ComReg 02/71 R16, 20 May 2024",
  url: "https://comreg.ie/media/2024/05/02_71-R16.pdf",
  checked: CHECKED,
};
const SI_93_1998: FrequencySource = {
  publisher: "Irish Statute Book (Office of the Attorney General)",
  title: "S.I. No. 93/1998, Wireless Telegraphy Act, 1926 (Section 3) (Exemption of Short Range Business Radios) Order, 1998",
  url: "https://www.irishstatutebook.ie/eli/1998/si/93/made/en/print",
  checked: CHECKED,
};
const SI_436_1998: FrequencySource = {
  publisher: "Irish Statute Book (Office of the Attorney General)",
  title: "S.I. No. 436/1998, Wireless Telegraphy Act, 1926 (Section 3) (Exemption of Citizens' Band (CB) Radios) Order, 1998",
  url: "https://www.irishstatutebook.ie/eli/1998/si/436/made/en/print",
  checked: CHECKED,
};

// ── Annex 1, Tables 2 and 3 (both classes) ─────────────────────────────────

const MM = "maritime mobile permitted";
const W400 = "400 W (26 dBW) PEP";
const W158 = "158 W (22 dBW) PEP";
const W50 = "50 W (17 dBW) PEP";

function row(band: string, fromKhz: number, toKhz: number, power: string, note?: string): BandPrivilege {
  return note ? { band, fromKhz, toKhz, power, note } : { band, fromKhz, toKhz, power };
}

const BANDS: BandPrivilege[] = [
  row("2200 m", 135.7, 137.8, "1 W (0 dBW) e.i.r.p.", "secondary"),
  row(
    "630 m",
    472,
    479,
    "5 W (7 dBW) e.i.r.p.",
    "secondary; no harmful interference to aeronautical radionavigation or maritime stations, and none to 490 kHz (navigational and weather warnings to ships)",
  ),
  row("160 m", 1810, 1850, W400, "primary"),
  row("160 m", 1850, 2000, "10 W (10 dBW) PEP", "primary"),
  row("80 m", 3500, 3800, W400, `primary; ${MM}`),
  row(
    "60 m",
    5000,
    5500,
    "200 W (23 dBW) PEP",
    "secondary; spot frequencies only: 5.280, 5.300, 5.332, 5.348, 5.400 and 5.405 MHz; CW, SSB and PM (A1A, J3E, G1B)",
  ),
  row("60 m", 5351.5, 5366.5, "15 W (12 dBW) e.i.r.p.", "secondary"),
  row("40 m", 7000, 7100, W400, `primary; ${MM}`),
  row("40 m", 7100, 7200, W400, `primary; ${MM}`),
  row("30 m", 10100, 10130, W400, "secondary; Morse only"),
  row(
    "30 m",
    10130,
    10150,
    W400,
    "secondary; narrowband digital modes up to 500 Hz; no news bulletins; SSB only in emergencies involving immediate safety of life",
  ),
  row("20 m", 14000, 14350, W400, `primary; ${MM}`),
  row("17 m", 18068, 18168, W400, `primary; ${MM}`),
  row("15 m", 21000, 21450, W400, `primary; ${MM}`),
  row("12 m", 24890, 24990, W400, `primary; ${MM}`),
  row("10 m", 28000, 29700, W400, `primary; ${MM}`),
  row("30 to 49 MHz", 30000, 49000, W50, "secondary"),
  row("6 m", 50000, 52000, "100 W (20 dBW) PEP", "secondary"),
  row("54 to 69.9 MHz", 54000, 69900, W50, "secondary"),
  row("4 m", 69900, 70500, W50, "secondary; fixed operation only (the table also gives 25 W (14 dBW) PEP for mobile operation)"),
  row("2 m", 144000, 146000, W400, `primary; ${MM}`),
  row("70 cm", 430000, 432000, W50, "primary"),
  row("70 cm", 432000, 440000, W400, "primary"),
  row("23 cm", 1240000, 1300000, W158, "secondary"),
  row("13 cm", 2300000, 2400000, W158, "secondary"),
  row("6 cm", 5570000, 5650000, W158, "secondary"),
  row("6 cm", 5650000, 5850000, W158, "secondary"),
  row("3 cm", 10000000, 10500000, W158, "secondary; not 10.270 to 10.300 GHz; 10.450 to 10.500 GHz is used for amateur satellites"),
  row("24 GHz", 24000000, 24050000, W50, "primary"),
  row("47 GHz", 47000000, 47200000, W50, "primary"),
  row("76 GHz", 76000000, 77500000, W50, "secondary"),
  row("76 GHz", 77500000, 78000000, W50, "primary"),
  row("76 GHz", 78000000, 81000000, W50, "secondary"),
  row("134 GHz", 134000000, 136000000, W50, "primary"),
  row("134 GHz", 136000000, 141000000, W50, "secondary"),
  row("241 GHz", 241000000, 248000000, W50, "secondary"),
  row("241 GHz", 248000000, 250000000, W50, "primary"),
];

const NOTES = [
  "Mobile operation (in a vehicle, call sign /M): at most 17 dBW at the transmitter or amplifier output, and 14 dBW on 70.125 to 70.450 MHz. Give your location at the start and end of each contact or every 30 minutes, whichever is more often.",
  "Maritime mobile (/MM, which includes rivers and lakes): at most 10 dBW, with the master's or owner's approval.",
  "On islands within harbour areas (for example Spike Island in Cork harbour): at most 17 dBW PEP.",
  "Where the table sets no mode or bandwidth, ComReg sets none, but asks licensees to follow the Irish and IARU Region 1 band plans.",
  "By application, for up to 12 months: 1300 to 1304 MHz for repeaters only, and 2400 to 2450 MHz for satellite operation only at 25 W (14 dBW) PEP.",
  "Keep emissions within the ICNIRP guidelines, and have an SWR meter and an accurate way to check your frequency.",
  "The licence is for life. Confirm your details to ComReg every five years through eLicensing, and report changes within 28 days.",
  "Other than in emergencies or natural disasters, you may only communicate with other licensed amateur stations.",
];

const HOW_FEE =
  "Apply through ComReg's eLicensing site; a new licence costs €100 (€30 if you are 65 or over or receive a Disability Allowance or Pension).";

// ── The rules ───────────────────────────────────────────────────────────────

export const RULES_IE: CountryRadioRules = {
  country: "IE",
  regulator: "Commission for Communications Regulation (ComReg)",
  regulatorUrl: "https://www.comreg.ie/industry/radio-spectrum/licensing/search-licence-type/radio-amateurs-2/",
  summary:
    "ComReg issues one amateur station licence at the HAREC standard, as CEPT Class 1 (with a Morse test) or CEPT Class 2 (without). Both have the same bands and powers. The IRTS runs the exams for ComReg.",
  classes: [
    {
      id: "ie-cept-class-1",
      name: "CEPT Class 1",
      how: `Pass the HAREC exam and a Morse test at 5 words a minute (both run by the IRTS). ${HOW_FEE}`,
      privileges: BANDS,
      notes: [
        "The bands and powers are the same as for CEPT Class 2. Moving from Class 2 to Class 1 is the only time ComReg changes a call sign.",
        ...NOTES,
      ],
      sources: [COMREG_0945],
    },
    {
      id: "ie-cept-class-2",
      name: "CEPT Class 2",
      how: `Pass the HAREC exam (run by the IRTS). ${HOW_FEE}`,
      privileges: BANDS,
      notes: [
        "The bands and powers are the same as for CEPT Class 1. ComReg does not accept novice or intermediate licences from other countries.",
        ...NOTES,
      ],
      sources: [COMREG_0945],
    },
  ],
  licenceFree: [
    {
      name: "PMR446 (analogue)",
      frequencies: "446.0 to 446.1 MHz, 8 channels: 446.00625 to 446.09375 MHz, 12.5 kHz apart",
      power: "500 mW e.r.p.",
      licence: "No licence",
      note: "Hand-portable radios with integral antennas, for speech, with CTCSS or DCS tone control (S.I. 93 of 1998). ComReg's table still lists only these eight channels for analogue PMR446.",
      frequencyEntryId: "lf-pmr446-analogue",
      sources: [COMREG_SRD, SI_93_1998],
    },
    {
      name: "PMR446 (digital)",
      frequencies: "446.1 to 446.2 MHz, 6.25 or 12.5 kHz channels",
      power: "50 mW e.r.p.",
      licence: "No licence",
      note: "Hand-portable digital PMR446 (ComReg 02/71 R16, Table 13).",
      frequencyEntryId: "lf-pmr446-digital",
      sources: [COMREG_SRD],
    },
    {
      name: "CB (27 MHz)",
      frequencies: "26.960 to 27.410 MHz (the CEPT band)",
      power: "Not given in the ComReg documents read",
      licence: "No licence, for CB radios used only to send and receive speech",
      note: "S.I. 436 of 1998 exempts FM (PR 27) and AM/SSB CB radios that meet the ETSI standards. ComReg's short range devices table points to the European CB decision, ECC/DEC/(11)03.",
      frequencyEntryId: "lf-cb-cept",
      sources: [COMREG_SRD, SI_436_1998],
    },
    {
      name: "Short range devices at 868 MHz (LoRa, Meshtastic)",
      frequencies: "868.0 to 868.6 MHz; 869.4 to 869.65 MHz",
      power: "868.0 to 868.6 MHz: 25 mW; 869.4 to 869.65 MHz: 500 mW e.r.p.",
      licence: "No licence",
      note: "Duty cycle at most 1 per cent (868.0 to 868.6 MHz) or 10 per cent (869.4 to 869.65 MHz), or listen-before-talk with adaptive frequency agility (ComReg 02/71 R16, bands 15g and 15i). ComReg names no products; it is the band LoRa mesh radios sold for Europe use.",
      sources: [COMREG_SRD],
    },
  ],
  notRead: [
    "ComReg's own amateur radio web page could not be read (it asks the browser to run a script first), so it was not confirmed that 09/45R6 (May 2023) is still the current edition; no later revision was found.",
    "No CB power limit appears in S.I. 436 of 1998 or in ComReg 02/71 R16, and the European CB decision ECC/DEC/(11)03 was not read for this page, so the CB power is left out.",
    "Amendments to S.I. 436 of 1998 (the CB order) were not read.",
  ],
};
