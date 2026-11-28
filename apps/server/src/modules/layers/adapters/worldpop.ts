/**
 * WorldPop's population counts, one country at a time: the 2020 estimate at 30 arc-seconds,
 * unconstrained, with country totals adjusted to the United Nations' (DOI
 * 10.5258/SOTON/WP00671). CC BY 4.0, with the citation WorldPop asks for. No features are
 * made; the grid is read into the population service (population.ts).
 */
import { AppError } from "../../../core/errors.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { countryOf } from "../countries.ts";
import type { PopulationMeta, PopulationService } from "../population.ts";
import { PROVIDERS } from "../providers.ts";
import type { AdapterDeps, EstimatedItem, ReferenceAdapter } from "../types.ts";
import { headSize } from "./http.ts";

export const WORLDPOP_YEAR = 2020;
export const WORLDPOP_PRODUCT = "Population counts, 1 km, unconstrained, UN-adjusted";
export const WORLDPOP_CITATION =
  "WorldPop (www.worldpop.org - School of Geography and Environmental Science, University of Southampton; Department of Geography and Geosciences, University of Louisville; Departement de Geographie, Universite de Namur) and Center for International Earth Science Information Network (CIESIN), Columbia University (2018). Global High Resolution Population Denominators Project - Funded by The Bill and Melinda Gates Foundation (OPP1134076). https://dx.doi.org/10.5258/SOTON/WP00671";

export const worldPopUrl = (iso3: string) =>
  `https://data.worldpop.org/GIS/Population/Global_2000_2020_1km_UNadj/${WORLDPOP_YEAR}/${iso3.toUpperCase()}/${iso3.toLowerCase()}_ppp_${WORLDPOP_YEAR}_1km_Aggregated_UNadj.tif`;

const provider = PROVIDERS.find((entry) => entry.id === "worldpop")!;

export function createWorldPopAdapter({ client }: AdapterDeps, population: PopulationService): ReferenceAdapter {
  return {
    provider,
    async estimate(request, signal) {
      const countries = request.scope.countries ?? [];
      if (countries.length === 0) throw new AppError("bad_request", "WorldPop's grids are by country: choose one or more.");
      if (countries.length > 10) throw new AppError("bad_request", "Choose at most ten countries at a time.");
      const items: EstimatedItem[] = [];
      for (const code of countries) {
        const country = countryOf(code);
        if (!country) throw new AppError("bad_request", `${code} is not a country Outpost knows.`);
        const url = worldPopUrl(country.iso3);
        const head = await headSize(client, url, signal);
        items.push({
          key: `worldpop:${country.code}`,
          title: `Population, ${country.name}, ${WORLDPOP_YEAR} (WorldPop, 1 km)`,
          layers: [],
          bytes: head.bytes ?? 0,
          exact: head.bytes !== null,
          basis: "The size WorldPop's server gives for the file.",
          records: null,
          host: new URL(url).host,
          replaces: null,
          extra: { iso3: country.iso3, code: country.code, name: country.name },
        });
      }
      return {
        items,
        notes: ["Modelled estimates of where people lived in 2020, not a census count. WorldPop publishes no checksum for these files."],
      };
    },
    download(_request, item) {
      const iso3 = item.extra?.iso3;
      if (!iso3) throw new AppError("bad_request", "Estimate again before downloading.");
      const url = worldPopUrl(iso3);
      return {
        url,
        relPath: `collections/reference/worldpop/${iso3.toLowerCase()}_ppp_${WORLDPOP_YEAR}_1km_Aggregated_UNadj.tif`,
        sizeBytes: item.bytes || undefined,
        allowedHosts: [new URL(url).hostname],
        meta: {
          sourceUrl: "https://hub.worldpop.org/geodata/summary?id=37315",
          countries: [item.extra?.code ?? ""],
          bbox: countryOf(item.extra?.code ?? "")?.bbox ?? null,
          options: { iso3, country: item.extra?.name ?? iso3 },
        },
      };
    },
    async read({ filePath, meta, signal, progress }) {
      const iso3 = meta.options?.iso3;
      if (!iso3) throw new PermanentJobError("This download does not say which country's grid it is.");
      const info: PopulationMeta = {
        iso3,
        country: meta.options?.country ?? iso3,
        year: WORLDPOP_YEAR,
        product: WORLDPOP_PRODUCT,
        citation: WORLDPOP_CITATION,
      };
      const key = meta.options?.sidecar;
      if (!key) throw new PermanentJobError("This download does not say where its grid goes.");
      const { bbox, total } = await population.install(filePath, key, info, signal, (done, all) =>
        progress(done, all, "Reading the population grid", "tiles"),
      );
      return {
        version: String(WORLDPOP_YEAR),
        publishedAt: "2020 estimate, released 2018–2020",
        countries: meta.countries,
        bbox,
        extra: { population: info, totalPeople: Math.round(total) },
      };
    },
  };
}
