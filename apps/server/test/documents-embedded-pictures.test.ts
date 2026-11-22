import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pictureIndex, pictureLines, pictureTypeOf, readPicture, withoutPictureData } from "../src/modules/documents/embedded-pictures.ts";
import { markdownSections } from "../src/modules/documents/extract-text.ts";
import { markdownBlocks, readMarkdownDocument } from "../src/modules/documents/markdown-view.ts";
import { savedFromOf, savedPageFrontMatter } from "../src/modules/documents/saved-page.ts";
import { png } from "./fixtures/webpages/pages.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";
import { threadMs } from "./thread-time.ts";

const dirs: string[] = [];
let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fileWith(content: string | Buffer): string {
  const dir = tempDir("outpost-pictures-");
  dirs.push(dir);
  const file = path.join(dir, "page.md");
  fs.writeFileSync(file, content);
  return file;
}

const boat = png(120, 80);
const hill = png(60, 40, 3000);
const text =
  "# A day out\n\nWe took the boat.\n\n![A boat on the lake][outpost-picture-1]\n\nThen the hill.\n\n![The hill][outpost-picture-2]\n";

describe("pictures carried inside a Markdown file", () => {
  it("are written as closing lines, found again by their place, and read back as the same bytes", async () => {
    const lines = pictureLines([
      { mime: "image/png", bytes: boat },
      { mime: "image/png", bytes: hill },
    ]);
    expect(lines.split("\n").filter(Boolean)).toHaveLength(2);
    const file = fileWith(text + lines);

    const index = await pictureIndex(file);
    expect(index.textBytes).toBe(Buffer.byteLength(text) + 1);
    expect([...index.pictures.keys()].sort()).toEqual([1, 2]);
    expect(await readPicture(file, 1)).toEqual({ mime: "image/png", bytes: boat });
    expect((await readPicture(file, 2)).bytes.equals(hill)).toBe(true);
    await expect(readPicture(file, 3)).rejects.toThrow(/no such picture/);

    const shown = await readMarkdownDocument(file);
    expect(shown.blocks).toEqual([
      { t: "heading", depth: 1, id: "a-day-out", c: [{ t: "text", v: "A day out" }] },
      { t: "paragraph", c: [{ t: "text", v: "We took the boat." }] },
      { t: "paragraph", c: [{ t: "image", alt: "A boat on the lake", picture: 1 }] },
      { t: "paragraph", c: [{ t: "text", v: "Then the hill." }] },
      { t: "paragraph", c: [{ t: "image", alt: "The hill", picture: 2 }] },
    ]);
    expect(shown.savedFrom).toBeUndefined();
  });

  it("are left out of what the parser and the search index are given", () => {
    const whole = text + pictureLines([{ mime: "image/png", bytes: boat }]);
    const cut = withoutPictureData(whole);
    expect(cut).not.toContain("base64");
    expect(cut).toContain("[outpost-picture-1]: #");
    // A file with no pictures is handed back as it is.
    expect(withoutPictureData("# Plain\n\nText.\n")).toBe("# Plain\n\nText.\n");

    // Only the start of a large file is read for search; a last line cut short is still a picture's.
    const truncated = whole.slice(0, whole.length - 40);
    expect(withoutPictureData(truncated)).not.toContain("base64");

    const sections = markdownSections(cut).sections;
    expect(JSON.stringify(sections)).toContain("A boat on the lake");
    expect(JSON.stringify(sections)).not.toMatch(/outpost-picture|iVBOR/);
  });

  it("names a picture only when the file really carries it", () => {
    const run = (source: string, pictures?: Set<number>) => JSON.stringify(markdownBlocks(source, { pictures }));
    // A label with nothing behind it is a description, as any picture is.
    expect(run("![A boat][outpost-picture-1]\n")).toContain('{"t":"image","alt":"A boat"}');
    expect(run("![A boat][outpost-picture-1]\n", new Set([2]))).toContain('{"t":"image","alt":"A boat"}');
    expect(run("![A boat][outpost-picture-1]\n", new Set([1]))).toContain('{"t":"image","alt":"A boat","picture":1}');
    // A picture written the ordinary way is never fetched or shown, whatever it points at.
    expect(run("![A boat](https://example.org/boat.png)\n", new Set([1]))).toContain('{"t":"image","alt":"A boat"}');
    expect(run(`![A boat](data:image/png;base64,${boat.toString("base64")})\n`, new Set([1]))).toContain('{"t":"image","alt":"A boat"}');
    // The label is exact.
    expect(run("![A boat][outpost-picture-01]\n\n[outpost-picture-01]: #\n", new Set([1]))).toContain('{"t":"image","alt":"A boat"}');
  });

  it("counts only the closing run of lines, so a look-alike in the middle of a file is text", async () => {
    const example = "[outpost-picture-7]: data:image/png;base64,AAAA";
    const file = fileWith(
      `# How it works\n\n\`\`\`\n${example}\n\`\`\`\n\nAnd more text after it.\n${pictureLines([{ mime: "image/png", bytes: boat }])}`,
    );
    const index = await pictureIndex(file);
    expect([...index.pictures.keys()]).toEqual([1]);
    const shown = await readMarkdownDocument(file);
    expect(shown.blocks).toContainEqual({ t: "code", v: example });

    const none = fileWith(`Some text.\n\n${example}\n\nText comes after it, so it is not a picture.\n`);
    expect((await pictureIndex(none)).pictures.size).toBe(0);
    expect((await pictureIndex(none)).textBytes).toBe(fs.statSync(none).size);
  });

  it("will not serve what is not a picture, whatever the line calls it", async () => {
    const script = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    const file = fileWith(
      [
        "![One][outpost-picture-1] ![Two][outpost-picture-2] ![Three][outpost-picture-3] ![Four][outpost-picture-4]",
        "",
        `[outpost-picture-1]: data:image/png;base64,${script.toString("base64")}`,
        `[outpost-picture-2]: data:image/jpeg;base64,${html.toString("base64")}`,
        "[outpost-picture-3]: data:image/png;base64,!!!not-base64!!!",
        // Called a JPEG, and really a PNG: it is sent as what it is.
        `[outpost-picture-4]: data:image/jpeg;base64,${boat.toString("base64")}`,
        "",
      ].join("\n"),
    );
    for (const number of [1, 2, 3]) await expect(readPicture(file, number)).rejects.toThrow(/no such picture/);
    expect(await readPicture(file, 4)).toEqual({ mime: "image/png", bytes: boat });
    // Types that are never kept do not make a picture line at all.
    for (const type of ["image/svg+xml", "text/html", "image/bmp", "application/octet-stream"]) {
      const stray = fileWith(`![Five][outpost-picture-5]\n\n[outpost-picture-5]: data:${type};base64,${script.toString("base64")}\n`);
      expect((await pictureIndex(stray)).pictures.size, type).toBe(0);
    }
    expect(pictureTypeOf(script)).toBeUndefined();
    expect(pictureTypeOf(boat)).toBe("image/png");
  });

  it("reads a file saved with Windows line endings, and one with blank lines among its pictures", async () => {
    const lines = pictureLines([
      { mime: "image/png", bytes: boat },
      { mime: "image/png", bytes: hill },
    ]);
    const windows = fileWith((text + lines).replace(/\n/g, "\r\n"));
    expect((await readPicture(windows, 1)).bytes.equals(boat)).toBe(true);
    expect((await readPicture(windows, 2)).bytes.equals(hill)).toBe(true);
    const spaced = fileWith(`${text}${lines.replace(/\n\[/g, "\n\n[")}\n\n`);
    expect((await readPicture(spaced, 2)).bytes.equals(hill)).toBe(true);
    expect((await readMarkdownDocument(spaced)).blocks).toHaveLength(5);
  });

  it("is not slowed by a file that ends in a great many empty lines", async () => {
    const file = fileWith(`${text}${"\n".repeat(2_000_000)}`);
    const started = threadMs();
    const index = await pictureIndex(file);
    expect(index.pictures.size).toBe(0);
    // Working time, not the clock, which runs on while a busy machine runs other things.
    expect(threadMs() - started).toBeLessThan(3000);
  });

  it("shows the pictures of a Markdown file a person uploads, through the same checked route", async () => {
    app = await createTestApp();
    const source = path.join(app.dir, "day-out.md");
    fs.writeFileSync(source, text + pictureLines([{ mime: "image/png", bytes: boat }]));
    const { document } = await app.ctx.services.documents.ingestFile({ sourcePath: source, originalName: "day-out.md" });
    const shown = (await app.api("GET", `/api/documents/${document.id}/markdown`)).body;
    expect(JSON.stringify(shown.blocks)).toContain('{"t":"image","alt":"A boat on the lake","picture":1}');
    // The second label has no picture behind it.
    expect(JSON.stringify(shown.blocks)).toContain('{"t":"image","alt":"The hill"}');
    const served = await app.app.inject({ method: "GET", url: `/api/documents/${document.id}/pictures/1`, headers: { host: "localhost" } });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.rawPayload.equals(boat)).toBe(true);

    // A document that is not Markdown has no pictures to ask for.
    const other = path.join(app.dir, "photo.png");
    fs.writeFileSync(other, boat);
    const image = await app.ctx.services.documents.ingestFile({ sourcePath: other, originalName: "photo.png" });
    const refused = await app.app.inject({
      method: "GET",
      url: `/api/documents/${image.document.id}/pictures/1`,
      headers: { host: "localhost" },
    });
    expect(refused.statusCode).toBe(404);
  });
});

describe("the record a saved page carries", () => {
  it("survives titles with quotation marks, colons and line breaks", () => {
    const front = savedPageFrontMatter({
      title: 'He said "no": a\nstory --- of sorts',
      author: "O'Brien, Flann",
      site: "The Example: Times",
      savedFrom: "https://example.org/a?b=1&c=2",
      savedAt: Date.UTC(2026, 10, 16, 12, 0, 0),
    });
    expect(front).toBe(
      '---\ntitle: "He said \\"no\\": a story --- of sorts"\nauthor: "O\'Brien, Flann"\nsite: "The Example: Times"\nsaved-from: "https://example.org/a?b=1&c=2"\nsaved-at: "2026-11-16T12:00:00.000Z"\n---\n',
    );
    expect(savedFromOf(`${front}\n# Text\n`)).toEqual({
      url: "https://example.org/a?b=1&c=2",
      savedAt: Date.UTC(2026, 10, 16, 12, 0, 0),
      site: "The Example: Times",
    });
  });

  it("is believed only when it gives a web address and a date", () => {
    const at = 'saved-at: "2026-11-16T12:00:00.000Z"';
    expect(savedFromOf(`---\nsaved-from: "javascript:alert(1)"\n${at}\n---\n`)).toBeUndefined();
    expect(savedFromOf(`---\nsaved-from: "file:///etc/passwd"\n${at}\n---\n`)).toBeUndefined();
    expect(savedFromOf(`---\nsaved-from: "https://user:secret@example.org/"\n${at}\n---\n`)).toBeUndefined();
    expect(savedFromOf(`---\nsaved-from: "/library/documents/abc"\n${at}\n---\n`)).toBeUndefined();
    expect(savedFromOf('---\nsaved-from: "https://example.org/"\nsaved-at: "soon"\n---\n')).toBeUndefined();
    expect(savedFromOf('---\nsaved-from: "https://example.org/"\n---\n')).toBeUndefined();
    expect(savedFromOf(`Text first.\n\n---\nsaved-from: "https://example.org/"\n${at}\n---\n`)).toBeUndefined();
    // Written without quotation marks, as a person might by hand, it is still read.
    expect(savedFromOf("---\nsaved-from: https://example.org/page\nsaved-at: 2026-11-16\n---\n")).toEqual({
      url: "https://example.org/page",
      savedAt: Date.UTC(2026, 10, 16),
    });
  });
});
