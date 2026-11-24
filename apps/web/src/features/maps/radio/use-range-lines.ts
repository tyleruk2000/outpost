/**
 * A point's estimated range asked a line at a time (`SightRangeEvent`), so that the card can show how far along the
 * work is and the map can draw the near ground (out to 25 km, then 50 km) while the far is still being read. The
 * answer is the same as `GET /api/maps/sight-range` in plain JSON and is kept under the same query key, so a repeater's
 * range and a point's share it.
 *
 * While other heights are worked out at the same point, the last answer stays (`stale`), so the map is never left
 * blank. A question given up for another (the heights changed again, the range was closed) is aborted, and the server
 * stops working on it.
 */
import type { SightRange, SightRangeEvent } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ApiError, api } from "@/lib/api";

export interface RangeWork {
  /** The share of the work done, 0 to 1. */
  done: number;
  /** How long the last fresh answer took on this server, in milliseconds; null when it has not said. */
  expectMs: number | null;
  /** The range out to as far as the ground is read so far (25 km, then 50 km), until the whole answer comes. */
  part: SightRange | null;
}

export interface StreamedRange {
  /** The answer for these heights, or while it is worked out the last one at the same point. */
  data: SightRange | undefined;
  /** `data` is the last answer, for other heights, kept on the map while this one is worked out. */
  stale: boolean;
  /** Work under way, with how far along it is: null when nothing is being worked out. */
  working: RangeWork | null;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

const NOTHING_YET: RangeWork = { done: 0, expectMs: null, part: null };

export function rangeLinesQueryKey(where: string, aerial: number, station: number) {
  return ["maps", "sight-range", where, aerial, station] as const;
}

/** Reads the lines of one range: each step to `onWork`, and resolves with the whole answer. */
export async function readRangeLines(
  query: { at: string; aerial: number; station: number },
  onWork: (work: RangeWork) => void,
  signal?: AbortSignal,
): Promise<SightRange> {
  let whole: SightRange | null = null;
  let failed: ApiError | null = null;
  let work = NOTHING_YET;
  const step = (next: Partial<RangeWork>) => {
    work = { ...work, ...next };
    onWork(work);
  };
  await api.lines<SightRangeEvent | SightRange>(
    "/api/maps/sight-range",
    { at: query.at, aerial: String(query.aerial), station: String(query.station) },
    (line) => {
      // A whole answer on its own line: a server that answers in plain JSON, or a phone's worker out of its reach.
      if (!("type" in line)) {
        whole = line;
        return;
      }
      if (line.type === "start") step({ done: 0, expectMs: line.expectMs });
      else if (line.type === "progress") step({ done: line.done });
      else if (line.type === "part") step({ done: line.done, part: line.range });
      else if (line.type === "end") whole = line.range;
      else if (line.type === "error") failed = new ApiError(500, line.error.code, line.error.message);
    },
    signal,
  );
  if (failed) throw failed;
  if (!whole) throw new ApiError(0, "unreachable", "The connection to the Outpost server was lost before the range was worked out.");
  return whole;
}

export function useStreamedSightRange(at: { lat: number; lon: number } | null, aerial: number, station: number): StreamedRange {
  const where = at ? `${at.lat.toFixed(5)},${at.lon.toFixed(5)}` : "";
  const key = rangeLinesQueryKey(where, aerial, station);
  const keyText = key.join("|");
  const [progress, setProgress] = useState<{ key: string; work: RangeWork } | null>(null);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => readRangeLines({ at: where, aerial, station }, (work) => setProgress({ key: keyText, work }), signal),
    enabled: Boolean(at),
    // The answer changes only with the terrain installed, and installing it asks again (the key starts with "maps").
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    // Other heights at the same point: the last answer stays drawn until the new one comes. Not from another point.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === where ? previous : undefined),
  });
  const refetch = query.refetch;
  const again = useCallback(() => void refetch(), [refetch]);
  const fetching = query.isFetching && (query.isPlaceholderData || query.data === undefined);
  return {
    data: query.data,
    stale: query.isPlaceholderData,
    working: fetching ? (progress?.key === keyText ? progress.work : NOTHING_YET) : null,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: again,
  };
}
