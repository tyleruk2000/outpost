/**
 * Mesh radio: the routes. The rules are in `service.ts`; this file validates what is
 * asked and holds the set-up to the computer Outpost runs on.
 *
 * Turning a way in on or off, choosing a serial device and opening the broker's port are
 * accepted only from that computer (`core/local.ts`), because each opens a port or a
 * device on it; the passwords set with them then never cross the network either. Every
 * device may see the status and send a test message, as it may post on any channel.
 * Whoever starts Outpost may allow it from every device with OUTPOST_ALLOW_REMOTE_SETTINGS
 * (`core/setting-right.ts`; the older OUTPOST_ALLOW_REMOTE_ERASE still does too); in a
 * container, where no request looks local, that is the way.
 */
import {
  BOARD_LIMITS,
  CHANNEL_PATTERN,
  MESH_DEFAULT_PORTS,
  type MeshDevicesResponse,
  type MeshResponse,
  type MeshRight,
  meshTransportOf,
} from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { badRequest } from "../../core/errors.ts";
import { settingRefusal, settingRight } from "../../core/setting-right.ts";
import { listDevices, platformOf } from "./serial.ts";
import { createMeshService } from "./service.ts";
import { MOST_CA_CHARS } from "./store.ts";

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
      .object({
        host: z.string().max(253),
        port,
        userName: z.string().max(64),
        password,
        rootTopic: z.string().max(100),
        tls: z.boolean().optional(),
        ca: z.string().max(MOST_CA_CHARS).nullable().optional(),
      })
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

const findBody = z.object({ host: z.string().trim().max(253).optional(), port: port.optional() }).strict();
const brokerTestBody = z
  .object({
    host: z.string().max(253),
    port,
    userName: z.string().max(64),
    password,
    rootTopic: z.string().max(100),
    tls: z.boolean(),
    ca: z.string().max(MOST_CA_CHARS).nullable().optional(),
  })
  .strict();
const radioAccountBody = z.object({ userName: z.string().trim().min(1).max(64), password: z.string().max(128) }).strict();

export async function registerMesh(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createMeshService(ctx);
  ctx.services.mesh = service;

  const right = (request: FastifyRequest): MeshRight => settingRight(request.raw, ctx.config, { legacy: true });
  const mustBeLocal = (request: FastifyRequest) => {
    const answer = right(request);
    if (!answer.allowed) throw settingRefusal("The mesh radio set-up", "it opens a port or a device on that computer", answer.inContainer);
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

  // The household's own broker (household.ts). Each connects out only when a person presses its button,
  // and only for whoever may change the set-up: they sign in with its passwords, or try addresses from here.
  app.post("/api/mesh/broker/find", async (request) => {
    mustBeLocal(request);
    const input = findBody.parse(request.body ?? {});
    return service.findBrokers(input.host ? { host: input.host, port: input.port ?? MESH_DEFAULT_PORTS.mqtt } : undefined);
  });

  app.post("/api/mesh/broker/test", async (request) => {
    mustBeLocal(request);
    return service.testBroker(brokerTestBody.parse(request.body));
  });

  app.post("/api/mesh/broker/dynsec", async (request) => {
    mustBeLocal(request);
    return service.dynsec();
  });

  app.post("/api/mesh/broker/radio-account", async (request) => {
    mustBeLocal(request);
    return service.addRadioAccount(radioAccountBody.parse(request.body));
  });

  /** A short test message on a radio channel: posted on the board like any other, so it is seen, refused or sent the same way. */
  app.post("/api/mesh/test", async (request) => {
    const input = testBody.parse(request.body);
    if (!meshTransportOf(input.channel) || !service.response().channels.some((channel) => channel.id === input.channel))
      throw badRequest("That is not a radio channel carried now.");
    return { message: ctx.services.board.post({ channel: input.channel, author: input.author, body: "Test message from Outpost" }) };
  });
}
