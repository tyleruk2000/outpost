/**
 * The second part of a search: what reference collections hold.
 *
 * Outpost's own documents and pages are found in milliseconds. Articles inside
 * reference collections are found by kiwix-serve, an archive at a time, and on a slow
 * drive or a network share that takes seconds. So a search asks for the two apart: its
 * own results come at once, and this hook collects each collection's articles as that
 * collection answers.
 *
 * The server searches the collections likeliest to hold the answer first and says how
 * many it left for later (`more`); `all` asks for every one. Every article carries a
 * score on the one scale, so the articles are kept as one list in score order, whichever
 * collection they came from. A collection may answer twice: first with its titles, which
 * come quickly, then with its full text, which replaces them.
 *
 * Nothing is asked until the words have stood still for a moment (`REFERENCE_SETTLE_MS`
 * after the last keystroke), so that a phone does not start a search of every collection
 * for each letter typed. Typing something else closes the connection, and the server stops
 * asking collections it has not asked yet. `oneList` puts the articles among a person's own
 * results; `useSteadyOrder` keeps the list still under a person's pointer or finger.
 */
import {
  REFERENCE_BESIDE_OWN,
  type ReferenceSearchEvent,
  type ReferenceSearchMissing,
  type SearchResult,
  type SearchSuggestion,
} from "@outpost/shared";
import { type FocusEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { api } from "./api";

export interface ReferenceSearch {
  /** "idle": nothing was asked. "searching": collections are still answering. "done": all have, or ran out of time. */
  status: "idle" | "searching" | "done";
  /** How many collections are being searched. 0 until the server has said, and when there are none. */
  collections: number;
  /** How many have answered so far. */
  answered: number;
  /** Every article so far, as one list, best first. */
  results: SearchResult[];
  /** Collections not searched, because those likeliest to hold the answer found enough. Known when the search is done. */
  more: number;
  /** Collections whose articles are missing: too slow, or not searchable. Known when the search is done. */
  missing: ReferenceSearchMissing[];
  /** Why reference collections could not be searched at all; null when they could. */
  problem: string | null;
  /**
   * A word typed is in no passage of the library and a near word is: the collections were asked
   * for the query with it as well ("purify water" for "purifiy water"). Null when not.
   */
  instead: SearchSuggestion | null;
}

const NOTHING: ReferenceSearch = {
  status: "idle",
  collections: 0,
  answered: 0,
  results: [],
  more: 0,
  missing: [],
  problem: null,
  instead: null,
};

const LOST = "Reference collections could not be searched just now, so their articles are missing from these results.";

/** What has come so far, by collection, in the order they came. */
interface Held {
  search: ReferenceSearch;
  parts: Map<string, SearchResult[]>;
}

/** One list, best first; articles that score the same keep the order they came in. */
function ranked(parts: Map<string, SearchResult[]>): SearchResult[] {
  const all = [...parts.values()].flat();
  return all
    .map((result, index) => ({ result, index }))
    .sort((a, b) => b.result.score - a.result.score || a.index - b.index)
    .map(({ result }) => result);
}

function after(held: Held, event: ReferenceSearchEvent): Held {
  const { search } = held;
  if (event.type === "start") {
    return { ...held, search: { ...search, collections: event.collections, more: event.more ?? 0, instead: event.instead ?? null } };
  }
  if (event.type === "widen") {
    const more = Math.max(0, search.more - event.collections);
    return { ...held, search: { ...search, collections: search.collections + event.collections, more } };
  }
  if (event.type === "collection") {
    const parts = new Map(held.parts);
    parts.delete(event.collectionId);
    if (event.results.length > 0) parts.set(event.collectionId, event.results);
    const answered = event.done === false ? search.answered : search.answered + 1;
    return { parts, search: { ...search, answered, results: ranked(parts) } };
  }
  return { ...held, search: { ...search, status: "done", more: event.more ?? 0, missing: event.missing, problem: event.message } };
}

/** Searches that finished whole, for a short while: Back to a search shows what it showed when it was left. */
const finished = new Map<string, { held: Held; at: number }>();
const KEPT_MS = 5 * 60_000;
const KEPT_AT_MOST = 8;

function keep(wanted: string, held: Held): void {
  finished.delete(wanted);
  finished.set(wanted, { held, at: Date.now() });
  while (finished.size > KEPT_AT_MOST) finished.delete(finished.keys().next().value!);
}

function recall(wanted: string): Held | undefined {
  const kept = finished.get(wanted);
  if (!kept) return undefined;
  if (Date.now() - kept.at > KEPT_MS) {
    finished.delete(wanted);
    return undefined;
  }
  return kept.held;
}

/** For tests: every search is asked afresh. */
export function forgetReferenceSearches(): void {
  finished.clear();
}

/**
 * How long the words must stand still, from the last keystroke, before reference
 * collections are asked. Searching them takes seconds of kiwix-serve's time on a small
 * computer, and a search begun for "car vatt" is wasted once "car battery" is typed.
 */
export const REFERENCE_SETTLE_MS = 350;

/**
 * Searches reference collections for `q` while `enabled`, once `q` has stayed the same
 * for `settleMs` (callers that already wait after a keystroke pass what is left of
 * `REFERENCE_SETTLE_MS`). A newer `q` cancels the one before, asked or not. `exact` asks
 * for only what was typed, without other spellings or ways of saying it; `all` asks
 * every collection, not only those likeliest to hold the answer.
 */
export function useReferenceSearch(
  q: string,
  enabled: boolean,
  exact = false,
  all = false,
  settleMs = REFERENCE_SETTLE_MS,
): ReferenceSearch {
  // The words and how to search them, as one key: any of them changing is a new search.
  const wanted = enabled && q.trim() ? `${exact ? "1" : "0"}${all ? "1" : "0"}${q.trim()}` : "";
  const [state, setState] = useState<{ q: string; held: Held }>(() => {
    const kept = wanted ? recall(wanted) : undefined;
    return kept ? { q: wanted, held: kept } : { q: "", held: { search: NOTHING, parts: new Map() } };
  });

  useEffect(() => {
    if (!wanted) {
      setState({ q: "", held: { search: NOTHING, parts: new Map() } });
      return;
    }
    // Back to a search that has just finished: the same articles at once, so the list is as it was left and the
    // screen returns to the result that was opened (articles arriving again moved the list under it).
    const kept = recall(wanted);
    if (kept) {
      setState((current) => (current.q === wanted && current.held === kept ? current : { q: wanted, held: kept }));
      return;
    }
    const controller = new AbortController();
    setState({ q: wanted, held: { search: { ...NOTHING, status: "searching" }, parts: new Map() } });
    const apply = (change: (held: Held) => Held) =>
      setState((current) => {
        if (controller.signal.aborted || current.q !== wanted) return current;
        const held = change(current.held);
        if (held.search.status === "done" && !held.search.problem) keep(wanted, held);
        return { q: wanted, held };
      });
    const finish = (problem: string | null) => (held: Held) =>
      held.search.status === "done" && !problem ? held : { ...held, search: { ...held.search, status: "done" as const, problem } };
    const ask = () => {
      api
        .lines<ReferenceSearchEvent>(
          "/api/search/reference",
          { q: wanted.slice(2), exact: wanted[0] === "1" ? "1" : undefined, scope: wanted[1] === "1" ? "all" : undefined },
          (event) => apply((held) => after(held, event)),
          controller.signal,
        )
        .then(
          // An answer that stops without its last line was cut short.
          () => apply((held) => (held.search.status === "done" ? held : finish(LOST)(held))),
          () => apply(finish(LOST)),
        );
    };
    // Until the words settle nothing is asked, so a search typed over before then costs nothing.
    const timer = settleMs > 0 ? window.setTimeout(ask, settleMs) : undefined;
    if (settleMs <= 0) ask();
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [wanted, settleMs]);

  // Between a new search being asked and the effect starting it, what is held belongs to the last one.
  return state.q === wanted ? state.held.search : wanted ? { ...NOTHING, status: "searching" } : NOTHING;
}

const keyOf = (result: SearchResult) => `${result.kind}:${result.entityId}`;

/** How many reference articles "Everything" puts among a person's own results: the best of every collection. */
export const REFERENCE_IN_LIST = 10;

/**
 * A person's own results and reference articles as one list in score order, on the one
 * scale both are scored on. An article counts `REFERENCE_BESIDE_OWN` of its score here, as
 * on the server, so that between two nearly as good the page the person kept comes first.
 * The person's own keep the order the server gave them; the articles (best first) go in
 * among them where their scores fall, before the first of the person's own that scores
 * less. At most `most` articles; with `above`, only those scoring more than it (the last
 * result of a page that more pages follow), so that a page holds only what ranks on it.
 */
export function oneList(
  own: SearchResult[],
  reference: SearchResult[],
  { most = REFERENCE_IN_LIST, above }: { most?: number; above?: number } = {},
): SearchResult[] {
  const articles = reference
    .slice(0, most)
    .map((result) => ({ ...result, score: Math.round(result.score * REFERENCE_BESIDE_OWN * 1000) / 1000 }))
    .filter((result) => above === undefined || result.score > above);
  const list: SearchResult[] = [];
  let next = 0;
  for (const item of own) {
    while (next < articles.length && articles[next]!.score > item.score) list.push(articles[next++]!);
    list.push(item);
  }
  return [...list, ...articles.slice(next)];
}

/** How long a list stays still after a finger leaves it: a flicked page goes on scrolling after the finger lifts. */
export const TOUCH_LINGER_MS = 1500;

/**
 * Shows `items` in their order, except while the pointer is over the list or focus is in
 * it: then what is shown stays where it is, and what comes meanwhile waits (`waiting`
 * says how many) until the pointer or focus leaves, when the list takes its new order.
 * Nothing moves under a pointer about to press it. A finger lets go `TOUCH_LINGER_MS`
 * after it lifts, and later while the page goes on scrolling, so that a phone's list does
 * not move under the eyes mid-flick. `key` changing (a new search) lets go.
 */
export function useSteadyOrder<T extends SearchResult>(
  items: T[],
  key: string,
): {
  shown: T[];
  waiting: number;
  hold: {
    onPointerEnter: () => void;
    onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
    onFocus: () => void;
    onBlur: (event: FocusEvent<HTMLElement>) => void;
  };
} {
  const [pointer, setPointer] = useState(false);
  const [focus, setFocus] = useState(false);
  const frozen = useRef<{ key: string; order: string[] } | null>(null);
  // Set while a finger has left the list and the list is still held for a moment (`TOUCH_LINGER_MS`).
  const linger = useRef<number | undefined>(undefined);
  const letGoLater = () => {
    window.clearTimeout(linger.current);
    linger.current = window.setTimeout(() => {
      linger.current = undefined;
      setPointer(false);
    }, TOUCH_LINGER_MS);
  };
  useEffect(() => () => window.clearTimeout(linger.current), []);
  // While it lingers, the page still moving (a flick goes on after the finger lifts) holds it longer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: letGoLater only touches a ref and a state setter
  useEffect(() => {
    if (!pointer) return;
    const moved = () => {
      if (linger.current !== undefined) letGoLater();
    };
    window.addEventListener("scroll", moved, { passive: true });
    return () => window.removeEventListener("scroll", moved);
  }, [pointer]);
  const holding = pointer || focus;
  if (!holding || frozen.current?.key !== key) frozen.current = holding ? { key, order: items.map(keyOf) } : null;
  let shown = items;
  if (frozen.current) {
    // The same articles in the same places; one that has gone (replaced by its collection's full answer) drops out.
    const byKey = new Map(items.map((item) => [keyOf(item), item]));
    shown = frozen.current.order.flatMap((one) => byKey.get(one) ?? []);
  }
  return {
    shown,
    waiting: items.length - shown.length,
    hold: {
      onPointerEnter: () => {
        window.clearTimeout(linger.current);
        linger.current = undefined;
        setPointer(true);
      },
      onPointerLeave: (event) => {
        // A mouse that leaves lets go at once; a finger lifted, a moment later.
        if (!event.pointerType || event.pointerType === "mouse") setPointer(false);
        else letGoLater();
      },
      onFocus: () => setFocus(true),
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocus(false);
      },
    },
  };
}

/** "Still searching reference collections… 12 of 29 searched." */
export function referenceProgress(search: ReferenceSearch): string {
  return search.collections > 1
    ? `Still searching reference collections… ${search.answered} of ${search.collections} searched.`
    : "Still searching reference collections…";
}

/** What is missing from the reference results, as sentences. Empty when nothing is. */
export function referenceTrouble(search: ReferenceSearch): string[] {
  if (search.problem) return [search.problem];
  const names = (reason: ReferenceSearchMissing["reason"]) => {
    const titles = search.missing.filter((item) => item.reason === reason).map((item) => item.title);
    if (titles.length <= 1) return titles.join("");
    return `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}`;
  };
  const count = (reason: ReferenceSearchMissing["reason"]) => search.missing.filter((item) => item.reason === reason).length;
  const sentences: string[] = [];
  if (count("slow") > 0) {
    sentences.push(
      `${names("slow")} ${count("slow") === 1 ? "was" : "were"} not searched in time, so ${count("slow") === 1 ? "its" : "their"} articles are missing from these results. Search again to give ${count("slow") === 1 ? "it" : "them"} longer.`,
    );
  }
  if (count("failed") > 0) {
    sentences.push(
      `${names("failed")} could not be searched, so ${count("failed") === 1 ? "its" : "their"} articles are missing from these results.`,
    );
  }
  return sentences;
}
