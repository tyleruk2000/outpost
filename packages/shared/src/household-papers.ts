/**
 * The household's papers, under Preparedness: a medical sheet for each person, the
 * communication plan ("Keeping in touch", in the primary, alternate, contingency and
 * emergency order), the grab card each person carries, and the household binder that
 * gathers the printables into one PDF.
 *
 * A medical sheet records what a person types for whoever has to be told: medicines,
 * allergies, conditions, the GP and pharmacy, next of kin. Outpost gives no medical
 * advice and checks nothing. A sheet may be kept encrypted with OpenPGP, in the browser,
 * as a page of notes can: the server then holds only the person's name and one armoured
 * message (`MEDICAL_PAYLOAD`), and nothing of the record can be searched, read by a tool
 * or counted down until it is opened again on a device.
 *
 * Contacts, saved places, repeaters and mesh channels are linked by id, never copied:
 * each screen and printable reads them as they are now, and says when one has gone.
 */
import type { ResolvedContact, ResolvedPlace } from "./emergency-plans.ts";
import { daysBetween } from "./supplies.ts";

// ── Medical sheets ───────────────────────────────────────────────────────────

export const MEDICAL_LIMITS = {
  sheets: 60,
  short: 120,
  text: 600,
  notes: 4000,
  lines: 40,
  /** One armoured message: a record at its largest, encrypted, is well under this. */
  armor: 400_000,
  held: 100_000,
} as const;

/** Blood groups as they are written on a donor card: ABO and RhD. Any other text may be typed. */
export const BLOOD_GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;

export interface MedicineLine {
  id: string;
  name: string;
  /** As the label says: "500 mg", "two puffs". */
  dose: string;
  /** "Morning and night", "when needed". */
  when: string;
  /** "Kitchen cupboard, top shelf", "in the grab bag". */
  keptWhere: string;
  /** How many were counted, in `unit` ("tablets"); null when not counted. */
  held: number | null;
  unit: string;
  /** How many are used in a day; null for one taken only when needed. */
  perDay: number | null;
  /** The day `held` was counted, YYYY-MM-DD. */
  countedOn: string | null;
}

export interface AllergyLine {
  id: string;
  what: string;
  /** What happens, in the person's words: "swelling, carries an adrenaline pen". */
  reaction: string;
}

export interface ConditionLine {
  id: string;
  what: string;
  note: string;
}

/** Someone to tell. Linked from Contacts, or typed. */
export interface KinLine {
  id: string;
  contactId: string | null;
  name: string;
  phone: string;
  /** "Mother", "Neighbour with a key". */
  relation: string;
}

/** A GP surgery or a pharmacy: from Contacts, or typed. */
export interface CareContact {
  contactId: string | null;
  name: string;
  phone: string;
}

export interface MedicalRecord {
  /** As typed: "9 March 1984". */
  born: string;
  /** One of BLOOD_GROUPS, other words, or empty when not known. */
  bloodGroup: string;
  allergies: AllergyLine[];
  conditions: ConditionLine[];
  medicines: MedicineLine[];
  gp: CareContact;
  pharmacy: CareContact;
  nextOfKin: KinLine[];
  /** "Wears a hearing aid", "NHS number in the blue folder". */
  notes: string;
}

export const emptyMedicalRecord = (): MedicalRecord => ({
  born: "",
  bloodGroup: "",
  allergies: [],
  conditions: [],
  medicines: [],
  gp: { contactId: null, name: "", phone: "" },
  pharmacy: { contactId: null, name: "", phone: "" },
  nextOfKin: [],
  notes: "",
});

export interface MedicalSheet {
  id: string;
  /** The person in the household (Supplies) it is for; null once they are taken out, or for someone not listed there. */
  memberId: string | null;
  /** Plain even when the sheet is encrypted, so that the list can say whose it is. */
  name: string;
  encrypted: boolean;
  /** The record; null when encrypted. */
  record: MedicalRecord | null;
  /** One armoured OpenPGP message; null when not encrypted. */
  armor: string | null;
  createdAt: number;
  updatedAt: number;
}

/** What `POST` and `PUT /api/medical-sheets` take: a record, or an armoured message, never both. */
export interface MedicalSheetInput {
  memberId: string | null;
  name: string;
  record?: MedicalRecord;
  armor?: string;
  /** For `PUT`: the `updatedAt` the change was based on. A newer stored sheet refuses it with 409. */
  baseUpdatedAt?: number;
  /** For `PUT` of a record over an encrypted sheet: says that taking the encryption off is meant. */
  removeEncryption?: boolean;
}

export interface MedicalSheetsResponse {
  sheets: MedicalSheet[];
  /** Whether plain sheets are in search (`medical.inSearch`). */
  inSearch: boolean;
  /** Whether a language model may read plain sheets, in Chat and over MCP (`tools.medical`). */
  inTools: boolean;
}

/** What is inside an encrypted sheet's message. `gpg --decrypt` prints it. */
export interface MedicalPayload {
  outpost: "medical-sheet";
  version: 1;
  name: string;
  record: MedicalRecord;
}

export const MEDICAL_PAYLOAD = "medical-sheet";

/** The one line every medical sheet carries, on screen and on paper. */
export const MEDICAL_CAVEAT =
  "Written by the household, not by a doctor. Outpost records what was typed and gives no medical advice: it checks no dose, interaction or allergy.";

/**
 * How long a counted medicine lasts: what was counted, less what a day uses for each day
 * since, divided by a day's use. Null when there is no count or no daily use.
 */
export function medicineLeft(
  line: Pick<MedicineLine, "held" | "perDay" | "countedOn">,
  today: string,
): { left: number; days: number; runsOut: string } | null {
  if (line.held === null || line.perDay === null || line.perDay <= 0 || !line.countedOn) return null;
  const since = Math.max(0, daysBetween(line.countedOn, today));
  const left = Math.max(0, line.held - line.perDay * since);
  const days = left / line.perDay;
  const out = new Date(Date.parse(`${today}T00:00:00Z`) + Math.floor(days) * 86_400_000).toISOString().slice(0, 10);
  return { left, days, runsOut: out };
}

/** The medicines that run out within `withinDays`, soonest first. */
export function medicinesRunningLow(record: MedicalRecord, today: string, withinDays = 14) {
  return record.medicines
    .map((line) => ({ line, left: medicineLeft(line, today) }))
    .filter((entry): entry is { line: MedicineLine; left: NonNullable<ReturnType<typeof medicineLeft>> } => entry.left !== null)
    .filter((entry) => entry.left.days < withinDays)
    .sort((a, b) => a.left.days - b.left.days);
}

// ── Keeping in touch: the communication plan ─────────────────────────────────

export type PaceLevel = "primary" | "alternate" | "contingency" | "emergency";
export const PACE_LEVELS: ReadonlyArray<{ id: PaceLevel; label: string; about: string }> = [
  { id: "primary", label: "Primary", about: "What you try first." },
  { id: "alternate", label: "Alternate", about: "If the first does not work." },
  { id: "contingency", label: "Contingency", about: "Slower or more effort, but likely to work." },
  { id: "emergency", label: "Emergency", about: "The last resort, agreed in advance." },
];
export const PACE_LEVEL_IDS = PACE_LEVELS.map((level) => level.id) as [PaceLevel, ...PaceLevel[]];

export type PaceMeans = "phone" | "text" | "mesh" | "radio" | "repeater" | "board" | "meet" | "other";
export const PACE_MEANS: ReadonlyArray<{ id: PaceMeans; label: string }> = [
  { id: "phone", label: "Phone call" },
  { id: "text", label: "Text message" },
  { id: "mesh", label: "Mesh radio message" },
  { id: "radio", label: "Radio channel" },
  { id: "repeater", label: "Radio repeater" },
  { id: "board", label: "The household board" },
  { id: "meet", label: "Meet in person" },
  { id: "other", label: "Something else" },
];
export const PACE_MEANS_IDS = PACE_MEANS.map((means) => means.id) as [PaceMeans, ...PaceMeans[]];
export const paceMeansLabel = (id: string): string => PACE_MEANS.find((means) => means.id === id)?.label ?? id;

/** A channel from Outpost's own list of frequencies: an entry, and one of its channels by name ("3"), or its first frequency. */
export interface PaceFrequency {
  entryId: string;
  channel: string;
}

export interface PaceStep {
  id: string;
  level: PaceLevel;
  means: PaceMeans;
  /** Who: a contact to call or text. */
  contactId: string | null;
  /** For a radio channel. */
  frequency: PaceFrequency | null;
  repeaterId: string | null;
  /** A mesh channel, as the board names it ("meshtastic:longfast"). */
  meshChannel: string | null;
  /** Where to meet: a saved place, or only described in `text`. */
  markerId: string | null;
  /** When: "on the hour for five minutes", "at noon". */
  when: string;
  /** Anything else, in the household's words. */
  text: string;
}

export interface CommsSituation {
  id: string;
  /** "Phones down", "Away from home when it happens". */
  name: string;
  steps: PaceStep[];
  /** When to check in, in this situation: "12:00 and 18:00". */
  checkIn: string;
  /** Who to contact, in order: ids from Contacts. */
  contactIds: string[];
}

/** One person the plan is printed for, with what is theirs alone: "Sam: wait at the school office". */
export interface CommsPerson {
  id: string;
  memberId: string | null;
  name: string;
  note: string;
}

export interface CommsPlan {
  situations: CommsSituation[];
  /** When everyone checks in, whatever the situation: "Every day at 12:00". */
  checkIns: string;
  people: CommsPerson[];
  notes: string;
  /** Null until it is first saved. */
  updatedAt: number | null;
}

export const COMMS_LIMITS = { situations: 12, steps: 12, people: 30, contacts: 12, short: 120, text: 600, notes: 4000 } as const;

export const emptyCommsPlan = (): CommsPlan => ({ situations: [], checkIns: "", people: [], notes: "", updatedAt: null });

export interface ResolvedRepeater {
  callsign: string;
  outputHz: number;
  inputHz: number | null;
  ctcssHz: number | null;
  place: string;
}

/** What the plan's links point at now. A deleted one is null, never dropped. */
export interface CommsResolved {
  contacts: Record<string, ResolvedContact | null>;
  places: Record<string, ResolvedPlace | null>;
  repeaters: Record<string, ResolvedRepeater | null>;
  /** A mesh channel's label as the mesh set-up names it, or null when that channel is no longer set up. */
  mesh: Record<string, string | null>;
}

export interface CommsResponse {
  plan: CommsPlan;
  resolved: CommsResolved;
}

export type CommsInput = Omit<CommsPlan, "updatedAt"> & { baseUpdatedAt?: number | null };

/** "145.500 MHz", from hertz. */
export const megahertz = (hz: number): string => `${(hz / 1e6).toFixed(hz % 1000 === 0 ? 3 : 4)} MHz`;

// ── The household binder ─────────────────────────────────────────────────────

/** The printables a binder can gather, in the order its contents page lists them. */
export const BINDER_PARTS = [
  { id: "plans", label: "Emergency plans", about: "Each plan's fridge sheet: the steps, numbers and places to meet." },
  { id: "contacts", label: "Emergency contacts", about: "The contacts marked for emergencies, with their numbers." },
  { id: "comms", label: "Keeping in touch", about: "The communication plan, a page for each person." },
  { id: "grab-cards", label: "Grab cards", about: "A card for each person, to cut out." },
  { id: "medical", label: "Medical sheets", about: "One sheet for each person who has one. Encrypted sheets only once opened." },
  { id: "frequencies", label: "Frequencies", about: "The channels the communication plan uses, from Outpost's list." },
  { id: "places", label: "Home and meeting points", about: "Where home and each meeting point is, in several grid formats." },
  { id: "supplies", label: "Supplies", about: "What is kept, how long it lasts and what to buy." },
] as const;
export type BinderPart = (typeof BINDER_PARTS)[number]["id"];
export const BINDER_PART_IDS = BINDER_PARTS.map((part) => part.id) as [BinderPart, ...BinderPart[]];

/** The record of the binder last made. */
export interface BinderMade {
  parts: BinderPart[];
  /** When the newest thing in it was last changed: the binder is dated by its content. */
  contentAt: number;
  madeAt: number;
  pages: number;
  /**
   * What each part was made from, as `BinderStatus.fingerprints` said when it was made. A
   * binder recorded before these were kept has none, and is compared by `contentAt` alone.
   */
  fingerprints?: Record<BinderPart, string> | null;
}

export interface BinderStatus {
  made: BinderMade | null;
  /** When each part's content last changed; null when it has none. */
  changedAt: Record<BinderPart, number | null>;
  /** What each part is made from now, as a short hash that changes with any change to it, a deletion included. */
  fingerprints: Record<BinderPart, string>;
  /** The parts of the binder last made that have changed since: what makes it older than its contents. */
  stale: BinderPart[];
}

/**
 * Which of a binder's parts changed after it was made: by what it was made from where the
 * binder recorded that (a deletion counts), and otherwise by when its content last changed.
 */
export function staleParts(
  made: BinderMade | null,
  changedAt: Record<BinderPart, number | null>,
  fingerprints?: Record<BinderPart, string>,
): BinderPart[] {
  if (!made) return [];
  const then = made.fingerprints;
  if (then && fingerprints) return made.parts.filter((part) => then[part] !== undefined && then[part] !== fingerprints[part]);
  return made.parts.filter((part) => {
    const at = changedAt[part];
    return at !== null && at > made.contentAt;
  });
}

// ── Grab cards ──────────────────────────────────────────────────────────────

export type GrabCardSize = "wallet" | "a6";
export type GridFormat = "decimal" | "dms" | "osgb" | "maidenhead";
export const GRID_FORMATS: ReadonlyArray<{ id: GridFormat; label: string }> = [
  { id: "decimal", label: "Decimal degrees" },
  { id: "dms", label: "Degrees, minutes, seconds" },
  { id: "osgb", label: "British National Grid" },
  { id: "maidenhead", label: "Maidenhead locator" },
];
