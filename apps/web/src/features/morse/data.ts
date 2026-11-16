/**
 * What the Morse trainer reads from and keeps on the server: the household's one record
 * of progress and settings, and its practice sessions. Training itself never waits for
 * the server: a session that cannot be kept (the server out of reach) is still counted
 * here for the adaptive weighting until the page is closed, and the Progress tab says
 * when a session was not kept.
 */
import {
  type CharOutcome,
  type CharStats,
  charStatsFromSessions,
  type MorseProgress,
  type MorseProgressInput,
  type MorseResponse,
  type MorseSession,
  type MorseSessionInput,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { applyMorsePrefs, getMorsePrefs, hasLocalMorsePrefs, resetMorsePrefs, settingsOf, useMorsePrefs } from "./prefs";

export const morseKeys = {
  all: ["morse"] as const,
};

export function useMorse() {
  return useQuery({
    queryKey: morseKeys.all,
    queryFn: () => api.get<MorseResponse>("/api/morse"),
    staleTime: 30_000,
  });
}

/** Sends a change of progress. Training goes on if it cannot be kept; the next change carries it. */
export async function pushMorseProgress(patch: MorseProgressInput): Promise<MorseProgress | null> {
  try {
    return (await api.put<{ progress: MorseProgress }>("/api/morse/progress", patch)).progress;
  } catch {
    return null;
  }
}

/**
 * Keeps this device and the server in step, once the record has arrived:
 * - the Koch lesson: whichever is further on wins, so no device is ever put back;
 * - the settings: a device with none of its own starts from the server's, and after
 *   that its own changes are sent up a couple of seconds after the last one.
 */
export function useSyncedMorse(): void {
  const { data } = useMorse();
  const prefs = useMorsePrefs();
  const seeded = useRef(false);

  useEffect(() => {
    if (!data || seeded.current) return;
    seeded.current = true;
    const local = getMorsePrefs().kochLesson;
    const server = data.progress.kochLesson;
    if (!hasLocalMorsePrefs() && Object.keys(data.progress.settings).length > 0) applyMorsePrefs(data.progress.settings);
    if (server > local) applyMorsePrefs({ kochLesson: server });
    else if (local > server) void pushMorseProgress({ kochLesson: local });
    // A callsign from the contact log, when the trainer has none yet.
    if (!getMorsePrefs().callsign && data.suggestedCallsign) applyMorsePrefs({ callsign: data.suggestedCallsign });
  }, [data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every change of the settings, after the first sync
  useEffect(() => {
    if (!seeded.current || !hasLocalMorsePrefs()) return;
    const timer = window.setTimeout(() => void pushMorseProgress({ settings: settingsOf(getMorsePrefs()) }), 2000);
    return () => window.clearTimeout(timer);
  }, [prefs]);
}

/** Keeps a finished session. Fails quietly: practice works with the server out of reach. */
export function useRecordMorseSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MorseSessionInput) => api.post<{ session: MorseSession }>("/api/morse/sessions", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: morseKeys.all }),
  });
}

/** Forgets the trainer's progress, settings and sessions, here and on the server. */
export function useClearMorse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ removed: { sessions: number; progress: number } }>("/api/morse"),
    onSuccess: () => {
      resetMorsePrefs();
      void client.invalidateQueries({ queryKey: morseKeys.all });
    },
  });
}

export interface CharStatsState {
  /** Per-character stats over the last 20 tries, copy and keying together. */
  stats: CharStats;
  /** Every outcome counted, newest first: the ones not yet kept, then the kept sessions. */
  outcomes: readonly CharOutcome[];
  /** Counts a result now, before the kept sessions catch up (or with the server out of reach). Gives an id for `markSynced`. */
  noteOutcome: (outcome: CharOutcome) => number;
  /** The result's session was kept: the local copy goes once a later read has it. */
  markSynced: (id: number) => void;
}

interface LocalOutcome {
  id: number;
  outcome: CharOutcome;
  /** When the server kept it; null while it has not. */
  syncedAt: number | null;
}

let nextOutcomeId = 1;

/**
 * Per-character stats for the adaptive weighting: the kept sessions (receive, send and
 * echo alike, newest first) and results noted here. A result noted here stays until its
 * session has been kept and a later read includes it, so a read in between (or one
 * with the server out of reach) never drops it.
 */
export function useCharStats(): CharStatsState {
  const { data, dataUpdatedAt } = useMorse();
  const [local, setLocal] = useState<LocalOutcome[]>([]);
  const outcomes = useMemo(
    () => [
      ...local.filter((entry) => entry.syncedAt === null || entry.syncedAt >= dataUpdatedAt).map((entry) => entry.outcome),
      ...(data?.sessions ?? []),
    ],
    [local, data, dataUpdatedAt],
  );
  const stats = useMemo(() => charStatsFromSessions(outcomes), [outcomes]);
  const noteOutcome = useCallback((outcome: CharOutcome) => {
    const id = nextOutcomeId++;
    setLocal((previous) => [{ id, outcome, syncedAt: null }, ...previous]);
    return id;
  }, []);
  const markSynced = useCallback((id: number) => {
    const at = Date.now();
    setLocal((previous) => previous.map((entry) => (entry.id === id ? { ...entry, syncedAt: at } : entry)));
  }, []);
  return { stats, outcomes, noteOutcome, markSynced };
}

/** The Koch lesson reached: this device's or the server's, whichever is further on. */
export function useKochLesson(): number {
  const prefs = useMorsePrefs();
  const { data } = useMorse();
  return Math.max(prefs.kochLesson, data?.progress.kochLesson ?? 1);
}
