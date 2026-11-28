/**
 * What a question is about, and which sources suit it.
 *
 * Scoring (score.ts) weighs words; it cannot tell that a question about rescue breaths
 * is better answered by a first aid manual than by a hiking forum that uses the same
 * words, or that "CPR" in a railway history is another word altogether. So after the
 * words are scored, two mild corrections are made, and each is said beside the result:
 *
 *  - **Favoured sources.** A question about first aid or medicine favours medical and
 *    first aid sources (a collection, category, tag or title saying so: WikiMed, the
 *    NHS, a first aid manual); a "how to" question favours questions and answers,
 *    manuals and guides; one about a car, vehicle sources; one about using a generator,
 *    a heater or anything with carbon monoxide safely, official safety publications.
 *    Each multiplies the score by at most `MOST_FAVOUR` together: a tie-breaker among
 *    results the words found about equally, not a way past a better match.
 *  - **Another meaning.** A few words have a strong other meaning ("CPR" is also the
 *    Canadian Pacific Railway; a "generator" in electronics makes signals). When the
 *    question is in one sense and a result is plainly in the other, its score counts
 *    `OTHER_SENSE` of itself. A question that itself names the other sense ("CPR
 *    railway") is taken at its word.
 */
import { TOPICS } from "../kiwix/routing.ts";
import { ACTION_WORDS } from "./query.ts";
import { stem } from "./stem.ts";

/** The most the favoured-source priors together multiply a score by. */
export const MOST_FAVOUR = 1.3;
/** What a result plainly in another sense of an ambiguous word keeps of its score. */
export const OTHER_SENSE = 0.75;
/**
 * What a result keeps of its score when its collection is plainly about another subject than
 * the question: a radio manual for "car battery flat", a woodshop forum for "first aid kit
 * list", a nursing textbook for "change a tyre". The subjects are those reference collections
 * are routed by (kiwix/routing.ts). Collections for the whole household (preparedness,
 * outdoors, repair, water) are about every question.
 */
export const OTHER_SUBJECT = 0.9;
/**
 * What a medical reference article keeps of its score when its title names none of what a medical question is
 * about. Asked "can I take paracetamol and ibuprofen together", the NHS pages on taking diphenhydramine, acrivastine
 * and loratadine with other medicines came first: each mentions both painkillers in passing, and held every word.
 * An encyclopaedia or a medicines guide titles an article by its subject, so one titled for another medicine or
 * condition is about that one. Only articles: a first aid manual's title never names the question.
 */
export const NAMES_ANOTHER = 0.85;
/** Subjects every household question may belong to: a collection about one of them is never off the subject. */
const EVERY_SUBJECT = new Set(["preparedness", "outdoors", "repair", "water"]);
const subjectStems = TOPICS.map((topic) => new Set(topic.query.split(" ").map((word) => stem(word))));

export interface IntentQuery {
  /** The words that matter, as parsed (query.ts), each with any other ways of saying it. */
  words: string[];
  /** Small words typed and left out ("how", "to"): they still say what kind of question it is. */
  ignored: string[];
}

export interface IntentSource {
  title: string;
  /** Where it is: a reference article's collection, a document's category, a page's notebook. */
  collection: string | null;
  tags: string[];
  /** Text it shows (a snippet), for telling which sense a word is in. */
  text?: string;
  /** True for a reference article: its own title says what it is about, not what kind of source it is. */
  article?: boolean;
}

export interface IntentAdjustment {
  /** Multiplies the score. 1 when nothing applies. */
  factor: number;
  /** Said beside the result: "favoured: first aid source", "another meaning of “cpr”". Empty when nothing applies. */
  notes: string[];
  /** A first aid or medical source, for a question about first aid or medicine. */
  trusted?: boolean;
}

const stems = (text: string) => new Set(text.split(" ").map((word) => stem(word)));

const MEDICAL = stems(
  "burn burns scald wound wounds bleed bleeding blood nosebleed cpr resuscitation resuscitate hypothermia frostbite " +
    "heatstroke dehydration diarrhoea diarrhea vomit vomiting fever infection infected bite sting snake poison poisoning fracture " +
    "sprain splint bandage dressing medicine medicines medication dose tablet symptom symptoms pain injury injured choking " +
    "allergy allergic anaphylaxis asthma diabetes shock concussion rash pregnancy antibiotic paracetamol ibuprofen aspirin " +
    "doctor hospital illness sick headache cough flu heart stroke sunburn compressions breaths breathing unconscious " +
    "recovery position casualty paramedic seizure faint fainting",
);
const VEHICLE = stems(
  // Not fuel: "store petrol safely" is about a shed, not a car.
  "car cars vehicle van truck lorry tyre tyres tire tires engine brake brakes clutch gearbox coolant radiator " +
    "exhaust alternator wiper wipers headlight motorbike motorcycle mot puncture driving driver windscreen windshield",
);
/** Things whose safe use is a matter of official guidance. */
const HAZARD = stems("generator generators heater heaters chainsaw candle candles stove stoves barbecue bbq gas fuel petrol paraffin");
const SAFETY = stems("safe safely safety danger dangerous risk risks hazard indoors poisoning");
const HOW_WORDS = new Set(["how"]);
const ACTION = stems("fix repair replace change make build tie use mend start stop treat purify store");

const MEDICAL_SOURCE =
  /\b(medic\w*|health|nhs|first[- ]aid|wikimed|clinical|nursing|paramedic\w*|red cross|st john|ambulance|resuscitation)\b/i;
const FIRST_AID_SOURCE = /\bfirst[- ]aid\b/i;
const ENCYCLOPAEDIA = /\b(wikipedia|wikimed|encyclopa?edias?)\b/i;
/**
 * What an encyclopaedia's article keeps of its score for a question asking what to do about an injury or an illness
 * ("what to do for a burn", "treat a snake bite"): its article on a burn says what a burn is, and a first aid manual
 * what to do. Every burn article's title holds "burn", as "Ken Burns" does, and came before the first aid manual.
 */
export const SAYS_WHAT_IT_IS = 0.9;
const HOW_TO_SOURCE =
  /\b(questions and answers|q&a|stack ?exchange|manuals?|handbooks?|guides?|how[- ]to|wikihow|instructions|instructables|ifixit)\b/i;
const VEHICLE_SOURCE = /\b(motor|vehicles?|mechanics?|cars?|automotive|driving|highway code)\b/i;
const SAFETY_SOURCE =
  /\b(safety|fire (and rescue|service|brigade)|hse|osha|cdc|fema|ready\.gov|red cross|government|gov\.uk|public health|nhs|official)\b/i;

interface Sense {
  /** The ambiguous word, by stem. */
  word: string;
  /** The question is in the household's sense of it: beside these words, or (when null) always. */
  context: Set<string> | null;
  /** A source plainly in the other sense. */
  other: RegExp;
}

const SENSES: Sense[] = [
  { word: stem("cpr"), context: null, other: /\b(railway|railroad|canadian pacific|locomotives?|rail line|freight)\b/i },
  {
    word: stem("generator"),
    context: stems(
      "safe safely safety power cut outage blackout backup portable petrol diesel fuel use run running carbon monoxide home house",
    ),
    other:
      /\b(function generator|signal generator|random( number)? generator|code generator|pwm|waveform|pulse generator|tone generator|generator functions?|python|javascript|yield)\b/i,
  },
  { word: stem("stroke"), context: MEDICAL, other: /\b(two[- ]stroke|four[- ]stroke|pistons?|swimming|golf|brush ?strokes?)\b/i },
  { word: stem("shock"), context: MEDICAL, other: /\b(shock absorbers?|suspension|dampers?)\b/i },
  // Bleeding on its own is a person's ("bleeding wont stop"); "bleeding brakes" names the other sense and is taken at its word.
  { word: stem("bleeding"), context: null, other: /\b(brakes?|brake fluid|radiators?|bleed valves?|bleed screws?|hydraulic)\b/i },
];

export interface Intent {
  medical: boolean;
  howTo: boolean;
  vehicle: boolean;
  safety: boolean;
  /** Ambiguous words of the question in the household's sense, with the pattern of the other sense. */
  senses: Array<{ word: string; other: RegExp }>;
  /** The question's words, stemmed. */
  stems: Set<string>;
  /** What it is about, stemmed: its words without those that say what to do ("take", "treat", "stop"). */
  about?: Set<string>;
  /** The subjects it is about (kiwix/routing.ts `TOPICS`), by id. Empty when its words name none. */
  subjects?: Set<string>;
}

/** What kind of question it is, from its words. */
export function intentOf(query: IntentQuery): Intent {
  const words = query.words.flatMap((word) => word.toLowerCase().split(/[^\p{L}\p{N}]+/u)).filter(Boolean);
  const stemmed = words.map((word) => stem(word));
  const has = (set: Set<string>) => stemmed.some((word) => set.has(word));
  const phrase = words.join(" ");
  const ignored = query.ignored.map((word) => word.toLowerCase());
  const typed = [...words, ...ignored].join(" ");
  const senses = SENSES.filter(
    (sense) =>
      stemmed.includes(sense.word) &&
      (sense.context === null || stemmed.some((word) => word !== sense.word && sense.context!.has(word))) &&
      // "CPR railway" is about the railway.
      !sense.other.test(typed),
  ).map((sense) => ({ word: words[stemmed.indexOf(sense.word)]!, other: sense.other }));
  return {
    medical: has(MEDICAL) || phrase.includes("first aid"),
    howTo:
      ignored.some((word) => HOW_WORDS.has(word)) ||
      (ignored.includes("what") && ignored.includes("do")) ||
      (stemmed.length > 1 && ACTION.has(stemmed[0]!)),
    vehicle: has(VEHICLE),
    safety: phrase.includes("carbon monoxide") || (has(HAZARD) && has(SAFETY)),
    senses,
    stems: new Set(stemmed),
    about: new Set(words.filter((word) => !ACTION_WORDS.has(word)).map((word) => stem(word))),
    subjects: new Set(TOPICS.filter((_, index) => stemmed.some((word) => subjectStems[index]!.has(word))).map((topic) => topic.id)),
  };
}

/** True when the intent asks for nothing to be adjusted. */
export function plainIntent(intent: Intent): boolean {
  return !intent.medical && !intent.howTo && !intent.vehicle && !intent.safety && intent.senses.length === 0 && !intent.subjects?.size;
}

/** True when `collection` is plainly about a subject, and none of the question's: "Radio communications" for a car question. */
function offSubject(intent: Intent, collection: string | null): boolean {
  if (!collection || !intent.subjects?.size) return false;
  const about = TOPICS.filter((topic) => topic.archive.test(collection.toLowerCase())).map((topic) => topic.id);
  if (about.length === 0 || about.some((id) => EVERY_SUBJECT.has(id))) return false;
  return !about.some((id) => intent.subjects!.has(id));
}

/**
 * Asked what to do about an injury or an illness, an encyclopaedia's article says what it is (`SAYS_WHAT_IT_IS`): its
 * title naming the injury does not make it the answer, and it is not favoured as a medical source.
 */
export function saysWhatItIs(intent: Intent, source: Pick<IntentSource, "collection" | "article">): boolean {
  return intent.medical && intent.howTo && Boolean(source.article) && ENCYCLOPAEDIA.test(source.collection ?? "");
}

/** How a result's score is adjusted for the kind of question, and why. */
export function adjustFor(intent: Intent, source: IntentSource): IntentAdjustment {
  if (plainIntent(intent)) return { factor: 1, notes: [], trusted: false };
  // What kind of source it is: a reference article by its collection; one of the person's own by that, its tags, and
  // the words of its title that are not the question's ("First aid manual" for "rescue breaths" is a first aid source;
  // "Electric car battery chemistry" for "car battery" is not a vehicle source by saying "car").
  const ownTitle = source.article
    ? ""
    : source.title
        .split(/([^\p{L}\p{N}]+)/u)
        .map((part) => (intent.stems.has(stem(part.toLowerCase())) ? " " : part))
        .join("");
  const kind = [source.collection ?? "", ...source.tags, ownTitle].join(" \n ");
  let favour = 1;
  const kinds: string[] = [];
  const trusted = intent.medical && MEDICAL_SOURCE.test(kind);
  const aboutOnly = saysWhatItIs(intent, source);
  if (trusted && !aboutOnly) {
    favour *= 1.25;
    kinds.push(FIRST_AID_SOURCE.test(kind) ? "first aid source" : "medical source");
  }
  if (intent.safety && SAFETY_SOURCE.test(kind)) {
    favour *= 1.25;
    kinds.push("safety guidance");
  }
  if (intent.vehicle && VEHICLE_SOURCE.test(kind)) {
    favour *= 1.2;
    kinds.push("vehicle source");
  }
  if (intent.howTo && HOW_TO_SOURCE.test(kind)) {
    favour *= 1.1;
    kinds.push("how-to source");
  }
  // The strongest reason is said; two would make the line long and say little more.
  const notes = kinds.length > 0 ? [`favoured: ${kinds[0]}`] : [];
  let factor = Math.min(MOST_FAVOUR, favour);
  const shown = `${source.title} \n ${source.collection ?? ""} \n ${source.text ?? ""}`;
  if (offSubject(intent, source.collection)) {
    factor *= OTHER_SUBJECT;
    notes.push("on another subject");
  }
  if (
    trusted &&
    source.article &&
    intent.about?.size &&
    !source.title
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .some((word) => intent.about!.has(stem(word)))
  ) {
    factor *= NAMES_ANOTHER;
    notes.push("about something else");
  }
  if (aboutOnly) {
    factor *= SAYS_WHAT_IT_IS;
    notes.push("says what it is, not what to do");
  }
  for (const sense of intent.senses) {
    if (sense.other.test(shown)) {
      factor *= OTHER_SENSE;
      notes.push(`another meaning of “${sense.word}”`);
    }
  }
  return { factor, notes, trusted };
}

/**
 * A score adjusted, on the same 0–1 scale, to three places. Lowered, it is multiplied.
 * Raised, it is multiplied too, but never by more than it lacks of full marks divided
 * the same way: 0.4 × 1.25 is 0.5, while 0.9 rises only to 0.92. A favoured result never
 * reaches 1, and two results the words put far apart stay apart.
 */
export function adjusted(score: number, factor: number): number {
  const value = factor <= 1 ? score * factor : Math.min(score * factor, 1 - (1 - score) / factor);
  return Math.round(Math.max(0, value) * 1000) / 1000;
}
