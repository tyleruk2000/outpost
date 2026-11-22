/**
 * Weather → Heard on the radio (outpost-ywbh.4): readings from APRS weather stations the
 * household's receiver heard, as local observations with the station's callsign, its
 * distance and the age of the reading. The only live weather Outpost can have with no
 * internet. Their pressure is offered to the barometer log, and written there only when
 * a person presses the button.
 */
import { windPointOf } from "@outpost/shared";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Joined, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { HomeAsOf, useHome } from "@/features/households/home";
import { useAddReading } from "@/features/weather/data";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { useStations } from "./data";
import { weatherParts } from "./items";
import { ListenOnly } from "./licence";
import { displayName, fromHome, metersFromHome } from "./words";

export function AprsWeather() {
  const stations = useStations("aprs");
  const found = useHome().home;
  const add = useAddReading();
  const [added, setAdded] = useState<Set<string>>(new Set());
  const home = found ? { lat: found.lat, lon: found.lon, name: found.name } : null;
  if (stations.isPending) return <Skeleton className="h-24" />;
  if (stations.isError) return <ErrorState error={stations.error} onRetry={() => void stations.refetch()} />;
  const list = stations.data
    .filter((station) => station.details.weather)
    .sort((a, b) => (metersFromHome(home, a) ?? Number.POSITIVE_INFINITY) - (metersFromHome(home, b) ?? Number.POSITIVE_INFINITY));
  return (
    <div className="grid gap-4">
      <p className="text-small text-ink">
        Readings sent by amateur weather stations over APRS, as your own receiver heard them. Their calibration is not known: treat them as
        a neighbour's thermometer, not an official observation.
      </p>
      <ListenOnly source="aprs" />
      {list.length > 0 ? <HomeAsOf home={found} /> : null}
      {list.length === 0 ? (
        <EmptyState compact level={3} title="No APRS weather station heard">
          With an APRS receiver set up, weather stations in radio range appear here.{" "}
          <Link to="/radio/heard" className="text-primary underline underline-offset-2">
            Heard on the radio
          </Link>
        </EmptyState>
      ) : (
        <Rows aria-label="APRS weather stations heard">
          {list.map((station) => {
            const weather = station.details.weather!;
            const pressure = weather.pressureHpa;
            return (
              <li key={station.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1 text-small">
                  <p className="font-medium text-ink">
                    {displayName(station)}
                    <span className="font-normal text-ink-muted"> · {fromHome(home, station) ?? "position not heard"}</span>
                  </p>
                  <p className="text-ink">
                    <Joined parts={weatherParts(weather)} />
                  </p>
                  <p className="text-ink-muted">
                    Read {timeAgo(weather.at)} · {formatDateTime(weather.at)}
                  </p>
                </div>
                {pressure !== null ? (
                  <Button
                    size="sm"
                    disabled={added.has(station.id)}
                    loading={add.isPending && add.variables?.note.includes(station.name)}
                    onClick={() =>
                      add.mutate(
                        {
                          takenAt: weather.at,
                          value: Math.round(pressure * 10) / 10,
                          unit: "hPa",
                          heightM: 0,
                          windFrom: weather.windDirection !== null ? windPointOf(String(Math.round(weather.windDirection))) : null,
                          note: `APRS weather station ${station.name}, heard on the radio. Taken as at sea level: APRS does not say whether a station reduces its pressure.`,
                        },
                        {
                          onSuccess: () => {
                            setAdded(new Set([...added, station.id]));
                            toast.success("Added to the barometer log.");
                          },
                        },
                      )
                    }
                  >
                    {added.has(station.id) ? "Added to the barometer log" : `Add ${Math.round(pressure)} hPa to the barometer log`}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </Rows>
      )}
    </div>
  );
}
