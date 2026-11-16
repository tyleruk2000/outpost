/** The wind of a forecast kept on this device, offered as a starting value for a scenario's fallout wind (wind.ts). */
import { CloudSun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWeather } from "@/features/weather/data";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { WINDS_ALOFT, windOffer } from "./wind";
import { compass } from "./words";

export function WindOffer({ at, onUse }: { at: { lat: number; lon: number } | null; onUse: (fromDegrees: number, kmh: number) => void }) {
  // Reads what Weather and hazards keeps; fetches nothing from the internet.
  const weather = useWeather();
  if (!at || !weather.data) return null;
  const offer = windOffer(weather.data, at, weather.data.now);
  if (!offer) return null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-control border border-border bg-surface p-3" data-testid="wind-offer">
      <p className="flex items-start gap-2 text-small text-ink">
        <CloudSun aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        <span>
          Forecast wind from the {compass(offer.fromDegrees)} ({offer.fromDegrees}°) at {offer.kmh} km/h, for {formatDateTime(offer.at)} at{" "}
          {offer.placeName} ({offer.distanceKm < 1 ? "under 1" : Math.round(offer.distanceKm)} km from ground zero), fetched{" "}
          {timeAgo(offer.fetchedAt)} from {offer.service}.
        </span>
      </p>
      <p className="text-small text-ink-muted">{WINDS_ALOFT}</p>
      <div>
        <Button onClick={() => onUse(offer.fromDegrees, offer.kmh)}>Use this wind</Button>
      </div>
    </div>
  );
}
