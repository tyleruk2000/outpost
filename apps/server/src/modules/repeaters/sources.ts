/**
 * Repeater sources: where a list of repeaters can be had, country by country, and
 * what Outpost may do about each.
 *
 * They are declared in one file, `repeater-sources.json` in the catalogue folder, in
 * the way catalogue manifests declare download hosts and `route-sources.json` declares
 * route servers: Outpost fetches a list from the address a source of kind `fetch`
 * names, and from nowhere else. People running Outpost can declare their own (a copy of
 * a list on their own network, say), or change what is shipped, in
 * `<data directory>/catalog/repeaters/repeater-sources.json`.
 *
 * A source says which of three things is true of its publisher, with the reason and
 * the terms as they were read (see docs/sources.md for the reading):
 *
 * - `fetch`: it offers a data file, and nothing in its terms or robots.txt forbids an
 *   application fetching that file when a person asks;
 * - `link`: it offers files, but an application may not fetch them, or its terms could
 *   not be established, so the person downloads the file and imports it;
 * - `none`: there is nothing usable.
 *
 * Nothing in this file makes a request. `fetch.ts` does that, for one source, when a
 * person presses the button.
 */
import fs from "node:fs";
import path from "node:path";
import { REPEATER_SOURCE_KINDS, type RepeaterSourceDto, type RepeaterSourceRegion } from "@outpost/shared";
import { z } from "zod";

export const REPEATER_SOURCES_FILE = "repeater-sources.json";
export const REPEATER_SOURCES_SCHEMA_VERSION = 1;

/**
 * The shortest time between two requests to one host, for any source shipped with
 * Outpost and for any that does not say. A list changes in days, not seconds, and ten
 * seconds is the longest wait any publisher that was read asks of a client. A person's
 * own file may say less, for a server of their own.
 */
export const MIN_WAIT_SECONDS = 10;

const isoDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Dates are written YYYY-MM-DD.");
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "An id is lower-case words joined by hyphens.")
  .max(60);
const bbox = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .refine(([, south, , north]) => south < north, "A box is [west, south, east, north], south of north.");
const webAddress = z.url({ protocol: /^https?$/ }).max(400);

function fileAddress(options: { allowHttp: boolean }) {
  return z
    .string()
    .max(400)
    .refine(
      (value) => {
        try {
          const url = new URL(value);
          const schemeOk = url.protocol === "https:" || (options.allowHttp && url.protocol === "http:");
          return schemeOk && !url.username && !url.password && !url.hash;
        } catch {
          return false;
        }
      },
      options.allowHttp
        ? "The address of the file is a plain http or https address with no credentials or fragment."
        : "The address of the file is a plain https address with no credentials or fragment.",
    );
}

function sourceSchema(options: { allowHttp: boolean }) {
  return z
    .strictObject({
      id: slug,
      region: slug,
      publisher: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(120),
      covers: z.string().trim().min(1).max(400),
      /** The publisher's page for people: where the list is offered, opened in the browser. */
      pageUrl: webAddress,
      kind: z.enum(REPEATER_SOURCE_KINDS),
      /** Why it is that kind. */
      why: z.string().trim().min(1).max(700),
      /** Where the terms were read, what they say in short, and the day they were read. */
      termsUrl: webAddress,
      termsNote: z.string().trim().min(1).max(1200),
      termsRead: isoDate,
      /** What the publisher asks to be said about its data. */
      attribution: z.string().trim().max(200).optional(),
      /** For `fetch`: the file, and the seconds to leave between two requests to its host (a stated crawl delay, or longer). */
      fetch: z
        .strictObject({
          url: fileAddress(options),
          waitSeconds: z
            .number()
            .min(options.allowHttp ? 0 : MIN_WAIT_SECONDS, `A shipped source leaves at least ${MIN_WAIT_SECONDS} seconds between requests.`)
            .max(86_400)
            .optional(),
        })
        .optional(),
      /** For `link`: what to do, one step to a line. */
      steps: z.array(z.string().trim().min(1).max(400)).max(8).optional(),
    })
    .superRefine((source, context) => {
      if (source.kind === "fetch" && !source.fetch) {
        context.addIssue({ code: "custom", message: 'A source of kind "fetch" names the file to fetch.', path: ["fetch"] });
      }
      if (source.kind !== "fetch" && source.fetch) {
        context.addIssue({ code: "custom", message: 'Only a source of kind "fetch" may name a file to fetch.', path: ["fetch"] });
      }
      if (source.kind === "link" && !(source.steps && source.steps.length > 0)) {
        context.addIssue({ code: "custom", message: 'A source of kind "link" says how to get the file by hand.', path: ["steps"] });
      }
    });
}

function fileSchema(options: { allowHttp: boolean }) {
  return z.strictObject({
    $schema: z.string().optional(),
    schemaVersion: z.literal(REPEATER_SOURCES_SCHEMA_VERSION),
    description: z.string().max(3000).optional(),
    /** In a person's own file: leave out the sources shipped with Outpost. */
    replaceShipped: z.boolean().optional(),
    regions: z
      .array(z.strictObject({ id: slug, name: z.string().trim().min(1).max(80), bbox: bbox.nullish() }))
      .max(300)
      .optional(),
    sources: z.array(sourceSchema(options)).max(500),
  });
}

/** The published format: https only. A person's own file may also name an http address. */
export const repeaterSourcesSchema = fileSchema({ allowHttp: false });

export interface RepeaterSource extends Omit<RepeaterSourceDto, "held"> {
  /** Host name as the HTTP client's allow-list compares it: lower case, no port. Null unless the kind is `fetch`. */
  allowHost: string | null;
}

export interface LoadedRepeaterSources {
  regions: RepeaterSourceRegion[];
  sources: RepeaterSource[];
  problems: string[];
}

type RawFile = z.infer<ReturnType<typeof fileSchema>>;

function describe(raw: RawFile["sources"][number]): RepeaterSource {
  const file = raw.fetch ? new URL(raw.fetch.url) : null;
  return {
    id: raw.id,
    region: raw.region,
    publisher: raw.publisher,
    name: raw.name,
    covers: raw.covers,
    pageUrl: raw.pageUrl,
    kind: raw.kind,
    why: raw.why,
    termsUrl: raw.termsUrl,
    termsNote: raw.termsNote,
    termsRead: raw.termsRead,
    attribution: raw.attribution ?? "",
    fetch:
      raw.fetch && file
        ? { host: file.host.toLowerCase(), url: file.toString(), waitSeconds: raw.fetch.waitSeconds ?? MIN_WAIT_SECONDS }
        : null,
    steps: raw.steps ?? [],
    allowHost: file ? file.hostname.replace(/^\[|\]$/g, "").toLowerCase() : null,
  };
}

function readFile(file: string, options: { allowHttp: boolean }): { parsed?: RawFile; problem?: string } {
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
    return { problem: `${file} is not a repeater source file Outpost can use: ${reason}` };
  }
}

/**
 * Reads the shipped file and then a person's own. A person's source with the id of a
 * shipped one takes its place: that is how an administrator changes what Outpost does
 * with a publisher (from `fetch` to `link`, say) without editing what was shipped.
 * Regions are joined the same way. A source whose region is not declared is reported
 * and left out.
 */
export function loadRepeaterSources(config: { catalogDir: string; dataDir: string }): LoadedRepeaterSources {
  const shipped = readFile(path.join(config.catalogDir, REPEATER_SOURCES_FILE), { allowHttp: false });
  const own = readFile(path.join(config.dataDir, "catalog", "repeaters", REPEATER_SOURCES_FILE), { allowHttp: true });
  const problems = [shipped.problem, own.problem].filter((problem): problem is string => Boolean(problem));
  const files = own.parsed?.replaceShipped ? [own.parsed] : [shipped.parsed, own.parsed];

  const regions = new Map<string, RepeaterSourceRegion>();
  const sources = new Map<string, RepeaterSource>();
  for (const file of files) {
    for (const region of file?.regions ?? []) {
      regions.set(region.id, { id: region.id, name: region.name, bbox: (region.bbox ?? null) as RepeaterSourceRegion["bbox"] });
    }
    const seen = new Set<string>();
    for (const raw of file?.sources ?? []) {
      if (seen.has(raw.id)) {
        problems.push(`Two repeater sources in one file use the id "${raw.id}"; the second was skipped.`);
        continue;
      }
      seen.add(raw.id);
      sources.set(raw.id, describe(raw));
    }
  }
  const kept: RepeaterSource[] = [];
  for (const source of sources.values()) {
    if (!regions.has(source.region)) {
      problems.push(`The repeater source "${source.id}" names the region "${source.region}", which is not declared; it was left out.`);
      continue;
    }
    kept.push(source);
  }
  // Only regions that have a source are of any use to a person.
  const used = new Set(kept.map((source) => source.region));
  return { regions: [...regions.values()].filter((region) => used.has(region.id)), sources: kept, problems };
}
