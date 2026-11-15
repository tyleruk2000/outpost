import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPdf } from "./fixtures/documents/builders.ts";
import { type FileServer, startFileServer, waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
const servers: FileServer[] = [];
afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const server of servers.splice(0)) await server.close();
});

async function fileServer(): Promise<FileServer> {
  const server = await startFileServer();
  servers.push(server);
  return server;
}

/** A test server on this machine stands in for the website a reference page links to. */
const withLocalSites = () => createTestApp({ OUTPOST_ALLOW_PRIVATE_DOWNLOADS: "true" });

const settled = (target: TestApp, id: string) =>
  waitFor(() => ["completed", "failed"].includes(target.ctx.services.downloads.get(id)?.state ?? ""), "the saved link", 15_000).then(
    () => target.ctx.services.downloads.get(id)!,
  );

const paper = buildPdf([
  ["Radiation dosimetry", "A dosimeter records the dose a person has received."],
  ["Reading the dial", "Hold it to the light."],
]);

describe("saving a file that a reference page links to", () => {
  it("fetches it into the document library, where it can be read and searched", async () => {
    app = await withLocalSites();
    const site = await fileServer();
    site.routes.set("/doddir/milmed/dosimetry.pdf", { body: paper });
    const url = site.url("/doddir/milmed/dosimetry.pdf");

    const started = await app.api("POST", "/api/links/save", { url, title: "Dosimetry", foundIn: "Military Medicine" });
    expect(started.status).toBe(200);
    expect(started.body.download).toMatchObject({ kind: "document", title: "Dosimetry", url, state: "queued" });

    const row = await settled(app, started.body.download.id);
    expect(row.state).toBe("completed");

    const { documents } = (await app.api("GET", "/api/documents")).body;
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ title: "Dosimetry", type: "pdf", source: url, originalName: "dosimetry.pdf" });
    expect(documents[0].description).toMatch(/Military Medicine/);
    // It is a document, not a second kind of collection.
    expect((await app.api("GET", "/api/collections")).body.collections).toEqual([]);
    // The download knows which document it became, so the Downloads screen can link to it.
    expect((await app.api("GET", `/api/downloads/${row.id}`)).body.download.documentId).toBe(documents[0].id);
    // Nothing is left behind in the folder it was fetched into.
    const location = app.ctx.services.storage.list()[0]!;
    expect(fs.existsSync(path.join(location.path, "documents", "saved"))).toBe(false);

    await waitFor(
      async () => (await app!.api("GET", `/api/documents/${documents[0].id}`)).body.document.extraction === "done",
      "its text",
      15_000,
    );
    const found = (await app.api("GET", "/api/search?q=dosimeter")).body.results;
    expect(found[0]).toMatchObject({ kind: "document", title: "Dosimetry" });
  });

  it("says a link is already saved, or on its way, and does not fetch it twice", async () => {
    app = await withLocalSites();
    const site = await fileServer();
    site.routes.set("/a.pdf", { body: paper });
    site.routes.set("/b.pdf", { body: buildPdf([["Another paper entirely"]]), delayMs: 300, chunkBytes: 200 });
    const [a, b] = [site.url("/a.pdf"), site.url("/b.pdf")];

    const first = await app.api("POST", "/api/links/save", { url: a });
    await settled(app, first.body.download.id);
    const slow = await app.api("POST", "/api/links/save", { url: b });

    const check = await app.api("POST", "/api/links/check", { urls: [a, b, site.url("/c.pdf")] });
    expect(check.body.links).toEqual([
      { url: a, state: "saved", documentId: expect.any(String) },
      { url: b, state: "saving", downloadId: slow.body.download.id },
      { url: site.url("/c.pdf"), state: "new" },
    ]);

    const again = await app.api("POST", "/api/links/save", { url: a });
    expect(again.body).toMatchObject({ already: "saved", document: { id: check.body.links[0].documentId } });
    expect((await app.api("POST", "/api/links/save", { url: b })).body).toMatchObject({ already: "saving" });
    expect(site.requests.filter((seen) => seen.path === "/a.pdf" && seen.method === "GET")).toHaveLength(1);
    await settled(app, slow.body.download.id);
  });

  it("saves several at once and reports what it did with each", async () => {
    app = await withLocalSites();
    const site = await fileServer();
    for (const name of ["one", "two", "three"]) site.routes.set(`/${name}.pdf`, { body: buildPdf([[`Paper ${name}`]]) });
    const first = await app.api("POST", "/api/links/save", { url: site.url("/one.pdf") });
    await settled(app, first.body.download.id);

    const many = await app.api("POST", "/api/links/save-all", {
      foundIn: "Military Medicine",
      links: [
        { url: site.url("/one.pdf"), title: "One" },
        { url: site.url("/two.pdf"), title: "Two" },
        { url: site.url("/three.pdf") },
        { url: "https://example.org/notes.docx" },
      ],
    });
    expect(many.status).toBe(200);
    expect(many.body.queued).toHaveLength(2);
    expect(many.body.already).toBe(1);
    expect(many.body.refused).toEqual([{ url: "https://example.org/notes.docx", reason: expect.stringMatching(/PDF/) }]);
    for (const download of many.body.queued) await settled(app, download.id);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(3);
  });

  it("will not be used to reach this network, or anything that is not a web address", async () => {
    app = await createTestApp({ OUTPOST_ALLOW_PRIVATE_DOWNLOADS: "false" });
    const site = await fileServer();
    site.routes.set("/a.pdf", { body: paper });
    // This machine and the home network are off limits unless the person running the server said otherwise.
    for (const url of [
      site.url("/a.pdf"),
      "http://localhost/a.pdf",
      "http://192.168.1.1/manual.pdf",
      "http://10.0.0.5/a.pdf",
      "http://[::1]/a.pdf",
      "http://169.254.169.254/a.pdf",
    ]) {
      const refused = await app.api("POST", "/api/links/save", { url });
      expect(refused.status, url).toBe(403);
      expect(refused.body.error.message).toMatch(/this computer or your own network/);
    }
    expect(site.requests).toHaveLength(0);
    expect(app.ctx.services.downloads.list()).toEqual([]);
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "ftp://example.org/a.pdf",
      "https://user:secret@example.org/a.pdf",
      "not a link",
      "",
    ]) {
      expect((await app.api("POST", "/api/links/save", { url })).status, url).toBe(400);
    }
    expect(
      (
        await app.api("POST", "/api/links/save-all", {
          links: Array.from({ length: 201 }, (_, n) => ({ url: `https://example.org/${n}.pdf` })),
        })
      ).status,
    ).toBe(400);
    expect((await app.api("GET", "/api/documents")).body.total).toBe(0);
  });

  it("adds nothing when what arrives is not the kind of file its name says", async () => {
    app = await withLocalSites();
    const site = await fileServer();
    site.routes.set("/report.pdf", { body: Buffer.from("<html><body>Sign in to continue</body></html>") });
    site.routes.set("/gone.pdf", { body: paper, status: 404 });

    const wrong = await app.api("POST", "/api/links/save", { url: site.url("/report.pdf") });
    const row = await settled(app, wrong.body.download.id);
    expect(row.state).toBe("failed");
    expect(row.error).toMatch(/named like a PDF, but its contents are not one/);
    expect(row.attempts).toBe(1);

    const gone = await app.api("POST", "/api/links/save", { url: site.url("/gone.pdf") });
    expect((await settled(app, gone.body.download.id)).error).toMatch(/no longer at this address/);

    expect((await app.api("GET", "/api/documents")).body.total).toBe(0);
    // The unusable file is gone already; clearing the failed downloads leaves nothing behind.
    const location = app.ctx.services.storage.list()[0]!;
    const saved = path.join(location.path, "documents", "saved");
    expect((fs.existsSync(saved) ? fs.readdirSync(saved) : []).filter((name) => !name.endsWith(".part"))).toEqual([]);
    for (const id of [wrong.body.download.id, gone.body.download.id]) await app.api("DELETE", `/api/downloads/${id}`);
    expect(fs.existsSync(saved) ? fs.readdirSync(saved) : []).toEqual([]);
  });
});
