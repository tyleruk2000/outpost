/**
 * The front matter of a web page Outpost saved.
 *
 * A saved page is a Markdown file, and what is known about it travels in the file: its
 * title, who wrote it, the address it was fetched from and when. That way the record
 * survives being moved to another drive, backed up, or opened in another program.
 * `modules/webpages` writes it; the Markdown view reads back the two lines it shows.
 *
 * Every value is written as a quoted string with JSON's escapes, which YAML reads the
 * same way, so a title with a colon or a quotation mark in it cannot break the block.
 */
import type { SavedFrom } from "@outpost/shared";

export interface SavedPageMeta {
  title: string;
  author?: string;
  site?: string;
  /** When the page says it was published, as an ISO date. */
  published?: string;
  language?: string;
  /** The address the page was fetched from, after redirects. */
  savedFrom: string;
  /** Milliseconds. */
  savedAt: number;
}

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/** One line of text: front matter is line by line, and a value never needs a break in it. */
const oneLine = (value: string) =>
  value
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what is being removed
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .trim();

export function savedPageFrontMatter(meta: SavedPageMeta): string {
  const lines: Array<[string, string | undefined]> = [
    ["title", meta.title],
    ["author", meta.author],
    ["site", meta.site],
    ["published", meta.published],
    ["language", meta.language],
    ["saved-from", meta.savedFrom],
    ["saved-at", new Date(meta.savedAt).toISOString()],
  ];
  const body = lines
    .filter((line): line is [string, string] => Boolean(line[1] && oneLine(line[1])))
    .map(([key, value]) => `${key}: ${JSON.stringify(oneLine(value))}`);
  return `---\n${body.join("\n")}\n---\n`;
}

function valuesOf(source: string): Map<string, string> {
  const values = new Map<string, string>();
  const block = FRONT_MATTER.exec(source)?.[1];
  if (!block) return values;
  for (const line of block.split(/\r?\n/)) {
    const match = /^([a-z][a-z-]*)[ \t]*:[ \t]*(.+)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (value.startsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== "string") continue;
        value = parsed;
      } catch {
        continue;
      }
    }
    if (!values.has(match[1]!)) values.set(match[1]!, value);
  }
  return values;
}

/**
 * Where and when a saved page was fetched, when the file says both. The address is
 * kept only if it is a plain `http` or `https` one, since it becomes a link.
 */
export function savedFromOf(source: string): SavedFrom | undefined {
  // Front matter is at the very top; a file without the opening line is not looked through.
  if (!source.startsWith("---")) return undefined;
  const values = valuesOf(source.slice(0, 16_384));
  const address = values.get("saved-from");
  const savedAt = Date.parse(values.get("saved-at") ?? "");
  if (!address || !Number.isFinite(savedAt) || address.length > 2000) return undefined;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return undefined;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return undefined;
  const site = oneLine(values.get("site") ?? "").slice(0, 200);
  return { url: url.href, savedAt, ...(site ? { site } : {}) };
}
