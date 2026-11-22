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

/** MeteoAlarm's country feeds (feeds.meteoalarm.org, read 21 November 2026), by ISO 3166 code. */
export const METEOALARM_COUNTRIES: Record<string, { slug: string; name: string }> = {
  AD: { slug: "andorra", name: "Andorra" },
  AT: { slug: "austria", name: "Austria" },
  BE: { slug: "belgium", name: "Belgium" },
  BA: { slug: "bosnia-herzegovina", name: "Bosnia and Herzegovina" },
  BG: { slug: "bulgaria", name: "Bulgaria" },
  HR: { slug: "croatia", name: "Croatia" },
  CY: { slug: "cyprus", name: "Cyprus" },
  CZ: { slug: "czechia", name: "Czechia" },
  DK: { slug: "denmark", name: "Denmark" },
  EE: { slug: "estonia", name: "Estonia" },
  FI: { slug: "finland", name: "Finland" },
  FR: { slug: "france", name: "France" },
  DE: { slug: "germany", name: "Germany" },
  GR: { slug: "greece", name: "Greece" },
  HU: { slug: "hungary", name: "Hungary" },
  IS: { slug: "iceland", name: "Iceland" },
  IE: { slug: "ireland", name: "Ireland" },
  IL: { slug: "israel", name: "Israel" },
  IT: { slug: "italy", name: "Italy" },
  LV: { slug: "latvia", name: "Latvia" },
  LT: { slug: "lithuania", name: "Lithuania" },
  LU: { slug: "luxembourg", name: "Luxembourg" },
  MT: { slug: "malta", name: "Malta" },
  MD: { slug: "moldova", name: "Moldova" },
  ME: { slug: "montenegro", name: "Montenegro" },
  NL: { slug: "netherlands", name: "the Netherlands" },
  NO: { slug: "norway", name: "Norway" },
  PL: { slug: "poland", name: "Poland" },
  PT: { slug: "portugal", name: "Portugal" },
  MK: { slug: "republic-of-north-macedonia", name: "North Macedonia" },
  RO: { slug: "romania", name: "Romania" },
  RS: { slug: "serbia", name: "Serbia" },
  SK: { slug: "slovakia", name: "Slovakia" },
  SI: { slug: "slovenia", name: "Slovenia" },
  ES: { slug: "spain", name: "Spain" },
  SE: { slug: "sweden", name: "Sweden" },
  CH: { slug: "switzerland", name: "Switzerland" },
  UA: { slug: "ukraine", name: "Ukraine" },
  GB: { slug: "united-kingdom", name: "the United Kingdom" },
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
}

export interface MeteoalarmData {
  /** ISO code and name of the country asked for. */
  country: string;
  countryName: string;
  updatedAt: number | null;
  items: MeteoalarmItem[];
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
  /** The saved place with the home icon, or null when none has it. */
  home: { name: string; lat: number; lon: number } | null;
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
