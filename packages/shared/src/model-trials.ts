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

/**
 * The questions asked with the look-up tools on, in the order asked. The same words as
 * apps/server/test/eval/tool-questions.ts, which checks that they agree.
 */
export const TOOL_QUESTIONS: string[] = [
  "What supermarkets are near home?",
  "Where is the nearest drinking water?",
  "Which hospital is nearest to Northampton?",
  "How many days of food have we got?",
  "What's on our power cut plan?",
  "Are there any weather warnings for us at the moment?",
  "What's the river doing?",
  "When is sunset at home today?",
  "What is the magnetic declination at home?",
  "What frequency is the shipping forecast on?",
  "How long should I boil water to make it safe to drink?",
  "Is there anything on first aid I could download?",
  "What pharmacies are there in Bedford?",
  "What is the capital of France?",
  "Write a haiku about rain.",
  "What is the nearest supermarket to home, and what time does the sun set there today?",
];

const LLAMA = { name: "Llama 3.2 Community License", url: "https://www.llama.com/llama3_2/license/", read: true };
const BONSAI = { name: "Apache 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0", read: true };
/** Ending with no answer: the model spent its whole allowance of 1,024 tokens thinking. */
const thoughtTooLong = (count: number) => `${count} of the 45 ended with no answer at all: it spent its whole allowance thinking.`;

/**
 * Measured on 2026-11-17 with Ollama 0.40.16 on the owner's Apple M2 Max (32 GB):
 * looking things up, docs/ai.md "Tried with a real model: tools" (one run of 16 questions);
 * answers from the library, docs/ai.md "Measured with a real model" (the 45 questions,
 * search by words; the two llama3.2 models from the second round on 2026-11-16, two runs,
 * the others one run on 2026-11-17). Memory is what Ollama held while answering with
 * tools on (an 8,192-token context). Download sizes and licences are as each model's
 * page at ollama.com/library stated them on 2026-11-17; lfm3's licence and Llama's were
 * read in full at the addresses given.
 */
export const MODEL_TRIALS: ModelTrials = {
  measuredOn: "2026-11-17",
  machine: "an Apple M2 Max Mac with 32 GB of memory",
  ollama: "0.40.16",
  piTimed: false,
  recommendation: {
    pi: {
      name: "lfm3:1.7b",
      reason:
        "It looked things up rightly 15 times in 16 and answered 28 of 32 library questions rightly, in 1.7 GB, which a Pi 5 with 4 GB can hold.",
    },
    mac: {
      name: "lfm3:1.7b",
      reason:
        "The two larger models looked things up no better here, took about three times as long, and often thought past their allowance on library questions.",
    },
    avoid: [
      { name: "llama3.2:1b", reason: "It cannot look things up: it writes its requests out as text instead of making them." },
      {
        name: "bonsai-2:4b",
        reason: "No better than bonsai-2:2b at looking things up, slower, and it often thought past its allowance on library questions.",
      },
    ],
  },
  models: [
    {
      name: "llama3.2:1b",
      download: "1.3 GB",
      memoryGb: 1.73,
      suits: "pi-4gb",
      licence: LLAMA,
      thinks: false,
      library: {
        right: 47,
        of: 64,
        declinedRightly: 22,
        ofDeclined: 26,
        note: "Two runs. It often numbers its own sentences as if they were sources.",
      },
      tools: { right: 6, of: 16, mistakes: "Half the time it wrote its request, or a tool's whole description, into its reply as text." },
      timing: { firstWordS: 0.9, wholeS: 1.4 },
      verdict: "not-recommended",
      reason: "Quick, but it cannot look things up, and is unreliable on library answers.",
    },
    {
      name: "lfm3:1.7b",
      download: "1.7 GB",
      memoryGb: 1.72,
      suits: "pi-4gb",
      licence: { name: "LFM Open License v1.0", url: "https://www.liquid.ai/lfm-license", read: true },
      thinks: true,
      library: { right: 28, of: 32, declinedRightly: 13, ofDeclined: 13, note: "" },
      tools: { right: 15, of: 16, mistakes: "It looked for the shipping forecast in the library instead of the radio frequencies." },
      timing: { firstWordS: 3.5, wholeS: 4.2 },
      verdict: "looks-things-up-well",
      reason:
        "The best all round of those tried. Its licence is free for a household; a business with $10 million a year or more in revenue needs another.",
    },
    {
      name: "bonsai-2:2b",
      download: "911 MB",
      memoryGb: 1.02,
      suits: "pi-4gb",
      licence: BONSAI,
      thinks: true,
      library: { right: 19, of: 32, declinedRightly: 12, ofDeclined: 13, note: thoughtTooLong(13) },
      tools: {
        right: 14,
        of: 16,
        mistakes: "It said it had nothing on the shipping forecast without looking, and answered the boiling question from memory.",
      },
      timing: { firstWordS: 2.3, wholeS: 3.2 },
      verdict: "looks-things-up-well",
      reason: "The smallest, and looks things up well; for answers from the library it often thinks too long to answer.",
    },
    {
      name: "llama3.2:3b",
      download: "2.0 GB",
      memoryGb: 3.12,
      suits: "pi-8gb",
      licence: LLAMA,
      thinks: false,
      library: { right: 58, of: 64, declinedRightly: 26, ofDeclined: 26, note: "Two runs." },
      tools: {
        right: 13,
        of: 16,
        mistakes:
          "It gave the water's days as the food's, looked up the capital of France in the catalogue, and once wrote a request out as text.",
      },
      timing: { firstWordS: 2.9, wholeS: 2.9 },
      verdict: "looks-things-up-well",
      reason:
        "The most reliable on answers from the library; looks things up adequately, now and then taking a figure from the wrong line.",
    },
    {
      name: "bonsai-2:4b",
      download: "1.6 GB",
      memoryGb: 1.95,
      suits: "pi-4gb",
      licence: BONSAI,
      thinks: true,
      library: { right: 13, of: 32, declinedRightly: 10, ofDeclined: 13, note: thoughtTooLong(21) },
      tools: { right: 15, of: 16, mistakes: "It answered the boiling question from memory (rightly) instead of from the library." },
      timing: { firstWordS: 5.8, wholeS: 7.5 },
      verdict: "looks-things-up-well",
      reason: "Looks things up well but no better than the 2b, more slowly; poor on library answers because it thinks too long.",
    },
    {
      name: "bonsai-2:9b",
      download: "3.2 GB",
      memoryGb: 2.81,
      suits: "mac",
      licence: BONSAI,
      thinks: true,
      library: { right: 14, of: 32, declinedRightly: 10, ofDeclined: 13, note: thoughtTooLong(20) },
      tools: { right: 15, of: 16, mistakes: "It answered the boiling question from memory (rightly) instead of from the library." },
      timing: { firstWordS: 11.2, wholeS: 13.3 },
      verdict: "looks-things-up-well",
      reason: "Fits in memory on a Pi with 8 GB, but took 11 seconds to its first word even on this Mac; poor on library answers.",
    },
    {
      name: "ornith:9b",
      download: "5.6 GB",
      memoryGb: 4.78,
      suits: "mac",
      licence: { name: "MIT", url: "https://ollama.com/library/ornith", read: true },
      thinks: true,
      library: { right: 20, of: 32, declinedRightly: 13, ofDeclined: 13, note: thoughtTooLong(9) },
      tools: { right: 15, of: 16, mistakes: "It answered the boiling question from memory (rightly) instead of from the library." },
      timing: { firstWordS: 10.9, wholeS: 14.1 },
      verdict: "looks-things-up-well",
      reason: "Looks things up well and declines rightly, but slowly, and needs nearly 5 GB.",
    },
  ],
};

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
