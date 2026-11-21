/**
 * Messages: the household board's routes. The rules are in `service.ts`, the files in
 * `files.ts`, and how a transport joins in `transport.ts`; this file validates what is
 * asked, holds each address to the limits, and shapes the answer.
 *
 * Every route that changes something is a POST, PATCH or DELETE, so the request guard
 * (`core/guard.ts`) holds it to the `X-Outpost-Request` header and the same origin.
 */
import fs from "node:fs";
import { BOARD_CHANNEL, BOARD_LIMITS, CHANNEL_PATTERN, formatBytes } from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, notFound } from "../../core/errors.ts";
import { pathExists } from "../../core/fs-safe.ts";
import { registerMultipart } from "../../core/multipart.ts";
import { contentDisposition } from "../notes/attachments.ts";
import { RateLimit } from "./rate.ts";
import { createBoardService } from "./service.ts";

export type { BoardService } from "./service.ts";
export type { BoardTransport, IncomingMessage } from "./transport.ts";

/** The same policy as the library's originals and the notes' attachments: an origin of its own, nothing loaded, nothing run. */
const FILE_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'";

const channel = z.string().regex(CHANNEL_PATTERN, "That is not a channel.").default(BOARD_CHANNEL);
const name = z.string().max(BOARD_LIMITS.name * 4);
const body = z.string().max(BOARD_LIMITS.body * 2);
const place = z
  .string()
  .max(BOARD_LIMITS.place * 2)
  .nullable();
const status = z.enum(["safe", "help", "other"]);
const position = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(1_000_000).nullable(),
  })
  .strict()
  .nullable();
const idParams = z.object({ id: z.string().min(1).max(64) });

const postBody = z.object({ author: name, body, channel }).strict();
const checkInBody = z
  .object({
    author: name,
    status,
    body: body.default(""),
    place: place.optional(),
    position: position.optional(),
    channel,
    writtenAt: z.number().int().min(0).optional(),
    clientId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/, "That is not an id a phone gives.")
      .optional(),
  })
  .strict();
const rollCallQuery = z.object({ since: z.coerce.number().int().min(0).optional() });
const askBody = z
  .object({
    by: name,
    note: z.string().max(400).default(""),
    alsoOn: z.array(z.string().regex(CHANNEL_PATTERN, "That is not a channel.")).max(8).default([]),
  })
  .strict();
const editBody = z
  .object({ by: name, body: body.optional(), place: place.optional(), status: status.optional(), baseUpdatedAt: z.number().int() })
  .strict();
const removeBody = z.object({ by: name }).strict();
const listQuery = z.object({
  channel,
  before: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const summaryQuery = z.object({ since: z.coerce.number().int().min(0).optional() });
const fileFields = z.object({ author: name, body: body.default(""), channel });

/** Parser limits arrive as plain errors; say what the limit was. */
function describeLimit(error: unknown, fileBytes: number): unknown {
  const code = (error as { code?: string } | null)?.code;
  if (code === "FST_REQ_FILE_TOO_LARGE")
    return new AppError("too_large", `That file is larger than ${formatBytes(fileBytes)}, the most a file sent on the board can be.`);
  if (code === "FST_FILES_LIMIT") return badRequest("Send one file at a time.");
  if (code === "FST_PARTS_LIMIT" || code === "FST_FIELDS_LIMIT")
    return badRequest("This request has more parts than a file sent on the board has.");
  return error;
}

export async function registerBoard(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await registerMultipart(app);
  const service = createBoardService(ctx);
  ctx.services.board = service;

  const posts = new RateLimit(BOARD_LIMITS.postsPerMinute, 60_000, "That is a lot of messages from one device in a minute.");
  const sends = new RateLimit(BOARD_LIMITS.filesPerHour, 60 * 60_000, "That is a lot of files from one device in an hour.");
  const from = (request: FastifyRequest) => request.ip || "unknown";

  app.get("/api/board/messages", async (request) => {
    const query = listQuery.parse(request.query);
    return service.list(query);
  });

  app.get("/api/board/summary", async (request) => service.summary(summaryQuery.parse(request.query).since));

  app.get("/api/board/messages/:id", async (request) => ({ message: service.get(idParams.parse(request.params).id) }));

  app.post("/api/board/messages", async (request) => {
    const input = postBody.parse(request.body);
    posts.take(from(request));
    return { message: service.post(input) };
  });

  app.post("/api/board/check-ins", async (request) => {
    const input = checkInBody.parse(request.body);
    posts.take(from(request));
    return { message: service.checkIn({ ...input, place: input.place ?? null, position: input.position ?? null }) };
  });

  /** The roll call: everyone's latest check-in, and who has checked in since a time (by default the latest ask). */
  app.get("/api/board/roll-call", async (request) => service.rollCall(rollCallQuery.parse(request.query).since));

  /** Asks everyone to check in, on the board and on any radio channels named. */
  app.post("/api/board/roll-calls", async (request) => {
    const input = askBody.parse(request.body);
    posts.take(from(request));
    return service.askRollCall(input);
  });

  app.patch("/api/board/messages/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const input = editBody.parse(request.body);
    posts.take(from(request));
    return { message: service.edit(id, input) };
  });

  app.post("/api/board/messages/:id/remove", async (request) => {
    const { id } = idParams.parse(request.params);
    const input = removeBody.parse(request.body);
    posts.take(from(request));
    return { message: await service.remove(id, input.by) };
  });

  /**
   * One file as `multipart/form-data`, with `author`, an optional `body` (a line about
   * it) and `channel` as fields before the file.
   */
  app.post("/api/board/files", async (request) => {
    if (!request.isMultipart()) throw badRequest("Send the file as a form upload.");
    sends.take(from(request));
    const { limits } = service.files;
    const length = Number(request.headers["content-length"] ?? 0);
    if (length > limits.fileBytes + 64 * 1024) {
      throw new AppError(
        "too_large",
        `That file is larger than ${formatBytes(limits.fileBytes)}, the most a file sent on the board can be.`,
      );
    }
    const space = await fs.promises.statfs(ctx.config.dataDir).catch(() => undefined);
    // Room for the file and a margin, so that the database is never the thing that runs out.
    if (space && length > 0 && space.bavail * space.bsize < length + 256 * 1024 * 1024) {
      throw new AppError(
        "insufficient_space",
        `There is not room for this file in Outpost's data folder. ${formatBytes(space.bavail * space.bsize)} is free.`,
      );
    }
    const fields: Record<string, string> = {};
    let sent: Awaited<ReturnType<typeof service.sendFile>> | undefined;
    try {
      // One byte over the limit is let through so that the store can say "too large" in its own words.
      for await (const part of request.parts({ limits: { fileSize: limits.fileBytes + 1, files: 1, fields: 5, parts: 6 } })) {
        if (part.type === "file") {
          if (sent) {
            part.file.resume();
            continue;
          }
          const parsed = fileFields.safeParse(fields);
          if (!parsed.success) {
            part.file.resume();
            throw badRequest("Send the name, and any words with the file, before the file itself.");
          }
          sent = await service.sendFile({ ...parsed.data, stream: part.file, filename: part.filename || "file" });
        } else if (typeof part.value === "string" && ["author", "body", "channel"].includes(part.fieldname)) {
          fields[part.fieldname] = part.value;
        }
      }
    } catch (error) {
      throw describeLimit(error, limits.fileBytes);
    }
    if (!sent) throw badRequest("No file was received. Choose a file and try again.");
    return { message: sent };
  });

  /** Always a download. A checked picture keeps its type so the board can show it; anything else is sent as bytes to save. */
  app.get("/api/board/files/:id", async (request, reply) => {
    const { row, path: file } = service.fileOf(idParams.parse(request.params).id);
    if (!(await pathExists(file))) throw notFound("The file");
    const etag = `"${row.sha256}"`;
    reply
      .header("Content-Security-Policy", FILE_CSP)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, no-cache")
      .header("ETag", etag);
    if (request.headers["if-none-match"] === etag) return reply.status(304).send();
    return reply
      .header("Content-Type", row.mime)
      .header("Content-Length", row.sizeBytes)
      .header("Content-Disposition", contentDisposition("attachment", row.filename))
      .send(fs.createReadStream(file));
  });

  /** "Add to library": the file goes the way any file added to the library goes, copied, with the board's file left as it is. */
  app.post("/api/board/files/:id/library", async (request) => {
    const { row, path: file, message } = service.fileOf(idParams.parse(request.params).id);
    const when = new Date(row.createdAt).toISOString().slice(0, 10);
    const outcome = await ctx.services.documents.ingestFile({
      sourcePath: file,
      originalName: row.filename,
      source: `Sent on the household board${message ? ` by ${message.author}` : ""} on ${when}`,
    });
    return outcome;
  });
}
