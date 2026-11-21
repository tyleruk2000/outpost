/**
 * Where this device says it is, and what follows from that before anyone chooses:
 * how dates are written, the paper a home printer takes, and the units a forecast is
 * first shown in. Outpost is for anyone anywhere; nothing here assumes Britain.
 *
 * The region is the one in the browser's language ("US" from "en-US", "DE" from
 * "de-DE"). Every choice made from it is only a first choice: each screen that uses
 * one lets the person change it, and keeps their choice.
 *
 * Words stay in English, so a date is written by the English of the device's region:
 * "21 Nov 2026" in Britain, Germany or India, "Nov 21, 2026" in the United States.
 */

let pinned: string | null | undefined;

/** The region in a language tag, upper case: "GB" from "en-GB", null from "en". */
export function regionOfLanguage(language: string | undefined): string | null {
  const match = /[-_]([A-Za-z]{2})(?:[-_]|$)/.exec(language ?? "");
  return match ? match[1]!.toUpperCase() : null;
}

/** The region this device says it is in, or null when its language names none. */
export function deviceRegion(): string | null {
  if (pinned !== undefined) return pinned;
  return regionOfLanguage(typeof navigator === "undefined" ? undefined : navigator.language);
}

/** What the tests take the device's region to be: the language of the machine they run on is not the point of any test. */
export function setDeviceRegion(region: string | null | undefined): void {
  pinned = region === undefined || region === null ? region : region.toUpperCase();
  locale = undefined;
}

let locale: string | undefined;

/**
 * The locale every date on screen is written in: English as written in the device's
 * region ("en-US", "en-IN", "en-DE"), or British English where the device names no
 * region or the browser knows no English for it.
 */
export function appLocale(): string {
  if (locale) return locale;
  const region = deviceRegion();
  const wanted = region ? `en-${region}` : null;
  try {
    locale = wanted && Intl.DateTimeFormat.supportedLocalesOf([wanted]).length > 0 ? wanted : "en-GB";
  } catch {
    locale = "en-GB";
  }
  return locale;
}

/** Countries that use US Letter paper rather than A4. */
const LETTER_REGIONS = new Set(["US", "CA", "MX", "PH", "CL", "CO", "VE", "GT", "PA", "DO", "PR"]);
/** Countries whose weather forecasts give temperatures in degrees Fahrenheit. */
const FAHRENHEIT_REGIONS = new Set(["US", "PR", "GU", "VI", "AS", "MP"]);
/** Countries whose forecasts and road signs give speeds in miles an hour. */
const MPH_REGIONS = new Set(["US", "PR", "GU", "VI", "AS", "MP", "GB", "IM", "JE", "GG"]);
/** Countries where heights on maps are usually in feet. */
const FEET_REGIONS = new Set(["US", "PR", "GU", "VI", "AS", "MP"]);

export const likelyPaperFor = (region: string | null): "a4" | "letter" => (region && LETTER_REGIONS.has(region) ? "letter" : "a4");
export const likelyTemperatureUnit = (region: string | null = deviceRegion()): "c" | "f" =>
  region && FAHRENHEIT_REGIONS.has(region) ? "f" : "c";
export const likelyWindUnit = (region: string | null = deviceRegion()): "kmh" | "mph" =>
  region && MPH_REGIONS.has(region) ? "mph" : "kmh";
export const likelyHeightUnit = (region: string | null = deviceRegion()): "m" | "ft" => (region && FEET_REGIONS.has(region) ? "ft" : "m");

/** The United Kingdom and the Crown Dependencies: where a UK-only source (GOV.UK, the NHS, Public Health England) applies. */
const UK_REGIONS = new Set(["GB", "UK", "IM", "JE", "GG"]);
export const isUkRegion = (region: string | null | undefined): boolean => !!region && UK_REGIONS.has(region.toUpperCase());
