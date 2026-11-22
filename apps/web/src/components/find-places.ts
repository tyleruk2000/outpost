/**
 * Finding a place to go by the words a person types: the quick search's "Go to" list and the
 * search page's. A place is a screen of the navigation (nav.ts) or a section of Settings, and
 * is found by its name, the name of the screen it is under, and the everyday words given for it.
 *
 * Every place, here and in the guides (features/help/guide-places.ts), reads the same way: where it opens, then
 * what it is ("Radio: Repeaters", "Settings: Backup", "Help: Storage", "Help: Storage › Automatic backups").
 */
import { type ChildScreen, everyScreen, knowledgeNav, mapSections, type NavItem, settingsSections, upkeepNav } from "./nav";

export interface Place extends ChildScreen {
  key?: string;
  parent?: Pick<NavItem, "to" | "label">;
  /** A section of a screen rather than a screen: found by its own words, not by its screen's name alone. */
  section?: boolean;
}

const settings = upkeepNav.find((item) => item.to === "/settings")!;
const maps = knowledgeNav.find((item) => item.to === "/maps")!;

/**
 * Every screen, each followed by the screens under it, then the tabs of Maps found by their own
 * words ("Maps: Layers"), then each section of Settings ("Settings: Backup").
 */
export const everyPlace: Place[] = [
  ...everyScreen,
  ...mapSections.map((section) => ({
    to: `/maps?tab=${section.id}`,
    label: section.label,
    icon: maps.icon,
    keywords: section.keywords,
    parent: maps,
    section: true,
  })),
  ...settingsSections.map((section) => ({
    to: `/settings#${section.id}`,
    label: section.label,
    icon: settings.icon,
    keywords: section.keywords,
    parent: settings,
    section: true,
  })),
];

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The beginnings a typed word is matched by: the word itself, and for a plural or a word ending in
 * "y", its stem, so that "battery" finds "batteries" and "plans" finds "plan".
 */
function stems(word: string): string[] {
  const all = [word];
  if (word.length >= 5 && word.endsWith("ies")) all.push(word.slice(0, -3));
  else if (word.length >= 4 && word.endsWith("s")) all.push(word.slice(0, -1));
  if (word.length >= 4 && word.endsWith("y")) all.push(word.slice(0, -1));
  return all;
}

/** Small words of a question that say nothing of where to go: "how do I make water safe". */
const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "make",
  "my",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "where",
  "with",
]);

/** The words typed that count: all of them, less the small words of a question when anything else is left. */
function typedWords(typed: string): string[] {
  const all = wordsOf(typed);
  const meaningful = all.filter((word) => !SMALL_WORDS.has(word));
  return meaningful.length > 0 ? meaningful : all;
}

/** True when every word typed begins some word of the label. Nothing typed matches everything. */
export function matchesWords(label: string, typed: string): boolean {
  const words = wordsOf(label);
  return typedWords(typed).every((part) => stems(part).some((stem) => words.some((word) => word.startsWith(stem))));
}

/** True when at least one word typed begins some word of the label. */
function matchesSome(label: string, typed: string): boolean {
  const words = wordsOf(label);
  return typedWords(typed).some((part) => stems(part).some((stem) => words.some((word) => word.startsWith(stem))));
}

/** The full name of a place, as the quick search shows it: "Radio: Repeaters". */
export function placeName(place: Pick<Place, "label" | "parent">): string {
  return place.parent ? `${place.parent.label}: ${place.label}` : place.label;
}

/**
 * The places that match what was typed, best first: those whose name alone has every word, then
 * those whose everyday words hold what was typed as it was typed, then those that need their
 * everyday words in any other way, each in the order of the navigation.
 */
export function findPlaces(typed: string, places: Place[] = everyPlace): Place[] {
  const byName: Place[] = [];
  const byPhrase: Place[] = [];
  const byWords: Place[] = [];
  const phrase = typedWords(typed).join(" ");
  for (const place of places) {
    // "settings" alone is the Settings screen, not each of its fifteen sections as well.
    if (place.section && !matchesSome(`${place.label} ${place.keywords ?? ""}`, typed)) continue;
    const name = `${place.parent ? `${place.parent.label} ` : ""}${place.label}`;
    if (matchesWords(name, typed)) byName.push(place);
    else if (place.keywords && matchesWords(`${name} ${place.keywords}`, typed)) {
      // Its everyday words have just what was typed, whole ("shop", "drinking water"), before
      // one that only has words beginning with it ("shopping list").
      if (phrase && ` ${wordsOf(place.keywords).join(" ")} `.includes(` ${phrase} `)) byPhrase.push(place);
      else byWords.push(place);
    }
  }
  return [...byName, ...byPhrase, ...byWords];
}
