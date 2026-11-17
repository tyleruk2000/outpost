import fs from "node:fs";
import path from "node:path";
import type { AudiobookDto, JobDto } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { bookFacts, matchLibrivox, orderChapters } from "../src/modules/audiobooks/assemble.ts";
import type { ShelfBook } from "../src/modules/audiobooks/shelf.ts";
import { readAudioFacts } from "../src/modules/documents/audio-tags.ts";
import { flac, m4b, mp3, oggVorbis, wav } from "./fixtures/audio/builders.ts";
import { buildZip, multipart, type UploadFile } from "./fixtures/documents/builders.ts";
import { rawZip } from "./fixtures/imports/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

// ── Reading tags ──

describe("reading what an audio file says about itself", () => {
  const dir = tempDir("outpost-audio-tags-");
  const write = (name: string, bytes: Buffer) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, bytes);
    return file;
  };

  it("reads ID3v2.3 text in Latin-1, UTF-16 and UTF-8, a narrator, and the time from the bitrate", async () => {
    const file = write(
      "a.mp3",
      mp3(250, { title: "Laying Plans — chapter 1", artist: "Sun Tzu", album: "The Art of War", reader: "Moira Fogarty", track: 1 }),
    );
    expect(await readAudioFacts(file, "mp3")).toEqual({
      title: "Laying Plans — chapter 1",
      artist: "Sun Tzu",
      album: "The Art of War",
      reader: "Moira Fogarty",
      track: 1,
      // 250 frames of 1152 samples at 32 kHz.
      seconds: 9,
    });
  });

  it("takes the frame count from an Info header, and an ID3v1 tag when there is no ID3v2", async () => {
    const file = write("b.mp3", mp3(500, {}, { xing: true, id3v1: { title: "Waging War", artist: "Sun Tzu", track: 2 } }));
    expect(await readAudioFacts(file, "mp3")).toEqual({ title: "Waging War", artist: "Sun Tzu", track: 2, seconds: 18 });
  });

  it("reads WAV, Ogg Vorbis, FLAC and M4B", async () => {
    expect(await readAudioFacts(write("c.wav", wav(1.5, { title: "Prologue", artist: "Anon", album: "Tales", track: 3 })), "wav")).toEqual({
      title: "Prologue",
      artist: "Anon",
      album: "Tales",
      track: 3,
      seconds: 1.5,
    });
    expect(
      await readAudioFacts(write("d.ogg", oggVorbis(61, { title: "Ogg chapter", artist: "Writer", reader: "Reader" })), "ogg"),
    ).toEqual({
      title: "Ogg chapter",
      artist: "Writer",
      reader: "Reader",
      seconds: 61,
    });
    expect(await readAudioFacts(write("e.flac", flac(12.5, { title: "Flac chapter", track: 7 })), "flac")).toEqual({
      title: "Flac chapter",
      track: 7,
      seconds: 12.5,
    });
    expect(
      await readAudioFacts(
        write("f.m4b", m4b(3723.5, { title: "Whole book", artist: "Author", album: "Book", reader: "Narrator", track: 1 })),
        "m4b",
      ),
    ).toEqual({ title: "Whole book", artist: "Author", album: "Book", reader: "Narrator", track: 1, seconds: 3723.5 });
  });

  it("says nothing, rather than guessing, about a file it cannot read", async () => {
    expect(await readAudioFacts(write("g.mp3", Buffer.from("ID3 but not really a tag")), "mp3")).toEqual({});
    expect(await readAudioFacts(write("h.ogg", Buffer.from("OggS")), "ogg")).toEqual({});
  });
});

// ── Order and naming ──

const facts = (name: string, track?: number, extra = {}) => ({ name, facts: { track, ...extra } });

describe("putting a book together", () => {
  it("orders by track number when every file has a different one, and by name otherwise", () => {
    expect(orderChapters([facts("b.mp3", 2), facts("a.mp3", 3), facts("c.mp3", 1)]).map((file) => file.name)).toEqual([
      "c.mp3",
      "b.mp3",
      "a.mp3",
    ]);
    // One file without a number, or two with the same: the names decide, in natural order.
    expect(orderChapters([facts("chapter 10.mp3", 1), facts("chapter 2.mp3"), facts("chapter 1.mp3", 3)]).map((file) => file.name)).toEqual(
      ["chapter 1.mp3", "chapter 2.mp3", "chapter 10.mp3"],
    );
    expect(orderChapters([facts("b.mp3", 1), facts("a.mp3", 1)]).map((file) => file.name)).toEqual(["a.mp3", "b.mp3"]);
  });

  it("takes the title and author the files agree on, and leaves out what they do not", () => {
    const agreeing = [
      facts("01.mp3", 1, { album: "Walden", artist: "Thoreau" }),
      facts("02.mp3", 2, { album: "Walden", artist: "Thoreau" }),
    ];
    expect(bookFacts(agreeing, {})).toMatchObject({ title: "Walden", author: "Thoreau", readers: [] });
    const disagreeing = [facts("01.mp3", 1, { album: "A", artist: "X" }), facts("02.mp3", 2, { album: "B", artist: "Y" })];
    expect(bookFacts(disagreeing, { archiveName: "walden_librivox.zip" })).toMatchObject({
      title: "walden_librivox",
      author: null,
      from: { title: "file name", author: null },
    });
    expect(bookFacts(disagreeing, { typedTitle: "My title" }).title).toBe("My title");
  });

  const book: ShelfBook = {
    id: "119",
    shelf: "adults",
    title: "Art of War",
    authors: ["Sun Tzu"],
    readers: ["Moira Fogarty"],
    language: "English",
    totalSeconds: 4334,
    sections: 2,
    textYear: "1910",
    summary: "Strategy.",
    pageUrl: "https://librivox.org/the-art-of-war-by-sun-tzu/",
    zipUrl: "https://archive.org/compress/art_of_war_librivox/formats=64KBPS MP3&file=/art_of_war_librivox.zip",
    zipName: "art_of_war_librivox.zip",
  };

  it("recognises a LibriVox zip by its name, or by the id given, only when the chapters add up", () => {
    expect(matchLibrivox([book], { archiveName: "art_of_war_librivox.zip", fileCount: 2 })?.id).toBe("119");
    expect(matchLibrivox([book], { archiveName: "art_of_war_librivox (1).zip", fileCount: 2 })?.id).toBe("119");
    expect(matchLibrivox([book], { archiveName: "art_of_war_librivox.zip", fileCount: 3 })).toBeUndefined();
    expect(matchLibrivox([book], { archiveName: "something_else.zip", fileCount: 2 })).toBeUndefined();
    expect(matchLibrivox([book], { librivoxId: "119", archiveName: "renamed.zip", fileCount: 2 })?.id).toBe("119");
    expect(bookFacts([facts("a.mp3"), facts("b.mp3")], { librivox: book })).toMatchObject({
      title: "Art of War",
      author: "Sun Tzu",
      readers: ["Moira Fogarty"],
    });
  });
});

// ── The library ──

let app: TestApp;
afterEach(async () => {
  await app?.ctx.jobs.whenIdle();
  await app?.close();
});

const locationPath = () => app.ctx.services.storage.getDefault().path;

async function addAudiobook(files: UploadFile[], fields: Record<string, string> = {}): Promise<JobDto> {
  const { payload, headers } = multipart(fields, files);
  const { status, body } = await app.api("POST", "/api/audiobooks", payload, { headers });
  expect(status, JSON.stringify(body)).toBe(202);
  await app.ctx.jobs.whenIdle();
  return (await app.api("GET", `/api/jobs/${body.job.id}`)).body.job;
}

const getBook = async (id: string): Promise<AudiobookDto> => (await app.api("GET", `/api/audiobooks/${id}`)).body.audiobook;

/** Every file and folder under `dir`, relative to it. */
const everythingUnder = (dir: string) =>
  fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).map(String).sort() : [];

describe("a single recording added as a document", () => {
  it("is an audio document, named from its tags, served in ranges, and found by its author", async () => {
    app = await createTestApp();
    const bytes = mp3(100, { title: "The Gift of the Magi", artist: "O. Henry" });
    const { payload, headers } = multipart({}, [{ name: "magi.mp3", content: bytes }]);
    const uploaded = (await app.api("POST", "/api/documents", payload, { headers })).body.results[0];
    expect(uploaded).toMatchObject({ status: "created", document: { type: "audio", mime: "audio/mpeg" } });
    await app.ctx.jobs.whenIdle();
    const id = uploaded.document.id;
    const document = (await app.api("GET", `/api/documents/${id}`)).body.document;
    expect(document).toMatchObject({ title: "The Gift of the Magi", author: "O. Henry", extraction: "unsupported" });
    expect(document.extractionDetail).toMatch(/not transcribed/);

    // A player asks for part of the file at a time.
    const part = await app.app.inject({ method: "GET", url: `/api/documents/${id}/file`, headers: { range: "bytes=100-199" } });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-type"]).toBe("audio/mpeg");
    expect(part.headers["content-range"]).toBe(`bytes 100-199/${bytes.length}`);
    expect(part.headers["content-disposition"]).toMatch(/^inline/);
    expect(part.rawPayload.equals(bytes.subarray(100, 200))).toBe(true);
    const tail = await app.app.inject({
      method: "GET",
      url: `/api/documents/${id}/file`,
      headers: { range: `bytes=${bytes.length - 10}-` },
    });
    expect(tail.statusCode).toBe(206);
    expect(tail.rawPayload.length).toBe(10);
    const beyond = await app.app.inject({
      method: "GET",
      url: `/api/documents/${id}/file`,
      headers: { range: `bytes=${bytes.length + 5}-` },
    });
    expect(beyond.statusCode).toBe(416);

    const single = await getBook(id);
    expect(single).toMatchObject({ kind: "single", title: "The Gift of the Magi", author: "O. Henry", totalSeconds: 4 });
    expect(single.chapters).toHaveLength(1);
    expect(single.chapters[0]!.seconds).toBeCloseTo(3.6, 5);

    const found = (await app.api("GET", "/api/search?q=Henry")).body.results;
    expect(found.map((result: { entityId: string }) => result.entityId)).toContain(id);
    const facets = (await app.api("GET", "/api/documents/facets")).body;
    expect(facets.types).toContainEqual({ type: "audio", count: 1 });
  });

  it("refuses a file named like audio that is not", async () => {
    app = await createTestApp();
    const { payload, headers } = multipart({}, [{ name: "song.mp3", content: "<html>not audio</html>" }]);
    const result = (await app.api("POST", "/api/documents", payload, { headers })).body.results[0];
    expect(result).toMatchObject({ status: "rejected" });
    expect(result.reason).toMatch(/named like an MP3 recording, but its contents are not one/);
  });
});

describe("an audiobook added from a zip", () => {
  it("unpacks the chapters in order into one book, and finds it by title and author", async () => {
    app = await createTestApp();
    // Track numbers run against the names, so the tags must decide the order.
    const zip = await buildZip([
      {
        name: "book/01_second.wav",
        content: wav(1, { title: "The second chapter", artist: "Ann Author", album: "A Small Book", track: 2 }),
      },
      { name: "book/02_first.wav", content: wav(2, { title: "The first chapter", artist: "Ann Author", album: "A Small Book", track: 1 }) },
      { name: "book/03_third.wav", content: wav(0.5, { artist: "Ann Author", album: "A Small Book", track: 3 }) },
      { name: "book/cover.jpg", content: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) },
      { name: "__MACOSX/book/._01_second.wav", content: "resource fork" },
    ]);
    const job = await addAudiobook([{ name: "small_book.zip", content: zip }]);
    expect(job.state, JSON.stringify(job)).toBe("succeeded");
    const result = job.result as { collectionId: string; chapters: number; leftOut: Array<{ path: string; reason: string }> };
    expect(result.chapters).toBe(3);
    expect(result.leftOut).toEqual([{ path: "book/cover.jpg", reason: "It is not an audio file." }]);

    const book = await getBook(result.collectionId);
    expect(book).toMatchObject({
      kind: "book",
      title: "A Small Book",
      author: "Ann Author",
      readers: [],
      licence: null,
      librivoxId: null,
      totalSeconds: 4,
      locationAvailable: true,
    });
    expect(book.chapters.map((chapter) => [chapter.title, chapter.seconds, chapter.mime])).toEqual([
      ["The first chapter", 2, "audio/wav"],
      ["The second chapter", 1, "audio/wav"],
      ["03_third", 0.5, "audio/wav"],
    ]);

    // The files are together in the book's folder, and nothing is left in staging.
    const folder = path.join(locationPath(), "collections", "audiobooks", "A Small Book");
    expect(fs.readdirSync(folder).sort()).toEqual(["001 02_first.wav", "002 01_second.wav", "003 03_third.wav"]);
    expect(everythingUnder(path.join(locationPath(), "documents", ".incoming"))).toEqual([]);

    // A chapter opens its book; the list holds the book once; the documents list does not hold the chapters.
    expect((await getBook(book.chapters[1]!.documentId)).id).toBe(book.id);
    const list = (await app.api("GET", "/api/audiobooks")).body.audiobooks;
    expect(list).toEqual([
      expect.objectContaining({ id: book.id, kind: "book", chapterCount: 3, totalSeconds: 4, url: `/library/collections/${book.id}` }),
    ]);
    expect((await app.api("GET", "/api/audiobooks?q=ann%20author")).body.audiobooks).toHaveLength(1);
    expect((await app.api("GET", "/api/audiobooks?q=nothing")).body.audiobooks).toHaveLength(0);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(0);
    expect((await app.api("GET", "/api/documents/facets")).body.types).toContainEqual({ type: "audio", count: 1 });

    for (const q of ["Small Book", "Author"]) {
      const results = (await app.api("GET", `/api/search?q=${encodeURIComponent(q)}`)).body.results;
      expect(
        results.map((entry: { entityId: string }) => entry.entityId),
        q,
      ).toContain(book.id);
    }

    // Removing the book removes its files.
    expect((await app.api("DELETE", `/api/collections/${book.id}?deleteFiles=true`)).status).toBeLessThan(300);
    await app.ctx.jobs.whenIdle();
    expect(fs.existsSync(folder)).toBe(false);
    expect((await app.api("GET", "/api/audiobooks")).body.audiobooks).toEqual([]);
  });

  it("takes LibriVox's record of a book on its shelf, and Explore then shows it as held", async () => {
    app = await createTestApp();
    fs.mkdirSync(path.join(app.dir, "catalog"), { recursive: true });
    fs.copyFileSync(
      path.resolve(import.meta.dirname, "../../../catalog/audiobooks.json"),
      path.join(app.dir, "catalog", "audiobooks.json"),
    );
    const shelf = (await app.api("GET", "/api/audiobooks/librivox")).body;
    const artOfWar = shelf.books.find((entry: { id: string }) => entry.id === "119");
    expect(artOfWar).toMatchObject({ title: "Art of War", sections: 7, approxBytes: 4334 * 8000, inLibrary: null });
    expect(shelf.licence).toBe("Public domain in the United States");

    const zip = await buildZip(
      Array.from({ length: 7 }, (_, index) => ({ name: `artofwar_${String(index + 1).padStart(2, "0")}_sun_64kb.mp3`, content: mp3(20) })),
    );
    const job = await addAudiobook([{ name: "art_of_war_librivox (1).zip", content: zip }]);
    expect(job.state, JSON.stringify(job)).toBe("succeeded");
    const book = await getBook((job.result as { collectionId: string }).collectionId);
    expect(book).toMatchObject({
      title: "Art of War",
      author: "Sun Tzu 孙武",
      readers: ["Moira Fogarty"],
      librivoxId: "119",
      licence: "Public domain in the United States",
      sourceUrl: "https://librivox.org/the-art-of-war-by-sun-tzu/",
    });
    expect(book.licenceNote).toMatch(/not necessarily in other countries/);
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(
      Array.from({ length: 7 }, (_, index) => `artofwar_${String(index + 1).padStart(2, "0")}_sun_64kb`),
    );
    const again = (await app.api("GET", "/api/audiobooks/librivox")).body.books.find((entry: { id: string }) => entry.id === "119");
    expect(again.inLibrary).toEqual({ id: book.id, url: `/library/collections/${book.id}` });
  });

  it("makes a book of several audio files sent together", async () => {
    app = await createTestApp();
    const job = await addAudiobook(
      [
        { name: "Chapter 10.ogg", content: oggVorbis(3, { artist: "Writer" }) },
        { name: "Chapter 2.ogg", content: oggVorbis(2, { artist: "Writer" }) },
      ],
      { title: "Typed title" },
    );
    expect(job.state, JSON.stringify(job)).toBe("succeeded");
    const book = await getBook((job.result as { collectionId: string }).collectionId);
    expect(book).toMatchObject({ title: "Typed title", author: "Writer", totalSeconds: 5 });
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(["Chapter 2", "Chapter 10"]);
  });
});

describe("what is refused", () => {
  it("refuses a zip whose names climb out of the folder, and writes nothing outside it", async () => {
    app = await createTestApp();
    const zip = rawZip([
      { name: "ok.wav", content: wav(0.1) },
      { name: "../../escaped.wav", content: wav(0.1) },
    ]);
    const job = await addAudiobook([{ name: "evil.zip", content: zip }]);
    expect(job.state).toBe("failed");
    expect(job.error).toMatch(/contains a file whose name points outside the archive/);
    expect(everythingUnder(app.dir).filter((entry) => entry.endsWith("escaped.wav"))).toEqual([]);
    expect(everythingUnder(path.join(locationPath(), "documents", ".incoming"))).toEqual([]);
    expect(fs.existsSync(path.join(locationPath(), "collections", "audiobooks"))).toBe(false);
    expect((await app.api("GET", "/api/audiobooks")).body.audiobooks).toEqual([]);
  });

  it("leaves out links, and refuses a zip with no audio in it", async () => {
    app = await createTestApp();
    const linked = rawZip([
      { name: "a.wav", content: wav(0.1) },
      { name: "link.wav", content: "/etc/passwd", mode: 0o120777 },
    ]);
    const job = await addAudiobook([{ name: "linked.zip", content: linked }]);
    expect(job.state).toBe("succeeded");
    expect((job.result as { leftOut: unknown[] }).leftOut).toEqual([
      { path: "link.wav", reason: "Symbolic links and special files are never unpacked." },
    ]);

    const empty = await addAudiobook([{ name: "notes.zip", content: await buildZip([{ name: "readme.txt", content: "Hello" }]) }]);
    expect(empty.state).toBe("failed");
    expect(empty.error).toMatch(/"notes\.zip" held no audio files the library can keep/);
    expect(everythingUnder(path.join(locationPath(), "documents", ".incoming"))).toEqual([]);
  });

  it("refuses a request that is not one zip or audio files, and keeps nothing of it", async () => {
    app = await createTestApp();
    const send = async (files: UploadFile[]) => {
      const { payload, headers } = multipart({}, files);
      return app.api("POST", "/api/audiobooks", payload, { headers });
    };
    const zip = await buildZip([{ name: "a.wav", content: wav(0.1) }]);
    expect((await send([{ name: "setup.exe", content: "MZ" }])).body.error.message).toMatch(/is not a zip or an audio file/);
    expect(
      (
        await send([
          { name: "a.zip", content: zip },
          { name: "b.zip", content: zip },
        ])
      ).body.error.message,
    ).toMatch(/one zip at a time/);
    expect(
      (
        await send([
          { name: "a.zip", content: zip },
          { name: "b.wav", content: wav(0.1) },
        ])
      ).body.error.message,
    ).toMatch(/not both/);
    expect((await send([{ name: "fake.zip", content: "not a zip at all, whatever its name" }])).body.error.message).toMatch(
      /named like a zip, but its contents are not one/,
    );
    expect(everythingUnder(path.join(locationPath(), "documents", ".incoming"))).toEqual([]);
    expect((await app.api("GET", "/api/audiobooks/nothing-here")).status).toBe(404);
  });
});
