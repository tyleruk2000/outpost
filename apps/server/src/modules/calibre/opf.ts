/**
 * Reading the `metadata.opf` Calibre keeps beside each book in its library folder.
 *
 * Calibre writes an OPF 2.0 package (`metadata_to_opf` in calibre's
 * `src/calibre/ebooks/metadata/opf2.py`, read 21 Nov 2026): each author a `dc:creator`
 * with `opf:role="aut"`, tags as `dc:subject`, the comments as `dc:description` (HTML,
 * escaped), the series and its index as `<meta name="calibre:series">` and
 * `<meta name="calibre:series_index">`, the book's UUID as a `dc:identifier` with
 * `opf:scheme="uuid"`, and the cover as `<guide><reference type="cover" href=…>`.
 * EPUB 3's `belongs-to-collection` is read as well, for packages written by other tools.
 */
import { xmlElements } from "../documents/epub-package.ts";

export interface OpfBook {
  title: string | null;
  authors: string[];
  series: string | null;
  seriesIndex: number | null;
  tags: string[];
  description: string | null;
  language: string | null;
  uuid: string | null;
  /** The cover's file name as the package names it, relative to the package. */
  coverHref: string | null;
}

/** Most of a description kept: the blurb of a book, not the book. */
const MAX_DESCRIPTION = 4000;

const clean = (value: string | undefined) => value?.replace(/\s+/g, " ").trim() || null;

/** Calibre's comments are HTML; what is kept is their words. */
export function plainDescription(html: string): string | null {
  const text = html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return text ? text.slice(0, MAX_DESCRIPTION) : null;
}

export function readOpf(xml: string): OpfBook {
  const elements = xmlElements(xml);
  const all = (name: string) => elements.filter((element) => element.name === name);
  const meta = (name: string) => clean(all("meta").find((element) => element.attributes.name === name)?.attributes.content);

  const creators = all("creator").filter((element) => element.text);
  // A creator with no role is an author; one with another role (an editor, a translator) is not.
  const authors = creators.filter((element) => {
    const role = element.attributes["opf:role"] ?? element.attributes.role;
    return !role || role === "aut";
  });

  let series = meta("calibre:series");
  let seriesIndex = Number.parseFloat(meta("calibre:series_index") ?? "");
  if (!series) {
    // EPUB 3: <meta property="belongs-to-collection">Name</meta>. The HTML parser keeps no
    // words inside a <meta>, so this line is read as written.
    const match = /<meta\b[^>]*\bproperty\s*=\s*["']belongs-to-collection["'][^>]*>([^<]{1,300})<\/meta>/i.exec(xml);
    series = clean(match?.[1]);
    const position = /<meta\b[^>]*\bproperty\s*=\s*["']group-position["'][^>]*>([^<]{1,20})<\/meta>/i.exec(xml);
    if (series && position?.[1]) seriesIndex = Number.parseFloat(position[1]);
  }

  const identifiers = all("identifier");
  const uuid =
    clean(identifiers.find((element) => (element.attributes["opf:scheme"] ?? element.attributes.scheme)?.toLowerCase() === "uuid")?.text) ??
    null;

  const description = all("description").find((element) => element.text)?.text;
  const language = all("language")
    .map((element) => clean(element.text))
    .find((value) => value && value.toLowerCase() !== "und");

  const cover = all("reference").find((element) => element.attributes.type?.toLowerCase() === "cover")?.attributes.href;

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const element of all("subject")) {
    const tag = clean(element.text);
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }

  return {
    title: clean(all("title").find((element) => element.text)?.text)?.slice(0, 300) ?? null,
    authors: [...new Set(authors.map((element) => clean(element.text)).filter((name): name is string => name !== null))].slice(0, 20),
    series: series?.slice(0, 300) ?? null,
    seriesIndex: series && Number.isFinite(seriesIndex) ? seriesIndex : null,
    tags,
    description: description ? plainDescription(description) : null,
    language: language?.slice(0, 35) ?? null,
    uuid: uuid?.slice(0, 100) ?? null,
    coverHref: clean(cover) ?? null,
  };
}
