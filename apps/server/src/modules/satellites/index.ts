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
 */
import type {
  SatelliteElements,
  SatelliteGroup,
  SatelliteSourceState,
  SatellitesFetchResponse,
  SatellitesResponse,
  SatelliteTransmitter,
} from "@outpost/shared";
import { parseCelestrakCsv, SATELLITE_SOURCES } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { AppError, classifyNetworkError } from "../../core/errors.ts";
import { createHttpClient, type HttpClient, USER_AGENT } from "../../core/http.ts";
import { satelliteElements, satelliteFetches, satelliteTransmitters } from "../../db/schema.ts";
import { parseSatnogsTransmitters } from "./satnogs.ts";

const GROUPS: SatelliteGroup[] = ["stations", "amateur", "weather"];
/** LogBook73's floor for each group: a list smaller than this is taken to be a fault at the publisher, not the truth. */
const MINIMUM_ROWS: Record<SatelliteGroup, number> = { stations: 5, amateur: 40, weather: 20 };
const MAX_BYTES = 16 * 1024 * 1024;

type SourceId = "celestrak" | "satnogs";

export interface SatellitesService {
  list(): SatellitesResponse;
  fetchElements(): Promise<SatellitesFetchResponse>;
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
  let fetching: Promise<SatellitesFetchResponse> | null = null;

  function sources(): SatelliteSourceState[] {
    const rows = new Map(
      ctx.db
        .select()
        .from(satelliteFetches)
        .all()
        .map((row) => [row.source, row]),
    );
    return (["celestrak", "satnogs"] as const).map((id) => {
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
    ctx.events.publish({ type: "satellites.changed" });
    return { sources: sources(), said };
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
      return { satellites, transmitters, sources: sources(), fetching: fetching !== null, now: Date.now() };
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
}
