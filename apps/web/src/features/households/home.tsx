/**
 * The current household's home, for every screen that works from home (weather, tides,
 * Explore, frequencies, satellites, the map's "near home" and others): its saved place, or
 * a portable household's position with its age. See docs/development/households.md.
 *
 * A screen that uses a moving home says how old the position is ("as of 3 hours ago")
 * and never fetches anything because it moved. With no home, it says so in one line and
 * links to the Households page.
 */
import { type HouseholdDto, type HouseholdHome, homeAsOf, NO_HOME_PLACE } from "@outpost/shared";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { useHouseholds } from "./use-household";

export interface CurrentHome {
  /** The current household's home, or null (none, or still loading). */
  home: HouseholdHome | null;
  household: HouseholdDto | null;
  /** Its country: the override, else home's, else null. */
  country: string | null;
  /** True when there are several households, so that a screen names whose home it is. */
  several: boolean;
  households: HouseholdDto[];
  isPending: boolean;
  isError: boolean;
}

/** The current household's home and country. */
export function useHome(): CurrentHome {
  const query = useHouseholds();
  // An answer that is not a list of households (it never is from the server) is taken as none.
  const list = Array.isArray(query.data?.households) ? query.data.households : [];
  const household = list.find((entry) => entry.id === query.data?.currentId) ?? list[0] ?? null;
  return {
    home: household?.home ?? null,
    household,
    country: household?.country ?? null,
    several: list.length > 1,
    households: list,
    isPending: query.isPending,
    isError: query.isError,
  };
}

/** True when the household takes the saved place with the home icon when it has no place of its own: the first, if fixed. */
export const takesHomeIcon = (household: HouseholdDto, households: readonly HouseholdDto[]) =>
  household.kind === "fixed" && households[0]?.id === household.id;

/**
 * One quiet line where a screen uses a moving home: "Where the caravan is now, as of 3
 * hours ago." Nothing for a saved place.
 */
export function HomeAsOf({ home, className, now = Date.now() }: { home: HouseholdHome | null; className?: string; now?: number }) {
  const asOf = homeAsOf(home, now);
  if (!home || !asOf) return null;
  return (
    <p className={cn("text-small text-ink-muted", className)}>
      {home.name}, {asOf}.
    </p>
  );
}

/**
 * Said where a screen needs the current household's home and it has none. The first
 * household (fixed) still takes the saved place with the home icon, so it is told that
 * as before; every household is offered the Households page, where its home is chosen.
 */
export function NoHome({ className }: { className?: string }) {
  const { household, households } = useHome();
  const linkClass = "text-primary underline underline-offset-2";
  if (household?.kind === "portable")
    return (
      <p className={cn("text-small text-ink-muted", className)}>
        Where {household.name} is now has not been set.{" "}
        <Link to="/prepare/households" className={linkClass}>
          Set it on the Households page
        </Link>
      </p>
    );
  if (household && !takesHomeIcon(household, households))
    return (
      <p className={cn("text-small text-ink-muted", className)}>
        {household.name} has no home place.{" "}
        <Link to="/prepare/households" className={linkClass}>
          Choose one on the Households page
        </Link>
      </p>
    );
  return (
    <p className={cn("text-small text-ink-muted", className)}>
      {NO_HOME_PLACE}{" "}
      <Link to="/maps" className={linkClass}>
        Open Maps
      </Link>
      {", or "}
      <Link to="/prepare/households" className={linkClass}>
        choose a home place on the Households page
      </Link>
    </p>
  );
}
