/**
 * Heard on the radio: the routes. Adding, changing or removing a receiver, and switching a
 * decoder on the Pi, are held to the computer Outpost runs on (`core/setting-right.ts`),
 * as the mesh radio's set-up is: each opens a connection or a port from that computer.
 * Every device may see what was heard, pin a station and clear what is kept.
 *
 * Nothing here sends anything to a receiver: Outpost only listens.
 */
import { isIP } from "node:net";
import {
  HEARD_SOURCE_IDS,
  type HeardClearResponse,
  type HeardReceiversResponse,
  type HeardReportsResponse,
  type HeardStationResponse,
  type HeardStationsResponse,
  PI_DECODERS,
  type RangeTestsResponse,
  RECEIVER_KINDS,
} from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { notFound } from "../../core/errors.ts";
import { settingRefusal, settingRight } from "../../core/setting-right.ts";
import { createPiDecoders, DEVICE_PATTERN } from "./pi.ts";
import { createHeardService, type HeardService } from "./service.ts";

declare module "../../core/context.ts" {
  interface Services {
    heard: HeardService;
  }
}

export type { HeardService } from "./service.ts";

const HOST = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$|^[0-9a-fA-F:]{2,39}$/;

const receiverBody = z
  .object({
    kind: z.enum(RECEIVER_KINDS),
    name: z.string().trim().min(1, "Give the receiver a name.").max(60),
    host: z
      .string()
      .trim()
      .min(1, "Give the decoder's address.")
      .max(253)
      .regex(HOST, "Give an address such as 192.168.1.20 or radio-mac.local, with no http:// and no port."),
    port: z.number().int().min(1).max(65535),
    transport: z.enum(["tcp", "udp"]),
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((value, issue) => {
    if (value.transport === "udp" && value.kind !== "ais")
      issue.addIssue({ code: "custom", message: "Only ships can be heard over UDP: APRS and aircraft decoders offer TCP." });
    if (value.transport === "udp" && !isIP(value.host))
      issue.addIssue({
        code: "custom",
        message: "For UDP, give the decoder's own address as numbers (such as 192.168.1.20): only datagrams from it are read.",
      });
    if (value.transport === "udp" && value.port < 1024)
      issue.addIssue({ code: "custom", message: "Choose a port of 1024 or above for Outpost to listen on." });
  });

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const source = z.enum(HEARD_SOURCE_IDS);
const time = z.coerce.number().int().min(0).max(8_640_000_000_000_000);

export async function registerHeard(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createHeardService(ctx);
  ctx.services.heard = service;
  const pi = createPiDecoders(ctx);
  ctx.onClose.push(() => service.stop());
  service.start();

  const right = (request: FastifyRequest) => settingRight(request.raw, ctx.config);
  const mustBeLocal = (request: FastifyRequest) => {
    const answer = right(request);
    if (!answer.allowed) throw settingRefusal("Receivers", "each opens a connection or a port from that computer", answer.inContainer);
  };

  const receivers = async (request: FastifyRequest): Promise<HeardReceiversResponse> => ({
    receivers: service.receivers(),
    right: right(request),
    space: service.space(),
    aircraftHours: ctx.services.settings.get("heard.aircraftHours"),
    pi: await pi.status(),
  });

  app.get("/api/heard/receivers", async (request) => receivers(request));

  app.post("/api/heard/receivers", async (request) => {
    mustBeLocal(request);
    service.addReceiver(receiverBody.parse(request.body));
    return receivers(request);
  });

  app.put<{ Params: { id: string } }>("/api/heard/receivers/:id", async (request) => {
    mustBeLocal(request);
    if (!service.updateReceiver(id.parse(request.params.id), receiverBody.parse(request.body))) throw notFound("That receiver");
    return receivers(request);
  });

  app.delete<{ Params: { id: string } }>("/api/heard/receivers/:id", async (request) => {
    mustBeLocal(request);
    if (!service.removeReceiver(id.parse(request.params.id))) throw notFound("That receiver");
    return receivers(request);
  });

  app.get("/api/heard/stations", async (request): Promise<HeardStationsResponse> => {
    const query = z.object({ source: source.optional() }).parse(request.query);
    return { stations: service.stations(query.source) };
  });

  app.get<{ Params: { id: string } }>("/api/heard/stations/:id", async (request): Promise<HeardStationResponse> => {
    const found = service.station(id.parse(request.params.id));
    if (!found) throw notFound("That station");
    return found;
  });

  app.put<{ Params: { id: string } }>("/api/heard/stations/:id/pin", async (request) => {
    const body = z
      .object({ pinned: z.boolean(), name: z.string().trim().max(40).nullable().optional() })
      .strict()
      .parse(request.body);
    const station = service.pin(id.parse(request.params.id), body.pinned, body.name || null);
    if (!station) throw notFound("That station");
    return { station };
  });

  app.delete<{ Params: { id: string } }>("/api/heard/stations/:id", async (request): Promise<HeardClearResponse> => {
    const result = service.removeStation(id.parse(request.params.id));
    if (!result) throw notFound("That station");
    return result;
  });

  app.post("/api/heard/clear", async (request): Promise<HeardClearResponse> => {
    const body = z
      .object({ source: source.optional(), before: time.optional() })
      .strict()
      .parse(request.body ?? {});
    return service.clear(body);
  });

  app.get("/api/heard/reports", async (request): Promise<HeardReportsResponse> => {
    const query = z
      .object({ receiverId: id.optional(), stationId: id.optional(), from: time.optional(), to: time.optional() })
      .parse(request.query);
    return service.reports(query);
  });

  app.get("/api/heard/range-tests", async (): Promise<RangeTestsResponse> => ({ tests: service.rangeTests() }));

  app.post("/api/heard/range-tests", async (request): Promise<RangeTestsResponse> => {
    const body = z
      .object({
        name: z.string().trim().min(1, "Give the test a name.").max(60),
        receiverId: id.nullable(),
        stationId: id.nullable(),
        from: time,
        to: time,
      })
      .strict()
      .refine((value) => value.to > value.from, "The end of the test must be after its start.")
      .parse(request.body);
    service.addRangeTest(body);
    return { tests: service.rangeTests() };
  });

  app.delete<{ Params: { id: string } }>("/api/heard/range-tests/:id", async (request): Promise<RangeTestsResponse> => {
    if (!service.removeRangeTest(id.parse(request.params.id))) throw notFound("That range test");
    return { tests: service.rangeTests() };
  });

  app.post("/api/heard/pi", async (request) => {
    mustBeLocal(request);
    const body = z
      .object({
        decoder: z.enum(PI_DECODERS),
        action: z.enum(["start", "stop", "refresh"]),
        device: z.string().regex(DEVICE_PATTERN).nullable().optional(),
      })
      .strict()
      .parse(request.body);
    await pi.request(body);
    return receivers(request);
  });
}
