/**
 * Repeaters: a person's own offline database of amateur radio repeaters.
 *
 * Lists come in as files the person obtained (CSV, including the layouts the RSGB's
 * ETCC offers and CHIRP's), are shown before they are kept, and can be brought up to
 * date later without losing what the person changed. Entries can also be made and
 * changed by hand. Everything is found, filtered by band, mode and distance, drawn on
 * the map and written out for programming a radio with no connection.
 *
 * This module makes no outbound request of any kind.
 */
import fastifyMultipart from "@fastify/multipart";
import {
  MAX_REPEATER_FILE_BYTES,
  REPEATER_BAND_IDS,
  REPEATER_EXPORT_FORMATS,
  REPEATER_MODE_IDS,
  REPEATER_STATUSES,
  type RepeaterBand,
  type RepeaterMode,
} from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { createRepeatersService, type ImportOptions, type RepeatersService, type RepeaterUpload } from "./service.ts";

declare module "../../core/context.ts" {
  interface Services {
    repeaters: RepeatersService;
  }
}

type IdParams = { Params: { id: string } };

const flag = z
  .enum(["1", "0", "true", "false"])
  .optional()
  .transform((value) => value === "1" || value === "true");

const position = (name: string) =>
  z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, `Give \`${name}\` as latitude,longitude, for example 54.46,-3.09.`)
    .transform((value, context) => {
      const [lat, lon] = value.split(",").map(Number) as [number, number];
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        context.addIssue({ code: "custom", message: `\`${name}\` is not a position on Earth.` });
        return z.NEVER;
      }
      return { lat, lon };
    });

const filterShape = {
  q: z.string().max(200).optional(),
  band: z.enum(REPEATER_BAND_IDS as [RepeaterBand, ...RepeaterBand[]]).optional(),
  mode: z.enum(REPEATER_MODE_IDS as [RepeaterMode, ...RepeaterMode[]]).optional(),
  hideOffAir: flag,
  list: z.string().max(40).optional(),
};

const listQuery = z.object({
  ...filterShape,
  near: position("near").optional(),
  withinKm: z.coerce.number().positive().max(20_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const exportQuery = z.object({
  ...filterShape,
  format: z.enum(REPEATER_EXPORT_FORMATS),
  near: position("near").optional(),
  withinKm: z.coerce.number().positive().max(20_000).optional(),
  limit: z.coerce.number().int().min(1).max(100_000).optional(),
});

const overlayQuery = z.object({
  ...filterShape,
  bbox: z
    .string()
    .regex(/^(-?\d+(\.\d+)?,){3}-?\d+(\.\d+)?$/, "Give `bbox` as west,south,east,north in degrees.")
    .transform((value, context) => {
      const [west, south, east, north] = value.split(",").map(Number) as [number, number, number, number];
      if (Math.abs(south) > 90 || Math.abs(north) > 90 || south > north || Math.abs(west) > 180 || Math.abs(east) > 180) {
        context.addIssue({ code: "custom", message: "`bbox` is not a box on the map." });
        return z.NEVER;
      }
      return [west, south, east, north] as [number, number, number, number];
    }),
});

const hertz = z.number().int().min(1_000_000, "A frequency is at least 1 MHz.").max(250_000_000_000, "A frequency is at most 250 GHz.");
const short = (max: number) => z.string().max(max);

const repeaterShape = {
  callsign: z.string().trim().min(1, "Give the repeater a callsign or a name.").max(40),
  outputHz: hertz,
  inputHz: hertz.nullable().optional(),
  modes: z
    .array(z.enum(REPEATER_MODE_IDS as [RepeaterMode, ...RepeaterMode[]]))
    .max(8)
    .optional(),
  ctcssHz: z
    .number()
    .min(60, "A CTCSS tone is between 60 and 260 Hz.")
    .max(260, "A CTCSS tone is between 60 and 260 Hz.")
    .nullable()
    .optional(),
  dcsCode: z
    .string()
    .regex(/^[0-7]{3}$/, "A DCS code is three digits from 0 to 7, such as 023.")
    .nullable()
    .optional(),
  dmrColourCode: z.number().int().min(0).max(15).nullable().optional(),
  talkgroups: short(500).optional(),
  accessNote: short(500).optional(),
  channel: short(40).optional(),
  place: short(120).optional(),
  region: short(80).optional(),
  country: short(80).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lon: z.number().min(-180).max(180).nullable().optional(),
  locator: short(12).optional(),
  antennaMeters: z.number().min(0).max(1000).nullable().optional(),
  keeper: short(80).optional(),
  status: z.enum(REPEATER_STATUSES).optional(),
  notes: short(2000).optional(),
};
const createSchema = z.object(repeaterShape);
const patchSchema = z.object(repeaterShape).partial();

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date as year-month-day, for example 2026-11-16.")
  .transform((value, context) => {
    const time = Date.parse(`${value}T00:00:00Z`);
    // A list cannot be from tomorrow: a date ahead of today would make old data look fresh for longer.
    if (Number.isNaN(time) || time > Date.now() + 36 * 3_600_000) {
      context.addIssue({ code: "custom", message: "The date of the data cannot be in the future." });
      return z.NEVER;
    }
    return time;
  });

const sourceUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value), "A web address starts with http:// or https://.")
  .transform((value) => value || null);

const listPatchSchema = z.object({
  name: z.string().trim().min(1, "Give the list a name.").max(120).optional(),
  source: short(200).optional(),
  sourceUrl: sourceUrl.optional(),
  dataDate: day.optional(),
});

const importFields = z.object({
  mapping: z.string().max(4000).optional(),
  listId: z.string().max(40).optional(),
  name: z.string().trim().max(120).optional(),
  source: short(200).optional(),
  sourceUrl: sourceUrl.optional(),
  dataDate: day.optional(),
  edited: z.enum(["keep", "replace"]).optional(),
  gone: z.enum(["remove", "keep"]).optional(),
});

export async function registerRepeaters(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createRepeatersService(ctx);
  ctx.services.repeaters = service;

  // Found with everything else: by callsign, town or frequency.
  ctx.services.search.addSource({
    id: "repeaters",
    layer: "local",
    kind: "repeater",
    isAvailable: () => true,
    weight: () => 0.8,
    search: async ({ q, limit }) => service.search(q, Math.min(limit, 50)),
  });

  // Another module may have registered the multipart parser already; twice is an error.
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(fastifyMultipart, { limits: { fileSize: ctx.config.maxUploadBytes } });
  }

  /** Reads the one file of an import, and the choices sent with it. */
  async function receive(request: FastifyRequest): Promise<{ upload: RepeaterUpload; options: ImportOptions }> {
    if (!request.isMultipart()) throw badRequest("Send the file as a multipart/form-data upload.");
    const fields: Record<string, string> = {};
    let upload: RepeaterUpload | undefined;
    try {
      for await (const part of request.parts({ limits: { fileSize: MAX_REPEATER_FILE_BYTES, files: 1, fields: 12, fieldSize: 4000 } })) {
        if (part.type === "field") {
          if (typeof part.value === "string") fields[part.fieldname] = part.value;
          continue;
        }
        // Bounded by the size limit above, so reading it whole is safe.
        const buffer = await part.toBuffer();
        upload = { text: buffer.toString("utf8"), fileName: part.filename ? part.filename.slice(0, 200) : null, sizeBytes: buffer.length };
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE") {
        throw new AppError("too_large", "That file is larger than 16 MB. Export a smaller area, or split the file, and import the parts.");
      }
      if (code === "FST_FILES_LIMIT") throw badRequest("Import one file at a time.");
      throw error;
    }
    if (!upload) throw badRequest("No file was sent. Choose a file of repeaters to import.");
    const parsed = importFields.parse(fields);
    let mapping: unknown;
    if (parsed.mapping !== undefined) {
      try {
        mapping = JSON.parse(parsed.mapping);
      } catch {
        throw badRequest("The column matching sent with the file could not be read.");
      }
    }
    return { upload, options: { ...parsed, mapping } };
  }

  app.get("/api/repeaters/overview", async () => service.overview());

  app.get("/api/repeaters", async (request) => service.list(listQuery.parse(request.query)));

  app.get("/api/repeaters/overlay", async (request) => service.overlay(overlayQuery.parse(request.query)));

  app.get("/api/repeaters/export", async (request, reply) => {
    const file = service.exportFile(exportQuery.parse(request.query));
    return (
      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${file.filename}"`)
        .header("X-Outpost-Repeater-Count", String(file.count))
        // Rows from somebody else's file: never to be drawn as a page in Outpost's origin.
        .header("Content-Security-Policy", "sandbox; default-src 'none'")
        .header("X-Content-Type-Options", "nosniff")
        .send(file.body)
    );
  });

  // What a file would bring in. Nothing is kept by asking.
  app.post("/api/repeaters/import/preview", async (request) => {
    const { upload, options } = await receive(request);
    return service.preview(upload, options);
  });

  app.post("/api/repeaters/import", async (request) => {
    const { upload, options } = await receive(request);
    return service.importFile(upload, options);
  });

  app.patch<IdParams>("/api/repeaters/lists/:id", async (request) => {
    return { list: service.updateList(request.params.id, listPatchSchema.parse(request.body)) };
  });

  app.delete<IdParams>("/api/repeaters/lists/:id", async (request) => {
    return service.removeList(request.params.id);
  });

  app.post<IdParams>("/api/repeaters/lists/:id/restore-removed", async (request) => {
    return service.restoreRemoved(request.params.id);
  });

  app.post("/api/repeaters", async (request) => {
    return { repeater: service.create(createSchema.parse(request.body)) };
  });

  app.get<IdParams>("/api/repeaters/:id", async (request) => service.get(request.params.id));

  app.patch<IdParams>("/api/repeaters/:id", async (request) => {
    return { repeater: service.update(request.params.id, patchSchema.parse(request.body)) };
  });

  app.post<IdParams>("/api/repeaters/:id/revert", async (request) => {
    return { repeater: service.revert(request.params.id) };
  });

  app.delete<IdParams>("/api/repeaters/:id", async (request) => {
    service.remove(request.params.id);
    return { ok: true };
  });
}
