/**
 * The household book, under Preparedness: a wizard asks the household about itself
 * (its people, where home is, who they would go to, where they would meet, their
 * vehicles and radios, how long they want to be ready for and which hazards matter),
 * and Outpost makes a printable book from the answers and from what it already holds:
 * the people in Supplies, the medical sheets, the communication plan, the emergency
 * plans, the reference layers near home, the climate kept for home and the installed
 * terrain. Every piece of advice in the book is quoted from a named publisher.
 *
 * The answers are kept on the server as a draft, so the wizard can be left and taken up
 * again, on any device. The book itself is made in the browser; the server keeps the
 * record of the last one made, with a short summary of what it said (`BookMade.summary`),
 * so that the next book can say what changed since.
 *
 * Nothing here fetches anything. What the book needs and Outpost does not hold (a
 * reference layer, the climate for home, terrain) is said in the book, with where to get it.
 */

import { toblerKmh, WALK_PACES, type WalkPaceId } from "./walk-reach.ts";
import type { ClimateMonth } from "./weather.ts";

// ── The sections ────────────────────────────────────────────────────────────

export const BOOK_SECTIONS = [
  {
    id: "first-minutes",
    label: "The first few minutes",
    about: "What to do at once, on one page: the number to call, go in or get out, who to tell.",
  },
  {
    id: "fridge-sheets",
    label: "Fridge sheets",
    about: "One page for each emergency plan, to put on the fridge: the number, what to do, who to call and where to meet.",
  },
  { id: "people", label: "Our household", about: "Each person and pet, their needs and medicines, and the medical sheets." },
  {
    id: "keeping-in-touch",
    label: "Keeping in touch",
    about: "The emergency contacts with their numbers, and the communication plan with a page for each person.",
  },
  {
    id: "places",
    label: "Home and meeting points",
    about: "A map of home and every meeting point, each in several grid formats, and the people you would go to.",
  },
  { id: "first-aid", label: "First aid", about: "Quoted from the NHS website, unchanged, with what the book cannot hold." },
  {
    id: "help-near-home",
    label: "Help near home",
    about: "Hospitals, pharmacies, emergency services, shelters and drinking water, with distance and direction.",
  },
  {
    id: "keep-away",
    label: "Places to keep away from",
    about: "Nuclear and military sites, airports and fuel near home, and what the wind at home means.",
  },
  {
    id: "situations",
    label: "What to do, by situation",
    about: "Your emergency plans in full, as you wrote them, and official guidance for a hazard with no plan yet.",
  },
  { id: "water", label: "Water", about: "How much to keep, how to make water safe, and drinking water near home." },
  { id: "food-hygiene", label: "Food, toilet and hygiene", about: "Food in a power cut or a flood, and keeping clean with little water." },
  { id: "warmth-radio", label: "Warmth, light and the radio", about: "Keeping warm and lit, and the stations your radios can hear." },
  {
    id: "frequencies",
    label: "Radio frequencies",
    about:
      "The communication plan's channels first, then licence-free channels, emergency and calling frequencies, broadcasters and repeaters near our places with maps of their range, each with whether it needs a licence.",
  },
  {
    id: "radio-plans",
    label: "Radio plans",
    about:
      "Each radio plan from Radio › Plans: its stations, when to listen and call in local time and UTC, and the bands in order of preference.",
  },
  {
    id: "journeys",
    label: "Journeys",
    about: "To each place you would go: on foot, with a stop for each day, and by car, with a drawn route.",
  },
  {
    id: "checklists",
    label: "Checklists",
    about: "A shopping list worked out for your people and days, the grab bag, the first aid kit and the car.",
  },
  { id: "supplies", label: "Supplies", about: "What is kept, where and until when, and how long it lasts." },
  { id: "local-risks", label: "Local risks", about: "Flood and planning zones at home where a layer is held, and the climate's extremes." },
  {
    id: "grab-cards",
    label: "Grab cards",
    about: "A card for each person to carry, to cut out: medical lines, who to call, where to meet, home's position.",
  },
  {
    id: "children",
    label: "Cards for the children",
    about: "A card for each child to carry, with home, the number to call and who to find.",
  },
  { id: "notes", label: "Pages for notes", about: "Blank ruled pages at the back." },
] as const;
export type BookSectionId = (typeof BOOK_SECTIONS)[number]["id"];
export const BOOK_SECTION_IDS = BOOK_SECTIONS.map((section) => section.id) as [BookSectionId, ...BookSectionId[]];
export const bookSectionLabel = (id: string): string => BOOK_SECTIONS.find((section) => section.id === id)?.label ?? id;

/**
 * The hazards a household can choose, each the emergency plan template that carries its
 * official guidance (`PLAN_TEMPLATES`).
 */
export const BOOK_HAZARDS = [
  { id: "power-cut", label: "Power cut" },
  { id: "comms-failure", label: "No phone or internet" },
  { id: "flooding", label: "Flooding" },
  { id: "storm", label: "Storm" },
  { id: "cold", label: "Snow, ice and cold" },
  { id: "heat", label: "Heatwave" },
  { id: "shelter-at-home", label: "Sheltering at home" },
  { id: "evacuate", label: "Leaving home at short notice" },
  { id: "radiation", label: "Radiation emergency" },
] as const;
export type BookHazardId = (typeof BOOK_HAZARDS)[number]["id"];
export const BOOK_HAZARD_IDS = BOOK_HAZARDS.map((hazard) => hazard.id) as [BookHazardId, ...BookHazardId[]];

// ── The answers ─────────────────────────────────────────────────────────────

export const BOOK_LIMITS = {
  people: 40,
  places: 20,
  vehicles: 10,
  short: 120,
  text: 600,
  notesPages: 12,
  days: 90,
} as const;

/** What the book adds to a person in Supplies' household. The person themselves (name, age) is Supplies'. */
export interface BookPerson {
  memberId: string;
  /** "Uses a wheelchair", "hard of hearing", "needs help on stairs". */
  needs: string;
  /** "Inhaler in coat pocket", "spare glasses". */
  carries: string;
  /** Gets a card of their own in "Cards for the children". */
  childCard: boolean;
}

/** A place to meet: a saved place on the map, near home or outside the area. */
export interface BookMeetingPoint {
  id: string;
  markerId: string;
  /** "near": just outside, if you cannot get home or must leave; "away": outside the area, if the neighbourhood is closed. */
  role: "near" | "away";
  note: string;
}

/** Someone the household would go to: a saved place for where, and a contact for who, either or both. */
export interface BookDestination {
  id: string;
  name: string;
  markerId: string | null;
  contactId: string | null;
  note: string;
}

export interface BookVehicle {
  id: string;
  name: string;
  /** How far it goes on a full tank or charge, as the household knows it; null when not known. */
  rangeKm: number | null;
  seats: number | null;
  note: string;
}

export interface BookAnswers {
  /** "The Allens": on the cover. May be empty. */
  householdName: string;
  people: BookPerson[];
  /** The number for the emergency services where home is. */
  emergencyNumber: string;
  meetingPoints: BookMeetingPoint[];
  destinations: BookDestination[];
  vehicles: BookVehicle[];
  /** How many days the household wants to manage on its own. */
  days: number;
  hazards: BookHazardId[];
  /** The kinds of radio set the household has (`RECEIVER_PROFILES` ids). */
  receivers: string[];
  /** Hours of walking in a day on a long journey: the household's own figure. */
  walkHoursPerDay: number;
  paper: "a4" | "letter";
  sections: BookSectionId[];
  notesPages: number;
  /** Put each medical sheet in full, as the binder does; otherwise only the summary in "Our household". */
  medicalInFull: boolean;
  /** Which emergency plans go in the book: every one the household has, or only those in `planIds`. */
  planChoice: "all" | "some";
  /** The size of the grab cards: wallet (two panels, folded) or A6. */
  grabCardSize: "wallet" | "a6";
  /** The plans chosen when `planChoice` is "some". */
  planIds: string[];
  /** Which radio plans (Radio › Plans, kept for every household) go in the book: all of them, or only those in `radioPlanIds`. */
  radioPlanChoice: "all" | "some";
  /** The radio plans chosen when `radioPlanChoice` is "some". */
  radioPlanIds: string[];
  /**
   * On each map of repeaters, only the nearest this many to the place (or the journey's line), so that a busy map
   * is clearer; the others stay in the tables. Null draws every one listed round the place.
   */
  repeaterMapMost: number | null;
}

export const DEFAULT_BOOK_ANSWERS: BookAnswers = {
  householdName: "",
  people: [],
  emergencyNumber: "",
  meetingPoints: [],
  destinations: [],
  vehicles: [],
  days: 3,
  hazards: ["power-cut", "comms-failure", "shelter-at-home", "evacuate"],
  receivers: [],
  walkHoursPerDay: 6,
  paper: "a4",
  sections: [...BOOK_SECTION_IDS],
  notesPages: 2,
  medicalInFull: false,
  planChoice: "all",
  grabCardSize: "wallet",
  planIds: [],
  radioPlanChoice: "all",
  radioPlanIds: [],
  repeaterMapMost: null,
};

/** The plans that go in the book, by the answers: all of them, or those chosen that still exist. */
export function bookPlanIds(answers: Pick<BookAnswers, "planChoice" | "planIds">, plans: ReadonlyArray<{ id: string }>): string[] {
  return answers.planChoice === "all"
    ? plans.map((plan) => plan.id)
    : plans.filter((plan) => answers.planIds.includes(plan.id)).map((plan) => plan.id);
}

/** The radio plans that go in the book, by the answers: all of them, or those chosen that still exist, in the list's order. */
export function bookRadioPlanIds(
  answers: Pick<BookAnswers, "radioPlanChoice" | "radioPlanIds">,
  plans: ReadonlyArray<{ id: string }>,
): string[] {
  return answers.radioPlanChoice === "some"
    ? plans.filter((plan) => answers.radioPlanIds.includes(plan.id)).map((plan) => plan.id)
    : plans.map((plan) => plan.id);
}

/** The hazards the household has a plan for, by the template each plan was started from. */
export function hazardsWithPlans(plans: ReadonlyArray<{ templateId: string | null }>): BookHazardId[] {
  return BOOK_HAZARD_IDS.filter((hazard) => plans.some((plan) => plan.templateId === hazard));
}

/** The steps of the wizard, in order. */
export const BOOK_STEPS = [
  { id: "people", label: "People and pets" },
  { id: "home", label: "Home" },
  { id: "places", label: "Where you would go and meet" },
  { id: "vehicles", label: "Vehicles and radios" },
  { id: "readiness", label: "How long, and which hazards" },
  { id: "book", label: "What goes in the book" },
] as const;
export type BookStepId = (typeof BOOK_STEPS)[number]["id"];

/** `GET /api/household-book`. */
export interface BookResponse {
  answers: BookAnswers;
  /** Null until the answers are first saved. */
  answersAt: number | null;
  made: BookMade | null;
  /** What the book is made from now, each as a short hash that changes with any change to it, a deletion included. */
  fingerprints: Record<BookSource, string>;
  /** What has changed since the last book was made; empty when nothing has, or no book was made with fingerprints. */
  stale: BookSource[];
}

/** What the book is made from, for saying what has changed since it was made. Facts round home are not among them. */
export const BOOK_SOURCES = [
  { id: "answers", label: "answers" },
  { id: "plans", label: "emergency plans" },
  { id: "contacts", label: "contacts" },
  { id: "places", label: "saved places" },
  { id: "medical", label: "medical sheets" },
  { id: "comms", label: "keeping in touch" },
  { id: "radio", label: "radio plans" },
  { id: "supplies", label: "supplies and the household" },
] as const;
export type BookSource = (typeof BOOK_SOURCES)[number]["id"];
export const BOOK_SOURCE_IDS = BOOK_SOURCES.map((source) => source.id) as [BookSource, ...BookSource[]];

/** `PUT /api/household-book`. */
export type BookInput = BookAnswers & { baseAnswersAt?: number | null };

/** The record of the last book made. */
export interface BookMade {
  madeAt: number;
  pages: number;
  sections: BookSectionId[];
  /** A few lines a section, of the facts that matter: what the next book compares itself with. */
  summary: Record<string, string[]>;
  /** What it was made from, as `BookResponse.fingerprints` said when it was made; books made before these were kept have none. */
  fingerprints?: Record<BookSource, string>;
  /** A household binder made before the binder became part of the book, standing in for the book until one is made. */
  fromBinder?: boolean;
}

export type BookMadeInput = Omit<BookMade, "madeAt" | "fingerprints" | "fromBinder"> & {
  fingerprints?: Partial<Record<BookSource, string>>;
};

/** What a part of the old binder was made from, as the book's sources: a binder out of date in a part is a book out of date in these. */
export const BINDER_PART_SOURCES: Record<string, BookSource[]> = {
  plans: ["plans"],
  contacts: ["contacts"],
  comms: ["comms", "contacts"],
  "grab-cards": ["medical", "contacts", "plans", "places"],
  medical: ["medical"],
  frequencies: ["comms"],
  places: ["places", "plans"],
  supplies: ["supplies"],
};

/** What changed in one section between two books. */
export interface BookChange {
  section: string;
  added: string[];
  removed: string[];
}

/** What changed since the last book, section by section, in the order of the book. Sections only one book has are left out. */
export function bookChanges(before: Record<string, string[]> | null, now: Record<string, string[]>): BookChange[] {
  if (!before) return [];
  const changes: BookChange[] = [];
  const order = [...BOOK_SECTION_IDS, ...Object.keys(now).filter((key) => !(BOOK_SECTION_IDS as readonly string[]).includes(key))];
  for (const section of order) {
    const was = before[section];
    const is = now[section];
    if (!was || !is) continue;
    const added = is.filter((line) => !was.includes(line));
    const removed = was.filter((line) => !is.includes(line));
    if (added.length > 0 || removed.length > 0) changes.push({ section, added, removed });
  }
  return changes;
}

// ── What Outpost holds near home ────────────────────────────────────────────

/** One place found in a reference layer, measured from home. */
export interface BookPlace {
  name: string;
  kindLabel: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  /** Compass bearing from home, 0 to 360. */
  bearingDegrees: number;
}

/** One kind of place the book looks for near home, in one reference layer. */
export interface BookPlaceGroup {
  id: string;
  label: string;
  /** The reference layer it is read from. */
  layer: string;
  /** Whether that layer holds anything at all: when not, the book says how to get it. */
  held: boolean;
  places: BookPlace[];
}

/** An area of a reference layer that holds home: a flood zone, an emergency planning zone. */
export interface BookArea {
  name: string;
  kindLabel: string;
}

export interface BookWind {
  /** The average direction the wind comes from over the year, in degrees, as NASA POWER gives it. */
  fromDegrees: number;
  /** By month, January first; null where none is given. */
  months: Array<number | null>;
  fetchedAt: number;
  period: string;
}

export interface BookClimate {
  months: ClimateMonth[];
  period: string;
  fetchedAt: number;
  /** The weather place the averages were kept for: home, or the nearest to it. */
  placeName: string;
  wind: BookWind | null;
}

/** A stop at the end of a day's walking. */
export interface BookStop {
  day: number;
  lat: number;
  lon: number;
  /** How far along the straight line, in metres. */
  alongMeters: number;
  /** The nearest populated place in the reference layers, and how far it is from the stop. */
  near: string | null;
  nearMeters: number | null;
}

export interface BookWalk {
  pace: WalkPaceId;
  hours: number;
  days: number;
  stops: BookStop[];
}

export interface BookJourney {
  destinationId: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  bearingDegrees: number;
  /** The ground along the straight line, from installed terrain; null when none is installed or the line is too long to read. */
  ground: {
    coverage: "terrain" | "partial" | "none";
    climbMeters: number;
    descentMeters: number;
    highestMeters: number;
    lowestMeters: number;
  } | null;
  walks: BookWalk[];
  /** Towns from the reference layers near the line, to draw on the route page. */
  towns: Array<{ name: string; lat: number; lon: number }>;
}

/** `GET /api/household-book/facts`: what Outpost holds that the book is made from, read for home now. */
export interface BookFacts {
  /**
   * The current household's home. For a portable household (`kind` "here") it is where a
   * person last said it is, set at `at`: the book says so, and never prints it as an address.
   */
  home: { name: string; lat: number; lon: number; country: string | null; kind?: "place" | "here"; at?: number | null } | null;
  help: BookPlaceGroup[];
  keepAway: BookPlaceGroup[];
  /** Null when the layer is not held. */
  floodZones: BookArea[] | null;
  planningZones: BookArea[] | null;
  climate: BookClimate | null;
  /** Whether any terrain is installed. */
  terrain: boolean;
  journeys: BookJourney[];
  /** The destinations that could not be measured, with why. */
  notMeasured: Array<{ destinationId: string; name: string; why: string }>;
}

// ── Walking a straight line ─────────────────────────────────────────────────

/** How long a straight line takes to walk, and where each day's walking ends. */
export interface LineWalk {
  hours: number;
  /** Where each day ends, as metres along the line; the last day ends at the end and has no stop. */
  stopsAt: number[];
}

/**
 * Walks a line sampled every `stepMeters`, with the height of the ground at each sample
 * (null where none is known: taken as level), at Tobler's pace on a path times `factor`,
 * for `hoursPerDay` a day. The line is a straight line, so the slopes are the ground's
 * along it, not a road's.
 */
export function walkLine(heights: ReadonlyArray<number | null>, stepMeters: number, factor: number, hoursPerDay: number): LineWalk {
  const day = Math.max(0.5, hoursPerDay);
  let hours = 0;
  let nextStop = day;
  const stopsAt: number[] = [];
  for (let index = 1; index < heights.length; index += 1) {
    const a = heights[index - 1];
    const b = heights[index];
    const slope = a === null || a === undefined || b === null || b === undefined ? 0 : (b - a) / stepMeters;
    const kmh = toblerKmh(slope) * factor;
    const segment = stepMeters / 1000 / kmh;
    // A day may end part of the way along a segment: placed by the share of the segment's time.
    while (hours + segment >= nextStop) {
      stopsAt.push((index - 1) * stepMeters + ((nextStop - hours) / segment) * stepMeters);
      nextStop += day;
    }
    hours += segment;
  }
  const total = (heights.length - 1) * stepMeters;
  // A stop at the very end is the arrival, not a night out.
  while (stopsAt.length > 0 && stopsAt[stopsAt.length - 1]! >= total - 1) stopsAt.pop();
  return { hours, stopsAt };
}

/** The paces a journey is worked out at: Tobler's as published, and the slowest Outpost offers, for children or someone hurt. */
export const BOOK_WALK_PACES: WalkPaceId[] = ["standard", "slowest"];
export const walkPaceOf = (id: WalkPaceId) => WALK_PACES.find((pace) => pace.id === id)!;

// ── Words ───────────────────────────────────────────────────────────────────

/** "1.2 km" or "350 m". */
export function metresWords(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Whether a bearing from home lies within `spread` degrees of another: a site upwind of home. */
export function withinDegrees(bearing: number, of: number, spread = 45): boolean {
  const difference = Math.abs(((((bearing - of) % 360) + 540) % 360) - 180);
  return difference <= spread;
}
