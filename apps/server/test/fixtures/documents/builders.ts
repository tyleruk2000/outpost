/**
 * Small, valid files built in memory for the document tests, so that every byte a test
 * depends on is visible in the test itself. The one exception is `../ocr/`: pictures
 * of text cannot be written by hand, so those few are drawn once and kept as files.
 */
import zlib from "node:zlib";
import { ZipArchive } from "archiver";

const pdfString = (value: string) => `(${value.replace(/([\\()])/g, "\\$1")})`;

/**
 * A minimal PDF with one page per entry of `pages`; each entry is the lines of text on
 * that page (an empty array gives a page with no text, like a scan). Offsets in the
 * cross-reference table are computed from the bytes actually written.
 *
 * `outline` gives it bookmarks, as a book's table of contents is kept: each goes to a
 * page (counted from 1), by its page directly or, with `named`, by a named destination.
 */
export interface PdfBookmark {
  title: string;
  page: number;
  named?: boolean;
  children?: PdfBookmark[];
}

export function buildPdf(pages: string[][], info: { title?: string; author?: string; outline?: PdfBookmark[] } = {}): Buffer {
  const objects: string[] = [];
  const pageId = (index: number) => 4 + index * 2;
  const outline = info.outline ?? [];
  const names: string[] = [];
  if (outline.length > 0) {
    // Numbered after the pages: the outline's root, then each bookmark in the order met.
    let next = 4 + pages.length * 2;
    const rootId = next++;
    const place = (items: PdfBookmark[], parentId: number): { first: number; last: number; count: number } => {
      const ids = items.map(() => next++);
      let count = items.length;
      items.forEach((item, index) => {
        const kids = item.children?.length ? place(item.children, ids[index]!) : null;
        if (kids) count += kids.count;
        const target = `[${pageId(item.page - 1)} 0 R /XYZ 0 792 0]`;
        let dest = target;
        if (item.named) {
          const name = `dest${names.length + 1}`;
          names.push(`/${name} ${target}`);
          dest = `/${name}`;
        }
        objects[ids[index]!] = [
          `<< /Title ${pdfString(item.title)} /Parent ${parentId} 0 R /Dest ${dest}`,
          index > 0 ? `/Prev ${ids[index - 1]} 0 R` : "",
          index < items.length - 1 ? `/Next ${ids[index + 1]} 0 R` : "",
          kids ? `/First ${kids.first} 0 R /Last ${kids.last} 0 R /Count ${kids.count}` : "",
          ">>",
        ]
          .filter(Boolean)
          .join(" ");
      });
      return { first: ids[0]!, last: ids.at(-1)!, count };
    };
    const top = place(outline, rootId);
    objects[rootId] = `<< /Type /Outlines /First ${top.first} 0 R /Last ${top.last} 0 R /Count ${top.count} >>`;
    objects[1] = `<< /Type /Catalog /Pages 2 0 R /Outlines ${rootId} 0 R${names.length ? ` /Dests << ${names.join(" ")} >>` : ""} >>`;
  } else {
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  }
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach((lines, index) => {
    const stream = lines.length ? `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map((line) => `${pdfString(line)} Tj T*`).join(" ")} ET` : "";
    objects[pageId(index)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId(index) + 1} 0 R >>`;
    objects[pageId(index) + 1] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });
  const infoId = objects.length;
  const entries = [info.title ? `/Title ${pdfString(info.title)}` : "", info.author ? `/Author ${pdfString(info.author)}` : ""];
  objects[infoId] = `<< ${entries.filter(Boolean).join(" ")} >>`;

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(body, "latin1");
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** What `buildScannedPdf` puts on a page. */
export type ScanPage =
  /** A picture of the page: a greyscale or RGB PNG that is not interlaced, or a JPEG. */
  | Buffer
  /** The same, laid on the page turned, as a sheet fed into a scanner sideways or upside down comes out. */
  | { picture: Buffer; turned: "clockwise" | "anticlockwise" | "upside down" }
  /** Lines of real text, as `buildPdf` writes them. */
  | string[]
  /** Nothing at all. */
  | null;

function pngParts(png: Buffer): { width: number; height: number; bits: number; colours: number; data: Buffer } {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bits = png[24] ?? 8;
  const colourType = png[25];
  if ((colourType !== 0 && colourType !== 2) || png[28] !== 0)
    throw new Error("buildScannedPdf takes greyscale or RGB PNGs that are not interlaced.");
  const chunks: Buffer[] = [];
  for (let at = 8; at + 8 <= png.length; ) {
    const length = png.readUInt32BE(at);
    if (png.toString("latin1", at + 4, at + 8) === "IDAT") chunks.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  return { width, height, bits, colours: colourType === 2 ? 3 : 1, data: Buffer.concat(chunks) };
}

function jpegSize(jpeg: Buffer): { width: number; height: number; colours: number } {
  for (let at = 2; at + 9 < jpeg.length; ) {
    const marker = jpeg[at + 1] ?? 0;
    if (marker >= 0xc0 && marker <= 0xc2)
      return { height: jpeg.readUInt16BE(at + 5), width: jpeg.readUInt16BE(at + 7), colours: jpeg[at + 9] ?? 1 };
    at += 2 + jpeg.readUInt16BE(at + 2);
  }
  throw new Error("The JPEG does not say how large it is.");
}

/**
 * A PDF as a scanner makes one: each picture fills a page of its own and there is no
 * text behind it. A PNG's compressed pixels are placed in the PDF as they are (a PDF
 * image may use PNG's own row filters), and a JPEG is placed whole. Pictures are taken
 * to be 150 dots per inch. Pages given as lines of text, or as nothing, can be mixed in.
 */
export function buildScannedPdf(pages: ScanPage[], options: { outline?: Array<{ title: string; page: number }> } = {}): Buffer {
  const objects: Buffer[] = [];
  const add = (dictionary: string, stream?: Buffer) => {
    objects.push(
      stream
        ? Buffer.concat([
            Buffer.from(`${dictionary.replace(/>>$/, `/Length ${stream.length} >>`)}\nstream\n`, "latin1"),
            stream,
            Buffer.from("\nendstream", "latin1"),
          ])
        : Buffer.from(dictionary, "latin1"),
    );
    // Objects 1 and 2 are the catalogue and the page tree, written last.
    return objects.length + 2;
  };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  for (const page of pages) {
    let box = [612, 792];
    let resources = `/Font << /F1 ${font} 0 R >>`;
    let content = "";
    const picture = Buffer.isBuffer(page) ? page : page && !Array.isArray(page) ? page.picture : undefined;
    if (picture) {
      const turned = Buffer.isBuffer(page) || Array.isArray(page) ? undefined : page?.turned;
      const isPng = picture[0] === 0x89;
      const { width, height, colours } = isPng ? pngParts(picture) : jpegSize(picture);
      const space = colours === 3 ? "/DeviceRGB" : "/DeviceGray";
      const head = `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${space}`;
      let image: number;
      if (isPng) {
        const { bits, data } = pngParts(picture);
        image = add(
          `${head} /BitsPerComponent ${bits} /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colours} /BitsPerComponent ${bits} /Columns ${width} >> >>`,
          data,
        );
      } else {
        image = add(`${head} /BitsPerComponent 8 /Filter /DCTDecode >>`, picture);
      }
      const [w, h] = [(width * 72) / 150, (height * 72) / 150];
      // The matrix that lays the picture's unit square on the page, turned or not.
      const placed = {
        upright: { box: [w, h], matrix: [w, 0, 0, h, 0, 0] },
        "upside down": { box: [w, h], matrix: [-w, 0, 0, -h, w, h] },
        clockwise: { box: [h, w], matrix: [0, -w, h, 0, 0, w] },
        anticlockwise: { box: [h, w], matrix: [0, w, -h, 0, h, 0] },
      }[turned ?? "upright"];
      box = placed.box;
      resources = `/XObject << /Im0 ${image} 0 R >>`;
      content = `q ${placed.matrix.join(" ")} cm /Im0 Do Q`;
    } else if (Array.isArray(page) && page.length) {
      content = `BT /F1 12 Tf 72 720 Td 16 TL ${page.map((line) => `${pdfString(line)} Tj T*`).join(" ")} ET`;
    }
    const contents = add("<< >>", Buffer.from(content, "latin1"));
    pageIds.push(
      add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${box[0]} ${box[1]}] /Resources << ${resources} >> /Contents ${contents} 0 R >>`),
    );
  }

  // Bookmarks, one level, after everything else: the root, then one object for each.
  let outlineRef = "";
  const outline = options.outline ?? [];
  if (outline.length > 0) {
    const rootId = objects.length + 3;
    const itemId = (index: number) => rootId + 1 + index;
    add(`<< /Type /Outlines /First ${itemId(0)} 0 R /Last ${itemId(outline.length - 1)} 0 R /Count ${outline.length} >>`);
    outline.forEach((item, index) => {
      const prev = index > 0 ? ` /Prev ${itemId(index - 1)} 0 R` : "";
      const next = index < outline.length - 1 ? ` /Next ${itemId(index + 1)} 0 R` : "";
      add(`<< /Title ${pdfString(item.title)} /Parent ${rootId} 0 R /Dest [${pageIds[item.page - 1]} 0 R /XYZ 0 792 0]${prev}${next} >>`);
    });
    outlineRef = ` /Outlines ${rootId} 0 R`;
  }

  const all = [
    Buffer.from(`<< /Type /Catalog /Pages 2 0 R${outlineRef} >>`, "latin1"),
    Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`, "latin1"),
    ...objects,
  ];
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [];
  let length = parts[0]?.length ?? 0;
  all.forEach((body, index) => {
    offsets.push(length);
    const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, "latin1"), body, Buffer.from("\nendobj\n", "latin1")]);
    parts.push(object);
    length += object.length;
  });
  let tail = `xref\n0 ${all.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) tail += `${String(offset).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<< /Size ${all.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(tail, "latin1"));
  return Buffer.concat(parts);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 4);
  return chunk;
}

/** An 8-bit greyscale PNG; `shade` gives each pixel from 0 (black) to 255 (white). */
export function buildGreyPng(width: number, height: number, shade: (x: number, y: number) => number): Buffer {
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) rows[y * (width + 1) + 1 + x] = shade(x, y);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Zips the given entries. Entries with `store` are written uncompressed. */
export async function buildZip(entries: Array<{ name: string; content: string | Buffer; store?: boolean }>): Promise<Buffer> {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve());
    archive.on("error", reject);
  });
  for (const entry of entries) archive.append(entry.content, { name: entry.name, store: entry.store });
  await archive.finalize();
  await finished;
  return Buffer.concat(chunks);
}

export interface EpubChapter {
  file: string;
  /** Body markup, placed inside `<body>`. */
  body: string;
  /** `<title>` of the chapter document. */
  title?: string;
}

/** A small EPUB 3 book: mimetype first and uncompressed, container, package, chapters. */
export function buildEpub(book: { title: string; author: string; chapters: EpubChapter[] }): Promise<Buffer> {
  const manifest = book.chapters.map(
    (chapter, index) => `<item id="c${index}" href="${chapter.file}" media-type="application/xhtml+xml"/>`,
  );
  const spine = book.chapters.map((_, index) => `<itemref idref="c${index}"/>`);
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:00000000-0000-0000-0000-000000000001</dc:identifier>
    <dc:title>${book.title}</dc:title>
    <dc:creator>${book.author}</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifest.join("\n    ")}
  </manifest>
  <spine>
    <itemref idref="nav"/>
    ${spine.join("\n    ")}
  </spine>
</package>`;
  const xhtml = (title: string | undefined, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head>${title ? `<title>${title}</title>` : "<title/>"}<script src="reader.js"/></head><body>${body}</body></html>`;
  return buildZip([
    { name: "mimetype", content: "application/epub+zip", store: true },
    {
      name: "META-INF/container.xml",
      content: `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    },
    { name: "OEBPS/book.opf", content: opf },
    { name: "OEBPS/nav.xhtml", content: xhtml("Contents", "<nav><ol><li>Navigation only tableofcontentsword</li></ol></nav>") },
    ...book.chapters.map((chapter) => ({ name: `OEBPS/${chapter.file}`, content: xhtml(chapter.title, chapter.body) })),
  ]);
}

/** Smallest valid PNG: one transparent pixel. */
export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export interface UploadFile {
  name: string;
  content: string | Buffer;
  /** Content type the client claims. The server must not believe it. */
  type?: string;
}

/**
 * A multipart/form-data body written by hand, so tests control the exact bytes of each
 * part header (including file names a browser would never send).
 */
export function multipart(fields: Record<string, string>, files: UploadFile[]): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----outpost-test-${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  for (const file of files) {
    const fileName = file.name.replace(/"/g, "%22");
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${fileName}"\r\nContent-Type: ${file.type ?? "application/octet-stream"}\r\n\r\n`,
      ),
      Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content),
      Buffer.from("\r\n"),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
