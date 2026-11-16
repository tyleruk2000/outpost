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

export const SCENARIO_NAME_MAX = 120;
export const SCENARIO_NOTES_MAX = 8000;
