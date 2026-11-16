import fs from "node:fs";
import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WEB_PAGE_LIMITS } from "../src/modules/webpages/index.ts";
import { waitFor } from "./fixtures/downloads/file-server.ts";
import { articlePage, paragraphs, png, scriptOnlyPage, signInPage } from "./fixtures/webpages/pages.ts";
import { type Site, startSite } from "./fixtures/webpages/site.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
const sites: Site[] = [];
const limits = { ...WEB_PAGE_LIMITS };
afterEach(async () => {
  vi.restoreAllMocks();
  Object.assign(WEB_PAGE_LIMITS, limits);
  await app?.close();
  app = undefined;
  for (const site of sites.splice(0)) await site.close();
});

async function site(host?: string): Promise<Site> {
  const started = await startSite(host);
  sites.push(started);
  return started;
}

const MB = 1024 * 1024;

/** Looks at a page, as the screen does before anything is saved. */
const preview = (target: TestApp, url: string) => target.api("POST", "/api/webpages/preview", { url });

async function finished(target: TestApp, jobId: string) {
  return waitFor(
    async () => {
      const { job } = (await target.api("GET", `/api/jobs/${jobId}`)).body;
      return ["succeeded", "failed", "cancelled"].includes(job.state) ? job : undefined;
    },
    "the page to be saved",
    30_000,
  );
}

/** Looks at a page and saves it, and waits for the job. */
async function save(target: TestApp, url: string, options: Record<string, unknown> = {}) {
  const looked = await preview(target, url);
  expect(looked.status, JSON.stringify(looked.body)).toBe(200);
  const started = await target.api("POST", "/api/webpages/save", { url, previewId: looked.body.previewId, ...options });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  return finished(target, started.body.job.id);
}

const documentsOf = async (target: TestApp) => (await target.api("GET", "/api/documents")).body.documents;
const fileOf = (target: TestApp, id: string) => fs.readFileSync(target.ctx.services.documents.absolutePath(id), "utf8");
const picture = (target: TestApp, id: string, number: number) =>
  target.app.inject({ method: "GET", url: `/api/documents/${id}/pictures/${number}`, headers: { host: "localhost" } });

/** Every piece of text in a tree of Markdown blocks, joined. */
const wordsOf = (value: unknown): string =>
  typeof value === "string" ? value : value && typeof value === "object" ? Object.values(value).map(wordsOf).join(" ") : "";

describe("saving a web page", () => {
  it("keeps the article, without what surrounds it, as a document that says where it came from", async () => {
    app = await createTestApp();
    const gazette = await site();
    gazette.routes.set("/articles/rainwater", { body: articlePage() });
    const url = gazette.url("/articles/rainwater");

    const looked = await preview(app, url);
    expect(looked.status).toBe(200);
    expect(looked.body).toMatchObject({
      url,
      requestedUrl: url,
      title: "Collecting rainwater",
      byline: "Mabel Thorne",
      site: "The Allotment Gazette",
      published: "2026-03-09T08:30:00Z",
      language: "en-GB",
      pictures: { count: 0, willFetch: 0, hosts: [] },
      existing: [],
      limits: WEB_PAGE_LIMITS,
    });
    expect(looked.body.words).toBeGreaterThan(150);
    expect(looked.body.excerpt).toMatch(/^A rain barrel fills faster/);
    // Looking keeps nothing.
    expect(await documentsOf(app)).toEqual([]);

    const started = await app.api("POST", "/api/webpages/save", { url, previewId: looked.body.previewId });
    const job = await finished(app, started.body.job.id);
    expect(job.state).toBe("succeeded");
    expect(job.result).toMatchObject({ title: "Collecting rainwater", url, pictures: { kept: 0, skipped: [] } });
    // The site was asked for the page once, and for nothing else: no stylesheet, script, frame or linked page.
    expect(gazette.requests.map((request) => request.path)).toEqual(["/articles/rainwater"]);

    const [document] = await documentsOf(app);
    expect(document).toMatchObject({
      id: job.result.documentId,
      title: "Collecting rainwater",
      type: "markdown",
      originalName: "Collecting rainwater.md",
      source: url,
      author: "Mabel Thorne",
      language: "en-GB",
    });

    const shown = (await app.api("GET", `/api/documents/${document.id}/markdown`)).body;
    expect(shown.savedFrom).toMatchObject({ url, site: "The Allotment Gazette" });
    expect(Math.abs(shown.savedFrom.savedAt - Date.now())).toBeLessThan(60_000);
    const kinds = shown.blocks.map((block: { t: string }) => block.t);
    expect(kinds).toEqual(expect.arrayContaining(["heading", "paragraph", "list", "quote", "table", "code"]));
    expect(shown.blocks.find((block: { t: string }) => block.t === "table").rows).toEqual([
      [[{ t: "text", v: "Roof area" }], [{ t: "text", v: "Rain" }], [{ t: "text", v: "Water collected" }]],
      [[{ t: "text", v: "20 m²" }], [{ t: "text", v: "10 mm" }], [{ t: "text", v: "180 litres" }]],
      [[{ t: "text", v: "50 m²" }], [{ t: "text", v: "10 mm" }], [{ t: "text", v: "450 litres" }]],
    ]);
    expect(shown.blocks.find((block: { t: string }) => block.t === "code")).toEqual({
      t: "code",
      lang: "python",
      v: "litres = area_m2 * rain_mm * 0.9\nprint(litres)",
    });
    const serialised = JSON.stringify(shown.blocks);
    // Links are made complete against the page's address; one to a place on the page stays a jump.
    expect(serialised).toContain(`"href":"${gazette.url("/guides/roofs")}"`);
    expect(serialised).toContain('"href":"mailto:mabel@gazette.example"');
    expect(serialised).toContain('"t":"jump","to":"how-much-to-expect"');

    const text = wordsOf(shown.blocks);
    expect(text).toContain("A dangerous link keeps only its words");
    // The title is said once, and the writer's name once.
    expect(text.match(/Mabel Thorne/g)).toHaveLength(1);
    for (const clutter of [
      "News desk",
      "Subscribe today",
      "Accept all cookies",
      "Share on Chirper",
      "Related articles",
      "Ten sheds we love",
      "Great article",
      "Most read",
      "Privacy policy",
      "newsletter",
      "Sign me up",
    ]) {
      expect(text, clutter).not.toContain(clutter);
    }

    // Nothing that could run, load or track is in the file that was kept.
    const file = fileOf(app, document.id);
    for (const secret of [
      "secret-",
      "<script",
      "<style",
      "<iframe",
      "tracker.example",
      "javascript:",
      "dataLayer",
      "social.example",
      "<form",
      "onclick",
    ]) {
      expect(file, secret).not.toContain(secret);
    }
    expect(file).toMatch(/^---\ntitle: "Collecting rainwater"\nauthor: "Mabel Thorne"\nsite: "The Allotment Gazette"\n/);
    expect(file).toContain(`saved-from: "${url}"`);
    expect(file).toContain("# Collecting rainwater\n\n*By Mabel Thorne. The Allotment Gazette. Published 9 March 2026.*");

    await waitFor(
      async () => (await app!.api("GET", `/api/documents/${document.id}`)).body.document.extraction === "done",
      "its text",
      15_000,
    );
    const found = (await app.api("GET", "/api/search?q=diverter")).body.results;
    expect(found[0]).toMatchObject({ kind: "document", entityId: document.id, title: "Collecting rainwater" });
    expect((await app.api("GET", "/api/search?q=sheds")).body.results).toEqual([]);
  });

  it("sends a plain client name and nothing about the person: no cookie, no referrer, on any request", async () => {
    app = await createTestApp();
    const gazette = await site();
    gazette.routes.set("/short", { redirectTo: "/articles/rainwater", headers: { "set-cookie": "visitor=tracked; Path=/" } });
    gazette.routes.set("/articles/rainwater", {
      body: articlePage({ pictures: `<img src="/img/barrel.png" alt="A barrel on blocks">` }),
      headers: { "set-cookie": "session=tracked; Path=/" },
    });
    gazette.routes.set("/img/barrel.png", { body: png(64, 48), type: "image/png" });

    const job = await save(app, gazette.url("/short"), { pictures: true });
    expect(job.state).toBe("succeeded");
    expect(gazette.requests.map((request) => request.path)).toEqual(["/short", "/articles/rainwater", "/img/barrel.png"]);
    for (const request of gazette.requests) {
      expect(request.headers["user-agent"]).toBe("Outpost (self-hosted offline library)");
      expect(Object.keys(request.headers).sort()).toEqual(
        ["accept", "accept-encoding", "accept-language", "connection", "host", "sec-fetch-mode", "user-agent"].sort(),
      );
      expect(request.headers["accept-language"]).toBe("*");
      for (const never of ["cookie", "referer", "authorization", "origin", "from", "x-forwarded-for", "via"]) {
        expect(request.headers[never], never).toBeUndefined();
      }
    }
    expect(gazette.seen("/articles/rainwater")[0]!.headers.accept).toBe("text/html, application/xhtml+xml");
    expect(gazette.seen("/img/barrel.png")[0]!.headers.accept).toBe("image/png, image/jpeg, image/gif, image/webp");
    // What is recorded is where the page really came from.
    expect((await documentsOf(app))[0].source).toBe(gazette.url("/articles/rainwater"));
  });

  it("takes one address, for one page, and nothing that would make it a crawler", async () => {
    app = await createTestApp();
    const gazette = await site();
    gazette.routes.set("/a", { body: articlePage() });
    gazette.routes.set("/b", { body: articlePage() });

    for (const body of [
      { urls: [gazette.url("/a"), gazette.url("/b")] },
      { url: gazette.url("/a"), follow: true },
      { url: gazette.url("/a"), depth: 2 },
      { url: [gazette.url("/a")] },
    ]) {
      expect((await app.api("POST", "/api/webpages/preview", body)).status).toBe(400);
      expect((await app.api("POST", "/api/webpages/save", body)).status).toBe(400);
    }
    const two = await preview(app, `${gazette.url("/a")} ${gazette.url("/b")}`);
    expect(two.status).toBe(400);
    expect(two.body.error.message).toMatch(/one page at a time/);

    for (const [address, message] of [
      ["", /Paste the address/],
      ["not an address", /one page at a time/],
      ["ftp://example.org/file", /http:\/\/ or https:\/\//],
      ["javascript:alert(1)", /http:\/\/ or https:\/\//],
      ["file:///etc/passwd", /http:\/\/ or https:\/\//],
      ["https://mabel:hunter2@example.org/page", /user name or password/],
    ] as const) {
      const refused = await preview(app, address);
      expect(refused.status, address).toBe(400);
      expect(refused.body.error.message).toMatch(message);
    }
    expect(gazette.requests).toEqual([]);
    expect(await documentsOf(app)).toEqual([]);
  });

  it("asks before saving the same address again, and replaces a copy only when told which", async () => {
    app = await createTestApp();
    const gazette = await site();
    gazette.routes.set("/articles/rainwater", { body: articlePage() });
    const url = gazette.url("/articles/rainwater");

    const first = await save(app, url);
    const firstId = first.result.documentId;
    await app.api("PATCH", `/api/documents/${firstId}`, { tags: ["water"], category: "Garden" });

    // The second look says the address is here already.
    const looked = await preview(app, url);
    expect(looked.body.existing).toEqual([{ documentId: firstId, title: "Collecting rainwater", savedAt: expect.any(Number) }]);

    // Saving without saying what to do with the copy is refused, and changes nothing.
    const undecided = await app.api("POST", "/api/webpages/save", { url, previewId: looked.body.previewId });
    expect(undecided.status).toBe(409);
    expect(undecided.body.error.message).toMatch(/already in your library.*replace that copy or keep both/);
    expect(undecided.body.error.details.existing).toEqual(looked.body.existing);
    expect((await documentsOf(app)).map((document: { id: string }) => document.id)).toEqual([firstId]);

    // Both at once is not an answer either.
    expect((await app.api("POST", "/api/webpages/save", { url, keepBoth: true, replaceDocumentId: firstId })).status).toBe(400);

    // Keep both: a second document, the first untouched.
    const second = await save(app, url, { keepBoth: true });
    expect(second.state).toBe("succeeded");
    const secondId = second.result.documentId;
    expect(secondId).not.toBe(firstId);
    expect((await documentsOf(app)).map((document: { id: string }) => document.id).sort()).toEqual([firstId, secondId].sort());

    // A document that is not a copy of this address cannot be named as the one to replace.
    const other = await app.ctx.services.documents.ingestFile({
      sourcePath: writeTemp(app, "notes.md", "# My own notes\n\nNothing to do with the web.\n"),
      originalName: "notes.md",
    });
    const wrong = await app.api("POST", "/api/webpages/save", { url, replaceDocumentId: other.document.id });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toMatch(/not a saved copy of this address/);

    // Replace: the new copy takes the first one's place, with its tags and category, and the first is gone.
    gazette.routes.set("/articles/rainwater", {
      body: articlePage({ extra: "<p>An update: the barrel overflowed in April, and a second one now stands beside it.</p>" }),
    });
    const third = await save(app, url, { replaceDocumentId: firstId });
    expect(third.state).toBe("succeeded");
    expect(third.result.replacedDocumentId).toBe(firstId);
    const after = await documentsOf(app);
    expect(after.map((document: { id: string }) => document.id).sort()).toEqual(
      [other.document.id, secondId, third.result.documentId].sort(),
    );
    expect((await app.api("GET", `/api/documents/${firstId}`)).status).toBe(404);
    const replaced = after.find((document: { id: string }) => document.id === third.result.documentId);
    expect(replaced).toMatchObject({ tags: ["water"], category: "Garden", source: url });
    expect(fileOf(app, replaced.id)).toContain("a second one now stands beside it");
    // My own notes were never in question.
    expect(fileOf(app, other.document.id)).toBe("# My own notes\n\nNothing to do with the web.\n");
  });

  it("will not replace a document that only claims the address, without being a saved copy of it", async () => {
    app = await createTestApp();
    const gazette = await site();
    gazette.routes.set("/a", { body: articlePage() });
    const url = gazette.url("/a");
    // A file of the person's own, to which they gave this address as its source by hand.
    const own = await app.ctx.services.documents.ingestFile({
      sourcePath: writeTemp(app, "mine.md", "# What I think of that article\n\nMy own words.\n"),
      originalName: "mine.md",
    });
    await app.api("PATCH", `/api/documents/${own.document.id}`, { source: url });

    const job = await save(app, url, { replaceDocumentId: own.document.id });
    expect(job.state).toBe("failed");
    expect(job.error).toMatch(/could not be confirmed as a saved copy.*was not replaced/);
    expect((await documentsOf(app)).map((document: { id: string }) => document.id)).toEqual([own.document.id]);
    expect(fileOf(app, own.document.id)).toContain("My own words.");
  });

  it("does not fetch for a save that was asked for long ago", async () => {
    app = await createTestApp();
    const gazette = await site();
    gazette.routes.set("/a", { body: articlePage() });
    // As after a restart, or a pause: the job is there, but nobody is asking any more.
    const job = app.ctx.jobs.enqueue("webpage.save", { url: gazette.url("/a"), pictures: true }, { title: "Save", paused: true });
    app.ctx.sqlite.prepare("UPDATE jobs SET created_at = ? WHERE id = ?").run(Date.now() - 16 * 60_000, job.id);
    app.ctx.jobs.resume(job.id);

    const done = await finished(app, job.id);
    expect(done.state).toBe("failed");
    expect(done.error).toMatch(/asked for a while ago.*only when someone asks.*save the page again/);
    expect(gazette.requests).toEqual([]);
    expect(await documentsOf(app)).toEqual([]);
  });
});

function writeTemp(target: TestApp, name: string, content: string): string {
  const file = `${target.dir}/${name}`;
  fs.writeFileSync(file, content);
  return file;
}

describe("a page's pictures", () => {
  it("are not fetched unless asked for, and their descriptions stay", async () => {
    app = await createTestApp();
    const gazette = await site();
    gazette.routes.set("/a", {
      body: articlePage({
        pictures: `<figure><img src="/img/barrel.png" alt="A barrel on blocks"><figcaption>The barrel, raised.</figcaption></figure>`,
      }),
    });
    gazette.routes.set("/img/barrel.png", { body: png(64, 48), type: "image/png" });

    const looked = await preview(app, gazette.url("/a"));
    expect(looked.body.pictures).toEqual({ count: 1, willFetch: 1, hosts: [gazette.origin.replace("http://", "")] });
    // Looking at a page fetches the page alone.
    expect(gazette.seen("/img/barrel.png")).toHaveLength(0);

    const job = await save(app, gazette.url("/a"));
    expect(job.result.pictures).toEqual({ kept: 0, bytes: 0, skipped: [] });
    expect(gazette.seen("/img/barrel.png")).toHaveLength(0);
    const id = job.result.documentId;
    const shown = (await app.api("GET", `/api/documents/${id}/markdown`)).body;
    expect(JSON.stringify(shown.blocks)).toContain('{"t":"image","alt":"A barrel on blocks"}');
    expect(wordsOf(shown.blocks)).toContain("The barrel, raised.");
    expect((await picture(app, id, 1)).statusCode).toBe(404);
  });

  it("come along inside the one file, and are served as pictures and nothing else", async () => {
    app = await createTestApp();
    const gazette = await site();
    const cdn = await site();
    const barrel = png(640, 480);
    const lazy = png(320, 200);
    gazette.routes.set("/a", {
      body: articlePage({
        pictures: `
          <figure><img src="/img/barrel.png" alt="A barrel on blocks" width="640" height="480"><figcaption>The barrel, raised.</figcaption></figure>
          <p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="${cdn.url("/lazy.png")}" alt="Loaded late"></p>
          <picture><source srcset="${cdn.url("/small.png")} 400w, ${cdn.url("/wide.png")} 1200w" type="image/png"><img alt="Chosen from a set"></picture>
          <p><a href="/gallery"><img src="/img/barrel.png" alt="The same barrel again"></a></p>
          <p><img src="/img/diagram.svg" alt="A drawing of the diverter"></p>
          <p><img src="/img/gone.png" alt="A picture that is not there"></p>
          <p><img src="/img/page.png" alt="A page pretending"></p>
          <p><img src="/img/counter.png" alt=""></p>`,
      }),
    });
    gazette.routes.set("/img/barrel.png", { body: barrel, type: "image/png" });
    gazette.routes.set("/img/diagram.svg", {
      body: `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
      type: "image/svg+xml",
    });
    gazette.routes.set("/img/page.png", { body: "<html><body>Sign in to see this picture</body></html>", type: "image/png" });
    // A counter: one dot, with no size written on it in the page.
    gazette.routes.set("/img/counter.png", { body: png(1, 1), type: "image/png" });
    cdn.routes.set("/lazy.png", { body: lazy, type: "application/octet-stream" });
    cdn.routes.set("/wide.png", { body: png(1200, 10), type: "image/png" });
    cdn.routes.set("/small.png", { body: png(400, 10), type: "image/png" });

    const looked = await preview(app, gazette.url("/a"));
    // The drawing in SVG is not counted: it would not be kept, so it is not fetched.
    expect(looked.body.pictures.count).toBe(6);
    expect(looked.body.pictures.hosts.sort()).toEqual([gazette.origin, cdn.origin].map((origin) => origin.replace("http://", "")).sort());

    const started = await app.api("POST", "/api/webpages/save", {
      url: gazette.url("/a"),
      previewId: looked.body.previewId,
      pictures: true,
    });
    const job = await finished(app, started.body.job.id);
    expect(job.state).toBe("succeeded");
    expect(job.result.pictures.kept).toBe(3);
    expect(job.result.pictures.bytes).toBe(barrel.length + lazy.length + png(1200, 10).length);
    expect(job.result.pictures.skipped).toEqual([
      { url: gazette.url("/img/gone.png"), reason: expect.stringMatching(/not there.*404/) },
      { url: gazette.url("/img/page.png"), reason: expect.stringMatching(/not a PNG, JPEG, GIF or WebP picture/) },
    ]);
    // Each picture was asked for once; the SVG and the smaller of the set not at all.
    expect(gazette.seen("/img/barrel.png")).toHaveLength(1);
    expect(gazette.seen("/img/diagram.svg")).toHaveLength(0);
    expect(cdn.requests.map((request) => request.path)).toEqual(["/lazy.png", "/wide.png"]);
    // The page was fetched once: saving used the look.
    expect(gazette.seen("/a")).toHaveLength(1);

    const id = job.result.documentId;
    const shown = (await app.api("GET", `/api/documents/${id}/markdown`)).body;
    const images = [...JSON.stringify(shown.blocks).matchAll(/\{"t":"image"[^}]*\}/g)].map((match) => JSON.parse(match[0]));
    expect(images).toEqual([
      { t: "image", alt: "A barrel on blocks", picture: 1 },
      { t: "image", alt: "Loaded late", picture: 2 },
      { t: "image", alt: "Chosen from a set", picture: 3 },
      // The same picture twice is kept once. A picture that was also a link is just the picture.
      { t: "image", alt: "The same barrel again", picture: 1 },
      { t: "image", alt: "A drawing of the diverter" },
      { t: "image", alt: "A picture that is not there" },
      { t: "image", alt: "A page pretending" },
      // The counter is gone altogether.
    ]);
    expect(JSON.stringify(shown.blocks)).not.toContain("/gallery");

    const first = await picture(app, id, 1);
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("image/png");
    expect(first.headers["content-security-policy"]).toContain("sandbox");
    expect(first.headers["x-content-type-options"]).toBe("nosniff");
    expect(first.rawPayload.equals(barrel)).toBe(true);
    expect((await picture(app, id, 2)).rawPayload.equals(lazy)).toBe(true);
    expect((await picture(app, id, 4)).statusCode).toBe(404);
    expect((await picture(app, id, 0)).statusCode).toBe(400);
    expect((await picture(app, "nosuchdocument", 1)).statusCode).toBe(404);
    const again = await app.app.inject({
      method: "GET",
      url: `/api/documents/${id}/pictures/1`,
      headers: { host: "localhost", "if-none-match": first.headers.etag as string },
    });
    expect(again.statusCode).toBe(304);

    // It is one file, so everything that handles a document handles its pictures.
    const [document] = await documentsOf(app);
    expect(document.relPath).toMatch(/^documents\/[^/]+\/Collecting rainwater\.md$/);
    const location = app.ctx.services.storage.list()[0]!;
    expect(fs.readdirSync(`${location.path}/documents/${id}`)).toEqual(["Collecting rainwater.md"]);
    const file = fileOf(app, id);
    expect(file).toContain("![A barrel on blocks][outpost-picture-1]");
    expect(file).toContain(`\n[outpost-picture-1]: data:image/png;base64,${barrel.toString("base64")}\n`);
    expect(file).toContain(`![A picture that is not there](${gazette.url("/img/gone.png")})`);

    // The words are searched; the pictures' data is not mistaken for words.
    await waitFor(async () => (await app!.api("GET", `/api/documents/${id}`)).body.document.extraction === "done", "its text", 15_000);
    const text = (await app.api("GET", `/api/documents/${id}/text`)).body.sections
      .map((section: { text: string }) => section.text)
      .join("\n");
    expect(text).toContain("A barrel on blocks");
    expect(text).not.toMatch(/base64|outpost-picture|iVBOR/);
    expect((await app.api("GET", `/api/documents/${id}`)).body.document.textChars).toBeLessThan(3000);
  });

  it("are held to a number, a size each and a size in all", async () => {
    app = await createTestApp();
    const gazette = await site();
    // Thirty-two small pictures, where thirty are brought.
    const many = Array.from({ length: 32 }, (_, index) => `<p><img src="/small/${index}.png" alt="Small ${index}"></p>`).join("");
    for (let index = 0; index < 32; index += 1) gazette.routes.set(`/small/${index}.png`, { body: png(20 + index, 20), type: "image/png" });
    gazette.routes.set("/many", { body: articlePage({ pictures: many }) });

    const looked = await preview(app, gazette.url("/many"));
    expect(looked.body.pictures).toMatchObject({ count: 32, willFetch: 30 });
    const counted = await save(app, gazette.url("/many"), { pictures: true });
    expect(counted.result.pictures.kept).toBe(30);
    expect(counted.result.pictures.skipped).toEqual([
      { url: gazette.url("/small/30.png"), reason: expect.stringMatching(/more than 30 pictures/) },
      { url: gazette.url("/small/31.png"), reason: expect.stringMatching(/more than 30 pictures/) },
    ]);
    expect(gazette.seen("/small/29.png")).toHaveLength(1);
    expect(gazette.seen("/small/30.png")).toHaveLength(0);

    // One picture over the size for a single picture: stated by the server, and not stated.
    gazette.routes.set("/big/stated.png", { body: png(100, 100, 5 * MB + 10), type: "image/png" });
    gazette.routes.set("/big/unstated.png", { body: png(100, 100, 5 * MB + 10), type: "image/png", unsized: true });
    gazette.routes.set("/big/fine.png", { body: png(100, 100, 1000), type: "image/png" });
    gazette.routes.set("/big", {
      body: articlePage({
        pictures: `<img src="/big/stated.png" alt="Too big"><img src="/big/unstated.png" alt="Too big, quietly"><img src="/big/fine.png" alt="Fine">`,
      }),
    });
    const sized = await save(app, gazette.url("/big"), { pictures: true });
    expect(sized.state).toBe("succeeded");
    expect(sized.result.pictures.kept).toBe(1);
    expect(sized.result.pictures.skipped).toEqual([
      { url: gazette.url("/big/stated.png"), reason: expect.stringMatching(/larger than 5 MB.*one picture/) },
      { url: gazette.url("/big/unstated.png"), reason: expect.stringMatching(/larger than 5 MB.*one picture/) },
    ]);

    // Five pictures of 4.5 MB: the fifth would take the total past 20 MB.
    const heavy = Array.from({ length: 6 }, (_, index) => `<img src="/heavy/${index}.png" alt="Heavy ${index}">`).join("");
    for (let index = 0; index < 5; index += 1)
      gazette.routes.set(`/heavy/${index}.png`, { body: png(100, 100 + index, 4.5 * MB), type: "image/png" });
    gazette.routes.set("/heavy/5.png", { body: png(30, 30), type: "image/png" });
    gazette.routes.set("/heavy", { body: articlePage({ pictures: heavy }) });
    const totalled = await save(app, gazette.url("/heavy"), { pictures: true });
    expect(totalled.state).toBe("succeeded");
    // Four large ones, and the small sixth, which still fits.
    expect(totalled.result.pictures.kept).toBe(5);
    expect(totalled.result.pictures.bytes).toBeLessThanOrEqual(20 * MB);
    expect(totalled.result.pictures.skipped).toEqual([
      { url: gazette.url("/heavy/4.png"), reason: expect.stringMatching(/more than 20 MB.*one page/) },
    ]);

    // A file that heavy still opens, and its text is still all read.
    const id = totalled.result.documentId;
    const [document] = (await documentsOf(app)).filter((entry: { id: string }) => entry.id === id);
    expect(document.sizeBytes).toBeGreaterThan(24 * MB);
    const shown = await app.api("GET", `/api/documents/${id}/markdown`);
    expect(shown.status).toBe(200);
    expect(JSON.stringify(shown.body.blocks)).toContain('{"t":"image","alt":"Heavy 3","picture":4}');
    const fourth = await picture(app, id, 4);
    expect(fourth.rawPayload.length).toBe(png(100, 103, 4.5 * MB).length);
    await waitFor(async () => (await app!.api("GET", `/api/documents/${id}`)).body.document.extraction === "done", "its text", 30_000);
    const read = (await app.api("GET", `/api/documents/${id}`)).body.document;
    expect(read.extractionDetail).toBeNull();
    expect(read.textChars).toBeLessThan(3000);
    expect(
      (await app.api("GET", "/api/search?q=mosquitoes")).body.results.map((result: { entityId: string }) => result.entityId),
    ).toContain(id);
  }, 60_000);
});

describe("what is refused, and how it is said", () => {
  it("an answer that is not a web page", async () => {
    app = await createTestApp();
    const files = await site();
    files.routes.set("/paper.pdf", { body: "%PDF-1.7 not really", type: "application/pdf" });
    files.routes.set("/data", { body: '{"a": 1}', type: "application/json; charset=utf-8" });
    files.routes.set("/photo", { body: png(10, 10), type: "image/png" });
    files.routes.set("/notes", { body: "Just some text.\n".repeat(40), type: "text/plain" });
    files.routes.set("/binary", { body: Buffer.from([0, 1, 2, 3, 0, 0, 9]), type: "text/html" });
    files.routes.set("/untyped-bytes", { body: png(10, 10), type: null });
    for (const [path, said] of [
      ["/paper.pdf", /holds a PDF, not a web page/],
      ["/data", /holds data \(JSON\), not a web page/],
      ["/photo", /holds a picture, not a web page/],
      ["/notes", /holds a plain text file, not a web page/],
      ["/binary", /not a web page/],
      ["/untyped-bytes", /not a web page/],
    ] as const) {
      const refused = await preview(app, files.url(path));
      expect(refused.status, path).toBe(415);
      expect(refused.body.error.message, path).toMatch(said);
      expect(refused.body.error.message).toMatch(/add it to the Library/);
    }
    // A page whose server does not say what it is, is still a page.
    files.routes.set("/untyped", { body: articlePage(), type: null });
    expect((await preview(app, files.url("/untyped"))).body.title).toBe("Collecting rainwater");
    // Saving straight away, without a look, meets the same refusal.
    const started = await app.api("POST", "/api/webpages/save", { url: files.url("/paper.pdf") });
    const job = await finished(app, started.body.job.id);
    expect(job.state).toBe("failed");
    expect(job.error).toMatch(/holds a PDF, not a web page/);
    expect(job.attempts).toBe(1);
    expect(await documentsOf(app)).toEqual([]);
  });

  it("a page with nothing to read, saying that Outpost runs no scripts", async () => {
    app = await createTestApp();
    const apps = await site();
    apps.routes.set("/app", { body: scriptOnlyPage });
    apps.routes.set("/login", { body: signInPage });
    apps.routes.set("/empty", { body: "<!doctype html><title>Nothing</title><body><p>Hello.</p></body>" });

    const scripted = await preview(app, apps.url("/app"));
    expect(scripted.status).toBe(415);
    expect(scripted.body.error.message).toMatch(/^No readable text was found on this page\. It appears to be drawn by a script/);
    expect(scripted.body.error.message).toMatch(/Outpost has no browser inside it and does not run a page's scripts/);
    // And it did not go looking for the script.
    expect(apps.requests.map((request) => request.path)).toEqual(["/app"]);

    const wall = await preview(app, apps.url("/login"));
    expect(wall.status).toBe(415);
    expect(wall.body.error.message).toMatch(/It appears to ask you to sign in, and Outpost does not sign in to sites/);

    const empty = await preview(app, apps.url("/empty"));
    expect(empty.status).toBe(415);
    expect(empty.body.error.message).toMatch(/No readable text was found/);
    expect(await documentsOf(app)).toEqual([]);
  });

  it("a page that is too large, in bytes or in parts", async () => {
    app = await createTestApp();
    const big = await site();
    const sixMegabytes = articlePage({ extra: paragraphs(22_000) });
    expect(Buffer.byteLength(sixMegabytes)).toBeGreaterThan(5 * MB);
    big.routes.set("/stated", { body: sixMegabytes });
    big.routes.set("/unstated", { body: sixMegabytes, unsized: true });
    // Small on the wire, large once unpacked: what counts is what it unpacks to.
    big.routes.set("/packed", { body: sixMegabytes, gzip: true });
    for (const path of ["/stated", "/unstated", "/packed"]) {
      const refused = await preview(app, big.url(path));
      expect(refused.status, path).toBe(413);
      expect(refused.body.error.message, path).toMatch(
        /The page is larger than 5 MB, which is the most Outpost fetches for it, so it was not saved/,
      );
    }

    // Under the size, but made of far more elements than an article has.
    big.routes.set("/parts", {
      body: `<!doctype html><html><body><article>${paragraphs(4)}${"<i></i>".repeat(150_000)}</article></body></html>`,
    });
    const parts = await preview(app, big.url("/parts"));
    expect(parts.status).toBe(413);
    expect(parts.body.error.message).toMatch(/more parts than Outpost reads: about 150,0\d\d elements, and the most is 50,000/);

    // Nested far deeper than anyone writes: refused, and the server is still answering.
    big.routes.set("/deep", {
      body: `<!doctype html><html><body>${"<div>".repeat(30_000)}${paragraphs(4)}${"</div>".repeat(30_000)}</body></html>`,
    });
    const deep = await preview(app, big.url("/deep"));
    expect(deep.status).toBe(415);
    expect(deep.body.error.message).toMatch(/could not be read|No readable text/);
    expect((await app.api("GET", "/api/system")).status).toBe(200);

    // A large page that is within the limits is saved whole.
    big.routes.set("/long", { body: articlePage({ extra: paragraphs(3000) }), gzip: true });
    const long = await save(app, big.url("/long"));
    expect(long.state).toBe("succeeded");
    expect(await documentsOf(app)).toHaveLength(1);
  }, 60_000);

  it("a site that is too slow, that answers with an error, or that is not there", async () => {
    app = await createTestApp();
    const slow = await site();
    slow.routes.set("/slow", { body: articlePage(), delayMs: 3000 });
    slow.routes.set("/missing", { status: 404, body: "<h1>Not found</h1>" });
    slow.routes.set("/forbidden", { status: 403, body: "<h1>Forbidden</h1>" });
    slow.routes.set("/broken", { status: 503, body: "<h1>Down</h1>" });
    slow.routes.set("/loop", { redirectTo: "/loop" });

    WEB_PAGE_LIMITS.pageSeconds = 0.4;
    const started = Date.now();
    const late = await preview(app, slow.url("/slow"));
    expect(late.status).toBe(502);
    expect(late.body.error.message).toMatch(/The page did not arrive within 0 seconds, so Outpost stopped waiting/);
    expect(Date.now() - started).toBeLessThan(2500);
    WEB_PAGE_LIMITS.pageSeconds = limits.pageSeconds;

    const missing = await preview(app, slow.url("/missing"));
    expect(missing.status).toBe(502);
    expect(missing.body.error.message).toMatch(/The page is not there: the site answered 404/);
    expect((await preview(app, slow.url("/forbidden"))).body.error.message).toMatch(
      /refused to send the page \(it answered 403\).*Outpost does not sign in/,
    );
    expect((await preview(app, slow.url("/broken"))).body.error.message).toMatch(/answered 503, an error on its side/);
    expect((await preview(app, slow.url("/loop"))).body.error.message).toMatch(/redirected too many times/);

    const closedPort = slow.port;
    await slow.close();
    sites.splice(sites.indexOf(slow), 1);
    const gone = await preview(app, `http://127.0.0.1:${closedPort}/a`);
    expect(gone.status).toBe(503);
    expect(gone.body.error.message).toMatch(/could not reach 127\.0\.0\.1:\d+\. Saving a web page needs an internet connection/);
  });

  it("an address on this computer or a private network, as written or after a redirect", async () => {
    app = await createTestApp({ OUTPOST_ALLOW_PRIVATE_DOWNLOADS: "false" });
    const internal = await site();
    internal.routes.set("/admin", { body: articlePage() });
    internal.routes.set("/logo.png", { body: png(50, 50), type: "image/png" });

    for (const address of [
      internal.url("/admin"),
      `http://localhost:${internal.port}/admin`,
      `http://[::ffff:127.0.0.1]:${internal.port}/admin`,
      "http://192.168.1.1/",
      "http://10.0.0.5/status",
      "http://169.254.169.254/latest/meta-data/",
      "http://[fd00::1]/",
      "http://2130706433/",
      "http://router/",
    ]) {
      const refused = await preview(app, address);
      expect([400, 403], address).toContain(refused.status);
      if (refused.status === 403) expect(refused.body.error.message, address).toMatch(/on this computer or a private network/);
      expect((await app.api("POST", "/api/webpages/save", { url: address })).status, address).toBe(refused.status);
    }
    expect(internal.requests).toEqual([]);

    // A redirect can only be reached through a first hop that is public, which no offline
    // test has. So one loopback address (::1) is declared public for this test, standing
    // in for a site on the internet; 127.0.0.1 stays private.
    let outside: Site;
    try {
      outside = await site("::1");
    } catch {
      return; // No IPv6 loopback on this machine; the cases above still ran.
    }
    const realCheck = net.BlockList.prototype.check;
    vi.spyOn(net.BlockList.prototype, "check").mockImplementation(function (this: net.BlockList, address, family) {
      if (address === "::1") return false;
      return realCheck.call(this, address as string, family as "ipv4");
    });
    outside.routes.set("/bounce", { redirectTo: internal.url("/admin") });
    outside.routes.set("/bounce.png", { redirectTo: internal.url("/logo.png") });
    outside.routes.set("/fine.png", { body: png(60, 60), type: "image/png" });
    outside.routes.set("/article", {
      body: articlePage({
        pictures: `<img src="/fine.png" alt="Fine"><img src="/bounce.png" alt="Redirects inward"><img src="${internal.url("/logo.png")}" alt="Written inward"><img src="http://localhost:${internal.port}/logo.png" alt="Named inward">`,
      }),
    });

    const bounced = await preview(app, outside.url("/bounce"));
    expect(bounced.status).toBe(403);
    expect(bounced.body.error.message).toMatch(
      /The page is at, or redirects to, an address on this computer or a private network.*was not fetched/,
    );

    // A public page whose pictures point inward: the page is saved, those pictures are not fetched.
    const looked = await preview(app, outside.url("/article"));
    expect(looked.status).toBe(200);
    // Addresses that are plainly private are not even counted.
    expect(looked.body.pictures.count).toBe(2);
    const started = await app.api("POST", "/api/webpages/save", {
      url: outside.url("/article"),
      previewId: looked.body.previewId,
      pictures: true,
    });
    const job = await finished(app, started.body.job.id);
    expect(job.state).toBe("succeeded");
    expect(job.result.pictures.kept).toBe(1);
    expect(job.result.pictures.skipped).toEqual([
      { url: outside.url("/bounce.png"), reason: expect.stringMatching(/on this computer or a private network/) },
    ]);
    expect(internal.requests).toEqual([]);
  });

  it("reads pages in the character sets the web is written in", async () => {
    app = await createTestApp();
    const old = await site();
    /** A page whose last paragraph is these bytes, exactly as given. */
    const page = (head: string, words: Buffer | string) =>
      Buffer.concat([
        Buffer.from(`<!doctype html><html><head>${head}</head><body><article><h1>Titre</h1>${paragraphs(3)}<p>`, "latin1"),
        typeof words === "string" ? Buffer.from(words, "latin1") : words,
        Buffer.from("</p></article></body></html>", "latin1"),
      ]);
    // Windows-1252: e-acute and friends, then a dash and curly quotes, which Latin-1 does not have.
    const western = page(
      "<title>Un texte</title>",
      Buffer.concat([
        Buffer.from("Le caf\u00e9 est d\u00e9j\u00e0 pr\u00eat ", "latin1"),
        Buffer.from([0x96, 0x20, 0x93, 0x6f, 0x75, 0x69, 0x94]),
      ]),
    );
    // Named by the server.
    old.routes.set("/header", { body: western, type: "text/html; charset=windows-1252" });
    // The same bytes with no character set named anywhere: not valid UTF-8, so read as Windows-1252.
    old.routes.set("/unnamed", { body: western, type: "text/html" });
    // ISO-8859-2 (Polish), named only by the page itself. The bytes are written here as the Latin-1 characters that share them.
    const polish = page(
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-2"><title>Woda</title>',
      Buffer.from([0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6, 0x20, 0x67, 0xea, 0xb6, 0x6c, 0xb1, 0x20, 0x6a, 0x61, 0xbc, 0xf1]),
    );
    old.routes.set("/meta", { body: polish, type: "text/html" });
    // Shift_JIS, named by the page: the three characters of "Japanese" in Japanese are 93 FA 96 7B 8C EA.
    old.routes.set("/sjis", {
      body: page('<meta charset="Shift_JIS"><title>T</title>', Buffer.from([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea])),
      type: "text/html",
    });
    // UTF-16 with its byte-order mark, whatever the server claims.
    const wide = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(
        `<!doctype html><html><head><title>T</title></head><body><article>${paragraphs(3)}<p>Wide: \u65e5\u672c\u8a9e and caf\u00e9</p></article></body></html>`,
        "utf16le",
      ),
    ]);
    old.routes.set("/utf16", { body: wide, type: "text/html; charset=iso-8859-1" });
    // UTF-8 named by the server wins over a page that says otherwise.
    const mislabelled = Buffer.from(
      `<!doctype html><html><head><meta charset="iso-8859-1"><title>T</title></head><body><article>${paragraphs(3)}<p>Na\u00efve r\u00e9sum\u00e9</p></article></body></html>`,
      "utf8",
    );
    old.routes.set("/utf8", { body: mislabelled, type: "text/html; charset=utf-8" });
    // A character set nobody has heard of counts as none named: the page's own claim is next, then UTF-8.
    old.routes.set("/unknown", {
      body: Buffer.from(mislabelled.toString("utf8").replace('<meta charset="iso-8859-1">', ""), "utf8"),
      type: "text/html; charset=x-made-up",
    });

    for (const [path, expected] of [
      ["/header", "Le café est déjà prêt – “oui”"],
      ["/unnamed", "Le café est déjà prêt – “oui”"],
      ["/meta", "Zażółć gęślą jaźń"],
      ["/sjis", "日本語"],
      ["/utf16", "Wide: 日本語 and café"],
      ["/utf8", "Naïve résumé"],
      ["/unknown", "Naïve résumé"],
    ] as const) {
      const job = await save(app, old.url(path));
      expect(job.state, path).toBe("succeeded");
      // Whatever came in, what is kept is UTF-8.
      expect(fileOf(app, job.result.documentId), path).toContain(expected);
    }
  });
});
