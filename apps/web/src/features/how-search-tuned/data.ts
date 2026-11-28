/**
 * The figures of "How search was tuned": what was measured while search was tuned
 * (22 and 23 November 2026), and the arithmetic of the worked examples, done here so
 * that the page shows numbers worked out by the same formulas the server and the
 * evaluation scripts use (apps/server/src/modules/search, scripts/search-eval/metrics.mjs).
 * Pure, and tested.
 */

// ── Reciprocal rank fusion: the old scores ─────────────────────────────────

/** The number reciprocal rank fusion adds to each place. */
export const RRF_K = 60;

/** A place's share, 1 ÷ (k + place), shown as the old screen showed it: as a share of first place's. */
export function oldShownScore(place: number, k = RRF_K): number {
  return (k + 1) / (k + place);
}

/** The owner's search on the Raspberry Pi before tuning, as it came back: title, the score shown, and its place in its own list. */
export const OWNER_QUERY = "How to change car battery";
export const OWNER_RESULTS: Array<{ title: string; shown: number; place: number }> = [
  { title: "OpenStax University Physics Volume 1", shown: 1.0, place: 1 },
  { title: "ABS de-layering on Ender 3", shown: 1.0, place: 1 },
  { title: "A radio’s setup menu", shown: 0.984, place: 2 },
  { title: "Why doesn’t adding a resistor inline to a 12 V car charger change output voltage", shown: 0.984, place: 2 },
  { title: "Solar Power Inside a Car", shown: 0.968, place: 3 },
  { title: "Bicycle computers with nonvolatile memory", shown: 0.953, place: 4 },
  { title: "World Factbook definitions", shown: 0.938, place: 5 },
  { title: "Which measuring scale should I buy?", shown: 0.924, place: 6 },
];

// ── Measures ───────────────────────────────────────────────────────────────

/** What a grade is worth: 2^grade − 1, so a 3 (the answer) is worth seven times a 1 (on the subject). */
export const gain = (grade: number) => 2 ** grade - 1;

/** How much a place counts: 1 ÷ log₂(place + 1). */
export const discount = (place: number) => 1 / Math.log2(place + 1);

/** Discounted cumulative gain of the first `depth` grades. */
export function dcg(grades: number[], depth = 5): number {
  return grades.slice(0, depth).reduce((sum, grade, index) => sum + gain(grade) * discount(index + 1), 0);
}

/** nDCG@depth: the list's DCG as a share of the best order's. */
export function ndcg(grades: number[], ideal: number[], depth = 5): number {
  const best = dcg(
    [...ideal].sort((a, b) => b - a),
    depth,
  );
  return best > 0 ? dcg(grades, depth) / best : 0;
}

/** The p-th percentile as the evaluation script works it out: the value at place ⌈p × n⌉ in order. */
export function percentile(values: number[], share: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)]!;
}

/** "CPR on a child" on the fixture library, as this version ranks it (its first five, graded). */
export const CPR_QUERY = "CPR on a child";
export const CPR_RESULTS: Array<{ title: string; where: string; grade: number }> = [
  { title: "First aid manual", where: "the fixture library", grade: 3 },
  { title: "Cardiopulmonary resuscitation", where: "Best of Wikipedia", grade: 2 },
  { title: "Forum: rescue breaths for a child on a hike?", where: "the fixture library", grade: 0 },
  { title: "What to do after an accident with a child?", where: "Bicycles Q&A", grade: 1 },
  { title: "I accidentally removed some paint from my child’s toy…", where: "Woodworking Q&A", grade: 1 },
];
/** The best five grades there are to be had for it, from every graded item and recorded article. */
export const CPR_IDEAL = [3, 2, 2, 2, 2];

/** Three questions of the evaluation set, as written in it. */
export const GRADED_EXAMPLES: Array<{ q: string; grades: Array<[string, number]>; patterns: string[] }> = [
  {
    q: "How to change car battery",
    grades: [
      ["Car maintenance manual", 3],
      ["Jump starting a car", 1],
      ["Charging a phone in the car", 1],
    ],
    patterns: ["car, vehicle or automotive", "batter…"],
  },
  {
    q: "rescue breaths for a child",
    grades: [
      ["First aid manual", 3],
      ["CPR for adults", 1],
      ["Forum: rescue breaths for a child on a hike?", 0],
    ],
    patterns: ["rescue breath, CPR, resuscitat… or mouth to mouth", "child, infant, paediatric, pediatric or baby"],
  },
  {
    q: "tyre pressure",
    grades: [
      ["Car tyre pressures", 3],
      ["Tire care", 3],
    ],
    patterns: ["tyre or tire", "pressure"],
  },
];

// ── BM25 ───────────────────────────────────────────────────────────────────

/** SQLite's BM25 constants: how fast repeats stop counting, and how much length counts. */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/** How much a word says: ln((N − n + 0.5) ÷ (n + 0.5)), as SQLite works it out (never below a hair above 0). */
export function bm25Idf(passages: number, holding: number): number {
  const value = Math.log((passages - holding + 0.5) / (holding + 0.5));
  return value > 0 ? value : 1e-6;
}

/** One word's share in one passage, before its rarity: tf × (k1 + 1) ÷ (tf + k1 × (1 − b + b × length ÷ average)). */
export function bm25Part(count: number, length: number, average: number): number {
  return (count * (BM25_K1 + 1)) / (count + BM25_K1 * (1 - BM25_B + (BM25_B * length) / average));
}

/** The small made-up library of the worked example. */
export const BM25_LIBRARY = {
  passages: 1000,
  average: 120,
  words: [
    { word: "battery", holding: 20 },
    { word: "car", holding: 100 },
  ],
};
export const BM25_PASSAGES: Array<{ name: string; length: number; counts: Record<string, number> }> = [
  { name: "A: a short passage on car batteries", length: 80, counts: { battery: 2, car: 1 } },
  { name: "B: the same words in a long passage", length: 300, counts: { battery: 2, car: 1 } },
  { name: "C: short, “battery” six times", length: 80, counts: { battery: 6, car: 1 } },
];

export function bm25Score(passage: (typeof BM25_PASSAGES)[number]): {
  parts: Array<{ word: string; idf: number; part: number }>;
  total: number;
} {
  const parts = BM25_LIBRARY.words.map(({ word, holding }) => ({
    word,
    idf: bm25Idf(BM25_LIBRARY.passages, holding),
    part: bm25Part(passage.counts[word] ?? 0, passage.length, BM25_LIBRARY.average),
  }));
  return { parts, total: parts.reduce((sum, part) => sum + part.idf * part.part, 0) };
}

// ── The final score ────────────────────────────────────────────────────────

/** The weights of the one scale (apps/server/src/modules/search/score.ts, SCORE_WEIGHTS). */
export const WEIGHTS: Array<{ key: string; name: string; weight: number; what: string }> = [
  { key: "coverage", name: "Coverage", weight: 0.5, what: "How much of the question it holds, rare words counting more" },
  { key: "title", name: "Title", weight: 0.2, what: "How much of it is in the title" },
  { key: "closeness", name: "Closeness", weight: 0.15, what: "How near together the words are" },
  { key: "frequency", name: "Frequency", weight: 0.1, what: "How often they occur, with diminishing returns" },
  { key: "phrase", name: "Side by side", weight: 0.05, what: "All the words next to each other, in the order typed" },
];

/**
 * The parts the server's scorer gives an illustrative passage for "How to change car
 * battery" ("change", "car", "battery" weighed 2.93, 3.65 and 4.58 by rarity). Worked out by
 * `scoreFields` itself; a server test keeps these the same.
 */
export const SCORED_EXAMPLE = {
  title: "Car maintenance manual",
  heading: "The battery",
  text: "To replace the battery, disconnect the negative lead first, then the positive. Lift the old battery out and fit the new one.",
  parts: { coverage: 0.961, title: 0.573, closeness: 0.5, frequency: 0.422, phrase: 0 } as Record<string, number>,
  score: 0.712,
};

/** A favoured score, as intent.ts works it out: multiplied, but never by more than it lacks of 1, divided the same way. */
export function favoured(score: number, factor: number): number {
  const value = factor <= 1 ? score * factor : Math.min(score * factor, 1 - (1 - score) / factor);
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

// ── Meaning ────────────────────────────────────────────────────────────────

export const MEANING_CEILING = 0.6;
export const MEANING_LIFT = 0.5;

/** Similarity to the question as a score on the one scale: 0.2 and less nothing, 0.7 and more the ceiling. */
export function meaningScore(similarity: number): number {
  return MEANING_CEILING * Math.min(1, Math.max(0, (similarity - 0.2) / 0.5));
}

/** A result found by its words and by meaning: 1 − (1 − words)(1 − meaning × lift). */
export function blended(words: number, similarity: number): number {
  return Math.round((1 - (1 - words) * (1 - meaningScore(similarity) * MEANING_LIFT)) * 1000) / 1000;
}

/** Eight bits for a number: whole numbers from −127 to 127 and one scale for the row (its largest size ÷ 127). */
export function quantise(vector: number[]): { scale: number; bytes: number[]; back: number[] } {
  const largest = Math.max(...vector.map((value) => Math.abs(value)));
  const scale = largest > 0 ? largest / 127 : 1;
  const bytes = vector.map((value) => Math.round(value / scale));
  return { scale, bytes, back: bytes.map((byte) => byte * scale) };
}

/** Six of a vector's numbers, made up for the example. */
export const QUANTISE_EXAMPLE = [0.42, -0.18, 0.07, -0.61, 0.33, 0.68];

// ── What was measured ──────────────────────────────────────────────────────

/** The Raspberry Pi before and after, every figure measured. */
export const PI_SUMMARY: Array<{ measure: string; before: string; after: string }> = [
  { measure: "nDCG@5 (order of the first five, 0 to 1)", before: "0.393", after: "0.873" },
  { measure: "Success@3 (a useful result in the first three)", before: "76%", after: "98%" },
  { measure: "Zero-result rate", before: "not measured", after: "0%" },
  { measure: "Own results, p95 time", before: "888 ms", after: "122 ms" },
  { measure: "The owner’s question, nDCG@5", before: "0.26", after: "1.00 (its candidates re-ranked offline)" },
  { measure: "Reference collections asked per question", before: "37", after: "10.9 on average" },
  { measure: "Reference collections, all done (median)", before: "6.7 s", after: "1.3 s" },
  { measure: "Reference collections, first useful article (median)", before: "not measured", after: "0.4 s" },
  { measure: "Reference collections, success@3", before: "not measured", after: "96%" },
  { measure: "Search by meaning", before: "Off (0 vectors)", after: "On, 59,327 passages read" },
];

/** How many everyday searches the owner tried on the Pi (24 November 2026), added to the evaluation set as a second set. */
export const EVERYDAY_SEARCHES = 31;

/** The sixth package, measured on 24 November 2026: the Pi as it ranked, and its candidates re-ranked offline by this version. */
export const EVERYDAY_FIGURES: Array<{ measure: string; before: string; after: string }> = [
  { measure: "Everyday searches, nDCG@5 on the Pi", before: "0.848", after: "0.903" },
  { measure: "Household questions, nDCG@5 on the Pi", before: "0.854", after: "0.877" },
  { measure: "Everyday searches, success@3 on the Pi", before: "100%", after: "100%" },
  { measure: "Fixture library, household questions, nDCG@5", before: "0.818", after: "0.817" },
  { measure: "Fixture library, everyday searches, nDCG@5", before: "0.731", after: "0.728" },
  { measure: "Of the 32 searches, those asking all 37 collections (after: the new rule on the Pi’s own counts)", before: "7", after: "4" },
];

/**
 * Package 7, the persona tests (24 November 2026). The Pi: its candidates in the earlier and the new order, offline,
 * graded against one pool of everything any run found. The fixture: the same recorded collections, old code and new.
 */
export const PERSONA_FIGURES: Array<{ measure: string; before: string; after: string }> = [
  { measure: "Persona questions, nDCG@5 on the Pi", before: "0.742", after: "0.859" },
  { measure: "Persona questions, success@3 on the Pi", before: "77%", after: "92%" },
  { measure: "Everyday searches, nDCG@5 on the Pi", before: "0.917", after: "0.926" },
  { measure: "Household questions, nDCG@5 on the Pi", before: "0.881", after: "0.886" },
  { measure: "Fixture library, persona questions, nDCG@5", before: "0.616", after: "0.626" },
  { measure: "Fixture library, household questions, nDCG@5", before: "0.818", after: "0.820" },
  { measure: "Fixture library, everyday searches, nDCG@5", before: "0.729", after: "0.730" },
  { measure: "Keyboard-mashing (4 searches), results by meaning alone", before: "20, 20, 20, 11", after: "0, 0, 0, 0" },
];

/** Own results' p95 on the Raspberry Pi at each point it was measured. */
export const PI_P95 = [
  { label: "Before", ms: 888 },
  { label: "After package 4", ms: 393 },
  { label: "After package 5", ms: 122 },
];

/** Where the time of one search went on the Pi, while a build of the meaning index ran (44,000 vectors). */
export const PI_STAGES = [
  { stage: "Keyword search", median: "34 ms", p95: "102 ms" },
  { stage: "Comparing the question with every passage’s numbers (32-bit, before the change to 8 bits)", median: "46 ms", p95: "–" },
  { stage: "The whole search, a new question", median: "163 ms", p95: "314 ms" },
  { stage: "Waiting for the model while it read a passage for the build", median: "up to about 300 ms", p95: "–" },
];
