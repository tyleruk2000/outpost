/** Tide times from the server: the stations near a place, and a station's predictions. Keys start with "tides". */
import type { TidePredictionResponse, TideStationsResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const tideKeys = {
  stations: (lat: number, lon: number) => ["tides", "stations", lat, lon] as const,
  predictions: (id: string, from: number, days: number, lat: number, lon: number) =>
    ["tides", "predictions", id, from, days, lat, lon] as const,
};

/** How many stations are offered for a place. */
export const STATIONS_OFFERED = 8;

export const useTideStations = (place: { lat: number; lon: number } | null) =>
  useQuery({
    queryKey: tideKeys.stations(place?.lat ?? 0, place?.lon ?? 0),
    queryFn: () => api.get<TideStationsResponse>(`/api/tides/stations?lat=${place?.lat}&lon=${place?.lon}&limit=${STATIONS_OFFERED}`),
    enabled: place !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });

export const useTidePredictions = (id: string | null, from: number, days: number, place: { lat: number; lon: number } | null) =>
  useQuery({
    queryKey: tideKeys.predictions(id ?? "", from, days, place?.lat ?? 0, place?.lon ?? 0),
    queryFn: () =>
      api.get<TidePredictionResponse>(
        `/api/tides/stations/${encodeURIComponent(id ?? "")}/predictions?from=${from}&days=${days}${place ? `&lat=${place.lat}&lon=${place.lon}` : ""}`,
      ),
    enabled: id !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
