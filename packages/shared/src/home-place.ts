import { ageWords } from "./weather.ts";

/**
 * Which saved place is "home" when no household names one, and the words every place
 * user says about the current household's home (docs/development/households.md).
 *
 * The first household (a fixed one) takes the saved place on the map with the home icon
 * when it has no home place of its own. If several have it, the one saved first is home:
 * the order does not change when a place is edited or starred. Every other screen takes
 * the current household's home (`households.home()` on the server, `useHousehold()` on
 * the web), never this directly.
 */
export function homePlaceOf<T extends { icon: string; createdAt: number; id: string }>(markers: readonly T[]): T | null {
  let home: T | null = null;
  for (const marker of markers) {
    if (marker.icon !== "home") continue;
    if (!home || marker.createdAt < home.createdAt || (marker.createdAt === home.createdAt && marker.id < home.id)) home = marker;
  }
  return home;
}

/** The one line a screen shows when it needs a home place and finds none. The link to Maps follows it. */
export const NO_HOME_PLACE = "No saved place has the home icon. To mark your home, open it on the Maps screen and choose the home icon.";

/**
 * "as of 3 hours ago" for a portable household's position (`HouseholdHome.at`); null for a
 * saved place, which does not move.
 */
export function homeAsOf(home: { at: number | null } | null, now: number): string | null {
  if (home?.at == null) return null;
  const ms = Math.max(0, now - home.at);
  return ms < 60_000 ? "as of just now" : `as of ${ageWords(ms)} ago`;
}

/** A home's name, with its age when it moves: "Where the caravan is now, as of 3 hours ago". */
export function homeLabel(home: { name: string; at: number | null }, now: number): string {
  const asOf = homeAsOf(home, now);
  return asOf ? `${home.name}, ${asOf}` : home.name;
}

/**
 * The one line said when the current household has no home. A fixed household that still
 * takes the saved place with the home icon (`takesHomeIcon`: the first, with no home place
 * of its own) is told about the icon as before; the screens add a link to the Households
 * page (/prepare/households).
 */
export function noHomeWords(household: { name: string; kind: "fixed" | "portable" }, takesHomeIcon: boolean): string {
  if (household.kind === "portable") return `Where ${household.name} is now has not been set. Set it on the Households page.`;
  if (takesHomeIcon) return NO_HOME_PLACE;
  return `${household.name} has no home place. Choose one on the Households page.`;
}
