/**
 * A stand-in for the Kiwix library on a local file server: an OPDS feed in the shape
 * of the real one (see the saved responses next to this file), plus the .zim, .sha256
 * and .meta4 files each entry points at.
 */
import { createHash } from "node:crypto";
import type { FileServer } from "../downloads/file-server.ts";

export interface FakeBook {
  name: string;
  flavour: string;
  /** Build date, as in the file name: "2026-10". */
  version: string;
  body: Buffer;
  title?: string;
  /** ISO 639-3, as the feed gives it. Default "eng". */
  language?: string;
  articleCount?: number;
  /** Serve the file from this origin instead of the library's own. */
  fileOrigin?: string;
  /** Leave out the .sha256 and .meta4 files. */
  withoutChecksums?: boolean;
  delayMs?: number;
}

export const fileNameOf = (book: FakeBook) => `${book.name}${book.flavour ? `_${book.flavour}` : ""}_${book.version}.zim`;
export const sha256Of = (data: Buffer) => createHash("sha256").update(data).digest("hex");

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function entryXml(book: FakeBook, origin: string, index: number): string {
  const uuid = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const href = `${book.fileOrigin ?? origin}/zim/other/${fileNameOf(book)}.meta4`;
  // The real feed rounds the length; the exact size is only in the .meta4 file.
  const rounded = Math.ceil(book.body.length / 1024) * 1024;
  return `  <entry>
    <id>urn:uuid:${uuid}</id>
    <title>${escapeXml(book.title ?? book.name)}</title>
    <updated>${book.version}-01T00:00:00Z</updated>
    <summary>Summary of ${escapeXml(book.title ?? book.name)}</summary>
    <language>${book.language ?? "eng"}</language>
    <name>${escapeXml(book.name)}</name>
    <flavour>${book.flavour}</flavour>
    <category></category>
    <tags>_ftindex:yes</tags>
    <articleCount>${book.articleCount ?? 42}</articleCount>
    <mediaCount>7</mediaCount>
    <link rel="http://opds-spec.org/image/thumbnail"
          href="/catalog/v2/illustration/${uuid}/?size=48"
          type="image/png;width=48;height=48;scale=1"/>
    <link type="text/html" href="${origin}/content/${fileNameOf(book).replace(/\.zim$/, "")}" />
    <author>
      <name>Test</name>
    </author>
    <dc:issued>${book.version}-01T00:00:00Z</dc:issued>
    <link rel="${"http://opds-spec.org/acquisition/open-access"}" type="application/x-zim" href="${escapeXml(href)}" length="${rounded}" />
  </entry>`;
}

export interface FakeLibrary {
  catalogUrl: string;
  books: FakeBook[];
  add(book: FakeBook): void;
  remove(name: string, flavour: string): void;
  /** Requests made to the feed, as query strings. */
  feedQueries(): string[];
}

export function serveKiwixLibrary(server: FileServer, initial: FakeBook[] = []): FakeLibrary {
  const books: FakeBook[] = [];

  server.routes.set("/catalog/v2/entries", {
    body: Buffer.alloc(0),
    headers: { "content-type": "application/atom+xml;profile=opds-catalog;kind=acquisition" },
    respond(query) {
      const name = query.get("name");
      const lang = query.get("lang");
      const all = query.get("count") === "-1";
      let matching = books.filter((book) => (!name || book.name === name) && (!lang || (book.language ?? "eng").split(",").includes(lang)));
      // Like the real service, only ten entries come back unless everything is asked for.
      if (!all) matching = matching.slice(0, 10);
      return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="https://specs.opds.io/opds-1.2">
  <id>12345678-0000-0000-0000-000000000000</id>
  <title>Filtered Entries (${escapeXml(query.toString())})</title>
  <updated>2026-11-15T00:00:00Z</updated>
  <totalResults>${matching.length}</totalResults>
  <startIndex>0</startIndex>
  <itemsPerPage>${matching.length}</itemsPerPage>
${matching.map((book) => entryXml(book, server.origin, books.indexOf(book))).join("\n")}
</feed>
`;
    },
  });

  const library: FakeLibrary = {
    catalogUrl: server.url("/catalog/v2/entries"),
    books,
    add(book) {
      books.push(book);
      const path = `/zim/other/${fileNameOf(book)}`;
      server.routes.set(path, { body: book.body, chunkBytes: book.delayMs ? 16_384 : undefined, delayMs: book.delayMs });
      if (book.withoutChecksums) return;
      server.routes.set(`${path}.sha256`, { body: Buffer.from(`${sha256Of(book.body)}  ${fileNameOf(book)}\n`) });
      server.routes.set(`${path}.meta4`, {
        body: Buffer.from(
          `<?xml version="1.0" encoding="UTF-8"?>\n<metalink xmlns="urn:ietf:params:xml:ns:metalink">\n  <file name="${fileNameOf(book)}">\n    <size>${book.body.length}</size>\n    <hash type="md5">00000000000000000000000000000000</hash>\n    <hash type="sha-256">${sha256Of(book.body)}</hash>\n  </file>\n</metalink>\n`,
        ),
      });
    },
    remove(name, flavour) {
      for (let index = books.length - 1; index >= 0; index -= 1) {
        if (books[index]!.name === name && books[index]!.flavour === flavour) books.splice(index, 1);
      }
    },
    feedQueries: () => server.requests.filter((seen) => seen.path === "/catalog/v2/entries").map((seen) => seen.query),
  };
  for (const book of initial) library.add(book);
  return library;
}
