import type { EffectsInput } from "./nuclear-effects.ts";

/**
 * Nuclear preparedness: a scenario a person has saved in the effects simulator. Only
 * what they typed is kept (the place, the yield, the height, the wind, the name and
 * notes); the effects are worked out again from it each time it is opened, so a saved
 * scenario always shows what the current model says.
 */
export interface NuclearScenarioInput {
  name: string;
  notes: string;
  /** Ground zero. */
  lat: number;
  lon: number;
  effects: EffectsInput;
}

export interface NuclearScenario extends NuclearScenarioInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}

/** What `PATCH /api/nuclear/scenarios/:id` takes: the whole scenario, and the version it was changed from. */
export interface NuclearScenarioUpdate extends NuclearScenarioInput {
  /**
   * The `updatedAt` this change was based on. When the stored scenario is newer the
   * change is refused with 409 `conflict` and `details.current`, so nothing is overwritten.
   */
  baseUpdatedAt?: number;
}

/** `details` of the 409 answer to a change that would overwrite a newer version. */
export interface NuclearScenarioConflictDetails {
  current: { updatedAt: number; name: string };
}

export const SCENARIO_NAME_MAX = 120;
export const SCENARIO_NOTES_MAX = 8000;

/** The most scenarios on the map at once, and in a saved set: A to F. */
export const MAX_SCENARIOS_SHOWN = 6;
export const SCENARIO_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
export type ScenarioLetter = (typeof SCENARIO_LETTERS)[number];

/** One scenario of a saved set: what was typed, under its letter, and whether it was hidden. */
export interface NuclearSetMember extends NuclearScenarioInput {
  letter: ScenarioLetter;
  hidden: boolean;
}

export interface NuclearSetInput {
  name: string;
  members: NuclearSetMember[];
}

/**
 * Scenarios kept together as they were on the map. Only what was typed: nothing about
 * the set as a whole is worked out, kept or shown (no total of any kind across them).
 */
export interface NuclearSet extends NuclearSetInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}
