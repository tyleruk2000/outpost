/** What the Weather and hazards screen asks the server for, and the changes it sends. */
import type {
  MetOfficeRegionId,
  PressureReading,
  PressureUnit,
  ReadingImportResult,
  ReadingsResponse,
  UpdateResponse,
  WeatherKind,
  WeatherPlace,
  WeatherResponse,
} from "@outpost/shared";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

export const weatherKeys = {
  all: ["weather"] as const,
  cache: ["weather", "cache"] as const,
  readings: ["weather", "readings"] as const,
};

export const useWeather = () => useQuery({ queryKey: weatherKeys.cache, queryFn: () => api.get<WeatherResponse>("/api/weather") });
export const useReadings = () =>
  useQuery({
    queryKey: weatherKeys.readings,
    queryFn: () => api.get<ReadingsResponse>("/api/weather/readings").then((data) => data.readings),
  });

const refresh = (client: QueryClient) => void client.invalidateQueries({ queryKey: weatherKeys.all });

function useChange<T, R>(run: (input: T) => Promise<R>, options: { quiet?: boolean } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => refresh(client),
    onError: options.quiet ? undefined : (error) => toast.error(errorMessage(error)),
  });
}

export const useAddPlace = () =>
  useChange(
    (input: { markerId?: string; name?: string; lat?: number; lon?: number; region?: MetOfficeRegionId | null }) =>
      api.post<{ place: WeatherPlace }>("/api/weather/places", input).then((data) => data.place),
    { quiet: true },
  );
export const useUpdatePlace = () =>
  useChange(({ id, ...patch }: { id: string; name?: string; region?: MetOfficeRegionId | null }) =>
    api.patch<{ place: WeatherPlace }>(`/api/weather/places/${encodeURIComponent(id)}`, patch),
  );
export const useRemovePlace = () => useChange((id: string) => api.delete(`/api/weather/places/${encodeURIComponent(id)}`));
export const useRemoveCopy = () => useChange((id: string) => api.delete(`/api/weather/kept/${encodeURIComponent(id)}`));
export const useSetUpdateOnOpen = () => useChange((updateOnOpen: boolean) => api.put("/api/weather/options", { updateOnOpen }));

/** The press that fetches. The only call on this screen that makes Outpost contact anybody. */
export const useUpdate = () =>
  useChange((input: { kinds: WeatherKind[]; placeIds?: string[] }) => api.post<UpdateResponse>("/api/weather/update", input), {
    quiet: true,
  });

export const useAddReading = () =>
  useChange(
    (input: { takenAt: number; value: number; unit: PressureUnit; heightM: number; note: string }) =>
      api.post<{ reading: PressureReading }>("/api/weather/readings", input).then((data) => data.reading),
    { quiet: true },
  );
export const useRemoveReading = () => useChange((id: string) => api.delete(`/api/weather/readings/${encodeURIComponent(id)}`));
export const useImportReadings = () =>
  useChange(
    (input: { text: string; unit: PressureUnit; heightM: number; zone: string; apply: boolean }) =>
      api.post<ReadingImportResult>("/api/weather/readings/import", input),
    { quiet: true },
  );

/** The device's time zone, for times in a file that carry none. */
export const deviceZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  } catch {
    return "Europe/London";
  }
};
