/**
 * The search index and unified search.
 *
 * Owning modules (documents, notes, collections, maps) describe what they hold with
 * `upsert` and `remove`; they do not know how search works. Search does not know their
 * tables either: a result carries a title, passages and the in-app URL that opens it.
 *
 * Three layers share this entry point:
 *  - keyword: SQLite FTS5 with BM25 ranking, always available;
 *  - additional sources (semantic similarity, reference collections served by Kiwix)
 *    plug in through `addSource`;
 *  - hybrid: every source's ranked list fused with reciprocal rank fusion.
 */
import { REFERENCE_BESIDE_OWN } from "@outpost/shared";
import { and, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { chunks, searchEntities } from "../../db/schema.ts";
import { type AlsoIn, type CardSource, cardQuery, collapseSameTitles, firstCard, type SearchCard, waterCard } from "./cards.ts";
import { type ChunkOptions, chunkSections, type Section } from "./chunker.ts";
import { reciprocalRankFusion } from "./fusion.ts";
import { adjusted, adjustFor, type Intent, intentOf, plainIntent } from "./intent.ts";
import {
  countTerms,
  FEW,
  forgetPassageCount,
  markPassages,
  passageCount,
  type RankedItem,
  RELAXED_COVERAGE,
  rankKeyword,
  weighTerms,
} from "./keyword.ts";
import { createOwners } from "./owners.ts";
import {
  alternateQuery,
  expandQuery,
  groupExpression,
  type ParsedQuery,
  parseQuery,
  plainQuery,
  type Segment,
  STOP_WORDS,
  titleWords,
  toFtsQuery,
  toSegments,
} from "./query.ts";
import { holdsExcluded, reasonFor, type ScoringTerm, scoreFields, tokenize } from "./score.ts";
import { createSuggester, type Suggestion } from "./suggest.ts";

/** Bumped when chunking or indexing rules change in a way that needs a rebuild. */
export const INDEX_VERSION = 1;

export interface IndexEntity {
  kind: string;
  entityId: string;
  title: string;
  subtitle?: string | null;
  collection?: string | null;
  url: string;
  sourcePath?: string | null;
  tags?: string[];
  meta?: Record<string, unknown>;
  /**
   * For what one household keeps (its plans, its supplies): that household's id. Such an
   * item is found only while its household is the current one.
   */
  household?: string | null;
  sections: Section[];
}

export interface ResultPassage {
  chunkId: number | null;
  segments: Segment[];
  page: number | null;
  heading: string | null;
}

export interface SearchResult {
  kind: string;
  entityId: string;
  title: string;
  titleSegments: Segment[];
  subtitle: string | null;
  collection: string | null;
  /** In-app route that opens the source, at the matching page when there is one. */
  url: string;
  tags: string[];
  /** 0–1 on one scale for every source (score.ts): not relative to the best result. */
  score: number;
  /** Why it is here, in a few words ("All 3 words, side by side"). */
  why?: string;
  passages: ResultPassage[];
  /** Which layers found this result. */
  sources: string[];
  /** Results further down with the same title (a collection, its document, its catalogue entry), shown under this one. */
  alsoIn?: AlsoIn[];
}

export interface SearchParams {
  q: string;
  kinds?: string[];
  tag?: string;
  limit?: number;
  offset?: number;
  mode?: "keyword" | "semantic" | "hybrid";
  /**
   * "later" leaves reference collections out of the answer, for a caller that asks for
   * them separately (`searchReference`) so that nothing waits on them.
   */
  reference?: "include" | "later";
  /** Search only for what was typed: no other spellings or ways of saying it (synonyms.ts). */
  exact?: boolean;
  signal?: AbortSignal;
}

export interface SearchResponse {
  query: string;
  mode: "keyword" | "semantic" | "hybrid";
  /** True when too few results had every word, and results holding most of them were added after those that do. */
  relaxed: boolean;
  /** How many items hold every word that matters. */
  everyWord: number;
  /** Words typed that only shape the question ("how", "to"), left out of matching and ranking. */
  ignored: string[];
  /** Other spellings and ways of saying the words typed that were searched as well ("tire" for "tyre"). */
  alsoSearched: string[];
  /** A word typed is in no passage, or almost none, and a near word is common: the query with it in place. */
  didYouMean: Suggestion | null;
  total: number;
  results: SearchResult[];
  /** Places and repeaters whose names match, kept out of the results list. */
  places: SearchResult[];
  /** The query looks like one of their names, a callsign or a frequency: show them first. */
  placesFirst: boolean;
  /** The one place in Outpost that is plainly the answer (cards.ts), on the first page only. Null when none is. */
  card: SearchCard | null;
  /**
   * The current household's name, when there are several and the results hold what one
   * household keeps (its plans, its supplies): those are that household's only.
   */
  householdShown: string | null;
  facets: Record<string, number>;
  /** Sources that could not answer, with a reason a person can read. */
  warnings: Array<{ source: string; message: string }>;
  /**
   * Only when asked with `reference: "later"`: true when there are reference collections
   * to search for this, so asking `searchReference` is worth it.
   */
  referenceToCome?: boolean;
  tookMs: number;
}

/** One passage found for a question, with how it was found. See `searchPassages`. */
export interface PassageHit {
  chunkId: number;
  /** Place among the passages found by their words, best first from 1. Null when the words did not find it. */
  keywordRank: number | null;
  /** Place among the passages found by meaning. Null when meaning did not find it, or is not in use. */
  semanticRank: number | null;
  /** Cosine similarity to the question, when it was found by meaning. */
  similarity: number | null;
  /**
   * The share of the question's words this passage holds, each word counted by how rare
   * it is in the library, 0 to 1. Null when the passage was found by meaning alone.
   */
  coverage: number | null;
  /** 0–1, relative to the best passage of this search. */
  score: number;
}

export interface PassageSearchParams {
  q: string;
  kinds?: string[];
  mode?: "keyword" | "semantic" | "hybrid";
  /** Most passages to return. */
  limit?: number;
  /** Only passages of this one item. */
  within?: { kind: string; entityId: string };
  /** Most passages taken from any one item. No limit unless given, and none when `within` is. */
  perItem?: number;
  signal?: AbortSignal;
}

export interface PassageSearchResponse {
  mode: "keyword" | "semantic" | "hybrid";
  /** True when no passage held every word and the search fell back to passages holding enough of them. */
  relaxed: boolean;
  hits: PassageHit[];
}

/**
 * When too few passages or items hold every word of a question, one is kept only if it
 * holds at least this share of the words, each weighed by how rare it is in the library
 * (keyword.ts). A passage that shares one common word with the question ("code",
 * "water") is not about the question, and a model handed it will often answer from it
 * all the same.
 */
export { RELAXED_COVERAGE };

/**
 * A passage found by meaning alone is kept only when it is at least this similar to the
 * question. The model that comes with Outpost scores unrelated text at about 0.1 to 0.3
 * and a passage on the subject at 0.4 and more, with exceptions both ways; this cuts the
 * clearly unrelated and no more.
 */
export const SIMILARITY_FLOOR = 0.3;

/**
 * A passage found by meaning alone is also dropped when it is this much less similar to
 * the question than the nearest passage is: when one passage is clearly the one, the
 * also-rans are left out, and a small model reads less that is beside the point.
 */
export const SIMILARITY_WINDOW = 0.2;

export interface SearchSource {
  id: string;
  /**
   * "semantic" sources run in semantic and hybrid modes; "reference" ones in keyword and
   * hybrid. A "local" source is a module's own table of one kind of thing, too many to
   * index as passages (repeaters); it runs in keyword and hybrid modes whenever a search
   * is not narrowed to other kinds or to a tag.
   */
  layer: "semantic" | "reference" | "local";
  /** For a local source: the kind of thing it finds, which is also its line among the facets. */
  kind?: string;
  isAvailable(): boolean;
  weight(): number;
  search(params: { q: string; kinds?: string[]; limit: number; signal?: AbortSignal }): Promise<SearchResult[]>;
  /**
   * For a semantic source: the passages nearest the question, best first, each with its
   * similarity. Used where passages matter and not the items they belong to.
   */
  searchPassages?(params: {
    q: string;
    kinds?: string[];
    limit: number;
    within?: { kind: string; entityId: string };
    signal?: AbortSignal;
  }): Promise<Array<{ chunkId: number; similarity: number }>>;
  /**
   * For a source made of collections that answer at different times: the same search,
   * handing over each collection's results as soon as that collection has answered.
   */
  searchInParts?(params: ReferenceSearchParams): Promise<ReferenceOutcome>;
}

/** What one reference collection found. */
export interface ReferencePart {
  collectionId: string;
  title: string;
  /** Its best matches, best first. Empty when it has none. */
  results: SearchResult[];
  /**
   * False for a first look (its titles, which answer quickly) while its full text is still
   * being searched; a later part for the same collection takes its place. Absent or true
   * for a collection's last word.
   */
  done?: boolean;
}

export interface RankOptions {
  /**
   * Whether a title that is the answer counts as one (`TITLE_MATCH_BONUS`): true for a
   * collection about what was asked or a general encyclopaedia; false for one that is not,
   * where "Burn" is a dictionary's word or a book of quotations' heading, not the answer.
   */
  titleAnswers?: boolean;
}

export interface ReferenceSearchParams {
  q: string;
  /** The question as understood (query.ts): for choosing which collections to search, and for searching titles. */
  parsed?: ParsedQuery;
  /**
   * "routed", the default: the collections most likely to hold the answer first, and the
   * rest only when those find too little. "all": every collection.
   */
  scope?: "routed" | "all";
  /** Puts a collection's results on the one scale every result has, best first, leaving out those that fall short. */
  rank?(results: SearchResult[], options?: RankOptions): SearchResult[];
  /** Called when the rest of the collections are searched after all, because the first found too little. */
  onWiden?(collections: number): void;
  /**
   * The same question said another way ("tire pressure" for "tyre pressure"), asked of
   * each collection as well when given. Null or absent when there is none.
   */
  alternate?: string | null;
  /** Fires when whoever asked has gone: nothing more is wanted. */
  signal?: AbortSignal;
  /** How long to go on waiting for collections. Those that have not answered by then are reported as missing. */
  budgetMs: number;
  /** Called once, first, with the number of collections that will be searched, and of those left for later. */
  onStart?(collections: number, more?: number): void;
  /** Called once for each collection that answers, in the order they answer. */
  onPart(part: ReferencePart): void;
}

export interface ReferenceOutcome {
  /** How many collections there were to search. */
  collections: number;
  /** How many answered. */
  searched: number;
  /** The ones that did not, by name. */
  missing: Array<{ collectionId: string; title: string; reason: "slow" | "failed" }>;
  /** Why none could be searched at all, in words for a person; null when they could. */
  message: string | null;
  /** Collections left unsearched because the first found enough; "Search all reference collections" asks them. */
  more?: number;
}

/** How long a search waits for reference collections altogether. Tests shorten these; nothing else changes them. */
export const referenceBudgets = {
  /** A search that answers in one part holds everything back while it waits, so it waits less. */
  onePartMs: 10_000,
  /** A search of reference collections on their own, which sends each collection's results as they come. */
  inPartsMs: 30_000,
};

/**
 * What a reference article whose title is the answer ("Burn" for "treat a burn": every
 * word of the title is a word of the question, and it holds every word a title would)
 * gains on top of its score. kiwix-serve's title search finds these; its full text often
 * ranks them below long pages that mention the words many times.
 */
export const TITLE_MATCH_BONUS = 0.15;

/**
 * Among results that are nearly as good, a person's own come first: where reference
 * articles and the library's own items are one list, an article's score counts this much
 * of itself. A reference article has to be clearly better to come above a page the person
 * chose to keep. The reference collections' own list is not changed.
 */
export const OWN_FIRST = REFERENCE_BESIDE_OWN;

/** True when a title is the answer by its words alone (see `TITLE_MATCH_BONUS`). */
export function titleIsAnswer(title: string, terms: ScoringTerm[], nouns: string[]): boolean {
  const words = tokenize(title).filter((token) => !STOP_WORDS.has(token.raw));
  if (words.length === 0 || nouns.length === 0) return false;
  const query = new Set(terms.flatMap((term) => term.forms.flatMap((form) => form.stems)));
  const inTitle = new Set(words.map((token) => token.stem));
  // Each noun, or another way of saying it ("tire" for "tyre"), in the title.
  const held = (noun: string) => {
    const stems = tokenize(noun).map((token) => token.stem);
    if (stems.every((one) => inTitle.has(one))) return true;
    const term = terms.find((candidate) => candidate.forms[0]?.stems.join(" ") === stems.join(" "));
    return Boolean(term?.forms.some((form) => form.stems.every((one) => inTitle.has(one))));
  };
  return words.every((token) => query.has(token.stem)) && nouns.every(held);
}

/** Each collection ranks its own articles; take them in turn so one large collection does not crowd out the rest. */
export function inTurn(parts: ReferencePart[]): SearchResult[] {
  const results: SearchResult[] = [];
  const depth = Math.max(0, ...parts.map((part) => part.results.length));
  for (let rank = 0; rank < depth; rank += 1) {
    for (const part of parts) {
      const hit = part.results[rank];
      if (hit) results.push(hit);
    }
  }
  return results;
}

/** Names the collections missing from a search, as a sentence. Null when none is. */
export function missingMessage(missing: ReferenceOutcome["missing"]): string | null {
  if (missing.length === 0) return null;
  const names = (reason: "slow" | "failed") =>
    missing
      .filter((item) => item.reason === reason)
      .map((item) => `“${item.title}”`)
      .join(", ");
  const slow = names("slow");
  const failed = names("failed");
  return [
    slow ? `Not searched in time, so missing from these results: ${slow}.` : "",
    failed ? `Could not be searched, so missing from these results: ${failed}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Runs a search in parts to its end and gives the whole of it, in a settled order. */
export async function gatherParts(
  source: SearchSource,
  params: Omit<ReferenceSearchParams, "onPart" | "onStart">,
): Promise<{ results: SearchResult[]; outcome: ReferenceOutcome }> {
  const parts: ReferencePart[] = [];
  const outcome = await source.searchInParts!({
    ...params,
    onPart: (part) => {
      if (part.done === false) return;
      const at = parts.findIndex((other) => other.collectionId === part.collectionId);
      if (at === -1) parts.push(part);
      else parts[at] = part;
    },
  });
  // The order collections answered in is chance; their names are not.
  parts.sort((a, b) => a.title.localeCompare(b.title) || a.collectionId.localeCompare(b.collectionId));
  return { results: inTurn(parts), outcome };
}

export interface ChunkRecord {
  chunkId: number;
  kind: string;
  entityId: string;
  title: string;
  url: string;
  sourcePath: string | null;
  collection: string | null;
  ordinal: number;
  heading: string;
  text: string;
  page: number | null;
  charStart: number | null;
  charEnd: number | null;
  contentHash: string;
  indexVersion: number;
}

export interface SearchService {
  upsert(entity: IndexEntity): { chunks: number; changed: boolean };
  remove(kind: string, entityId: string): void;
  /**
   * Makes the index hold exactly `entities` of one kind: each that changed since it was last
   * given is written, and any other item of the kind is removed. For a module that indexes a
   * small table whole whenever it changes (emergency plans, supplies).
   */
  syncKind(kind: string, entities: IndexEntity[]): void;
  search(params: SearchParams): Promise<SearchResponse>;
  /**
   * The passages that best match a question, whichever items they belong to. `search`
   * ranks items and shows a few passages of each; this ranks the passages themselves,
   * which is what a language model is given. Words and meaning are fused passage by
   * passage, so a passage both found ranks above one only either found.
   */
  searchPassages(params: PassageSearchParams): Promise<PassageSearchResponse>;
  /**
   * Searches reference collections on their own, a collection at a time. This is the
   * second part of a search asked with `reference: "later"`.
   */
  searchReference(
    params: Omit<ReferenceSearchParams, "budgetMs" | "alternate"> & {
      exact?: boolean;
      /**
       * Called before anything is asked when a word typed is in no passage of the library and a near
       * word is ("purifiy": "purify"): the collections are asked for that word as well.
       */
      onInstead?(suggestion: Suggestion): void;
    },
  ): Promise<ReferenceOutcome>;
  addSource(source: SearchSource): void;
  /** Offers answer cards (cards.ts): a module's own place that is plainly the answer to some questions. */
  addCards(source: CardSource): void;
  getChunks(chunkIds: number[]): ChunkRecord[];
  stats(): { entities: Record<string, number>; chunks: number };
  /** Called after an entity's passages change, so vectors can follow. */
  onChunksChanged(listener: (entityRowId: number) => void): void;
  /**
   * Runs `work` so that whatever it deletes or replaces is erased rather than only
   * unlinked: freed database pages are overwritten with zeros, deleted passages are
   * taken out of the full-text index instead of being marked as gone, and afterwards the
   * write-ahead log, which still holds the old pages, is folded into the database and
   * emptied. For the save that replaces a page's text with an encrypted copy.
   *
   * It reaches what `work` itself removes. Text freed by earlier changes may still lie
   * in unused space until the database is compacted, and the disk underneath is not
   * touched at all.
   */
  scrubbing<T>(work: () => T): T;
}

declare module "../../core/context.ts" {
  interface Services {
    search: SearchService;
  }
}

const TAG_SEPARATOR = " , ";

/**
 * The one kind of result that is not on this device: an entry of the catalogue, which would have to be
 * downloaded first. However well it matches, it comes after everything that can be opened now, so that
 * with the internet down the top of the list is still of use. Each part keeps its own order.
 */
export const TO_DOWNLOAD = "catalog";

/** `results` with what is on this device first, each part in the order it had. */
export function onDeviceFirst<T extends { kind: string }>(results: T[]): T[] {
  return [...results.filter((result) => result.kind !== TO_DOWNLOAD), ...results.filter((result) => result.kind === TO_DOWNLOAD)];
}

/** Kinds of result that one household keeps: found only while it is the current one. */
export const PER_HOUSEHOLD: ReadonlySet<string> = new Set(["plan", "supply"]);

/** Places and repeaters shown in their strip beside the results. */
export const PLACES_SHOWN = 5;

/**
 * True when the query looks like the name of one of the places or repeaters found, or
 * like a callsign or a frequency: then their strip comes before the results.
 */
export function looksLikeAName(q: string, places: SearchResult[]): boolean {
  const typed = q.trim().toLowerCase();
  if (/^[a-z]{1,2}\d[a-z]{1,4}$/i.test(typed) || /^\d{2,4}([.,]\d+)?\s*(mhz|khz)?$/i.test(typed)) return places.length > 0;
  return (
    typed.length >= 3 && places.some((place) => place.title.toLowerCase() === typed || place.title.toLowerCase().startsWith(`${typed} `))
  );
}

/**
 * Similarity to the question (cosine, from the embedding model) as a score on the
 * shared scale. The built-in model scores unrelated text about 0.1 to 0.3 and text on
 * the subject 0.4 and more, so 0.2 maps to nothing and 0.7 to the most meaning alone
 * can earn, `MEANING_CEILING`.
 */
export const MEANING_CEILING = 0.6;
export function meaningScore(similarity: number): number {
  return MEANING_CEILING * Math.min(1, Math.max(0, (similarity - 0.2) / 0.5));
}

/**
 * For a question about first aid or medicine, a first aid or medical source that holds every
 * word, and whose passage is at least this similar to the question, comes before the results
 * that are not both: a forum post whose title is the question does not come before the first
 * aid manual's page on it. Both are needed. The source alone would lift any medical book that
 * happens to hold the words; the meaning confirms its passage is about what was asked.
 */
export const SAME_MEANING = 0.6;

/**
 * How much meaning lifts a result the words found: half its meaning score. At full weight,
 * the library's own items, which have vectors, rose above better reference articles, which
 * have none (fixture, with reference collections: nDCG@5 0.826 at full weight, 0.838 at half,
 * against 0.836 by words alone); among the library's own results half and full did the same.
 */
export const MEANING_LIFT = 0.5;

/** Which results hold every word that matters, and which are trusted sources for the question (intent.ts). */
export interface WordsHeld {
  everyWord: Set<string>;
  trusted: Set<string>;
}

export const resultKey = (result: { kind: string; entityId: string }) => `${result.kind}:${result.entityId}`;

/**
 * Words and meaning on one scale. A result found both ways scores 1 - (1 - words)(1 - meaning
 * × `MEANING_LIFT`): more than by words alone, never above 1. Found by meaning alone ("Similar in meaning"), it
 * scores its meaning, always less than every result holding every word, and is left out when
 * it is more than `SIMILARITY_WINDOW` behind the nearest. No floor of similarity is set: none
 * tells nonsense from a real question. In a library of 59,000 passages "zzqx flurble" comes
 * within 0.45 of one, while the note that answers "dog paws snow ice" ("Trim the hair between
 * the pads and rinse off grit and road salt") is 0.19 from it. So when the words find plenty, results by meaning alone wait
 * below them; when the words find little or nothing, these fill the list.
 */
export function blendMeaning(
  byWords: SearchResult[],
  byMeaning: SearchResult[],
  weights: { keywordWeight: number; semanticWeight: number },
  held: WordsHeld = { everyWord: new Set(), trusted: new Set() },
): SearchResult[] {
  const meaning = new Map(byMeaning.map((result) => [resultKey(result), result]));
  const confirmed = new Set<string>();
  const blended = byWords.map((result) => {
    const key = resultKey(result);
    const near = meaning.get(key);
    if (!near) return result;
    meaning.delete(key);
    const words = Math.min(1, result.score * weights.keywordWeight);
    const sense = Math.min(1, meaningScore(near.score) * weights.semanticWeight * MEANING_LIFT);
    const same = held.trusted.has(key) && held.everyWord.has(key) && near.score >= SAME_MEANING;
    if (same) confirmed.add(key);
    return {
      ...result,
      score: Math.round((1 - (1 - words) * (1 - sense)) * 1000) / 1000,
      sources: [...new Set([...result.sources, ...near.sources])],
      why: result.why ? `${result.why}, and ${same ? "means the same" : "by meaning"}` : "Similar in meaning",
    };
  });
  const lowestWithEveryWord = Math.min(...blended.filter((result) => held.everyWord.has(resultKey(result))).map((result) => result.score));
  const nearest = Math.max(0, ...byMeaning.map((result) => result.score));
  for (const near of meaning.values()) {
    if (near.score < nearest - SIMILARITY_WINDOW) continue;
    const score = Math.min(meaningScore(near.score) * weights.semanticWeight, MEANING_CEILING, lowestWithEveryWord - 0.001);
    blended.push({ ...near, score: Math.max(0, Math.round(score * 1000) / 1000), why: "Similar in meaning" });
  }
  const tier = (result: SearchResult) => (confirmed.has(resultKey(result)) ? 0 : 1);
  return blended.sort((a, b) => tier(a) - tier(b) || b.score - a.score);
}

/** What kind of question it is (intent.ts), from the words that matter, their other ways of being said, and the small words. */
export function intentFor(parsed: ParsedQuery): Intent {
  return intentOf({
    words: parsed.required.flatMap((term, index) => [term, ...(parsed.alternatives?.[index] ?? [])]),
    ignored: parsed.ignored ?? [],
  });
}

/** The reason for a result, and what the priors did to it: "All 3 words; favoured: first aid source". */
export function withNotes(why: string, notes: string[]): string {
  return [why, ...notes].filter(Boolean).join("; ");
}

/**
 * A place on the map whose name is exactly what was typed, when it is the only one and
 * the library itself has almost nothing holding the words: then the map is the answer.
 */
export function placeCard(q: string, places: SearchResult[], everyWord: number): SearchCard | null {
  const typed = q.trim().toLowerCase();
  if (typed.replace(/[^\p{L}]/gu, "").length < 4 || everyWord >= FEW) return null;
  const named = places.filter((place) => place.kind !== "repeater" && place.title.trim().toLowerCase() === typed);
  if (named.length !== 1) return null;
  const place = named[0]!;
  return { kind: "place", title: place.title, about: place.subtitle ? `On the map: ${place.subtitle}` : "On the map", url: place.url };
}

/** Appends the page to a document URL so the viewer opens where the match is. */
function withPage(url: string, page: number | null): string {
  if (page === null) return url;
  return `${url}${url.includes("?") ? "&" : "?"}page=${page}`;
}

export function createSearchService(ctx: AppContext): SearchService {
  const { db, sqlite } = ctx;
  const sources: SearchSource[] = [];
  const cardSources: CardSource[] = [waterCard];
  /** What `syncKind` was last given, by kind and item, so that an unchanged item is not written again. */
  const synced = new Map<string, Map<string, string>>();
  const chunkListeners: Array<(entityRowId: number) => void> = [];

  const chunkOptions = (): ChunkOptions => ({
    size: ctx.services.settings.get("indexing.chunkSize"),
    overlap: ctx.services.settings.get("indexing.chunkOverlap"),
  });

  const insertChunk = sqlite.prepare(
    `INSERT INTO chunks (entity_row_id, ordinal, title, tags, heading, text, page, char_start, char_end, content_hash, index_version)
     VALUES (@entityRowId, @ordinal, @title, @tags, @heading, @text, @page, @charStart, @charEnd, @contentHash, @indexVersion)`,
  );

  const owners = createOwners(sqlite);

  const upsert = sqlite.transaction((entity: IndexEntity) => {
    const now = Date.now();
    const tags = (entity.tags ?? []).join(TAG_SEPARATOR);
    const existing = db
      .select()
      .from(searchEntities)
      .where(and(eq(searchEntities.kind, entity.kind), eq(searchEntities.entityId, entity.entityId)))
      .get();

    const values = {
      kind: entity.kind,
      entityId: entity.entityId,
      title: entity.title,
      subtitle: entity.subtitle ?? null,
      collection: entity.collection ?? null,
      url: entity.url,
      sourcePath: entity.sourcePath ?? null,
      meta: { ...entity.meta, tags: entity.tags ?? [], ...(entity.household ? { household: entity.household } : {}) },
      updatedAt: now,
    };
    let rowId: number;
    if (existing) {
      rowId = existing.id;
      db.update(searchEntities).set(values).where(eq(searchEntities.id, rowId)).run();
    } else {
      rowId = Number(db.insert(searchEntities).values(values).run().lastInsertRowid);
    }
    owners.noteItem(rowId, { kind: entity.kind, household: entity.household ?? null });

    let passages = chunkSections(entity.sections, chunkOptions());
    if (passages.length === 0) {
      // Keep the entity findable by title and tags even when it has no body text.
      passages = [{ ordinal: 0, text: "", heading: "", page: null, charStart: 0, charEnd: 0, contentHash: "" }];
    }

    const current = existing
      ? db
          .select({
            ordinal: chunks.ordinal,
            contentHash: chunks.contentHash,
            indexVersion: chunks.indexVersion,
            heading: chunks.heading,
            page: chunks.page,
          })
          .from(chunks)
          .where(eq(chunks.entityRowId, rowId))
          .orderBy(chunks.ordinal)
          .all()
      : [];
    const sameContent =
      current.length === passages.length &&
      current.every((row, index) => {
        const passage = passages[index]!;
        return (
          row.contentHash === passage.contentHash &&
          row.indexVersion === INDEX_VERSION &&
          row.heading === passage.heading &&
          row.page === passage.page
        );
      });

    if (sameContent) {
      // Text is unchanged: refresh the denormalised columns and keep chunk ids, so any
      // vectors attached to them stay valid.
      db.update(chunks).set({ title: entity.title, tags }).where(eq(chunks.entityRowId, rowId)).run();
      return { chunks: passages.length, changed: false, rowId };
    }

    db.delete(chunks).where(eq(chunks.entityRowId, rowId)).run();
    for (const passage of passages) {
      const inserted = insertChunk.run({
        entityRowId: rowId,
        ordinal: passage.ordinal,
        title: entity.title,
        tags,
        heading: passage.heading,
        text: passage.text,
        page: passage.page,
        charStart: passage.charStart,
        charEnd: passage.charEnd,
        contentHash: passage.contentHash,
        indexVersion: INDEX_VERSION,
      });
      owners.notePassage(Number(inserted.lastInsertRowid), rowId);
    }
    return { chunks: passages.length, changed: true, rowId };
  });

  const suggester = createSuggester(sqlite);

  /**
   * The question as reference collections are asked it. A word typed that no passage of the
   * library holds, with a near word that some do ("purifiy" and "purify", as "Did you mean"
   * finds it), is asked for both ways: kiwix-serve knows nothing of typing slips, and a slip
   * finds nothing there either. The word as typed stays first and counts in full, so a
   * real word the library happens not to hold ("bowline") still finds its articles first.
   */
  function forReference(q: string, parsed: ParsedQuery): { parsed: ParsedQuery; instead: Suggestion | null } {
    if (parsed.required.length === 0) return { parsed, instead: null };
    const counts = countTerms(sqlite, parsed);
    if (!counts.some((count) => count === 0)) return { parsed, instead: null };
    const alternatives = parsed.required.map((_, index) => [...(parsed.alternatives?.[index] ?? [])]);
    let changed = false;
    parsed.required.forEach((term, index) => {
      if (counts[index] !== 0 || parsed.quoted?.[index] || parsed.joined?.[index] || term.includes(" ")) return;
      const word = suggester.nearest(term, 0);
      if (!word) return;
      alternatives[index] = [word, ...alternatives[index]!.filter((other) => other !== word)];
      changed = true;
    });
    if (!changed) return { parsed, instead: null };
    return { parsed: { ...parsed, alternatives }, instead: suggester.suggest(q, parsed, counts, false) };
  }

  /** What was typed, ready to search: the words that matter and, unless asked not to, other ways of saying them. */
  function understand(q: string, exact?: boolean): { parsed: ParsedQuery; also: string[] } {
    const parsed = parseQuery(q);
    return exact ? { parsed, also: [] } : expandQuery(parsed);
  }

  function keywordSearch(
    params: SearchParams,
    parsed: ParsedQuery,
    window: number,
  ): {
    results: SearchResult[];
    relaxed: boolean;
    everyWord: number;
    facets: Record<string, number>;
    total: number;
    terms: ScoringTerm[];
    didYouMean: Suggestion | null;
    held: WordsHeld;
  } {
    // Passages holding each word: for its weight, and to see whether a word is in the library at all.
    const counts = parsed.required.length > 1 ? countTerms(sqlite, parsed) : undefined;
    const ranking = rankKeyword(sqlite, parsed, {
      kinds: params.kinds,
      tag: params.tag,
      window,
      toDownload: TO_DOWNLOAD,
      counts,
      owners,
      household: ctx.services.households.currentId(),
    });
    const didYouMean =
      ranking.total < FEW && parsed.required.length > 0
        ? suggester.suggest(params.q, parsed, counts ?? countTerms(sqlite, parsed), ranking.everyWord === 0)
        : counts?.some((count) => count === 0)
          ? suggester.suggest(params.q, parsed, counts, false)
          : null;
    if (ranking.items.length === 0) {
      return {
        results: [],
        relaxed: false,
        everyWord: 0,
        facets: ranking.facets,
        total: 0,
        terms: ranking.terms,
        didYouMean,
        held: { everyWord: new Set(), trusted: new Set() },
      };
    }

    // Every candidate's title, collection and tags: what kind of source it is decides the mild priors (intent.ts).
    const ids = ranking.items.map((item) => item.entityRowId);
    const entities = new Map(
      (
        sqlite
          .prepare(
            `SELECT e.id AS id, e.kind AS kind, e.entity_id AS entityId, e.title AS title, e.subtitle AS subtitle,
                    e.collection AS collection, e.url AS url,
                    (SELECT c.tags FROM chunks c WHERE c.entity_row_id = e.id LIMIT 1) AS tags
             FROM search_entities e WHERE e.id IN (${ids.map(() => "?").join(",")})`,
          )
          .all(...ids) as Array<{
          id: number;
          kind: string;
          entityId: string;
          title: string;
          subtitle: string | null;
          collection: string | null;
          url: string;
          tags: string | null;
        }>
      ).map((row) => [row.id, row]),
    );
    const intent = intentFor(parsed);
    const adjustments = new Map(
      ranking.items.map((item) => {
        const entity = entities.get(item.entityRowId);
        const tags = entity?.tags ? entity.tags.split(TAG_SEPARATOR) : [];
        return [
          item.entityRowId,
          entity ? adjustFor(intent, { title: entity.title, collection: entity.collection, tags }) : { factor: 1, notes: [] },
        ];
      }),
    );
    const scoreOf = (item: RankedItem) => adjusted(item.parts.score, adjustments.get(item.entityRowId)?.factor ?? 1);
    // The priors reorder within each part of the list only: what can be opened now before what must be downloaded,
    // items with every word before those with most, the word as typed before words it begins.
    const part = (item: RankedItem) =>
      Number(item.kind === TO_DOWNLOAD) * 4 + Number(!item.everyWord) * 2 + Number(Boolean(item.prefixOnly));
    const ordered = plainIntent(intent)
      ? ranking.items
      : ranking.items
          .map((item, index) => ({ item, index }))
          .sort((a, b) => part(a.item) - part(b.item) || scoreOf(b.item) - scoreOf(a.item) || a.index - b.index)
          .map(({ item }) => item);
    const page = ordered.slice(0, window);
    // Snippets only for what is shown: every word that matters is marked, whichever of them a passage holds.
    // The words as typed for most; the few that hold the last word only as a beginning are marked with
    // every word, so that the beginning is matched among passages holding the rest, not across the library.
    const shownOf = (items: RankedItem[]) => items.flatMap((item) => item.passages.slice(0, 3).map((passage) => passage.chunkId));
    const begun = page.filter((item) => item.prefixOnly);
    const marked = markPassages(sqlite, toFtsQuery(parsed, "any", undefined, false)!, shownOf(page.filter((item) => !item.prefixOnly)));
    if (begun.length > 0) {
      for (const [chunkId, mark] of markPassages(sqlite, toFtsQuery(parsed, "all", undefined, true)!, shownOf(begun)))
        marked.set(chunkId, mark);
    }
    const held: WordsHeld = { everyWord: new Set(), trusted: new Set() };
    const results = page.flatMap((item): SearchResult[] => {
      const entity = entities.get(item.entityRowId);
      if (!entity) return [];
      const key = resultKey(entity);
      if (item.everyWord) held.everyWord.add(key);
      if (adjustments.get(item.entityRowId)?.trusted) held.trusted.add(key);
      const best = item.passages[0]!;
      const shown = item.passages.slice(0, 3).flatMap((passage) => {
        const snippet = marked.get(passage.chunkId)?.snippet ?? "";
        return snippet.trim()
          ? [{ chunkId: passage.chunkId, segments: toSegments(snippet), page: passage.page, heading: passage.heading || null }]
          : [];
      });
      const titleMarked = marked.get(best.chunkId)?.titleMarked;
      return [
        {
          kind: entity.kind,
          entityId: entity.entityId,
          title: entity.title,
          titleSegments: titleMarked ? toSegments(titleMarked) : [{ text: entity.title, hit: false }],
          subtitle: entity.subtitle,
          collection: entity.collection,
          url: withPage(entity.url, best.page),
          tags: entity.tags ? entity.tags.split(TAG_SEPARATOR) : [],
          score: scoreOf(item),
          why: withNotes(reasonFor(item.parts), adjustments.get(item.entityRowId)?.notes ?? []),
          passages: shown,
          sources: ["keyword"],
        },
      ];
    });
    return {
      results,
      relaxed: ranking.relaxed,
      everyWord: ranking.everyWord,
      facets: ranking.facets,
      total: ranking.total,
      terms: ranking.terms,
      didYouMean,
      held,
    };
  }

  /**
   * Results another engine found (kiwix-serve, a module's table), scored again on the
   * shared scale from what they show. One that shows a word that was excluded is dropped,
   * and so is one showing less than `RELAXED_COVERAGE` of what the query is about: the
   * same rule as for Outpost's own items that lack a word.
   */
  function rescore(
    results: SearchResult[],
    terms: ScoringTerm[],
    excluded: string[],
    nouns?: string[],
    intent?: Intent,
    /** Filled with the results that hold every word. */
    everyWord?: Set<string>,
  ): SearchResult[] {
    /** The mild priors of intent.ts: a reference article's kind of source is its collection. */
    const prior = (result: SearchResult, text: string): SearchResult => {
      if (!intent || plainIntent(intent)) return result;
      const { factor, notes } = adjustFor(intent, {
        title: result.title,
        collection: result.collection,
        tags: result.tags,
        text,
        article: result.kind === "reference",
      });
      return { ...result, score: adjusted(result.score, factor), why: withNotes(result.why ?? "", notes) };
    };
    return results
      .flatMap((result) => {
        const fields = {
          title: result.title,
          heading: result.subtitle,
          tags: result.tags.join(" "),
          text: result.passages.map((passage) => passage.segments.map((segment) => segment.text).join("")).join(" … "),
        };
        if (holdsExcluded(excluded, fields)) return [];
        const parts = scoreFields(terms, fields);
        if (parts.found === 0 || parts.coverage < RELAXED_COVERAGE) return [];
        if (parts.found === parts.of) everyWord?.add(resultKey(result));
        if (nouns && titleIsAnswer(result.title, terms, nouns)) {
          // The words it lacks only say what to do ("treat"): scored on the words a title would hold, it holds them all.
          const held = new Set(nouns.map((noun) => noun.toLowerCase()));
          const titled = terms.filter((term) => term.term.split(" ").every((word) => held.has(word.toLowerCase())));
          const asTitle = titled.length > 0 && titled.length < terms.length ? scoreFields(titled, fields).score : 0;
          const score = Math.min(1, Math.round(Math.max(parts.score + TITLE_MATCH_BONUS, asTitle) * 1000) / 1000);
          // "All 3 words in the title" says more, when it is so.
          const why = parts.inTitle === parts.of ? reasonFor(parts) : "The title is what was asked";
          return [prior({ ...result, score, why }, fields.text)];
        }
        return [prior({ ...result, score: parts.score, why: reasonFor(parts) }, fields.text)];
      })
      .sort((a, b) => b.score - a.score);
  }

  /** The passages whose words match, best first, with the share of the question's words each holds. */
  function keywordPassages(
    params: PassageSearchParams,
    pool: number,
    /** With this many passages holding every word, no others are looked for. */
    enough: number,
  ): { rows: Array<{ chunkId: number; entityRowId: number; contentHash: string; coverage: number }>; relaxed: boolean } {
    const { parsed } = understand(params.q);
    const all = toFtsQuery(parsed, "all");
    if (!all) return { rows: [], relaxed: false };
    const kinds = params.kinds?.length ? params.kinds : undefined;
    const filters = [
      kinds ? `AND e.kind IN (${kinds.map(() => "?").join(",")})` : "",
      params.within ? "AND e.kind = ? AND e.entity_id = ?" : "",
    ].join(" ");
    const bound = [...(kinds ?? []), ...(params.within ? [params.within.kind, params.within.entityId] : [])];
    const statement = sqlite.prepare(
      `SELECT c.id AS chunkId, c.entity_row_id AS entityRowId, c.content_hash AS contentHash
       FROM chunks_fts
       JOIN chunks c ON c.id = chunks_fts.rowid
       JOIN search_entities e ON e.id = c.entity_row_id
       WHERE chunks_fts MATCH ? AND c.text <> '' ${filters}
       ORDER BY bm25(chunks_fts, 8.0, 3.0, 1.0, 4.0)
       LIMIT ?`,
    );
    type Row = { chunkId: number; entityRowId: number; contentHash: string };
    const strict = (statement.all(all, ...bound, pool) as Row[]).map((row) => ({ ...row, coverage: 1 }));
    if (strict.length >= enough || parsed.required.length < 2) return { rows: strict, relaxed: false };

    // Too few passages hold every word. Passages holding any of them are candidates, and each is
    // weighed: which of the words does it hold, and how much do those words say?
    const taken = new Set(strict.map((row) => row.chunkId));
    const candidates = (statement.all(toFtsQuery(parsed, "any")!, ...bound, pool) as Row[]).filter((row) => !taken.has(row.chunkId));
    if (candidates.length === 0) return { rows: strict, relaxed: false };
    const total = passageCount(sqlite);
    const ids = candidates.map((row) => row.chunkId);
    const held = new Map<number, number>(ids.map((id) => [id, 0]));
    let whole = 0;
    parsed.required.forEach((_, index) => {
      const single = groupExpression(parsed, index, parsed.prefixLast && index === parsed.required.length - 1);
      const containing = (sqlite.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH ?").get(single) as { n: number }).n;
      // The index's own measure of how much a word says: a word in few passages says a lot. A word the
      // library does not hold at all counts as one found in a single passage: as much as a word can say,
      // though no passage can earn it. (Counted by the formula alone it would outweigh everything in a
      // library of a few pages, and a question with one unknown word in it would find nothing.)
      const weight = Math.max(0.05, Math.log((total - Math.max(containing, 1) + 0.5) / (Math.max(containing, 1) + 0.5)));
      whole += weight;
      if (containing === 0) return;
      const with_ = sqlite
        .prepare(`SELECT rowid AS id FROM chunks_fts WHERE chunks_fts MATCH ? AND rowid IN (${ids.map(() => "?").join(",")})`)
        .all(single, ...ids) as Array<{ id: number }>;
      for (const { id } of with_) held.set(id, (held.get(id) ?? 0) + weight);
    });
    const partial = candidates
      .map((row) => ({ ...row, coverage: whole > 0 ? (held.get(row.chunkId) ?? 0) / whole : 0 }))
      .filter((row) => row.coverage >= RELAXED_COVERAGE);
    // Those that hold every word first, in the index's order; then the others, in theirs.
    return { rows: [...strict, ...partial], relaxed: strict.length === 0 && partial.length > 0 };
  }

  async function searchPassages(params: PassageSearchParams): Promise<PassageSearchResponse> {
    const limit = Math.min(Math.max(params.limit ?? 8, 1), 100);
    const q = params.q.trim();
    const semantic = sources.find((source) => source.layer === "semantic" && source.searchPassages && source.isAvailable());
    let mode = params.mode ?? (semantic ? "hybrid" : "keyword");
    if (mode !== "keyword" && !semantic) mode = "keyword";
    if (!q) return { mode, relaxed: false, hits: [] };
    // More than is wanted is fetched from each side: fusion, the limit on passages from one item and
    // the removal of repeated text all take some away.
    const pool = Math.max(limit * 4, 24);

    // Passages holding every word are topped up, to `limit`, with ones that hold most of them.
    const keyword = mode === "semantic" ? { rows: [], relaxed: false } : keywordPassages({ ...params, q }, pool, limit);
    const byWords = new Set(keyword.rows.map((row) => row.chunkId));
    const strict = keyword.rows.filter((row) => row.coverage === 1);
    const partial = keyword.rows.filter((row) => row.coverage < 1);
    const nearest =
      mode === "keyword" || !semantic
        ? []
        : await semantic.searchPassages!({ q, kinds: params.kinds, limit: pool, within: params.within, signal: params.signal });
    const closest = nearest[0]?.similarity ?? 0;
    // A passage found by meaning alone must be on the subject, and not far behind the nearest one.
    const near = nearest.filter(
      (hit) => byWords.has(hit.chunkId) || (hit.similarity >= SIMILARITY_FLOOR && hit.similarity >= closest - SIMILARITY_WINDOW),
    );

    const coverage = new Map(keyword.rows.map((row) => [row.chunkId, row.coverage]));
    const similarity = new Map(near.map((hit) => [hit.chunkId, hit.similarity]));
    // Fused passage by passage: those holding every word, and those near in meaning. A passage holding
    // only some of the words is weak evidence, so it does not count as found by words here; it stays in
    // only if meaning found it too, and such passages are otherwise used when there is nothing better.
    const useMeaning = mode !== "keyword" && Boolean(semantic);
    let fused = reciprocalRankFusion(
      [
        {
          weight: ctx.services.settings.get("search.hybrid.keywordWeight"),
          items: (useMeaning ? strict : keyword.rows).map((row) => row.chunkId),
        },
        { weight: useMeaning ? semantic!.weight() : 0, items: near.map((hit) => hit.chunkId) },
      ],
      (chunkId) => String(chunkId),
      ctx.services.settings.get("search.hybrid.rrfK"),
    );
    if (useMeaning && fused.length === 0 && partial.length > 0) {
      fused = reciprocalRankFusion(
        [
          { weight: 1, items: partial.map((row) => row.chunkId) },
          { weight: 0, items: [] },
        ],
        String,
      );
    }

    // Which item each passage belongs to, and the fingerprint of its text.
    const owner = new Map<number, { entityRowId: number; contentHash: string }>();
    const ids = fused.map((entry) => entry.item);
    if (ids.length > 0) {
      const rows = sqlite
        .prepare(
          `SELECT id AS chunkId, entity_row_id AS entityRowId, content_hash AS contentHash FROM chunks WHERE id IN (${ids.map(() => "?").join(",")})`,
        )
        .all(...ids) as Array<{ chunkId: number; entityRowId: number; contentHash: string }>;
      for (const row of rows) owner.set(row.chunkId, row);
    }

    const perItem = params.within || !params.perItem ? Number.POSITIVE_INFINITY : Math.max(1, params.perItem);
    const fromItem = new Map<number, number>();
    const seenText = new Set<string>();
    const top = fused[0]?.score ?? 1;
    const hits: PassageHit[] = [];
    for (const entry of fused) {
      if (hits.length >= limit) break;
      const row = owner.get(entry.item);
      if (!row) continue;
      // The same text twice (a file kept in two places) tells a model nothing the first copy did not.
      if (row.contentHash && seenText.has(row.contentHash)) continue;
      const taken = fromItem.get(row.entityRowId) ?? 0;
      if (taken >= perItem) continue;
      fromItem.set(row.entityRowId, taken + 1);
      if (row.contentHash) seenText.add(row.contentHash);
      const [keywordRank, semanticRank] = entry.ranks as [number | null, number | null];
      hits.push({
        chunkId: entry.item,
        keywordRank,
        semanticRank,
        similarity: similarity.get(entry.item) ?? null,
        coverage: coverage.get(entry.item) ?? null,
        score: top > 0 ? entry.score / top : 0,
      });
    }
    return { mode, relaxed: keyword.relaxed, hits };
  }

  const service: SearchService = {
    searchPassages,

    upsert(entity) {
      const { rowId, ...outcome } = upsert(entity);
      if (outcome.changed) forgetPassageCount(sqlite);
      if (outcome.changed) for (const listener of chunkListeners) listener(rowId);
      return outcome;
    },

    syncKind(kind, entities) {
      const given = synced.get(kind) ?? new Map<string, string>();
      synced.set(kind, given);
      const seen = new Set<string>();
      for (const entity of entities) {
        seen.add(entity.entityId);
        const fingerprint = JSON.stringify(entity);
        if (given.get(entity.entityId) === fingerprint) continue;
        service.upsert(entity);
        given.set(entity.entityId, fingerprint);
      }
      const held = sqlite.prepare("SELECT entity_id FROM search_entities WHERE kind = ?").pluck().all(kind) as string[];
      for (const entityId of held) {
        if (seen.has(entityId)) continue;
        service.remove(kind, entityId);
        given.delete(entityId);
      }
    },

    remove(kind, entityId) {
      synced.get(kind)?.delete(entityId);
      db.delete(searchEntities)
        .where(and(eq(searchEntities.kind, kind), eq(searchEntities.entityId, entityId)))
        .run();
      forgetPassageCount(sqlite);
    },

    scrubbing(work) {
      const secureDeleteWas = Number(sqlite.pragma("secure_delete", { simple: true }));
      // Written out, not bound: the index only takes this setting as a whole number, and a bound number arrives as a real.
      // Both indexes: the keyword index, and the words as written that "Did you mean" chooses from.
      const indexSecureDelete = (on: boolean) => {
        for (const index of ["chunks_fts", "chunks_words"]) {
          sqlite.exec(`INSERT INTO ${index}(${index}, rank) VALUES('secure-delete', ${on ? 1 : 0})`);
        }
      };
      sqlite.pragma("secure_delete = ON");
      indexSecureDelete(true);
      try {
        return work();
      } finally {
        // Both are put back: erasing costs more than unlinking, and ordinary edits do not need it.
        indexSecureDelete(false);
        sqlite.pragma(`secure_delete = ${secureDeleteWas === 1 ? "ON" : "OFF"}`);
        try {
          sqlite.pragma("wal_checkpoint(TRUNCATE)");
        } catch (error) {
          // Something else is reading. The log is folded in at the next ordinary checkpoint instead.
          ctx.log.warn({ err: error }, "could not empty the write-ahead log after a scrubbing save");
        }
      }
    },

    async search(params) {
      const started = performance.now();
      const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
      const offset = Math.max(params.offset ?? 0, 0);
      const window = limit + offset;
      const q = params.q.trim();
      const warnings: SearchResponse["warnings"] = [];

      const semanticReady = sources.some((source) => source.layer === "semantic" && source.isAvailable());
      let mode = params.mode ?? (semanticReady ? "hybrid" : "keyword");
      if (mode !== "keyword" && !semanticReady) {
        warnings.push({
          source: "semantic",
          message: "Search by meaning is not set up, so this is a keyword search. It needs no internet once set up.",
        });
        mode = "keyword";
      }

      // Whatever kinds were asked for: the caller shows reference results beside any of them.
      const later =
        params.reference === "later"
          ? {
              referenceToCome:
                Boolean(q) &&
                mode !== "semantic" &&
                ctx.services.settings.get("search.includeReference") &&
                sources.some((source) => source.layer === "reference" && source.isAvailable()),
            }
          : {};

      if (!q) {
        return {
          query: q,
          mode,
          relaxed: false,
          everyWord: 0,
          ignored: [],
          alsoSearched: [],
          didYouMean: null,
          total: 0,
          results: [],
          places: [],
          placesFirst: false,
          card: null,
          householdShown: null,
          facets: {},
          warnings,
          ...later,
          tookMs: 0,
        };
      }

      const { parsed, also } = understand(q, params.exact);
      const intent = intentFor(parsed);
      const active = sources.filter((source) => {
        if (!source.isAvailable()) return false;
        if (source.layer === "semantic") return mode !== "keyword";
        // A module answering from its own table is one of Outpost's own results: it does not wait with the archives.
        if (source.layer === "local") {
          return mode !== "semantic" && !params.tag && (!params.kinds?.length || params.kinds.includes(source.kind ?? source.id));
        }
        if (params.reference === "later") return false;
        if (params.kinds?.length && !params.kinds.includes("reference")) return false;
        return mode !== "semantic" && ctx.services.settings.get("search.includeReference");
      });
      // Meaning and the modules' own tables are asked first: the query's vector is worked out in another
      // thread while the words are searched here, instead of after.
      const early = new Map(
        active
          .filter((source) => !source.searchInParts)
          .map((source) => {
            // A table of names is asked for the words that matter: "how to" would match every name with "to" in it.
            const words =
              source.layer === "local"
                ? q
                    .split(/\s+/)
                    .filter((word) => !STOP_WORDS.has(word.toLowerCase()))
                    .join(" ") || q
                : q;
            const asked = source.search({ q: words, kinds: params.kinds, limit: window, signal: params.signal });
            asked.catch(() => undefined);
            return [source, asked] as const;
          }),
      );
      const keyword =
        mode === "semantic"
          ? {
              results: [],
              relaxed: false,
              everyWord: 0,
              facets: {} as Record<string, number>,
              total: 0,
              terms: weighTerms(sqlite, parsed),
              didYouMean: null,
              held: { everyWord: new Set<string>(), trusted: new Set<string>() },
            }
          : keywordSearch(params, parsed, window);
      const lexical: SearchResult[] = [...keyword.results];
      const places: SearchResult[] = [];
      let meaning: SearchResult[] = [];

      const answers = await Promise.allSettled(
        active.map(async (source) => {
          const asked = early.get(source);
          if (asked) return asked;
          // Every collection's best matches, however far down the list this page is, so
          // that the count and the pages do not change from one page to the next.
          const nouns = titleWords(parsed);
          const forCollections = forReference(q, parsed).parsed;
          const { results, outcome } = await gatherParts(source, {
            q: plainQuery(forCollections) || q,
            alternate: alternateQuery(forCollections),
            parsed: forCollections,
            rank: (found, options) =>
              rescore(
                found,
                keyword.terms,
                parsed.excluded,
                options?.titleAnswers === false ? undefined : nouns,
                intent,
                keyword.held.everyWord,
              ),
            signal: params.signal,
            budgetMs: referenceBudgets.onePartMs,
          });
          const problem = outcome.message ?? missingMessage(outcome.missing);
          if (problem) warnings.push({ source: source.id, message: problem });
          return results;
        }),
      );
      answers.forEach((answer, index) => {
        const source = active[index]!;
        if (answer.status === "fulfilled") {
          if (source.layer === "semantic") {
            meaning = answer.value;
            return;
          }
          if (source.layer === "reference") {
            // Already on the one scale (`rank` above), best first; beside a person's own, a little behind (`OWN_FIRST`).
            const found = answer.value.map((result) => ({ ...result, score: Math.round(result.score * OWN_FIRST * 1000) / 1000 }));
            lexical.push(...found);
            if (found.length > 0) keyword.facets.reference = (keyword.facets.reference ?? 0) + found.length;
            return;
          }
          // Places and repeaters: scored from their names, never lower than half their own table's order says.
          const found = answer.value
            .map((result) => {
              const parts = scoreFields(keyword.terms, { title: result.title, heading: result.subtitle, text: "" });
              return { ...result, score: Math.max(parts.score, 0.5 * result.score), why: reasonFor(parts) || "Matches the name" };
            })
            .sort((a, b) => b.score - a.score);
          if (found.length > 0) keyword.facets[source.kind ?? source.id] = found.length;
          // Asked for by kind, they are the results; otherwise they wait in their own strip, out of the main list.
          if (params.kinds?.includes(source.kind ?? source.id)) lexical.push(...found);
          else places.push(...found);
        } else {
          // A message written for a person is passed on; anything else (a raw library error) is put in words.
          warnings.push({
            source: source.id,
            message:
              answer.reason instanceof AppError
                ? answer.reason.message
                : "One part of the search did not answer, so its results are left out. The rest are shown.",
          });
        }
      });

      // One scale: every result found by words was scored by the same rule, so they are simply put in order.
      let results = [...lexical].sort((a, b) => b.score - a.score);
      if (mode !== "keyword" && meaning.length > 0) {
        results = blendMeaning(
          results,
          meaning,
          {
            keywordWeight: ctx.services.settings.get("search.hybrid.keywordWeight"),
            semanticWeight: ctx.services.settings.get("search.hybrid.semanticWeight"),
          },
          keyword.held,
        );
      }
      results = onDeviceFirst(results);
      // One title once: a collection, the document made from it and its catalogue entry are one row.
      const { results: once, collapsed } = collapseSameTitles(results);
      results = once;
      places.sort((a, b) => b.score - a.score);
      const firstPage = offset === 0 && !params.kinds?.length && !params.tag;
      const card = firstPage ? (firstCard(cardSources, cardQuery(q, parsed)) ?? placeCard(q, places, keyword.everyWord)) : null;
      const households = ctx.services.households;
      const householdShown =
        results.some((result) => PER_HOUSEHOLD.has(result.kind)) && households.list().length > 1 ? households.current().name : null;

      return {
        query: q,
        mode,
        relaxed: keyword.relaxed,
        everyWord: keyword.everyWord,
        ignored: parsed.ignored ?? [],
        alsoSearched: also,
        // Offered only while the words find little: a suggestion beside a full page would be noise. Results by
        // meaning alone do not count: for a word mistyped they are guesses, and the word put right finds the page.
        didYouMean:
          results.filter((result) => result.sources.some((source) => source !== "semantic")).length < FEW ? keyword.didYouMean : null,
        // Results found another way can only add to what the words found.
        total: Math.max(results.length, keyword.total - collapsed),
        results: results.slice(offset, offset + limit),
        places: places.slice(0, PLACES_SHOWN),
        placesFirst: looksLikeAName(q, places),
        card,
        householdShown,
        facets: keyword.facets,
        warnings,
        ...later,
        tookMs: Math.round(performance.now() - started),
      };
    },

    async searchReference(params) {
      const q = params.q.trim();
      const source = sources.find((candidate) => candidate.layer === "reference" && candidate.searchInParts && candidate.isAvailable());
      if (!q || !source || !ctx.services.settings.get("search.includeReference")) {
        params.onStart?.(0);
        return { collections: 0, searched: 0, missing: [], message: null };
      }
      // kiwix-serve is asked for the words that matter (and once more for them said another way), and what it
      // finds is put on the same scale as everything else.
      const { parsed, instead } = forReference(q, understand(q, params.exact).parsed);
      if (instead) params.onInstead?.(instead);
      const terms = weighTerms(sqlite, parsed);
      const nouns = titleWords(parsed);
      const intent = intentFor(parsed);
      const { onInstead: _onInstead, ...rest } = params;
      return source.searchInParts!({
        ...rest,
        q: plainQuery(parsed) || q,
        alternate: alternateQuery(parsed),
        parsed,
        rank: (results, options) => rescore(results, terms, parsed.excluded, options?.titleAnswers === false ? undefined : nouns, intent),
        budgetMs: referenceBudgets.inPartsMs,
      });
    },

    addSource(source) {
      sources.push(source);
    },

    addCards(source) {
      cardSources.push(source);
    },

    getChunks(chunkIds) {
      if (chunkIds.length === 0) return [];
      const rows = sqlite
        .prepare(
          `SELECT c.id AS chunkId, e.kind AS kind, e.entity_id AS entityId, e.title AS title, e.url AS url,
                  e.source_path AS sourcePath, e.collection AS collection, c.ordinal AS ordinal, c.heading AS heading,
                  c.text AS text, c.page AS page, c.char_start AS charStart, c.char_end AS charEnd,
                  c.content_hash AS contentHash, c.index_version AS indexVersion
           FROM chunks c JOIN search_entities e ON e.id = c.entity_row_id
           WHERE c.id IN (${chunkIds.map(() => "?").join(",")})`,
        )
        .all(...chunkIds) as ChunkRecord[];
      const order = new Map(chunkIds.map((id, index) => [id, index]));
      return rows.sort((a, b) => (order.get(a.chunkId) ?? 0) - (order.get(b.chunkId) ?? 0));
    },

    stats() {
      const entities: Record<string, number> = {};
      for (const row of db
        .select({ kind: searchEntities.kind, n: sql<number>`count(*)` })
        .from(searchEntities)
        .groupBy(searchEntities.kind)
        .all()) {
        entities[row.kind] = row.n;
      }
      const total = db.select({ n: sql<number>`count(*)` }).from(chunks).get()?.n ?? 0;
      return { entities, chunks: total };
    },

    onChunksChanged(listener) {
      chunkListeners.push(listener);
    },
  };

  return service;
}
