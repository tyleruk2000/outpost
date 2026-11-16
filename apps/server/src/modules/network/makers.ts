/**
 * Who made a device, from the first half of its hardware address.
 *
 * The prefixes are assigned by the IEEE Registration Authority, which publishes the
 * list of them (MA-L, "OUI") at https://standards-oui.ieee.org/oui/oui.csv. The IEEE's
 * pages offer the file for download but, read on 16 November 2026, state no licence
 * for passing it on, and the site is "© IEEE, all rights reserved". So none of it is
 * bundled with Outpost: a person who wants makers shown fetches the file from the IEEE
 * on a press, once (about 3.9 MB), and it is kept in the data directory. Without it,
 * makers are simply not shown. docs/tools-qr-and-network.md and docs/sources.md say so.
 *
 * Only the large blocks (MA-L, 24-bit prefixes) are read; the medium and small blocks
 * (MA-M, MA-S) are in other files and are not fetched.
 */
import fs from "node:fs";
import path from "node:path";
import { cleanName } from "./announcements.ts";

export const MAKERS_FILE = "oui.csv";
/** More than the file has ever been; a larger answer is not the file. */
export const MAKERS_MAX_BYTES = 20 * 1024 * 1024;

/** One CSV line into its fields, with quoted fields that hold commas. */
function csvFields(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  return fields;
}

/** The registry as prefix ("a0b1c2") to organisation. Lines that are not an MA-L assignment are left out. */
export function parseMakers(text: string): Map<string, string> {
  const makers = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  if (!/^Registry,Assignment,Organization Name/.test(lines[0] ?? "")) return makers;
  for (const line of lines.slice(1)) {
    if (!line.startsWith("MA-L,")) continue;
    const [, assignment, organisation] = csvFields(line);
    if (!assignment || !/^[0-9A-Fa-f]{6}$/.test(assignment) || !organisation) continue;
    makers.set(assignment.toLowerCase(), cleanName(organisation, 120));
  }
  return makers;
}

export interface MakersStore {
  lookup(mac: string): string | null;
  info(): { present: boolean; entries: number; fetchedAt: number | null; bytes: number | null };
  /** Takes a fetched file: checks it reads as the registry, then keeps it. Returns how many prefixes it holds. */
  replace(bytes: Buffer): number;
  remove(): void;
}

export function createMakersStore(dir: string): MakersStore {
  const file = path.join(dir, MAKERS_FILE);
  let loaded: Map<string, string> | null = null;

  const load = (): Map<string, string> => {
    if (loaded) return loaded;
    try {
      loaded = parseMakers(fs.readFileSync(file, "utf8"));
    } catch {
      loaded = new Map();
    }
    return loaded;
  };

  return {
    lookup(mac) {
      if (!fs.existsSync(file) && !loaded?.size) return null;
      return load().get(mac.replace(/:/g, "").slice(0, 6).toLowerCase()) ?? null;
    },
    info() {
      try {
        const stat = fs.statSync(file);
        return { present: true, entries: load().size, fetchedAt: stat.mtimeMs, bytes: stat.size };
      } catch {
        return { present: false, entries: 0, fetchedAt: null, bytes: null };
      }
    },
    replace(bytes) {
      const parsed = parseMakers(bytes.toString("utf8"));
      if (parsed.size < 1000) throw new Error("not the registry");
      fs.mkdirSync(dir, { recursive: true });
      const part = `${file}.part`;
      fs.writeFileSync(part, bytes);
      fs.renameSync(part, file);
      loaded = parsed;
      return parsed.size;
    },
    remove() {
      fs.rmSync(file, { force: true });
      loaded = null;
    },
  };
}
