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
 * Typing something else closes the connection, and the server stops asking collections
 * it has not asked yet. `useSteadyOrder` keeps the list still under a person's pointer.
 */
import type { ReferenceSearchEvent, ReferenceSearchMissing, SearchResult, SearchSuggestion } from "@outpost/shared";
import { type FocusEvent, useEffect, useRef, useState } from "react";
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
  if (event.type === "widen") return { ...held, search: { ...search, collections: search.collections + event.collections, more: 0 } };
  if (event.type === "collection") {
    const parts = new Map(held.parts);
    parts.delete(event.collectionId);
    if (event.results.length > 0) parts.set(event.collectionId, event.results);
    const answered = event.done === false ? search.answered : search.answered + 1;
    return { parts, search: { ...search, answered, results: ranked(parts) } };
  }
  return { ...held, search: { ...search, status: "done", more: event.more ?? 0, missing: event.missing, problem: event.message } };
}

/**
 * Searches reference collections for `q` while `enabled`. Give it text that has
 * already settled (the callers wait a moment after the last keystroke). `exact` asks
 * for only what was typed, without other spellings or ways of saying it; `all` asks
 * every collection, not only those likeliest to hold the answer.
 */
export function useReferenceSearch(q: string, enabled: boolean, exact = false, all = false): ReferenceSearch {
  // The words and how to search them, as one key: any of them changing is a new search.
  const wanted = enabled && q.trim() ? `${exact ? "1" : "0"}${all ? "1" : "0"}${q.trim()}` : "";
  const [state, setState] = useState<{ q: string; held: Held }>({ q: "", held: { search: NOTHING, parts: new Map() } });

  useEffect(() => {
    if (!wanted) {
      setState({ q: "", held: { search: NOTHING, parts: new Map() } });
      return;
    }
    const controller = new AbortController();
    setState({ q: wanted, held: { search: { ...NOTHING, status: "searching" }, parts: new Map() } });
    const apply = (change: (held: Held) => Held) =>
      setState((current) => (controller.signal.aborted || current.q !== wanted ? current : { q: wanted, held: change(current.held) }));
    const finish = (problem: string | null) => (held: Held) =>
      held.search.status === "done" && !problem ? held : { ...held, search: { ...held.search, status: "done" as const, problem } };
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
    return () => controller.abort();
  }, [wanted]);

  // Between a new search being asked and the effect starting it, what is held belongs to the last one.
  return state.q === wanted ? state.held.search : wanted ? { ...NOTHING, status: "searching" } : NOTHING;
}

const keyOf = (result: SearchResult) => `${result.kind}:${result.entityId}`;

/**
 * Shows `items` in their order, except while the pointer is over the list or focus is in
 * it: then what is shown stays where it is, and what comes meanwhile waits (`waiting`
 * says how many) until the pointer or focus leaves, when the list takes its new order.
 * Nothing moves under a pointer about to press it. `key` changing (a new search) lets go.
 */
export function useSteadyOrder<T extends SearchResult>(
  items: T[],
  key: string,
): {
  shown: T[];
  waiting: number;
  hold: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onFocus: () => void;
    onBlur: (event: FocusEvent<HTMLElement>) => void;
  };
} {
  const [pointer, setPointer] = useState(false);
  const [focus, setFocus] = useState(false);
  const frozen = useRef<{ key: string; order: string[] } | null>(null);
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
      onPointerEnter: () => setPointer(true),
      onPointerLeave: () => setPointer(false),
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
