/**
 * The Porter stemmer (M. F. Porter, "An algorithm for suffix stripping", 1980), the
 * same algorithm SQLite's `porter` tokenizer uses for the full-text index. Ranking
 * (score.ts) uses it so that a word counts as found exactly when the index would find
 * it: "boiling" and "boil", "batteries" and "battery".
 */

const VOWEL = /[aeiou]/;

function isConsonant(word: string, index: number): boolean {
  const char = word[index]!;
  if (VOWEL.test(char)) return false;
  if (char === "y") return index === 0 ? true : !isConsonant(word, index - 1);
  return true;
}

/** The number of vowel-consonant sequences in `stem`: Porter's m. */
function measure(stem: string): number {
  let count = 0;
  let index = 0;
  const length = stem.length;
  while (index < length && isConsonant(stem, index)) index += 1;
  while (index < length) {
    while (index < length && !isConsonant(stem, index)) index += 1;
    if (index >= length) break;
    while (index < length && isConsonant(stem, index)) index += 1;
    count += 1;
  }
  return count;
}

function hasVowel(stem: string): boolean {
  for (let index = 0; index < stem.length; index += 1) if (!isConsonant(stem, index)) return true;
  return false;
}

function endsDoubleConsonant(word: string): boolean {
  const length = word.length;
  return length >= 2 && word[length - 1] === word[length - 2] && isConsonant(word, length - 1);
}

/** Consonant, vowel, consonant at the end, the last not w, x or y. */
function endsCvc(word: string): boolean {
  const length = word.length;
  if (length < 3) return false;
  if (!isConsonant(word, length - 1) || isConsonant(word, length - 2) || !isConsonant(word, length - 3)) return false;
  return !/[wxy]/.test(word[length - 1]!);
}

function replaceIf(word: string, suffix: string, replacement: string, minMeasure: number): string | null {
  if (!word.endsWith(suffix)) return null;
  const stem = word.slice(0, -suffix.length);
  return measure(stem) > minMeasure ? stem + replacement : word;
}

const STEP2: Array<[string, string]> = [
  ["ational", "ate"],
  ["tional", "tion"],
  ["enci", "ence"],
  ["anci", "ance"],
  ["izer", "ize"],
  ["bli", "ble"],
  ["alli", "al"],
  ["entli", "ent"],
  ["eli", "e"],
  ["ousli", "ous"],
  ["ization", "ize"],
  ["ation", "ate"],
  ["ator", "ate"],
  ["alism", "al"],
  ["iveness", "ive"],
  ["fulness", "ful"],
  ["ousness", "ous"],
  ["aliti", "al"],
  ["iviti", "ive"],
  ["biliti", "ble"],
  ["logi", "log"],
];

const STEP3: Array<[string, string]> = [
  ["icate", "ic"],
  ["ative", ""],
  ["alize", "al"],
  ["iciti", "ic"],
  ["ical", "ic"],
  ["ful", ""],
  ["ness", ""],
];

const STEP4 = [
  "al",
  "ance",
  "ence",
  "er",
  "ic",
  "able",
  "ible",
  "ant",
  "ement",
  "ment",
  "ent",
  "ion",
  "ou",
  "ism",
  "ate",
  "iti",
  "ous",
  "ive",
  "ize",
];

const cache = new Map<string, string>();

export function stem(input: string): string {
  const cached = cache.get(input);
  if (cached !== undefined) return cached;
  let word = input;
  if (word.length > 2 && /^[a-z]+$/.test(word)) {
    // Step 1a
    if (word.endsWith("sses")) word = word.slice(0, -2);
    else if (word.endsWith("ies")) word = word.slice(0, -2);
    else if (!word.endsWith("ss") && word.endsWith("s")) word = word.slice(0, -1);
    // Step 1b
    let extra = false;
    if (word.endsWith("eed")) {
      if (measure(word.slice(0, -3)) > 0) word = word.slice(0, -1);
    } else if (word.endsWith("ed") && hasVowel(word.slice(0, -2))) {
      word = word.slice(0, -2);
      extra = true;
    } else if (word.endsWith("ing") && hasVowel(word.slice(0, -3))) {
      word = word.slice(0, -3);
      extra = true;
    }
    if (extra) {
      if (word.endsWith("at") || word.endsWith("bl") || word.endsWith("iz")) word += "e";
      else if (endsDoubleConsonant(word) && !/[lsz]$/.test(word)) word = word.slice(0, -1);
      else if (measure(word) === 1 && endsCvc(word)) word += "e";
    }
    // Step 1c
    if (word.endsWith("y") && hasVowel(word.slice(0, -1))) word = `${word.slice(0, -1)}i`;
    // Step 2
    for (const [suffix, replacement] of STEP2) {
      if (word.endsWith(suffix)) {
        word = replaceIf(word, suffix, replacement, 0) ?? word;
        break;
      }
    }
    // Step 3
    for (const [suffix, replacement] of STEP3) {
      if (word.endsWith(suffix)) {
        word = replaceIf(word, suffix, replacement, 0) ?? word;
        break;
      }
    }
    // Step 4
    for (const suffix of STEP4) {
      if (!word.endsWith(suffix)) continue;
      const base = word.slice(0, -suffix.length);
      if (measure(base) > 1 && (suffix !== "ion" || /[st]$/.test(base))) word = base;
      break;
    }
    // Step 5a
    if (word.endsWith("e")) {
      const base = word.slice(0, -1);
      const m = measure(base);
      if (m > 1 || (m === 1 && !endsCvc(base))) word = base;
    }
    // Step 5b
    if (measure(word) > 1 && endsDoubleConsonant(word) && word.endsWith("l")) word = word.slice(0, -1);
  }
  // A large library has tens of thousands of different words, and every search scores
  // hundreds of passages: a cache smaller than the vocabulary is emptied on every search.
  if (cache.size > 200_000) cache.clear();
  cache.set(input, word);
  return word;
}
