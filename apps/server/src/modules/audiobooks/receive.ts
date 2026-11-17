/**
 * Receiving the files of an audiobook: one zip, or one or more audio files.
 *
 * Each file is streamed to a folder of its own under the storage location's incoming
 * folder (`documents/.incoming/audiobook-<random>/`), counted, and checked to be what
 * its name says from its first bytes, before anything else is done with it. Nothing is
 * unpacked here: that is the add job's work. A request that fails part-way leaves
 * nothing behind.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { displayName, extensionOf, formatForExt, SNIFF_BYTES } from "../documents/file-types.ts";
import { describeWriteError, INCOMING_DIR, tooLarge } from "../documents/staging.ts";

/** A LibriVox book runs to a few hundred files at most; this is many times that. */
export const MAX_FILES = 1000;
const fieldNames = new Set(["title", "librivoxId", "locationId"]);

export const addFields = z.object({
  title: z.string().trim().max(300).optional(),
  librivoxId: z
    .string()
    .regex(/^\d{1,8}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  locationId: z.string().max(64).optional(),
});

export interface StagedPart {
  /** The name the person's file had. */
  name: string;
  kind: "zip" | "audio";
  /** Its file inside the staging folder. */
  file: string;
}

export interface Received {
  locationId: string;
  /** The staging folder, relative to the storage location. */
  staging: string;
  parts: StagedPart[];
  fields: z.infer<typeof addFields>;
}

const isZipHead = (head: Buffer) => head.length >= 4 && head.readUInt32BE(0) === 0x504b0304;

function kindOf(name: string): "zip" | "audio" {
  const ext = extensionOf(name);
  if (ext === "zip") return "zip";
  if (formatForExt(ext)?.type === "audio") return "audio";
  throw new AppError(
    "unsupported",
    `"${name}" is not a zip or an audio file. An audiobook is added as a zip of its chapters (as LibriVox offers it) or as its audio files (.mp3, .m4a, .m4b, .aac, .ogg, .opus, .flac, .wav).`,
  );
}

function looksRight(kind: "zip" | "audio", name: string, head: Buffer): boolean {
  if (kind === "zip") return isZipHead(head);
  return formatForExt(extensionOf(name))?.matches(head, false) ?? false;
}

/** Streams one part to `file`, checking its first bytes before keeping it. */
async function writePart(
  source: AsyncIterable<Buffer>,
  file: string,
  options: { name: string; kind: "zip" | "audio"; maxBytes: number; truncated: () => boolean },
): Promise<void> {
  const handle = await fs.promises.open(file, "wx");
  let size = 0;
  let head: Buffer[] | undefined = [];
  const check = () => {
    const bytes = Buffer.concat(head ?? []);
    head = undefined;
    if (bytes.length === 0) throw badRequest(`"${options.name}" is empty (0 bytes), so there is nothing to add.`);
    if (!looksRight(options.kind, options.name, bytes.subarray(0, SNIFF_BYTES))) {
      throw new AppError(
        "unsupported",
        `"${options.name}" is named like ${options.kind === "zip" ? "a zip" : "an audio file"}, but its contents are not one. Check that it opens on your computer.`,
      );
    }
  };
  try {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > options.maxBytes) throw tooLarge(options.name, options.maxBytes);
      if (head) {
        head.push(chunk);
        if (size >= SNIFF_BYTES) check();
      }
      let offset = 0;
      while (offset < chunk.length) offset += (await handle.write(chunk, offset)).bytesWritten;
    }
    if (options.truncated()) throw tooLarge(options.name, options.maxBytes);
    if (head) check();
  } finally {
    await handle.close();
  }
}

/** Reads the request into a staging folder. Throws `AppError` for anything refused, having removed what it wrote. */
export async function receiveAudiobook(request: FastifyRequest, ctx: AppContext): Promise<Received> {
  if (!request.isMultipart()) throw badRequest("Send the audiobook's files as a multipart/form-data upload.");
  const { documents, storage } = ctx.services;
  const maxBytes = ctx.config.maxUploadBytes;
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.query as Record<string, unknown>)) {
    if (fieldNames.has(key) && typeof value === "string") fields[key] = value;
  }

  const parts: StagedPart[] = [];
  let location: { id: string; name: string; path: string } | undefined;
  let staging: string | undefined;
  let stagingPath: string | undefined;
  try {
    const stream = request.parts({
      limits: { fileSize: maxBytes, files: MAX_FILES, fields: 10, fieldSize: 1000 },
      throwFileSizeLimit: false,
    } as Parameters<FastifyRequest["parts"]>[0]);
    for await (const part of stream) {
      if (part.type === "field") {
        if (fieldNames.has(part.fieldname) && typeof part.value === "string") {
          if (part.fieldname === "locationId" && location && part.value !== location.id) {
            throw badRequest("Send the locationId field before the files, so Outpost knows where to store them.");
          }
          fields[part.fieldname] = part.value;
        }
        continue;
      }
      if (!location) {
        location = documents.uploadLocation(fields.locationId || undefined);
        const declared = Number(request.headers["content-length"]);
        // Room for the upload, and for unpacking a zip beside it.
        if (Number.isFinite(declared) && declared > 0) await storage.assertSpace(location.id, declared * 2);
        staging = `${INCOMING_DIR}/audiobook-${randomBytes(12).toString("hex")}`;
        stagingPath = storage.resolve(location.id, staging);
        await fs.promises.mkdir(stagingPath, { recursive: true });
      }
      const name = displayName(part.filename);
      const kind = kindOf(name);
      const file = `part-${String(parts.length + 1).padStart(4, "0")}.${extensionOf(name)}`;
      try {
        await writePart(part.file, path.join(stagingPath!, file), { name, kind, maxBytes, truncated: () => part.file.truncated });
      } catch (error) {
        throw describeWriteError(error, location.name);
      }
      parts.push({ name, kind, file });
    }
    if (parts.length === 0 || !location || !staging) throw badRequest("No files were sent. Choose a zip, or the audio files of one book.");
    const zips = parts.filter((part) => part.kind === "zip").length;
    if (zips > 1) throw badRequest("Send one zip at a time: each zip is one audiobook.");
    if (zips === 1 && parts.length > 1) throw badRequest("Send either a zip or audio files, not both together.");
    return { locationId: location.id, staging, parts, fields: addFields.parse(fields) };
  } catch (error) {
    if (stagingPath) await fs.promises.rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
    const code = (error as { code?: string } | null)?.code;
    if (code === "FST_FILES_LIMIT") throw badRequest(`An audiobook can have at most ${MAX_FILES} files.`);
    if (code === "FST_PARTS_LIMIT" || code === "FST_FIELDS_LIMIT") throw badRequest("This upload has more parts than Outpost accepts.");
    throw error;
  }
}
