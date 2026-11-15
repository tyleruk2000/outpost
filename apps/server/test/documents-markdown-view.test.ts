import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { markdownSections } from "../src/modules/documents/extract-text.ts";
import { headingSlug, MAX_FORMATTED_BYTES, markdownBlocks, parseOutpostLink, safeHref } from "../src/modules/documents/markdown-view.ts";
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
    expect(blocks[0]).toEqual({ t: "heading", depth: 1, id: "stoves", c: [{ t: "text", v: "Stoves" }] });
    expect(blocks[1]).toMatchObject({ ordered: true, start: 3, items: [{ c: [{ t: "paragraph" }] }, {}] });
    expect(blocks[2]).toMatchObject({
      ordered: false,
      items: [{ checked: true }, { checked: false, c: [{ t: "paragraph" }, { t: "list", items: [{ c: [{ c: [{ v: "Seal" }] }] }] }] }],
    });
    expect(blocks[3]).toMatchObject({ c: [{ t: "paragraph", c: [{ t: "text", v: "Keep " }, { t: "strong" }, { t: "text", v: "." }] }] });
    expect(blocks[4]).toEqual({ t: "code", lang: "sh", v: "echo hi" });
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

describe("links that stay inside Outpost", () => {
  const known = new Map([
    [
      "logbook73.handbook",
      { name: "Radio Engineering Handbook", collectionId: "01COLLECTION", chapters: new Map([["decibels", "01DOCUMENT"]]) },
    ],
    ["logbook73.guide.g90", { name: "Xiegu G90 companion guide", collectionId: undefined, chapters: new Map<string, string>() }],
  ]);
  const asked: Array<[string, string | undefined]> = [];
  const resolve = (entryId: string, chapterKey?: string) => {
    asked.push([entryId, chapterKey]);
    const entry = known.get(entryId);
    if (!entry) return undefined;
    return {
      entryId,
      entryName: entry.name,
      collectionId: entry.collectionId,
      documentId: chapterKey ? entry.chapters.get(chapterKey) : undefined,
    };
  };
  const first = (source: string) => {
    const [block] = markdownBlocks(source, { resolve });
    return block?.t === "paragraph" ? block.c : [];
  };

  it("become a reference carrying only what the server looked up", () => {
    expect(first("See [Decibels](outpost:entry/logbook73.handbook/decibels#the-3-db-rule).")).toEqual([
      { t: "text", v: "See " },
      {
        t: "ref",
        entryId: "logbook73.handbook",
        entryName: "Radio Engineering Handbook",
        collectionId: "01COLLECTION",
        documentId: "01DOCUMENT",
        anchor: "the-3-db-rule",
        c: [{ t: "text", v: "Decibels" }],
      },
      { t: "text", v: "." },
    ]);
    // The book itself, a chapter it does not have, and a book that is not in the library.
    expect(first("[The handbook](outpost:entry/logbook73.handbook)")).toEqual([
      {
        t: "ref",
        entryId: "logbook73.handbook",
        entryName: "Radio Engineering Handbook",
        collectionId: "01COLLECTION",
        c: [{ t: "text", v: "The handbook" }],
      },
    ]);
    expect(first("[Gone](outpost:entry/logbook73.handbook/no-such-chapter#heading)")).toEqual([
      {
        t: "ref",
        entryId: "logbook73.handbook",
        entryName: "Radio Engineering Handbook",
        collectionId: "01COLLECTION",
        c: [{ t: "text", v: "Gone" }],
      },
    ]);
    expect(first("[Menus](outpost:entry/logbook73.guide.g90/menu-reference)")).toEqual([
      { t: "ref", entryId: "logbook73.guide.g90", entryName: "Xiegu G90 companion guide", c: [{ t: "text", v: "Menus" }] },
    ]);
    // A link with no words of its own is named after what it leads to.
    expect(first("[](outpost:entry/logbook73.handbook)")).toMatchObject([
      { t: "ref", c: [{ t: "text", v: "Radio Engineering Handbook" }] },
    ]);
  });

  it("are plain words when the catalogue has no such entry, or when nothing can look it up", () => {
    expect(first("[Elsewhere](outpost:entry/not.in.the.catalogue/chapter)")).toEqual([{ t: "text", v: "Elsewhere" }]);
    expect(markdownBlocks("[Decibels](outpost:entry/logbook73.handbook/decibels)")).toEqual([
      { t: "paragraph", c: [{ t: "text", v: "Decibels" }] },
    ]);
  });

  it("refuse anything that is not exactly an entry, a chapter and a heading", () => {
    asked.length = 0;
    const hostile = [
      "outpost:entry/../../api/system",
      "outpost:entry/logbook73.handbook/../../../settings",
      "outpost:entry/logbook73.handbook/decibels/extra",
      "outpost:entry/logbook73.handbook/decibels?download=1",
      "outpost:entry/logbook73.handbook?next=//evil.example",
      "outpost:entry//decibels",
      "outpost:entry/",
      "outpost:entry",
      "outpost:",
      "outpost://evil.example/logbook73.handbook",
      "outpost:entry/https://evil.example",
      "outpost:entry/Logbook73.Handbook/decibels",
      "outpost:entry/logbook73.handbook/Decibels",
      "outpost:entry/logbook73.handbook/decibels%2F..%2Fx",
      "outpost:entry/logbook73.handbook/decibels#",
      "outpost:entry/logbook73.handbook/decibels#a%20b",
      'outpost:entry/logbook73.handbook/decibels#x"onclick=alert(1)',
      "outpost:entry/logbook73.handbook/decibels#<script>",
      "outpost:entry/logbook73.handbook/decibels#a#b",
      "outpost:entry/logbook73.handbook/decibels#a/b",
      "OUTPOST:entry/logbook73.handbook/decibels",
      "outpost:Entry/logbook73.handbook",
      "outpost:document/01DOCUMENT",
      "outpost:entry/logbook73.handbook\\decibels",
      `outpost:entry/${"a".repeat(121)}`,
      `outpost:entry/logbook73.handbook/${"a".repeat(81)}`,
      `outpost:entry/logbook73.handbook/decibels#${"a".repeat(201)}`,
      "/library/documents/01DOCUMENT",
      "//evil.example/library",
      "library/documents/01DOCUMENT",
      "javascript:location='/api/system'",
      "x-outpost:entry/logbook73.handbook",
    ];
    for (const url of hostile) {
      expect(parseOutpostLink(url), url).toBeNull();
      const flat = JSON.stringify(markdownBlocks(`[the words](<${url}>)`, { resolve }));
      expect(flat, url).not.toMatch(/"ref"|"link"|"jump"/);
      expect(flat, url).toContain("the words");
    }
    // None of them got as far as being looked up.
    expect(asked).toEqual([]);
    expect(parseOutpostLink("outpost:entry/logbook73.handbook/decibels#the-3-db-rule")).toEqual({
      entryId: "logbook73.handbook",
      chapterKey: "decibels",
      anchor: "the-3-db-rule",
    });
    expect(parseOutpostLink("outpost:entry/logbook73.guide.rt-950-pro")).toEqual({ entryId: "logbook73.guide.rt-950-pro" });
  });

  it("jump to a heading of the same document, and only to one that exists", () => {
    const blocks = markdownBlocks(
      [
        "[Down](#height-matters-usually-more) [Twice](#setup-1) [Nowhere](#no-such-heading) [Odd](#%E0%A4%A)",
        "",
        "## Setup",
        "",
        "## Height matters (usually more)",
        "",
        "> ## Setup",
        "",
        "## Transcript 1 — SOTA on 2 m FM, start to finish",
      ].join("\n"),
    );
    expect(blocks[0]).toMatchObject({
      c: [
        { t: "jump", to: "height-matters-usually-more", c: [{ t: "text", v: "Down" }] },
        { t: "text", v: " " },
        { t: "jump", to: "setup-1" },
        { t: "text", v: " Nowhere Odd" },
      ],
    });
    expect(blocks.slice(1)).toMatchObject([
      { t: "heading", id: "setup" },
      { t: "heading", id: "height-matters-usually-more" },
      // A repeated heading gets a number, as other Markdown tools give it, wherever it sits.
      { t: "quote", c: [{ t: "heading", id: "setup-1" }] },
      { t: "heading", id: "transcript-1--sota-on-2-m-fm-start-to-finish" },
    ]);
    expect(headingSlug("Decibels (dB, dBm, dBi)")).toBe("decibels-db-dbm-dbi");
    expect(headingSlug('<img src=x onerror="alert(1)">')).toBe("img-srcx-onerroralert1");
    expect(headingSlug("!!!")).toBe("");
  });
});

describe("what a Markdown file may ask the web app to draw", () => {
  it("keeps the word after a fence as a plain lower-case name, or not at all", () => {
    const blocks = markdownBlocks(
      [
        "```mermaid",
        "flowchart LR",
        '  A["Antenna"] --> B["Mixer"]',
        "```",
        "",
        "```Viz",
        '{"type":"wave"}',
        "```",
        "",
        '```"><script>alert(1)</script>',
        "x",
        "```",
        "",
        "```",
        "bare",
        "```",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      { t: "code", lang: "mermaid", v: 'flowchart LR\n  A["Antenna"] --> B["Mixer"]' },
      { t: "code", lang: "viz", v: '{"type":"wave"}' },
      { t: "code", v: "x" },
      { t: "code", v: "bare" },
    ]);
  });

  it("keeps a line break written as a tag, and a picture as its description", () => {
    const [table, picture] = markdownBlocks(
      [
        "| Key | Does |",
        "| --- | --- |",
        "| PTT | Transmit<br>Hold to talk<BR/>Release to listen |",
        "",
        '![Six antennas compared.](/handbook-figures/antennas.png "There is no best antenna.")',
      ].join("\n"),
    );
    expect(table).toMatchObject({
      rows: [
        [[{ v: "Key" }], [{ v: "Does" }]],
        [
          [{ v: "PTT" }],
          [
            { t: "text", v: "Transmit" },
            { t: "break" },
            { t: "text", v: "Hold to talk" },
            { t: "break" },
            { t: "text", v: "Release to listen" },
          ],
        ],
      ],
    });
    expect(picture).toEqual({ t: "paragraph", c: [{ t: "image", alt: "Six antennas compared.", caption: "There is no best antenna." }] });
    expect(JSON.stringify(picture)).not.toContain("handbook-figures");
  });

  it("searches a figure by its title and caption, and a diagram not at all", () => {
    const { sections } = markdownSections(
      [
        "# Modulation",
        "",
        "Amplitude modulation changes the carrier's strength.",
        "",
        "```mermaid",
        "flowchart LR",
        '  A["Microphone"] --> B["Modulator"]',
        "```",
        "",
        "```viz",
        '{ "type": "wave", "title": "An AM signal", "caption": "The envelope follows the audio.", "traces": [{ "kind": "am", "freq": 24 }] }',
        "```",
        "",
        "```viz",
        "{ not json",
        "```",
        "",
        "```sh",
        "rigctl -m 1",
        "```",
      ].join("\n"),
    );
    const text = sections.map((section) => section.text).join("\n");
    expect(text).toContain("Amplitude modulation changes the carrier's strength.");
    expect(text).toContain("An AM signal\nThe envelope follows the audio.");
    // Ordinary code is searched as written, and so is a figure that is not the JSON it claims to be.
    expect(text).toContain("rigctl -m 1");
    expect(text).toContain("{ not json");
    expect(text).not.toMatch(/flowchart|Microphone|-->|traces|"kind"/);
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
