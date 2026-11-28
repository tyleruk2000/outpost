/**
 * Other ways of saying what was typed: British and American spellings and words, and
 * the different names people give the same household emergency. A search for "tyre
 * pressure" also finds "tire pressure"; "power cut" also finds "power outage" and
 * "blackout". Each word typed becomes a group, and a passage holding any one of the
 * group counts as holding the word (query.ts). The word as typed scores a little more
 * than another way of saying it (score.ts), and the screen says what else was searched.
 *
 * To add to it:
 *  - a word or phrase with the same meaning everywhere: a line in `SAME`;
 *  - a word that should also find others, but not the other way round: `ONE_WAY`;
 *  - words that mean the same only beside certain others ("change" and "replace" for a
 *    part): `BESIDE`;
 *  - a spelling that differs in the same place whatever the ending (colour, colours,
 *    colourful): `OUR`, `ISE`, `TRE` or `ROOTS`.
 * Write words in lower case, in their plain form ("battery", not "batteries"): plurals
 * and other endings are matched by their stem, as the index matches them. A quoted word
 * is never widened. A phrase is known without its connectives ("of", "and": `CONNECTIVES`),
 * which are dropped from what is typed before the table is read, so "bicarbonate of
 * soda" typed is "bicarbonate soda" here; asked for as another way of saying a word,
 * the phrase is searched as written, small words and all.
 */
import { stem } from "./stem.ts";
import { STOP_WORDS } from "./stop-words.ts";

/** Words and phrases that stand for each other, any one for the rest. */
const SAME: string[][] = [
  // Vehicles and fuel
  ["petrol", "gasoline"],
  ["paraffin", "kerosene"],
  ["methylated spirits", "denatured alcohol"],
  ["windscreen", "windshield"],
  ["jump leads", "jumper cables", "booster cables"],
  ["jump start", "jumpstart", "boost start"],
  ["spare tyre", "spare tire", "spare wheel"],
  ["flat tyre", "flat tire", "puncture"],
  ["number plate", "license plate", "registration plate"],
  ["gearbox", "transmission"],
  ["antifreeze", "coolant"],
  ["engine oil", "motor oil"],
  ["lorry", "truck"],
  ["motorway", "highway", "freeway"],
  ["car park", "parking lot"],
  ["pavement", "sidewalk"],
  ["jerry can", "jerrycan", "fuel can", "gas can"],
  ["snow chains", "tire chains", "tyre chains"],
  // Home
  ["torch", "flashlight"],
  ["nappy", "diaper"],
  ["dummy", "pacifier"],
  ["cot", "crib"],
  ["cooker", "stove"],
  ["rubbish", "trash", "garbage"],
  ["mobile phone", "cell phone", "cellphone"],
  ["emergency room", "emergency department", "accident and emergency"],
  ["defibrillator", "automated external defibrillator"],
  ["oral rehydration solution", "oral rehydration salts"],
  ["tyre", "tire"],
  ["pram", "stroller", "pushchair", "buggy"],
  ["tap", "faucet"],
  ["bin bag", "trash bag", "garbage bag"],
  ["cling film", "plastic wrap"],
  ["kitchen roll", "paper towel"],
  ["tea towel", "dish towel"],
  ["washing up liquid", "dish soap"],
  ["fridge", "refrigerator"],
  ["hob", "stovetop", "cooktop"],
  ["tinned", "canned"],
  ["tin opener", "can opener"],
  ["camping stove", "camp stove"],
  ["water butt", "rain barrel"],
  ["rainwater", "rain water"],
  ["firewood", "fire wood"],
  ["sandbag", "sand bag"],
  ["power bank", "battery pack", "portable charger"],
  ["walkie talkie", "two way radio", "handheld radio"],
  ["ham radio", "amateur radio"],
  ["call sign", "callsign"],
  ["aerial", "antenna"],
  ["postcode", "zip code", "postal code"],
  ["fuse box", "consumer unit", "breaker box", "circuit breaker panel"],
  ["earth wire", "ground wire"],
  ["extension lead", "extension cord"],
  ["plug socket", "power outlet", "wall socket"],
  ["smoke alarm", "smoke detector"],
  ["carbon monoxide alarm", "carbon monoxide detector", "co alarm", "co detector"],
  ["heatwave", "heat wave"],
  // Food and garden
  ["courgette", "zucchini"],
  ["aubergine", "eggplant"],
  ["coriander", "cilantro"],
  ["spring onion", "scallion", "green onion"],
  ["swede", "rutabaga"],
  ["porridge", "oatmeal"],
  ["plain flour", "all purpose flour"],
  ["bicarbonate of soda", "baking soda", "bicarb"],
  ["dried food", "dehydrated food"],
  ["mangetout", "snow peas"],
  ["beetroot", "beet"],
  ["chickpea", "garbanzo"],
  ["broad bean", "fava bean"],
  ["allotment", "community garden"],
  // Health and first aid
  ["paracetamol", "acetaminophen"],
  ["adrenaline", "epinephrine"],
  ["salbutamol", "albuterol"],
  ["epipen", "adrenaline auto injector", "epinephrine auto injector"],
  ["plaster", "band aid", "adhesive bandage"],
  ["cotton wool", "cotton balls"],
  ["chemist", "pharmacy", "drugstore"],
  ["999", "911", "112"],
  ["cpr", "cardiopulmonary resuscitation", "resuscitation"],
  ["burn", "scald"],
  ["nosebleed", "nose bleed", "epistaxis"],
  ["heatstroke", "heat stroke", "sunstroke"],
  ["heart attack", "myocardial infarction"],
  ["allergic reaction", "anaphylaxis"],
  ["stomach bug", "gastroenteritis"],
  ["being sick", "vomiting"],
  ["high temperature", "fever"],
  ["hypothermia", "cold exposure"],
  ["frostbite", "frost bite"],
  ["recovery position", "lateral position"],
  // Emergencies
  ["power cut", "power outage", "blackout", "power failure"],
  ["boil water notice", "boil water advisory"],
  ["bug out bag", "go bag", "grab bag"],
  ["emergency kit", "survival kit"],
  ["gas leak", "gas escape"],
];

/** The first word also finds the others; they do not find it. */
const ONE_WAY: string[][] = [
  ["purify", "disinfect", "sterilise"],
  ["bleach", "sodium hypochlorite", "chlorine"],
  ["fix", "repair"],
  ["mend", "repair", "fix"],
  ["generator", "genset"],
  ["blizzard", "snowstorm"],
  ["bushfire", "wildfire"],
  ["wildfire", "bushfire", "forest fire"],
];

/**
 * Words that stand for each other only when the query also holds one of the words after them. With `oneWay`, the
 * first only finds the rest, as in `ONE_WAY`.
 */
const BESIDE: Array<{ words: string[]; when: string[]; oneWay?: boolean }> = [
  {
    words: ["change", "replace", "fit"],
    when: [
      "battery",
      "tyre",
      "tire",
      "wheel",
      "fuse",
      "bulb",
      "filter",
      "oil",
      "wiper",
      "blade",
      "plug",
      "cartridge",
      "washer",
      "belt",
      "brake",
      "pad",
      "lamp",
      "cable",
      "hose",
      "valve",
      "seal",
      "chain",
      "tube",
      "fan",
      "pump",
      "lock",
      "socket",
      "switch",
      "thermostat",
    ],
  },
  { words: ["purify", "disinfect", "treat"], when: ["water", "drinking"] },
  { words: ["boost", "jump start"], when: ["car", "battery", "van", "vehicle"] },
  // "How to preserve fish": a guide says how to can, cure, smoke, salt, dry or pickle it, and seldom "preserve".
  // One way: "smoking fish" is not asking about canning it. "Canner", not "canning", which the index takes as "can".
  {
    words: ["preserve", "canner", "curing", "smoking", "salting", "drying", "pickling"],
    when: ["fish", "meat", "salmon", "trout", "venison", "game", "vegetable", "fruit", "food", "harvest"],
    oneWay: true,
  },
];

/** British words ending "our" whose American spelling ends "or", with whatever follows (colourful, colorful). */
const OUR = [
  "colour",
  "flavour",
  "harbour",
  "honour",
  "humour",
  "labour",
  "neighbour",
  "odour",
  "rumour",
  "vapour",
  "behaviour",
  "favour",
  "armour",
  "endeavour",
  "parlour",
  "tumour",
  "vigour",
  "savour",
  "mould",
  "smoulder",
];

/** British words ending "ise" or "yse" whose American spelling ends "ize" or "yze" (sterilise, sterilization). */
const ISE = [
  "sterilise",
  "sanitise",
  "cauterise",
  "immobilise",
  "stabilise",
  "neutralise",
  "pasteurise",
  "vaporise",
  "organise",
  "realise",
  "recognise",
  "apologise",
  "minimise",
  "maximise",
  "fertilise",
  "hospitalise",
  "utilise",
  "prioritise",
  "categorise",
  "summarise",
  "memorise",
  "standardise",
  "emphasise",
  "authorise",
  "customise",
  "optimise",
  "synchronise",
  "visualise",
  "characterise",
  "civilise",
  "immunise",
  "deodorise",
  "oxidise",
  "ionise",
  "analyse",
  "paralyse",
  "catalyse",
];

/** British words ending "re" whose American spelling ends "er" (centre, centers). */
const TRE = [
  "centre",
  "metre",
  "litre",
  "fibre",
  "theatre",
  "calibre",
  "kilometre",
  "centimetre",
  "millimetre",
  "millilitre",
  "sombre",
  "meagre",
  "lustre",
  "sabre",
  "spectre",
];

/** Other spellings that differ at the start of the word: [British, American]. */
const ROOTS: Array<[string, string]> = [
  ["diarrhoea", "diarrhea"],
  ["dyspnoea", "dyspnea"],
  ["apnoea", "apnea"],
  ["oedema", "edema"],
  ["oesophag", "esophag"],
  ["oestrogen", "estrogen"],
  ["foetus", "fetus"],
  ["foetal", "fetal"],
  ["anaemia", "anemia"],
  ["anaemic", "anemic"],
  ["anaesthetic", "anesthetic"],
  ["anaesthesia", "anesthesia"],
  ["haemorrhag", "hemorrhag"],
  ["haemorrhoid", "hemorrhoid"],
  ["haemoglobin", "hemoglobin"],
  ["haematoma", "hematoma"],
  ["paediatric", "pediatric"],
  ["orthopaedic", "orthopedic"],
  ["gynaecolog", "gynecolog"],
  ["leukaemia", "leukemia"],
  ["septicaemia", "septicemia"],
  ["faeces", "feces"],
  ["faecal", "fecal"],
  ["caesarean", "cesarean"],
  ["encyclopaedia", "encyclopedia"],
  ["aeroplane", "airplane"],
  ["aluminium", "aluminum"],
  ["sulphur", "sulfur"],
  ["sulphate", "sulfate"],
  ["sulphide", "sulfide"],
  ["grey", "gray"],
  ["plough", "plow"],
  ["programme", "program"],
  ["catalogue", "catalog"],
  ["analogue", "analog"],
  ["dialogue", "dialog"],
  ["defence", "defense"],
  ["offence", "offense"],
  ["licence", "license"],
  ["jewellery", "jewelry"],
  ["pyjama", "pajama"],
  ["moustache", "mustache"],
  ["sceptic", "skeptic"],
  ["doughnut", "donut"],
  ["mollusc", "mollusk"],
  ["cosy", "cozy"],
  ["ageing", "aging"],
  ["judgement", "judgment"],
  ["artefact", "artifact"],
  ["yoghurt", "yogurt"],
  ["chilli", "chili"],
  ["liquorice", "licorice"],
  ["woollen", "woolen"],
  ["skilful", "skillful"],
  ["instalment", "installment"],
  ["whisky", "whiskey"],
];

/** Whole words, British and American, that only take a plural ending: their other endings are spelt differently (manoeuvred, maneuvered). */
const PLURAL_ONLY: Array<[string, string]> = [
  ["manoeuvre", "maneuver"],
  ["kilogramme", "kilogram"],
];

/** Words whose last "l" is doubled in British spelling before "ed", "ing" and "er" (travelled, traveled). */
const DOUBLED_L = ["travel", "fuel", "cancel", "label", "model", "signal", "level", "channel", "dial", "tunnel", "total", "counsel"];

/** What may follow a spelling's root and be carried over: endings, not other words (so "color" is not "colorado"). */
const ENDINGS = new Set(
  (
    " s es e ed ing ings er ers al ally ful fully less ness able ably ation ations ist ists ic ical ically " +
    "ian ians us eal hood hoods y ies ous ment ments ism l ly ite"
  ).split(" "),
);
const PLURAL = new Set(["", "s"]);
const VERB = new Set(["ed", "ing", "er", "ers"]);

interface Spelling {
  from: string;
  to: string;
  endings: Set<string>;
}

/** Spelling roots both ways, built once: British root to American, and back. */
const SPELLINGS: Spelling[] = (() => {
  const pairs: Spelling[] = [
    ...OUR.map((word) => ({ from: word, to: word.replace(/our/, "or"), endings: ENDINGS })),
    // "sterilise" → "sterilis" and "steriliz", so that "sterilising" and "sterilisation" carry over.
    ...ISE.map((word) => ({ from: word.slice(0, -1), to: `${word.slice(0, -2)}z`, endings: ENDINGS })),
    ...TRE.map((word) => ({ from: word, to: `${word.slice(0, -2)}er`, endings: PLURAL })),
    ...ROOTS.map(([from, to]) => ({ from, to, endings: ENDINGS })),
    ...PLURAL_ONLY.map(([from, to]) => ({ from, to, endings: PLURAL })),
    ...DOUBLED_L.map((word) => ({ from: `${word}l`, to: word, endings: VERB })),
  ];
  return [...pairs, ...pairs.map((pair) => ({ ...pair, from: pair.to, to: pair.from }))];
})();

/** The other spellings of one word: "colours" → ["colors"], "sterilising" → ["sterilizing"]. */
export function spellingsOf(word: string): string[] {
  const lower = word.toLowerCase();
  const found: string[] = [];
  for (const { from, to, endings } of SPELLINGS) {
    if (!lower.startsWith(from)) continue;
    const ending = lower.slice(from.length);
    if (!endings.has(ending)) continue;
    const other = to + ending;
    if (other !== lower && !found.includes(other)) found.push(other);
  }
  return found;
}

interface Entry {
  /** Each way of saying it, as stems word by word. */
  stems: string[][];
  /** The words as written, in the same order. */
  words: string[];
  /** The first only finds the rest. */
  oneWay: boolean;
  /** Stems of which the query must hold one. */
  when: string[] | null;
}

/**
 * Words that only join a phrase's words ("bicarbonate of soda", "accident and
 * emergency"). They are left out of a search (they are among `STOP_WORDS`), so a phrase
 * is matched without them. Only these: "can" in "jerry can" or "being" in "being sick"
 * are part of the name, and without them the phrase would be one word ("gas" taken for
 * "gas can", "sick" for "being sick").
 */
const CONNECTIVES: ReadonlySet<string> = new Set(["of", "and", "the", "a", "in", "for", "to"]);
for (const word of CONNECTIVES) if (!STOP_WORDS.has(word)) throw new Error(`"${word}" is a connective but not a stop word`);

/**
 * The words of a phrase as typed words are matched against it: without its connectives.
 * A phrase of several words is never left as one: then it is matched as written, which
 * words typed without their small ones never are.
 */
const wordsThatMatter = (phrase: string) => {
  const words = phrase.split(" ");
  const kept = words.filter((word) => !CONNECTIVES.has(word));
  return words.length > 1 && kept.length < 2 ? words : kept;
};
const stemsOf = (phrase: string) => wordsThatMatter(phrase).map((word) => stem(word));

const ENTRIES: Entry[] = [
  ...SAME.map((words) => ({ words, stems: words.map(stemsOf), oneWay: false, when: null })),
  ...ONE_WAY.map((words) => ({ words, stems: words.map(stemsOf), oneWay: true, when: null })),
  ...BESIDE.map(({ words, when, oneWay }) => ({
    words,
    stems: words.map(stemsOf),
    oneWay: oneWay ?? false,
    when: when.map((word) => stem(word)),
  })),
];

/** How many entries there are, for the documentation and its tests. */
export const SYNONYM_ENTRIES = ENTRIES.length + SPELLINGS.length / 2;

/**
 * Words whose stem is also another word's ("tired" stems to "tire"): they are widened only
 * when typed as they are or as a plural, and other words sharing their stem count for
 * less when ranking (score.ts).
 */
export const BY_SPELLING_ONLY: ReadonlySet<string> = new Set(["tyre", "tire", "tinned", "canned", "cot"]);

/** True when a typed word is the entry's word: the same stem, as the index sees it, or for a few words the same word or its plural. */
function wordMatches(typed: string, entryWord: string, entryStem: string): boolean {
  const lower = typed.toLowerCase();
  if (BY_SPELLING_ONLY.has(entryWord)) return lower === entryWord || lower === `${entryWord}s`;
  return lower === entryWord || stem(lower) === entryStem;
}

export interface Expansion {
  /** How many typed words it stands for, from `start`. */
  start: number;
  length: number;
  /** Other ways of saying them, as written. */
  alternatives: string[];
}

/** Most alternatives for one word or phrase: enough for the common ways of saying it. */
const MOST = 6;

/**
 * Finds the words and phrases of `words` (the words that matter, in the order typed)
 * that have other ways of being said. Longer phrases first: "power cut" before "cut".
 * `skip` marks words that must stay as they are (typed in quotes).
 */
export function findExpansions(words: string[], skip: boolean[] = []): Expansion[] {
  const stems = words.map((word) => stem(word.toLowerCase()));
  const expansions: Expansion[] = [];
  let index = 0;
  while (index < words.length) {
    let best: Expansion | null = null;
    for (const length of [3, 2, 1]) {
      if (index + length > words.length) continue;
      if (skip.slice(index, index + length).some(Boolean)) continue;
      if (length > 1 && words.slice(index, index + length).some((word) => word.includes(" "))) continue;
      const span = words.slice(index, index + length);
      const others = new Set(stems.filter((_, at) => at < index || at >= index + length));
      const alternatives: string[] = [];
      for (const entry of ENTRIES) {
        if (entry.when && !entry.when.some((wanted) => others.has(wanted))) continue;
        entry.stems.forEach((form, formIndex) => {
          if (form.length !== length) return;
          if (entry.oneWay && formIndex !== 0) return;
          const written = wordsThatMatter(entry.words[formIndex]!);
          if (!span.every((word, at) => wordMatches(word, written[at]!, form[at]!))) return;
          entry.words.forEach((other, otherIndex) => {
            if (otherIndex !== formIndex && !alternatives.includes(other)) alternatives.push(other);
          });
        });
      }
      if (length === 1) {
        // Spellings carry the word's own ending: "colours" → "colors". Alternatives found above are spelt both ways too.
        for (const other of [span[0]!, ...alternatives]) {
          for (const spelling of spellingsOf(other)) {
            if (spelling !== span[0]!.toLowerCase() && !alternatives.includes(spelling)) alternatives.push(spelling);
          }
        }
      }
      const typed = span.join(" ").toLowerCase();
      const kept = alternatives.filter((alternative) => alternative !== typed).slice(0, MOST);
      if (kept.length > 0) {
        best = { start: index, length, alternatives: kept };
        break;
      }
    }
    if (best) {
      expansions.push(best);
      index += best.length;
    } else {
      index += 1;
    }
  }
  return expansions;
}
