/**
 * Mesh radio: the routes. The rules are in `service.ts`; this file validates what is
 * asked and holds the set-up to the computer Outpost runs on.
 *
 * Turning a way in on or off, choosing a serial device and opening the broker's port are
 * accepted only from that computer (`core/local.ts`), because each opens a port or a
 * device on it; the passwords set with them then never cross the network either. Every
 * device may see the status and send a test message, as it may post on any channel.
 */
import {
  BOARD_LIMITS,
  CHANNEL_PATTERN,
  type MeshDevicesResponse,
  type MeshResponse,
  type MeshRight,
  meshTransportOf,
} from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { localBy } from "../../core/local.ts";
import { listDevices, platformOf } from "./serial.ts";
import { createMeshService } from "./service.ts";

export type { MeshService } from "./service.ts";

const port = z.number().int().min(1).max(65535);
const password = z.string().max(128).optional();
const channelChoice = z.object({ name: z.string().trim().min(1).max(32), index: z.number().int().min(0).max(7) }).strict();

const meshtasticBody = z
  .object({
    mode: z.enum(["off", "broker", "client"]),
    broker: z
      .object({ port, userName: z.string().max(64), password })
      .strict()
      .optional(),
    client: z
      .object({ host: z.string().max(253), port, userName: z.string().max(64), password, rootTopic: z.string().max(100) })
      .strict()
      .optional(),
    channels: z.array(channelChoice).max(8).optional(),
  })
  .strict();

const meshcoreBody = z
  .object({
    mode: z.enum(["off", "serial", "tcp"]),
    device: z.string().max(200).nullable().optional(),
    host: z.string().max(253).optional(),
    port: port.optional(),
    channels: z.array(z.number().int().min(0).max(7)).max(8).optional(),
  })
  .strict();

const testBody = z.object({ channel: z.string().regex(CHANNEL_PATTERN), author: z.string().max(BOARD_LIMITS.name * 4) }).strict();

export async function registerMesh(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createMeshService(ctx);
  ctx.services.mesh = service;

  const right = (request: FastifyRequest): MeshRight => {
    const by = localBy(request.raw, ctx.config);
    return by ? { allowed: true, localBy: by } : { allowed: false };
  };
  const mustBeLocal = (request: FastifyRequest) => {
    if (!right(request).allowed)
      throw new AppError(
        "forbidden",
        "Turning the radio link on or off, choosing a device and opening the broker's port can only be done on the computer Outpost runs on, because they open a port or a device on it.",
      );
  };
  const answer = (request: FastifyRequest): MeshResponse => ({ ...service.response(), right: right(request) });

  app.get("/api/mesh", async (request) => answer(request));

  // Made on the server from the names USB radios get in /dev; nothing from the request is a path.
  app.get("/api/mesh/devices", async (): Promise<MeshDevicesResponse> => ({ devices: listDevices(), platform: platformOf() }));

  app.put("/api/mesh/meshtastic", async (request) => {
    mustBeLocal(request);
    await service.setMeshtastic(meshtasticBody.parse(request.body));
    return answer(request);
  });

  app.put("/api/mesh/meshcore", async (request) => {
    mustBeLocal(request);
    await service.setMeshCore(meshcoreBody.parse(request.body));
    return answer(request);
  });

  /** A short test message on a radio channel: posted on the board like any other, so it is seen, refused or sent the same way. */
  app.post("/api/mesh/test", async (request) => {
    const input = testBody.parse(request.body);
    if (!meshTransportOf(input.channel) || !service.response().channels.some((channel) => channel.id === input.channel))
      throw badRequest("That is not a radio channel carried now.");
    return { message: ctx.services.board.post({ channel: input.channel, author: input.author, body: "Test message from Outpost" }) };
  });
}
