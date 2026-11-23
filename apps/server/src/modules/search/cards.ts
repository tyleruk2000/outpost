/**
 * Answer cards and repeated titles.
 *
 * **Answer cards.** For a few questions there is one place in Outpost that is plainly
 * the answer: "purify water" is what Tools: Water is for, "power cut" is what the
 * household's power cut plan is for, and the exact name of a place is that place on the
 * map. A card for it is shown above the results. Only one, only where the question
 * leaves no doubt, and never instead of the results. Modules offer cards of their own
 * with `SearchService.addCards` (emergency plans offer the plan); the rules here are the
 * ones search can judge alone.
 *
 * **Repeated titles.** An installed collection, the document made from one of its files
 * and its catalogue entry can share one title, and so can several "Quick reference card"
 * documents. The list keeps the first, best placed, and names the others under it
 * ("Also in …"), each still a link.
 */
import type { ParsedQuery } from "./query.ts";
import { stem } from "./stem.ts";

export interface SearchCard {
  /** "tool": a screen of Outpost; "plan": one of the household's emergency plans; "place": a place on the map. */
  kind: "tool" | "plan" | "place";
  title: string;
  /** One line on what it holds. */
  about: string;
  url: string;
}

export interface CardQuery {
  q: string;
  parsed: ParsedQuery;
  /** The question's words and their other ways of being said, stemmed. */
  stems: Set<string>;
  /** The words joined into one ("power cut"), as typed, with their other ways of being said. */
  phrases: string[];
}

export interface CardSource {
  id: string;
  /** Lower comes first; only the first card offered is shown. */
  order: number;
  card(query: CardQuery): SearchCard | null;
}

const stems = (text: string) => new Set(text.split(" ").map((word) => stem(word)));
const TREAT = stems(
  "purify purifying purification purified treat treating treatment disinfect disinfecting boil boiling safe drinkable sterilise sterilize chlorine bleach tablets",
);

/** A question about making water safe to drink, and little else: the water tools answer it. */
export const waterCard: CardSource = {
  id: "water",
  order: 20,
  card(query) {
    const words = query.parsed.required.length;
    if (words === 0 || words > 4 || query.parsed.excluded.length > 0) return null;
    if (!query.stems.has(stem("water")) || ![...query.stems].some((word) => TREAT.has(word))) return null;
    return {
      kind: "tool",
      title: "Tools: Water",
      about: "Making water safe to drink, from official guidance: boiling, bleach and filters, and how much to store.",
      url: "/tools/water",
    };
  },
};

/** The question's stems and joined phrases, for the cards. */
export function cardQuery(q: string, parsed: ParsedQuery): CardQuery {
  const all = parsed.required.flatMap((term, index) => [term, ...(parsed.alternatives?.[index] ?? [])]);
  return {
    q,
    parsed,
    stems: new Set(
      all
        .flatMap((term) => term.toLowerCase().split(/[^\p{L}\p{N}]+/u))
        .filter(Boolean)
        .map((word) => stem(word)),
    ),
    phrases: all.filter((term) => term.includes(" ")).map((term) => term.toLowerCase()),
  };
}

/** The first card offered, in order, or null. */
export function firstCard(sources: CardSource[], query: CardQuery): SearchCard | null {
  for (const source of [...sources].sort((a, b) => a.order - b.order)) {
    const card = source.card(query);
    if (card) return card;
  }
  return null;
}

export interface AlsoIn {
  kind: string;
  entityId: string;
  title: string;
  collection: string | null;
  subtitle: string | null;
  url: string;
}

/** A title as compared for repeats: case, accents, punctuation and spacing do not count. */
export function sameTitleKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The list with each title once: a later result whose title is the same as an earlier
 * one's is taken out and named under it (`alsoIn`). Reference articles are left as they
 * are: two collections' articles of one name are usually two different articles.
 */
export function collapseSameTitles<
  T extends {
    kind: string;
    entityId: string;
    title: string;
    collection: string | null;
    subtitle: string | null;
    url: string;
    alsoIn?: AlsoIn[];
  },
>(results: T[]): { results: T[]; collapsed: number } {
  const first = new Map<string, T>();
  const kept: T[] = [];
  let collapsed = 0;
  for (const result of results) {
    const key = result.kind === "reference" ? "" : sameTitleKey(result.title);
    const earlier = key ? first.get(key) : undefined;
    if (earlier) {
      earlier.alsoIn = [
        ...(earlier.alsoIn ?? []),
        {
          kind: result.kind,
          entityId: result.entityId,
          title: result.title,
          collection: result.collection,
          subtitle: result.subtitle,
          url: result.url,
        },
      ];
      collapsed += 1;
      continue;
    }
    const own = { ...result };
    if (key) first.set(key, own);
    kept.push(own);
  }
  return { results: kept, collapsed };
}
