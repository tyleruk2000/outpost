/**
 * Updating Outpost itself: Settings, Updates. See docs/updating.md for the person and
 * docs/development/releases.md for how releases are made and signed.
 *
 * What Outpost can do depends on how it is installed (`InstallKind`). A container cannot
 * replace itself: the program it runs is the image it was started from. So on Docker,
 * Outpost checks a release and keeps it in the data directory, makes a backup, and hands
 * it to a small service on the host that deploy/pi/install.sh adds (deploy/pi/update.sh).
 * That service checks the signature again with its own copy of the key, loads the
 * image, starts it, and starts the version before again if the new one is not healthy
 * within three minutes. It answers in a file Outpost reads when it next starts.
 *
 * The folder `update` in the data directory:
 *   helper        written by install.sh: the service is there
 *   staged/       the checked release: release.json, its signature, the image, staged.json
 *   incoming/     an upload or download being received, until it is checked
 *   pending.json  the update handed to the service: its id, release and backup
 *   request       "<id> <release>", the service's one line of input
 *   result        "<id> <ok|rolled-back|failed> <release> <words>", its answer
 *   last.json     what the last update did, once its answer has been read
 *   before-*.zip  the backup made before each update
 *
 * Checking for a newer version is an outbound request, made only when a person presses
 * the button. Installing replaces the program everyone uses, so it is held to the rule
 * restoring a backup is (`backup/right.ts`).
 */
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  type InstallKind,
  RELEASE_FILE_EXTENSION,
  type ReleaseFileOnStorage,
  type ReleaseInfo,
  type StagedRelease,
  type UpdateResult,
  type UpdateStatus,
} from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, messageOf, networkSentence } from "../../core/errors.ts";
import { resolveInside } from "../../core/fs-safe.ts";
import { createHttpClient } from "../../core/http.ts";
import { newId } from "../../core/ids.ts";
import { type JobRow, PermanentJobError, toJobDto } from "../../core/jobs.ts";
import { VERSION } from "../../core/version.ts";
import { startBackup, verifyBackupFile } from "../backup/archive.ts";
import { assertBackupRight, backupRight } from "../backup/right.ts";
import { detectHost } from "../storage/shares/host.ts";
import type { PublicKey } from "./minisign.ts";
import { checkManifest, compareReleases, MAX_IMAGE_BYTES, ReleaseRefused, releaseKey, thisPlatform, unpackRelease } from "./release.ts";
import { RELEASE_KEY } from "./release-key.ts";

export const UPDATE_PREPARE_JOB = "update.prepare";
export const UPDATE_APPLY_JOB = "update.apply";
const QUEUE = "update";
const SUBJECT = "update";
/** How long the service on the host is given to answer before the screen says it has not. */
export const HELPER_SILENT_MS = 15 * 60 * 1000;
const MAX_SMALL = 256 * 1024;
const FOLDER_ON_STORAGE = "outpost-updates";

type PreparePayload =
  | { source: "upload"; file: string }
  | { source: "storage"; locationId: string; relPath: string }
  | { source: "online"; url: string };

interface Pending {
  id: string;
  release: string;
  from: string;
  requestedAt: number;
  backupName: string | null;
}

export interface UpdateService {
  /** Replaceable in tests. */
  deps: { inContainer: boolean; platform: string; key: () => PublicKey | null };
  /** Reads the host service's answer, if one has come. Run at start and on each status. */
  settle(): void;
}

declare module "../../core/context.ts" {
  interface Services {
    update: UpdateService;
  }
}

export async function registerUpdate(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const root = path.join(ctx.config.dataDir, "update");
  const staged = path.join(root, "staged");
  const incoming = path.join(root, "incoming");
  await fs.promises.mkdir(root, { recursive: true });
  let latest: UpdateStatus["latest"] = null;

  const service: UpdateService = {
    deps: {
      inContainer: detectHost().inContainer,
      platform: thisPlatform(),
      key: () => {
        try {
          return releaseKey(ctx.config.releaseKey, RELEASE_KEY);
        } catch {
          return null;
        }
      },
    },
    settle,
  };
  ctx.services.update = service;
  const changed = () => ctx.events.publish({ type: "update.changed" });

  function install(): InstallKind {
    if (ctx.config.portable) return "portable";
    if (service.deps.inContainer) return fs.existsSync(path.join(root, "helper")) ? "docker-helper" : "docker";
    return "source";
  }

  function requireKey(): PublicKey {
    const key = service.deps.key();
    if (!key)
      throw new AppError(
        "conflict",
        "This build of Outpost has no release key, so no release can be checked. Releases are not signed yet; update the way your installation is updated by hand.",
      );
    return key;
  }

  const readJson = <T>(file: string): T | null => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as T;
    } catch {
      return null;
    }
  };
  const writeJson = async (file: string, value: unknown) => {
    await fs.promises.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2));
    await fs.promises.rename(`${file}.tmp`, file);
  };

  const readStaged = () => readJson<StagedRelease>(path.join(staged, "staged.json"));

  function settle(): void {
    const pending = readJson<Pending>(path.join(root, "pending.json"));
    if (!pending) return;
    let line = "";
    try {
      const stat = fs.lstatSync(path.join(root, "result"));
      if (stat.isFile() && stat.size < 4096) line = fs.readFileSync(path.join(root, "result"), "utf8").trim();
    } catch {
      return;
    }
    const [id, outcome, release, ...words] = line.split(" ");
    if (id !== pending.id || !["ok", "rolled-back", "failed"].includes(outcome ?? "")) return;
    const result: UpdateResult = {
      at: Date.now(),
      outcome: outcome as UpdateResult["outcome"],
      release: release && release !== "-" ? release : pending.release,
      message: words.join(" ").slice(0, 500) || (outcome === "ok" ? `Outpost ${pending.release} started healthy.` : ""),
      backupName: pending.backupName,
    };
    fs.writeFileSync(path.join(root, "last.json"), JSON.stringify(result, null, 2));
    fs.rmSync(path.join(root, "pending.json"), { force: true });
    fs.rmSync(path.join(root, "result"), { force: true });
    // Installed: the copy kept for installing is not needed. Not installed: it stays, to try again or remove.
    if (result.outcome === "ok") fs.rmSync(staged, { recursive: true, force: true });
    ctx.log.info({ result }, "update finished");
    changed();
  }
  settle();

  function active(): JobRow | undefined {
    return ctx.jobs
      .findBySubject(SUBJECT)
      .filter((job) => job.state === "queued" || job.state === "running" || job.state === "paused")
      .at(-1);
  }

  function status(request: FastifyRequest): UpdateStatus {
    settle();
    const job = active();
    return {
      current: VERSION,
      install: install(),
      keyed: service.deps.key() !== null,
      checkUrl: ctx.config.updateUrl,
      latest,
      staged: readStaged(),
      lastResult: readJson<UpdateResult>(path.join(root, "last.json")),
      waiting: waitingFor(),
      active: job ? toJobDto(job) : null,
      right: backupRight(request, ctx),
    };
  }

  /** An update handed to the service and not answered yet. */
  function waitingFor(): UpdateStatus["waiting"] {
    const pending = readJson<Pending>(path.join(root, "pending.json"));
    if (!pending) return null;
    return { release: pending.release, since: pending.requestedAt, silent: Date.now() - pending.requestedAt > HELPER_SILENT_MS };
  }

  // ── Checking a release and keeping it ──

  async function stage(file: string, source: StagedRelease["source"], signal: AbortSignal): Promise<StagedRelease> {
    const key = requireKey();
    const work = path.join(root, `checking-${newId()}`);
    await fs.promises.mkdir(work);
    try {
      const info = await unpackRelease(file, work, key, service.deps.platform, signal);
      if (compareReleases(info.release, VERSION) <= 0)
        throw new ReleaseRefused(`It is Outpost ${info.release}, and this is ${VERSION} already. Only a newer release is installed.`);
      const record: StagedRelease = { ...info, stagedAt: Date.now(), source };
      await writeJson(path.join(work, "staged.json"), record);
      await fs.promises.rm(staged, { recursive: true, force: true });
      await fs.promises.rename(work, staged);
      return record;
    } catch (error) {
      await fs.promises.rm(work, { recursive: true, force: true });
      throw error;
    }
  }

  async function fetchSmall(url: string, signal: AbortSignal): Promise<Buffer> {
    const client = createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads });
    try {
      const { response } = await client.fetch(url, { signal });
      if (!response.ok) throw new AppError("upstream", `The release page answered ${response.status} for ${url}.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_SMALL) throw new AppError("upstream", "The release page sent far more than a release manifest.");
      return bytes;
    } catch (error) {
      const sentence = networkSentence(error, "The release page");
      throw sentence ? new AppError("offline", sentence) : error;
    } finally {
      await client.close();
    }
  }

  async function download(url: string, target: string, signal: AbortSignal, onBytes: (bytes: number) => void): Promise<void> {
    const client = createHttpClient({ allowPrivate: ctx.config.allowPrivateDownloads });
    try {
      const { response } = await client.fetch(url, { signal });
      if (!response.ok || !response.body) throw new AppError("upstream", `The release file could not be fetched (${response.status}).`);
      let seen = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          seen += chunk.length;
          onBytes(seen);
          done(seen > MAX_IMAGE_BYTES + MAX_SMALL * 2 ? new AppError("upstream", "The release file is larger than one is.") : null, chunk);
        },
      });
      await pipeline(response.body as unknown as NodeJS.ReadableStream, limit, fs.createWriteStream(target, { flags: "wx" }), { signal });
    } finally {
      await client.close();
    }
  }

  ctx.jobs.register<PreparePayload>(UPDATE_PREPARE_JOB, {
    queue: QUEUE,
    async run(run) {
      const payload = run.payload;
      await fs.promises.mkdir(incoming, { recursive: true });
      let file: string;
      let temporary: string | null = null;
      try {
        if (payload.source === "upload") {
          file = resolveInside(incoming, payload.file);
          temporary = file;
        } else if (payload.source === "storage") {
          file = await ctx.services.storage.resolveFollowingLinks(payload.locationId, payload.relPath);
        } else {
          temporary = path.join(incoming, `${newId()}.part`);
          file = temporary;
          run.progress({ message: "Fetching the release file" });
          await download(payload.url, temporary, run.signal, (bytes) =>
            run.progress({ current: bytes, message: "Fetching the release file" }),
          );
        }
        run.progress({ message: "Checking its signature and checksum" });
        const record = await stage(file, payload.source, run.signal);
        changed();
        return { release: record.release };
      } catch (error) {
        if (run.signal.aborted) throw error;
        if (error instanceof ReleaseRefused || error instanceof AppError) throw new PermanentJobError(messageOf(error));
        throw new PermanentJobError(`The release file could not be checked: ${messageOf(error)}`);
      } finally {
        if (temporary) await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
        changed();
      }
    },
  });

  // ── Installing ──

  /** A backup of everything Outpost owns, written beside the update and read back. Named in the answer. */
  async function backUpFirst(release: string, signal: AbortSignal): Promise<string> {
    const backup = await startBackup(ctx);
    const name = `before-${release}-${new Date().toISOString().replace(/[:.]/g, "-")}.zip${backup.fileKey ? ".enc" : ""}`;
    const file = path.join(root, name);
    try {
      await pipeline(backup.output, fs.createWriteStream(file, { flags: "wx" }), { signal });
      await verifyBackupFile(file, ctx.config.dataDir, signal, backup.fileKey ? { fileKey: backup.fileKey } : undefined);
    } catch (error) {
      await fs.promises.rm(file, { force: true });
      throw error;
    } finally {
      backup.fileKey?.fill(0);
      backup.cleanup();
    }
    // Only the newest two are kept: each is a whole backup, and the data directory is often an SD card.
    const older = (await fs.promises.readdir(root)).filter((entry) => /^before-.*\.zip(\.enc)?$/.test(entry) && entry !== name).sort();
    for (const entry of older.slice(0, Math.max(0, older.length - 1))) await fs.promises.rm(path.join(root, entry), { force: true });
    return name;
  }

  ctx.jobs.register<{ release: string }>(UPDATE_APPLY_JOB, {
    queue: QUEUE,
    async run(run) {
      const record = readStaged();
      if (!record || record.release !== run.payload.release)
        throw new PermanentJobError("The release to install is not kept here any more.");
      if (install() !== "docker-helper") throw new PermanentJobError("The update service is not installed on this computer.");
      run.progress({ message: "Making a backup first" });
      let backupName: string;
      try {
        backupName = await backUpFirst(record.release, run.signal);
      } catch (error) {
        if (run.signal.aborted) throw error;
        throw new PermanentJobError(`Nothing was changed: the backup made first did not work. ${messageOf(error)}`);
      }
      run.signal.throwIfAborted();
      const id = newId().replace(/[^A-Za-z0-9]/g, "");
      const pending: Pending = { id, release: record.release, from: VERSION, requestedAt: Date.now(), backupName };
      await writeJson(path.join(root, "pending.json"), pending);
      await fs.promises.rm(path.join(root, "result"), { force: true });
      // Written under another name and renamed, so that the service never reads half a line.
      await fs.promises.writeFile(path.join(root, "request.tmp"), `${id} ${record.release}\n`);
      await fs.promises.rename(path.join(root, "request.tmp"), path.join(root, "request"));
      changed();
      // The service now loads the image and replaces this container; the job's part is done.
      return { release: record.release, backupName };
    },
  });

  // ── Routes ──

  app.get("/api/update/status", async (request) => status(request));

  /** "Check for a newer version": the one outbound request, made because a person pressed for it. */
  app.post("/api/update/check", async (request) => {
    const key = requireKey();
    const signal = AbortSignal.timeout(30_000);
    try {
      const text = await fetchSmall(`${ctx.config.updateUrl}/latest.json`, signal);
      const signature = (await fetchSmall(`${ctx.config.updateUrl}/latest.json.minisig`, signal)).toString("utf8");
      const { info } = checkManifest(text, signature, key, service.deps.platform);
      const newer = compareReleases(info.release, VERSION) > 0;
      latest = { at: Date.now(), release: info, newer, message: null };
    } catch (error) {
      latest = { at: Date.now(), release: null, newer: false, message: messageOf(error) };
    }
    return status(request);
  });

  /** Fetches the release the last check found, then checks and keeps it. */
  app.post("/api/update/download", async (request) => {
    assertBackupRight(request, ctx, "Updating Outpost");
    requireKey();
    if (active()) throw conflict("An update is already being fetched or installed.");
    const signal = AbortSignal.timeout(30_000);
    const text = await fetchSmall(`${ctx.config.updateUrl}/latest.json`, signal);
    const signature = (await fetchSmall(`${ctx.config.updateUrl}/latest.json.minisig`, signal)).toString("utf8");
    const { info, manifest } = checkManifest(text, signature, requireKey(), service.deps.platform);
    const url = manifest.platforms[service.deps.platform]?.url;
    if (!url) throw new AppError("upstream", `The release page names no release file for ${service.deps.platform}.`);
    if (compareReleases(info.release, VERSION) <= 0) throw conflict(`This is Outpost ${VERSION}, the newest release.`);
    const job = ctx.jobs.enqueue<PreparePayload>(
      UPDATE_PREPARE_JOB,
      { source: "online", url },
      { title: `Fetch Outpost ${info.release}`, subject: SUBJECT },
    );
    return { job: toJobDto(job) };
  });

  // A release file sent as the request body, written straight to the data directory.
  app.addContentTypeParser("application/vnd.outpost.update", (_request, payload, done) => done(null, payload));
  app.post(
    "/api/update/upload",
    {
      bodyLimit: MAX_IMAGE_BYTES + MAX_SMALL * 4,
      // Refused before the body is read: the server does not receive a file it will not use.
      onRequest: async (request) => {
        assertBackupRight(request, ctx, "Updating Outpost");
        requireKey();
        if ((request.headers["content-type"] ?? "") !== "application/vnd.outpost.update")
          throw new AppError("unsupported", "Send the release file with Content-Type application/vnd.outpost.update.");
        if (active()) throw conflict("An update is already being fetched or installed.");
      },
    },
    async (request) => {
      const body = request.body as NodeJS.ReadableStream | undefined;
      if (!body || typeof body.pipe !== "function") throw badRequest("Send the release file as the request body.");
      await fs.promises.mkdir(incoming, { recursive: true });
      const name = `${newId()}.upload`;
      await pipeline(body, fs.createWriteStream(path.join(incoming, name), { flags: "wx" }));
      const job = ctx.jobs.enqueue<PreparePayload>(
        UPDATE_PREPARE_JOB,
        { source: "upload", file: name },
        { title: "Check a release file", subject: SUBJECT },
      );
      return { job: toJobDto(job) };
    },
  );

  /** Release files on connected storage: at the top of each location, and in its outpost-updates folder. */
  app.get("/api/update/files", async (): Promise<{ files: ReleaseFileOnStorage[] }> => {
    const files: ReleaseFileOnStorage[] = [];
    for (const location of ctx.services.storage.list()) {
      if (location.status !== "available") continue;
      for (const folder of ["", FOLDER_ON_STORAGE]) {
        let names: string[] = [];
        try {
          names = await fs.promises.readdir(ctx.services.storage.resolve(location.id, folder));
        } catch {
          continue;
        }
        for (const name of names.filter((entry) => entry.endsWith(RELEASE_FILE_EXTENSION))) {
          const relPath = folder ? `${folder}/${name}` : name;
          const stat = await fs.promises.stat(ctx.services.storage.resolve(location.id, relPath)).catch(() => undefined);
          if (stat?.isFile()) files.push({ locationId: location.id, locationName: location.name, relPath, bytes: stat.size });
        }
      }
    }
    return { files };
  });

  const fromStorageBody = z.object({ locationId: z.string().min(1).max(100), relPath: z.string().min(1).max(1000) }).strict();
  app.post("/api/update/from-storage", async (request) => {
    assertBackupRight(request, ctx, "Updating Outpost");
    requireKey();
    const body = fromStorageBody.parse(request.body);
    if (!body.relPath.endsWith(RELEASE_FILE_EXTENSION)) throw badRequest(`A release file's name ends ${RELEASE_FILE_EXTENSION}.`);
    await ctx.services.storage.resolveFollowingLinks(body.locationId, body.relPath);
    if (active()) throw conflict("An update is already being fetched or installed.");
    const job = ctx.jobs.enqueue<PreparePayload>(
      UPDATE_PREPARE_JOB,
      { source: "storage", ...body },
      { title: "Check a release file", subject: SUBJECT },
    );
    return { job: toJobDto(job) };
  });

  app.post("/api/update/apply", async (request) => {
    assertBackupRight(request, ctx, "Updating Outpost");
    const record = readStaged();
    if (!record) throw conflict("No release has been checked and kept to install.");
    if (install() !== "docker-helper")
      throw new AppError(
        "conflict",
        "Outpost cannot install it here by itself. The steps for this kind of installation are on the screen.",
      );
    if (waitingFor()) throw conflict("An update has already been handed to the update service.");
    if (active()) throw conflict("An update is already being fetched or installed.");
    const job = ctx.jobs.enqueue(
      UPDATE_APPLY_JOB,
      { release: record.release },
      { title: `Install Outpost ${record.release}`, subject: SUBJECT },
    );
    return { job: toJobDto(job) };
  });

  /** Removes the release kept for installing (Outpost's own files in its data directory, nothing else). */
  app.delete("/api/update/staged", async (request) => {
    assertBackupRight(request, ctx, "Updating Outpost");
    if (waitingFor()) throw conflict("The update service is installing it now.");
    await fs.promises.rm(staged, { recursive: true, force: true });
    changed();
    return status(request);
  });

  /** Stages the backup made before the last update, exactly as a restore from Settings would. */
  const restoreBody = z.object({ passphrase: z.string().min(1).max(1024).optional() }).strict();
  app.post("/api/update/restore-before", async (request) => {
    assertBackupRight(request, ctx, "Restoring a backup");
    const { passphrase } = restoreBody.parse(request.body ?? {});
    const last = readJson<UpdateResult>(path.join(root, "last.json"));
    if (!last?.backupName) throw conflict("No backup was made before an update here.");
    const file = resolveInside(root, last.backupName);
    if (!fs.existsSync(file)) throw conflict("The backup made before the update is not there any more.");
    return ctx.services.backups.stage(file, passphrase, request);
  });
}

export type { ReleaseInfo };
