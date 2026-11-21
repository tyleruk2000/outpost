/**
 * The device Outpost runs on: a status screen of everything that can go wrong with it,
 * its clock, and its figures for Prometheus. See docs/device.md.
 *
 * /metrics is off unless Outpost was started with OUTPOST_METRICS=true, and then answers
 * only connections from this computer and private networks (the address blocks the
 * HTTPS module's certificate authority is limited to). It is a `GET` outside /api/, held
 * to the Host check like every other address, and it changes nothing.
 */
import type { DeviceStatus, ServerClock, SetClockResult } from "@outpost/shared";
import { sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";
import { VERSION } from "../../core/version.ts";
import { jobs } from "../../db/schema.ts";
import { lastDownloadedBackup } from "../backup/index.ts";
import { inBlock, PRIVATE_BLOCKS, parseName } from "../https/names.ts";
import { SPACE_RESERVE_BYTES } from "../storage/service.ts";
import { type ClockDeps, clockSetting, defaultClockDeps, setClock } from "./clock.ts";
import {
  type ListDir,
  listSystemDir,
  type ReadFile,
  readCardWear,
  readMemory,
  readSystemFile,
  readTemperature,
  readThrottling,
} from "./hardware.ts";
import { METRICS_CONTENT_TYPE, MetricsText } from "./metrics.ts";
import {
  backupCheck,
  cardChecks,
  databaseCheck,
  jobsCheck,
  memoryCheck,
  powerCheck,
  restoreTestCheck,
  slownessCheck,
  storageChecks,
  temperatureCheck,
} from "./status.ts";
import { createVitals, type Vitals } from "./vitals.ts";

export interface DeviceService {
  vitals: Vitals;
  /** Replaceable in tests: how the clock is set, and where the system's files are read from. */
  clock: ClockDeps;
  system: { read: ReadFile; list: ListDir };
}

declare module "../../core/context.ts" {
  interface Services {
    device: DeviceService;
  }
}

const setClockBody = z.object({ deviceNow: z.number().finite() }).strict();

/** Whether an address belongs to this computer or a private network. */
export function isPrivateAddress(address: string | undefined): boolean {
  if (!address) return false;
  const plain = address.toLowerCase().startsWith("::ffff:") && address.includes(".") ? address.slice(7) : address;
  const name = parseName(plain);
  return name?.kind === "ip" && PRIVATE_BLOCKS.some((block) => inBlock(name.bytes, block));
}

/** The addresses a proxy says a request came from. Each must be private too. */
function forwardedAddresses(request: FastifyRequest): string[] {
  const found: string[] = [];
  const forwardedFor = request.headers["x-forwarded-for"];
  for (const value of [forwardedFor, request.headers["x-real-ip"]].flat())
    if (typeof value === "string") found.push(...value.split(",").map((part) => part.trim()));
  const forwarded = request.headers.forwarded;
  if (typeof forwarded === "string")
    for (const match of forwarded.matchAll(/for="?\[?([^\]";,]+)/gi)) found.push((match[1] ?? "").replace(/:\d+$/, ""));
  return found.filter(Boolean);
}

export async function registerDevice(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const vitals = createVitals({ jobsRunning: () => ctx.jobs.list({ states: ["running"], limit: 1 }).length > 0 });
  const service: DeviceService = { vitals, clock: defaultClockDeps(ctx), system: { read: readSystemFile, list: listSystemDir } };
  ctx.services.device = service;
  ctx.onClose.push(() => vitals.close());

  // Every request is work: the event-loop delay is measured while there is any (vitals.ts).
  app.addHook("onRequest", async () => {
    vitals.touch();
  });
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions?.url;
    // The live-events stream is open for as long as the tab is: its "time" says nothing about the server.
    if (!route || route === "/api/events") return;
    vitals.answered(request.method, route, reply.elapsedTime / 1000);
  });

  async function status(request: FastifyRequest): Promise<DeviceStatus> {
    const now = Date.now();
    const { read, list } = service.system;
    const database = await ctx.services.database.status(request);
    const downloaded = lastDownloadedBackup(ctx);
    const throttling = readThrottling(read);
    const counts = ctx.db
      .select({ state: jobs.state, n: sql<number>`count(*)` })
      .from(jobs)
      .where(
        sql`${jobs.state} in ('queued', 'running', 'paused') or (${jobs.state} = 'failed' and ${jobs.finishedAt} > ${now - 86_400_000})`,
      )
      .groupBy(jobs.state)
      .all();
    const count = (state: string) => counts.find((row) => row.state === state)?.n ?? 0;
    const eventLoop = vitals.eventLoop();
    const checks = [
      ...storageChecks(ctx.services.storage.list() as never, SPACE_RESERVE_BYTES),
      databaseCheck(database),
      backupCheck(database.backup, downloaded?.at ?? null, now, ctx.services.backups.overview()),
      restoreTestCheck(ctx.services.backups.overview(), now),
      ...cardChecks(readCardWear(read, list)),
      memoryCheck(readMemory(read)),
      temperatureCheck(readTemperature(read, list), throttling),
      powerCheck(throttling),
      jobsCheck({ running: count("running"), queued: count("queued"), paused: count("paused"), failedToday: count("failed") }),
      slownessCheck(vitals.worstSince(60), eventLoop.measuring),
    ].filter((check) => check !== null);
    return { checkedAt: now, checks, eventLoop };
  }

  app.get("/api/device/status", async (request): Promise<DeviceStatus> => status(request));

  app.get(
    "/api/device/clock",
    async (request): Promise<ServerClock> => ({
      now: Date.now(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      setting: clockSetting(request.raw, ctx, service.clock),
    }),
  );

  app.post("/api/device/clock", async (request): Promise<SetClockResult> => {
    const body = setClockBody.parse(request.body);
    return setClock(request.raw, ctx, service.clock, body.deviceNow);
  });

  // ── Prometheus ──
  app.get("/metrics", async (request, reply) => {
    if (!ctx.config.metrics)
      throw new AppError("not_found", "Outpost's figures for Prometheus are off. Start Outpost with OUTPOST_METRICS=true to turn them on.");
    const from = request.raw.socket.remoteAddress;
    if (!isPrivateAddress(from) || !forwardedAddresses(request).every(isPrivateAddress))
      throw new AppError("forbidden", "Outpost's figures are given only to this computer and the local network.");
    const now = Date.now();
    const { read, list } = service.system;
    const text = new MetricsText();
    text.add("outpost_info", "gauge", "This Outpost: its version, always 1.", [{ labels: { version: VERSION }, value: 1 }]);
    text.add("outpost_uptime_seconds", "gauge", "How long the server has been running.", [{ value: Math.round(process.uptime()) }]);
    text.requestTimes("outpost_http_request_duration_seconds", "How long requests took to answer, by route.", vitals.routes());

    const loop = vitals.eventLoop();
    const minute = loop.minutes.at(-1);
    const fresh = minute && now - minute.at < 2 * 60_000;
    text.add("outpost_event_loop_measuring", "gauge", "1 while the event-loop delay is being measured (while there is work).", [
      { value: loop.measuring ? 1 : 0 },
    ]);
    text.add("outpost_event_loop_delay_max_seconds", "gauge", "The worst hold-up of the server's thread in the current minute.", [
      { value: fresh ? minute.worstMs / 1000 : 0 },
    ]);
    text.add("outpost_event_loop_delay_mean_seconds", "gauge", "The mean hold-up of the server's thread in the current minute.", [
      { value: fresh ? minute.meanMs / 1000 : 0 },
    ]);

    const jobRows = ctx.db
      .select({ state: jobs.state, queue: jobs.queue, n: sql<number>`count(*)` })
      .from(jobs)
      .groupBy(jobs.state, jobs.queue)
      .all();
    text.add(
      "outpost_jobs",
      "gauge",
      "Background jobs, by state and queue, as the jobs table holds them.",
      jobRows.map((row) => ({ labels: { state: row.state, queue: row.queue }, value: row.n })),
    );
    const speed = ctx.services.downloads
      .unfinished()
      .map((row) => ctx.services.downloads.toDto(row).bytesPerSecond ?? 0)
      .reduce((sum, value) => sum + value, 0);
    text.add("outpost_download_bytes_per_second", "gauge", "Total speed of the downloads transferring now.", [{ value: speed }]);

    const locations = ctx.services.storage.list();
    const locationLabels = (row: (typeof locations)[number]) => ({ location: row.id, name: row.name, kind: row.kind });
    text.add(
      "outpost_storage_location_up",
      "gauge",
      "1 when the storage location is connected (a network share answering), 0 when not.",
      locations.map((row) => ({ labels: locationLabels(row), value: row.status === "available" ? 1 : 0 })),
    );
    text.add(
      "outpost_storage_location_free_bytes",
      "gauge",
      "Free space on the storage location, as last checked.",
      locations.filter((row) => row.freeBytes !== null).map((row) => ({ labels: locationLabels(row), value: row.freeBytes ?? 0 })),
    );
    text.add(
      "outpost_storage_location_size_bytes",
      "gauge",
      "Size of the drive the storage location is on, as last checked.",
      locations.filter((row) => row.totalBytes !== null).map((row) => ({ labels: locationLabels(row), value: row.totalBytes ?? 0 })),
    );

    const database = await ctx.services.database.status(request);
    text.add("outpost_database_bytes", "gauge", "Size of the database file and its write-ahead log.", [
      { labels: { file: "main" }, value: database.file.bytes },
      { labels: { file: "wal" }, value: database.file.walBytes },
    ]);
    const downloaded = lastDownloadedBackup(ctx);
    const backups = [
      ...(database.backup.lastAt !== null ? [{ labels: { kind: "stored" }, value: database.backup.lastAt / 1000 }] : []),
      ...(downloaded ? [{ labels: { kind: "downloaded" }, value: downloaded.at / 1000 }] : []),
    ];
    text.add("outpost_backup_last_timestamp_seconds", "gauge", "When the last backup was made, in seconds since 1970.", backups);
    text.add(
      "outpost_backup_age_seconds",
      "gauge",
      "How long ago the last backup was made.",
      backups.map((sample) => ({ labels: sample.labels, value: Math.round(now / 1000 - sample.value) })),
    );

    const memory = readMemory(read);
    text.add("outpost_process_memory_bytes", "gauge", "Memory Outpost's process uses (resident set).", [{ value: memory.processBytes }]);
    text.add("outpost_system_memory_available_bytes", "gauge", "Memory free for programs on the computer.", [
      { value: memory.availableBytes },
    ]);
    const temperature = readTemperature(read, list);
    text.add(
      "outpost_temperature_celsius",
      "gauge",
      "The processor's temperature, where the system gives it.",
      temperature ? [{ labels: { sensor: temperature.sensor }, value: temperature.celsius }] : [],
    );
    return reply.type(METRICS_CONTENT_TYPE).header("Cache-Control", "no-store").send(text.toString());
  });
}
