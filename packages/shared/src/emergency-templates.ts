/**
 * Templates to start an emergency plan from, drawn from official guidance.
 *
 * Every step, supply and "where things are" line of a template names the source it
 * comes from (`PLAN_SOURCES`, each with its publisher, title, address, the date the
 * page gives itself, and the day it was read), and carries the words of that source it
 * closely paraphrases (`quote`). Nothing here is advice of Outpost's own: where no
 * official source covers something a household needs (where to meet, who is the
 * out-of-area contact), the template leaves a prompt (`prompts`) for the household to
 * answer, not an answer.
 *
 * A template is a starting point. A plan made from one keeps, for each step, the id of
 * the template step it came from (`origin`), so that the screen can tell the source's
 * words from the household's, say when they were changed, and list what was taken out.
 * docs/emergency-plans.md lists every source with what it says.
 */
import type { EmergencyPlanInput, PlanKind, PlanPhase, PlanStep } from "./emergency-plans.ts";
import { DEFAULT_REVIEW_DAYS, emptyPlanBody } from "./emergency-plans.ts";
import { EMERGENCY_NUMBERS_DATA, PLAN_SOURCES_DATA, PLAN_TEMPLATES_DATA } from "./emergency-templates-data.ts";
import type { SupplyCategory } from "./supplies.ts";

export interface PlanSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  /** The date the page gives itself, in its own words: "Updated 3 March 2025", or "No date shown". */
  pageDate: string;
  /** The day it was read for this template. */
  checked: string;
  country: "UK" | "US" | "International";
}

export interface TemplateStep {
  /** Stable: a plan's step keeps it as its `origin`. Never reuse one for different words. */
  id: string;
  phase: PlanPhase;
  text: string;
  source: string;
  /** The source's own words that `text` closely paraphrases. */
  quote: string;
  /** Within severe weather: which kind. */
  subKind?: "storm" | "cold" | "heat";
}

export interface TemplateSupply {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  perPerson: boolean;
  perDay: boolean;
  category: SupplyCategory | null;
  source: string;
  quote: string;
}

export interface TemplateWhere {
  id: string;
  what: string;
  source: string;
  quote: string;
}

export interface PlanTemplate {
  id: string;
  kind: PlanKind;
  /** Narrows the kind, for a plan made from it: "Storm" under severe weather. */
  kindText: string;
  name: string;
  /** One sentence on what it covers. */
  about: string;
  steps: TemplateStep[];
  supplies: TemplateSupply[];
  where: TemplateWhere[];
  /** Days the supplies should cover, where a source gives a figure. */
  days: { value: number; source: string; quote: string } | null;
  /** Things a household plan needs that no official source found answers: left for the household to fill in. */
  prompts: string[];
}

/** The number for the emergency services, by region (ISO 3166 codes), each with its source. */
export interface EmergencyNumber {
  regions: string[];
  where: string;
  number: string;
  source: string;
  quote: string;
}

export const PLAN_SOURCES: PlanSource[] = PLAN_SOURCES_DATA;
export const EMERGENCY_NUMBERS: EmergencyNumber[] = EMERGENCY_NUMBERS_DATA;
export const PLAN_TEMPLATES: PlanTemplate[] = PLAN_TEMPLATES_DATA;

export const sourceById = (id: string | null | undefined): PlanSource | undefined =>
  id ? PLAN_SOURCES.find((source) => source.id === id) : undefined;
export const templateById = (id: string | null | undefined): PlanTemplate | undefined =>
  id ? PLAN_TEMPLATES.find((template) => template.id === id) : undefined;

/** A template step by its id, from whichever template holds it. */
export function templateStep(id: string | null | undefined): { template: PlanTemplate; step: TemplateStep } | undefined {
  if (!id) return undefined;
  for (const template of PLAN_TEMPLATES) {
    const step = template.steps.find((each) => each.id === id);
    if (step) return { template, step };
  }
  return undefined;
}

/**
 * Whose words a step is: the household's own; a source's, as the template gave them;
 * or a source's, changed by the household (with the source's words to show beside it).
 */
export type StepStanding =
  | { kind: "own" }
  | { kind: "official"; source: PlanSource | undefined; step: TemplateStep }
  | { kind: "changed"; source: PlanSource | undefined; step: TemplateStep };

export function stepStanding(step: Pick<PlanStep, "text" | "origin">): StepStanding {
  const found = templateStep(step.origin);
  if (!found) return { kind: "own" };
  const source = sourceById(found.step.source);
  return step.text.trim() === found.step.text.trim()
    ? { kind: "official", source, step: found.step }
    : { kind: "changed", source, step: found.step };
}

/** The template's steps a plan made from it no longer has. */
export function stepsTakenOut(templateId: string | null, steps: Array<Pick<PlanStep, "origin">>): TemplateStep[] {
  const template = templateById(templateId);
  if (!template) return [];
  const kept = new Set(steps.map((step) => step.origin));
  return template.steps.filter((step) => !kept.has(step.id));
}

/** The sources a plan's steps, supplies and places came from, in the order first used. */
export function sourcesOfPlan(templateId: string | null): PlanSource[] {
  const template = templateById(templateId);
  if (!template) return [];
  const ids = [
    ...template.steps.map((step) => step.source),
    ...template.supplies.map((supply) => supply.source),
    ...template.where.map((where) => where.source),
    ...(template.days ? [template.days.source] : []),
  ];
  return [...new Set(ids)].map((id) => sourceById(id)).filter((source): source is PlanSource => !!source);
}

/** A new plan from a template: its steps, supplies and "where things are" lines, each keeping its origin. */
export function planFromTemplate(template: PlanTemplate, makeId: () => string, emergencyNumber = "999"): EmergencyPlanInput {
  const body = emptyPlanBody();
  body.steps = template.steps.map((step) => ({ id: makeId(), phase: step.phase, text: step.text, origin: step.id }));
  body.supplies = template.supplies.map((supply) => ({
    id: makeId(),
    name: supply.name,
    quantity: supply.quantity,
    unit: supply.unit,
    perPerson: supply.perPerson,
    perDay: supply.perDay,
    category: supply.category,
    origin: supply.id,
  }));
  body.where = template.where.map((where) => ({ id: makeId(), what: where.what, where: "", origin: where.id }));
  body.days = template.days?.value ?? null;
  return {
    name: template.name,
    kind: template.kind,
    kindText: template.kindText,
    templateId: template.id,
    emergencyNumber,
    reviewEveryDays: DEFAULT_REVIEW_DAYS,
    body,
  };
}
