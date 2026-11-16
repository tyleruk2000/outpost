/**
 * Emergency plans, under Preparedness: what a household has agreed to do in a power cut,
 * a flood, a storm or anything else, written on a quiet evening to be read on a bad one.
 *
 * A plan is general: a kind (one of a few known ones, or free text), ordered steps for
 * before, during and after, the household's people, the people to contact in order, the
 * places to meet, how to communicate, the supplies it needs, a power plan, where things
 * are in the home, and links. Every part may be empty. Templates to start one from are
 * in `emergency-templates.ts`, each step traced to a dated official source.
 *
 * Contacts and saved places are linked by id, not copied: the server answers each plan
 * with what they are now, and says plainly when one has been deleted since (`resolved`).
 * The name it had when it was linked is kept beside the id, so that a missing one can
 * still be named.
 */
import type { SupplyCategory } from "./supplies.ts";

export const PLAN_KINDS = [
  { id: "power-cut", label: "Power cut" },
  { id: "flooding", label: "Flooding" },
  { id: "comms-failure", label: "No phone or internet" },
  { id: "severe-weather", label: "Severe weather" },
  { id: "shelter-at-home", label: "Sheltering at home" },
  { id: "evacuate", label: "Leaving home at short notice" },
  { id: "other", label: "Something else" },
] as const;
export type PlanKind = (typeof PLAN_KINDS)[number]["id"];
export const PLAN_KIND_IDS = PLAN_KINDS.map((kind) => kind.id) as [PlanKind, ...PlanKind[]];
export const planKindLabel = (id: string): string => PLAN_KINDS.find((kind) => kind.id === id)?.label ?? id;

export type PlanPhase = "before" | "during" | "after";
export const PLAN_PHASES: Array<{ id: PlanPhase; label: string }> = [
  { id: "before", label: "Before" },
  { id: "during", label: "During" },
  { id: "after", label: "After" },
];

export const PLAN_LIMITS = {
  plans: 200,
  name: 120,
  kindText: 80,
  text: 600,
  short: 120,
  notes: 20_000,
  steps: 120,
  people: 30,
  contacts: 30,
  places: 12,
  supplies: 120,
  where: 40,
  links: 40,
  quantity: 1_000_000,
} as const;

/**
 * One step. `origin` is the id of the template step it was made from, or null for one
 * the household wrote. A step from a template whose words have since been changed is
 * still told apart from the template's own wording: the screen compares its text with
 * the template's (see `stepStanding`).
 */
export interface PlanStep {
  id: string;
  phase: PlanPhase;
  text: string;
  origin: string | null;
}

/** Someone in the household, with what they need to remember, and what their wallet card says. */
export interface PlanPerson {
  id: string;
  name: string;
  /** What this person needs to remember or do: "Fetch Sam from school". */
  remember: string;
  /** Anything medical the person chooses to have on their wallet card. Printed only on their own card. */
  medical: string;
  /** Linked from Contacts, for their own number on the card; null when typed. */
  contactId: string | null;
}

/** Someone to contact, in the order listed. Linked from Contacts, or typed. */
export interface PlanContact {
  id: string;
  /** Null for a contact typed in the plan. */
  contactId: string | null;
  /** The name as typed, or as the contact was named when it was linked (kept to name it if it is deleted). */
  name: string;
  /** A number typed in the plan. For a linked contact, the number from Contacts is used, and this is empty. */
  phone: string;
  /** Why: "Grandma, has a spare key", "Electricity network". */
  note: string;
  /** Someone far enough away not to be caught up in the same event. */
  outOfArea: boolean;
}

export type PlaceRole = "near" | "away" | "other";
export const PLACE_ROLES: Array<{ id: PlaceRole; label: string; about: string }> = [
  { id: "near", label: "If the home cannot be used", about: "Somewhere close by: a neighbour's door, the end of the road." },
  { id: "away", label: "If the neighbourhood cannot be used", about: "Somewhere further: a relative's house, a public building." },
  { id: "other", label: "Another place", about: "A rest centre, a school, where the car is." },
];

export interface PlanPlace {
  id: string;
  role: PlaceRole;
  /** A saved place on the map, or null for one only described. */
  markerId: string | null;
  /** As typed, or as the saved place was named when it was linked. */
  name: string;
  note: string;
}

/** How the household will reach each other if the phones fail. */
export interface PlanComms {
  /** In the household's words: "Meet at the church at noon each day; note on the fridge". */
  text: string;
  /** A communication plan under Radio. */
  commPlanId: string | null;
  frequency: string;
  schedule: string;
}

/** One thing this plan needs. A quantity is for the whole household unless `perPerson`, and for the whole period unless `perDay`. */
export interface PlanSupply {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  perPerson: boolean;
  perDay: boolean;
  /** The supplies category it would be found under, to look it up in the inventory; null to look by name only. */
  category: SupplyCategory | null;
  origin: string | null;
}

/** Where something is in the home: the stopcock, the fuse board. */
export interface PlanWhere {
  id: string;
  what: string;
  where: string;
  origin: string | null;
}

export interface EmergencyPlanLink {
  kind: "note" | "document" | "place";
  id: string;
}

export interface PlanBody {
  steps: PlanStep[];
  people: PlanPerson[];
  contacts: PlanContact[];
  places: PlanPlace[];
  comms: PlanComms;
  /** Days the supplies should cover; null for none set. */
  days: number | null;
  supplies: PlanSupply[];
  powerPlanId: string | null;
  where: PlanWhere[];
  notes: string;
  links: EmergencyPlanLink[];
}

export interface EmergencyPlanInput {
  name: string;
  kind: PlanKind;
  /** What the plan is for in the household's words, for "other", or to narrow a known kind ("Storm"). */
  kindText: string;
  /** The template it was started from, or null for a blank plan. */
  templateId: string | null;
  /** The number for the emergency services where the household is: "999" in the UK. Plain text. */
  emergencyNumber: string;
  /** Days after which the plan asks to be looked over again; null never to ask. */
  reviewEveryDays: number | null;
  body: PlanBody;
}

/** A plan in use: when it was started, and when each step was ticked. */
export interface PlanUse {
  startedAt: number | null;
  /** Step id to the time it was ticked. */
  ticks: Record<string, number>;
}

/**
 * Ticks made on a phone while the server was out of reach, sent when it is back
 * (`POST /api/emergency-plans/:id/ticks/merge`). The rule, `mergeTicks` on the server:
 *
 * - a tick is added with the time it was made; where the step is ticked on the server
 *   already, the earlier of the two times is kept (the union, earliest time);
 * - an untick takes a tick away only if the server still has that very tick (the time
 *   the phone saw), so a step ticked again elsewhere meanwhile stays ticked;
 * - if the plan was reset on the server since the phone's copy (`knownStartedAt` is not
 *   its start time now), what the phone did before the new start is dropped;
 * - anything for a step no longer in the plan is dropped.
 */
export interface PlanTickMerge {
  /** The start time the phone's copy had. */
  knownStartedAt: number | null;
  /** Step id to when it was ticked on the phone. */
  ticks: Record<string, number>;
  /** Step id to the time of the server's tick that was unticked on the phone. */
  unticks: Record<string, number>;
}

export interface PlanTickMergeResponse extends EmergencyPlanResponse {
  /** How many of the phone's changes were applied, and how many were dropped by the rule. */
  applied: number;
  dropped: number;
}

export interface EmergencyPlan extends EmergencyPlanInput {
  id: string;
  use: PlanUse;
  /** When it was last marked as looked over (or made). */
  reviewedAt: number;
  /** When it was last opened. */
  openedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** A linked contact as it is now; null when it has been deleted from Contacts. */
export interface ResolvedContact {
  displayName: string;
  phones: Array<{ value: string; label: string }>;
  callsign: string;
}
export interface ResolvedPlace {
  name: string;
  lat: number;
  lon: number;
}

/** What the plan's links point at now. A missing one is null: never dropped. */
export interface PlanResolved {
  contacts: Record<string, ResolvedContact | null>;
  places: Record<string, ResolvedPlace | null>;
  commPlan: { id: string; name: string } | null | undefined;
  powerPlan: { id: string; name: string } | null | undefined;
  links: Array<EmergencyPlanLink & { title: string | null; lat?: number; lon?: number }>;
}

/** `GET /api/emergency-plans/:id` and every change. */
export interface EmergencyPlanResponse {
  plan: EmergencyPlan;
  resolved: PlanResolved;
}

export interface EmergencyPlanSummary {
  id: string;
  name: string;
  kind: PlanKind;
  kindText: string;
  steps: number;
  ticked: number;
  startedAt: number | null;
  reviewedAt: number;
  reviewEveryDays: number | null;
  openedAt: number | null;
  /** Linked contacts or places deleted since. */
  missing: number;
  updatedAt: number;
}

export const emptyPlanBody = (): PlanBody => ({
  steps: [],
  people: [],
  contacts: [],
  places: [],
  comms: { text: "", commPlanId: null, frequency: "", schedule: "" },
  days: null,
  supplies: [],
  powerPlanId: null,
  where: [],
  notes: "",
  links: [],
});

/** Looked over every six months unless the household says otherwise. */
export const DEFAULT_REVIEW_DAYS = 180;

// ── Review ───────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** When the plan asks to be looked over, and whether that is now. */
export function reviewDue(plan: Pick<EmergencyPlan, "reviewedAt" | "reviewEveryDays">, now: number): { due: boolean; at: number | null } {
  if (plan.reviewEveryDays === null) return { due: false, at: null };
  const at = plan.reviewedAt + plan.reviewEveryDays * DAY_MS;
  return { due: now >= at, at };
}

// ── The emergency number ──────────────────────────────────────────────────────

/**
 * The number offered first, by the country the device says it is in. Everywhere else
 * the household types its own. The numbers and where each comes from are in
 * `emergency-templates.ts` (`EMERGENCY_NUMBERS`).
 */
export const DEFAULT_EMERGENCY_NUMBER = "999";

// ── The supplies this plan needs, against what is held ───────────────────────

export type SupplyStanding = "in-stock" | "low" | "missing" | "check";

/** A row of the inventory as the comparison needs it. */
export interface HeldRow {
  name: string;
  category: SupplyCategory;
  quantity: number;
  unit: string;
  /** Past its use-by: not counted. */
  expired?: boolean;
}

export interface SupplyCheck {
  id: string;
  name: string;
  /** Wanted for the household over the days, in `unit`; null when the plan gives no quantity. */
  needed: number | null;
  unit: string;
  /** Held in the same unit (or with no unit on either side). */
  held: number;
  /** Rows of the inventory that matched. */
  rows: number;
  /** Matched rows in another unit, whose amount cannot be compared. */
  otherUnits: string[];
  standing: SupplyStanding;
  /** What to add to the shopping list: the shortfall in `unit`, null when none can be said. */
  short: number | null;
}

/** A word without its plural: "batteries" is "battery", "torches" is "torch", "tins" is "tin". */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singular);

/**
 * The words of a plan's line that name the thing itself: those before its first
 * bracket, comma, "and", "or", "that", "with" or "for". "Torch (battery or wind-up)
 * and spare batteries" is looked for as "Torch"; "Bottled water" as itself.
 */
export function thingOf(name: string): string {
  const head = name.split(/\s*[(,;:]|\s+(?:and|or|that|with|for)\s+/i)[0] ?? name;
  return head.trim() || name.trim();
}

/** Whether an inventory row is the thing a plan names: every word of the plan's name is in the row's name, plurals aside. */
export function sameThing(planName: string, rowName: string): boolean {
  const wanted = words(planName);
  if (wanted.length === 0) return false;
  const have = new Set(words(rowName));
  return wanted.every((word) => have.has(word));
}

const sameUnit = (a: string, b: string) => {
  const norm = (unit: string) => singular(unit.trim().toLowerCase());
  return norm(a) === norm(b);
};

/** The quantity a line wants for a household of `people` over `days` days; null with no quantity, or a factor not known. */
export function neededOf(
  supply: Pick<PlanSupply, "quantity" | "perPerson" | "perDay">,
  people: number,
  days: number | null,
): number | null {
  if (supply.quantity === null) return null;
  if (supply.perDay && days === null) return null;
  return supply.quantity * (supply.perPerson ? people : 1) * (supply.perDay ? (days ?? 1) : 1);
}

/**
 * Each thing the plan lists set beside what the inventory holds. A row matches when it
 * is in the line's category (if the line names one) and its name has every word of the
 * line's name. Its amount counts when its unit is the line's unit, or neither has one;
 * a row past its use-by is not counted.
 *
 * - in stock: held at least what is needed, or, with no quantity, anything held;
 * - low: some held, less than needed;
 * - missing: nothing held;
 * - check: held only in another unit, so it cannot be said whether it is enough.
 */
export function compareSupplies(supplies: PlanSupply[], held: HeldRow[], people: number, days: number | null): SupplyCheck[] {
  return supplies.map((supply) => {
    const matched = held.filter(
      (row) =>
        !row.expired &&
        row.quantity > 0 &&
        (supply.category === null || row.category === supply.category) &&
        sameThing(thingOf(supply.name), row.name),
    );
    const counted = matched.filter((row) => sameUnit(row.unit, supply.unit) || (!row.unit.trim() && !supply.unit.trim()));
    const other = matched.filter((row) => !counted.includes(row));
    const amount = counted.reduce((sum, row) => sum + row.quantity, 0);
    const needed = neededOf(supply, people, days);
    let standing: SupplyStanding;
    if (matched.length === 0) standing = "missing";
    else if (counted.length === 0) standing = "check";
    else if (needed === null || amount >= needed) standing = "in-stock";
    else standing = "low";
    const short =
      standing === "missing" ? needed : standing === "low" && needed !== null ? Math.ceil((needed - amount) * 1000) / 1000 : null;
    return {
      id: supply.id,
      name: supply.name,
      needed,
      unit: supply.unit,
      held: amount,
      rows: matched.length,
      otherUnits: [...new Set(other.map((row) => row.unit.trim() || "no unit"))],
      standing,
      short,
    };
  });
}

/** The one line every plan carries, on screen and on paper. */
export const planCaveat = (emergencyNumber: string): string =>
  `This is our household's own plan, made in advance. In a real emergency, follow the emergency services and official warnings. Emergency services: ${emergencyNumber.trim() || DEFAULT_EMERGENCY_NUMBER}.`;
