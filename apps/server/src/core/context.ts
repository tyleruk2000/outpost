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
  /** Callbacks run in reverse order when the server shuts down. */
  onClose: Array<() => void | Promise<void>>;
}
