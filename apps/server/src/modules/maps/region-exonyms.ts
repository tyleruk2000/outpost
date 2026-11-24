/**
 * English names for the parts of countries that Geofabrik names in their own language
 * ("Bayern", "Cataluña"), so that "Bavaria" finds Bayern in Add a place, before and after
 * Geofabrik's list of regions is read. Each is keyed by Geofabrik's own id for the part, as
 * in its download addresses (download.geofabrik.de/europe/germany/bayern-latest.osm.pbf).
 * Only names in common English use; a part whose English name is its Geofabrik name (or is
 * written beside it, as Poland's are) needs no entry. Ids and names checked against
 * Geofabrik's index (download.geofabrik.de/index-v1-nogeom.json) on 24 November 2026.
 */
export interface RegionExonym {
  /** Geofabrik's id for the part. */
  id: string;
  /** Its name in Geofabrik's list, shown before the list is read. */
  name: string;
  /** The country it is a part of. */
  country: string;
  /** Its names in English. */
  english: readonly string[];
}

export const REGION_EXONYMS: readonly RegionExonym[] = [
  // Germany's states.
  { id: "bayern", name: "Bayern", country: "DE", english: ["Bavaria"] },
  { id: "hessen", name: "Hessen", country: "DE", english: ["Hesse"] },
  { id: "niedersachsen", name: "Niedersachsen (mit Bremen)", country: "DE", english: ["Lower Saxony"] },
  { id: "nordrhein-westfalen", name: "Nordrhein-Westfalen", country: "DE", english: ["North Rhine-Westphalia", "North Rhine Westphalia"] },
  { id: "rheinland-pfalz", name: "Rheinland-Pfalz", country: "DE", english: ["Rhineland-Palatinate", "Rhineland Palatinate"] },
  { id: "sachsen", name: "Sachsen", country: "DE", english: ["Saxony"] },
  { id: "sachsen-anhalt", name: "Sachsen-Anhalt", country: "DE", english: ["Saxony-Anhalt", "Saxony Anhalt"] },
  { id: "thueringen", name: "Thüringen", country: "DE", english: ["Thuringia"] },
  { id: "mecklenburg-vorpommern", name: "Mecklenburg-Vorpommern", country: "DE", english: ["Mecklenburg-Western Pomerania"] },
  // France's regions, as Geofabrik still divides it.
  { id: "bretagne", name: "Bretagne", country: "FR", english: ["Brittany"] },
  { id: "bourgogne", name: "Bourgogne", country: "FR", english: ["Burgundy"] },
  { id: "corse", name: "Corse", country: "FR", english: ["Corsica"] },
  { id: "picardie", name: "Picardie", country: "FR", english: ["Picardy"] },
  { id: "basse-normandie", name: "Basse-Normandie", country: "FR", english: ["Lower Normandy", "Normandy"] },
  { id: "haute-normandie", name: "Haute-Normandie", country: "FR", english: ["Upper Normandy", "Normandy"] },
  { id: "provence-alpes-cote-d-azur", name: "Provence Alpes-Cote-d'Azur", country: "FR", english: ["Provence", "French Riviera"] },
  // Spain's communities.
  { id: "andalucia", name: "Andalucía", country: "ES", english: ["Andalusia"] },
  { id: "cataluna", name: "Cataluña", country: "ES", english: ["Catalonia"] },
  { id: "pais-vasco", name: "País Vasco", country: "ES", english: ["Basque Country"] },
  { id: "islas-baleares", name: "Islas Baleares", country: "ES", english: ["Balearic Islands", "Majorca", "Mallorca"] },
  { id: "castilla-y-leon", name: "Castilla y León", country: "ES", english: ["Castile and León", "Castile and Leon"] },
  { id: "castilla-la-mancha", name: "Castilla-La Mancha", country: "ES", english: ["Castile-La Mancha"] },
  { id: "navarra", name: "Navarra", country: "ES", english: ["Navarre"] },
  // The Netherlands' provinces.
  { id: "noord-holland", name: "Noord-Holland", country: "NL", english: ["North Holland"] },
  { id: "zuid-holland", name: "Zuid-Holland", country: "NL", english: ["South Holland"] },
  { id: "noord-brabant", name: "Noord-Brabant", country: "NL", english: ["North Brabant"] },
];

/** The parts whose English name begins with (or is) the folded text typed. */
export function exonymsMatching(typed: string, fold: (text: string) => string): Array<{ exonym: RegionExonym; english: string }> {
  if (typed.length < 3) return [];
  const out: Array<{ exonym: RegionExonym; english: string }> = [];
  for (const exonym of REGION_EXONYMS) {
    const english = exonym.english.find((name) => fold(name).startsWith(typed));
    if (english) out.push({ exonym, english });
  }
  return out;
}
