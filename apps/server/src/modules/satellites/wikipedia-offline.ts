/**
 * A satellite's article from a copy of Wikipedia kept on this Outpost (a Wikipedia ZIM
 * in the reference collections), tried before Wikipedia online and needing no internet.
 * The same rules as ./wikipedia.ts, with the article's own infobox in place of Wikidata:
 *
 * - candidates are the archive's titles that are one of the satellite's names, case
 *   aside (kiwix-serve's title suggestions), OSCAR designations never on their own;
 * - an infobox that gives a COSPAR ID or SATCAT number decides: this satellite's, or
 *   rejected (the strongest sign offline);
 * - with no numbers, a series article whose title begins the name is kept and said to be
 *   about the series; otherwise the article must say it is about a spacecraft.
 */
import type { WikipediaArchiveRef as ArchiveRef, WikipediaArchives } from "../kiwix/index.ts";
import { decodeEntities } from "../kiwix/library.ts";
import {
  type Found,
  isOscarDesignation,
  isSeriesTitle,
  normalise,
  type Subject,
  sameCospar,
  sameNorad,
  soundsLikeSpacecraft,
} from "./wikipedia.ts";

const text = (html: string) =>
  decodeEntities(html.replace(/<sup[\s\S]*?<\/sup>/gi, "").replace(/<[^>]+>/g, " "))
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();

/** The COSPAR IDs and SATCAT numbers an article's infobox gives. */
export function infoboxNumbers(html: string): { cospar: string[]; norad: string[] } {
  const cospar: string[] = [];
  const norad: string[] = [];
  const boxes = html.match(/<table[^>]*class="[^"]*\binfobox\b[\s\S]*?<\/table>/gi) ?? [];
  for (const box of boxes) {
    for (const row of box.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const head = /<th[^>]*>([\s\S]*?)<\/th>/i.exec(row);
      const cell = /<td[^>]*>([\s\S]*?)<\/td>/i.exec(row);
      if (!head || !cell) continue;
      const label = text(head[1]!);
      const value = text(cell[1]!);
      if (/COSPAR/i.test(label)) cospar.push(...(value.match(/\b\d{4}-\d{3}[A-Z]{1,3}\b/g) ?? []));
      else if (/SATCAT|NORAD/i.test(label)) norad.push(...(value.match(/\b\d{1,6}\b/g) ?? []));
    }
  }
  return { cospar, norad };
}

/** The first paragraphs of an article, as plain text: about 600 characters, never more than 4,000. */
export function leadText(html: string): string {
  const body = html.replace(/<table[\s\S]*?<\/table>/gi, "");
  const out: string[] = [];
  for (const match of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const paragraph = text(match[1]!);
    if (paragraph.length < 40) continue;
    out.push(paragraph);
    if (out.join(" ").length >= 600 || out.length >= 3) break;
  }
  return out.join("\n\n").slice(0, 4000);
}

/** The archive's articles whose title is one of the names, case aside (a closing "(satellite)" allowed). */
async function candidates(archives: WikipediaArchives, archive: ArchiveRef, names: string[]) {
  const out: Array<{ title: string; path: string; name: string }> = [];
  for (const name of names) {
    let hits: Array<{ title: string; path: string }>;
    try {
      hits = await archives.suggest(archive.collectionId, name, 5);
    } catch {
      return out;
    }
    const wanted = normalise(name);
    for (const hit of hits) {
      const same = normalise(hit.title.replace(/\s*\([^)]*\)\s*$/, "")) === wanted || normalise(hit.title) === wanted;
      if (!same && !isSeriesTitle(hit.title, [name])) continue;
      if (!out.some((item) => item.path === hit.path)) out.push({ ...hit, name });
    }
  }
  return out;
}

/** The article in a Wikipedia copy on this Outpost that is clearly about this satellite, or null. */
export async function findInArchives(archives: WikipediaArchives, subject: Subject): Promise<Found | null> {
  const names = subject.names.filter((name) => !isOscarDesignation(name)).slice(0, 8);
  const discarded = new Set(subject.discarded.map((title) => title.toLocaleLowerCase("en")));
  for (const archive of archives.list()) {
    for (const candidate of (await candidates(archives, archive, names)).slice(0, 6)) {
      if (discarded.has(candidate.title.toLocaleLowerCase("en")) || /^list of /i.test(candidate.title)) continue;
      const page = await archives.article(archive.collectionId, candidate.path).catch(() => null);
      if (!page) continue;
      const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(page.html);
      const title = titleMatch ? text(titleMatch[1]!) || candidate.title : candidate.title;
      if (discarded.has(title.toLocaleLowerCase("en"))) continue;
      const lead = leadText(page.html);
      if (!lead) continue;
      const numbers = infoboxNumbers(page.html);
      let how: Found["foundBy"] | null;
      if (numbers.norad.length > 0 || numbers.cospar.length > 0) {
        how = numbers.norad.some((value) => sameNorad(value, subject.noradId))
          ? "number"
          : numbers.cospar.some((value) => sameCospar(value, subject.cospar))
            ? "cospar"
            : null;
      } else if (isSeriesTitle(title, subject.names) && /\bseries\b/i.test(lead)) {
        how = "series";
      } else {
        how = soundsLikeSpacecraft(lead.slice(0, 400)) ? "name" : null;
      }
      if (!how) continue;
      return {
        title,
        url: archives.readerUrl(archive.collectionId, page.path),
        description: null,
        extract: lead,
        foundBy: how,
        searchedFor: how === "number" ? `NORAD ${subject.noradId}` : how === "cospar" ? `COSPAR ${subject.cospar}` : candidate.name,
        wikidataId: null,
        archive,
        editedAt: null,
      };
    }
  }
  return null;
}
