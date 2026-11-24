/**
 * Satellite tracking (Radio → Satellites): the orbital elements and published
 * transmitters the browser works passes out from. Brought over from LogBook73's
 * space-data module, which fetched the same two publishers on a timer; here they are
 * fetched only when a person presses "Get orbital elements", and nothing else in this
 * module makes a request.
 *
 * - CelesTrak's GP element sets for the groups "stations", "amateur" and "weather", as
 *   CSV (`gp.php?GROUP=<group>&FORMAT=csv`; see packages/shared/src/satellites.ts for why
 *   not TLE). Each group must come back whole and checked, and no smaller than
 *   LogBook73's floor for it, or the fetch keeps what was there before. CelesTrak updates
 *   every two hours and asks to be fetched once per update at most, so a press within two
 *   hours of the last good fetch keeps what there is and asks nothing.
 * - SatNOGS DB's transmitter list (about 4 MB), kept for the satellites above only, asked
 *   for at most once a day as LogBook73 did. If it fails, the elements are still kept and
 *   the transmitters from last time stay.
 * - SatNOGS DB's satellite list (about 1.6 MB): names, launch, countries, website and the
 *   rest of what it keeps of each satellite, for "About this satellite". Asked, kept and
 *   failed exactly as the transmitters are.
 *
 * One more route makes a request, and only on its own press: "Read about it on
 * Wikipedia" for one satellite. It looks first in a Wikipedia copy on this Outpost
 * (./wikipedia-offline.ts, no internet), and asks Wikidata and Wikipedia (./wikipedia.ts)
 * only when there is no copy, or when the person asks for it online after the copy had
 * nothing. Its summary is kept until discarded; a discarded title is remembered.
 */
import type {
  SatelliteAbout,
  SatelliteElements,
  SatelliteGroup,
  SatelliteSourceState,
  SatellitesFetchResponse,
  SatellitesResponse,
  SatelliteTransmitter,
  SatelliteWikipedia,
  SatelliteWikipediaMatch,
} from "@outpost/shared";
import { parseCelestrakCsv, SATELLITE_SOURCES } from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, classifyNetworkError, notFound } from "../../core/errors.ts";
import { createHttpClient, type HttpClient, USER_AGENT } from "../../core/http.ts";
import {
  satelliteAbout,
  satelliteElements,
  satelliteFetches,
  satelliteTransmitters,
  satelliteWikipedia,
  satelliteWikipediaDiscarded,
} from "../../db/schema.ts";
import { parseSatnogsSatellites, parseSatnogsTransmitters } from "./satnogs.ts";
import {
  createWikimediaClient,
  type Found,
  findArticle,
  NoArticleError,
  type Subject,
  WIKIMEDIA_SPACING_MS,
  WIKIPEDIA_URLS,
  WikimediaBusyError,
  type WikipediaUrls,
} from "./wikipedia.ts";
import { findInArchives } from "./wikipedia-offline.ts";

const GROUPS: SatelliteGroup[] = ["stations", "amateur", "weather"];
/** LogBook73's floor for each group: a list smaller than this is taken to be a fault at the publisher, not the truth. */
const MINIMUM_ROWS: Record<SatelliteGroup, number> = { stations: 5, amateur: 40, weather: 20 };
const MAX_BYTES = 16 * 1024 * 1024;

type SourceId = SatelliteSourceState["id"];
const SOURCE_IDS: SourceId[] = ["celestrak", "satnogs", "satnogs-satellites"];

export interface SatellitesService {
  list(): SatellitesResponse;
  fetchElements(): Promise<SatellitesFetchResponse>;
  /** Online only when asked, or when there is no Wikipedia copy on this Outpost to look in first. */
  fetchWikipedia(noradId: number, online?: boolean): Promise<SatelliteWikipedia>;
  discardWikipedia(noradId: number): void;
  /** Offers the articles discarded for a satellite again. */
  forgetDiscarded(noradId: number): void;
}

declare module "../../core/context.ts" {
  interface Services {
    satellites: SatellitesService;
  }
}

async function readText(http: HttpClient, url: string, accept: string): Promise<string> {
  const host = new URL(url).hostname;
  const { response } = await http.fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${host} answered ${response.status}.`);
  }
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error(`${host} sent more than ${MAX_BYTES / 1024 / 1024} MB.`);
  }
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error(`${host} sent more than ${MAX_BYTES / 1024 / 1024} MB.`);
  return text;
}

const message = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error);
  if (classifyNetworkError(error) === "offline" || text === "fetch failed") return "There is no connection to it.";
  if ((error as { name?: unknown } | null)?.name === "TimeoutError" || classifyNetworkError(error) === "transient") {
    return "It did not answer in time.";
  }
  return text;
};

export function createSatellitesService(ctx: AppContext, http: HttpClient): SatellitesService {
  const standIn = ctx.config.satellitesStandIn?.replace(/\/$/, "");
  const celestrakUrl = (group: SatelliteGroup) =>
    standIn ? `${standIn}/celestrak/gp.php?GROUP=${group}&FORMAT=csv` : `${SATELLITE_SOURCES.celestrak.url}?GROUP=${group}&FORMAT=csv`;
  const satnogsUrl = standIn ? `${standIn}/satnogs/transmitters/?format=json` : `${SATELLITE_SOURCES.satnogs.url}?format=json`;
  const satnogsSatellitesUrl = standIn
    ? `${standIn}/satnogs/satellites/?format=json`
    : `${SATELLITE_SOURCES["satnogs-satellites"].url}?format=json`;
  const wikipediaUrls: WikipediaUrls = standIn
    ? {
        search: `${standIn}/wikipedia/w/api.php`,
        summary: `${standIn}/wikipedia/api/rest_v1/page/summary/`,
        wikidata: `${standIn}/wikidata/w/api.php`,
      }
    : WIKIPEDIA_URLS;
  // A stand-in answers at once; Wikimedia itself is asked 6 seconds apart.
  const wikimedia = createWikimediaClient(http, standIn ? 0 : WIKIMEDIA_SPACING_MS);
  /** Wikimedia asked to be left alone until then (a 429): nothing is asked of it before. */
  let wikimediaBusyUntil = 0;
  let fetching: Promise<SatellitesFetchResponse> | null = null;
  const reading = new Map<number, Promise<SatelliteWikipedia>>();

  function sources(): SatelliteSourceState[] {
    const rows = new Map(
      ctx.db
        .select()
        .from(satelliteFetches)
        .all()
        .map((row) => [row.source, row]),
    );
    return SOURCE_IDS.map((id) => {
      const row = rows.get(id);
      return {
        id,
        label: SATELLITE_SOURCES[id].label,
        url: SATELLITE_SOURCES[id].url,
        fetchedAt: row?.fetchedAt ?? null,
        count: row?.count ?? 0,
        error: row?.error ?? null,
        triedAt: row?.triedAt ?? null,
      };
    });
  }

  function record(source: SourceId, values: { fetchedAt?: number; count?: number; error: string | null; triedAt: number }): void {
    const existing = sources().find((row) => row.id === source);
    const next = {
      source,
      fetchedAt: values.fetchedAt ?? existing?.fetchedAt ?? null,
      count: values.count ?? existing?.count ?? 0,
      error: values.error,
      triedAt: values.triedAt,
    };
    ctx.db.insert(satelliteFetches).values(next).onConflictDoUpdate({ target: satelliteFetches.source, set: next }).run();
  }

  /** Whether the copy kept of a source is younger than the publisher's own update interval (and so asking again would get the same). */
  function current(source: SourceId, now: number, kept: number): boolean {
    const row = sources().find((entry) => entry.id === source);
    return kept > 0 && row?.fetchedAt != null && now - row.fetchedAt < SATELLITE_SOURCES[source].updatesEveryMs;
  }

  async function fetchCelestrak(): Promise<SatelliteElements[]> {
    const merged = new Map<number, SatelliteElements>();
    for (const group of GROUPS) {
      const rows = parseCelestrakCsv(await readText(http, celestrakUrl(group), "text/csv"), group);
      if (rows.length < MINIMUM_ROWS[group]) {
        throw new Error(
          `CelesTrak's ${group} list had only ${rows.length} satellites, fewer than the ${MINIMUM_ROWS[group]} expected, so it was not kept.`,
        );
      }
      for (const satellite of rows) {
        const existing = merged.get(satellite.noradId);
        if (!existing) {
          merged.set(satellite.noradId, satellite);
          continue;
        }
        existing.groups = [...new Set([...existing.groups, ...satellite.groups])];
        // The same satellite in two groups: keep the newer element set.
        if (satellite.epoch > existing.epoch)
          Object.assign(existing, { name: satellite.name, elements: satellite.elements, epoch: satellite.epoch });
      }
    }
    return [...merged.values()];
  }

  function keptCount(): number {
    return ctx.db.select({ noradId: satelliteElements.noradId }).from(satelliteElements).all().length;
  }

  async function run(): Promise<SatellitesFetchResponse> {
    const started = Date.now();
    const said: string[] = [];
    let wanted: Set<number>;
    if (current("celestrak", started, keptCount())) {
      said.push(
        "CelesTrak was asked less than 2 hours ago, and it updates every 2 hours: the elements kept are its latest, so it was not asked again.",
      );
      wanted = new Set(
        ctx.db
          .select({ noradId: satelliteElements.noradId })
          .from(satelliteElements)
          .all()
          .map((row) => row.noradId),
      );
    } else {
      let elements: SatelliteElements[];
      try {
        elements = await fetchCelestrak();
      } catch (error) {
        record("celestrak", { error: message(error), triedAt: started });
        ctx.events.publish({ type: "satellites.changed" });
        throw new AppError(
          "upstream",
          `Could not get orbital elements from CelesTrak. ${message(error)} The elements kept before are unchanged.`,
        );
      }
      ctx.sqlite.transaction(() => {
        ctx.db.delete(satelliteElements).run();
        for (const satellite of elements) {
          ctx.db
            .insert(satelliteElements)
            .values({
              noradId: satellite.noradId,
              name: satellite.name,
              designator: satellite.designator,
              epoch: satellite.epoch,
              elements: satellite.elements as unknown as Record<string, string | number>,
              groups: satellite.groups,
            })
            .run();
        }
      })();
      record("celestrak", { fetchedAt: Date.now(), count: elements.length, error: null, triedAt: started });
      said.push(`Got the elements of ${elements.length} satellites from CelesTrak.`);
      wanted = new Set(elements.map((satellite) => satellite.noradId));
    }

    const keptTransmitters = ctx.db.select({ id: satelliteTransmitters.id }).from(satelliteTransmitters).all().length;
    if (current("satnogs", started, keptTransmitters)) {
      said.push("SatNOGS DB was asked less than a day ago: the transmitters kept were left as they are.");
    } else {
      try {
        const transmitters = parseSatnogsTransmitters(JSON.parse(await readText(http, satnogsUrl, "application/json")) as unknown, wanted);
        ctx.sqlite.transaction(() => {
          ctx.db.delete(satelliteTransmitters).run();
          for (const transmitter of transmitters) ctx.db.insert(satelliteTransmitters).values(transmitter).run();
        })();
        record("satnogs", { fetchedAt: Date.now(), count: transmitters.length, error: null, triedAt: started });
        said.push(`Got ${transmitters.length} transmitters from SatNOGS DB.`);
      } catch (error) {
        record("satnogs", { error: message(error), triedAt: started });
        said.push(`Could not get transmitters from SatNOGS DB. ${message(error)} The transmitters kept before are unchanged.`);
      }
    }

    const keptAbout = ctx.db.select({ noradId: satelliteAbout.noradId }).from(satelliteAbout).all().length;
    if (current("satnogs-satellites", started, keptAbout)) {
      said.push("SatNOGS DB's satellite list was asked less than a day ago: the details kept were left as they are.");
    } else {
      try {
        const about = parseSatnogsSatellites(JSON.parse(await readText(http, satnogsSatellitesUrl, "application/json")) as unknown, wanted);
        ctx.sqlite.transaction(() => {
          ctx.db.delete(satelliteAbout).run();
          for (const row of about) ctx.db.insert(satelliteAbout).values(row).run();
        })();
        record("satnogs-satellites", { fetchedAt: Date.now(), count: about.length, error: null, triedAt: started });
        said.push(`Got the details of ${about.length} satellites from SatNOGS DB.`);
      } catch (error) {
        record("satnogs-satellites", { error: message(error), triedAt: started });
        said.push(`Could not get satellite details from SatNOGS DB. ${message(error)} The details kept before are unchanged.`);
      }
    }
    ctx.events.publish({ type: "satellites.changed" });
    return { sources: sources(), said };
  }

  /** The names a satellite goes by, its main one first: SatNOGS's name and other names, then CelesTrak's with and without its brackets. */
  function namesOf(noradId: number): string[] {
    const about = ctx.db.select().from(satelliteAbout).where(eq(satelliteAbout.noradId, noradId)).get();
    const elements = ctx.db
      .select({ name: satelliteElements.name })
      .from(satelliteElements)
      .where(eq(satelliteElements.noradId, noradId))
      .get();
    if (!about && !elements) throw notFound("That satellite");
    const celestrak = elements?.name ?? "";
    const bracketed = /^(.*?)\s*\((.+)\)\s*$/.exec(celestrak);
    const names = [about?.name, ...(about?.otherNames ?? []), celestrak, bracketed?.[1], bracketed?.[2]]
      .map((name) => name?.trim() ?? "")
      .filter((name) => name.length >= 2);
    const seen = new Set<string>();
    return names.filter((name) => !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()));
  }

  function discardedOf(noradId: number): string[] {
    return ctx.db
      .select({ title: satelliteWikipediaDiscarded.title })
      .from(satelliteWikipediaDiscarded)
      .where(eq(satelliteWikipediaDiscarded.noradId, noradId))
      .all()
      .map((row) => row.title);
  }

  function subjectOf(noradId: number): Subject {
    const names = namesOf(noradId);
    const elements = ctx.db
      .select({ designator: satelliteElements.designator })
      .from(satelliteElements)
      .where(eq(satelliteElements.noradId, noradId))
      .get();
    return { noradId, cospar: elements?.designator ?? null, names, discarded: discardedOf(noradId) };
  }

  /** "about a minute", "about 5 minutes": how long until Wikimedia may be asked again. */
  const waitWords = (ms: number) => {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    return minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
  };
  const busyError = (ms: number) =>
    new AppError(
      "too_many",
      `Wikipedia is busy and asked Outpost to wait before asking again. Nothing was changed. Try again in ${waitWords(ms)}.`,
      { retryAfterMs: ms },
    );

  async function readWikipedia(noradId: number, online: boolean | undefined): Promise<SatelliteWikipedia> {
    const subject = subjectOf(noradId);
    let found: Found | null = null;
    // A Wikipedia copy on this Outpost first: no internet needed.
    const archives = (ctx.services as Partial<typeof ctx.services>).kiwix?.wikipedia;
    const copies = archives?.list() ?? [];
    if (archives && copies.length > 0 && online !== true) {
      try {
        found = await findInArchives(archives, subject);
      } catch (error) {
        ctx.log.warn({ err: error, noradId }, "looking a satellite up in the Wikipedia copy failed");
      }
      if (!found) {
        const named = copies.map((copy) => copy.title).join(", ");
        throw new AppError(
          "not_found",
          `The Wikipedia copy on this Outpost (${named}) has no article that is clearly about this satellite. You can ask Wikipedia online instead.`,
          { offlineChecked: true },
        );
      }
    }
    if (!found) {
      const wait = wikimediaBusyUntil - Date.now();
      if (wait > 0) throw busyError(wait);
      try {
        found = await findArticle(wikimedia, wikipediaUrls, subject);
      } catch (error) {
        if (error instanceof NoArticleError) throw new AppError("not_found", error.message);
        if (error instanceof WikimediaBusyError) {
          wikimediaBusyUntil = Date.now() + error.retryAfterMs;
          throw busyError(error.retryAfterMs);
        }
        throw new AppError("upstream", `Could not read Wikipedia. ${message(error)}`);
      }
    }
    const { archive, ...rest } = found;
    const row = {
      noradId,
      ...rest,
      archiveCollectionId: archive?.collectionId ?? null,
      archiveTitle: archive?.title ?? null,
      archiveDate: archive?.date ?? null,
      fetchedAt: Date.now(),
    };
    ctx.db.insert(satelliteWikipedia).values(row).onConflictDoUpdate({ target: satelliteWikipedia.noradId, set: row }).run();
    ctx.events.publish({ type: "satellites.changed" });
    return { noradId, ...found, fetchedAt: row.fetchedAt };
  }

  return {
    list() {
      const satellites = ctx.db
        .select()
        .from(satelliteElements)
        .all()
        .map((row) => ({ ...row, groups: row.groups as SatelliteGroup[] }) as unknown as SatelliteElements)
        .sort((a, b) => a.name.localeCompare(b.name));
      const transmitters: SatelliteTransmitter[] = ctx.db.select().from(satelliteTransmitters).all();
      const about: SatelliteAbout[] = ctx.db.select().from(satelliteAbout).all();
      const wikipedia = ctx.db
        .select()
        .from(satelliteWikipedia)
        .all()
        .map(
          ({ archiveCollectionId, archiveTitle, archiveDate, ...row }): SatelliteWikipedia => ({
            ...row,
            foundBy: MATCHES.includes(row.foundBy as SatelliteWikipediaMatch) ? (row.foundBy as SatelliteWikipediaMatch) : "name",
            archive: archiveCollectionId ? { collectionId: archiveCollectionId, title: archiveTitle ?? "", date: archiveDate } : null,
          }),
        );
      const wikipediaDiscarded = ctx.db
        .select({ noradId: satelliteWikipediaDiscarded.noradId, title: satelliteWikipediaDiscarded.title })
        .from(satelliteWikipediaDiscarded)
        .all();
      return {
        satellites,
        transmitters,
        about,
        wikipedia,
        wikipediaDiscarded,
        sources: sources(),
        fetching: fetching !== null,
        now: Date.now(),
      };
    },
    fetchWikipedia(noradId, online) {
      // Two presses for one satellite share one look-up.
      let pending = reading.get(noradId);
      if (!pending) {
        pending = readWikipedia(noradId, online).finally(() => reading.delete(noradId));
        reading.set(noradId, pending);
      }
      return pending;
    },
    discardWikipedia(noradId) {
      const kept = ctx.db.select().from(satelliteWikipedia).where(eq(satelliteWikipedia.noradId, noradId)).get();
      ctx.sqlite.transaction(() => {
        if (kept)
          ctx.db
            .insert(satelliteWikipediaDiscarded)
            .values({ noradId, title: kept.title, discardedAt: Date.now() })
            .onConflictDoNothing()
            .run();
        ctx.db.delete(satelliteWikipedia).where(eq(satelliteWikipedia.noradId, noradId)).run();
      })();
      ctx.events.publish({ type: "satellites.changed" });
    },
    forgetDiscarded(noradId) {
      ctx.db.delete(satelliteWikipediaDiscarded).where(eq(satelliteWikipediaDiscarded.noradId, noradId)).run();
      ctx.events.publish({ type: "satellites.changed" });
    },
    fetchElements() {
      // Two presses at once share one fetch.
      if (!fetching) {
        fetching = run().finally(() => {
          fetching = null;
        });
        ctx.events.publish({ type: "satellites.changed" });
      }
      return fetching;
    },
  };
}

export async function registerSatellites(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const http = createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads });
  ctx.onClose.push(() => http.close());
  const service = createSatellitesService(ctx, http);
  ctx.services.satellites = service;

  app.get("/api/satellites", async (): Promise<SatellitesResponse> => service.list());

  /** The one route that contacts CelesTrak and SatNOGS DB, and only when a person presses for it. */
  app.post("/api/satellites/fetch", async (): Promise<SatellitesFetchResponse> => service.fetchElements());

  /** Contacts Wikipedia, and only when a person presses "Read about it on Wikipedia". */
  app.post(
    "/api/satellites/:noradId/wikipedia",
    async (request): Promise<{ wikipedia: SatelliteWikipedia }> => ({
      wikipedia: await service.fetchWikipedia(noradParams.parse(request.params).noradId, wikipediaBody.parse(request.body ?? {}).online),
    }),
  );

  /** Offers again the articles discarded for a satellite. */
  app.delete("/api/satellites/:noradId/wikipedia/discarded", async (request) => {
    service.forgetDiscarded(noradParams.parse(request.params).noradId);
    return { ok: true };
  });

  app.delete("/api/satellites/:noradId/wikipedia", async (request) => {
    service.discardWikipedia(noradParams.parse(request.params).noradId);
    return { ok: true };
  });
}

/** `online: true` asks Wikipedia online even when a Wikipedia copy on this Outpost was looked in. */
const wikipediaBody = z.object({ online: z.boolean().optional() });
const MATCHES: SatelliteWikipediaMatch[] = ["number", "cospar", "name", "search", "series"];

const noradParams = z.object({ noradId: z.coerce.number().int().positive().max(999_999_999) });
