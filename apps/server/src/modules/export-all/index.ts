/**
 * "Take everything out": one zip of a household's own things in open formats, with a
 * README saying what each folder is, for leaving Outpost or reading them anywhere else.
 * A backup holds the same things but only Outpost can read it.
 *
 * It says how large it will be first (`GET /api/export-all/estimate`), then runs as a
 * job on the `export` queue, one at a time. The zip is written under a temporary name
 * and takes its own once it is whole: into `outpost-exports/` on a storage location,
 * or into the data directory's `exports/` folder to be downloaded. Only the file of the
 * newest export kept for downloading is held there: making another, or pressing
 * "Remove", deletes it. Nothing else is ever deleted.
 */
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  EXPORT_FOLDER,
  EXPORT_SECTIONS,
  type ExportEstimate,
  type ExportResult,
  type ExportSection,
  type ExportStatus,
} from "@outpost/shared";
import { ZipArchive } from "archiver";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, conflict, notFound } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import { type JobRow, PermanentJobError, toJobDto } from "../../core/jobs.ts";
import { VERSION } from "../../core/version.ts";
import { addEntry } from "../notes/export.ts";
import { SECTIONS } from "./sections.ts";

export const EXPORT_JOB = "export-all.run";
const QUEUE = "export";
const SUBJECT = "export-all";
/** Under the data directory: the file of an export made for downloading. */
const DOWNLOADS = "exports";

const startBody = z
  .object({
    destination: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("download") }).strict(),
      z.object({ kind: z.literal("location"), locationId: z.string().min(1).max(100) }).strict(),
    ]),
    include: z.array(z.enum(EXPORT_SECTIONS)).min(1).max(EXPORT_SECTIONS.length).optional(),
  })
  .strict();

interface RunPayload extends Record<string, unknown> {
  destination: { kind: "download" } | { kind: "location"; locationId: string };
  include: ExportSection[];
}

const stampOf = (at: number) => new Date(at).toISOString().slice(0, 16).replace(/[:T]/g, "-");
const fileNameOf = (at: number) => `outpost-export-${stampOf(at)}.zip`;

async function estimate(ctx: AppContext, include: readonly ExportSection[] = EXPORT_SECTIONS): Promise<ExportEstimate> {
  const sections = [];
  for (const section of SECTIONS) {
    if (!include.includes(section.id)) continue;
    sections.push({ id: section.id, label: section.label, format: section.format, ...(await section.estimate(ctx)) });
  }
  return { sections, totalBytes: sections.reduce((sum, section) => sum + section.bytes, 0) };
}

function readme(now: number, done: Array<{ id: ExportSection; count: number }>, leftOut: string[]): string {
  const lines = [
    "# Your things from Outpost",
    "",
    `Exported on ${new Date(now).toISOString().slice(0, 16).replace("T", " ")} UTC by Outpost ${VERSION}.`,
    "",
    "Every file here is in an open format that other programs read. This is not a backup: Outpost restores only its own backup files (Settings, Backup).",
    "",
    "## What each folder is",
    "",
  ];
  for (const section of SECTIONS) {
    const made = done.find((entry) => entry.id === section.id);
    if (!made || made.count === 0) continue;
    lines.push(`### ${section.id}/: ${section.label} (${section.format})`, "", section.readme, "");
  }
  const empty = SECTIONS.filter((section) => done.some((entry) => entry.id === section.id && entry.count === 0)).map(
    (section) => section.label,
  );
  if (empty.length > 0) lines.push(`Nothing to export, so no folder: ${empty.join(", ")}.`, "");
  const notChosen = SECTIONS.filter((section) => !done.some((entry) => entry.id === section.id)).map((section) => section.label);
  lines.push("## Left out", "");
  if (notChosen.length > 0) lines.push(`- Not chosen for this export: ${notChosen.join(", ")}.`);
  for (const item of leftOut) lines.push(`- ${item}`);
  lines.push(
    "- Reference collections, maps, terrain and other downloads: they came from elsewhere and can be downloaded again.",
    "- Settings, search indexes and other things only Outpost uses: a backup holds those.",
    "",
  );
  return lines.join("\n");
}

export async function registerExportAll(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { storage } = ctx.services;
  const downloads = path.join(ctx.config.dataDir, DOWNLOADS);
  const changed = () => ctx.events.publish({ type: "export-all.changed" });

  const latestJob = (): JobRow | undefined => ctx.jobs.list({ types: [EXPORT_JOB], limit: 1 })[0];
  const activeJob = (): JobRow | undefined => ctx.jobs.list({ types: [EXPORT_JOB], states: ["queued", "running", "paused"], limit: 1 })[0];

  /** The file kept for downloading for a job, when there is one. */
  const downloadFile = (jobId: string) => resolveInside(downloads, `${jobId}.zip`);

  /** Removes every file kept for downloading but `keep`'s. Only Outpost's own files of exports, in its own folder. */
  async function clearDownloads(keep?: string): Promise<void> {
    const names = await fs.promises.readdir(downloads).catch(() => [] as string[]);
    for (const name of names) {
      if (!/^[A-Za-z0-9_-]+\.zip(\.part)?$/.test(name) || name === `${keep}.zip`) continue;
      await fs.promises.rm(path.join(downloads, name), { force: true }).catch(() => undefined);
    }
  }

  ctx.jobs.register<RunPayload>(EXPORT_JOB, {
    queue: QUEUE,
    async run(run) {
      const { destination, include } = run.payload;
      const now = Date.now();
      const name = fileNameOf(now);
      let target: string;
      let locationName: string | undefined;
      const sized = await estimate(ctx, include);
      if (destination.kind === "location") {
        const location = storage.list().find((row) => row.id === destination.locationId);
        if (!location) throw new PermanentJobError("That storage location is no longer one of this Outpost's locations.");
        if (location.status !== "available") throw new PermanentJobError(`"${location.name}" is not connected, so nothing was written.`);
        await storage.assertSpace(location.id, sized.totalBytes);
        const folder = storage.resolve(location.id, EXPORT_FOLDER);
        await fs.promises.mkdir(folder, { recursive: true });
        if (!(await fs.promises.lstat(folder)).isDirectory()) {
          throw new PermanentJobError(`"${EXPORT_FOLDER}" on "${location.name}" is not an ordinary folder, so nothing was written there.`);
        }
        locationName = location.name;
        target = resolveInside(folder, name);
      } else {
        await fs.promises.mkdir(downloads, { recursive: true });
        target = downloadFile(run.job.id);
      }
      const part = `${target}.part`;
      const archive = new ZipArchive({ zlib: { level: 6 } });
      const written = pipeline(archive, fs.createWriteStream(part, { flags: "w" }), { signal: run.signal });
      written.catch(() => undefined);
      const done: Array<{ id: ExportSection; count: number }> = [];
      const leftOut: string[] = [];
      try {
        const chosen = SECTIONS.filter((section) => include.includes(section.id));
        for (const [index, section] of chosen.entries()) {
          run.signal.throwIfAborted();
          run.progress({ current: index, total: chosen.length + 1, message: `Adding ${section.label.toLowerCase()}` });
          const result = await section.write(ctx, archive, section.id, now, run.signal);
          done.push({ id: section.id, count: result.count });
          leftOut.push(...result.leftOut);
        }
        run.progress({ current: chosen.length, total: chosen.length + 1, message: "Finishing the file" });
        await addEntry(archive, readme(now, done, leftOut), "README.md", new Date(now));
        await archive.finalize();
        await written;
        if (destination.kind === "location" && (await fs.promises.lstat(target).catch(() => undefined))) {
          throw conflict(`A file named ${name} is already there.`);
        }
        await fs.promises.rename(part, target);
        // The newest export kept for downloading replaces the one before it.
        if (destination.kind === "download") await clearDownloads(run.job.id);
      } catch (error) {
        archive.abort();
        await fs.promises.rm(part, { force: true }).catch(() => undefined);
        if (run.signal.aborted || error instanceof PermanentJobError) throw error;
        throw new PermanentJobError(
          error instanceof AppError ? error.message : `The export could not be written: ${error instanceof Error ? error.message : error}`,
        );
      }
      const result: ExportResult = {
        name,
        sizeBytes: (await fs.promises.stat(target)).size,
        destination: destination.kind,
        ...(locationName ? { locationName, folder: EXPORT_FOLDER } : { downloadable: true }),
        sections: done,
        leftOut,
      };
      return result as unknown as Record<string, unknown>;
    },
    onSettled: () => changed(),
  });

  app.get("/api/export-all/estimate", async (): Promise<ExportEstimate> => estimate(ctx));

  app.get("/api/export-all", async (): Promise<ExportStatus> => {
    const job = latestJob();
    if (!job) return { latest: null };
    const dto = toJobDto(job);
    const result = dto.result as unknown as ExportResult | null;
    if (result?.destination === "download") {
      result.downloadable = await fs.promises.access(downloadFile(job.id)).then(
        () => true,
        () => false,
      );
    }
    return { latest: dto };
  });

  app.post("/api/export-all", async (request) => {
    const body = startBody.parse(request.body);
    if (activeJob()) throw conflict("An export is already being made.");
    if (body.destination.kind === "location") {
      const location = storage.get(body.destination.locationId);
      if (location.status !== "available") {
        throw new AppError("storage_unavailable", `"${location.name}" is not connected. Connect it, or choose another place.`);
      }
    }
    const include = body.include ?? [...EXPORT_SECTIONS];
    const job = ctx.jobs.enqueue<RunPayload>(
      EXPORT_JOB,
      { destination: body.destination, include },
      { title: "Export everything", subject: SUBJECT, maxAttempts: 1 },
    );
    changed();
    return { job: toJobDto(job) };
  });

  app.get<{ Params: { id: string } }>("/api/export-all/:id/download", async (request, reply) => {
    // A page on another site must not be able to make the browser fetch a household's things.
    const site = request.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") throw new AppError("forbidden", "Download the export from the Outpost app.");
    const job = ctx.jobs.get(request.params.id);
    const result = job ? (toJobDto(job).result as unknown as ExportResult | null) : null;
    if (!job || job.type !== EXPORT_JOB || result?.destination !== "download") throw notFound("That export");
    const file = downloadFile(job.id);
    const stat = await fs.promises.stat(file).catch(() => undefined);
    if (!stat) throw notFound("The file of that export");
    reply
      .header("Content-Type", "application/zip")
      .header("Content-Length", stat.size)
      .header("Content-Disposition", `attachment; filename="${result.name}"`);
    return reply.send(fs.createReadStream(file));
  });

  /** Deletes the file kept on the server for downloading. A file written to a storage location is the person's, and is left alone. */
  app.delete<{ Params: { id: string } }>("/api/export-all/:id/download", async (request) => {
    const job = ctx.jobs.get(request.params.id);
    if (!job || job.type !== EXPORT_JOB) throw notFound("That export");
    await fs.promises.rm(downloadFile(job.id), { force: true });
    changed();
    return { ok: true };
  });
}
