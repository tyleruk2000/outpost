/**
 * Frequencies to listen to: the kind "emergency". See radio-frequencies.ts for the shape and
 * docs/radio-frequencies.md for how entries are sourced and checked.
 *
 * What each country's civil-protection body (or its national broadcaster) tells the public
 * to tune to in an emergency. Most name a broadcaster, not a frequency, because FM and
 * medium-wave frequencies differ from one transmitter to the next: those entries give the
 * band the advice points to and say how to find the local frequency. Where the official
 * source itself lists a short national set of frequencies (the Netherlands, New Zealand),
 * the entry lists them.
 */
import type { FrequencyEntry, FrequencyGuide, FrequencySource } from "../radio-frequencies.ts";

const CHECKED = "2026-11-17";
const src = (publisher: string, title: string, url: string): FrequencySource => ({ publisher, title, url, checked: CHECKED });

/** The whole FM broadcast band, for advice that names a station but not its frequency. */
const FM_BAND = { khz: 87_500, toKhz: 108_000 } as const;
/** The whole medium-wave band (Region 2 edges, wide enough for every region). */
const MW_BAND = { khz: 525, toKhz: 1705 } as const;
/** DAB Band III. */
const DAB_BAND = { khz: 174_000, toKhz: 240_000 } as const;

const LOCAL_FM = "The frequency differs from one transmitter to the next: find the local one before you need it and write it on the radio.";

export const EMERGENCY: FrequencyEntry[] = [
  // ── United Kingdom ───────────────────────────────────────────────────────
  {
    id: "em-gb-bbc-radio",
    kind: "emergency",
    name: "BBC Radio 2 and Radio 4, and local radio (United Kingdom)",
    operator: "BBC; advice from the UK Government (Be Ready) and the UK Chief Medical Officers",
    what: "The UK Government's Be Ready advice is to keep a battery or wind-up radio and, in a power cut, to search for stations still broadcasting on FM and digital. Its plan for a national power outage says emergency messages to the public would go out on BBC Radio 2 and BBC Radio 4.",
    frequencies: [
      { khz: 92_000, toKhz: 95_000, note: "BBC Radio 4 on FM, as Epping Forest District Council gives it" },
      { khz: 103_000, toKhz: 105_000, note: "BBC Radio 4 on FM in some areas, as Epping Forest District Council gives it" },
      { khz: 88_100, note: "BBC Radio 2, as Epping Forest District Council gives it for its area (Essex)" },
      { khz: 90_200, note: "BBC Radio 2, as Epping Forest District Council gives it for its area (Essex)" },
      { ...FM_BAND, note: "BBC local and national stations, and commercial stations: frequencies differ by transmitter" },
    ],
    modes: ["FM", "DAB"],
    bands: ["fm"],
    where: ["GB"],
    expect:
      "In a total power outage across Great Britain, official public-health advice read on BBC Radio 2 and Radio 4. In a local power cut, local and national stations still on the air with news updates.",
    reception: "FM nationwide from many transmitters; DAB where there is coverage. Radio 2's and Radio 4's frequencies vary by area.",
    status: "on-air",
    notes: [
      "The Chief Medical Officers' scripts (published 16 December 2025) say that in a national power outage emergency communications to the public would be limited to radio, BBC Radio 2 and Radio 4, as the most power-resilient form of communication, for anyone with a battery-powered, wind-up or car radio.",
      "Be Ready: keep a battery or wind-up radio and spare batteries; write down on paper the frequencies of the local and national stations you use for news; in a power cut search for stations still broadcasting and try both FM and digital modes; a car radio works too.",
      "The FM ranges and the two Radio 2 frequencies above are from a district council's page for its own area (Essex). Elsewhere, find the local frequencies before you need them.",
      "BBC Radio 4 on long wave is dealt with under News broadcasters; it is not named in the government advice read here.",
    ],
    links: [{ to: "/prepare/weather", label: "Weather and warnings" }],
    sources: [
      src(
        "UK Chief Medical Officers (GOV.UK)",
        "Water and sanitation - scripts for broadcast media (Public health advice from UK CMOs during a national power outage)",
        "https://www.gov.uk/government/publications/public-health-advice-from-uk-cmos-during-a-national-power-outage/water-and-sanitation-scripts-for-broadcast-media",
      ),
      src("UK Government (Be Ready)", "Power cuts - Be Ready", "https://beready.campaign.gov.uk/be-informed-about-hazards/power-cuts/"),
      src("UK Government (Be Ready)", "Be ready for emergencies - Be Ready", "https://beready.campaign.gov.uk/be-ready-for-emergencies/"),
      src(
        "Epping Forest District Council",
        "National power outage",
        "https://www.eppingforestdc.gov.uk/crime-and-safety/national-power-outage/",
      ),
    ],
    aliases: ["BBC", "Radio 4", "Radio 2", "power cut", "blackout", "national power outage", "Be Ready", "Prepare"],
  },

  // ── Ireland ──────────────────────────────────────────────────────────────
  {
    id: "em-ie-local-radio",
    kind: "emergency",
    name: "Local radio (Ireland, Be Emergency Ready)",
    operator: "Office of Emergency Planning, Department of Defence (Ireland)",
    what: "The government's Be Emergency Ready booklet, delivered to households in 2026, says to listen to local radio to stay up to date, and to keep a battery, wind-up or solar radio and spare batteries, or use a car radio.",
    frequencies: [{ ...FM_BAND, note: "local and national stations: frequencies differ by area" }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["IE"],
    expect: "Local and national stations with news and official advice. The booklet names no station or frequency.",
    reception: "FM throughout Ireland. " + LOCAL_FM,
    status: "on-air",
    notes: [
      "RTÉ Radio 1's long-wave service on 252 kHz ended on 14 April 2023: a long-wave set will not find it (see the closed entry).",
      "The booklet's full text is at gov.ie/BeEmergencyReady; the copy read was the accessible English version hosted by South Dublin County Council.",
    ],
    sources: [
      src(
        "Office of Emergency Planning (Ireland), copy hosted by South Dublin County Council",
        "Be Emergency Ready (accessible English booklet)",
        "https://www.sdcc.ie/en/services/environment/be-emergency-ready/english_accessible_booklet.pdf",
      ),
    ],
    aliases: ["Be Emergency Ready", "RTÉ", "RTE"],
  },
  {
    id: "em-ie-rte-lw-252",
    kind: "emergency",
    name: "RTÉ Radio 1 long wave 252 kHz (closed)",
    operator: "RTÉ",
    what: "RTÉ Radio 1's long-wave service from Summerhill, Co Meath, which carried Radio 1 to Ireland and Britain. It has closed.",
    frequencies: [{ khz: 252 }],
    modes: ["AM"],
    bands: ["lw"],
    where: ["IE", "GB"],
    site: "Summerhill, Co Meath",
    expect: "Nothing: the service ended. Listen to RTÉ Radio 1 on FM or DAB instead.",
    status: "closed",
    closed: "2023-04-14",
    notes: ["RTÉ said the transmitter used 2.5% of the organisation's energy and the service was no longer sustainable."],
    sources: [src("RTÉ", "RTÉ says long wave 252 service to end next month", "https://www.rte.ie/news/2023/0331/1367393-long-wave/")],
    aliases: ["long wave", "LW", "252", "Summerhill"],
  },

  // ── United States ────────────────────────────────────────────────────────
  {
    id: "em-us-eas",
    kind: "emergency",
    name: "Emergency Alert System on broadcast radio (USA)",
    operator: "FEMA and the FCC; broadcast by radio and TV stations",
    what: "The Emergency Alert System carries warnings on broadcast radio and television, and lets the President address the nation within 10 minutes in a national emergency. Ready.gov's basic kit includes a battery-powered or hand-crank radio and a NOAA Weather Radio with tone alert.",
    frequencies: [
      { ...MW_BAND, note: "AM stations: frequencies differ by area" },
      { ...FM_BAND, note: "FM stations: frequencies differ by area" },
    ],
    modes: ["AM", "FM"],
    bands: ["mw", "fm"],
    where: ["US"],
    expect:
      "The EAS attention tones and a spoken alert breaking into a station's programme, then local news and instructions. Any local AM or FM station will carry it; there is no single EAS frequency.",
    reception: "Every AM and FM broadcast station takes part. " + LOCAL_FM,
    status: "on-air",
    notes: [
      "Ready.gov: EAS 'is also used when all other means of alerting the public are unavailable'.",
      "NOAA Weather Radio All Hazards (162.400 to 162.550 MHz) also carries non-weather emergencies such as national security or public safety threats; it is listed under Weather.",
    ],
    links: [{ to: "/prepare/weather", label: "Weather and warnings" }],
    sources: [
      src("Ready.gov (FEMA)", "Emergency Alerts", "https://www.ready.gov/alerts"),
      src("Ready.gov (FEMA)", "Build A Kit", "https://www.ready.gov/kit"),
    ],
    aliases: ["EAS", "FEMA", "Ready.gov", "IPAWS", "hand crank radio"],
  },

  // ── Canada ───────────────────────────────────────────────────────────────
  {
    id: "em-ca-alert-ready",
    kind: "emergency",
    name: "Alert Ready on radio and TV (Canada)",
    operator: "Alert Ready (Pelmorex, with federal, provincial and territorial emergency management)",
    what: "Canada's national public alerting system delivers emergency alerts through television, radio and wireless devices, introduced by a distinctive tone.",
    frequencies: [
      { ...MW_BAND, note: "AM stations: frequencies differ by area" },
      { ...FM_BAND, note: "FM stations: frequencies differ by area" },
    ],
    modes: ["AM", "FM"],
    bands: ["mw", "fm"],
    where: ["CA"],
    expect:
      "The Alert Ready tone and a spoken alert on local radio stations; broadcasters may use text-to-speech for the audio. There is no single frequency.",
    reception: LOCAL_FM,
    status: "on-air",
    notes: [
      "Environment and Climate Change Canada's Weatheradio and Hello Weather are no longer in service (its page, modified 29 September 2026). Marine forecasts are still on the Canadian Coast Guard's radio system.",
    ],
    sources: [
      src("Alert Ready (Pelmorex Corp.)", "Alert Ready Emergency Alert System", "https://www.alertready.ca/"),
      src(
        "Environment and Climate Change Canada",
        "Weatheradio",
        "https://www.canada.ca/en/environment-climate-change/services/weatheradio.html",
      ),
    ],
    aliases: ["Alert Ready", "En Alerte", "Weatheradio"],
  },

  // ── Germany ──────────────────────────────────────────────────────────────
  {
    id: "em-de-radio",
    kind: "emergency",
    name: "Radio warnings (Germany)",
    operator: "Bundesamt für Bevölkerungsschutz und Katastrophenhilfe (BBK); broadcast by public and private stations",
    what: "Official warnings from the Modular Warning System (MoWaS) go out on national, state-wide and many local radio stations, analogue and DAB+. The BBK advises a battery or wind-up radio with VHF (FM) and digital reception, since in a power cut radio is the main warning device.",
    frequencies: [
      { ...FM_BAND, note: "UKW (FM): frequencies differ by station and transmitter" },
      { ...DAB_BAND, note: "DAB+" },
    ],
    modes: ["FM", "DAB"],
    bands: ["fm", "dab"],
    where: ["DE"],
    expect:
      "Official warnings read on air, with what to do. When a siren sounds, the BBK says to find out about the danger on the radio, in warning apps or on websites.",
    reception: "FM and DAB+ nationwide. " + LOCAL_FM,
    status: "on-air",
    notes: [
      "The BBK names the kinds of station that carry warnings (überregionale, landesweite and many local stations, analogue and DAB+), not particular ones.",
      "A solar-powered radio or a car radio can also be used (BBK).",
    ],
    sources: [
      src(
        "BBK",
        "So werden Sie gewarnt",
        "https://www.bbk.bund.de/DE/Warnung-Vorsorge/Warnung-in-Deutschland/So-werden-Sie-gewarnt/so-werden-sie-gewarnt_node.html",
      ),
      src(
        "BBK",
        "Keep up to date",
        "https://bbk.bund.de/EN/Prepare-for-disasters/Personal-Preparedness/Keep-up-to-date/keep-up-to-date.html",
      ),
    ],
    aliases: ["BBK", "MoWaS", "Warnung", "UKW", "Deutschlandfunk", "ARD"],
  },

  // ── Austria ──────────────────────────────────────────────────────────────
  {
    id: "em-at-orf-oe3",
    kind: "emergency",
    name: "ORF emergency radio and Hitradio Ö3 (Austria)",
    operator: "ORF; advice from the Austrian federal government",
    what: "In a blackout the public is informed round the clock by the ORF emergency radio station (oesterreich.gv.at). The federal ministry's blackout advice says to tune a battery or hand-crank radio to Ö3 in advance; Ö3 confirming a blackout while private stations fall silent is one of the signs it gives.",
    frequencies: [{ ...FM_BAND, note: "Ö3 and the ORF regional stations: frequencies differ by transmitter" }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["AT"],
    expect: "Information on the situation and official instructions on Ö3 and ORF radio, round the clock in a blackout.",
    reception: "FM throughout Austria. " + LOCAL_FM,
    status: "on-air",
    notes: [
      "Suitable sets that do not need mains power: crank or battery radios with spare batteries, or the car radio (oesterreich.gv.at).",
      "Police stations stay staffed as points of contact in a blackout (oesterreich.gv.at).",
    ],
    sources: [
      src(
        "oesterreich.gv.at (Austrian federal government)",
        "Verhalten bei Blackout",
        "https://www.oesterreich.gv.at/de/themen/notfaelle_unfaelle_und_kriminalitaet/katastrophenfaelle/1/Seite.29500329",
      ),
      src(
        "Bundesministerium für Wirtschaft, Energie und Tourismus",
        "Blackout (Sichere Gastfreundschaft)",
        "https://www.bmwet.gv.at/Themen/Tourismus/Sichere-Gastfreundschaft/Blackout.html",
      ),
    ],
    aliases: ["Ö3", "Oe3", "ORF", "Notfallradio", "Blackout", "Zivilschutz"],
  },

  // ── Switzerland ──────────────────────────────────────────────────────────
  {
    id: "em-ch-ibbk",
    kind: "emergency",
    name: "IBBK emergency radio on SRG first programmes (Switzerland)",
    operator: "Federal Office for Civil Protection (FOCP / BABS), with SRG",
    what: "IBBK radio is the federal system for official crisis information, using the three national SRG networks and federal transmitters built to reach people in cellars and shelters up to two floors underground. It is switched on when the public is told to take shelter.",
    frequencies: [{ ...FM_BAND, note: "the frequency of the regional SRG first programme: SRF 1, RTS La 1ère or RSI Rete Uno" }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["CH"],
    expect:
      "Official instructions in German, French and Italian. After a siren alarm the messages may have to be broadcast on all three national channels.",
    reception:
      "On the same frequency as the first programme of the regional SRG station. A DAB+ radio can be switched to FM to receive it; some switch themselves.",
    status: "occasional",
    notes: [
      "FOCP: a DAB+ radio with spare batteries is an essential part of every household's emergency kit.",
      "The future of IBBK radio is open. FOCP's page (18 July 2025) says parts of the system are reaching the end of their service life and the DDPS is exploring solutions. FOCP's fact sheet on its multi-channel strategy (state at 31 March 2026) says FOCP proposes giving up the IBBK emergency radio system; the consultation ended on 2 February 2026.",
      "The siren test is on the first Wednesday in February.",
    ],
    sources: [
      src("Federal Office for Civil Protection (FOCP)", "Information via radio", "https://www.babs.admin.ch/en/radio-en"),
      src(
        "Office fédéral de la protection de la population (OFPP)",
        "Stratégie multicanaux pour l'alarme et l'information en cas d'événement: état au 31.03.2026",
        "https://www.babs.admin.ch/dam/fr/sd-web/oEId0r-7IIUW/2026-03-31-Faktenblatt%20Multikanalstrategie%20f%C3%BCr%20die%20Information%2C%20Warnung%20und%20Alarmierung%20der%20Bev%C3%B6lkerung.pdf",
      ),
    ],
    aliases: ["IBBK", "Notfallradio", "radio d'urgence", "BABS", "OFPP", "SRF 1", "RTS", "RSI"],
  },

  // ── Sweden ───────────────────────────────────────────────────────────────
  {
    id: "em-se-p4",
    kind: "emergency",
    name: "Sveriges Radio P4, the emergency channel (Sweden)",
    operator: "Sveriges Radio; advice from MCF (Myndigheten för civilt försvar) and Krisinformation.se",
    what: "With its 25 local stations, Sveriges Radio P4 is Sweden's emergency channel and must always be able to broadcast. Important public announcements (VMA) go out on P4 and are followed up by the local P4 station.",
    frequencies: [{ ...FM_BAND, note: "the local P4 station: frequencies differ by area" }],
    modes: ["FM", "DAB"],
    bands: ["fm"],
    where: ["SE"],
    expect:
      "VMA announcements, official announcements, local news, where to get water, where to go for help, evacuations. On hearing the outdoor warning signal: go indoors and listen to P4.",
    reception: "FM nationwide, chosen because the FM network keeps working when power, phone and internet are down. " + LOCAL_FM,
    status: "on-air",
    notes: [
      "Listen on a battery, solar or wind-up radio, or a car radio (MCF).",
      "Krisinformation.se: you can find your local P4 station in the Sveriges Radio app or on an FM radio.",
    ],
    sources: [
      src(
        "Krisinformation.se",
        "Sveriges Radio's emergency broadcasting remit",
        "https://www.krisinformation.se/en/get-prepared/stay-informed-in-a-crisis/swedish-radios-emergency-broadcasting-responsibility/",
      ),
      src(
        "MCF",
        "Access to communication during a crisis",
        "https://www.mcf.se/en/advice-for-individuals/home-preparedness--prepping-for-at-least-a-week/access-to-communication-during-a-crisis/",
      ),
      src(
        "MCF",
        "About the warning and information systems",
        "https://www.mcf.se/en/advice-for-individuals/civil-defence-shelters-evacuation-and-warning-systems/public-service-announcement-and-other-varnings/about-the-warning--and-information-systems/",
      ),
    ],
    aliases: ["P4", "VMA", "Viktigt meddelande till allmänheten", "Hesa Fredrik", "MSB", "Om krisen eller kriget kommer"],
  },

  // ── Norway ───────────────────────────────────────────────────────────────
  {
    id: "em-no-nrk-p1",
    kind: "emergency",
    name: "NRK P1, the national emergency channel (Norway)",
    operator: "NRK; advice from DSB and the county governors",
    what: "NRK P1 is the national emergency channel and will carry important information in a crisis. The advice is a DAB radio that runs on batteries, a crank or solar cells.",
    frequencies: [{ ...DAB_BAND, note: "NRK P1 on DAB: tune by station name" }],
    modes: ["DAB"],
    bands: ["dab"],
    where: ["NO"],
    expect: "Important information from the authorities during a crisis, even with the internet down.",
    reception: "DAB nationwide; a DAB set finds P1 by name. Keep spare batteries for it.",
    status: "on-air",
    notes: ["Advice from the county governor's office for Eigenberedskapsveka (preparedness week) 2026."],
    sources: [
      src(
        "Statsforvalteren i Vestfold og Telemark",
        "Eigenberedskapsveka 2026: Kva gjer du dersom mobilnett og internett ikkje verkar?",
        "https://www.statsforvalteren.no/nb/vestfold-og-telemark/kommune-og-tjenesteaktor/samfunnssikkerhet-og-beredskap/nyheter/2026/10/eigenberedskapsveka-2026-kva-gjer-du-dersom-mobilnett-og-internett-ikkje-verkar/",
      ),
    ],
    aliases: ["NRK", "P1", "beredskapskanal", "DSB", "egenberedskap"],
  },

  // ── Denmark ──────────────────────────────────────────────────────────────
  {
    id: "em-dk-dr",
    kind: "emergency",
    name: "DR (and TV 2) on FM radio (Denmark)",
    operator: "DR and TV 2; police warnings; advice on borger.dk",
    what: "When the warning sirens sound, go indoors and seek information from DR or TV 2, where the police's emergency message (beredskabsmeddelelse) says what has happened and what to do. An FM radio with batteries, a hand crank or solar cells keeps you informed if other channels fail.",
    frequencies: [{ ...FM_BAND, note: "DR's FM stations: frequencies differ by area" }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["DK"],
    expect: "The beredskabsmeddelelse: what the situation is and what to do.",
    reception: "FM nationwide. " + LOCAL_FM,
    status: "on-air",
    sources: [
      src(
        "borger.dk",
        "Varsling ved ulykker og katastrofer",
        "https://www.borger.dk/politi-retsvaesen-forsvar/Forsvar-og-beredskab/Varsling-ved-ulykker-og-katastrofer",
      ),
      src("borger.dk", "Forberedt på kriser", "https://www.borger.dk/politi-retsvaesen-forsvar/forsvar-og-beredskab/forberedt-paa-kriser"),
    ],
    aliases: ["DR", "TV 2", "beredskabsmeddelelse", "sirene", "S!RENEN"],
  },

  // ── Finland ──────────────────────────────────────────────────────────────
  {
    id: "em-fi-yle",
    kind: "emergency",
    name: "Yle radio channels (Finland)",
    operator: "Yle; emergency warnings from the authorities",
    what: "Emergency warnings (vaaratiedote) are issued on Yle's radio channels and on commercial radio channels operating under a long-term licence, and on television if necessary. If phone and data stop working, the authorities give instructions through public radio.",
    frequencies: [{ ...FM_BAND, note: "Yle's FM networks: frequencies differ by transmitter" }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["FI"],
    expect: "Emergency warnings read on air, and instructions from the authorities.",
    reception: "FM nationwide. " + LOCAL_FM,
    status: "on-air",
    notes: ["Keep a battery-powered radio and spare batteries (72 tuntia)."],
    sources: [
      src("Finnish Meteorological Institute", "Emergency warnings", "https://en.ilmatieteenlaitos.fi/emergency-warnings"),
      src(
        "72 tuntia (Maanpuolustuskoulutusyhdistys, MPK)",
        "Communication in a disruption and reliable information",
        "https://72tuntia.fi/en/communication-in-a-disruption-and-reliable-information/",
      ),
    ],
    aliases: ["Yle", "vaaratiedote", "hätätiedote", "72 tuntia"],
  },

  // ── Estonia ──────────────────────────────────────────────────────────────
  {
    id: "em-ee-err",
    kind: "emergency",
    name: "ERR radio, Vikerraadio (Estonia)",
    operator: "Eesti Rahvusringhääling (ERR); advice on kriis.ee",
    what: "Official information in a crisis goes out on kriis.ee, the state helpline 1247 and the television, radio and online channels of Estonian Public Broadcasting (ERR). In a communications outage: get a radio that does not need mains electricity and listen to the hourly news.",
    frequencies: [
      { khz: 104_100, note: "Vikerraadio, Tallinn" },
      { khz: 106_700, note: "Vikerraadio, Tartu" },
      { khz: 104_800, note: "Vikerraadio, Pärnu" },
      { khz: 104_700, note: "Vikerraadio, Narva" },
      { khz: 105_100, note: "Vikerraadio, Koeru" },
      { ...FM_BAND, note: "other ERR stations and transmitters" },
    ],
    modes: ["FM"],
    bands: ["fm"],
    where: ["EE"],
    expect: "Hourly news and official information during a crisis.",
    reception: "FM nationwide. ERR's frequency page lists every transmitter of each station.",
    status: "on-air",
    notes: [
      "kriis.ee says to seek information from ERR and Vikerraadio, and EE-ALARM puts RDS text on Vikerraadio. The frequencies above are from ERR's own list (it also has Kohtla-Nõmme 105.4, Valgjärve 106.1, Orissaare 105.9, Sauvere 105.6, Viiratsi 107.0, Haapsalu 105.3, Kõrgessaare 91.2, Märjamaa 95.7, Pehka 106.0 and Sõrve 92.1 MHz).",
      "Information can also be had from the nearest resilience centre, rescue centre or police station (kriis.ee).",
    ],
    sources: [
      src(
        "Kriis (Estonian Government)",
        "Threat alert",
        "https://www.kriis.ee/en/preparing-possible-crisis/prepraring-possible-crisis-estonia/threat-alert",
      ),
      src(
        "Kriis (Estonian Government)",
        "Communications outage and domestic roaming in a crisis situation",
        "https://www.kriis.ee/en/preparing-possible-crisis/prepraring-possible-crisis-estonia/communications-outage-and-domestic",
      ),
      src("ERR", "Raadiosagedused", "https://info.err.ee/983360/raadiosagedused"),
    ],
    aliases: ["ERR", "Vikerraadio", "kriis.ee", "1247", "Ole valmis"],
  },

  // ── Lithuania ────────────────────────────────────────────────────────────
  {
    id: "em-lt-lrt-radijas",
    kind: "emergency",
    name: "LRT RADIJAS (Lithuania)",
    operator: "Lietuvos nacionalinis radijas ir televizija (LRT)",
    what: "In an emergency, residents are asked to switch on LRT RADIJAS, which carries official warnings, instructions from the authorities and advice on what to do, and is prepared to broadcast in any circumstances. LRT asks people to know or write down their region's LRT RADIJAS frequency and to have an FM radio.",
    frequencies: [{ ...FM_BAND, note: "LRT RADIJAS: frequencies differ by region (LRT's frequency page lists them)" }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["LT"],
    expect: "Official warnings, evacuation orders and safety advice from state institutions.",
    reception: "FM nationwide. " + LOCAL_FM,
    status: "on-air",
    sources: [
      src(
        "LRT",
        "Pasiruoškite ekstremaliomioms situacijoms – žinokite savo regiono LRT RADIJO dažnį",
        "https://www.lrt.lt/naujienos/tavo-lrt/15/2951222/pasiruoskite-ekstremaliomioms-situacijoms-zinokite-savo-regiono-lrt-radijo-dazni",
      ),
      src("LRT", "LRT radijų dažniai", "https://apie.lrt.lt/naudinga-informacija/lrt-radiju-dazniai"),
    ],
    aliases: ["LRT", "LRT Radijas", "ekstremali situacija"],
  },

  // ── Czechia ──────────────────────────────────────────────────────────────
  {
    id: "em-cz-radiozurnal",
    kind: "emergency",
    name: "Český rozhlas Radiožurnál and regional studios (Czechia)",
    operator: "Český rozhlas; advice from the Fire Rescue Service (HZS ČR)",
    what: "After the general warning siren, switch on radio and television: information on what has happened and what to do is broadcast by the public media. On radio that is Český rozhlas, the Radiožurnál station or the regional studios. In a power cut use a battery radio.",
    frequencies: [{ ...FM_BAND, note: "Radiožurnál and the regional studios: frequencies differ by transmitter" }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["CZ"],
    expect: "Special news bulletins with official instructions after the 140-second wavering siren tone.",
    reception: "FM nationwide. " + LOCAL_FM,
    status: "on-air",
    sources: [src("Hasičský záchranný sbor České republiky", "Varování obyvatelstva", "https://hzscr.gov.cz/varovani-obyvatelstva")],
    aliases: ["Radiožurnál", "Radiozurnal", "Český rozhlas", "Cesky rozhlas", "HZS", "všeobecná výstraha"],
  },

  // ── Netherlands ──────────────────────────────────────────────────────────
  {
    id: "em-nl-regional-broadcasters",
    kind: "emergency",
    name: "Regional public broadcasters, the calamity stations (Netherlands)",
    operator: "Regional public broadcasters; advice from the Dutch government (Denk vooruit)",
    what: "If the power goes and the internet is down, the regional public broadcaster can still broadcast on radio. Each region has its own station and FM frequency; the government's Denk vooruit campaign lists them and advises tuning the radio in advance.",
    frequencies: [
      { khz: 92_200, note: "Omrop Fryslân, Jirnsum" },
      { khz: 92_500, note: "Omrop Fryslân, Smilde" },
      { khz: 97_500, note: "Radio Noord, Groningen" },
      { khz: 90_800, note: "Radio Drenthe, Smilde" },
      { khz: 99_300, note: "Radio Drenthe, Emmen" },
      { khz: 89_400, note: "Radio Oost, Hengelo" },
      { khz: 95_600, note: "Radio Oost, Markelo" },
      { khz: 97_900, note: "Radio Oost, Deventer" },
      { khz: 99_400, note: "Radio Oost, Zwollekerspel" },
      { khz: 88_900, note: "Radio Gelderland, Arnhem" },
      { khz: 103_500, note: "Radio Gelderland, Ugchelen" },
      { khz: 90_400, note: "Radio Gelderland, Ruurlo" },
      { khz: 89_100, note: "Radio Gelderland, Megen" },
      { khz: 99_600, note: "Radio Gelderland, Zaltbommel" },
      { khz: 93_100, note: "Radio M Utrecht, Lopik" },
      { khz: 97_900, note: "Radio M Utrecht, Rhenen" },
      { khz: 89_800, note: "Omroep Flevoland, Lelystad" },
      { khz: 88_900, note: "NH Radio, Amsterdam" },
      { khz: 88_700, note: "NH Radio, Alkmaar" },
      { khz: 88_700, note: "NH Radio, Hilversum" },
      { khz: 93_900, note: "NH Radio, Wieringermeer" },
      { khz: 89_300, note: "Radio West, Den Haag" },
      { khz: 88_000, note: "Radio West, Leiden" },
      { khz: 93_400, note: "Radio Rijnmond, Rotterdam" },
      { khz: 87_900, note: "Omroep Zeeland, Goes" },
      { khz: 98_400, note: "Omroep Zeeland, Vlissingen" },
      { khz: 91_000, note: "Omroep Brabant, West-Brabant" },
      { khz: 91_900, note: "Omroep Brabant, Midden-Brabant" },
      { khz: 95_800, note: "Omroep Brabant, Noordoost-Brabant" },
      { khz: 87_600, note: "Omroep Brabant, Zuidoost-Brabant" },
      { khz: 100_300, note: "L1 Radio (Limburg), Roermond" },
      { khz: 95_300, note: "L1 Radio (Limburg), Emmaberg" },
    ],
    modes: ["FM", "DAB"],
    bands: ["fm"],
    where: ["NL"],
    expect: "News on the incident and the authorities' instructions, from the regional broadcaster designated as the calamity station.",
    reception: "FM in each province from the transmitters listed. A DAB radio receives the regional broadcaster of its region by itself.",
    status: "on-air",
    notes: [
      "Denk vooruit: a battery radio or a DAB+ radio; if digital, check it also has FM.",
      "Denk vooruit also gives each broadcaster's DAB block: L1, Omroep Brabant, Radio Drenthe and Radio Noord 7C; NH Radio and Omroep Flevoland 8B; Radio Gelderland and Radio M Utrecht 12B; Radio West, Omroep Zeeland and Radio Rijnmond 5B; Omrop Fryslân 5A; Radio Oost 6A.",
      "NL-Alert, the government's alert to mobile phones, is separate; the regional broadcaster follows up on radio.",
      "The English version of the page labels two broadcasters wrongly; the Dutch version was used.",
    ],
    sources: [
      src(
        "Rijksoverheid (Denk vooruit)",
        "Radio | Denk vooruit",
        "https://www.denkvooruit.nl/bereid-je-voor/zo-krijg-je-een-waarschuwing/radio",
      ),
      src(
        "Rijksoverheid (Denk vooruit)",
        "Radio | Denk vooruit (English)",
        "https://english.denkvooruit.nl/prepare-yourself/this-is-how-youll-be-alerted/radio",
      ),
    ],
    aliases: ["calamiteitenzender", "rampenzender", "NL-Alert", "Denk vooruit", "regionale omroep"],
  },

  // ── Belgium ──────────────────────────────────────────────────────────────
  {
    id: "em-be-radio",
    kind: "emergency",
    name: "Radio and television (Belgium)",
    operator: "Centre de Crise National / Nationaal Crisiscentrum (NCCN)",
    what: "The National Crisis Centre's 'Prêts ensemble' campaign says authorities and emergency services inform the public through BE-Alert, official websites, social media, radio and television. Its home emergency kit includes a dynamo or battery radio, to follow the media in a power cut.",
    frequencies: [{ ...FM_BAND, note: "public and private stations: frequencies differ by area" }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["BE"],
    expect:
      "Official instructions (shelter, evacuation, when it is safe to go out). The National Crisis Centre names no station or frequency.",
    reception: "FM nationwide. " + LOCAL_FM,
    status: "on-air",
    notes: ["BE-Alert, the alert by text message and call, needs registration in advance at be-alert.be."],
    sources: [
      src(
        "Centre de Crise National",
        "Un kit d'urgence à la maison",
        "https://centredecrise.be/fr/que-pouvez-vous-faire/preparez-un-kit-durgence/un-kit-durgence-la-maison",
      ),
      src(
        "Centre de Crise National",
        "Sous-campagne 2 : « Ensemble à l'intérieur. Danger à l'extérieur. »",
        "https://centredecrise.be/fr/campagne-prets-ensemble/sous-campagne-2-ensemble-a-l-interieur-danger-a-l-exterieur",
      ),
    ],
    aliases: ["BE-Alert", "Centre de crise", "Crisiscentrum", "VRT", "RTBF"],
  },

  // ── France ───────────────────────────────────────────────────────────────
  {
    id: "em-fr-radio-france",
    kind: "emergency",
    name: "Radio France: ici, franceinfo and France Inter (France)",
    operator: "Radio France, under a convention with the Ministry of the Interior",
    what: "Under a national partnership convention signed on 15 October 2025, renewing one from 2004, Radio France broadcasts vigilance, alert and information messages at the Interior Ministry's request, before, during and after crises, on its local network ici, on franceinfo and on France Inter.",
    frequencies: [{ ...FM_BAND, note: "the local ici station, franceinfo and France Inter: frequencies differ by area" }],
    modes: ["FM", "DAB"],
    bands: ["fm"],
    where: ["FR"],
    expect: "Alert messages and official instructions, local on ici (formerly France Bleu).",
    reception: "FM nationwide. " + LOCAL_FM,
    status: "on-air",
    notes: ["FR-Alert, alerts to mobile phones, and the sirens of the national alert system are separate channels."],
    sources: [
      src(
        "Radio France",
        "Radio France et le ministère de l'Intérieur réaffirment le rôle vital de la radio de service public en cas de crise",
        "https://www.radiofrance.com/presse/radio-france-et-le-ministere-de-linterieur-reaffirment-le-role-vital-de-la-radio-de-service",
      ),
    ],
    aliases: ["ici", "France Bleu", "franceinfo", "France Inter", "FR-Alert", "Radio France"],
  },

  // ── Spain ────────────────────────────────────────────────────────────────
  {
    id: "em-es-radio",
    kind: "emergency",
    name: "Battery radio (Spain)",
    operator: "Dirección General de Protección Civil y Emergencias",
    what: "Spain's civil protection advice for an accident involving dangerous goods says to close doors and windows and switch on a battery radio. It names no station.",
    frequencies: [
      { ...FM_BAND, note: "frequencies differ by area" },
      { ...MW_BAND, note: "frequencies differ by area" },
    ],
    modes: ["FM", "AM"],
    bands: ["fm", "mw"],
    where: ["ES"],
    expect: "Information on the emergency and official instructions on local and national stations.",
    reception: LOCAL_FM,
    status: "on-air",
    sources: [
      src(
        "Protección Civil (SGPCyE)",
        "Transporte mercancías peligrosas",
        "https://www.proteccioncivil.es/coordinacion/gestion-de-riesgos/tecnologicos/transporte-mercancias-peligrosas",
      ),
    ],
    aliases: ["Protección Civil", "radio a pilas", "RNE"],
  },

  // ── Italy ────────────────────────────────────────────────────────────────
  {
    id: "em-it-radio",
    kind: "emergency",
    name: "Battery radio (Italy)",
    operator: "Dipartimento della Protezione Civile (Io non rischio)",
    what: "Italy's civil protection campaign Io non rischio says to prepare an emergency kit with, among other things, a battery radio (radio a pile). It names no station.",
    frequencies: [
      { ...FM_BAND, note: "frequencies differ by area" },
      { ...MW_BAND, note: "frequencies differ by area" },
    ],
    modes: ["FM", "AM"],
    bands: ["fm", "mw"],
    where: ["IT"],
    expect: "News and official instructions on local and national stations.",
    reception: LOCAL_FM,
    status: "on-air",
    sources: [
      src(
        "Dipartimento della Protezione Civile",
        "Cosa fare - Terremoto",
        "https://iononrischio.protezionecivile.gov.it/it/preparati/terremoto/cosa-fare/",
      ),
    ],
    aliases: ["Protezione Civile", "Io non rischio", "radio a pile", "Rai"],
  },

  // ── Japan ────────────────────────────────────────────────────────────────
  {
    id: "em-jp-nhk-am",
    kind: "emergency",
    name: "NHK AM (formerly NHK Radio 1) (Japan)",
    operator: "NHK",
    what: "On 30 March 2026 NHK's two AM services (Radio 1 and Radio 2) were merged into NHK AM, on the former Radio 1 frequencies. Yamanashi Prefecture reports that NHK will go on broadcasting the information needed in a disaster, according to its scale and circumstances, as before.",
    frequencies: [{ ...MW_BAND, note: "NHK AM on the former Radio 1 frequency of each region" }],
    modes: ["AM"],
    bands: ["mw"],
    where: ["JP"],
    expect: "Disaster news and information; the weather report (kishō tsūhō) continues on NHK AM.",
    reception: "Medium wave from regional NHK transmitters; the frequency differs by region.",
    status: "on-air",
    notes: [
      "Read on Yamanashi Prefecture's disaster-preparedness column (updated 31 March 2026). NHK's own pages could not be used for this entry.",
    ],
    sources: [
      src(
        "Yamanashi Prefecture",
        'AMラジオが"地殻変動" 生き残った「気象通報」',
        "https://www.pref.yamanashi.jp/bousai/bousaicolumn/080331.html",
      ),
    ],
    aliases: ["NHK", "NHK AM", "ラジオ第1", "Radio 1", "防災"],
  },
];

export const EMERGENCY_GUIDES: FrequencyGuide[] = [
  {
    id: "em-guide-what-to-tune-to",
    kind: "emergency",
    title: "In an emergency, what to tune to",
    paragraphs: [
      "Most countries do not give an emergency frequency. They name a broadcaster, usually the national public one (Sveriges Radio P4 in Sweden, NRK P1 in Norway, LRT RADIJAS in Lithuania) or the regional public station, and that broadcaster's frequency depends on which transmitter is nearest. So the work is done beforehand: find the local frequency of the station your country names, write it down on paper, stick it to the radio, and preset it in the car.",
      "Keep a radio that does not need the mains: battery, wind-up (crank) or solar, with spare batteries, or use the car radio. Official advice in the UK, Sweden, Germany, Austria and Belgium says the same.",
      "FM and AM sets keep working when phone and internet do not; streaming apps do not. Sweden's emergency channel relies on the FM network for this reason, and the Netherlands asks that a DAB+ set also has FM. Norway's national emergency channel is on DAB, so there a DAB set with batteries is the one to have. A DAB set finds stations by name, which is easier when you do not know the frequency.",
      "In a power cut, if the station you expect is silent, search the band for stations still broadcasting (the UK's Be Ready advice). In Sweden, Denmark and Czechia, a warning siren means: go indoors and switch on the radio.",
    ],
    sources: [
      src("UK Government (Be Ready)", "Power cuts - Be Ready", "https://beready.campaign.gov.uk/be-informed-about-hazards/power-cuts/"),
      src(
        "Krisinformation.se",
        "Sveriges Radio's emergency broadcasting remit",
        "https://www.krisinformation.se/en/get-prepared/stay-informed-in-a-crisis/swedish-radios-emergency-broadcasting-responsibility/",
      ),
      src(
        "Rijksoverheid (Denk vooruit)",
        "Radio | Denk vooruit",
        "https://www.denkvooruit.nl/bereid-je-voor/zo-krijg-je-een-waarschuwing/radio",
      ),
      src(
        "BBK",
        "Keep up to date",
        "https://bbk.bund.de/EN/Prepare-for-disasters/Personal-Preparedness/Keep-up-to-date/keep-up-to-date.html",
      ),
      src(
        "Statsforvalteren i Vestfold og Telemark",
        "Eigenberedskapsveka 2026: Kva gjer du dersom mobilnett og internett ikkje verkar?",
        "https://www.statsforvalteren.no/nb/vestfold-og-telemark/kommune-og-tjenesteaktor/samfunnssikkerhet-og-beredskap/nyheter/2026/10/eigenberedskapsveka-2026-kva-gjer-du-dersom-mobilnett-og-internett-ikkje-verkar/",
      ),
    ],
  },
];
