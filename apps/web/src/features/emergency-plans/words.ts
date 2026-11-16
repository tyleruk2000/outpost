/** Small things the emergency plan screens all say or work out the same way. */
import {
  DEFAULT_EMERGENCY_NUMBER,
  DEFAULT_REVIEW_DAYS,
  EMERGENCY_NUMBERS,
  type EmergencyPlanInput,
  emptyPlanBody,
  type PlanTemplate,
  planFromTemplate,
} from "@outpost/shared";

export const blankPlan = (name: string, emergencyNumber: string): EmergencyPlanInput => ({
  name,
  kind: "other",
  kindText: "",
  templateId: null,
  emergencyNumber,
  reviewEveryDays: DEFAULT_REVIEW_DAYS,
  body: emptyPlanBody(),
});

export const planFrom = (template: PlanTemplate, makeId: () => string, emergencyNumber: string) =>
  planFromTemplate(template, makeId, emergencyNumber);

/** The region the device says it is in, from its language: "GB" from "en-GB". */
export function deviceRegion(language = typeof navigator === "undefined" ? "" : navigator.language): string | null {
  const match = /[-_]([A-Za-z]{2})\b/.exec(language);
  return match ? match[1]!.toUpperCase() : null;
}

/** The number to offer first: the one for the device's region where it is listed, else the UK's. Always changeable. */
export function guessEmergencyNumber(language?: string): string {
  const region = deviceRegion(language);
  const found = region ? EMERGENCY_NUMBERS.find((entry) => entry.regions.includes(region)) : undefined;
  return found?.number ?? DEFAULT_EMERGENCY_NUMBER;
}

export const REVIEW_CHOICES: Array<{ value: string; label: string }> = [
  { value: "90", label: "Every 3 months" },
  { value: "180", label: "Every 6 months" },
  { value: "365", label: "Every year" },
  { value: "never", label: "Do not ask" },
];

/** "3.5 days", "none", "not worked out": as Supplies says it. */
export { daysWords } from "@outpost/shared";
