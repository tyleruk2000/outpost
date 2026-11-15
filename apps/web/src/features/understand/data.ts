/** Data for "How search works": the index overview, one document's passages, one traced query, and the map of vectors. */
import type { ExplainChunk, ExplainEntity, ExplainOverview, ExplainResponse, ProjectionResponse } from "@outpost/shared";
import { keepPreviousData, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { api } from "@/lib/api";

/** Passages asked for from each search. The context takes the best `TRACE_LIMIT`; each list keeps twice as many. */
export const TRACE_LIMIT = 8;
/** The context budget the trace uses, in characters of quoted text. */
export const CONTEXT_BUDGET = 6000;
/** Most points drawn on the map. */
export const MAP_POINTS = 600;

export interface ChunksResponse {
  entity: ExplainEntity;
  chunks: ExplainChunk[];
  chunkSize: number;
  chunkOverlap: number;
}

export const useOverview = () =>
  useQuery({ queryKey: ["understand", "overview"], queryFn: () => api.get<ExplainOverview>("/api/retrieval/overview") });

export const useEntities = (q = "") =>
  useQuery({
    queryKey: ["understand", "entities", q],
    queryFn: () => api.get<{ entities: ExplainEntity[] }>("/api/retrieval/entities", { q }),
    select: (data) => data.entities,
    placeholderData: keepPreviousData,
  });

export const useChunks = (entity: { kind: string; entityId: string } | undefined) =>
  useQuery({
    queryKey: ["understand", "chunks", entity?.kind ?? "", entity?.entityId ?? ""],
    queryFn: () => api.get<ChunksResponse>("/api/retrieval/chunks", { kind: entity!.kind, entityId: entity!.entityId }),
    enabled: Boolean(entity),
    placeholderData: keepPreviousData,
  });

/** One question through every stage. Fetched once per question; the sliders on the page never refetch it. */
export const useTrace = (query: string) =>
  useQuery({
    queryKey: ["understand", "trace", query],
    queryFn: () => api.post<ExplainResponse>("/api/retrieval/explain", { query, limit: TRACE_LIMIT }),
    enabled: query.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
  });

/** Passage vectors flattened to two dimensions. Works without a question too: the map is then drawn without one. */
export const useProjection = (query: string, enabled: boolean) =>
  useQuery({
    queryKey: ["understand", "projection", query],
    queryFn: () => api.post<ProjectionResponse>("/api/retrieval/projection", query ? { query, limit: MAP_POINTS } : { limit: MAP_POINTS }),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
  });

export interface TraceState {
  /** The question in the address bar; empty before anything has been traced. */
  query: string;
  trace: UseQueryResult<ExplainResponse>;
  overview: ExplainOverview | undefined;
  /** The library has no documents or pages, so there is nothing to trace. */
  empty: boolean;
}

const TraceContext = createContext<TraceState | null>(null);
export const TraceProvider = TraceContext.Provider;

export function useTraceState(): TraceState {
  const state = useContext(TraceContext);
  if (!state) throw new Error("useTraceState must be used inside the How search works page");
  return state;
}

/** Documents and pages in the index. The download catalogue is indexed too, but it is not the reader's library. */
export const libraryCount = (overview: ExplainOverview) => (overview.entities.document ?? 0) + (overview.entities.note ?? 0);
