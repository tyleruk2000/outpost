import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { expandSelfClosing } from "../src/modules/documents/extract-epub.ts";
import { runExtraction } from "../src/modules/documents/extract-host.ts";
import { extractPdf, outlineLimits } from "../src/modules/documents/extract-pdf.ts";
import { htmlSections, markdownSections, parseHtml } from "../src/modules/documents/extract-text.ts";
import { tidyText } from "../src/modules/documents/extract-types.ts";
import {
  assertContentMatches,
  defaultTitle,
  displayName,
  formatForName,
  isEpubHead,
  looksLikeUtf8Text,
  servedAs,
} from "../src/modules/documents/file-types.ts";
import { contentDisposition, matchesEtag, parseRange } from "../src/modules/documents/http.ts";
import { cleanTags } from "../src/modules/documents/service.ts";
import { buildEpub, buildPdf, tinyPng } from "./fixtures/documents/builders.ts";
import { tempDir } from "./temp.ts";

describe("file types", () => {
  it("recognises a type only when name and content agree", () => {
    const accepts = (name: string, content: Buffer | string) => {
      try {
        assertContentMatches(formatForName(name), Buffer.from(content), true, name);
        return true;
      } catch {
        return false;
      }
    };
    expect(accepts("a.pdf", "%PDF-1.7\n…")).toBe(true);
    expect(accepts("a.PDF", "\n\n%PDF-1.7")).toBe(true);
    expect(accepts("a.pdf", "PK\u0003\u0004")).toBe(false);
    expect(accepts("a.png", tinyPng)).toBe(true);
    expect(accepts("a.jpg", tinyPng)).toBe(false);
    expect(accepts("a.jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(accepts("a.gif", "GIF89a....")).toBe(true);
    expect(accepts("a.webp", "RIFF\u0010\u0000\u0000\u0000WEBPVP8 ")).toBe(true);
    expect(accepts("a.svg", '<?xml version="1.0"?><svg/>')).toBe(true);
    expect(accepts("a.svg", "just words")).toBe(false);
    expect(accepts("a.json", '{"a":1}')).toBe(true);
    expect(accepts("a.csv", "a,b\n1,2")).toBe(true);
    expect(accepts("a.htm", "<p>hi</p>")).toBe(true);
    expect(accepts("a.txt", Buffer.from([0xff, 0xfe, 0x41, 0x00]))).toBe(false);
    expect(accepts("a.docx", "PK\u0003\u0004")).toBe(false);
    expect(accepts("archive.tar.gz", "x")).toBe(false);
  });

  it("does not mistake a character cut off at the end of the first chunk for bad text", () => {
    const euro = Buffer.from("price: €", "utf8");
    expect(looksLikeUtf8Text(euro.subarray(0, euro.length - 1), false)).toBe(true);
    expect(looksLikeUtf8Text(euro.subarray(0, euro.length - 1), true)).toBe(false);
  });

  it("spots a well-formed EPUB from its first bytes", async () => {
    const epub = await buildEpub({ title: "T", author: "A", chapters: [] });
    expect(isEpubHead(epub.subarray(0, 100))).toBe(true);
    expect(isEpubHead(Buffer.from("PK\u0003\u0004 something else entirely, long enough to compare"))).toBe(false);
  });

  it("cleans names for display and derives a title", () => {
    expect(displayName("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(displayName("C:\\Users\\me\\Report  final.PDF")).toBe("Report final.PDF");
    expect(displayName("a\u0000b\u001f.md")).toBe("ab.md");
    expect(displayName("")).toBe("file");
    expect(displayName(undefined)).toBe("file");
    const long = displayName(`${"n".repeat(400)}.epub`);
    expect(long).toHaveLength(255);
    expect(long.endsWith(".epub")).toBe(true);
    expect(defaultTitle("Field Manual 21-76.pdf")).toBe("Field Manual 21-76");
    expect(defaultTitle("README")).toBe("README");
  });

  it("decides how each type is handed back", () => {
    const served = (name: string, download = false) => servedAs(formatForName(name), download);
    expect(served("a.pdf")).toEqual({ disposition: "inline", contentType: "application/pdf" });
    expect(served("a.jpg")).toEqual({ disposition: "inline", contentType: "image/jpeg" });
    expect(served("a.csv")).toEqual({ disposition: "inline", contentType: "text/plain; charset=utf-8" });
    expect(served("a.json")).toEqual({ disposition: "inline", contentType: "text/plain; charset=utf-8" });
    expect(served("a.html")).toEqual({ disposition: "attachment", contentType: "text/html; charset=utf-8" });
    expect(served("a.svg").disposition).toBe("attachment");
    expect(served("a.epub")).toEqual({ disposition: "attachment", contentType: "application/epub+zip" });
    expect(served("a.csv", true)).toEqual({ disposition: "attachment", contentType: "text/csv; charset=utf-8" });
    expect(servedAs(undefined, false)).toEqual({ disposition: "attachment", contentType: "application/octet-stream" });
  });
});

describe("http helpers", () => {
  it("parses byte ranges", () => {
    expect(parseRange(undefined, 100)).toBeUndefined();
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=50-5000", 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
    // Malformed or unsupported forms are ignored, which means "send everything".
    expect(parseRange("bytes=9-0", 100)).toBeUndefined();
    expect(parseRange("bytes=0-1,4-5", 100)).toBeUndefined();
    expect(parseRange("items=0-1", 100)).toBeUndefined();
    expect(parseRange("bytes=-", 100)).toBeUndefined();
  });

  it("encodes download names for old and new clients", () => {
    expect(contentDisposition("attachment", 'report "final".pdf')).toBe(
      `attachment; filename="report _final_.pdf"; filename*=UTF-8''report%20%22final%22.pdf`,
    );
    expect(contentDisposition("inline", "日本語 (1).txt")).toBe(
      `inline; filename="___ (1).txt"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E%20%281%29.txt`,
    );
  });

  it("compares entity tags", () => {
    expect(matchesEtag('"abc"', '"abc"')).toBe(true);
    expect(matchesEtag('"x", W/"abc"', '"abc"')).toBe(true);
    expect(matchesEtag("*", '"abc"')).toBe(true);
    expect(matchesEtag('"abcd"', '"abc"')).toBe(false);
    expect(matchesEtag(undefined, '"abc"')).toBe(false);
  });
});

describe("tags", () => {
  it("trims, drops repeats whatever their case, and refuses what cannot be stored", () => {
    expect(cleanTags(["  First  Aid ", "first aid", "", "Éclair", "éclair", "rope"])).toEqual(["First Aid", "Éclair", "rope"]);
    expect(() => cleanTags(["a,b"])).toThrowError(/commas/);
    expect(() => cleanTags(["x".repeat(51)])).toThrowError(/too long/);
    expect(() => cleanTags(Array.from({ length: 51 }, (_, index) => `tag${index}`))).toThrowError(/at most 50/);
  });
});

describe("text from markup", () => {
  it("splits Markdown at headings and drops the syntax", () => {
    const { sections, meta } = markdownSections(
      [
        "---",
        'title: "Camp kitchen"',
        "author: Sam",
        "---",
        "Before any heading.",
        "",
        "# Stoves *and* fuel",
        "",
        "Use `meths` or [gas](https://example.org/gas).",
        "",
        "- one",
        "- two",
        "",
        "```",
        "code stays",
        "```",
        "",
        "## Table",
        "",
        "| Fuel | Boil |",
        "| --- | --- |",
        "| Gas | 3 min |",
        "",
        "Text with <b>inline html</b> and ![a pan](pan.png).",
        "",
        "### Empty",
      ].join("\n"),
    );
    expect(meta).toEqual({ title: "Camp kitchen", author: "Sam" });
    expect(sections).toEqual([
      { heading: undefined, text: "Before any heading." },
      { heading: "Stoves and fuel", text: "Use meths or gas.\n\none\ntwo\n\ncode stays" },
      { heading: "Table", text: "Fuel | Boil\nGas | 3 min\n\nText with inline html and a pan." },
      { heading: "Empty", text: "" },
    ]);
    // With no title in front matter, a document that opens with a level-one heading is named by it.
    expect(markdownSections("# Radio for remote places\n\nLine of sight.\n\n## Antennas\n\nLonger is not always better.").meta.title).toBe(
      "Radio for remote places",
    );
    expect(markdownSections("---\ntitle: From the front matter\n---\n# From the heading\n\nText.").meta.title).toBe(
      "From the front matter",
    );
    // A heading further down, or a smaller one, is a section and not the document's name.
    expect(markdownSections("Some notes first.\n\n# Later heading\n\nText.").meta.title).toBeUndefined();
    expect(markdownSections("## Only a section\n\nText.").meta.title).toBeUndefined();
    // A thematic break at the top is not front matter.
    expect(markdownSections("---\n\nJust text").sections).toEqual([{ heading: undefined, text: "Just text" }]);
  });

  it("splits HTML at h1–h3 wherever they are nested, and ignores what is not content", () => {
    const parsed = parseHtml(
      `<!doctype html><html lang="de"><head><title> Seite  eins </title><style>body{}</style></head><body>
        <p>Intro</p>
        <main><section><h1>First</h1><p>Alpha<br>Beta</p><ul><li>x</li><li>y</li></ul></section>
        <section><div><h3>Deep <em>heading</em></h3></div><p>Gamma</p><h4>Minor</h4><p>Delta</p></section></main>
        <script>var hidden = 1;</script><template><p>templated</p></template><noscript>enable js</noscript>
      </body></html>`,
    );
    expect(parsed.title).toBe("Seite eins");
    expect(parsed.language).toBe("de");
    expect(htmlSections(parsed.tree)).toEqual([
      { heading: undefined, text: "Intro" },
      { heading: "First", text: "Alpha\nBeta\n\nx\ny" },
      { heading: "Deep heading", text: "Gamma\n\nMinor\n\nDelta" },
    ]);
    expect(htmlSections(parseHtml("plain words, no markup").tree)).toEqual([{ heading: undefined, text: "plain words, no markup" }]);
  });

  it("makes XML self-closing tags safe for the HTML parser", () => {
    expect(expandSelfClosing('<script src="a.js"/><p>kept</p>')).toBe('<script src="a.js"></script><p>kept</p>');
    expect(expandSelfClosing('<item id="a" href="a.xhtml" />')).toBe('<item id="a" href="a.xhtml"></item>');
    expect(expandSelfClosing("<br/><img src='x'/><title/>")).toBe("<br/><img src='x'/><title></title>");
    const parsed = parseHtml(expandSelfClosing("<html><head><title/><script src='r.js'/></head><body><p>Visible</p></body></html>"));
    expect(htmlSections(parsed.tree)).toEqual([{ heading: undefined, text: "Visible" }]);
  });

  it("tidies whitespace without losing lines", () => {
    expect(tidyText("  a \t b\r\n\r\n\r\n\r\nc \u0000d\n ")).toBe("a b\n\nc d");
  });
});

describe("a PDF's bookmarks", () => {
  it("reads at most so many, in the outline's order, looking their pages up a few at a time", async () => {
    const dir = tempDir("outpost-outline-");
    const file = path.join(dir, "book.pdf");
    const pages = Array.from({ length: 6 }, (_, index) => [`Words of page ${index + 1}`]);
    const outline = pages.map((_, index) => ({ title: `Chapter ${index + 1}`, page: index + 1, named: index % 2 === 1 }));
    fs.writeFileSync(file, buildPdf(pages, { outline }));
    const kept = { ...outlineLimits };
    try {
      Object.assign(outlineLimits, { most: 3, batch: 2 });
      const read = await extractPdf(file, 0, () => {});
      // The first three bookmarks only: the pages after the third stay under it.
      expect(read.sections.map((section) => section.heading)).toEqual([
        "Chapter 1",
        "Chapter 2",
        "Chapter 3",
        "Chapter 3",
        "Chapter 3",
        "Chapter 3",
      ]);
    } finally {
      Object.assign(outlineLimits, kept);
    }
  });
});

describe("the extraction worker", () => {
  const dir = tempDir("outpost-extract-");
  const pdf = path.join(dir, "many.pdf");
  fs.writeFileSync(pdf, buildPdf(Array.from({ length: 40 }, (_, index) => [`Page number ${index + 1}`])));
  const request = { filePath: pdf, kind: "pdf" as const, maxPdfPages: 0 };

  it("reports progress and returns one section per page", async () => {
    const seen: number[] = [];
    const result = await runExtraction(request, {
      signal: new AbortController().signal,
      onProgress: (progress) => seen.push(progress.current),
    });
    expect(result.pageCount).toBe(40);
    expect(result.sections).toHaveLength(40);
    expect(result.sections[39]).toEqual({ page: 40, text: "Page number 40" });
    expect(seen.at(-1)).toBe(40);
  });

  it("stops when the job is aborted, before or during the work", async () => {
    const before = new AbortController();
    before.abort("cancelled");
    await expect(runExtraction(request, { signal: before.signal })).rejects.toThrowError(/stopped/);

    const during = new AbortController();
    const running = runExtraction(request, { signal: during.signal });
    during.abort("paused");
    await expect(running).rejects.toThrowError(/stopped/);
  });

  it("gives up on a file that takes too long", async () => {
    await expect(runExtraction(request, { signal: new AbortController().signal, totalTimeoutMs: 1 })).rejects.toThrowError(/took too long/);
    await expect(runExtraction(request, { signal: new AbortController().signal, stallTimeoutMs: 1 })).rejects.toThrowError(/took too long/);
  });

  it("explains a file that is missing or unreadable", async () => {
    await expect(
      runExtraction({ ...request, filePath: path.join(dir, "absent.pdf") }, { signal: new AbortController().signal }),
    ).rejects.toThrowError(/could not be read/);
    const notZip = path.join(dir, "broken.epub");
    fs.writeFileSync(notZip, "not a zip at all");
    await expect(
      runExtraction({ filePath: notZip, kind: "epub", maxPdfPages: 0 }, { signal: new AbortController().signal }),
    ).rejects.toThrowError(/not a readable zip archive/);
  });
});
