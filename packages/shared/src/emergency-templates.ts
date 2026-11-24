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
import { EMERGENCY_NUMBERS_DATA, PLAN_SOURCES_DATA, PLAN_TEMPLATES_DATA, SOURCE_TERMS_DATA } from "./emergency-templates-data.ts";
import { RADIATION_SOURCE_TERMS, RADIATION_SOURCES, RADIATION_TEMPLATE } from "./emergency-templates-radiation.ts";
import { WORLD_SOURCE_TERMS, WORLD_SOURCES, WORLD_TEMPLATES } from "./emergency-templates-world.ts";
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
  /** Whose guidance: the UK's, the United States', Australia's (Queensland), the Netherlands', or a body for many countries. */
  country: "UK" | "US" | "AU" | "NL" | "International";
  /** The publisher's terms for reusing its words: an id of `SOURCE_TERMS`. */
  terms: string;
}

/**
 * A publisher's terms for reusing the words of its pages, as read on its own terms,
 * copyright or reuse page. Only the words of a cleared publisher are shipped in a
 * template; another publisher's page is pointed to, never quoted (a test holds this).
 */
export interface SourceTerms {
  id: string;
  /** Whose terms: "GOV.UK", "Met Office". */
  publisher: string;
  /** The terms page read. */
  url: string;
  /** Its own words that decide it, as read. */
  quote: string;
  read: string;
  /** Its words may be shipped. */
  cleared: boolean;
  /** Its words may be changed (a licence that allows adaptation); otherwise only reproduced exactly. */
  adapt: boolean;
  /** The licence, in short: "Open Government Licence v3.0"; or why it is not cleared. */
  licence: string;
  /** What must be shown with its words; null when nothing is shipped. */
  attribution: string | null;
}

export interface TemplateStep {
  /** Stable: a plan's step keeps it as its `origin`. Never reuse one for different words. */
  id: string;
  phase: PlanPhase;
  text: string;
  source: string;
  /**
   * The source's own words that `text` closely paraphrases (or is, exactly, for a
   * source whose terms allow no change). Empty for a pointer.
   */
  quote: string;
  /**
   * A pointer: words of Outpost's that name a page for the household to read and decide
   * from, quoting nothing and advising nothing. Used for a publisher whose words may
   * not be shipped. The household replaces it with words of its own.
   */
  pointer?: true;
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
  /** The country whose government's guidance it is (ISO 3166 code); absent for the UK's. */
  country?: string;
  /** That government, as a sentence names it: "the Queensland Government, Australia". Absent for the UK's. */
  government?: string;
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
  /** The source's words, where its terms allow them to be shipped; empty otherwise (the number itself is a fact, cited). */
  quote: string;
}

// The radiation emergency template (nuclear preparedness), and the templates from governments outside the
// UK, keep their words and sources in files of their own.
export const SOURCE_TERMS: SourceTerms[] = [...SOURCE_TERMS_DATA, ...RADIATION_SOURCE_TERMS, ...WORLD_SOURCE_TERMS];
export const PLAN_SOURCES: PlanSource[] = [...PLAN_SOURCES_DATA, ...RADIATION_SOURCES, ...WORLD_SOURCES];
export const EMERGENCY_NUMBERS: EmergencyNumber[] = EMERGENCY_NUMBERS_DATA;
export const PLAN_TEMPLATES: PlanTemplate[] = [...PLAN_TEMPLATES_DATA, RADIATION_TEMPLATE, ...WORLD_TEMPLATES];

/** The country a template's guidance is from: its own, or the UK's. */
export const templateCountry = (template: Pick<PlanTemplate, "country">): string => template.country ?? "GB";

/**
 * The templates in the order the new-plan dialog lists them: those from the government
 * of the country given (Home's, else the device's region) first, then the UK's, then
 * the rest. The order within each is kept.
 */
export function templatesInOrder(country: string | null | undefined): PlanTemplate[] {
  const code = country?.toUpperCase() === "UK" ? "GB" : (country?.toUpperCase() ?? null);
  const rank = (template: PlanTemplate) => {
    const from = templateCountry(template);
    return from === code ? 0 : from === "GB" ? 1 : 2;
  };
  return PLAN_TEMPLATES.map((template, index) => ({ template, index }))
    .sort((a, b) => rank(a.template) - rank(b.template) || a.index - b.index)
    .map((entry) => entry.template);
}

/**
 * The number for the emergency services in the first region given (ISO 3166 codes:
 * Home's country, then the device's region), or null where that region is not one
 * Outpost has a published source for. The first region that is given decides: a home
 * in a country not listed is not given the device's region's number, nor a guess.
 * Where a country has two, the first listed is its own.
 */
export function emergencyNumberFor(...regions: Array<string | null | undefined>): string | null {
  const code = regions.find((region) => region?.trim())?.toUpperCase();
  if (!code) return null;
  return EMERGENCY_NUMBERS.find((entry) => entry.regions.includes(code))?.number ?? null;
}

export const sourceById = (id: string | null | undefined): PlanSource | undefined =>
  id ? PLAN_SOURCES.find((source) => source.id === id) : undefined;
export const termsOf = (source: PlanSource | undefined): SourceTerms | undefined =>
  source ? SOURCE_TERMS.find((terms) => terms.id === source.terms) : undefined;

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
  | { kind: "changed"; source: PlanSource | undefined; step: TemplateStep }
  | { kind: "pointer"; source: PlanSource | undefined; step: TemplateStep };

export function stepStanding(step: Pick<PlanStep, "text" | "origin">): StepStanding {
  const found = templateStep(step.origin);
  if (!found) return { kind: "own" };
  const source = sourceById(found.step.source);
  // A pointer the household has rewritten is their own words.
  if (found.step.pointer)
    return step.text.trim() === found.step.text.trim() ? { kind: "pointer", source, step: found.step } : { kind: "own" };
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

/** A template line (step, supply or "where things are") by its id, from whichever template holds it. */
function templateLine(id: string): { source: string; pointer?: true } | undefined {
  for (const template of PLAN_TEMPLATES)
    for (const line of [...template.steps, ...template.supplies, ...template.where]) if (line.id === id) return line;
  return undefined;
}

/**
 * The statements a document must carry for the words of official sources in it: one
 * for each licence of a source whose words a line came from (official, or changed by
 * the household), once each. Pointers quote nothing and need none.
 */
export function attributionsFor(origins: Array<string | null>): string[] {
  const out = new Set<string>();
  for (const origin of origins) {
    const line = origin ? templateLine(origin) : undefined;
    if (!line || line.pointer) continue;
    const attribution = termsOf(sourceById(line.source))?.attribution;
    if (attribution) out.add(attribution);
  }
  return [...out];
}

/** A new plan from a template: its steps, supplies and "where things are" lines, each keeping its origin. */
export function planFromTemplate(
  template: PlanTemplate,
  makeId: () => string,
  /** Empty where the number is not known: the plan then asks for it. */
  emergencyNumber = "",
): EmergencyPlanInput {
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
