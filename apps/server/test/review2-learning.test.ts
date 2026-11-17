/**
 * What a hostile archive page (or another device) can make the learning tables hold.
 * The reader passes on the lists of links an archive's page reports; a page can report
 * any number of made-up pages of any length, so what is kept of them must be bounded.
 */
import fs from "node:fs";
import path from "node:path";
import { LEARNING_TOPICS_MAX, TOPIC_LINKS_BYTES_MAX } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COURSE_BOOK, COURSE_UUID } from "./course-archive.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { type NautilusArchive, startNautilusArchive, zimHeader } from "./nautilus-archive.ts";

let kiwix: NautilusArchive;
let app: TestApp;
let course: string;

beforeAll(async () => {
  kiwix = await startNautilusArchive();
  app = await createTestApp({ OUTPOST_KIWIX_URL: kiwix.url });
  const location = app.ctx.services.storage.getDefault();
  const relPath = `collections/zim/${COURSE_BOOK}.zim`;
  fs.mkdirSync(path.dirname(path.join(location.path, relPath)), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), zimHeader(COURSE_UUID));
  const imported = await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath });
  expect(imported.status, JSON.stringify(imported.body)).toBe(200);
  course = imported.body.collection.id;
  const until = Date.now() + 10_000;
  while (!(app.ctx.services.collections.get(course)?.meta.kiwix as { enriched?: boolean } | undefined)?.enriched) {
    if (Date.now() > until) throw new Error("the course's details were never read");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
});
afterAll(async () => {
  await app?.close();
  await kiwix?.close();
});

const topic = (topicPath: string, links: string[]) =>
  app.api("POST", "/api/learning/topics", { collectionId: course, path: topicPath, title: "T", links, home: false });
const topicRows = () => (app.ctx.sqlite.prepare("SELECT count(*) AS n FROM learning_topics").get() as { n: number }).n;
const topicBytes = () =>
  (app.ctx.sqlite.prepare("SELECT coalesce(sum(length(links)), 0) AS n FROM learning_topics").get() as { n: number }).n;

describe("lists of links a page reports", () => {
  it("does not keep a list larger than a list of lessons could be", async () => {
    const long = Array.from({ length: 300 }, (_, i) => `lessons/${String(i).padStart(4, "0")}-${"x".repeat(1900)}`);
    const response = await topic("topics/huge", long);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.kept).toBe(false);
    expect(topicBytes()).toBeLessThanOrEqual(TOPIC_LINKS_BYTES_MAX);
  });

  it("keeps at most so many pages of links for an archive, letting the oldest go", async () => {
    const insert = app.ctx.sqlite.prepare(
      "INSERT INTO learning_topics (archive, path, title, links, is_home, seen_at) VALUES (?, ?, '', '[]', 0, ?)",
    );
    const archive = (app.ctx.sqlite.prepare("SELECT archive FROM learning_topics LIMIT 1").get() as { archive: string } | undefined)
      ?.archive;
    // Fill to the limit directly, under the key the archive's progress is kept under.
    const { archiveKey } = await import("../src/modules/learning/index.ts");
    const key = archive ?? archiveKey(app.ctx.services.collections.get(course)!)!;
    app.ctx.sqlite.transaction(() => {
      for (let i = topicRows(); i < LEARNING_TOPICS_MAX; i++) insert.run(key, `filled/${i}`, i);
    })();
    expect(topicRows()).toBe(LEARNING_TOPICS_MAX);
    for (let i = 0; i < 5; i++) expect((await topic(`made-up/${i}`, ["lessons/a", "lessons/b"])).body.kept).toBe(true);
    expect(topicRows()).toBe(LEARNING_TOPICS_MAX);
    // The newest are what is kept.
    expect(app.ctx.sqlite.prepare("SELECT count(*) AS n FROM learning_topics WHERE path LIKE 'made-up/%'").get()).toEqual({ n: 5 });
  });
});
