/**
 * A stand-in for kiwix-serve whose archives take their time to search, as they do on a
 * network share.
 *
 * It copies the two things about the real program that decide how a search feels,
 * both measured against kiwix-serve 3.8.2 (see docs/search.md):
 *
 *  - it works on a fixed number of requests at once (four, as kiwix-serve does unless
 *    told otherwise) and makes the rest wait their turn;
 *  - a search goes on to its end even when whoever asked has gone away, and holds its
 *    place until then.
 *
 * Each book has a delay and a list of article titles. A search answers with the titles
 * that contain the word looked for.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

export interface SlowBook {
  uuid: string;
  /** The archive's file name without ".zim"; also its name in addresses. */
  name: string;
  title: string;
  /** How long one search of this book takes, in milliseconds. */
  delayMs: number;
  articles: string[];
  /**
   * Recorded answers instead: a search answers with every hit whose title or snippet
   * holds a word of the pattern (its first five letters), in the order recorded, as the
   * real program answers with any of the words and in an order of its own.
   */
  hits?: Array<{ title: string; path: string; snippet: string }>;
  /** Answer every search of this book with an error. */
  broken?: boolean;
}

export interface SlowKiwix {
  url: string;
  books: SlowBook[];
  /** Searches that reached the program, as "book name: word", in the order they began work. */
  started: string[];
  /** Searches being worked on now. */
  running(): number;
  /** Searches waiting for one of the program's places. */
  waiting(): number;
  /** The most that were being worked on, or waiting, at one moment. */
  peak(): number;
  /** Searches finished after whoever asked had gone. */
  wasted(): number;
  /** Resolves when nothing is being worked on and nothing is waiting. */
  idle(): Promise<void>;
  close(): Promise<void>;
}

/** A UUID that is different for each number, for making several books. */
export const uuidFor = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

/** Bytes that pass for the start of a ZIM archive: magic number, version, UUID. */
export function zimHeader(uuid: string): Buffer {
  const header = Buffer.alloc(80);
  header.writeUInt32LE(0x044d495a, 0);
  header.writeUInt16LE(6, 4);
  header.writeUInt16LE(3, 6);
  Buffer.from(uuid.replace(/-/g, ""), "hex").copy(header, 8);
  return header;
}

/** Writes the start of an archive for each book, where an import will find it. Returns the paths, relative to the folder. */
export function writeArchives(folder: string, books: SlowBook[]): string[] {
  return books.map((book, index) => {
    const relPath = `collections/zim/${book.name}.zim`;
    fs.mkdirSync(path.dirname(path.join(folder, relPath)), { recursive: true });
    // Sizes rise with the order given, so that tests know which book is asked first.
    fs.writeFileSync(path.join(folder, relPath), Buffer.concat([zimHeader(book.uuid), Buffer.alloc(index * 100)]));
    return relPath;
  });
}

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function startSlowKiwix(options: { books: SlowBook[]; threads?: number; port?: number }): Promise<SlowKiwix> {
  const threads = options.threads ?? 4;
  const queue: Array<() => void> = [];
  let running = 0;
  let peak = 0;
  let wasted = 0;
  let idleWaiters: Array<() => void> = [];

  const settle = () => {
    if (running > 0 || queue.length > 0) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters = [];
  };
  /** Takes one of the program's places, waiting for it if all are taken. */
  const place = () =>
    new Promise<void>((resolve) => {
      const begin = () => {
        running += 1;
        resolve();
      };
      if (running < threads) begin();
      else queue.push(begin);
      peak = Math.max(peak, running + queue.length);
    });
  const leave = () => {
    running -= 1;
    queue.shift()?.();
    settle();
  };

  const kiwix: SlowKiwix = {
    url: "",
    books: options.books,
    started: [],
    running: () => running,
    waiting: () => queue.length,
    peak: () => peak,
    wasted: () => wasted,
    idle: () =>
      new Promise<void>((resolve) => {
        if (running === 0 && queue.length === 0) resolve();
        else idleWaiters.push(resolve);
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "", "http://kiwix");
    if (url.pathname === "/health") return response.end("ok");
    if (url.pathname === "/catalog/v2/root.xml") return response.end("<feed/>");
    if (url.pathname === "/search") {
      const book = options.books.find((candidate) => candidate.uuid === url.searchParams.get("books.id"));
      if (!book) {
        response.statusCode = 400;
        return response.end("<error/>");
      }
      const word = (url.searchParams.get("pattern") ?? "").toLowerCase();
      const wanted = Number(url.searchParams.get("pageLength")) || 25;
      let gone = false;
      response.on("close", () => {
        gone = !response.writableFinished;
      });
      await place();
      kiwix.started.push(`${book.name}: ${word}`);
      await new Promise((resolve) => setTimeout(resolve, book.delayMs));
      if (gone) wasted += 1;
      leave();
      if (gone) return;
      if (book.broken) {
        response.statusCode = 500;
        return response.end("<error/>");
      }
      response.setHeader("Content-Type", "application/xml");
      if (book.hits) {
        const stems = word
          .split(/[^a-z0-9]+/)
          .filter((part) => part.length >= 3)
          .map((part) => part.slice(0, 5));
        const holds = (text: string) => stems.some((part) => text.toLowerCase().includes(part));
        const recorded = book.hits.filter((hit) => holds(hit.title) || holds(hit.snippet));
        const bold = (text: string) =>
          escapeXml(text).replace(/[A-Za-z0-9]+/g, (token) => (stems.some((part) => token.toLowerCase().startsWith(part)) ? `<b>${token}</b>` : token));
        return response.end(
          `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel><opensearch:totalResults>${recorded.length}</opensearch:totalResults>${recorded
            .slice(0, wanted)
            .map(
              (hit) =>
                `<item><title>${escapeXml(hit.title)}</title><link>/content/${book.name}/${escapeXml(hit.path)}</link><description>${bold(hit.snippet)}</description></item>`,
            )
            .join("")}</channel></rss>`,
        );
      }
      const found = book.articles.filter((title) => title.toLowerCase().includes(word));
      return response.end(
        `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel><opensearch:totalResults>${found.length}</opensearch:totalResults>${found
          .slice(0, wanted)
          .map(
            (title) =>
              `<item><title>${escapeXml(title)}</title><link>/content/${book.name}/${encodeURIComponent(title.replace(/ /g, "_"))}</link><description>...about <b>${escapeXml(word)}</b> in ${escapeXml(book.title)}...</description></item>`,
          )
          .join("")}</channel></rss>`,
      );
    }
    if (url.pathname === "/suggest") {
      response.setHeader("Content-Type", "application/json");
      return response.end("[]");
    }
    // Details, pages and lists of documents: these books have none to give.
    response.statusCode = 404;
    response.setHeader("Content-Type", "text/html");
    response.end("<html><body>Not found</body></html>");
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  kiwix.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return kiwix;
}
