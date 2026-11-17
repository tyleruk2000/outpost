/**
 * Learning progress (modules/learning): what the reader records of where each learner
 * got to, on a real server with the stand-in course archive (course-archive.ts) behind
 * the stand-in kiwix-serve. No real course archive is used.
 */
import fs from "node:fs";
import path from "node:path";
import { AGE_BAND_IDS, aboutTime, LEARNERS_MAX, LEARNING_SECONDS_PER_WRITE_MAX } from "@outpost/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { archiveKey, weekStart } from "../src/modules/learning/index.ts";
import { COURSE_BOOK, COURSE_NAME, COURSE_UUID } from "./course-archive.ts";
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
  // Its details are read from the archive in the background; wait, so that nothing is still writing when the server closes.
  const until = Date.now() + 10_000;
  while (!(app.ctx.services.collections.get(course)?.meta.kiwix as { enriched?: boolean } | undefined)?.enriched) {
    if (Date.now() > until) throw new Error("the course's details were never read");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await app.ctx.services.kiwix.sync();
});
afterAll(async () => {
  await app?.close();
  await kiwix?.close();
});
beforeEach(async () => {
  await app.api("DELETE", "/api/learning/progress?everyone=1");
});

const visit = (learner: string, pagePath: string, seconds: number, opened = true, title = pagePath) =>
  app.api("POST", "/api/learning/visits", { learner, collectionId: course, path: pagePath, title, seconds, opened });
const done = (learner: string, pagePath: string, isDone = true, how?: "marked" | "watched") =>
  app.api("POST", "/api/learning/done", { learner, collectionId: course, path: pagePath, title: pagePath, done: isDone, how });
const progress = async (query: string) => {
  const response = await app.api("GET", `/api/learning/progress?${query}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as { courses: Array<Record<string, unknown> & { topics: unknown[] }> };
};

describe("recording", () => {
  it("keeps progress under the archive's own name, so that a newer edition carries it on", () => {
    expect(archiveKey({ meta: { zim: { uuid: "x", bookName: "khanacademy_en_all_2023-03" } } })).toBe("khanacademy_en_all");
    expect(archiveKey({ meta: { zim: { uuid: "x", bookName: "phet_en_all_2024-11-05" } } })).toBe("phet_en_all");
    expect(archiveKey({ meta: { zim: { uuid: "x", bookName: "a_b" }, kiwix: { name: "own-name" } } })).toBe("own-name");
    expect(archiveKey({ meta: {} })).toBeNull();
    expect(archiveKey(app.ctx.services.collections.get(course)!)).toBe(COURSE_NAME);
  });

  it("records a page opened and left, and says where the learner got to", async () => {
    expect((await visit("Sam", "lessons/halves", 40, true, "Halves")).body.page).toMatchObject({ path: "lessons/halves", title: "Halves" });
    await visit("Sam", "lessons/quarters", 10, true, "Quarters");
    const { courses } = await progress("learner=Sam");
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({
      learner: "Sam",
      archive: COURSE_NAME,
      collectionId: course,
      last: { path: "lessons/quarters", title: "Quarters" },
      pagesOpened: 2,
      pagesDone: 0,
      secondsInAll: 50,
      secondsThisWeek: 50,
    });
    const page = await app.api("GET", `/api/learning/page?learner=Sam&collectionId=${course}&path=lessons/halves`);
    expect(page.body.page).toMatchObject({ secondsInView: 40, doneAt: null });
    // The Library's collection page asks for one archive only.
    expect((await progress(`learner=Sam&collectionId=${course}`)).courses).toHaveLength(1);
  });

  it("holds time in view to what could have passed, and to two minutes a write", async () => {
    await visit("Sam", "lessons/halves", 10_000);
    let page = (await app.api("GET", `/api/learning/page?learner=Sam&collectionId=${course}&path=lessons/halves`)).body.page;
    expect(page.secondsInView).toBe(LEARNING_SECONDS_PER_WRITE_MAX);
    // Written again at once: a device cannot have counted a minute since.
    await visit("Sam", "lessons/halves", 60, false);
    page = (await app.api("GET", `/api/learning/page?learner=Sam&collectionId=${course}&path=lessons/halves`)).body.page;
    expect(page.secondsInView).toBeLessThanOrEqual(LEARNING_SECONDS_PER_WRITE_MAX + 6);
    // More than a day in one write is refused outright.
    expect((await visit("Sam", "lessons/halves", 90_000)).status).toBe(400);
  });

  it("refuses an address that climbs out of the archive, an archive it does not know, and control characters in a name", async () => {
    expect((await visit("Sam", "../raw/x", 1)).status).toBe(400);
    expect((await visit("Sam\u0007", "lessons/halves", 1)).status).toBe(400);
    const unknown = await app.api("POST", "/api/learning/visits", {
      learner: "Sam",
      collectionId: "nope",
      path: "a",
      title: "",
      seconds: 1,
      opened: true,
    });
    expect(unknown.status).toBe(404);
    expect((await app.api("GET", "/api/learning/progress")).status).toBe(400);
  });

  it("keeps each learner's progress apart, and 'Just me' is a learner of its own", async () => {
    await visit("Sam", "lessons/halves", 20);
    await done("Sam", "lessons/halves");
    await visit("", "lessons/triangles", 20);
    expect((await progress("learner=Alex")).courses).toEqual([]);
    expect((await progress("learner=")).courses[0]).toMatchObject({ learner: "", last: { path: "lessons/triangles" }, pagesDone: 0 });
    expect((await progress("learner=Sam")).courses[0]).toMatchObject({ pagesDone: 1 });
    // Names are kept with their spaces tidied, so " Sam  " is Sam.
    expect((await progress("learner=%20Sam%20%20")).courses).toHaveLength(1);
    const everyone = await progress("everyone=1");
    expect(everyone.courses.map((entry) => entry.learner).sort()).toEqual(["", "Sam"]);
    const learners = await app.api("GET", "/api/learning/learners");
    expect(learners.body.learners.map((entry: { name: string }) => entry.name).sort()).toEqual(["", "Sam"]);
  });

  it("offers the household's people as learners", async () => {
    const band = AGE_BAND_IDS[0];
    const saved = await app.api("PUT", "/api/supplies/household", {
      daysWanted: 3,
      drinkingLitres: 2,
      allUsesLitres: 3,
      waterBasis: "drinking",
      members: [
        { kind: "person", name: "Robin", band },
        { kind: "pet", name: "Biscuit" },
        { kind: "person", name: "", band },
      ],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((await app.api("GET", "/api/learning/learners")).body.household).toEqual(["Robin"]);
  });

  it(`keeps progress for at most ${LEARNERS_MAX} learners`, async () => {
    for (let i = 0; i < LEARNERS_MAX; i += 1) expect((await visit(`Learner ${i}`, "index", 1)).status).toBe(200);
    expect((await visit("One too many", "index", 1)).status).toBe(409);
    // Someone already kept goes on being recorded.
    expect((await visit("Learner 3", "lessons/halves", 1)).status).toBe(200);
  });
});

describe("done", () => {
  it("is marked, undone, and counted as watched when a video plays through", async () => {
    const marked = await done("Sam", "lessons/halves");
    expect(marked.body.page).toMatchObject({ doneHow: "marked" });
    expect(marked.body.page.doneAt).toBeGreaterThan(0);
    expect((await done("Sam", "lessons/halves", false)).body.page).toMatchObject({ doneAt: null, doneHow: null });
    expect((await done("Sam", "videos/adding-fractions", true, "watched")).body.page).toMatchObject({ doneHow: "watched" });
    // Marked by hand first, it stays marked by hand when its video then ends.
    await done("Sam", "lessons/quarters");
    expect((await done("Sam", "lessons/quarters", true, "watched")).body.page).toMatchObject({ doneHow: "marked" });
    expect((await progress("learner=Sam")).courses[0]).toMatchObject({ pagesDone: 2, pagesOpened: 3 });
  });
});

describe("a course's shape", () => {
  const topic = (topicPath: string, title: string, links: string[], home = false) =>
    app.api("POST", "/api/learning/topics", { collectionId: course, path: topicPath, title, links, home });

  it("counts the lessons a topic page lists, leaving out the links every page carries", async () => {
    expect((await topic("index", "Number school", ["topics/fractions", "topics/shapes", "topics/practice", "about"], true)).body.kept).toBe(
      true,
    );
    await topic("topics/fractions", "Fractions", ["index", "about", "lessons/halves", "lessons/quarters", "videos/adding-fractions"]);
    await visit("Sam", "topics/fractions", 5);
    await visit("Sam", "lessons/halves", 5);
    // Opened, but nothing in it done yet: no topic line.
    expect((await progress("learner=Sam")).courses[0]!.topics).toEqual([]);
    await done("Sam", "lessons/halves");
    expect((await progress("learner=Sam")).courses[0]!.topics).toEqual([
      { path: "topics/fractions", title: "Fractions", listed: 3, done: 1 },
    ]);
    // Another learner who never opened the topic page sees no topic line, and none of Sam's done pages.
    await visit("Alex", "lessons/halves", 5);
    expect((await progress("learner=Alex")).courses[0]).toMatchObject({ pagesDone: 0, topics: [] });
  });

  it("shows plain pages done where it could not read a list, and never a made-up total", async () => {
    // A topic page whose list was drawn by a script: the reader saw no links in it.
    await topic("topics/practice", "Practice", []);
    await visit("Sam", "topics/practice", 5);
    await visit("Sam", "lessons/halves", 5);
    await done("Sam", "lessons/halves");
    const [entry] = (await progress("learner=Sam")).courses;
    expect(entry).toMatchObject({ pagesDone: 1, topics: [] });
    // A page of hundreds of links is an index, not a list of lessons.
    const many = Array.from({ length: 400 }, (_, i) => `lessons/l${i}`);
    expect((await topic("topics/everything", "Everything", many)).body.kept).toBe(false);
  });
});

describe("removing", () => {
  it("removes one learner's record on its own, or everyone's, and is counted for Manage", async () => {
    await visit("Sam", "lessons/halves", 5);
    await visit("Alex", "lessons/halves", 5);
    await visit("Alex", "lessons/quarters", 5);
    expect(app.ctx.services.learning.kept.count()).toEqual({ learners: 2, pages: 3 });
    const removed = await app.api("DELETE", "/api/learning/progress?learner=Alex");
    expect(removed.body.removed).toEqual({ learners: 1, pages: 2 });
    expect((await progress("learner=Alex")).courses).toEqual([]);
    expect((await progress("learner=Sam")).courses).toHaveLength(1);
    expect((await app.api("DELETE", "/api/learning/progress")).status).toBe(400);
    expect((await app.api("DELETE", "/api/learning/progress?everyone=1")).body.removed).toEqual({ learners: 1, pages: 1 });
    expect(app.ctx.services.learning.kept.count()).toEqual({ learners: 0, pages: 0 });
  });

  it("is in the plan of 'erase everything'", async () => {
    await visit("Sam", "lessons/halves", 5);
    const plan = await app.api("POST", "/api/manage/plan", { scope: "everything" });
    expect(plan.status, JSON.stringify(plan.body).slice(0, 300)).toBe(200);
    expect(plan.body.plan?.personal?.learning ?? plan.body.personal?.learning).toEqual({ learners: 1, pages: 1 });
  });
});

describe("the reader's proxy", () => {
  it("adds only messages up to the reader, with the sandbox and policy exactly as before", async () => {
    const response = await app.app.inject({
      method: "GET",
      url: `/kiwix/open/content/${COURSE_BOOK}/topics/fractions`,
      headers: { host: "localhost" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-security-policy"]).toBe(
      "default-src 'self' http://localhost data: blob: 'unsafe-inline' 'unsafe-eval'; sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads",
    );
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toContain('type:"outpost:pages"');
    expect(response.body).toContain('type:"outpost:ended"');
    // The bridge never listens for messages, so a page cannot ask the reader for anything through it.
    const bridge = /<script>\(function\(\)\{[\s\S]*?<\/script>/.exec(response.body)![0];
    expect(bridge).not.toMatch(/addEventListener\("message"/);
    expect(bridge).not.toContain("allow-same-origin");
  });
});

describe("words", () => {
  it("says time as a person would", () => {
    expect(aboutTime(0)).toBe("no time");
    expect(aboutTime(30)).toBe("under a minute");
    expect(aboutTime(60)).toBe("about 1 minute");
    expect(aboutTime(25 * 60)).toBe("about 25 minutes");
    expect(aboutTime(60 * 60)).toBe("about an hour");
    expect(aboutTime(95 * 60)).toBe("about an hour and a half");
    expect(aboutTime(2 * 3600 + 100)).toBe("about 2 hours");
    expect(aboutTime(2.5 * 3600)).toBe("about 2 and a half hours");
  });

  it("begins the week on Monday at midnight", () => {
    const wednesday = new Date(2026, 10, 18, 15, 30).getTime();
    expect(new Date(weekStart(wednesday))).toEqual(new Date(2026, 10, 16, 0, 0, 0, 0));
    const monday = new Date(2026, 10, 16, 0, 5).getTime();
    expect(weekStart(monday)).toBe(new Date(2026, 10, 16).getTime());
    const sunday = new Date(2026, 10, 22, 23, 0).getTime();
    expect(weekStart(sunday)).toBe(new Date(2026, 10, 16).getTime());
  });
});
