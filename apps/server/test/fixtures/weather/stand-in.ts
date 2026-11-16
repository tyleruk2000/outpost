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
  "/weather/ea-flood/flood-monitoring/id/stations": "ea-stations.json",
  "/weather/nasa-power/api/temporal/climatology/point": "nasa-power-climatology.json",
  "/weather/pvgis/api/v5_3/MRcalc": "pvgis-mrcalc.json",
};

export function serveWeatherStandIn(request: IncomingMessage, response: ServerResponse): void {
  const pathname = new URL(request.url ?? "/", "http://stand-in").pathname;
  const file =
    ANSWERS[pathname] ?? (pathname.startsWith("/weather/ea-flood/flood-monitoring/id/stations/") ? "ea-station-E21609.json" : null);
  if (!file) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": file.endsWith(".xml") ? "application/rss+xml" : "application/json" });
  response.end(fs.readFileSync(path.join(import.meta.dirname, file)));
}
