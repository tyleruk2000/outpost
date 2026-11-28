/**
 * Reference layers for the map: publicly mapped infrastructure, places, boundaries and
 * population from published datasets, and historical records, each kept with where it
 * came from. See docs/reference-layers.md.
 *
 * Estimating and downloading are `POST`: each makes Outpost ask a server on the internet,
 * and only a request from Outpost's own pages may cause that (`core/guard.ts`). Nothing is
 * fetched otherwise.
 */
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { HISTORICAL_RECORD_TYPES, haversineMeters, REFERENCE_IMPORT_FORMATS, REFERENCE_LAYERS } from "@outpost/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, notFound } from "../../core/errors.ts";
import { pathExists, safeFileName } from "../../core/fs-safe.ts";
import { createHttpClient } from "../../core/http.ts";
import { registerMultipart } from "../../core/multipart.ts";
import { TEMPLATES } from "./adapters/imports.ts";
import { PROVIDERS } from "./providers.ts";
import { createQueryFetcher, QUERY_FETCHER } from "./query-fetcher.ts";
import { createLayersService, type ImportInput, isReferenceDownload, type LayersService } from "./service.ts";

declare module "../../core/context.ts" {
  interface Services {
    layers: LayersService;
  }
}

export const IMPORT_JOB = "layers.import";
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

const list = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .max(2000)
    .optional()
    .transform((value) => (value ? value.split(",").filter(Boolean) : []))
    .pipe(z.array(z.enum(values)).max(64));
const codes = z
  .string()
  .max(2000)
  .optional()
  .transform((value) =>
    value
      ? value
          .split(",")
          .filter(Boolean)
          .map((code) => code.toUpperCase())
      : [],
  )
  .pipe(z.array(z.string().regex(/^[A-Z]{2}$/)).max(300));
const words = z
  .string()
  .max(4000)
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : []))
  .pipe(z.array(z.string().max(120)).max(100));
const bbox = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "Give the box as west,south,east,north in degrees.")
  .transform((value) => value.split(",").map(Number) as [number, number, number, number])
  .refine(
    ([west, south, east, north]) => Math.abs(west) <= 180 && Math.abs(east) <= 180 && south >= -90 && north <= 90 && south < north,
    "That box is not on Earth.",
  );

const filterQuery = z.object({ layers: list(REFERENCE_LAYERS), countries: codes, providers: words, kinds: words });
const overlayQuery = filterQuery.extend({ bbox, zoom: z.coerce.number().min(0).max(24) });
const atQuery = filterQuery.extend({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });
const searchQuery = filterQuery.extend({
  q: z.string().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  /** "lat,lon": the nearest first, each with its distance and the town it is in or near. */
  near: z
    .string()
    .regex(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/, "Give near as lat,lon.")
    .transform((text) => {
      const [lat, lon] = text.split(",").map(Number) as [number, number];
      return { lat, lon };
    })
    .refine(({ lat, lon }) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180, "Give near as lat,lon.")
    .optional(),
});

/** Further than this from every town held, a record is said with no town. */
const TOWN_WITHIN_METRES = 15_000;

const scopeSchema = z.object({
  countries: z
    .array(
      z
        .string()
        .regex(/^[A-Za-z]{2}$/)
        .transform((code) => code.toUpperCase()),
    )
    .max(20)
    .optional(),
  bbox: z
    .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)])
    .refine(([, south, , north]) => south < north, "A box has its south edge below its north edge.")
    .optional(),
  regions: z
    .array(z.string().regex(/^[a-z0-9/-]{1,80}$/))
    .max(20)
    .optional(),
});
const estimateSchema = z
  .object({
    provider: z.string().min(1).max(40),
    scope: scopeSchema,
    layers: z.array(z.enum(REFERENCE_LAYERS)).max(20).optional(),
    clientNameAgreed: z.boolean().optional(),
  })
  .superRefine((request, issues) => {
    // A request for nothing in particular is the whole world: only a source that is published for the whole world as one can answer it.
    if ((request.scope.countries?.length ?? 0) > 0 || request.scope.bbox || (request.scope.regions?.length ?? 0) > 0) return;
    const provider = PROVIDERS.find((entry) => entry.id === request.provider);
    if (!provider || provider.scopes.includes("world")) return;
    issues.addIssue({
      code: "custom",
      path: ["scope"],
      message: `Choose at least one country, or draw a box on the map: ${provider.name} is not downloaded for the whole world at once.`,
    });
  });
const startSchema = z.object({
  estimateId: z.string().min(1).max(40),
  keys: z.array(z.string().min(1).max(200)).min(1).max(40),
  locationId: z.string().min(1).optional(),
  keepFile: z.boolean().optional(),
});
/** A CSV form's name, from the address: only the forms there are, never a name every object has ("constructor"). */
const templateName = z.string().refine((name) => Object.hasOwn(TEMPLATES, name));
const optionsSchema = z.record(z.string().max(60), z.string().max(2000)).default({});
const importFromStorageSchema = z.object({
  format: z.enum(REFERENCE_IMPORT_FORMATS),
  locationId: z.string().min(1),
  relPath: z.string().min(1).max(1000),
  title: z.string().trim().min(1, "Give the import a name.").max(160),
  options: optionsSchema,
  replaces: z.string().min(1).max(40).optional(),
});

export async function registerLayers(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const client = createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads });
  const service = createLayersService(ctx, client);
  ctx.services.layers = service;
  // Once the server is answering: the map is answered from the count kept before the restart meanwhile.
  app.addHook("onListen", async () => {
    void service.countLayers();
  });

  ctx.services.downloads.registerFetcher(QUERY_FETCHER, createQueryFetcher(client));
  ctx.services.downloads.registerInstaller("dataset", service.installer, isReferenceDownload);

  ctx.jobs.register<ImportInput>(IMPORT_JOB, {
    queue: "import",
    async run({ payload, signal, progress }) {
      const result = await service.importFile(payload, signal, (current, total, message, unit) =>
        progress({ current, total, message, ...(unit ? { unit } : {}) }),
      );
      return {
        packId: result.pack.id,
        imported: result.imported,
        skipped: result.skipped,
        duplicates: result.duplicates,
        problems: result.problems,
      };
    },
  });

  // Found by name from the search across everything; opened on the map.
  ctx.services.search.addSource({
    id: "reference-layers",
    layer: "local",
    kind: "map-feature",
    isAvailable: () => true,
    weight: () => 0.7,
    search: async ({ q, limit }) =>
      service.store.search(q, {}, Math.min(limit, 30)).map((hit, index) => ({
        kind: "map-feature",
        entityId: String(hit.id),
        title: hit.name || hit.kindLabel,
        titleSegments: [{ text: hit.name || hit.kindLabel, hit: true }],
        subtitle: [hit.kindLabel, hit.country].filter(Boolean).join(", "),
        collection: null,
        url: `/maps?feature=${hit.id}`,
        tags: [],
        score: 1 - index / 40,
        passages: [],
        sources: ["keyword"],
      })),
  });

  ctx.onClose.push(async () => {
    await service.close();
    await client.close();
  });

  const startImport = (input: ImportInput) => {
    const job = ctx.jobs.enqueue(IMPORT_JOB, input as unknown as Record<string, unknown>, {
      title: `Importing ${input.title}`,
      maxAttempts: 1,
    });
    return { jobId: job.id };
  };

  app.get("/api/reference/catalogue", async () => service.catalogue());

  app.post("/api/reference/estimate", async (request, reply) => service.estimate(estimateSchema.parse(request.body), gone(reply)));

  app.post("/api/reference/downloads", async (request) => {
    const started = await service.start(startSchema.parse(request.body));
    return { downloads: started.downloads.map((row) => ctx.services.downloads.toDto(row)), tasks: started.tasks };
  });

  app.get("/api/reference/packs", async () => ({ packs: service.packs() }));

  /** Geofabrik's regions as kept on this device, those for the home place first: nothing is asked of Geofabrik. */
  app.get("/api/reference/regions", async (request) => {
    const query = z
      .object({ lat: z.coerce.number().min(-90).max(90).optional(), lon: z.coerce.number().min(-180).max(180).optional() })
      .parse(request.query);
    return service.regions(query.lat !== undefined && query.lon !== undefined ? { lat: query.lat, lon: query.lon } : null);
  });

  /** Reads Geofabrik's list of regions, on a press: one file of about 500 kB. */
  app.post("/api/reference/regions", async (_request, reply) => service.refreshRegions(gone(reply)));

  app.delete<{ Params: { id: string }; Querystring: { deleteFiles?: string } }>("/api/reference/packs/:id", async (request) => {
    await service.remove(request.params.id, request.query.deleteFiles === "1" || request.query.deleteFiles === "true");
    return { ok: true };
  });

  app.post("/api/reference/imports/from-storage", async (request) => startImport(importFromStorageSchema.parse(request.body)));

  await registerMultipart(app);
  /** The form's fields, without where the file went: checked before the file is written when they come first. */
  const importFieldsSchema = importFromStorageSchema.omit({ locationId: true, relPath: true });
  const readFields = (fields: Record<string, string>) => {
    let options: unknown = {};
    try {
      options = fields.options ? JSON.parse(fields.options) : {};
    } catch {
      throw badRequest("The import's details could not be read.");
    }
    return importFieldsSchema.parse({ format: fields.format, title: fields.title, options, replaces: fields.replaces || undefined });
  };

  app.post("/api/reference/imports", async (request) => {
    if (!request.isMultipart()) throw badRequest("Send the file as a multipart/form-data upload.");
    const fields: Record<string, string> = {};
    let saved: { locationId: string; relPath: string; target: string; temp: string } | undefined;
    // Until the import is accepted the file has a temporary name, and every refusal removes it.
    let kept = false;
    try {
      try {
        for await (const part of request.parts({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 8, fieldSize: 8000 } })) {
          if (part.type === "field") {
            if (typeof part.value === "string") fields[part.fieldname] = part.value;
            continue;
          }
          // Fields sent before the file (as Outpost's own form sends them) are checked before anything is written.
          if (fields.format !== undefined || fields.title !== undefined) readFields(fields);
          const location = ctx.services.storage.defaultFor("layers");
          const name = safeFileName(part.filename || "import.csv") || "import.csv";
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
          const folder = "collections/reference/imports";
          await fs.promises.mkdir(ctx.services.storage.resolve(location.id, folder), { recursive: true });
          let relPath = `${folder}/${stamp}-${name}`;
          for (let n = 2; await pathExists(ctx.services.storage.resolve(location.id, relPath)); n += 1)
            relPath = `${folder}/${stamp}-${n}-${name}`;
          const target = ctx.services.storage.resolve(location.id, relPath);
          const temp = `${target}.uploading`;
          saved = { locationId: location.id, relPath, target, temp };
          await pipeline(part.file, fs.createWriteStream(temp, { flags: "wx" }));
          if (part.file.truncated) {
            throw new AppError("too_large", "That file is larger than 32 MB. Put it in a storage location and import it from there.");
          }
        }
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === "FST_REQ_FILE_TOO_LARGE")
          throw new AppError("too_large", "That file is larger than 32 MB. Put it in a storage location and import it from there.");
        if (code === "FST_FILES_LIMIT") throw badRequest("Import one file at a time.");
        throw error;
      }
      if (!saved) throw badRequest("No file was sent. Choose a file to import.");
      const input = { ...readFields(fields), locationId: saved.locationId, relPath: saved.relPath };
      await fs.promises.rename(saved.temp, saved.target);
      const started = startImport(input);
      kept = true;
      return started;
    } finally {
      if (saved && !kept) {
        await fs.promises.rm(saved.temp, { force: true }).catch(() => undefined);
        await fs.promises.rm(saved.target, { force: true }).catch(() => undefined);
      }
    }
  });

  app.get<{ Params: { format: string } }>("/api/reference/templates/:format", async (request, reply) => {
    const known = templateName.safeParse(request.params.format.replace(/\.csv$/, ""));
    if (!known.success) throw notFound("There is no template of that name.");
    const format = known.data;
    const columns = TEMPLATES[format]!;
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="outpost-${format}.csv"`)
      .header("X-Content-Type-Options", "nosniff")
      .send(`${columns.join(",")}\n`);
  });

  app.get("/api/reference/layers", async () => service.layers());

  app.get("/api/reference/features", async (request) => {
    const query = overlayQuery.parse(request.query);
    return service.store.overlay(query);
  });

  app.get("/api/reference/at", async (request) => ({ hits: service.store.at(atQuery.parse(request.query)) }));

  app.get<{ Params: { id: string } }>("/api/reference/features/:id", async (request) => {
    const id = z.coerce.number().int().positive().parse(request.params.id);
    const detail = service.store.detail(id, service.packTitles());
    if (!detail) throw notFound("That record is no longer held: its pack may have been removed or updated.");
    return { feature: detail };
  });

  /** The nearest records of a layer to a point, from what is held: nothing is asked of any source. */
  app.get("/api/reference/nearest", async (request) => {
    const query = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lon: z.coerce.number().min(-180).max(180),
        layer: z.enum(REFERENCE_LAYERS).default("food"),
        kind: z.string().min(1).max(120).optional(),
        limit: z.coerce.number().int().min(1).max(20).default(5),
        /** "1": the nearest few whatever their kind, rather than the nearest of each kind. */
        any: z.enum(["0", "1"]).optional(),
      })
      .parse(request.query);
    const { any, ...rest } = query;
    return service.store.nearest({ ...rest, kind: query.kind ?? null, anyKind: any === "1" });
  });

  app.get("/api/reference/search", async (request) => {
    const { q, limit, near, ...filter } = searchQuery.parse(request.query);
    if (!near) return { query: q, hits: service.store.search(q, filter, limit) };
    // From a point (home, or the middle of the map): the nearest of the names that match, with how far and the town.
    const hits = service.store
      .search(q, filter, 100)
      .map((hit) => ({
        ...hit,
        distanceMeters: hit.lat !== null && hit.lon !== null ? Math.round(haversineMeters(near.lat, near.lon, hit.lat, hit.lon)) : null,
      }))
      .sort((a, b) => (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY))
      .slice(0, limit);
    return {
      query: q,
      hits: hits.map((hit) => {
        if (hit.lat === null || hit.lon === null || hit.layer === "towns") return { ...hit, place: null };
        const town = service.store.nearest({ lat: hit.lat, lon: hit.lon, layer: "towns", kind: null, limit: 1, anyKind: true }).hits[0];
        return { ...hit, place: town && town.distanceMeters <= TOWN_WITHIN_METRES ? town.name : null };
      }),
    };
  });

  /** Historical records for the nuclear preparedness workspace's records browser. */
  app.get("/api/reference/historical", async (request) => {
    const query = z
      .object({
        recordType: z.enum(HISTORICAL_RECORD_TYPES).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
      })
      .parse(request.query);
    return service.store.historical({ recordType: query.recordType ?? null, limit: query.limit, offset: query.offset });
  });

  app.get("/api/reference/figures", async (request) => {
    const { country } = z
      .object({
        country: z
          .string()
          .regex(/^[A-Za-z]{2}$/)
          .optional(),
      })
      .parse(request.query);
    return { figures: service.store.figures(country?.toUpperCase()) };
  });

  app.get("/api/reference/population/grid", async (request) => {
    const query = z.object({ bbox, zoom: z.coerce.number().min(0).max(24) }).parse(request.query);
    return service.population.grid(query.bbox, query.zoom);
  });

  app.get("/api/reference/population/sum", async (request) => {
    const query = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lon: z.coerce.number().min(-180).max(180),
        radiusKm: z.coerce.number().gt(0).max(300),
      })
      .parse(request.query);
    return service.population.sum(query.lat, query.lon, query.radiusKm);
  });
}

/** Fires when the browser that asked has gone away, so the question to the source is dropped too. */
function gone(reply: FastifyReply): AbortSignal {
  const controller = new AbortController();
  reply.raw.once("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return controller.signal;
}
