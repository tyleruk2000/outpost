/**
 * What each model did when it was tried with Outpost: the figures behind the "Which
 * model" page (`/help/which-model`) and the word the Chat screen's model picker shows
 * beside a model.
 *
 * THIS IS THE ONE PLACE TO BRING UP TO DATE. The page and the picker are drawn from it,
 * and docs/ai.md should quote it, so that the documentation and the screen cannot
 * disagree. A re-test replaces this file and nothing else.
 *
 * Where it was measured: on the machine in `MODEL_TRIALS.machine`, with the version of
 * Ollama in `MODEL_TRIALS.ollama`, on the day in `MODEL_TRIALS.measuredOn`. No model has
 * been timed on a Raspberry Pi (`piTimed`), and the page says so.
 *
 * What each field of a `ModelTrial` means:
 *  - `name`: the name exactly as `ollama pull` takes it.
 *  - `download`: the download size exactly as Ollama's library page for the model states
 *    it; null where it has not been read.
 *  - `memoryGb`: what Ollama held for the model while answering, read from its `/api/ps`
 *    (what `ollama ps` shows) on the machine above; null where it was not measured.
 *  - `suits`: judged from `memoryGb` the way recommended-models.ts judges it, leaving room
 *    for the system and Outpost: up to 2 GB for a Raspberry Pi 5 with 4 GB, up to 4 GB
 *    for one with 8 GB, more than that a Mac or PC. Null where it cannot be judged yet.
 *  - `licence`: its name and where it is published; `read` is false until someone has
 *    read it, and the page then says "licence not read".
 *  - `thinks`: true when Ollama's library page lists "thinking" for it (it reasons before
 *    it answers, which is slower); null where the page has not been read.
 *  - `library`: the 45 questions over the test library (docs/ai.md, "Measured with a real
 *    model"): how many of those the library answers it got right, and how many of those
 *    it does not answer it declined, as it should; `note` is one plain sentence. Null
 *    where it was not run through them.
 *  - `tools`: the questions in `TOOL_QUESTIONS`, asked with Outpost's look-up tools on:
 *    how many it got right, and its mistakes in one sentence. Null where not tried.
 *  - `timing`: medians over the tool questions, in seconds, to the first word and to the
 *    whole reply, on the machine above. Null where not timed.
 *  - `verdict` and `reason`: the judgement, and why, in one plain line.
 */
import { sameModelName } from "./recommended-models.ts";

/** Where the page that shows these figures is, inside Outpost. */
export const WHICH_MODEL_PATH = "/help/which-model";

export type ModelSuits = "pi-4gb" | "pi-8gb" | "mac";
export type ModelVerdict = "looks-things-up-well" | "answers-only" | "not-recommended";

export interface ModelTrial {
  /** As `ollama pull` takes it. */
  name: string;
  /** As Ollama's library page states it, e.g. "1.3 GB"; null where not read. */
  download: string | null;
  /** What Ollama held while answering (/api/ps), measured here; null where not measured. */
  memoryGb: number | null;
  /** Up to 2 GB for a Pi with 4 GB, up to 4 GB for one with 8 GB; null where not judged. */
  suits: ModelSuits | null;
  licence: { name: string; url: string; read: boolean };
  /** The library page lists "thinking"; null where not read. */
  thinks: boolean | null;
  library: { right: number; of: number; declinedRightly: number; ofDeclined: number; note: string } | null;
  tools: { right: number; of: number; mistakes: string } | null;
  /** Medians over the tool questions, in seconds. */
  timing: { firstWordS: number; wholeS: number } | null;
  verdict: ModelVerdict;
  /** One plain line. */
  reason: string;
}

export interface ModelChoice {
  name: string;
  reason: string;
}

export interface ModelTrials {
  /** The day the figures were taken, as YYYY-MM-DD. */
  measuredOn: string;
  /** The computer they were taken on, for the end of a sentence: "an Apple Silicon Mac (M-series, 16 GB)". */
  machine: string;
  /** The version of Ollama. */
  ollama: string;
  /** No model has been timed on a Raspberry Pi. */
  piTimed: false;
  /** Null where there is nothing measured to choose by yet. */
  recommendation: { pi: ModelChoice | null; mac: ModelChoice | null; avoid: ModelChoice[] };
  models: ModelTrial[];
}

/** The questions asked with the look-up tools on; the lead writes them in with the figures. */
export const TOOL_QUESTIONS: string[] = [];

/** A model not yet run through anything: every measured field empty. */
function notMeasured(name: string, download: string | null, suits: ModelSuits | null, page: string): ModelTrial {
  return {
    name,
    download,
    memoryGb: null,
    suits,
    licence: { name: "", url: page, read: false },
    thinks: null,
    library: null,
    tools: null,
    timing: null,
    verdict: "answers-only",
    reason: "Not measured yet.",
  };
}

export const MODEL_TRIALS: ModelTrials = {
  measuredOn: "2026-11-17",
  machine: "an Apple Silicon Mac",
  ollama: "0.40.16",
  piTimed: false,
  recommendation: {
    pi: {
      name: "llama3.2:3b",
      reason:
        "The one Outpost has suggested since 16 November: it answered about nine in ten of the library questions it could, and declined all those it could not.",
    },
    mac: null,
    avoid: [],
  },
  models: [
    // Download sizes and "suits" for the two llama3.2 models are those in recommended-models.ts.
    notMeasured("llama3.2:1b", "1.3 GB", "pi-4gb", "https://ollama.com/library/llama3.2"),
    notMeasured("lfm3:1.7b", null, null, "https://ollama.com/library/lfm3"),
    notMeasured("bonsai-2:2b", null, null, "https://ollama.com/library/bonsai-2"),
    notMeasured("llama3.2:3b", "2.0 GB", "pi-8gb", "https://ollama.com/library/llama3.2"),
    notMeasured("bonsai-2:4b", null, null, "https://ollama.com/library/bonsai-2"),
    notMeasured("bonsai-2:9b", null, null, "https://ollama.com/library/bonsai-2"),
    notMeasured("ornith:9b", null, null, "https://ollama.com/library/ornith"),
  ],
};

/** The entry for a model the model server lists. "x" and "x:latest" are one model; "x:3b" and "x:3b-instruct-q4_K_M" are not. */
export function trialOf(name: string): ModelTrial | undefined {
  const wanted = name.trim().toLowerCase();
  return MODEL_TRIALS.models.find((model) => sameModelName(model.name.toLowerCase(), wanted));
}

/** The verdict as the page and the picker say it. */
export const VERDICT_WORDS: Record<ModelVerdict, string> = {
  "looks-things-up-well": "looks things up well",
  "answers-only": "answers only",
  "not-recommended": "not recommended",
};

/**
 * The word the model picker shows: "looks things up well", "answers only", "not recommended", or
 * "not tested" for a model with no entry, or with an entry that has not been run through anything yet.
 */
export function trialWord(name: string): string {
  const trial = trialOf(name);
  if (!trial || (trial.library === null && trial.tools === null)) return "not tested";
  return VERDICT_WORDS[trial.verdict];
}
