/**
 * Packs: named, curated lists of things that are already in the catalogue.
 *
 * A pack holds nothing itself. It answers "where do I start?" by gathering the usual
 * things for a purpose (a household riding out a power cut, a walker, a radio operator),
 * so that they can be fetched together. Everything in a pack is an ordinary catalogue
 * entry, with its own source, licence and checksum.
 *
 * Packs ship in `<catalog>/packs.json`; a person can add their own in
 * `<data>/catalog/packs.json`.
 */
import fs from "node:fs";
import path from "node:path";
import type { CatalogPack, CatalogProblem } from "@outpost/shared";
import { z } from "zod";

const packSchema = z.strictObject({
  id: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Pack ids are lower-case words joined by hyphens."),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(600),
  entries: z.array(z.string().min(1).max(120)).min(1).max(100),
  /** Where a pack is for one country or a few (its weather, its radio rules): ISO codes. Explore offers it first there, and lists it among the rest elsewhere. */
  countries: z
    .array(z.string().regex(/^[A-Z]{2}$/, "Countries are two-letter ISO codes in capitals, such as GB."))
    .max(20)
    .optional(),
});

const fileSchema = z.strictObject({
  $schema: z.string().optional(),
  schemaVersion: z.literal(1),
  packs: z.array(packSchema).max(100),
});

export interface LoadedPacks {
  packs: CatalogPack[];
  problems: CatalogProblem[];
}

/**
 * Reads packs from each file that exists. A pack keeps the entries the catalogue lists
 * and drops the rest with a note; a file that cannot be read is skipped whole. Nothing
 * here stops the catalogue itself from working.
 */
export function loadPacks(files: string[], knownEntries: ReadonlySet<string>): LoadedPacks {
  const packs: CatalogPack[] = [];
  const problems: CatalogProblem[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const label = path.basename(file);
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue; // No such file: packs are optional.
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      problems.push({ file: label, message: `This file is not valid JSON (${(error as Error).message}).` });
      continue;
    }
    const parsed = fileSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      problems.push({
        file: label,
        message: `This is not a packs file: ${issue ? `${issue.path.join(".") || "the file"}: ${issue.message}` : "it has the wrong shape"}.`,
      });
      continue;
    }
    for (const pack of parsed.data.packs) {
      if (seen.has(pack.id)) {
        problems.push({ file: label, message: `There is already a pack with the id "${pack.id}"; this one was skipped.` });
        continue;
      }
      const entryIds = [...new Set(pack.entries)].filter((id) => knownEntries.has(id));
      const missing = pack.entries.filter((id) => !knownEntries.has(id));
      if (missing.length > 0) {
        problems.push({ file: label, message: `The pack "${pack.id}" names entries the catalogue does not list: ${missing.join(", ")}.` });
      }
      if (entryIds.length === 0) continue;
      seen.add(pack.id);
      packs.push({
        id: pack.id,
        name: pack.name,
        description: pack.description,
        entryIds,
        ...(pack.countries ? { countries: pack.countries } : {}),
      });
    }
  }
  return { packs, problems };
}
