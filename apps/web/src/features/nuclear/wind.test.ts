import type { KeptCopy, WeatherPlace, WeatherResponse } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { WINDS_ALOFT, windOffer } from "./wind";

const NOW = Date.UTC(2026, 10, 16, 14, 10);
const place = (id: string, lat: number, lon: number): WeatherPlace => ({
  id,
  name: id,
  lat,
  lon,
  markerId: null,
  isHome: false,
  region: null,
  country: null,
  createdAt: 1,
});
const forecast = (placeId: string, fetchedAt: number, hours: Array<[number, number | null, number | null]>): KeptCopy =>
  ({
    id: `f-${placeId}`,
    kind: "forecast",
    source: "open-meteo",
    placeId,
    fetchedAt,
    validFrom: null,
    validUntil: null,
    bytes: 1,
    sent: "",
    data: {
      service: "Open-Meteo",
      model: "",
      elevation: null,
      gridLat: 0,
      gridLon: 0,
      hours: hours.map(([t, windKmh, windFrom]) => ({
        t,
        windKmh,
        windFrom,
        tempC: null,
        precipMm: null,
        precipChance: null,
        code: null,
        gustKmh: null,
        pressureHpa: null,
      })),
      days: [],
    },
  }) as KeptCopy;

const weather = (places: WeatherPlace[], kept: KeptCopy[]): Pick<WeatherResponse, "places" | "kept"> => ({ places, kept });

describe("the wind offered from the weather kept on this device", () => {
  const hour = 3_600_000;
  const hours: Array<[number, number | null, number | null]> = [
    [NOW - 2 * hour, 10, 200],
    [Date.UTC(2026, 10, 16, 14), 19, 250],
    [NOW + 3 * hour, 30, 300],
  ];

  it("is the hour nearest now of the forecast for the nearest place within 50 km, with its time and when it was fetched", () => {
    const offer = windOffer(
      weather(
        [place("Home", 54.47, -3.05), place("Town", 54.6, -3.1)],
        [forecast("Home", NOW - 2 * hour, hours), forecast("Town", NOW, hours)],
      ),
      { lat: 54.46, lon: -3.09 },
      NOW,
    );
    expect(offer).toMatchObject({
      placeName: "Home",
      fromDegrees: 250,
      kmh: 19,
      at: Date.UTC(2026, 10, 16, 14),
      fetchedAt: NOW - 2 * hour,
      service: "Open-Meteo",
    });
    expect(offer!.distanceKm).toBeLessThan(5);
  });

  it("is nothing when no forecast is near ground zero, or none covers now, or the hour has no wind", () => {
    expect(windOffer(weather([place("Far", 51.5, -0.1)], [forecast("Far", NOW, hours)]), { lat: 54.46, lon: -3.09 }, NOW)).toBeNull();
    expect(
      windOffer(weather([place("Home", 54.47, -3.05)], [forecast("Home", NOW, hours)]), { lat: 54.46, lon: -3.09 }, NOW + 48 * hour),
    ).toBeNull();
    expect(
      windOffer(weather([place("Home", 54.47, -3.05)], [forecast("Home", NOW, [[NOW, null, 250]])]), { lat: 54.46, lon: -3.09 }, NOW),
    ).toBeNull();
    expect(windOffer(weather([], []), { lat: 54.46, lon: -3.09 }, NOW)).toBeNull();
  });

  it("is said to be one hour's surface wind at one place, not the winds aloft, citing the simulator's source", () => {
    expect(WINDS_ALOFT).toMatch(/one hour's forecast wind 10 m above the ground at one place/);
    expect(WINDS_ALOFT).toMatch(/§ 9\.84/);
    expect(WINDS_ALOFT).toMatch(/the winds from the surface to all levels in the radioactive cloud must be considered/);
  });
});
