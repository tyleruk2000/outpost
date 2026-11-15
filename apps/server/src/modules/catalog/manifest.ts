/**
 * Catalogue manifests: JSON files that list content Outpost can fetch and say where it
 * comes from. A manifest never contains content, only a description and a source.
 *
 * The zod schema here is the definition of the format; `catalog/schema/manifest.schema.json`
 * is generated from it (see cli/validate-catalog.ts). Loading is forgiving on purpose:
 * a manifest that does not validate is skipped and reported, and never stops the server.
 */
import fs from "node:fs";
import path from "node:path";
import {
  CATALOG_CATEGORY_SLUGS,
  CATALOG_FORMATS,
  type CatalogManifest,
  type CatalogManifestEntry,
  type CatalogProblem,
} from "@outpost/shared";
import { z } from "zod";

export const MANIFEST_SCHEMA_VERSION = 1;

const hostName = z
  .string()
  .max(253)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/,
    "A download host is a bare lower-case host name such as download.kiwix.org: no scheme, port or path.",
  );

const isoDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Dates are written YYYY-MM-DD.");

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "A SHA-256 checksum is 64 lower-case hexadecimal characters.");

const kiwixSource = z.strictObject({
  type: z.literal("kiwix"),
  /** The book's name in the Kiwix library, e.g. "wikipedia_en_all". */
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\s/?#&]+$/, "A Kiwix book name has no spaces or URL punctuation."),
  /** "maxi", "nopic", "mini" …; the empty string for books published in one edition. */
  flavour: z
    .string()
    .max(50)
    .regex(/^[a-z0-9_-]*$/, "A flavour is a short lower-case word, or empty."),
});

function httpSource(allowInsecureHttp: boolean) {
  return z.strictObject({
    type: z.literal("http"),
    url: z
      .string()
      .max(2000)
      .regex(allowInsecureHttp ? /^https?:\/\/[^\s]+$/ : /^https:\/\/[^\s]+$/, "Download addresses must start with https://"),
    sha256: sha256.optional(),
    sizeBytes: z.number().int().positive().optional(),
    version: z.string().min(1).max(50).optional(),
    published: isoDate.optional(),
  });
}

/**
 * Builds the manifest schema. Plain http addresses are only accepted where the person
 * running the server has allowed downloads from their own network (a local mirror);
 * the published format, and everything in this repository, is https only.
 */
export function createManifestSchema(options: { allowInsecureHttp?: boolean } = {}) {
  const entry = z.strictObject({
    id: z
      .string()
      .min(3)
      .max(120)
      .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "Entry ids are lower-case words joined by dots or hyphens."),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    category: z.enum(CATALOG_CATEGORY_SLUGS),
    publisher: z.string().trim().min(1).max(200),
    language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, "Languages are BCP 47 tags such as en or pt-BR."),
    format: z.enum(CATALOG_FORMATS),
    license: z.string().trim().min(1).max(300),
    licenseNote: z.string().trim().min(1).max(1000).optional(),
    attribution: z.string().trim().min(1).max(500),
    homepage: z
      .string()
      .max(2000)
      .regex(/^https:\/\/[^\s]+$/, "Home pages must start with https://")
      .optional(),
    lastVerified: isoDate,
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    sizeBytes: z.number().int().positive().optional(),
    source: z.discriminatedUnion("type", [kiwixSource, httpSource(options.allowInsecureHttp ?? false)]),
  });

  return z.strictObject({
    $schema: z.string().optional(),
    schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
    id: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "Manifest ids are lower-case words joined by dots or hyphens."),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    maintainers: z.array(z.string().trim().min(1).max(200)),
    downloadHosts: z.array(hostName).min(1),
    entries: z.array(entry),
  });
}

/** The published format: https only. */
export const manifestSchema = createManifestSchema();

export type Manifest = CatalogManifest;
export type ManifestEntry = CatalogManifestEntry;

/** An entry together with the manifest it came from. */
export interface LoadedEntry extends ManifestEntry {
  manifestId: string;
}

export interface LoadedCatalog {
  manifests: Manifest[];
  /** Usable entries, in manifest order; ids are unique. */
  entries: LoadedEntry[];
  problems: CatalogProblem[];
  /** Every host a usable manifest lists, lower-case. */
  downloadHosts: string[];
}

/** The JSON Schema for manifests, as committed in catalog/schema/manifest.schema.json. */
export function manifestJsonSchema(): string {
  const schema = z.toJSONSchema(manifestSchema, { target: "draft-2020-12" });
  const document = {
    ...schema,
    title: "Outpost catalogue manifest",
    description: "A list of content Outpost can download, with where each item comes from. See catalog/README.md.",
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** Turns zod's issues into one sentence a manifest author can act on. */
function describeIssues(error: z.ZodError, raw: unknown): string {
  const entries = Array.isArray((raw as { entries?: unknown })?.entries) ? (raw as { entries: unknown[] }).entries : [];
  const parts = error.issues.slice(0, 5).map((issue) => {
    const [first, index, ...rest] = issue.path;
    if (first === "entries" && typeof index === "number") {
      const id = (entries[index] as { id?: unknown } | undefined)?.id;
      const label = typeof id === "string" ? `entry "${id}"` : `entry number ${index + 1}`;
      return `${label}, ${rest.length ? rest.join(".") : "entry"}: ${issue.message}`;
    }
    return `${issue.path.length ? issue.path.join(".") : "manifest"}: ${issue.message}`;
  });
  const more = error.issues.length - parts.length;
  return `${parts.join("; ")}${more > 0 ? `; and ${more} more` : ""}`;
}

/** Checks that need more than the shape: does the entry's address fit its manifest? */
export function entryProblem(entry: ManifestEntry, manifest: Manifest): string | undefined {
  if (entry.source.type === "kiwix") {
    return entry.format === "zim" ? undefined : `Kiwix books are ZIM archives, but the format is given as "${entry.format}".`;
  }
  let url: URL;
  try {
    url = new URL(entry.source.url);
  } catch {
    return "The download address is not a valid URL.";
  }
  if (url.username || url.password) return "The download address must not contain a user name or password.";
  if (!manifest.downloadHosts.includes(url.hostname.toLowerCase())) {
    return `The download address is on ${url.hostname}, which is not in this manifest's downloadHosts.`;
  }
  return undefined;
}

export interface ParsedManifest {
  manifest?: Manifest;
  /** Why the whole manifest cannot be used. */
  problem?: string;
}

export function parseManifest(text: string, options: { allowInsecureHttp?: boolean } = {}): ParsedManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { problem: `This file is not valid JSON (${(error as Error).message}).` };
  }
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === "number" && version > MANIFEST_SCHEMA_VERSION) {
    return {
      problem: `This manifest uses format version ${version}, which is newer than this version of Outpost understands. Update Outpost to use it.`,
    };
  }
  const parsed = createManifestSchema(options).safeParse(raw);
  if (!parsed.success) return { problem: `This manifest does not follow the format: ${describeIssues(parsed.error, raw)}.` };
  const { $schema: _schema, ...manifest } = parsed.data;
  return { manifest };
}

function jsonFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("."))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch {
    // No such folder: there are simply no manifests there.
    return [];
  }
}

/**
 * Reads every manifest in `dirs`, in order. Earlier files win when an id is used twice,
 * so the manifests shipped with Outpost cannot be shadowed by one added later.
 */
export function loadCatalog(dirs: string[], options: { allowInsecureHttp?: boolean } = {}): LoadedCatalog {
  const catalog: LoadedCatalog = { manifests: [], entries: [], problems: [], downloadHosts: [] };
  const entryOwner = new Map<string, string>();
  const hosts = new Set<string>();

  for (const file of dirs.flatMap(jsonFiles)) {
    const name = path.basename(file);
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (error) {
      catalog.problems.push({ file: name, message: `This file could not be read (${(error as Error).message}).` });
      continue;
    }
    const { manifest, problem } = parseManifest(text, options);
    if (!manifest) {
      catalog.problems.push({ file: name, message: problem! });
      continue;
    }
    if (catalog.manifests.some((other) => other.id === manifest.id)) {
      catalog.problems.push({ file: name, message: `Another manifest already uses the id "${manifest.id}", so this one was skipped.` });
      continue;
    }
    catalog.manifests.push(manifest);
    for (const host of manifest.downloadHosts) hosts.add(host.toLowerCase());

    for (const entry of manifest.entries) {
      const owner = entryOwner.get(entry.id);
      if (owner) {
        catalog.problems.push({
          file: name,
          entryId: entry.id,
          message: `The id "${entry.id}" is already used by an entry in ${owner}; the first one is kept and this one was skipped.`,
        });
        continue;
      }
      const problem = entryProblem(entry, manifest);
      if (problem) {
        catalog.problems.push({ file: name, entryId: entry.id, message: `${problem} The entry was skipped.` });
        continue;
      }
      entryOwner.set(entry.id, name);
      catalog.entries.push({ ...entry, manifestId: manifest.id });
    }
  }
  catalog.downloadHosts = [...hosts].sort();
  return catalog;
}
