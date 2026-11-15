import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_FORMATTED_BYTES, markdownBlocks, safeHref } from "../src/modules/documents/markdown-view.ts";
import { multipart, type UploadFile } from "./fixtures/documents/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

describe("a Markdown file as blocks", () => {
  it("keeps bold, italic, code and links inside a paragraph", () => {
    expect(markdownBlocks("Boil **it** for *one* minute with `a lid` on. See [the WHO](https://www.who.int/water) for ~~more~~.")).toEqual([
      {
        t: "paragraph",
        c: [
          { t: "text", v: "Boil " },
          { t: "strong", c: [{ t: "text", v: "it" }] },
          { t: "text", v: " for " },
          { t: "em", c: [{ t: "text", v: "one" }] },
          { t: "text", v: " minute with " },
          { t: "code", v: "a lid" },
          { t: "text", v: " on. See " },
          { t: "link", href: "https://www.who.int/water", c: [{ t: "text", v: "the WHO" }] },
          { t: "text", v: " for " },
          { t: "del", c: [{ t: "text", v: "more" }] },
          { t: "text", v: "." },
        ],
      },
    ]);
  });

  it("links a bare web address and a reference-style link", () => {
    const [bare, reference] = markdownBlocks(
      "Read https://example.org/guide today.\n\nSee [the plan][bp].\n\n[bp]: https://example.org/band-plan",
    );
    expect(bare).toMatchObject({ c: [{ t: "text" }, { t: "link", href: "https://example.org/guide" }, { t: "text" }] });
    expect(reference).toMatchObject({ c: [{ t: "text" }, { t: "link", href: "https://example.org/band-plan" }, { t: "text" }] });
  });

  it("keeps the words of a link it will not follow, and drops the address", () => {
    const flat = JSON.stringify(
      markdownBlocks(
        "[run](javascript:alert(1)) [file](file:///etc/passwd) [data](data:text/html,x) [page](other.md) [top](#top) [call](tel:999)",
      ),
    );
    expect(flat).not.toContain('"link"');
    expect(flat).not.toMatch(/javascript:|file:|data:text|other\.md|#top|tel:/);
    for (const word of ["run", "file", "data", "page", "top", "call"]) expect(flat).toContain(word);
  });

  it("accepts only web and mail addresses as links", () => {
    expect(safeHref("https://example.org/a b")).toBe("https://example.org/a%20b");
    expect(safeHref("HTTP://example.org")).toBe("http://example.org/");
    expect(safeHref("mailto:someone@example.org")).toBe("mailto:someone@example.org");
    for (const refused of [
      "javascript:alert(1)",
      " javascript:alert(1)",
      "//example.org",
      "/api/documents",
      "ftp://example.org",
      "https://",
      "",
    ]) {
      expect(safeHref(refused), refused).toBeNull();
    }
  });

  it("reduces embedded HTML and pictures to their words", () => {
    const flat = JSON.stringify(
      markdownBlocks(
        '<script>stolenword()</script>\n\n<div onclick="x()">Shown <b>words</b></div>\n\nA <img src="https://tracker.example/p.gif" onerror="x()"> picture: ![a stove](https://example.org/stove.jpg)',
      ),
    );
    expect(flat).not.toMatch(/stolenword|onclick|onerror|tracker\.example|stove\.jpg|<|>/);
    expect(flat).toContain("Shown");
    expect(flat).toContain("a stove");
  });

  it("reads headings, lists, task lists, quotes, code and rules", () => {
    const blocks = markdownBlocks(
      [
        "# Stoves",
        "",
        "3. Fill",
        "4. Light",
        "",
        "- [x] Jet",
        "- [ ] Pump",
        "  - Seal",
        "",
        "> Keep **dry**.",
        "",
        "```sh",
        "echo hi",
        "```",
        "",
        "---",
      ].join("\n"),
    );
    expect(blocks.map((block) => block.t)).toEqual(["heading", "list", "list", "quote", "code", "rule"]);
    expect(blocks[0]).toEqual({ t: "heading", depth: 1, c: [{ t: "text", v: "Stoves" }] });
    expect(blocks[1]).toMatchObject({ ordered: true, start: 3, items: [{ c: [{ t: "paragraph" }] }, {}] });
    expect(blocks[2]).toMatchObject({
      ordered: false,
      items: [{ checked: true }, { checked: false, c: [{ t: "paragraph" }, { t: "list", items: [{ c: [{ c: [{ v: "Seal" }] }] }] }] }],
    });
    expect(blocks[3]).toMatchObject({ c: [{ t: "paragraph", c: [{ t: "text", v: "Keep " }, { t: "strong" }, { t: "text", v: "." }] }] });
    expect(blocks[4]).toEqual({ t: "code", v: "echo hi" });
  });

  it("reads a table with formatting in its cells, every row the same width", () => {
    const [table] = markdownBlocks("| Band | Use |\n| --- | --- |\n| **2 m** | [Calling](https://example.org/2m) |\n| 70 cm |\n");
    expect(table).toMatchObject({
      t: "table",
      rows: [
        [[{ t: "text", v: "Band" }], [{ t: "text", v: "Use" }]],
        [[{ t: "strong" }], [{ t: "link", href: "https://example.org/2m" }]],
        [[{ t: "text", v: "70 cm" }], []],
      ],
    });
  });

  it("leaves front matter out and survives very deep nesting", () => {
    expect(markdownBlocks("---\ntitle: Camp kitchen\n---\nText.")).toEqual([{ t: "paragraph", c: [{ t: "text", v: "Text." }] }]);
    const deep = markdownBlocks(`${"> ".repeat(200)}the bottom`);
    expect(JSON.stringify(deep)).toContain("the bottom");
    let depth = 0;
    for (let block = deep[0]; block?.t === "quote"; block = block.c[0]) depth += 1;
    expect(depth).toBeLessThanOrEqual(16);
  });
});

describe("GET /api/documents/:id/markdown", () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(async () => {
    await app?.ctx.jobs.whenIdle();
    await app?.close();
  });

  async function add(file: UploadFile) {
    const { payload, headers } = multipart({}, [file]);
    const { body } = await app.api("POST", "/api/documents", payload, { headers });
    expect(body.results[0], JSON.stringify(body.results[0])).toMatchObject({ status: "created" });
    await app.ctx.jobs.whenIdle();
    return body.results[0].document as { id: string; relPath: string };
  }
  const fileOf = (document: { relPath: string }) => path.join(app.ctx.services.storage.getDefault().path, document.relPath);

  it("returns the blocks of a Markdown document", async () => {
    const document = await add({ name: "water.md", content: "# Water\n\nBoil **it**. [WHO](https://www.who.int/)\n" });
    const { status, body } = await app.api("GET", `/api/documents/${document.id}/markdown`);
    expect(status).toBe(200);
    expect(body.documentId).toBe(document.id);
    expect(body.blocks).toMatchObject([
      { t: "heading", depth: 1 },
      { t: "paragraph", c: [{ t: "text" }, { t: "strong" }, { t: "text" }, { t: "link", href: "https://www.who.int/" }] },
    ]);
  });

  it("refuses a document that is not Markdown, one that is too large, and one whose file has gone", async () => {
    const text = await add({ name: "notes.txt", content: "Plain words." });
    expect((await app.api("GET", `/api/documents/${text.id}/markdown`)).status).toBe(415);

    const markdown = await add({ name: "big.md", content: "# Big\n\nWords.\n" });
    fs.writeFileSync(fileOf(markdown), `# Big\n\n${"word ".repeat(MAX_FORMATTED_BYTES / 5 + 10)}`);
    const large = await app.api("GET", `/api/documents/${markdown.id}/markdown`);
    expect(large.status).toBe(413);
    expect(large.body.error.message).toMatch(/plain text/);

    fs.rmSync(fileOf(markdown));
    expect((await app.api("GET", `/api/documents/${markdown.id}/markdown`)).status).toBe(404);
    expect((await app.api("GET", "/api/documents/01nope/markdown")).status).toBe(404);
  });
});
