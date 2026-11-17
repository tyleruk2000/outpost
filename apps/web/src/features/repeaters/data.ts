/**
 * The repeater screens' requests. Every key starts with "repeaters", so all of them are
 * read again when the server says the repeaters changed.
 */
import type {
  RepeaterBand,
  RepeaterDetailResponse,
  RepeaterDto,
  RepeaterDuplicateChoice,
  RepeaterDuplicatesResponse,
  RepeaterExportFormat,
  RepeaterFetchResponse,
  RepeaterImportPreview,
  RepeaterImportResult,
  RepeaterListDto,
  RepeaterListResponse,
  RepeaterMergeResult,
  RepeaterMode,
  RepeaterOverlayResponse,
  RepeaterSourcesResponse,
  RepeaterStatus,
  RepeatersOverview,
} from "@outpost/shared";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export interface LatLon {
  lat: number;
  lon: number;
}

/** What narrows the list, the map and an export alike. */
export interface RepeaterFilters {
  q: string;
  band: RepeaterBand | "";
  mode: RepeaterMode | "";
  hideOffAir: boolean;
  list: string;
}

export const NO_FILTERS: RepeaterFilters = { q: "", band: "", mode: "", hideOffAir: false, list: "" };

const positionText = (position: LatLon) => `${position.lat.toFixed(5)},${position.lon.toFixed(5)}`;

export function filterQuery(filters: Partial<RepeaterFilters>, near?: LatLon | null, withinKm?: number | null) {
  return {
    q: filters.q?.trim() || undefined,
    band: filters.band || undefined,
    mode: filters.mode || undefined,
    hideOffAir: filters.hideOffAir ? "1" : undefined,
    list: filters.list || undefined,
    near: near ? positionText(near) : undefined,
    withinKm: near && withinKm ? withinKm : undefined,
  };
}

export const PAGE_SIZE = 50;

export const useRepeatersOverview = (enabled = true) =>
  useQuery({ queryKey: ["repeaters", "overview"], queryFn: () => api.get<RepeatersOverview>("/api/repeaters/overview"), enabled });

/** The list, a page at a time: "Show more" asks for the next fifty. */
export function useRepeaterList(filters: RepeaterFilters, near: LatLon | null, withinKm: number | null) {
  const query = filterQuery(filters, near, withinKm);
  return useInfiniteQuery({
    queryKey: ["repeaters", "list", query],
    queryFn: ({ pageParam, signal }) =>
      api.get<RepeaterListResponse>("/api/repeaters", { ...query, limit: PAGE_SIZE, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.repeaters.length, 0);
      return last.repeaters.length === PAGE_SIZE && loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
  });
}

/** One repeater with its list: what its card and its page show, and where the map finds a chosen range's repeater. */
export const repeaterQuery = (id: string | null | undefined) => ({
  queryKey: ["repeaters", "one", id],
  queryFn: ({ signal }: { signal: AbortSignal }) => api.get<RepeaterDetailResponse>(`/api/repeaters/${id}`, undefined, signal),
});

export const useRepeater = (id: string | null | undefined) => useQuery({ ...repeaterQuery(id), enabled: Boolean(id) });

/** What to draw in a box of the map. The last answer stays up while the next is fetched, so the map does not blink. */
export function useRepeaterOverlay(bbox: string | null, filters: Partial<RepeaterFilters>) {
  const query = filterQuery(filters);
  return useQuery({
    queryKey: ["repeaters", "overlay", bbox, query],
    queryFn: ({ signal }) => api.get<RepeaterOverlayResponse>("/api/repeaters/overlay", { ...query, bbox: bbox ?? undefined }, signal),
    enabled: bbox !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/** What a person types for an entry: megahertz and words, turned into the API's hertz by the form. */
export interface RepeaterInput {
  callsign: string;
  outputHz: number;
  inputHz: number | null;
  modes: RepeaterMode[];
  ctcssHz: number | null;
  dcsCode: string | null;
  dmrColourCode: number | null;
  talkgroups: string;
  accessNote: string;
  channel: string;
  place: string;
  region: string;
  country: string;
  lat: number | null;
  lon: number | null;
  locator: string;
  /** How closely the coordinates are known, in metres, when they are not exact. */
  positionPrecisionMeters?: number | null;
  antennaMeters: number | null;
  keeper: string;
  status: RepeaterStatus;
  notes: string;
}

function useChange<Input, Output>(run: (input: Input) => Promise<Output>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => client.invalidateQueries({ queryKey: ["repeaters"] }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export const useSaveRepeater = () =>
  useChange(({ id, ...input }: Partial<RepeaterInput> & { id?: string }) =>
    id ? api.patch<{ repeater: RepeaterDto }>(`/api/repeaters/${id}`, input) : api.post<{ repeater: RepeaterDto }>("/api/repeaters", input),
  );

export const useRemoveRepeater = () => useChange((id: string) => api.delete<{ ok: true }>(`/api/repeaters/${id}`));

export const useRevertRepeater = () => useChange((id: string) => api.post<{ repeater: RepeaterDto }>(`/api/repeaters/${id}/revert`));

export const useUpdateList = () =>
  useChange(({ id, ...patch }: { id: string; name?: string; source?: string; sourceUrl?: string; dataDate?: string }) =>
    api.patch<{ list: RepeaterListDto }>(`/api/repeaters/lists/${id}`, patch),
  );

export const useRemoveList = () => useChange((id: string) => api.delete<{ removed: number }>(`/api/repeaters/lists/${id}`));

export const useRestoreRemoved = () =>
  useChange((id: string) => api.post<{ restored: number }>(`/api/repeaters/lists/${id}/restore-removed`));

/** The choices sent with a file: how its columns are read, which list it brings up to date, and what the list is. */
export interface ImportChoices {
  mapping?: Record<string, string>;
  listId?: string;
  name?: string;
  source?: string;
  sourceUrl?: string;
  dataDate?: string;
  edited?: "keep" | "replace";
  gone?: "remove" | "keep";
  duplicates?: RepeaterDuplicateChoice;
}

function form(file: File, choices: ImportChoices): FormData {
  const data = new FormData();
  // Fields first: the server reads them as they arrive, before the file.
  for (const [name, value] of Object.entries(choices)) {
    if (value === undefined || value === "") continue;
    data.append(name, typeof value === "string" ? value : JSON.stringify(value));
  }
  data.append("file", file);
  return data;
}

export const previewImport = (file: File, choices: ImportChoices) =>
  api.upload<RepeaterImportPreview>("/api/repeaters/import/preview", form(file, choices));

export const useImportRepeaters = () =>
  useChange(({ file, choices }: { file: File; choices: ImportChoices }) =>
    api.upload<RepeaterImportResult>("/api/repeaters/import", form(file, choices)),
  );

/** The address of a file of the repeaters a set of filters picks out. Opening it downloads the file. */
export function exportHref(
  format: RepeaterExportFormat,
  filters: Partial<RepeaterFilters>,
  near: LatLon | null,
  withinKm: number | null,
  limit: number | null,
): string {
  const params = new URLSearchParams({ format });
  for (const [name, value] of Object.entries({ ...filterQuery(filters, near, withinKm), limit: limit ?? undefined })) {
    if (value !== undefined) params.set(name, String(value));
  }
  return `/api/repeaters/export?${params.toString()}`;
}

// ── Where lists can be had ──

/** The declared sources, with what is held from each. Asking contacts nobody outside this server. */
export const useRepeaterSources = () =>
  useQuery({ queryKey: ["repeaters", "sources"], queryFn: () => api.get<RepeaterSourcesResponse>("/api/repeaters/sources") });

/** Has the server fetch a source's file, once. This is the request that needs the internet. */
export const fetchSource = (id: string) => api.post<RepeaterFetchResponse>(`/api/repeaters/sources/${id}/fetch`);

/** The choices as the fetched routes take them: the same as for a file, without the file. */
const fetchedBody = ({ sourceUrl: _sourceUrl, ...choices }: ImportChoices) =>
  Object.fromEntries(Object.entries(choices).filter(([, value]) => value !== undefined && value !== ""));

export const previewFetched = (token: string, choices: ImportChoices) =>
  api.post<RepeaterImportPreview>(`/api/repeaters/fetched/${token}/preview`, fetchedBody(choices));

export const useImportFetched = () =>
  useChange(({ token, choices }: { token: string; choices: ImportChoices }) =>
    api.post<RepeaterImportResult>(`/api/repeaters/fetched/${token}/import`, fetchedBody(choices)),
  );

/** Tells the server to forget a fetched file the person decided against. Nothing depends on the answer. */
export const discardFetched = (token: string) => void api.delete(`/api/repeaters/fetched/${token}`).catch(() => undefined);

// ── The same repeater twice ──

export const useRepeaterDuplicates = (enabled: boolean) =>
  useQuery({
    queryKey: ["repeaters", "duplicates"],
    queryFn: () => api.get<RepeaterDuplicatesResponse>("/api/repeaters/duplicates"),
    enabled,
  });

export const useMergeDuplicates = () =>
  useChange((input: { keepId: string; mergeIds: string[] }) => api.post<RepeaterMergeResult>("/api/repeaters/duplicates/merge", input));

export const useMergeAllDuplicates = () => useChange(() => api.post<RepeaterMergeResult>("/api/repeaters/duplicates/merge-all"));

export const useSeparate = () => useChange((id: string) => api.post<{ separated: number }>(`/api/repeaters/${id}/separate`));
