/**
 * The questions the answers evaluation asks of the library in library.ts.
 *
 * Each question either names the passage that answers it, with what a right answer must
 * say, or is marked as one the library does not answer. The second kind matters as much
 * as the first: a small model's commonest fault is to answer anyway.
 *
 * `says` are patterns a right answer matches, all of them, without regard to case. They
 * are loose on purpose ("one minute" or "1 minute"), and they only look for the fact:
 * whether an answer reads well is not judged. `mustNotSay` catches the tempting wrong
 * answer where there is one.
 */

export interface EvalQuestion {
  id: string;
  question: string;
  /**
   * The passage that answers it: a document of library.ts and one of its headings. Null when
   * nothing in the library does. A long section is cut into more than one passage; `holds` then
   * says which of them it is, by words only that one contains.
   */
  answeredBy: { document: string; heading: string; holds?: RegExp } | null;
  /** Why the library does not answer it, for a reader of this file. */
  why?: string;
  says?: RegExp[];
  mustNotSay?: RegExp[];
}

export const QUESTIONS: EvalQuestion[] = [
  // ── Answered by one passage ──
  {
    id: "boil-time",
    question: "How long should water be boiled to make it safe to drink?",
    answeredBy: { document: "water", heading: "Boiling" },
    says: [/\b(one|1)\s+minute\b/],
    mustNotSay: [/\b(four|4|ten|10)\s+minutes\b/],
  },
  {
    id: "boil-altitude",
    question: "How long do I boil water above 2,000 metres?",
    answeredBy: { document: "water", heading: "Boiling" },
    says: [/\b(three|3)\s+minutes\b/],
  },
  {
    id: "bleach-drops",
    question: "How many drops of bleach go in a litre of clear water?",
    answeredBy: { document: "water", heading: "Household bleach" },
    says: [/\b(two|2)\s+drops\b/],
  },
  {
    id: "tablets-cold",
    question: "How long do chlorine dioxide tablets need in very cold water?",
    answeredBy: { document: "water", heading: "Chlorine dioxide tablets" },
    says: [/\b(four|4)\s+hours\b/],
  },
  {
    id: "water-keeps",
    question: "How long does treated water keep in storage?",
    answeredBy: { document: "water", heading: "Storing treated water" },
    says: [/\b(six|6)\s+months\b/],
  },
  {
    id: "burn",
    question: "How do I treat a burn?",
    answeredBy: { document: "first-aid", heading: "Burns and scalds" },
    says: [/\b(twenty|20)\s+minutes\b/, /water/],
  },
  {
    id: "rehydration",
    question: "What is the recipe for the rehydration drink?",
    answeredBy: { document: "first-aid", heading: "Rehydration drink" },
    says: [/\b(six|6)\b[^.]*sugar/, /\bhalf\b|½|0\.5/, /salt/],
  },
  {
    id: "bleeding",
    question: "How long should I press on a bleeding wound?",
    answeredBy: { document: "first-aid", heading: "Bleeding" },
    says: [/\b(ten|10)\s+minutes\b/],
  },
  {
    id: "ctcss",
    question: "What is a CTCSS tone for?",
    answeredBy: { document: "radio", heading: "Repeaters and CTCSS" },
    says: [/repeater/, /open|access|respond|activate|trigger|set off|only/],
  },
  {
    id: "repeater-tone",
    question: "Which tone does the GB3ZZ repeater need?",
    answeredBy: { document: "radio", heading: "Repeaters and CTCSS" },
    says: [/\b77(\.0)?\s*Hz\b/],
  },
  {
    id: "net-time",
    question: "When does the family net meet?",
    answeredBy: { document: "radio", heading: "The family net" },
    says: [/sunday/, /19[:.]30|7[:.]30/],
  },
  {
    id: "qrt",
    question: "What does QRT mean?",
    answeredBy: { document: "radio", heading: "Q codes" },
    says: [/clos(ing|e)\s+down|stop\s+sending|stop(ping)?\s+transmi/],
  },
  {
    id: "oil-change",
    question: "How often should the generator's oil be changed?",
    answeredBy: { document: "generator", heading: "Oil" },
    says: [/\b100\s+hours\b/],
  },
  {
    id: "rice",
    question: "How long does white rice keep?",
    answeredBy: { document: "pantry", heading: "Rice and dry goods" },
    says: [/\b(ten|10)\s+years\b/],
    mustNotSay: [/white rice[^.]*\b(six|6)\s+months\b/],
  },
  {
    id: "kidney-beans",
    question: "Why must red kidney beans be boiled first?",
    answeredBy: { document: "pantry", heading: "Dried beans" },
    says: [/toxin/],
  },
  {
    id: "potato-spacing",
    question: "How far apart are first early potatoes planted?",
    answeredBy: { document: "garden", heading: "Potatoes" },
    says: [/\b30\s*cm\b/],
  },
  {
    id: "stopcock",
    question: "Where is the main stopcock?",
    answeredBy: { document: "house", heading: "Water" },
    says: [/kitchen\s+sink/],
  },
  {
    id: "boiler-pressure",
    question: "What pressure should the boiler show?",
    answeredBy: { document: "house", heading: "Boiler" },
    says: [/\b1(\.0)?\s*(and|to|-|–|—)\s*1\.5\s*bar\b/],
  },
  {
    id: "freezer",
    question: "How long will a full freezer stay frozen in a power cut?",
    answeredBy: { document: "plan", heading: "Power cuts" },
    says: [/\b48\s+hours\b/],
  },
  {
    id: "rear-tyre",
    question: "What pressure does the touring bike's rear tyre take?",
    answeredBy: { document: "bicycle", heading: "Tyres" },
    says: [/\b4\.5\s*bar\b/],
  },
  {
    id: "naismith",
    question: "What is Naismith's rule?",
    answeredBy: { document: "navigation", heading: "Timing and pacing" },
    says: [/\b5\s*km\b/, /\b10\s*(m\b|metres)/],
  },
  {
    id: "stove-clearance",
    question: "How far must the wood stove be from things that can burn at its sides?",
    answeredBy: { document: "stove", heading: "Clearances and hearth", holds: /400 mm/ },
    says: [/\b400\s*mm\b|\b40\s*cm\b/],
  },
  {
    id: "stove-load",
    question: "How high can the firebox of the wood stove be loaded?",
    answeredBy: { document: "stove", heading: "Refuelling and running", holds: /top of the firebricks/ },
    says: [/firebricks/],
  },
  {
    id: "stove-glass",
    question: "How do I clean the glass of the wood stove?",
    answeredBy: { document: "stove", heading: "Cleaning", holds: /newspaper/ },
    says: [/newspaper/, /ash/],
  },
  {
    id: "flue-temperature",
    question: "What should the flue thermometer read when the stove is running well?",
    answeredBy: { document: "stove", heading: "Refuelling and running", holds: /between 120 °C and 250 °C/ },
    says: [/\b120\b/, /\b250\b/],
  },
  {
    id: "tank-clean",
    question: "How often should the storage tank of a private water supply be drained and cleaned?",
    answeredBy: { document: "supply", heading: "The storage tank" },
    says: [/(once|every|each)\s+(a\s+)?year|annual|yearly|12\s+months|twelve\s+months/],
  },
  {
    id: "free-chlorine",
    question: "What free chlorine level should there be at the furthest tap?",
    answeredBy: { document: "supply", heading: "Treatment" },
    says: [/\b0\.2\b/, /\b0\.5\b/],
  },
  {
    id: "breaker",
    question: "What should I do when a breaker keeps tripping?",
    answeredBy: { document: "house", heading: "Electricity" },
    says: [/unplug/],
  },

  // ── Answered, but asked in other words than the passage uses ──
  {
    id: "generator-distance",
    question: "How close to the house may the generator stand?",
    answeredBy: { document: "generator", heading: "Where to run it" },
    says: [/\b(five|5)\s*(metres|m\b)/],
  },
  {
    id: "meeting-point",
    question: "Where do we gather if we are locked out of home?",
    answeredBy: { document: "plan", heading: "Meeting points" },
    says: [/oak\s+tree/],
  },
  {
    id: "battery-frost",
    question: "Can the lithium battery be charged when it is freezing?",
    answeredBy: { document: "solar", heading: "The battery" },
    says: [/\bno\b|\bnot\b|never|damage/, /0\s*°?\s*C|freezing|zero/],
  },
  {
    id: "stopped-shivering",
    question: "What should be done for someone who is very cold and no longer shivers?",
    answeredBy: { document: "first-aid", heading: "Cold and hypothermia" },
    says: [/ambulance/],
  },

  // ── Not answered: the subject is in the library, the fact is not ──
  {
    id: "no-spark-plug",
    question: "How do I change the generator's spark plug?",
    answeredBy: null,
    why: "The generator manual covers starting, oil, fuel and siting. It never mentions a spark plug.",
  },
  {
    id: "no-pool",
    question: "How much chlorine should go in a swimming pool?",
    answeredBy: null,
    why: "Bleach and chlorine dioxide are described for drinking water only. A pool is mentioned once, as a smell.",
    mustNotSay: [/\b(two|2|four|4)\s+drops\b/],
  },
  {
    id: "no-paracetamol",
    question: "What dose of paracetamol can a child have?",
    answeredBy: null,
    why: "The first aid notes cover burns, bleeding, sprains, cold and a rehydration drink. No medicine or dose is given.",
    mustNotSay: [/\b\d+\s*(mg|ml)\b/],
  },
  {
    id: "no-apple-pruning",
    question: "When should the apple trees be pruned?",
    answeredBy: null,
    why: "The garden notes cover potatoes, garlic, compost and watering. There are no fruit trees in them.",
    mustNotSay: [/winter|february|january|dormant/],
  },
  {
    id: "no-net-controller",
    question: "Who is the controller of the family net?",
    answeredBy: null,
    why: 'The net\'s time and frequency are given, and "whoever opens the net" calls the stations. Nobody is named.',
  },
  {
    id: "no-stove-weight",
    question: "How much does the wood stove weigh?",
    answeredBy: null,
    why: "The stove manual gives clearances, temperatures and lengths. It never gives a weight.",
    mustNotSay: [/\b\d+\s*(kg|kilograms?|lbs?|pounds)\b/],
  },
  {
    id: "no-flue-size",
    question: "What diameter of flue pipe does the wood stove need?",
    answeredBy: null,
    why: "The manual speaks of the flue, its thermometer and its soot, and gives no diameter.",
    mustNotSay: [/\b\d+\s*(mm|cm|inch(es)?)\b/],
  },
  {
    id: "no-nitrate-limit",
    question: "What is the legal limit for nitrate in drinking water?",
    answeredBy: null,
    why: "The guide says fertiliser can raise nitrate and that it should be tested for. It gives no limit; a model may know one from memory.",
    mustNotSay: [/\b(50|10|11\.3|45)\s*(mg|milligrams|ppm)/],
  },
  {
    id: "no-nosebleed",
    question: "How do I stop a nosebleed?",
    answeredBy: null,
    why: "The first aid notes deal with a bleeding wound. They say nothing of a nosebleed.",
    mustNotSay: [/pinch|lean\s+forward/],
  },
  {
    id: "no-iodine",
    question: "How do I purify water with iodine?",
    answeredBy: null,
    why: "Boiling, tablets of chlorine dioxide, bleach and ultraviolet light are described. Iodine is not.",
    mustNotSay: [/\b\d+\s*drops\b[^.]*iodine|iodine[^.]*\b\d+\s*(drops|minutes)\b/],
  },

  // ── Not answered: only a word in common ──
  {
    id: "no-countryside-code",
    question: "What does the Countryside Code say about dogs?",
    answeredBy: null,
    why: "The library has Q codes and Morse code, and one line about keeping dogs from the hen run. It does not hold the Countryside Code.",
  },
  {
    id: "no-world-cup",
    question: "Who won the World Cup in 1966?",
    answeredBy: null,
    why: 'A model knows this from memory. The library only has the words "World" (the BBC World Service) and "cup" (of rice).',
    mustNotSay: [/england/],
  },

  // ── Not answered: nothing like it in the library ──
  {
    id: "no-sourdough",
    question: "How do I bake sourdough bread?",
    answeredBy: null,
    why: "Bread appears once, as something to keep out of the compost.",
    mustNotSay: [/starter|oven|°C|degrees/],
  },
];
