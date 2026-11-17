/**
 * OCR: reading text from scanned PDF pages and from images, with the real engine.
 *
 * The pictures in `fixtures/ocr/` are a few lines of known text (see the script beside
 * them). Every expectation here is what Tesseract really returns for those files, not
 * what one would hope: where it reads a line slightly differently (a blank line between
 * two lines of a JPEG, say), the test says so. Nothing here reaches the network; the
 * engine and its English data are read from `node_modules`.
 *
 * A picture of three lines takes about a tenth of a second, so these run with the rest.
 */
import fs from "node:fs";
import path from "node:path";
import type { DocumentDto, OcrStatus } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OCR_JOB } from "../src/modules/documents/ocr.ts";
import { imageSize } from "../src/modules/ocr/image-size.ts";
import { exifOrientation } from "../src/modules/ocr/tesseract.ts";
import { installedLanguages, parseLanguages } from "../src/modules/ocr/tesseract-assets.ts";
import { buildGreyPng, buildPdf, buildScannedPdf, multipart, type UploadFile } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures/ocr", name));
const firstPng = fixture("scan-first.png");
const secondPng = fixture("scan-second.png");
const firstJpeg = fixture("scan-first.jpg");

const FIRST = ["Boil water for one minute", "Store ten litres per person", "Keep matches in a dry tin"];
const SECOND = ["Signal the bridge at dawn", "Carry rope and a lantern"];

/** The lines of a text, without the blank ones the engine sometimes leaves between them. */
const linesOf = (text: string) => text.split("\n").filter((line) => line.trim());

let app: TestApp;
afterEach(async () => {
  await app?.ctx.jobs.whenIdle();
  await app?.close();
});

const upload = (file: UploadFile) => {
  const { payload, headers } = multipart({}, [file]);
  return app.api("POST", "/api/documents", payload, { headers });
};

const get = async (id: string): Promise<DocumentDto> => (await app.api("GET", `/api/documents/${id}`)).body.document;
const sectionsOf = async (id: string) => (await app.api("GET", `/api/documents/${id}/text`)).body.sections;
const search = async (q: string) => (await app.api("GET", `/api/search?q=${encodeURIComponent(q)}`)).body;

/** Uploads one file, waits for its own text to be read, and returns the document as it then is. */
async function add(file: UploadFile): Promise<DocumentDto> {
  const { status, body } = await upload(file);
  expect(status).toBe(200);
  expect(body.results[0], JSON.stringify(body.results[0])).toMatchObject({ status: "created" });
  await app.ctx.jobs.whenIdle();
  return get(body.results[0].document.id);
}

/** Asks for OCR, waits for it, and returns the document as it then is. */
async function read(id: string, body: Record<string, unknown> = {}): Promise<DocumentDto> {
  const started = await app.api("POST", `/api/documents/${id}/ocr`, body);
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  expect(app.ctx.jobs.get(started.body.jobId)).toMatchObject({ type: OCR_JOB, queue: "ocr", subject: `document:${id}` });
  await app.ctx.jobs.whenIdle();
  return get(id);
}

async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * The two tests of a long scan read 24 pages with the real engine, which is work and not waiting: 3 to 5
 * seconds on an idle machine, and more than the usual 20 when a busy one gives the engine a quarter of a core.
 * Nothing in them races; they need fewer pages than that only if the job writes down what it has read more
 * often than every ten, which is what the restart test is of.
 */
const LONG_SCAN_MS = 90_000;

const ocrJobs = (id: string) => app.ctx.jobs.findBySubject(`document:${id}`).filter((job) => job.type === OCR_JOB);
const progressFile = (id: string) => path.join(app.dir, "data/extracted", `${id}.ocr.json`);

describe("what this installation can read", () => {
  beforeEach(async () => {
    app = await createTestApp();
  });

  it("has Tesseract with English built in, and reads automatically only when asked to", async () => {
    const { status, body } = await app.api<OcrStatus>("GET", "/api/ocr");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      available: true,
      reason: null,
      engine: "Tesseract",
      languages: [{ code: "eng", name: "English", builtIn: true, selected: true }],
      missingLanguages: [],
      languageFolder: "ocr/tessdata",
      auto: false,
      limits: { pagesPerRun: 1000, maxPixels: 40_000_000 },
    });
  });

  it("says plainly when the chosen language is not installed, and uses one a person has added", async () => {
    await app.api("PATCH", "/api/settings", { "ocr.languages": "deu" });
    const missing = (await app.api<OcrStatus>("GET", "/api/ocr")).body;
    expect(missing).toMatchObject({ available: false, missingLanguages: ["deu"] });
    expect(missing.reason).toMatch(/set to read German, but that language data is not installed/);

    const document = await add({ name: "page.png", content: firstPng });
    const refused = await app.api("POST", `/api/documents/${document.id}/ocr`, {});
    expect(refused.status).toBe(415);
    expect(refused.body.error.message).toBe(missing.reason);

    // Language data is only ever read from disk. English data under another name
    // stands in for a language file a person has put in the data directory.
    const english = (await installedLanguages(path.join(app.dir, "data"))).find((language) => language.code === "eng");
    const folder = path.join(app.dir, "data/ocr/tessdata");
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(english?.path ?? "", path.join(folder, "deu.traineddata.gz"));
    fs.writeFileSync(path.join(folder, "notes.txt"), "not a language file");

    const added = (await app.api<OcrStatus>("GET", "/api/ocr")).body;
    expect(added.available).toBe(true);
    expect(added.languages).toEqual([
      { code: "eng", name: "English", builtIn: true, selected: false },
      { code: "deu", name: "German", builtIn: false, selected: true },
    ]);
    const done = await read(document.id);
    expect(linesOf((await sectionsOf(done.id))[0].text)).toEqual(FIRST);
  });

  it("refuses a bad language setting and reads the list in order", async () => {
    expect((await app.api("PATCH", "/api/settings", { "ocr.languages": "English, please" })).status).toBe(400);
    expect((await app.api("PATCH", "/api/settings", { "ocr.languages": "eng+chi_sim" })).status).toBe(200);
    expect(parseLanguages("eng+deu+eng")).toEqual(["eng", "deu"]);
    expect(parseLanguages("../etc+ENG")).toEqual(["eng"]);
  });
});

describe("reading an image", () => {
  beforeEach(async () => {
    app = await createTestApp();
  });

  it("does nothing until asked, then reads the text, shows it as OCR text and makes it searchable", async () => {
    const before = await add({ name: "kitchen notice.png", content: firstPng });
    expect(before).toMatchObject({ type: "image", extraction: "unsupported", textChars: 0, scanPages: 1, ocrPages: null, ocrDetail: null });
    expect((await search("litres")).total).toBe(0);
    expect(ocrJobs(before.id)).toEqual([]);

    const after = await read(before.id);
    expect(after).toMatchObject({
      extraction: "done",
      extractionDetail: null,
      scanPages: 1,
      ocrPages: 1,
      ocrDetail: null,
      pageCount: null,
    });
    expect(await sectionsOf(after.id)).toEqual([{ page: null, heading: null, text: FIRST.join("\n"), ocr: true }]);
    expect(after.textChars).toBe(FIRST.join("\n").length);

    const found = await search("litres");
    expect(found.results).toHaveLength(1);
    expect(found.results[0]).toMatchObject({ kind: "document", entityId: after.id });
    const words = found.results[0].passages[0].segments.map((segment: { text: string }) => segment.text).join("");
    expect(words).toContain("Store ten litres per person");

    // Only Outpost's own store was written: the original's folder holds the original and nothing else.
    const original = path.join(app.ctx.services.storage.getDefault().path, after.relPath);
    expect(fs.readdirSync(path.dirname(original))).toEqual(["kitchen notice.png"]);
    expect(fs.readFileSync(original).equals(firstPng)).toBe(true);
    expect(fs.existsSync(progressFile(after.id))).toBe(false);
  });

  it("is found by meaning as well, where that is set up", async () => {
    // The built-in demonstration vectors: no model, nothing fetched.
    await app.api("PATCH", "/api/settings", { "search.semantic.enabled": true, "search.semantic.provider": "demo" });
    const document = await read((await add({ name: "notice.png", content: firstPng })).id);
    expect((await app.api("POST", "/api/semantic/index")).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    const found = (await app.api("GET", "/api/search?q=matches%20dry%20tin&mode=semantic")).body;
    expect(found.mode).toBe("semantic");
    expect(found.results[0]).toMatchObject({ kind: "document", entityId: document.id });
  });

  it("reads JPEG, GIF and WebP pictures of the same lines", async () => {
    for (const name of ["scan-first.jpg", "scan-first.gif", "scan-first.webp"]) {
      const document = await read((await add({ name, content: fixture(name) })).id);
      expect(document, name).toMatchObject({ extraction: "done", ocrPages: 1 });
      const [section] = await sectionsOf(document.id);
      expect(section.ocr, name).toBe(true);
      // The engine leaves a blank line before the last line of the greyscale pictures.
      expect(linesOf(section.text), name).toEqual(FIRST);
    }
  });

  it("keeps nothing from a picture with no writing in it", async () => {
    const blank = await read((await add({ name: "blank.png", content: buildGreyPng(300, 200, () => 255) })).id);
    expect(blank).toMatchObject({ extraction: "unsupported", textChars: 0, ocrPages: 1, ocrDetail: "OCR found no text in this image." });
    expect(blank.extractionDetail).toContain("An image has no text of its own");

    // Random speckle: the engine sees nothing in it that is laid out like writing.
    let seed = 7;
    const speckle = buildGreyPng(360, 240, () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return 128 + ((seed >> 16) % 120) - 60;
    });
    const noise = await read((await add({ name: "speckle.png", content: speckle })).id);
    expect(noise).toMatchObject({ extraction: "unsupported", textChars: 0, ocrPages: 1, ocrDetail: "OCR found no text in this image." });
    expect(await sectionsOf(noise.id)).toEqual([]);

    // Asking again does not quietly repeat the work; asking to read it again does.
    const again = await app.api("POST", `/api/documents/${noise.id}/ocr`, {});
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("OCR has already been run on every scanned page of this document.");
    expect((await read(noise.id, { redo: true })).ocrPages).toBe(1);
  });

  it("turns away a picture too large to read safely, and files it cannot read at all", async () => {
    // A PNG that claims to be 10,000 by 10,000 pixels. It is refused on its header, before any decoding.
    const header = Buffer.from(buildGreyPng(1, 1, () => 0));
    header.writeUInt32BE(10_000, 16);
    header.writeUInt32BE(10_000, 20);
    const huge = await add({ name: "huge.png", content: header });
    const refused = await read(huge.id);
    expect(refused).toMatchObject({ extraction: "unsupported", ocrPages: null });
    expect(refused.ocrDetail).toBe(
      "This image is 10,000 by 10,000 pixels, which is more than OCR will read (40 million pixels at most). A smaller copy can be read.",
    );
    expect(ocrJobs(huge.id)[0]).toMatchObject({ state: "failed", errorKind: "ocr" });

    const svg = await add({ name: "drawing.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"><text>Hello</text></svg>' });
    expect(svg.scanPages).toBe(0);
    const text = await add({ name: "notes.md", content: "# Notes\n\nAlready text." });
    for (const document of [svg, text]) {
      const answer = await app.api("POST", `/api/documents/${document.id}/ocr`, {});
      expect(answer.status).toBe(415);
      expect(answer.body.error.message).toContain("OCR reads scanned PDFs and PNG, JPEG, GIF and WebP images.");
    }
    expect((await app.api("POST", "/api/documents/nope/ocr", {})).status).toBe(404);
    expect((await app.api("POST", `/api/documents/${huge.id}/ocr`, { everything: true })).status).toBe(400);
  });

  it("reads new documents without being asked once the setting is on", async () => {
    await app.api("PATCH", "/api/settings", { "ocr.auto": true });
    expect((await app.api<OcrStatus>("GET", "/api/ocr")).body.auto).toBe(true);
    const document = await add({ name: "notice.jpg", content: firstJpeg });
    expect(document).toMatchObject({ extraction: "done", ocrPages: 1 });
    expect(linesOf((await sectionsOf(document.id))[0].text)).toEqual(FIRST);
    // A document with text of its own is left alone.
    const typed = await add({ name: "typed.pdf", content: buildPdf([["Typed words about kerosene"]]) });
    expect(typed).toMatchObject({ scanPages: 0, ocrPages: null });
    expect(ocrJobs(typed.id)).toEqual([]);
  });
});

describe("reading a scanned PDF", () => {
  beforeEach(async () => {
    app = await createTestApp();
  });

  it("reads each scanned page, so a search result opens at the page it matched", async () => {
    const scan = await add({ name: "field notes.pdf", content: buildScannedPdf([firstPng, secondPng, firstJpeg, null]) });
    expect(scan).toMatchObject({ extraction: "unsupported", pageCount: 4, textChars: 0, scanPages: 4, ocrPages: null });
    expect(scan.extractionDetail).toMatch(/no text of its own.*scans/);

    const done = await read(scan.id);
    expect(done).toMatchObject({ extraction: "done", extractionDetail: null, pageCount: 4, scanPages: 4, ocrPages: 4 });
    // The fourth page has nothing on it at all.
    expect(done.ocrDetail).toBe("1 page had no picture that OCR could read.");

    const sections = await sectionsOf(done.id);
    expect(sections.map((section: { page: number; ocr: boolean }) => [section.page, section.ocr])).toEqual([
      [1, true],
      [2, true],
      [3, true],
    ]);
    expect(sections[0].text).toBe(FIRST.join("\n"));
    expect(sections[1].text).toBe(SECOND.join("\n"));
    expect(linesOf(sections[2].text)).toEqual(FIRST);
    expect((await app.api("GET", `/api/documents/${done.id}/text?page=2`)).body.sections).toEqual([
      { page: 2, heading: null, text: SECOND.join("\n"), ocr: true },
    ]);

    const found = await search("lantern");
    expect(found.results).toHaveLength(1);
    expect(found.results[0].url).toBe(`/library/documents/${done.id}?page=2`);
    expect(found.results[0].passages[0].page).toBe(2);
    expect(ocrJobs(done.id)[0]).toMatchObject({
      state: "succeeded",
      result: { pagesRead: 4, pagesWithText: 3, pagesFromEarlier: 0, pagesLeft: 0 },
    });
  });

  it("reads pages that were scanned upside down or on their side", async () => {
    const scan = await add({
      name: "any way up.pdf",
      content: buildScannedPdf([
        { picture: firstPng, turned: "upside down" },
        { picture: secondPng, turned: "anticlockwise" },
        { picture: firstPng, turned: "clockwise" },
      ]),
    });
    const done = await read(scan.id);
    expect(done).toMatchObject({ extraction: "done", ocrPages: 3, ocrDetail: null });
    const sections = await sectionsOf(done.id);
    expect(sections.map((section: { text: string }) => linesOf(section.text))).toEqual([FIRST, SECOND, FIRST]);
  });

  it("reads only the pages that have no text of their own, and keeps what it read when the file is read again", async () => {
    const mixed = await add({ name: "mixed.pdf", content: buildScannedPdf([["Typed words about kerosene"], secondPng]) });
    expect(mixed).toMatchObject({ extraction: "done", pageCount: 2, scanPages: 1, ocrPages: null });

    const done = await read(mixed.id);
    expect(done).toMatchObject({ extraction: "done", scanPages: 1, ocrPages: 1, ocrDetail: null });
    const expected = [
      { page: 1, heading: null, text: "Typed words about kerosene", ocr: false },
      { page: 2, heading: null, text: SECOND.join("\n"), ocr: true },
    ];
    expect(await sectionsOf(done.id)).toEqual(expected);
    expect(ocrJobs(done.id)[0]?.result).toMatchObject({ pagesRead: 1, pagesWithText: 1 });

    // "Read text again" reads the file, not the pictures; the OCR text is carried over.
    expect((await app.api("POST", `/api/documents/${done.id}/reextract`)).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    expect(await get(done.id)).toMatchObject({ extraction: "done", scanPages: 1, ocrPages: 1, textChars: done.textChars });
    expect(await sectionsOf(done.id)).toEqual(expected);
    expect((await search("lantern")).results[0].passages[0].page).toBe(2);
    expect(ocrJobs(done.id)).toHaveLength(1);
  });

  it("keeps the pages read so far when it is cancelled, and carries on from them", { timeout: LONG_SCAN_MS }, async () => {
    const pages = Array.from({ length: 24 }, (_, index) => (index % 2 === 0 ? firstPng : secondPng));
    const scan = await add({ name: "long scan.pdf", content: buildScannedPdf(pages) });
    const started = await app.api("POST", `/api/documents/${scan.id}/ocr`, {});
    const jobId: string = started.body.jobId;
    // Asking twice does not start a second reading.
    expect((await app.api("POST", `/api/documents/${scan.id}/ocr`, {})).body.jobId).toBe(jobId);

    await until(() => (app.ctx.jobs.get(jobId)?.progressCurrent ?? 0) >= 3, "three pages to be read");
    expect(app.ctx.jobs.get(jobId)).toMatchObject({ state: "running", progressTotal: 24 });
    expect((await app.api("POST", `/api/jobs/${jobId}/cancel`)).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    await until(() => (app.ctx.jobs.get(jobId)?.state ?? "") === "cancelled", "the job to stop");
    await until(() => !fs.existsSync(progressFile(scan.id)), "the finished pages to be stored");

    const stopped = await get(scan.id);
    const readSoFar = stopped.ocrPages ?? 0;
    expect(readSoFar).toBeGreaterThanOrEqual(3);
    expect(readSoFar).toBeLessThan(24);
    expect(stopped).toMatchObject({ extraction: "done", scanPages: 24 });
    expect(stopped.ocrDetail).toBe(`Stopped after ${readSoFar} of 24 pages. What was read so far is searchable.`);
    expect(await sectionsOf(scan.id)).toHaveLength(readSoFar);
    expect((await search("litres")).results[0].entityId).toBe(scan.id);

    const finished = await read(scan.id);
    expect(finished).toMatchObject({ ocrPages: 24, ocrDetail: null });
    const sections = await sectionsOf(scan.id);
    expect(sections.map((section: { page: number }) => section.page)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
    // The second run read only what the first had not.
    expect(ocrJobs(scan.id).at(-1)?.result).toMatchObject({ pagesRead: 24 - readSoFar });
  });

  it("stops reading a document that is deleted, and leaves nothing of it behind", async () => {
    const pages = Array.from({ length: 24 }, () => firstPng);
    const scan = await add({ name: "going.pdf", content: buildScannedPdf(pages) });
    const { jobId } = (await app.api("POST", `/api/documents/${scan.id}/ocr`, {})).body;
    await until(() => (app.ctx.jobs.get(jobId)?.progressCurrent ?? 0) >= 2, "two pages to be read");
    expect((await app.api("DELETE", `/api/documents/${scan.id}`)).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    await until(() => (app.ctx.jobs.get(jobId)?.state ?? "") === "cancelled", "the job to stop");
    await until(() => !fs.existsSync(progressFile(scan.id)), "its unfinished pages to be removed");
    expect(fs.existsSync(path.join(app.dir, "data/extracted", `${scan.id}.json`))).toBe(false);
    expect((await search("litres")).total).toBe(0);
  });
});

describe("a restart in the middle of a long document", () => {
  it("carries on from the pages already read", { timeout: LONG_SCAN_MS }, async () => {
    const dir = tempDir("outpost-test-ocr-");
    try {
      app = await createTestApp({}, dir);
      const pages = Array.from({ length: 24 }, (_, index) => (index % 2 === 0 ? firstPng : secondPng));
      const scan = await add({ name: "long scan.pdf", content: buildScannedPdf(pages) });
      const { jobId } = (await app.api("POST", `/api/documents/${scan.id}/ocr`, {})).body;
      // Pages are written down every ten; wait until some have been.
      await until(() => fs.existsSync(progressFile(scan.id)), "the first pages to be written down");
      await app.close();

      const kept = JSON.parse(fs.readFileSync(progressFile(scan.id), "utf8")).pages.length;
      expect(kept).toBeGreaterThanOrEqual(10);

      app = await createTestApp({}, dir);
      await app.ctx.jobs.whenIdle();
      await until(() => app.ctx.jobs.get(jobId)?.state === "succeeded", "the job to finish after the restart");
      expect(await get(scan.id)).toMatchObject({ extraction: "done", ocrPages: 24, ocrDetail: null });
      expect(await sectionsOf(scan.id)).toHaveLength(24);
      // The pages written down before the restart were not read a second time.
      expect(app.ctx.jobs.get(jobId)?.result).toMatchObject({ pagesRead: 24, pagesWithText: 24, pagesFromEarlier: kept });
      expect(fs.existsSync(progressFile(scan.id))).toBe(false);
    } finally {
      await app?.ctx.jobs.whenIdle();
      await app?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("reading image files without decoding them", () => {
  it("finds the size of each kind of picture from its first bytes", () => {
    for (const name of ["scan-first.png", "scan-first.jpg", "scan-first.gif", "scan-first.webp"]) {
      expect(imageSize(fixture(name)), name).toEqual({ width: 900, height: 300 });
    }
    expect(imageSize(buildGreyPng(31, 7, () => 0))).toEqual({ width: 31, height: 7 });
    expect(imageSize(Buffer.from("not a picture"))).toBeUndefined();
    expect(imageSize(firstJpeg.subarray(0, 12))).toBeUndefined();
  });

  it("reads which way up a camera says a JPEG is", () => {
    expect(exifOrientation(firstJpeg)).toBe(1);
    // SOI, then an Exif segment whose only entry says "turned a quarter turn" (6).
    const exif = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22]),
      Buffer.from("Exif\0\0", "latin1"),
      Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]),
      Buffer.from([0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      Buffer.from([0xff, 0xda]),
    ]);
    expect(exifOrientation(exif)).toBe(6);
    expect(exifOrientation(firstPng)).toBe(1);
  });
});
