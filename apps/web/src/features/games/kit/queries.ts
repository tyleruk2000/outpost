/**
 * The games' tallies on the server, shared by the household: read with `useGames`, added
 * to when a game ends with `useRecordResult`, and forgotten with `useClearGame`. Query
 * keys start with "games", which the "games.changed" event refreshes.
 */
import type { GameId, GameResultInput, GamesResponse, GameTally, TallyGameId } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

export const gamesKey = ["games"] as const;

export function useGames() {
  return useQuery({ queryKey: gamesKey, queryFn: () => api.get<GamesResponse>("/api/games") });
}

/** Reports a finished game. A failure is said once, quietly: the game itself is unaffected. */
export function useRecordResult(game: TallyGameId) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (result: GameResultInput) => api.post<{ tally: GameTally }>(`/api/games/${game}/results`, result),
    onSuccess: () => client.invalidateQueries({ queryKey: gamesKey }),
    onError: (error) => toast.error(`The result was not kept: ${errorMessage(error)}`),
  });
}

/** Forgets a game's tally, or the allotment. */
export function useClearGame(game: GameId) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ removed: boolean }>(`/api/games/${game}`),
    onSuccess: () => client.invalidateQueries({ queryKey: gamesKey }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}
