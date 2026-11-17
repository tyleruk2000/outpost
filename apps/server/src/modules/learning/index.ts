/**
 * Learning progress: where each learner got to in a reference archive, recorded by the
 * reader as pages are left (docs/learning.md).
 *
 * The reader knows which page of an archive is on show because the proxy's small script
 * tells it (modules/kiwix, `BRIDGE`); nothing here reads an archive. What it records:
 * the page's address inside the archive and its title, when it was first and last
 * opened, how long it was in view while the reader's tab was visible, and whether the
 * learner marked it done or played its video through. From pages of links it keeps
 * which other pages of the archive each one lists, to say "3 of 5 done in Fractions".
 *
 * A learner is a name chosen on a device. There are no accounts, so anyone can read and
 * remove anyone's progress, and a name proves nothing about who held the device. It is
 * never put in search and never sent to a model server. It is the household's own data:
 * counted and erased by modules/manage (`kept`), counted on the Storage screen, in
 * backups, and on a portable drive.
 */
import {
  type DoneHow,
  LEARNER_NAME_MAX,
  LEARNERS_MAX,
  LEARNING_PAGES_MAX,
  LEARNING_SECONDS_PER_WRITE_MAX,
  type LearnerSummary,
  type LearningCourse,
  type LearningKept,
  type LearningPage,
  learnerName,
  TOPIC_LINKS_MAX,
} from "@outpost/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import type { CollectionRow } from "../collections/service.ts";

export interface LearningService {
  /** The person's own: counted for "what is stored", and erased with everything else. */
  kept: { count(): LearningKept; eraseAll(): LearningKept };
}

declare module "../../core/context.ts" {
  interface Services {
    learning: LearningService;
  }
}

/** The longest page address and title kept. */
const PATH_MAX = 2000;
const TITLE_MAX = 200;

/** An archive's name without its date: `khanacademy_en_all_2023-03` is `khanacademy_en_all`. */
export function archiveKey(row: Pick<CollectionRow, "meta">): string | null {
  const kiwix = (row.meta.kiwix ?? {}) as { name?: unknown };
  if (typeof kiwix.name === "string" && kiwix.name.trim()) return kiwix.name.trim().slice(0, 200);
  const bookName = row.meta.zim?.bookName;
  if (typeof bookName !== "string" || !bookName) return null;
  return bookName.replace(/_\d{4}-\d{2}(-\d{2})?$/, "").slice(0, 200);
}

/** An address inside an archive, as the reader decoded it: no climbing out, no control characters. */
const pagePath = z
  .string()
  .max(PATH_MAX)
  .refine((value) => !value.split("/").includes("..") && !/\p{Cc}/u.test(value), "That is not a page of the archive.");
const title = z
  .string()
  .max(1000)
  .transform((value) =>
    value
      .replace(/\p{Cc}+/gu, " ")
      .trim()
      .slice(0, TITLE_MAX),
  );
const learner = z
  .string()
  .max(LEARNER_NAME_MAX * 2)
  .transform(learnerName)
  .refine((value) => !/\p{Cc}/u.test(value), "A name cannot hold control characters.");

/** Monday at midnight of this week, by the server's own clock. */
export function weekStart(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}

/** The server's calendar day, "2026-11-17". */
const dayOf = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface PageRow {
  id: string;
  learner: string;
  archive: string;
  archive_title: string;
  path: string;
  title: string;
  first_opened_at: number;
  last_opened_at: number;
  seconds_in_view: number;
  done_at: number | null;
  done_how: string | null;
  updated_at: number;
}

const toPage = (row: PageRow): LearningPage => ({
  path: row.path,
  title: row.title,
  firstOpenedAt: row.first_opened_at,
  lastOpenedAt: row.last_opened_at,
  secondsInView: row.seconds_in_view,
  doneAt: row.done_at,
  doneHow: row.done_how === "watched" ? "watched" : row.done_at ? "marked" : null,
  updatedAt: row.updated_at,
});

export async function registerLearning(app: FastifyInstance, ctx: AppContext, options: { now?: () => number } = {}): Promise<void> {
  const { sqlite } = ctx;
  const { collections } = ctx.services;
  const now = options.now ?? (() => Date.now());

  const statements = {
    page: sqlite.prepare<[string, string, string], PageRow>("SELECT * FROM learning_pages WHERE learner = ? AND archive = ? AND path = ?"),
    insert: sqlite.prepare(
      `INSERT INTO learning_pages (id, learner, archive, archive_title, path, title, first_opened_at, last_opened_at, seconds_in_view, done_at, done_how, updated_at)
       VALUES (@id, @learner, @archive, @archiveTitle, @path, @title, @at, @at, @seconds, @doneAt, @doneHow, @at)`,
    ),
    visit: sqlite.prepare(
      `UPDATE learning_pages SET archive_title = @archiveTitle, title = CASE WHEN @title = '' THEN title ELSE @title END,
         last_opened_at = CASE WHEN @opened THEN @at ELSE last_opened_at END,
         seconds_in_view = seconds_in_view + @seconds, updated_at = @at WHERE id = @id`,
    ),
    done: sqlite.prepare(
      "UPDATE learning_pages SET done_at = @doneAt, done_how = @doneHow, title = CASE WHEN @title = '' THEN title ELSE @title END WHERE id = @id",
    ),
    addDay: sqlite.prepare(
      `INSERT INTO learning_days (learner, archive, day, seconds) VALUES (?, ?, ?, ?)
       ON CONFLICT (learner, archive, day) DO UPDATE SET seconds = seconds + excluded.seconds`,
    ),
    learnerPages: sqlite.prepare<[string], { n: number }>("SELECT count(*) AS n FROM learning_pages WHERE learner = ?"),
    knownLearner: sqlite.prepare<[string], { n: number }>("SELECT (SELECT count(*) FROM learning_pages WHERE learner = ?) AS n"),
    learnerCount: sqlite.prepare<[], { n: number }>("SELECT count(DISTINCT learner) AS n FROM learning_pages"),
    topic: sqlite.prepare(
      `INSERT INTO learning_topics (archive, path, title, links, is_home, seen_at) VALUES (@archive, @path, @title, @links, @isHome, @at)
       ON CONFLICT (archive, path) DO UPDATE SET title = excluded.title, links = excluded.links,
         is_home = max(is_home, excluded.is_home), seen_at = excluded.seen_at`,
    ),
  };

  /** The installed archive a request names, with the key its progress is kept under. */
  function archiveOf(collectionId: string): { row: CollectionRow; key: string } {
    const row = collections.get(collectionId);
    const key = row?.kind === "zim" ? archiveKey(row) : null;
    if (!row || !key) throw notFound("Collection");
    return { row, key };
  }

  /** The row for a page, made when it is not there yet; refuses a learner or a page beyond the limits. */
  function pageRow(who: string, archive: { row: CollectionRow; key: string }, path: string, pageTitle: string, at: number): PageRow {
    const found = statements.page.get(who, archive.key, path);
    if (found) return found;
    if (statements.knownLearner.get(who)!.n === 0 && statements.learnerCount.get()!.n >= LEARNERS_MAX) {
      throw new AppError(
        "conflict",
        `Progress is kept for at most ${LEARNERS_MAX} learners. Remove someone's under Storage, Manage and clean up.`,
      );
    }
    if (statements.learnerPages.get(who)!.n >= LEARNING_PAGES_MAX) {
      // The page opened longest ago that was never done makes room; done pages are kept.
      const oldest = sqlite
        .prepare<[string], { id: string }>(
          "SELECT id FROM learning_pages WHERE learner = ? AND done_at IS NULL ORDER BY updated_at LIMIT 1",
        )
        .get(who);
      if (!oldest) throw new AppError("conflict", `Progress is kept for at most ${LEARNING_PAGES_MAX} pages a learner.`);
      sqlite.prepare("DELETE FROM learning_pages WHERE id = ?").run(oldest.id);
    }
    const id = newId();
    statements.insert.run({
      id,
      learner: who,
      archive: archive.key,
      archiveTitle: archive.row.title.slice(0, TITLE_MAX),
      path,
      title: pageTitle,
      at,
      seconds: 0,
      doneAt: null,
      doneHow: null,
    });
    return statements.page.get(who, archive.key, path)!;
  }

  function recordVisit(input: { learner: string; collectionId: string; path: string; title: string; seconds: number; opened: boolean }) {
    const archive = archiveOf(input.collectionId);
    const at = now();
    return sqlite.transaction(() => {
      const before = statements.page.get(input.learner, archive.key, input.path);
      const row = before ?? pageRow(input.learner, archive, input.path, input.title, at);
      // Time is counted on the device; the server holds it to what could have passed since this
      // page was last written, and to a minute or two in any one write.
      const since = before ? Math.max(0, Math.ceil((at - before.updated_at) / 1000)) + 5 : LEARNING_SECONDS_PER_WRITE_MAX;
      const seconds = Math.max(0, Math.min(Math.round(input.seconds), LEARNING_SECONDS_PER_WRITE_MAX, since));
      statements.visit.run({
        id: row.id,
        archiveTitle: archive.row.title.slice(0, TITLE_MAX),
        title: input.title,
        opened: input.opened || !before ? 1 : 0,
        seconds,
        at,
      });
      if (seconds > 0) statements.addDay.run(input.learner, archive.key, dayOf(at), seconds);
      return toPage(statements.page.get(input.learner, archive.key, input.path)!);
    })();
  }

  function markDone(input: { learner: string; collectionId: string; path: string; title: string; done: boolean; how: DoneHow }) {
    const archive = archiveOf(input.collectionId);
    const at = now();
    return sqlite.transaction(() => {
      const row = pageRow(input.learner, archive, input.path, input.title, at);
      // A page already marked by hand stays marked by hand when its video then ends.
      const keep = input.done && row.done_at !== null;
      statements.done.run({
        id: row.id,
        doneAt: input.done ? (keep ? row.done_at : at) : null,
        doneHow: input.done ? (keep ? row.done_how : input.how) : null,
        title: input.title,
      });
      return toPage(statements.page.get(input.learner, archive.key, input.path)!);
    })();
  }

  /** Installed archives by the key their progress is kept under. */
  function installed(): Map<string, CollectionRow> {
    const byKey = new Map<string, CollectionRow>();
    for (const row of collections.list({ kind: "zim" })) {
      const key = archiveKey(row);
      if (key && (!byKey.has(key) || row.status === "installed")) byKey.set(key, row);
    }
    return byKey;
  }

  /**
   * The topic pages of an archive a learner has worked from, each with the pages it lists.
   * A page's list leaves out itself, the first page and the first page's own links (the
   * subjects and menus every page carries), and counts only when two to TOPIC_LINKS_MAX
   * pages are left and the learner has done at least one of them.
   */
  function topicsOf(archive: string, opened: Set<string>, done: Set<string>) {
    const rows = sqlite
      .prepare<[string], { path: string; title: string; links: string; is_home: number }>(
        "SELECT path, title, links, is_home FROM learning_topics WHERE archive = ?",
      )
      .all(archive);
    const homes = rows.filter((row) => row.is_home === 1);
    const shared = new Set<string>();
    for (const home of homes) {
      shared.add(home.path);
      for (const link of JSON.parse(home.links) as string[]) shared.add(link);
    }
    const topics: LearningCourse["topics"] = [];
    for (const row of rows) {
      if (row.is_home === 1 || !opened.has(row.path)) continue;
      const listed = (JSON.parse(row.links) as string[]).filter((link) => link !== row.path && !shared.has(link));
      if (listed.length < 2 || listed.length > TOPIC_LINKS_MAX) continue;
      const doneHere = listed.filter((link) => done.has(link)).length;
      if (doneHere === 0) continue;
      topics.push({ path: row.path, title: row.title || row.path, listed: listed.length, done: doneHere });
    }
    return topics.sort((a, b) => a.title.localeCompare(b.title));
  }

  function progress(filter: { learner?: string; archive?: string }): { courses: LearningCourse[]; weekFrom: number } {
    const weekFrom = weekStart(now());
    const where: string[] = [];
    const values: string[] = [];
    if (filter.learner !== undefined) {
      where.push("learner = ?");
      values.push(filter.learner);
    }
    if (filter.archive !== undefined) {
      where.push("archive = ?");
      values.push(filter.archive);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = sqlite.prepare<string[], PageRow>(`SELECT * FROM learning_pages ${clause} ORDER BY updated_at DESC`).all(...values);
    const days = sqlite
      .prepare<string[], { learner: string; archive: string; day: string; seconds: number }>(`SELECT * FROM learning_days ${clause}`)
      .all(...values);
    const byKey = installed();
    const groups = new Map<string, PageRow[]>();
    for (const row of rows) {
      const key = `${row.learner}\n${row.archive}`;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    const thisWeek = dayOf(weekFrom);
    const courses: LearningCourse[] = [];
    for (const list of groups.values()) {
      const first = list[0]!;
      const opened = new Set(list.map((row) => row.path));
      const done = new Set(list.filter((row) => row.done_at !== null).map((row) => row.path));
      const collection = byKey.get(first.archive);
      courses.push({
        learner: first.learner,
        archive: first.archive,
        title: collection?.title ?? first.archive_title,
        collectionId: collection?.status === "installed" ? collection.id : null,
        last: { path: first.path, title: first.title || first.path, at: first.updated_at },
        pagesOpened: list.length,
        pagesDone: done.size,
        secondsThisWeek: days
          .filter((day) => day.learner === first.learner && day.archive === first.archive && day.day >= thisWeek)
          .reduce((sum, day) => sum + day.seconds, 0),
        secondsInAll: list.reduce((sum, row) => sum + row.seconds_in_view, 0),
        topics: topicsOf(first.archive, opened, done),
      });
    }
    courses.sort((a, b) => b.last.at - a.last.at);
    return { courses, weekFrom };
  }

  function household(): string[] {
    const names = new Set<string>();
    try {
      for (const member of ctx.services.supplies.household().members)
        if (member.kind === "person" && member.name.trim()) names.add(learnerName(member.name));
    } catch {
      // No household kept: nothing to offer from there.
    }
    try {
      const rows = sqlite
        .prepare<[], { name: unknown }>(
          "SELECT DISTINCT json_extract(person.value, '$.name') AS name FROM emergency_plans, json_each(emergency_plans.body, '$.people') AS person",
        )
        .all();
      for (const row of rows) if (typeof row.name === "string" && row.name.trim()) names.add(learnerName(row.name));
    } catch {
      // A plan whose people cannot be read offers no one.
    }
    names.delete("");
    return [...names].sort((a, b) => a.localeCompare(b)).slice(0, 60);
  }

  function count(): LearningKept {
    const row = sqlite
      .prepare<[], { learners: number; pages: number }>("SELECT count(DISTINCT learner) AS learners, count(*) AS pages FROM learning_pages")
      .get()!;
    return { learners: row.learners, pages: row.pages };
  }

  function remove(who: string | null): LearningKept {
    return sqlite.transaction(() => {
      const before = count();
      if (who === null) {
        sqlite.prepare("DELETE FROM learning_pages").run();
        sqlite.prepare("DELETE FROM learning_days").run();
        // What the archives' pages list is no one's progress, but it says which pages were opened.
        sqlite.prepare("DELETE FROM learning_topics").run();
        return before;
      }
      const pages = sqlite.prepare("DELETE FROM learning_pages WHERE learner = ?").run(who).changes;
      sqlite.prepare("DELETE FROM learning_days WHERE learner = ?").run(who);
      return { learners: pages > 0 ? 1 : 0, pages };
    })();
  }

  const changed = () => ctx.events.publish({ type: "learning.changed" });
  ctx.services.learning = { kept: { count, eraseAll: () => remove(null) } };

  // ── Routes ──

  const visitBody = z
    .object({
      learner,
      collectionId: z.string().min(1).max(100),
      path: pagePath,
      title,
      seconds: z.number().min(0).max(86_400),
      opened: z.boolean(),
    })
    .strict();
  app.post("/api/learning/visits", async (request) => ({ page: recordVisit(visitBody.parse(request.body)) }));

  const doneBody = z
    .object({
      learner,
      collectionId: z.string().min(1).max(100),
      path: pagePath,
      title,
      done: z.boolean(),
      how: z.enum(["marked", "watched"]).default("marked"),
    })
    .strict();
  app.post("/api/learning/done", async (request) => {
    const page = markDone(doneBody.parse(request.body));
    changed();
    return { page };
  });

  const topicBody = z
    .object({
      collectionId: z.string().min(1).max(100),
      path: pagePath,
      title,
      links: z.array(pagePath).max(TOPIC_LINKS_MAX * 2),
      home: z.boolean(),
    })
    .strict();
  app.post("/api/learning/topics", async (request) => {
    const body = topicBody.parse(request.body);
    const { key } = archiveOf(body.collectionId);
    const links = [...new Set(body.links)].filter((link) => link !== body.path);
    // A page of more links than a list of lessons holds is an index or a menu; it is not kept.
    if (links.length > TOPIC_LINKS_MAX && !body.home) return { kept: false };
    statements.topic.run({
      archive: key,
      path: body.path,
      title: body.title,
      links: JSON.stringify(links.slice(0, TOPIC_LINKS_MAX * 2)),
      isHome: body.home ? 1 : 0,
      at: now(),
    });
    return { kept: true };
  });

  const pageQuery = z.object({ learner, collectionId: z.string().min(1).max(100), path: pagePath });
  app.get("/api/learning/page", async (request) => {
    const query = pageQuery.parse(request.query);
    const { key } = archiveOf(query.collectionId);
    const row = statements.page.get(query.learner, key, query.path);
    return { page: row ? toPage(row) : null };
  });

  app.get("/api/learning/learners", async () => {
    const learners = sqlite
      .prepare<[], LearnerSummary>(
        "SELECT learner AS name, count(DISTINCT archive) AS courses, count(*) AS pages, max(updated_at) AS lastAt FROM learning_pages GROUP BY learner ORDER BY lastAt DESC",
      )
      .all();
    return { learners, household: household() };
  });

  const progressQuery = z.object({
    learner: learner.optional(),
    everyone: z.literal("1").optional(),
    collectionId: z.string().max(100).optional(),
  });
  app.get("/api/learning/progress", async (request) => {
    const query = progressQuery.parse(request.query);
    if (query.learner === undefined && query.everyone !== "1")
      throw new AppError("bad_request", "Say whose progress: a learner, or everyone.");
    const archive = query.collectionId ? archiveOf(query.collectionId).key : undefined;
    return progress({ learner: query.everyone === "1" ? undefined : query.learner, archive });
  });

  const removeQuery = z.object({ learner: learner.optional(), everyone: z.literal("1").optional() });
  app.delete("/api/learning/progress", async (request) => {
    const query = removeQuery.parse(request.query);
    if (query.learner === undefined && query.everyone !== "1")
      throw new AppError("bad_request", "Say whose progress to remove: a learner, or everyone.");
    const removed = remove(query.everyone === "1" ? null : query.learner!);
    changed();
    return { removed };
  });
}
