/**
 * Reading what a model wrote from the library before it is shown as settled.
 *
 * A small model follows "cite the passage" loosely. Tried with real ones (docs/ai.md,
 * "Measured with a real model"), the faults are few and recognisable:
 *
 *  - it says the passages do not answer, and puts markers on that sentence anyway;
 *  - it cites a number no passage carried ("[7]" when five were given), often because
 *    it numbers its own sentences, or copies the passages out and keeps counting;
 *  - it cites every passage it was given, whichever one it used.
 *
 * So, once the reply is complete:
 *
 *  - A reply whose first sentence says the passages do not answer is reported as the
 *    library not covering the question, and every marker is taken out of it: a marker
 *    on "nothing was found" supports nothing, and Outpost will not list passages under
 *    such a reply as if they were what it rests on. A first sentence that goes on with
 *    "but" or "however" is a caveat in front of an answer, not a refusal.
 *  - A marker to a number that was never given is never shown as a source. It is
 *    pointed at a passage only when the words it stands on are that passage's own
 *    words: the sentence (or, for a marker that opens a line, the line) is, word for
 *    word, one or more whole sentences of exactly one passage. Then the marker claims
 *    no more than that the passage says this, which it does, by construction. Anything
 *    less is refused, however close: a sentence that shares most of its words with a
 *    passage can still drop the "not" or change a number. A marker that cannot be
 *    pointed that way is removed, and the sentence stands without one.
 *  - Citing everything is only reported. Outpost cannot tell which passage was meant.
 *
 * Nothing here judges whether a real passage says what the sentence claims. That still
 * needs a reader, which is why every marker opens its passage.
 */
import type { Citation } from "../retrieval/types.ts";

/** The sentence the model is told to begin with when the passages hold no answer (retrieval/prompt.ts). */
export const NOT_ANSWERED_SENTENCE = "The sources do not answer this.";

export interface TidiedReply {
  /** "not-covered" when the reply says the passages do not answer the question. */
  outcome: "answered" | "not-covered";
  /**
   * The reply as it is to be shown. For "not-covered": the model's own words without
   * any marker, or nothing when all it wrote was that the passages do not answer.
   */
  text: string;
  /** The markers left in `text`, every one of them a passage that was given. */
  used: number[];
  /** Numbers the model cited that no passage carried. None of them is left in `text` as written. */
  unsupported: number[];
  /** Markers to numbers never given that now point at the one passage holding the words they stood on. */
  repointed: Array<{ from: number; to: number }>;
  /** Three or more passages were given and the reply cites every one of them. */
  citesAll: boolean;
}

/** "[2]", and "[1, 3]" as some models write it. The same rule as `checkCitations`. */
const MARKER = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g;
/** "[1-8]": a model citing a run of passages in one go. */
const RANGE = /\[(\d{1,3})\s*[-–]\s*(\d{1,3})\]/g;

/**
 * How a small model says the passages hold no answer. Tested against the first sentence
 * of a reply only: "the passages do not say how long" at the end of a real answer is a
 * caveat, not a refusal.
 *
 * Each pattern needs the passages, or the model itself, to be what the sentence is
 * about: "The passages do not say…", "There is no information about it in the
 * sources", "It is not mentioned in the documents", "I could not find…". Words such as
 * "cannot", "not available" or "not found" on their own are not enough, because
 * instructions are full of them ("If you cannot find clean water, boil what you have").
 */
const SOURCE = String.raw`(?:passages?|sources?|library|texts?|documents?|context|manual|information\s+(?:provided|given))`;
/** The start of a sentence about the passages: "The provided passages", "The wood stove manual", "These sources above". */
const ABOUT_SOURCES = new RegExp(
  String.raw`^(?:(?:the|these|those|this|your|my)\s+)?(?:(?!(?:of|from|in|with|for|at|on|by|to|into|if|when|unless|where)\b)[\p{L}\d'’-]+\s+){0,3}?${SOURCE}\b(?:(?![^.!?\n]*\b(?:that|which|who|where)\b)[^.!?\n]){0,80}?\b(?:do(?:es)?\s+not|don['’]t|doesn['’]t|did\s+not|didn['’]t)\s+(?:seem\s+to\s+)?(?:answer|contain|mention|provide|cover|include|say|specify|state|address|give|have|discuss|hold)\b`,
  "iu",
);
const IN_SOURCES = String.raw`\b(?:in|from|by|within)\s+(?:the\s+|these\s+|those\s+|your\s+)?(?:(?:provided|given|above|available|following)\s+)?${SOURCE}\b`;
const REFUSALS: RegExp[] = [
  ABOUT_SOURCES,
  // "There is no information about X in the provided sources."
  new RegExp(
    String.raw`^(?:there\s+is|there['’]s|there\s+are|there\s+was)\s+no\s+(?:information|mention|answer|reference|details?|data|record)\b[^.!?\n]{0,160}${IN_SOURCES}`,
    "iu",
  ),
  // "No information about X is given in the sources."
  new RegExp(String.raw`^no\s+(?:information|mention|answer)\b[^.!?\n]{0,160}${IN_SOURCES}`, "iu"),
  // "X is not mentioned in the sources provided."
  new RegExp(
    String.raw`\b(?:is|are|was|were)\s+not\s+(?:mentioned|covered|stated|specified|found|provided|addressed|given|included|answered|discussed)\s*${IN_SOURCES}`,
    "iu",
  ),
  // The model about itself: "I could not find…", "I have no information…", "I don't know."
  /^(?:(?:sorry|unfortunately|i['’]m\s+sorry)[,\s]+)?i\s+(?:cannot|can['’]t|could\s+not|couldn['’]t|am\s+unable\s+to|was\s+unable\s+to|am\s+not\s+able\s+to|was\s+not\s+able\s+to|did\s+not|didn['’]t|do\s+not|don['’]t)\s+(?:find|answer|determine|provide|say|see|know|have)\b/iu,
  /^(?:(?:sorry|unfortunately)[,\s]+)?i\s+(?:found|see|have|could\s+find|can\s+find)\s+no\s+(?:information|mention|answer|reference|passages?|details?)\b/iu,
];
/** "The sources do not say exactly, but…": the refusal is a caveat in front of an answer. */
const BUT = /\b(but|however|although|though|except)\b/i;

/** The first sentence of a reply, without the markers and brackets a model may open with. */
function opening(text: string): string {
  const start = text
    .trim()
    .replace(/^(\s*\[[^\]\n]{0,12}\]\s*)+/, "")
    .replace(/^[\s"'“”*_>-]+/, "");
  const end = /[.!?](\s|$)|\n/.exec(start);
  return (end ? start.slice(0, end.index + 1) : start).slice(0, 260);
}

/**
 * Whether a reply opens by saying the passages do not answer the question.
 *
 * A first sentence with a marker to a passage that was given, inside the sentence ("…for
 * one minute [1]."), is an answer resting on that passage, whatever words it uses. A
 * marker after the full stop of a refusal ("There is no information about it in the
 * sources. [1]") is the fault described at the top of this file, and does not make it an
 * answer; nor does a marker on the very sentence the model was told to write.
 * `given` is the markers the passages carried; without it, any number counts as given.
 */
export function saysNotAnswered(text: string, given?: ReadonlySet<number>): boolean {
  const first = opening(text);
  const bare = withoutMarkers(first);
  if (words(bare).join(" ") === words(NOT_ANSWERED_SENTENCE).join(" ")) return true;
  // The opening markers were taken off and the sentence ends at its stop, so a marker left in it is inside it.
  for (const match of first.matchAll(MARKER))
    if (match[1]!.split(/[,;]/).some((number) => !given || given.has(Number(number)))) return false;
  for (const pattern of REFUSALS) {
    const match = pattern.exec(bare);
    if (match && !BUT.test(bare.slice(match.index))) return true;
  }
  return false;
}

/** Words, in order, lower case, without punctuation or markers. "2,000" and "5 °C" keep their figures. */
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/\[[^\]\n]{0,40}\]/g, " ")
    .replace(/[’]/g, "'")
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/[^\p{L}\p{N}'%°]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/** A passage as its sentences, each as words. */
function sentencesOf(text: string): string[][] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(words)
    .filter((sentence) => sentence.length > 0);
}

/** The fewest words a stretch of text must have before it is matched to a passage at all. */
const FEWEST_WORDS = 4;

/** Whether `stretch` is, word for word, one or more consecutive whole sentences of `sentences`. */
function isWholeSentences(stretch: readonly string[], sentences: readonly string[][]): boolean {
  for (let first = 0; first < sentences.length; first += 1) {
    let at = 0;
    for (let index = first; index < sentences.length && at < stretch.length; index += 1) {
      const sentence = sentences[index]!;
      if (at + sentence.length > stretch.length) break;
      if (!sentence.every((word, offset) => stretch[at + offset] === word)) break;
      at += sentence.length;
    }
    if (at === stretch.length) return true;
  }
  return false;
}

/**
 * The words a marker at `at` (of length `length`) stands on. A marker that opens a line
 * labels the line after it ("[6] Boiling is the surest way…"); a marker after a full
 * stop belongs to the sentence before it ("…for one minute. [7]"); otherwise it belongs
 * to the sentence it ends.
 */
function wordsUnder(text: string, at: number, length: number): string[] {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  if (!/\S/.test(text.slice(lineStart, at).replace(MARKER, ""))) {
    let end = text.indexOf("\n", at + length);
    if (end === -1) end = text.length;
    return words(text.slice(at + length, end));
  }
  // Back over the markers and spaces just before this one: "[1][7]" stands on one sentence.
  const before = text.slice(0, at).replace(/(\s*\[[^\]\n]{0,12}\])*\s*$/, "");
  const end = before.length;
  // A marker after the closing stop belongs to the sentence that stop closes.
  const stop = /[.!?]["'”)]*$/.exec(before);
  let start = stop ? stop.index : end;
  while (start > lineStart && !/[.!?\n]/.test(text[start - 1]!)) start -= 1;
  return words(text.slice(start, end));
}

/** Takes the markers out of a reply, and the space each leaves behind. */
function withoutMarkers(text: string): string {
  return tidySpaces(text.replace(RANGE, "").replace(MARKER, "")).trim();
}

const tidySpaces = (text: string) =>
  text
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "");

export function tidyReply(written: string, citations: readonly Pick<Citation, "marker" | "quote">[]): TidiedReply {
  const given = new Set(citations.map((citation) => citation.marker));
  // "[1-3]" is three markers.
  const text = written.replace(RANGE, (whole, from: string, to: string) => {
    const first = Number(from);
    const last = Number(to);
    if (last < first || last - first > 30) return whole;
    return Array.from({ length: last - first + 1 }, (_, index) => `[${first + index}]`).join("");
  });

  if (saysNotAnswered(text, given)) {
    const all = new Set<number>();
    for (const match of text.matchAll(MARKER)) for (const number of match[1]!.split(/[,;]/)) all.add(Number(number));
    const plain = withoutMarkers(text);
    // All it wrote was that the passages do not answer: there is nothing of its own to show.
    const onlyThat = words(plain).length <= words(NOT_ANSWERED_SENTENCE).length + 1 && !/\n/.test(plain);
    return {
      outcome: "not-covered",
      text: onlyThat ? "" : plain,
      used: [],
      unsupported: [...all].filter((marker) => !given.has(marker)).sort((a, b) => a - b),
      repointed: [],
      citesAll: false,
    };
  }

  const passages = citations.map((citation) => ({ marker: citation.marker, sentences: sentencesOf(citation.quote) }));
  const unsupported = new Set<number>();
  const used = new Set<number>();
  const repointed: TidiedReply["repointed"] = [];
  let changed = false;
  const shown = text.replace(MARKER, (whole, list: string, at: number) => {
    const numbers = list.split(/[,;]/).map(Number);
    const real = numbers.filter((marker) => given.has(marker));
    const stray = numbers.filter((marker) => !given.has(marker));
    for (const marker of stray) unsupported.add(marker);
    if (stray.length === 0) {
      for (const marker of real) used.add(marker);
      return whole;
    }
    changed = true;
    const kept = [...real];
    // Only a marker with no real number beside it is pointed anywhere: one that has one already says where it rests.
    if (real.length === 0) {
      const under = wordsUnder(text, at, whole.length);
      const holders = under.length >= FEWEST_WORDS ? passages.filter((passage) => isWholeSentences(under, passage.sentences)) : [];
      if (holders.length === 1) {
        kept.push(holders[0]!.marker);
        for (const from of stray) repointed.push({ from, to: holders[0]!.marker });
      }
    }
    for (const marker of kept) used.add(marker);
    return kept.map((marker) => `[${marker}]`).join("");
  });

  const all = [...used].sort((a, b) => a - b);
  return {
    outcome: "answered",
    text: changed ? tidySpaces(shown).trim() : text,
    used: all,
    unsupported: [...unsupported].sort((a, b) => a - b),
    repointed,
    citesAll: citations.length >= 3 && all.length === citations.length,
  };
}
