import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plainDescription, readOpf } from "../src/modules/calibre/opf.ts";
import { buildEpub, tinyPng } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

/** A metadata.opf as Calibre writes it (OPF 2.0, `calibre:` metas, a guide reference to the cover). */
function calibreOpf(book: { title: string; authors: string[]; series?: string; index?: string; tags?: string[]; uuid: string }) {
  return `<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uuid_id" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier opf:scheme="calibre" id="calibre_id">1</dc:identifier>
    <dc:identifier opf:scheme="uuid" id="uuid_id">${book.uuid}</dc:identifier>
    <dc:title>${book.title}</dc:title>
    ${book.authors.map((name) => `<dc:creator opf:file-as="${name}" opf:role="aut">${name}</dc:creator>`).join("\n    ")}
    <dc:creator opf:role="trl">A Translator</dc:creator>
    <dc:description>&lt;p&gt;A desert planet.&lt;/p&gt;&lt;p&gt;Spice &amp;amp; sand.&lt;/p&gt;</dc:description>
    <dc:language>eng</dc:language>
    ${(book.tags ?? []).map((tag) => `<dc:subject>${tag}</dc:subject>`).join("\n    ")}
    ${book.series ? `<meta name="calibre:series" content="${book.series}"/>` : ""}
    ${book.index ? `<meta name="calibre:series_index" content="${book.index}"/>` : ""}
    <meta name="calibre:title_sort" content="${book.title}"/>
  </metadata>
  <guide>
    <reference type="cover" title="Cover" href="cover.jpg"/>
  </guide>
</package>`;
}

/** Every file under a folder with a digest of its bytes and its modification time. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (folder: string) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(full);
      else {
        const stat = fs.statSync(full);
        out[path.relative(dir, full)] = `${crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex")}:${stat.mtimeMs}`;
      }
    }
  };
  visit(dir);
  return out;
}

describe("bringing in a Calibre library", () => {
  let app: TestApp;
  let library: string;
  let locationId: string;

  beforeEach(async () => {
    app = await createTestApp();
    const location = app.ctx.services.storage.getDefault();
    locationId = location.id;
    library = path.join(location.path, "Calibre Library");
    const dune = path.join(library, "Frank Herbert", "Dune (1)");
    fs.mkdirSync(dune, { recursive: true });
    fs.writeFileSync(
      path.join(dune, "metadata.opf"),
      calibreOpf({
        title: "Dune",
        authors: ["Frank Herbert"],
        series: "Dune",
        index: "1.0",
        tags: ["Fiction", "Science fiction"],
        uuid: "u-1",
      }),
    );
    fs.writeFileSync(
      path.join(dune, "Dune - Frank Herbert.epub"),
      await buildEpub({ title: "Dune", author: "Frank Herbert", chapters: [{ file: "c1.xhtml", body: "<p>Arrakis has sandworms.</p>" }] }),
    );
    fs.writeFileSync(path.join(dune, "Dune - Frank Herbert.mobi"), "not really a mobi");
    fs.writeFileSync(path.join(dune, "cover.jpg"), tinyPng);

    const knots = path.join(library, "Jane Doe", "Knots for Sailors (2)");
    fs.mkdirSync(knots, { recursive: true });
    fs.writeFileSync(
      path.join(knots, "metadata.opf"),
      calibreOpf({ title: "Knots for Sailors", authors: ["Jane Doe", "Ann Roe"], uuid: "u-2" }),
    );
    fs.writeFileSync(path.join(knots, "Knots for Sailors - Jane Doe.txt"), "The bowline makes a loop that does not slip.");

    const mobi = path.join(library, "Someone", "Only Mobi (3)");
    fs.mkdirSync(mobi, { recursive: true });
    fs.writeFileSync(path.join(mobi, "metadata.opf"), calibreOpf({ title: "Only Mobi", authors: ["Someone"], uuid: "u-3" }));
    fs.writeFileSync(path.join(mobi, "Only Mobi - Someone.mobi"), "x");

    fs.writeFileSync(path.join(library, "metadata.db"), "SQLite format 3\0");
    fs.mkdirSync(path.join(library, ".caltrash"));
  });
  afterEach(() => app.close());

  async function read(relPath = "Calibre Library") {
    const started = await app.api("POST", "/api/calibre", { locationId, relPath });
    expect(started.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    return (await app.api("GET", `/api/calibre/${started.body.import.id}`)).body.import;
  }

  it("reads Calibre's metadata.opf: authors by role, series, tags, description, language, uuid and cover", () => {
    const xml = calibreOpf({ title: "Dune", authors: ["Frank Herbert"], series: "Dune", index: "2.5", tags: ["Fiction"], uuid: "u-1" });
    expect(readOpf(xml)).toEqual({
      title: "Dune",
      authors: ["Frank Herbert"],
      series: "Dune",
      seriesIndex: 2.5,
      tags: ["Fiction"],
      description: "A desert planet.\nSpice & sand.",
      language: "eng",
      uuid: "u-1",
      coverHref: "cover.jpg",
    });
  });

  it("reads a description full of unclosed angle brackets without holding the server up", () => {
    // Read on the server's thread: a metadata.opf of its largest size, every character an
    // escaped "<" with no ">" after it, once took minutes to turn into plain words.
    const xml = `<?xml version="1.0"?><package><metadata><dc:title>T</dc:title><dc:description>${"&lt;".repeat(250_000)}</dc:description></metadata></package>`;
    const started = performance.now();
    const book = readOpf(xml);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(book.title).toBe("T");
    expect(plainDescription("<p>A <b>bold</b> claim<br/>that 1 < 2</p>")).toBe("A bold claim\nthat 1 < 2");
  });

  it("says how many books and how much space before anything is added", async () => {
    const before = snapshot(library);
    const dto = await read();
    expect(dto.state).toBe("ready");
    expect(dto.plan).toMatchObject({ bookCount: 2, coverCount: 1, hasCalibreDatabase: true, beyondLimit: 0 });
    const dune = dto.plan.books.find((book: { title: string }) => book.title === "Dune");
    expect(dune).toMatchObject({
      folder: "Frank Herbert/Dune (1)",
      authors: ["Frank Herbert"],
      series: "Dune",
      seriesIndex: 1,
      tags: ["Fiction", "Science fiction"],
      file: { ext: "epub" },
      cover: { name: "cover.jpg" },
      otherFormats: ["MOBI"],
    });
    const sizes = dto.plan.books.reduce(
      (sum: number, book: { file: { sizeBytes: number }; cover: { sizeBytes: number } | null }) =>
        sum + book.file.sizeBytes + (book.cover?.sizeBytes ?? 0),
      0,
    );
    expect(dto.plan.totalBytes).toBe(sizes);
    expect(dto.plan.leftOut).toEqual([expect.objectContaining({ title: "Only Mobi", reason: expect.stringContaining("Only in MOBI") })]);
    expect((await app.api("GET", "/api/documents")).body.documents).toHaveLength(0);
    expect(snapshot(library)).toEqual(before);
  });

  it("records the books where they are, with their details and covers, and leaves the Calibre folder as it was", async () => {
    const before = snapshot(library);
    const dto = await read();
    const committed = await app.api("POST", `/api/calibre/${dto.id}/commit`, { mode: "in-place" });
    expect(committed.status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const done = (await app.api("GET", `/api/calibre/${dto.id}`)).body.import;
    expect(done.state).toBe("completed");
    expect(done.report).toEqual({ added: 2, alreadyThere: 0, failed: [], stopped: false });
    // Reading and bringing in both count books, so a task reads "1 of 2 books".
    const { jobs } = (await app.api("GET", "/api/jobs?limit=50")).body as { jobs: Array<{ type: string; progress: { unit?: string } }> };
    for (const type of ["calibre.read", "calibre.import"]) {
      expect(jobs.find((job) => job.type === type)?.progress.unit, type).toBe("books");
    }

    const list = (await app.api("GET", "/api/documents")).body.documents;
    const dune = list.find((doc: { title: string }) => doc.title === "Dune");
    expect(dune).toMatchObject({
      relPath: "Calibre Library/Frank Herbert/Dune (1)/Dune - Frank Herbert.epub",
      author: "Frank Herbert",
      source: "Calibre library",
      language: "eng",
      tags: expect.arrayContaining(["Fiction", "Science fiction"]),
    });
    expect(dune.description).toContain("A desert planet.");
    const knots = list.find((doc: { title: string }) => doc.title === "Knots for Sailors");
    expect(knots.author).toBe("Jane Doe & Ann Roe");

    const details = (await app.api("GET", `/api/documents/${dune.id}/book`)).body.details;
    expect(details).toEqual({
      documentId: dune.id,
      authors: ["Frank Herbert"],
      series: "Dune",
      seriesIndex: 1,
      coverUrl: `/api/documents/${dune.id}/cover`,
      inCalibreFolder: true,
    });
    const cover = await app.app.inject({ method: "GET", url: details.coverUrl, headers: { host: "localhost" } });
    expect(cover.statusCode).toBe(200);
    expect(cover.headers["content-type"]).toBe("image/jpeg");
    expect((await app.api("GET", `/api/documents/${knots.id}/book`)).body.details.coverUrl).toBeNull();

    expect(snapshot(library)).toEqual(before);

    // Forgetting the document takes Outpost's copy of the cover with it, and leaves the book's file.
    await app.api("DELETE", `/api/documents/${dune.id}?forget=1`);
    await app.ctx.jobs.whenIdle();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fs.existsSync(path.join(app.ctx.config.dataDir, "covers", `${dune.id}.jpg`))).toBe(false);
    expect(fs.existsSync(path.join(library, "Frank Herbert", "Dune (1)", "Dune - Frank Herbert.epub"))).toBe(true);
  });

  it("finds a book by its series, in search and in the library's own list, a book already there included", async () => {
    const add = async (folder: string, title: string, index: string) => {
      const dir = path.join(library, "Ann Mariner", folder);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "metadata.opf"),
        calibreOpf({ title, authors: ["Ann Mariner"], series: "Tales of the Lighthouse", index, uuid: `u-${folder}` }),
      );
      fs.writeFileSync(path.join(dir, `${title} - Ann Mariner.txt`), `${title}: the lamp was lit at dusk.`);
    };
    await add("Keeper (4)", "The Keeper", "2.0");
    // Already in the library before it is brought in from Calibre: it gets its series too.
    const earlier = path.join(app.dir, "Fog - Ann Mariner.txt");
    fs.writeFileSync(earlier, "Fog: the horn sounded all night.");
    await app.ctx.services.documents.ingestFile({ sourcePath: earlier, originalName: "Fog - Ann Mariner.txt" });
    await add("Fog (5)", "Fog", "3.0");
    fs.copyFileSync(earlier, path.join(library, "Ann Mariner", "Fog (5)", "Fog - Ann Mariner.txt"));

    const dto = await read();
    await app.api("POST", `/api/calibre/${dto.id}/commit`, { mode: "in-place" });
    await app.ctx.jobs.whenIdle();

    const found = (await app.api("GET", `/api/search?q=${encodeURIComponent("lighthouse tales")}`)).body.results as Array<{
      title: string;
    }>;
    expect(found.map((result) => result.title).sort()).toEqual(["Fog - Ann Mariner", "The Keeper"]);
    const listed = (await app.api("GET", "/api/documents?q=lighthouse")).body.documents as Array<{ title: string }>;
    expect(listed.map((doc) => doc.title).sort()).toEqual(["Fog - Ann Mariner", "The Keeper"]);
  });

  it("is found by the name of its series, not by the bare words 'series' and 'book'", async () => {
    const dto = await read();
    await app.api("POST", `/api/calibre/${dto.id}/commit`, { mode: "in-place" });
    await app.ctx.jobs.whenIdle();
    const titles = async (q: string) =>
      ((await app.api("GET", `/api/search?q=${encodeURIComponent(q)}`)).body.results as Array<{ title: string }>).map((r) => r.title);
    expect(await titles("dune")).toContain("Dune");
    expect(await titles("series")).toEqual([]);
    expect(await titles("book")).toEqual([]);
  });

  it("puts the series of books brought in before it was searchable into search, once, as a job", async () => {
    const dto = await read();
    await app.api("POST", `/api/calibre/${dto.id}/commit`, { mode: "in-place" });
    await app.ctx.jobs.whenIdle();
    // As a library brought in before series were searchable: the entries say nothing of the series.
    const { calibre, documents, search } = app.ctx.services;
    const dune = documents.list({ q: "Dune" }).documents.find((doc) => doc.title === "Dune")!;
    search.upsert({ kind: "document", entityId: dune.id, title: "Unrelated title", url: `/library/documents/${dune.id}`, sections: [] });
    app.ctx.sqlite.prepare("DELETE FROM library_meta WHERE key = 'calibre.seriesInSearch'").run();
    expect((await app.api("GET", "/api/search?q=dune")).body.results).toEqual([]);

    const job = calibre.indexSeriesIfNeeded();
    expect(job).toMatchObject({ type: "calibre.series" });
    await app.ctx.jobs.whenIdle();
    expect(((await app.api("GET", "/api/search?q=dune")).body.results as Array<{ entityId: string }>).map((r) => r.entityId)).toContain(
      dune.id,
    );
    // Done once: not again at the next start.
    expect(calibre.indexSeriesIfNeeded()).toBeNull();
  });

  it("copies the books into the library, and a second import adds nothing twice", async () => {
    const before = snapshot(library);
    const first = await read();
    await app.api("POST", `/api/calibre/${first.id}/commit`, { mode: "copy" });
    await app.ctx.jobs.whenIdle();
    expect((await app.api("GET", `/api/calibre/${first.id}`)).body.import.report.added).toBe(2);
    const docs = (await app.api("GET", "/api/documents")).body.documents;
    expect(docs.every((doc: { relPath: string }) => doc.relPath.startsWith("documents/"))).toBe(true);
    expect((await app.api("GET", `/api/documents/${docs[0].id}/book`)).body.details.inCalibreFolder).toBe(false);

    const second = await read();
    await app.api("POST", `/api/calibre/${second.id}/commit`, { mode: "in-place" });
    await app.ctx.jobs.whenIdle();
    expect((await app.api("GET", `/api/calibre/${second.id}`)).body.import.report).toMatchObject({ added: 0, alreadyThere: 2 });
    expect((await app.api("GET", "/api/documents")).body.documents).toHaveLength(2);
    expect(snapshot(library)).toEqual(before);
  });

  it("reads one author's folder as well as the whole library", async () => {
    const dto = await read("Calibre Library/Jane Doe");
    expect(dto.plan).toMatchObject({ bookCount: 1, hasCalibreDatabase: false });
  });

  it("says plainly when a folder holds no Calibre books", async () => {
    fs.mkdirSync(path.join(app.ctx.services.storage.getDefault().path, "Empty"));
    const dto = await read("Empty");
    expect(dto.state).toBe("failed");
    expect(dto.error).toContain("No Calibre books were found");
  });

  it("refuses a path out of the location and a link that leads outside every storage location", async () => {
    expect((await app.api("POST", "/api/calibre", { locationId, relPath: "../.." })).status).toBe(400);
    const outside = path.join(app.dir, "elsewhere");
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(app.ctx.services.storage.getDefault().path, "linked"));
    expect((await app.api("POST", "/api/calibre", { locationId, relPath: "linked" })).status).toBe(403);
  });

  it("follows no link put in place of a book, its cover or its folder between reading and adding", async () => {
    const dto = await read();
    expect(dto.plan.bookCount).toBe(2);
    // Outside every storage location: what a link swapped in would reach.
    const outside = path.join(app.dir, "private");
    fs.mkdirSync(outside);
    const secret = Buffer.concat([tinyPng, Buffer.from("not for the library")]);
    fs.writeFileSync(path.join(outside, "secret.jpg"), secret);
    fs.writeFileSync(path.join(outside, "secret.txt"), "The private notes of someone else.");
    const dune = path.join(library, "Frank Herbert", "Dune (1)");
    fs.rmSync(path.join(dune, "cover.jpg"));
    fs.symlinkSync(path.join(outside, "secret.jpg"), path.join(dune, "cover.jpg"));
    fs.rmSync(path.join(dune, "metadata.opf"));
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(dune, "metadata.opf"));
    // The whole folder of the other book becomes a link to the private folder, holding a file of the same name.
    fs.copyFileSync(path.join(outside, "secret.txt"), path.join(outside, "Knots for Sailors - Jane Doe.txt"));
    const knots = path.join(library, "Jane Doe", "Knots for Sailors (2)");
    fs.rmSync(knots, { recursive: true });
    fs.symlinkSync(outside, knots);

    await app.api("POST", `/api/calibre/${dto.id}/commit`, { mode: "copy" });
    await app.ctx.jobs.whenIdle();
    const report = (await app.api("GET", `/api/calibre/${dto.id}`)).body.import.report;
    expect(report.failed.map((entry: { title: string }) => entry.title)).toEqual([expect.stringContaining("Knots for Sailors")]);
    const docs = (await app.api("GET", "/api/documents")).body.documents as Array<{ id: string; title: string }>;
    expect(docs.map((doc) => doc.title)).toEqual(["Dune"]);
    // The book itself is still an ordinary file: added, with neither the cover nor the description read through the links.
    expect((await app.api("GET", `/api/documents/${docs[0]!.id}/book`)).body.details.coverUrl).toBeNull();
    const covers = path.join(app.ctx.config.dataDir, "covers");
    for (const name of fs.existsSync(covers) ? fs.readdirSync(covers) : [])
      expect(fs.readFileSync(path.join(covers, name)).equals(secret)).toBe(false);
    const document = (await app.api("GET", `/api/documents/${docs[0]!.id}`)).body;
    expect(JSON.stringify(document)).not.toContain("private notes");
  });

  it("can be discarded before anything is added", async () => {
    const dto = await read();
    expect((await app.api("DELETE", `/api/calibre/${dto.id}`)).body.import.state).toBe("discarded");
    expect((await app.api("POST", `/api/calibre/${dto.id}/commit`, { mode: "copy" })).status).toBe(409);
  });
});
