/**
 * Small EPUB books for the reading-view tests, built in memory from text written for
 * these tests. One is an EPUB 3 (a navigation document, a manifest cover), one an
 * EPUB 2 (an NCX, a cover named in the metadata); the rest are the same book with
 * something wrong with it.
 */
import { buildZip, tinyPng } from "./builders.ts";

type Entry = { name: string; content: string | Buffer; store?: boolean };

export const MIMETYPE: Entry = { name: "mimetype", content: "application/epub+zip", store: true };

export const container = (opf: string): Entry => ({
  name: "META-INF/container.xml",
  content: `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${opf}" media-type="application/oebps-package+xml"/></rootfiles></container>`,
});

export const page = (title: string, body: string, head = "") => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title>${head}</head><body>${body}</body></html>`;

/** A drawing with nothing in it that could act. */
export const plainSvg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- a hut -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>A hut</title><path d="M2 18V9l8-7 8 7v9z"/></svg>`;

/** The same drawing carrying a script, as a hostile book might. */
export const scriptedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><script>fetch("/api/documents")</script><path d="M2 18V9l8-7 8 7v9z"/></svg>`;

export interface Epub3Options {
  /** Extra entries, added after the book's own. */
  extra?: Entry[];
  /** Replaces the first chapter's body. */
  firstChapter?: string;
  /** Extra `<meta>` lines for the package metadata. */
  metadata?: string;
}

/**
 * "The Hut Book": an EPUB 3 in a folder of its own inside the archive, with a nested
 * table of contents, a cover, pictures, links between chapters, notes and a table.
 */
export function hutBook(options: Epub3Options = {}): Promise<Buffer> {
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:00000000-0000-0000-0000-00000000b003</dc:identifier>
    <dc:title>The Hut Book</dc:title>
    <dc:creator>Mara Ellison</dc:creator>
    <dc:language>en-GB</dc:language>
    ${options.metadata ?? ""}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/>
    <item id="hut" href="images/hut.svg" media-type="image/svg+xml"/>
    <item id="c1" href="text/arriving.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/stove.xhtml" media-type="application/xhtml+xml" properties="scripted"/>
    <item id="c3" href="text/leaving.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="nav"/>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="c3" linear="no"/>
  </spine>
</package>`;

  const nav = page(
    "Contents",
    `<nav epub:type="landmarks"><ol><li><a href="text/arriving.xhtml">Start</a></li></ol></nav>
     <nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
       <li><a href="text/arriving.xhtml">Arriving</a>
         <ol><li><a href="text/arriving.xhtml#the.door">The door</a></li></ol>
       </li>
       <li><span>Living there</span>
         <ol><li><a href="text/stove.xhtml">The <em>stove</em></a></li></ol>
       </li>
       <li><a href="text/leaving.xhtml#last">Leaving</a></li>
     </ol></nav>`,
  );

  const arriving =
    options.firstChapter ??
    `<h1 id="top">Arriving</h1>
     <p class="first">You reach the hut <em>late</em>, with <strong>wet boots</strong> and a <a href="stove.xhtml#lighting">cold stove</a> ahead of you.<a epub:type="noteref" href="#n1" id="r1"><sup>1</sup></a></p>
     <h2 id="the.door">The door</h2>
     <p>The key hangs <i>inside</i> the wood store. See <a href="#top">the start</a>, <a href="../nav.xhtml">the contents</a>,
        <a href="https://example.org/huts?x=1">the hut register</a>, <a href="javascript:alert(1)" onclick="steal()">a trick</a>
        and <a href="#nowhere">a dead end</a>.</p>
     <div class="plate"><img src="../images/cover.png" alt="The hut at dusk" onerror="steal()"/></div>
     <figure><img src="../images/hut.svg" alt="Plan of the hut"/><figcaption>One room, one <b>stove</b>.</figcaption></figure>
     <p>A sign <img src="../images/cover.png" alt="no fires"/> is nailed up, and a picture from <img src="https://example.org/x.png" alt="the valley"/> far away.</p>
     <blockquote><p>Leave it better than you found it.</p></blockquote>
     <ul><li>Sweep the floor</li><li><p>Split kindling</p><ol start="3"><li>dry</li><li>small</li></ol></li></ul>
     <aside epub:type="footnote" id="n1"><p>1. Boots dry best away from the stove. <a href="#r1">Back</a></p></aside>`;

  const stove = `<h1>The stove</h1>
     <script>document.title = "pwned"</script>
     <p id="lighting" style="color:red">Open the damper first.</p>
     <table><caption>Burn times</caption>
       <thead><tr><th>Wood</th><th>Hours</th></tr></thead>
       <tbody><tr><td>Birch</td><td>2</td></tr><tr><td>Oak</td></tr></tbody>
     </table>
     <table><tr><td>Pine</td><td>1</td></tr></table>
     <pre><code>damper: open
door:   ajar</code></pre>
     <p>Water is H<sub>2</sub>O and boils when <math xmlns="http://www.w3.org/1998/Math/MathML" alttext="T = 100"><mi>T</mi><mo>=</mo><mn>100</mn></math>.</p>
     <video src="fire.mp4" controls="controls"><p>A film of the fire.</p></video>
     <hr/>
     <dl><dt>Damper</dt><dd>The plate in the flue.</dd></dl>
     <div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>Flue diagram</title><circle r="4"/></svg></div>
     <div><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../images/cover.png" width="10" height="10"/></svg></div>
     <form action="https://example.org/steal"><input name="q"/><button>Send</button></form>`;

  const leaving = `<h1>Leaving</h1><p id="last">Close the shutters. Go back to <a href="arriving.xhtml">the beginning</a>.</p>`;

  return buildZip([
    MIMETYPE,
    container("OEBPS/book.opf"),
    { name: "OEBPS/book.opf", content: opf },
    { name: "OEBPS/nav.xhtml", content: nav },
    { name: "OEBPS/style.css", content: "body { background: url(https://example.org/track.png) }" },
    { name: "OEBPS/images/cover.png", content: tinyPng },
    { name: "OEBPS/images/hut.svg", content: plainSvg },
    {
      name: "OEBPS/text/arriving.xhtml",
      content: page("Arriving", arriving, '<link rel="stylesheet" href="../style.css"/><style>p{display:none}</style>'),
    },
    { name: "OEBPS/text/stove.xhtml", content: page("The stove", stove, '<script src="reader.js"/>') },
    { name: "OEBPS/text/leaving.xhtml", content: page("Leaving", leaving) },
    ...(options.extra ?? []),
  ]);
}

/** "Tide Tables for Walkers": an EPUB 2 with an NCX, a cover named in the metadata, and its files at the top of the archive. */
export function tideBook(): Promise<Buffer> {
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="id">urn:uuid:00000000-0000-0000-0000-00000000b002</dc:identifier>
    <dc:title>Tide Tables for Walkers</dc:title>
    <dc:creator opf:role="aut">Owen Pryce</dc:creator>
    <dc:language>en</dc:language>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover-image" href="cover.png" media-type="image/png"/>
    <item id="title" href="title.html" media-type="application/xhtml+xml"/>
    <item id="one" href="crossing%20sands.html" media-type="application/xhtml+xml"/>
    <item id="two" href="springs.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="title"/>
    <itemref idref="one"/>
    <itemref idref="two"/>
  </spine>
  <guide><reference type="cover" title="Cover" href="title.html"/></guide>
</package>`;
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:00000000-0000-0000-0000-00000000b002"/></head>
  <docTitle><text>Tide Tables for Walkers</text></docTitle>
  <navMap>
    <navPoint id="n1" playOrder="1"><navLabel><text>Crossing the sands</text></navLabel><content src="crossing%20sands.html"/>
      <navPoint id="n2" playOrder="2"><navLabel><text>When to set out</text></navLabel><content src="crossing%20sands.html#when"/></navPoint>
    </navPoint>
    <navPoint id="n3" playOrder="3"><navLabel><text>Springs and neaps</text></navLabel><content src="springs.html"/></navPoint>
  </navMap>
</ncx>`;
  return buildZip([
    MIMETYPE,
    container("book.opf"),
    { name: "book.opf", content: opf },
    { name: "toc.ncx", content: ncx },
    { name: "cover.png", content: tinyPng },
    { name: "title.html", content: page("Title page", '<div><img src="cover.png" alt=""/></div><p>A pocket guide.</p>') },
    {
      name: "crossing sands.html",
      content: page(
        "Crossing the sands",
        '<h2>Crossing the sands</h2><p>Never cross on a rising tide.</p><h3><a name="when"/>When to set out</h3><p>Two hours after high water, and see <a href="springs.html">springs and neaps</a>.</p>',
      ),
    },
    { name: "springs.html", content: page("Springs and neaps", "<h2>Springs and neaps</h2><p>Spring tides run fastest.</p>") },
  ]);
}

/** The EPUB 3 book with an `encryption.xml` written by the given lines. */
export const withEncryption = (lines: string, extra: Entry[] = []) =>
  hutBook({
    extra: [
      {
        name: "META-INF/encryption.xml",
        content: `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">${lines}</encryption>`,
      },
      ...extra,
    ],
  });

export const encrypted = (algorithm: string, uri: string) =>
  `<enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/><enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData>`;
