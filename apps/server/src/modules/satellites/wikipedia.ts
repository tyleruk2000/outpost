/**
 * A satellite's English Wikipedia article, found and summarised only when a person
 * presses "Read about it on Wikipedia" (see docs/sources.md for the terms read):
 *
 * 1. One Action API query asks whether an article goes by any of the satellite's names
 *    (`action=query&titles=…&redirects=1`), leaving out disambiguation pages.
 * 2. If none does, one search for "<name> satellite" (`list=search`), its answers tried
 *    in turn.
 * 3. The REST summary (`/api/rest_v1/page/summary/<title>`) of the first that is an
 *    article, not a disambiguation page.
 *
 * At most five requests a press. The article found is shown with how it was found, so a
 * wrong match is plain to see and can be discarded.
 */
import type { SatelliteWikipedia } from "@outpost/shared";
import { WIKIPEDIA_SOURCE } from "@outpost/shared";
import type { HttpClient } from "../../core/http.ts";

/**
 * Wikimedia's User-Agent policy asks for a client name and version; it names no person
 * or address on purpose (nobody's details leave this server). "bot" marks it as automated.
 */
export const WIKIPEDIA_USER_AGENT = "Outpost/0.1 (self-hosted offline library) bot";
const MAX_BYTES = 2 * 1024 * 1024;

export interface WikipediaUrls {
  /** The Action API: `https://en.wikipedia.org/w/api.php`. */
  search: string;
  /** The REST summary, ending in a slash. */
  summary: string;
}

export const WIKIPEDIA_URLS: WikipediaUrls = { search: WIKIPEDIA_SOURCE.search, summary: WIKIPEDIA_SOURCE.summary };

/** Thrown when nothing fitting was found: the person is told, nothing is kept. */
export class NoArticleError extends Error {}

async function getJson(http: HttpClient, url: string): Promise<unknown> {
  const { response } = await http.fetch(url, {
    headers: { "User-Agent": WIKIPEDIA_USER_AGENT, Accept: "application/json", "Accept-Language": "en" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Wikipedia answered ${response.status}.`);
  }
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error("Wikipedia sent more than expected.");
  return JSON.parse(text) as unknown;
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The article each name leads to (following redirects), in the order of the names; disambiguation pages left out. */
async function byName(http: HttpClient, urls: WikipediaUrls, names: string[]): Promise<Array<{ name: string; title: string }>> {
  const query = new URLSearchParams({
    action: "query",
    titles: names.join("|"),
    redirects: "1",
    prop: "pageprops",
    ppprop: "disambiguation",
    format: "json",
    formatversion: "2",
  });
  const answer = record(record(await getJson(http, `${urls.search}?${query}`)).query);
  const step = new Map<string, string>();
  for (const key of ["normalized", "redirects"]) {
    for (const item of list(answer[key])) {
      const from = str(record(item).from);
      const to = str(record(item).to);
      if (from && to) step.set(from, to);
    }
  }
  const articles = new Set(
    list(answer.pages)
      .map(record)
      .filter((page) => page.missing !== true && page.invalid !== true && page.ns === 0 && !("disambiguation" in record(page.pageprops)))
      .map((page) => str(page.title))
      .filter((title): title is string => title !== null),
  );
  const found: Array<{ name: string; title: string }> = [];
  for (const name of names) {
    let title = name;
    for (let hops = 0; hops < 3 && step.has(title); hops += 1) title = step.get(title)!;
    if (articles.has(title) && !found.some((item) => item.title === title)) found.push({ name, title });
  }
  return found;
}

async function bySearch(http: HttpClient, urls: WikipediaUrls, words: string): Promise<string[]> {
  const query = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: words,
    srlimit: "3",
    srnamespace: "0",
    srprop: "",
    format: "json",
    formatversion: "2",
  });
  return list(record(record(await getJson(http, `${urls.search}?${query}`)).query).search)
    .map((item) => str(record(item).title))
    .filter((title): title is string => title !== null);
}

async function summary(
  http: HttpClient,
  urls: WikipediaUrls,
  title: string,
): Promise<Omit<SatelliteWikipedia, "noradId" | "foundBy" | "searchedFor" | "fetchedAt"> | null> {
  const answer = record(await getJson(http, `${urls.summary}${encodeURIComponent(title.replace(/ /g, "_"))}`));
  const extract = str(answer.extract);
  if (answer.type !== "standard" || !extract) return null;
  const page = str(record(record(answer.content_urls).desktop).page);
  const url =
    page && /^https:\/\/en\.wikipedia\.org\/wiki\//.test(page)
      ? page
      : `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  return {
    title: str(answer.title) ?? title,
    url,
    description: str(answer.description),
    extract: extract.slice(0, 4000),
    editedAt: str(answer.timestamp),
  };
}

/** Finds and summarises the article for a satellite known by these names (the first is its main name). */
export async function findArticle(
  http: HttpClient,
  urls: WikipediaUrls,
  names: string[],
): Promise<Omit<SatelliteWikipedia, "noradId" | "fetchedAt">> {
  const named = await byName(http, urls, names.slice(0, 20));
  let tries = 0;
  for (const { name, title } of named) {
    if (tries >= 2) break;
    tries += 1;
    const found = await summary(http, urls, title);
    if (found) return { ...found, foundBy: "name", searchedFor: name };
  }
  const words = `${names[0]} satellite`;
  for (const title of (await bySearch(http, urls, words)).slice(0, 3 - tries)) {
    const found = await summary(http, urls, title);
    if (found) return { ...found, foundBy: "search", searchedFor: words };
  }
  throw new NoArticleError(
    `Wikipedia has no article under ${names.length === 1 ? "the name" : "the names"} ${names.map((name) => `"${name}"`).join(", ")}, and searching for "${words}" found none.`,
  );
}
