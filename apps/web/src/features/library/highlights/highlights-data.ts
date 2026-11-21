/** Queries and changes for highlights. Keys start with "highlights", so `highlights.changed` refreshes them. */
import type {
  CreateHighlightBody,
  DocumentType,
  HighlightDto,
  HighlightsResponse,
  HighlightsToNotesResponse,
  UpdateHighlightBody,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export const highlightKeys = {
  all: ["highlights"] as const,
  document: (documentId: string) => ["highlights", "document", documentId] as const,
};

/** The documents a passage can be marked in. */
export const canHighlight = (type: DocumentType): boolean => type === "pdf" || type === "epub" || type === "markdown";

export function useHighlights(documentId: string, enabled = true) {
  return useQuery({
    queryKey: highlightKeys.document(documentId),
    queryFn: () => api.get<HighlightsResponse>(`/api/documents/${documentId}/highlights`),
    enabled,
  });
}

export function useHighlightChanges(documentId: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: highlightKeys.all });
  const create = useMutation({
    mutationFn: (body: CreateHighlightBody) => api.post<{ highlight: HighlightDto }>(`/api/documents/${documentId}/highlights`, body),
    onSuccess: refresh,
    onError: (error) => notify.error(errorMessage(error)),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateHighlightBody) =>
      api.patch<{ highlight: HighlightDto }>(`/api/highlights/${id}`, body),
    onSuccess: refresh,
    onError: (error) => notify.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/highlights/${id}`),
    onSuccess: refresh,
    onError: (error) => notify.error(errorMessage(error)),
  });
  const toNotes = useMutation({
    mutationFn: () => api.post<HighlightsToNotesResponse>(`/api/documents/${documentId}/highlights/to-notes`, {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notes"] }),
    onError: (error) => notify.error(errorMessage(error)),
  });
  return { create, update, remove, toNotes };
}

/** Where a highlight is, in words: "Page 12", "Chapter 3". */
export function placeWords(highlight: Pick<HighlightDto, "page" | "chapter">): string | null {
  if (highlight.page !== null) return `Page ${highlight.page}`;
  if (highlight.chapter !== null) return `Chapter ${highlight.chapter}`;
  return null;
}
