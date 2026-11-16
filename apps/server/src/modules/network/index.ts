/**
 * Devices on this network (Tools): what answers on the networks the computer running
 * Outpost is itself attached to. Discovery only, slow and bounded; see `scan.ts` for
 * exactly what is sent and docs/tools-qr-and-network.md for the whole of it.
 *
 * Starting a scan is open to anyone who can reach Outpost, like every other action
 * here: it shows nothing a device on the same network could not find out for itself
 * by doing the same. docs/security.md has the reasoning and its limits.
 */
import { NETWORK_TEXT_LIMITS } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { toJobDto } from "../../core/jobs.ts";
import { contentDisposition } from "../notes/attachments.ts";
import { createNetworkService, type NetworkService } from "./service.ts";

declare module "../../core/context.ts" {
  interface Services {
    network: NetworkService;
  }
}

const idParams = z.object({ id: z.string().min(1).max(64) });
const patchBody = z
  .object({
    label: z.string().max(NETWORK_TEXT_LIMITS.label).optional(),
    note: z.string().max(NETWORK_TEXT_LIMITS.note).optional(),
  })
  .strict();

export async function registerNetwork(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createNetworkService(ctx);
  ctx.services.network = service;

  app.get("/api/network", async () => service.status());

  // No body: what is scanned is decided on the server from this computer's own interfaces, never by the request.
  app.post("/api/network/scan", async () => ({ job: toJobDto(service.startScan()) }));

  app.patch<{ Params: { id: string } }>("/api/network/devices/:id", async (request) => ({
    device: service.update(idParams.parse(request.params).id, patchBody.parse(request.body)),
  }));

  app.delete<{ Params: { id: string } }>("/api/network/devices/:id", async (request) => {
    service.forget(idParams.parse(request.params).id);
    return { ok: true };
  });

  app.delete("/api/network/devices", async () => ({ removed: service.eraseAll() }));

  /** The list as a CSV file, only when asked for. A plain GET so that a phone's browser saves it. */
  app.get("/api/network/devices.csv", async (_request, reply) => {
    const day = new Date().toISOString().slice(0, 10);
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("Content-Disposition", contentDisposition("attachment", `Devices on this network ${day}.csv`))
      .send(service.csv());
  });

  app.post("/api/network/makers", async () => ({ job: toJobDto(service.fetchMakers()) }));

  app.delete("/api/network/makers", async () => {
    service.removeMakers();
    return { ok: true };
  });
}
