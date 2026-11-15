import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { DocumentDto, UploadResult } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXTRACT_JOB } from "../src/modules/documents/service.ts";
import { buildEpub, buildPdf, buildZip, multipart, tinyPng, type UploadFile } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp;
afterEach(async () => {
  // Let text extraction finish first: closing with a job in flight waits out a timeout.
  await app?.ctx.jobs.whenIdle();
  await app?.close();
});

const upload = (files: UploadFile[], fields: Record<string, string> = {}, query = "") => {
  const { payload, headers } = multipart(fields, files);
  return app.api("POST", `/api/documents${query}`, payload, { headers });
};

/** Uploads one file, waits for its text to be read, and returns the document as it then is. */
async function add(file: UploadFile, fields: Record<string, string> = {}) {
  const { status, body } = await upload([file], fields);
  expect(status).toBe(200);
  expect(body.results[0], JSON.stringify(body.results[0])).toMatchObject({ status: "created" });
  await app.ctx.jobs.whenIdle();
  return (await app.api("GET", `/api/documents/${body.results[0].document.id}`)).body.document;
}

const search = async (q: string) => (await app.api("GET", `/api/search?q=${encodeURIComponent(q)}`)).body;
const locationPath = () => app.ctx.services.storage.getDefault().path;
const incoming = () =>
  fs.readdirSync(path.join(locationPath(), "documents", ".incoming"), { recursive: true }).filter((name) => String(name).endsWith(".part"));
const fileOf = (document: { relPath: string }) => path.join(locationPath(), document.relPath);

const MARKDOWN = "Kept in the shed.\n\n# Water\n\nBoil **it** for one minute.\n\n## Filters\n\nCeramic filters remove protozoa.\n";
const HTML =
  "<html><head><title>Knots for climbing</title><style>p{color:red}</style></head><body><p>Lead text</p><div><h2>Clove hitch</h2><p>Quick to tie at a belay.</p><script>stolenword()</script></div></body></html>";

describe("uploading and reading text", () => {
  beforeEach(async () => {
    app = await createTestApp();
  });

  it("stores Markdown, text and HTML and makes them searchable by section", async () => {
    const { status, body } = await upload(
      [
        { name: "water.md", content: MARKDOWN, type: "application/x-msdownload" },
        { name: "notes.txt", content: "Remember the spare stove jet." },
        { name: "knots.html", content: HTML },
      ],
      { category: "Survival", tags: "water, First Aid ,water" },
    );
    expect(status).toBe(200);
    expect(body.results.map((result: { status: string }) => result.status)).toEqual(["created", "created", "created"]);
    const [markdown, text, html] = body.results.map((result: UploadResult) => result.document as DocumentDto);
    expect(markdown).toMatchObject({
      title: "water",
      originalName: "water.md",
      type: "markdown",
      // From the validated type, not from the Content-Type the client sent.
      mime: "text/markdown",
      category: "Survival",
      tags: ["First Aid", "water"],
      extraction: "pending",
      locationAvailable: true,
      fileUrl: `/api/documents/${markdown.id}/file`,
    });
    expect(markdown.relPath).toBe(`documents/${markdown.id}/water.md`);
    expect(fs.readFileSync(fileOf(markdown), "utf8")).toBe(MARKDOWN);
    expect(incoming()).toEqual([]);

    await app.ctx.jobs.whenIdle();
    const read = (await app.api("GET", `/api/documents/${markdown.id}`)).body.document;
    expect(read).toMatchObject({ extraction: "done", extractionDetail: null, pageCount: null });
    expect(read.textChars).toBeGreaterThan(40);

    const sections = (await app.api("GET", `/api/documents/${markdown.id}/text`)).body.sections;
    expect(sections).toEqual([
      { page: null, heading: null, text: "Kept in the shed." },
      { page: null, heading: "Water", text: "Boil it for one minute." },
      { page: null, heading: "Filters", text: "Ceramic filters remove protozoa." },
    ]);

    const protozoa = await search("protozoa ");
    expect(protozoa.results).toHaveLength(1);
    expect(protozoa.results[0]).toMatchObject({
      kind: "document",
      entityId: markdown.id,
      url: `/library/documents/${markdown.id}`,
      collection: "Survival",
      subtitle: "water.md",
    });
    expect(protozoa.results[0].passages[0]).toMatchObject({ heading: "Filters", page: null });

    expect((await search("stove ")).results[0].entityId).toBe(text.id);

    const belay = await search("belay ");
    expect(belay.results[0].entityId).toBe(html.id);
    expect(belay.results[0].passages[0].heading).toBe("Clove hitch");
    // <title> fills a title nobody set; scripts and styles are not text.
    expect(belay.results[0].title).toBe("Knots for climbing");
    expect((await search("stolenword ")).total).toBe(0);
    expect((await search("color ")).total).toBe(0);
    // Tags are searchable too.
    expect((await search("aid ")).total).toBe(3);
  });

  it("reads a PDF page by page and links results to the page", async () => {
    const pdf = buildPdf(
      [
        ["Field manual", "Boiling is the most reliable method."],
        ["Chemical treatment with chlorine dioxide tablets", "takes thirty minutes."],
        ["Index"],
      ],
      { title: "Water Purification Handbook", author: "A. Ranger" },
    );
    const document = await add({ name: "scan_0042.pdf", content: pdf });
    expect(document).toMatchObject({
      type: "pdf",
      mime: "application/pdf",
      extraction: "done",
      pageCount: 3,
      // Metadata inside the file fills the fields nobody filled in.
      title: "Water Purification Handbook",
      author: "A. Ranger",
    });

    const all = (await app.api("GET", `/api/documents/${document.id}/text`)).body;
    expect(all.sections.map((section: { page: number }) => section.page)).toEqual([1, 2, 3]);
    const second = (await app.api("GET", `/api/documents/${document.id}/text?page=2`)).body;
    expect(second.sections).toEqual([
      { page: 2, heading: null, text: "Chemical treatment with chlorine dioxide tablets\ntakes thirty minutes." },
    ]);

    const found = await search('"chlorine dioxide"');
    expect(found.results).toHaveLength(1);
    expect(found.results[0].url).toBe(`/library/documents/${document.id}?page=2`);
    expect(found.results[0].passages[0].page).toBe(2);
    expect(found.results[0].subtitle).toBe("A. Ranger");
  });

  it("keeps a title a person chose, and says when a PDF was cut short or is a scan", async () => {
    app.ctx.services.settings.update({ "indexing.maxPdfPages": 1 });
    const long = await add({ name: "long.pdf", content: buildPdf([["first page words"], ["second page words"]], { title: "Untitled" }) });
    expect(long).toMatchObject({ extraction: "done", pageCount: 2, title: "long" });
    expect(long.extractionDetail).toContain("Only the first 1 of 2 pages");
    expect((await search("second ")).total).toBe(0);

    const scan = await add({ name: "scan.pdf", content: buildPdf([[], []]) });
    expect(scan).toMatchObject({ extraction: "unsupported", pageCount: 2, textChars: 0 });
    expect(scan.extractionDetail).toMatch(/scanned.*OCR is not available/);
    // Still findable by its title.
    expect((await search("scan ")).results[0].entityId).toBe(scan.id);
  });

  it("marks a damaged PDF as failed with a reason, without losing the file", async () => {
    const broken = await add({ name: "broken.pdf", content: "%PDF-1.4\nthis is not really a pdf at all" });
    expect(broken.extraction).toBe("failed");
    expect(broken.extractionDetail).toContain("could not be read as a PDF");
    expect(fs.existsSync(fileOf(broken))).toBe(true);
    const job = app.ctx.jobs.findBySubject(`document:${broken.id}`)[0]!;
    expect(job).toMatchObject({ type: EXTRACT_JOB, queue: "index", state: "failed" });
  });

  it("reads an EPUB chapter by chapter in spine order", async () => {
    const epub = await buildEpub({
      title: "The Long Walk",
      author: "Jane Hiker",
      chapters: [
        {
          file: "one.xhtml",
          title: "Chapter file one",
          body: "<h1>Setting out</h1><p>We left before dawn with <a id='n1'/>heavy packs.</p>",
        },
        { file: "two.xhtml", title: "The ridge", body: "<p>The ridge was windy and exposed.</p>" },
      ],
    });
    const document = await add({ name: "long-walk.epub", content: epub });
    expect(document).toMatchObject({
      type: "epub",
      mime: "application/epub+zip",
      extraction: "done",
      title: "The Long Walk",
      author: "Jane Hiker",
      language: "en",
    });

    const { sections } = (await app.api("GET", `/api/documents/${document.id}/text`)).body;
    expect(sections).toEqual([
      { page: null, heading: "Setting out", text: "Setting out\n\nWe left before dawn with heavy packs." },
      { page: null, heading: "The ridge", text: "The ridge was windy and exposed." },
    ]);
    const found = await search("exposed ");
    expect(found.results[0]).toMatchObject({ entityId: document.id, subtitle: "Jane Hiker" });
    expect(found.results[0].passages[0].heading).toBe("The ridge");
    // The navigation document is a table of contents, not content.
    expect((await search("tableofcontentsword ")).total).toBe(0);
  });

  it("accepts an EPUB whose mimetype entry is not first, and refuses a zip that is not an EPUB", async () => {
    const sloppy = await buildZip([
      { name: "META-INF/container.xml", content: '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>' },
      { name: "mimetype", content: "application/epub+zip\n" },
      { name: "../escape.xhtml", content: "<p>ignored</p>" },
      {
        name: "book.opf",
        content:
          '<package><metadata><dc:title>Sloppy</dc:title></metadata><manifest><item id="a" href="a.html" media-type="application/xhtml+xml"/><item id="b" href="../escape.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
      },
      { name: "a.html", content: "<html><body><p>Marmalade sandwiches.</p></body></html>" },
    ]);
    const plainZip = await buildZip([{ name: "readme.txt", content: "just a zip" }]);
    const { body } = await upload([
      { name: "sloppy.epub", content: sloppy },
      { name: "not-a-book.epub", content: plainZip },
    ]);
    expect(body.results[0].status).toBe("created");
    expect(body.results[1]).toMatchObject({ status: "rejected", code: "unsupported" });
    expect(body.results[1].reason).toContain("is not one");
    await app.ctx.jobs.whenIdle();
    const { sections } = (await app.api("GET", `/api/documents/${body.results[0].document.id}/text`)).body;
    expect(sections).toEqual([{ page: null, heading: null, text: "Marmalade sandwiches." }]);
    expect(incoming()).toEqual([]);
  });

  it("stores images without text and keeps them findable by title and tags", async () => {
    const image = await add({ name: "trailhead map.png", content: tinyPng }, { tags: "maps" });
    expect(image).toMatchObject({ type: "image", mime: "image/png", extraction: "unsupported", textChars: 0 });
    expect(image.extractionDetail).toContain(
      "Images are stored and shown but have no searchable text (OCR is not available in this version)",
    );
    expect((await search("trailhead ")).results[0].entityId).toBe(image.id);
    expect((await app.api("GET", `/api/documents/${image.id}/text`)).body.sections).toEqual([]);
  });

  it("reads text again on request", async () => {
    const document = await add({ name: "a.txt", content: "alpha bravo" });
    const { status, body } = await app.api("POST", `/api/documents/${document.id}/reextract`);
    expect(status).toBe(200);
    expect(body.document.extraction).toBe("pending");
    expect(body.jobId).toBeTruthy();
    await app.ctx.jobs.whenIdle();
    expect((await app.api("GET", `/api/documents/${document.id}`)).body.document.extraction).toBe("done");
    expect((await app.api("POST", "/api/documents/nope/reextract")).status).toBe(404);
  });
});

describe("what is accepted", () => {
  beforeEach(async () => {
    app = await createTestApp();
  });

  it("detects duplicates by content unless told to keep both", async () => {
    const first = await upload([{ name: "one.txt", content: "same bytes" }]);
    const original = first.body.results[0].document;
    const again = await upload([
      { name: "renamed.txt", content: "same bytes" },
      { name: "other.txt", content: "different bytes" },
    ]);
    expect(again.body.results[0]).toMatchObject({
      originalName: "renamed.txt",
      status: "duplicate",
      document: { id: original.id, originalName: "one.txt" },
    });
    expect(again.body.results[1].status).toBe("created");
    expect((await app.api("GET", "/api/documents")).body.total).toBe(2);
    expect(incoming()).toEqual([]);

    const forced = await upload([{ name: "renamed.txt", content: "same bytes" }], { allowDuplicate: "true" });
    expect(forced.body.results[0].status).toBe("created");
    expect(forced.body.results[0].document.id).not.toBe(original.id);
    expect(forced.body.results[0].document.sha256).toBe(original.sha256);

    // Two copies of one file in a single request: the second is a duplicate of the first.
    const pair = await upload([
      { name: "p1.md", content: "# twins" },
      { name: "p2.md", content: "# twins" },
    ]);
    expect(pair.body.results.map((result: { status: string }) => result.status)).toEqual(["created", "duplicate"]);
  });

  it("refuses types it does not support and files that are not what their name says", async () => {
    const { status, body } = await upload([
      { name: "setup.exe", content: Buffer.from("MZ\u0090\u0000binary", "latin1"), type: "application/pdf" },
      { name: "fake.pdf", content: "MZ this is an executable pretending", type: "application/pdf" },
      { name: "binary.txt", content: Buffer.from([0x48, 0x69, 0x00, 0x01, 0x02, 0xff, 0xfe]) },
      { name: "latin1.md", content: Buffer.from("caf\xe9 au lait", "latin1") },
      { name: "picture.png", content: "<html>not a png</html>" },
      { name: "README", content: "no extension" },
      { name: "empty.txt", content: "" },
      { name: "fine.txt", content: "this one is fine" },
    ]);
    expect(status).toBe(200);
    const byName = Object.fromEntries(body.results.map((result: { originalName: string }) => [result.originalName, result]));
    expect(byName["setup.exe"]).toMatchObject({ status: "rejected", code: "unsupported" });
    expect(byName["setup.exe"].reason).toMatch(/\.exe file.*Supported types: PDF, EPUB, Markdown/);
    expect(byName["fake.pdf"]).toMatchObject({ status: "rejected", code: "unsupported" });
    expect(byName["fake.pdf"].reason).toContain("named like a PDF, but its contents are not one");
    expect(byName["binary.txt"]).toMatchObject({ status: "rejected", code: "unsupported" });
    expect(byName["binary.txt"].reason).toContain("not UTF-8 text");
    expect(byName["latin1.md"].status).toBe("rejected");
    expect(byName["picture.png"].status).toBe("rejected");
    expect(byName.README.reason).toContain("no file extension");
    expect(byName["empty.txt"]).toMatchObject({ status: "rejected", code: "bad_request" });
    expect(byName["fine.txt"].status).toBe("created");

    // Nothing but the good file reached the disk.
    expect((await app.api("GET", "/api/documents")).body.total).toBe(1);
    expect(incoming()).toEqual([]);
    expect(fs.readdirSync(path.join(locationPath(), "documents")).filter((name) => name !== ".incoming")).toHaveLength(1);
  });

  it("answers 400 when the request is not an upload or has no files", async () => {
    expect((await app.api("POST", "/api/documents", { title: "x" })).status).toBe(400);
    const empty = await upload([], { category: "x" });
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toContain("No files were sent");
    const badTag = await upload([{ name: "a.txt", content: "a" }], { tags: "x".repeat(80) });
    expect(badTag.status).toBe(400);
    expect(incoming()).toEqual([]);
    expect((await upload([{ name: "a.txt", content: "a" }], { locationId: "missing" })).status).toBe(404);
  });

  it("keeps hostile file names inside the storage location", async () => {
    const { body } = await upload([
      { name: "../../etc/passwd.txt", content: "root:x:0:0" },
      { name: "..\\..\\windows\\evil\u0001\u007f name.md", content: "# evil" },
      { name: "con.txt", content: "reserved on Windows" },
      { name: `${"long".repeat(100)}.txt`, content: "long name" },
    ]);
    const root = locationPath();
    for (const result of body.results) {
      expect(result.status, JSON.stringify(result)).toBe("created");
      const { id, relPath, originalName } = result.document;
      expect(relPath.startsWith(`documents/${id}/`)).toBe(true);
      expect(relPath.split("/")).toHaveLength(3);
      expect(relPath).not.toContain("..");
      // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting their absence
      expect(originalName).not.toMatch(/[\u0000-\u001f\u007f/\\]/);
      const absolute = app.ctx.services.documents.absolutePath(id);
      expect(absolute.startsWith(path.join(root, "documents", id) + path.sep)).toBe(true);
      expect(fs.existsSync(absolute)).toBe(true);
    }
    expect(body.results[0].document).toMatchObject({ originalName: "passwd.txt", title: "passwd" });
    expect(body.results[1].document.originalName).toBe("evil name.md");
    expect(body.results[2].document.relPath.endsWith("/document.txt")).toBe(true);
    expect(path.basename(body.results[3].document.relPath).length).toBeLessThanOrEqual(120);
    // Nothing was written above the location.
    expect(fs.existsSync(path.join(app.dir, "etc"))).toBe(false);
    expect(fs.readdirSync(path.dirname(root)).sort()).toEqual([path.basename(root)]);
  });

  it("streams files larger than the JSON body limit", async () => {
    // 24 MB: more than the 20 MB limit that applies to ordinary request bodies.
    const big = Buffer.concat([tinyPng, Buffer.alloc(24 * 1024 * 1024, 7)]);
    const { status, body } = await upload([{ name: "poster.png", content: big }]);
    expect(status).toBe(200);
    expect(body.results[0]).toMatchObject({ status: "created", document: { sizeBytes: big.length } });
    expect(fs.statSync(fileOf(body.results[0].document)).size).toBe(big.length);
  });

  it("leaves nothing behind when the connection drops part-way through", async () => {
    const address = await app.app.listen({ port: 0, host: "127.0.0.1" });
    const { payload, headers } = multipart({}, [
      { name: "first.txt", content: "arrives whole" },
      { name: "second.txt", content: "z".repeat(200_000) },
    ]);
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(Number(new URL(address).port), "127.0.0.1", () => {
        socket.write(
          `POST /api/documents HTTP/1.1\r\nHost: localhost\r\nX-Outpost-Request: 1\r\nContent-Type: ${headers["content-type"]}\r\nContent-Length: ${payload.length}\r\n\r\n`,
        );
        // Everything but the end of the second file. Once the first file is on disk as a
        // part file the server is demonstrably mid-upload, and the line is cut.
        socket.write(payload.subarray(0, payload.length - 50_000));
        expect
          .poll(() => incoming().length, { timeout: 5000 })
          .toBeGreaterThan(0)
          .then(() => socket.destroy(), reject);
      });
      socket.on("close", () => resolve());
      socket.on("error", reject);
    });
    await expect.poll(() => incoming(), { timeout: 5000 }).toEqual([]);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(0);
    expect(fs.readdirSync(path.join(locationPath(), "documents"))).toEqual([".incoming"]);
  });

  it("enforces the upload size limit per file and cleans up", async () => {
    await app.close();
    app = await createTestApp({ OUTPOST_MAX_UPLOAD_MB: "1" });
    const { status, body } = await upload([
      { name: "huge.txt", content: "x".repeat(1024 * 1024 + 4096) },
      { name: "small.txt", content: "fits easily" },
      { name: "exact.txt", content: "y".repeat(1024 * 1024) },
    ]);
    expect(status).toBe(200);
    expect(body.results[0]).toMatchObject({ originalName: "huge.txt", status: "rejected", code: "too_large" });
    expect(body.results[0].reason).toContain("larger than the 1 MB");
    expect(body.results[1].status).toBe("created");
    expect(body.results[2].status).toBe("created");
    expect(incoming()).toEqual([]);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(2);
  });
});

describe("serving the original", () => {
  let text: DocumentDto;
  const CONTENT = "abcdefghijklmnopqrst";
  beforeEach(async () => {
    app = await createTestApp();
    text = await add({ name: "letters.txt", content: CONTENT });
  });

  const get = (url: string, headers: Record<string, string> = {}) => app.api("GET", url, undefined, { headers });

  it("sends the whole file with caching and safety headers", async () => {
    const response = await get(text.fileUrl);
    expect(response.status).toBe(200);
    expect(response.body).toBe(CONTENT);
    expect(response.headers).toMatchObject({
      "content-type": "text/plain; charset=utf-8",
      "content-length": String(CONTENT.length),
      "accept-ranges": "bytes",
      etag: `"${text.sha256}"`,
      "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      "x-content-type-options": "nosniff",
      "content-disposition": `inline; filename="letters.txt"; filename*=UTF-8''letters.txt`,
    });
    expect((await get(text.fileUrl, { "if-none-match": `"${text.sha256}"` })).status).toBe(304);
    expect((await get("/api/documents/nope/file")).status).toBe(404);
  });

  it("answers byte ranges", async () => {
    const middle = await get(text.fileUrl, { range: "bytes=2-5" });
    expect(middle.status).toBe(206);
    expect(middle.body).toBe("cdef");
    expect(middle.headers).toMatchObject({ "content-range": "bytes 2-5/20", "content-length": "4", "accept-ranges": "bytes" });

    const tail = await get(text.fileUrl, { range: "bytes=15-" });
    expect(tail.status).toBe(206);
    expect(tail.body).toBe("pqrst");
    expect(tail.headers["content-range"]).toBe("bytes 15-19/20");

    const suffix = await get(text.fileUrl, { range: "bytes=-3" });
    expect(suffix.body).toBe("rst");
    expect(suffix.headers["content-range"]).toBe("bytes 17-19/20");

    // An end past the file is clamped, as the specification asks.
    const clamped = await get(text.fileUrl, { range: "bytes=18-999" });
    expect(clamped.headers["content-range"]).toBe("bytes 18-19/20");

    const beyond = await get(text.fileUrl, { range: "bytes=20-30" });
    expect(beyond.status).toBe(416);
    expect(beyond.headers["content-range"]).toBe("bytes */20");

    // Several ranges at once and a stale If-Range both get the whole file.
    expect((await get(text.fileUrl, { range: "bytes=0-1,5-6" })).status).toBe(200);
    expect((await get(text.fileUrl, { range: "bytes=2-5", "if-range": '"something-else"' })).status).toBe(200);
    expect((await get(text.fileUrl, { range: "bytes=2-5", "if-range": `"${text.sha256}"` })).status).toBe(206);
  });

  it("shows only safe types in place; HTML, SVG and EPUB are downloads", async () => {
    const { body } = await upload([
      { name: "page.html", content: "<script>alert(document.cookie)</script><p>hello</p>" },
      { name: "drawing.svg", content: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' },
      { name: "Überblick – notes.md", content: "# Übersicht" },
      { name: "dot.png", content: tinyPng },
      { name: "paper.pdf", content: buildPdf([["one page"]]) },
    ]);
    const [html, svg, markdown, png, pdf] = body.results.map((result: UploadResult) => result.document as DocumentDto);
    const headersOf = async (document: { fileUrl: string }, query = "") => (await get(`${document.fileUrl}${query}`)).headers;

    const htmlHeaders = await headersOf(html);
    expect(htmlHeaders["content-disposition"]).toMatch(/^attachment; filename="page.html"/);
    expect(htmlHeaders["content-security-policy"]).toContain("sandbox");
    expect(htmlHeaders["x-content-type-options"]).toBe("nosniff");

    const svgHeaders = await headersOf(svg);
    expect(svgHeaders["content-disposition"]).toMatch(/^attachment;/);
    expect(svgHeaders["content-type"]).toBe("image/svg+xml; charset=utf-8");
    expect(svgHeaders["content-security-policy"]).toContain("sandbox");

    const markdownHeaders = await headersOf(markdown);
    expect(markdownHeaders["content-type"]).toBe("text/plain; charset=utf-8");
    // RFC 5987: an ASCII fallback plus the exact name, percent-encoded.
    expect(markdownHeaders["content-disposition"]).toBe(
      `inline; filename="_berblick _ notes.md"; filename*=UTF-8''%C3%9Cberblick%20%E2%80%93%20notes.md`,
    );

    expect(await headersOf(png)).toMatchObject({ "content-type": "image/png", "content-disposition": expect.stringMatching(/^inline;/) });
    expect(await headersOf(pdf)).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition": expect.stringMatching(/^inline;/),
    });

    const forced = await headersOf(pdf, "?download=1");
    expect(forced["content-disposition"]).toMatch(/^attachment; filename="paper.pdf"/);
    expect(forced["content-security-policy"]).toContain("sandbox");
    expect((await headersOf(markdown, "?download=1"))["content-type"]).toBe("text/markdown; charset=utf-8");
  });
});

describe("browsing and editing", () => {
  let docs: Map<string, DocumentDto>;
  const doc = (name: string) => docs.get(name)!;
  beforeEach(async () => {
    app = await createTestApp();
    const first = await upload(
      [
        { name: "Water guide.md", content: `# Water\n\n${"Boil it. ".repeat(40)}` },
        { name: "knots.txt", content: "clove hitch" },
      ],
      { category: "Survival", tags: "water" },
    );
    const second = await upload([{ name: "dot.png", content: tinyPng }], { category: "Pictures", tags: "Photos,WATER" });
    await app.ctx.jobs.whenIdle();
    docs = new Map(
      [...first.body.results, ...second.body.results].map((result: UploadResult) => [result.originalName, result.document as DocumentDto]),
    );
  });

  const list = async (query: string) => (await app.api("GET", `/api/documents?${query}`)).body;
  const names = async (query: string) => (await list(query)).documents.map((document: { originalName: string }) => document.originalName);

  it("lists with filters, sorting and paging", async () => {
    const all = await list("");
    expect(all.total).toBe(3);
    // Newest first by default.
    expect(all.documents.map((document: { originalName: string }) => document.originalName)).toEqual([
      "dot.png",
      "knots.txt",
      "Water guide.md",
    ]);
    expect(all.documents[0]).toMatchObject({ tags: ["Photos", "water"], locationAvailable: true, extraction: "unsupported" });

    expect(await names("q=GUIDE")).toEqual(["Water guide.md"]);
    expect(await names("q=knots.t")).toEqual(["knots.txt"]);
    expect(await names(`q=${encodeURIComponent("%")}`)).toEqual([]);
    expect(await names("category=survival&sort=title")).toEqual(
      ["knots", "Water guide"].map((title) => (title === "knots" ? "knots.txt" : "Water guide.md")),
    );
    expect(await names("tag=Water&sort=title&order=desc")).toEqual(["Water guide.md", "knots.txt", "dot.png"]);
    expect(await names("tag=photos")).toEqual(["dot.png"]);
    expect(await names("tag=unknown")).toEqual([]);
    expect(await names("type=image")).toEqual(["dot.png"]);
    expect(await names("type=markdown")).toEqual(["Water guide.md"]);
    expect(await names("sort=size&order=asc")).toEqual(["knots.txt", "dot.png", "Water guide.md"]);

    const page = await list("sort=title&limit=1&offset=1");
    expect(page.total).toBe(3);
    expect(page.documents.map((document: { originalName: string }) => document.originalName)).toEqual(["knots.txt"]);

    expect((await app.api("GET", "/api/documents?limit=500")).status).toBe(400);
    expect((await app.api("GET", "/api/documents?type=spreadsheet")).status).toBe(400);
    expect((await app.api("GET", "/api/documents/unknown-id")).status).toBe(404);
  });

  it("summarises the library in facets and lists tags with counts", async () => {
    const { body } = await app.api("GET", "/api/documents/facets");
    expect(body.categories).toEqual([
      { name: "Survival", count: 2 },
      { name: "Pictures", count: 1 },
    ]);
    // "water" and "WATER" are one tag.
    expect(body.tags).toEqual([
      { name: "water", count: 3 },
      { name: "Photos", count: 1 },
    ]);
    expect(body.types).toEqual([
      { type: "image", count: 1 },
      { type: "markdown", count: 1 },
      { type: "text", count: 1 },
    ]);
    expect(body.total).toBe(3);
    expect(body.totalBytes).toBe([...docs.values()].reduce((sum, document) => sum + document.sizeBytes, 0));

    const tags = (await app.api("GET", "/api/tags")).body.tags;
    expect(tags.map((tag: { name: string; documentCount: number }) => [tag.name, tag.documentCount])).toEqual([
      ["Photos", 1],
      ["water", 3],
    ]);
  });

  it("re-indexes after an edit, so the new title and tags are searchable", async () => {
    const id = doc("knots.txt").id;
    expect((await search("bowline ")).total).toBe(0);
    const { status, body } = await app.api("PATCH", `/api/documents/${id}`, {
      title: "  Bowline and friends ",
      description: "Rope work",
      author: "S. Sailor",
      source: "",
      language: "en",
      category: null,
      tags: [" Rope ", "rope", "WATER", ""],
    });
    expect(status).toBe(200);
    expect(body.document).toMatchObject({
      title: "Bowline and friends",
      description: "Rope work",
      author: "S. Sailor",
      source: null,
      language: "en",
      category: null,
      // The existing tag keeps its spelling; "rope" is created once.
      tags: ["Rope", "water"],
    });

    const byTitle = await search("bowline ");
    expect(byTitle.results[0]).toMatchObject({ entityId: id, subtitle: "S. Sailor", collection: null });
    expect((await search("rope ")).results[0].entityId).toBe(id);
    // The text itself is still there after the metadata change.
    expect((await search("clove ")).results[0].entityId).toBe(id);

    // Dropping the last use of a tag removes it from the list.
    await app.api("PATCH", `/api/documents/${id}`, { tags: [] });
    expect((await app.api("GET", "/api/tags")).body.tags.map((tag: { name: string }) => tag.name)).toEqual(["Photos", "water"]);
    expect((await search("rope ")).total).toBe(0);

    expect((await app.api("PATCH", `/api/documents/${id}`, { title: "   " })).status).toBe(400);
    expect((await app.api("PATCH", `/api/documents/${id}`, { sha256: "abc" })).status).toBe(400);
    expect((await app.api("PATCH", `/api/documents/${id}`, { tags: ["a,b"] })).status).toBe(400);
    expect((await app.api("PATCH", "/api/documents/nope", { title: "x" })).status).toBe(404);
  });

  it("deletes the file, its folder, its text and its search entry", async () => {
    const document = doc("Water guide.md");
    const file = fileOf(document);
    const extracted = path.join(app.ctx.config.dataDir, "extracted", `${document.id}.json`);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(extracted)).toBe(true);
    expect((await search("boil ")).total).toBe(1);

    expect((await app.api("DELETE", `/api/documents/${document.id}`)).status).toBe(200);
    expect(fs.existsSync(path.dirname(file))).toBe(false);
    expect(fs.existsSync(extracted)).toBe(false);
    expect((await search("boil ")).total).toBe(0);
    expect((await app.api("GET", `/api/documents/${document.id}`)).status).toBe(404);
    expect((await app.api("DELETE", `/api/documents/${document.id}`)).status).toBe(404);
    // Other documents are untouched.
    expect(fs.existsSync(fileOf(doc("knots.txt")))).toBe(true);
    expect((await list("")).total).toBe(2);
  });

  it("can delete a document whose text is still being read", async () => {
    const { body } = await upload([{ name: "busy.pdf", content: buildPdf(Array.from({ length: 30 }, (_, index) => [`page ${index}`])) }]);
    const { id } = body.results[0].document;
    expect((await app.api("DELETE", `/api/documents/${id}`)).status).toBe(200);
    await app.ctx.jobs.whenIdle();
    // The job stops quietly (or had already finished) instead of failing on a file that
    // is no longer there.
    const [job] = app.ctx.jobs.findBySubject(`document:${id}`);
    expect(["cancelled", "succeeded"]).toContain(job?.state);
    expect(fs.existsSync(path.join(app.ctx.config.dataDir, "extracted", `${id}.json`))).toBe(false);
    expect((await search("busy ")).total).toBe(0);
  });

  it("publishes a change event for every kind of change", async () => {
    const seen: string[] = [];
    const stop = app.ctx.events.subscribe((event) => {
      if (event.type === "documents.changed" && event.id) seen.push(event.id);
    });
    const created = await add({ name: "new.txt", content: "brand new" });
    const afterCreate = seen.filter((id) => id === created.id).length;
    // Created, extraction running, extraction done.
    expect(afterCreate).toBeGreaterThanOrEqual(3);
    await app.api("PATCH", `/api/documents/${created.id}`, { title: "Renamed" });
    await app.api("DELETE", `/api/documents/${created.id}`);
    expect(seen.filter((id) => id === created.id).length).toBe(afterCreate + 2);
    stop();
  });
});

describe("when the storage location goes away", () => {
  let document: DocumentDto;
  let away: string;
  beforeEach(async () => {
    app = await createTestApp();
    document = await add({ name: "manual.txt", content: "keep me safe" });
    // Unplug the drive: the folder moves out of every storage root.
    away = path.join(app.dir, "unplugged");
    fs.renameSync(locationPath(), away);
    await app.ctx.services.storage.refresh();
  });

  it("says so instead of failing strangely, and deletes nothing", async () => {
    const stored = path.join(away, document.relPath);
    const listed = (await app.api("GET", "/api/documents")).body.documents[0];
    expect(listed).toMatchObject({ id: document.id, locationAvailable: false });

    const file = await app.api("GET", document.fileUrl);
    expect(file.status).toBe(503);
    expect(file.body.error).toMatchObject({ code: "storage_unavailable" });
    expect(file.body.error.message).toContain("is not connected");
    expect(() => app.ctx.services.documents.absolutePath(document.id)).toThrowError(/not connected/);

    // Asking to read the text again is refused up front…
    expect((await app.api("POST", `/api/documents/${document.id}/reextract`)).status).toBe(503);
    // …and a job that was already queued when the drive went fails cleanly.
    app.ctx.jobs.enqueue(EXTRACT_JOB, { documentId: document.id }, { title: "Reading text", subject: `document:${document.id}` });
    await app.ctx.jobs.whenIdle();
    const after = (await app.api("GET", `/api/documents/${document.id}`)).body.document;
    expect(after.extraction).toBe("failed");
    expect(after.extractionDetail).toMatch(/not connected.*Read text again/);
    expect(app.ctx.jobs.findBySubject(`document:${document.id}`).at(-1)).toMatchObject({
      state: "failed",
      errorKind: "storage_unavailable",
    });
    expect(fs.readFileSync(stored, "utf8")).toBe("keep me safe");
    // Text read earlier is still there and still searchable.
    expect((await app.api("GET", `/api/documents/${document.id}/text`)).body.sections).toHaveLength(1);
    expect((await search("safe ")).total).toBe(1);

    const upload503 = await upload([{ name: "later.txt", content: "later" }]);
    expect(upload503.status).toBe(503);

    const refused = await app.api("DELETE", `/api/documents/${document.id}`);
    expect(refused.status).toBe(503);
    expect(refused.body.error.message).toMatch(/cannot be deleted.*remove only Outpost's record/);
    expect(refused.body.error.details).toMatchObject({ canForget: true });
    expect((await app.api("GET", `/api/documents/${document.id}`)).status).toBe(200);

    // Forgetting removes the record and leaves the file on the drive.
    expect((await app.api("DELETE", `/api/documents/${document.id}?forget=true`)).status).toBe(200);
    expect((await app.api("GET", `/api/documents/${document.id}`)).status).toBe(404);
    expect((await search("safe ")).total).toBe(0);
    expect(fs.readFileSync(stored, "utf8")).toBe("keep me safe");
  });

  it("carries on when the location comes back", async () => {
    fs.renameSync(away, path.join(app.dir, "storage", "remounted"));
    await app.ctx.services.storage.refresh();
    const file = await app.api("GET", document.fileUrl);
    expect(file.status).toBe(200);
    expect(file.body).toBe("keep me safe");
    expect((await app.api("GET", `/api/documents/${document.id}`)).body.document.locationAvailable).toBe(true);
  });
});

describe("the service, as other modules use it", () => {
  beforeEach(async () => {
    app = await createTestApp();
  });

  const scratch = (name: string, content: string | Buffer) => {
    const dir = path.join(app.dir, "inbox");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    return file;
  };

  it("ingests a file from disk like an upload: validated, hashed, deduplicated, extracted", async () => {
    const { documents } = app.ctx.services;
    const source = scratch("tmp-8731.bin", "# Stoves\n\nAlcohol stoves are light.\n");

    const copied = await documents.ingestFile({
      sourcePath: source,
      originalName: "Stoves.md",
      category: "Kit",
      tags: ["cooking", "Cooking"],
    });
    expect(copied.status).toBe("created");
    expect(copied.document).toMatchObject({
      originalName: "Stoves.md",
      title: "Stoves",
      type: "markdown",
      category: "Kit",
      tags: ["cooking"],
    });
    // Copied: the source is still there.
    expect(fs.existsSync(source)).toBe(true);
    expect(fs.readFileSync(documents.absolutePath(copied.document.id), "utf8")).toContain("Alcohol stoves");
    await app.ctx.jobs.whenIdle();
    expect(documents.get(copied.document.id).extraction).toBe("done");
    expect((await search("alcohol ")).results[0].entityId).toBe(copied.document.id);

    // The same bytes again are a duplicate, and a duplicate is never moved or deleted.
    const again = await documents.ingestFile({ sourcePath: source, originalName: "copy.md", move: true });
    expect(again).toMatchObject({ status: "duplicate", document: { id: copied.document.id } });
    expect(fs.existsSync(source)).toBe(true);

    const toMove = scratch("moving.txt", "moved into the library");
    const moved = await documents.ingestFile({ sourcePath: toMove, originalName: "../../moved.txt", move: true, title: "Moved in" });
    expect(moved.document).toMatchObject({
      originalName: "moved.txt",
      title: "Moved in",
      relPath: `documents/${moved.document.id}/moved.txt`,
    });
    expect(fs.existsSync(toMove)).toBe(false);
    expect(fs.readFileSync(documents.absolutePath(moved.document.id), "utf8")).toBe("moved into the library");

    const wrong = scratch("program.pdf", "MZ not a pdf");
    await expect(documents.ingestFile({ sourcePath: wrong, originalName: "program.pdf", move: true })).rejects.toMatchObject({
      code: "unsupported",
    });
    await expect(documents.ingestFile({ sourcePath: wrong, originalName: "program.exe" })).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      documents.ingestFile({ sourcePath: path.join(app.dir, "missing.txt"), originalName: "missing.txt" }),
    ).rejects.toMatchObject({ code: "bad_request" });
    // A refused file is left exactly where it was, even when a move was asked for.
    expect(fs.readFileSync(wrong, "utf8")).toBe("MZ not a pdf");
    expect(incoming()).toEqual([]);
    expect(documents.list().total).toBe(2);
    expect(() => documents.get("nope")).toThrowError(/not found/);
  });

  it("follows a file that another module moved", async () => {
    const { documents, storage } = app.ctx.services;
    const created = await add({ name: "atlas.txt", content: "maps of the valley" });
    const location = storage.getDefault();
    fs.mkdirSync(path.join(location.path, "archive"), { recursive: true });
    fs.renameSync(documents.absolutePath(created.id), path.join(location.path, "archive", "atlas-2024.txt"));

    await expect(documents.relocate(created.id, location.id, "../outside.txt")).rejects.toMatchObject({ code: "bad_request" });
    await expect(documents.relocate(created.id, "missing", "archive/atlas-2024.txt")).rejects.toMatchObject({ code: "not_found" });
    const relocated = await documents.relocate(created.id, location.id, "archive/atlas-2024.txt");
    expect(relocated).toMatchObject({ id: created.id, relPath: "archive/atlas-2024.txt", locationId: location.id });
    expect((await app.api("GET", created.fileUrl)).body).toBe("maps of the valley");

    // Deleting a relocated document removes its file but not the folder it sits in.
    fs.writeFileSync(path.join(location.path, "archive", "neighbour.txt"), "not Outpost's");
    await documents.remove(created.id);
    expect(fs.existsSync(path.join(location.path, "archive", "atlas-2024.txt"))).toBe(false);
    expect(fs.existsSync(path.join(location.path, "archive", "neighbour.txt"))).toBe(true);
  });

  it("reports a missing file clearly", async () => {
    const created = await add({ name: "gone.txt", content: "about to vanish" });
    fs.rmSync(fileOf(created));
    const file = await app.api("GET", created.fileUrl);
    expect(file.status).toBe(404);
    expect(file.body.error.message).toContain("is missing from its storage location");
    await app.api("POST", `/api/documents/${created.id}/reextract`);
    await app.ctx.jobs.whenIdle();
    const after = app.ctx.services.documents.get(created.id);
    expect(after.extraction).toBe("failed");
    expect(after.extractionDetail).toContain("The file is missing");
  });
});

describe("permissions", () => {
  const cookieOf = (headers: Record<string, unknown>) => String([headers["set-cookie"]].flat()[0]).split(";")[0]!;

  it("lets members add and edit but only administrators delete", async () => {
    app = await createTestApp({ OUTPOST_AUTH: "on" });
    const setup = await app.api("POST", "/api/auth/setup", { username: "admin", password: "correct horse battery" });
    const admin = { cookie: cookieOf(setup.headers) };
    await app.api("POST", "/api/users", { username: "member", password: "another long password", role: "member" }, { headers: admin });
    const login = await app.api("POST", "/api/auth/login", { username: "member", password: "another long password" });
    const member = { cookie: cookieOf(login.headers) };

    const { payload, headers } = multipart({}, [{ name: "shared.txt", content: "for everyone" }]);
    expect((await app.api("POST", "/api/documents", payload, { headers })).status).toBe(401);
    expect((await app.api("GET", "/api/documents")).status).toBe(401);

    const uploaded = await app.api("POST", "/api/documents", payload, { headers: { ...headers, ...member } });
    expect(uploaded.status).toBe(200);
    const id = uploaded.body.results[0].document.id;
    await app.ctx.jobs.whenIdle();

    expect((await app.api("GET", `/api/documents/${id}/file`)).status).toBe(401);
    expect((await app.api("GET", `/api/documents/${id}/file`, undefined, { headers: member })).status).toBe(200);
    expect((await app.api("PATCH", `/api/documents/${id}`, { title: "Shared" }, { headers: member })).status).toBe(200);
    expect((await app.api("POST", `/api/documents/${id}/reextract`, undefined, { headers: member })).status).toBe(200);

    const denied = await app.api("DELETE", `/api/documents/${id}`, undefined, { headers: member });
    expect(denied.status).toBe(403);
    expect((await app.api("DELETE", `/api/documents/${id}`, undefined, { headers: admin })).status).toBe(200);
  });
});
