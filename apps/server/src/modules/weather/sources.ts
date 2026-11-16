/**
 * The publishers weather and hazard data is fetched from, what is sent to each, and the
 * addresses asked. These are the only hosts this module ever contacts, and only when a
 * person presses a button (see index.ts). Each publisher's terms are quoted, with the
 * date they were read, in docs/sources.md; the summary here is what the screen shows.
 *
 * In tests one local server stands in for all of them (`OUTPOST_WEATHER_STAND_IN`): a
 * request for `https://host/path?query` goes to `<stand-in>/<source id>/path?query`.
 */
import { roundForSending, type WeatherSourceId, type WeatherSourceInfo } from "@outpost/shared";
import { AppError } from "../../core/errors.ts";
import type { HttpClient } from "../../core/http.ts";
import { NASA_POWER_PARAMETERS, OPEN_METEO_DAILY, OPEN_METEO_HOURLY, OPEN_METEO_MODEL } from "./parsers.ts";

const TERMS_READ = "2026-11-16";

export const WEATHER_SOURCES: Record<WeatherSourceId, WeatherSourceInfo> = {
  "open-meteo": {
    id: "open-meteo",
    kind: "forecast",
    publisher: "Open-Meteo",
    name: "Forecast for the next seven days",
    covers: "Anywhere. Over the UK and Ireland it is the Met Office's UKV model at 2 km; elsewhere the Met Office's global model.",
    host: "api.open-meteo.com",
    sends: "The place's latitude and longitude, rounded to two decimal places (about a kilometre).",
    licence: "Creative Commons Attribution 4.0 (CC BY 4.0)",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Weather data by Open-Meteo.com, from the Met Office's models",
    liveUrl: "https://open-meteo.com/",
    termsUrl: "https://open-meteo.com/en/terms",
    termsRead: TERMS_READ,
  },
  "met-office-warnings": {
    id: "met-office-warnings",
    kind: "warnings",
    publisher: "Met Office",
    name: "National Severe Weather Warnings for the UK",
    covers: "The United Kingdom.",
    host: "www.metoffice.gov.uk",
    sends: "Nothing about you or your places: the one feed for the whole of the UK is fetched, and sorted by region here.",
    licence: "Crown copyright",
    licenceUrl: "https://www.metoffice.gov.uk/about-us/legal",
    attribution: "Contains Met Office warnings. © Crown copyright",
    liveUrl: "https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings",
    termsUrl: "https://www.metoffice.gov.uk/about-us/legal",
    termsRead: TERMS_READ,
  },
  "ea-flood": {
    id: "ea-flood",
    kind: "flood",
    publisher: "Environment Agency",
    name: "Flood warnings and river levels",
    covers: "England only. Scotland, Wales and Northern Ireland publish their own (see Sources).",
    host: "environment.data.gov.uk",
    sends: "The place's latitude and longitude, rounded to two decimal places, and a distance to look within.",
    licence: "Open Government Licence v3.0",
    licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    attribution: "This uses Environment Agency flood and river level data from the real-time data API (Beta)",
    liveUrl: "https://check-for-flooding.service.gov.uk/",
    termsUrl: "https://environment.data.gov.uk/flood-monitoring/doc/reference",
    termsRead: TERMS_READ,
  },
  "nasa-power": {
    id: "nasa-power",
    kind: "climate",
    publisher: "NASA Langley Research Center, POWER project",
    name: "Monthly climate averages",
    covers: "Anywhere, on a grid of about 50 km.",
    host: "power.larc.nasa.gov",
    sends: "The place's latitude and longitude, rounded to two decimal places.",
    licence: "Open data, no restrictions on use",
    licenceUrl: "https://power.larc.nasa.gov/docs/referencing/",
    attribution:
      "Data obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program",
    liveUrl: "https://power.larc.nasa.gov/data-access-viewer/",
    termsUrl: "https://power.larc.nasa.gov/docs/referencing/",
    termsRead: TERMS_READ,
  },
  pvgis: {
    id: "pvgis",
    kind: "solar",
    publisher: "European Commission Joint Research Centre",
    name: "Sunshine on a solar panel by month (PVGIS)",
    covers: "Europe, Africa, most of Asia and the Americas.",
    host: "re.jrc.ec.europa.eu",
    sends: "The place's latitude and longitude, rounded to two decimal places.",
    licence: "Free to use, with acknowledgement of the source",
    licenceUrl: "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/pvgis-data-download_en",
    attribution: "PVGIS © European Union, 2001–2026",
    liveUrl: "https://re.jrc.ec.europa.eu/pvg_tools/en/",
    termsUrl:
      "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en",
    termsRead: TERMS_READ,
  },
};

export const WEATHER_HOSTS = [...new Set(Object.values(WEATHER_SOURCES).map((source) => source.host))];

/** How far round a place flood warnings and river gauges are asked for, km. */
export const FLOOD_WARNINGS_KM = 15;
export const STATIONS_KM = 8;
/** The most river gauges kept for one place, nearest first. */
export const MAX_STATIONS = 5;

const position = (lat: number, lon: number) => ({ lat: roundForSending(lat).toFixed(2), lon: roundForSending(lon).toFixed(2) });

/** The publisher's address for each request, before any stand-in. */
export const sourceUrls = {
  forecast(lat: number, lon: number): string {
    const at = position(lat, lon);
    const query = new URLSearchParams({
      latitude: at.lat,
      longitude: at.lon,
      hourly: OPEN_METEO_HOURLY.join(","),
      daily: OPEN_METEO_DAILY.join(","),
      models: OPEN_METEO_MODEL,
      timezone: "UTC",
      forecast_days: "7",
      wind_speed_unit: "kmh",
    });
    return `https://api.open-meteo.com/v1/forecast?${query}`;
  },
  warnings(): string {
    return "https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/UK";
  },
  floods(lat: number, lon: number): string {
    const at = position(lat, lon);
    return `https://environment.data.gov.uk/flood-monitoring/id/floods?lat=${at.lat}&long=${at.lon}&dist=${FLOOD_WARNINGS_KM}`;
  },
  stations(lat: number, lon: number): string {
    const at = position(lat, lon);
    return `https://environment.data.gov.uk/flood-monitoring/id/stations?parameter=level&lat=${at.lat}&long=${at.lon}&dist=${STATIONS_KM}`;
  },
  station(id: string): string {
    return `https://environment.data.gov.uk/flood-monitoring/id/stations/${encodeURIComponent(id)}?_view=full`;
  },
  climate(lat: number, lon: number): string {
    const at = position(lat, lon);
    const query = new URLSearchParams({
      parameters: NASA_POWER_PARAMETERS.join(","),
      community: "RE",
      latitude: at.lat,
      longitude: at.lon,
      format: "JSON",
    });
    return `https://power.larc.nasa.gov/api/temporal/climatology/point?${query}`;
  },
  solar(lat: number, lon: number): string {
    const at = position(lat, lon);
    return `https://re.jrc.ec.europa.eu/api/v5_3/MRcalc?lat=${at.lat}&lon=${at.lon}&horirrad=1&optrad=1&outputformat=json`;
  },
};

/** What a request sends, in words, for the record kept beside the copy. */
export function sentWords(url: string): string {
  const parsed = new URL(url);
  const lat = parsed.searchParams.get("latitude") ?? parsed.searchParams.get("lat");
  const lon = parsed.searchParams.get("longitude") ?? parsed.searchParams.get("long") ?? parsed.searchParams.get("lon");
  return lat && lon ? `${parsed.hostname}: latitude ${lat}, longitude ${lon}` : `${parsed.hostname}: no position`;
}

/** The most one answer may be. The largest real one is about 10 kB. */
export const MAX_ANSWER_BYTES = 2 * 1024 * 1024;

export interface SourceFetcher {
  /** Fetches one address of a declared publisher and gives back its text and size. */
  get(source: WeatherSourceId, url: string, signal?: AbortSignal): Promise<{ text: string; bytes: number }>;
}

export function createSourceFetcher(http: HttpClient, options: { standIn?: string }): SourceFetcher {
  return {
    async get(source, url, signal) {
      const real = new URL(url);
      if (real.hostname !== WEATHER_SOURCES[source].host)
        throw new AppError("bad_request", `${real.hostname} is not where ${WEATHER_SOURCES[source].publisher} is asked.`);
      const target = options.standIn ? `${options.standIn.replace(/\/+$/, "")}/${source}${real.pathname}${real.search}` : url;
      const host = new URL(target).hostname;
      const timeout = AbortSignal.timeout(30_000);
      const { response } = await http
        .fetch(target, {
          allowedHosts: [host],
          everyHop: true,
          maxRedirects: 3,
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          headers: { accept: "application/json, application/rss+xml, application/xml;q=0.9, */*;q=0.5" },
        })
        .catch((error: unknown) => {
          if (error instanceof AppError) throw error;
          const reason = (error as Error).name === "TimeoutError" ? "took longer than 30 seconds to answer" : "could not be reached";
          throw new AppError("upstream", `${WEATHER_SOURCES[source].publisher} ${reason}. Check the connection and try again.`);
        });
      if (!response.ok) {
        await response.body?.cancel();
        const busy = response.status === 429 ? " It says it has had too many requests; try again later." : "";
        throw new AppError("upstream", `${WEATHER_SOURCES[source].publisher} answered ${response.status}.${busy}`);
      }
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > MAX_ANSWER_BYTES) {
        await response.body?.cancel();
        throw new AppError("upstream", `${WEATHER_SOURCES[source].publisher} sent more than Outpost will keep.`);
      }
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of response.body ?? []) {
        bytes += chunk.byteLength;
        if (bytes > MAX_ANSWER_BYTES)
          throw new AppError("upstream", `${WEATHER_SOURCES[source].publisher} sent more than Outpost will keep.`);
        chunks.push(chunk);
      }
      return { text: Buffer.concat(chunks).toString("utf8"), bytes };
    },
  };
}
