/**
 * The scenario form as typed, and turning it into the simulator's input. Kept apart
 * from the screen so that what counts as a valid entry is tested on its own.
 */
import {
  type BlastLevel,
  type EffectsInput,
  effectsProblems,
  FOOT,
  type NuclearScenario,
  type NuclearScenarioInput,
  parseCoordinates,
} from "@outpost/shared";

export interface ScenarioForm {
  name: string;
  notes: string;
  where: string;
  yieldValue: string;
  yieldUnit: "kt" | "Mt";
  burst: "surface" | "height" | "optimum";
  heightValue: string;
  heightUnit: "m" | "ft";
  psi: `${BlastLevel}`;
  windFrom: string;
  windSpeed: string;
  windUnit: "kmh" | "mph";
}

export const EMPTY_FORM: ScenarioForm = {
  name: "",
  notes: "",
  where: "",
  yieldValue: "15",
  yieldUnit: "kt",
  burst: "surface",
  heightValue: "500",
  heightUnit: "m",
  psi: "5",
  windFrom: "",
  windSpeed: "",
  windUnit: "kmh",
};

const numberOf = (text: string): number | null => {
  const cleaned = text.trim().replace(/,/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
};

export type FormField = "where" | "yield" | "height" | "wind" | "name";

export interface Checked {
  /** The input when every field could be read; null otherwise. */
  input: NuclearScenarioInput | null;
  /**
   * The effects input, when the parts the model needs could be read (the place and name may still be missing).
   * Its wind is null while the wind typed is unfinished or refused: the rings are still worked out and drawn.
   */
  effects: EffectsInput | null;
  at: { lat: number; lon: number } | null;
  /** Problems by field, in words. */
  problems: Partial<Record<FormField, string>>;
  /** The model's own refusals. */
  refused: string[];
}

export function checkForm(form: ScenarioForm): Checked {
  const problems: Checked["problems"] = {};
  const found = form.where.trim() ? parseCoordinates(form.where) : null;
  if (!form.where.trim()) problems.where = "Choose ground zero: press the map, choose a saved place, or type coordinates.";
  else if (!found)
    problems.where = "That is not a position Outpost can read. Type coordinates (51.5074, -0.1278), a grid reference or a locator.";

  const amount = numberOf(form.yieldValue);
  if (amount === null || Number.isNaN(amount) || amount <= 0) problems.yield = "Give the yield as a number.";
  const yieldKt = amount !== null && amount > 0 ? amount * (form.yieldUnit === "Mt" ? 1000 : 1) : Number.NaN;

  let burst: EffectsInput["burst"] = { kind: "surface" };
  if (form.burst === "height") {
    const height = numberOf(form.heightValue);
    if (height === null || Number.isNaN(height) || height <= 0) problems.height = "Give the height of burst as a number above 0.";
    burst = { kind: "height", metres: (height ?? Number.NaN) * (form.heightUnit === "ft" ? FOOT : 1) };
  } else if (form.burst === "optimum") burst = { kind: "optimum", psi: Number(form.psi) as BlastLevel };

  let wind: EffectsInput["wind"] = null;
  const from = numberOf(form.windFrom);
  const speed = numberOf(form.windSpeed);
  if (from !== null || speed !== null) {
    if (from === null || speed === null || Number.isNaN(from) || Number.isNaN(speed))
      problems.wind = "Give both the direction the wind blows from and its speed, or leave both empty.";
    else wind = { fromDegrees: from, kmh: speed * (form.windUnit === "mph" ? 1.609344 : 1) };
  }

  if (!form.name.trim()) problems.name = "Give the scenario a name to save it.";

  // A wind that is half typed, or one the model refuses, costs the fallout pattern and nothing else: the rings
  // do not depend on the wind, and taking them off the map while a speed is being typed reads as the whole
  // scenario having gone. So the wind is judged apart from the rest, and left out of what is drawn until it is right.
  const base = problems.yield || problems.height ? null : { yieldKt, burst };
  const baseRefused = base ? effectsProblems({ ...base, wind: null }) : [];
  const windRefused =
    base && wind && baseRefused.length === 0 ? effectsProblems({ ...base, wind }).filter((reason) => !baseRefused.includes(reason)) : [];
  const windRight = !problems.wind && windRefused.length === 0;
  const effects = base && baseRefused.length === 0 ? { ...base, wind: windRight ? wind : null } : null;
  const at = found ? { lat: found.lat, lon: found.lon } : null;
  // Saving waits for the wind to be finished or cleared: a scenario is never saved without a wind its form shows.
  const input =
    effects && at && windRight && !problems.name ? { name: form.name.trim(), notes: form.notes, lat: at.lat, lon: at.lon, effects } : null;
  return { input, effects, at, problems, refused: [...baseRefused, ...windRefused] };
}

/** A saved scenario back into the form, in the units it is easiest to read in. */
export function formOf(scenario: NuclearScenario): ScenarioForm {
  const { effects } = scenario;
  const mt = effects.yieldKt >= 1000;
  return {
    name: scenario.name,
    notes: scenario.notes,
    where: `${scenario.lat.toFixed(5)}, ${scenario.lon.toFixed(5)}`,
    yieldValue: String(mt ? effects.yieldKt / 1000 : effects.yieldKt),
    yieldUnit: mt ? "Mt" : "kt",
    burst: effects.burst.kind,
    heightValue: effects.burst.kind === "height" ? String(Math.round(effects.burst.metres)) : EMPTY_FORM.heightValue,
    heightUnit: "m",
    psi: effects.burst.kind === "optimum" ? (String(effects.burst.psi) as ScenarioForm["psi"]) : "5",
    windFrom: effects.wind ? String(Math.round(effects.wind.fromDegrees)) : "",
    windSpeed: effects.wind ? String(Math.round(effects.wind.kmh)) : "",
    windUnit: "kmh",
  };
}
