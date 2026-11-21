/** Small things the emergency plan screens all say or work out the same way. */
import { DEFAULT_EMERGENCY_NUMBER, DEFAULT_REVIEW_DAYS, EMERGENCY_NUMBERS, type EmergencyPlanInput, emptyPlanBody } from "@outpost/shared";
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
 * The number to offer first: the one for Home's country where it is listed, else the
 * one for the device's region, else 112, which mobile phones put through to the
 * emergency services across Europe and in many other countries. Always changeable, and
 * the field lists the others.
 */
export function guessEmergencyNumber(language?: string, homeCountry?: string | null): string {
  const regions = [homeCountry?.toUpperCase() ?? null, language === undefined ? deviceRegion() : regionOfLanguage(language)];
  for (const region of regions) {
    const found = region ? EMERGENCY_NUMBERS.find((entry) => entry.regions.includes(region)) : undefined;
    if (found) return found.number;
  }
  return DEFAULT_EMERGENCY_NUMBER;
}

/**
 * What the new-plan dialog says about where the templates' words come from, by Home's
 * country (else the device's region): nothing in the UK; elsewhere, plainly, that they
 * are UK guidance to check against the household's own government's.
 */
export function templatesWhereLine(country: { code: string; name: string } | null, region: string | null = deviceRegion()): string | null {
  const code = country?.code ?? region;
  if (isUkRegion(code)) return null;
  const where = country ? `Home is in ${country.name}: the` : "The";
  return `${where} templates are drawn mostly from UK guidance (GOV.UK, the Met Office, the British Red Cross), with some from the United States. Outpost has no templates from your own country's government. Check every step against its advice: the numbers, services and warnings where you are may differ.`;
}

export const REVIEW_CHOICES: Array<{ value: string; label: string }> = [
  { value: "90", label: "Every 3 months" },
  { value: "180", label: "Every 6 months" },
  { value: "365", label: "Every year" },
  { value: "never", label: "Do not ask" },
];
