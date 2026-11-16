/**
 * Route sources: the servers a person's search for a route may be sent to.
 *
 * They are declared in one file, `route-sources.json` in the catalogue folder, in the
 * way catalogue manifests declare download hosts: a search goes to the host of a
 * declared source and to no other. People running Outpost can declare their own (an
 * Overpass server on their own network, say) in
 * `<data directory>/catalog/routes/route-sources.json`, and choose which is used first.
 *
 * Every source here is an Overpass API server, which answers from OpenStreetMap. The
 * licence and credit of what it returns are therefore OpenStreetMap's, whoever runs
 * the server.
 */
import fs from "node:fs";
import path from "node:path";
import type { Bbox, RouteDataCredit, RouteSourceDto } from "@outpost/shared";
import { z } from "zod";

export const ROUTE_SOURCES_FILE = "route-sources.json";
export const ROUTE_SOURCES_SCHEMA_VERSION = 1;

/** What must be said about anything an Overpass server returns. */
export const OSM_CREDIT: RouteDataCredit = {
  name: "OpenStreetMap",
  attribution: "© OpenStreetMap contributors",
  license: "Open Database Licence (ODbL) 1.0",
  licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
  url: "https://www.openstreetmap.org/copyright",
};

const isoDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Dates are written YYYY-MM-DD.");
const bbox = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .refine(
    ([west, south, east, north]) => west < east && south < north,
    "A box is [west, south, east, north], west of east and south of north.",
  );

function sourceSchema(options: { allowHttp: boolean }) {
  return z.strictObject({
    id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "An id is lower-case words joined by hyphens.")
      .max(60),
    name: z.string().trim().min(1).max(80),
    type: z.literal("overpass", { error: 'The only kind of route source is "overpass".' }),
    /** The interpreter address of the Overpass server: the address a query is posted to. */
    endpoint: z
      .string()
      .max(300)
      .refine(
        (value) => {
          try {
            const url = new URL(value);
            const schemeOk = url.protocol === "https:" || (options.allowHttp && url.protocol === "http:");
            return schemeOk && !url.username && !url.password && !url.search && !url.hash;
          } catch {
            return false;
          }
        },
        options.allowHttp
          ? "The endpoint is a plain http or https address with no credentials, query or fragment."
          : "The endpoint is a plain https address with no credentials, query or fragment.",
      ),
    operator: z.string().trim().min(1).max(200),
    coverage: z.string().trim().min(1).max(120),
    bbox: bbox.nullish(),
    termsUrl: z.url({ protocol: /^https?$/ }).max(300),
    termsNote: z.string().trim().max(1000).optional(),
    lastVerified: isoDate,
  });
}

function fileSchema(options: { allowHttp: boolean }) {
  return z.strictObject({
    $schema: z.string().optional(),
    schemaVersion: z.literal(ROUTE_SOURCES_SCHEMA_VERSION),
    description: z.string().max(2000).optional(),
    /** The source asked first wherever the map is. Without it, a source is chosen by where the map is. */
    defaultSource: z.string().max(60).optional(),
    /** In a person's own file: leave out the sources shipped with Outpost. */
    replaceShipped: z.boolean().optional(),
    sources: z.array(sourceSchema(options)).max(20),
  });
}

/** The published format: https only. A person's own file may also name an http address. */
export const routeSourcesSchema = fileSchema({ allowHttp: false });

export interface RouteSource extends RouteSourceDto {
  endpoint: string;
  /** Host name as the HTTP client's allow-list compares it: lower case, no port. */
  allowHost: string;
}

export interface LoadedRouteSources {
  sources: RouteSource[];
  defaultId: string | null;
  problems: string[];
}

function describe(raw: z.infer<ReturnType<typeof sourceSchema>>): RouteSource {
  const url = new URL(raw.endpoint);
  return {
    id: raw.id,
    name: raw.name,
    host: url.host.toLowerCase(),
    allowHost: url.hostname.replace(/^\[|\]$/g, "").toLowerCase(),
    endpoint: url.toString(),
    operator: raw.operator,
    coverage: raw.coverage,
    bbox: (raw.bbox ?? null) as Bbox | null,
    termsUrl: raw.termsUrl,
    data: OSM_CREDIT,
  };
}

function readFile(file: string, options: { allowHttp: boolean }): { parsed?: z.infer<ReturnType<typeof fileSchema>>; problem?: string } {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    return { problem: `${file} could not be read (${(error as Error).message}).` };
  }
  try {
    return { parsed: fileSchema(options).parse(JSON.parse(text)) };
  } catch (error) {
    const reason = error instanceof z.ZodError ? z.prettifyError(error) : (error as Error).message;
    return { problem: `${file} is not a route source file Outpost can use: ${reason}` };
  }
}

/**
 * Reads the shipped file and then a person's own. Shipped sources come first and
 * cannot be replaced one by one: a second source with an id already taken is skipped
 * and reported. A person's `defaultSource` wins over a shipped one; with none named,
 * the source is chosen search by search from where the map is (`pickRouteSource`).
 */
export function loadRouteSources(config: { catalogDir: string; dataDir: string }): LoadedRouteSources {
  const shipped = readFile(path.join(config.catalogDir, ROUTE_SOURCES_FILE), { allowHttp: false });
  const own = readFile(path.join(config.dataDir, "catalog", "routes", ROUTE_SOURCES_FILE), { allowHttp: true });
  const problems = [shipped.problem, own.problem].filter((problem): problem is string => Boolean(problem));
  const sources: RouteSource[] = [];
  const files = own.parsed?.replaceShipped ? [own.parsed] : [shipped.parsed, own.parsed];
  for (const file of files) {
    for (const raw of file?.sources ?? []) {
      if (sources.some((source) => source.id === raw.id)) {
        problems.push(`Two route sources use the id "${raw.id}"; the second was skipped.`);
        continue;
      }
      sources.push(describe(raw));
    }
  }
  const wanted = [own.parsed?.defaultSource, shipped.parsed?.defaultSource].find((id) => id && sources.some((source) => source.id === id));
  for (const file of [own.parsed, shipped.parsed]) {
    if (file?.defaultSource && !sources.some((source) => source.id === file.defaultSource)) {
      problems.push(`The default route source "${file.defaultSource}" is not one of the declared sources.`);
    }
  }
  return { sources, defaultId: wanted ?? null, problems };
}

export const toSourceDto = ({ endpoint: _endpoint, allowHost: _allowHost, ...dto }: RouteSource): RouteSourceDto => dto;
