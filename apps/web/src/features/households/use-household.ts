/**
 * The households and the current one, for every screen that works on a household or
 * needs its home (docs/development/households.md). There is one current household for
 * the whole Outpost; when it changes on any device, the live event `households.changed`
 * resets every cached query (lib/events.tsx), so each screen fetches its own again.
 */
import type { HouseholdCurrentInput, HouseholdDto, HouseholdHome, HouseholdsResponse, PeopleResponse, PersonDto } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export const householdsKeys = {
  all: ["households"] as const,
  list: ["households", "list"] as const,
  people: ["households", "people"] as const,
  positions: (id: string) => ["households", "positions", id] as const,
};

/** Every household, in order, and which is current. */
export const useHouseholds = () =>
  useQuery({ queryKey: householdsKeys.list, queryFn: () => api.get<HouseholdsResponse>("/api/households") });

export interface CurrentHousehold {
  household: HouseholdDto;
  /** Where it is: its saved place, or a portable household's last position (with `at`), or null. */
  home: HouseholdHome | null;
  /** Its country for every country user: the override, else home's, else null. */
  country: string | null;
  /** True when there are several, so that a screen says which one it is for. */
  several: boolean;
  households: HouseholdDto[];
}

/** The current household, its home and its country; undefined while loading. */
export function useHousehold(): { data: CurrentHousehold | undefined; isPending: boolean; isError: boolean; error: unknown } {
  const query = useHouseholds();
  // An answer with no list (a test's stand-in server that knows nothing of households) is taken as none yet.
  const data = Array.isArray(query.data?.households) ? query.data : undefined;
  const household = data ? (data.households.find((entry) => entry.id === data.currentId) ?? data.households[0]) : undefined;
  return {
    data:
      data && household
        ? { household, home: household.home, country: household.country, several: data.households.length > 1, households: data.households }
        : undefined,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
  };
}

/** Everyone on the People list, with the households each is in. */
export const usePeople = () =>
  useQuery({
    queryKey: householdsKeys.people,
    queryFn: () => api.get<PeopleResponse>("/api/people"),
    select: (data): PersonDto[] => data.people,
  });

/** Makes another household current, for every device. */
export function useSetCurrentHousehold() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: HouseholdCurrentInput) => api.put<HouseholdsResponse>("/api/households/current", input),
    // The live event resets everything; this device does not wait for it.
    onSuccess: () => client.resetQueries(),
    onError: (error) => notify.error(errorMessage(error)),
  });
}
