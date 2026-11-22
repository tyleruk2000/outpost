/**
 * Alerts from beyond the UK, fetched on a press like the rest of Weather and hazards:
 * GDACS's disasters worldwide, the USGS's earthquakes worldwide, and the national
 * warnings for where Home is (MeteoAlarm in Europe, the US National Weather Service in
 * the United States, Environment and Climate Change Canada, MetService in New Zealand and
 * the Japan Meteorological Agency), or for the country a person chooses instead. And the Sun's state today for HF radio, from NOAA's Space Weather
 * Prediction Center, shown beside the HF propagation planner.
 *
 * The publishers' words are kept as they were written. What Outpost reads from them (a
 * level, a time, whether a warning area covers Home) is for sorting and for badges; the
 * words are what is shown.
 */

/** The kinds kept for alerts and space weather. None is for one place: each is one copy for the household. */
export const ALERT_KINDS = ["gdacs", "quakes", "meteoalarm", "nws", "eccc", "metservice", "jma", "space-weather"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

// ── GDACS ───────────────────────────────────────────────────────────────────

/** GDACS's hazard codes, in the words of its feed reference. */
export const GDACS_TYPES: Record<string, string> = {
  EQ: "Earthquake",
  TC: "Tropical cyclone",
  FL: "Flood",
  VO: "Volcano",
  DR: "Drought",
  WF: "Wildfire",
};

export interface GdacsEvent {
  /** The feed's guid, "EQ1578540". */
  id: string;
  /** "EQ", "TC", "FL", "VO", "DR", "WF". */
  type: string;
  /** GDACS's alert level: Green, Orange or Red. */
  level: "Green" | "Orange" | "Red" | null;
  title: string;
  description: string;
  /** The countries the feed names, "Benin, Burkina Faso". */
  country: string;
  /** The period the event covers, as the feed gives it. */
  from: number | null;
  to: number | null;
  lat: number | null;
  lon: number | null;
  /** The feed says the event is current. */
  current: boolean;
  /** The event's report on gdacs.org. */
  link: string;
}

export interface GdacsData {
  publishedAt: number | null;
  events: GdacsEvent[];
}

// ── The USGS's earthquakes ──────────────────────────────────────────────────

export interface QuakeItem {
  id: string;
  mag: number | null;
  /** "238 km SW of Yanglong, China". */
  place: string;
  time: number;
  lat: number;
  lon: number;
  depthKm: number | null;
  url: string;
  /** The PAGER alert level for estimated losses, where one was issued. */
  pager: "green" | "yellow" | "orange" | "red" | null;
  /** The feed's tsunami flag. It is not a tsunami warning. */
  tsunami: boolean;
}

export interface QuakesData {
  /** The feed's own title: "USGS Magnitude 4.5+ Earthquakes, Past Week". */
  title: string;
  generatedAt: number | null;
  quakes: QuakeItem[];
}

// ── National warnings ───────────────────────────────────────────────────────

/**
 * MeteoAlarm's country feeds (feeds.meteoalarm.org, read 21 November 2026), by ISO 3166 code,
 * with each country's MeteoAlarm Participants: the national services whose warnings the feed
 * carries, as MeteoAlarm's members page names them (meteoalarm.org/en/live/page/meteoalarm-members,
 * read 22 November 2026). Its terms (section 5) ask that one country's warnings always name them.
 */
export const METEOALARM_COUNTRIES: Record<string, { slug: string; name: string; services: string[] }> = {
  AD: { slug: "andorra", name: "Andorra", services: ["Servei Meteorològic Nacional"] },
  AT: { slug: "austria", name: "Austria", services: ["GeoSphere Austria"] },
  BE: { slug: "belgium", name: "Belgium", services: ["Institut Royal Météorologique/Koninklijk Meteorologisch Instituut"] },
  BA: {
    slug: "bosnia-herzegovina",
    name: "Bosnia and Herzegovina",
    services: ["Federalni Hidrometeorološki Zavod BiH", "Republički Hidrometeorološki Zavod Republike Srpske"],
  },
  BG: { slug: "bulgaria", name: "Bulgaria", services: ["National Institute of Meteorology and Hydrology"] },
  HR: { slug: "croatia", name: "Croatia", services: ["Državni Hidrometeorološki Zavod"] },
  CY: { slug: "cyprus", name: "Cyprus", services: ["Cyprus Department of Meteorology"] },
  CZ: { slug: "czechia", name: "Czechia", services: ["Czech Hydrometeorological Institute"] },
  DK: { slug: "denmark", name: "Denmark", services: ["Danmarks Meteorologiske Institut"] },
  EE: { slug: "estonia", name: "Estonia", services: ["Estonian Environment Agency"] },
  FI: { slug: "finland", name: "Finland", services: ["Finnish Meteorological Institute"] },
  FR: { slug: "france", name: "France", services: ["Météo-France"] },
  DE: { slug: "germany", name: "Germany", services: ["Deutscher Wetterdienst"] },
  GR: { slug: "greece", name: "Greece", services: ["Hellenic National Meteorological Service"] },
  HU: { slug: "hungary", name: "Hungary", services: ["HungaroMet"] },
  IS: { slug: "iceland", name: "Iceland", services: ["Icelandic Meteorological Office"] },
  IE: { slug: "ireland", name: "Ireland", services: ["Met Éireann"] },
  IL: { slug: "israel", name: "Israel", services: ["Israel Meteorological Service"] },
  IT: { slug: "italy", name: "Italy", services: ["Servizio Meteorologico dell'Aeronautica Militare"] },
  LV: { slug: "latvia", name: "Latvia", services: ["Latvijas Vides, Ģeoloģijas un Meteoroloģijas Centrs"] },
  LT: { slug: "lithuania", name: "Lithuania", services: ["Lietuvos Hidrometeorologijos Tarnyba"] },
  LU: { slug: "luxembourg", name: "Luxembourg", services: ["MeteoLux"] },
  MT: { slug: "malta", name: "Malta", services: ["Malta Meteorological Office"] },
  MD: { slug: "moldova", name: "Moldova", services: ["Autoritatea de Meteorologie și Monitoring de Mediu"] },
  ME: { slug: "montenegro", name: "Montenegro", services: ["Zavod za Hidrometeorologiju i Seizmologiju"] },
  NL: { slug: "netherlands", name: "the Netherlands", services: ["Koninklijk Nederlands Meteorologisch Instituut"] },
  NO: { slug: "norway", name: "Norway", services: ["Meteorologisk Institutt", "Norges Vassdrags- og Energidirektorat"] },
  PL: { slug: "poland", name: "Poland", services: ["Instytut Meteorologii i Gospodarki Wodnej - Państwowy Instytut Badawczy"] },
  PT: { slug: "portugal", name: "Portugal", services: ["Instituto Português do Mar e da Atmosfera"] },
  MK: {
    slug: "republic-of-north-macedonia",
    name: "North Macedonia",
    services: ["Hydrometeorological Service of Republic of North Macedonia"],
  },
  RO: { slug: "romania", name: "Romania", services: ["Administrația Națională de Meteorologie"] },
  RS: { slug: "serbia", name: "Serbia", services: ["Republički Hidrometeorološki Zavod Srbije"] },
  SK: { slug: "slovakia", name: "Slovakia", services: ["Slovenský Hydrometeorologický Ústav"] },
  SI: { slug: "slovenia", name: "Slovenia", services: ["Agencija Republike Slovenije za Okolje"] },
  ES: { slug: "spain", name: "Spain", services: ["Agencia Estatal de Meteorología"] },
  SE: { slug: "sweden", name: "Sweden", services: ["Sveriges Meteorologiska och Hydrologiska Institut"] },
  CH: { slug: "switzerland", name: "Switzerland", services: ["Federal Office of Meteorology and Climatology MeteoSwiss"] },
  UA: { slug: "ukraine", name: "Ukraine", services: ["Ukrainian Hydrometeorological Center"] },
  GB: {
    slug: "united-kingdom",
    name: "the United Kingdom",
    services: ["Met Office", "Environment Agency", "Natural Resources Wales", "Scottish Environment Protection Agency"],
  },
};

/** Where the US National Weather Service issues alerts: the states and the territories it serves. */
export const NWS_COUNTRIES = ["US", "PR", "VI", "GU", "AS", "MP"] as const;

/** The disclaimer MeteoAlarm's terms (section 5) require every redistributor to publish, word for word. */
export const METEOALARM_DISCLAIMER =
  "Time delays between this website and the www.meteoalarm.org website are possible. For the most up-to-date awareness information as published by the participating National Meteorological and Hydrological Services, please refer to www.meteoalarm.org.";

export interface MeteoalarmItem {
  id: string;
  /** "Yellow Low-temperature Warning issued for Germany - Stadt Köln". */
  title: string;
  /** "frost", "Yellow rain warning", as the national service names it. */
  event: string;
  area: string;
  /** Read from the title: the awareness level. */
  level: "yellow" | "orange" | "red" | null;
  severity: string;
  urgency: string;
  certainty: string;
  /** The time of issue, which MeteoAlarm's terms require to be shown. */
  sent: number | null;
  onset: number | null;
  expires: number | null;
  /** Whether the warning's own area holds Home: true or false where it gives a polygon, null where it names its area only by code. */
  coversHome: boolean | null;
  /** The area on meteoalarm.org. */
  link: string;
  /** The national service that issued it, as the feed names it (CAP `senderName`); empty where the feed does not say. */
  sender: string;
}

export interface MeteoalarmData {
  /** ISO code and name of the country asked for. */
  country: string;
  countryName: string;
  updatedAt: number | null;
  items: MeteoalarmItem[];
}

/**
 * How long a MeteoAlarm copy may be shown as current. Its terms (section 5) ask operational
 * redistribution to be never more than ten minutes behind; a kept copy cannot promise that, so
 * one older than this is marked "Not current: for reference only".
 */
export const METEOALARM_CURRENT_MS = 10 * 60_000;

/** Whether a MeteoAlarm copy is too old to be shown as current warnings. */
export function meteoalarmNotCurrent(copy: { fetchedAt: number }, now: number): boolean {
  return now - copy.fetchedAt > METEOALARM_CURRENT_MS;
}

/**
 * The national services to name with a country's MeteoAlarm warnings: those the warnings
 * themselves name where the feed gives a sender, otherwise MeteoAlarm's own list of the
 * country's participants.
 */
export function meteoalarmServices(data: Pick<MeteoalarmData, "country" | "items">): string[] {
  // A copy kept before senders were read has no `sender` on its items.
  const named = [...new Set(data.items.map((item) => item.sender ?? "").filter((sender) => sender !== ""))];
  if (named.length > 0) return named;
  return Object.hasOwn(METEOALARM_COUNTRIES, data.country) ? METEOALARM_COUNTRIES[data.country]!.services : [];
}

/** "A", "A and B", "A, B and C". */
export function namesInWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export interface NwsAlert {
  id: string;
  event: string;
  headline: string;
  description: string;
  instruction: string;
  severity: string;
  urgency: string;
  certainty: string;
  area: string;
  /** "NWS Sacramento CA". */
  sender: string;
  sent: number | null;
  onset: number | null;
  ends: number | null;
  expires: number | null;
}

export interface NwsData {
  /** The service's own title: "Current watches, warnings, and advisories for 37.96 N, 121.29 W". */
  title: string;
  updatedAt: number | null;
  alerts: NwsAlert[];
}

// ── Environment and Climate Change Canada ───────────────────────────────────

/** One alert for one area, as MSC GeoMet's `weather-alerts` collection gives it, in English. */
export interface EcccAlert {
  id: string;
  /** "snowfall warning", as ECCC names it. */
  name: string;
  /** "warning", "watch", "advisory" or "statement". */
  type: string;
  /** ECCC's risk colour: "yellow", "orange", "red", or null where it gives none. */
  colour: string | null;
  /** The alert's text, as written. */
  text: string;
  /** "Kapuskasing - Hearst - Smooth Rock Falls". */
  area: string;
  province: string;
  /** "new", "continued", "ended", as ECCC says. */
  status: string;
  published: number | null;
  expires: number | null;
  eventEnd: number | null;
  /** Whether the alert's area holds Home, from its outline; null where the answer gave none. */
  coversHome: boolean | null;
}

export interface EcccData {
  updatedAt: number | null;
  alerts: EcccAlert[];
}

// ── MetService (New Zealand) ────────────────────────────────────────────────

/** One CAP alert, from the item in MetService's feed and the CAP document it links to. */
export interface CapAlert {
  id: string;
  /** The feed item's title. */
  title: string;
  event: string;
  headline: string;
  description: string;
  instruction: string;
  severity: string;
  urgency: string;
  certainty: string;
  /** MetService's colour code, "Orange", where the CAP document gives one. */
  colour: string | null;
  area: string;
  sent: number | null;
  onset: number | null;
  expires: number | null;
  /** Whether one of the alert's polygons holds Home; null when the CAP document could not be read or gives none. */
  coversHome: boolean | null;
  /** The CAP document on alerts.metservice.com. */
  link: string;
}

export interface MetserviceData {
  /** The feed's own title. */
  title: string;
  publishedAt: number | null;
  alerts: CapAlert[];
  /** How many items' CAP documents could not be had: those are kept from the feed's words only. */
  unread: number;
}

// ── The Japan Meteorological Agency ─────────────────────────────────────────

/** The levels read from a headline, in JMA's own words: emergency, danger, warning, advisory, lifted. */
export const JMA_LEVELS = ["特別警報", "危険警報", "警報", "注意報", "解除"] as const;
export type JmaLevel = (typeof JMA_LEVELS)[number];

/** The latest weather warnings and advisories from one local office, as the headline in JMA's feed. */
export interface JmaEntry {
  id: string;
  /** The issuing office, "富山地方気象台". */
  office: string;
  /** The entry's headline as written, in Japanese: "【富山県気象警報・注意報】注意報を解除します。". */
  headline: string;
  updated: number | null;
  /** The highest level the headline names, for sorting and a badge; the headline is what is shown. */
  level: JmaLevel | null;
  /** The full XML message on www.data.jma.go.jp. */
  link: string;
}

export interface JmaData {
  updatedAt: number | null;
  entries: JmaEntry[];
}

// ── Which national service ──────────────────────────────────────────────────

export const NATIONAL_SERVICES = ["meteoalarm", "nws", "eccc", "metservice", "jma"] as const;
export type NationalService = (typeof NATIONAL_SERVICES)[number];

/** Each national service's name in a sentence. */
export const NATIONAL_SERVICE_NAMES: Record<NationalService, string> = {
  meteoalarm: "MeteoAlarm",
  nws: "the US National Weather Service",
  eccc: "Environment and Climate Change Canada",
  metservice: "MetService",
  jma: "the Japan Meteorological Agency",
};

const OTHER_NATIONAL: Record<string, { name: string; service: NationalService }> = {
  US: { name: "the United States", service: "nws" },
  PR: { name: "Puerto Rico", service: "nws" },
  VI: { name: "the US Virgin Islands", service: "nws" },
  GU: { name: "Guam", service: "nws" },
  AS: { name: "American Samoa", service: "nws" },
  MP: { name: "the Northern Mariana Islands", service: "nws" },
  CA: { name: "Canada", service: "eccc" },
  NZ: { name: "New Zealand", service: "metservice" },
  JP: { name: "Japan", service: "jma" },
};

/** The national service Outpost asks for a country, or null when it knows none. */
export function nationalServiceOf(code: string | null): NationalService | null {
  if (!code) return null;
  if (Object.hasOwn(METEOALARM_COUNTRIES, code)) return "meteoalarm";
  return Object.hasOwn(OTHER_NATIONAL, code) ? OTHER_NATIONAL[code]!.service : null;
}

/** Every country a national service is fetched for, by name, for choosing one by hand. */
export const ALERT_COUNTRIES: Array<{ code: string; name: string; service: NationalService }> = [
  ...Object.entries(METEOALARM_COUNTRIES).map(([code, entry]) => ({ code, name: entry.name, service: "meteoalarm" as const })),
  ...Object.entries(OTHER_NATIONAL).map(([code, entry]) => ({ code, ...entry })),
].sort((a, b) => a.name.replace(/^the /, "").localeCompare(b.name.replace(/^the /, "")));

/** A country's name in a sentence, where Outpost fetches warnings for it. */
export const alertCountryName = (code: string): string | null => ALERT_COUNTRIES.find((entry) => entry.code === code)?.name ?? null;

/** What the alerts view needs to know before a press: where Home is taken to be, and which national service covers it. */
export interface AlertsPlan {
  /**
   * The current household's home: its saved place, or a portable household's position,
   * with `at`, when that was set (null for a saved place). Null when it has none.
   */
  home: { name: string; lat: number; lon: number; at?: number | null } | null;
  /** The current household's name when there are several, so that the screen says whose home it is; else null. */
  household?: string | null;
  /** The country Home is taken to be in, from the smallest Natural Earth box that holds it (rough near a border). */
  homeCountry: string | null;
  homeCountryName: string | null;
  /** The country a person chose for national warnings instead of Home's, or null to go by Home. */
  chosenCountry: string | null;
  /** The country national warnings are fetched for: the one chosen, or else Home's. */
  country: string | null;
  countryName: string | null;
  /** The national service asked, or null when Outpost knows none for that country. */
  national: NationalService | null;
}

// ── Space weather ───────────────────────────────────────────────────────────

/** A NOAA scale level now, as `noaa-scales.json` gives it: 0 to 5, and NOAA's word for it. */
export interface ScaleNow {
  level: number;
  text: string;
}

export interface SpaceWeatherData {
  /** NOAA's R (radio blackouts), S (solar radiation storms) and G (geomagnetic storms) scales: today's, as observed. */
  scales: { at: number | null; r: ScaleNow | null; s: ScaleNow | null; g: ScaleNow | null };
  /** The 10.7 cm solar flux, solar flux units, and when it was measured. */
  flux: { value: number; at: number } | null;
  /** The latest planetary K index, and the running a index beside it. */
  kp: { value: number; at: number; a: number | null } | null;
  /** The WWV geophysical alert message, as written: solar flux, the estimated A and K indices, and what happened in the last 24 hours. */
  wwv: { text: string; issuedAt: number | null } | null;
  /** The SESC sunspot number for the latest day in the daily solar data, and that day. */
  sunspots: { value: number; day: string } | null;
}

/**
 * What NOAA's scales say each level does to HF radio, word for word from
 * https://www.swpc.noaa.gov/noaa-scales-explanation (read 21 November 2026). G1 has no
 * words about HF. S levels speak of the polar regions only.
 */
export const SCALE_HF_WORDS = {
  R: {
    1: "Weak or minor degradation of HF radio communication on sunlit side, occasional loss of radio contact.",
    2: "Limited blackout of HF radio communication on sunlit side, loss of radio contact for tens of minutes.",
    3: "Wide area blackout of HF radio communication, loss of radio contact for about an hour on sunlit side of Earth.",
    4: "HF radio communication blackout on most of the sunlit side of Earth for one to two hours. HF radio contact lost during this time.",
    5: "Complete HF (high frequency) radio blackout on the entire sunlit side of the Earth lasting for a number of hours. This results in no HF radio contact with mariners and en route aviators in this sector.",
  },
  G: {
    2: "HF radio propagation can fade at higher latitudes",
    3: "HF radio may be intermittent",
    4: "HF radio propagation sporadic",
    5: "HF (high frequency) radio propagation may be impossible in many areas for one to two days",
  },
  S: {
    1: "Minor impacts on HF radio in the polar regions",
    2: "Small effects on HF propagation through the polar regions",
    3: "Degraded HF radio propagation through the polar regions",
    4: "Blackout of HF radio communications through the polar regions",
    5: "Complete blackout of HF (high frequency) communications possible through the polar regions",
  },
} as const satisfies Record<string, Partial<Record<number, string>>>;

/**
 * The SWPC glossary's bands of geomagnetic activity by the a index
 * (https://www.swpc.noaa.gov/content/space-weather-glossary, read 21 November 2026):
 * "quiet 0 - 7, unsettled 8 - 15, active 16 - 29, minor storm 30 - 49, major storm 50 -
 * 99, severe storm 100 - 400".
 */
export function aIndexWords(a: number): string {
  if (a < 8) return "quiet";
  if (a < 16) return "unsettled";
  if (a < 30) return "active";
  if (a < 50) return "minor storm";
  if (a < 100) return "major storm";
  return "severe storm";
}

/**
 * Today's conditions against the planner's monthly median, in plain words. Only what
 * NOAA's own words support is said: a radio blackout (R1 or more) degrades or blocks HF
 * on the sunlit side; a geomagnetic storm of G2 or more fades HF at higher latitudes
 * and, as it strengthens, makes it intermittent and sporadic; a solar radiation storm
 * (S1 or more) affects HF through the polar regions; an a index of 16 or more is
 * "active" by NOAA's glossary. Whether the bands are better than predicted cannot be
 * said from these figures, and is not.
 */
export function hfConditionsWords(data: SpaceWeatherData): string[] {
  const lines: string[] = [];
  const r = Math.min(5, data.scales.r?.level ?? 0);
  const s = Math.min(5, data.scales.s?.level ?? 0);
  const g = Math.min(5, data.scales.g?.level ?? 0);
  if (r >= 1)
    lines.push(
      `A radio blackout is in force (R${r}): HF on the sunlit side of the Earth is likely worse than predicted today. NOAA: "${SCALE_HF_WORDS.R[r as 1 | 2 | 3 | 4 | 5]}"`,
    );
  if (g >= 2)
    lines.push(
      `A geomagnetic storm is in force (G${g}): HF is likely worse than predicted today, most of all on paths at high latitudes. NOAA: "${SCALE_HF_WORDS.G[g as 2 | 3 | 4 | 5]}".`,
    );
  else if (g === 1) lines.push("A minor geomagnetic storm is in force (G1). NOAA lists no effect of G1 on HF radio.");
  if (s >= 1)
    lines.push(
      `A solar radiation storm is in force (S${s}): paths through the polar regions are likely worse than predicted today. NOAA: "${SCALE_HF_WORDS.S[s as 1 | 2 | 3 | 4 | 5]}".`,
    );
  const a = data.kp?.a ?? null;
  if (g < 1 && a !== null && a >= 16)
    lines.push(
      `The a index is ${a}, "${aIndexWords(a)}" by NOAA's glossary: HF may be worse than predicted today, most of all at high latitudes.`,
    );
  if (lines.length === 0)
    lines.push(
      "No radio blackout, radiation storm or geomagnetic storm is in force, so nothing here says today should differ from the monthly prediction. A quiet day can still be better or worse than the median.",
    );
  return lines;
}
