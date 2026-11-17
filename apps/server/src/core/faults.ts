/**
 * What the process does with a fault nothing else caught. Outpost is meant to be left on
 * for months, often with nobody watching its terminal.
 *
 * - A promise rejected with nobody to hear it (a background check that failed, a stream
 *   that broke) is logged, with its stack, and the server carries on. It ends only the
 *   piece of work it came from; ending the process for it would cut off everyone else
 *   and, with nothing to restart it, leave Outpost off until someone noticed.
 * - An exception thrown with nothing to catch it may have left any part of the server
 *   half-way through a change, so carrying on is not safe. It is logged, and the server
 *   stops in order as for SIGTERM (requests in flight finish, jobs are left to resume,
 *   the database is closed) and exits with code 1, for Docker's restart policy or
 *   whatever else supervises it to start it again.
 */
import type { FastifyInstance } from "fastify";
import { closeThenExit } from "./stop.ts";

interface FaultSource {
  on(event: "uncaughtException", listener: (error: Error) => void): unknown;
  on(event: "unhandledRejection", listener: (reason: unknown) => void): unknown;
}

export function watchForFaults(app: FastifyInstance, source: FaultSource = process, stop = closeThenExit): void {
  let stopping = false;
  source.on("unhandledRejection", (reason) => {
    app.log.error({ err: reason }, "a promise was rejected and nothing handled it; the server carries on");
  });
  source.on("uncaughtException", (error) => {
    app.log.fatal({ err: error }, stopping ? "another uncaught exception while stopping" : "uncaught exception; the server is stopping");
    if (stopping) return;
    stopping = true;
    stop(app, 1);
  });
}
