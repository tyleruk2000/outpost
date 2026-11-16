/** Pages and pictures for the tests of saving a web page. Everything here is made up for the tests. */
import zlib from "node:zlib";

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * A real PNG of the given size, in one grey. `padBytes` adds that many bytes of text
 * the picture does not need, to make a file of a chosen size without a huge picture.
 */
export function png(width: number, height: number, padBytes = 0): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8); // 8 bits, greyscale
  const rows = Buffer.alloc((width + 1) * height, 0x80);
  for (let row = 0; row < height; row += 1) rows[row * (width + 1)] = 0;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header)];
  if (padBytes > 0) parts.push(chunk("tEXt", Buffer.concat([Buffer.from("Comment\0", "latin1"), Buffer.alloc(padBytes, 0x61)])));
  parts.push(chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

const sentences = [
  "A rain barrel fills faster than most people expect, because a roof is a large surface and even a light shower puts a good deal of water on it.",
  "The first water off a roof carries dust, leaves and whatever the birds left behind, so a diverter sends those first few litres away from the barrel.",
  "Stored water should be kept dark and covered, which stops algae from growing and keeps mosquitoes from laying their eggs in it.",
  "Before drinking it, bring the water to a rolling boil for one minute, or for three minutes if you are high in the mountains.",
  "A barrel raised on blocks gives enough pressure to fill a watering can, though not enough to run a hose any distance.",
];

/** Ordinary paragraphs of running text. */
export function paragraphs(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `<p>${sentences[index % sentences.length]} ${sentences[(index + 2) % sentences.length]}</p>`,
  ).join("\n");
}

/** An article with everything a real one has around it: menus, a sidebar, sharing buttons, scripts, a frame, a footer. */
export function articlePage(options: { pictures?: string; extra?: string } = {}): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <title>Collecting rainwater | The Allotment Gazette</title>
  <meta property="og:title" content="Collecting rainwater">
  <meta property="og:site_name" content="The Allotment Gazette">
  <meta name="author" content="Mabel Thorne">
  <meta property="article:published_time" content="2026-03-09T08:30:00Z">
  <link rel="stylesheet" href="/site.css">
  <style>body { background: red } .secret-style-rule { color: blue }</style>
  <script src="https://tracker.example/collect.js"></script>
  <script>window.dataLayer = []; trackVisitor("secret-script-text");</script>
</head>
<body>
  <header class="site-header">
    <a href="/">The Allotment Gazette</a>
    <nav><ul><li><a href="/news">News desk</a></li><li><a href="/sport">Sport pages</a></li><li><a href="/subscribe">Subscribe today</a></li></ul></nav>
  </header>
  <div class="cookie-banner">We use cookies to improve your experience. <button>Accept all cookies</button></div>
  <div class="layout">
    <main>
      <article class="post">
        <h1>Collecting rainwater</h1>
        <p class="byline">By Mabel Thorne</p>
        <div class="share-buttons"><a href="https://social.example/share?u=1">Share on Chirper</a> <a href="https://social.example/share?u=2">Share on Facepage</a></div>
        <p>${sentences[0]} <a href="/guides/roofs">Read about roofs</a>, or write to <a href="mailto:mabel@gazette.example">the author</a>.</p>
        <p>${sentences[1]} The <strong>diverter</strong> is the part <em>most</em> people leave out.</p>
        <h2>What you need</h2>
        <ul><li>A food-grade barrel with a lid</li><li>A diverter for the downpipe</li><li>Four concrete blocks</li></ul>
        <blockquote><p>Water is the one thing you cannot improvise.</p></blockquote>
        ${options.pictures ?? ""}
        <h2>How much to expect</h2>
        <table>
          <thead><tr><th>Roof area</th><th>Rain</th><th>Water collected</th></tr></thead>
          <tbody><tr><td>20 m<sup>2</sup></td><td>10 mm</td><td>180 litres</td></tr><tr><td>50 m<sup>2</sup></td><td>10 mm</td><td>450 litres</td></tr></tbody>
        </table>
        <p>${sentences[2]} ${sentences[3]}</p>
        <pre><code class="language-python">litres = area_m2 * rain_mm * 0.9
print(litres)
</code></pre>
        <p>${sentences[4]} A <a href="javascript:alert('secret-link-script')">dangerous link</a> keeps only its words, and <a href="#how-much-to-expect">this one</a> stays on the page.</p>
        <iframe src="https://video.example/embed/secret-frame"></iframe>
        <form action="/newsletter"><label>Email for our newsletter <input type="email" name="email"></label><button>Sign me up</button></form>
        ${options.extra ?? ""}
      </article>
      <section class="related-posts"><h2>Related articles</h2><ul><li><a href="/a">Ten sheds we love</a></li><li><a href="/b">Compost in a hurry</a></li><li><a href="/c">Slugs: a reckoning</a></li></ul></section>
      <div id="comments"><h2>Comments</h2><p>First! Great article, thanks for sharing this with everybody.</p></div>
    </main>
    <aside class="sidebar"><h2>Most read</h2><ol><li><a href="/x">Why your leeks bolted</a></li><li><a href="/y">The great marrow scandal</a></li></ol></aside>
  </div>
  <footer><p>Copyright The Allotment Gazette. <a href="/privacy">Privacy policy</a> <a href="/terms">Terms of use</a></p></footer>
  <img src="https://tracker.example/pixel.gif?visitor=secret-pixel" width="1" height="1" alt="">
  <script>secretInlineScript()</script>
</body>
</html>`;
}

/** A page that is nothing until its script runs. */
export const scriptOnlyPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Dashboard</title></head>
<body><div id="root"></div><noscript>You need to enable JavaScript to run this app.</noscript>
<script src="/static/js/main.4f2a.js"></script></body></html>`;

/** A page that only asks for a password. */
export const signInPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>Sign in</title></head>
<body><main><h1>Sign in to continue</h1><form method="post"><label>Email <input type="email" name="e"></label>
<label>Password <input type="password" name="p"></label><button>Sign in</button></form></main></body></html>`;
