/**
 * Files attached to pages: pictures in the text, and the odd PDF, track or archive.
 *
 * An attachment is written once and never changed, which is what lets the browser
 * cache it forever. It lives in the data directory, next to the database that refers
 * to it, at `attachments/<aa>/<id>/<name>`.
 *
 * Only a short list of file types is accepted, and a file has to be what its name says:
 * the extension picks the type, and the first bytes must agree. That keeps a renamed
 * executable or an HTML page called "photo.png" out of the store.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AttachmentDto } from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, notFound } from "../../core/errors.ts";
import { resolveInside, safeFileName } from "../../core/fs-safe.ts";
import { newId } from "../../core/ids.ts";
import { attachments, notes } from "../../db/schema.ts";
import { attachmentHref } from "./content/schema.ts";

export type AttachmentRow = typeof attachments.$inferSelect;

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
/** How much of the start of a file is looked at to check its type. */
const SNIFF_BYTES = 4096;

interface FileType {
  mime: string;
  /** Shown in the browser rather than downloaded. */
  inline: boolean;
  /** True when the first bytes of the file are what this type starts with. */
  matches(head: Buffer): boolean;
}

const startsWith = (head: Buffer, ...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);
const ascii = (head: Buffer, offset: number, value: string) => head.subarray(offset, offset + value.length).toString("latin1") === value;
/** Text has no zero bytes; every binary format worth worrying about does, early on. */
const looksLikeText = (head: Buffer) => !head.includes(0);
const mentions = (head: Buffer, tag: string) => looksLikeText(head) && head.toString("utf8").toLowerCase().includes(tag);

const FILE_TYPES: Record<string, FileType> = {
  png: { mime: "image/png", inline: true, matches: (head) => startsWith(head, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) },
  jpg: { mime: "image/jpeg", inline: true, matches: (head) => startsWith(head, 0xff, 0xd8, 0xff) },
  jpeg: { mime: "image/jpeg", inline: true, matches: (head) => startsWith(head, 0xff, 0xd8, 0xff) },
  gif: { mime: "image/gif", inline: true, matches: (head) => ascii(head, 0, "GIF87a") || ascii(head, 0, "GIF89a") },
  webp: { mime: "image/webp", inline: true, matches: (head) => ascii(head, 0, "RIFF") && ascii(head, 8, "WEBP") },
  // Shown inline so that <img> works; the sandbox policy on the response is what makes that safe.
  svg: { mime: "image/svg+xml", inline: true, matches: (head) => mentions(head, "<svg") },
  pdf: { mime: "application/pdf", inline: true, matches: (head) => ascii(head, 0, "%PDF-") },
  txt: { mime: "text/plain; charset=utf-8", inline: false, matches: looksLikeText },
  md: { mime: "text/markdown; charset=utf-8", inline: false, matches: looksLikeText },
  csv: { mime: "text/csv; charset=utf-8", inline: false, matches: looksLikeText },
  json: { mime: "application/json", inline: false, matches: looksLikeText },
  gpx: { mime: "application/gpx+xml", inline: false, matches: (head) => mentions(head, "<gpx") },
  zip: {
    mime: "application/zip",
    inline: false,
    matches: (head) => startsWith(head, 0x50, 0x4b, 0x03, 0x04) || startsWith(head, 0x50, 0x4b, 0x05, 0x06),
  },
};

const ACCEPTED = "pictures (PNG, JPEG, GIF, WebP, SVG), PDF, text (TXT, Markdown, CSV, JSON), GPX tracks and ZIP archives";

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

function typeOf(name: string): FileType {
  const extension = path.extname(name).slice(1).toLowerCase();
  const type = Object.hasOwn(FILE_TYPES, extension) ? FILE_TYPES[extension] : undefined;
  if (!type) {
    throw new AppError("unsupported", `"${name}" is not a kind of file that can be attached to a page. Pages accept ${ACCEPTED}.`);
  }
  return type;
}

export interface AttachmentStore {
  /** Stores a stream as a new attachment. Rejects files of the wrong type or over the size limit. */
  saveStream(input: { stream: Readable; filename: string; noteId?: string | null }): Promise<AttachmentRow>;
  /** Copies a file from disk into the store, with the same checks. The source is left alone. */
  saveFile(input: { sourcePath: string; filename: string; noteId?: string | null }): Promise<AttachmentRow>;
  find(id: string): AttachmentRow | undefined;
  get(id: string): AttachmentRow;
  /** Absolute path of the stored file. */
  filePath(row: AttachmentRow): string;
  /** Whether the browser may show this attachment in place instead of downloading it. */
  isInline(row: AttachmentRow): boolean;
  isImage(row: AttachmentRow): boolean;
  remove(id: string): Promise<void>;
  toDto(row: AttachmentRow): AttachmentDto;
}

export function createAttachmentStore(ctx: AppContext): AttachmentStore {
  const { db } = ctx;
  const root = path.join(ctx.config.dataDir, "attachments");
  const incoming = path.join(root, ".incoming");

  // Anything still in the staging folder is from an upload that was cut off.
  fs.rmSync(incoming, { recursive: true, force: true });

  function find(id: string): AttachmentRow | undefined {
    return db.select().from(attachments).where(eq(attachments.id, id)).get();
  }

  const store: AttachmentStore = {
    find,

    get(id) {
      const row = find(id);
      if (!row) throw notFound("Attachment");
      return row;
    },

    filePath: (row) => resolveInside(root, row.relPath),
    isInline: (row) => FILE_TYPES[path.extname(row.filename).slice(1).toLowerCase()]?.inline ?? false,
    isImage: (row) => row.mime.startsWith("image/"),

    async saveStream({ stream, filename, noteId }) {
      const name = safeFileName(filename, "file");
      let type: FileType;
      try {
        type = typeOf(name);
      } catch (error) {
        // The caller is waiting for this stream to be consumed; do not leave it hanging.
        stream.resume();
        throw error;
      }

      const id = newId();
      const temp = path.join(incoming, id);
      await fs.promises.mkdir(incoming, { recursive: true });

      const hash = createHash("sha256");
      const head: Buffer[] = [];
      let headBytes = 0;
      let size = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          size += chunk.length;
          if (size > MAX_ATTACHMENT_BYTES) {
            done(
              new AppError(
                "too_large",
                `"${name}" is larger than ${megabytes(MAX_ATTACHMENT_BYTES)} MB, the most a page attachment can be. Add large files to the library instead.`,
              ),
            );
            return;
          }
          hash.update(chunk);
          if (headBytes < SNIFF_BYTES) {
            head.push(chunk.subarray(0, SNIFF_BYTES - headBytes));
            headBytes += chunk.length;
          }
          done(null, chunk);
        },
      });

      try {
        await pipeline(stream, meter, fs.createWriteStream(temp, { flags: "wx" }));
        if (size === 0) throw badRequest(`"${name}" is empty.`);
        if (!type.matches(Buffer.concat(head))) {
          throw new AppError(
            "unsupported",
            `"${name}" does not look like a ${path.extname(name).slice(1).toUpperCase()} file. It may be damaged or have the wrong ending.`,
          );
        }
        if (noteId && !db.select({ id: notes.id }).from(notes).where(eq(notes.id, noteId)).get()) throw notFound("Page");

        // ULIDs start with the time, so their first characters are the same for years;
        // the last two are random and spread the folders evenly.
        const relPath = `${id.slice(-2)}/${id}/${name}`;
        const target = resolveInside(root, relPath);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.rename(temp, target);

        const row: AttachmentRow = {
          id,
          noteId: noteId ?? null,
          filename: name,
          mime: type.mime,
          sizeBytes: size,
          sha256: hash.digest("hex"),
          relPath,
          createdAt: Date.now(),
        };
        db.insert(attachments).values(row).run();
        return row;
      } catch (error) {
        await fs.promises.rm(temp, { force: true });
        throw error;
      }
    },

    async saveFile({ sourcePath, filename, noteId }) {
      const stat = await fs.promises.stat(sourcePath).catch(() => undefined);
      if (!stat?.isFile()) throw badRequest(`"${filename}" could not be read.`);
      return store.saveStream({ stream: fs.createReadStream(sourcePath), filename, noteId });
    },

    async remove(id) {
      const row = store.get(id);
      db.delete(attachments).where(eq(attachments.id, id)).run();
      const file = store.filePath(row);
      const folder = path.dirname(file);
      // The folder is named after the attachment and holds exactly this one file, so it
      // goes too. Anything that does not look like that is left alone but for the file.
      if (path.basename(folder) === row.id) await fs.promises.rm(folder, { recursive: true, force: true });
      else await fs.promises.rm(file, { force: true });
    },

    toDto: (row) => ({
      id: row.id,
      noteId: row.noteId,
      filename: row.filename,
      mime: row.mime,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      url: attachmentHref(row.id),
      createdAt: row.createdAt,
    }),
  };

  return store;
}

/** `Content-Disposition` value with a name that survives non-ASCII characters. */
export function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  // encodeURIComponent leaves a few characters that the header syntax (RFC 5987) does not allow bare.
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
