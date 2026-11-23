/**
 * Which reference collections to search first for a question.
 *
 * Every archive searched costs kiwix-serve seconds on a Raspberry Pi with its archives on
 * a network share, and most archives cannot hold the answer: the Arduino questions say
 * nothing about a burn. So each archive gets a prior for the question, from what it says
 * it is (its title, description, catalogue category and tags) and from how it did for the
 * same words lately, and only the best few are searched at first. The rest wait behind
 * "Search all reference collections", and are searched anyway when the first few find
 * too little (see `searchInParts` in index.ts).
 *
 * The prior, for each archive:
 *
 *   topic        0.5   the question is about a topic (medicine, vehicles, food…, by its
 *                      words) and the archive's title or description says it is about it
 *                      too; 0.3 when only its catalogue category or tags do; 0.15 for each
 *                      further topic the two share
 *   own words    0.25  for each of the question's words in the archive's title or
 *                      description, at most 0.5
 *   general      0.3   a general encyclopaedia (Wikipedia and the like, not one of a topic)
 *   how-to       0.1   the question asks how to do something and the archive is questions
 *                      and answers, a manual or a guide
 *   learned      0.3   times the share of recent searches for these words in which the
 *                      archive gave a good result
 *   language    −0.3   the archive is in no language that English questions read
 *
 * Ties go to the smaller archive, which answers sooner.
 */
import type { ParsedQuery } from "../search/query.ts";
import { stem } from "../search/stem.ts";

/** How many archives are searched first. */
export const ROUTED_FIRST = 6;
/**
 * The prior from which a collection fits a question well enough for a title that is the
 * question's subject to be its answer: a topic, or a general encyclopaedia.
 */
export const TITLE_ANSWER_PRIOR = 0.3;
/** When only this many would be left over, they are searched with the first: holding them back saves nothing. */
export const ROUTED_SLACK = 2;

export interface ArchiveProfile {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  /** kiwix tags, "wikipedia;_category:wikipedia;_pictures:no". */
  tags?: string | null;
  /** "eng", "en", "eng,fra" … */
  language?: string | null;
  sizeBytes: number;
}

export interface RouteWords {
  /** The words that matter, each with its other ways of being said. */
  words: string[];
  /** The question asks how to do something ("how to …", "fix", "make"). */
  howTo: boolean;
}

interface Topic {
  id: string;
  /** Words of a question about it, as written; compared by stem. */
  query: string;
  /** What an archive about it says of itself. */
  archive: RegExp;
}

/**
 * The topics a household asks about, each with the words that show a question is about
 * it and the words that show an archive is. Kept short and plain; a question that fits
 * no topic still finds the general archives and those whose own words it uses.
 */
export const TOPICS: Topic[] = [
  {
    id: "medicine",
    query:
      "burn burns scald wound wounds bleed bleeding blood nosebleed cpr resuscitation hypothermia frostbite heatstroke dehydration " +
      "diarrhoea diarrhea vomit vomiting fever infection infected bite sting snake poison poisoning fracture sprain splint bandage " +
      "dressing medicine medicines medication dose tablet tablets symptom symptoms pain injury aid choking allergy allergic asthma " +
      "diabetes shock concussion rash pregnancy baby antibiotic paracetamol ibuprofen aspirin doctor hospital disease illness sick " +
      "headache cough cold flu heart stroke sunburn compressions breaths breathing unconscious recovery position carbon monoxide " +
      "splinter tick ticks lice",
    archive: /\b(medic|medicine|health|nhs|first aid|wikimed|clinical|nursing|drugs?\b)/,
  },
  {
    id: "vehicles",
    query:
      "car cars vehicle van truck lorry tyre tyres tire tires engine brake brakes clutch gearbox oil coolant radiator jump petrol " +
      "gasoline diesel exhaust spark alternator wiper wipers headlight motor motorbike motorcycle mot puncture driving",
    archive: /\b(motor|vehicles?|mechanic|cars?\b|automotive|trucks?\b)/,
  },
  {
    id: "bicycles",
    query: "bike bikes bicycle bicycles cycle cycling puncture chain derailleur spoke spokes saddle tube pedal",
    archive: /\b(bicycl|bikes?\b|cycling)/,
  },
  {
    id: "food",
    query:
      "food cook cooking recipe recipes bread yeast flour bake baking rice bean beans freezer freeze frozen fridge canning jar jars " +
      "pickle pickling preserve preserving dried meat fish egg eggs milk sugar salt flatbread soup stew vegetables " +
      "tinned canned ferment",
    archive: /\b(food|cook|recipe|kitchen|cuisine|canning|preserv)/,
  },
  {
    id: "water",
    query: "water purify purifying purification filter filtering filtration boil boiling bleach chlorine drinking well rainwater",
    archive: /\b(water|sanitation)\b/,
  },
  {
    id: "radio",
    query:
      "radio frequency frequencies channel channels antenna aerial mhz khz ham amateur callsign repeater repeaters vhf uhf hf morse " +
      "pmr446 cb transceiver",
    archive: /\b(radio|wireless|morse)\b/,
  },
  { id: "knots", query: "knot knots bowline hitch splice rope lashing", archive: /\b(knots?|rope)\b/ },
  {
    id: "outdoors",
    query:
      "fire camp camping tent hike hiking compass map navigation shelter survival wild bushcraft hypothermia matches tinder forage " +
      "foraging snow mountain",
    archive: /\b(outdoors?|scout|survival|camping|hiking|wilderness|bushcraft|nature)\b/,
  },
  {
    id: "garden",
    query:
      "garden gardening grow growing plant plants planting seed seeds soil compost potato potatoes tomato tomatoes vegetable vegetables " +
      "fruit tree trees prune blight pest pests weed weeds",
    archive: /\b(garden|plants?\b|agricultur|farm|sustainab)/,
  },
  {
    id: "repair",
    query: "fix fixing repair repairing broken replace replacing mend leak leaking dripping tap fuse socket wiring appliance",
    archive: /\b(repair|restart|fix|diy|how things work|mechanic)/,
  },
  {
    id: "electricity",
    query:
      "solar panel panels battery batteries charge charger charging voltage volt volts amp amps inverter usb circuit arduino led " +
      "resistor generator electricity electric wiring",
    archive: /\b(electronic|engineering|arduino|electric|solar|sustainab)/,
  },
  { id: "wood", query: "wood timber saw plane chisel joint joinery glue varnish", archive: /\bwood/ },
  { id: "printing", query: "print printer printing filament pla abs nozzle", archive: /\b3d print/ },
  { id: "brewing", query: "beer wine brew brewing fermentation mead cider hops", archive: /\bbrew/ },
  { id: "travel", query: "travel visit city airport border visa", archive: /\b(travel|voyage)/ },
  { id: "countries", query: "country countries population capital government economy", archive: /\b(factbook|countries of the world)/ },
  { id: "words", query: "meaning define definition word synonym spelling", archive: /\b(dictionary|wiktionary)/ },
  { id: "quotes", query: "quote quotes quotation saying proverb", archive: /\bquot/ },
  {
    id: "preparedness",
    query:
      "emergency prepare preparedness prepper disaster flood storm earthquake evacuation evacuate power cut outage blackout supplies " +
      "stockpile",
    archive: /\b(preparedness|prepp(er|ers|ing)|disasters?|emergenc\w*|survival)\b/,
  },
];

const topicStems = TOPICS.map((topic) => new Set(topic.query.split(" ").map((word) => stem(word))));
const GENERAL = /\b(wikipedia|encyclopa?edia)\b/;
const HOW_TO = /\b(questions and answers|stack exchange|stack_exchange|q&a|how-to|how to|wikihow|manual|manuals|guide|instructions|fix)\b/;
/** Words that ask how to do something. */
const HOW_TO_WORDS = new Set(["how", "fix", "make", "repair", "replace", "change", "build", "mend", "stop", "start", "treat"]);
/** Words of an archive's own description that say nothing about its subject. */
const PROFILE_NOISE = new Set(
  "the a an and or of for to in on with by from this that is are its it be edition complete smallest only without images pictures videos questions answers site stack exchange collection collections people their all".split(
    " ",
  ),
);
const ENGLISH = /(^|[,;\s])(en|eng)([,;\s]|$)/i;

/** The words that matter of a parsed question, for routing: each, and its other ways of being said. */
export function routeWords(parsed: ParsedQuery): RouteWords {
  const words = parsed.required
    .flatMap((term, index) => [term, ...(parsed.alternatives?.[index] ?? [])])
    .flatMap((term) => term.split(" "));
  const all = [...words, ...(parsed.ignored ?? [])].map((word) => word.toLowerCase());
  return { words, howTo: all.some((word) => HOW_TO_WORDS.has(word)) };
}

const tokens = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * What an archive says it is, in lower case: its title and description, which a person
 * wrote about this archive, and apart from them its catalogue category and tags, which are
 * shared by many archives ("preppers") and so say less.
 */
function profileOf(archive: ArchiveProfile): { strong: string; weak: string } {
  const tags = (archive.tags ?? "")
    .split(";")
    .filter((tag) => tag && !tag.startsWith("_") && !/^preppers?$/.test(tag))
    .join(" ")
    .replace(/_/g, " ");
  return {
    strong: `${archive.title} \n ${archive.description ?? ""}`.toLowerCase(),
    weak: `${archive.category ?? ""} \n ${tags}`.toLowerCase(),
  };
}

/** Remembers which archives gave good results for which words, lately. Kept in memory only; it starts again on restart. */
export interface RouteMemory {
  /** Notes how an archive did for the words of a search: whether it gave a good result. */
  record(words: string[], archiveId: string, good: boolean): void;
  /** The share of recent searches for any of these words in which the archive gave a good result; 0 if none were seen. */
  share(words: string[], archiveId: string): number;
  /** Forgets an archive, when it is removed or changes. */
  forget(archiveId: string): void;
}

export function createRouteMemory(limit = 2000): RouteMemory {
  // word stem → archive → how its last searches went, newest last; a Map keeps insertion order, so the oldest word goes first.
  const seen = new Map<string, Map<string, boolean[]>>();
  return {
    record(words, archiveId, good) {
      for (const word of new Set(words.map((item) => stem(item.toLowerCase())))) {
        let archives = seen.get(word);
        if (archives) seen.delete(word);
        else archives = new Map();
        seen.set(word, archives);
        // Only the last ten searches count, so an archive that stops answering well loses its place.
        archives.set(archiveId, [...(archives.get(archiveId) ?? []), good].slice(-10));
        while (seen.size > limit) seen.delete(seen.keys().next().value!);
      }
    },
    share(words, archiveId) {
      let best = 0;
      for (const word of new Set(words.map((item) => stem(item.toLowerCase())))) {
        const outcomes = seen.get(word)?.get(archiveId);
        if (outcomes?.length) best = Math.max(best, outcomes.filter(Boolean).length / outcomes.length);
      }
      return best;
    },
    forget(archiveId) {
      for (const archives of seen.values()) archives.delete(archiveId);
    },
  };
}

export interface Prior {
  id: string;
  prior: number;
  /** Why, in a few words: for tests and for the explainer. */
  reasons: string[];
}

/** The prior of one archive for a question (see the top of this file). */
export function priorOf(archive: ArchiveProfile, route: RouteWords, memory?: RouteMemory): Prior {
  const { strong, weak } = profileOf(archive);
  const profile = `${strong} \n ${weak}`;
  const profileStems = new Set(
    tokens(strong)
      .filter((word) => !PROFILE_NOISE.has(word))
      .map((word) => stem(word)),
  );
  const queryStems = [...new Set(route.words.map((word) => stem(word.toLowerCase())))];
  const reasons: string[] = [];
  let prior = 0;

  const asked = TOPICS.filter((_, index) => queryStems.some((word) => topicStems[index]!.has(word)));
  const said = asked.filter((topic) => topic.archive.test(strong));
  const filed = asked.filter((topic) => !said.includes(topic) && topic.archive.test(weak));
  if (said.length > 0 || filed.length > 0) {
    prior += (said.length > 0 ? 0.5 : 0.3) + 0.15 * (said.length + filed.length - 1);
    reasons.push(`topic: ${[...said, ...filed].map((topic) => topic.id).join(", ")}`);
  }
  const own = queryStems.filter((word) => word.length > 2 && profileStems.has(word));
  if (own.length > 0) {
    prior += Math.min(0.5, 0.25 * own.length);
    reasons.push(`own words: ${own.join(", ")}`);
  }
  // Wikipedia itself, not WikiMed or the knots of Wikipedia: those are about a topic.
  if (GENERAL.test(profile) && !TOPICS.some((topic) => topic.archive.test(strong))) {
    prior += 0.3;
    reasons.push("general");
  }
  if (route.howTo && HOW_TO.test(profile)) {
    prior += 0.1;
    reasons.push("how-to");
  }
  const learned = memory?.share(route.words, archive.id) ?? 0;
  if (learned > 0) {
    prior += 0.3 * learned;
    reasons.push(`learned ${learned.toFixed(2)}`);
  }
  if (archive.language && !ENGLISH.test(archive.language)) {
    prior -= 0.3;
    reasons.push("language");
  }
  return { id: archive.id, prior: Math.round(prior * 1000) / 1000, reasons };
}

/**
 * Puts the archives in the order they are worth searching for a question, and splits them
 * into those searched first and the rest. `always` are searched first whatever their
 * prior (an archive whose list of documents already matched, which costs kiwix-serve nothing).
 */
export function routeArchives<T extends ArchiveProfile>(
  archives: T[],
  route: RouteWords,
  options: { memory?: RouteMemory; always?: Set<string>; first?: number } = {},
): { first: T[]; rest: T[]; priors: Map<string, Prior> } {
  const priors = new Map(archives.map((archive) => [archive.id, priorOf(archive, route, options.memory)]));
  const ordered = [...archives].sort(
    (a, b) => priors.get(b.id)!.prior - priors.get(a.id)!.prior || a.sizeBytes - b.sizeBytes || a.id.localeCompare(b.id),
  );
  const count = options.first ?? ROUTED_FIRST;
  if (ordered.length <= count + ROUTED_SLACK) return { first: ordered, rest: [], priors };
  const first = ordered.slice(0, count);
  const rest: T[] = [];
  for (const archive of ordered.slice(count)) (options.always?.has(archive.id) ? first : rest).push(archive);
  return { first, rest, priors };
}
