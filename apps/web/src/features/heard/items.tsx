/** What each source says of a station, put into the parts of the one card (`card.tsx`). */
import type { AprsWeather, HeardReceiver, HeardReport, HeardStation, MeshPosition } from "@outpost/shared";
import { Joined } from "@/components/page";
import { formatNumber } from "@/lib/utils";
import type { HeardItem } from "./card";
import { altitudeWords, courseWords, displayName, pathWords, speedWords } from "./words";

const round1 = (value: number) => Math.round(value * 10) / 10;

export function weatherParts(weather: AprsWeather): string[] {
  const parts: string[] = [];
  if (weather.temperatureC !== null) parts.push(`${round1(weather.temperatureC)} °C`);
  if (weather.windSpeed !== null)
    parts.push(
      `wind ${Math.round(weather.windSpeed * 1.852)} km/h${weather.windDirection !== null ? ` from ${Math.round(weather.windDirection)}°` : ""}`,
    );
  if (weather.windGust !== null) parts.push(`gusts ${Math.round(weather.windGust * 1.852)} km/h`);
  if (weather.humidity !== null) parts.push(`humidity ${weather.humidity}%`);
  if (weather.pressureHpa !== null) parts.push(`${formatNumber(round1(weather.pressureHpa))} hPa`);
  if (weather.rain1hMm !== null) parts.push(`rain ${round1(weather.rain1hMm)} mm in the last hour`);
  if (weather.rainMidnightMm !== null) parts.push(`${round1(weather.rainMidnightMm)} mm since midnight`);
  return parts;
}

function more(station: HeardStation) {
  const weather = station.details.weather;
  const ship = station.details.ship;
  const aircraft = station.details.aircraft;
  return (
    <>
      {weather ? (
        <p className="text-ink">
          <span className="font-medium">Weather: </span>
          <Joined parts={weatherParts(weather)} />
          <span className="text-ink-muted"> (an amateur station; its calibration is not known)</span>
        </p>
      ) : null}
      {ship ? (
        <p className="text-ink">
          <Joined
            parts={[
              `MMSI ${ship.mmsi}`,
              ship.callsign ? `call sign ${ship.callsign}` : null,
              ship.lengthM ? `${ship.lengthM} m long` : null,
              ship.draughtM ? `draught ${ship.draughtM} m` : null,
              ship.destination ? `bound for ${ship.destination}` : null,
              ship.status,
            ].filter(Boolean)}
          />
        </p>
      ) : null}
      {aircraft ? (
        <p className="text-ink">
          <Joined
            parts={[
              `hex ${aircraft.icao}`,
              aircraft.squawk ? `squawk ${aircraft.squawk}` : null,
              aircraft.onGround ? "on the ground" : null,
              aircraft.verticalRate
                ? `${aircraft.verticalRate > 0 ? "climbing" : "descending"} ${formatNumber(Math.abs(aircraft.verticalRate))} ft a minute`
                : null,
            ].filter(Boolean)}
          />
        </p>
      ) : null}
      {station.details.sentBy ? (
        <p className="text-ink-muted">
          {station.key.startsWith(";") ? "An object" : "An item"} reported by {station.details.sentBy}
          {station.details.killed ? "; its sender has since taken it off the map" : ""}.
        </p>
      ) : null}
      {station.source === "adsb" || station.source === "ais" ? (
        <p className="text-ink-muted">Not for navigation, separation or collision avoidance.</p>
      ) : null}
    </>
  );
}

export function stationItem(station: HeardStation, receivers: HeardReceiver[], trail: HeardReport[] | null): HeardItem {
  const name = displayName(station);
  return {
    source: station.source,
    id: station.id,
    name,
    heardAs: name !== station.name ? station.name : null,
    kindWords: station.kindWords,
    receiver: receivers.find((receiver) => receiver.id === station.receiverId)?.name ?? null,
    path: pathWords(station),
    at: station.lastAt,
    position: station.lat !== null && station.lon !== null ? { lat: station.lat, lon: station.lon } : null,
    trail: trail ? trail.map((point) => ({ lat: point.lat, lon: point.lon, at: point.at })) : [],
    facts: [speedWords(station.source, station.speed), courseWords(station.course), altitudeWords(station.source, station.altitude)],
    comment: station.comment,
    more: more(station),
    pinnable: true,
    pinned: station.pinned,
    pinName: station.pinName,
    removable: true,
  };
}

export function meshItem(radio: MeshPosition, name: string): HeardItem {
  return {
    source: "mesh",
    id: radio.id,
    name,
    heardAs: null,
    kindWords: "Mesh radio",
    receiver: "the mesh radio link",
    path: null,
    at: radio.at,
    position: radio.position ? { lat: radio.position.lat, lon: radio.position.lon } : null,
    trail: null,
    facts: [radio.position?.altitude != null ? `${formatNumber(Math.round(radio.position.altitude))} m up` : null],
    comment: null,
    pinnable: false,
    pinned: false,
    pinName: null,
    removable: false,
  };
}
