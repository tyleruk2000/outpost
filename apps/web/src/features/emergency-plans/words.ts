/** Small things the emergency plan screens all say or work out the same way. */
import {
  DEFAULT_REVIEW_DAYS,
  type EmergencyPlanInput,
  emergencyNumberFor,
  emptyPlanBody,
  PLAN_TEMPLATES,
  templatesInOrder,
} from "@outpost/shared";
import { deviceRegion, isUkRegion, regionOfLanguage } from "@/lib/region";

export const blankPlan = (name: string, emergencyNumber: string): EmergencyPlanInput => ({
  name,
  kind: "other",
  kindText: "",
  templateId: null,
  emergencyNumber,
  reviewEveryDays: DEFAULT_REVIEW_DAYS,
  body: emptyPlanBody(),
});

/**
 * The number to offer first: the one for Home's country where Outpost has a published
 * source for it; with no home, the one for the device's region. Empty where that country's
 * number is not known: the plan then asks for it, and nothing is guessed.
 */
export function guessEmergencyNumber(language?: string, homeCountry?: string | null): string {
  return emergencyNumberFor(homeCountry, language === undefined ? deviceRegion() : regionOfLanguage(language)) ?? "";
}

/**
 * What the new-plan dialog says about where the templates' words come from, by the
 * household's country (else the device's region): nothing in the UK; elsewhere, plainly,
 * that they are UK guidance to check against the household's own government's. With
 * several households, `householdName` names the one it is for in place of "Home".
 */
export function templatesWhereLine(
  country: { code: string; name: string } | null,
  region: string | null = deviceRegion(),
  householdName?: string | null,
): string | null {
  const code = country?.code ?? region;
  const who = householdName || "Home";
  if (isUkRegion(code)) return null;
  const own = code ? PLAN_TEMPLATES.filter((template) => template.country === code.toUpperCase()) : [];
  if (own.length > 0) {
    const where = country ? `${who} is in ${country.name}: the` : "The";
    const names = own.map((template) => template.name).join(", ");
    return `${where} first ${own.length === 1 ? "template is" : `${own.length} templates are`} from ${own[0]!.government ?? "your country's government"} (${names}). The others are drawn mostly from UK guidance: check those steps against your own government's advice.`;
  }
  const where = country ? `${who} is in ${country.name}: the` : "The";
  return `${where} templates are drawn mostly from UK guidance (GOV.UK, the Met Office, the British Red Cross), with some from Queensland in Australia, the Netherlands and the United States. Outpost has no templates from your own country's government. Check every step against its advice: the numbers, services and warnings where you are may differ.`;
}

/** The templates in the order the new-plan dialog lists them, by Home's country (else the device's region). */
export const templatesFor = (country: { code: string } | null, region: string | null = deviceRegion()) =>
  templatesInOrder(country?.code ?? region);

export const REVIEW_CHOICES: Array<{ value: string; label: string }> = [
  { value: "90", label: "Every 3 months" },
  { value: "180", label: "Every 6 months" },
  { value: "365", label: "Every year" },
  { value: "never", label: "Do not ask" },
];
