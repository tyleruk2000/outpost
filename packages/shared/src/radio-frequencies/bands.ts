/**
 * Frequencies to listen to: the kind "bands". See radio-frequencies.ts for the shape and
 * docs/radio-frequencies.md for how entries are sourced and checked.
 *
 * Band edges are the international allocations of the ITU Radio Regulations, Article 5, as
 * reproduced by national administrations (Ofcom's UK table for Region 1, NTIA's copy of the
 * international table for all three regions, the IARU's excerpts for the amateur bands).
 * Where a band is used differently in one country, the entry says so and names the footnote.
 * The "when it is open" notes are general, from the Bureau of Meteorology's introduction to
 * HF propagation; they are not a forecast (Radio → HF propagation is).
 */
import type { FrequencyEntry, FrequencyGuide, FrequencySource } from "../radio-frequencies.ts";

const checked = "2026-11-17";

const UKFAT: FrequencySource = {
  publisher: "Ofcom",
  title:
    "United Kingdom Frequency Allocation Table, Issue No. 19 v.1.1 (UK allocations and the Radio Regulations Region 1 allocations), last updated 3 July 2026",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/spectrum-information/frequency-allocation-table/uk-frequency-allocation-table.pdf?v=420751",
  checked,
};
const NTIA: FrequencySource = {
  publisher: "NTIA, US Department of Commerce",
  title:
    "Manual of Regulations and Procedures for Federal Radio Frequency Management, January 2021 edition, Chapter 4: Table of Frequency Allocations (International Table, Regions 1, 2 and 3)",
  url: "https://www.ntia.gov/sites/default/files/publications/4b_21_1.pdf",
  checked,
};
const FOOTNOTES: FrequencySource = {
  publisher: "US Government Publishing Office (govinfo)",
  title:
    "47 CFR 2.106, Table of Frequency Allocations: international footnotes (text of the ITU Radio Regulations footnotes), Code of Federal Regulations, 1 October 2025 edition",
  url: "https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol1/pdf/CFR-2025-title47-vol1-part2.pdf",
  checked,
};
const IARU: FrequencySource = {
  publisher: "International Amateur Radio Union",
  title:
    "Amateur and Amateur-satellite Service Spectrum, revised January 2020 (excerpts from the international Table of Frequency Allocations)",
  url: "https://www.iaru.org/wp-content/uploads/2020/01/Amateur-Services-Spectrum-2020_.pdf",
  checked,
};
const BOM: FrequencySource = {
  publisher: "Australian Bureau of Meteorology, Space Weather Services",
  title: "Introduction to HF radio propagation",
  url: "https://www.sws.bom.gov.au/Category/Educational/Other%20Topics/Radio%20Communication/Intro_HF_Radio.pdf",
  checked,
};
const NTIA_225: FrequencySource = {
  publisher: "NTIA, US Department of Commerce",
  title: "Federal spectrum use compendium: 225-328.6 MHz (1 December 2015)",
  url: "https://www.ntia.gov/files/ntia/publications/compendium/0225.00-0328.60_01DEC15.pdf",
  checked,
};
const BS1660: FrequencySource = {
  publisher: "ITU-R",
  title:
    "Recommendation ITU-R BS.1660-7 (10/2015), Technical basis for planning of terrestrial digital sound broadcasting in the VHF band: Table 2, T-DAB frequency blocks",
  url: "https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1660-7-201510-I!!PDF-E.pdf",
  checked,
};
const MIC_FM: FrequencySource = {
  publisher: "Ministry of Internal Affairs and Communications (Japan), Tokai Bureau of Telecommunications",
  title:
    "株式会社CBCラジオ及び東海ラジオ放送株式会社に豊橋FM補完中継局の予備免許 (press release, 2024): FM broadcast frequencies 76.1 to 94.9 MHz; wide FM 90.0 to 94.9 MHz",
  url: "https://www.soumu.go.jp/soutsu/tokai/kohosiryo/2024/0109.html",
  checked,
};
const ECFR_87_137: FrequencySource = {
  publisher: "US Government Publishing Office (govinfo)",
  title: "47 CFR 87.137, Types of emission (aviation services), Code of Federal Regulations, 1 October 2025 edition",
  url: "https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/pdf/CFR-2025-title47-vol5-part87.pdf",
  checked,
};
const ECFR_80_207: FrequencySource = {
  publisher: "US Government Publishing Office (govinfo)",
  title: "47 CFR 80.207, Classes of emission (maritime services), Code of Federal Regulations, 1 October 2025 edition",
  url: "https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/pdf/CFR-2025-title47-vol5-part80.pdf",
  checked,
};
const IR2027: FrequencySource = {
  publisher: "Ofcom",
  title: "UK Interface Requirement 2027, Citizens' Band (CB) radio, amended January 2018",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir_2027.pdf",
  checked,
};
const IR2027_2: FrequencySource = {
  publisher: "Ofcom",
  title: "UK Interface Requirement 2027.2, AM/SSB and DSB use in the Citizens' Band Radio Service, June 2021",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir_2027.2.pdf",
  checked,
};
const CFR_CB_CHANNELS: FrequencySource = {
  publisher: "US Government Publishing Office (govinfo)",
  title: "47 CFR 95.963, CBRS channel frequencies, Code of Federal Regulations, 1 October 2025 edition",
  url: "https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/pdf/CFR-2025-title47-vol5-part95.pdf",
  checked,
};
const CFR_CB_EMISSIONS: FrequencySource = {
  publisher: "US Government Publishing Office (govinfo)",
  title: "47 CFR 95.971, CBRS emission types, Code of Federal Regulations, 1 October 2025 edition",
  url: "https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol5/pdf/CFR-2025-title47-vol5-part95.pdf",
  checked,
};
const IR2030: FrequencySource = {
  publisher: "Ofcom",
  title: "UK Interface Requirement 2030, Licence exempt Short Range Devices, published 23 October 2026: Table 3.18, PMR 446",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/interface-requirements/ir-2030.pdf",
  checked,
};
const ECC_15_05: FrequencySource = {
  publisher: "CEPT Electronic Communications Committee",
  title:
    "ECC Decision (15)05, the harmonised frequency range 446.0-446.2 MHz for PMR 446 applications, approved 3 July 2015, amended 2 March 2018",
  url: "https://docdb.cept.org/download/1491",
  checked,
};
const ECFR_DEFS: FrequencySource = {
  publisher: "US Government Publishing Office (govinfo)",
  title: "47 CFR 2.1, Terms and definitions (Radio Regulations definitions marked RR), Code of Federal Regulations, 1 October 2025 edition",
  url: "https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol1/pdf/CFR-2025-title47-vol1-part2.pdf",
  checked,
};
const GREYLINE: FrequencySource = {
  publisher: "University of Twente (research portal record of Lo, Rankov, Mitchell, Witvliet and others, Atmosphere 13(8), 1340, 2022)",
  title: "A systematic study of 7 MHz greyline propagation using amateur radio beacon signals",
  url: "https://research.utwente.nl/en/publications/a-systematic-study-of-7-mhz-greyline-propagation-using-amateur-ra/",
  checked,
};
const CERN_CLUB: FrequencySource = {
  publisher: "CERN Amateur Radio Club (F6KAR), secondary source",
  title: "Beyond the Broadcast: Exploring Shortwave Utility Signals, Number Stations, and Ham Radio",
  url: "https://f6kar-carc.web.cern.ch/?p=105",
  checked,
};
const HACKADAY_SSB: FrequencySource = {
  publisher: "Hackaday (Al Williams, 1 January 2018), secondary source",
  title: "Why Is Donald Duck On The Radio? Math Behind Single Sideband Explained",
  url: "https://hackaday.com/2018/01/01/why-is-donald-duck-on-the-radio-math-behind-single-sideband-explained/",
  checked,
};

const PROPAGATION = { to: "/radio/propagation", label: "Is this band open now (HF propagation)" };
const PLANS = { to: "/radio/plans", label: "Amateur band plans" };

const LISTEN_BROADCAST = "Broadcasts are meant for the public: listening needs no licence nearly everywhere.";

// Reception notes, from the Bureau of Meteorology's introduction (sections 1.1, 1.3, 1.4, 1.5, 2.10 and 2.11).
const RX_LOW_SW =
  "Mostly after dark and on paths that are in darkness: by day the D region absorbs the lower shortwave frequencies, and at night it is gone (general behaviour, not a forecast).";
const RX_MID_SW =
  "Often usable by day and by night over long distances; which hours work depends on the path, the season and the solar cycle (general behaviour, not a forecast).";
const RX_HIGH_SW =
  "Mostly by day, and best in the years near solar maximum; at night and near solar minimum the ionosphere often cannot return these frequencies and the band goes quiet (general behaviour, not a forecast).";

const broadcastBand = (
  id: string,
  band: string,
  metres: string,
  frequencies: FrequencyEntry["frequencies"],
  where: string[],
  reception: string,
  notes: string[],
): FrequencyEntry => ({
  id,
  kind: "bands",
  name: `${metres} shortwave broadcast band`,
  what: `One of the bands the ITU Radio Regulations allocate to broadcasting on shortwave, known by its wavelength (${metres}). International and some national broadcasters use it.`,
  frequencies,
  modes: ["AM"],
  bands: [band],
  where,
  expect: "Speech and music in AM from broadcasters.",
  reception,
  listening: LISTEN_BROADCAST,
  status: "on-air",
  notes,
  links: [PROPAGATION],
  sources: [NTIA, UKFAT, BOM],
  aliases: [metres, "shortwave", "SW", "broadcast band"],
});

const tropicalNote =
  "A tropical band: broadcasting here is for domestic service, under conditions the Radio Regulations set for the tropical zone (No. 5.113, which points to Nos. 5.16 to 5.20, 5.21 and 23.3 to 23.10).";
const article12Note = (range: string) =>
  `Broadcasting in ${range} is subject to the procedure of Article 12 of the Radio Regulations (footnote 5.134), which also encourages digital transmissions there.`;

const amateurBand = (
  id: string,
  band: string,
  name: string,
  frequencies: FrequencyEntry["frequencies"],
  where: string[],
  extra: Partial<FrequencyEntry>,
): FrequencyEntry => ({
  id,
  kind: "bands",
  name,
  what: "A band allocated to the amateur service in the international Table of Frequency Allocations. National licences decide what each country's amateurs may use; this is the international table.",
  frequencies,
  modes: ["USB", "LSB", "CW"],
  bands: [band],
  where,
  expect: "Amateurs in single sideband, Morse code and digital modes.",
  listening: "Listening to amateur radio needs no licence in most countries; transmitting needs an amateur licence.",
  status: "on-air",
  links: [PLANS, PROPAGATION],
  sources: [IARU, NTIA],
  aliases: ["ham", "amateur"],
  ...extra,
});

export const BANDS: FrequencyEntry[] = [
  // ── Long and medium wave ─────────────────────────────────────────────────
  {
    id: "bd-lw-region-1",
    kind: "bands",
    name: "Long wave broadcasting (Region 1)",
    what: "The long wave broadcasting band. The Radio Regulations allocate it to broadcasting only in Region 1 (Europe, Africa, the Middle East and northern Asia); in Regions 2 and 3 these frequencies are for aeronautical and maritime navigation and other services.",
    frequencies: [
      { khz: 148.5, toKhz: 283.5, note: "Broadcasting alone to 255 kHz; shared with aeronautical radionavigation from 255 to 283.5 kHz" },
    ],
    modes: ["AM"],
    bands: ["lw"],
    where: ["itu-1"],
    expect: "A few national broadcasters in AM; see News broadcasters for which long wave stations are still on the air.",
    reception: "By ground wave, by day and night; lower frequencies have the longest ground-wave range.",
    listening: LISTEN_BROADCAST,
    status: "on-air",
    notes: [
      "In Regions 2 and 3 these frequencies are allocated to aeronautical radionavigation (beacons) and fixed and maritime services, not broadcasting.",
    ],
    sources: [UKFAT, NTIA, BOM],
    aliases: ["LW", "long wave", "longwave"],
  },
  {
    id: "bd-mw-regions-1-3",
    kind: "bands",
    name: "Medium wave broadcasting (Regions 1 and 3)",
    what: "The medium wave (AM) broadcasting band in Europe, Africa, the Middle East, Asia and the Pacific.",
    frequencies: [{ khz: 526.5, toKhz: 1606.5 }],
    modes: ["AM"],
    bands: ["mw"],
    where: ["itu-1", "itu-3"],
    expect: "Local and national stations in AM by day; at night, stations from hundreds or thousands of kilometres away as well.",
    reception:
      "By ground wave by day; after dark the absorbing D region goes and medium wave travels far by sky wave, so the band fills with distant stations.",
    listening: LISTEN_BROADCAST,
    status: "on-air",
    notes: ["In the Philippines and Sri Lanka 1606.5 to 1705 kHz is also allocated to broadcasting, secondary (footnote 5.91)."],
    sources: [NTIA, UKFAT, FOOTNOTES, BOM],
    aliases: ["MW", "AM", "medium wave"],
  },
  {
    id: "bd-mw-region-2",
    kind: "bands",
    name: "Medium wave broadcasting (Region 2, the Americas)",
    what: "The medium wave (AM) broadcasting band in the Americas, which runs higher than elsewhere: the top part, 1605 to 1705 kHz, is the extended band planned at Rio de Janeiro in 1988.",
    frequencies: [
      { khz: 525, toKhz: 1705 },
      { khz: 525, toKhz: 535, note: "Broadcasting carrier power here is limited to 1 kW by day and 250 W at night (footnote 5.86)" },
      { khz: 1605, toKhz: 1705, note: "The extended band, under the Rio de Janeiro 1988 plan (footnote 5.89)" },
    ],
    modes: ["AM"],
    bands: ["mw"],
    where: ["itu-2"],
    expect: "Local and national stations in AM; at night, distant stations too.",
    reception: "By ground wave by day; after dark, by sky wave over long distances.",
    listening: LISTEN_BROADCAST,
    status: "on-air",
    notes: ["In the United States, 530 and 1610 kHz are also used by low-power travellers' information stations (US footnote US221)."],
    sources: [NTIA, FOOTNOTES, BOM],
    aliases: ["MW", "AM", "medium wave", "AM band"],
  },

  // ── Shortwave broadcasting ───────────────────────────────────────────────
  {
    ...broadcastBand(
      "bd-sw-120m",
      "sw-120m",
      "120 m",
      [
        { khz: 2300, toKhz: 2498, note: "Region 1" },
        { khz: 2300, toKhz: 2495, note: "Regions 2 and 3" },
      ],
      ["world"],
      RX_LOW_SW,
      [tropicalNote, "Shared with fixed and mobile services. The band ends at 2498 kHz in Region 1 and 2495 kHz in Regions 2 and 3."],
    ),
    // The app's 120 m band stops at 2495 kHz; the Region 1 band runs to 2498 kHz, so it is placed in MF as well.
    bands: ["sw-120m", "mf"],
  },
  broadcastBand("bd-sw-90m", "sw-90m", "90 m", [{ khz: 3200, toKhz: 3400 }], ["world"], RX_LOW_SW, [
    tropicalNote,
    "Shared with fixed and mobile services.",
  ]),
  broadcastBand(
    "bd-sw-75m",
    "sw-75m",
    "75 m",
    [
      { khz: 3950, toKhz: 4000, note: "Region 1" },
      { khz: 3900, toKhz: 4000, note: "Region 3" },
    ],
    ["itu-1", "itu-3"],
    RX_LOW_SW,
    [
      "Not a broadcast band in Region 2, where 3750 to 4000 kHz is amateur (the top of the 80 m band).",
      "Also allocated to broadcasting in Greenland, 3950 to 4000 kHz (footnote 5.125), and in Botswana, Eswatini, Lesotho, Malawi, Mozambique, Namibia, South Africa, Zambia and Zimbabwe, 3900 to 3950 kHz (footnote 5.123).",
    ],
  ),
  broadcastBand(
    "bd-sw-60m",
    "sw-60m",
    "60 m",
    [
      { khz: 4750, toKhz: 4995 },
      { khz: 5005, toKhz: 5060 },
    ],
    ["world"],
    RX_LOW_SW,
    [tropicalNote, "The gap at 4995 to 5005 kHz is the 5 MHz standard frequency and time signal band."],
  ),
  broadcastBand("bd-sw-49m", "sw-49m", "49 m", [{ khz: 5900, toKhz: 6200 }], ["world"], RX_LOW_SW, [article12Note("5900 to 5950 kHz")]),
  broadcastBand("bd-sw-41m-regions-1-3", "sw-41m", "41 m", [{ khz: 7200, toKhz: 7450 }], ["itu-1", "itu-3"], RX_LOW_SW, [
    article12Note("7300 to 7400 kHz"),
    "In the Americas the band is narrower: see the Region 2 entry.",
  ]),
  {
    ...broadcastBand("bd-sw-41m-region-2", "sw-41m", "41 m", [{ khz: 7300, toKhz: 7400 }], ["itu-2"], RX_LOW_SW, [
      "In Region 2, 7200 to 7300 kHz is amateur (the top of the 40 m band) and 7400 to 7450 kHz is fixed and mobile, so the broadcast band is 7300 to 7400 kHz.",
      "Broadcasters elsewhere still use 7200 to 7300 and 7400 to 7450 kHz and may be heard in the Americas; amateur use of 7200 to 7300 kHz in Region 2 must not constrain broadcasting for Regions 1 and 3 (footnote 5.142).",
      article12Note("7300 to 7400 kHz"),
    ]),
    name: "41 m shortwave broadcast band (Region 2, the Americas)",
  },
  broadcastBand("bd-sw-31m", "sw-31m", "31 m", [{ khz: 9400, toKhz: 9900 }], ["world"], RX_MID_SW, [article12Note("9400 to 9500 kHz")]),
  broadcastBand("bd-sw-25m", "sw-25m", "25 m", [{ khz: 11_600, toKhz: 12_100 }], ["world"], RX_MID_SW, [
    article12Note("11 600 to 11 650 kHz and 12 050 to 12 100 kHz"),
  ]),
  broadcastBand("bd-sw-22m", "sw-22m", "22 m", [{ khz: 13_570, toKhz: 13_870 }], ["world"], RX_HIGH_SW, [
    article12Note("13 570 to 13 600 kHz and 13 800 to 13 870 kHz"),
  ]),
  broadcastBand("bd-sw-19m", "sw-19m", "19 m", [{ khz: 15_100, toKhz: 15_800 }], ["world"], RX_HIGH_SW, [
    article12Note("15 600 to 15 800 kHz"),
  ]),
  broadcastBand("bd-sw-16m", "sw-16m", "16 m", [{ khz: 17_480, toKhz: 17_900 }], ["world"], RX_HIGH_SW, [
    article12Note("17 480 to 17 550 kHz"),
  ]),
  broadcastBand("bd-sw-15m", "sw-15m", "15 m", [{ khz: 18_900, toKhz: 19_020 }], ["world"], RX_HIGH_SW, [
    article12Note("the whole band, 18 900 to 19 020 kHz"),
  ]),
  broadcastBand("bd-sw-13m", "sw-13m", "13 m", [{ khz: 21_450, toKhz: 21_850 }], ["world"], RX_HIGH_SW, []),
  broadcastBand("bd-sw-11m", "sw-11m", "11 m", [{ khz: 25_670, toKhz: 26_100 }], ["world"], RX_HIGH_SW, [
    "The highest shortwave broadcast band: often empty except near solar maximum.",
  ]),

  // ── FM and Band III ──────────────────────────────────────────────────────
  {
    id: "bd-fm-region-1",
    kind: "bands",
    name: "FM broadcasting (Region 1)",
    what: "The VHF FM broadcast band in Europe, Africa, the Middle East and northern Asia.",
    frequencies: [{ khz: 87_500, toKhz: 108_000 }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["itu-1"],
    expect: "Local and national stations in FM stereo, often with RDS station names.",
    reception:
      "Line of sight, to roughly the horizon from a high transmitter; now and then much further by sporadic E or temperature inversions, mostly by day in summer.",
    listening: LISTEN_BROADCAST,
    status: "on-air",
    notes: ["In Albania 81 to 87.5 MHz is also allocated to broadcasting (footnote 5.187); for the old eastern band see the OIRT entry."],
    sources: [UKFAT, NTIA, FOOTNOTES, BOM],
    aliases: ["FM", "VHF", "Band II"],
  },
  {
    id: "bd-fm-region-2",
    kind: "bands",
    name: "FM broadcasting (Region 2, the Americas)",
    what: "The VHF FM broadcast band in the Americas, which starts at 88 MHz.",
    frequencies: [{ khz: 88_000, toKhz: 108_000 }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["itu-2"],
    expect: "Local stations in FM stereo; in the United States some also carry HD Radio digital signals.",
    reception: "Line of sight, to roughly the horizon; now and then much further by sporadic E or ducting.",
    listening: LISTEN_BROADCAST,
    status: "on-air",
    notes: ["76 to 88 MHz is also a broadcasting allocation in Region 2 (television channels in the US table), not FM sound radio."],
    sources: [NTIA, BOM],
    aliases: ["FM", "VHF"],
  },
  {
    id: "bd-fm-region-3",
    kind: "bands",
    name: "FM broadcasting (Region 3, Asia and the Pacific)",
    what: "The VHF FM broadcast band in Asia and the Pacific. The international table allocates 87 to 100 MHz (shared with fixed and mobile) and 100 to 108 MHz to broadcasting in Region 3.",
    frequencies: [{ khz: 87_000, toKhz: 108_000 }],
    modes: ["FM"],
    bands: ["vhf"],
    where: ["itu-3"],
    expect: "Local and national stations in FM.",
    reception: "Line of sight, to roughly the horizon; now and then further by sporadic E or ducting.",
    listening: LISTEN_BROADCAST,
    status: "on-air",
    notes: [
      "Australia also has 85 to 87 MHz for broadcasting (footnote 5.188); China, Korea, Japan, the Philippines and North Korea also have 76 to 87 MHz (footnote 5.183); Australia, China, Korea, the Philippines, North Korea and Samoa also have 68 to 74 MHz (footnote 5.176).",
      "In China and Korea, 100 to 108 MHz is also allocated to fixed and mobile services (footnote 5.192).",
      "For Japan, see the Japanese FM band entry.",
    ],
    sources: [NTIA, FOOTNOTES, BOM],
    aliases: ["FM", "VHF"],
  },
  {
    id: "bd-fm-japan",
    kind: "bands",
    name: "FM broadcasting in Japan, including wide FM",
    what: "Japan's FM band starts at 76 MHz. AM stations' programmes are also broadcast on FM relay stations in 90.0 to 94.9 MHz (FM補完放送, \"wide FM\").",
    frequencies: [
      { khz: 76_100, toKhz: 94_900, note: "FM broadcast frequencies, as the ministry gives them" },
      { khz: 90_000, toKhz: 94_900, note: "Wide FM: AM stations' programmes on FM" },
    ],
    modes: ["FM"],
    bands: ["fm-japan"],
    where: ["JP"],
    expect: "FM stations, and AM stations' programmes repeated on FM in the wide FM part.",
    reception: "Line of sight, to roughly the horizon.",
    listening:
      "The ministry notes that wide FM needs a radio that tunes 90.0 to 94.9 MHz; a set made for the 87.5 to 108 MHz band will not tune most of the Japanese band.",
    status: "on-air",
    notes: [
      "On 10 April 2025 the ministry (MIC) published the result of its consultation on raising the upper limit of the FM broadcasting band from 95.0 MHz to 99.0 MHz, for more wide FM relay stations. The release gives no date the change takes effect, so 95 to 99 MHz is not listed above; a set that tunes only to 95 MHz may miss new stations.",
    ],
    sources: [
      MIC_FM,
      FOOTNOTES,
      {
        publisher: "Ministry of Internal Affairs and Communications (総務省)",
        title:
          "無線設備規則及び特定無線設備の技術基準適合証明等に関する規則の一部を改正する省令案等に係る意見募集の結果及び電波監理審議会からの答申, 10 April 2025",
        url: "https://www.soumu.go.jp/menu_news/s-news/01ryutsu08_02000318.html",
        checked: "2026-11-17",
      },
    ],
    aliases: ["ワイドFM", "FM補完放送", "wide FM", "Japan FM"],
  },
  {
    id: "bd-fm-oirt",
    kind: "bands",
    name: "The old OIRT FM band (Russia and neighbours)",
    what: "The eastern European VHF broadcast band below the international FM band. The Radio Regulations still allocate 68 to 73 MHz and 76 to 87.5 MHz to broadcasting in Russia and several former Soviet countries (footnote 5.175), and 73 to 74 MHz too (footnote 5.177).",
    frequencies: [
      { khz: 68_000, toKhz: 74_000, note: "68 to 73 MHz under footnote 5.175 and 73 to 74 MHz under footnote 5.177" },
      { khz: 76_000, toKhz: 87_500, note: "Also allocated to broadcasting in the same countries (footnote 5.175)" },
    ],
    modes: ["FM"],
    bands: ["fm-oirt", "vhf"],
    where: ["RU", "AM", "AZ", "BY", "GE", "KZ", "MD", "UZ", "KG", "TJ", "TM", "UA", "LV", "LT"],
    expect: "FM stations, where still used; an ordinary western set (87.5 to 108 MHz) does not tune these frequencies.",
    reception: "Line of sight; sometimes much further by sporadic E in summer.",
    listening: LISTEN_BROADCAST,
    status: "on-air",
    notes: [
      "The footnotes give the allocation, not today's use: how much of the band is still on the air in each country was not checked.",
      "Moldova is named in footnote 5.175 (68 to 73 MHz) but not in 5.177 (73 to 74 MHz). In Latvia and Lithuania the bands are allocated to broadcasting and to mobile services.",
      "The band is often given as 65.8 to 74 MHz; the 65.8 MHz lower edge was not found in a primary source today.",
    ],
    sources: [FOOTNOTES],
    aliases: ["OIRT", "UKV", "УКВ", "CCIR"],
  },
  {
    id: "bd-band-iii",
    kind: "bands",
    name: "VHF Band III and DAB digital radio",
    what: "VHF Band III is allocated to broadcasting worldwide, with different edges in each region. In Europe it carries DAB digital radio in 1.536 MHz blocks named 5A to 12D (and, in some countries, television).",
    frequencies: [
      { khz: 174_000, toKhz: 230_000, note: "Broadcasting in Regions 1 and 3 (shared with fixed and mobile in Region 3)" },
      { khz: 174_000, toKhz: 216_000, note: "Broadcasting in Region 2" },
      { khz: 174_160, toKhz: 229_840, channel: "5A to 12D", note: "T-DAB blocks of the Wiesbaden 1995 arrangement (ITU-R BS.1660)" },
    ],
    modes: ["DAB"],
    bands: ["dab"],
    where: ["world"],
    expect: "Digital radio stations, heard only on a DAB set.",
    reception: "Line of sight (VHF).",
    listening: LISTEN_BROADCAST,
    status: "on-air",
    notes: [
      "Ofcom's table notes that the Geneva 2006 (GE06) agreement applies to 174 to 230 MHz and that the Wiesbaden 1995 agreement applies to 174 to 230 MHz and 230 to 240 MHz (UK footnotes UK222 and UK223).",
      "Block 5A runs 174.160 to 175.696 MHz (centre 174.928 MHz) and block 12D runs 228.304 to 229.840 MHz (centre 229.072 MHz).",
    ],
    sources: [UKFAT, NTIA, BS1660],
    aliases: ["DAB", "DAB+", "Band III", "digital radio"],
  },

  // ── Aviation ─────────────────────────────────────────────────────────────
  {
    id: "bd-air-vhf",
    kind: "bands",
    name: "VHF air band",
    what: "The civil aviation voice band (aeronautical mobile (R), worldwide) and, below it, the band for navigation beacons (VOR and ILS).",
    frequencies: [
      { khz: 117_975, toKhz: 137_000, note: "Aeronautical mobile (R): air traffic control and aircraft voice" },
      { khz: 121_500, channel: "Emergency", note: "The aeronautical emergency frequency (footnote 5.200); 123.1 MHz is its auxiliary" },
      { khz: 108_000, toKhz: 117_975, note: "Aeronautical radionavigation: beacons, not voice" },
    ],
    modes: ["AM"],
    bands: ["air-vhf"],
    where: ["world"],
    expect: "Short exchanges between controllers and pilots in AM; on the beacon frequencies, Morse identifiers.",
    reception: "Line of sight (VHF): the higher the aircraft, the further it can be heard.",
    listening:
      "Rules on listening to aviation and other non-broadcast traffic, and on using what is heard, differ by country (in the UK, for example, the Wireless Telegraphy Act).",
    status: "on-air",
    notes: [
      "US rules list voice in this band as A3E, double-sideband AM (47 CFR 87.137), and 121.5 MHz as A3E (47 CFR 80.207).",
      "Channels are 25 kHz apart, or 8.33 kHz in some airspace; 47 CFR 87.137 lists both and does not authorise 8.33 kHz spacing in the US National Airspace System except in limited cases.",
    ],
    sources: [NTIA, FOOTNOTES, ECFR_87_137, ECFR_80_207],
    aliases: ["airband", "aviation", "air traffic control", "ATC"],
  },
  {
    id: "bd-air-uhf-military",
    kind: "bands",
    name: "Military UHF air band",
    what: "The UHF band used by military aircraft and air bases. NTIA says 225 to 328.6 MHz is reserved for military use by NATO and its members and allies; the band continues from 335.4 to 399.9 MHz, with the ILS glide-path band between.",
    frequencies: [
      { khz: 225_000, toKhz: 328_600, note: "Military: air-ground-air, air traffic control at military bases, ships" },
      { khz: 335_400, toKhz: 399_900, note: "Also federal and military fixed and mobile in the US" },
      { khz: 243_000, channel: "Survival", note: "The frequency for survival craft and survival equipment (footnote 5.256)" },
    ],
    modes: ["AM"],
    bands: ["air-uhf"],
    where: ["world"],
    expect:
      "Military controllers and aircraft. NTIA notes the band is harmonised among NATO members for secure communications, so much of it is not heard as speech.",
    reception: "Line of sight, near military airfields and under training areas.",
    listening: "Rules on listening to military and other non-broadcast traffic, and on using what is heard, differ by country.",
    status: "on-air",
    notes: [
      "328.6 to 335.4 MHz is aeronautical radionavigation (ILS glide path).",
      "US rules list 243.000 MHz as A3E (AM) among others (47 CFR 80.207). The mode of other traffic in the band is not given in the sources read.",
    ],
    sources: [NTIA_225, NTIA, FOOTNOTES, UKFAT, ECFR_80_207],
    aliases: ["milair", "military aviation", "UHF air"],
  },
  {
    id: "bd-air-hf-route",
    kind: "bands",
    name: "Aeronautical HF, route bands (R)",
    what: "The HF bands for aircraft on long-distance and oceanic routes beyond VHF range: aeronautical mobile (R), allocated worldwide.",
    frequencies: [
      { khz: 2850, toKhz: 3025 },
      { khz: 3400, toKhz: 3500 },
      { khz: 4650, toKhz: 4700 },
      { khz: 5480, toKhz: 5680, note: "5450 to 5680 kHz in Region 2" },
      { khz: 6525, toKhz: 6685 },
      { khz: 8815, toKhz: 8965 },
      { khz: 10_005, toKhz: 10_100 },
      { khz: 11_275, toKhz: 11_400 },
      { khz: 13_260, toKhz: 13_360 },
      { khz: 17_900, toKhz: 17_970 },
      { khz: 21_924, toKhz: 22_000 },
    ],
    modes: ["USB"],
    bands: ["air-hf"],
    where: ["world"],
    expect:
      "Position reports and messages between oceanic control centres and aircraft, and VOLMET weather broadcasts, in single sideband.",
    reception: "Sky wave over thousands of kilometres; the lower bands at night and the higher by day.",
    listening: "Rules on listening to non-broadcast traffic differ by country. Needs a set with SSB.",
    status: "on-air",
    notes: [
      "US rules authorise single sideband (J3E and others) below 25 MHz for aviation and put the assigned frequency 1400 Hz above the carrier, that is, on the upper sideband (47 CFR 87.137).",
      "3023 and 5680 kHz may also be used by ships for coordinated search and rescue (footnote 5.115).",
    ],
    links: [PROPAGATION],
    sources: [NTIA, FOOTNOTES, ECFR_87_137],
    aliases: ["HF aero", "oceanic", "VOLMET", "MWARA"],
  },
  {
    id: "bd-air-hf-off-route",
    kind: "bands",
    name: "Aeronautical HF, off-route bands (OR)",
    what: "HF bands for aeronautical mobile (OR) service: communications primarily outside civil air routes, much of it military.",
    frequencies: [
      { khz: 3025, toKhz: 3155 },
      { khz: 4700, toKhz: 4750 },
      { khz: 5680, toKhz: 5730 },
      { khz: 6685, toKhz: 6765 },
      { khz: 8965, toKhz: 9040 },
      { khz: 11_175, toKhz: 11_275 },
      { khz: 13_200, toKhz: 13_260 },
      { khz: 15_010, toKhz: 15_100 },
      { khz: 17_970, toKhz: 18_030 },
      { khz: 23_200, toKhz: 23_350, note: "Shared with fixed service in Region 1" },
    ],
    modes: ["USB"],
    bands: ["air-hf"],
    where: ["world"],
    expect: "Aircraft and ground stations off the civil routes, much of it military, in single sideband.",
    reception: "Sky wave over long distances.",
    listening: "Rules on listening to non-broadcast traffic differ by country. Needs a set with SSB.",
    status: "on-air",
    notes: ["The definition of the off-route service is the Radio Regulations' (47 CFR 2.1)."],
    links: [PROPAGATION],
    sources: [NTIA, ECFR_DEFS, ECFR_87_137],
    aliases: ["HF aero", "military HF"],
  },

  // ── Marine ───────────────────────────────────────────────────────────────
  {
    id: "bd-marine-vhf",
    kind: "bands",
    name: "Marine VHF",
    what: "The VHF maritime band, used ship to ship and ship to shore within sight of land. Channel 16 (156.8 MHz) is the international distress, safety and calling frequency and channel 70 (156.525 MHz) is for digital selective calling.",
    frequencies: [
      { khz: 156_000, toKhz: 157_450 },
      { khz: 160_600, toKhz: 160_975 },
      { khz: 161_475, toKhz: 162_050 },
      { khz: 156_800, channel: "16", note: "Distress, safety and calling (voice)" },
      { khz: 156_525, channel: "70", note: "Distress, safety and calling by DSC (digital)" },
    ],
    modes: ["NFM", "DSC"],
    bands: ["marine-vhf"],
    where: ["world"],
    expect: "Coastguard broadcasts and calls, ports, ships and yachts in narrow FM; DSC bursts on channel 70.",
    reception: "Line of sight: about 45 nautical miles (80 km) even from a hilltop shore station.",
    listening: "Rules on listening to marine traffic, and on using what is heard, differ by country.",
    status: "on-air",
    notes: [
      "The bands here are those in which footnote 5.226 asks administrations to give the maritime mobile service priority.",
      "US rules list voice here as G3E (phase modulation, heard as FM) (47 CFR 80.207).",
      "The channel numbers 16 and 70 are the usual names for these frequencies; footnote 5.226 gives the frequencies, not the numbers.",
    ],
    sources: [FOOTNOTES, NTIA, ECFR_80_207, BOM],
    aliases: ["marine", "VHF marine", "channel 16", "boats"],
  },
  {
    id: "bd-marine-mf",
    kind: "bands",
    name: "Marine MF",
    what: "The medium frequencies used by ships and coast stations: the band below medium wave broadcasting, for radiotelegraphy, NAVTEX and NAVDAT, and the 2 MHz band around the distress frequency 2182 kHz.",
    frequencies: [
      {
        khz: 415,
        toKhz: 526.5,
        note: "Maritime mobile, limited to radiotelegraphy and NAVDAT (footnote 5.79); 505 to 526.5 kHz in Regions 1 and 3",
      },
      { khz: 2173.5, toKhz: 2190.5, note: "Mobile (distress and calling)" },
      { khz: 2182, note: "Carrier frequency for distress and search and rescue (footnote 5.111)" },
    ],
    modes: ["USB", "NAVTEX"],
    bands: ["marine-mf"],
    where: ["world"],
    expect: "NAVTEX text bursts below 530 kHz (needs a decoder); voice in single sideband near 2182 kHz.",
    reception: "Ground wave to several hundred nautical miles, furthest over sea; further by sky wave at night.",
    listening: "Rules on listening to marine traffic differ by country. Voice needs a set with SSB.",
    status: "on-air",
    notes: [
      "US rules list 2182 kHz voice as J3E or H3E (single sideband) among others (47 CFR 80.207). See the Weather and Distress kinds for NAVTEX and 2182 kHz.",
    ],
    sources: [NTIA, FOOTNOTES, ECFR_80_207, BOM],
    aliases: ["2182", "NAVTEX", "MF marine"],
  },
  {
    id: "bd-marine-hf",
    kind: "bands",
    name: "Marine HF bands",
    what: "The HF bands allocated only to the maritime mobile service, worldwide: long-distance ship and coast station voice, digital selective calling, text and weather fax.",
    frequencies: [
      { khz: 4063, toKhz: 4438 },
      { khz: 6200, toKhz: 6525 },
      { khz: 8195, toKhz: 8815 },
      { khz: 12_230, toKhz: 13_200 },
      { khz: 16_360, toKhz: 17_410 },
      { khz: 18_780, toKhz: 18_900 },
      { khz: 19_680, toKhz: 19_800 },
      { khz: 22_000, toKhz: 22_855 },
      { khz: 25_070, toKhz: 25_210 },
      { khz: 26_100, toKhz: 26_175 },
    ],
    modes: ["USB", "DSC", "SITOR-B", "FAX"],
    bands: ["marine-hf"],
    where: ["world"],
    expect: "Single sideband voice, weather broadcasts, DSC, and text (SITOR) and fax signals that need a decoder.",
    reception: "Sky wave over thousands of kilometres; the lower bands mostly at night, the higher by day.",
    listening: "Rules on listening to marine traffic differ by country. Voice needs a set with SSB.",
    status: "on-air",
    notes: [
      "US rules list radiotelephony on 1615 to 27 500 kHz as single sideband (H3E, J3E, R3E), with DSC, narrow-band direct printing and facsimile as other classes (47 CFR 80.207).",
    ],
    links: [PROPAGATION],
    sources: [NTIA, ECFR_80_207, BOM],
    aliases: ["HF marine", "coast stations"],
  },

  // ── Time and standard frequencies ────────────────────────────────────────
  {
    id: "bd-sfts",
    kind: "bands",
    name: "Standard frequency and time signal bands",
    what: "Narrow bands kept worldwide for standard frequency and time signal stations, centred on 20 kHz and on 2.5, 5, 10, 15, 20 and 25 MHz.",
    frequencies: [
      { khz: 19.95, toKhz: 20.05, note: "20 kHz" },
      { khz: 2498, toKhz: 2502, note: "Region 1" },
      { khz: 2495, toKhz: 2505, note: "Regions 2 and 3" },
      { khz: 4995, toKhz: 5005 },
      { khz: 9995, toKhz: 10_005 },
      { khz: 14_990, toKhz: 15_010 },
      { khz: 19_990, toKhz: 20_010 },
      { khz: 24_990, toKhz: 25_010 },
    ],
    modes: ["TIME-CODE", "AM"],
    bands: ["sfts", "mf", "vlf"],
    where: ["world"],
    expect: "Ticks each second and voice or Morse announcements of the time (see Time signals for the stations).",
    reception: "5 and 10 MHz are the most often heard; 2.5 MHz mostly at night, 15 MHz and up by day.",
    listening: "Time signals are meant for anyone: listening needs no licence.",
    status: "on-air",
    notes: [
      "The upper part of several of these bands (for example 2501 to 2502, 5003 to 5005 and 10 003 to 10 005 kHz) is shared with space research.",
      "In Region 3, stations of the services in 3995 to 4005 kHz and 15 995 to 16 005 kHz may also transmit standard frequency and time signals (footnotes 5.126 and 5.153).",
      "Long wave time signal stations such as those on 60 and 77.5 kHz are national assignments, listed under Time signals.",
    ],
    links: [PROPAGATION],
    sources: [NTIA, UKFAT, FOOTNOTES],
    aliases: ["time signal", "WWV", "standard frequency"],
  },

  // ── CB and PMR446 ────────────────────────────────────────────────────────
  {
    id: "bd-cb-cept-us",
    kind: "bands",
    name: "CB radio, the 40 channels (CEPT and United States)",
    what: "The 27 MHz Citizens' Band: forty channels from 26.965 to 27.405 MHz, the same frequencies in the United States and in the CEPT (EU) band.",
    frequencies: [{ khz: 26_965, toKhz: 27_405, channel: "1 to 40" }],
    modes: ["AM", "NFM", "USB", "LSB"],
    bands: ["cb"],
    where: ["cept", "US"],
    expect: "Drivers, farmers and hobbyists talking in AM, FM or single sideband, depending on the country's rules.",
    reception: "Mostly local (line of sight); by day in summer and near solar maximum, distant stations by sporadic E and F region.",
    listening:
      "Listening needs no licence. Using a CB set is licence-exempt in the US and UK within each one's rules; see Licence-free radio.",
    status: "on-air",
    notes: [
      "US rules allow AM (A3E) and single sideband, and FM (F3E) as an option (47 CFR 95.971). Ofcom's UK rules allow FM, AM and SSB on the CEPT band (IR 2027, IR 2027.2).",
      "Channels 23, 24 and 25 are out of frequency order (47 CFR 95.963).",
    ],
    links: [{ to: "/radio/propagation", label: "Is 27 MHz open now (HF propagation)" }],
    sources: [CFR_CB_CHANNELS, CFR_CB_EMISSIONS, IR2027, IR2027_2, BOM],
    aliases: ["CB", "citizens band", "27 MHz", "11 m"],
  },
  {
    id: "bd-cb-uk",
    kind: "bands",
    name: "CB radio, the UK's own 40 channels",
    what: "The United Kingdom's second CB band, forty FM channels above the CEPT band.",
    frequencies: [{ khz: 27_601.25, toKhz: 27_991.25, channel: "1 to 40" }],
    modes: ["NFM"],
    bands: ["cb"],
    where: ["GB"],
    expect: "FM voice from UK CB users.",
    reception: "Mostly local (line of sight).",
    listening: "Listening needs no licence. Ofcom licence-exempts CB use on these channels within IR 2027.",
    status: "on-air",
    notes: ["Not used in other countries' CB rules read here."],
    sources: [IR2027],
    aliases: ["UK CB", "CB", "27/81"],
  },
  {
    id: "bd-pmr446",
    kind: "bands",
    name: "PMR446",
    what: "The licence-free walkie-talkie band harmonised across CEPT countries, 446.0 to 446.2 MHz, analogue and digital.",
    frequencies: [{ khz: 446_000, toKhz: 446_200 }],
    modes: ["NFM", "DPMR", "DMR"],
    bands: ["pmr446"],
    where: ["cept"],
    expect: "Short-range FM voice from handheld radios, and digital PMR446.",
    reception: "Short range, line of sight (UHF).",
    listening: "Listening needs no licence; see Licence-free radio for the channels and rules.",
    status: "on-air",
    sources: [ECC_15_05, IR2030],
    aliases: ["PMR", "PMR 446", "walkie-talkie"],
  },

  // ── Amateur bands, by ITU region ─────────────────────────────────────────
  amateurBand("bd-ham-2200m", "ham-2200m", "Amateur 2200 m band", [{ khz: 135.7, toKhz: 137.8 }], ["world"], {
    modes: ["CW", "WSPR"],
    expect: "Low-power experiments over medium and long range (IARU); little to hear on an ordinary set.",
    notes: [
      "Secondary allocation, limited to 1 W e.i.r.p. (footnote 5.67A); not available to amateurs in some countries (footnote 5.67B).",
    ],
    sources: [IARU, FOOTNOTES],
  }),
  amateurBand("bd-ham-630m", "ham-630m", "Amateur 630 m band", [{ khz: 472, toKhz: 479 }], ["world"], {
    modes: ["CW", "WSPR"],
    expect: "Low-power experiments over medium and long range (IARU).",
    notes: ["Secondary allocation since 2013, generally limited to 1 W e.i.r.p. (footnote 5.80A)."],
    sources: [IARU, FOOTNOTES],
  }),
  amateurBand("bd-ham-160m-region-1", "ham-160m", "Amateur 160 m band (Region 1)", [{ khz: 1810, toKhz: 1850 }], ["itu-1"], {
    reception: "Short range by day; medium and long range at night (IARU).",
    notes: [
      "The international table allocates only 1810 to 1850 kHz in Region 1; several countries allow more nationally. North of 40° N, 1810 to 1830 kHz needs consultation (footnote 5.100).",
    ],
    sources: [IARU, NTIA, FOOTNOTES],
  }),
  amateurBand(
    "bd-ham-160m-regions-2-3",
    "ham-160m",
    "Amateur 160 m band (Regions 2 and 3)",
    [{ khz: 1800, toKhz: 2000 }],
    ["itu-2", "itu-3"],
    { reception: "Short range by day; medium and long range at night (IARU)." },
  ),
  amateurBand("bd-ham-80m-region-1", "ham-80m", "Amateur 80 m band (Region 1)", [{ khz: 3500, toKhz: 3800 }], ["itu-1"], {
    reception: "Up to about 500 km by day and 2000 km and more at night (IARU). Heavily used in emergencies.",
  }),
  amateurBand("bd-ham-80m-region-2", "ham-80m", "Amateur 80/75 m band (Region 2)", [{ khz: 3500, toKhz: 4000 }], ["itu-2"], {
    reception: "Up to about 500 km by day and 2000 km and more at night (IARU). Heavily used in emergencies.",
  }),
  amateurBand("bd-ham-80m-region-3", "ham-80m", "Amateur 80 m band (Region 3)", [{ khz: 3500, toKhz: 3900 }], ["itu-3"], {
    reception: "Up to about 500 km by day and 2000 km and more at night (IARU). Heavily used in emergencies.",
  }),
  amateurBand("bd-ham-60m", "ham-60m", "Amateur 60 m band", [{ khz: 5351.5, toKhz: 5366.5 }], ["world"], {
    notes: [
      "Secondary allocation since 2017, generally limited to 15 W e.i.r.p. (footnote 5.133B). Some countries allow more channels or power nationally.",
    ],
    sources: [IARU, FOOTNOTES],
  }),
  amateurBand(
    "bd-ham-40m-regions-1-3",
    "ham-40m",
    "Amateur 40 m band (Regions 1 and 3)",
    [{ khz: 7000, toKhz: 7200 }],
    ["itu-1", "itu-3"],
    {
      reception: "In use around the clock; by day, most contacts are under about 1300 km (IARU).",
    },
  ),
  amateurBand("bd-ham-40m-region-2", "ham-40m", "Amateur 40 m band (Region 2)", [{ khz: 7000, toKhz: 7300 }], ["itu-2"], {
    reception: "In use around the clock; by day, most contacts are under about 1300 km (IARU).",
    notes: ["7200 to 7300 kHz is broadcasting in Regions 1 and 3, so broadcasters are heard here in the Americas too (footnote 5.142)."],
  }),
  amateurBand("bd-ham-30m", "ham-30m", "Amateur 30 m band", [{ khz: 10_100, toKhz: 10_150 }], ["world"], {
    modes: ["CW", "FT8"],
    expect: "Morse and digital modes (the band is narrow and secondary).",
    reception: "In use around the clock, as a bridge between 40 m and 20 m (IARU).",
    notes: ["Secondary allocation, shared with the fixed service."],
  }),
  amateurBand("bd-ham-20m", "ham-20m", "Amateur 20 m band", [{ khz: 14_000, toKhz: 14_350 }], ["world"], {
    reception: "The most popular band for international contacts (IARU).",
  }),
  amateurBand("bd-ham-17m", "ham-17m", "Amateur 17 m band", [{ khz: 18_068, toKhz: 18_168 }], ["world"], {
    reception: "Often open across continents when higher bands are not (IARU).",
  }),
  amateurBand("bd-ham-15m", "ham-15m", "Amateur 15 m band", [{ khz: 21_000, toKhz: 21_450 }], ["world"], {
    reception: "Mostly by day, and when sunspot activity is high (IARU).",
  }),
  amateurBand("bd-ham-12m", "ham-12m", "Amateur 12 m band", [{ khz: 24_890, toKhz: 24_990 }], ["world"], {
    reception: "Mostly by day, and when sunspot activity is high (IARU).",
  }),
  amateurBand("bd-ham-10m", "ham-10m", "Amateur 10 m band", [{ khz: 28_000, toKhz: 29_700 }], ["world"], {
    modes: ["USB", "CW", "NFM"],
    reception: "Mostly by day, and when sunspot activity is high (IARU); also amateur satellites.",
  }),
  amateurBand("bd-ham-6m-region-1", "ham-6m", "Amateur 6 m band (Region 1)", [{ khz: 50_000, toKhz: 52_000 }], ["itu-1"], {
    modes: ["USB", "CW", "FT8", "NFM"],
    reception:
      "Local at all times; up to about 2000 km by sporadic E at certain times of year, and further in years of very high solar activity (IARU).",
    notes: [
      "A secondary Region 1 allocation added by WRC-19 from 1 January 2021; footnotes give primary allocations of all or part of 50 to 54 MHz in many Region 1 countries (for example 5.169, 5.169A).",
    ],
    sources: [IARU, FOOTNOTES],
  }),
  amateurBand(
    "bd-ham-6m-regions-2-3",
    "ham-6m",
    "Amateur 6 m band (Regions 2 and 3)",
    [{ khz: 50_000, toKhz: 54_000 }],
    ["itu-2", "itu-3"],
    {
      modes: ["USB", "CW", "FT8", "NFM"],
      reception:
        "Local at all times; up to about 2000 km by sporadic E at certain times of year, and further in years of very high solar activity (IARU).",
    },
  ),
  amateurBand("bd-ham-2m-region-1", "ham-2m", "Amateur 2 m band (Region 1)", [{ khz: 144_000, toKhz: 146_000 }], ["itu-1"], {
    modes: ["NFM", "USB", "CW"],
    expect: "Short-range voice, much of it FM through repeaters, and other modes.",
    reception: "Local, line of sight; repeaters extend it. With 70 cm, the band most used for local emergency communications (IARU).",
    links: [PLANS, { to: "/radio/repeaters", label: "Repeaters" }],
  }),
  amateurBand(
    "bd-ham-2m-regions-2-3",
    "ham-2m",
    "Amateur 2 m band (Regions 2 and 3)",
    [{ khz: 144_000, toKhz: 148_000 }],
    ["itu-2", "itu-3"],
    {
      modes: ["NFM", "USB", "CW"],
      expect: "Short-range voice, much of it FM through repeaters, and other modes.",
      reception: "Local, line of sight; repeaters extend it. With 70 cm, the band most used for local emergency communications (IARU).",
      links: [PLANS, { to: "/radio/repeaters", label: "Repeaters" }],
    },
  ),
  amateurBand("bd-ham-1.25m-region-2", "ham-1.25m", "Amateur 1.25 m band (Region 2)", [{ khz: 220_000, toKhz: 225_000 }], ["itu-2"], {
    modes: ["NFM"],
    expect: "Short-range voice where the band is used, as an alternative to 2 m (IARU).",
    reception: "Local, line of sight.",
    notes: ["Allocated to amateurs only in Region 2."],
    links: [PLANS, { to: "/radio/repeaters", label: "Repeaters" }],
  }),
  amateurBand("bd-ham-70cm-region-1", "ham-70cm", "Amateur 70 cm band (Region 1)", [{ khz: 430_000, toKhz: 440_000 }], ["itu-1"], {
    modes: ["NFM", "USB", "DMR"],
    expect: "Short-range voice and data, through repeaters and direct; amateur satellites at 435 to 438 MHz (IARU).",
    reception: "Local, line of sight; repeaters extend it.",
    notes: ["Primary for amateurs in Region 1, shared with radiolocation."],
    links: [PLANS, { to: "/radio/repeaters", label: "Repeaters" }],
  }),
  amateurBand(
    "bd-ham-70cm-regions-2-3",
    "ham-70cm",
    "Amateur 70 cm band (Regions 2 and 3)",
    [{ khz: 430_000, toKhz: 440_000 }],
    ["itu-2", "itu-3"],
    {
      modes: ["NFM", "USB", "DMR"],
      expect: "Short-range voice and data, through repeaters and direct; amateur satellites at 435 to 438 MHz (IARU).",
      reception: "Local, line of sight; repeaters extend it.",
      notes: [
        "Secondary in Regions 2 and 3 (radiolocation is primary); primary in eleven Region 2 countries (footnote 5.278).",
        "In Australia, the United States, Jamaica and the Philippines, 420 to 430 and 440 to 450 MHz are also amateur, secondary (footnote 5.270); in Canada, 440 to 450 MHz (footnote 5.284).",
      ],
      links: [PLANS, { to: "/radio/repeaters", label: "Repeaters" }],
    },
  ),
  amateurBand("bd-ham-23cm", "ham-23cm", "Amateur 23 cm band", [{ khz: 1_240_000, toKhz: 1_300_000 }], ["world"], {
    modes: ["NFM", "USB"],
    expect: "Repeaters and experiments; amateur satellite uplinks at 1260 to 1270 MHz (IARU).",
    reception: "Short range, line of sight.",
    notes: ["Secondary allocation, shared with radiolocation and satellite navigation."],
  }),
];

export const BANDS_GUIDES: FrequencyGuide[] = [
  {
    id: "bd-guide-how-to-hunt",
    kind: "bands",
    title: "How to hunt",
    paragraphs: [
      "Match the band to the hour. Shortwave signals travel far by bending in the ionosphere, and the ionosphere changes through the day. By day the lowest layer (the D region) absorbs the lower frequencies, so medium wave and the lower shortwave bands (120 m to 41 m) carry mainly short range; the higher bands (22 m to 11 m) work best. At night the D region goes, medium wave and the lower bands open over long distances, and the higher bands often go quiet because the ionosphere can no longer return them. Radio → HF propagation shows what is likely open now.",
      "The season and the Sun matter too. Near solar maximum, in the years when sunspots are many, higher frequencies are supported and the upper bands (and 27 MHz) open over long distances by day; near solar minimum only the lower part of shortwave works well.",
      'Use UTC. Shortwave schedules, propagation forecasts and time signals give times in Universal Time (UTC, the same as GMT and "Z"), so that one schedule serves every time zone. Work out your offset from UTC once and keep it with your radio.',
      "Why one station is on several frequencies. No single frequency works over a path all day, all year or through the solar cycle, so broadcasters use several at once and change them with the season (the Radio Regulations refer to broadcasters' seasonal use of frequencies). If a station is weak on one, try its others: a lower one after dark, a higher one by day.",
      "Why signals fade. A signal that arrives by two or more paths at once fades as they add and cancel (multipath fading). Close to the highest frequency the ionosphere can return, small changes make the signal come and go (skip fading), most often around sunrise and sunset. Beyond the ground wave and short of where the sky wave comes down there is a skip zone where a station is not heard at all, while someone further away hears it well; a lower frequency may reach into it. Solar flares can black out the daylit side of the Earth on shortwave for minutes to hours, the lower frequencies worst.",
      "The grey line. Around dawn and dusk the day-night line (the terminator) sweeps round the Earth, and paths that lie along it can be unusually good: a study of 7 MHz signals between the UK and New Zealand found contacts mainly around sunrise and sunset. If you are hunting distant stations on the lower bands, try the hour around your sunrise and sunset.",
      'What single sideband sounds like on an AM set. Much non-broadcast speech on shortwave (ships, aircraft, amateurs) is single sideband with the carrier suppressed: the carrier an AM set needs to demodulate is not sent. On an AM-only radio it comes out as a garbled, quacking voice that listeners call "Donald Duck". A set with an SSB or BFO control, tuned slowly until the voice sounds natural, makes sense of it.',
      'Utility stations. Listeners call shortwave signals that are neither broadcasting nor amateur "utility" signals. In the Radio Regulations\' terms they are mostly stations of the fixed, maritime mobile and aeronautical mobile services: coast stations and ships, aircraft and their ground stations. Many use sideband or digital modes, so a set with SSB, or an SDR with a decoder, hears far more of them.',
    ],
    sources: [BOM, FOOTNOTES, GREYLINE, ECFR_DEFS, ECFR_80_207, ECFR_87_137, IARU, HACKADAY_SSB, CERN_CLUB],
  },
];
