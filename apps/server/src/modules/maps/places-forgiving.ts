/**
 * What the place search does when the words typed are not quite a name: a kind of place
 * said with the name ("Waterloo station", "Lake Windermere"), a kind alone ("pharmacy",
 * which is a question for the map's Nearest list, not a street called Pharmacy Road), or a
 * slip of one letter ("Keswik"). Pure, so it can be checked by hand.
 */
import type { NearestKind } from "@outpost/shared";

/** Kind words a person puts before or after a name, and the kinds of place (as the search labels them) they mean. */
const KIND_WORDS: ReadonlyArray<{ words: readonly string[]; kinds: RegExp; plural: string }> = [
  {
    words: ["station", "stations", "railway", "train"],
    kinds: /^(railway station|railway stop|metro station|bus station|coach station|bus and coach station)$/,
    plural: "stations",
  },
  { words: ["hospital", "hospitals"], kinds: /^hospital$/, plural: "hospitals" },
  { words: ["airport", "airports", "airfield"], kinds: /^(airport|airfield)$/, plural: "airports" },
  { words: ["castle", "castles"], kinds: /^castle$/, plural: "castles" },
  {
    words: ["hill", "hills", "mountain", "mount", "mt", "fell", "peak"],
    kinds: /^(hill|hills|mountain|mountains|peak|peaks|hill or mountain|range of hills)$/,
    plural: "hills",
  },
  { words: ["lake", "loch", "lough", "reservoir", "llyn"], kinds: /^(lake|lakes|reservoir|river or lake)$/, plural: "lakes" },
  { words: ["river"], kinds: /^(river|rivers|river or lake)$/, plural: "rivers" },
  { words: ["school", "college", "university", "uni"], kinds: /^(school|college|university|college or university)$/, plural: "schools" },
  { words: ["park"], kinds: /^(park|nature reserve)$/, plural: "parks" },
  { words: ["beach"], kinds: /^beach$/, plural: "beaches" },
  { words: ["island", "isle"], kinds: /^(island|islands)$/, plural: "islands" },
  { words: ["harbour", "port", "docks"], kinds: /^(harbour|port|marina)$/, plural: "harbours" },
  { words: ["ferry"], kinds: /^(ferry|ferry terminal|car ferry terminal)$/, plural: "ferry terminals" },
  { words: ["lighthouse"], kinds: /^lighthouse$/, plural: "lighthouses" },
  { words: ["museum"], kinds: /^museum$/, plural: "museums" },
  { words: ["forest", "wood", "woods"], kinds: /^(forest|wood or forest|forest reserve)$/, plural: "woods" },
  { words: ["waterfall", "falls", "force"], kinds: /^waterfall$/, plural: "waterfalls" },
  { words: ["valley", "dale", "glen"], kinds: /^valley$/, plural: "valleys" },
  { words: ["bridge"], kinds: /^bridge$/, plural: "bridges" },
];

export interface KindWord {
  /** The words left once the kind word is taken off. */
  rest: string[];
  /** Whether a place's kind (its label, lower case) is the kind meant. */
  matches: (kindLabel: string) => boolean;
  /** "stations": for the notice. */
  plural: string;
}

/** A kind word at the start or end of the words typed, with the name left once it is taken off; null if there is none. */
export function kindWordOf(tokens: readonly string[]): KindWord | null {
  if (tokens.length < 2) return null;
  for (const [at, rest] of [
    [tokens.length - 1, tokens.slice(0, -1)],
    [0, tokens.slice(1)],
  ] as const) {
    const word = tokens[at]!;
    const entry = KIND_WORDS.find((each) => each.words.includes(word));
    if (entry) return { rest: [...rest], matches: (label) => entry.kinds.test(label.toLowerCase()), plural: entry.plural };
  }
  return null;
}

/** Words that ask for the nearest of a kind, rather than for a place of that name. */
const NEAREST_PHRASES: ReadonlyArray<{ kind: NearestKind; phrases: readonly string[] }> = [
  {
    kind: "hospital",
    phrases: ["hospital", "hospitals", "a&e", "a & e", "a and e", "accident and emergency", "emergency department", "emergency room", "er"],
  },
  { kind: "pharmacy", phrases: ["pharmacy", "pharmacies", "chemist", "chemists", "drugstore", "drug store", "apotheke", "pharmacie"] },
  { kind: "shelter", phrases: ["shelter", "shelters", "emergency shelter", "rest centre", "rest center", "evacuation centre"] },
  { kind: "water", phrases: ["water", "drinking water", "water point", "water tap", "tap water", "fresh water", "spring water"] },
  {
    kind: "fuel",
    phrases: ["fuel", "petrol", "diesel", "petrol station", "fuel station", "filling station", "gas station", "garage", "petrol stations"],
  },
];

/** The kind of place a question asks the nearest of ("nearest pharmacy", "chemist near me", "A&E"), or null. */
export function nearestKindOf(query: string): NearestKind | null {
  const words = query
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(where is |wheres |find |the )?(the )?(my )?(nearest |closest |local )?(an? )?/, "")
    .replace(/ (near me|near here|nearby|near home|close by|around here)$/, "")
    .trim();
  if (!words) return null;
  return NEAREST_PHRASES.find((entry) => entry.phrases.includes(words))?.kind ?? null;
}

/** The number of single-letter edits between two words (a swap of two letters is one), stopping early past `limit`. */
export function editDistance(a: string, b: string, limit = 2): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, index) => index)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1]![j]! + 1, row[j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2]![j - 2]! + 1);
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    rows.push(row);
  }
  return rows[a.length]![b.length]!;
}

/** How many slips a word of this length may have and still be taken for another: one up to seven letters, two after. */
export const slipsAllowed = (word: string) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);
