/**
 * Asking the streets service (Valhalla) for a route or for reachable areas. Every request
 * has a time limit and stops when the person's request does; every reply is read up to a
 * size limit and checked for its shape before anything uses it.
 */

import { z } from "zod";
import { AppError } from "../../core/errors.ts";

export type Costing = "auto" | "bicycle" | "pedestrian";

/**
 * Ferries only where there is no other way. Valhalla's `use_ferry` runs 0 to 1; its
 * pedestrian costing defaults to 1 (a ferry costs half its time), so a walk from Battersea
 * to Chelsea took the river bus. At 0 a ferry is still allowed, but costs ten times its
 * time and six hours to board (valhalla/sif/dynamiccost.h, read 24 Nov 2026), so a route
 * takes one only when the streets offer nothing else: an island, a river with no bridge.
 * Rail ferries (Le Shuttle) are a drive's own choice, made in Outpost's crossing list.
 */
export const COSTING_OPTIONS: Record<Costing, Record<string, number>> = {
  pedestrian: { use_ferry: 0 },
  bicycle: { use_ferry: 0 },
  auto: { use_ferry: 0 },
};

const ROUTE_TIMEOUT_MS = 20_000;
/** Measured on a Pi 5: a 60-minute drive area takes about 5 s; three areas in one ask about 4.6 s. */
const ISOCHRONE_TIMEOUT_MS = 30_000;
const ROUTE_MAX_BYTES = 4 * 1024 * 1024;
const ISOCHRONE_MAX_BYTES = 8 * 1024 * 1024;

const signSchema = z
  .object({
    exit_number_elements: z
      .array(z.object({ text: z.string().max(200) }).passthrough())
      .max(20)
      .optional(),
    exit_branch_elements: z
      .array(z.object({ text: z.string().max(200) }).passthrough())
      .max(20)
      .optional(),
    exit_toward_elements: z
      .array(z.object({ text: z.string().max(200) }).passthrough())
      .max(20)
      .optional(),
    exit_name_elements: z
      .array(z.object({ text: z.string().max(200) }).passthrough())
      .max(20)
      .optional(),
  })
  .passthrough();

const maneuverSchema = z
  .object({
    type: z.number().int().min(0).max(100),
    instruction: z.string().max(2000).default(""),
    street_names: z.array(z.string().max(300)).max(20).optional(),
    begin_street_names: z.array(z.string().max(300)).max(20).optional(),
    sign: signSchema.optional(),
    roundabout_exit_count: z.number().int().min(0).max(50).optional(),
    bearing_after: z.number().optional(),
    length: z.number().nonnegative(),
    time: z.number().nonnegative(),
    begin_shape_index: z.number().int().nonnegative(),
    end_shape_index: z.number().int().nonnegative(),
    travel_mode: z.string().max(40).optional(),
    ferry: z.boolean().optional(),
  })
  .passthrough();
export type Maneuver = z.infer<typeof maneuverSchema>;

const routeReplySchema = z.object({
  trip: z.object({
    legs: z
      .array(
        z.object({
          maneuvers: z.array(maneuverSchema).max(5000),
          summary: z.object({ length: z.number().nonnegative(), time: z.number().nonnegative() }).passthrough(),
          shape: z.string().max(ROUTE_MAX_BYTES),
        }),
      )
      .min(1)
      .max(20),
    summary: z.object({ length: z.number().nonnegative(), time: z.number().nonnegative() }).passthrough(),
    units: z.string().optional(),
  }),
});
export type RouteReply = z.infer<typeof routeReplySchema>;

const position = z.tuple([z.number(), z.number()]).rest(z.number());
const ring = z.array(position).max(200_000);
const isochroneReplySchema = z.object({
  features: z
    .array(
      z.object({
        properties: z.object({ contour: z.number() }).passthrough(),
        geometry: z.union([
          z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).max(5000) }),
          z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ring).max(5000)).max(5000) }),
        ]),
      }),
    )
    .max(10),
});
export type IsochroneReply = z.infer<typeof isochroneReplySchema>;

const errorReplySchema = z.object({ error_code: z.number().optional(), error: z.string().max(2000).optional() }).passthrough();

/** Valhalla's own refusal, kept for the caller to put into words: 171 is "no streets near this point". */
export class ValhallaRefusal extends Error {
  readonly code: number | null;
  constructor(code: number | null, message: string) {
    super(message);
    this.name = "ValhallaRefusal";
    this.code = code;
  }
}

/** Valhalla's error codes for a point away from every street in the tiles. */
export const NO_STREETS_NEAR = new Set([171, 170, 172]);

async function readCapped(response: Response, max: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > max) {
    await response.body?.cancel();
    throw new AppError("upstream", "The streets service's answer is too large to read.");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new AppError("upstream", "The streets service's answer is too large to read.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface StreetsClient {
  route(input: { points: Array<{ lat: number; lon: number }>; costing: Costing; signal?: AbortSignal }): Promise<RouteReply>;
  isochrone(input: {
    point: { lat: number; lon: number };
    costing: Costing;
    minutes: number[];
    denoise: number;
    generalizeM: number;
    signal?: AbortSignal;
  }): Promise<IsochroneReply>;
}

export function createStreetsClient(baseUrl: () => string): StreetsClient {
  async function post<T>(pathName: string, body: unknown, schema: z.ZodType<T>, timeoutMs: number, max: number, signal?: AbortSignal) {
    const signals = [AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])];
    let response: Response;
    try {
      response = await fetch(`${baseUrl()}${pathName}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.any(signals),
        redirect: "error",
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if ((error as Error).name === "TimeoutError")
        throw new AppError("upstream", "The streets service took too long to answer. Try a shorter route or a smaller area.");
      throw new AppError("upstream", "The streets service is not answering. Check that it is running (Map data shows its state).");
    }
    let text: string;
    try {
      text = await readCapped(response, max);
    } catch (error) {
      if (error instanceof AppError || signal?.aborted) throw error;
      if ((error as Error).name === "TimeoutError")
        throw new AppError("upstream", "The streets service took too long to answer. Try a shorter route or a smaller area.");
      throw new AppError("upstream", "The streets service stopped part of the way through its answer.");
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AppError("upstream", "The streets service's answer could not be read.");
    }
    if (!response.ok) {
      const said = errorReplySchema.safeParse(json);
      throw new ValhallaRefusal(
        said.success ? (said.data.error_code ?? null) : null,
        (said.success && said.data.error) || `HTTP ${response.status}`,
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new AppError("upstream", "The streets service's answer is not in the shape Outpost expects.");
    return parsed.data;
  }

  return {
    route({ points, costing, signal }) {
      return post(
        "/route",
        {
          locations: points.map((p) => ({ lat: p.lat, lon: p.lon, type: "break" })),
          costing,
          costing_options: { [costing]: COSTING_OPTIONS[costing] },
          units: "kilometers",
          language: "en-GB",
        },
        routeReplySchema,
        ROUTE_TIMEOUT_MS,
        ROUTE_MAX_BYTES,
        signal,
      );
    },
    isochrone({ point, costing, minutes, denoise, generalizeM, signal }) {
      return post(
        "/isochrone",
        {
          locations: [{ lat: point.lat, lon: point.lon }],
          costing,
          costing_options: { [costing]: COSTING_OPTIONS[costing] },
          contours: minutes.map((time) => ({ time })),
          polygons: true,
          denoise,
          generalize: generalizeM,
        },
        isochroneReplySchema,
        ISOCHRONE_TIMEOUT_MS,
        ISOCHRONE_MAX_BYTES,
        signal,
      );
    },
  };
}

/** Valhalla's shapes: Google's polyline encoding at six decimal places. [lon, lat] pairs. */
export function decodePolyline6(encoded: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && shift < 35);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    const dLat = next();
    const dLon = next();
    if (dLat === null || dLon === null) break;
    lat += dLat;
    lon += dLon;
    out.push([lon / 1e6, lat / 1e6]);
  }
  return out;
}
