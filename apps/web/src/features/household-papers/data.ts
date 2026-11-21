/**
 * The household's papers: the requests their screens make. Every key starts with
 * "household-papers", so all of them are read again when the server says the papers
 * changed (lib/events.tsx). What they are made from (contacts, plans, places, supplies)
 * is read under its owner's own keys.
 */
import type {
  BinderPart,
  BinderStatus,
  CommsInput,
  CommsResponse,
  ContactDto,
  MedicalSheet,
  MedicalSheetInput,
  MedicalSheetsResponse,
  ResolvedContact,
} from "@outpost/shared";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export const paperKeys = {
  all: ["household-papers"] as const,
  medical: ["household-papers", "medical"] as const,
  comms: ["household-papers", "comms"] as const,
  binder: ["household-papers", "binder"] as const,
};

export const useMedicalSheets = () =>
  useQuery({ queryKey: paperKeys.medical, queryFn: () => api.get<MedicalSheetsResponse>("/api/medical-sheets") });

export function useSaveSheet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: MedicalSheetInput }) =>
      id
        ? api.put<{ sheet: MedicalSheet }>(`/api/medical-sheets/${id}`, input).then((data) => data.sheet)
        : api.post<{ sheet: MedicalSheet }>("/api/medical-sheets", input).then((data) => data.sheet),
    onSuccess: () => client.invalidateQueries({ queryKey: paperKeys.all }),
  });
}

export function useRemoveSheet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/medical-sheets/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: paperKeys.all }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export const useComms = () => useQuery({ queryKey: paperKeys.comms, queryFn: () => api.get<CommsResponse>("/api/keeping-in-touch") });

export function useSaveComms() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CommsInput) => api.put<CommsResponse>("/api/keeping-in-touch", input),
    onSuccess: (data) => {
      client.setQueryData(paperKeys.comms, data);
      void client.invalidateQueries({ queryKey: paperKeys.binder });
    },
  });
}

export const useBinderStatus = () =>
  useQuery({ queryKey: paperKeys.binder, queryFn: () => api.get<BinderStatus>("/api/household-binder") });

export function useBinderMade() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (made: { parts: BinderPart[]; contentAt: number; pages: number }) =>
      api.post<BinderStatus>("/api/household-binder/made", made),
    onSuccess: (data) => client.setQueryData(paperKeys.binder, data),
  });
}

/**
 * Contacts by id, as Contacts has them now: null for one deleted since, undefined while
 * it is being read. Each is read under Contacts' own key, so a change there is seen here.
 */
export function useContactsById(ids: readonly string[]): Record<string, ResolvedContact | null | undefined> {
  const unique = [...new Set(ids.filter(Boolean))];
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ["contacts", "one", id],
      queryFn: () =>
        api
          .get<{ contact: ContactDto }>(`/api/contacts/${id}`)
          .then((data) => data.contact)
          .catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
          }),
      retry: false,
    })),
  });
  const out: Record<string, ResolvedContact | null | undefined> = {};
  unique.forEach((id, index) => {
    const data = results[index]?.data as ContactDto | null | undefined;
    out[id] =
      data === undefined
        ? undefined
        : data === null
          ? null
          : { displayName: data.displayName, phones: data.phones, callsign: data.callsign };
  });
  // The same object while nothing in it has changed, so that what is drawn from it is not drawn again at every render.
  const mark = JSON.stringify(out);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by its content
  return useMemo(() => out, [mark]);
}
