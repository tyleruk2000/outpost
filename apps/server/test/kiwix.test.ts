import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bookNameOf, decodeEntities, readZimUuid, renderLibrary } from "../src/modules/kiwix/library.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const UUID = "b37270fd-f267-39ba-fc4f-9f3c720e5d8f";
const BOOK = "wikipedia_en_knots_maxi_2026-10";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Bytes that pass for the start of a ZIM archive: magic number, version, UUID. */
function zimHeader(uuid = UUID): Buffer {
  const header = Buffer.alloc(80);
  header.writeUInt32LE(0x044d495a, 0);
  header.writeUInt16LE(6, 4);
  header.writeUInt16LE(3, 6);
  Buffer.from(uuid.replace(/-/g, ""), "hex").copy(header, 8);
  return header;
}

/** Stands in for kiwix-serve with the handful of answers Outpost relies on. */
async function fakeKiwix() {
  const meta: Record<string, string> = {
    Title: "Knots by Wikipedia",
    Description: "A subset of Wikipedia dedicated to knots",
    Language: "eng",
    Name: "wikipedia_en_knots",
    Flavour: "maxi",
    Date: "2026-10-18",
    Creator: "Wikipedia",
    Publisher: "openZIM",
    Counter: "image/png=3;image/webp=1844;text/css=21;text/html=599",
    Tags: "wikipedia;_ftindex:yes",
  };
  const requests: Array<{ url: string; headers: http.IncomingHttpHeaders }> = [];
  const server = http.createServer((request, response) => {
    const url = request.url ?? "";
    requests.push({ url, headers: request.headers });
    // kiwix-serve sends its own, weaker, sandbox policy; Outpost must replace it.
    response.setHeader("Content-Security-Policy", "default-src 'self'; sandbox allow-scripts allow-same-origin;");
    response.setHeader("Access-Control-Allow-Origin", "*");
    if (url === "/catalog/v2/root.xml") return response.end("<feed/>");
    const metaMatch = new RegExp(`^/raw/${BOOK}/meta/(\\w+)$`).exec(url);
    if (metaMatch) {
      const value = meta[metaMatch[1]!];
      if (value === undefined) {
        response.statusCode = 404;
        response.setHeader("Content-Type", "text/html");
        return response.end("<html>not found</html>");
      }
      response.setHeader("Content-Type", "text/plain");
      return response.end(value);
    }
    if (url === `/content/${BOOK}`) {
      response.statusCode = 302;
      response.setHeader("Location", `/content/${BOOK}/index`);
      return response.end();
    }
    if (url === `/content/${BOOK}/Bowline`) {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("ETag", '"abc"');
      return response.end(
        '<html><head><title>Bowline</title><script src="./_mw_/startup.js"></script></head><body><a href="./Clove_hitch">Clove hitch</a></body></html>',
      );
    }
    if (url === `/content/${BOOK}/image.webp`) {
      response.setHeader("Content-Type", "image/webp");
      response.setHeader("Content-Length", "4");
      return response.end(Buffer.from([1, 2, 3, 4]));
    }
    if (url.startsWith("/search?")) {
      const params = new URL(url, "http://x").searchParams;
      if (params.get("books.id") !== UUID) {
        response.statusCode = 400;
        return response.end("<error/>");
      }
      response.setHeader("Content-Type", "application/xml");
      return response.end(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><channel>
        <opensearch:totalResults>25</opensearch:totalResults>
        <item><title>Portuguese bowline</title><link>/content/${BOOK}/Portuguese_bowline</link><description>...a variant of the <b>bowline</b> with two loops &amp; more...</description></item>
        <item><title>Fireman&apos;s chair knot</title><link>/content/${BOOK}/Fireman&apos;s_chair_knot</link><description>...used in rescue...</description></item>
      </channel></rss>`);
    }
    if (url.startsWith("/suggest?")) {
      response.setHeader("Content-Type", "application/json");
      return response.end(
        JSON.stringify([
          { value: "Bowline", label: "&lt;b&gt;Bow&lt;/b&gt;line", kind: "path", path: "Bowline" },
          { value: "Bowyer&apos;s knot", label: "x", kind: "path", path: "Bowyer&apos;s_knot" },
          { value: "bow", label: "containing 'bow'...", kind: "pattern" },
        ]),
      );
    }
    response.statusCode = 404;
    response.end("nope");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

async function setup(env: Record<string, string> = {}) {
  const kiwix = await fakeKiwix();
  const app: TestApp = await createTestApp({ OUTPOST_KIWIX_URL: kiwix.url, ...env });
  cleanups.push(() => app.close());
  const location = app.ctx.services.storage.getDefault();
  const relPath = `collections/zim/${BOOK}.zim`;
  fs.mkdirSync(path.dirname(path.join(location.path, relPath)), { recursive: true });
  fs.writeFileSync(path.join(location.path, relPath), zimHeader());
  const libraryPath = app.ctx.config.kiwix.libraryPath;
  return { app, kiwix, location, relPath, libraryPath };
}

async function waitFor(check: () => boolean, ms = 4000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("library file", () => {
  it("reads a ZIM archive's UUID and rejects other files", async () => {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "outpost-zim-"));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, "a.zim"), zimHeader());
    fs.writeFileSync(path.join(dir, "b.zim"), "PK\u0003\u0004 definitely a zip, not a zim");
    expect(await readZimUuid(path.join(dir, "a.zim"))).toBe(UUID);
    expect(await readZimUuid(path.join(dir, "b.zim"))).toBeUndefined();
    expect(await readZimUuid(path.join(dir, "missing.zim"))).toBeUndefined();
    expect(bookNameOf("/x/Wikipedia EN Knots.zim")).toBe("wikipedia_en_knots");
  });

  it("escapes everything it writes", () => {
    const xml = renderLibrary([
      { id: UUID, path: '/storage/a "b" <c>&.zim', title: "Tom & Jerry's <guide>", language: "eng", articleCount: 5 },
    ]);
    expect(xml).toContain('path="/storage/a &quot;b&quot; &lt;c&gt;&amp;.zim"');
    expect(xml).toContain('title="Tom &amp; Jerry&apos;s &lt;guide&gt;"');
    expect(xml).toContain('articleCount="5"');
    expect(xml).not.toContain("description=");
  });

  it("decodes the HTML escaping kiwix-serve uses in its answers", () => {
    expect(decodeEntities("Fireman&apos;s &amp; Bowyer&#39;s &#x26; &lt;b&gt;")).toBe("Fireman's & Bowyer's & <b>");
  });
});

describe("kiwix integration", () => {
  it("writes an empty library on start so kiwix-serve can boot", async () => {
    const { libraryPath } = await setup();
    expect(fs.readFileSync(libraryPath, "utf8")).toContain('<library version="20110515">');
  });

  it("adds an imported archive to the library and fills in its details from the archive", async () => {
    const { app, relPath, location, libraryPath } = await setup();
    const imported = await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath });
    expect(imported.status).toBe(200);
    const id = imported.body.collection.id as string;
    await waitFor(() => fs.readFileSync(libraryPath, "utf8").includes('name="wikipedia_en_knots"'));
    const xml = fs.readFileSync(libraryPath, "utf8");
    expect(xml).toContain(`id="${UUID}"`);
    expect(xml).toContain(`path="${path.join(location.path, relPath)}"`);
    expect(xml).toContain('language="eng"');
    expect(xml).toContain('articleCount="599"');
    expect(xml).toContain('mediaCount="1847"');

    const { body } = await app.api("GET", "/api/kiwix/books");
    expect(body.books).toEqual([
      expect.objectContaining({
        collectionId: id,
        bookName: BOOK,
        title: "Knots by Wikipedia",
        articleCount: 599,
        ready: true,
        contentBase: `/kiwix/open/content/${BOOK}/`,
      }),
    ]);
    // The same archive cannot be added twice, and a non-archive not at all.
    expect((await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath })).status).toBe(409);
    fs.writeFileSync(path.join(location.path, "collections/zim/fake.zim"), "nope");
    expect((await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath: "collections/zim/fake.zim" })).status).toBe(400);
    expect((await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath: "../../etc/passwd" })).status).toBe(400);
  });

  it("drops a book from the library when its drive is disconnected or it is removed", async () => {
    const { app, relPath, location, libraryPath } = await setup();
    const id = (await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath })).body.collection.id as string;
    await waitFor(() => fs.readFileSync(libraryPath, "utf8").includes(UUID));

    // Parked outside the storage roots: inside them Outpost would simply find it again.
    const parked = path.join(app.dir, "parked");
    fs.renameSync(location.path, parked);
    await app.api("POST", "/api/storage/refresh");
    await waitFor(() => !fs.readFileSync(libraryPath, "utf8").includes(UUID));
    expect((await app.api("GET", `/api/kiwix/books/${id}`)).body).toMatchObject({
      book: { ready: false },
      reason: expect.stringMatching(/not connected/),
    });

    fs.renameSync(parked, location.path);
    await app.api("POST", "/api/storage/refresh");
    await waitFor(() => fs.readFileSync(libraryPath, "utf8").includes(UUID));

    expect((await app.api("DELETE", `/api/collections/${id}?deleteFiles=false`)).status).toBe(200);
    await waitFor(() => !fs.readFileSync(libraryPath, "utf8").includes(UUID));
    expect(fs.existsSync(path.join(location.path, relPath))).toBe(true);
  });

  it("searches inside books, suggests titles, and joins unified search", async () => {
    const { app, relPath, location, libraryPath } = await setup();
    const id = (await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath })).body.collection.id as string;
    await waitFor(() => fs.readFileSync(libraryPath, "utf8").includes('name="wikipedia_en_knots"'));

    const inBook = (await app.api("GET", `/api/kiwix/books/${id}/search?q=bowline`)).body;
    expect(inBook.total).toBe(25);
    expect(inBook.results[0].segments).toEqual([
      { text: "...a variant of the ", hit: false },
      { text: "bowline", hit: true },
      { text: " with two loops & more...", hit: false },
    ]);
    expect(inBook.results[1]).toMatchObject({
      title: "Fireman's chair knot",
      path: "Fireman's_chair_knot",
      url: `/library/read/${id}/Fireman's_chair_knot`,
    });

    const suggest = (await app.api("GET", `/api/kiwix/books/${id}/suggest?q=bow`)).body;
    expect(suggest.suggestions.map((item: { title: string }) => item.title)).toEqual(["Bowline", "Bowyer's knot"]);

    app.ctx.services.search.upsert({
      kind: "note",
      entityId: "n1",
      title: "Bowline practice",
      url: "/notes/n1",
      sections: [{ text: "Tie a bowline twenty times." }],
    });
    const unified = (await app.api("GET", "/api/search?q=bowline")).body;
    const kinds = unified.results.map((result: { kind: string }) => result.kind);
    expect(kinds).toContain("note");
    expect(kinds).toContain("reference");
    const reference = unified.results.find((result: { kind: string }) => result.kind === "reference");
    expect(reference).toMatchObject({
      collection: "Knots by Wikipedia",
      sources: ["reference"],
      url: `/library/read/${id}/Portuguese_bowline`,
    });
    // Turning the setting off leaves only the person's own material.
    await app.api("PATCH", "/api/settings", { "search.includeReference": false });
    expect(
      (await app.api("GET", "/api/search?q=bowline")).body.results.every((result: { kind: string }) => result.kind !== "reference"),
    ).toBe(true);
  });

  it("says why reference search is missing when kiwix-serve is down, without failing the search", async () => {
    const { app, relPath, location } = await setup({ OUTPOST_KIWIX_URL: "http://127.0.0.1:9" });
    // No server answers at that address, so details cannot be read; the book still lists.
    await app.api("POST", "/api/kiwix/import", { locationId: location.id, relPath });
    app.ctx.services.search.upsert({
      kind: "note",
      entityId: "n1",
      title: "Bowline practice",
      url: "/notes/n1",
      sections: [{ text: "Tie a bowline." }],
    });
    const { status, body } = await app.api("GET", "/api/search?q=bowline");
    expect(status).toBe(200);
    expect(body.results.map((result: { kind: string }) => result.kind)).toEqual(["note"]);
    expect(body.warnings[0].source).toBe("reference");
    expect((await app.api("GET", "/api/kiwix/status")).body).toMatchObject({ mode: "external", available: false });
  });
});

describe("the reader proxy", () => {
  const get = (app: TestApp, url: string, headers: Record<string, string> = {}) =>
    app.app.inject({ method: "GET", url, headers: { host: "localhost", ...headers } });

  it("serves pages in a sandbox of their own, with Outpost's policy in place of kiwix-serve's", async () => {
    const { app } = await setup();
    const response = await get(app, `/kiwix/open/content/${BOOK}/Bowline`);
    expect(response.statusCode).toBe(200);
    const csp = String(response.headers["content-security-policy"]);
    expect(csp).toContain("sandbox allow-scripts");
    // The page must never share Outpost's origin: that is what keeps archive scripts away from the API.
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("default-src 'self' http://localhost");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers.etag).toBe('"abc"');
    // The bridge is added inside <head>, and the page's own relative links are untouched.
    expect(response.body).toMatch(/outpost:reader[\s\S]*<\/head>/);
    expect(response.body).toContain('<a href="./Clove_hitch">');
  });

  it("passes other files through unchanged and forwards range requests", async () => {
    const { app, kiwix } = await setup();
    const response = await get(app, `/kiwix/open/content/${BOOK}/image.webp`, { range: "bytes=0-1" });
    expect(response.rawPayload.equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
    expect(response.headers["content-type"]).toBe("image/webp");
    expect(String(response.headers["content-security-policy"])).toContain("sandbox");
    expect(kiwix.requests.at(-1)!.headers.range).toBe("bytes=0-1");
    expect(kiwix.requests.at(-1)!.headers.cookie).toBeUndefined();
  });

  it("keeps redirects inside the proxy", async () => {
    const { app } = await setup();
    const response = await get(app, `/kiwix/open/content/${BOOK}`);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/kiwix/open/content/${BOOK}/index`);
  });

  it("exposes only content, never the rest of kiwix-serve or anything else", async () => {
    const { app, kiwix } = await setup();
    const before = kiwix.requests.length;
    for (const url of [
      "/kiwix/open/search?pattern=x",
      "/kiwix/open/raw/x/meta/Title",
      "/kiwix/open/content/../raw/x",
      "/kiwix/open/skin/x.js",
      "/kiwix/open/",
    ]) {
      expect((await get(app, url)).statusCode, url).toBe(404);
    }
    expect(kiwix.requests.length).toBe(before);
    const post = await app.app.inject({ method: "POST", url: `/kiwix/open/content/${BOOK}/Bowline`, headers: { host: "localhost" } });
    expect(post.statusCode).toBe(404);
  });

  it("requires a signed, unexpired token when sign-in is on", async () => {
    const { app } = await setup({ OUTPOST_AUTH: "on" });
    const setupResponse = await app.api("POST", "/api/auth/setup", { username: "tyler", password: "correct horse battery" });
    const cookie = String(setupResponse.headers["set-cookie"]).split(";")[0]!;

    // The token that works without sign-in is refused, as is a forged one.
    expect((await get(app, `/kiwix/open/content/${BOOK}/Bowline`)).statusCode).toBe(401);
    expect((await get(app, `/kiwix/local.zzzz.forged/content/${BOOK}/Bowline`)).statusCode).toBe(401);
    // A signed-in person is given a token; the page then loads with no cookie at all.
    expect((await app.api("GET", "/api/kiwix/books")).status).toBe(401);
    const location = app.ctx.services.storage.getDefault();
    await app.api(
      "POST",
      "/api/kiwix/import",
      { locationId: location.id, relPath: `collections/zim/${BOOK}.zim` },
      { headers: { cookie } },
    );
    const books = await app.api("GET", "/api/kiwix/books", undefined, { headers: { cookie } });
    const token = (books.body.books[0].contentBase as string).split("/")[2]!;
    expect(token).not.toBe("open");
    expect((await get(app, `/kiwix/${token}/content/${BOOK}/Bowline`)).statusCode).toBe(200);
    const tampered = `${token.slice(0, -2)}xx`;
    expect((await get(app, `/kiwix/${tampered}/content/${BOOK}/Bowline`)).statusCode).toBe(401);
    // Signing out ends the token with the session, long before its own expiry.
    await app.api("POST", "/api/auth/logout", {}, { headers: { cookie } });
    expect((await get(app, `/kiwix/${token}/content/${BOOK}/Bowline`)).statusCode).toBe(401);
    expect(cookie).toContain("outpost_session");
  });
});
