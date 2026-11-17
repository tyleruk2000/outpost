/**
 * Frequencies to listen to: the kind "licence-free". See radio-frequencies.ts for the shape and
 * docs/radio-frequencies.md for how entries are sourced and checked.
 *
 * Channel tables are written out from the regulator's own table where it gives one. Where a
 * table is a regular step (PMR446, the 462 MHz channels, UHF CB), the list is built here from
 * the lowest carrier and the spacing the source gives, and the result was compared with the
 * source's table entry by entry on the day checked.
 */
import type { Frequency, FrequencyEntry, FrequencyGuide, FrequencySource } from "../radio-frequencies.ts";

const CHECKED = "2026-11-17";

// ── Sources ─────────────────────────────────────────────────────────────────

const ECC_15_05: FrequencySource = {
  publisher: "CEPT Electronic Communications Committee",
  title: "ECC Decision (15)05 on analogue and digital PMR 446, approved 3 July 2015, amended 2 March 2018",
  url: "https://docdb.cept.org/download/1491",
  checked: CHECKED,
};
const ECC_11_03: FrequencySource = {
  publisher: "CEPT Electronic Communications Committee",
  title: "ECC Decision (11)03, the harmonised use of frequencies for Citizens' Band (CB) radio equipment, amended 17 June 2016",
  url: "https://docdb.cept.org/download/1540",
  checked: CHECKED,
};
const ERC_70_03: FrequencySource = {
  publisher: "CEPT Electronic Communications Committee",
  title: "ERC Recommendation 70-03 relating to the use of Short Range Devices, amended 9 October 2026, Annex 1",
  url: "https://docdb.cept.org/download/5013",
  checked: CHECKED,
};
const OFCOM_IR2030: FrequencySource = {
  publisher: "Ofcom",
  title: "UK Interface Requirement 2030, Licence exempt Short Range Devices, published 23 October 2026",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir-2030.pdf",
  checked: CHECKED,
};
const OFCOM_PMR446: FrequencySource = {
  publisher: "Ofcom",
  title: "Analogue and Digital PMR446 Information Sheet, February 2018",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/manage-your-licence/business-radio/business-radio-guidance/ir_2009_analogue_and_digita1.pdf",
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
const OFCOM_CB_GUIDE: FrequencySource = {
  publisher: "Ofcom",
  title: "Citizens' Band (CB) radio spectrum use: information and operation, guidance, March 2018",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/spectrum-enforcement/citizens-band.pdf",
  checked: CHECKED,
};
const BNETZA_CB: FrequencySource = {
  publisher: "Bundesnetzagentur",
  title: "Vfg Nr. 21/2021, Allgemeinzuteilung von Frequenzen für den CB-Funk",
  url: "https://www.bundesnetzagentur.de/DE/Fachthemen/Telekommunikation/Frequenzen/Allgemeinzuteilungen/_DL/MobilfunkDectWlanCBFunk/vfg21_2021.pdf?__blob=publicationFile&v=2",
  checked: CHECKED,
};
const ECFR_95: FrequencySource = {
  publisher: "US Government Publishing Office (govinfo)",
  title:
    "47 CFR Part 95, Personal Radio Services, Code of Federal Regulations, 1 October 2025 edition (sections 95.563, 95.567, 95.931, 95.933, 95.963, 95.967, 95.1705, 95.1731, 95.1763, 95.1767, 95.2763, 95.2767, 95.2771)",
  url: "https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/pdf/CFR-2025-title47-vol5-part95.pdf",
  checked: CHECKED,
};
const ISED_RSS210: FrequencySource = {
  publisher: "Innovation, Science and Economic Development Canada",
  title: "RSS-210, Licence-Exempt Radio Apparatus: Category I Equipment, Issue 11, Annex E",
  url: "https://ised-isde.canada.ca/site/spectrum-management-telecommunications/en/devices-and-equipment/radio-equipment-standards/radio-standards-specifications-rss/rss-210-licence-exempt-radio-apparatus-category-i-equipment",
  checked: CHECKED,
};
const ISED_RIC18: FrequencySource = {
  publisher: "Innovation, Science and Economic Development Canada",
  title: "RIC-18, General Radio Service (GRS), Issue 5, June 2024",
  url: "https://ised-isde.canada.ca/site/spectrum-management-telecommunications/en/licences-and-certificates/radiocom-information-circulars-ric/ric-18-general-radio-service-grs",
  checked: CHECKED,
};
const ACMA_CB_2025: FrequencySource = {
  publisher: "Australian Communications and Media Authority (Federal Register of Legislation)",
  title: "Radiocommunications (Citizen Band Radio Stations) Class Licence 2025, F2025L01088",
  url: "https://www.legislation.gov.au/F2025L01088/asmade/2025-09-15/text/original/pdf",
  checked: CHECKED,
};
const NZ_GURL: FrequencySource = {
  publisher: "New Zealand Gazette (Radio Spectrum Management)",
  title: "Radiocommunications Regulations (General User Radio Licence for Citizen Band Radio) Notice 2011, 2011-go3629",
  url: "https://gazette.govt.nz/notice/id/2011-go3629",
  checked: CHECKED,
};
const RSM_CB: FrequencySource = {
  publisher: "Radio Spectrum Management, New Zealand",
  title: "Citizen Band Radio GURL",
  url: "https://www.rsm.govt.nz/licensing/frequencies-for-anyone/citizen-band-radio-gurl",
  checked: CHECKED,
};
const JP_RULES: FrequencySource = {
  publisher: "e-Gov (Digital Agency, Japan)",
  title: "電波法施行規則 (Radio Law Enforcement Regulations), Article 6, paragraph 3",
  url: "https://laws.e-gov.go.jp/api/1/lawdata/325M50080000014",
  checked: CHECKED,
};
const MCMC_CA: FrequencySource = {
  publisher: "Malaysian Communications and Multimedia Commission",
  title: "Class Assignment No. 2 of 2025, Fourth Schedule, Personal Radio Service Device",
  url: "https://www.mcmc.gov.my/skmmgovmy/media/General/pdf2/Class-Assignment-No-2-of-2025.pdf",
  checked: CHECKED,
};
const ICASA_B: FrequencySource = {
  publisher: "Independent Communications Authority of South Africa (Government Gazette 48643)",
  title: "Notice 1822 of 2023, amendment of Annexure B of the Radio Frequency Spectrum Regulations",
  url: "https://www.gov.za/sites/default/files/gcis_document/202305/48643gon1822.pdf",
  checked: CHECKED,
};

// ── Channel tables ──────────────────────────────────────────────────────────

/**
 * The 40 CB channels of the US, CEPT, Canada and Australia, in kHz, in channel order. Note 23, 24
 * and 25: 27.255, 27.235, 27.245 MHz (47 CFR 95.963, Ofcom IR 2027 Table 3.2, ISED RIC-18 Annex B).
 */
const CB40_KHZ = [
  26965, 26975, 26985, 27005, 27015, 27025, 27035, 27055, 27065, 27075, 27085, 27105, 27115, 27125, 27135, 27155, 27165, 27175, 27185,
  27205, 27215, 27225, 27255, 27235, 27245, 27265, 27275, 27285, 27295, 27305, 27315, 27325, 27335, 27345, 27355, 27365, 27375, 27385,
  27395, 27405,
] as const;

const cb40 = (notes: Record<number, string> = {}): Frequency[] =>
  CB40_KHZ.map((khz, index) => {
    const channel = index + 1;
    const note = notes[channel];
    return note ? { khz, channel: String(channel), note } : { khz, channel: String(channel) };
  });

/** UK band: 27.60125 MHz plus 10 kHz a channel, channels 1 to 40 (Ofcom IR 2027 Table 3.2). */
const UK_CB_BAND: Frequency[] = Array.from({ length: 40 }, (_, index) => ({
  khz: 27_601.25 + 10 * index,
  channel: `UK ${index + 1}`,
}));

/** Germany's channels 41 to 80: 26.565 MHz plus 10 kHz a channel (Vfg. 21/2021 § 1). */
const DE_CB_41_80: Frequency[] = Array.from({ length: 40 }, (_, index) => {
  const channel = 41 + index;
  const notes: Record<number, string> = {
    41: "Also for voice through unattended automatic stations (FM only)",
    52: "Also for digital data",
    53: "Also for digital data",
    61: "Also for voice through unattended automatic stations (FM only)",
    71: "Also for voice through unattended automatic stations (FM only)",
    76: "Also for digital data",
    77: "Also for digital data",
    80: "Also for voice through unattended automatic stations (FM only)",
  };
  const note = notes[channel];
  const khz = 26_565 + 10 * index;
  return note ? { khz, channel: String(channel), note } : { khz, channel: String(channel) };
});

/** New Zealand's CB Low channels CBL01 to CBL40 (Gazette 2011-go3629 schedule): the CB40 pattern 635 kHz lower. */
const NZ_CBL_KHZ = [
  26330, 26340, 26350, 26370, 26380, 26390, 26400, 26420, 26430, 26440, 26450, 26470, 26480, 26490, 26500, 26520, 26530, 26540, 26550,
  26570, 26580, 26590, 26620, 26600, 26610, 26630, 26640, 26650, 26660, 26670, 26680, 26690, 26700, 26710, 26720, 26730, 26740, 26750,
  26760, 26770,
] as const;

/** PMR446 analogue (and digital 12.5 kHz): lowest carrier 446.00625 MHz, 12.5 kHz spacing (ECC/DEC/(15)05 decides 2). */
const pmr446Analogue = (count: number): Frequency[] =>
  Array.from({ length: count }, (_, index) => ({ khz: 446_006.25 + 12.5 * index, channel: String(index + 1) }));

/** PMR446 digital 6.25 kHz: lowest carrier 446.003125 MHz (whole band) or 446.103125 MHz (upper half). */
const pmr446Digital = (fromKhz: number, count: number): Frequency[] =>
  Array.from({ length: count }, (_, index) => ({ khz: fromKhz + 6.25 * index, channel: String(index + 1) }));

/** FRS channel table of 47 CFR 95.563 and RSS-210 Table E1, in kHz, in channel order. */
const FRS_KHZ = [
  462562.5, 462587.5, 462612.5, 462637.5, 462662.5, 462687.5, 462712.5, 467562.5, 467587.5, 467612.5, 467637.5, 467662.5, 467687.5,
  467712.5, 462550, 462575, 462600, 462625, 462650, 462675, 462700, 462725,
] as const;

/** UHF CB channel n: 1 to 40 at 476.425 MHz plus 25 kHz a channel, 41 to 80 at 476.4375 MHz plus 25 kHz (ACMA Schedule 1; NZ PRS table). */
const uhfCbKhz = (channel: number): number => (channel <= 40 ? 476_400 + 25 * channel : 476_437.5 + 25 * (channel - 41));

// ── Entries ─────────────────────────────────────────────────────────────────

export const LICENCE_FREE: FrequencyEntry[] = [
  // ── Europe ──
  {
    id: "lf-pmr446-analogue",
    kind: "licence-free",
    name: "PMR446, analogue walkie-talkies (Europe)",
    what: "The licence-exempt walkie-talkie service of Europe: sixteen narrow FM channels at 446 MHz, used by families, shops, events and hikers. Radios are hand-held with a fixed antenna, at most 500 mW.",
    frequencies: pmr446Analogue(16),
    modes: ["NFM"],
    bands: ["pmr446"],
    where: ["cept"],
    expect: "Short conversations in plain speech on narrow FM from people close by.",
    reception: "Short range: no base stations or repeaters are allowed and power is at most 500 mW, so what you hear is close by.",
    listening:
      "Under the European decision (ECC/DEC/(15)05) and Ofcom's IR 2030 anyone may use compliant equipment without a licence: hand-portable, integral antenna, 500 mW e.r.p., no base station, repeater or airborne use.",
    status: "on-air",
    notes: [
      "Until the 2015 decision the analogue band was 446.0 to 446.1 MHz, channels 1 to 8, and many radios still have only those eight.",
      "Channel numbers are the usual numbering in order of frequency, worked out from the lowest carrier (446.00625 MHz) and the 12.5 kHz spacing the decision gives.",
      'Ofcom: analogue PMR446 "is harmonised throughout Europe", so a compliant analogue radio from the UK may be used licence-exempt in other European countries.',
      'Ofcom: American FRS equipment "cannot be used within the UK on a licence-exempt basis" and is "likely to cause harmful interference to frequencies used by the Home Office".',
    ],
    links: [{ to: "/radio/plans", label: "Communication plans" }],
    sources: [ECC_15_05, OFCOM_IR2030, OFCOM_PMR446],
    aliases: ["PMR 446", "walkie talkie", "two-way radio", "licence free radio"],
  },
  {
    id: "lf-pmr446-digital",
    kind: "licence-free",
    name: "PMR446, digital (dPMR446 and DMR tier 1)",
    what: "Digital PMR446 in the same 446.0 to 446.2 MHz band: 6.25 kHz channels (dPMR446) or 12.5 kHz channels (DMR tier 1, on the same sixteen frequencies as analogue PMR446).",
    frequencies: pmr446Digital(446_003.125, 32).map((frequency) => ({ ...frequency, note: "6.25 kHz channel" })),
    modes: ["DPMR", "DMR"],
    bands: ["pmr446"],
    where: ["cept"],
    expect:
      "Digital voice: an analogue set hears a harsh buzz or nothing. A digital set of the same system (dPMR or DMR) is needed to hear speech.",
    reception: "As analogue PMR446: short range, hand-held only.",
    listening:
      'The European decision opens the whole band to digital PMR446 from 1 January 2018. Ofcom (2018): digital PMR446 "is not harmonised throughout Europe"; radios carry a CE mark with an exclamation mark and a list of the countries where they may be used.',
    status: "on-air",
    notes: [
      "The 12.5 kHz digital channels use the sixteen analogue frequencies (lowest carrier 446.00625 MHz); the 6.25 kHz channels listed here start at 446.003125 MHz (ECC/DEC/(15)05 decides 4).",
      "Before 2018 digital PMR446 was 446.1 to 446.2 MHz only (lowest carriers 446.103125 and 446.10625 MHz), and older sets may use only that half.",
      "Ofcom: digital PMR446 has an automatic transmission time-out of 180 seconds; overlapping 6.25 kHz and 12.5 kHz channels can interfere with each other.",
    ],
    sources: [ECC_15_05, OFCOM_PMR446, OFCOM_IR2030],
    aliases: ["dPMR446", "DMR446", "digital walkie talkie"],
  },
  {
    id: "lf-cb-cept",
    kind: "licence-free",
    name: "CB radio, the 40 CEPT channels (Europe)",
    what: "Citizens' Band on 27 MHz as harmonised across Europe: forty channels 10 kHz apart from 26.965 to 27.405 MHz, the same frequencies as the US channels, on FM, AM and SSB.",
    frequencies: cb40(),
    modes: ["NFM", "AM", "USB", "LSB"],
    bands: ["cb"],
    where: ["cept"],
    expect:
      "Local users talking on FM or AM; SSB users need a set with SSB to be understood. When 27 MHz is open by sky wave, stations from far away come in.",
    reception: "Mostly local; much further by sky wave when 27 MHz is open. See the propagation screen.",
    listening:
      "ECC/DEC/(11)03 asks CEPT administrations to exempt CB from individual licensing at 4 W for FM, 4 W (r.m.s.) for AM (DSB) and 12 W PEP for SSB. Each country applies it itself; check the country's own rules before transmitting.",
    status: "on-air",
    notes: [
      "The decision's band is 26.960 to 27.410 MHz, excluding the centre frequencies 26.995, 27.045, 27.095, 27.145 and 27.195 MHz (used by models and other short range devices).",
      "The European decision names no emergency or calling channel. Where a country names one, its entry says so.",
      'UK: Ofcom applies the decision on the CEPT band (IR 2027 for FM, IR 2027.2 for AM and SSB) and says CB "is not afforded any protection".',
    ],
    links: [{ to: "/radio/propagation", label: "Is 27 MHz open now" }],
    sources: [ECC_11_03, OFCOM_IR2027, OFCOM_IR2027_2],
    aliases: ["citizens band", "27 MHz", "CEPT CB", "EU channels", "11 metres"],
  },
  {
    id: "lf-cb-uk",
    kind: "licence-free",
    name: "CB radio, the UK's own 40 channels (27/81)",
    what: "A second set of forty CB channels used only in the United Kingdom, 27.60125 to 27.99125 MHz, FM only. UK sets usually have both this band and the CEPT band.",
    frequencies: UK_CB_BAND,
    modes: ["NFM"],
    bands: ["cb"],
    where: ["GB"],
    expect: "Local users on FM. A UK-band channel number is not the same frequency as a CEPT channel of the same number.",
    reception: "Mostly local; UK stations only.",
    listening:
      "Licence-exempt under Ofcom IR 2027 (FM, 4 W). Ofcom: equipment with the UK channels may not be used abroad. Using CB equipment that does not conform to the interface requirements is an offence.",
    status: "on-air",
    notes: [
      'Ofcom\'s operating guidance (2018): "you should leave Channel 9 clear for emergencies, Channel 14 for calling and Channel 19 for mobile use". These are conventions, not law: Ofcom says channel 9 being kept clear "is not a legal requirement". The guidance does not say which of the two bands it means.',
      'Ofcom: there is no official monitoring of CB, the emergency services "generally" do not monitor channel 9, and CB is no substitute for 999 or marine distress channels.',
      "IR 2027 recommends that a set shows which band (EU/CEPT or UK) it is on.",
    ],
    sources: [OFCOM_IR2027, OFCOM_CB_GUIDE],
    aliases: ["UK CB", "27/81", "UK 40", "citizens band"],
  },
  {
    id: "lf-cb-de",
    kind: "licence-free",
    name: "CB radio in Germany, channels 41 to 80",
    what: "Germany allows 80 CB channels: the 40 CEPT channels and a national extension, channels 41 to 80, from 26.565 to 26.955 MHz, on FM only. The general assignment runs to 31 December 2030.",
    frequencies: DE_CB_41_80,
    modes: ["NFM"],
    bands: ["cb"],
    where: ["DE"],
    expect: "FM speech as on the CEPT channels; some channels carry data or relays through unattended stations.",
    reception: "Mostly local; further by sky wave when 27 MHz is open.",
    listening:
      "Bundesnetzagentur Vfg. 21/2021: anyone may use these frequencies under its conditions. Channels 1 to 80 on FM (4 W ERP); channels 1 to 40 also on AM (4 W ERP) and SSB (12 W PEP). Fixed stations on channels 41 to 80 are not allowed in the listed border districts.",
    status: "on-air",
    notes: [
      "Channels 1 to 40 are the CEPT channels (see that entry). Of them, 11, 29, 34, 39 and 40 may also carry voice through unattended automatic stations, and 6, 7, 24 and 25 digital data.",
      "Vfg. 21/2021 notes that near the Swiss border channel 40 can disturb Swiss CB users, as Switzerland uses that channel as a calling channel.",
      "Channels 41 to 80 are national: they are not part of the European decision and are not available in most other countries.",
    ],
    sources: [BNETZA_CB],
    aliases: ["CB-Funk", "80 Kanal", "Germany CB"],
  },
  {
    id: "lf-lpd433",
    kind: "licence-free",
    name: "LPD433, 433 MHz low-power walkie-talkies",
    what: "Hand-held radios sold as LPD or LPD433 use the 433.05 to 434.79 MHz band set aside across Europe for low-power short range devices of any kind (car keys, weather sensors, door bells), at 10 mW.",
    frequencies: [{ khz: 433_050, toKhz: 434_790 }],
    modes: ["NFM"],
    bands: ["lpd433"],
    where: ["cept", "ZA"],
    expect:
      "Faint speech from close by, mixed with bursts of data from the telemetry, telecommand and alarm devices the band is mainly meant for (ERC 70-03 Annex 1 scope).",
    reception: "Very short range at 10 mW.",
    listening:
      "ERC Recommendation 70-03 Annex 1 band g1 (433.05 to 434.79 MHz, 10 mW e.r.p., duty cycle 10 per cent or less), g2 (1 mW) and g3 (434.04 to 434.79 MHz, 10 mW, up to 100 per cent duty cycle with 25 kHz or less bandwidth). Ofcom IR 2030 and South Africa's Annexure B (ICASA) list the same rows.",
    status: "on-air",
    notes: [
      "The European recommendation sets no channels: the channel numbers printed on LPD433 radios are the maker's.",
      "National restrictions on voice differ: in the recommendation's national table Ireland allows voice on band g2 only with 25 kHz bandwidth, listen-before-talk and at most one minute a transmission.",
      "The band lies inside the 70 cm amateur band. Ofcom: some of these channels line up with the inputs of UK amateur repeaters.",
      "Outside Europe these frequencies are often not licence-free for voice; check the country's own rules.",
    ],
    sources: [ERC_70_03, OFCOM_IR2030, OFCOM_PMR446, ICASA_B],
    aliases: ["LPD", "433 MHz", "short range device", "SRD"],
  },
  // ── United States and Canada ──
  {
    id: "lf-frs",
    kind: "licence-free",
    name: "FRS, Family Radio Service (USA)",
    what: "The US licence-free walkie-talkie service: 22 channels at 462 and 467 MHz, 2 W (0.5 W on channels 8 to 14), shared with GMRS.",
    frequencies: FRS_KHZ.map((khz, index) => {
      const channel = index + 1;
      const note = channel >= 8 && channel <= 14 ? "0.5 W ERP" : "2 W ERP";
      return { khz, channel: String(channel), note };
    }),
    modes: ["NFM"],
    bands: ["frs-gmrs"],
    where: ["US"],
    expect: "Speech on narrow FM from nearby users, and GMRS users at higher power on the same channels.",
    reception: "Short range; GMRS repeaters on the 462 MHz main channels carry further.",
    listening:
      "FRS is authorised by rule (no licence), radios with integral antennas and only these channels (47 CFR 95.563, 95.567). GMRS on the same channels needs an FCC licence.",
    status: "on-air",
    notes: [
      "Channels 1 to 7 and 15 to 22 are also GMRS channels; 8 to 14 (467 MHz) are shared with GMRS hand-helds at 0.5 W.",
      "Not legal in Europe: Ofcom says FRS equipment cannot be used in the UK licence-exempt.",
    ],
    links: [{ to: "/radio/plans", label: "Communication plans" }],
    sources: [ECFR_95, OFCOM_PMR446],
    aliases: ["Family Radio Service", "22 channel", "walkie talkie"],
  },
  {
    id: "lf-gmrs",
    kind: "licence-free",
    name: "GMRS, General Mobile Radio Service (USA, licence needed)",
    what: "The US service on the same 462 and 467 MHz channels as FRS, at up to 50 W and with repeaters. It needs an FCC licence (no exam), which covers the holder's immediate family.",
    frequencies: [
      ...[462_550, 462_575, 462_600, 462_625, 462_650, 462_675, 462_700, 462_725].map((khz, index) => ({
        khz,
        channel: String(15 + index),
        note: "462 MHz main channel: simplex, and repeater output",
      })),
      ...[467_550, 467_575, 467_600, 467_625, 467_650, 467_675, 467_700, 467_725].map((khz) => ({
        khz,
        note: "467 MHz main channel: mobile and hand-held stations may use it only to talk through a repeater (or for brief tests)",
      })),
    ],
    modes: ["NFM"],
    bands: ["frs-gmrs"],
    where: ["US"],
    expect:
      "Speech on narrow FM, with repeaters relaying users on the 462 MHz main channels. Listening on the 462 MHz frequencies hears both FRS and GMRS users.",
    reception: "Simplex short range; further through a repeater.",
    listening:
      "Transmitting needs an individual GMRS licence (47 CFR 95.1705): an individual of 18 or over; immediate family may operate; anyone may use a licensee's station to pass an emergency message. Listening needs no licence.",
    status: "on-air",
    notes: [
      "47 CFR 95.1763: 16 main channels (462 and 467 MHz) and 14 interstitial channels; the interstitial channels are the FRS channels 1 to 14 (see that entry).",
      "Power (95.1767): 50 W transmitter output on main channels (15 W for fixed stations), 5 W ERP on 462 MHz interstitials, 0.5 W ERP on 467 MHz interstitials.",
      "The rules do not number the 467 MHz main channels; the numbers given here for the 462 MHz main channels are those of the FRS table.",
      "95.1731: any GMRS channel may be used for emergency communications or traveller assistance, and emergency messages have priority on all channels. No channel is named as an emergency channel.",
    ],
    sources: [ECFR_95],
    aliases: ["General Mobile Radio Service", "GMRS repeater", "462 MHz"],
  },
  {
    id: "lf-murs",
    kind: "licence-free",
    name: "MURS, Multi-Use Radio Service (USA)",
    what: "Five licence-free VHF channels in the US, 151.820 to 154.600 MHz, at 2 W.",
    frequencies: [
      { khz: 151_820, note: "11.25 kHz bandwidth" },
      { khz: 151_880, note: "11.25 kHz bandwidth" },
      { khz: 151_940, note: "11.25 kHz bandwidth" },
      { khz: 154_570, note: "20 kHz bandwidth" },
      { khz: 154_600, note: "20 kHz bandwidth" },
    ],
    modes: ["NFM"],
    bands: ["murs"],
    where: ["US"],
    expect: "Speech on narrow FM; MURS also allows data emissions (95.2771).",
    reception: "Short range; the antenna height is limited by the rules.",
    listening: "Licence-free under 47 CFR Part 95 Subpart J; transmitter power at most 2 W (95.2767).",
    status: "on-air",
    notes: ["The rules name the channels by frequency only (95.2763); the numbers 1 to 5 printed on radios are simply this order."],
    sources: [ECFR_95],
    aliases: ["Multi-Use Radio Service", "151 MHz", "154 MHz"],
  },
  {
    id: "lf-cb-us",
    kind: "licence-free",
    name: "CB radio in the United States",
    what: "Citizens Band Radio Service: forty channels at 27 MHz, AM or FM at 4 W and SSB at 12 W PEP, no licence.",
    frequencies: cb40({
      9: "Emergency communications and traveller assistance only (47 CFR 95.931)",
    }),
    modes: ["AM", "NFM", "USB", "LSB"],
    bands: ["cb"],
    where: ["US"],
    expect: "Local users on AM and FM; SSB users need a set with SSB to be understood. Distant stations when 27 MHz is open.",
    reception: "Mostly local; much further by sky wave when the band is open.",
    listening: "Authorised by rule (no licence). 47 CFR 95.967: 4 W mean carrier power (AM or FM), 12 W PEP (SSB).",
    status: "on-air",
    notes: [
      '47 CFR 95.931: "CBRS Channel 9 may be used only for emergency communications or traveler assistance", and operators "must, at all times and on all channels, give priority to emergency communications".',
      "The FCC rules name no road or calling channel.",
      "95.933: CB stations must not communicate with stations in other countries, except General Radio Service stations in Canada.",
    ],
    links: [{ to: "/radio/propagation", label: "Is 27 MHz open now" }],
    sources: [ECFR_95],
    aliases: ["CBRS", "citizens band", "channel 9", "channel 19", "27 MHz"],
  },
  {
    id: "lf-cb-ca",
    kind: "licence-free",
    name: "CB radio in Canada (General Radio Service)",
    what: "Canada's licence-exempt 27 MHz service, the General Radio Service: the same forty channels as the US.",
    frequencies: cb40({
      9: "Emergency communications only (RIC-18)",
      11: "Widely used as a calling channel (RIC-18)",
      13: "Sea search and rescue (RIC-18)",
      19: "Used in many areas as a road information channel (RIC-18)",
      23: "Land search and rescue (RIC-18)",
    }),
    modes: ["AM", "USB", "LSB"],
    bands: ["cb"],
    where: ["CA"],
    expect: "Local users on AM and SSB; search and rescue traffic at times on channels 13 and 23.",
    reception: "Mostly local; further by sky wave when the band is open.",
    listening:
      "Exempt from licensing for certified equipment (RIC-18). Power: 4 W carrier, 12 W PEP for SSB. RIC-18: operators may use a GRS station anywhere in Canada and the United States, subject to applicable laws.",
    status: "on-air",
    notes: [
      'RIC-18: "Federal, provincial, and municipal emergency communications have priority over all other communications on channel 13 (marine operations) and channel 23 (land operations)."',
      "RIC-18 Section 7: channel 9 is for real or imminent threats to life, safety or property, for example road accidents, downed power lines, medical emergencies and fires.",
    ],
    links: [{ to: "/radio/propagation", label: "Is 27 MHz open now" }],
    sources: [ISED_RIC18],
    aliases: ["GRS", "General Radio Service", "citizens band", "channel 9", "channel 19"],
  },
  {
    id: "lf-frs-gmrs-ca",
    kind: "licence-free",
    name: "FRS and GMRS radios in Canada",
    what: "In Canada FRS/GMRS hand-helds are licence-exempt on the same 22 channels as the US, at 2 W e.r.p. (0.5 W on channels 8 to 14). There are no licensed GMRS repeaters or 50 W stations as in the US.",
    frequencies: FRS_KHZ.map((khz, index) => {
      const channel = index + 1;
      const note = channel >= 8 && channel <= 14 ? "0.5 W e.r.p." : "2 W e.r.p.";
      return { khz, channel: String(channel), note };
    }),
    modes: ["NFM"],
    bands: ["frs-gmrs"],
    where: ["CA"],
    expect: "Speech on narrow FM from nearby users.",
    reception: "Short range.",
    listening:
      "ISED RSS-210 Annex E sets the channels and the power for licence-exempt FRS/GMRS devices; it bars scrambling, telephone interconnection and store-and-forward data.",
    status: "on-air",
    notes: ["RSS-210 Issue 11 gives no repeater channels; the US 467 MHz repeater inputs are not part of it."],
    links: [{ to: "/radio/plans", label: "Communication plans" }],
    sources: [ISED_RSS210],
    aliases: ["FRS", "GMRS", "Canada walkie talkie"],
  },
  // ── Australia and New Zealand ──
  {
    id: "lf-uhf-cb-au",
    kind: "licence-free",
    name: "UHF CB in Australia (80 channels)",
    what: "Australia's main licence-free two-way radio: UHF CB at 476 to 477 MHz, 80 channels of 12.5 kHz on FM at 5 W, with repeaters across the country. Channels 5 and 35 are for emergencies.",
    frequencies: Array.from({ length: 80 }, (_, index) => index + 1)
      .filter((channel) => channel < 61 || channel > 63)
      .map((channel) => {
        const notes: Record<number, string> = {
          5: "Emergency use only; also a repeater transmit channel",
          35: "Emergency use only; also a repeater receive channel",
          11: "Preferred if channel 5 cannot be used in an emergency (class licence note)",
          22: "Telemetry and data only: no speech",
          23: "Telemetry and data only: no speech",
        };
        const repeaterOut = (channel >= 1 && channel <= 8) || (channel >= 41 && channel <= 48);
        const repeaterIn = (channel >= 31 && channel <= 38) || (channel >= 71 && channel <= 78);
        const note =
          notes[channel] ?? (repeaterOut ? "Used by repeaters to transmit" : repeaterIn ? "Used by repeaters to receive" : undefined);
        const khz = uhfCbKhz(channel);
        return note ? { khz, channel: String(channel), note } : { khz, channel: String(channel) };
      }),
    modes: ["NFM"],
    bands: ["uhf-cb"],
    where: ["AU"],
    expect: "Speech on narrow FM; repeaters relaying users from further away on channels 1 to 8 and 41 to 48. Emergency calls on 5 or 35.",
    reception: "Simplex short to medium range; further through a repeater.",
    listening:
      "Radiocommunications (Citizen Band Radio Stations) Class Licence 2025: anyone may operate a compliant CB station. Channels 5 and 35 may be used only during an emergency or natural disaster, or by an emergency services organisation; speech must not be encrypted there.",
    status: "on-air",
    notes: [
      'Class licence note: "Emergency services organisations do not monitor these frequencies and channels", and their use is "not a substitute for calling Triple Zero".',
      "Channels 61, 62 and 63 are not in the class licence's table and must not be used.",
      "Older 40-channel sets use 25 kHz channels on the frequencies of channels 1 to 40.",
      "The class licence does not cover repeaters, which are licensed separately. A CB station must not cause interference to a repeater on channels 1 to 8, 41 to 48, 31 to 38 or 71 to 78.",
      "Audio tones must not be used to start a call on channels 5 and 35.",
    ],
    links: [{ to: "/radio/plans", label: "Communication plans" }],
    sources: [ACMA_CB_2025],
    aliases: ["UHF CB", "477 MHz", "channel 5", "channel 40", "ACMA"],
  },
  {
    id: "lf-cb-au-hf",
    kind: "licence-free",
    name: "27 MHz CB in Australia",
    what: "Australia's HF CB: the forty 27 MHz channels, AM or FM at 4 W and SSB at 12 W, under the same class licence as UHF CB.",
    frequencies: cb40({
      9: "Emergency use only (class licence section 7)",
      11: "AM or FM only; preferred if channel 9 cannot be used in an emergency",
      16: "SSB, lower sideband only; preferred if channel 9 cannot be used in an emergency",
    }),
    modes: ["AM", "NFM", "USB", "LSB"],
    bands: ["cb"],
    where: ["AU"],
    expect: "Local users on AM, FM and SSB, and distant stations when 27 MHz is open.",
    reception: "Mostly local; further by sky wave when the band is open.",
    listening:
      "Class Licence 2025: 4 W (AM or FM, 6 kHz bandwidth), 12 W PEP (SSB, 3 kHz). Channel 9 (27.065 MHz) only during an emergency or natural disaster, or by an emergency services organisation.",
    status: "on-air",
    notes: ["Emergency services organisations do not monitor these channels (class licence note)."],
    links: [{ to: "/radio/propagation", label: "Is 27 MHz open now" }],
    sources: [ACMA_CB_2025],
    aliases: ["HF CB", "27 MHz", "channel 9"],
  },
  {
    id: "lf-prs-nz",
    kind: "licence-free",
    name: "UHF CB (PRS) in New Zealand",
    what: "New Zealand's Personal Radio Service: UHF CB at 476 to 477 MHz under a general user radio licence, so no licence in your own name and no fee. 80 channels on FM.",
    frequencies: Array.from({ length: 80 }, (_, index) => index + 1).map((channel) => {
      const khz = uhfCbKhz(channel);
      const note =
        channel === 22 || channel === 23
          ? "Telemetry and telecommand only; data at most 10 seconds in 60 minutes"
          : channel <= 40
            ? "25 kHz channel (16K0F3E)"
            : "12.5 kHz channel (8K50F3E)";
      return { khz, channel: `PRS${String(channel).padStart(2, "0")}`, note };
    }),
    modes: ["NFM"],
    bands: ["uhf-cb"],
    where: ["NZ"],
    expect: "Speech on narrow FM, and repeaters where they are set up under their own licences.",
    reception: "Simplex short to medium range.",
    listening:
      "General User Radio Licence for Citizen Band Radio (Gazette notice 2011-go3629): 9.2 dBW e.i.r.p. The licence does not cover transmitters that retransmit automatically (repeaters). RSM: radios bought overseas may not work on New Zealand frequencies.",
    status: "on-air",
    notes: [
      "The 2011 notice names no emergency channel. Australia's channels 5 and 35 are an Australian rule.",
      "The channel frequencies are the same as Australia's UHF CB, and New Zealand also lists channels 61 to 63.",
    ],
    sources: [NZ_GURL, RSM_CB],
    aliases: ["PRS", "Personal Radio Service", "UHF CB", "476 MHz"],
  },
  {
    id: "lf-cb-nz",
    kind: "licence-free",
    name: "27 MHz CB in New Zealand (CBL and CBU)",
    what: "New Zealand's HF CB has two sets of forty channels: the usual 26.965 to 27.405 MHz channels (CBU) and a lower set from 26.330 to 26.770 MHz (CBL), AM and SSB.",
    frequencies: [
      ...NZ_CBL_KHZ.map((khz, index) => ({ khz, channel: `CBL${String(index + 1).padStart(2, "0")}` })),
      ...CB40_KHZ.map((khz, index) => ({ khz, channel: `CBU${String(index + 1).padStart(2, "0")}` })),
    ],
    modes: ["AM", "USB", "LSB"],
    bands: ["cb", "hf"],
    where: ["NZ"],
    expect: "Local users on AM and SSB; distant stations when the band is open.",
    reception: "Mostly local; further by sky wave when 27 MHz is open.",
    listening:
      "General User Radio Licence (Gazette notice 2011-go3629): SSB 12 W PEP e.i.r.p.; double sideband (AM) 4 W carrier e.i.r.p. The schedule lists AM and SSB emissions only.",
    status: "on-air",
    notes: [
      "The CBL channels are New Zealand only; they follow the same irregular steps as the usual channels, 635 kHz lower.",
      "The schedule names no emergency or calling channel.",
    ],
    links: [{ to: "/radio/propagation", label: "Is 27 MHz open now" }],
    sources: [NZ_GURL, RSM_CB],
    aliases: ["CB", "citizens band", "26 MHz", "CBL", "CBU"],
  },
  // ── Asia ──
  {
    id: "lf-cb-jp",
    kind: "licence-free",
    name: "Citizens' radio (市民ラジオ) in Japan",
    what: "Japan's licence-free 27 MHz radio: eight fixed frequencies between 26.968 and 27.144 MHz, AM, at 0.5 W. The frequencies are not the US or European CB channels.",
    frequencies: [
      { khz: 26_968 },
      { khz: 26_976 },
      { khz: 27_040 },
      { khz: 27_080 },
      { khz: 27_088 },
      { khz: 27_112 },
      { khz: 27_120 },
      { khz: 27_144 },
    ],
    modes: ["AM"],
    bands: ["cb"],
    where: ["JP"],
    expect: "AM speech from small 0.5 W sets; distant stations when 27 MHz is open.",
    reception: "Short range; further by sky wave when the band is open.",
    listening:
      "Radio Law Enforcement Regulations, Article 6(3): stations using A3E (AM) on these eight frequencies at 0.5 W or less are the licence-exempt stations of Radio Law Article 4(2).",
    status: "on-air",
    notes: [
      "The regulation gives frequencies only; channel numbers used by owners are not in it.",
      "A US or European CB set does not tune most of these frequencies, and using one in Japan is not covered by this exemption.",
    ],
    links: [{ to: "/radio/propagation", label: "Is 27 MHz open now" }],
    sources: [JP_RULES],
    aliases: ["市民ラジオ", "shimin radio", "Japan CB", "27 MHz"],
  },
  {
    id: "lf-cb-my",
    kind: "licence-free",
    name: "27 MHz CB in Malaysia (Personal Radio Service)",
    what: "Malaysia's class assignment lets anyone use forty 27 MHz CB channels, AM or FM at 4 W and single sideband at 12 W, with channel 9 for emergencies and channel 11 for calling.",
    frequencies: [
      26965, 26975, 26985, 27005, 27015, 27025, 27035, 27055, 27065, 27075, 27085, 27105, 27115, 27125, 27135, 27155, 27165, 27175, 27185,
      27205, 27215, 27225, 27235, 27245, 27255, 27265, 27275, 27285, 27295, 27305, 27315, 27325, 27335, 27345, 27355, 27365, 27375, 27385,
      27395, 27405,
    ].map((khz, index) => {
      const channel = index + 1;
      const note = channel === 9 ? "Reserved: emergency" : channel === 11 ? "Reserved: calling" : undefined;
      return note ? { khz, channel: String(channel), note } : { khz, channel: String(channel) };
    }),
    modes: ["AM", "NFM", "USB", "LSB"],
    bands: ["cb"],
    where: ["MY"],
    expect: "Local users on AM, FM and SSB; distant stations when the band is open.",
    reception: "Mostly local; further by sky wave when 27 MHz is open.",
    listening:
      "MCMC Class Assignment No. 2 of 2025, Fourth Schedule: no encryption; voice transmissions at most 180 seconds each; no telephone interconnection; a PRS device may be commandeered in an emergency.",
    status: "on-air",
    notes: [
      "The Malaysian table numbers channels 23, 24 and 25 in plain frequency order (27.235, 27.245, 27.255 MHz), unlike the US and CEPT tables, where channel 23 is 27.255 MHz. A US or European set's channels 23 to 25 are on different frequencies.",
      "The 2025 class assignment's Personal Radio Service bands are 27 MHz and 446 MHz only; it lists no 477 MHz band.",
    ],
    links: [{ to: "/radio/propagation", label: "Is 27 MHz open now" }],
    sources: [MCMC_CA],
    aliases: ["Malaysia CB", "PRS", "citizens band"],
  },
  {
    id: "lf-pmr446-my",
    kind: "licence-free",
    name: "PMR446 in Malaysia",
    what: "Malaysia allows analogue PMR446 on channels 1 to 8 (446.0 to 446.1 MHz) and digital PMR446 on sixteen 6.25 kHz channels from 446.103125 MHz, at 0.5 W.",
    frequencies: [
      ...pmr446Analogue(8).map((frequency) => ({ ...frequency, note: "Analogue FM, 12.5 kHz" })),
      ...pmr446Digital(446_103.125, 16).map((frequency) => ({
        ...frequency,
        channel: `D${frequency.channel}`,
        note: "Digital 4FSK, 6.25 kHz",
      })),
    ],
    modes: ["NFM", "DPMR"],
    bands: ["pmr446"],
    where: ["MY"],
    expect: "Short-range speech on narrow FM; digital channels need a digital set.",
    reception: "Short range.",
    listening: "MCMC Class Assignment No. 2 of 2025, Fourth Schedule, Tables 4-2 and 4-3: 0.5 W maximum ERP, no encryption.",
    status: "on-air",
    notes: [
      "European analogue channels 9 to 16 (446.1 to 446.2 MHz) are not in the Malaysian analogue table.",
      'The "D" channel numbers here are this list\'s; the Malaysian table numbers the digital channels 1 to 16.',
    ],
    sources: [MCMC_CA],
    aliases: ["PMR 446", "walkie talkie", "Malaysia"],
  },
  // ── Africa ──
  {
    id: "lf-cb-za",
    kind: "licence-free",
    name: "CB radio in South Africa",
    what: "South Africa lists 27 MHz CB among the apparatus exempt from a radio frequency spectrum licence: 26.96 to 27.41 MHz, 4 W for AM and 12 W for SSB.",
    frequencies: [{ khz: 26_960, toKhz: 27_410 }],
    modes: ["AM", "USB", "LSB", "NFM"],
    bands: ["cb"],
    where: ["ZA"],
    expect: "Local users on AM and SSB; distant stations when 27 MHz is open.",
    reception: "Mostly local; further by sky wave when the band is open.",
    listening:
      "ICASA Radio Frequency Spectrum Regulations, Annexure B (as substituted by Notice 1822 of 2023): Citizens Band radio, 4 W e.r.p. for DSB (AM), 12 W e.r.p. for SSB, equipment to EN 300 433, referring to CEPT ERC/REC 70-03.",
    status: "on-air",
    notes: [
      "Annexure B gives the band, not a channel table, and names no emergency channel. EN 300 433 is the European CB standard, so the European 40-channel plan applies in practice; that is inferred, not stated.",
      "ICASA has begun a review of Annexure B; the 2023 text is the latest read.",
    ],
    links: [{ to: "/radio/propagation", label: "Is 27 MHz open now" }],
    sources: [ICASA_B],
    aliases: ["South Africa CB", "citizens band", "27 MHz"],
  },
  {
    id: "lf-pmr446-za",
    kind: "licence-free",
    name: "PMR446 in South Africa",
    what: "South Africa exempts PMR446 equipment from a spectrum licence: 446.0 to 446.2 MHz at 500 mW e.r.p., to the European standard EN 303 405.",
    frequencies: [{ khz: 446_000, toKhz: 446_200 }],
    modes: ["NFM", "DPMR", "DMR"],
    bands: ["pmr446"],
    where: ["ZA"],
    expect: "Short-range speech on narrow FM (the sixteen European channels); digital channels need a digital set.",
    reception: "Short range.",
    listening: "ICASA Annexure B (Notice 1822 of 2023): PMR 446 applications, 500 mW e.r.p., EN 303 405, CEPT ERC/REC 70-03.",
    status: "on-air",
    notes: ["Annexure B gives the band, not channels; the European channel plan follows from the standard it names (inferred)."],
    sources: [ICASA_B],
    aliases: ["PMR 446", "walkie talkie", "South Africa"],
  },
];

export const LICENCE_FREE_GUIDES: FrequencyGuide[] = [
  {
    id: "lf-guide-listening",
    kind: "licence-free",
    title: "Listening on licence-free channels",
    paragraphs: [
      "These are the channels anyone may use without an individual licence: walkie-talkies and CB sets. A scanner or a radio of the same kind hears them; most use narrow FM, and 27 MHz CB also uses AM and SSB.",
      "The services differ from country to country. PMR446 is the European service, FRS and GMRS the North American one, UHF CB the Australian and New Zealand one. A radio bought abroad is often illegal to transmit with at home: Ofcom says US FRS radios cannot be used licence-exempt in the UK, and New Zealand's regulator warns that radios bought overseas may not work on New Zealand frequencies.",
      "Emergency channels exist only where a regulator names them. In the US, CB channel 9 is for emergencies and traveller assistance only (47 CFR 95.931). In Canada RIC-18 names CB channel 9 for emergencies, 11 for calling, 13 and 23 for search and rescue, and 19 as a road information channel. In Australia CB channel 9 and UHF CB channels 5 and 35 are for emergencies (Class Licence 2025). Malaysia reserves CB channel 9 for emergencies and 11 for calling. In the UK, Ofcom's guidance asks users to keep CB channel 9 clear for emergencies, 14 for calling and 19 for mobile use, as a convention and not a legal requirement. PMR446 has no emergency channel.",
      "Nobody official is listening. Australia's class licence says emergency services organisations do not monitor the CB emergency channels, and Ofcom says the emergency services generally do not monitor CB channel 9. Call the emergency number if a telephone works.",
    ],
    sources: [ECFR_95, ISED_RIC18, ACMA_CB_2025, MCMC_CA, OFCOM_CB_GUIDE, OFCOM_PMR446, RSM_CB],
  },
];
