/**
 * Frequencies to listen to: the kind "broadcasters", national long wave, medium wave,
 * FM and DAB. See radio-frequencies.ts for the shape and docs/radio-frequencies.md for
 * how entries are sourced and checked.
 */
import type { FrequencyEntry, FrequencyGuide, FrequencySource } from "../radio-frequencies.ts";

const CHECKED = "2026-11-17";

// ── Sources ─────────────────────────────────────────────────────────────────

const OFCOM_PAGE: FrequencySource = {
  publisher: "Ofcom",
  title: "Technical parameters for broadcast radio transmitters (last updated 16 November 2026)",
  url: "https://www.ofcom.org.uk/tv-radio-and-on-demand/coverage-and-transmitters/radio-tech-parameters",
  checked: CHECKED,
};
const OFCOM_MF: FrequencySource = {
  publisher: "Ofcom",
  title: "TxParams MF data (CSV): every analogue MF transmitter on air",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/tv-transmitter-guidance/tech-parameters/txparamsmf.csv?v=427888",
  checked: CHECKED,
};
const OFCOM_VHF: FrequencySource = {
  publisher: "Ofcom",
  title: "TxParams VHF data (CSV): every analogue FM transmitter on air",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/tv-transmitter-guidance/tech-parameters/txparamsvhf.csv?v=427889",
  checked: CHECKED,
};
const OFCOM_DAB: FrequencySource = {
  publisher: "Ofcom",
  title: "TxParams DAB data (CSV): every DAB transmitter and multiplex on air",
  url: "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/tv-transmitter-guidance/tech-parameters/txparamsdab.csv?v=427887",
  checked: CHECKED,
};
const RSGB_LW: FrequencySource = {
  publisher: "Radio Society of Great Britain (secondary source)",
  title: "The closure of BBC long-wave (29 May 2026)",
  url: "https://rsgb.org/main/blog/news/rsgb-notices/2026/05/29/the-closure-of-bbc-long-wave/",
  checked: CHECKED,
};
const RTE_LW: FrequencySource = {
  publisher: "RTÉ",
  title: "RTÉ Radio 1 to cease broadcasting on Long Wave (31 March 2023)",
  url: "https://about.rte.ie/2023/03/31/rte-radio-1-to-cease-broadcasting-on-long-wave/",
  checked: CHECKED,
};
const TWO_RN_FM: FrequencySource = {
  publisher: "2RN (RTÉ Transmission Network)",
  title: "FM radio network table (November 2023)",
  url: "https://2rn.ie/wp-content/uploads/2023/11/2RN_FM_table_Nov_2023_web.pdf",
  checked: CHECKED,
};
const ANFR_162: FrequencySource = {
  publisher: "ANFR (Agence nationale des fréquences)",
  title:
    "Après l'arrêt des émissions de France Inter Grandes Ondes fin décembre, le signal horaire restera diffusé sur la même fréquence (20 December 2016)",
  url: "https://www.anfr.fr/fileadmin/mediatheque/documents/Communiques_Presse/2016_12_20_communique_de_presse_signal_horaire.pdf",
  checked: CHECKED,
};
const RADIOWORLD_RTL: FrequencySource = {
  publisher: "Radio World (secondary source)",
  title: "RTL ends longwave service",
  url: "https://www.radioworld.com/global/rtl-ends-longwave-service",
  checked: CHECKED,
};
const POLSKIE_RADIO: FrequencySource = {
  publisher: "Polskie Radio",
  title: "Częstotliwości radiowe programów Polskiego Radia",
  url: "https://www2.polskieradio.pl/czestotliwosci/",
  checked: CHECKED,
};
const ANTENA_SATELOR: FrequencySource = {
  publisher: "Radio România Antena Satelor",
  title: "Radio România Antena Satelor: Mai aproape de tine, la radio și online! (11 July 2026)",
  url: "https://www.antenasatelor.ro/viata-la-tara/info-util/receptie-antena-satelor-id1.html",
  checked: CHECKED,
};
const NMHH_2026: FrequencySource = {
  publisher: "NMHH (Nemzeti Média- és Hírközlési Hatóság)",
  title: "Közszolgálati jegyzék 2026 (public service media list, in force from 1 February 2026)",
  url: "https://nmhh.hu/dokumentum/257357/kozszolgalati_jegyzek_2026.pdf",
  checked: CHECKED,
};
const ECFR_73_14: FrequencySource = {
  publisher: "US Government Publishing Office (Code of Federal Regulations)",
  title: "47 CFR 73.14, AM broadcast definitions (2025 edition)",
  url: "https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol4/xml/CFR-2025-title47-vol4-sec73-14.xml",
  checked: CHECKED,
};
const ECFR_73_201: FrequencySource = {
  publisher: "US Government Publishing Office (Code of Federal Regulations)",
  title: "47 CFR 73.201, Numerical designation of FM broadcast channels (2025 edition)",
  url: "https://www.govinfo.gov/content/pkg/CFR-2025-title47-vol4/xml/CFR-2025-title47-vol4-sec73-201.xml",
  checked: CHECKED,
};
const MIC_AM: FrequencySource = {
  publisher: "Ministry of Internal Affairs and Communications (総務省), Japan",
  title: "AM局の運用休止に係る特例措置 (special measures for suspending AM stations)",
  url: "https://www.soumu.go.jp/menu_seisaku/ictseisaku/housou_suishin/am_station.html",
  checked: CHECKED,
};
const EBC_2026: FrequencySource = {
  publisher: "EBC (Empresa Brasil de Comunicação)",
  title: "EBC lança novos sites das rádios Nacional e MEC nesta quarta-feira (17) (June 2026)",
  url: "https://www.ebc.com.br/imprensa/2026/ebc-lanca-novos-sites-das-radios-nacional-e-mec-nesta-quarta-feira-17",
  checked: CHECKED,
};
const RADIO_NACIONAL_AR: FrequencySource = {
  publisher: "Radio Nacional (Argentina)",
  title: "Radio Nacional: home page (AM 870 live stream and programmes)",
  url: "https://www.radionacional.com.ar/",
  checked: CHECKED,
};
const CRO_AM: FrequencySource = {
  publisher: "Český rozhlas",
  title: "Jak naladit stanice Českého rozhlasu po vypnutí vysílačů na středních a dlouhých vlnách",
  url: "https://portal.rozhlas.cz/jak-naladit-stanice-ceskeho-rozhlasu-po-vypnuti-vysilacu-na-strednich-a-dlouhych-8142714",
  checked: CHECKED,
};
const RADIOWORLD_DE_MW: FrequencySource = {
  publisher: "Radio World (secondary source)",
  title: "End of calendar year also brings end of MW transmission in Germany (21 December 2015)",
  url: "https://www.radioworld.com/trends-1/end-of-calendar-year-also-brings-end-of-mw-transmission-in-germany",
  checked: CHECKED,
};
const AVVENIRE_RAI: FrequencySource = {
  publisher: "Avvenire (secondary source)",
  title: "Rai spegne le onde medie, ma Fm e digitale non sempre garantiscono il servizio (7 August 2022)",
  url: "https://www.avvenire.it/attualita/rai-spegne-le-onde-medie-ma-fm-e-digitale-non-sempre-garantiscono-il-servizio_62004",
  checked: CHECKED,
};
const RUV_LW: FrequencySource = {
  publisher: "RÚV",
  title: "Útsendingar á langbylgju lagðar af (annual report 2024)",
  url: "https://arsskyrsla.ruv.is/utsendingar-a-langbylgju-lagdar-af/",
  checked: CHECKED,
};
const RUV_LW_NOTICE: FrequencySource = {
  publisher: "RÚV",
  title: "Tilkynning um lokun langbylgju (17 October 2024)",
  url: "https://www.ruv.is/um-ruv/i-umraedunni/2024-10-17-tilkynning-um-lokun-langbylgju-424925",
  checked: CHECKED,
};
const DLR_FREQ: FrequencySource = {
  publisher: "Deutschlandradio",
  title: "Frequenzsuche",
  url: "https://www.deutschlandradio.de/frequenzsuche-102.html",
  checked: CHECKED,
};
const DABPLUS_DE: FrequencySource = {
  publisher: "Digitalradio Büro Deutschland (dabplus.de)",
  title: "Empfang: DAB+ Empfangsprognose",
  url: "https://www.dabplus.de/empfang/",
  checked: CHECKED,
};

const PROPAGATION_LINK = { to: "/radio/propagation", label: "HF propagation: is the band open now" };

// ── Entries ─────────────────────────────────────────────────────────────────

export const NATIONAL_BROADCASTERS: FrequencyEntry[] = [
  // United Kingdom and the Isle of Man.
  {
    id: "bc-nat-gb-bbc-radio-5-live-mw",
    kind: "broadcasters",
    name: "BBC Radio 5 Live on medium wave",
    operator: "BBC",
    what: "The BBC's national news and sport network. With Radio 4's long wave gone, it is the BBC's main national service still on AM.",
    frequencies: [
      {
        khz: 693,
        note: "Droitwich (150 kW), Start Point (80 kW), Stagshaw (50 kW), Burghead (25 kW), Postwick (15 kW), and low-power fillers at Barrow, Enniskillen and Redmoss",
      },
      {
        khz: 909,
        note: "Moorside Edge (400 kW), Brookmans Park (200 kW), Clevedon (75 kW), Westerglen (70 kW), Lisnagarvey (5 kW), and low-power fillers at Fareham, Fern Barrow, Londonderry, Whitehaven and the Dartford Tunnel",
      },
      { khz: 990, note: "Tywyn (0.4 kW)" },
    ],
    modes: ["AM"],
    bands: ["mw"],
    where: ["GB"],
    hours: "Continuous",
    expect:
      "Speech: news on the hour, phone-ins and live sport. When sport rights do not cover AM, other programmes can replace it on these frequencies.",
    reception:
      "Across most of Great Britain and Northern Ireland by day from the high-power sites; after dark the signal reaches further, but fades and interference from Continental stations increase.",
    notes: [
      "Powers are Ofcom's in-use effective monopole radiated power (EMRP), rounded.",
      "Also on DAB (BBC National DAB, block 12B). Its FM frequencies are not listed by Ofcom because it has none.",
    ],
    status: "on-air",
    sources: [OFCOM_PAGE, OFCOM_MF],
    aliases: ["Five Live", "Radio Five Live", "693", "909"],
  },
  {
    id: "bc-nat-gb-talksport-mw",
    kind: "broadcasters",
    name: "talkSPORT on medium wave",
    operator: "talkSPORT (Wireless Group)",
    what: "The UK's national commercial AM licence: sport talk with news bulletins.",
    frequencies: [
      { khz: 1053, note: "Droitwich (500 kW), Postwick (18 kW)" },
      { khz: 1071, note: "Wrekenton (1 kW)" },
      { khz: 1089, note: "Brookmans Park (400 kW), Moorside Edge (400 kW), Westerglen (125 kW), Washford (80 kW), Dartford Tunnel" },
      { khz: 1107, note: "Boston (1 kW), Fareham (1 kW), Wallasey (0.5 kW)" },
    ],
    modes: ["AM"],
    bands: ["mw"],
    where: ["GB"],
    hours: "Continuous",
    expect: "Speech: sport talk and phone-ins, live commentary, short news bulletins.",
    reception: "Most of Great Britain from the high-power sites; further after dark.",
    notes: ['Ofcom\'s list names the service "Talk Sport"; powers are in-use EMRP, rounded.'],
    status: "on-air",
    sources: [OFCOM_PAGE, OFCOM_MF],
    aliases: ["Talk Sport", "1053", "1089"],
  },
  {
    id: "bc-nat-gb-bbc-radio-scotland-mw",
    kind: "broadcasters",
    name: "BBC Radio Scotland on medium wave",
    operator: "BBC",
    what: "The BBC's national station for Scotland: news, current affairs and sport. Its AM transmitters also cover parts where FM is weak.",
    frequencies: [{ khz: 810, note: "Westerglen (100 kW) and Burghead (100 kW)" }],
    modes: ["AM"],
    bands: ["mw"],
    where: ["GB"],
    expect:
      "Speech and music: Scottish and UK news, phone-ins, sport commentary (which sometimes runs on AM while FM carries other programmes).",
    reception: "Central Scotland and the north-east of Scotland by day; much of Scotland and northern England after dark.",
    status: "on-air",
    sources: [OFCOM_PAGE, OFCOM_MF],
    aliases: ["810"],
  },
  {
    id: "bc-nat-gb-bbc-radio-wales-mw",
    kind: "broadcasters",
    name: "BBC Radio Wales on medium wave",
    operator: "BBC",
    what: "The BBC's English-language national station for Wales, on one remaining AM transmitter.",
    frequencies: [{ khz: 882, note: "Washford, Somerset (10 kW), aimed across the Bristol Channel at south Wales" }],
    modes: ["AM"],
    bands: ["mw"],
    where: ["GB"],
    expect: "Speech and music: Welsh and UK news, phone-ins, sport.",
    reception: "South Wales and the Bristol Channel coast by day.",
    status: "on-air",
    sources: [OFCOM_PAGE, OFCOM_MF],
    aliases: ["882"],
  },
  {
    id: "bc-nat-gb-bbc-asian-network-mw",
    kind: "broadcasters",
    name: "BBC Asian Network on medium wave (Midlands)",
    operator: "BBC",
    what: "The BBC's national station for British Asian listeners, still on four AM transmitters in the Midlands.",
    frequencies: [
      { khz: 828, note: "Sedgley (0.2 kW)" },
      { khz: 837, note: "Freemens Common, Leicester (0.7 kW)" },
      { khz: 1449, note: "Gunthorpe (0.15 kW)" },
      { khz: 1458, note: "Langley Mill (5 kW)" },
    ],
    modes: ["AM"],
    bands: ["mw"],
    where: ["GB"],
    expect: "Music and speech in English and South Asian languages, with BBC news bulletins.",
    reception: "The West and East Midlands.",
    status: "on-air",
    sources: [OFCOM_PAGE, OFCOM_MF],
  },
  {
    id: "bc-nat-gb-bbc-local-radio-am",
    kind: "broadcasters",
    name: "BBC local radio still on AM (England)",
    operator: "BBC",
    what: "The few BBC local radio stations in England whose AM transmitters are still in Ofcom's list of transmitters on air. All other BBC local stations are on FM and DAB only.",
    frequencies: [
      { khz: 873, channel: "BBC Radio Norfolk", note: "West Lynn (0.25 kW)" },
      { khz: 1116, channel: "BBC Radio Derby", note: "Burnaston (1 kW)" },
      { khz: 1413, channel: "BBC Radio Gloucestershire", note: "Berkeley Heath (0.2 kW)" },
      { khz: 1566, channel: "BBC Somerset", note: "Taunton (1 kW)" },
    ],
    modes: ["AM"],
    bands: ["mw"],
    where: ["GB"],
    expect: "Local news, travel and weather, phone-ins; in a local emergency, local information.",
    reception: "The county each serves, by day; these are low-power transmitters.",
    notes: [
      "Ofcom's list of MF transmitters on air (updated 16 November 2026) has no other BBC local AM transmitters: the rest have closed. Absolute Radio and other former national commercial AM services are not in it either.",
    ],
    status: "on-air",
    sources: [OFCOM_PAGE, OFCOM_MF],
  },
  {
    id: "bc-nat-im-manx-radio-am",
    kind: "broadcasters",
    name: "Manx Radio on medium wave",
    operator: "Manx Radio",
    what: "The Isle of Man's public service station, on one AM transmitter.",
    frequencies: [{ khz: 1368, note: "Foxdale (20 kW)" }],
    modes: ["AM"],
    bands: ["mw"],
    where: ["IM"],
    expect: "Island news, weather, travel, sea and ferry information, music.",
    reception: "The Isle of Man and the surrounding Irish Sea coasts; further after dark.",
    status: "on-air",
    sources: [OFCOM_PAGE, OFCOM_MF],
    aliases: ["1368"],
  },
  {
    id: "bc-nat-gb-bbc-radio-4-lw",
    kind: "broadcasters",
    name: "BBC Radio 4 long wave, 198 kHz (closed)",
    operator: "BBC",
    what: "Radio 4's long wave service from Droitwich, Burghead and Westerglen, for decades the UK's best-known emergency fallback. It has closed.",
    frequencies: [{ khz: 198 }],
    modes: ["AM"],
    bands: ["lw"],
    where: ["GB", "IE"],
    expect: "Nothing from the BBC. Radio 4 and the Shipping Forecast continue on FM and DAB.",
    status: "closed",
    closed: "2026-06-27",
    notes: [
      "The closure date (27 June 2026 at 01:00 BST) comes from the Radio Society of Great Britain, a secondary source; the BBC's own pages could not be used (see the sources note).",
      "198 kHz is not in Ofcom's transmitter lists of 16 November 2026.",
    ],
    sources: [RSGB_LW, OFCOM_PAGE],
    aliases: ["Radio 4 LW", "Droitwich", "Shipping Forecast long wave"],
  },
  {
    id: "bc-nat-gb-bbc-national-fm",
    kind: "broadcasters",
    name: "BBC Radio 1, 2, 3 and 4 on FM: where to look on the dial",
    operator: "BBC",
    what: "The BBC's national FM networks each keep to their own stretch of the band across the UK, so a listener can find them anywhere without a list.",
    frequencies: [
      { khz: 88_100, toKhz: 90_200, channel: "Radio 2" },
      { khz: 90_300, toKhz: 92_600, channel: "Radio 3" },
      { khz: 92_500, toKhz: 96_100, channel: "Radio 4" },
      { khz: 97_100, toKhz: 99_800, channel: "Radio 1" },
      { khz: 103_500, toKhz: 104_900, channel: "Radio 4", note: "40 of its 215 transmitters" },
    ],
    modes: ["FM"],
    bands: ["fm"],
    where: ["GB"],
    hours: "Continuous",
    expect:
      "Radio 4: news on the hour, Today, the Shipping Forecast, and in a national emergency the BBC's main speech service. Radio 2: music with news on the hour. Radio 1: music with Newsbeat. Radio 3: classical music.",
    reception: "Line of sight from the nearest transmitter: about 50 to 100 km from a main site, less behind hills.",
    notes: [
      "These spans are the lowest and highest frequency of each network's transmitters in Ofcom's FM list of 16 November 2026, worked out from that list; the BBC's own frequency pages could not be used. Within a span the exact frequency depends on the transmitter.",
      "The nations' stations sit among them: BBC Radio Scotland 92.5 to 94.7 MHz, BBC Radio Ulster and Foyle 92.7 to 95.4 MHz, BBC Radio Wales 90.2 to 103.9 MHz, BBC Radio Cymru 92.4 to 104.9 MHz, BBC Radio nan Gàidheal 103.5 to 104.9 MHz (same list). Classic FM, the national commercial FM network, is between 99.9 and 101.9 MHz.",
    ],
    status: "on-air",
    sources: [OFCOM_PAGE, OFCOM_VHF],
    aliases: ["Radio Four FM", "Radio 1", "Radio 2", "Radio 3", "Radio 4"],
  },
  {
    id: "bc-nat-gb-national-dab",
    kind: "broadcasters",
    name: "UK national DAB multiplexes",
    what: "The three multiplexes that carry the UK's national digital stations, each on one DAB block everywhere (single-frequency networks).",
    frequencies: [
      {
        khz: 225_648,
        channel: "12B",
        note: "BBC National DAB: Radio 1, 2, 3, 4, 5 Live, 4 Extra, 6 Music, World Service, Asian Network and others",
      },
      { khz: 222_064, channel: "11D", note: "D1 National (Digital One): Classic FM, talkSPORT and others" },
      { khz: 223_936, channel: "12A", note: "D1 National at some transmitters (Ofcom's list has 18 on 12A)" },
      { khz: 216_928, channel: "11A", note: "SDL National (Sound Digital)" },
    ],
    modes: ["DAB"],
    bands: ["dab"],
    where: ["GB"],
    hours: "Continuous",
    expect: "On a DAB set, a list of station names after a scan; tune by name, not frequency. BBC Radio 4 and 5 Live are on 12B.",
    reception: "Most of the UK; indoor reception is weaker than in-car or by a window. A full rescan picks up new transmitters.",
    status: "on-air",
    sources: [OFCOM_PAGE, OFCOM_DAB],
    aliases: ["Digital One", "Sound Digital", "12B"],
  },

  // Ireland.
  {
    id: "bc-nat-ie-rte-radio-1-lw",
    kind: "broadcasters",
    name: "RTÉ Radio 1 long wave, 252 kHz (closed)",
    operator: "RTÉ",
    what: "RTÉ Radio 1's long wave service from Clarkstown, heard across Ireland and Britain. It has closed.",
    frequencies: [{ khz: 252 }],
    modes: ["AM"],
    bands: ["lw"],
    where: ["IE", "GB"],
    expect:
      "Nothing from RTÉ. RTÉ Radio 1 continues on FM in Ireland and on Saorview and Saorsat; in Britain, RTÉ named satellite and cable channels instead.",
    status: "closed",
    closed: "2023-04-14",
    sources: [RTE_LW],
    aliases: ["LW 252", "Clarkstown"],
  },
  {
    id: "bc-nat-ie-rte-radio-1-fm",
    kind: "broadcasters",
    name: "RTÉ Radio 1 on FM (main transmitters)",
    operator: "RTÉ (transmitters by 2RN)",
    what: "Ireland's national speech station on its eight main FM transmitters. In the same table every Radio 1 frequency, relays included, is between 87.8 and 90.2 MHz.",
    frequencies: [
      { khz: 87_800, note: "Clermont Carn" },
      { khz: 88_200, note: "Truskmore" },
      { khz: 88_500, note: "Three Rock (Dublin)" },
      { khz: 88_800, note: "Maghera" },
      { khz: 89_100, note: "Kippure" },
      { khz: 89_600, note: "Mount Leinster" },
      { khz: 89_800, note: "Cairn Hill" },
      { khz: 90_000, note: "Mullaghanish" },
    ],
    modes: ["FM"],
    bands: ["fm"],
    where: ["IE"],
    hours: "Continuous",
    expect: "News on the hour, Morning Ireland, current affairs; RTÉ's main service for public information.",
    reception: "Most of Ireland; Clermont Carn and Maghera also reach parts of Northern Ireland.",
    notes: ["The same 2RN table gives the frequencies of RTÉ 2fm, RTÉ Raidió na Gaeltachta and RTÉ lyric fm at every site."],
    status: "on-air",
    sources: [TWO_RN_FM, RTE_LW],
    aliases: ["Radio One", "88-90 FM"],
  },

  // France and Luxembourg.
  {
    id: "bc-nat-fr-france-inter-lw",
    kind: "broadcasters",
    name: "France Inter long wave, 162 kHz (closed)",
    operator: "Radio France (transmitter by TDF, Allouis)",
    what: "France Inter on long wave from Allouis, which covered all of mainland France. The programme has gone; the carrier stays on the air for the time signal.",
    frequencies: [{ khz: 162 }],
    modes: ["AM"],
    bands: ["lw"],
    where: ["FR"],
    expect: "No programme. A carrier with a time code for clocks may be heard; it is not audible as speech.",
    status: "closed",
    closed: "2016-12",
    notes: [
      "ANFR's press release says France Inter Grandes Ondes would stop at the end of December 2016 and that the time signal would continue on 162 kHz from 1 January 2017.",
    ],
    sources: [ANFR_162],
    aliases: ["France Inter Grandes Ondes", "Allouis", "GO"],
  },
  {
    id: "bc-nat-lu-rtl-lw",
    kind: "broadcasters",
    name: "RTL long wave, 234 kHz (closed)",
    operator: "RTL (from Beidweiler, Luxembourg)",
    what: "RTL's French-language service on long wave from Luxembourg, aimed at France. It has closed.",
    frequencies: [{ khz: 234 }],
    modes: ["AM"],
    bands: ["lw"],
    where: ["FR", "LU"],
    expect: "Nothing from RTL. RTL continues on FM and DAB+ in France.",
    status: "closed",
    closed: "2023-01-01",
    notes: ["The closure date is from Radio World, a secondary source; RTL's own announcement was not found."],
    sources: [RADIOWORLD_RTL],
    aliases: ["RTL Grandes Ondes", "Beidweiler"],
  },

  // Poland.
  {
    id: "bc-nat-pl-polskie-radio-jedynka-lw",
    kind: "broadcasters",
    name: "Polskie Radio Program 1 (Jedynka) on long wave",
    operator: "Polskie Radio",
    what: "Poland's national public station on long wave, which Polskie Radio says can be received across Poland and in neighbouring countries. One of the few national long wave services left in Europe.",
    frequencies: [{ khz: 225 }],
    modes: ["AM"],
    bands: ["lw"],
    where: ["PL", "CZ", "SK", "DE", "LT", "BY", "UA"],
    expect: "Polish speech: news on the hour, current affairs, music. In a national crisis, official announcements.",
    reception:
      "All of Poland by day and night; neighbouring countries, further after dark. Long wave needs a set with an LW band; keep it away from chargers and screens.",
    notes: [
      "Polskie Radio's frequency page says Program 1 is received in Poland and neighbouring countries on long wave on 225 kHz, and all its programmes on FM across the country (frequency maps per programme on the same page).",
    ],
    status: "on-air",
    sources: [POLSKIE_RADIO],
    aliases: ["Jedynka", "Program 1", "Polish Radio long wave", "Solec Kujawski", "fale długie"],
  },

  // Romania.
  {
    id: "bc-nat-ro-antena-satelor",
    kind: "broadcasters",
    name: "Radio România Antena Satelor on long and medium wave",
    operator: "Radio România (SRR)",
    what: "Romania's public station for rural listeners, on long wave for the whole country and on four regional medium wave frequencies.",
    frequencies: [
      { khz: 153, note: "national coverage" },
      { khz: 531, note: "Bacău, Brăila, Călăraşi, Ialomiţa and Vrancea counties" },
      { khz: 603, note: "Ilfov, Giurgiu, Prahova and Teleorman" },
      { khz: 630, note: "Argeş, Dâmboviţa, Dolj, Olt and Vâlcea" },
      { khz: 1314, note: "Banat and Dobrogea" },
    ],
    modes: ["AM"],
    bands: ["lw", "mw"],
    where: ["RO"],
    expect: "Romanian speech and folk music: news, farming and rural affairs, weather.",
    reception:
      "153 kHz is meant for listening across Romania, including where FM is hard to receive (the station's words); the medium wave frequencies serve the counties named.",
    notes: [
      "The same page gives FM in some towns: 89.0 Comăneşti, 106.9 Zalău, 103.2 Sulina, 88.0 Drăgăşani, 93.9 Motru, 93.8 Sighetu Marmaţiei, 99.7 MHz Târgu Bujor.",
    ],
    status: "on-air",
    sources: [ANTENA_SATELOR],
    aliases: ["Antena Satelor", "unde lungi", "Bod", "Brașov"],
  },

  // Hungary.
  {
    id: "bc-nat-hu-kossuth-mw",
    kind: "broadcasters",
    name: "Kossuth Rádió on medium wave, 540 kHz",
    operator: "MTVA (Hungarian public media)",
    what: "Hungary's main public news station, on one high-power medium wave transmitter at Solt that covers the country and much of Central Europe.",
    frequencies: [
      { khz: 540, note: "Solt (with Lakihegy as reserve); Siófok (Balatonszabadi) as a substitute site" },
      { khz: 1341, note: "Szolnok, a substitute site" },
    ],
    modes: ["AM"],
    bands: ["mw"],
    where: ["HU"],
    hours: "04:25 to 22:31 Hungarian local time, every day (as the NMHH list gives it)",
    expect: "Hungarian speech: news on the hour, current affairs, public announcements.",
    reception: "Hungary; medium wave reaches further after dark.",
    notes: [
      "The NMHH public service list in force from 1 February 2026 also gives Kossuth's FM network (dozens of transmitters, listed by town).",
      "Listed under the Media Act's must-carry rule (Mttv. 74. §).",
    ],
    status: "on-air",
    sources: [NMHH_2026],
    aliases: ["Kossuth", "Solt", "középhullám", "540"],
  },
  {
    id: "bc-nat-hu-danko-mw",
    kind: "broadcasters",
    name: "Dankó Rádió on medium wave",
    operator: "MTVA (Hungarian public media)",
    what: "A Hungarian public station of folk and popular music, on four medium wave transmitters.",
    frequencies: [
      { khz: 1116, note: "Miskolc and Mosonmagyaróvár" },
      { khz: 1251, note: "Nyíregyháza and Szombathely" },
    ],
    modes: ["AM"],
    bands: ["mw"],
    where: ["HU"],
    hours: "Monday to Friday 04:30 to 21:05, Saturday and Sunday 05:00 to 21:05, Hungarian local time",
    expect: "Hungarian folk and popular music with news bulletins.",
    status: "on-air",
    sources: [NMHH_2026],
  },
  {
    id: "bc-nat-hu-nemzetisegi-mw",
    kind: "broadcasters",
    name: "Nemzetiségi Rádió on medium wave",
    operator: "MTVA (Hungarian public media)",
    what: "Hungary's public station for its national minorities, in their languages, on medium wave.",
    frequencies: [
      { khz: 873, note: "Kozármisleny and Lakihegy" },
      { khz: 1188, note: "Marcali and Szolnok" },
      { khz: 1350, note: "Győr" },
    ],
    modes: ["AM"],
    bands: ["mw"],
    where: ["HU"],
    hours: "08:00 to 20:00 Hungarian local time",
    expect: "Programmes in German, Slovak, Romanian, Croatian, Serbian, Romani and other minority languages, with news.",
    status: "on-air",
    sources: [NMHH_2026],
  },

  // United States.
  {
    id: "bc-nat-us-am-fm-bands",
    kind: "broadcasters",
    name: "United States: AM and FM broadcast stations",
    operator: "Licensed by the FCC",
    what: "The US has no national AM or FM network on one frequency: thousands of local stations, each licensed by the FCC for its area. Tune across the band and stop at the strongest speech station; most carry network news at the top of the hour.",
    frequencies: [
      { khz: 535, toKhz: 1705, note: "AM band: 117 channels, 540 to 1700 kHz in 10 kHz steps" },
      { khz: 88_000, toKhz: 108_000, note: "FM band: 100 channels of 200 kHz, 88.1 to 107.9 MHz" },
    ],
    modes: ["AM", "FM", "HD-RADIO"],
    bands: ["mw", "fm"],
    where: ["US"],
    expect:
      "Local news, talk, weather and traffic on AM; music with short news on most FM stations. In an emergency, Emergency Alert System messages interrupt programmes.",
    reception:
      "AM stations cover tens of kilometres by day; after dark many reach hundreds of kilometres by skywave, and some lower their power at night. FM covers about 50 to 100 km.",
    notes: [
      "Channel figures from 47 CFR 73.14 (AM) and 73.201 (FM). Some US stations also transmit HD Radio, a digital signal beside the analogue one; an ordinary set still receives the analogue programme.",
      "FEMA's Primary Entry Point stations (AM and FM stations with backup power that carry national alerts) are listed under emergency broadcasting where FEMA publishes them.",
    ],
    links: [PROPAGATION_LINK],
    status: "on-air",
    sources: [ECFR_73_14, ECFR_73_201],
    aliases: ["AM radio", "FM radio", "530", "1700"],
  },

  // Japan.
  {
    id: "bc-nat-jp-am-fm-bands",
    kind: "broadcasters",
    name: "Japan: AM and FM broadcasting, and the move of commercial AM to FM",
    what: "NHK and commercial stations broadcast on AM and on Japan's own FM band, which starts at 76 MHz. Many commercial AM stations have suspended AM in favour of \"wide FM\" relays above 90 MHz; NHK's AM continues.",
    frequencies: [
      { khz: 531, toKhz: 1602, note: "AM band" },
      { khz: 76_000, toKhz: 90_000, note: "FM band used before wide FM" },
      { khz: 90_000, toKhz: 99_000, note: "wide FM: commercial AM stations' FM relays (the band was widened on 19 May 2025)" },
    ],
    modes: ["AM", "FM"],
    bands: ["mw", "fm-japan", "fm"],
    where: ["JP"],
    expect: "NHK AM: national and regional news and, in a disaster, NHK's disaster coverage. Commercial stations: local news and talk.",
    reception: "AM by day across a prefecture or region from the main transmitters; further after dark.",
    notes: [
      "The Ministry of Internal Affairs and Communications says 27 commercial broadcasters have suspended 88 AM stations, some until as late as 31 October 2028, and that NHK is not covered by the measure: NHK AM can still be heard.",
      "The ministry advises checking that a set covers the wide FM frequencies (90 to 99 MHz) as well as 76 to 90 MHz.",
    ],
    status: "on-air",
    sources: [MIC_AM],
    aliases: ["NHK", "ワイドFM", "wide FM", "AM休止"],
  },

  // Brazil.
  {
    id: "bc-nat-br-radio-nacional",
    kind: "broadcasters",
    name: "Rádio Nacional (EBC), Brazil",
    operator: "EBC (Empresa Brasil de Comunicação)",
    what: "Brazil's federal public radio, on AM in Brasília and Rio de Janeiro and on FM in several cities.",
    frequencies: [
      { khz: 980, note: "AM, Brasília" },
      { khz: 1130, note: "AM, Rio de Janeiro" },
      { khz: 96_100, note: "FM, Brasília" },
      { khz: 87_100, note: "FM, Rio de Janeiro, São Paulo and Recife" },
      { khz: 93_700, note: "FM, São Luís" },
      { khz: 96_100, note: "FM, Alto Solimões" },
    ],
    modes: ["AM", "FM"],
    bands: ["mw", "fm", "vhf"],
    where: ["BR"],
    expect: "Portuguese speech and music: news, public service information, Brazilian music.",
    notes: [
      "87.1 MHz is below 87.5 MHz, where the FM band of many sets starts: check that a set reaches it.",
      "Rádio Nacional da Amazônia is on shortwave (6180 and 11780 kHz in the same release); it is listed with the shortwave broadcasters.",
    ],
    status: "on-air",
    sources: [EBC_2026],
    aliases: ["Radio Nacional Brasilia", "EBC"],
  },

  // Argentina.
  {
    id: "bc-nat-ar-radio-nacional-am870",
    kind: "broadcasters",
    name: "Radio Nacional AM 870, Argentina",
    operator: "Radio Nacional (Radio y Televisión Argentina)",
    what: "Argentina's national public radio; its main AM service is AM 870, the network's flagship in Buenos Aires.",
    frequencies: [{ khz: 870 }],
    modes: ["AM"],
    bands: ["mw"],
    where: ["AR"],
    expect: "Spanish speech: news, current affairs, sport, Argentine music.",
    reception: "Buenos Aires and around by day; further after dark.",
    notes: [
      "Radio Nacional's site names the service \"AM 870\"; that it transmits from Buenos Aires is general knowledge, not stated on the page read. Radio Nacional's provincial stations have their own AM and FM frequencies.",
    ],
    status: "on-air",
    sources: [RADIO_NACIONAL_AR],
    aliases: ["LRA1", "Radio Nacional Argentina"],
  },
];

// ── Guides ──────────────────────────────────────────────────────────────────

export const NATIONAL_BROADCASTERS_GUIDES: FrequencyGuide[] = [
  {
    id: "bc-nat-finding-fm-and-dab",
    kind: "broadcasters",
    title: "Finding FM and DAB stations",
    paragraphs: [
      "FM and DAB frequencies change from one transmitter to the next, so there is no single number to tune for a national station. Scan: on FM, tune slowly across the whole band and note the strongest stations; on DAB, run a full scan and choose by name.",
      'The FM band is 87.5 to 108 MHz in most of the world (88 to 108 MHz in the United States, where channels run 88.1 to 107.9 MHz). Japan uses 76 to 90 MHz, with "wide FM" relays of AM stations up to 99 MHz; Brazil has stations below 87.5 MHz. Some sets made for the former Eastern bloc tune an older, lower FM band. A set\'s band has to match the country.',
      "Some national networks keep to one stretch of the band everywhere. In the UK (from Ofcom's transmitter list), BBC Radio 2 is between 88.1 and 90.2 MHz, Radio 3 between 90.3 and 92.6, Radio 4 between 92.5 and 96.1 (and 103.5 to 104.9 at a few sites), Radio 1 between 97.1 and 99.8, and Classic FM between 99.9 and 101.9. In Ireland, RTÉ Radio 1 is between 87.8 and 90.2 MHz.",
      "DAB is in VHF Band III. A multiplex occupies a block such as 12B (225.648 MHz), which carries the BBC's national stations across the UK. A DAB set does not need the block number, but a manual tune to a known block can find a weak multiplex a scan missed.",
      "Where the broadcaster or regulator publishes a list, use it before the internet goes: Ofcom publishes every UK FM, AM and DAB transmitter; 2RN publishes RTÉ's FM table; Deutschlandradio has a frequency search for Deutschlandfunk and its sister stations, and dabplus.de a DAB+ reception forecast by place; Polskie Radio and the Hungarian regulator NMHH publish their FM networks. Write down the frequencies for your area and the next areas along your likely route.",
      "In an emergency, the national public broadcaster's main speech station (BBC Radio 4 or Radio 5 Live, RTÉ Radio 1, Kossuth, Jedynka, NHK) is usually the first to carry official information.",
    ],
    sources: [OFCOM_PAGE, OFCOM_VHF, OFCOM_DAB, TWO_RN_FM, DLR_FREQ, DABPLUS_DE, POLSKIE_RADIO, NMHH_2026, ECFR_73_201, MIC_AM, EBC_2026],
  },
  {
    id: "bc-nat-europe-lw-mw-closures",
    kind: "broadcasters",
    title: "Long and medium wave in Europe: what has closed",
    paragraphs: [
      "Most of Western Europe's national long and medium wave services have closed in the last decade. A long wave set that once found news anywhere may now find little. What is still on the air, from the broadcasters' and regulators' own lists: Polskie Radio on 225 kHz, Antena Satelor (Romania) on 153 kHz, Kossuth Rádió (Hungary) on 540 kHz, and in the UK BBC Radio 5 Live, talkSPORT, BBC Radio Scotland and BBC Radio Wales on medium wave.",
      "United Kingdom: BBC Radio 4 long wave on 198 kHz closed on 27 June 2026 (date from the RSGB, a secondary source). Ireland: RTÉ Radio 1 left 252 kHz on 14 April 2023. France: France Inter left 162 kHz at the end of December 2016 (the carrier remains for a time code); RTL left 234 kHz on 1 January 2023 (Radio World).",
      "Czech Republic: Český rozhlas switched off all its medium and long wave transmitters (Radiožurnál on long wave, Dvojka and Plus on medium wave) on 31 December 2021. Germany: medium wave broadcasting ended on 31 December 2015 (Radio World); Deutschlandfunk's long wave ended before that. Italy: RAI ended medium wave from 11 September 2022 (Avvenire, quoting RAI). Iceland: RÚV ended all long wave broadcasting in October 2024; its safety broadcasts now go out on Rás 2 over the FM network.",
      "These lists change. The frequency of a closed station can be reused, or carry another country's station after dark, so a signal on an old frequency is not proof the old service is back.",
    ],
    sources: [
      OFCOM_PAGE,
      OFCOM_MF,
      RSGB_LW,
      RTE_LW,
      ANFR_162,
      RADIOWORLD_RTL,
      CRO_AM,
      RADIOWORLD_DE_MW,
      AVVENIRE_RAI,
      RUV_LW,
      RUV_LW_NOTICE,
      POLSKIE_RADIO,
      ANTENA_SATELOR,
      NMHH_2026,
    ],
  },
];
