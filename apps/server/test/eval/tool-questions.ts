/**
 * The questions of the tools evaluation (tools-eval.ts), over the filled instance of
 * test/fixtures/tools/filled.ts with a layer of drinking water added.
 *
 * Each says which tools a right reply must have called (none, for a question that needs
 * no tool; "a|b" for either of two), what the reply must say (any one pattern, each
 * written from what the tool answers on that instance: see `--probe`), and what it must
 * not say (something the instance does not hold). The judging is by rule and crude: a
 * reply that calls the right tool and says one right thing passes, however it rambles.
 * The words of every reply are kept, so that a reader can judge again.
 */
export interface ToolQuestion {
  id: string;
  question: string;
  /** Tools a right reply calls, all of them; each entry may name alternatives as "a|b". Empty: it must call none. */
  tools: string[];
  answer: RegExp[];
  mustNot?: RegExp[];
  /** For `--probe`: the calls whose answers the patterns were written from. */
  probe?: Array<[string, Record<string, unknown>]>;
}

const SHOPS = /Tesco|Sainsbury|Asda|Morrisons|Aldi|Lidl|Waitrose|Co-op|Iceland|M&S/;

export const TOOL_QUESTIONS: ToolQuestion[] = [
  {
    id: "supermarkets-home",
    question: "What supermarkets are near home?",
    tools: ["find_places|nearest_place"],
    answer: [SHOPS],
    probe: [["find_places", { kind: "supermarket", near: "home" }]],
  },
  {
    id: "drinking-water",
    question: "Where is the nearest drinking water?",
    tools: ["find_places|nearest_place"],
    answer: [/Market Square fountain|Becket's Park tap|Abington Park drinking fountain/i],
    probe: [["nearest_place", { kind: "drinking water", near: "home" }]],
  },
  {
    id: "hospital-northampton",
    question: "Which hospital is nearest to Northampton?",
    tools: ["find_places|nearest_place"],
    answer: [/Northampton General/i],
    probe: [["nearest_place", { kind: "hospital", near: "Northampton" }]],
  },
  {
    id: "food-days",
    question: "How many days of food have we got?",
    tools: ["supplies"],
    answer: [/4\.9|five days|5 days|about 5\b/i],
    mustNot: [/\b(7|seven|10|ten|30|thirty) days of food/i],
    probe: [
      ["supplies", {}],
      ["supplies", { category: "food", page: 1 }],
    ],
  },
  {
    id: "power-cut-plan",
    question: "What's on our power cut plan?",
    tools: ["emergency_plans"],
    answer: [/torch/i, /neighbou?r/i],
    probe: [
      ["emergency_plans", {}],
      ["emergency_plans", { plan: "Power cut" }],
    ],
  },
  {
    id: "warnings",
    question: "Are there any weather warnings for us at the moment?",
    tools: ["weather"],
    answer: [/\bno(ne)?\b.*warning|warnings?.*\b(none|no)\b|not any|n't any/i],
    mustNot: [/yellow|amber|red warning/i],
    probe: [["weather", { what: "warnings" }]],
  },
  {
    id: "river",
    question: "What's the river doing?",
    tools: ["weather"],
    answer: [/no (river|level|station|gauge)|not (held|any)|n't (any|have)|none|within 8 km|Christchurch|flood alert/i],
    mustNot: [/\b\d+(\.\d+)? ?m(etres)?\b.*(rising|falling)/i],
    probe: [
      ["weather", { what: "levels" }],
      ["weather", { what: "floods" }],
    ],
  },
  {
    id: "sunset",
    question: "When is sunset at home today?",
    tools: ["sun_and_compass"],
    answer: [/16:0\d|4:0\d ?(pm|p\.m\.)/i],
    probe: [["sun_and_compass", {}]],
  },
  {
    id: "declination",
    question: "What is the magnetic declination at home?",
    tools: ["sun_and_compass"],
    answer: [/0\.9/],
    probe: [["sun_and_compass", {}]],
  },
  {
    id: "shipping-forecast",
    question: "What frequency is the shipping forecast on?",
    tools: ["radio_frequencies"],
    answer: [/Radio 4/i],
    probe: [["radio_frequencies", { kind: "shipping forecast" }]],
  },
  {
    id: "boil-water",
    question: "How long should I boil water to make it safe to drink?",
    tools: ["search_library"],
    answer: [/one minute|1 minute|three minutes|3 minutes/i],
    probe: [["search_library", { query: "boil water" }]],
  },
  {
    id: "first-aid-download",
    question: "Is there anything on first aid I could download?",
    tools: ["search_catalogue"],
    answer: [/First aid manual/i],
    probe: [["search_catalogue", { subject: "first aid" }]],
  },
  {
    id: "pharmacies-bedford",
    question: "What pharmacies are there in Bedford?",
    tools: ["find_places|nearest_place"],
    answer: [/\bno\b|not (hold|held|have)|none|n't|could not|couldn't|fetch|don't have/i],
    mustNot: [/Boots|Lloyds|Superdrug|Well Pharmacy/i],
    probe: [["find_places", { kind: "pharmacy", near: "Bedford" }]],
  },
  {
    id: "capital-france",
    question: "What is the capital of France?",
    tools: [],
    answer: [/Paris/],
  },
  {
    id: "haiku",
    question: "Write a haiku about rain.",
    tools: [],
    answer: [/\S/],
  },
  {
    id: "two-tools",
    question: "What is the nearest supermarket to home, and what time does the sun set there today?",
    tools: ["find_places|nearest_place", "sun_and_compass"],
    answer: [/Iceland.*(16:0\d|4:0\d)|(16:0\d|4:0\d).*Iceland/is],
    probe: [
      ["nearest_place", { kind: "supermarket", near: "home", count: 1 }],
      ["sun_and_compass", {}],
    ],
  },
];
