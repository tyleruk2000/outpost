/**
 * The household's log of events: one-line entries stamped with when it happened and who
 * wrote it down, from any device, linked to the emergency plan in use. Check-ins from the
 * board and steps ticked in plans are read beside it, never copied into it, so that the
 * log is the household's own words and the rest is what those screens already hold.
 */
import {
  BOARD_CHANNEL,
  EVENT_LOG_LIMITS,
  type EventLogEditInput,
  type EventLogInput,
  type EventLogLine,
  type EventLogResponse,
} from "@outpost/shared";
import { asc, count, eq } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { badRequest, conflict, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { eventLog } from "../../db/schema.ts";
import { cleanBody, cleanName } from "../board/service.ts";
import { markdownToDoc } from "../notes/content/from-markdown.ts";

type Row = typeof eventLog.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayWords = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const formatDate = (at: number) => dayWords.format(at);

const STATUS_WORDS = { safe: "checked in: safe", help: "checked in: needs help", other: "checked in" } as const;

export interface EventLogService {
  list(query: { from?: number; others?: boolean }): EventLogResponse;
  add(input: EventLogInput): EventLogLine;
  edit(id: string, input: EventLogEditInput): EventLogLine;
  remove(id: string): void;
  /** Writes the log, as shown, to a new page in Notes. */
  toNotes(query: { from?: number; others?: boolean }): { note: { id: string; title: string }; lines: number };
  count(): number;
  eraseAll(): number;
}

function entryLine(row: Row): EventLogLine {
  return {
    kind: "entry",
    id: row.id,
    at: row.happenedAt,
    author: row.author,
    text: row.text,
    planId: row.planId,
    planName: row.planName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    edited: row.editedAt !== null ? { at: row.editedAt, by: row.editedBy ?? "" } : null,
  };
}

/** A time a person gave, held to now and the furthest back an entry may go. */
function heldTime(at: number | undefined, now: number): number {
  if (at === undefined) return now;
  if (at > now + 5 * 60_000) throw badRequest("That time has not come yet. Give the time it happened.");
  if (at < now - EVENT_LOG_LIMITS.backdateDays * DAY_MS)
    throw badRequest(
      `An entry can be put up to ${EVENT_LOG_LIMITS.backdateDays} days back. For something older, write the date in the words.`,
    );
  return Math.min(at, now);
}

function cleanText(value: string): string {
  // One line: a log entry is a line, and line breaks inside it would make the printed log hard to read.
  const text = cleanBody(value)
    .replace(/\s*\n\s*/g, " ")
    .trim();
  if (!text) throw badRequest("Write what happened first.");
  if (text.length > EVENT_LOG_LIMITS.text) throw badRequest(`An entry is at most ${EVENT_LOG_LIMITS.text} characters.`);
  return text;
}

/** "14:10 · Sam · Power went off" lines as Markdown, a day heading for each day. Times are the server's own clock. */
export function logMarkdown(lines: EventLogLine[], timeZone?: string): string {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric" });
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const out: string[] = [];
  let current = "";
  for (const line of lines) {
    const heading = day.format(line.at);
    if (heading !== current) {
      if (out.length > 0) out.push("");
      out.push(`## ${heading}`, "");
      current = heading;
    }
    const who = line.author ? ` · ${line.author}` : "";
    const plan = line.kind === "tick" && line.planName ? ` (${line.planName})` : "";
    const escaped = line.text.replace(/([\\`*_[\]<>#])/g, "\\$1");
    out.push(`- **${time.format(line.at)}**${who} · ${escaped}${plan}`);
  }
  return out.join("\n");
}

export function createEventLogService(ctx: AppContext, changed: () => void): EventLogService {
  const { db, sqlite } = ctx;
  const checkIns = sqlite.prepare(
    `SELECT id, author, status, body, place, created_at FROM board_messages
      WHERE channel = ? AND kind = 'checkin' AND removed_at IS NULL AND created_at >= ?
      ORDER BY created_at LIMIT 2000`,
  );

  /** The plan to link a new entry to: one started and not reset, the latest started if several. */
  function planInUse(): { id: string; name: string } | null {
    const started = ctx.services.emergencyPlans
      .list()
      .filter((plan) => plan.startedAt !== null)
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    return started[0] ? { id: started[0].id, name: started[0].name } : null;
  }

  function others(from: number): EventLogLine[] {
    const lines: EventLogLine[] = [];
    for (const raw of checkIns.all(BOARD_CHANNEL, from) as Array<Record<string, unknown>>) {
      const status = (raw.status as keyof typeof STATUS_WORDS | null) ?? "other";
      const words = [(raw.body as string).split("\n")[0]?.trim(), raw.place as string | null].filter(Boolean).join(" · ");
      const at = raw.created_at as number;
      lines.push({
        kind: "checkin",
        id: raw.id as string,
        at,
        author: raw.author as string,
        text: words ? `${STATUS_WORDS[status]}: ${words}` : STATUS_WORDS[status],
        planId: null,
        planName: null,
        createdAt: at,
        updatedAt: at,
        edited: null,
      });
    }
    for (const summary of ctx.services.emergencyPlans.list()) {
      if (summary.ticked === 0) continue;
      const { plan } = ctx.services.emergencyPlans.get(summary.id);
      for (const step of plan.body.steps) {
        const at = plan.use.ticks[step.id];
        if (at === undefined || at < from) continue;
        lines.push({
          kind: "tick",
          id: `${plan.id}:${step.id}`,
          at,
          author: "",
          text: `Done: ${step.text}`,
          planId: plan.id,
          planName: plan.name,
          createdAt: at,
          updatedAt: at,
          edited: null,
        });
      }
    }
    return lines;
  }

  function lines(query: { from?: number; others?: boolean }): { lines: EventLogLine[]; entries: number } {
    const rows = db.select().from(eventLog).orderBy(asc(eventLog.happenedAt), asc(eventLog.createdAt)).all();
    const shown = rows.filter((row) => query.from === undefined || row.happenedAt >= query.from).map(entryLine);
    if (query.others) {
      // From the time asked for; with none, from the first entry, or the last week when the log is empty.
      const from = query.from ?? rows[0]?.happenedAt ?? Date.now() - 7 * DAY_MS;
      shown.push(...others(from));
      shown.sort((a, b) => a.at - b.at || a.createdAt - b.createdAt);
    }
    return { lines: shown.slice(-EVENT_LOG_LIMITS.page), entries: rows.length };
  }

  const get = (id: string): Row => {
    const row = db.select().from(eventLog).where(eq(eventLog.id, id)).get();
    if (!row) throw notFound("That entry");
    return row;
  };

  return {
    list(query) {
      return { ...lines(query), planInUse: planInUse() };
    },

    add(input) {
      const author = cleanName(input.author);
      if (!author) throw badRequest("Choose the name you write under first.");
      const now = Date.now();
      let plan: { id: string; name: string } | null = null;
      if (input.planId) {
        const found = ctx.services.emergencyPlans.list().find((entry) => entry.id === input.planId);
        if (!found) throw notFound("That emergency plan");
        plan = { id: found.id, name: found.name };
      }
      const row: Row = {
        id: newId(),
        happenedAt: heldTime(input.at, now),
        author,
        text: cleanText(input.text),
        planId: plan?.id ?? null,
        planName: plan?.name ?? null,
        createdAt: now,
        updatedAt: now,
        editedAt: null,
        editedBy: null,
      };
      db.insert(eventLog).values(row).run();
      changed();
      return entryLine(row);
    },

    edit(id, input) {
      const current = get(id);
      if (input.baseUpdatedAt !== current.updatedAt)
        throw conflict("This entry was changed on another device after you opened it. Nothing was saved. It is shown as it is now.", {
          updatedAt: current.updatedAt,
        });
      const by = cleanName(input.by);
      if (!by) throw badRequest("Choose the name you write under first.");
      const now = Math.max(Date.now(), current.updatedAt + 1);
      const patch: Partial<Row> = { updatedAt: now, editedAt: now, editedBy: by };
      if (input.text !== undefined) patch.text = cleanText(input.text);
      if (input.at !== undefined) patch.happenedAt = heldTime(input.at, Date.now());
      db.update(eventLog).set(patch).where(eq(eventLog.id, id)).run();
      changed();
      return entryLine(get(id));
    },

    remove(id) {
      get(id);
      db.delete(eventLog).where(eq(eventLog.id, id)).run();
      changed();
    },

    toNotes(query) {
      const { lines: shown } = lines(query);
      if (shown.length === 0) throw badRequest("There is nothing in the log to write to a page yet.");
      const first = shown[0]!.at;
      const last = shown.at(-1)!.at;
      const span = formatDate(first) === formatDate(last) ? formatDate(first) : `${formatDate(first)} to ${formatDate(last)}`;
      const title = `Log of events, ${span}`;
      const markdown = `Written down as it happened, in Outpost. Times are the server's clock.\n\n${logMarkdown(shown)}`;
      const note = ctx.services.notes.create({ title, content: markdownToDoc(markdown).doc });
      return { note: { id: note.id, title: note.title }, lines: shown.length };
    },

    count: () => db.select({ n: count() }).from(eventLog).get()?.n ?? 0,
    eraseAll() {
      const n = db.select({ n: count() }).from(eventLog).get()?.n ?? 0;
      db.delete(eventLog).run();
      if (n > 0) changed();
      return n;
    },
  };
}
