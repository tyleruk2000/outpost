/**
 * A satellite's English Wikipedia article, found and summarised only when a person
 * presses "Read about it on Wikipedia" (see docs/sources.md for the terms read). A
 * satellite's names are a poor key: "AO-73" is a redirect to a US Navy oiler, "CSS" to
 * a style-sheet language, and a search for "<name> satellite" gives the article on
 * amateur radio satellites for half of them. So the match is made by catalogue number:
 *
 * 1. Wikidata, by number: one search for the item that carries the NORAD catalogue
 *    number (P377, bare and zero-padded to five figures, as Wikidata keeps old ones) or
 *    the COSPAR designator (P247); then those items with their English article
 *    (`wbgetentities`); then that article's REST summary. Three requests. When two items
 *    share a number (the ISS and its first module, Zarya), the one a name leads to.
 * 2. Only when no item carrying the number has an English article: the satellite's
 *    names as titles, then one search, each answer checked against its Wikidata item
 *    (`judge`): rejected when it carries a different number, is not a spacecraft, is a
 *    list, or is a class of things whose title is not the start of the name. OSCAR
 *    designations ("AO-73") are never tried as titles on their own. A series article
 *    (MetOp for METOP-B) is kept only when its title begins the name, and is said to be
 *    about the series.
 * 3. Otherwise: "No article found that is clearly about this satellite."
 *
 * Every answer says how it was matched, and a title a person discarded is not offered
 * for that satellite again. Requests are spaced 6 seconds apart; a 429 from Wikimedia is
 * said in plain words with when to try again, and nothing more is asked until then.
 */
import type { SatelliteWikipedia, SatelliteWikipediaMatch } from "@outpost/shared";
import { WIKIPEDIA_SOURCE } from "@outpost/shared";
import type { HttpClient } from "../../core/http.ts";

/**
 * Wikimedia's User-Agent policy asks for a client name and version; it names no person
 * or address on purpose (nobody's details leave this server). "bot" marks it as automated.
 */
export const WIKIPEDIA_USER_AGENT = "Outpost/0.1 (self-hosted offline library) bot";
/** A Wikidata item with every statement (the ISS's is over a megabyte) fits well inside this. */
const MAX_BYTES = 8 * 1024 * 1024;
/**
 * Wikimedia allows a client that gives no contact details 10 requests a minute across its
 * APIs (Wikimedia APIs/Rate limits, read 22 November 2026): one every 6 seconds. The review
 * that led to this matcher was refused 12 times in 48 at 7 seconds apart, so this is a floor.
 */
export const WIKIMEDIA_SPACING_MS = 6000;
/** How long to wait after a 429 that names no time of its own. */
const BUSY_DEFAULT_MS = 60_000;

export interface WikipediaUrls {
  /** Wikipedia's Action API: `https://en.wikipedia.org/w/api.php`. */
  search: string;
  /** The REST summary, ending in a slash. */
  summary: string;
  /** Wikidata's Action API. */
  wikidata: string;
}

export const WIKIPEDIA_URLS: WikipediaUrls = {
  search: WIKIPEDIA_SOURCE.search,
  summary: WIKIPEDIA_SOURCE.summary,
  wikidata: WIKIPEDIA_SOURCE.wikidata,
};

export type Found = Omit<SatelliteWikipedia, "noradId" | "fetchedAt">;

/** What is known of the satellite to match an article to. */
export interface Subject {
  noradId: number;
  /** Its international designator ("2013-066B"), or null. */
  cospar: string | null;
  /** The names it goes by, its main one first. */
  names: string[];
  /** Titles a person discarded for it. */
  discarded: string[];
}

/** Thrown when nothing fitting was found: the person is told, nothing is kept. */
export class NoArticleError extends Error {}

/** Wikimedia answered 429: asked to slow down. */
export class WikimediaBusyError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("Wikimedia asked for fewer requests.");
    this.retryAfterMs = retryAfterMs;
  }
}

/** Seconds or an HTTP date, as Retry-After gives it; capped at an hour. */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return BUSY_DEFAULT_MS;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 3_600_000) : BUSY_DEFAULT_MS;
}

export interface WikimediaClient {
  get(url: string): Promise<unknown>;
}

/** GETs to Wikimedia, one at a time and `spacingMs` apart; null for a 404. */
export function createWikimediaClient(http: HttpClient, spacingMs = WIKIMEDIA_SPACING_MS): WikimediaClient {
  let chain: Promise<unknown> = Promise.resolve();
  let lastAt = 0;
  async function once(url: string): Promise<unknown> {
    const wait = lastAt + spacingMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastAt = Date.now();
    const { response } = await http.fetch(url, {
      headers: { "User-Agent": WIKIPEDIA_USER_AGENT, Accept: "application/json", "Accept-Language": "en" },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (response.status === 429) {
      await response.body?.cancel();
      throw new WikimediaBusyError(retryAfterMs(response.headers.get("retry-after")));
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${new URL(url).hostname} could not answer (it gave the error ${response.status}).`);
    }
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new Error("Wikimedia sent more than expected.");
    return JSON.parse(text) as unknown;
  }
  return {
    get(url) {
      const next = chain.then(
        () => once(url),
        () => once(url),
      );
      chain = next.catch(() => undefined);
      return next;
    },
  };
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const lower = (value: string) => value.toLocaleLowerCase("en");

// ── The rules, shared with the offline copy (./wikipedia-offline.ts) ──

/** Lower case, accents and everything but letters and figures dropped: "FUNcube-1" and "FUNCUBE 1" are the same. */
export function normalise(value: string): string {
  return lower(value.normalize("NFKD")).replace(/[^a-z0-9]/g, "");
}

/** A title without a closing bracket: "HADES (satellite)" is "HADES". */
const stripBracket = (title: string) => title.replace(/\s*\([^)]*\)\s*$/, "");

/** "AO-73", "SO-50", "QO-100": an OSCAR number, shared by navy ships and others, never tried as a title on its own. */
export function isOscarDesignation(name: string): boolean {
  return /^[A-Z]{1,2}O-\d{1,3}$/i.test(name.trim());
}

/** The title, less a closing bracket, is the start of one of the names but not the whole of it: "MetOp" for "METOP-B". */
export function isSeriesTitle(title: string, names: readonly string[]): boolean {
  const stem = normalise(stripBracket(title));
  if (stem.length < 4) return false;
  return names.some((name) => {
    const whole = normalise(name);
    return whole !== stem && whole.startsWith(stem);
  });
}

/** The title, less a closing bracket, is one of the names, or one begins the other. */
export function titleFitsNames(title: string, names: readonly string[]): boolean {
  const stem = normalise(stripBracket(title));
  if (stem.length < 3) return false;
  return names.some((name) => {
    const whole = normalise(name);
    return whole.length >= 3 && (whole === stem || whole.startsWith(stem) || (stem.length >= 5 && stem.startsWith(whole)));
  });
}

/** Words that say a text is about a spacecraft, where no Wikidata item says so. */
export function soundsLikeSpacecraft(text: string | null): boolean {
  return /\b(satellites?|spacecraft|space station|cubesats?|nanosatellites?|microsatellites?|space probe|space telescope)\b/i.test(
    text ?? "",
  );
}

/** A NORAD number as written anywhere ("07530") is this satellite's. */
export const sameNorad = (value: string, noradId: number) => /^\d{1,9}$/.test(value.trim()) && Number(value.trim()) === noradId;
export const sameCospar = (value: string, cospar: string | null) => cospar !== null && lower(value.trim()) === lower(cospar.trim());

// ── Wikidata ──

/** What Wikidata keeps of an item, as far as the match needs it. */
export interface Entity {
  id: string;
  description: string | null;
  /** Instance of (P31). */
  instanceOf: string[];
  /** Subclass of (P279): set on classes of things, such as "amateur radio satellite" or "MetOp". */
  subclassOf: string[];
  norad: string[];
  cospar: string[];
  enwiki: string | null;
}

/**
 * Wikidata classes a spacecraft is an instance of, as read on 24 November 2026 from the
 * items of the review's 44 satellites: artificial satellite (of the Earth), amateur
 * radio, communications, weather, Earth observation, geostationary, research,
 * technology demonstration, small and micro satellite, CubeSat, OSCAR, space station,
 * its module, space laboratory and the ISS's own class, and the Functional Cargo Block.
 */
const SPACECRAFT = new Set([
  "Q26540",
  "Q12832168",
  "Q455647",
  "Q149918",
  "Q209363",
  "Q854845",
  "Q19362195",
  "Q105839698",
  "Q95945728",
  "Q1580082",
  "Q131597874",
  "Q1142930",
  "Q2008094",
  "Q18812508",
  "Q1471432",
  "Q139444619",
  "Q5508783",
]);
/** Wikimedia list article. */
const LIST_ARTICLE = "Q13406463";

function claimValues(claims: Record<string, unknown>, property: string): unknown[] {
  return list(claims[property]).map((claim) => record(record(record(claim).mainsnak).datavalue).value);
}

function entityOf(id: string, raw: unknown): Entity {
  const item = record(raw);
  const claims = record(item.claims);
  const ids = (property: string) =>
    claimValues(claims, property)
      .map((value) => str(record(value).id))
      .filter((value): value is string => value !== null);
  const strings = (property: string) => claimValues(claims, property).filter((value): value is string => typeof value === "string");
  return {
    id,
    description: str(record(record(item.descriptions).en).value),
    instanceOf: ids("P31"),
    subclassOf: ids("P279"),
    norad: strings("P377"),
    cospar: strings("P247"),
    enwiki: str(record(record(item.sitelinks).enwiki).title),
  };
}

const actionUrl = (base: string, params: Record<string, string>) =>
  `${base}?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`;

/** The items that carry this number or designator: one search. */
async function itemsByNumber(client: WikimediaClient, urls: WikipediaUrls, subject: Subject): Promise<string[]> {
  const terms = [`P377=${subject.noradId}`];
  const padded = String(subject.noradId).padStart(5, "0");
  if (padded !== String(subject.noradId)) terms.push(`P377=${padded}`);
  if (subject.cospar && /^\d{4}-\d{3}[A-Z]{1,3}$/i.test(subject.cospar)) terms.push(`P247=${subject.cospar.toUpperCase()}`);
  const answer = await client.get(
    actionUrl(urls.wikidata, { action: "query", list: "search", srsearch: `haswbstatement:${terms.join("|")}`, srlimit: "10", srprop: "" }),
  );
  return list(record(record(answer).query).search)
    .map((item) => str(record(item).title))
    .filter((title): title is string => title !== null && /^Q\d+$/.test(title));
}

async function entities(client: WikimediaClient, urls: WikipediaUrls, ids: string[]): Promise<Map<string, Entity>> {
  const out = new Map<string, Entity>();
  if (ids.length === 0) return out;
  const answer = await client.get(
    actionUrl(urls.wikidata, {
      action: "wbgetentities",
      ids: ids.slice(0, 50).join("|"),
      props: "claims|sitelinks|descriptions",
      languages: "en",
      sitefilter: "enwiki",
    }),
  );
  for (const [id, raw] of Object.entries(record(record(answer).entities))) {
    if (record(raw).missing !== undefined) continue;
    out.set(id, entityOf(id, raw));
  }
  return out;
}

/** "number" or "cospar" when the item carries this satellite's, null when it carries none of them. */
function carries(entity: Entity, subject: Subject): "number" | "cospar" | null {
  if (entity.norad.some((value) => sameNorad(value, subject.noradId))) return "number";
  if (entity.cospar.some((value) => sameCospar(value, subject.cospar))) return "cospar";
  return null;
}

// ── Wikipedia ──

interface Candidate {
  title: string;
  /** Its Wikidata item, or null. */
  item: string | null;
  description: string | null;
  disambiguation: boolean;
  via: "name" | "search";
  /** The name or words that led to it. */
  searchedFor: string;
}

const pageFields = { prop: "pageprops|description", ppprop: "disambiguation|wikibase_item" };

function pageOf(raw: unknown): Omit<Candidate, "via" | "searchedFor"> | null {
  const page = record(raw);
  const title = str(page.title);
  if (!title || page.missing === true || page.invalid === true || page.ns !== 0) return null;
  const props = record(page.pageprops);
  return { title, item: str(props.wikibase_item), description: str(page.description), disambiguation: "disambiguation" in props };
}

/** The article each name leads to (following redirects), in the order of the names. */
async function byName(client: WikimediaClient, urls: WikipediaUrls, names: string[]): Promise<Candidate[]> {
  if (names.length === 0) return [];
  const answer = record(
    record(await client.get(actionUrl(urls.search, { action: "query", titles: names.join("|"), redirects: "1", ...pageFields }))).query,
  );
  const step = new Map<string, string>();
  for (const key of ["normalized", "redirects"]) {
    for (const item of list(answer[key])) {
      const from = str(record(item).from);
      const to = str(record(item).to);
      if (from && to) step.set(from, to);
    }
  }
  const pages = new Map(
    list(answer.pages)
      .map(pageOf)
      .filter((page) => page !== null)
      .map((page) => [page.title, page]),
  );
  const found: Candidate[] = [];
  for (const name of names) {
    let title = name;
    for (let hops = 0; hops < 3 && step.has(title); hops += 1) title = step.get(title)!;
    const page = pages.get(title);
    if (page && !found.some((item) => item.title === page.title)) found.push({ ...page, via: "name", searchedFor: name });
  }
  return found;
}

async function bySearch(client: WikimediaClient, urls: WikipediaUrls, words: string): Promise<Candidate[]> {
  const answer = await client.get(
    actionUrl(urls.search, { action: "query", generator: "search", gsrsearch: words, gsrlimit: "3", gsrnamespace: "0", ...pageFields }),
  );
  return list(record(record(answer).query).pages)
    .map((raw) => ({ index: Number(record(raw).index) || 0, page: pageOf(raw) }))
    .filter((item) => item.page !== null)
    .sort((a, b) => a.index - b.index)
    .map((item) => ({ ...item.page!, via: "search" as const, searchedFor: words }));
}

async function summary(client: WikimediaClient, urls: WikipediaUrls, title: string) {
  const answer = record(await client.get(`${urls.summary}${encodeURIComponent(title.replace(/ /g, "_"))}`));
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

/**
 * Whether an article found by a name or a search is clearly about this satellite, and
 * how; null to reject it. `ownKnown`: Wikidata has this satellite's own item, so any
 * other item's article is about something else (unless it is the series).
 */
export function judge(
  candidate: Pick<Candidate, "title" | "description" | "disambiguation" | "via">,
  entity: Entity | null,
  subject: Subject,
  ownKnown: boolean,
): SatelliteWikipediaMatch | null {
  if (candidate.disambiguation) return null;
  if (subject.discarded.some((title) => lower(title) === lower(candidate.title))) return null;
  if (/^list of /i.test(candidate.title) || entity?.instanceOf.includes(LIST_ARTICLE)) return null;
  // It carries numbers: they decide.
  if (entity && (entity.norad.length > 0 || entity.cospar.length > 0)) return carries(entity, subject);
  const isClass = entity ? entity.subclassOf.length > 0 : /\bseries\b/i.test(candidate.description ?? "");
  if (isClass && isSeriesTitle(candidate.title, subject.names)) return "series";
  if (ownKnown || isClass) return null;
  const spacecraft = entity ? entity.instanceOf.some((id) => SPACECRAFT.has(id)) : soundsLikeSpacecraft(candidate.description);
  if (!spacecraft) return null;
  if (candidate.via === "search" && !titleFitsNames(candidate.title, subject.names)) return null;
  return candidate.via;
}

/** Finds and summarises the article for a satellite. */
export async function findArticle(client: WikimediaClient, urls: WikipediaUrls, subject: Subject): Promise<Found> {
  const skip = new Set(subject.discarded.map(lower));
  const titleNames = subject.names.filter((name) => !isOscarDesignation(name)).slice(0, 20);
  let named: Candidate[] | null = null;
  const lookUpNames = async () => {
    named ??= await byName(client, urls, titleNames);
    return named;
  };

  // 1. By number.
  const known = await entities(client, urls, await itemsByNumber(client, urls, subject));
  const own = [...known.values()].filter((entity) => carries(entity, subject) !== null);
  const withArticle = own.filter((entity) => entity.enwiki && !skip.has(lower(entity.enwiki)));
  if (withArticle.length > 0) {
    let pick = withArticle[0]!;
    if (withArticle.length > 1) {
      const led = (await lookUpNames()).map((hit) => hit.title);
      pick = led.map((title) => withArticle.find((entity) => entity.enwiki === title)).find((entity) => entity) ?? pick;
    }
    const found = await summary(client, urls, pick.enwiki!);
    if (found) {
      const by = carries(pick, subject)!;
      return {
        ...found,
        foundBy: by,
        searchedFor: by === "number" ? `NORAD ${subject.noradId}` : `COSPAR ${subject.cospar}`,
        wikidataId: pick.id,
        archive: null,
      };
    }
  }

  // 2. By name, then one search, each answer checked.
  const ownKnown = own.length > 0;
  const accept = async (candidates: Candidate[]): Promise<Found | null> => {
    const wanted = [...new Set(candidates.map((item) => item.item).filter((id): id is string => id !== null && !known.has(id)))];
    for (const [id, entity] of await entities(client, urls, wanted)) known.set(id, entity);
    for (const candidate of candidates) {
      const entity = candidate.item ? (known.get(candidate.item) ?? null) : null;
      const how = judge(candidate, entity, subject, ownKnown);
      if (!how) continue;
      const found = await summary(client, urls, candidate.title);
      if (!found) continue;
      return {
        ...found,
        foundBy: how,
        searchedFor: how === "number" ? `NORAD ${subject.noradId}` : how === "cospar" ? `COSPAR ${subject.cospar}` : candidate.searchedFor,
        wikidataId: entity?.id ?? null,
        archive: null,
      };
    }
    return null;
  };
  const byNames = await accept(await lookUpNames());
  if (byNames) return byNames;
  const words = `${titleNames[0] ?? subject.names[0] ?? subject.noradId} satellite`;
  const bySearchWords = await accept(await bySearch(client, urls, words));
  if (bySearchWords) return bySearchWords;

  throw new NoArticleError(noneFound(own, subject));
}

/** "No article found that is clearly about this satellite", and what was found instead. */
function noneFound(own: Entity[], subject: Subject): string {
  const words = ["No article found that is clearly about this satellite."];
  const discarded = own.filter((entity) => entity.enwiki && subject.discarded.some((title) => lower(title) === lower(entity.enwiki!)));
  if (discarded.length > 0) words.push(`The one Wikidata links to it, “${discarded[0]!.enwiki}”, was discarded.`);
  else if (own.length > 0) words.push(`Wikidata has an entry for it (${own[0]!.id}), but no English Wikipedia article.`);
  else words.push("Wikidata has no entry with its catalogue number, and no article under its names, or found by searching, is about it.");
  return words.join(" ");
}
