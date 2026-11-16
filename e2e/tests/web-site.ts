/**
 * A small web site for the tests of "Save a web page", served by the test itself on
 * this machine. The Outpost under test fetches from it; the browser never does.
 */
import http from "node:http";
import zlib from "node:zlib";

/** One port past the stand-ins the suite already starts (see playwright.config.ts). */
export const SITE_PORT = Number(process.env.OUTPOST_E2E_SITE_PORT ?? Number(process.env.OUTPOST_E2E_PORT ?? 8471) + 5);
export const SITE = `http://127.0.0.1:${SITE_PORT}`;

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A real PNG, one grey all over. */
export function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8);
  const rows = Buffer.alloc((width + 1) * height, 0x80);
  for (let row = 0; row < height; row += 1) rows[row * (width + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const article = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <title>Splicing a guy line | The Bothy Journal</title>
  <meta property="og:site_name" content="The Bothy Journal">
  <meta name="author" content="Ishbel Crane">
  <script src="https://tracker.example/collect.js"></script>
  <style>.never { color: red }</style>
</head>
<body>
  <header><nav><a href="/">Home</a> <a href="/gear">Gear reviews</a> <a href="/subscribe">Subscribe now</a></nav></header>
  <main>
    <article>
      <h1>Splicing a guy line</h1>
      <div class="share-bar"><a href="https://social.example/share">Share this on Chirper</a></div>
      <p>A guy line that has frayed through at the peg can be spliced in a few minutes, and a spliced line is stronger than one that has been knotted back together, because a knot bends the fibres sharply and a splice does not.</p>
      <p>Unlay about a hand's width of each end, marry the two ends so that the strands alternate, and tuck each strand over one and under one, working against the lay of the rope. Three tucks each way is enough for a tent; five for anything you would hang from.</p>
      <h2>What you need</h2>
      <ul><li>A fid or a blunt tent peg</li><li>Whipping twine</li><li>A sharp knife</li></ul>
      <figure><img src="/img/splice.png" alt="A finished short splice" width="320" height="200"><figcaption>The finished splice, before it is rolled underfoot.</figcaption></figure>
      <table><thead><tr><th>Rope</th><th>Tucks</th></tr></thead><tbody><tr><td>Three-strand polyester</td><td>Three</td></tr><tr><td>Three-strand nylon</td><td>Five</td></tr></tbody></table>
      <p>Roll the finished splice under your boot to settle it, then trim the ends, leaving a little standing proud so that they cannot pull back through. A splice made this way holds zygodactyl-strong, which is a word chosen so that a search for it finds this page and no other.</p>
      <iframe src="https://video.example/embed/1"></iframe>
      <script>document.title = "changed by a script"; window.ranAScript = true;</script>
    </article>
    <aside><h2>Most read this week</h2><ol><li><a href="/a">Ten tarps we love</a></li><li><a href="/b">Midges: a reckoning</a></li></ol></aside>
  </main>
  <footer><p>Copyright The Bothy Journal. <a href="/privacy">Privacy policy</a></p></footer>
</body>
</html>`;

const scriptOnly = `<!doctype html><html><head><meta charset="utf-8"><title>Dashboard</title></head>
<body><div id="root"></div><noscript>You need to enable JavaScript to run this app.</noscript><script src="/static/main.js"></script></body></html>`;

export interface WebSite {
  /** Paths asked for, in order. */
  requests: string[];
  close(): Promise<void>;
}

export async function startWebSite(): Promise<WebSite> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    requests.push(path);
    if (path === "/journal/splicing") return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(article);
    if (path === "/app") return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(scriptOnly);
    if (path === "/img/splice.png") return void res.writeHead(200, { "content-type": "image/png" }).end(png(320, 200));
    res.writeHead(404, { "content-type": "text/html" }).end("<h1>Not found</h1>");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(SITE_PORT, "127.0.0.1", () => resolve());
  });
  return {
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
