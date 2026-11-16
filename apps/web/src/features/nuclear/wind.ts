/**
 * A starting value for a scenario's fallout wind from the weather kept on this device
 * (Weather and hazards' forecasts, fetched only when a person asked there). It is one
 * hour's forecast wind ten metres above the ground at one place, which is not the winds
 * aloft that carry fallout: the screen says so, citing the simulator's own source. The
 * person can always type their own.
 */
import { haversineMeters, type KeptCopy, type WeatherResponse } from "@outpost/shared";

/** A forecast for a place further than this from ground zero is not offered. */
export const NEAR_KM = 50;
/** An hour further than this from now is not offered: the forecast has run out, or not begun. */
const HOUR_SLACK_MS = 90 * 60_000;

export interface WindOffer {
  placeName: string;
  distanceKm: number;
  /** The forecast hour the wind is for. */
  at: number;
  fromDegrees: number;
  kmh: number;
  fetchedAt: number;
  service: string;
}

/**
 * The wind of the forecast kept for the place nearest ground zero (within 50 km), for
 * the forecast hour nearest `now`; null when there is none near or no hour near now.
 */
export function windOffer(
  weather: Pick<WeatherResponse, "places" | "kept">,
  at: { lat: number; lon: number },
  now: number,
): WindOffer | null {
  let best: WindOffer | null = null;
  for (const copy of weather.kept) {
    if (copy.kind !== "forecast" || !copy.placeId) continue;
    const place = weather.places.find((entry) => entry.id === copy.placeId);
    if (!place) continue;
    const distanceKm = haversineMeters(at.lat, at.lon, place.lat, place.lon) / 1000;
    if (distanceKm > NEAR_KM) continue;
    const forecast = (copy as KeptCopy<"forecast">).data;
    let hour: (typeof forecast.hours)[number] | null = null;
    for (const entry of forecast.hours) {
      if (entry.windKmh === null || entry.windFrom === null) continue;
      if (!hour || Math.abs(entry.t - now) < Math.abs(hour.t - now)) hour = entry;
    }
    if (!hour || Math.abs(hour.t - now) > HOUR_SLACK_MS) continue;
    const offer: WindOffer = {
      placeName: place.name,
      distanceKm,
      at: hour.t,
      fromDegrees: Math.round(hour.windFrom!),
      kmh: Math.round(hour.windKmh!),
      fetchedAt: copy.fetchedAt,
      service: forecast.service,
    };
    if (!best || offer.distanceKm < best.distanceKm || (offer.distanceKm === best.distanceKm && offer.fetchedAt > best.fetchedAt))
      best = offer;
  }
  return best;
}

/** Why one hour's surface wind is not the wind that carries fallout, in the simulator's source's own words. */
export const WINDS_ALOFT =
  "This is one hour's forecast wind 10 m above the ground at one place. Fallout is carried by the winds at every height up to the top of the cloud, which for a large burst is many kilometres up and often blows another way: Glasstone and Dolan say that for a real prediction “the winds from the surface to all levels in the radioactive cloud must be considered”, and the idealised pattern's “effective wind” is an average of the winds from the ground up to the top of the cloud (§ 9.84). Use it as a starting value, nothing more.";
