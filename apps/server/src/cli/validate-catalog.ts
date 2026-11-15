/**
 * Checks the catalogue manifests in this repository.
 *
 *   node apps/server/src/cli/validate-catalog.ts              offline checks
 *   node apps/server/src/cli/validate-catalog.ts --online     also ask the sources
 *   node apps/server/src/cli/validate-catalog.ts --online --delay 10
 *                                                             seconds between requests to one host (default 10)
 *   node apps/server/src/cli/validate-catalog.ts --write-schema
 *   node apps/server/src/cli/validate-catalog.ts --dir <path-to-catalog-folder>
 *
 * Offline: every manifest follows the format, entry ids are unique, addresses are
 * https and on a host the manifest lists, every file an entry bundles is in
 * catalog/bundled (and nothing else is), and catalog/schema/manifest.schema.json is
 * what the code would generate. Online: every entry still resolves at its source.
 * Several publishers ask automated clients to wait ten seconds between requests, so the
 * online check asks one host at a time at that pace; with the shipped catalogue it
 * takes a couple of minutes.
 * Exits with 1 when anything is wrong, so it can gate a pull request.
 */
import fs from "node:fs";
import path from "node:path";
import { createHttpClient } from "../core/http.ts";
import { defaultCatalogDir } from "../core/paths.ts";
import { KIWIX_CATALOG_URL } from "../modules/catalog/kiwix.ts";
import { bundledDirFor, type LoadedCatalog, loadCatalog, manifestJsonSchema } from "../modules/catalog/manifest.ts";
import { type EntryResolution, resolveEntries } from "../modules/catalog/resolve.ts";

export interface CatalogValidation {
  manifests: number;
  entries: number;
  /** One line per problem, already worded for a person. */
  problems: string[];
  catalog: LoadedCatalog;
}

export const schemaPath = (catalogDir: string) => path.join(catalogDir, "schema", "manifest.schema.json");

/** Hosts a manifest with Kiwix entries must list: the library's feed and its download service. */
const KIWIX_REQUIRED_HOSTS = [new URL(KIWIX_CATALOG_URL).hostname, "lb.download.kiwix.org"];

/** Every file under `dir`, as paths relative to it with forward slashes. Hidden files are skipped. */
function filesUnder(dir: string, prefix = ""): string[] {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return names
    .filter((item) => !item.name.startsWith("."))
    .flatMap((item) =>
      item.isDirectory() ? filesUnder(path.join(dir, item.name), `${prefix}${item.name}/`) : item.isFile() ? [`${prefix}${item.name}`] : [],
    )
    .sort();
}

/**
 * What a file that ships with Outpost must be, beyond existing: text a person can read
 * and search, opening with its title, and carrying an edition so a corrected copy in a
 * later release is offered as an update.
 */
function bundledProblems(catalog: LoadedCatalog, bundledDir: string): string[] {
  const problems: string[] = [];
  const listed = new Set<string>();
  for (const entry of catalog.entries) {
    if (entry.source.type !== "bundled") continue;
    const label = `${entry.manifestId} (${entry.id})`;
    listed.add(entry.source.file);
    if (!entry.source.version) {
      problems.push(`${label}: a bundled entry needs a "version", so that a corrected file in a later release is offered as an update.`);
    }
    const file = catalog.bundled.get(entry.id);
    if (!file || entry.format !== "markdown") continue;
    const bytes = fs.readFileSync(file.path);
    let text: string;
    try {
      if (bytes.includes(0)) throw new Error("NUL byte");
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      problems.push(`${label}: ${entry.source.file} is not UTF-8 text, so the library would refuse it.`);
      continue;
    }
    if (!/^# \S/.test(text)) problems.push(`${label}: ${entry.source.file} should open with its title as a level-one heading ("# Title").`);
  }
  for (const file of filesUnder(bundledDir)) {
    if (!listed.has(file)) problems.push(`bundled/${file} is not listed by any manifest, so nobody could add it. List it or remove it.`);
  }
  return problems;
}

/** Everything that can be checked without a connection. */
export function validateCatalog(catalogDir: string = defaultCatalogDir, options: { checkSchemaFile?: boolean } = {}): CatalogValidation {
  const manifestsDir = path.join(catalogDir, "manifests");
  const catalog = loadCatalog([manifestsDir]);
  const problems = catalog.problems.map(
    (problem) => `${problem.file}${problem.entryId ? ` (${problem.entryId})` : ""}: ${problem.message}`,
  );
  if (catalog.manifests.length === 0 && problems.length === 0) problems.push(`No manifests were found in ${manifestsDir}.`);

  const seenBooks = new Map<string, string>();
  for (const manifest of catalog.manifests) {
    const kiwixEntries = manifest.entries.filter((entry) => entry.source.type === "kiwix");
    if (kiwixEntries.length > 0) {
      for (const host of KIWIX_REQUIRED_HOSTS) {
        if (!manifest.downloadHosts.includes(host)) {
          problems.push(`${manifest.id}: has Kiwix entries but does not list ${host} in downloadHosts, so they could not be fetched.`);
        }
      }
    }
    for (const entry of manifest.entries) {
      if (entry.source.type === "kiwix") {
        const key = `${entry.source.name}|${entry.source.flavour}`;
        const other = seenBooks.get(key);
        if (other) problems.push(`${manifest.id} (${entry.id}): the same Kiwix book and flavour is already listed as "${other}".`);
        else seenBooks.set(key, entry.id);
      } else if (
        entry.source.type === "http" &&
        /\.zim$/i.test(new URL(entry.source.url).pathname) &&
        /(^|\.)kiwix\.org$/.test(new URL(entry.source.url).hostname)
      ) {
        problems.push(
          `${manifest.id} (${entry.id}): points straight at a ZIM file on kiwix.org. Those addresses change with every build; use a "kiwix" source with the book's name instead.`,
        );
      }
    }
  }

  problems.push(...bundledProblems(catalog, bundledDirFor(manifestsDir)));

  if (options.checkSchemaFile ?? true) {
    const file = schemaPath(catalogDir);
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
    if (current === undefined) problems.push(`${file} is missing. Run this command with --write-schema.`);
    else if (current !== manifestJsonSchema()) {
      problems.push(`${file} is out of date with the format in the code. Run this command with --write-schema.`);
    }
  }
  return { manifests: catalog.manifests.length, entries: catalog.entries.length, problems, catalog };
}

export interface OnlineValidation {
  resolved: number;
  results: Map<string, EntryResolution>;
  problems: string[];
}

/** Asks each source whether it still has what the manifests list. Needs a connection. */
export async function validateOnline(catalog: LoadedCatalog, options: { hostIntervalMs?: number } = {}): Promise<OnlineValidation> {
  const hostIntervalMs = options.hostIntervalMs ?? 10_000;
  // Long enough for the busiest host at the chosen pace, with room to spare.
  const perHost = new Map<string, number>();
  for (const entry of catalog.entries) {
    if (entry.source.type !== "http") continue;
    const host = new URL(entry.source.url).host;
    perHost.set(host, (perHost.get(host) ?? 0) + 1);
  }
  const busiest = Math.max(0, ...perHost.values());
  const http = createHttpClient({ allowPrivate: false });
  try {
    const results = await resolveEntries(http, catalog.entries, {
      allowedHosts: catalog.downloadHosts,
      hostIntervalMs,
      signal: AbortSignal.timeout(180_000 + busiest * (hostIntervalMs + 30_000)),
    });
    const problems: string[] = [];
    let resolved = 0;
    for (const entry of catalog.entries) {
      const result = results.get(entry.id);
      if (result?.state === "available") resolved += 1;
      else problems.push(`${entry.id}: ${result ? result.reason : "was not checked."}`);
    }
    return { resolved, results, problems };
  } finally {
    await http.close();
  }
}

async function main(argv: string[]): Promise<number> {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const dirIndex = argv.indexOf("--dir");
  const catalogDir = dirIndex >= 0 && argv[dirIndex + 1] ? path.resolve(argv[dirIndex + 1]!) : defaultCatalogDir;

  if (flags.has("--write-schema")) {
    const file = schemaPath(catalogDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, manifestJsonSchema());
    console.log(`Wrote ${file}`);
  }

  const offline = validateCatalog(catalogDir);
  console.log(`${offline.manifests} manifest${offline.manifests === 1 ? "" : "s"}, ${offline.entries} usable entries in ${catalogDir}`);
  const problems = [...offline.problems];

  if (flags.has("--online")) {
    try {
      const delayIndex = argv.indexOf("--delay");
      const delaySeconds = delayIndex >= 0 ? Number(argv[delayIndex + 1]) : 10;
      if (!Number.isFinite(delaySeconds) || delaySeconds < 0) throw new Error("--delay takes a number of seconds, for example --delay 10");
      const online = await validateOnline(offline.catalog, { hostIntervalMs: delaySeconds * 1000 });
      console.log(`${online.resolved} of ${offline.entries} entries resolve at their source.`);
      problems.push(...online.problems);
    } catch (error) {
      const cause = (error as { cause?: Error }).cause;
      problems.push(`The online check could not run: ${(error as Error).message}${cause ? ` (${cause.message})` : ""}`);
    }
  }

  for (const problem of problems) console.error(`  problem: ${problem}`);
  console.log(problems.length === 0 ? "The catalogue is valid." : `${problems.length} problem${problems.length === 1 ? "" : "s"} found.`);
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
