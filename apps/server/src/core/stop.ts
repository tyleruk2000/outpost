/**
 * Stopping the process: on SIGINT or SIGTERM, and when the server restarts itself.
 *
 * `app.close()` does the orderly part (see the close hooks in app.ts): stop accepting,
 * end the streams that never end by themselves, give requests in flight a few seconds,
 * stop jobs so that they resume, close the database. This adds the part only the process
 * can do: exit when that is done, and exit anyway if it has not finished in time. A stop
 * that hangs is worse than one that is abrupt: `docker stop` waits ten seconds and then
 * kills, and a stop script that waits on the process never returns. Nothing is lost by
 * the abrupt one that a power cut would not also lose; the database is written so that
 * it survives both.
 */
import type { FastifyInstance } from "fastify";

/** The whole stop, from being asked to the process ending. Under Docker's ten seconds. */
export const EXIT_LIMIT_MS = 8_000;

/**
 * Closes the server and ends the process with `code`. If closing fails or runs out of
 * time the process still ends: with `code` when that is not zero (a restart must still
 * be a restart), and with 1 otherwise.
 */
export function closeThenExit(app: FastifyInstance, code: number): void {
  const unclean = code === 0 ? 1 : code;
  const giveUp = setTimeout(() => {
    app.log.error(`the server had not finished stopping after ${EXIT_LIMIT_MS / 1000} seconds; ending the process anyway`);
    process.exit(unclean);
  }, EXIT_LIMIT_MS);
  app.close().then(
    () => {
      clearTimeout(giveUp);
      process.exit(code);
    },
    (error) => {
      app.log.error({ err: error }, "the server did not stop cleanly");
      process.exit(unclean);
    },
  );
}
