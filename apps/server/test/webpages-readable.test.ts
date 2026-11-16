import { describe, expect, it } from "vitest";
import { isFetchablePicture, parsePageAddress } from "../src/modules/webpages/address.ts";
import { convertArticle, plainDate, writeArticle } from "../src/modules/webpages/convert.ts";
import { PAGE_READS_AT_ONCE, PAGE_READS_WAITING, pageReads, readPageInWorker } from "../src/modules/webpages/read-host.ts";
import { countElements, readPage } from "../src/modules/webpages/read-page.ts";
import { findArticle } from "../src/modules/webpages/readable.ts";
import { paragraphs } from "./fixtures/webpages/pages.ts";

const PAGE = "https://example.org/guides/water?ref=home";

/** The Markdown a page becomes. */
function markdownOf(html: string, url = PAGE): string {
  const article = findArticle(html, url);
  if (!article) throw new Error("no article found");
  return writeArticle(convertArticle(article.content).tree, article);
}

const wrap = (body: string, head = "<title>A page</title>") =>
  `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;

describe("finding the article in a page", () => {
  it("takes the text from a page laid out with nothing but divs", () => {
    const markdown = markdownOf(
      wrap(`
        <div id="top"><div class="logo">Site</div><div class="links"><a href="/a">One</a> <a href="/b">Two</a> <a href="/c">Three</a></div></div>
        <div id="wrap"><div class="col-left"><div class="story-text"><h1>Boiling water</h1>${paragraphs(4)}</div></div>
        <div class="col-right"><div class="box"><a href="/x">Read this next</a></div><div class="box"><a href="/y">And this</a></div></div></div>
        <div id="bottom">Copyright notice. <a href="/terms">Terms</a></div>`),
    );
    expect(markdown).toContain("A rain barrel fills faster");
    for (const junk of ["Read this next", "Copyright notice", "Three"]) expect(markdown).not.toContain(junk);
  });

  it("joins an article that is split over several sections", () => {
    const markdown = markdownOf(
      wrap(`<main><div class="page-body">
        <section><h2>First part</h2>${paragraphs(2)}</section>
        <section><h2>Second part</h2>${paragraphs(2)}</section>
        <section><h2>Third part</h2>${paragraphs(2)}</section>
        <section><h2>Fourth part</h2>${paragraphs(2)}</section>
      </div></main>`),
    );
    for (const part of ["First part", "Second part", "Third part", "Fourth part"]) expect(markdown).toContain(`## ${part}`);
  });

  it("keeps the opening paragraphs when they sit in a block called a header, beside the body", () => {
    const markdown = markdownOf(
      wrap(`<header class="site-header"><a href="/">Home</a> <a href="/docs">Docs</a></header>
        <main>
          <div class="layout__header"><h1>Overview</h1><section><p>The opening paragraph says what the whole page is about, at enough length to be a paragraph and not a caption or a line of small print.</p></section></div>
          <div class="layout__body"><section><h2>Details</h2>${paragraphs(5)}</section><section><h2>More</h2>${paragraphs(5)}</section></div>
        </main>`),
    );
    expect(markdown).toContain("The opening paragraph says what the whole page is about");
    expect(markdown).not.toContain("Docs");
    // The page's name is the title; it is not repeated as a heading under itself.
    expect(markdown.match(/Overview/g)).toHaveLength(1);
  });

  it("keeps headings that are wrapped with an edit link, and drops the link", () => {
    const markdown = markdownOf(
      wrap(`<div id="content"><div class="body-text">
        ${paragraphs(3)}
        <div class="mw-heading mw-heading2"><h2 id="History">History</h2><span class="mw-editsection">[<a href="/edit?section=1">edit</a>]</span></div>
        ${paragraphs(3)}
      </div></div>`),
    );
    expect(markdown).toContain("## History");
    expect(markdown).not.toContain("edit");
  });

  it("is not led astray by a long list of references", () => {
    const references = Array.from(
      { length: 60 },
      (_, index) =>
        `<li>Author, A.; Writer, B.; Scholar, C. (20${10 + (index % 15)}). <a href="https://doi.example/${index}">A paper, with commas, in its title</a>. Journal, 4(2), 100-110.</li>`,
    ).join("");
    const markdown = markdownOf(
      wrap(
        `<div class="page"><div class="text">${paragraphs(6)}</div><div class="refs"><h2>References</h2><ol>${references}</ol></div></div>`,
      ),
    );
    expect(markdown).toContain("A rain barrel fills faster");
  });

  it("leaves code alone, whatever its classes are called", () => {
    const markdown = markdownOf(
      wrap(`<article>${paragraphs(3)}<pre><code class="language-js"><span class="hljs-comment">// a comment about the sidebar</span>
<span class="token share">share</span>(<span class="hljs-string">"menu"</span>);</code></pre></article>`),
    );
    expect(markdown).toContain('```js\n// a comment about the sidebar\nshare("menu");\n```');
  });

  it("keeps the indent and the line ends of code, when a highlighter holds them in elements of their own", () => {
    const markdown = markdownOf(
      wrap(`<article>${paragraphs(3)}<pre><code class="language-python"><span class="k">def</span> f():
<span class="w">    </span><span class="k">return</span> 1<span class="w">
</span>f()</code></pre></article>`),
    );
    expect(markdown).toContain("```python\ndef f():\n    return 1\nf()\n```");
  });

  it("writes a formula as the line its author gave for it", () => {
    const markdown = markdownOf(
      wrap(
        `<article>${paragraphs(3)}<p>Energy: <span class="mwe-math-element"><math alttext="E=mc^{2}"><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></math><img class="mwe-math-fallback-image-inline" src="/math/abc.svg" alt="{\\displaystyle E=mc^{2}}"></span>.</p></article>`,
      ),
    );
    expect(markdown).toContain("Energy: `E=mc^{2}`.");
    expect(markdown).not.toContain("displaystyle");
  });

  it("drops what is hidden from a reader", () => {
    const markdown = markdownOf(
      wrap(`<article>${paragraphs(3)}
        <p hidden>Hidden by the attribute.</p><p style="display: none">Hidden by a style.</p><p aria-hidden="true">Hidden from readers.</p>
        <span class="sr-only">Opens in a new window</span><div role="dialog"><p>Subscribe to keep reading this and many other fine articles today.</p></div>
        <template><p>In a template.</p></template><noscript><p>Turn on scripts.</p></noscript></article>`),
    );
    for (const hidden of ["Hidden by", "Hidden from", "new window", "Subscribe to keep", "template", "Turn on"])
      expect(markdown).not.toContain(hidden);
  });

  it("names the article as the page does, without the site's name tacked on", () => {
    const title = (head: string, body = `<article>${paragraphs(3)}</article>`) => findArticle(wrap(body, head), PAGE)?.title;
    expect(title("<title>Boiling water | Field Notes</title>", `<article><h1>Boiling water</h1>${paragraphs(3)}</article>`)).toBe(
      "Boiling water",
    );
    expect(title('<title>Field Notes</title><meta property="og:title" content="Boiling water">')).toBe("Boiling water");
    expect(title('<title>Boiling water - Field Notes</title><meta property="og:site_name" content="Field Notes">')).toBe("Boiling water");
    expect(title("<title>Field Notes » How to boil water safely at altitude</title>")).toBe("How to boil water safely at altitude");
    // A colon is part of many titles, so nothing is cut at one.
    expect(title("<title>Water: a short history</title>")).toBe("Water: a short history");
    expect(title("<title>Boiling water</title>")).toBe("Boiling water");
    expect(title("", `<article><h1>Only a heading</h1>${paragraphs(3)}</article>`)).toBe("Only a heading");
    expect(title("")).toBe("example.org");
  });

  it("reads who wrote it, for whom and when, from the page's own description of itself", () => {
    const linked = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "Ignored" },
        {
          "@type": "NewsArticle",
          headline: "From linked data",
          author: [{ "@type": "Person", name: "Ada Field" }, { name: "Ben Marsh" }],
          publisher: { "@type": "Organization", name: "The Linked Press" },
          datePublished: "2026-02-03T10:00:00+01:00",
        },
      ],
    });
    const article = findArticle(wrap(`<article>${paragraphs(3)}</article>`, `<script type="application/ld+json">${linked}</script>`), PAGE);
    expect(article).toMatchObject({
      title: "From linked data",
      byline: "Ada Field, Ben Marsh",
      site: "The Linked Press",
      published: "2026-02-03T10:00:00+01:00",
    });

    const marked = findArticle(
      wrap(
        `<article><h1>Marked up</h1><p class="post-byline">By <a rel="author" href="/people/cy">Cy Reed</a></p>${paragraphs(3)}</article>`,
      ),
      PAGE,
    );
    expect(marked?.byline).toBe("Cy Reed");
    // An address is not a name, and a date that is not a date is not kept.
    const junk = findArticle(
      wrap(
        `<article>${paragraphs(3)}</article>`,
        '<meta property="article:author" content="https://social.example/people/someone"><meta property="article:published_time" content="yesterday">',
      ),
      PAGE,
    );
    expect(junk?.byline).toBeUndefined();
    expect(junk?.published).toBeUndefined();
    // Data that is not the JSON it claims to be is passed over.
    expect(
      findArticle(
        wrap(`<article>${paragraphs(3)}</article>`, '<title>A page</title><script type="application/ld+json">{ not json</script>'),
        PAGE,
      )?.title,
    ).toBe("A page");
  });

  it("completes links and pictures against the page, or against the base the page names", () => {
    const body = `<article>${paragraphs(3)}<p><a href="next">Next</a> <a href="/top">Top</a> <a href="//cdn.example/x">Other host</a> <a href="?page=2">Page two</a>
      <a href="data:text/html,<script>alert(1)</script>">Data</a> <a href="vbscript:x">Script</a> <a>No address</a></p><p><img src="pic.png" alt="Relative picture"></p></article>`;
    const plain = markdownOf(wrap(body));
    expect(plain).toContain("[Next](https://example.org/guides/next)");
    expect(plain).toContain("[Top](https://example.org/top)");
    expect(plain).toContain("[Other host](https://cdn.example/x)");
    expect(plain).toContain("[Page two](https://example.org/guides/water?page=2)");
    expect(plain).toContain("Data Script No address");
    expect(plain).toContain("![Relative picture](https://example.org/guides/pic.png)");
    expect(plain).not.toMatch(/data:|vbscript/);

    const based = markdownOf(wrap(body, '<title>T</title><base href="https://static.example/v2/">'));
    expect(based).toContain("[Next](https://static.example/v2/next)");
    expect(based).toContain("![Relative picture](https://static.example/v2/pic.png)");
  });

  it("reports a page with no body, or with nothing in it, as having no article", () => {
    expect(() => readPage(Buffer.from(""), "text/html", PAGE)).toThrow(/No readable text was found/);
    expect(() => readPage(Buffer.from("<html><body></body></html>"), "text/html", PAGE)).toThrow(/No readable text was found/);
    expect(() => readPage(Buffer.from(wrap(`<article><p>Too short to be an article.</p></article>`)), "text/html", PAGE)).toThrow(
      /No readable text was found on this page.*no browser inside it/,
    );
    expect(readPage(Buffer.from(wrap(`<article>${paragraphs(2)}</article>`)), "text/html", PAGE).converted.text).toContain("rain barrel");
  });

  it("counts a page's elements without being fooled by its scripts", () => {
    expect(countElements("<p>One</p><div><b>two</b></div>")).toBe(3);
    expect(countElements('<p>One</p><script>if (a<b && c<d) document.write("<p><p><p>")</script><STYLE>a<b{}</STYLE><p>Two</p>')).toBe(4);
    expect(countElements("<p>One</p><script>never closed <p><p>")).toBe(2);
    expect(countElements("a < b and 1<2 </p>")).toBe(0);
  });
});

describe("addresses", () => {
  const parse = (address: string, allowPrivate = false) => parsePageAddress(address, { allowPrivate });

  it("are put in a standard form, with a bare name taken as https", () => {
    expect(parse("  https://Example.ORG/a b".replace(" b", "%20b"))).toEqual({ url: "https://example.org/a%20b", host: "example.org" });
    expect(parse("example.org/page#section")).toEqual({ url: "https://example.org/page", host: "example.org" });
    expect(parse("example.org:8443/page")).toEqual({ url: "https://example.org:8443/page", host: "example.org" });
    expect(parse("http://example.org")).toEqual({ url: "http://example.org/", host: "example.org" });
    expect(parse("https://bücher.example/weg")).toEqual({ url: "https://xn--bcher-kva.example/weg", host: "xn--bcher-kva.example" });
  });

  it("are refused when they are not one public web address", () => {
    for (const bad of [
      "",
      "   ",
      "hello",
      "http://",
      "https://exa mple.org",
      "mailto:someone@example.org",
      "data:text/html,hi",
      `https://example.org/${"a".repeat(2100)}`,
    ]) {
      expect(() => parse(bad), bad).toThrow();
    }
    for (const inward of [
      "http://127.0.0.1/",
      "http://localhost/",
      "http://app.localhost/",
      "http://[::1]/",
      "http://0.0.0.0/",
      "http://192.168.0.10:8080/x",
      "http://172.20.1.1/",
      "http://100.64.0.1/",
    ]) {
      expect(() => parse(inward), inward).toThrow(/on this computer or a private network/);
    }
    // A server set up to fetch from its own network may be given such an address.
    expect(parse("http://192.168.0.10:8080/x", true).host).toBe("192.168.0.10");
    expect(parse("http://nas/wiki", true).host).toBe("nas");
  });

  it("of pictures are fetched only when they are plain web addresses of something that could be kept", () => {
    const fetchable = (address: string) => isFetchablePicture(address, { allowPrivate: false });
    expect(fetchable("https://cdn.example/a.jpg?w=800")).toBe(true);
    expect(fetchable("https://cdn.example/a")).toBe(true);
    for (const no of [
      "https://cdn.example/a.svg",
      "https://cdn.example/a.SVG?x=1",
      "data:image/png;base64,AAAA",
      "ftp://cdn.example/a.png",
      "https://u:p@cdn.example/a.png",
      "http://10.1.2.3/a.png",
      "http://localhost/a.png",
      "not an address",
    ]) {
      expect(fetchable(no), no).toBe(false);
    }
  });
});

describe("dates", () => {
  it("are written out in words, as the day the page names", () => {
    expect(plainDate("2026-03-09T23:30:00-08:00")).toBe("9 March 2026");
    expect(plainDate("2026-12-01")).toBe("1 December 2026");
    expect(plainDate("2026-13-01")).toBeUndefined();
    expect(plainDate("March 2026")).toBeUndefined();
  });
});

describe("reading a page away from the server's thread", () => {
  const bytes = (html: string) => new Uint8Array(Buffer.from(html));
  const article = `<!doctype html><html><head><title>A page</title></head><body><article>${paragraphs(3)}</article></body></html>`;

  it("gives the same answer as reading it directly, and the same refusals", async () => {
    const read = await readPageInWorker({ bytes: bytes(article), contentType: "text/html", url: PAGE });
    expect(read.article.title).toBe("A page");
    expect(read.converted.text).toBe(readPage(Buffer.from(article), "text/html", PAGE).converted.text);
    await expect(
      readPageInWorker({ bytes: bytes("<html><body><p>Hi.</p></body></html>"), contentType: "text/html", url: PAGE }),
    ).rejects.toMatchObject({
      code: "unsupported",
      message: expect.stringMatching(/No readable text was found/),
    });
    await expect(
      readPageInWorker({
        bytes: bytes(`<body><article>${paragraphs(3)}${"<i></i>".repeat(50_001)}</article></body>`),
        contentType: "text/html",
        url: PAGE,
      }),
    ).rejects.toMatchObject({ code: "too_large", message: expect.stringMatching(/more parts than Outpost reads/) });
  });

  it("is stopped when it takes too long, or when nobody is waiting any more", async () => {
    const long = `<body><article>${paragraphs(12_000)}</article></body>`;
    await expect(readPageInWorker({ bytes: bytes(long), contentType: "text/html", url: PAGE }, { timeoutMs: 30 })).rejects.toThrow(
      /took too long to read/,
    );
    const gone = new AbortController();
    const reading = readPageInWorker({ bytes: bytes(long), contentType: "text/html", url: PAGE }, { signal: gone.signal });
    gone.abort(new Error("The person left"));
    await expect(reading).rejects.toThrow("The person left");
    expect(pageReads()).toEqual({ reading: 0, waiting: 0 });
  });

  it("reads a page built to be slow in a time that grows no faster than the page", async () => {
    // Thousands of empty elements, and thousands of one-word pieces, are what the converter is slowest at when left alone.
    for (const shape of ["<i></i>", "<b><i><span></span></i></b>", "<span>word </span>", "x<sup>[note]</sup>", "a<wbr>"]) {
      const started = performance.now();
      const read = await readPageInWorker({
        bytes: bytes(`<body><article>${paragraphs(3)}<div>${shape.repeat(12_000)}</div></article></body>`),
        contentType: "text/html",
        url: PAGE,
      });
      expect(read.converted.text, shape).toContain("rain barrel");
      expect(performance.now() - started, shape).toBeLessThan(10_000);
    }
  }, 60_000);

  it("takes pages in turn, and turns one away when the line is full", async () => {
    const all = Array.from({ length: PAGE_READS_AT_ONCE + PAGE_READS_WAITING + 1 }, () =>
      readPageInWorker({ bytes: bytes(article), contentType: "text/html", url: PAGE }).then(
        (read) => read.article.title,
        (error: Error) => error.message,
      ),
    );
    expect(pageReads()).toEqual({ reading: PAGE_READS_AT_ONCE, waiting: PAGE_READS_WAITING });
    const answers = await Promise.all(all);
    expect(answers.filter((answer) => answer === "A page")).toHaveLength(PAGE_READS_AT_ONCE + PAGE_READS_WAITING);
    expect(answers.at(-1)).toMatch(/already reading several web pages/);
    expect(pageReads()).toEqual({ reading: 0, waiting: 0 });
  });
});
