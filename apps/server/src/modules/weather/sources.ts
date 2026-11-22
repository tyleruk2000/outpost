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
const ALERTS_READ = "2026-11-21";
const NATIONAL_READ = "2026-11-22";

export const WEATHER_SOURCES: Record<WeatherSourceId, WeatherSourceInfo> = {
  "open-meteo": {
    id: "open-meteo",
    kind: "forecast",
    publisher: "Open-Meteo",
    name: "Forecast for the next seven days",
    covers: "Anywhere. Over the UK and Ireland it is the Met Office's UKV model at 2 km; elsewhere the Met Office's global model.",
    host: "api.open-meteo.com",
    sends: "The place's latitude and longitude, rounded to two decimal places (about a kilometre).",
    licence: "CC BY 4.0 (Open-Meteo); the Met Office's model data under CC BY-SA 4.0",
    licenceUrl: "https://open-meteo.com/en/licence",
    attribution: "Weather data by Open-Meteo.com. Atmospheric forecasts from UK Met Office (CC BY-SA 4.0)",
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
    licence: "Crown copyright, under the Met Office's RSS terms",
    licenceUrl: "https://weather.metoffice.gov.uk/guides/rss",
    attribution: "Met Office Weather Warnings, from the Met Office website, metoffice.gov.uk. © Crown copyright",
    liveUrl: "https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings",
    termsUrl: "https://weather.metoffice.gov.uk/guides/rss",
    termsRead: TERMS_READ,
  },
  "ea-flood": {
    id: "ea-flood",
    kind: "flood",
    publisher: "Environment Agency",
    name: "Flood warnings",
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
  "ea-levels": {
    id: "ea-levels",
    kind: "rivers",
    publisher: "Environment Agency",
    name: "River and sea levels",
    covers: "England only. Scotland, Wales and Northern Ireland publish their own (see Sources).",
    host: "environment.data.gov.uk",
    sends:
      "The place's latitude and longitude, rounded to two decimal places, and a distance to look within; then the name of each nearby station's level measure.",
    licence: "Open Government Licence v3.0",
    licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    attribution: "This uses Environment Agency flood and river level data from the real-time data API (Beta)",
    liveUrl: "https://check-for-flooding.service.gov.uk/river-and-sea-levels",
    termsUrl: "https://environment.data.gov.uk/flood-monitoring/doc/reference",
    termsRead: "2026-11-17",
  },
  "nasa-power": {
    id: "nasa-power",
    kind: "climate",
    publisher: "NASA Langley Research Center, POWER project",
    name: "Monthly climate averages",
    covers: "Anywhere, on a grid of about 50 km.",
    host: "power.larc.nasa.gov",
    sends: "The place's latitude and longitude, rounded to two decimal places.",
    licence: "No licence is named on its pages; NASA asks for the acknowledgement below",
    licenceUrl: "https://power.larc.nasa.gov/docs/referencing/",
    attribution:
      "The data was obtained from National Aeronautics and Space Administration (NASA) Langley Research Center's Prediction Of Worldwide Energy Resources (POWER) project funded through the NASA Earth Science Division.",
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
    licence: "Free for public use if the source is acknowledged",
    licenceUrl:
      "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/general-information/geospatial-data-download_en",
    attribution: "PVGIS © European Communities, 2001-2026",
    liveUrl: "https://re.jrc.ec.europa.eu/pvg_tools/en/",
    termsUrl:
      "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en",
    termsRead: TERMS_READ,
  },
  gdacs: {
    id: "gdacs",
    kind: "gdacs",
    publisher: "GDACS (European Commission Joint Research Centre and the United Nations)",
    name: "Disasters worldwide: earthquakes, tropical cyclones, floods, volcanoes, droughts and wildfires",
    covers: "The whole world.",
    host: "www.gdacs.org",
    sends: "Nothing about you or your places: the one feed for the whole world is fetched.",
    licence: "European Union, CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "GDACS, Global Disaster Alert and Coordination System. © European Union, CC BY 4.0",
    liveUrl: "https://www.gdacs.org/",
    termsUrl: "https://www.gdacs.org/About/termofuse.aspx",
    termsRead: ALERTS_READ,
  },
  "usgs-quakes": {
    id: "usgs-quakes",
    kind: "quakes",
    publisher: "U.S. Geological Survey",
    name: "Earthquakes of magnitude 4.5 and over in the past week",
    covers: "The whole world.",
    host: "earthquake.usgs.gov",
    sends: "Nothing about you or your places: the one feed for the whole world is fetched.",
    licence: "U.S. Public Domain (USGS-authored or produced data and information)",
    licenceUrl: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
    attribution: "Credit: U.S. Geological Survey",
    liveUrl: "https://earthquake.usgs.gov/earthquakes/map/",
    termsUrl: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
    termsRead: NATIONAL_READ,
  },
  meteoalarm: {
    id: "meteoalarm",
    kind: "meteoalarm",
    publisher: "EUMETNET – MeteoAlarm",
    name: "National weather warnings in Europe",
    covers: "38 European countries, one country's feed at a time: the one Home is in, or the one chosen.",
    host: "feeds.meteoalarm.org",
    sends: "The name of the country, as the feed's address; no position.",
    licence: "Terms equivalent to CC BY 4.0, with MeteoAlarm's additional requirements for redistribution",
    licenceUrl: "https://meteoalarm.org/en/live/page/terms-and-conditions",
    attribution: "EUMETNET – MeteoAlarm, with each country's warnings credited to its national meteorological service. www.meteoalarm.org",
    liveUrl: "https://meteoalarm.org/en/live/",
    termsUrl: "https://meteoalarm.org/en/live/page/terms-and-conditions",
    termsRead: ALERTS_READ,
  },
  "nws-alerts": {
    id: "nws-alerts",
    kind: "nws",
    publisher: "US National Weather Service",
    name: "Watches, warnings and advisories in force at Home",
    covers: "The United States and the territories the Weather Service serves.",
    host: "api.weather.gov",
    sends:
      "Home's latitude and longitude, rounded to two decimal places (about a kilometre), and Outpost's name as the User-Agent the service requires.",
    licence: "Public domain (National Weather Service)",
    licenceUrl: "https://www.weather.gov/disclaimer",
    attribution: "National Weather Service, weather.gov",
    liveUrl: "https://www.weather.gov/",
    termsUrl: "https://www.weather.gov/documentation/services-web-api",
    termsRead: ALERTS_READ,
  },
  "eccc-alerts": {
    id: "eccc-alerts",
    kind: "eccc",
    publisher: "Environment and Climate Change Canada",
    name: "Warnings, watches, advisories and statements for the area that holds Home",
    covers: "Canada.",
    host: "api.weather.gc.ca",
    sends: "A box about two kilometres across round Home's latitude and longitude, rounded to two decimal places.",
    licence: "Environment and Climate Change Canada Data Servers End-use Licence",
    licenceUrl: "https://eccc-msc.github.io/open-data/licence/readme_en/",
    attribution:
      "Data Source: Environment and Climate Change Canada. Contains information licenced under the Data Server End-use Licence of Environment and Climate Change Canada",
    liveUrl: "https://weather.gc.ca/warnings/index_e.html",
    termsUrl: "https://eccc-msc.github.io/open-data/usage-policy/readme_en/",
    termsRead: NATIONAL_READ,
  },
  "metservice-alerts": {
    id: "metservice-alerts",
    kind: "metservice",
    publisher: "MetService (Meteorological Service of New Zealand)",
    name: "Severe weather outlooks, watches and warnings for New Zealand",
    covers: "New Zealand.",
    host: "alerts.metservice.com",
    sends: "Nothing about you or your places: the one feed for New Zealand is fetched, then each alert it lists.",
    licence: "Creative Commons BY 4.0, as the feed states",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution:
      "Copyright Meteorological Service of New Zealand Limited, 2026. Licensed under Creative Commons BY 4.0. This information is made freely available by MetService. Despite this, MetService is not associated with, and does not endorse, Outpost or have involvement in how this information is presented",
    liveUrl: "https://www.metservice.com/warnings/home",
    termsUrl: "https://about.metservice.com/our-data-access-policy",
    termsRead: NATIONAL_READ,
  },
  "jma-warnings": {
    id: "jma-warnings",
    kind: "jma",
    publisher: "Japan Meteorological Agency",
    name: "Weather warnings and advisories, the latest from each local office (in Japanese)",
    covers: "Japan.",
    host: "www.data.jma.go.jp",
    sends: "Nothing about you or your places: the one feed for the whole of Japan is fetched.",
    licence: "Public Data License (Version 1.0), compatible with CC BY 4.0",
    licenceUrl: "https://www.jma.go.jp/jma/en/copyright.html",
    attribution:
      "Source: Japan Meteorological Agency website (https://www.data.jma.go.jp/developer/xml/feed/extra_l.xml). Edited: the latest headline from each office is kept",
    liveUrl: "https://www.jma.go.jp/bosai/warning/",
    termsUrl: "https://xml.kishou.go.jp/xmlpull.html",
    termsRead: NATIONAL_READ,
  },
  swpc: {
    id: "swpc",
    kind: "space-weather",
    publisher: "NOAA Space Weather Prediction Center",
    name: "Today's solar flux, sunspot number, K and A indices, and radio blackouts and storms in force",
    covers: "The whole Earth: these are planetary figures, not a place's.",
    host: "services.swpc.noaa.gov",
    sends: "Nothing about you or your places: five small files for the whole Earth are fetched.",
    licence: "Public domain (National Weather Service and NOAA web pages)",
    licenceUrl: "https://www.weather.gov/disclaimer",
    attribution: "NOAA Space Weather Prediction Center, swpc.noaa.gov",
    liveUrl: "https://www.swpc.noaa.gov/",
    termsUrl: "https://www.weather.gov/disclaimer",
    termsRead: ALERTS_READ,
  },
};

/** The space weather files asked for on one press, by name. */
export const SWPC_FILES = {
  scales: "https://services.swpc.noaa.gov/products/noaa-scales.json",
  flux: "https://services.swpc.noaa.gov/products/summary/10cm-flux.json",
  kp: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
  wwv: "https://services.swpc.noaa.gov/text/wwv.txt",
  sunspots: "https://services.swpc.noaa.gov/text/daily-solar-indices.txt",
} as const;

/** How large an answer may be, by source, when it is more than `MAX_ANSWER_BYTES`: a large country's MeteoAlarm feed is about 3 MB. */
export const MAX_BYTES_OF: Partial<Record<WeatherSourceId, number>> = {
  meteoalarm: 12 * 1024 * 1024,
  gdacs: 4 * 1024 * 1024,
  // JMA's long feed lists every message of the past few days: about 4 MB on 22 November 2026.
  "jma-warnings": 16 * 1024 * 1024,
};

/** The most CAP documents fetched from MetService's feed on one press. */
export const MAX_METSERVICE_ALERTS = 40;

/** How far round a place flood warnings are asked for, km. River and sea levels use the distance a person chooses (`weather.riversKm`). */
export const FLOOD_WARNINGS_KM = 15;

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
  /** The level stations within `km`, with each one's scale (its typical range and highest on record): one request. */
  levelStations(lat: number, lon: number, km: number): string {
    const at = position(lat, lon);
    return `https://environment.data.gov.uk/flood-monitoring/id/stations?parameter=level&lat=${at.lat}&long=${at.lon}&dist=${km}&_view=full`;
  },
  /** A measure's latest `count` readings, newest first ("_sorted ... enabling you to fetch the most recent n readings"). */
  latestReadings(measureId: string, count: number): string {
    return `https://environment.data.gov.uk/flood-monitoring/id/measures/${encodeURIComponent(measureId)}/readings?_sorted&_limit=${count}`;
  },
  /** A measure's readings since a moment, up to the Agency's hard limit of 10,000. */
  readingsSince(measureId: string, since: number): string {
    const at = new Date(since).toISOString().replace(/\.\d{3}Z$/, "Z");
    return `https://environment.data.gov.uk/flood-monitoring/id/measures/${encodeURIComponent(measureId)}/readings?since=${at}&_limit=10000`;
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
  /** Every event GDACS calls current, worldwide. */
  gdacs(): string {
    return "https://www.gdacs.org/xml/rss.xml";
  },
  quakes(): string {
    return "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";
  },
  meteoalarm(slug: string): string {
    if (!/^[a-z-]{2,40}$/.test(slug)) throw new AppError("bad_request", "That is not one of MeteoAlarm's countries.");
    return `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${slug}`;
  },
  nws(lat: number, lon: number): string {
    const at = position(lat, lon);
    return `https://api.weather.gov/alerts/active?point=${at.lat},${at.lon}`;
  },
  /** The alerts whose areas meet a box 0.02° across round Home, in English, from MSC GeoMet's OGC API. */
  eccc(lat: number, lon: number): string {
    const at = { lat: roundForSending(lat), lon: roundForSending(lon) };
    const box = [at.lon - 0.01, at.lat - 0.01, at.lon + 0.01, at.lat + 0.01].map((value) => value.toFixed(2)).join(",");
    return `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&lang=en&limit=200&bbox=${box}`;
  },
  metservice(): string {
    return "https://alerts.metservice.com/cap/rss";
  },
  /** JMA's long feed of messages issued at any time ("随時"), updated hourly with the past few days. */
  jma(): string {
    return "https://www.data.jma.go.jp/developer/xml/feed/extra_l.xml";
  },
  solar(lat: number, lon: number): string {
    const at = position(lat, lon);
    return `https://re.jrc.ec.europa.eu/api/v5_3/MRcalc?lat=${at.lat}&lon=${at.lon}&horirrad=1&optrad=1&outputformat=json`;
  },
};

/** What a request sends, in words, for the record kept beside the copy. */
export function sentWords(url: string): string {
  const parsed = new URL(url);
  const point = /^(-?[\d.]+),(-?[\d.]+)$/.exec(parsed.searchParams.get("point") ?? "");
  if (point) return `${parsed.hostname}: latitude ${point[1]}, longitude ${point[2]}`;
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
          headers: {
            accept: "application/json, application/geo+json, application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5",
          },
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
      const limit = MAX_BYTES_OF[source] ?? MAX_ANSWER_BYTES;
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > limit) {
        await response.body?.cancel();
        throw new AppError("upstream", `${WEATHER_SOURCES[source].publisher} sent more than Outpost will keep.`);
      }
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of response.body ?? []) {
        bytes += chunk.byteLength;
        if (bytes > limit) throw new AppError("upstream", `${WEATHER_SOURCES[source].publisher} sent more than Outpost will keep.`);
        chunks.push(chunk);
      }
      return { text: Buffer.concat(chunks).toString("utf8"), bytes };
    },
  };
}
