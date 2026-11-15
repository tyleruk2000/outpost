/** HTTP for network shares. The password arrives in a request body and goes nowhere but the mount. */
import type { MountedSharesResponse, NetworkSharesResponse, ServerSharesResponse } from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../../core/context.ts";
import { createSharesService } from "./service.ts";

/** How often to try again for a share whose server was not there at start-up (a NAS that boots slowly). */
const RETRY_INTERVAL_MS = 5 * 60 * 1000;
/** How long start-up waits for remembered shares before carrying on without them. */
const STARTUP_WAIT_MS = 8_000;

const confirm = z.object({ confirm: z.boolean().optional() }).optional();

/**
 * Who is asking a server for something. The user name and password are checked by the
 * service, with its own words: a validation message must never repeat a password.
 */
const signIn = {
  server: z.string().trim().min(1).max(300),
  port: z.number().int().min(1).max(65535).nullish(),
  userName: z.string().max(100).optional(),
  password: z.string().optional(),
  guest: z.boolean().optional(),
};

export async function registerShares(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const shares = createSharesService(ctx);
  ctx.services.shares = shares;

  app.get("/api/storage/shares", async (): Promise<NetworkSharesResponse> => {
    return { mode: shares.deps.mode, shares: await shares.list(), hints: shares.hints() };
  });

  app.get("/api/storage/shares/discover", async () => shares.discover());

  // The shared folders a server offers, so one can be picked instead of typed.
  app.post("/api/storage/shares/list", async (request): Promise<ServerSharesResponse> => {
    return shares.serverShares(z.object(signIn).parse(request.body));
  });

  // Network volumes connected on this Mac already, by Outpost or from the Finder.
  app.get("/api/storage/shares/mounted", async (): Promise<MountedSharesResponse> => ({ mounts: await shares.mounted() }));

  app.post("/api/storage/shares/adopt", async (request) => {
    const body = z.object({ mountPath: z.string().min(1).max(1000) }).parse(request.body);
    return shares.adopt(body.mountPath);
  });

  app.post("/api/storage/shares", async (request) => {
    const body = z
      .object({ ...signIn, share: z.string().min(1).max(100), rememberPassword: z.boolean().default(false) })
      .parse(request.body);
    return shares.connect(body);
  });

  app.post<{ Params: { id: string } }>("/api/storage/shares/:id/reconnect", async (request) => {
    const body = z
      .object({ password: z.string().optional(), rememberPassword: z.boolean().optional() })
      .optional()
      .parse(request.body ?? undefined);
    return shares.reconnect(request.params.id, body ?? {});
  });

  app.post<{ Params: { id: string } }>("/api/storage/shares/:id/disconnect", async (request) => {
    const body = confirm.parse(request.body ?? undefined);
    return shares.disconnect(request.params.id, { confirm: body?.confirm === true });
  });

  app.delete<{ Params: { id: string }; Querystring: { confirm?: string } }>("/api/storage/shares/:id", async (request) => {
    await shares.forget(request.params.id, { confirm: request.query.confirm === "true" });
    return { ok: true };
  });

  if (ctx.config.env === "test" || shares.deps.mode !== "macos") return;

  // Bring back the shares that were connected before, so the library on them is there
  // from the start. Start-up does not wait long for a server that is slow or away.
  const reconnect = () =>
    shares.reconnectRemembered().catch((error) => ctx.log.error({ err: error }, "reconnecting network shares failed"));
  let wait: NodeJS.Timeout | undefined;
  await Promise.race([
    reconnect(),
    new Promise<void>((resolve) => {
      wait = setTimeout(resolve, STARTUP_WAIT_MS);
    }),
  ]);
  clearTimeout(wait);
  const timer = setInterval(reconnect, RETRY_INTERVAL_MS);
  timer.unref();
  ctx.onClose.push(() => clearInterval(timer));
}
