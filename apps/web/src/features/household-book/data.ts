/**
 * The household book's requests. Every key starts with "household-book", so they are read
 * again when the server says the book changed (lib/events.tsx). What the book is made from
 * is read under its owners' own keys (household-papers/household-data.ts).
 */
import type { BookFacts, BookInput, BookMadeInput, BookResponse } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const bookKeys = {
  all: ["household-book"] as const,
  answers: ["household-book", "answers"] as const,
  facts: ["household-book", "facts"] as const,
};

export const useBook = () => useQuery({ queryKey: bookKeys.answers, queryFn: () => api.get<BookResponse>("/api/household-book") });

/** What the book reads round home, for the answers as saved. Read when the book is made, not on every keystroke. */
export const useBookFacts = (enabled: boolean) =>
  useQuery({ queryKey: bookKeys.facts, queryFn: () => api.get<BookFacts>("/api/household-book/facts"), enabled });

export function useSaveBook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BookInput) => api.put<BookResponse>("/api/household-book", input),
    onSuccess: (data) => {
      client.setQueryData(bookKeys.answers, data);
      void client.invalidateQueries({ queryKey: bookKeys.facts });
    },
  });
}

export function useBookMade() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BookMadeInput) => api.post<BookResponse>("/api/household-book/made", input),
    onSuccess: (data) => client.setQueryData(bookKeys.answers, data),
  });
}
