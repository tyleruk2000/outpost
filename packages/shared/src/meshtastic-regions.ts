/**
 * The LoRa region a Meshtastic radio is set to in each country, from Meshtastic's own
 * table, "LoRa Region by Country" (https://meshtastic.org/docs/configuration/region-by-country/,
 * docs version 2.8, read 22 November 2026). Where the table gives a country two regions,
 * the first is kept (EU_868 before EU_433, ANZ before NZ_865): the second is for radios
 * on another band, and the person can type it.
 *
 * It matters to Outpost for the MQTT root topic: a radio with none set publishes under
 * msh/ and its region (msh/US, msh/EU_868), per Meshtastic's MQTT page. A country the
 * table does not list has no first choice: the radio's own setting is the one to copy.
 */

/** ISO 3166 code to the region code, as the table gives it. */
export const MESHTASTIC_REGION_BY_COUNTRY: Readonly<Record<string, string>> = {
  AL: "EU_868",
  AR: "ANZ",
  AU: "ANZ",
  AT: "EU_868",
  BE: "EU_868",
  BA: "EU_868",
  BR: "ANZ",
  BG: "EU_868",
  CA: "US",
  CN: "CN",
  CL: "ANZ",
  CO: "ANZ",
  HR: "EU_868",
  CY: "EU_868",
  CZ: "EU_868",
  DK: "EU_868",
  EC: "ANZ",
  EE: "EU_868",
  FR: "EU_868",
  FI: "EU_868",
  DE: "EU_868",
  GR: "EU_868",
  HU: "EU_868",
  IN: "IN",
  ID: "SG_923",
  IE: "EU_868",
  IT: "EU_868",
  JP: "JP",
  KZ: "KZ_433",
  // The table says "Korea", with Korean regulations: the Republic of Korea.
  KR: "KR",
  LV: "EU_868",
  LT: "EU_868",
  LU: "EU_868",
  MY: "MY_919",
  MT: "EU_868",
  ME: "EU_868",
  NL: "EU_868",
  NZ: "ANZ",
  MK: "EU_868",
  NO: "EU_868",
  NP: "NP_865",
  PL: "EU_868",
  PT: "EU_868",
  PH: "PH_915",
  RO: "EU_868",
  RU: "RU",
  RS: "EU_868",
  SG: "SG_923",
  SK: "EU_868",
  SI: "EU_868",
  ZA: "EU_868",
  ES: "EU_868",
  SE: "EU_868",
  CH: "EU_868",
  TW: "TW",
  TH: "TH",
  TR: "EU_868",
  UA: "EU_868",
  GB: "EU_868",
  US: "US",
  VA: "EU_868",
};

export const MESHTASTIC_REGION_SOURCE = {
  title: "Meshtastic, LoRa Region by Country",
  url: "https://meshtastic.org/docs/configuration/region-by-country/",
  read: "22 November 2026",
} as const;

/** The region code for a country, or null where Meshtastic's table does not list it. */
export function meshtasticRegionFor(country: string | null | undefined): string | null {
  const code = country?.toUpperCase();
  if (!code) return null;
  return MESHTASTIC_REGION_BY_COUNTRY[code === "UK" ? "GB" : code] ?? null;
}

/** The root topic a radio with none set uses in that country ("msh/US"), or null where the region is not known. */
export function meshtasticRootFor(country: string | null | undefined): string | null {
  const region = meshtasticRegionFor(country);
  return region ? `msh/${region}` : null;
}
