/**
 * A stand-in for every weather publisher, for the end-to-end suite: under /weather/ it
 * answers each request Outpost makes (`OUTPOST_WEATHER_STAND_IN`) with the recorded
 * answers in this folder. It records nothing and contacts nobody.
 */
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const ANSWERS: Record<string, string> = {
  "/weather/open-meteo/v1/forecast": "open-meteo-forecast.json",
  "/weather/met-office-warnings/public/data/PWSCache/WarningsRSS/Region/UK": "met-office-uk.xml",
  "/weather/ea-flood/flood-monitoring/id/floods": "ea-floods.json",
  "/weather/ea-levels/flood-monitoring/id/stations": "ea-level-stations.json",
  "/weather/nasa-power/api/temporal/climatology/point": "nasa-power-climatology.json",
  "/weather/pvgis/api/v5_3/MRcalc": "pvgis-mrcalc.json",
  "/weather/gdacs/xml/rss.xml": "gdacs-rss.xml",
  "/weather/usgs-quakes/earthquakes/feed/v1.0/summary/4.5_week.geojson": "usgs-4.5-week.geojson",
  "/weather/meteoalarm/feeds/meteoalarm-legacy-atom-united-kingdom": "meteoalarm-united-kingdom.xml",
  "/weather/nws-alerts/alerts/active": "nws-alerts.json",
  "/weather/eccc-alerts/collections/weather-alerts/items": "eccc-alerts-kapuskasing.json",
  "/weather/metservice-alerts/cap/rss": "metservice-rss.xml",
  "/weather/metservice-alerts/cap/alert": "metservice-cap-arthurs-pass.xml",
  "/weather/jma-warnings/developer/xml/feed/extra_l.xml": "jma-extra-l.xml",
  "/weather/swpc/products/noaa-scales.json": "swpc-noaa-scales.json",
  "/weather/swpc/products/summary/10cm-flux.json": "swpc-10cm-flux.json",
  "/weather/swpc/products/noaa-planetary-k-index.json": "swpc-planetary-k-index.json",
  "/weather/swpc/text/wwv.txt": "swpc-wwv.txt",
  "/weather/swpc/text/daily-solar-indices.txt": "swpc-daily-solar-indices.txt",
};

export function serveWeatherStandIn(request: IncomingMessage, response: ServerResponse): void {
  const pathname = new URL(request.url ?? "/", "http://stand-in").pathname;
  // Every level measure answers with the one station's recorded readings.
  const file =
    ANSWERS[pathname] ??
    (/^\/weather\/ea-levels\/flood-monitoring\/id\/measures\/[^/]+\/readings$/.test(pathname) ? "ea-level-readings.json" : null);
  if (!file) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": file.endsWith(".xml") ? "application/rss+xml" : "application/json" });
  const body = fs.readFileSync(path.join(import.meta.dirname, file));
  response.end(file === "open-meteo-forecast.json" ? forecastFromToday(body.toString("utf8")) : body);
}

/**
 * The recorded forecast, with its days moved so that the first is today (UTC, as the
 * recording is). A forecast is fetched for the days ahead: served with the dates it was
 * recorded on (16 and 17 November 2026) it has run out, and Outpost rightly says so.
 */
export function forecastFromToday(recorded: string, now = Date.now()): string {
  const answer = JSON.parse(recorded) as { hourly: { time: string[] }; daily: { time: string[] } };
  const DAY = 86_400_000;
  const days = Math.floor(now / DAY) - Math.floor(Date.parse(`${answer.daily.time[0]}T00:00Z`) / DAY);
  const moved = (time: string) => {
    const [date, hour] = time.split("T");
    const day = new Date(Date.parse(`${date}T00:00Z`) + days * DAY).toISOString().slice(0, 10);
    return hour === undefined ? day : `${day}T${hour}`;
  };
  answer.hourly.time = answer.hourly.time.map(moved);
  answer.daily.time = answer.daily.time.map(moved);
  return JSON.stringify(answer);
}
