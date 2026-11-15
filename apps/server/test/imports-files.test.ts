import type { ImportDto } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convertPage, parseFrontmatter, scanConstructs } from "../src/modules/imports/convert.ts";
import { rowPageMatcher, tableDoc, toTable, truncationNote } from "../src/modules/imports/database.ts";
import { allRowsTwinOf, naturalCompare, pathKey, pickIndexFile, splitNotionName } from "../src/modules/imports/names.ts";
import { analyse, buildPdf, buildZip, commit, findNote, tinyPng, titleTree, uploadImport } from "./fixtures/imports/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: page content is read loosely in tests
type Json = Record<string, any>;

let app: TestApp;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

const titles = (dto: ImportDto, kind: string) => dto.analysis!.items.filter((item) => item.kind === kind).map((item) => item.title);

function handbookZip(): Promise<Buffer> {
  return buildZip([
    {
      name: "handbook/README.md",
      content:
        '---\ntitle: "Field handbook"\ntags: [water, shelter]\n---\n\n# Field handbook\n\nStart with [water](chapters/2-water.md).\n',
    },
    {
      name: "handbook/chapters/1-shelter.md",
      content: "# Shelter\n\nBuild it before dark. Then see [water](2-water.md) and the [start](../README.md).\n",
    },
    {
      name: "handbook/chapters/2-water.md",
      content: "# Water\n\nBoil it. Go back to [shelter](1-shelter.md), or ask the [quartermaster](../people/quartermaster.md).\n",
    },
    {
      name: "handbook/chapters/10-fire.md",
      content: "Fire needs no heading.\n\n![Sketch](../pictures/fire.png)\n\n![Remote](https://example.org/fire.jpg)\n",
    },
    { name: "handbook/pictures/fire.png", content: tinyPng },
    { name: "handbook/pictures/unused.png", content: tinyPng },
    { name: "handbook/notes.txt", content: "First line\nsecond line\n\nA new paragraph.\n" },
    { name: "handbook/.obsidian/workspace.json", content: "{}" },
    { name: "__MACOSX/handbook/._README.md", content: "junk" },
  ]);
}

describe("a folder of Markdown files in a ZIP", () => {
  it("plans a page for the folder from its README, and a parent page only where structure needs one", async () => {
    const dto = await analyse(app, [{ name: "handbook.zip", content: await handbookZip() }]);
    const analysis = dto.analysis!;
    expect(analysis.source).toBe("mixed"); // Markdown and one plain text file
    expect(dto.kind).toBe("mixed");

    const item = (title: string) => analysis.items.find((entry) => entry.title === title)!;
    // The README is the folder's own page, titled from its front matter.
    expect(item("Field handbook")).toMatchObject({ kind: "page", parentPath: null, path: "handbook/README.md" });
    // "chapters" has no file of its own, so it becomes an empty parent page.
    expect(item("chapters")).toMatchObject({
      kind: "page",
      format: "folder",
      path: "handbook/chapters/",
      parentPath: "handbook/README.md",
    });
    expect(item("Shelter").parentPath).toBe("handbook/chapters/");
    // No heading and no front matter: the file name is the title.
    expect(item("10-fire")).toMatchObject({ kind: "page", parentPath: "handbook/chapters/" });
    expect(item("notes")).toMatchObject({ kind: "page", format: "text", parentPath: "handbook/README.md" });
    // A folder that only holds pictures is not a page.
    expect(analysis.items.some((entry) => entry.path === "handbook/pictures/")).toBe(false);

    expect(titles(dto, "attachment")).toEqual(["fire.png"]);
    expect(analysis.items.find((entry) => entry.path === "handbook/pictures/unused.png")).toMatchObject({
      kind: "skipped",
      reason: "No page in this import links to it or shows it.",
    });
    expect(analysis.totals).toMatchObject({ pages: 6, attachments: 1, skipped: 1, ignored: 2 });
    // Keys are stable for the same archive name and path, and are not the path itself.
    expect(item("Shelter").importKey).toBe(pathKey("handbook.zip", "handbook/chapters/1-shelter.md"));
    expect(item("Shelter").importKey).toMatch(/^path:[0-9a-f]{64}$/);
  });

  it("warns about links that lead nowhere and pictures on the web", async () => {
    const dto = await analyse(app, [{ name: "handbook.zip", content: await handbookZip() }]);
    const water = dto.analysis!.items.find((entry) => entry.title === "Water")!;
    expect(water.warnings).toEqual([
      'The link to "../people/quartermaster.md" is kept as plain text, because nothing in this import matches it.',
    ]);
    const kinds = Object.fromEntries(dto.analysis!.unsupported.map((entry) => [entry.kind, entry.count]));
    expect(kinds).toMatchObject({ "missing-link": 1, "external-image": 1, "skipped-file": 1 });
    expect(dto.analysis!.warnings).toBe(2);
  });

  it("imports the tree in file-name order with tags, forward and backward links", async () => {
    const analysed = await analyse(app, [{ name: "handbook.zip", content: await handbookZip() }]);
    const dto = await commit(app, analysed.id);
    expect(dto.state).toBe("completed");
    // 1, 2, 10: natural order of the file names, not of the titles.
    expect(await titleTree(app)).toEqual(["Field handbook", ["chapters", ["Shelter", "Water", "10-fire"], "notes"]]);

    const handbook = await findNote(app, "Field handbook");
    const shelter = await findNote(app, "Shelter");
    const water = await findNote(app, "Water");
    expect(handbook.tags).toEqual(["shelter", "water"]);
    // The heading that repeats the front-matter title is not kept in the text.
    expect(JSON.stringify(handbook.content)).not.toContain('"heading"');

    // Shelter → Water is a forward link (Water is created later); Water → Shelter points back.
    expect(water.backlinks.map((note: Json) => note.title)).toEqual(["Field handbook", "Shelter"]);
    expect(shelter.backlinks.map((note: Json) => note.title)).toEqual(["Water"]);
    expect(handbook.backlinks.map((note: Json) => note.title)).toEqual(["Shelter"]);

    // The link to a file that is not in the import is plain text, not a dead link.
    const waterJson = JSON.stringify(water.content);
    expect(waterJson).toContain("quartermaster");
    expect(waterJson).not.toContain("people/quartermaster.md");

    const fire = await findNote(app, "10-fire");
    const blocks = fire.content.content as Json[];
    expect(blocks.find((block) => block.type === "image")?.attrs.src).toMatch(/^\/api\/attachments\//);
    // The picture on the web is a link; nothing was fetched and nothing will be.
    expect(blocks.filter((block) => block.type === "image")).toHaveLength(1);
    expect(JSON.stringify(blocks)).toContain('"href":"https://example.org/fire.jpg"');

    const notes = await findNote(app, "notes");
    expect(notes.content.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "First line" }, { type: "hardBreak" }, { type: "text", text: "second line" }] },
      { type: "paragraph", content: [{ type: "text", text: "A new paragraph." }] },
    ]);

    expect(dto.report).toMatchObject({ attachments: 1, warnings: 2, failed: [] });
    expect(dto.report!.skipped).toEqual([
      { path: "handbook/pictures/unused.png", title: "unused.png", reason: "No page in this import links to it or shows it." },
    ]);
  });
});

describe("single files", () => {
  it("imports a Markdown file, titled by its heading", async () => {
    const analysed = await analyse(app, [{ name: "knots.md", content: "# Knots worth knowing\n\nBowline first.\n" }]);
    expect(analysed.kind).toBe("markdown");
    expect(analysed.analysis!.items).toMatchObject([
      { kind: "page", title: "Knots worth knowing", parentPath: null, importKey: pathKey("knots.md", "knots.md") },
    ]);
    const dto = await commit(app, analysed.id);
    expect(dto.report!.created).toMatchObject([{ title: "Knots worth knowing", topLevel: true }]);
    expect((await findNote(app, "Knots worth knowing")).content.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Bowline first." }] },
    ]);
  });

  it("imports a text file as paragraphs, titled by its name", async () => {
    const analysed = await analyse(app, [{ name: "Radio log.txt", content: "06:00 all quiet\n\n07:30 weather report\n" }]);
    expect(analysed.kind).toBe("text");
    await commit(app, analysed.id);
    const note = await findNote(app, "Radio log");
    expect(note.content.content.map((block: Json) => block.content[0].text)).toEqual(["06:00 all quiet", "07:30 weather report"]);
  });

  it("imports an HTML file with everything that could run taken out", async () => {
    const html = `<!doctype html><html><head><title>Stove manual</title><script>alert("head")</script></head>
      <body onload="alert(1)"><h1>Stove manual</h1><p>Prime it <b>twice</b>.</p>
      <script>document.location="https://evil.example"</script>
      <p><a href="javascript:alert(2)">Click</a> <img src="x.png" onerror="alert(3)" alt="diagram"></p>
      <iframe src="https://evil.example"></iframe></body></html>`;
    const analysed = await analyse(app, [{ name: "stove.html", content: html }]);
    expect(analysed.kind).toBe("html");
    expect(analysed.analysis!.unsupported.map((entry) => entry.kind)).toContain("embedded-media");
    await commit(app, analysed.id);
    const note = await findNote(app, "Stove manual");
    const json = JSON.stringify(note.content);
    expect(json).toContain("Prime it");
    expect(json).toContain('"bold"');
    for (const danger of ["script", "alert", "javascript:", "onerror", "onload", "evil.example", "iframe"])
      expect(json).not.toContain(danger);
    // The link with a dangerous address keeps its words; the picture that is not in the import keeps its description.
    expect(json).toContain("Click");
    expect(json).toContain("diagram");
  });

  it("adds a PDF to the document library", async () => {
    const pdf = buildPdf([["Water purification, page one."]], { title: "Water purification" });
    const analysed = await analyse(app, [{ name: "water.pdf", content: pdf }]);
    expect(analysed.kind).toBe("pdf");
    expect(analysed.analysis!.items).toMatchObject([{ kind: "document", path: "water.pdf" }]);
    expect(analysed.analysis!.totals).toMatchObject({ pages: 0, documents: 1 });

    const dto = await commit(app, analysed.id);
    expect(dto.state).toBe("completed");
    expect(dto.report!.documents).toHaveLength(1);
    expect(dto.report!.documents[0]!.alreadyInLibrary).toBe(false);
    const library = (await app.api("GET", "/api/documents")).body;
    expect(library.documents.map((document: Json) => document.id)).toEqual([dto.report!.documents[0]!.documentId]);
    expect(library.documents[0].originalName).toBe("water.pdf");
    expect((await app.api("GET", "/api/notes/tree")).body.notes).toEqual([]);
  });

  it("leaves PDFs out when asked, and reports the ones the library already had", async () => {
    const pdf = buildPdf([["Same bytes."]]);
    const first = await analyse(app, [{ name: "a.pdf", content: pdf }]);
    await commit(app, first.id);
    const again = await commit(app, (await analyse(app, [{ name: "a.pdf", content: pdf }])).id);
    expect(again.report!.documents).toMatchObject([{ alreadyInLibrary: true }]);

    const skipped = await commit(app, (await analyse(app, [{ name: "b.pdf", content: buildPdf([["Other bytes."]]) }])).id, {
      pdfs: "skip",
    });
    expect(skipped.report!.documents).toEqual([]);
    expect(skipped.report!.skipped).toEqual([{ path: "b.pdf", title: "b", reason: "PDFs were left out of this import." }]);
    expect((await app.api("GET", "/api/documents")).body.documents).toHaveLength(1);
  });

  it("links a page to the library copy of a PDF beside it, or attaches the PDF when PDFs are left out", async () => {
    const files = async () => [
      {
        name: "kit.zip",
        content: await buildZip([
          { name: "kit.md", content: "# Kit\n\nRead the [manual](manual.pdf) first.\n" },
          { name: "manual.pdf", content: buildPdf([["Manual."]]) },
        ]),
      },
    ];
    const toLibrary = await commit(app, (await analyse(app, await files())).id);
    const documentId = toLibrary.report!.documents[0]!.documentId;
    expect(JSON.stringify((await findNote(app, "Kit")).content)).toContain(`/library/documents/${documentId}`);

    const attached = await commit(app, (await analyse(app, await files())).id, { pdfs: "skip", duplicates: "copy" });
    expect(attached.report).toMatchObject({ attachments: 1, documents: [], skipped: [] });
    const copy = (await app.api("GET", `/api/notes/${attached.report!.created[0]!.noteId}`)).body.note;
    expect(JSON.stringify(copy.content)).toMatch(/\/api\/attachments\/[a-z0-9]+/);
  });

  it("takes several files in one upload, and a table from a CSV", async () => {
    const analysed = await analyse(app, [
      { name: "one.md", content: "# One\n\nSee [two](two.md).\n" },
      { name: "two.md", content: "# Two\n" },
      { name: "stock.csv", content: "Item,Count\nCandles,12\n" },
    ]);
    expect(analysed.originalName).toBe("one.md and 2 more");
    expect(analysed.analysis!.totals).toMatchObject({ pages: 2, databases: 1 });
    await commit(app, analysed.id);
    expect(await titleTree(app)).toEqual(["one", "stock", "two"].map((name) => ({ one: "One", stock: "stock", two: "Two" })[name]));
    expect((await findNote(app, "Two")).backlinks.map((note: Json) => note.title)).toEqual(["One"]);
    expect((await findNote(app, "stock")).content.content[0].type).toBe("table");
  });

  it("refuses files it cannot import, by name, and keeps nothing of the upload", async () => {
    const refused = await uploadImport(app, [
      { name: "fine.md", content: "# Fine" },
      { name: "slides.pptx", content: "PK" },
    ]);
    expect(refused.status).toBe(415);
    expect(refused.body.error.message).toContain('"slides.pptx" is not something Outpost can import');
    expect((await app.api("GET", "/api/imports")).body.imports).toEqual([]);

    const empty = await analyse(app, [{ name: "pictures.zip", content: await buildZip([{ name: "a.png", content: tinyPng }]) }]);
    expect(empty.state).toBe("ready");
    expect(empty.analysis!.problems).toHaveLength(1);
    const commitRefused = await app.api("POST", `/api/imports/${empty.id}/commit`, { duplicates: "skip", pdfs: "library" });
    expect(commitRefused.status).toBe(400);
    expect(commitRefused.body.error.message).toContain("Nothing in this upload can be imported");
  });
});

describe("the pure parts", () => {
  it("splits Notion's ids off names", () => {
    expect(splitNotionName("Trip plan 0a1b2c3d4e5f60718293a4b5c6d7e8f9")).toEqual({
      title: "Trip plan",
      id: "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
    });
    expect(splitNotionName("Trip plan")).toEqual({ title: "Trip plan" });
    // 31 digits, or a longer hexadecimal run, is not a Notion id.
    expect(splitNotionName("Hash 0a1b2c3d4e5f60718293a4b5c6d7e8f").id).toBeUndefined();
    expect(allRowsTwinOf("Tasks 33333333333333333333333333333333_all.csv")).toBe("Tasks 33333333333333333333333333333333");
    expect(allRowsTwinOf("totals_all.csv")).toBeUndefined();
  });

  it("orders names the way a file manager does and finds a folder's index file", () => {
    expect(["10-fire.md", "2-water.md", "1-shelter.md", "Appendix.md"].sort(naturalCompare)).toEqual([
      "1-shelter.md",
      "2-water.md",
      "10-fire.md",
      "Appendix.md",
    ]);
    expect(pickIndexFile(["a.md", "index.md", "ReadMe.md"])).toBe("ReadMe.md");
    expect(pickIndexFile(["a.md"])).toBeUndefined();
  });

  it("reads title and tags from front matter in its usual spellings", () => {
    expect(parseFrontmatter('title: "Quoted: title"\ntags: [a, "b c", #d]')).toEqual({ title: "Quoted: title", tags: ["a", "b c", "d"] });
    expect(parseFrontmatter("tags: one, two\nauthor: someone")).toEqual({ title: undefined, tags: ["one", "two"] });
    expect(parseFrontmatter("tags:\n  - first\n  - second\ntitle: Plain")).toEqual({ title: "Plain", tags: ["first", "second"] });
  });

  it("takes a heading as the title only when it is the title", () => {
    expect(convertPage("markdown", "# Heading\n\nText.").title).toBe("Heading");
    const kept = convertPage("markdown", "---\ntitle: Other\n---\n\n# Heading\n\nText.");
    expect(kept.title).toBe("Other");
    expect(JSON.stringify(kept.doc)).toContain("Heading");
    expect(convertPage("markdown", "Text first.\n\n# Later heading").title).toBeUndefined();
  });

  it("counts only constructs it can be sure of", () => {
    const found = scanConstructs(
      "markdown",
      [
        "It costs $5 and $10, or US$7.",
        "Inline $a^2 + b^2$ maths.",
        "$$\\int x$$",
        "`$not maths$`",
        "```\n$$ code $$\n<details>\n```",
        "[[Wiki page]]",
        "<details><summary>More</summary>x</details>",
        "<!-- hidden -->",
      ].join("\n\n"),
    );
    expect(found).toEqual({ equation: 2, "wiki-link": 1, toggle: 1, "html-comment": 1 });
    expect(scanConstructs("text", "$x$ <iframe>")).toEqual({});
    expect(scanConstructs("html", '<div class="column-list"><div class="column">a</div></div><video src="x"></video>')).toEqual({
      columns: 1,
      "embedded-media": 1,
    });
  });

  it("builds a table from CSV rows, cut to a size a page can hold", () => {
    const table = toTable([["Name", "Qty"], ["Rope", "2"], ["Tarp"]]);
    expect(table).toMatchObject({
      header: ["Name", "Qty"],
      rows: [
        ["Rope", "2"],
        ["Tarp", ""],
      ],
      truncated: false,
    });
    expect(truncationNote(table)).toBeUndefined();

    const long = toTable([["n"], ...Array.from({ length: 620 }, (_, index) => [String(index)])]);
    expect(long.rows).toHaveLength(500);
    expect(truncationNote(long)).toBe(
      "This table is imported with the first 500 of its 620 rows. The complete CSV file is attached to the page.",
    );

    const match = rowPageMatcher([
      { title: "Rope", noteId: "n1" },
      { title: "rope", noteId: "n2" },
    ]);
    const doc = tableDoc(toTable([["Name"], ["Rope"], ["Rope"], ["Rope"], ["Tarp"]]), { rowPage: match }) as unknown as Json;
    const firstCells = doc.content[0].content.slice(1).map((row: Json) => row.content[0].content[0].content[0]);
    expect(firstCells.map((cell: Json) => cell.attrs?.noteId ?? cell.text)).toEqual(["n1", "n2", "n2", "Tarp"]);
  });
});
