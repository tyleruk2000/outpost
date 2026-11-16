/**
 * Peak sun hours from Weather and hazards. That screen fetches PVGIS's monthly figures
 * for one of its places when a person presses; this one only reads what it keeps
 * (`kept[kind="solar"]` of `GET /api/weather`) and fetches nothing. Figures go into the
 * plan only on a press, and figures already typed are replaced only after asking. The
 * plan records where they came from (`sunHoursSource`), so that the PDF says so.
 */
import { ageWords, type KeptCopy, type PowerSunSource, type SolarData, type WeatherPlace, type WeatherResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { CloudSun } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/misc";
import { api } from "@/lib/api";

type Tilt = PowerSunSource["tilt"];

/** Under the weather screen's own key, so that a fetch there refreshes this. */
const useWeatherCache = () => useQuery({ queryKey: ["weather", "cache"], queryFn: () => api.get<WeatherResponse>("/api/weather") });

/** A place with a solar copy, and the copy. */
interface Offer {
  place: WeatherPlace;
  copy: KeptCopy<"solar">;
}

export function offersOf(weather: WeatherResponse | undefined): Offer[] {
  if (!weather) return [];
  const offers: Offer[] = [];
  for (const place of weather.places) {
    const copy = weather.kept.find((each) => each.kind === "solar" && each.placeId === place.id) as KeptCopy<"solar"> | undefined;
    if (copy) offers.push({ place, copy });
  }
  // Home first, then the weather list's own order.
  return offers.sort((a, b) => Number(b.place.isHome) - Number(a.place.isHome));
}

/** The twelve figures and the record of where they came from, for one place and tilt. */
export function fillFrom(offer: Offer, tilt: Tilt, now: number): { sunHours: Array<number | null>; source: PowerSunSource } {
  const data: SolarData = offer.copy.data;
  const series = tilt === "optimal" ? data.optimal : data.level;
  return {
    sunHours: Array.from({ length: 12 }, (_, month) => {
      const value = series[month];
      return value === null || value === undefined ? null : Math.round(value * 100) / 100;
    }),
    source: {
      kind: "pvgis",
      attribution: "PVGIS © European Communities, 2001-2026",
      place: offer.place.name,
      lat: offer.place.lat,
      lon: offer.place.lon,
      tilt,
      slope: tilt === "optimal" ? data.optimalSlope : null,
      firstYear: data.firstYear,
      lastYear: data.lastYear,
      databases: data.databases,
      fetchedAt: offer.copy.fetchedAt,
      filledAt: now,
      edited: false,
    },
  };
}

export function SunFromWeather({
  sunHours,
  source,
  onFill,
}: {
  sunHours: Array<number | null>;
  source: PowerSunSource | null | undefined;
  onFill: (sunHours: Array<number | null>, source: PowerSunSource) => void;
}) {
  const weather = useWeatherCache();
  const offers = offersOf(weather.data);
  const [placeId, setPlaceId] = useState<string | undefined>(undefined);
  const [tilt, setTilt] = useState<Tilt>("optimal");
  const [asking, setAsking] = useState(false);
  const pvgisCredit = weather.data?.sources.find((each) => each.id === "pvgis")?.attribution;

  if (weather.isPending) return null;
  if (weather.isError)
    return (
      <p className="mb-3 text-small text-ink-muted">
        What Weather and hazards keeps could not be read just now, so its figures are not offered.
      </p>
    );
  if (offers.length === 0)
    return (
      <p className="mb-3 max-w-[70ch] text-small text-ink-muted">
        Weather and hazards can fetch these from PVGIS for one of its places, when you press “Fetch the averages for this place” there. None
        have been fetched yet.{" "}
        <Link to="/prepare/weather?view=climate" className="text-primary underline underline-offset-2">
          Open Weather and hazards
        </Link>
      </p>
    );

  const offer = offers.find((each) => each.place.id === placeId) ?? offers[0]!;
  const data = offer.copy.data;
  const now = weather.data?.now ?? Date.now();
  const age = Math.max(0, now - offer.copy.fetchedAt);
  const typed = sunHours.some((value) => value !== null) && (!source || source.edited);
  const fill = () => {
    const { sunHours: figures, source: from } = fillFrom(offer, tilt, Date.now());
    onFill(figures, pvgisCredit ? { ...from, attribution: pvgisCredit } : from);
  };

  return (
    <div className="mb-4 grid max-w-[70ch] gap-3 border-y border-border py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {offers.length > 1 ? (
          <Select<string>
            aria-label="Place"
            value={offer.place.id}
            onChange={setPlaceId}
            options={offers.map((each) => ({
              value: each.place.id,
              label: each.place.isHome ? `${each.place.name} (home)` : each.place.name,
            }))}
          />
        ) : null}
        <Select<Tilt>
          aria-label="Panels"
          value={tilt}
          onChange={setTilt}
          options={[
            {
              value: "optimal",
              label: `Facing south at ${data.optimalSlope === null ? "the best tilt" : `${data.optimalSlope}°, the best tilt`}`,
            },
            { value: "level", label: "Lying flat (level ground)" },
          ]}
        />
      </div>
      <p className="text-small text-ink-muted">
        PVGIS's figures (European Commission Joint Research Centre) for {offer.place.name}, {offer.place.lat.toFixed(2)},{" "}
        {offer.place.lon.toFixed(2)}, averaged over {data.firstYear} to {data.lastYear} from {data.databases}; fetched by Weather and
        hazards {age < 60_000 ? "just now" : `${ageWords(age)} ago`}. Panels at another angle or facing elsewhere get a different figure;
        shading is not counted.
      </p>
      <div>
        <Button onClick={() => (typed ? setAsking(true) : fill())}>
          <CloudSun aria-hidden /> Fill in from Weather and hazards
        </Button>
      </div>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Replace the figures typed in?"
        description={`The twelve months will be set to PVGIS's figures for ${offer.place.name}. The figures there now will go.`}
        confirmLabel="Replace them"
        confirmVariant="primary"
        onConfirm={() => {
          fill();
          setAsking(false);
        }}
      />
    </div>
  );
}
