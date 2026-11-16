/**
 * The one place the multipart parser is registered.
 *
 * Every module that takes an uploaded file calls `registerMultipart`; the first call
 * registers the parser and the rest find it there (registering it twice is an error).
 * The limit it is registered with is the same whoever calls first, and it is small on
 * purpose: a route says what it takes with its own `limits` on `request.parts(...)`,
 * `request.file(...)` or `request.files(...)`, and one that forgot to would be held to
 * a megabyte, not to whatever another module happens to allow. `test/core-multipart.test.ts`
 * holds the modules to both halves of that.
 */
import fastifyMultipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

/** The most a file may be on a route that gives no limit of its own. No route should rely on it. */
export const DEFAULT_UPLOAD_FILE_BYTES = 1024 * 1024;

export async function registerMultipart(app: FastifyInstance): Promise<void> {
  if (app.hasContentTypeParser("multipart/form-data")) return;
  await app.register(fastifyMultipart, { limits: { fileSize: DEFAULT_UPLOAD_FILE_BYTES } });
}
