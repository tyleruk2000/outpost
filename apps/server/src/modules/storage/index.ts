import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { createStorageService, defaultLocationPath, type LocationRow } from "./service.ts";
import { registerShares } from "./shares/routes.ts";

const kind = z.enum(["internal", "external", "network", "volume"]);

function toDto(row: LocationRow) {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    kind: row.kind,
    isDefault: row.isDefault,
    status: row.status,
    statusDetail: row.statusDetail,
    totalBytes: row.totalBytes,
    freeBytes: row.freeBytes,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  };
}

export async function registerStorage(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const storage = createStorageService(ctx);
  ctx.services.storage = storage;
  const { settings } = ctx.services;

  // First start: create one location so that uploads and downloads have somewhere to go.
  if (storage.list().length === 0) {
    await storage.add({ name: "Internal storage", path: defaultLocationPath(ctx), kind: "internal", makeDefault: true });
  }
  await storage.refresh();
  // Network shares remembered from before are connected again here, which can bring
  // locations back; registerShares re-checks them when it has.
  await registerShares(app, ctx);

  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(
      () => storage.refresh().catch((error) => ctx.log.error({ err: error }, "storage check failed")),
      settings.get("storage.checkIntervalSeconds") * 1000,
    );
    timer.unref();
  };
  schedule();
  settings.onChange(schedule);
  ctx.onClose.push(() => clearInterval(timer));

  app.get("/api/storage/locations", async () => {
    const usage = new Map(storage.usage().map((entry) => [entry.locationId, entry]));
    return {
      roots: ctx.config.storageRoots,
      locations: storage.list().map((row) => ({
        ...toDto(row),
        usage: usage.get(row.id) ?? { locationId: row.id, byKind: {}, totalBytes: 0 },
      })),
    };
  });

  app.post("/api/storage/refresh", async () => {
    return { locations: (await storage.refresh()).map(toDto) };
  });

  app.get<{ Querystring: { path?: string } }>("/api/storage/browse", async (request) => {
    return storage.browse(request.query.path);
  });

  app.post("/api/storage/folders", async (request) => {
    const body = z
      .object({
        parent: z.string().min(1),
        name: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[^/\\:*?"<>|.][^/\\:*?"<>|]*$/, "That name contains characters a folder cannot have."),
      })
      .parse(request.body);
    // browse() enforces the roots; creating the folder is add()'s job once it is chosen.
    const listing = await storage.browse(body.parent);
    return { path: `${listing.path}/${body.name}` };
  });

  app.post("/api/storage/locations", async (request) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(80),
        path: z.string().min(1).max(1000),
        kind,
        makeDefault: z.boolean().optional(),
      })
      .parse(request.body);
    return { location: toDto(await storage.add(body)) };
  });

  app.patch<{ Params: { id: string } }>("/api/storage/locations/:id", async (request) => {
    const body = z
      .object({ name: z.string().trim().min(1).max(80).optional(), kind: kind.optional(), isDefault: z.literal(true).optional() })
      .parse(request.body);
    return { location: toDto(storage.update(request.params.id, body)) };
  });

  app.delete<{ Params: { id: string } }>("/api/storage/locations/:id", async (request) => {
    storage.remove(request.params.id);
    return { ok: true };
  });
}
