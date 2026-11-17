/**
 * Frequencies to listen to: the kind "weather". See radio-frequencies.ts for the shape and
 * docs/radio-frequencies.md for how entries are sourced and checked.
 *
 * Weather radio, marine forecasts read by coastguards and coast stations, NAVTEX, HF
 * radiofax and RTTY for shipping, and VOLMET (aviation weather by voice). Every entry was
 * read against the page named in its sources on the day given.
 */
import type { Frequency, FrequencyEntry, FrequencyGuide, FrequencySource } from "../radio-frequencies.ts";

const CHECKED = "2026-11-17";

const source = (publisher: string, title: string, url: string): FrequencySource => ({ publisher, title, url, checked: CHECKED });

// ── Sources used by several entries ─────────────────────────────────────────

const NWS_WXRADIO = source("US National Weather Service", "NOAA Weather Radio (marine)", "https://www.weather.gov/marine/wxradio");
const NWS_RECEIVERS = source("US National Weather Service", "NOAA Weather Radio receivers", "https://www.weather.gov/nwr/nwr_receivers");
const NWS_USCG = source(
  "US National Weather Service",
  "U.S. Coast Guard broadcasts of marine weather",
  "https://www.weather.gov/marine/uscg_broadcasts",
);
const NWS_RFAX = source(
  "US National Weather Service",
  "Worldwide Marine Radiofacsimile Broadcast Schedules (7 March 2025)",
  "https://www.weather.gov/media/marine/rfax.pdf",
);
const ECCC_WEATHERADIO = source(
  "Environment and Climate Change Canada",
  "Weatheradio",
  "https://www.canada.ca/en/environment-climate-change/services/weatheradio.html",
);
const CCG_RAMN = source(
  "Canadian Coast Guard",
  "Radio Aids to Marine Navigation 2026 (annual edition, version 9, 30 October 2026)",
  "https://www.canada.ca/content/dam/ccg-gcc/documents/publications/mcts-sctm/ramn-arnm-2026-eng.pdf",
);
const CCG_RAMN_PART5 = source(
  "Canadian Coast Guard",
  "Radio Aids to Marine Navigation 2026, Part 5: Environment and Climate Change Canada's marine and ice warning and forecast programs",
  "https://www.canada.ca/en/canadian-coast-guard/corporate/publications/radio-aids-marine-navigation/environment-climate-change-marine-ice-warning-forecast-programs.html",
);
const MCA_MSI = source(
  "Maritime and Coastguard Agency",
  "Maritime Safety Information (MSI) Leaflet, Advice Note 1033, January 2026",
  "https://assets.publishing.service.gov.uk/media/697c7ec82ff8d10a830d5dab/MSI_Leaflet.pdf",
);
const OFCOM_SAR = source(
  "Ofcom",
  "Frequencies for distress and safety, search and rescue and emergencies in the UK (19 August 2022)",
  "https://www.ofcom.org.uk/siteassets/resources/documents/spectrum/spectrum-information/frequency-allocation-table/fat-frequencies-distress-safety.pdf",
);
const METOFFICE_SF = source(
  "Met Office",
  "Shipping forecast",
  "https://weather.metoffice.gov.uk/specialist-forecasts/coast-and-sea/shipping-forecast",
);
const IMO_NAVTEX = source(
  "International Maritime Organization",
  "NAVTEX Manual, MSC.1/Circ.1403/Rev.2 (28 November 2022, in effect from 1 January 2023)",
  "https://wwwcdn.imo.org/localresources/en/OurWork/Safety/Documents/Documents%20relevant%20to%20GMDSS/MSC.1-Circ.1403-Rev.2.pdf",
);
const IHO_BASE = "https://iho.int/uploads/user/Inter-Regional%20Coordination/WWNWS/WWNWS16/";
const IHO_I = source(
  "International Hydrographic Organization (WWNWS16)",
  "MSI Assessment for NAVAREA I, submitted by the United Kingdom (15 August 2024)",
  `${IHO_BASE}WWNWS16_2024_3.2-I_EN_Self%20Assessment%20NAVAREA%20I.pdf`,
);
const IHO_II = source(
  "International Hydrographic Organization (WWNWS16)",
  "Self assessment, NAVAREA II (2024)",
  `${IHO_BASE}WWNWS16_2024_3.2-II_EN_Self%20Assessment%20NAVAREA%20II.pdf`,
);
const IHO_III = source(
  "International Hydrographic Organization (WWNWS16)",
  "Self assessment, NAVAREA III (2024)",
  `${IHO_BASE}WWNWS16_2024_3.2-III_EN_NAVAREA%20III%20Self%20Assessment.pdf`,
);
const IHO_IV_XII = source(
  "International Hydrographic Organization (WWNWS16)",
  "Self assessment, NAVAREAs IV and XII (2024)",
  `${IHO_BASE}WWNWS16_2024_3.2-IV_XII_EN_Self%20Assessment%20NAVAREA%20IV%20XII.pdf`,
);
const IHO_X = source(
  "International Hydrographic Organization (WWNWS16)",
  "Self assessment, NAVAREA X (2024)",
  `${IHO_BASE}WWNWS16_2024_3.2-X_EN_Self%20Assessment%20NAVAREA%20X.pdf`,
);
const IHO_XI = source(
  "International Hydrographic Organization (WWNWS16)",
  "Self assessment, NAVAREA XI (2024)",
  `${IHO_BASE}WWNWS16_2024_3.2-XI_EN_NAVREA%20XI%20Self%20Assessment.pdf`,
);
const IHO_XIII = source(
  "International Hydrographic Organization (WWNWS16)",
  "Self assessment, NAVAREA XIII (2024)",
  `${IHO_BASE}WWNWS16_2024_3.2-XIII_EN_Self%20Assessment%20NAVAREA%20XIII.pdf`,
);
const IHO_XIV = source(
  "International Hydrographic Organization (WWNWS16)",
  "Self assessment, NAVAREA XIV (2024)",
  `${IHO_BASE}WWNWS16_2024_3.2-XIV_EN_Self%20Assessment%20NAVAREA%20XIV.pdf`,
);
const IHO_XV = source(
  "International Hydrographic Organization (WWNWS16)",
  "Self assessment, NAVAREA XV (2024)",
  `${IHO_BASE}WWNWS16_2024_3.2-XV_EN_Self%20Assessment%20NAVAREA%20XV.pdf`,
);
const DWD_BROADCAST = source(
  "Deutscher Wetterdienst",
  "Radio broadcast (shipping)",
  "https://www.dwd.de/EN/specialusers/shipping/broadcast_en/_node.html",
);
const DWD_FAX = source(
  "Deutscher Wetterdienst",
  "Facsimile Transmission for shipping, Hamburg/Pinneberg (DDH, DDK)",
  "https://www.dwd.de/EN/specialusers/shipping/broadcast_en/broadcast_fax_092023.pdf?__blob=publicationFile",
);
const DWD_RTTY_1 = source(
  "Deutscher Wetterdienst",
  "RTTY Broadcast for Shipping, Program 1",
  "https://www.dwd.de/EN/specialusers/shipping/broadcast_en/broadcast_rtty_1_092023.pdf?__blob=publicationFile",
);
const DWD_RTTY_2 = source(
  "Deutscher Wetterdienst",
  "RTTY Broadcast for Shipping, 2. Program",
  "https://www.dwd.de/EN/specialusers/shipping/broadcast_en/broadcast_rtty_2_092023.pdf?__blob=publicationFile",
);
const KYSTVERKET = source(
  "Kystverket (Norwegian Coastal Administration)",
  "2025 MF/HF og Navtex (14 March 2025)",
  "https://www.kystverket.no/contentassets/385eb4f9bdec4cb1bcc70f64b6d52283/2025_mf_hf_navtex_no_v14032025.pdf",
);
const METEOFRANCE_GUIDE = source(
  "Météo-France",
  "Guide marine (October 2022)",
  "https://meteofrance.fr/sites/meteofrance.fr/files/files/editorial/Guide_marine_octobre2022.pdf",
);
const ANFR_CRR = source(
  "Agence nationale des fréquences (ANFR)",
  "CRR maritime: certificat restreint de radiotéléphoniste (manual, VHF channel table)",
  "https://www.anfr.fr/fileadmin/manuel-crr-maritime-25.pdf",
);
const IAA_GEN35 = source(
  "AirNav Ireland",
  "Ireland AIP GEN 3.5 Meteorological Services (AIRAC 14 May 2026)",
  "https://www.airnav.ie/AIRAC_MAY_2026/2026-05-14-AIRAC/html/eAIP/EI-GEN-3.5-en-IE.html",
);
const NATS_GEN35 = source(
  "NATS (UK AIP)",
  "UK AIP GEN 3.5 Meteorological Services (AIRAC 29 October 2026)",
  "https://www.aurora.nats.co.uk/htmlAIP/Publications/2026-10-29-AIRAC/html/eAIP/EG-GEN-3.5-en-GB.html",
);
const ICAO_NAT_ANP = source(
  "ICAO",
  "North Atlantic (NAT) Air Navigation Plan, Volume II (Doc 9634), Table MET II-3, HF VOLMET broadcasts",
  "https://www.icao.int/sites/default/files/EURNAT/Documents/EUR%20and%20Nat%20Docs/NAT%20Documents/_eANP%20NAT%20Doc9634/Doc9634-wkg%20cpy-NAT-ANP-Vol-II_07102025.pdf",
);
const ICAO_APAC_ANP = source(
  "ICAO",
  "Asia/Pacific Air Navigation Plan, Volume II (July 2026), Table MET II-3, VOLMET broadcasts",
  "https://www.icao.int/sites/default/files/APAC/APAC-ANP/APAC-new-eANP-Vol-II_July-2026.pdf",
);
const AIRSERVICES_YSSY = source(
  "Airservices Australia",
  "ERSA facilities, Sydney/Kingsford Smith (YSSY), effective 3 September 2026",
  "https://www.airservicesaustralia.com/aip/current/ersa/FAC_YSSY_03SEP2026.pdf",
);

const WEATHER_LINK = { to: "/prepare/weather", label: "Weather" };
const PROPAGATION_LINK = { to: "/radio/propagation", label: "Is this band open now" };

// ── NAVTEX, station by station ──────────────────────────────────────────────

const navtexBand = (frequency: Frequency) => (frequency.khz < 4000 ? "marine-mf" : "marine-hf");

const NAVTEX_EXPECT =
  "Nothing a person can follow by ear: a warbling data signal (SITOR-B, 100 baud). A NAVTEX receiver, or a receiver's audio fed to a decoder on a computer, prints navigational warnings, gale warnings and forecasts as text.";

function navtex(entry: {
  id: string;
  where: string[];
  name: string;
  operator?: string;
  frequencies: Frequency[];
  stations: string;
  status?: FrequencyEntry["status"];
  notes?: string[];
  sources: FrequencySource[];
  reception?: string;
}): FrequencyEntry {
  return {
    id: entry.id,
    kind: "weather",
    name: entry.name,
    operator: entry.operator,
    what: "Coast stations that send maritime safety information (navigational and weather warnings, forecasts) as NAVTEX text, each in its own ten-minute slot every four hours, identified by a letter.",
    frequencies: entry.frequencies,
    modes: ["NAVTEX"],
    bands: [...new Set(entry.frequencies.map(navtexBand))],
    where: entry.where,
    hours:
      "Each station in its own 10-minute slot every 4 hours, by its letter (A at 00:00, 04:00 ... UTC; B ten minutes later, and so on to X), and warnings on receipt.",
    expect: NAVTEX_EXPECT,
    reception: entry.reception ?? "Out to about 250 to 400 nautical miles from each station, further at night.",
    status: entry.status ?? "on-air",
    notes: [entry.stations, ...(entry.notes ?? [])],
    links: [WEATHER_LINK],
    sources: entry.sources,
    aliases: ["NAVTEX", "Navtex", "NBDP", "SITOR-B"],
  };
}

const F518: Frequency = { khz: 518, note: "International service, in English" };
const F490: Frequency = { khz: 490, note: "National service, in the national language" };

const IHO_2024 =
  "Station status as reported by the NAVAREA coordinator to the IHO in August 2024; letters are the B1 identities to select on a NAVTEX receiver.";

// ── The entries ─────────────────────────────────────────────────────────────

export const WEATHER: FrequencyEntry[] = [
  // ── Weather radio ──
  {
    id: "wx-noaa-weather-radio",
    kind: "weather",
    name: "NOAA Weather Radio",
    operator: "US National Weather Service",
    what: "A national network of VHF transmitters broadcasting forecasts, observations and warnings around the clock, with alert tones and coded alerts (SAME) that switch on a weather radio set for the listener's county.",
    frequencies: [{ khz: 162400 }, { khz: 162425 }, { khz: 162450 }, { khz: 162475 }, { khz: 162500 }, { khz: 162525 }, { khz: 162550 }],
    modes: ["NFM"],
    bands: ["weather-vhf"],
    where: ["US"],
    hours: "Continuous",
    expect:
      "A synthesised voice reading the local forecast, current conditions and any watches and warnings, on a loop. Each transmitter uses one of the seven frequencies.",
    reception:
      "Within roughly 40 miles of a transmitter. An ordinary AM/FM radio cannot receive it; a weather radio, a scanner or most marine VHF sets can.",
    status: "on-air",
    notes: [
      'Receivers often label the frequencies WX1 to WX7. The National Weather Service says such channel numbers "have no special significance" and that other numbering schemes exist, so go by the frequency.',
      "SAME (Specific Area Message Encoding) lets a receiver sound only for the areas chosen.",
    ],
    links: [WEATHER_LINK],
    sources: [NWS_WXRADIO, NWS_RECEIVERS],
    aliases: ["NWR", "weather radio", "WX channels", "SAME"],
  },
  {
    id: "wx-weatheradio-canada",
    kind: "weather",
    name: "Weatheradio Canada (closed)",
    operator: "Environment and Climate Change Canada",
    what: 'Canada\'s VHF weather radio network, comparable to NOAA Weather Radio. Environment and Climate Change Canada says Weatheradio and Hello Weather "are no longer in service".',
    frequencies: [
      { khz: 162400, toKhz: 162550, note: "The VHF weather band; the closure notices read do not list Weatheradio's own channels" },
    ],
    modes: ["NFM"],
    bands: ["weather-vhf"],
    where: ["CA"],
    expect:
      "Nothing from Weatheradio. On the coasts, the Canadian Coast Guard's continuous marine broadcast may be heard on WX1 to WX3 (see that entry).",
    status: "closed",
    closed: "2026-03-16",
    notes: [
      "The Canadian Coast Guard's Radio Aids to Marine Navigation 2026 says that as of 16 March 2026 marine observations and forecasts are no longer available through Weatheradio and Hello Weather, and that they \"will continue to be available to mariners from the CCG's continuous marine broadcast (CMB)\".",
      "Environment and Climate Change Canada points to its interactive weather map and the WeatherCAN app instead.",
    ],
    links: [WEATHER_LINK],
    sources: [ECCC_WEATHERADIO, CCG_RAMN_PART5],
    aliases: ["Weatheradio", "Radiométéo", "Hello Weather"],
  },

  // ── United Kingdom ──
  {
    id: "wx-uk-shipping-forecast-radio-4",
    kind: "weather",
    name: "The Shipping Forecast on BBC Radio 4",
    operator: "BBC, with forecasts from the Met Office",
    what: "The Met Office's forecast for the 31 sea areas around the British Isles, read on BBC Radio 4 at fixed times with gale warnings, coastal station reports and the inshore waters forecast.",
    frequencies: [{ khz: 87500, toKhz: 108000, note: "BBC Radio 4 on FM: the frequency depends on the transmitter" }],
    modes: ["FM"],
    bands: ["fm"],
    where: ["GB"],
    hours: "00:48 and 05:34 local time daily; also 17:54 local time on Saturday and Sunday",
    expect:
      "A spoken bulletin: gale warnings, then each sea area's wind, sea state, weather and visibility; at 00:48 and 05:34 also reports from coastal stations and the inshore waters forecast.",
    reception: "Throughout the UK on Radio 4 FM, and on BBC Sounds.",
    status: "on-air",
    notes: [
      'The MCA says the BBC\'s dedicated long wave broadcast of the Shipping Forecast "ceased on 31 March 2024", and that long wave broadcasts "may continue at the discretion of the BBC". See the news broadcasters for BBC Radio 4 long wave on 198 kHz.',
      "The Met Office issues the Shipping Forecast four times a day, at 23:00, 05:00, 11:00 and 17:00 UTC.",
    ],
    links: [WEATHER_LINK],
    sources: [MCA_MSI, METOFFICE_SF],
    aliases: ["Shipping Forecast", "Radio 4", "Met Office", "inshore waters forecast"],
  },
  {
    id: "wx-uk-coastguard-vhf-msi",
    kind: "weather",
    name: "HM Coastguard VHF maritime safety broadcasts",
    operator: "Maritime and Coastguard Agency (HM Coastguard)",
    what: "Each Coastguard centre reads gale warnings, the inshore waters forecast, the Shipping Forecast and navigation warnings on marine VHF, after an announcement on channel 16 naming the channel.",
    frequencies: [
      { khz: 160725, channel: "62" },
      { khz: 160775, channel: "63" },
      { khz: 160825, channel: "64" },
      { khz: 156500, channel: "10", note: "May also be used" },
      { khz: 156800, channel: "16", note: "Announcement only" },
    ],
    modes: ["NFM"],
    bands: ["marine-vhf"],
    where: ["GB"],
    hours: "Full broadcast every 12 hours, short broadcast every 3 hours, at each centre's own times (local time); warnings on receipt",
    expect:
      "A coastguard officer reading the forecast for the local inshore waters area, gale warnings and navigation warnings in English.",
    reception: "Out to about 30 nautical miles from the coast. Any marine VHF set or a scanner.",
    status: "on-air",
    notes: [
      "Full broadcasts (Routine A), local time: Aberdeen, Holyhead and Solent 07:30 and 19:30; Belfast 08:10 and 20:10; Dover, Falmouth, Shetland and Stornoway 07:10 and 19:10; Humber and Milford Haven 07:50 and 19:50.",
      "Short broadcasts (Routine B) follow every three hours on the same minute: for example Dover and Falmouth at 01:10, 04:10, 10:10, 13:10, 16:10 and 22:10 local time. The 13:xx broadcast carries the new inshore waters forecast.",
      "The leaflet lists, for every aerial, which of channels 62, 63, 64 or 10 it uses. Frequencies are the coast station's transmit side: Ofcom lists 156.125/160.725, 156.175/160.775 and 156.225/160.825 MHz as the MCA's maritime safety information pairs, which are channels 62, 63 and 64.",
    ],
    links: [WEATHER_LINK],
    sources: [MCA_MSI, OFCOM_SAR, CCG_RAMN],
    aliases: ["HM Coastguard", "MSI", "inshore waters forecast", "Coastguard weather"],
  },
  {
    id: "wx-uk-coastguard-mf-msi",
    kind: "weather",
    name: "HM Coastguard MF maritime safety broadcasts",
    operator: "Maritime and Coastguard Agency (HM Coastguard)",
    what: "Scheduled voice broadcasts of maritime safety information on medium frequency from six radio sites, announced first on 2182 kHz.",
    frequencies: [
      { khz: 1883, note: "Belfast, from Tiree, 08:10 and 20:10" },
      { khz: 1770, note: "Shetland, from Collafirth, 07:10 and 19:10" },
      { khz: 1743, note: "Stornoway, from Butt of Lewis, 07:10 and 19:10" },
      { khz: 1880, note: "Falmouth, from Scillies, 07:10 and 19:10" },
      { khz: 2226, note: "Aberdeen, from Gregness, 07:30 and 19:30" },
      { khz: 1925, note: "Humber, from Cullercoats, 07:50 and 19:50" },
      { khz: 2182, note: "Announcement only" },
    ],
    modes: ["USB"],
    bands: ["marine-mf"],
    where: ["GB"],
    hours: "Twice daily at each site's times (the same times as the VHF full broadcasts, local time)",
    expect: "A coastguard officer reading gale warnings, the Shipping Forecast and inshore waters forecast for the area.",
    reception: "Out to about 150 nautical miles. Needs a set that receives 1.6 to 3 MHz in single sideband.",
    status: "on-air",
    notes: [
      "Transmissions may be repeated six hours after the scheduled broadcast if new gale or storm warnings have been issued.",
      "The leaflet's MF table does not say whether its times are local or UTC; they match the VHF full broadcasts, which it gives in local time.",
    ],
    links: [WEATHER_LINK, PROPAGATION_LINK],
    sources: [MCA_MSI, OFCOM_SAR],
    aliases: ["HM Coastguard", "MSI", "MF RT"],
  },
  navtex({
    id: "wx-navtex-gb",
    where: ["GB"],
    name: "NAVTEX, United Kingdom",
    operator: "Maritime and Coastguard Agency",
    frequencies: [F518, F490],
    stations:
      "518 kHz: Cullercoats (G), Niton (E), Portpatrick (O). 490 kHz: Cullercoats (U), Niton (I), Portpatrick (C). Niton also sends French information as K (518 kHz) and T (490 kHz).",
    notes: [
      "On 518 kHz the Shipping Forecast goes out from Cullercoats at 09:00 and 21:00, Niton at 08:40 and 20:40, and Portpatrick at 06:20 and 18:20 UTC. On 490 kHz the inshore waters forecast goes out from Cullercoats at 07:20, 11:20, 19:20 and 23:20, Niton at 01:20, 05:20, 13:20 and 17:20, and Portpatrick at 00:20, 08:20, 12:20 and 20:20 UTC.",
      "Belgium's Oostende station also sends UK warnings for the Thames estuary as V.",
      "In August 2024 the IHO report said Cullercoats and Portpatrick were operating at reduced power and were unreliable.",
    ],
    sources: [MCA_MSI, IHO_I],
  }),
  {
    id: "wx-uk-royal-navy-fax-gya",
    kind: "weather",
    name: "Northwood (GYA) HF radiofax",
    operator: "Joint Operational Meteorology and Oceanography Centre (Royal Navy)",
    what: "Weather charts for the North Atlantic sent by HF radiofacsimile from Northwood.",
    frequencies: [
      { khz: 2618.5, hours: "22:00 to 05:00 UTC" },
      { khz: 4610, hours: "24 hours" },
      { khz: 8040, hours: "Alternative 24-hour frequency" },
      { khz: 11086.5, hours: "06:00 to 20:00 UTC" },
    ],
    modes: ["FAX"],
    bands: ["marine-mf", "marine-hf"],
    where: ["GB", "north-atlantic"],
    hours: "Scheduled charts through the day (UTC)",
    expect: "A steady rasping tone that a fax decoder turns into surface analyses and forecast charts.",
    reception: "North Atlantic and Europe; choose the frequency by time of day.",
    status: "on-air",
    notes: [
      "The schedule is from the US National Weather Service's worldwide compilation (information dated January 2022), which takes some entries from unofficial sources. Unless stated, frequencies there are assigned frequencies: tune 1.9 kHz lower in USB.",
    ],
    links: [PROPAGATION_LINK],
    sources: [NWS_RFAX],
    aliases: ["JOMOC", "weatherfax", "radiofax"],
  },

  // ── Ireland ──
  navtex({
    id: "wx-navtex-ie",
    where: ["IE"],
    name: "NAVTEX, Ireland",
    operator: "Irish Coast Guard",
    frequencies: [F518, F490],
    stations: "518 kHz: Malin Head (Q), Valentia (W). 490 kHz: Malin Head (A).",
    notes: [
      "The UK leaflet lists Irish broadcasts of the Shipping Forecast from Valentia at 07:40 and 19:40 and Malin Head at 06:40 and 18:40 UTC on 518 kHz, and inshore waters forecasts from Malin Head on 490 kHz at 00:00, 04:00, 08:00, 12:00, 16:00 and 20:00 UTC.",
    ],
    sources: [MCA_MSI, IHO_I],
  }),

  // ── North-west Europe ──
  navtex({
    id: "wx-navtex-be",
    where: ["BE"],
    name: "NAVTEX, Belgium",
    frequencies: [F518, F490],
    stations: "Oostende: T on 518 kHz and B on 490 kHz; it also sends UK warnings for the Thames estuary as V on 518 kHz.",
    notes: ["Weather information from Oostende is from Belgian sources, not the Met Office (MCA).", IHO_2024],
    sources: [IHO_I, MCA_MSI],
  }),
  navtex({
    id: "wx-navtex-nl",
    where: ["NL"],
    name: "NAVTEX, Netherlands",
    operator: "Kustwacht (Netherlands Coastguard)",
    frequencies: [F518],
    stations: "Den Helder (P) on 518 kHz.",
    notes: [IHO_2024],
    sources: [IHO_I],
  }),
  navtex({
    id: "wx-navtex-de",
    where: ["DE"],
    name: "NAVTEX, Germany",
    operator: "Deutscher Wetterdienst",
    frequencies: [F518, F490],
    stations: "Pinneberg: S on 518 kHz and L on 490 kHz.",
    notes: [IHO_2024],
    sources: [IHO_I],
  }),
  navtex({
    id: "wx-navtex-no",
    where: ["NO", "SJ"],
    name: "NAVTEX, Norway",
    operator: "Kystradio (for the Norwegian Coastal Administration)",
    frequencies: [F518, { khz: 4209.5, note: "Svalbard, HF NBDP (Q)" }, { khz: 8416.5, note: "Svalbard, HF NBDP (P)" }],
    stations:
      "518 kHz: Rogaland (L), Jeløya (M), Ørlandet (N), with A, B and C further north (Kystverket's 2025 chart shows the slots for A, B, C, L, M and N). Svalbard has HF NBDP on 4209.5 kHz (Q) and 8416.5 kHz (P).",
    notes: [
      "Svalbard HF NBDP (UTC): weather 11:00 to 11:30 and 23:00 to 23:30; warnings 06:30 to 07:00 and 18:30 to 19:00, each half hour first on 8416.5 and then on 4209.5 kHz.",
      "The chart does not make clear which northern station uses which of A, B and C, so they are not named here.",
    ],
    sources: [KYSTVERKET, IHO_I],
  }),
  {
    id: "wx-no-kystradio-mf",
    kind: "weather",
    name: "Kystradio MF sea forecasts (havvarsel), Norway",
    operator: "Kystradio",
    what: "Norway's coast radio reads the sea forecast twice a day on medium frequency from transmitters along the coast and on Svalbard.",
    frequencies: [
      { khz: 1785, note: "Rogaland" },
      { khz: 1692, note: "Rogaland" },
      { khz: 1728, note: "Bergen" },
      { khz: 1680, note: "Florø" },
      { khz: 1782, note: "Ørlandet" },
      { khz: 1710, note: "Bodø" },
      { khz: 1770, note: "Bodø" },
      { khz: 1659, note: "Andenes" },
      { khz: 1635, note: "Hammerfest" },
      { khz: 1713, note: "Vardø" },
      { khz: 1731, note: "Svalbard" },
    ],
    modes: ["USB"],
    bands: ["marine-mf"],
    where: ["NO", "SJ"],
    hours: "12:15 and 23:15 UTC from Rogaland to Ørlandet; 12:03 and 23:03 UTC from Bodø northwards and Svalbard",
    expect: "A spoken sea forecast, in Norwegian.",
    reception: "Along the Norwegian coast and offshore; needs a set that receives 1.6 to 3 MHz in single sideband.",
    status: "on-air",
    notes: [
      "Maritime safety information is also read on the primary VHF working channels at 02:33, 06:33, 10:33, 14:33, 18:33 and 22:33 UTC; the chart does not list those channels.",
      "The chart is the 2025 edition (14 March 2025); no 2026 edition was found. It does not state the sideband: upper sideband is the usual practice for MF radiotelephony.",
    ],
    links: [WEATHER_LINK, PROPAGATION_LINK],
    sources: [KYSTVERKET],
    aliases: ["havvarsel", "Kystradio", "Norway coast radio"],
  },
  navtex({
    id: "wx-navtex-is",
    where: ["IS"],
    name: "NAVTEX, Iceland",
    frequencies: [F518, F490],
    stations: "Grindavík: X on 518 kHz and K on 490 kHz. Sauðanes: R on 518 kHz and E on 490 kHz.",
    notes: [IHO_2024],
    sources: [IHO_I],
  }),
  navtex({
    id: "wx-navtex-fo",
    where: ["FO"],
    name: "NAVTEX, Faroe Islands",
    frequencies: [F518],
    stations: "Tórshavn (D) on 518 kHz.",
    notes: [IHO_2024],
    sources: [IHO_I],
  }),

  // ── Germany ──
  {
    id: "wx-de-dwd-fax",
    kind: "weather",
    name: "Deutscher Wetterdienst HF radiofax (DDH3, DDK3, DDK6)",
    operator: "Deutscher Wetterdienst",
    what: "Weather charts for shipping (surface analyses, forecasts, wave and ice charts for the North Atlantic, North Sea and Baltic) sent by radiofax from Pinneberg near Hamburg.",
    frequencies: [
      { khz: 3855, channel: "DDH3", power: "10 kW" },
      { khz: 7880, channel: "DDK3", power: "10 kW" },
      { khz: 13882.5, channel: "DDK6", power: "10 kW" },
    ],
    modes: ["FAX"],
    bands: ["marine-mf", "marine-hf"],
    where: ["DE", "north-atlantic"],
    site: "Pinneberg, near Hamburg",
    hours: "Scheduled charts from about 04:30 to 22:00 UTC",
    expect: "A rasping fax tone (F1C, white +425 Hz, black −425 Hz) that a decoder turns into charts; 120 rpm, IOC 576.",
    reception: "North Sea, Baltic and much of the North Atlantic.",
    status: "on-air",
    links: [PROPAGATION_LINK],
    sources: [DWD_FAX, DWD_BROADCAST],
    aliases: ["DWD", "Pinneberg", "weatherfax", "radiofax"],
  },
  {
    id: "wx-de-dwd-rtty",
    kind: "weather",
    name: "Deutscher Wetterdienst RTTY for shipping",
    operator: "Deutscher Wetterdienst",
    what: "Sea area warnings, weather reports for the North Sea, Baltic, Mediterranean and North Atlantic, and coded ship and station reports, sent as radioteletype around the clock in two programmes.",
    frequencies: [
      { khz: 4583, channel: "DDK2", note: "Programme 1 (English)", power: "1 kW" },
      { khz: 7646, channel: "DDH7", note: "Programme 1 (English)", power: "1 kW" },
      { khz: 10100.8, channel: "DDK9", note: "Programme 1 (English)", power: "10 kW" },
      { khz: 147.3, channel: "DDH47", note: "Programme 2 (German), shift ±42.5 Hz", power: "20 kW" },
      { khz: 11039, channel: "DDH9", note: "Programme 2 (German)", power: "10 kW" },
      { khz: 14467.3, channel: "DDH8", note: "Programme 2 (German)", power: "1 kW" },
    ],
    modes: ["RTTY"],
    bands: ["lf", "marine-hf"],
    where: ["DE", "north-atlantic", "mediterranean"],
    site: "Pinneberg, near Hamburg",
    hours: "Continuous (00:00 to 24:00 UTC), on a fixed schedule: warnings at 00:00, 03:00, 06:00 ... UTC",
    expect: "RTTY at 50 baud (shift ±225 Hz on HF), decoded as text bulletins.",
    reception: "Northern Europe; the long wave transmitter on 147.3 kHz covers the North Sea and Baltic.",
    status: "on-air",
    links: [PROPAGATION_LINK],
    sources: [DWD_RTTY_1, DWD_RTTY_2, DWD_BROADCAST],
    aliases: ["DWD", "DDH47", "Seewetter", "RTTY"],
  },
  {
    id: "wx-de-dwd-voice-sw",
    kind: "weather",
    name: "Deutscher Wetterdienst sea weather report on shortwave",
    operator: "Deutscher Wetterdienst",
    what: "A spoken sea weather report (Seewetterbericht) on two shortwave frequencies, four times a day, slotted into the DWD fax schedule.",
    frequencies: [{ khz: 5905 }, { khz: 6180 }],
    modes: ["AM"],
    bands: ["sw-49m"],
    where: ["DE", "north-atlantic", "mediterranean"],
    hours: "05:55 to 06:35, 11:55 to 12:35, 15:55 to 16:35 and 19:55 to 20:35 UTC",
    expect: "A spoken weather report for shipping, in German.",
    reception: "Germany and neighbouring seas; in the 49 m broadcast band.",
    status: "on-air",
    notes: [
      'The DWD schedule says only "voice-transmission" and does not give the mode; AM is assumed because the frequencies are in a broadcast band.',
    ],
    links: [PROPAGATION_LINK],
    sources: [DWD_FAX],
    aliases: ["Seewetterbericht", "DWD", "Kurzwelle"],
  },

  // ── France and Monaco ──
  {
    id: "wx-fr-cross-vhf",
    kind: "weather",
    name: "CROSS VHF weather bulletins, France",
    operator: "CROSS (regional coastguard centres), with forecasts from Météo-France",
    what: "The CROSS read Météo-France's coastal forecasts at fixed times from a chain of VHF transmitters, announced on channel 16, and special bulletins (BMS) for gales and above every hour.",
    frequencies: [
      { khz: 161575, channel: "79" },
      { khz: 161625, channel: "80" },
      { khz: 160775, channel: "63", note: "Bulletins in a cycle every 20 minutes (Étel, Chassiron, Cap-Ferret)" },
      { khz: 160825, channel: "64", note: "Bulletins in a cycle every 15 minutes (Néoulos, Pic de l'Ours)" },
      { khz: 156800, channel: "16", note: "Announcement only" },
    ],
    modes: ["NFM"],
    bands: ["marine-vhf"],
    where: ["FR"],
    hours: "Mostly about 07:00, 13:00 and 19:00 local time, at each transmitter's own minute; BMS every hour from H+03",
    expect: "The coastal forecast (out to about 20 nautical miles) read in French.",
    reception: "Along the French coast; any marine VHF set or a scanner.",
    status: "on-air",
    notes: [
      "Examples (French legal time): Cross Gris-Nez, Dunkerque channel 79 at 07:20, 13:20 and 19:20; Cross Jobourg, Jobourg/La Hague channel 80 at 07:33, 13:33 and 19:33, and gale bulletins in English every half hour at H+20 and H+50; Cross Étel, Penmarc'h channel 80 at 07:03, 13:03 and 19:03; Cross La Garde, Planier channel 80 at 07:33, 13:33 and 19:33.",
      "Frequencies are the coast transmit side of each channel as ANFR lists them. The guide read is Météo-France's edition of October 2022, the newest found.",
    ],
    links: [WEATHER_LINK],
    sources: [METEOFRANCE_GUIDE, ANFR_CRR],
    aliases: ["CROSS", "Météo-France", "bulletin météo", "BMS"],
  },
  {
    id: "wx-fr-cross-mf",
    kind: "weather",
    name: "CROSS MF weather bulletins, France",
    operator: "CROSS Gris-Nez, Corsen and La Garde",
    what: "Offshore forecasts and gale warnings read on medium frequency single sideband (BLU), after a call on 2182 kHz.",
    frequencies: [
      { khz: 1650, note: "Gris-Nez and Corsen" },
      { khz: 2677, note: "Gris-Nez, Corsen and La Garde" },
      { khz: 1696, note: "La Garde" },
      { khz: 2182, note: "Announcement only" },
    ],
    modes: ["USB"],
    bands: ["marine-mf"],
    where: ["FR", "mediterranean"],
    hours: "Gris-Nez 08:33 and 20:33, Corsen 08:15 and 20:15 (French legal time); La Garde 10:00, 16:00 and 22:00 UTC",
    expect: "Spoken forecasts for the offshore areas, in French.",
    reception: "Up to about 300 nautical miles; needs a set with single sideband.",
    status: "on-air",
    notes: [
      "Three-day offshore bulletins: Gris-Nez 16:33 and Corsen 16:15 (legal time) on 1650 kHz; La Garde at 15:50 legal time on 1696 kHz.",
      "From Météo-France's guide of October 2022, the newest found. French legal time is UTC+1 in winter and UTC+2 in summer.",
    ],
    links: [WEATHER_LINK, PROPAGATION_LINK],
    sources: [METEOFRANCE_GUIDE],
    aliases: ["BLU", "CROSS", "Météo-France"],
  },
  navtex({
    id: "wx-navtex-fr",
    where: ["FR"],
    name: "NAVTEX, France",
    operator: "CROSS Corsen and CROSS La Garde",
    frequencies: [F518, F490],
    stations: "Corsen: A on 518 kHz and E on 490 kHz. La Garde: W on 518 kHz and S on 490 kHz.",
    status: "occasional",
    notes: [
      'In 2024 the IHO reports gave Corsen as "under trial" and La Garde as "temporarily suspended"; Météo-France\'s 2022 guide already gave both as suspended for technical reasons. Niton (UK) sends French information as K and T meanwhile.',
    ],
    sources: [IHO_II, IHO_III, METEOFRANCE_GUIDE, IHO_I],
  }),
  {
    id: "wx-mc-monaco-radio-vhf",
    kind: "weather",
    name: "Monaco Radio continuous VHF weather",
    operator: "Monaco Radio",
    what: "Continuous recorded weather bulletins for the coasts of Provence, the Côte d'Azur and Corsica and the western Mediterranean.",
    frequencies: [
      { khz: 161750, channel: "23", note: "Côte d'Azur, western Mediterranean" },
      { khz: 161800, channel: "24", note: "Corsica, western Mediterranean" },
      { khz: 161850, channel: "25", note: "Provence, western Mediterranean" },
    ],
    modes: ["NFM"],
    bands: ["marine-vhf"],
    where: ["MC", "FR", "mediterranean"],
    hours: "Continuous",
    expect: "A recorded weather bulletin on a loop, in French and English.",
    reception: "The coast from Provence to the Italian border and Corsica.",
    status: "on-air",
    notes: [
      "Météo-France's 2022 guide lists these channels; the frequencies are the coast side of the channels in ANFR's French channel table. Monaco Radio's HF broadcasts (4363, 13146 and 17260 kHz) were \"suspended\" in the 2022 guide.",
    ],
    links: [WEATHER_LINK],
    sources: [METEOFRANCE_GUIDE, ANFR_CRR],
    aliases: ["Monaco Radio", "Naya"],
  },

  // ── Iberia ──
  navtex({
    id: "wx-navtex-es",
    where: ["ES"],
    name: "NAVTEX, Spain",
    operator: "Salvamento Marítimo (SASEMAR)",
    frequencies: [F518, F490],
    stations:
      "Coruña: D on 518 kHz, W on 490 kHz. Tarifa: G on 518 kHz, T on 490 kHz. Cabo de la Nao (Valencia): X on 518 kHz, M on 490 kHz. Las Palmas (Canary Islands): A on 518 kHz, I on 490 kHz.",
    notes: [IHO_2024],
    sources: [IHO_II, IHO_III],
  }),
  navtex({
    id: "wx-navtex-pt",
    where: ["PT"],
    name: "NAVTEX, Portugal",
    operator: "Autoridade Marítima Nacional",
    frequencies: [F518, F490],
    stations:
      "Penalva (mainland): R on 518 kHz, G on 490 kHz. Porto Santo (Madeira): P on 518 kHz, M on 490 kHz. São Miguel (Azores): F on 518 kHz, J on 490 kHz, temporarily suspended in 2024.",
    notes: [IHO_2024],
    sources: [IHO_II],
  }),

  // ── Mediterranean and Black Sea ──
  navtex({
    id: "wx-navtex-it",
    where: ["IT"],
    name: "NAVTEX, Italy",
    frequencies: [F518, F490],
    stations: "La Maddalena (Sardinia): R on 518 kHz, I on 490 kHz. Mondolfo: U and E. Sellia Marina: V and W. Piombino: N on 490 kHz.",
    notes: ["La Maddalena's 518 kHz slots are 02:50, 06:50, 10:50, 14:50, 18:50 and 22:50 UTC.", IHO_2024],
    sources: [IHO_III],
  }),
  navtex({
    id: "wx-navtex-mt",
    where: ["MT"],
    name: "NAVTEX, Malta",
    frequencies: [F518],
    stations: "Malta: O on 518 kHz; in 2024 also using the Tunisian slot T by temporary arrangement.",
    notes: [IHO_2024],
    sources: [IHO_III],
  }),
  navtex({
    id: "wx-navtex-hr",
    where: ["HR"],
    name: "NAVTEX, Croatia",
    operator: "Plovput (Split Radio)",
    frequencies: [F518, F490],
    stations: "Split (Hvar): Q on 518 kHz; Split: F on 490 kHz.",
    notes: [IHO_2024],
    sources: [IHO_III],
  }),
  navtex({
    id: "wx-navtex-gr",
    where: ["GR"],
    name: "NAVTEX, Greece",
    operator: "Hellenic Navy Hydrographic Service",
    frequencies: [F518],
    stations:
      "Irákleio (Crete), Kérkyra and Límnos. The report lists the identities H, Q and S (Irákleio), K and P (Kérkyra), L and R (Límnos) without saying which is on which frequency.",
    notes: [IHO_2024],
    sources: [IHO_III],
  }),
  navtex({
    id: "wx-navtex-tr",
    where: ["TR"],
    name: "NAVTEX, Türkiye",
    frequencies: [F518],
    stations:
      "İzmir, Samsun, Antalya and İstanbul. The report lists the identities I and C (İzmir), E and A (Samsun), F and D (Antalya), D, B and M (İstanbul) without saying which is on which frequency.",
    notes: [IHO_2024],
    sources: [IHO_III],
  }),
  navtex({
    id: "wx-navtex-cy-il",
    where: ["CY", "IL"],
    name: "NAVTEX, Cyprus and Israel",
    frequencies: [F518],
    stations: "Cyprus (M) and Haifa, Israel (P).",
    notes: [IHO_2024],
    sources: [IHO_III],
  }),
  navtex({
    id: "wx-navtex-dz",
    where: ["DZ"],
    name: "NAVTEX, Algeria",
    frequencies: [F518],
    stations: "Bordj El Kiffan; the report lists the identities B and K.",
    notes: [IHO_2024],
    sources: [IHO_III],
  }),
  navtex({
    id: "wx-navtex-black-sea",
    where: ["BG", "RU", "UA", "GE"],
    name: "NAVTEX, Black Sea and Sea of Azov",
    frequencies: [F518, F490],
    stations:
      "Varna, Bulgaria (J), also for Romania. Novorossiysk, Russia (A); Taganrog (O) on 490 kHz. Odessa, Ukraine (C and X). Poti, Georgia (G) on 490 kHz.",
    notes: ["Berdiansk (Ukraine) and Constanța (Romania) were temporarily suspended in 2024.", IHO_2024],
    sources: [IHO_III],
  }),

  // ── North America ──
  navtex({
    id: "wx-navtex-us",
    where: ["US", "PR", "GU"],
    name: "NAVTEX, United States",
    operator: "US Coast Guard",
    frequencies: [F518],
    stations:
      "Atlantic and Gulf: Boston (F), Portsmouth, Virginia (N), Charleston (E), Miami (A), New Orleans (G), San Juan/Isabella, Puerto Rico (R). Pacific: Kodiak (J and X), Astoria (W), San Francisco (C), Cambria (Q), Honolulu (O), Marianas/Guam (V).",
    notes: [
      'The National Weather Service lists Adak (X) as "no longer available". In 2024 the IHO report said Guam was out of service and sending its warnings on 4209.5 kHz meanwhile.',
      "The US Coast Guard's own NAVCEN pages refused automated checks; the National Weather Service and IHO pages were read instead.",
    ],
    sources: [NWS_USCG, IHO_IV_XII, IHO_XI],
  }),
  {
    id: "wx-us-uscg-hf-voice",
    kind: "weather",
    name: "US Coast Guard HF voice weather broadcasts",
    operator: "US Coast Guard, with forecasts from the National Weather Service",
    what: "Offshore and high seas forecasts and hurricane information read by synthesised voice on HF at fixed times from six Coast Guard stations.",
    frequencies: [
      { khz: 4426 },
      { khz: 6501 },
      { khz: 8764 },
      { khz: 13089 },
      { khz: 17314 },
      { khz: 4316, note: "New Orleans (NMG)" },
      { khz: 8502, note: "New Orleans (NMG)" },
      { khz: 12788, note: "New Orleans (NMG)" },
    ],
    modes: ["USB"],
    bands: ["marine-hf"],
    where: ["US", "north-atlantic", "caribbean", "north-pacific"],
    hours: "Scheduled, several times a day per station (UTC; see notes)",
    expect: "A synthesised voice reading offshore and high seas forecasts and warnings, in English.",
    reception: "Ocean-wide on the right frequency for the time of day; frequencies are carrier frequencies, upper sideband.",
    status: "on-air",
    notes: [
      "Chesapeake (NMN): 4426, 6501, 8764 kHz at 03:30, 05:15 and 09:30 UTC; 6501, 8764, 13089 kHz at 11:15, 15:30, 21:30 and 23:15 UTC; 8764, 13089, 17314 kHz at 17:15 UTC.",
      "New Orleans (NMG): 4316, 8502, 12788 kHz at 03:30, 05:15, 09:30, 11:15, 15:30, 17:15, 21:30 and 23:15 UTC.",
      "Point Reyes (NMC): 4426, 8764, 13089 kHz at 04:30 and 10:30 UTC; 8764, 13089, 17314 kHz at 16:30 and 22:30 UTC.",
      "Kodiak (NOJ): 6501 kHz at 02:03 and 16:45 UTC. Honolulu (NMO): 6501 and 8764 kHz at 06:00 and 12:00 UTC; 8764 and 13089 kHz at 00:05 and 18:00 UTC. Guam (NRV): 6501 kHz at 09:30 and 15:30 UTC; 13089 kHz at 03:30 and 21:30 UTC.",
    ],
    links: [WEATHER_LINK, PROPAGATION_LINK],
    sources: [NWS_USCG],
    aliases: ["USCG", "NMN", "NMG", "NMC", "high seas forecast"],
  },
  {
    id: "wx-us-uscg-vhf-22a",
    kind: "weather",
    name: "US Coast Guard VHF channel 22A broadcasts",
    operator: "US Coast Guard",
    what: "Coast Guard stations read marine safety information and weather on channel 22A after an announcement on channel 16.",
    frequencies: [
      { khz: 157100, channel: "22A" },
      { khz: 156800, channel: "16", note: "Announcement only" },
    ],
    modes: ["NFM"],
    bands: ["marine-vhf"],
    where: ["US"],
    expect: "An announcement on channel 16 naming the broadcast, then the broadcast on 22A.",
    reception: "Coastal waters within VHF range of a Coast Guard station.",
    status: "on-air",
    links: [WEATHER_LINK],
    sources: [NWS_USCG],
    aliases: ["USCG", "22A", "safety broadcast"],
  },
  {
    id: "wx-us-noaa-fax-nmf",
    kind: "weather",
    name: "Boston (NMF) HF radiofax",
    operator: "US Coast Guard for the National Weather Service",
    what: "National Weather Service charts for the north-west Atlantic, sent by radiofax.",
    frequencies: [{ khz: 4235, hours: "02:30 to 10:39 UTC" }, { khz: 6340.5 }, { khz: 9110 }, { khz: 12750, hours: "14:00 to 22:39 UTC" }],
    modes: ["FAX"],
    bands: ["marine-hf"],
    where: ["US", "north-atlantic"],
    hours: "Scheduled charts through the day (UTC)",
    expect: "A fax tone that a decoder turns into charts. Frequencies are assigned: tune 1.9 kHz lower in USB.",
    status: "on-air",
    links: [PROPAGATION_LINK],
    sources: [NWS_RFAX],
    aliases: ["NMF", "weatherfax", "radiofax"],
  },
  {
    id: "wx-us-noaa-fax-nmg",
    kind: "weather",
    name: "New Orleans (NMG) HF radiofax",
    operator: "US Coast Guard for the National Weather Service",
    what: "National Weather Service charts for the Gulf, Caribbean, tropical Atlantic and south-east Pacific, sent by radiofax.",
    frequencies: [{ khz: 4317.9 }, { khz: 8503.9 }, { khz: 12789.9 }, { khz: 17146.4, hours: "12:00 to 20:45 UTC" }],
    modes: ["FAX"],
    bands: ["marine-hf"],
    where: ["US", "caribbean", "north-atlantic"],
    hours: "Scheduled charts through the day (UTC)",
    expect: "A fax tone that a decoder turns into charts. Frequencies are assigned: tune 1.9 kHz lower in USB.",
    status: "on-air",
    links: [PROPAGATION_LINK],
    sources: [NWS_RFAX],
    aliases: ["NMG", "weatherfax", "radiofax"],
  },
  {
    id: "wx-us-noaa-fax-nmc",
    kind: "weather",
    name: "Point Reyes (NMC) HF radiofax",
    operator: "US Coast Guard for the National Weather Service",
    what: "National Weather Service charts for the north and south-east Pacific, sent by radiofax.",
    frequencies: [
      { khz: 4346, hours: "01:40 to 16:08 UTC" },
      { khz: 8682 },
      { khz: 12786 },
      { khz: 17151.2 },
      { khz: 22527, hours: "18:40 to 23:56 UTC" },
    ],
    modes: ["FAX"],
    bands: ["marine-hf"],
    where: ["US", "north-pacific"],
    hours: "Scheduled charts through the day (UTC)",
    expect: "A fax tone that a decoder turns into charts. Frequencies are assigned: tune 1.9 kHz lower in USB.",
    status: "on-air",
    links: [PROPAGATION_LINK],
    sources: [NWS_RFAX],
    aliases: ["NMC", "weatherfax", "radiofax"],
  },
  {
    id: "wx-us-noaa-fax-noj",
    kind: "weather",
    name: "Kodiak (NOJ) HF radiofax",
    operator: "US Coast Guard for the National Weather Service",
    what: "National Weather Service charts for Alaska and the North Pacific, sent by radiofax.",
    frequencies: [{ khz: 2054 }, { khz: 4298 }, { khz: 8459 }, { khz: 12412.5 }],
    modes: ["FAX"],
    bands: ["marine-mf", "marine-hf"],
    where: ["US", "north-pacific", "arctic"],
    hours: "Scheduled charts through the day (UTC)",
    expect: "A fax tone that a decoder turns into charts. Frequencies are assigned: tune 1.9 kHz lower in USB.",
    status: "on-air",
    notes: ["The schedule's station table gives 12412.5 kHz; the same document's Alaska schedule page gives 12410.6 kHz."],
    links: [PROPAGATION_LINK],
    sources: [NWS_RFAX],
    aliases: ["NOJ", "weatherfax", "radiofax"],
  },
  {
    id: "wx-us-noaa-fax-kvm70",
    kind: "weather",
    name: "Honolulu (KVM70) HF radiofax",
    operator: "US Coast Guard for the National Weather Service",
    what: "National Weather Service charts for the central, south-east and North Pacific, sent by radiofax.",
    frequencies: [{ khz: 9982.5, hours: "05:19 to 15:56 UTC" }, { khz: 11090 }, { khz: 16135, hours: "17:19 to 03:56 UTC" }],
    modes: ["FAX"],
    bands: ["marine-hf"],
    where: ["US", "north-pacific", "south-pacific"],
    hours: "Scheduled charts through the day (UTC)",
    expect: "A fax tone that a decoder turns into charts. Frequencies are assigned: tune 1.9 kHz lower in USB.",
    status: "on-air",
    links: [PROPAGATION_LINK],
    sources: [NWS_RFAX],
    aliases: ["KVM70", "weatherfax", "radiofax"],
  },

  // ── Canada ──
  {
    id: "wx-ca-ccg-continuous-marine-broadcast",
    kind: "weather",
    name: "Canadian Coast Guard continuous marine broadcast (CMB)",
    operator: "Canadian Coast Guard, Marine Communications and Traffic Services",
    what: "A continuous recorded broadcast of marine forecasts, warnings and weather observations on VHF, now the main way to hear Environment and Climate Change Canada's marine forecasts by radio.",
    frequencies: [
      { khz: 161650, channel: "21B" },
      { khz: 161750, channel: "23B" },
      { khz: 161775, channel: "83B" },
      { khz: 162550, channel: "WX1" },
      { khz: 162400, channel: "WX2" },
      { khz: 162475, channel: "WX3" },
    ],
    modes: ["NFM"],
    bands: ["marine-vhf", "weather-vhf"],
    where: ["CA"],
    hours: "Continuous",
    expect: "A recorded voice, in English or French by region, reading marine forecasts, warnings, buoy and station reports on a loop.",
    reception:
      "Coastal waters, the St Lawrence and the Great Lakes, within VHF range of each site. The WX channels are used on the Pacific coast.",
    status: "on-air",
    notes: [
      "Which channel serves which site is listed for each MCTS centre in Part 2 of Radio Aids to Marine Navigation.",
      "The MCTS centres also read maritime safety information on MF and HF (J3E) on 2054, 2514, 2598, 2749, 4363, 6218.6 and 6507 kHz, by centre.",
    ],
    links: [WEATHER_LINK],
    sources: [CCG_RAMN, CCG_RAMN_PART5],
    aliases: ["CMB", "MCTS", "Coast Guard Radio", "WX1"],
  },
  navtex({
    id: "wx-navtex-ca",
    where: ["CA"],
    name: "NAVTEX, Canada",
    operator: "Canadian Coast Guard, MCTS",
    frequencies: [F518, { khz: 490, note: "National service, in French" }, { khz: 8416.5, note: "Iqaluit HF NBDP, 03:30 and 15:30 UTC" }],
    stations:
      "518 kHz (English) and 490 kHz (French): Robin Hood Bay (O), Cartwright (X), Port Caledonia (Q and J), Chebogue (U and V), Moisie (C and D), Iqaluit (T and S), Amphitrite Point (H), Digby Island (D).",
    notes: [
      "Iqaluit also sends METAREA and NAVAREA bulletins for the Arctic by HF NBDP on 8416.5 kHz at 03:30 and 15:30 UTC. Broadcast times for each station are in Part 2 of Radio Aids to Marine Navigation.",
      "The IHO's 2024 report also listed Ferndale (H) and Pass Lake (P) on the Great Lakes; they are not in the 2026 Radio Aids to Marine Navigation table.",
    ],
    sources: [CCG_RAMN, IHO_IV_XII],
  }),
  {
    id: "wx-ca-ccg-fax",
    kind: "weather",
    name: "Canadian Coast Guard HF radiofax (Atlantic)",
    operator: "Canadian Coast Guard, MCTS",
    what: "Radiofacsimile weather and ice charts from the Canadian Coast Guard on the Atlantic coast.",
    frequencies: [{ khz: 4416 }, { khz: 6915.1 }],
    modes: ["FAX"],
    bands: ["marine-hf"],
    where: ["CA", "north-atlantic"],
    hours: "Scheduled (UTC)",
    expect: "A fax tone that a decoder turns into charts.",
    status: "on-air",
    notes: [
      "Radio Aids to Marine Navigation lists both frequencies as radiofacsimile (J3C, carrier frequencies). The NWS compilation gives them for VCO Sydney, Nova Scotia, at 22:00 to 23:31 UTC (4416 kHz) and 11:21 to 17:41 UTC (6915.1 kHz), information dated 2010.",
      "The NWS compilation says the Iqaluit, Resolute and Inuvik radiofax services were discontinued in 2019.",
    ],
    links: [PROPAGATION_LINK],
    sources: [CCG_RAMN, NWS_RFAX],
    aliases: ["VCO", "weatherfax", "radiofax"],
  },

  // ── Caribbean, Greenland, South America ──
  navtex({
    id: "wx-navtex-gl",
    where: ["GL"],
    name: "NAVTEX, Greenland",
    operator: "JRCC Greenland",
    frequencies: [F518],
    stations: "Kook Islands (W) and Simiutaq (M).",
    notes: [IHO_2024],
    sources: [IHO_IV_XII],
  }),
  navtex({
    id: "wx-navtex-bm-cw",
    where: ["BM", "CW"],
    name: "NAVTEX, Bermuda and Curaçao",
    frequencies: [F518],
    stations: "Bermuda (B) and Curaçao (H).",
    notes: [IHO_2024],
    sources: [IHO_IV_XII],
  }),
  navtex({
    id: "wx-navtex-co",
    where: ["CO"],
    name: "NAVTEX, Colombia",
    operator: "DIMAR",
    frequencies: [F518, F490],
    stations: "Santa Marta (Caribbean): C on 518 kHz, K on 490 kHz. Buenaventura (Pacific): O on 518 kHz, C on 490 kHz.",
    notes: [IHO_2024],
    sources: [IHO_IV_XII],
  }),
  navtex({
    id: "wx-navtex-cl",
    where: ["CL"],
    name: "NAVTEX, Chile",
    operator: "DIRECTEMAR",
    frequencies: [F518, F490],
    stations:
      "Antofagasta A and G, Valparaíso B and H, Talcahuano C and I, Puerto Montt D and J, Punta Arenas E and K (518 and 490 kHz). Easter Island F and L was temporarily out of service in 2024.",
    notes: [IHO_2024],
    sources: [IHO_XV],
  }),

  // ── Asia and the Pacific ──
  navtex({
    id: "wx-navtex-jp",
    where: ["JP"],
    name: "NAVTEX, Japan",
    operator: "Japan Coast Guard",
    frequencies: [F518],
    stations: "Kushiro (K), Otaru (J), Yokohama (I), Moji (H), Naha (G).",
    notes: [IHO_2024],
    sources: [IHO_XI],
  }),
  navtex({
    id: "wx-navtex-cn",
    where: ["CN"],
    name: "NAVTEX, China",
    frequencies: [F518],
    stations: "Sanya (M), Guangzhou (N), Fuzhou (O), Shanghai (Q), Dalian (R); Tianjin and Zhanjiang national service only.",
    notes: ["The report says China's national NAVTEX stations use 486 kHz; their letters are not repeated here.", IHO_2024],
    sources: [IHO_XI],
  }),
  navtex({
    id: "wx-navtex-hk",
    where: ["HK"],
    name: "NAVTEX, Hong Kong",
    frequencies: [F518],
    stations: "Hong Kong (L).",
    notes: [IHO_2024],
    sources: [IHO_XI],
  }),
  navtex({
    id: "wx-navtex-kr",
    where: ["KR"],
    name: "NAVTEX, Republic of Korea",
    operator: "Korea Coast Guard",
    frequencies: [F518],
    stations: "Jukbyeon (V) and Byeonsan (W) on 518 kHz; national service letters J and K.",
    notes: [IHO_2024],
    sources: [IHO_XI],
  }),
  navtex({
    id: "wx-navtex-southeast-asia",
    where: ["SG", "MY", "ID", "TH", "VN"],
    name: "NAVTEX, South-east Asia",
    frequencies: [F518],
    stations:
      "Singapore (C). Malaysia: Sandakan (S), Miri (T), Penang (U). Indonesia: Jayapura (A), Ambon (B), Makassar (D), Jakarta (E). Thailand: Phetchaburi (F), Donsak (W). Viet Nam: Ho Chi Minh (X), Da Nang (K); Vung Tau national only.",
    notes: ["Manila (Philippines) was not operational in 2024, with rehabilitation said to run until 2025.", IHO_2024],
    sources: [IHO_XI],
  }),
  navtex({
    id: "wx-navtex-ru-pacific",
    where: ["RU", "north-pacific"],
    name: "NAVTEX, Russian Far East",
    frequencies: [F518],
    stations: "Vladivostok (A), Kholmsk (B), Petropavlovsk-Kamchatsky (C), Magadan (D), Okhotsk (G).",
    notes: [IHO_2024],
    sources: [IHO_XIII],
  }),
  {
    id: "wx-jp-jmh-fax",
    kind: "weather",
    name: "Japan Meteorological Agency radiofax (JMH)",
    operator: "Japan Meteorological Agency",
    what: "Weather, wave and sea-ice charts for the western North Pacific, sent by radiofax from Tokyo.",
    frequencies: [
      { khz: 3622.5, channel: "JMH", power: "5 kW" },
      { khz: 7795, channel: "JMH2", power: "5 kW" },
      { khz: 13988.5, channel: "JMH4", power: "5 kW" },
    ],
    modes: ["FAX"],
    bands: ["marine-mf", "marine-hf"],
    where: ["JP", "north-pacific"],
    hours: "Scheduled charts through the day (UTC)",
    expect: "A fax tone that a decoder turns into charts (120 rpm, IOC 576).",
    status: "on-air",
    notes: [
      "From the NWS worldwide compilation, whose JMH entry is dated 2014; the Japan Meteorological Agency's own schedule page could not be opened today. Unless stated, frequencies there are assigned: tune 1.9 kHz lower in USB.",
    ],
    links: [PROPAGATION_LINK],
    sources: [NWS_RFAX],
    aliases: ["JMH", "weatherfax", "radiofax"],
  },
  {
    id: "wx-cn-guangzhou-fax",
    kind: "weather",
    name: "Guangzhou coast radio (XSQ) radiofax",
    what: "Weather, wave and tropical cyclone charts from China's Guangzhou coast radio station.",
    frequencies: [{ khz: 4199.75 }, { khz: 8412.5 }, { khz: 12629.25 }, { khz: 16826.25 }],
    modes: ["FAX"],
    bands: ["marine-hf"],
    where: ["CN", "north-pacific"],
    hours: "Scheduled charts (UTC)",
    expect: "A fax tone (F3C) that a decoder turns into charts.",
    status: "on-air",
    notes: ["From the NWS worldwide compilation, schedule effective August 2022."],
    links: [PROPAGATION_LINK],
    sources: [NWS_RFAX],
    aliases: ["XSQ", "weatherfax", "radiofax"],
  },
  {
    id: "wx-au-bom-fax",
    kind: "weather",
    name: "Bureau of Meteorology radiofax (VMC Charleville and VMW Wiluna)",
    operator: "Bureau of Meteorology",
    what: "Weather charts for Australian waters, the Indian Ocean, the south-west Pacific and the Southern Ocean, sent by radiofax from Charleville (east) and Wiluna (west).",
    frequencies: [
      { khz: 2628, channel: "VMC", hours: "09:00 to 19:00 UTC" },
      { khz: 5100, channel: "VMC" },
      { khz: 11030, channel: "VMC" },
      { khz: 13920, channel: "VMC" },
      { khz: 20469, channel: "VMC", hours: "19:00 to 09:00 UTC" },
      { khz: 5755, channel: "VMW", hours: "11:00 to 21:00 UTC" },
      { khz: 7535, channel: "VMW" },
      { khz: 10555, channel: "VMW" },
      { khz: 15615, channel: "VMW" },
      { khz: 18060, channel: "VMW", hours: "21:00 to 11:00 UTC" },
    ],
    modes: ["FAX"],
    bands: ["marine-mf", "marine-hf"],
    where: ["AU", "indian-ocean", "south-pacific", "antarctica"],
    hours: "Scheduled charts through the day (UTC)",
    expect: "A fax tone that a decoder turns into charts.",
    status: "on-air",
    notes: [
      "From the NWS worldwide compilation (information dated 20 April 2022). The Bureau of Meteorology's own pages refused automated checks today, so its current schedule, and its HF voice broadcasts from VMC and VMW, are not given here.",
    ],
    links: [PROPAGATION_LINK],
    sources: [NWS_RFAX],
    aliases: ["VMC", "VMW", "BoM", "weatherfax", "radiofax"],
  },
  {
    id: "wx-nz-zklf-fax",
    kind: "weather",
    name: "MetService radiofax ZKLF, Wellington (closed)",
    operator: "MetService",
    what: "New Zealand's HF radiofax service, which no longer broadcasts.",
    frequencies: [{ khz: 3000, toKhz: 30000, note: "HF; its frequencies are not repeated here" }],
    modes: ["FAX"],
    bands: ["hf"],
    where: ["NZ", "south-pacific"],
    expect: "Nothing. Maritime NZ's Maritime Radio reads New Zealand forecasts by HF and VHF voice instead (not verified here).",
    status: "closed",
    closed: "2023-07-01",
    notes: [
      'The NWS worldwide compilation says "Station ZKLF stopped broadcasting radiofax charts on 1 July 2023". MetService\'s own retirement notice, which it cites, could not be opened today (secondary source for the date).',
      "The IHO's 2024 report says New Zealand does not broadcast coastal warnings by NAVTEX: warnings go out by HF and VHF voice.",
    ],
    sources: [NWS_RFAX, IHO_XIV],
    aliases: ["ZKLF", "MetService", "weatherfax"],
  },
  {
    id: "wx-hf-msi-nbdp",
    kind: "weather",
    name: "HF maritime safety information by NBDP (HF NAVTEX)",
    what: "The frequencies the ITU sets aside for coast stations to send maritime safety information as NBDP text on HF, for ships beyond NAVTEX range. Few stations use them now; most such information goes by satellite.",
    frequencies: [
      { khz: 4209.5, note: "National NAVTEX on HF" },
      { khz: 4210 },
      { khz: 6314 },
      { khz: 8416.5 },
      { khz: 12579 },
      { khz: 16806.5 },
      { khz: 19680.5 },
      { khz: 22376 },
      { khz: 26100.5 },
    ],
    modes: ["SITOR-B"],
    bands: ["marine-hf"],
    where: ["world"],
    expect: "A data signal like NAVTEX, decoded as text by a SITOR-B decoder.",
    reception: "Ocean-wide when a station is using a frequency; listen on 8416.5 kHz first.",
    status: "occasional",
    notes: [
      "Users seen today: Iqaluit (Canada) on 8416.5 kHz, Svalbard (Norway) on 8416.5 and 4209.5 kHz, and Guam (USA) on 4209.5 kHz while its NAVTEX station was out of service in 2024.",
    ],
    links: [PROPAGATION_LINK],
    sources: [OFCOM_SAR, CCG_RAMN, KYSTVERKET, IHO_IV_XII],
    aliases: ["NBDP", "SITOR-B", "HF MSI", "HF NAVTEX"],
  },
  navtex({
    id: "wx-navtex-international",
    where: ["world"],
    name: "NAVTEX: the three frequencies",
    frequencies: [F518, F490, { khz: 4209.5, note: "National service on HF, mostly in the tropics" }],
    stations:
      "518 kHz is the international service, in English, coordinated by the IMO NAVTEX Coordinating Panel. 490 kHz and 4209.5 kHz are national services in the language the country chooses. Some countries use other national frequencies (China 486 kHz).",
    notes: [
      "Subject letters a receiver can select: A navigational warnings, B meteorological warnings, C ice reports, D search and rescue and piracy (sounds the alarm), E meteorological forecasts, F pilot and VTS, G AIS, H LORAN, J GNSS, K other navigation aids, L more navigational warnings. A, B, D and L should not be switched off.",
      "There is no NAVTEX in Australia (NAVAREA X) or New Zealand (IHO, 2024).",
    ],
    sources: [IMO_NAVTEX, IHO_X, IHO_XIV],
    reception: "The IMO NAVTEX Manual gives a designed maximum range of about 400 nautical miles.",
  }),

  // ── VOLMET ──
  {
    id: "wx-volmet-shannon-hf",
    kind: "weather",
    name: "Shannon VOLMET (HF)",
    operator: "AirNav Ireland, with Met Éireann",
    what: "Aviation weather for North Atlantic flights: reports (METAR), forecasts (TAF) and SIGMETs for major European airports, read in English on HF in five-minute blocks round the hour.",
    frequencies: [
      { khz: 3413, hours: "Night (HN)" },
      { khz: 5505, hours: "24 hours" },
      { khz: 8957, hours: "24 hours" },
      { khz: 13264, hours: "Day (HJ)" },
    ],
    modes: ["USB"],
    bands: ["air-hf"],
    where: ["IE", "north-atlantic"],
    hours: "Continuous, in five-minute blocks: each block of airports at the same minutes every hour",
    expect:
      "A synthesised voice reading airport weather in the standard aviation order: wind, visibility, weather, cloud, temperature, dew point, QNH.",
    reception: "Across the North Atlantic and western Europe; 5505 and 8957 kHz at most times.",
    status: "on-air",
    notes: [
      "Minutes past each hour: 00-05 Brussels, Amsterdam, Frankfurt, Hamburg, Munich; 05-10 London Heathrow, Gatwick, Stansted, Prestwick, Glasgow; 10-15 Dublin, Shannon, Manchester, Keflavík; 15-20 Santa Maria, Lisbon, Madrid, Lajes; 20-25 Paris, Zürich, Geneva, Milan; 25-30 Stockholm, Manchester, Shannon, Copenhagen, Bergen, Dublin, Helsinki; then 30-35 Frankfurt, Cologne, Düsseldorf, Munich, Luxembourg; 35-40 Keflavík, Glasgow, Manchester, London; 40-45 Oslo, Copenhagen, Gothenburg, Stockholm, Bergen, Helsinki; 45-50 Zürich, Geneva, Paris; 50-55 Brussels, Amsterdam, Frankfurt, Cologne, Hamburg; 55-00 Rome, Milan, Turin, Lisbon, Lajes, Santa Maria.",
      "Aeronautical HF voice is upper sideband; an AM-only set will not make it intelligible.",
    ],
    links: [PROPAGATION_LINK],
    sources: [IAA_GEN35, ICAO_NAT_ANP],
    aliases: ["VOLMET", "Shannon", "aviation weather", "METAR"],
  },
  {
    id: "wx-volmet-dublin-vhf",
    kind: "weather",
    name: "Dublin VOLMET (VHF)",
    operator: "AirNav Ireland",
    what: "Continuous VHF broadcast of airport weather reports and trend forecasts for Irish and nearby UK airports.",
    frequencies: [{ khz: 127000, channel: "127.005", note: "8.33 kHz channel 127.005" }],
    modes: ["AM"],
    bands: ["air-vhf"],
    where: ["IE"],
    hours: "Continuous",
    expect: "Reports for Dublin, Shannon, Cork, Belfast, Glasgow, Prestwick, Manchester, London Heathrow and Gatwick, in plain English.",
    reception: "Line of sight: best at height, within roughly 100 miles of Dublin for a ground receiver, less with hills between.",
    status: "on-air",
    notes: [
      "The AIP gives the channel name 127.005, an 8.33 kHz channel; set an air band receiver to 127.000 MHz unless it tunes 8.33 kHz channels by name.",
    ],
    sources: [IAA_GEN35],
    aliases: ["VOLMET", "Dublin", "aviation weather"],
  },
  {
    id: "wx-volmet-london",
    kind: "weather",
    name: "London and Scottish VOLMET (VHF)",
    operator: "NATS, with the Met Office",
    what: "Continuous VHF broadcasts of half-hourly airport weather reports (METAR) for UK and nearby airports.",
    frequencies: [
      {
        khz: 135375,
        note: "London VOLMET (Main): Amsterdam, Brussels, Dublin, Glasgow, Gatwick, Heathrow, Stansted, Manchester, Paris CDG",
      },
      {
        khz: 128600,
        note: "London VOLMET (South): Birmingham, Bournemouth, Bristol, Cardiff, Jersey, Luton, Norwich, Southampton, Southend, Exeter",
      },
      {
        khz: 126600,
        note: "London VOLMET (North): East Midlands, Humberside, Isle of Man, Leeds Bradford, Liverpool, Gatwick, Manchester, Newcastle, Teesside",
      },
      {
        khz: 125725,
        note: "Scottish VOLMET: Aberdeen, Belfast Aldergrove, Edinburgh, Glasgow, Inverness, Heathrow, Prestwick, Stornoway, Sumburgh",
      },
    ],
    modes: ["AM"],
    bands: ["air-vhf"],
    where: ["GB"],
    hours: "Continuous",
    expect:
      'A synthesised voice reading each airport\'s report: wind, visibility, weather, cloud, temperature, dew point, QNH and trend, without the words "surface wind" and "visibility".',
    reception: "Line of sight; London VOLMET (North) is extended to cover south-east England and the Channel.",
    status: "on-air",
    notes: ["UK AIP: an HF VOLMET for North Atlantic flights (Shannon VOLMET) is run by Ireland."],
    sources: [NATS_GEN35],
    aliases: ["VOLMET", "London VOLMET", "Scottish VOLMET", "aviation weather", "METAR"],
  },
  {
    id: "wx-volmet-australia",
    kind: "weather",
    name: "VOLMET Australia (HF)",
    operator: "Airservices Australia",
    what: "Aviation weather broadcast on HF from Sydney for Australian airports.",
    frequencies: [{ khz: 6676 }, { khz: 11387 }],
    modes: ["USB"],
    bands: ["air-hf"],
    where: ["AU"],
    hours: "24 hours; broadcasts at 00-05 and 30-35 minutes past each hour",
    expect:
      "Reports and forecasts for Sydney, Brisbane, Melbourne, Townsville, Adelaide, Alice Springs, Darwin and Perth (ICAO lists these for the Sydney VOLMET), at most five minutes each time.",
    reception: "Australia and nearby waters.",
    status: "on-air",
    notes: ["Sydney's ERSA page refers to AIP GEN 3.5 for the details, which was not read."],
    links: [PROPAGATION_LINK],
    sources: [AIRSERVICES_YSSY, ICAO_APAC_ANP],
    aliases: ["VOLMET", "Sydney VOLMET", "aviation weather"],
  },
];

// ── Guide ───────────────────────────────────────────────────────────────────

export const WEATHER_GUIDES: FrequencyGuide[] = [
  {
    id: "wx-guide-hearing-weather",
    kind: "weather",
    title: "Hearing weather on the radio",
    paragraphs: [
      "In the United States, a weather radio or any scanner or marine VHF set will receive NOAA Weather Radio on one of seven frequencies between 162.400 and 162.550 MHz. An ordinary AM/FM radio cannot. Canada's Weatheradio closed on 16 March 2026; on the Canadian coasts the Coast Guard's continuous marine broadcast carries the marine forecasts on VHF instead.",
      "Marine VHF is narrow FM, so a marine set, a scanner or most amateur VHF handhelds will do. Coastguards announce a forecast on channel 16 and then read it on a working channel: in the UK 62, 63, 64 or 10; in France usually 79 or 80. In the UK the Shipping Forecast can also be heard on BBC Radio 4 FM.",
      "MF and HF voice forecasts (the UK and French coastguards on about 1.6 to 2.7 MHz, the US Coast Guard on 4 to 17 MHz) are single sideband: they need a set with SSB, tuned to the listed frequency in upper sideband. On an ordinary shortwave portable without SSB they sound like gabble.",
      "NAVTEX on 518 and 490 kHz is text, not speech. It needs a NAVTEX receiver, or a receiver that tunes long and medium wave in SSB with its audio fed to a decoder program on a computer. Each station sends for ten minutes every four hours, in the slot of its letter, so leave the receiver running.",
      "Radiofax (weather fax) sends charts as audio tones on HF. Tune the carrier frequency in upper sideband (for most schedules, 1.9 kHz below the assigned frequency printed), and feed the audio to a fax decoder program. RTTY bulletins such as the Deutscher Wetterdienst's need an RTTY decoder in the same way.",
      "VOLMET is aviation weather read aloud. On VHF (London, Scottish and Dublin VOLMET) it is AM in the air band, heard on any scanner. On HF (Shannon, Australia) it is upper sideband, with each group of airports in its own five-minute block at the same minutes every hour. Reports follow a fixed order: wind, visibility, weather, cloud, temperature, dew point, pressure (QNH), then any trend.",
      "Times for the HF services are mostly given in UTC; coastguards' local broadcasts are often in local time. Higher HF frequencies carry further by day and lower ones by night: if one is silent, try another. Outpost's propagation screen shows which bands are likely open.",
    ],
    sources: [NWS_WXRADIO, CCG_RAMN_PART5, MCA_MSI, IMO_NAVTEX, NWS_RFAX, NATS_GEN35, IAA_GEN35],
  },
];
