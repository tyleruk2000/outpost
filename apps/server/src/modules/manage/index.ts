/**
 * One place to see everything Outpost is storing, remove what is not wanted, and clean
 * up. This module owns no content of its own. It reads what the other modules hold,
 * measures what is on disk, and removes things only through the services that own them.
 *
 * Every change here is an action a person chose and confirmed. The one that destroys
 * things that cannot be downloaded again, "erase everything", is accepted only from
 * the computer Outpost runs on (see `core/local.ts`) unless the person starting Outpost
 * set OUTPOST_ALLOW_REMOTE_ERASE.
 */
import { type CleanupStatus, ERASE_CONFIRMATION, type ManageMoveResponse } from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, messageOf } from "../../core/errors.ts";
import { type JobRow, toJobDto } from "../../core/jobs.ts";
import { localBy } from "../../core/local.ts";
import { createCleanup, MANAGE_QUEUE } from "./cleanup.ts";
import { createInventory } from "./inventory.ts";
import { createLeftovers } from "./leftovers.ts";
import { createSurveyor } from "./survey.ts";
import { createUsage } from "./usage.ts";

const ERASE_OPTION = "OUTPOST_ALLOW_REMOTE_ERASE";

const keys = z
  .array(
    z
      .string()
      .max(120)
      .regex(/^(collection|document):[0-9A-Za-z_-]+$/, "That is not something in the list."),
  )
  .min(1, "Choose at least one item.")
  .max(50_000);
const disconnected = z.enum(["forget", "leave"]).default("leave");

const planBody = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("items"), keys, files: z.enum(["delete", "keep"]).default("delete"), disconnected }).strict(),
  z.object({ scope: z.literal("downloaded"), disconnected }).strict(),
  z.object({ scope: z.literal("everything") }).strict(),
]);

export async function registerManage(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { storage, collections } = ctx.services;
  const survey = createSurveyor(ctx);
  const inventory = createInventory(ctx, () => survey.latest()?.missingDocuments ?? new Set<string>());
  const cleanup = createCleanup(ctx, inventory, survey);
  const leftovers = createLeftovers(ctx, inventory, survey);
  const usage = createUsage(ctx, inventory, survey, cleanup);
  ctx.jobs.setConcurrency(MANAGE_QUEUE, 1);

  // Anything that adds, removes or moves content makes the last count out of date.
  const stale = new Set(["collections.changed", "documents.changed", "download.removed", "storage.changed"]);
  const unsubscribe = ctx.events.subscribe((event) => {
    if (stale.has(event.type)) survey.touch();
  });
  ctx.onClose.push(unsubscribe);

  /** Whether this request may erase everything, and on what grounds. */
  function eraseRight(request: FastifyRequest): CleanupStatus["erase"] {
    if (ctx.config.allowRemoteErase) return { allowed: true, reason: "option", option: ERASE_OPTION };
    const by = localBy(request, ctx.config);
    return by
      ? { allowed: true, reason: "local", option: ERASE_OPTION, localBy: by }
      : { allowed: false, reason: "remote", option: ERASE_OPTION };
  }

  // ── What is taking the space ──

  app.get("/api/manage/usage", async () => {
    survey.ensure();
    return usage();
  });

  /** Count again now, rather than wait for the last count to grow old. */
  app.post("/api/manage/measure", async () => {
    await storage.refresh();
    survey.ensure({ force: true });
    return usage();
  });

  // ── Everything installed ──

  app.get("/api/manage/items", async () => {
    survey.ensure();
    return { items: inventory.entries().map((entry) => entry.item) };
  });

  /** What a removal would do, by the same rules as the removal itself. Changes nothing. */
  app.post("/api/manage/plan", async (request) => cleanup.plan(planBody.parse(request.body)));

  app.post("/api/manage/remove", async (request) => {
    const body = z
      .object({ keys, files: z.enum(["delete", "keep"]).default("delete"), disconnected })
      .strict()
      .parse(request.body);
    // A person's own files cannot be fetched again. Deleting several in one step is
    // erasing, held to the same rule: another device may delete them one at a time.
    if (body.files === "delete" && !eraseRight(request).allowed) {
      const own = inventory.pick(body.keys).entries.filter((entry) => entry.item.origin === "own");
      if (own.length > 1) {
        throw new AppError(
          "forbidden",
          `Deleting several of your own files at once can only be done on the computer Outpost runs on. From this device, remove them one at a time, or start Outpost with ${ERASE_OPTION}=true.`,
        );
      }
    }
    return { job: toJobDto(cleanup.startRemove({ scope: "items", ...body })) };
  });

  /**
   * Moves the chosen items to another location with the verified move jobs the Library
   * uses: one job per collection, and one for all the documents chosen. Whatever cannot
   * be moved is named with the reason, and the rest goes ahead.
   */
  app.post("/api/manage/move", async (request): Promise<ManageMoveResponse> => {
    const body = z
      .object({ keys, locationId: z.string().min(1).max(100) })
      .strict()
      .parse(request.body);
    const target = storage.get(body.locationId);
    if (target.status !== "available") throw new AppError("storage_unavailable", `"${target.name}" is not connected.`);
    const picked = inventory.pick(body.keys).entries;
    const refused: ManageMoveResponse["refused"] = [];
    const refuse = (entry: (typeof picked)[number], reason: string) =>
      refused.push({ key: entry.item.key, title: entry.item.title, reason });

    const movable = picked.filter((entry) => {
      const { item } = entry;
      if (item.locationId === target.id) refuse(entry, `It is already on "${target.name}".`);
      else if (item.busyReason) refuse(entry, item.busyReason);
      else if (!item.locationAvailable) refuse(entry, `"${item.locationName}" is not connected, so it cannot be copied from there.`);
      else if (item.state === "missing") refuse(entry, "Its file is missing, so there is nothing to move.");
      else if (item.state === "damaged") refuse(entry, "It no longer matches its checksum. Check it before moving it.");
      else return true;
      return false;
    });
    if (movable.length === 0) return { jobs: [], refused };
    // Each job checks room for itself; this checks room for all of them together.
    await storage.assertSpace(
      target.id,
      movable.reduce((sum, entry) => sum + entry.item.sizeBytes, 0),
    );

    const jobs: JobRow[] = [];
    const documentIds: string[] = [];
    for (const entry of movable) {
      if (!entry.collection) {
        documentIds.push(...entry.documents.map((document) => document.id));
        continue;
      }
      try {
        jobs.push(await collections.move(entry.collection.id, target.id));
        // A document that is the collection's own file, or a chapter inside a book's
        // folder, follows it. Any that is a file of its own is moved as a document.
        const { locationId, relPath } = entry.collection;
        for (const document of entry.documents) {
          const travels =
            document.locationId === locationId && (document.relPath === relPath || document.relPath.startsWith(`${relPath}/`));
          if (!travels) documentIds.push(document.id);
        }
      } catch (error) {
        refuse(entry, messageOf(error));
      }
    }
    if (documentIds.length > 0) {
      try {
        jobs.push((await ctx.services.documentMoves.start(target.id, documentIds)).job);
      } catch (error) {
        for (const entry of movable) if (!entry.collection) refuse(entry, messageOf(error));
      }
    }
    return { jobs: jobs.map(toJobDto), refused };
  });

  // ── Leftovers ──

  app.get("/api/manage/leftovers", async () => {
    survey.ensure();
    return leftovers.list();
  });

  app.post("/api/manage/leftovers/clear", async (request) => {
    const body = z
      .object({ ids: z.array(z.string().min(1).max(2000)).min(1, "Choose at least one thing to clear.").max(5000) })
      .strict()
      .parse(request.body);
    return leftovers.clear(body.ids);
  });

  // ── The clean-ups ──

  app.get("/api/manage/cleanup", async (request): Promise<CleanupStatus> => {
    const { active, last } = cleanup.jobs();
    return {
      erase: eraseRight(request),
      derived: cleanup.derivedStatus(),
      active: active ? toJobDto(active) : null,
      last: last ? toJobDto(last) : null,
    };
  });

  app.post("/api/manage/cleanup/downloaded", async (request) => {
    const body = z.object({ disconnected }).strict().parse(request.body);
    return { job: toJobDto(cleanup.startRemove({ scope: "downloaded", ...body })) };
  });

  app.post("/api/manage/cleanup/derived", async (request) => {
    const body = z
      .object({
        steps: z
          .array(z.enum(["vectors", "text", "compact"]))
          .min(1, "Choose what to clear or rebuild.")
          .max(3),
      })
      .strict()
      .parse(request.body);
    // Compacting last, so that it gives back what the other steps freed.
    const order = ["vectors", "text", "compact"] as const;
    return { job: toJobDto(cleanup.startDerived(order.filter((step) => body.steps.includes(step)))) };
  });

  app.post("/api/manage/cleanup/everything", async (request) => {
    // Before anything else, including reading what was sent: where the request came from.
    if (!eraseRight(request).allowed) {
      throw new AppError(
        "forbidden",
        `Erasing everything can only be started on the computer Outpost runs on. To allow it from other devices, start Outpost with ${ERASE_OPTION}=true.`,
      );
    }
    const body = z
      .object({ confirm: z.string().max(100) })
      .strict()
      .parse(request.body);
    if (body.confirm.trim().toLowerCase() !== ERASE_CONFIRMATION) {
      throw badRequest(`Type "${ERASE_CONFIRMATION}" to confirm. Nothing was erased.`);
    }
    return { job: toJobDto(cleanup.startErase()) };
  });
}
