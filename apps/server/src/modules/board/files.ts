/**
 * Files sent on the board, kept in the data directory at `board/<aa>/<id>/<name>` until
 * they are removed or their days are up.
 *
 * Any kind of file may be sent: it is for handing something from one phone to another,
 * and what it is is the sender's business. So nothing about it is trusted. It is never
 * opened, run, unpacked or read for text here. It is served only as a download, with a
 * type that no browser runs (`application/octet-stream`), except a picture whose first
 * bytes show it is a PNG, JPEG, GIF or WebP, which is served with that type so that the
 * board can show it. SVG is never a picture here: it can carry script. Every answer has
 * the same sandbox policy and `nosniff` as the library's originals and the notes'
 * attachments.
 *
 * The bytes are written as they arrive, counted and hashed on the way, to a part file
 * that is renamed into place only once the whole file is in. The row of a file stays
 * when its bytes go (`gone_at`), so that the message that carried it can say what
 * became of it.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BOARD_LIMITS, type BoardFile, formatBytes } from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, notFound } from "../../core/errors.ts";
import { resolveInside, safeFileName } from "../../core/fs-safe.ts";
import { newId } from "../../core/ids.ts";
import { boardFiles } from "../../db/schema.ts";

export type BoardFileRow = typeof boardFiles.$inferSelect;

/** The one type served for anything that is not a checked picture: browsers save it and never run it. */
export const DOWNLOAD_TYPE = "application/octet-stream";

const SNIFF_BYTES = 16;
const startsWith = (head: Buffer, ...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);
const ascii = (head: Buffer, offset: number, value: string) => head.subarray(offset, offset + value.length).toString("latin1") === value;

/** A picture by its first bytes, whatever its name says. */
export function pictureType(head: Buffer): string | null {
  if (startsWith(head, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(head, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(head, 0, "GIF87a") || ascii(head, 0, "GIF89a")) return "image/gif";
  if (ascii(head, 0, "RIFF") && ascii(head, 8, "WEBP")) return "image/webp";
  return null;
}

export const fileHref = (id: string) => `/api/board/files/${encodeURIComponent(id)}`;

export function fileDto(row: BoardFileRow): BoardFile {
  const gone = row.goneAt !== null ? { at: row.goneAt, reason: row.goneReason ?? "removed" } : null;
  return {
    id: row.id,
    name: row.filename,
    sizeBytes: row.sizeBytes,
    picture: row.mime !== DOWNLOAD_TYPE,
    expiresAt: row.expiresAt,
    gone,
    url: gone ? null : fileHref(row.id),
  };
}

export interface BoardFileStore {
  root: string;
  /** What files are held to: the board's limits, which the tests lower to try them. */
  limits: { fileBytes: number; filesKept: number; keptBytes: number };
  /** Streams a file in. Refuses one over the size limit, an empty one, and one that would go over what the board keeps. */
  save(input: { stream: Readable; filename: string; createdAt: number; expiresAt: number | null }): Promise<BoardFileRow>;
  find(id: string): BoardFileRow | undefined;
  get(id: string): BoardFileRow;
  filePath(row: BoardFileRow): string;
  /** Deletes the bytes and marks the row gone. Does nothing to a row already gone. */
  discard(id: string, reason: "expired" | "removed", at?: number): Promise<boolean>;
  /** Files whose bytes are still kept, and their size together. */
  kept(): { count: number; bytes: number };
}

export function createBoardFileStore(ctx: AppContext): BoardFileStore {
  const { db, sqlite } = ctx;
  const root = path.join(ctx.config.dataDir, "board");
  const incoming = path.join(root, ".incoming");
  // Anything still in the staging folder is from a send that was cut off.
  fs.rmSync(incoming, { recursive: true, force: true });

  const keptStatement = sqlite.prepare(
    "SELECT count(*) AS count, coalesce(sum(size_bytes), 0) AS bytes FROM board_files WHERE gone_at IS NULL",
  );
  const find = (id: string) => db.select().from(boardFiles).where(eq(boardFiles.id, id)).get();

  const limits = { fileBytes: BOARD_LIMITS.fileBytes, filesKept: BOARD_LIMITS.filesKept, keptBytes: BOARD_LIMITS.keptBytes };
  const store: BoardFileStore = {
    root,
    limits,
    find,
    get(id) {
      const row = find(id);
      if (!row) throw notFound("That file");
      return row;
    },
    filePath: (row) => resolveInside(root, row.relPath),
    kept: () => keptStatement.get() as { count: number; bytes: number },

    async save({ stream, filename, createdAt, expiresAt }) {
      const name = safeFileName(filename, "file");
      const before = store.kept();
      if (before.count >= limits.filesKept) {
        stream.resume();
        throw new AppError(
          "insufficient_space",
          `The board already holds ${limits.filesKept} files, the most it keeps. Remove some that have been saved, then send this again.`,
        );
      }
      const room = limits.keptBytes - before.bytes;
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
          if (size > limits.fileBytes) {
            done(
              new AppError(
                "too_large",
                `"${name}" is larger than ${formatBytes(limits.fileBytes)}, the most a file sent on the board can be.`,
              ),
            );
            return;
          }
          if (size > room) {
            done(
              new AppError(
                "insufficient_space",
                `The board's files would come to more than ${formatBytes(limits.keptBytes)}. Remove some that have been saved, then send this again.`,
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
        if (size === 0) throw badRequest(`"${name}" is empty, so it was not sent.`);
        const relPath = `${id.slice(-2)}/${id}/${name}`;
        const target = resolveInside(root, relPath);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.rename(temp, target);
        const row: BoardFileRow = {
          id,
          filename: name,
          mime: pictureType(Buffer.concat(head)) ?? DOWNLOAD_TYPE,
          sizeBytes: size,
          sha256: hash.digest("hex"),
          relPath,
          createdAt,
          expiresAt,
          goneAt: null,
          goneReason: null,
        };
        db.insert(boardFiles).values(row).run();
        return row;
      } catch (error) {
        await fs.promises.rm(temp, { force: true });
        throw error;
      }
    },

    async discard(id, reason, at = Date.now()) {
      const row = find(id);
      if (!row || row.goneAt !== null) return false;
      // A file removed with its message loses its name too, as the message loses its words; one whose days are up keeps it.
      const name = reason === "removed" ? { filename: "", relPath: row.id } : {};
      db.update(boardFiles).set({ goneAt: at, goneReason: reason, ...name }).where(eq(boardFiles.id, id)).run();
      const file = store.filePath(row);
      const folder = path.dirname(file);
      // The folder is named after the file's id and holds that one file, so it goes too.
      if (path.basename(folder) === row.id) await fs.promises.rm(folder, { recursive: true, force: true });
      else await fs.promises.rm(file, { force: true });
      return true;
    },
  };
  return store;
}
