/**
 * The application context: the handful of long-lived objects every module needs.
 *
 * Modules add their own service to `Services` by declaration merging and assign it in
 * their `register` function, so no central file has to know every module:
 *
 *   declare module "../../core/context.ts" {
 *     interface Services { documents: DocumentsService }
 *   }
 */
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.ts";
import type { Db, Sqlite } from "../db/client.ts";
import type { EventBus } from "./events.ts";
import type { JobQueue } from "./jobs.ts";

// biome-ignore lint/suspicious/noEmptyInterface: extended by modules through declaration merging
export interface Services {}

export interface AppContext {
  config: Config;
  db: Db;
  sqlite: Sqlite;
  events: EventBus;
  jobs: JobQueue;
  log: FastifyBaseLogger;
  services: Services;
  /**
   * Aborted the moment the server is asked to stop, while requests in flight are still
   * being answered. Anything that holds a connection open for as long as the other end
   * likes (the live-events stream, a reply being written) ends it on this; otherwise the
   * server waits for it and then cuts it (see `DRAIN_LIMIT_MS` in app.ts).
   */
  stopping: AbortSignal;
  /** Callbacks run in reverse order when the server shuts down, once no request is in flight. */
  onClose: Array<() => void | Promise<void>>;
}
