/**
 * The short list of small models Outpost suggests for answers and chat.
 *
 * THIS IS THE ONE PLACE TO BRING UP TO DATE. The set-up steps in Settings and Chat, the
 * in-app guide and docs/setup-guide.md are all written from this list. After changing
 * it, run `node scripts/write-setup-guide.mjs` so the docs page follows.
 *
 * Rules for an entry:
 *  - small enough for a Raspberry Pi 5 with 8 GB of memory; say whether 4 GB is enough;
 *  - the name and the download size exactly as Ollama's library page for the model
 *    states them (ollama.com/library/<model>/tags) on the day in RECOMMENDED_MODELS_CHECKED;
 *  - what it is good at only as far as the publisher's page says, as far as its size
 *    implies, or as far as it was seen to do when tried. Nothing here is a benchmark.
 *    The two llama3.2 models were each asked a fixed set of 45 questions over a small
 *    test library through Outpost on 2026-11-16 (docs/ai.md, "Measured with a real
 *    model"); what is said of them here is what that counted. lfm3:1.7b was asked 32 of
 *    those questions and 16 that need something looked up, with six other models, on
 *    2026-11-17 (model-trials.ts, shown at /help/which-model); it came out best all
 *    round, which is why it is the one to start with. gemma3 and phi4-mini have not
 *    been run.
 *
 * Memory: `memoryGb` is what Ollama reported holding for the model once loaded (its
 * `/api/ps`, which is what `ollama ps` shows) with its default 4,096-token context,
 * where `memoryMeasured` is true: 2.34 GB for llama3.2:3b and 1.46 GB for llama3.2:1b,
 * read on an Apple Silicon Mac with Ollama 0.40.16 on 2026-11-16. lfm3:1.7b's 1.72 GB
 * was read on 2026-11-17 with the 8,192-token context used when looking things up, so
 * it is the larger of its two figures; its name and size were read that day. Where it is false
 * the figure is the download size plus 0.3 GB, which is the larger of what those two
 * came to over their own files. No model has been run on a Raspberry Pi by this
 * project, and "fits" is a judgement from these figures, leaving room for the system
 * and for Outpost: up to 2 GB for a computer with 4 GB, up to 4 GB for one with 8 GB.
 */

export interface RecommendedModel {
  /** The exact name to give `ollama pull`. */
  name: string;
  /** Download size as Ollama's library page states it. */
  download: string;
  /** Roughly how much memory it takes once loaded, in gigabytes. */
  memoryGb: number;
  /** True when `memoryGb` was read from a running Ollama, false when it is an estimate. */
  memoryMeasured: boolean;
  /** The least memory a Raspberry Pi 5 (or any small computer) should have for it. */
  fits: "4 GB" | "8 GB";
  /** What it is good at, or not, in one sentence. */
  suits: string;
  /** The one to start with when a person has no reason to prefer another. */
  start: boolean;
  /** Ollama's page for the model, where its current sizes are listed. */
  page: string;
}

/** The day the names and sizes below were read from Ollama's library pages. */
export const RECOMMENDED_MODELS_CHECKED = "2026-11-16";

/** Where on the publisher's site to look when this list has gone stale. */
export const MODEL_LIBRARY_URL = "https://ollama.com/library";

export const RECOMMENDED_MODELS: readonly RecommendedModel[] = [
  {
    name: "lfm3:1.7b",
    download: "1.7 GB",
    memoryGb: 1.7,
    memoryMeasured: true,
    fits: "4 GB",
    suits:
      "The best all round of the seven models tried through Outpost: it looked things up rightly 15 times in 16, answered 28 of 32 test questions from the library rightly and declined all 13 the library did not hold. It thinks before it answers, so the first word takes a few seconds. Its licence is free for a household; a business with $10 million a year or more in revenue needs another.",
    start: true,
    page: "https://ollama.com/library/lfm3",
  },
  {
    name: "llama3.2:3b",
    download: "2.0 GB",
    memoryGb: 2.3,
    memoryMeasured: true,
    fits: "8 GB",
    suits:
      "Its maker says it is good at following instructions and summarising. Asked 45 test questions through Outpost, it answered about nine in ten of those the test library held, citing the right passage, and declined all of those it did not hold: the most reliable here on answers from the library, and quicker to its first word. It looked things up rightly 13 times in 16.",
    start: false,
    page: "https://ollama.com/library/llama3.2",
  },
  {
    name: "llama3.2:1b",
    download: "1.3 GB",
    memoryGb: 1.5,
    memoryMeasured: true,
    fits: "4 GB",
    suits:
      "Lighter, for a computer with 4 GB of memory, and not reliable for answers from your library. Asked the same 45 test questions, it got between one in five and one in four of the answerable ones wrong or said the passages held no answer when they did, made up an answer to between one in six and one in two of those the library did not hold, and numbered its sentences as if the numbers were sources (Outpost takes those markers out, or points them at the passage that holds the words).",
    start: false,
    page: "https://ollama.com/library/llama3.2",
  },
  {
    name: "gemma3:1b",
    download: "806 MB",
    memoryGb: 1.1,
    memoryMeasured: false,
    fits: "4 GB",
    suits: "The smallest here, for when memory is very short; expect short, plain answers and more mistakes.",
    start: false,
    page: "https://ollama.com/library/gemma3",
  },
  {
    name: "phi4-mini",
    download: "2.5 GB",
    memoryGb: 2.8,
    memoryMeasured: false,
    fits: "8 GB",
    suits: "About the size of llama3.2:3b; its maker describes it as stronger at reasoning, mathematics and languages other than English.",
    start: false,
    page: "https://ollama.com/library/phi4-mini",
  },
  {
    name: "gemma3:4b",
    download: "3.4 GB",
    memoryGb: 3.7,
    memoryMeasured: false,
    fits: "8 GB",
    suits: "The largest here and the slowest on a small computer; its family is trained on over 140 languages.",
    start: false,
    page: "https://ollama.com/library/gemma3",
  },
];

/** The model a person with no reason to prefer another should get first. */
export const STARTING_MODEL: RecommendedModel = RECOMMENDED_MODELS.find((model) => model.start) ?? RECOMMENDED_MODELS[0]!;

/** The command that fetches a model, exactly as it is typed. */
export const pullCommand = (name: string) => `ollama pull ${name}`;

/** "llama3.2" and "llama3.2:latest" are one model to Ollama. */
export const sameModelName = (a: string, b: string) => a === b || `${a}:latest` === b || a === `${b}:latest`;

/** The entry of the list a model server's model corresponds to, if it is one of them. */
export function recommendedEntry(id: string): RecommendedModel | undefined {
  return RECOMMENDED_MODELS.find((model) => sameModelName(model.name, id));
}
