/**
 * Judging one answer of the evaluation: was the question answered rightly, from the
 * right passage, and are its citation markers what they claim to be.
 *
 * It judges what a person is shown, by rule, with no model: the patterns of the
 * question (questions.ts) for the fact, and the passages that were given for the
 * markers. That is cruder than a reader, and it is the same every time, which is what
 * a before-and-after comparison needs.
 */
import type { EvalQuestion } from "./questions.ts";

/** A passage the model was given, as the answer's `sources` event lists it. */
export interface GivenPassage {
  marker: number;
  /** The id of the document in library.ts. */
  document: string;
  heading: string | null;
  /** The passage's text as it was sent. */
  quote: string;
}

export interface EvalReply {
  /** What Outpost said happened: "answered", "nothing-found", and whatever a later version adds. */
  outcome: string;
  /** The answer as shown to the person. */
  text: string;
  given: GivenPassage[];
  cutShort: boolean;
  /** Set when the answer failed: the model server's failure, in a word. */
  failure: string | null;
}

export type Verdict =
  /** Answerable: the fact is right and the passage that holds it is cited. */
  | "correct"
  /** Answerable: the fact is right, but the passage that holds it is not cited. */
  | "correct-uncited"
  /** Answerable, the passage was given, and the reply says the library does not answer. */
  | "missed"
  /** Answerable, but search did not hand the passage over, and the reply rightly says it cannot answer. */
  | "not-retrieved"
  /** Answerable: an answer without the fact, or with the wrong one. */
  | "wrong"
  /** Not answerable, and the reply says so (or nothing was found and the model was not asked). */
  | "refused"
  /** Not answerable, and an answer was given all the same. */
  | "made-up"
  /** The model server failed. */
  | "failed";

export interface CitationFaults {
  /** A marker for a number that no passage carried. */
  invented: boolean;
  /** Three or more passages were given and every one of them is cited. */
  everything: boolean;
  /** The reply says nothing answers, and cites all the same. */
  afterRefusal: boolean;
  /** An answer with no marker that leads to a passage. */
  none: boolean;
}

export interface Judgement {
  verdict: Verdict;
  faults: CitationFaults;
  /** The model was asked (false when nothing was found, so nothing was sent). */
  asked: boolean;
  /** The passage that answers was among those given. Null for a question nothing answers. */
  retrieved: boolean | null;
  refused: boolean;
}

/** As the server reads them: "[2]", and "[1, 3]". */
const MARKER = /\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g;

/**
 * The ways a small model says the passages do not hold the answer. Only the opening of
 * a reply is searched: "the sources do not say how long, but…" in the last line of a
 * real answer is not a refusal.
 */
const REFUSAL =
  /\b(do(es)?\s+not|don['’]t|doesn['’]t|did\s+not)\s+(seem\s+to\s+)?(answer|contain|mention|provide|cover|include|say|specify|state|address|give|have|discuss|hold)\b|\bno\s+(information|mention|answer|relevant|passage|source)|\bnot\s+(mentioned|covered|stated|specified|found|provided|addressed|available|answered|given|included)\b|\b(cannot|can['’]t|could\s+not|couldn['’]t|unable\s+to)\s+(answer|find|determine|provide|say)\b|\bnothing\s+(in|about)\b/i;

export function markersIn(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(MARKER)) for (const number of match[1]!.split(/[,;]/)) found.add(Number(number));
  return [...found].sort((a, b) => a - b);
}

/** Whether a reply says the library does not answer. `outcome` is Outpost's own word for it, when it has one. */
export function isRefusal(reply: Pick<EvalReply, "outcome" | "text">): boolean {
  if (reply.outcome !== "answered") return true;
  return REFUSAL.test(reply.text.trim().slice(0, 260));
}

export function judge(question: EvalQuestion, reply: EvalReply): Judgement {
  const asked = reply.outcome !== "nothing-found" && !(reply.failure && !reply.text.trim());
  const answer = question.answeredBy;
  const right = answer
    ? reply.given.filter(
        (passage) =>
          passage.document === answer.document && passage.heading === answer.heading && (!answer.holds || answer.holds.test(passage.quote)),
      )
    : [];
  const retrieved = question.answeredBy ? right.length > 0 : null;
  const noFaults: CitationFaults = { invented: false, everything: false, afterRefusal: false, none: false };
  if (reply.failure) return { verdict: "failed", faults: noFaults, asked, retrieved, refused: false };

  const refused = isRefusal(reply);
  const shown = markersIn(reply.text);
  const numbers = new Set(reply.given.map((passage) => passage.marker));
  const real = shown.filter((marker) => numbers.has(marker));
  const faults: CitationFaults = asked
    ? {
        invented: shown.some((marker) => !numbers.has(marker)),
        everything: reply.given.length >= 3 && real.length === reply.given.length,
        afterRefusal: refused && shown.length > 0,
        none: !refused && real.length === 0,
      }
    : noFaults;

  const forbidden = (question.mustNotSay ?? []).some((pattern) => new RegExp(pattern.source, "i").test(reply.text));
  let verdict: Verdict;
  if (!question.answeredBy) {
    verdict = refused && !forbidden ? "refused" : "made-up";
  } else if (refused) {
    verdict = retrieved ? "missed" : "not-retrieved";
  } else {
    const fact = (question.says ?? []).every((pattern) => new RegExp(pattern.source, "i").test(reply.text)) && !forbidden;
    if (!fact) verdict = "wrong";
    else verdict = right.some((passage) => real.includes(passage.marker)) ? "correct" : "correct-uncited";
  }
  return { verdict, faults, asked, retrieved, refused };
}

export interface Tally {
  answerable: number;
  unanswerable: number;
  correct: number;
  correctUncited: number;
  missed: number;
  notRetrieved: number;
  wrong: number;
  refused: number;
  madeUp: number;
  failed: number;
  /** Replies the model wrote, which is what the citation faults are counted over. */
  asked: number;
  invented: number;
  everything: number;
  afterRefusal: number;
  none: number;
  cut: number;
}

export function tally(rows: Array<{ question: EvalQuestion; reply: EvalReply; judgement: Judgement }>): Tally {
  const count = (test: (row: (typeof rows)[number]) => boolean) => rows.filter(test).length;
  return {
    answerable: count((row) => row.question.answeredBy !== null),
    unanswerable: count((row) => row.question.answeredBy === null),
    correct: count((row) => row.judgement.verdict === "correct"),
    correctUncited: count((row) => row.judgement.verdict === "correct-uncited"),
    missed: count((row) => row.judgement.verdict === "missed"),
    notRetrieved: count((row) => row.judgement.verdict === "not-retrieved"),
    wrong: count((row) => row.judgement.verdict === "wrong"),
    refused: count((row) => row.judgement.verdict === "refused"),
    madeUp: count((row) => row.judgement.verdict === "made-up"),
    failed: count((row) => row.judgement.verdict === "failed"),
    asked: count((row) => row.judgement.asked),
    invented: count((row) => row.judgement.faults.invented),
    everything: count((row) => row.judgement.faults.everything),
    afterRefusal: count((row) => row.judgement.faults.afterRefusal),
    none: count((row) => row.judgement.faults.none),
    cut: count((row) => row.reply.cutShort),
  };
}
