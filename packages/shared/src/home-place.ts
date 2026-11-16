/**
 * Which saved place is "home", for every screen that needs one (Weather and hazards,
 * and the warnings shown on Emergency plans).
 *
 * Home is the saved place on the map with the home icon. If several have it, the one
 * saved first is home: the order does not change when a place is edited or starred.
 * With none, there is no home place, and a screen that needs one says in one line how
 * to mark one, with a link to the Maps screen. There is no separate setting.
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
