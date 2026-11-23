/**
 * The second part of a search: what reference collections hold.
 *
 * Outpost's own documents and pages are found in milliseconds. Articles inside
 * reference collections are found by kiwix-serve, an archive at a time, and on a slow
 * drive or a network share that takes seconds. So a search asks for the two apart: its
 * own results come at once, and this hook collects each collection's articles as that
 * collection answers.
 *
 * Results are only ever added to the end, in the order collections answer, so nothing
 * a person is reading or about to press moves. Typing something else closes the
 * connection, and the server stops asking collections it has not asked yet.
 */
import type { ReferenceSearchEvent, ReferenceSearchMissing, SearchResult } from "@outpost/shared";
import { useEffect, useState } from "react";
import { api } from "./api";

export interface ReferenceSearch {
  /** "idle": nothing was asked. "searching": collections are still answering. "done": all have, or ran out of time. */
  status: "idle" | "searching" | "done";
  /** How many collections are being searched. 0 until the server has said, and when there are none. */
  collections: number;
  /** How many have answered so far. */
  answered: number;
  /** Every result so far, in the order collections answered; a collection's results are together, best first. */
  results: SearchResult[];
  /** The best match of each collection that has one, in the order collections answered. */
  best: SearchResult[];
  /** Collections whose articles are missing: too slow, or not searchable. Known when the search is done. */
  missing: ReferenceSearchMissing[];
  /** Why reference collections could not be searched at all; null when they could. */
  problem: string | null;
}

const NOTHING: ReferenceSearch = { status: "idle", collections: 0, answered: 0, results: [], best: [], missing: [], problem: null };

const LOST = "Reference collections could not be searched just now, so their articles are missing from these results.";

function after(state: ReferenceSearch, event: ReferenceSearchEvent): ReferenceSearch {
  if (event.type === "start") return { ...state, collections: event.collections };
  if (event.type === "collection") {
    return {
      ...state,
      answered: state.answered + 1,
      results: event.results.length > 0 ? [...state.results, ...event.results] : state.results,
      best: event.results.length > 0 ? [...state.best, event.results[0]!] : state.best,
    };
  }
  return { ...state, status: "done", missing: event.missing, problem: event.message };
}

/**
 * Searches reference collections for `q` while `enabled`. Give it text that has
 * already settled (the callers wait a moment after the last keystroke). `exact` asks
 * for only what was typed, without other spellings or ways of saying it.
 */
export function useReferenceSearch(q: string, enabled: boolean, exact = false): ReferenceSearch {
  // The words and whether to widen them, as one key: either changing is a new search.
  const wanted = enabled && q.trim() ? `${exact ? "1" : "0"}${q.trim()}` : "";
  const [state, setState] = useState<{ q: string; search: ReferenceSearch }>({ q: "", search: NOTHING });

  useEffect(() => {
    if (!wanted) {
      setState({ q: "", search: NOTHING });
      return;
    }
    const controller = new AbortController();
    setState({ q: wanted, search: { ...NOTHING, status: "searching" } });
    const apply = (change: (search: ReferenceSearch) => ReferenceSearch) =>
      setState((current) => (controller.signal.aborted || current.q !== wanted ? current : { q: wanted, search: change(current.search) }));
    api
      .lines<ReferenceSearchEvent>(
        "/api/search/reference",
        { q: wanted.slice(1), exact: wanted.startsWith("1") ? "1" : undefined },
        (event) => apply((search) => after(search, event)),
        controller.signal,
      )
      .then(
        // An answer that stops without its last line was cut short.
        () => apply((search) => (search.status === "done" ? search : { ...search, status: "done", problem: LOST })),
        () => apply((search) => ({ ...search, status: "done", problem: LOST })),
      );
    return () => controller.abort();
  }, [wanted]);

  // Between a new search being asked and the effect starting it, what is held belongs to the last one.
  return state.q === wanted ? state.search : wanted ? { ...NOTHING, status: "searching" } : NOTHING;
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
