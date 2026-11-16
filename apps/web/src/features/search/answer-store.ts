/**
 * The one answer this tab is holding, and the request that is writing it.
 *
 * It lives outside the Search screen on purpose. A small model can take a minute, and
 * the point of an answer is to check it: the person must be able to open a cited
 * source and come back to find the answer still there, still being written if it was.
 *
 * It is kept in memory and nowhere else. Not on the server, not in the browser's
 * storage: reloading or closing the tab is the end of it. There is one answer at a
 * time; asking again replaces it.
 */
import type { AnswerEvent, AnswerFailure, AnswerSource, SearchMode } from "@outpost/shared";
import { useSyncExternalStore } from "react";
import { ApiError, api } from "@/lib/api";

export type AnswerPhase =
  /** Nothing has been asked. */
  | "idle"
  /** Asked; Outpost is finding passages. */
  | "finding"
  /** The passages are with the model, which has not written a word yet. */
  | "waiting"
  | "writing"
  | "done"
  /** Nothing in the library matched, so the model was not asked. */
  | "nothing"
  /** The person pressed Stop. */
  | "stopped"
  | "failed";

export interface AnswerState {
  phase: AnswerPhase;
  question: string;
  /** What the library was searched for to find the passages. */
  searchedFor: string;
  model: string;
  server: string;
  sources: AnswerSource[];
  omitted: number;
  /** Passages the model server refused as more than the model can read at once, left out when it was asked again. */
  leftOut: number;
  safetyCritical: boolean;
  /** The model server said the model was not in memory, so it is being loaded first. Only Ollama can be asked. */
  loading: boolean;
  /** What the model has written so far; once it has finished, the answer as Outpost shows it. */
  text: string;
  /** The model read the passages and said they do not hold the answer. */
  declined: boolean;
  used: number[];
  /** Numbers the model cited that no passage carried. None is left in `text` once the answer is finished. */
  unsupported: number[];
  /** Which of those now point at the one passage whose own sentences they stood on. */
  repointed: Array<{ from: number; to: number }>;
  citesAll: boolean;
  cutShort: boolean;
  tookMs: number | null;
  /** What went wrong, in words for the person, when something did. */
  error: string | null;
  failure: AnswerFailure | "refused" | "connection" | null;
}

const EMPTY: AnswerState = {
  phase: "idle",
  question: "",
  searchedFor: "",
  model: "",
  server: "",
  sources: [],
  omitted: 0,
  leftOut: 0,
  safetyCritical: false,
  loading: false,
  text: "",
  declined: false,
  used: [],
  unsupported: [],
  repointed: [],
  citesAll: false,
  cutShort: false,
  tookMs: null,
  error: null,
  failure: null,
};

export const isWorking = (phase: AnswerPhase) => phase === "finding" || phase === "waiting" || phase === "writing";

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Reads a stream of server-sent events, calling `onEvent` for each as it arrives. */
export async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: AnswerEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  const flush = (block: string) => {
    let type = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!type || !data) return;
    try {
      onEvent({ type, ...(JSON.parse(data) as object) } as AnswerEvent);
    } catch {
      // A damaged event is skipped; the end of the stream decides what the person is told.
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // Normalised on the whole of what is held, because a line ending can itself be cut in two.
    rest = (rest + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
    let gap = rest.indexOf("\n\n");
    while (gap !== -1) {
      flush(rest.slice(0, gap));
      rest = rest.slice(gap + 2);
      gap = rest.indexOf("\n\n");
    }
  }
  if (rest.trim()) flush(rest);
}

export function createAnswerStore() {
  let state: AnswerState = EMPTY;
  let controller: AbortController | undefined;
  let stoppedAt = 0;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<AnswerState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  async function ask(question: string, mode?: SearchMode): Promise<void> {
    const asked = question.trim();
    if (!asked) return;
    if (controller) {
      controller.abort();
      stoppedAt = Date.now();
    }
    const mine = new AbortController();
    controller = mine;
    const current = () => controller === mine;
    set({ ...EMPTY, phase: "finding", question: asked });

    try {
      let response: Response;
      try {
        response = await api.stream("/api/answers", { question: asked, mode }, mine.signal);
      } catch (error) {
        // The server writes one answer at a time, and it may not yet have noticed that
        // the one this tab just stopped is over. Give it a moment, once.
        const justStopped = Date.now() - stoppedAt < 3000;
        if (!(error instanceof ApiError && error.details?.busy && justStopped)) throw error;
        await sleep(500);
        if (!current()) return;
        response = await api.stream("/api/answers", { question: asked, mode }, mine.signal);
      }
      if (!response.body) throw new ApiError(0, "unreachable", "The answer could not be read from the server.");
      let ended = false;
      await readEvents(response.body, (event) => {
        if (!current()) return;
        switch (event.type) {
          case "sources":
            set({
              phase: event.sources.length > 0 ? "waiting" : "finding",
              searchedFor: event.searchedFor,
              model: event.model,
              server: event.server,
              sources: event.sources,
              omitted: event.omitted,
              leftOut: event.leftOut ?? 0,
              safetyCritical: event.safetyCritical,
            });
            break;
          case "loading":
            set({ loading: true });
            break;
          case "delta":
            set({ phase: "writing", loading: false, text: state.text + event.text });
            break;
          case "done":
            ended = true;
            set({
              phase: event.outcome === "nothing-found" ? "nothing" : "done",
              loading: false,
              // What Outpost settled on once the model had finished: stray markers out, a refusal citing nothing.
              text: event.text ?? state.text,
              declined: event.outcome === "not-covered",
              used: event.used,
              unsupported: event.unsupported,
              repointed: event.repointed ?? [],
              citesAll: event.citesAll ?? false,
              cutShort: event.cutShort,
              tookMs: event.tookMs,
            });
            break;
          case "error":
            ended = true;
            set({ phase: "failed", error: event.message, failure: event.failure });
            break;
        }
      });
      if (current() && !ended) {
        set({
          phase: "failed",
          failure: "connection",
          error:
            "The connection to Outpost was lost before the answer was finished. Check that the server is still running, then ask again.",
        });
      }
    } catch (error) {
      if (!current()) return;
      if (mine.signal.aborted) return;
      set({
        phase: "failed",
        failure: error instanceof ApiError && error.status !== 0 ? "refused" : "connection",
        error:
          error instanceof ApiError
            ? error.message
            : "The connection to Outpost was lost before the answer was finished. Check that the server is still running, then ask again.",
      });
    } finally {
      if (current()) controller = undefined;
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ask,
    /** Stops the answer being written. What has arrived stays, marked as unfinished. */
    stop() {
      if (!controller) return;
      controller.abort();
      controller = undefined;
      stoppedAt = Date.now();
      set({ phase: "stopped" });
    },
    /** Forgets the answer. */
    clear() {
      if (controller) {
        controller.abort();
        controller = undefined;
        stoppedAt = Date.now();
      }
      set(EMPTY);
    },
  };
}

export type AnswerStore = ReturnType<typeof createAnswerStore>;

/** The answer held by this tab. */
export const answerStore = createAnswerStore();

export function useAnswer(store: AnswerStore = answerStore): AnswerState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
