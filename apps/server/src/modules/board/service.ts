/**
 * The household board: messages, check-ins and sent files, kept in `board_messages` and
 * `board_files`, on channels (the household's own is "board").
 *
 * Who wrote something is a name a device chose. Anyone on the home network can post as
 * anyone, and edit or remove anything: it is one household's board. So nothing vanishes
 * silently: an edit says who made it and when, and a removed message keeps its place in
 * the history with who removed it and when, its words gone.
 *
 * Every change is announced as `board.changed`, which is how other devices hear of it
 * (the live-events stream); nothing polls. Files are removed when their days are up by a
 * timer set for the next one due, never by a tick (see `schedule`).
 *
 * Transports (a radio link) join through `addTransport`, `receive` and `onMessage`; see
 * `./transport.ts`.
 */
import fs from "node:fs";
import type { Readable } from "node:stream";
import {
  BOARD_CHANNEL,
  BOARD_LIMITS,
  type BoardCheckInLine,
  type BoardEvent,
  type BoardKept,
  type BoardMessage,
  type BoardMessagesResponse,
  type BoardPosition,
  type BoardSummaryResponse,
  type CheckInStatus,
} from "@outpost/shared";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, conflict, messageOf, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { boardFiles, boardMessages } from "../../db/schema.ts";
import { type BoardFileRow, type BoardFileStore, createBoardFileStore, fileDto } from "./files.ts";
import type { BoardTransport, IncomingMessage, MessageListener, OutgoingCheck } from "./transport.ts";

export type BoardMessageRow = typeof boardMessages.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;
/** The longest a Node timer waits; a file due later is looked at again then, and the timer set anew. */
const LONGEST_WAIT_MS = 2 ** 31 - 1;
const META_MAX_BYTES = 4096;

/** Control characters other than a line break and a tab. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g;

/** A name as it is kept: one line, spaces collapsed, at most the limit. */
export function cleanName(value: string): string {
  return cleanLine(value, BOARD_LIMITS.name);
}

/** One line of words, at most `max` characters. */
export function cleanLine(value: string, max: number): string {
  return value.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/** Words as they are kept: line breaks made plain, control characters out, no trailing space. */
export function cleanBody(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/^\n+|\n+$/g, "");
}

export interface NewMessage {
  channel: string;
  author: string;
  body: string;
}

export interface NewCheckIn extends NewMessage {
  status: CheckInStatus;
  place: string | null;
  position: BoardPosition | null;
}

export interface BoardService {
  list(query: { channel: string; before?: string; limit?: number }): BoardMessagesResponse;
  get(id: string): BoardMessage;
  post(input: NewMessage): BoardMessage;
  checkIn(input: NewCheckIn): BoardMessage;
  sendFile(input: NewMessage & { stream: Readable; filename: string }): Promise<BoardMessage>;
  edit(
    id: string,
    input: { by: string; body?: string; place?: string | null; status?: CheckInStatus; baseUpdatedAt: number },
  ): BoardMessage;
  remove(id: string, by: string): Promise<BoardMessage>;
  summary(since?: number): BoardSummaryResponse;
  /** The stored file of a message, for "Add to library". */
  fileOf(fileId: string): { row: BoardFileRow; path: string; message: BoardMessage | null };

  // ── For transports (./transport.ts) ──
  /** Stores a message heard by a transport. Null when that transport's message of that id is already kept. */
  receive(incoming: IncomingMessage): BoardMessage | null;
  /** Replaces what a transport keeps with a message (a delivery report). */
  setMeta(id: string, meta: Record<string, unknown>): void;
  onMessage(listener: MessageListener): () => void;
  addTransport(transport: BoardTransport): () => void;

  files: BoardFileStore;
  /** Sets the timer for the next file due to go; called after anything changes when that is. */
  schedule(): void;
  /** When the timer is set for, or null when no file is due. */
  nextExpiryAt(): number | null;
  /** The person's own: counted for "what is stored", and erased with everything else. */
  kept: { count(): BoardKept; eraseAll(): Promise<BoardKept> };
}

declare module "../../core/context.ts" {
  interface Services {
    board: BoardService;
  }
}

export function createBoardService(ctx: AppContext): BoardService {
  const { db, sqlite } = ctx;
  const files = createBoardFileStore(ctx);
  const listeners = new Set<MessageListener>();
  const transports = new Set<BoardTransport>();

  const statements = {
    newest: sqlite.prepare("SELECT * FROM board_messages WHERE channel = ? ORDER BY created_at DESC, id DESC LIMIT ?"),
    older: sqlite.prepare(
      `SELECT * FROM board_messages WHERE channel = ? AND (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC LIMIT ?`,
    ),
    latestCheckIns: sqlite.prepare(
      `SELECT m.* FROM board_messages m
         JOIN (SELECT lower(author) AS who, max(created_at) AS at FROM board_messages
                WHERE channel = ? AND kind = 'checkin' AND removed_at IS NULL GROUP BY lower(author)) latest
           ON lower(m.author) = latest.who AND m.created_at = latest.at
        WHERE m.channel = ? AND m.kind = 'checkin' AND m.removed_at IS NULL
        ORDER BY m.created_at DESC, m.id DESC`,
    ),
    newSince: sqlite.prepare("SELECT count(*) AS n FROM board_messages WHERE channel = ? AND removed_at IS NULL AND created_at > ?"),
    newestAt: sqlite.prepare("SELECT max(created_at) AS at FROM board_messages WHERE channel = ? AND removed_at IS NULL"),
    nextDue: sqlite.prepare("SELECT min(expires_at) AS at FROM board_files WHERE gone_at IS NULL AND expires_at IS NOT NULL"),
    due: sqlite.prepare("SELECT id FROM board_files WHERE gone_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?"),
    planBodies: sqlite.prepare("SELECT body FROM emergency_plans ORDER BY created_at"),
    fileMessage: sqlite.prepare("SELECT * FROM board_messages WHERE file_id = ? LIMIT 1"),
    heard: sqlite.prepare("SELECT 1 FROM board_messages WHERE source = ? AND external_id = ?"),
  };

  // Rows read with raw SQL come back with column names; these turn them into the schema's shape.
  const fromRaw = (raw: Record<string, unknown>): BoardMessageRow => ({
    id: raw.id as string,
    channel: raw.channel as string,
    source: raw.source as string,
    externalId: (raw.external_id as string | null) ?? null,
    kind: raw.kind as BoardMessageRow["kind"],
    author: raw.author as string,
    body: raw.body as string,
    status: (raw.status as BoardMessageRow["status"]) ?? null,
    place: (raw.place as string | null) ?? null,
    lat: (raw.lat as number | null) ?? null,
    lon: (raw.lon as number | null) ?? null,
    accuracyM: (raw.accuracy_m as number | null) ?? null,
    fileId: (raw.file_id as string | null) ?? null,
    meta: raw.meta ? (JSON.parse(raw.meta as string) as Record<string, unknown>) : null,
    createdAt: raw.created_at as number,
    updatedAt: raw.updated_at as number,
    editedAt: (raw.edited_at as number | null) ?? null,
    editedBy: (raw.edited_by as string | null) ?? null,
    removedAt: (raw.removed_at as number | null) ?? null,
    removedBy: (raw.removed_by as string | null) ?? null,
  });

  function toDto(row: BoardMessageRow, fileRow?: BoardFileRow | null): BoardMessage {
    const file = row.fileId ? (fileRow ?? files.find(row.fileId) ?? null) : null;
    return {
      id: row.id,
      channel: row.channel,
      source: row.source,
      kind: row.kind,
      author: row.author,
      body: row.body,
      status: row.status,
      place: row.place,
      position: row.lat !== null && row.lon !== null ? { lat: row.lat, lon: row.lon, accuracyM: row.accuracyM } : null,
      file: file ? fileDto(file) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      edited: row.editedAt !== null ? { at: row.editedAt, by: row.editedBy ?? "" } : null,
      removed: row.removedAt !== null ? { at: row.removedAt, by: row.removedBy ?? "" } : null,
      meta: row.meta ?? null,
    };
  }

  /** A transport that carries the channel may refuse what would not go (too long for a radio, a file). */
  function check(outgoing: OutgoingCheck): void {
    for (const transport of transports) {
      if (!transport.carries(outgoing.channel)) continue;
      const reason = transport.refuse?.(outgoing);
      if (reason) throw badRequest(reason);
    }
  }

  const findRow = (id: string) => db.select().from(boardMessages).where(eq(boardMessages.id, id)).get();
  function getRow(id: string): BoardMessageRow {
    const row = findRow(id);
    if (!row) throw notFound("That message");
    return row;
  }

  function announce(event: BoardEvent, id?: string): void {
    ctx.events.publish({ type: "board.changed", ...(id ? { id } : {}), data: event });
  }

  const excerpt = (text: string) => (text.length > 120 ? `${text.slice(0, 119).trimEnd()}…` : text);

  function tell(message: BoardMessage, how: "posted" | "received"): void {
    announce(
      {
        action: "posted",
        channel: message.channel,
        kind: message.kind,
        author: message.author,
        excerpt: excerpt(message.body),
        status: message.status,
      },
      message.id,
    );
    for (const listener of listeners) {
      try {
        listener(message, how);
      } catch (error) {
        ctx.log.warn({ err: error }, "A board listener failed");
      }
    }
    if (how !== "posted") return;
    // Handed on after it is stored and announced, so the person who posted it never waits on a link.
    for (const transport of transports) {
      if (!transport.carries(message.channel)) continue;
      queueMicrotask(() => {
        Promise.resolve()
          .then(() => transport.send(message))
          .catch((error) =>
            ctx.log.warn(
              { err: error, transport: transport.name },
              `The ${transport.name} link could not send a message: ${messageOf(error)}`,
            ),
          );
      });
    }
  }

  function insert(row: Omit<BoardMessageRow, "updatedAt" | "editedAt" | "editedBy" | "removedAt" | "removedBy">): BoardMessageRow {
    const full: BoardMessageRow = { ...row, updatedAt: row.createdAt, editedAt: null, editedBy: null, removedAt: null, removedBy: null };
    db.insert(boardMessages).values(full).run();
    return full;
  }

  const required = (value: string, what: string, max: number) => {
    if (!value) throw badRequest(`Write ${what} first.`);
    if (value.length > max) throw badRequest(`That is longer than ${max.toLocaleString("en-GB")} characters, the most ${what} can be.`);
    return value;
  };

  function expiresFrom(createdAt: number): number | null {
    const days = ctx.services.settings.get("board.fileDays");
    return days > 0 ? createdAt + days * DAY_MS : null;
  }

  // ── Expiry: one timer, for the next file due ──

  let timer: NodeJS.Timeout | undefined;
  let timerAt: number | null = null;
  let expiring: Promise<void> | null = null;

  function schedule(): void {
    clearTimeout(timer);
    timer = undefined;
    timerAt = null;
    const next = (statements.nextDue.get() as { at: number | null }).at;
    if (next === null) return;
    timerAt = next;
    timer = setTimeout(
      () => {
        timer = undefined;
        timerAt = null;
        if (Date.now() < next) schedule();
        else void expireDue();
      },
      Math.min(LONGEST_WAIT_MS, Math.max(0, next - Date.now())),
    );
    timer.unref();
  }

  async function expireDue(): Promise<void> {
    if (expiring) return expiring;
    expiring = (async () => {
      const now = Date.now();
      let count = 0;
      for (const { id } of statements.due.all(now) as Array<{ id: string }>) {
        try {
          if (await files.discard(id, "expired", now)) count += 1;
        } catch (error) {
          ctx.log.warn({ err: error }, "A file sent on the board could not be removed when its days were up");
        }
      }
      if (count > 0) announce({ action: "expired", channel: BOARD_CHANNEL });
    })().finally(() => {
      expiring = null;
      schedule();
    });
    return expiring;
  }

  // The person changed how long files are kept: it holds for the files already sent too.
  ctx.services.settings.onChange((settings) => {
    const days = settings["board.fileDays"];
    sqlite
      .prepare("UPDATE board_files SET expires_at = CASE WHEN ? > 0 THEN created_at + ? * ? ELSE NULL END WHERE gone_at IS NULL")
      .run(days, days, DAY_MS);
    schedule();
  });
  ctx.onClose.push(() => {
    clearTimeout(timer);
    timer = undefined;
  });

  // ── Who the household is ──

  function people(): string[] {
    const names: string[] = [];
    const add = (value: unknown) => {
      if (typeof value !== "string") return;
      const name = cleanName(value);
      if (name && !names.some((known) => known.toLowerCase() === name.toLowerCase())) names.push(name);
    };
    try {
      for (const member of ctx.services.supplies.household().members) if (member.kind === "person") add(member.name);
    } catch {
      // No household under Supplies: nothing to offer from there.
    }
    for (const { body } of statements.planBodies.all() as Array<{ body: string }>) {
      try {
        const parsed = JSON.parse(body) as { people?: Array<{ name?: unknown }> };
        for (const person of parsed.people ?? []) add(person?.name);
      } catch {
        // A plan whose body cannot be read offers no names.
      }
    }
    return names;
  }

  const service: BoardService = {
    files,
    schedule,
    nextExpiryAt: () => timerAt,

    list({ channel, before, limit = BOARD_LIMITS.page }) {
      const size = Math.min(Math.max(1, limit), 200);
      let raw: Array<Record<string, unknown>>;
      if (before) {
        const cursor = findRow(before);
        if (!cursor || cursor.channel !== channel) throw notFound("That point in the history");
        raw = statements.older.all(channel, cursor.createdAt, cursor.createdAt, cursor.id, size + 1) as Array<Record<string, unknown>>;
      } else {
        raw = statements.newest.all(channel, size + 1) as Array<Record<string, unknown>>;
      }
      const more = raw.length > size;
      const rows = raw.slice(0, size).map(fromRaw);
      const fileIds = rows.map((row) => row.fileId).filter((id): id is string => id !== null);
      const fileRows = new Map<string, BoardFileRow>();
      for (const id of fileIds) {
        const found = files.find(id);
        if (found) fileRows.set(id, found);
      }
      const messages = rows.reverse().map((row) => toDto(row, row.fileId ? fileRows.get(row.fileId) : null));
      return { messages, older: more && messages.length > 0 ? messages[0]!.id : null };
    },

    get: (id) => toDto(getRow(id)),

    post(input) {
      const author = required(cleanName(input.author), "a name", BOARD_LIMITS.name);
      const body = required(cleanBody(input.body), "a message", BOARD_LIMITS.body);
      check({ channel: input.channel, kind: "message", author, body });
      const row = insert({
        id: newId(),
        channel: input.channel,
        source: "here",
        externalId: null,
        kind: "message",
        author,
        body,
        status: null,
        place: null,
        lat: null,
        lon: null,
        accuracyM: null,
        fileId: null,
        meta: null,
        createdAt: Date.now(),
      });
      const message = toDto(row);
      tell(message, "posted");
      return message;
    },

    checkIn(input) {
      const author = required(cleanName(input.author), "a name", BOARD_LIMITS.name);
      const body = cleanBody(input.body);
      if (body.length > BOARD_LIMITS.body) required(body, "a check-in", BOARD_LIMITS.body);
      if (input.status === "other" && !body)
        throw badRequest("Write a few words of your own for this check-in, or choose “I’m safe” or “I need help”.");
      const place = input.place ? cleanLine(input.place, BOARD_LIMITS.place) || null : null;
      check({ channel: input.channel, kind: "checkin", author, body, status: input.status, place });
      const row = insert({
        id: newId(),
        channel: input.channel,
        source: "here",
        externalId: null,
        kind: "checkin",
        author,
        body,
        status: input.status,
        place,
        lat: input.position?.lat ?? null,
        lon: input.position?.lon ?? null,
        accuracyM: input.position?.accuracyM ?? null,
        fileId: null,
        meta: null,
        createdAt: Date.now(),
      });
      const message = toDto(row);
      tell(message, "posted");
      return message;
    },

    async sendFile(input) {
      const author = cleanName(input.author);
      const body = cleanBody(input.body);
      if (!author) {
        input.stream.resume();
        throw badRequest("Choose a name for this device before sending a file.");
      }
      if (body.length > BOARD_LIMITS.body) {
        input.stream.resume();
        required(body, "a message", BOARD_LIMITS.body);
      }
      try {
        check({ channel: input.channel, kind: "file", author, body });
      } catch (error) {
        input.stream.resume();
        throw error;
      }
      const createdAt = Date.now();
      const file = await files.save({ stream: input.stream, filename: input.filename, createdAt, expiresAt: expiresFrom(createdAt) });
      let row: BoardMessageRow;
      try {
        row = insert({
          id: newId(),
          channel: input.channel,
          source: "here",
          externalId: null,
          kind: "message",
          author,
          body,
          status: null,
          place: null,
          lat: null,
          lon: null,
          accuracyM: null,
          fileId: file.id,
          meta: null,
          createdAt,
        });
      } catch (error) {
        await files.discard(file.id, "removed");
        db.delete(boardFiles).where(eq(boardFiles.id, file.id)).run();
        throw error;
      }
      schedule();
      const message = toDto(row, file);
      tell(message, "posted");
      return message;
    },

    edit(id, input) {
      const by = required(cleanName(input.by), "a name", BOARD_LIMITS.name);
      const current = getRow(id);
      // What went out by radio, or came in by it, is out there as it was: it cannot be changed here, only removed.
      if (current.channel !== BOARD_CHANNEL)
        throw badRequest("A message on a radio channel cannot be changed: what went by radio has gone as it was. It can be removed here.");
      if (current.removedAt !== null) {
        throw conflict(`This message was removed by ${current.removedBy || "someone"}, so it cannot be changed.`, {
          updatedAt: current.updatedAt,
        });
      }
      if (input.baseUpdatedAt !== current.updatedAt) {
        throw conflict("This message was changed on another device after you opened it. Nothing was saved. It is shown as it is now.", {
          updatedAt: current.updatedAt,
        });
      }
      const patch: Partial<BoardMessageRow> = {};
      if (input.body !== undefined) {
        const body = cleanBody(input.body);
        if (body.length > BOARD_LIMITS.body) required(body, "a message", BOARD_LIMITS.body);
        if (!body && current.kind === "message" && !current.fileId) throw badRequest("A message cannot be left empty. Remove it instead.");
        patch.body = body;
      }
      if (current.kind === "checkin") {
        if (input.status !== undefined) patch.status = input.status;
        if (input.place !== undefined) patch.place = input.place ? cleanLine(input.place, BOARD_LIMITS.place) || null : null;
        if ((patch.status ?? current.status) === "other" && !(patch.body ?? current.body)) {
          throw badRequest("A check-in of your own words needs a few words.");
        }
      } else if (input.status !== undefined || input.place !== undefined) {
        throw badRequest("Only a check-in has a status and a place.");
      }
      const now = Math.max(Date.now(), current.updatedAt + 1);
      db.update(boardMessages)
        .set({ ...patch, updatedAt: now, editedAt: now, editedBy: by })
        .where(eq(boardMessages.id, id))
        .run();
      const message = toDto(getRow(id));
      announce({ action: "edited", channel: message.channel, kind: message.kind, author: by }, id);
      return message;
    },

    async remove(id, byName) {
      const by = required(cleanName(byName), "a name", BOARD_LIMITS.name);
      const current = getRow(id);
      if (current.removedAt !== null) return toDto(current);
      const now = Math.max(Date.now(), current.updatedAt + 1);
      // The words, the place and the position go; who wrote it and when stay, with who removed it.
      db.update(boardMessages)
        .set({ body: "", place: null, lat: null, lon: null, accuracyM: null, updatedAt: now, removedAt: now, removedBy: by })
        .where(eq(boardMessages.id, id))
        .run();
      if (current.fileId) {
        await files.discard(current.fileId, "removed", now);
        schedule();
      }
      const message = toDto(getRow(id));
      announce({ action: "removed", channel: message.channel, kind: message.kind, author: by }, id);
      return message;
    },

    summary(since) {
      const household = people();
      const latest = (statements.latestCheckIns.all(BOARD_CHANNEL, BOARD_CHANNEL) as Array<Record<string, unknown>>).map(fromRaw);
      const byName = new Map<string, BoardMessageRow>();
      for (const row of latest) if (!byName.has(row.author.toLowerCase())) byName.set(row.author.toLowerCase(), row);
      const line = (name: string, row: BoardMessageRow | undefined): BoardCheckInLine => ({
        name,
        latest: row
          ? {
              id: row.id,
              status: row.status ?? "other",
              body: row.body,
              place: row.place,
              hasPosition: row.lat !== null && row.lon !== null,
              createdAt: row.createdAt,
            }
          : null,
      });
      const checkIns: BoardCheckInLine[] = household.map((name) => line(name, byName.get(name.toLowerCase())));
      const known = new Set(household.map((name) => name.toLowerCase()));
      const others = [...byName.values()]
        .filter((row) => !known.has(row.author.toLowerCase()))
        .sort((a, b) => a.author.localeCompare(b.author, "en-GB"));
      for (const row of others) checkIns.push(line(row.author, row));
      return {
        checkIns,
        people: household,
        newSince: since === undefined ? 0 : (statements.newSince.get(BOARD_CHANNEL, since) as { n: number }).n,
        newestAt: (statements.newestAt.get(BOARD_CHANNEL) as { at: number | null }).at,
        fileDays: ctx.services.settings.get("board.fileDays"),
        limits: BOARD_LIMITS,
      };
    },

    fileOf(fileId) {
      const row = files.get(fileId);
      if (row.goneAt !== null) {
        throw new AppError(
          "not_found",
          row.goneReason === "expired"
            ? "This file's days on the board are up, so it is no longer kept."
            : "This file was removed from the board.",
        );
      }
      const message = statements.fileMessage.get(fileId) as Record<string, unknown> | undefined;
      return { row, path: files.filePath(row), message: message ? toDto(fromRaw(message), row) : null };
    },

    receive(incoming) {
      if (incoming.source === "here" || !incoming.source) throw new Error("A transport names itself: its source cannot be “here”.");
      if (statements.heard.get(incoming.source, incoming.externalId)) return null;
      const meta = incoming.meta ?? null;
      if (meta && Buffer.byteLength(JSON.stringify(meta)) > META_MAX_BYTES)
        throw new Error("What a transport keeps with a message is at most 4 KB.");
      const row = insert({
        id: newId(),
        channel: incoming.channel,
        source: incoming.source,
        externalId: incoming.externalId,
        kind: incoming.kind ?? "message",
        author: cleanName(incoming.author) || "Unknown",
        body: cleanBody(incoming.body).slice(0, BOARD_LIMITS.body),
        status: incoming.kind === "checkin" ? (incoming.status ?? "other") : null,
        place: incoming.place ? cleanLine(incoming.place, BOARD_LIMITS.place) || null : null,
        lat: incoming.position?.lat ?? null,
        lon: incoming.position?.lon ?? null,
        accuracyM: incoming.position?.accuracyM ?? null,
        fileId: null,
        meta,
        createdAt: Date.now(),
      });
      const message = toDto(row);
      tell(message, "received");
      return message;
    },

    setMeta(id, meta) {
      if (Buffer.byteLength(JSON.stringify(meta)) > META_MAX_BYTES)
        throw new Error("What a transport keeps with a message is at most 4 KB.");
      const row = getRow(id);
      db.update(boardMessages).set({ meta }).where(eq(boardMessages.id, id)).run();
      // The screens show what became of it (handed to the radio, failed) without a reload.
      announce({ action: "delivery", channel: row.channel, kind: row.kind }, id);
    },

    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    addTransport(transport) {
      transports.add(transport);
      return () => transports.delete(transport);
    },

    kept: {
      count() {
        const kept = files.kept();
        return {
          messages: (sqlite.prepare("SELECT count(*) AS n FROM board_messages").get() as { n: number }).n,
          files: kept.count,
          fileBytes: kept.bytes,
        };
      },
      async eraseAll() {
        const had = service.kept.count();
        sqlite.transaction(() => {
          db.delete(boardMessages).run();
          db.delete(boardFiles).run();
        })();
        await fs.promises.rm(files.root, { recursive: true, force: true });
        schedule();
        announce({ action: "cleared", channel: BOARD_CHANNEL });
        return had;
      },
    },
  };

  // Files whose days ran out while the server was off go now; then the timer is set for the next.
  if ((statements.due.all(Date.now()) as unknown[]).length > 0) void expireDue();
  else schedule();

  return service;
}
