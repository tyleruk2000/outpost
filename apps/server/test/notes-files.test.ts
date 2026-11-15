import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { MAX_ATTACHMENT_BYTES } from "../src/modules/notes/attachments.ts";
import { createNamer, planPaths, relativeLink } from "../src/modules/notes/export.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: responses are read loosely in tests, as in helpers.ts
type Json = Record<string, any>;

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("JFIF and then some bytes")]);
const GIF = Buffer.from("GIF89a\u0001\u0000\u0001\u0000", "latin1");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x1a, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26)]);
const SVG = Buffer.from(
  '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(document.domain)</script><circle r="4"/></svg>',
);
const GPX = Buffer.from('<?xml version="1.0"?>\n<gpx version="1.1" creator="test"><wpt lat="46.5" lon="8.0"><name>Hut</name></wpt></gpx>');
const HTML = Buffer.from("<!doctype html><html><body><script>alert(1)</script></body></html>");

const text = (value: string, marks?: Json[]) => (marks ? { type: "text", text: value, marks } : { type: "text", text: value });
const p = (...content: Json[]) => ({ type: "paragraph", content });
const doc = (...content: Json[]) => ({ type: "doc", content });
const image = (attachmentId: string, alt: string | null = null) => ({
  type: "image",
  attrs: { src: `/api/attachments/${attachmentId}`, alt, title: null },
});
const pageLink = (noteId: string, label: string) => ({ type: "pageLink", attrs: { noteId, label } });

interface Part {
  name: string;
  value?: string;
  filename?: string;
  content?: Buffer;
}

/** A multipart/form-data body, built by hand so that file names can be as hostile as a test likes. */
function multipart(parts: Part[]): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----outpost-test-boundary";
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition =
      part.filename === undefined
        ? `form-data; name="${part.name}"`
        : `form-data; name="${part.name}"; filename="${part.filename.replace(/"/g, "%22")}"`;
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: ${disposition}\r\n`));
    if (part.filename !== undefined) chunks.push(Buffer.from("Content-Type: application/octet-stream\r\n"));
    chunks.push(Buffer.from("\r\n"), part.content ?? Buffer.from(part.value ?? ""), Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

function readZip(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const entries = new Map<string, Buffer>();
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(entries));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

const attachmentsDir = () => path.join(app.dir, "data", "attachments");
/** Every stored attachment file, relative to the attachments folder. */
const storedFiles = () =>
  fs.existsSync(attachmentsDir())
    ? (fs.readdirSync(attachmentsDir(), { recursive: true, withFileTypes: true }) as fs.Dirent[])
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(attachmentsDir(), path.join(entry.parentPath, entry.name)))
    : [];

async function upload(filename: string, content: Buffer, fields: Record<string, string> = {}, fieldsFirst = true) {
  const fieldParts = Object.entries(fields).map(([name, value]) => ({ name, value }));
  const file = { name: "file", filename, content };
  const body = multipart(fieldsFirst ? [...fieldParts, file] : [file, ...fieldParts]);
  return app.api("POST", "/api/attachments", body.payload, { headers: body.headers });
}

async function createNote(body: Json = {}): Promise<Json> {
  const response = await app.api("POST", "/api/notes", body);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.note;
}

describe("attachments", () => {
  it("stores an upload under the data directory with its hash and size", async () => {
    const note = await createNote({ title: "With a picture" });
    const response = await upload("Summit photo.png", PNG, { noteId: note.id });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const attachment = response.body.attachment;
    expect(attachment).toEqual({
      id: expect.stringMatching(/^[0-9a-z]{26}$/),
      noteId: note.id,
      filename: "Summit photo.png",
      mime: "image/png",
      sizeBytes: PNG.length,
      sha256: createHash("sha256").update(PNG).digest("hex"),
      url: `/api/attachments/${attachment.id}`,
      createdAt: expect.any(Number),
    });
    // <dataDir>/attachments/<aa>/<id>/<name>, and nothing left in the staging folder.
    expect(storedFiles()).toEqual([path.join(attachment.id.slice(-2), attachment.id, "Summit photo.png")]);
    expect(fs.readFileSync(path.join(attachmentsDir(), storedFiles()[0]!))).toEqual(PNG);

    // The page field may also come after the file, or in the query string.
    expect((await upload("b.png", PNG, { noteId: note.id }, false)).body.attachment.noteId).toBe(note.id);
    const body = multipart([{ name: "file", filename: "c.png", content: PNG }]);
    const viaQuery = await app.api("POST", `/api/attachments?noteId=${note.id}`, body.payload, { headers: body.headers });
    expect(viaQuery.body.attachment.noteId).toBe(note.id);
    expect((await upload("d.png", PNG)).body.attachment.noteId).toBeNull();
  });

  it("serves attachments with headers that keep them from running in Outpost's origin", async () => {
    const cases: Array<[filename: string, content: Buffer, mime: string, disposition: "inline" | "attachment"]> = [
      ["photo.png", PNG, "image/png", "inline"],
      ["photo.JPG", JPEG, "image/jpeg", "inline"],
      ["photo.jpeg", JPEG, "image/jpeg", "inline"],
      ["anim.gif", GIF, "image/gif", "inline"],
      ["modern.webp", WEBP, "image/webp", "inline"],
      ["drawing.svg", SVG, "image/svg+xml", "inline"],
      ["manual.pdf", PDF, "application/pdf", "inline"],
      ["notes.txt", Buffer.from("plain text"), "text/plain; charset=utf-8", "attachment"],
      ["readme.md", Buffer.from("# Hello"), "text/markdown; charset=utf-8", "attachment"],
      ["data.csv", Buffer.from("a,b\n1,2\n"), "text/csv; charset=utf-8", "attachment"],
      ["data.json", Buffer.from('{"a":1}'), "application/json", "attachment"],
      ["route.gpx", GPX, "application/gpx+xml", "attachment"],
      ["bundle.zip", ZIP, "application/zip", "attachment"],
    ];
    for (const [filename, content, mime, disposition] of cases) {
      const uploaded = await upload(filename, content);
      expect(uploaded.status, `${filename}: ${JSON.stringify(uploaded.body)}`).toBe(200);
      const response = await app.app.inject({ method: "GET", url: uploaded.body.attachment.url, headers: { host: "localhost" } });
      expect(response.statusCode, filename).toBe(200);
      expect(response.rawPayload.equals(content), filename).toBe(true);
      expect(response.headers["content-type"], filename).toBe(mime);
      expect(response.headers["content-security-policy"], filename).toBe("sandbox; default-src 'none'; style-src 'unsafe-inline'");
      expect(response.headers["x-content-type-options"], filename).toBe("nosniff");
      expect(response.headers["cache-control"], filename).toBe("private, max-age=31536000, immutable");
      expect(response.headers["content-length"], filename).toBe(String(content.length));
      expect(String(response.headers["content-disposition"]), filename).toMatch(new RegExp(`^${disposition}; filename="`));
    }
  });

  it("answers a repeat request without sending the file again", async () => {
    const { attachment } = (await upload("photo.png", PNG)).body;
    const first = await app.app.inject({ method: "GET", url: attachment.url, headers: { host: "localhost" } });
    expect(first.headers.etag).toBe(`"${attachment.sha256}"`);
    const second = await app.app.inject({
      method: "GET",
      url: attachment.url,
      headers: { host: "localhost", "if-none-match": String(first.headers.etag) },
    });
    expect(second.statusCode).toBe(304);
    expect(second.rawPayload.length).toBe(0);
    expect(second.headers["content-security-policy"]).toContain("sandbox");
    expect((await app.api("GET", "/api/attachments/01hxnothere")).status).toBe(404);
  });

  it("refuses file types it does not accept and files that are not what their name says", async () => {
    const refused: Array<[filename: string, content: Buffer, reason: RegExp]> = [
      ["page.html", HTML, /not a kind of file that can be attached/],
      ["script.js", Buffer.from("alert(1)"), /not a kind of file/],
      ["tool.exe", Buffer.from("MZ\u0090\u0000"), /not a kind of file/],
      ["archive.tar.gz", Buffer.from([0x1f, 0x8b]), /not a kind of file/],
      ["movie.mp4", Buffer.from("\u0000\u0000\u0000 ftypisom"), /not a kind of file/],
      ["no-extension", PNG, /not a kind of file/],
      ["photo.png.exe", PNG, /not a kind of file/],
      // The right ending with the wrong content.
      ["page.png", HTML, /does not look like a PNG file/],
      ["photo.jpg", PNG, /does not look like a JPG file/],
      ["photo.gif", PNG, /does not look like a GIF file/],
      ["photo.webp", Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVEfmt "), /does not look like a WEBP file/],
      ["doc.pdf", HTML, /does not look like a PDF file/],
      ["bundle.zip", PNG, /does not look like a ZIP file/],
      ["drawing.svg", HTML, /does not look like a SVG file/],
      ["route.gpx", SVG, /does not look like a GPX file/],
      ["notes.txt", PNG, /does not look like a TXT file/],
      ["data.json", Buffer.from([0x7b, 0x00, 0x7d]), /does not look like a JSON file/],
    ];
    for (const [filename, content, reason] of refused) {
      const response = await upload(filename, content);
      expect(response.status, filename).toBe(415);
      expect(response.body.error.code, filename).toBe("unsupported");
      expect(response.body.error.message, filename).toMatch(reason);
    }
    const empty = await upload("empty.txt", Buffer.alloc(0));
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toMatch(/is empty/);

    const noFile = multipart([{ name: "noteId", value: "x" }]);
    expect((await app.api("POST", "/api/attachments", noFile.payload, { headers: noFile.headers })).status).toBe(400);
    expect((await app.api("POST", "/api/attachments", { not: "multipart" })).status).toBe(400);

    // An upload for a page that does not exist is refused and its file is not kept.
    const orphan = await upload("photo.png", PNG, { noteId: "01hxnothere" });
    expect(orphan.status).toBe(404);

    // Nothing refused was kept, in the store or in the staging folder.
    expect(storedFiles()).toEqual([]);
    expect(app.ctx.sqlite.prepare("SELECT count(*) AS n FROM attachments").get()).toEqual({ n: 0 });
  });

  it("refuses a file over the size limit and accepts one exactly at it", async () => {
    const atLimit = Buffer.concat([PNG, Buffer.alloc(MAX_ATTACHMENT_BYTES - PNG.length)]);
    const ok = await upload("big.png", atLimit);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.attachment.sizeBytes).toBe(MAX_ATTACHMENT_BYTES);

    const tooBig = await upload("bigger.png", Buffer.concat([atLimit, Buffer.from([0])]));
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe("too_large");
    expect(tooBig.body.error.message).toMatch(/larger than 50 MB/);
    expect(storedFiles()).toHaveLength(1);
  });

  it("makes hostile file names harmless", async () => {
    // Straight to the store, as an importer would call it: the name is cleaned exactly like this.
    const source = path.join(app.dir, "pic.png");
    fs.writeFileSync(source, PNG);
    const { notes } = app.ctx.services;
    const cleaned: Array<[given: string, stored: string]> = [
      ["../../../etc/passwd.png", "etc passwd.png"],
      ["..\\..\\windows\\system32\\evil.png", "windows system32 evil.png"],
      ["/absolute/path.png", "absolute path.png"],
      ["<script>alert(1)</script>.png", "script alert(1) script .png"],
      ["line\r\nbreak: injected.png", "line break injected.png"],
      ["nul\u0000byte.png", "nul byte.png"],
      ["Gipfel – Zürich 山.png", "Gipfel – Zürich 山.png"],
      [`${"long".repeat(100)}.png`, `${"long".repeat(29)}.png`],
    ];
    for (const [given, stored] of cleaned) {
      const attachment = await notes.createAttachmentFromFile({ sourcePath: source, filename: given });
      expect(attachment.filename, given).toBe(stored);
    }
    // Names that clean up to nothing usable have no file type left and are refused.
    for (const given of ["....png", "CON.png", ".png", "..", ""]) {
      await expect(notes.createAttachmentFromFile({ sourcePath: source, filename: given }), given).rejects.toMatchObject({
        code: "unsupported",
      });
    }

    // Through an upload, where the form parser has its own opinion about paths as well.
    const uploaded = [
      "../../../etc/passwd.png",
      "..\\..\\windows\\evil.png",
      "/absolute/path.png",
      "<script>alert(1)</script>.png",
      "a;b=c'd(e)*f.png",
      "Gipfel – Zürich 山.png",
    ];
    for (const sent of uploaded) {
      const response = await upload(sent, PNG);
      expect(response.status, `${sent}: ${JSON.stringify(response.body)}`).toBe(200);
      expect(response.body.attachment.filename, sent).toMatch(/^[^/\\<>:"|?*]+\.png$/);
    }
    expect((await upload("....png", PNG)).status).toBe(415);

    // However it got in, a name is safe to send back in a header.
    for (const row of app.ctx.sqlite.prepare("SELECT id FROM attachments").all() as Array<{ id: string }>) {
      const served = await app.app.inject({ method: "GET", url: `/api/attachments/${row.id}`, headers: { host: "localhost" } });
      expect(served.statusCode).toBe(200);
      expect(String(served.headers["content-disposition"])).toMatch(
        /^inline; filename="[\x20-\x21\x23-\x5b\x5d-\x7e]*"; filename\*=UTF-8''[\w%.~!-]+$/,
      );
    }
    // Whatever the name, every file is inside the attachments folder, three levels down.
    expect(storedFiles()).toHaveLength(cleaned.length + uploaded.length);
    for (const file of storedFiles()) {
      expect(file.split(path.sep)).toHaveLength(3);
      expect(file.split(path.sep)).not.toContain("..");
      expect(path.resolve(attachmentsDir(), file).startsWith(attachmentsDir() + path.sep)).toBe(true);
    }
    expect(fs.existsSync(path.join(app.dir, "etc"))).toBe(false);
  });

  it("deletes an attachment only when no page uses it", async () => {
    const { attachment } = (await upload("photo.png", PNG)).body;
    const note = await createNote({ title: "Uses it", content: doc(image(attachment.id, "A photo")) });
    const copy = (await app.api("POST", `/api/notes/${note.id}/duplicate`)).body.note;

    const refused = await app.api("DELETE", `/api/attachments/${attachment.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/still used on a page/);
    expect(refused.body.error.details.noteIds.sort()).toEqual([note.id, copy.id].sort());

    // Removed from one page, but the duplicate still shows it.
    await app.api("PATCH", `/api/notes/${note.id}`, { content: doc(p(text("no picture now"))) });
    expect((await app.api("DELETE", `/api/attachments/${attachment.id}`)).status).toBe(409);
    // A page in the trash can come back, so it counts too.
    await app.api("DELETE", `/api/notes/${copy.id}`);
    expect((await app.api("DELETE", `/api/attachments/${attachment.id}`)).status).toBe(409);

    await app.api("POST", `/api/notes/${copy.id}/restore`);
    await app.api("PATCH", `/api/notes/${copy.id}`, { content: doc(p(text("gone here too"))) });
    expect((await app.api("DELETE", `/api/attachments/${attachment.id}`)).body).toEqual({ ok: true });
    expect((await app.api("GET", attachment.url)).status).toBe(404);
    expect(storedFiles()).toEqual([]);
    expect((await app.api("DELETE", `/api/attachments/${attachment.id}`)).status).toBe(404);
  });

  it("uses a picture as a page cover", async () => {
    const picture = (await upload("cover.png", PNG)).body.attachment;
    const textFile = (await upload("notes.txt", Buffer.from("text"))).body.attachment;
    const note = await createNote({ title: "Covered" });

    const saved = await app.api("PATCH", `/api/notes/${note.id}`, { coverAttachmentId: picture.id });
    expect(saved.body.note).toMatchObject({ coverAttachmentId: picture.id, coverUrl: picture.url });
    expect((await app.api("GET", `/api/notes/${note.id}`)).body.note.coverUrl).toBe(picture.url);
    // In use as a cover: not deletable.
    expect((await app.api("DELETE", `/api/attachments/${picture.id}`)).status).toBe(409);

    expect((await app.api("PATCH", `/api/notes/${note.id}`, { coverAttachmentId: textFile.id })).status).toBe(400);
    expect((await app.api("PATCH", `/api/notes/${note.id}`, { coverAttachmentId: "01hxnothere" })).status).toBe(400);
    const cleared = await app.api("PATCH", `/api/notes/${note.id}`, { coverAttachmentId: null });
    expect(cleared.body.note).toMatchObject({ coverAttachmentId: null, coverUrl: null });
    expect((await app.api("DELETE", `/api/attachments/${picture.id}`)).status).toBe(200);
  });

  it("copies files from disk for importers, with the same checks", async () => {
    const { notes } = app.ctx.services;
    const source = path.join(app.dir, "import");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "map.png"), PNG);
    fs.writeFileSync(path.join(source, "page.html"), HTML);
    const note = await createNote({ title: "Imported" });

    const attachment = await notes.createAttachmentFromFile({
      sourcePath: path.join(source, "map.png"),
      filename: "Untitled 1/../map.png",
      noteId: note.id,
    });
    expect(attachment).toMatchObject({ filename: "Untitled 1 .. map.png", mime: "image/png", noteId: note.id, sizeBytes: PNG.length });
    expect((await app.api("GET", attachment.url)).status).toBe(200);
    // The source is copied, never moved.
    expect(fs.readFileSync(path.join(source, "map.png"))).toEqual(PNG);

    await expect(
      notes.createAttachmentFromFile({ sourcePath: path.join(source, "page.html"), filename: "page.html" }),
    ).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      notes.createAttachmentFromFile({ sourcePath: path.join(source, "page.html"), filename: "page.png" }),
    ).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      notes.createAttachmentFromFile({ sourcePath: path.join(source, "missing.png"), filename: "missing.png" }),
    ).rejects.toMatchObject({ code: "bad_request" });
    await expect(notes.createAttachmentFromFile({ sourcePath: source, filename: "folder.png" })).rejects.toMatchObject({
      code: "bad_request",
    });
    await expect(
      notes.createAttachmentFromFile({ sourcePath: path.join(source, "map.png"), filename: "map.png", noteId: "01hxnothere" }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(storedFiles()).toHaveLength(1);
  });
});

describe("Markdown export", () => {
  it("exports one page as a Markdown download", async () => {
    const other = await createNote({ title: "Kit list" });
    const note = await createNote({
      title: "Río/Trip: plan?",
      content: doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Day 1")] },
        p(text("Walk to the "), text("hut", [{ type: "bold" }]), text(". Pack from "), pageLink(other.id, "Kit list"), text(".")),
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(text("Book the hut"))] }] },
      ),
    });
    const response = await app.app.inject({ method: "GET", url: `/api/notes/${note.id}/export.md`, headers: { host: "localhost" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="R_o Trip plan.md"; filename*=UTF-8''R%C3%ADo%20Trip%20plan.md`,
    );
    expect(response.body).toBe(
      `# Río/Trip: plan?\n\n## Day 1\n\nWalk to the **hut**. Pack from [Kit list](/notes/${other.id}).\n\n- [x] Book the hut\n`,
    );

    const untitled = await createNote();
    const empty = await app.app.inject({ method: "GET", url: `/api/notes/${untitled.id}/export.md`, headers: { host: "localhost" } });
    expect(empty.body).toBe("# Untitled\n");
    expect(String(empty.headers["content-disposition"])).toContain('filename="Untitled.md"');
    expect((await app.api("GET", "/api/notes/01hxnothere/export.md")).status).toBe(404);
  });

  it("exports the workspace as a zip that mirrors the tree, with links that work offline", async () => {
    const photo = (await upload("Summit photo.png", PNG)).body.attachment;
    const sameName = (await upload("Summit photo.png", JPEG.length ? PNG : PNG)).body.attachment;
    const gpx = (await upload("route.gpx", GPX)).body.attachment;
    const unused = (await upload("unused.png", PNG)).body.attachment;

    const trips = await createNote({ title: "Trips" });
    const alps = await createNote({ title: "Alps 2026", parentId: trips.id });
    const day = await createNote({ title: "Day 1: Hut & pass", parentId: alps.id });
    const kit = await createNote({ title: "Kit list" });
    const twin = await createNote({ title: "kit LIST" });
    const untitled = await createNote();
    const hostile = await createNote({ title: "../../escape" });
    const trashed = await createNote({ title: "Trashed", parentId: trips.id });
    await app.api("DELETE", `/api/notes/${trashed.id}`);
    const template = await createNote({ title: "My template", content: doc(p(text("Template body"))) });
    await app.api("PATCH", `/api/notes/${template.id}`, { isTemplate: true });

    await app.api("PATCH", `/api/notes/${day.id}`, {
      content: doc(
        p(
          text("Up: "),
          pageLink(alps.id, "Alps"),
          text(", top: "),
          pageLink(trips.id, "Trips"),
          text(", across: "),
          pageLink(kit.id, "Kit"),
          text(", gone: "),
          pageLink(trashed.id, "Trashed"),
          text("."),
        ),
        p(
          text("typed link", [{ type: "link", attrs: { href: `/notes/${twin.id}` } }]),
          text(" and "),
          text("the track", [{ type: "link", attrs: { href: gpx.url } }]),
          text(" and "),
          text("the web", [{ type: "link", attrs: { href: "https://example.com" } }]),
        ),
        image(photo.id, "On the summit"),
        image(sameName.id, "Same name, other file"),
        { type: "image", attrs: { src: "https://example.com/remote.png", alt: "Remote", title: null } },
      ),
    });
    await app.api("PATCH", `/api/notes/${kit.id}`, {
      content: doc(p(text("Down: "), pageLink(day.id, "Day 1")), image(photo.id, "Again")),
    });

    const response = await app.app.inject({ method: "GET", url: "/api/notes/export.zip", headers: { host: "localhost" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/zip");
    expect(String(response.headers["content-disposition"])).toMatch(/^attachment; filename="outpost-notes-\d{4}-\d{2}-\d{2}\.zip"/);

    const zip = await readZip(response.rawPayload);
    expect([...zip.keys()].sort()).toEqual(
      [
        "Trips.md",
        "Trips/Alps 2026.md",
        "Trips/Alps 2026/Day 1 Hut & pass.md",
        "Kit list.md",
        "kit LIST 2.md",
        "Untitled.md",
        "escape.md",
        "_templates/My template.md",
        "_attachments/Summit photo.png",
        "_attachments/Summit photo 2.png",
        "_attachments/route.gpx",
      ].sort(),
    );
    // No entry can land outside the folder it is unpacked into.
    for (const name of zip.keys()) {
      expect(name.startsWith("/") || name.split("/").includes("..") || name.includes("\\")).toBe(false);
    }
    expect(untitled.title).toBe("");
    expect(hostile.title).toBe("../../escape");
    expect(unused.id).toBeTruthy();

    const dayMarkdown = zip.get("Trips/Alps 2026/Day 1 Hut & pass.md")!.toString("utf8");
    expect(dayMarkdown).toBe(
      [
        "# Day 1: Hut & pass",
        "",
        `Up: [Alps](../Alps%202026.md), top: [Trips](../../Trips.md), across: [Kit](../../Kit%20list.md), gone: [Trashed](/notes/${trashed.id}).`,
        "",
        "[typed link](../../kit%20LIST%202.md) and [the track](../../_attachments/route.gpx) and [the web](https://example.com)",
        "",
        "![On the summit](../../_attachments/Summit%20photo.png)",
        "",
        "![Same name, other file](../../_attachments/Summit%20photo%202.png)",
        "",
        "![Remote](https://example.com/remote.png)",
        "",
      ].join("\n"),
    );
    expect(zip.get("Kit list.md")!.toString("utf8")).toBe(
      "# Kit list\n\nDown: [Day 1](Trips/Alps%202026/Day%201%20Hut%20%26%20pass.md)\n\n![Again](_attachments/Summit%20photo.png)\n",
    );
    expect(zip.get("Trips.md")!.toString("utf8")).toBe("# Trips\n");
    expect(zip.get("_templates/My template.md")!.toString("utf8")).toBe("# My template\n\nTemplate body\n");
    expect(zip.get("_attachments/Summit photo.png")!.equals(PNG)).toBe(true);
    expect(zip.get("_attachments/route.gpx")!.equals(GPX)).toBe(true);

    // Every relative link in the export points at a file that is in the export.
    for (const [name, content] of zip) {
      if (!name.endsWith(".md")) continue;
      for (const match of content.toString("utf8").matchAll(/\]\(([^)]+)\)/g)) {
        const target = match[1]!;
        if (/^(https?:|\/notes\/)/.test(target)) continue;
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), decodeURIComponent(target)));
        expect(zip.has(resolved), `${name} → ${target}`).toBe(true);
      }
    }
  });

  it("exports an empty workspace and a large one", async () => {
    const empty = await app.app.inject({ method: "GET", url: "/api/notes/export.zip", headers: { host: "localhost" } });
    expect(empty.statusCode).toBe(200);
    expect((await readZip(empty.rawPayload)).size).toBe(0);

    const { notes } = app.ctx.services;
    const folders = Array.from({ length: 10 }, (_, index) => notes.create({ title: `Folder ${index}` }));
    for (let index = 0; index < 600; index += 1) {
      notes.create({
        title: `Page ${index}`,
        parentId: folders[index % 10]!.id,
        content: doc(p(text(`Body of page ${index}. `.repeat(20)))),
      });
    }
    const started = Date.now();
    const treeResponse = await app.api("GET", "/api/notes/tree");
    expect(treeResponse.body.notes).toHaveLength(610);
    expect(Date.now() - started).toBeLessThan(500);

    const response = await app.app.inject({ method: "GET", url: "/api/notes/export.zip", headers: { host: "localhost" } });
    const zip = await readZip(response.rawPayload);
    expect(zip.size).toBe(610);
    expect(zip.get("Folder 3/Page 13.md")!.toString("utf8")).toMatch(/^# Page 13\n\nBody of page 13\./);
  });

  it("plans paths without collisions, whatever the titles", () => {
    const paths = planPaths([
      { id: "a", parentId: null, title: "Notes", isTemplate: 0 },
      { id: "b", parentId: null, title: "notes", isTemplate: 0 },
      { id: "c", parentId: null, title: "Notes.md", isTemplate: 0 },
      { id: "d", parentId: null, title: "_attachments", isTemplate: 0 },
      { id: "e", parentId: null, title: "   ", isTemplate: 0 },
      { id: "f", parentId: null, title: 'a/b\\c:d*e?f"g<h>i|j', isTemplate: 0 },
      { id: "g", parentId: "a", title: "..", isTemplate: 0 },
      { id: "h", parentId: "g", title: "Deep", isTemplate: 0 },
      { id: "i", parentId: "missing-parent", title: "Orphan", isTemplate: 0 },
      { id: "j", parentId: "a", title: "Tpl", isTemplate: 1 },
    ]);
    expect(Object.fromEntries(paths)).toEqual({
      a: "Notes.md",
      b: "notes 2.md",
      c: "Notes.md 2.md",
      d: "_attachments 2.md",
      e: "Untitled.md",
      f: "a b c d e f g h i j.md",
      g: "Notes/Untitled.md",
      h: "Notes/Untitled/Deep.md",
      i: "Orphan.md",
      j: "_templates/Tpl.md",
    });
    const lower = [...paths.values()].map((file) => file.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);

    expect(relativeLink("A/B/page.md", "A/other page.md")).toBe("../other%20page.md");
    expect(relativeLink("page.md", "_attachments/a#b (1).png")).toBe("_attachments/a%23b%20(1).png");
    expect(relativeLink("A/page.md", "A/page.md")).toBe("page.md");

    const unique = createNamer(["taken"]);
    expect([unique("taken"), unique("Taken"), unique("free", ".md"), unique("FREE", ".md")]).toEqual([
      "taken 2",
      "Taken 3",
      "free",
      "FREE 2",
    ]);
  });
});
