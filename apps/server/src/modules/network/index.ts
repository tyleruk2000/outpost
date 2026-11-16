/**
 * Devices on this network (Tools): what answers on the networks the computer running
 * Outpost is itself attached to. Discovery only, slow and bounded; see `scan.ts` for
 * exactly what is sent and docs/tools-qr-and-network.md for the whole of it.
 *
 * Starting a scan is open to anyone who can reach Outpost, like every other action
 * here: it shows nothing a device on the same network could not find out for itself
 * by doing the same. docs/security.md has the reasoning and its limits. An
 * administrator who would rather only the computer itself started one sets
 * OUTPOST_NETWORK_SCAN_LOCAL_ONLY (`scanRight` below).
 */
import { NETWORK_TEXT_LIMITS, type NetworkScanRight } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { toJobDto } from "../../core/jobs.ts";
import { isLocalRequest, type RequestOrigin } from "../../core/local.ts";
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

const SCAN_OPTION = "OUTPOST_NETWORK_SCAN_LOCAL_ONLY";

/**
 * Who may start a scan. Open to every device unless OUTPOST_NETWORK_SCAN_LOCAL_ONLY is
 * set; then only the computer Outpost runs on, by the same test of where a request
 * comes from that restoring a backup uses (`core/local.ts`). OUTPOST_ALLOW_REMOTE_ERASE
 * does not lift it: the administrator who set this one asked for it specifically.
 */
export function scanRight(request: RequestOrigin, ctx: AppContext): NetworkScanRight {
  if (!ctx.config.network.scanLocalOnly) return { allowed: true, reason: "open" };
  return isLocalRequest(request, ctx.config) ? { allowed: true, reason: "local" } : { allowed: false, reason: "remote" };
}

export async function registerNetwork(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createNetworkService(ctx);
  ctx.services.network = service;

  app.get("/api/network", async (request) => ({ ...(await service.status()), scanRight: scanRight(request, ctx) }));

  // No body: what is scanned is decided on the server from this computer's own interfaces, never by the request.
  app.post("/api/network/scan", async (request) => {
    if (!scanRight(request, ctx).allowed)
      throw new AppError(
        "forbidden",
        `Looking for devices can only be started on the computer Outpost runs on: whoever set up Outpost started it with ${SCAN_OPTION}=true. Open Outpost there to start a scan.`,
      );
    return { job: toJobDto(service.startScan()) };
  });

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
