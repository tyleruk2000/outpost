/**
 * What converting an imported file costs, and where it is paid.
 *
 * Two faults, both found with files of a few kilobytes: the HTML converter took time by
 * the square of a run of empty elements or of separate pieces of text (4,000 empty `<i>`,
 * 28 kB, sixteen seconds), and every conversion ran on the thread that answers requests,
 * in the server's own memory.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { afterEach, describe, expect, it } from "vitest";
import { convertPage } from "../src/modules/imports/convert.ts";
import { converterRunning, convertPageApart } from "../src/modules/imports/convert-host.ts";
import { docToText, htmlToDoc, markdownToDoc } from "../src/modules/notes/content/index.ts";
import { analyse, commit, findNote } from "./fixtures/imports/builders.ts";
import { createTestApp, type TestApp } from "./helpers.ts";
import { threadMs } from "./thread-time.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const page = (body: string) => `<html><head><title>Rain</title></head><body>${body}</body></html>`;
/** The work's time on this thread, not the clock's, which runs on while a busy machine runs other things. */
const timed = <T>(work: () => T): { ms: number; value: T } => {
  const started = threadMs();
  const value = work();
  return { ms: threadMs() - started, value };
};

describe("HTML the converter is slow at", () => {
  // Each of these took between four seconds and sixteen for 4,000 repeats before the tree was prepared.
  const emptyRuns = [
    "<i></i>",
    "<span></span>",
    "<b></b><i></i>",
    "<i><b> </b></i>",
    '<a href="https://example.org/"></a>',
    "<details></details>",
  ];
  // And these, slower by the square of their number: eight seconds or more for 120,000.
  const textRuns = ["<span>x</span>", "x<wbr>", "x<!-- -->", "<q>x</q>", "<sup>x</sup>"];

  it("converts long runs of empty elements in a time that grows no faster than the file", () => {
    for (const shape of emptyRuns) {
      const { ms, value } = timed(() => htmlToDoc(page(`<p>The rain barrel is full.</p><p>${shape.repeat(4_000)}</p><p>Empty it.</p>`)));
      expect(docToText(value.doc), shape).toContain("rain barrel");
      expect(docToText(value.doc), shape).toContain("Empty it.");
      expect(value.warnings, shape).toEqual([]);
      // Fifteen milliseconds on the machine this was written on; four seconds or more before.
      expect(ms, shape).toBeLessThan(2_000);
    }
  }, 60_000);

  it("converts long runs of separate pieces of text the same way, and keeps every word", () => {
    for (const shape of textRuns) {
      const { ms, value } = timed(() => htmlToDoc(page(`<p>${shape.repeat(120_000)}</p>`)));
      const text = docToText(value.doc);
      expect(text.match(/x/g)?.length, shape).toBe(120_000);
      // About 300 milliseconds on the machine this was written on.
      expect(ms, shape).toBeLessThan(3_000);
    }
  }, 60_000);

  it("is prepared the same way when it sits inside Markdown", () => {
    const { ms, value } = timed(() => markdownToDoc(`Before.\n\n<div>${"<i></i>".repeat(4_000)}after</div>\n`));
    expect(docToText(value.doc)).toContain("after");
    expect(ms).toBeLessThan(2_000);
  });

  it("loses nothing a page can hold in the preparing", () => {
    const doc = (html: string) => JSON.stringify(htmlToDoc(html).doc.content);
    // Marks, and the space an element with only a space in it stood for.
    expect(doc("<p>one <b>two</b><i></i> <u>three</u><mark>four</mark> H<sub>2</sub>O<span> </span>five</p>")).toBe(
      JSON.stringify([
        {
          type: "paragraph",
          content: [
            { type: "text", text: "one " },
            { type: "text", text: "two", marks: [{ type: "bold" }] },
            { type: "text", text: " " },
            { type: "text", text: "three", marks: [{ type: "underline" }] },
            { type: "text", text: "four", marks: [{ type: "highlight" }] },
            { type: "text", text: " H2O five" },
          ],
        },
      ]),
    );
    // What is complete with nothing in it stays: a line break, a picture, a rule, a table cell, a task's box.
    const kept = htmlToDoc(
      '<p>a<br>b</p><hr><p><img src="https://example.org/a.png" alt="A"></p><table><tr><th>h</th><th></th></tr><tr><td></td><td>x</td></tr></table><ul><li><input type="checkbox" checked disabled> done</li></ul>',
    );
    const kinds = JSON.stringify(kept.doc);
    for (const type of ["hardBreak", "horizontalRule", "image", "tableHeader", "tableCell", "taskItem"])
      expect(kinds).toContain(`"${type}"`);
    expect((kinds.match(/"tableCell"/g) ?? []).length).toBe(2);
    // A quotation keeps its marks, and is one piece of text with what is around it.
    expect(docToText(htmlToDoc("<p>He said <q>go <q>now</q></q>.</p>").doc)).toBe('He said "go "now"".');
    // A folded part with nothing in it at all says nothing; one with a summary is kept.
    expect(doc("<details></details><p>x</p>")).not.toContain("details");
    expect(doc("<details><summary>More</summary></details>")).toContain("detailsSummary");
  });

  it("keeps white space exactly where the page keeps it, inside a block of code", () => {
    const code = (html: string) => {
      const block = htmlToDoc(html).doc.content?.find((node) => node.type === "codeBlock");
      return (block?.content ?? []).map((node) => node.text ?? "").join("");
    };
    // A highlighter puts the indent, and sometimes the end of a line, in an element of its own.
    expect(code('<pre><code><span class="k">def</span> f():\n<span class="w">    </span>return 1</code></pre>')).toBe(
      "def f():\n    return 1",
    );
    expect(code('<pre><code>a = 1<span class="w">\n</span>b = 2<span><span>\n\n\t</span></span>c = 3</code></pre>')).toBe(
      "a = 1\nb = 2\n\n\tc = 3",
    );
    // Outside one, the same element is still the single space that parts two words.
    expect(docToText(htmlToDoc("<p>one<span>    </span>two</p>").doc)).toBe("one two");
    // And an element with nothing at all in it is dropped there as anywhere.
    expect(code("<pre><code>a<span></span>b<i></i></code></pre>")).toBe("ab");
  });

  it("is no slower at a block of code made of such elements", () => {
    for (const shape of ["<span>    </span>", "<i><b> </b></i>", "<span></span>", "<span>x</span>\n"]) {
      const { ms, value } = timed(() => htmlToDoc(page(`<pre><code>${shape.repeat(40_000)}</code></pre><p>After.</p>`)));
      expect(docToText(value.doc), shape).toContain("After.");
      expect(ms, shape).toBeLessThan(3_000);
    }
  }, 60_000);
});

describe("converting in a process of its own", () => {
  it("gives the page the same as converting here would, links placed from the table it is handed", async () => {
    const markdown =
      "---\ntitle: Water\ntags: [a, b]\n---\n\n# Water\n\nSee [shelter](shelter.md) and [fire](fire.md). <aside>Boil it.</aside>\n";
    const links = { "shelter.md": { type: "note", noteId: "n1" } } as const;
    const here = convertPage("markdown", markdown, (href) => (href === "shelter.md" ? links["shelter.md"] : null));
    const there = await convertPageApart("markdown", markdown, { links, scan: true });
    expect(there.page).toEqual(here);
    expect(there.page.missing).toEqual(["fire.md"]);
    expect(there.constructs).toEqual({ callout: 1 });
    expect(converterRunning()).toBe(true);
  });

  it("stops a file that takes too long, says so, and converts the next one", async () => {
    // The Markdown parser's own slow shape: fourteen seconds for this on the server's thread.
    const slow = `${"*x*".repeat(40_000)}\n`;
    const loop = monitorEventLoopDelay({ resolution: 5 });
    loop.enable();
    const started = performance.now();
    await expect(convertPageApart("markdown", slow, { timeoutMs: 1_500 })).rejects.toThrow(
      "This file took too long to convert, so Outpost stopped.",
    );
    loop.disable();
    expect(performance.now() - started).toBeLessThan(5_000);
    // This thread went on answering all the while. Generous, for a machine busy with other tests.
    expect(loop.max / 1e6).toBeLessThan(1_000);
    expect(converterRunning()).toBe(false);

    const next = await convertPageApart("html", page("<p>Still here.</p>"));
    expect(next.page.title).toBe("Rain");
    expect(docToText(next.page.doc)).toBe("Still here.");
  }, 30_000);

  it("ends alone when a file needs more memory than it is allowed, and converts the next one", async () => {
    // A megabyte of one-letter italics is some 150,000 pieces of a tree: far more than 48 MB will hold.
    const heavy = page(`<p>${"<i>x</i>".repeat(150_000)}</p>`);
    await expect(convertPageApart("html", heavy, { heapMb: 48 })).rejects.toThrow(
      "Converting this file needed more memory than Outpost allows.",
    );
    expect(converterRunning()).toBe(false);
    // This process, which is the server in these tests, is untouched and goes on.
    const next = await convertPageApart("text", "Still here.", { heapMb: 48 });
    expect(docToText(next.page.doc)).toBe("Still here.");
  }, 60_000);

  it("stops when the job waiting for it is stopped", async () => {
    const gone = new AbortController();
    const converting = convertPageApart("markdown", `${"*x*".repeat(40_000)}\n`, { signal: gone.signal });
    setTimeout(() => gone.abort(new Error("The import was cancelled")), 100);
    await expect(converting).rejects.toThrow("The import was cancelled");
    expect(converterRunning()).toBe(false);
  }, 30_000);

  it("takes files in turn, each getting its own answer", async () => {
    const answers = await Promise.all(
      Array.from({ length: 8 }, (_, index) => convertPageApart("text", `Page ${index}\n\nSecond paragraph of ${index}.`)),
    );
    expect(answers.map((answer) => docToText(answer.page.doc).split("\n")[0])).toEqual(
      Array.from({ length: 8 }, (_, index) => `Page ${index}`),
    );
  });
});

describe("importing a file built to be slow", () => {
  it("brings in an HTML file of empty elements as the page it is, without holding the server up", async () => {
    app = await createTestApp();
    const loop = monitorEventLoopDelay({ resolution: 5 });
    loop.enable();
    const analysed = await analyse(app, [
      { name: "slow.html", content: page(`<h1>Rain</h1><p>The barrel is full.</p><p>${"<i></i>".repeat(4_000)}</p>`) },
    ]);
    const done = await commit(app, analysed.id);
    loop.disable();
    expect(done.state).toBe("completed");
    expect(analysed.analysis!.items.find((item) => item.kind === "page")!.warnings).toEqual([]);
    const note = await findNote(app, "Rain");
    expect(docToText(note.content)).toBe("The barrel is full.");
    // Sixteen seconds on this thread before; nothing a person would notice now.
    expect(loop.max / 1e6).toBeLessThan(1_000);
  }, 30_000);
});
