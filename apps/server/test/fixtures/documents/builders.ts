/**
 * Small, valid files built in memory for the document tests, so the suite carries no
 * binary fixtures and every byte a test depends on is visible in the test itself.
 */
import { ZipArchive } from "archiver";

const pdfString = (value: string) => `(${value.replace(/([\\()])/g, "\\$1")})`;

/**
 * A minimal PDF with one page per entry of `pages`; each entry is the lines of text on
 * that page (an empty array gives a page with no text, like a scan). Offsets in the
 * cross-reference table are computed from the bytes actually written.
 */
export function buildPdf(pages: string[][], info: { title?: string; author?: string } = {}): Buffer {
  const objects: string[] = [];
  const pageId = (index: number) => 4 + index * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach((lines, index) => {
    const stream = lines.length
      ? `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map((line) => `${pdfString(line)} Tj T*`).join(" ")} ET`
      : "";
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
  const manifest = book.chapters.map((chapter, index) => `<item id="c${index}" href="${chapter.file}" media-type="application/xhtml+xml"/>`);
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
