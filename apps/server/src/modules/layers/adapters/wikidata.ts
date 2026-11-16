/**
 * Wikidata: nuclear power stations and research reactors that have a position, asked
 * for with one query on a press. CC0. The query service asks for a User-Agent with a way
 * to reach the project, and allows a minute of work a minute; one small query is far
 * inside that.
 *
 * That User-Agent is `PROJECT_CLIENT_NAME`: the application, its version and the
 * project's web address. The owner agreed to it being sent on 16 November 2026 on the
 * condition that it is clear to the person first, since not everyone will be comfortable
 * with it: the provider carries the name (`clientName`), the screen shows it and asks for
 * a tick, and the service refuses an estimate (the first contact) without that agreement.
 */

import fs from "node:fs";
import type { ReferenceEstimateItem } from "@outpost/shared";
import { AppError } from "../../../core/errors.ts";
import { PermanentJobError } from "../../../core/jobs.ts";
import { boxOfCountries } from "../countries.ts";
import { checkDegrees } from "../crs.ts";
import { PROVIDERS } from "../providers.ts";
import type { QuerySpec } from "../query-fetcher.ts";
import { QUERY_FETCHER } from "../query-fetcher.ts";
import type { AdapterDeps, ReferenceAdapter } from "../types.ts";
import { fetchText, REFERENCE_USER_AGENT } from "./http.ts";
import { cleanText } from "./osm-tags.ts";

export const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";

/** Nuclear power plant, research reactor; verified on wikidata.org on 16 November 2026. */
const CLASSES: Array<[string, string]> = [
  ["Q134447", "wikidata:nuclear-power-plant"],
  ["Q1438105", "wikidata:research-reactor"],
];
const provider = PROVIDERS.find((entry) => entry.id === "wikidata")!;

function countryFilter(countries: string[]): string {
  const codes = countries.filter((code) => /^[A-Z]{2}$/.test(code));
  return codes.length > 0
    ? `VALUES ?iso { ${codes.map((code) => `"${code}"`).join(" ")} } ?item wdt:P17 ?country . ?country wdt:P297 ?iso .`
    : "";
}

export function wikidataQuery(countries: string[]): string {
  const filter = countryFilter(countries);
  return `SELECT ?item ?itemLabel ?kind ?coord ?precision ?iso ?operatorLabel ?stateLabel ?start ?end WHERE {
  VALUES (?class ?kind) { ${CLASSES.map(([q, kind]) => `(wd:${q} "${kind}")`).join(" ")} }
  ?item wdt:P31/wdt:P279* ?class .
  ?item p:P625 ?cs . ?cs ps:P625 ?coord .
  OPTIONAL { ?cs psv:P625/wikibase:geoPrecision ?precision }
  ${filter || "OPTIONAL { ?item wdt:P17 ?country . ?country wdt:P297 ?iso . }"}
  OPTIONAL { ?item wdt:P137 ?operator }
  OPTIONAL { ?item wdt:P5817 ?state }
  OPTIONAL { ?item wdt:P729 ?start }
  OPTIONAL { ?item wdt:P730 ?end }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}`;
}

export function wikidataCountQuery(countries: string[]): string {
  return `SELECT (COUNT(DISTINCT ?item) AS ?n) WHERE {
  VALUES ?class { ${CLASSES.map(([q]) => `wd:${q}`).join(" ")} }
  ?item wdt:P31/wdt:P279* ?class . ?item wdt:P625 ?coord .
  ${countryFilter(countries)}
}`;
}

const urlOf = (query: string) => `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(query)}`;

interface Binding {
  [name: string]: { type: string; value: string } | undefined;
}

export function createWikidataAdapter({ client }: AdapterDeps): ReferenceAdapter {
  return {
    provider,
    async estimate(request, signal) {
      const countries = request.scope.countries ?? [];
      const text = await fetchText(client, urlOf(wikidataCountQuery(countries)), {
        max: 64_000,
        signal,
        headers: { "user-agent": REFERENCE_USER_AGENT, accept: "application/sparql-results+json" },
      });
      let records: number | null = null;
      try {
        const value = (JSON.parse(text) as { results: { bindings: Binding[] } }).results.bindings[0]?.n?.value;
        records = value !== undefined ? Number(value) : null;
      } catch {
        throw new AppError("upstream", "Wikidata's query service answered with something that is not a query result.");
      }
      const item: ReferenceEstimateItem = {
        key: "wikidata-nuclear",
        title: `Nuclear power stations and research reactors (Wikidata)${countries.length ? `: ${countries.join(", ")}` : ", world"}`,
        layers: ["nuclear"],
        bytes: Math.max(2_000, (records ?? 0) * 900),
        exact: false,
        basis: `Worked out from the number of items Wikidata counted (${records ?? "unknown"}), at about 900 bytes each.`,
        records,
        host: new URL(WIKIDATA_SPARQL).host,
        replaces: null,
      };
      return { items: [item], notes: [] };
    },
    download(request, item) {
      const countries = request.scope.countries ?? [];
      const query: QuerySpec = {
        method: "GET",
        url: urlOf(wikidataQuery(countries)),
        accept: "application/sparql-results+json",
        maxBytes: 32 * 1048576,
      };
      return {
        url: WIKIDATA_SPARQL,
        fetcher: QUERY_FETCHER,
        relPath: `collections/reference/wikidata/nuclear-${countries.join("-").toLowerCase() || "world"}-${new Date().toISOString().slice(0, 10)}.json`,
        sizeBytes: item.bytes,
        allowedHosts: [new URL(WIKIDATA_SPARQL).hostname],
        meta: { sourceUrl: "https://www.wikidata.org", query } as never,
      };
    },
    async read({ filePath, meta, sink, retrievedAt }) {
      let bindings: Binding[];
      try {
        bindings = (JSON.parse(await fs.promises.readFile(filePath, "utf8")) as { results: { bindings: Binding[] } }).results.bindings;
        if (!Array.isArray(bindings)) throw new Error("no bindings");
      } catch {
        throw new PermanentJobError("The answer from Wikidata is not a query result. Remove the download and fetch it again.");
      }
      // One row per item, operator and state: gathered into one feature per item.
      const items = new Map<
        string,
        {
          label: string;
          kind: string;
          lon: number;
          lat: number;
          precision: number | null;
          iso: string | null;
          operators: Set<string>;
          states: Set<string>;
          start: string;
          end: string;
        }
      >();
      for (const row of bindings) {
        const uri = row.item?.value ?? "";
        const id = /\/entity\/(Q\d+)$/.exec(uri)?.[1];
        const coord = /^Point\(([-\d.eE]+) ([-\d.eE]+)\)$/.exec(row.coord?.value ?? "");
        if (!id || !coord) {
          sink.skip(`An item without a usable id or position (${cleanText(uri, 80)}) was left out.`);
          continue;
        }
        const lon = Number(coord[1]);
        const lat = Number(coord[2]);
        const problem = checkDegrees(lon, lat);
        if (problem) {
          sink.skip(`${id}: ${problem}.`);
          continue;
        }
        const known = items.get(id);
        const entry = known ?? {
          label: cleanText(row.itemLabel?.value) || id,
          kind: row.kind?.value ?? "wikidata:nuclear-power-plant",
          lon,
          lat,
          precision: row.precision ? Number(row.precision.value) : null,
          iso: row.iso?.value?.toUpperCase() ?? null,
          operators: new Set<string>(),
          states: new Set<string>(),
          start: (row.start?.value ?? "").slice(0, 10),
          end: (row.end?.value ?? "").slice(0, 10),
        };
        // A power station is also a reactor's subclass in places; the power station wins.
        if (known && row.kind?.value === "wikidata:nuclear-power-plant") entry.kind = row.kind.value;
        if (row.operatorLabel?.value) entry.operators.add(cleanText(row.operatorLabel.value));
        if (row.stateLabel?.value) entry.states.add(cleanText(row.stateLabel.value));
        items.set(id, entry);
      }
      const day = new Date(retrievedAt).toISOString().slice(0, 10);
      for (const [id, item] of items) {
        const props: Record<string, string> = { wikidata: id };
        if (item.operators.size) props.operator = [...item.operators].join("; ");
        if (item.states.size) props.state_of_use = [...item.states].join("; ");
        if (item.start) props.service_entry = item.start;
        if (item.end) props.service_retirement = item.end;
        const metres = item.precision && Number.isFinite(item.precision) ? Math.round(item.precision * 111_000) : null;
        await sink.add({
          sourceId: id,
          layer: "nuclear",
          kind: item.kind,
          name: /^Q\d+$/.test(item.label) ? "" : item.label,
          altNames: id,
          country: item.iso,
          lat: item.lat,
          lon: item.lon,
          bbox: null,
          geometry: null,
          props,
          provenance: "public-infrastructure",
          accuracy: metres
            ? `Wikidata's coordinate location, given to about ${metres.toLocaleString("en-GB")} m`
            : "Wikidata's coordinate location",
          accuracyMeters: metres,
          publisher: provider.publisher,
          license: provider.license,
          sourceUrl: `https://www.wikidata.org/wiki/${id}`,
          publishedAt: `Data as queried on ${day}`,
        });
      }
      return { version: day, publishedAt: day, countries: meta.countries, bbox: boxOfCountries(meta.countries) };
    },
  };
}
