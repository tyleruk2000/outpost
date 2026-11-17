/**
 * A small course archive for the tests of learning progress, served by the stand-in
 * for kiwix-serve beside the documents archive (nautilus-archive.ts calls `serveCourse`).
 *
 * It is not a copy of Khan Academy or of any archive: every page and word was written
 * for these tests, and no real course archive was opened to make it. It has the shape
 * such an archive is described as having, and nothing more particular: a first page
 * that lists subjects, topic pages that list lessons, lesson pages, a page with a video,
 * a menu of links on every page, and one topic whose list is drawn by a script after the
 * page has loaded (which the reader cannot read, so it must fall back to "pages done").
 *
 *   /content/<book>                     redirects to the first page, `index`
 *   /content/<book>/index               "Number school": links to two topics and the menu
 *   /content/<book>/topics/fractions    three lessons, one of them a video
 *   /content/<book>/topics/shapes       two lessons
 *   /content/<book>/topics/practice     its list is drawn by a script after loading
 *   /content/<book>/lessons/…           lesson pages, each linking to the next
 *   /content/<book>/videos/adding-fractions  a page whose <video> plays half a second of tone
 *   /content/<book>/media/tone.wav      that tone (Chromium plays a WAV file in a <video>)
 */
import type http from "node:http";

export const COURSE_BOOK = "number-school_en_all_2026-11";
export const COURSE_UUID = "7a1e2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
export const COURSE_TITLE = "Number school";
/** The archive's own name, which progress is kept under. */
export const COURSE_NAME = "number-school_en_all";

/** Half a second of a 440 Hz tone at 8 kHz: the smallest thing a browser will play. */
function tone(): Buffer {
  const rate = 8000;
  const samples = Buffer.alloc(rate / 2);
  for (let i = 0; i < samples.length; i += 1) samples[i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * i) / rate));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + samples.length, 4);
  header.write("WAVEfmt ", 8, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

/** The pages of the archive by their address inside it, each with its title and its body. */
export const COURSE_PAGES: Record<string, { title: string; body: string }> = {
  index: {
    title: "Number school",
    body: `<h1>Number school</h1><p>Pick a topic.</p><ul><li><a href="topics/fractions">Fractions</a></li><li><a href="topics/shapes">Shapes</a></li><li><a href="topics/practice">Practice</a></li></ul>`,
  },
  "topics/fractions": {
    title: "Fractions",
    body: `<h1>Fractions</h1><ol><li><a href="../lessons/halves">Halves</a></li><li><a href="../lessons/quarters">Quarters</a></li><li><a href="../videos/adding-fractions">Adding fractions (video)</a></li></ol><p><a href="../index">All topics</a></p>`,
  },
  "topics/shapes": {
    title: "Shapes",
    body: `<h1>Shapes</h1><ol><li><a href="../lessons/triangles">Triangles</a></li><li><a href="../lessons/squares">Squares</a></li></ol>`,
  },
  "topics/practice": {
    title: "Practice",
    // Drawn after the page has loaded, as an archive that builds its pages with a script does.
    body: `<h1>Practice</h1><ol id="list"></ol><script>setTimeout(function(){var l=document.getElementById("list");["halves","quarters"].forEach(function(n){var i=document.createElement("li"),a=document.createElement("a");a.href="../lessons/"+n;a.textContent=n;i.appendChild(a);l.appendChild(i)})},50)</script>`,
  },
  "lessons/halves": {
    title: "Halves",
    body: `<h1>Halves</h1><p>Cut a cake into two equal pieces: each is one half.</p><p><a href="quarters">Next: Quarters</a> · <a href="../topics/fractions">Back to Fractions</a></p>`,
  },
  "lessons/quarters": {
    title: "Quarters",
    body: `<h1>Quarters</h1><p>Cut each half in two again: four quarters.</p><p><a href="../videos/adding-fractions">Next: Adding fractions</a> · <a href="../topics/fractions">Back to Fractions</a></p>`,
  },
  "videos/adding-fractions": {
    title: "Adding fractions",
    body: `<h1>Adding fractions</h1><video src="../media/tone.wav" controls preload="auto"></video><p><a href="../topics/fractions">Back to Fractions</a></p>`,
  },
  "lessons/triangles": { title: "Triangles", body: `<h1>Triangles</h1><p>Three sides.</p><p><a href="squares">Next: Squares</a></p>` },
  "lessons/squares": { title: "Squares", body: `<h1>Squares</h1><p>Four equal sides.</p>` },
  about: { title: "About Number school", body: `<h1>About</h1><p>Written for Outpost's tests.</p>` },
};

/** The menu every page carries, as sites do: the first page and "About". */
function page(path: string, title: string, body: string): string {
  const up = "../".repeat(path.split("/").length - 1);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
  </head>
  <body>
    <nav><a href="${up}index">Number school</a> · <a href="${up}about">About</a></nav>
    ${body}
  </body>
</html>
`;
}

const META: Record<string, string> = {
  Title: COURSE_TITLE,
  Description: "A made-up course for tests",
  Language: "eng",
  Name: COURSE_NAME,
  Date: "2026-11-17",
  Creator: "Outpost tests",
  Publisher: "Outpost tests",
  Counter: "text/html=10;audio/wav=1",
  Tags: "_category:other",
};

const TONE = tone();

/** Answers a request for the course archive, if it is one; says whether it did. */
export function serveCourse(request: http.IncomingMessage, response: http.ServerResponse): boolean {
  const url = request.url ?? "";
  const root = `/content/${COURSE_BOOK}`;
  const send = (type: string, body: string | Buffer, status = 200) => {
    response.statusCode = status;
    response.setHeader("Content-Type", type);
    response.setHeader("Content-Length", Buffer.byteLength(body));
    response.end(request.method === "HEAD" ? undefined : body);
  };
  const meta = new RegExp(`^/raw/${COURSE_BOOK}/meta/(\\w+)$`).exec(url);
  if (meta) {
    const value = META[meta[1]!];
    if (value === undefined) send("text/html", "<html><body>Not found</body></html>", 404);
    else send("text/plain", value);
    return true;
  }
  if (url === root || url === `${root}/`) {
    response.statusCode = 302;
    response.setHeader("Location", `${root}/index`);
    response.end();
    return true;
  }
  if (!url.startsWith(`${root}/`)) return false;
  // kiwix-serve sends its own, weaker, sandbox policy; Outpost must replace it.
  response.setHeader("Content-Security-Policy", "default-src 'self'; sandbox allow-scripts allow-same-origin;");
  const inside = decodeURIComponent(url.slice(root.length + 1).split("?")[0]!);
  if (inside === "media/tone.wav") {
    send("audio/wav", TONE);
    return true;
  }
  const found = COURSE_PAGES[inside];
  if (!found) send("text/html", "<html><body>Not found</body></html>", 404);
  else send("text/html; charset=utf-8", page(inside, found.title, found.body));
  return true;
}
