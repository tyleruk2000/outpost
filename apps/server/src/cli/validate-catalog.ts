/**
 * Checks the catalogue manifests in this repository.
 *
 *   node apps/server/src/cli/validate-catalog.ts              offline checks
 *   node apps/server/src/cli/validate-catalog.ts --online     also ask the sources
 *   node apps/server/src/cli/validate-catalog.ts --write-schema
 *   node apps/server/src/cli/validate-catalog.ts --dir <path-to-catalog-folder>
 *
 * Offline: every manifest follows the format, entry ids are unique, addresses are
 * https and on a host the manifest lists, and catalog/schema/manifest.schema.json is
 * what the code would generate. Online: every entry still resolves at its source.
 * Exits with 1 when anything is wrong, so it can gate a pull request.
 */
import fs from "node:fs";
import path from "node:path";
import { createHttpClient } from "../core/http.ts";
import { defaultCatalogDir } from "../core/paths.ts";
import { KIWIX_CATALOG_URL } from "../modules/catalog/kiwix.ts";
import { type LoadedCatalog, loadCatalog, manifestJsonSchema } from "../modules/catalog/manifest.ts";
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
      } else if (/\.zim$/i.test(new URL(entry.source.url).pathname) && /(^|\.)kiwix\.org$/.test(new URL(entry.source.url).hostname)) {
        problems.push(
          `${manifest.id} (${entry.id}): points straight at a ZIM file on kiwix.org. Those addresses change with every build; use a "kiwix" source with the book's name instead.`,
        );
      }
    }
  }

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
export async function validateOnline(catalog: LoadedCatalog): Promise<OnlineValidation> {
  const http = createHttpClient({ allowPrivate: false });
  try {
    const results = await resolveEntries(http, catalog.entries, {
      allowedHosts: catalog.downloadHosts,
      signal: AbortSignal.timeout(180_000),
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
      const online = await validateOnline(offline.catalog);
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
