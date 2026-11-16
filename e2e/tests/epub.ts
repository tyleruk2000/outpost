/**
 * Small EPUB books for the end-to-end tests, built in memory from text written for
 * these tests. A zip needs no compression to be a zip, so the entries are stored as they are.
 */
import zlib from "node:zlib";

interface Entry {
  name: string;
  content: string | Buffer;
}

/** A zip archive with every entry stored uncompressed, in the order given. */
export function storedZip(entries: Entry[]): Buffer {
  const files: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, "utf8");
    const crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    files.push(local, name, data);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directoryBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, directoryBytes, end]);
}

/** Smallest valid PNG: one transparent pixel. */
const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const page = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title>
<script>document.title = "pwned by a book"; window.bookScriptRan = true;</script><style>body { display: none }</style></head><body>${body}</body></html>`;

const lines = [
  "The lighthouse keeper's logbook begins on a calm morning in the last week of March.",
  "Trim the wick before dusk and wind the clockwork that turns the lens.",
  "A fog signal is sounded every two minutes for as long as the far headland cannot be seen.",
  "Supplies come by boat on the first fair day after the new moon.",
];
const paragraphs = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => `<p>${lines[(from + index) % lines.length]} (${from + index + 1})</p>`).join("\n");

/**
 * "The Lamp Room": an EPUB 3 with a cover, a nested table of contents, links between
 * chapters, a picture, a note, a script that must never run and a picture on the web
 * that must never be fetched.
 */
export function lampRoomBook(options: { rights?: boolean } = {}): Buffer {
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:00000000-0000-0000-0000-0000000e2e01</dc:identifier>
    <dc:title>The Lamp Room</dc:title>
    <dc:creator>Edda Marsh</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/>
    <item id="c1" href="text/keeping.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/lamp.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="text/fog.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine>
</package>`;
  const nav = page(
    "Contents",
    `<nav epub:type="toc"><ol>
      <li><a href="text/keeping.xhtml">Keeping the light</a></li>
      <li><a href="text/lamp.xhtml">The lamp</a><ol><li><a href="text/lamp.xhtml#the.wick">Trimming the wick</a></li></ol></li>
      <li><a href="text/fog.xhtml">Fog</a></li>
    </ol></nav>`,
  );
  const keeping = `<h1>Keeping the light</h1>
    <p>A keeper's day is short on sleep. Read about <a href="lamp.xhtml#the.wick">trimming the wick</a> first.<a epub:type="noteref" href="#n1"><sup>1</sup></a></p>
    <p><img src="../images/cover.png" alt="The lantern seen from the gallery" onerror="window.bookScriptRan = true"/></p>
    <p>A picture kept elsewhere: <img src="https://example.org/lighthouse.png" alt="the tower from the sea"/>. The <a href="https://example.org/lights">list of lights</a> is on the web.</p>
    ${paragraphs(4)}
    <aside epub:type="footnote" id="n1"><p>1. Sleep when the lamp is out.</p></aside>`;
  const lamp = `<h1>The lamp</h1>${paragraphs(30)}<h2 id="the.wick">Trimming the wick</h2><p>Cut it square with the brass shears, a quarter of an inch at most.</p>${paragraphs(30, 30)}`;
  const fog = `<h1>Fog</h1><p>When the headland goes, start the foghorn compressor.</p>${paragraphs(3)}`;
  return storedZip([
    { name: "mimetype", content: "application/epub+zip" },
    {
      name: "META-INF/container.xml",
      content: `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    },
    ...(options.rights ? [{ name: "META-INF/rights.xml", content: "<rights/>" }] : []),
    { name: "OEBPS/book.opf", content: opf },
    { name: "OEBPS/nav.xhtml", content: nav },
    { name: "OEBPS/images/cover.png", content: tinyPng },
    { name: "OEBPS/text/keeping.xhtml", content: page("Keeping the light", keeping) },
    { name: "OEBPS/text/lamp.xhtml", content: page("The lamp", lamp) },
    { name: "OEBPS/text/fog.xhtml", content: page("Fog", fog) },
  ]);
}
