/**
 * A stand-in for kiwix-serve holding one archive of the kind openZIM's "nautilus" makes:
 * a collection of files with a list of them, and not a web site of pages.
 *
 * It exists because the tests must not carry a real archive or reach the internet. Its
 * shape was taken from nautilus's source (github.com/openzim/nautilus, v1.2.1) and from
 * one real archive read through kiwix-serve 3.8 on 2026-11-16:
 *
 *   /content/<book>            redirects to the first page, `home`
 *   /content/<book>/home       a page with an empty <ul id="doc-list"> that loads nautilus.js
 *   /content/<book>/nautilus.js  opens a browser database before anything else, as the real
 *                              script does through PouchDB, then draws the list from database.js
 *   /content/<book>/database.js  `var DATABASE = [ … ];`, each entry written the way Python
 *                              prints a dictionary, which is how nautilus writes it
 *   /content/<book>/files/…    the files the list names
 *   /content/<book>/app        a page that is a small web app: a module script that fetches a data file
 *   /content/<book>/guide      an ordinary page that links to three of those files, as a page of an
 *                              archive made from a web site does. nautilus writes no such page; it is
 *                              here so that one stand-in serves the tests of both kinds of archive
 *
 * Nothing here is copied from nautilus or from any archive: the page, the script, the
 * documents and their words were written for these tests.
 *
 * Run directly it listens on the port given: `node nautilus-archive.ts 8475`. `/health`
 * answers when it is up. `/control?delay=<ms>&missing=<file name>` makes its files slow to
 * arrive, or one of them absent, for a test that drives it from outside; `/control` alone
 * puts it back as it was.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { buildPdf } from "./fixtures/documents/builders.ts";

export const NAUTILUS_BOOK = "field-library_en_2026-11";
export const NAUTILUS_UUID = "5d1c0b6e-2f3a-4c7d-9e8f-0a1b2c3d4e5f";

/** Searching the archive for this word takes `SLOW_DELAY_MS` and finds one article; any other word finds nothing at once. */
export const SLOW_WORD = "slowcoach";
export const SLOW_ARTICLE = "The slowcoach of the shelf";
export const SLOW_DELAY_MS = 2500;

export interface ListedDocument {
  title: string;
  description: string;
  authors: string;
  files: string[];
}

/** What the archive lists. Titles and files are made up; the awkward names are on purpose. */
export const NAUTILUS_DOCUMENTS: ListedDocument[] = [
  { title: "Boiling water to make it safe", description: "Water: how long to boil", authors: "Outpost tests", files: ["Water (1).pdf"] },
  {
    title: "A camper's rocket stove",
    description: "Cooking: built from six bricks",
    authors: "Outpost tests",
    files: ["stoves/rocket stove.pdf"],
  },
  {
    title: "Sütterlin für Anfänger — 初級",
    description: "Schrift & Zeichen",
    authors: "Élodie Müller",
    files: ["Schrift & Zeichen #1?.pdf"],
  },
  {
    title: "Radio check procedure",
    description: "Radio: the words, and how they sound",
    authors: "Outpost tests",
    files: ["Radio check.pdf", "Radio check.wav"],
  },
  { title: "Signal whistle", description: "Three blasts, repeated", authors: "", files: ["whistle.wav"] },
  { title: "Kit list", description: "A table to fill in", authors: "Outpost tests", files: ["kit list.ods"] },
  { title: "Purifying water with bleach", description: "Water: drops per litre", authors: "Outpost tests", files: ["Water (2).pdf"] },
  {
    title: "Finding north without a compass",
    description: "Navigation: the sun, a stick and a watch",
    authors: "Outpost tests",
    files: ["north.pdf"],
  },
  { title: "Splinting a forearm", description: "First aid", authors: "Outpost tests", files: ["first aid/splint.pdf"] },
  { title: "Storing grain for a year", description: 'Food: "dry, dark and cool"', authors: "Outpost tests", files: ["grain.pdf"] },
  // A name that tries to climb out of the files folder. Outpost must leave the entry out.
  { title: "Climbs out", description: "", authors: "", files: ["../../raw/elsewhere"] },
];

/** Writes a value the way Python's `str()` does, for the kinds of value a list holds. */
export function pythonRepr(value: string | string[] | Record<string, string | string[]>): string {
  if (Array.isArray(value)) return `[${value.map(pythonRepr).join(", ")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .map(([key, item]) => `${pythonRepr(key)}: ${pythonRepr(item)}`)
      .join(", ")}}`;
  }
  // Python prefers single quotes, and switches to double when the text holds a single quote and no double one.
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  const body = value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replaceAll(quote, `\\${quote}`);
  return `${quote}${body}${quote}`;
}

/** The text of a database.js listing these documents, as nautilus would have written it. */
export function databaseJs(documents: ListedDocument[]): string {
  const lines = documents.map(
    (document, index) =>
      `${pythonRepr({
        _id: String(index).padStart(5, "0"),
        ti: document.title,
        dsc: document.description,
        aut: document.authors,
        fp: document.files,
      })},\n`,
  );
  return `var DATABASE = [\n${lines.join("")}];\n`;
}

/** Half a second of a 440 Hz tone: the smallest thing a browser will play. */
function tone(): Buffer {
  const rate = 8000;
  const samples = Buffer.alloc(rate / 2);
  for (let i = 0; i < samples.length; i += 1) samples[i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * i) / rate));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + samples.length, 4);
  header.write("WAVEfmt ", 8, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // one channel
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

const HOME = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Field library</title>
  </head>
  <body>
    <h1>Field library</h1>
    <ul id="doc-list"></ul>
    <p id="loader">Loading…</p>
    <script src="nautilus.js"></script>
  </body>
</html>
`;

/** The files the ordinary page links to, with the words of each link. */
export const GUIDE_LINKS: Array<{ file: string; text: string }> = [
  { file: "north.pdf", text: "Finding north without a compass" },
  { file: "grain.pdf", text: "Storing grain for a year" },
  { file: "first aid/splint.pdf", text: "Splinting a forearm" },
];

/**
 * A page that is a small web app, as the archives of video channels are: its code is a
 * module script and it draws itself from a data file it fetches. In Outpost's sandbox both
 * are requests from another origin, which the browser keeps from the page unless the
 * proxy says the page may read its own archive's files.
 */
const APP_PAGE = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Channel</title>
    <script type="module" crossorigin src="./assets/app.js"></script>
  </head>
  <body><div id="app">Loading…</div></body>
</html>`;
const APP_SCRIPT = `// As a request library does before every request, and as an app does to remember a choice:
// in a sandbox each of these throws unless the reader has put a stand-in there.
const seen = document.cookie.length;
localStorage.setItem("seen", String(seen));
sessionStorage.setItem("lang", "en");
if (localStorage.getItem("seen") !== "0" || sessionStorage.getItem("lang") !== "en" || localStorage.length !== 1) throw new Error("storage");
const data = await (await fetch(new URL("../app-data.json", import.meta.url))).json();
document.getElementById("app").innerHTML = "<h1>" + data.title + "</h1>";`;
const APP_DATA = JSON.stringify({ title: "Winter prepping videos" });

const GUIDE = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Where to start</title>
  </head>
  <body>
    <h1>Where to start</h1>
    <p>Three things to read first.</p>
    <ul>
${GUIDE_LINKS.map((link) => `      <li><a href="files/${link.file.split("/").map(encodeURIComponent).join("/")}">${link.text}</a></li>`).join("\n")}
    </ul>
  </body>
</html>
`;

// Like the real script, this cannot draw anything until the browser gives it a database.
const SCRIPT = `var request = indexedDB.open("field_library_db");
request.onsuccess = function () {
  var script = document.createElement("script");
  script.src = "database.js";
  script.onload = function () {
    var list = document.getElementById("doc-list");
    DATABASE.forEach(function (entry) {
      var item = document.createElement("li");
      var link = document.createElement("a");
      link.href = "files/" + encodeURIComponent(entry.fp[0]);
      link.textContent = entry.ti;
      item.appendChild(link);
      list.appendChild(item);
    });
    document.getElementById("loader").remove();
  };
  document.body.appendChild(script);
};
`;

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  wav: "audio/wav",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

/** Bytes that pass for the start of a ZIM archive: magic number, version, UUID. */
export function zimHeader(uuid = NAUTILUS_UUID): Buffer {
  const header = Buffer.alloc(80);
  header.writeUInt32LE(0x044d495a, 0);
  header.writeUInt16LE(6, 4);
  header.writeUInt16LE(3, 6);
  Buffer.from(uuid.replace(/-/g, ""), "hex").copy(header, 8);
  return header;
}

export interface NautilusArchive {
  url: string;
  /** Every address asked for, in order, except those asked only for their headers. */
  requests: string[];
  /** Addresses asked for with HEAD: how large a file is, without the file. */
  heads: string[];
  /** How long each file takes to begin arriving, in milliseconds. */
  fileDelayMs: number;
  /** Names of listed files the archive does not hold after all. */
  missing: Set<string>;
  /** The length a file is said to have when only its headers are asked for, by name, in place of its real one. */
  saysOnHead: Map<string, number>;
  /** The same for when the file itself is asked for. */
  saysOnGet: Map<string, number>;
  /** What database.js holds. Set it to try another list; undefined makes the file missing. */
  database: string | Buffer | undefined;
  /** The first page. Set it to stand in for an ordinary archive. */
  home: string;
  close(): Promise<void>;
}

export async function startNautilusArchive(options: { port?: number } = {}): Promise<NautilusArchive> {
  const meta: Record<string, string> = {
    Title: "Field library",
    Description: "Documents for tests",
    Language: "eng",
    Name: "field-library_en",
    Date: "2026-11-16",
    Creator: "Outpost tests",
    Publisher: "Outpost tests",
    Counter: "application/pdf=8;text/html=1",
    Tags: "nautilus",
  };
  const files = new Map<string, Buffer>();
  for (const document of NAUTILUS_DOCUMENTS) {
    for (const name of document.files) {
      const extension = name.split(".").pop() ?? "";
      if (extension === "pdf") files.set(name, buildPdf([[document.title, `${document.description}.`, "Written for Outpost's tests."]]));
      else if (extension === "wav") files.set(name, tone());
      else if (extension === "ods") files.set(name, Buffer.from("PK\u0003\u0004 a stand-in for a spreadsheet"));
    }
  }

  const archive: NautilusArchive = {
    url: "",
    requests: [],
    heads: [],
    fileDelayMs: 0,
    missing: new Set(),
    saysOnHead: new Map(),
    saysOnGet: new Map(),
    database: databaseJs(NAUTILUS_DOCUMENTS),
    home: HOME,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  const root = `/content/${NAUTILUS_BOOK}`;

  const server = http.createServer((request, response) => {
    const url = request.url ?? "";
    if (url === "/health") return response.end("ok");
    if (url.startsWith("/control")) {
      const asked = new URL(url, "http://kiwix").searchParams;
      archive.fileDelayMs = Number(asked.get("delay")) || 0;
      archive.missing = new Set(asked.getAll("missing"));
      return response.end("ok");
    }
    const head = request.method === "HEAD";
    (head ? archive.heads : archive.requests).push(url);
    // kiwix-serve sends its own, weaker, sandbox policy; Outpost must replace it.
    response.setHeader("Content-Security-Policy", "default-src 'self'; sandbox allow-scripts allow-same-origin;");
    const send = (type: string, body: string | Buffer) => {
      response.setHeader("Content-Type", type);
      response.setHeader("Content-Length", Buffer.byteLength(body));
      response.end(body);
    };
    const missing = () => {
      response.statusCode = 404;
      send("text/html", "<html><body>Not found</body></html>");
    };
    if (url === "/catalog/v2/root.xml") return send("application/xml", "<feed/>");
    const metaMatch = new RegExp(`^/raw/${NAUTILUS_BOOK}/meta/(\\w+)$`).exec(url);
    if (metaMatch) {
      const value = meta[metaMatch[1]!];
      return value === undefined ? missing() : send("text/plain", value);
    }
    if (url.startsWith("/search?")) {
      const nothing =
        '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel><opensearch:totalResults>0</opensearch:totalResults></channel></rss>';
      // One word is found, slowly, as an archive on a network share is: for the tests of search answering in two parts.
      if (new URL(url, "http://kiwix").searchParams.get("pattern")?.toLowerCase() !== SLOW_WORD) return send("application/xml", nothing);
      setTimeout(() => {
        if (response.destroyed) return;
        send(
          "application/xml",
          `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel><opensearch:totalResults>1</opensearch:totalResults><item><title>${SLOW_ARTICLE}</title><link>${root}/home</link><description>...kept on a slow shelf, the <b>${SLOW_WORD}</b> arrives late...</description></item></channel></rss>`,
        );
      }, SLOW_DELAY_MS);
      return;
    }
    if (url.startsWith("/suggest?")) return send("application/json", "[]");
    if (url === root || url === `${root}/`) {
      response.statusCode = 302;
      response.setHeader("Location", `${root}/home`);
      return response.end();
    }
    if (!url.startsWith(`${root}/`)) return missing();
    let inside: string;
    try {
      inside = decodeURIComponent(url.slice(root.length + 1).split("?")[0]!);
    } catch {
      return missing();
    }
    if (inside === "home") return send("text/html; charset=utf-8", archive.home);
    if (inside === "guide") return send("text/html; charset=utf-8", GUIDE);
    if (inside === "app") return send("text/html; charset=utf-8", APP_PAGE);
    if (inside === "assets/app.js") return send("text/javascript", APP_SCRIPT);
    if (inside === "app-data.json") return send("application/json", APP_DATA);
    if (inside === "nautilus.js") return send("text/javascript", SCRIPT);
    if (inside === "database.js") return archive.database === undefined ? missing() : send("text/javascript", archive.database);
    const name = inside.startsWith("files/") ? inside.slice("files/".length) : "";
    const file = archive.missing.has(name) ? undefined : files.get(name);
    if (!file) return missing();
    const type = TYPES[inside.split(".").pop() ?? ""] ?? "application/octet-stream";
    const said = (head ? archive.saysOnHead : archive.saysOnGet).get(name);
    const deliver = () => {
      if (response.destroyed) return;
      if (said === undefined) return send(type, file);
      response.setHeader("Content-Type", type);
      response.setHeader("Content-Length", said);
      response.end(head ? undefined : file);
    };
    if (head || archive.fileDelayMs <= 0) return deliver();
    setTimeout(deliver, archive.fileDelayMs);
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  archive.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return archive;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const archive = await startNautilusArchive({ port: Number(process.argv[2] ?? 8475) });
  console.log(`nautilus archive stand-in on ${archive.url}`);
}
