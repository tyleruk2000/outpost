/**
 * Changing households and people (Prepare › Households). Reading them is in
 * use-household.ts. Every change publishes `households.changed`, which refreshes the
 * household, supplies and papers queries on every device; these refresh this one at once.
 */
import type {
  HouseholdCreateInput,
  HouseholdHereInput,
  HouseholdHolds,
  HouseholdPositionsResponse,
  HouseholdResponse,
  HouseholdsResponse,
  HouseholdUpdateInput,
  PersonCreateInput,
  PersonInput,
  PersonResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import { householdsKeys } from "./use-household";

export { householdsKeys, useHousehold, useHouseholds, usePeople, useSetCurrentHousehold } from "./use-household";

function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: householdsKeys.all });
}

export function useCreateHousehold() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: HouseholdCreateInput & { here?: HouseholdHereInput | null }) => {
      const { here, ...rest } = input;
      const made = await api.post<HouseholdResponse>("/api/households", rest);
      if (here) return api.put<HouseholdResponse>(`/api/households/${made.household.id}/here`, here);
      return made;
    },
    onSuccess: refresh,
  });
}

export function useUpdateHousehold(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: HouseholdUpdateInput) => api.put<HouseholdResponse>(`/api/households/${id}`, input),
    onSuccess: refresh,
  });
}

/** "We're here now": only ever from a person's press. */
export function useSetHere(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: HouseholdHereInput) => api.put<HouseholdResponse>(`/api/households/${id}/here`, input),
    onSuccess: refresh,
  });
}

export const usePositions = (id: string, enabled = true) =>
  useQuery({
    queryKey: householdsKeys.positions(id),
    queryFn: () => api.get<HouseholdPositionsResponse>(`/api/households/${id}/positions`),
    select: (data) => data.positions,
    enabled,
  });

/** What removing a household would take with it (the server's 409), or null when it went. */
export async function householdHolds(id: string): Promise<HouseholdHolds | null> {
  try {
    await api.delete<HouseholdsResponse>(`/api/households/${id}`);
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.details?.holds) return error.details.holds as HouseholdHolds;
    throw error;
  }
}

/**
 * Deletes a household. Whoever asked moves off its page first and then calls `refresh`: the
 * current one may have gone with it, so every screen fetches its own again.
 */
export function useDeleteHousehold() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => api.delete<HouseholdsResponse>(`/api/households/${id}?confirm=true`),
  });
  return Object.assign(mutation, { refresh: () => client.resetQueries() });
}

export interface PeopleSave {
  /** Everyone in the household, in order: those with an id already on the People list, the rest new. */
  people: Array<PersonInput & { id?: string }>;
  /** Those already on the list whose details were changed. */
  changed: Set<string>;
}

/** Saves a household's people: new ones are added to the People list, changed ones saved, and the order written. */
export function useSaveHouseholdPeople(householdId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ people, changed }: PeopleSave) => {
      const ids: string[] = [];
      for (const { id, ...person } of people) {
        if (!id) {
          const input: PersonCreateInput = { ...person, householdIds: [householdId] };
          ids.push((await api.post<PersonResponse>("/api/people", input)).person.id);
        } else {
          if (changed.has(id)) await api.put<PersonResponse>(`/api/people/${id}`, person);
          ids.push(id);
        }
      }
      return api.put<HouseholdResponse>(`/api/households/${householdId}/people`, { personIds: ids });
    },
    onSuccess: refresh,
  });
}

export function useDeletePerson() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/people/${id}?confirm=true`),
    onSuccess: refresh,
  });
}

/**
 * Runs a change and then what follows it, even when the screen that asked was drawn again
 * meanwhile: a change of households refreshes the lists it is drawn from, and `mutate`'s
 * own callbacks are dropped for a component that has gone.
 */
export function settle<T, V>(
  mutation: { mutateAsync: (variables: V) => Promise<T> },
  variables: V,
  then: { onSuccess?: (result: T) => void; onError?: (error: unknown) => void } = {},
): void {
  mutation.mutateAsync(variables).then(
    (result) => then.onSuccess?.(result),
    (error) => then.onError?.(error),
  );
}
