/**
 * Households and people (modules/households): the API's shapes, shared by the server and
 * the web app. See docs/development/households.md for the model.
 *
 * A household is a place things are kept for: one's own home, the family's, a caravan.
 * People (and pets) are global; a household lists which of them it holds, in order, and
 * one person may be in several. One household is current for the whole Outpost (a
 * server setting, not per device); every per-household screen works on it.
 */
import { type HouseholdMember, SUPPLY_LIMITS } from "./supplies.ts";

/** The id of the first household: what every table keyed by household held before there were several. */
export const FIRST_HOUSEHOLD_ID = "household";

/** The name the first household is given when Outpost makes it. */
export const FIRST_HOUSEHOLD_NAME = "Home";

/** "fixed": home is a saved place. "portable" (a caravan, a car, a hiking group): home is where it is now. */
export type HouseholdKind = "fixed" | "portable";
export const HOUSEHOLD_KIND_IDS = ["fixed", "portable"] as const satisfies readonly HouseholdKind[];

/** How a portable household's position was set: the device's location, a point on the map, or a saved place. */
export type HereSource = "device" | "map" | "place";
export const HERE_SOURCES = ["device", "map", "place"] as const satisfies readonly HereSource[];

export const HOUSEHOLD_LIMITS = {
  households: 20,
  name: 80,
  /** People in one household (the same as the supplies screen has always allowed). */
  peoplePerHousehold: SUPPLY_LIMITS.members,
  /** People and pets in the whole Outpost. */
  people: 200,
  /** Positions kept for each portable household, newest first. */
  positions: 50,
  hereName: 120,
} as const;

/** A person or a pet. Today's `HouseholdMember` of supplies, under the name the households screens use. */
export type Person = HouseholdMember;

/** A person as the People list gives them: which households they are in, and how many medical sheets are theirs. */
export interface PersonDto extends Person {
  householdIds: string[];
  medicalSheets: number;
  createdAt: number;
  updatedAt: number;
}

/** What is sent to add or change a person: the person without the id. */
export type PersonInput = Omit<Person, "id">;

/** POST /api/people: a person, and the households to put them in (left out: the current one). */
export interface PersonCreateInput extends PersonInput {
  householdIds?: string[];
}

export interface PeopleResponse {
  people: PersonDto[];
}

export interface PersonResponse {
  person: PersonDto;
}

/**
 * Where a household is: for a fixed one, its saved place; for a portable one, where a
 * person last said it is. `at` is when that was set (null for a saved place), so that a
 * screen can say "as of 3 hours ago".
 */
export interface HouseholdHome {
  /** "place": a saved place on the map. "here": a portable household's position. */
  kind: "place" | "here";
  /** The saved place's id (markers), or null for a position. */
  id: string | null;
  name: string;
  lat: number;
  lon: number;
  /** ISO 3166-1 alpha-2 of the country whose outline holds the point (`countryIn`), or null. */
  country: string | null;
  /** Other countries within a few kilometres of the point: the country may be wrong there, so it is asked. */
  countryNear?: string[];
  /** When a portable household's position was set; null for a saved place. */
  at: number | null;
  source: HereSource | null;
}

/** A position a portable household was at. */
export interface HouseholdPosition {
  id: string;
  lat: number;
  lon: number;
  name: string | null;
  at: number;
  source: HereSource;
}

export interface HouseholdDto {
  id: string;
  name: string;
  position: number;
  kind: HouseholdKind;
  /** A fixed household's chosen saved place (it may since have been removed: then `home` is null). */
  homePlaceId: string | null;
  /** A portable household's base (where it is kept): shown, never taken as home. */
  basePlaceId: string | null;
  /** Where the household is, as every place user takes it (`households.home`). */
  home: HouseholdHome | null;
  /** A country the person chose in place of the one home is in. */
  countryOverride: string | null;
  /** The country every country user takes: the override, else the home's, else null. */
  country: string | null;
  /** A portable household's last position, kept when it is made fixed again. */
  here: HouseholdPosition | null;
  /** Who is in it, in order (ids of `Person`). */
  personIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface HouseholdsResponse {
  households: HouseholdDto[];
  /** The one current household, for the whole Outpost. */
  currentId: string;
}

export interface HouseholdResponse {
  household: HouseholdDto;
}

/** POST /api/households. */
export interface HouseholdCreateInput {
  name: string;
  kind?: HouseholdKind;
  homePlaceId?: string | null;
  basePlaceId?: string | null;
  /** Put the same people in it as are in this household, in the same order. */
  copyPeopleFrom?: string | null;
}

/** PUT /api/households/:id: only what is named changes. Changing `kind` keeps the place and the position both. */
export interface HouseholdUpdateInput {
  name?: string;
  kind?: HouseholdKind;
  homePlaceId?: string | null;
  basePlaceId?: string | null;
  countryOverride?: string | null;
}

/** PUT /api/households/:id/people: everyone in it, in order. */
export interface HouseholdPeopleInput {
  personIds: string[];
}

/** PUT /api/households/current. */
export interface HouseholdCurrentInput {
  id: string;
}

/** PUT /api/households/:id/here: "We're here now", from a person's press only. */
export interface HouseholdHereInput {
  lat: number;
  lon: number;
  name?: string | null;
  source: HereSource;
}

export interface HouseholdPositionsResponse {
  positions: HouseholdPosition[];
}

/**
 * What a household holds, as DELETE /api/households/:id says it (409 `details.holds`)
 * before it is removed. People are never removed with a household: `peopleOnlyHere` are
 * those who will be in no household afterwards (still on the People list, with their
 * medical sheets, `theirMedicalSheets`).
 */
export interface HouseholdHolds {
  supplies: number;
  shoppingLines: number;
  emergencyPlans: number;
  logEntries: number;
  routineChecks: number;
  sowings: number;
  powerPlans: number;
  /** Medical sheets not linked to a person, kept with the household: these are removed with it. */
  medicalSheets: number;
  /** Its own supplies settings, keeping in touch plan, book, binder record, garden setting. */
  papers: number;
  positions: number;
  people: number;
  peopleOnlyHere: number;
  theirMedicalSheets: number;
}

/** DELETE /api/people/:id refused (409 `details`) until `confirm=true`: what goes with the person. */
export interface PersonHolds {
  householdIds: string[];
  /** Their medical sheets. They are kept, no longer linked to anyone, with the person's first household. */
  medicalSheets: number;
}

/** Published whenever a household, its people or the current one changes. `currentChanged` resets every screen. */
export const HOUSEHOLDS_CHANGED = "households.changed";
export interface HouseholdsChangedData {
  currentChanged?: boolean;
}

/** What a place user says of a moving home: "Where the caravan is now, as of 3 hours ago". */
export function homeAgeMs(home: Pick<HouseholdHome, "at"> | null, now: number): number | null {
  return home?.at == null ? null : Math.max(0, now - home.at);
}
