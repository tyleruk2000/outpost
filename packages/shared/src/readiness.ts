/**
 * Shapes for the household's readiness, under Preparedness: the log of events, routine
 * checks with the date each was last done, and the offline drill. The roll call is the
 * board's (board.ts), since check-ins are.
 */

// ── The log of events ──

export const EVENT_LOG_LIMITS = {
  /** Characters in one line of the log. */
  text: 1000,
  /** Lines answered at once; the screen asks for older ones by time. */
  page: 500,
  /** How far before now a line may say it happened. */
  backdateDays: 30,
} as const;

/** One line as the log shows it: one written in the log, a check-in from the board, or a step ticked in a plan. */
export interface EventLogLine {
  kind: "entry" | "checkin" | "tick";
  /** The entry's id; for a check-in the board message's, for a tick "planId:stepId". */
  id: string;
  /** When it happened. */
  at: number;
  /** Who wrote it down; empty for a tick, which records no name. */
  author: string;
  text: string;
  planId: string | null;
  planName: string | null;
  /** Entries only: when it was written, and the date to send back with an edit. */
  createdAt: number;
  updatedAt: number;
  edited: { at: number; by: string } | null;
}

export interface EventLogResponse {
  lines: EventLogLine[];
  /** Entries in the log altogether, whatever is shown. */
  entries: number;
  /** The plan in use now (started and not reset), to link a new line to; null when none is. */
  planInUse: { id: string; name: string } | null;
}

export interface EventLogInput {
  author: string;
  text: string;
  /** When it happened; now when left out. */
  at?: number;
  planId?: string | null;
}

export interface EventLogEditInput {
  by: string;
  text?: string;
  at?: number;
  baseUpdatedAt: number;
}

export interface EventLogQuery {
  /** Only what happened at or after this time. */
  from?: number;
  /** Also show check-ins from the board and steps ticked in plans. */
  others?: boolean;
}

export interface EventLogToNotesResponse {
  note: { id: string; title: string };
  lines: number;
}

// ── Routine checks ──

/** The screens of Outpost a check can belong to, and where each is. */
export const CHECK_LINKS = {
  supplies: { to: "/prepare/supplies", label: "Supplies" },
  backup: { to: "/settings#backup", label: "Settings, Backup" },
  plans: { to: "/prepare/plans", label: "Emergency plans" },
  contacts: { to: "/contacts", label: "Contacts" },
  power: { to: "/tools/power", label: "Power" },
  drill: { to: "/prepare/offline-drill", label: "Offline drill" },
} as const;
export type CheckLink = keyof typeof CHECK_LINKS;
export const CHECK_LINK_IDS = Object.keys(CHECK_LINKS) as [CheckLink, ...CheckLink[]];

export const CHECK_LIMITS = { name: 120, note: 1000, checks: 60, everyDaysMax: 3650 } as const;

export interface RoutineCheckTemplate {
  id: string;
  name: string;
  everyDays: number;
  note: string;
  link: CheckLink | null;
  /** Where the interval comes from: a published source, or null for Outpost's own suggestion. */
  source: { name: string; url: string; read: string } | null;
}

/**
 * The list a household starts from and edits. Only the water's interval is from a
 * published source; the rest are Outpost's suggestions, said as such on the screen.
 */
export const ROUTINE_CHECK_TEMPLATE: RoutineCheckTemplate[] = [
  {
    id: "water",
    name: "Replace stored water you filled yourself",
    everyDays: 182,
    note: "Water bought sealed keeps until the date on it.",
    link: "supplies",
    source: { name: "Ready.gov, Water", url: "https://www.ready.gov/water", read: "21 Nov 2026" },
  },
  { id: "torches", name: "Test the torches and replace flat batteries", everyDays: 90, note: "", link: null, source: null },
  { id: "generator", name: "Run the generator", everyDays: 30, note: "Outside, never indoors or in a garage.", link: "power", source: null },
  { id: "radios", name: "Charge the radios and power banks", everyDays: 30, note: "", link: null, source: null },
  { id: "expiry", name: "Replace what expires in Supplies", everyDays: 30, note: "", link: "supplies", source: null },
  { id: "restore", name: "Test restoring a backup", everyDays: 182, note: "", link: "backup", source: null },
  { id: "plans", name: "Read through the emergency plans together", everyDays: 365, note: "", link: "plans", source: null },
  { id: "drill", name: "Do the offline drill", everyDays: 182, note: "", link: "drill", source: null },
];

export interface RoutineCheck {
  id: string;
  name: string;
  everyDays: number;
  note: string;
  link: CheckLink | null;
  templateId: string | null;
  lastDoneAt: number | null;
  lastDoneBy: string | null;
  /** When it is next due: the last time plus its interval; null when it has never been done. */
  dueAt: number | null;
  /** Never done, or past its due time. */
  overdue: boolean;
  position: number;
  updatedAt: number;
}

export interface RoutineChecksResponse {
  checks: RoutineCheck[];
  /** Supplies with a use-by or best-before date within 30 days, or already past: for the check linked to Supplies. */
  expiringSupplies: number;
}

export interface RoutineCheckInput {
  name: string;
  everyDays: number;
  note?: string;
  link?: CheckLink | null;
}

export interface RoutineCheckDoneInput {
  by: string;
  /** When it was done; now when left out. Null clears it, as if never done. */
  at?: number | null;
}

// ── The offline drill ──

export type DrillState = "held" | "missing" | "stale" | "untried";

/** One thing the household would need with the internet off, and whether Outpost holds it. */
export interface DrillLine {
  id: string;
  title: string;
  state: DrillState;
  /** What Outpost holds, in a sentence. */
  summary: string;
  /** The screen that fixes it. */
  link: { to: string; label: string } | null;
}

export interface DrillRun {
  id: string;
  by: string;
  startedAt: number;
  finishedAt: number;
  answers: Record<string, "worked" | "failed">;
  notes: string;
}

export interface OfflineDrillResponse {
  checkedAt: number;
  lines: DrillLine[];
  lastRun: DrillRun | null;
}

export interface DrillRunInput {
  by: string;
  startedAt: number;
  answers: Record<string, "worked" | "failed">;
  notes?: string;
}

/** The steps to follow with the internet off, ticked on a phone. Kept in the app, so they open without the server. */
export const DRILL_STEPS: Array<{ id: string; text: string; hint?: string }> = [
  {
    id: "unplug",
    text: "Unplug the cable that brings the internet into the router, or switch the broadband off. Leave the home Wi-Fi on.",
    hint: "To try the phone away from home too, switch the whole router off for the last steps.",
  },
  { id: "open", text: "On a phone, open Outpost at the address you always use." },
  { id: "map", text: "Open Maps and find home. Zoom in until the streets are clear." },
  { id: "names", text: "Search the map for a nearby town or street by name." },
  { id: "plan", text: "Open an emergency plan and choose Use now. Tick the first step." },
  { id: "contacts", text: "Open Contacts and find the emergency list." },
  { id: "checkin", text: "Check in on the board from the phone: Messages, I'm safe." },
  { id: "search", text: "Search the library for something you would need, such as treating a burn." },
  { id: "frequencies", text: "Open Radio, Frequencies to listen to, and find a station for news." },
  { id: "radio", text: "With the mains switched off, listen on the battery or wind-up radio and hear a station." },
  {
    id: "away",
    text: "Switch the whole router off. On the phone, open Outpost again: what you kept on the phone should still open.",
    hint: "Only on HTTPS. Pages, map areas and plans kept on the phone open; everything else says it needs the server.",
  },
  { id: "back", text: "Plug everything back in. Check that what you wrote or ticked on the phone reached Outpost." },
];
