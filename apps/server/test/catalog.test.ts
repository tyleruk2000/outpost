import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CatalogEntryDto, CatalogResponse } from "@outpost/shared";
import { CATALOG_CATEGORIES } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { entriesToCheck, hostsToSkip, KIWIX_HOSTS, validateCatalog } from "../src/cli/validate-catalog.ts";
import { createHttpClient } from "../src/core/http.ts";
import {
  type KiwixBook,
  parseMetalink,
  parseOpdsFeed,
  parseSha256File,
  pickBook,
  versionFromFileName,
} from "../src/modules/catalog/kiwix.ts";
import { type LoadedEntry, loadCatalog, manifestJsonSchema, parseManifest } from "../src/modules/catalog/manifest.ts";
import { resolveEntries } from "../src/modules/catalog/resolve.ts";
import { compareVersions, createCatalogService } from "../src/modules/catalog/service.ts";
import { serveKiwixLibrary, sha256Of } from "./fixtures/catalog/kiwix-library.ts";
import { type FileServer, startFileServer, testBytes, unusedPort, waitFor } from "./fixtures/downloads/file-server.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures/catalog", name), "utf8");
const repoCatalogDir = path.resolve(import.meta.dirname, "../../../catalog");

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

type Json = Record<string, unknown>;

function entry(id: string, source: Json, extra: Json = {}): Json {
  return {
    id,
    name: `Name of ${id}`,
    description: `Description of ${id}`,
    category: "reference",
    publisher: "Test Press",
    language: "en",
    format: source.type === "kiwix" ? "zim" : "pdf",
    license: "CC BY-SA 4.0",
    attribution: "Test Press contributors",
    lastVerified: "2026-11-15",
    source,
    ...extra,
  };
}

function manifest(id: string, entries: Json[], extra: Json = {}): Json {
  return {
    schemaVersion: 1,
    id,
    name: `Manifest ${id}`,
    description: "A manifest for tests",
    maintainers: ["Tests"],
    downloadHosts: ["127.0.0.1"],
    entries,
    ...extra,
  };
}

/** Writes a manifest where the server ships its own, and makes the running server read it. */
function ship(target: TestApp, file: string, content: Json | string): void {
  const dir = path.join(target.dir, "catalog", "manifests");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  target.ctx.services.catalog.reload();
}

async function catalogOf(target: TestApp): Promise<CatalogResponse> {
  const response = await target.api<CatalogResponse>("GET", "/api/catalog");
  expect(response.status).toBe(200);
  return response.body;
}

async function entryOf(target: TestApp, id: string): Promise<CatalogEntryDto> {
  const found = (await catalogOf(target)).entries.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`entry ${id} is not in the catalogue`);
  return found;
}

async function downloadFinished(target: TestApp, id: string) {
  return waitFor(() => {
    const row = target.ctx.services.downloads.get(id);
    return row && ["completed", "failed", "cancelled"].includes(row.state) ? row : undefined;
  }, "the download to finish");
}

describe("manifests", () => {
  it("reports invalid manifests and entries instead of failing", async () => {
    app = await createTestApp();
    const server = await fileServer();
    ship(
      app,
      "a-good.json",
      manifest("good", [
        entry("good.one", { type: "http", url: server.url("/one.pdf") }),
        entry("good.off-list", { type: "http", url: "http://files.example.org/two.pdf" }),
        entry("good.kiwix-pdf", { type: "kiwix", name: "book_en", flavour: "" }, { format: "pdf" }),
      ]),
    );
    ship(app, "b-broken.json", "{ this is not json");
    ship(
      app,
      "c-wrong-shape.json",
      manifest("wrong", [entry("Wrong ID", { type: "http", url: server.url("/x") }, { category: "cats", license: undefined })]),
    );
    ship(
      app,
      "d-duplicate.json",
      manifest("dupes", [
        entry("good.one", { type: "http", url: server.url("/other.pdf") }),
        entry("dupes.fine", { type: "http", url: server.url("/fine.pdf") }),
      ]),
    );
    ship(app, "e-same-id.json", manifest("good", []));
    ship(app, "f-future.json", { ...manifest("future", []), schemaVersion: 2 });
    ship(app, "notes.txt", "not a manifest; ignored");
    // A manifest the person running the server added themselves.
    fs.mkdirSync(path.join(app.ctx.config.dataDir, "catalog"), { recursive: true });
    fs.writeFileSync(
      path.join(app.ctx.config.dataDir, "catalog", "mine.json"),
      JSON.stringify(manifest("mine", [entry("mine.guide", { type: "http", url: server.url("/guide.pdf") }, { category: "survival" })])),
    );
    app.ctx.services.catalog.reload();

    const catalog = await catalogOf(app);
    expect(catalog.entries.map((item) => item.id)).toEqual(["good.one", "dupes.fine", "mine.guide"]);
    expect(catalog.manifests).toEqual([
      { id: "good", name: "Manifest good" },
      { id: "dupes", name: "Manifest dupes" },
      { id: "mine", name: "Manifest mine" },
    ]);
    expect(catalog.entries[0]).toMatchObject({
      manifestId: "good",
      status: "not_installed",
      availability: "unknown",
      updateAvailable: false,
      sizeBytes: null,
    });

    const problem = (file: string, entryId?: string) =>
      catalog.problems.find((item) => item.file === file && item.entryId === entryId)?.message ?? "";
    expect(catalog.problems).toHaveLength(7);
    expect(problem("b-broken.json")).toMatch(/not valid JSON/);
    expect(problem("c-wrong-shape.json")).toMatch(/does not follow the format: entry "Wrong ID", id: Entry ids are lower-case/);
    expect(problem("c-wrong-shape.json")).toMatch(/category/);
    expect(problem("c-wrong-shape.json")).toMatch(/license/);
    expect(problem("a-good.json", "good.off-list")).toMatch(/files\.example\.org, which is not in this manifest's downloadHosts/);
    expect(problem("a-good.json", "good.kiwix-pdf")).toMatch(/Kiwix books are ZIM archives/);
    expect(problem("d-duplicate.json", "good.one")).toMatch(/already used by an entry in a-good\.json; the first one is kept/);
    expect(problem("e-same-id.json")).toMatch(/Another manifest already uses the id "good"/);
    expect(problem("f-future.json")).toMatch(/newer than this version of Outpost understands/);

    expect(catalog.categories.map((category) => category.slug)).toEqual(CATALOG_CATEGORIES.map((category) => category.slug));
    expect(catalog.categories.find((category) => category.slug === "reference")).toEqual({
      slug: "reference",
      label: "History and general reference",
      count: 2,
    });
    expect(catalog.categories.find((category) => category.slug === "survival")!.count).toBe(1);
    expect(catalog.categories.find((category) => category.slug === "maps")!.count).toBe(0);
    expect(catalog.lastRefreshedAt).toBeNull();
  });

  it("accepts plain http only where private downloads are allowed, and never unknown fields", () => {
    const withHttp = JSON.stringify(manifest("mm", [entry("m.one", { type: "http", url: "http://127.0.0.1/a.pdf" })]));
    expect(parseManifest(withHttp).problem).toMatch(/must start with https:\/\//);
    expect(parseManifest(withHttp, { allowInsecureHttp: true }).manifest?.entries).toHaveLength(1);

    const withZimUrl = JSON.stringify(
      manifest("mm", [entry("m.one", { type: "kiwix", name: "a", flavour: "", url: "https://download.kiwix.org/zim/a.zim" })]),
    );
    expect(parseManifest(withZimUrl).problem).toMatch(/does not follow the format/);
    expect(parseManifest(JSON.stringify(manifest("mm", [], { downloadHosts: ["https://kiwix.org/"] }))).problem).toMatch(
      /bare lower-case host name/,
    );
  });

  it("is searchable from unified search, installed or not", async () => {
    app = await createTestApp();
    const server = await fileServer();
    ship(
      app,
      "m.json",
      manifest("mm", [
        entry(
          "m.knots",
          { type: "http", url: server.url("/knots.pdf") },
          { name: "A Library of Knots", description: "Bowlines, hitches and lashings", category: "survival", tags: ["rope"] },
        ),
      ]),
    );
    const found = await app.ctx.services.search.search({ q: "lashings" });
    expect(found.results[0]).toMatchObject({
      kind: "catalog",
      entityId: "m.knots",
      title: "A Library of Knots",
      url: "/explore?entry=m.knots",
      collection: "survival",
    });

    // An entry dropped from the manifests leaves search too.
    ship(app, "m.json", manifest("mm", []));
    expect((await app.ctx.services.search.search({ q: "lashings" })).results).toHaveLength(0);
  });
});

describe("the shipped catalogue", () => {
  it("passes the validator", () => {
    const result = validateCatalog(repoCatalogDir);
    expect(result.problems).toEqual([]);
    expect(result.manifests).toBeGreaterThanOrEqual(1);
    expect(result.entries).toBeGreaterThanOrEqual(61);
  });

  it("passes the validator when run as the command", () => {
    const cli = path.resolve(import.meta.dirname, "../src/cli/validate-catalog.ts");
    const run = spawnSync(process.execPath, [cli], { encoding: "utf8" });
    expect(run.stdout).toMatch(/The catalogue is valid\./);
    expect(run.status).toBe(0);

    const empty = fs.mkdtempSync(path.join(import.meta.dirname, "../node_modules/.catalog-test-"));
    try {
      fs.mkdirSync(path.join(empty, "manifests"));
      fs.writeFileSync(path.join(empty, "manifests", "bad.json"), "{}");
      const failing = spawnSync(process.execPath, [cli, "--dir", empty], { encoding: "utf8" });
      expect(failing.status).toBe(1);
      expect(failing.stderr).toMatch(/bad\.json: This manifest does not follow the format/);
      expect(failing.stderr).toMatch(/manifest\.schema\.json is missing/);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it("follows the rules for curated entries", () => {
    const { entries, manifests, downloadHosts } = loadCatalog([path.join(repoCatalogDir, "manifests")]);
    expect(downloadHosts).toEqual(
      expect.arrayContaining(["download.kiwix.org", "lb.download.kiwix.org", "library.kiwix.org", "opds.library.kiwix.org"]),
    );
    expect(manifests.map((item) => item.id)).toEqual(expect.arrayContaining(["kiwix-essentials", "kiwix-more", "official-publications"]));
    for (const item of entries) {
      // Kiwix rebuilds its books; an address written down today is gone in two months.
      if (item.source.type === "kiwix") expect(JSON.stringify(item), item.id).not.toMatch(/\.zim\b/);
      // A file fetched from its publisher is pinned, so what arrives is what was checked,
      // and so a refresh never has to contact the publisher about it.
      if (item.source.type === "http") {
        expect(item.source.sha256, item.id).toMatch(/^[0-9a-f]{64}$/);
        expect(item.source.sizeBytes, item.id).toBeGreaterThan(0);
        expect(item.source.url, item.id).toMatch(/^https:\/\//);
        expect(item.format, item.id).not.toBe("zim");
        expect(item.homepage, item.id).toBeTruthy();
      }
      expect(item.category, item.id).not.toBe("maps");
      if (item.license === "See source") expect(item.licenseNote, item.id).toMatch(/not been verified/);
    }
    // Editions of the same book are told apart by name.
    const editions = entries.filter((item) => item.source.type === "kiwix" && item.source.name === "wikipedia_en_all");
    expect(editions.map((item) => item.name).sort()).toEqual([
      "Wikipedia (complete, with images)",
      "Wikipedia (introductions only, without images)",
      "Wikipedia (without images)",
    ]);
    expect(new Set(entries.map((item) => item.name)).size).toBe(entries.length);
  });

  it("has a schema file generated from the code", () => {
    const committed = fs.readFileSync(path.join(repoCatalogDir, "schema", "manifest.schema.json"), "utf8");
    expect(committed).toBe(manifestJsonSchema());
    expect(JSON.parse(committed).properties.entries.items.properties.source).toBeDefined();
  });
});

describe("reading the Kiwix feed", () => {
  it("parses a saved response from the real service", () => {
    const books = parseOpdsFeed(fixture("opds-name-wikipedia_en_medicine.xml"));
    expect(books.map((book) => book.flavour)).toEqual(["nopic", "maxi", "mini"]);
    expect(books[2]).toEqual({
      uuid: "6471ba0e-dd99-b0ac-6c5b-31f838663e03",
      name: "wikipedia_en_medicine",
      flavour: "mini",
      title: "WikiMed Medical Encyclopedia",
      summary: "The largest medical encyclopedia, from Wikipedia",
      language: "eng",
      updated: "2026-10-10T00:00:00Z",
      articleCount: 340299,
      mediaCount: 446,
      fileUrl: "https://lb.download.kiwix.org/zim/wikipedia/wikipedia_en_medicine_mini_2026-10.zim",
      fileName: "wikipedia_en_medicine_mini_2026-10.zim",
      sizeBytes: 174351360,
      version: "2026-10",
    } satisfies KiwixBook);
  });

  it("reads an empty flavour as the empty string", () => {
    const [book, ...rest] = parseOpdsFeed(fixture("opds-name-zimgit-knots_en.xml"));
    expect(rest).toEqual([]);
    expect(book).toMatchObject({
      name: "zimgit-knots_en",
      flavour: "",
      version: "2024-08",
      fileName: "zimgit-knots_en_2024-08.zim",
      sizeBytes: 27945984,
    });
    expect(pickBook([book!], "zimgit-knots_en", "")).toBe(book);
    expect(pickBook([book!], "zimgit-knots_en", "maxi")).toBeUndefined();
  });

  it("matches on name and flavour, and takes the newest of several builds", () => {
    const books = parseOpdsFeed(fixture("opds-name-wikipedia_en_medicine.xml"));
    expect(pickBook(books, "wikipedia_en_medicine", "maxi")?.fileName).toBe("wikipedia_en_medicine_maxi_2026-10.zim");
    // The feed has no flavour filter: asking for "" must not fall back to some flavour.
    expect(pickBook(books, "wikipedia_en_medicine", "")).toBeUndefined();
    expect(pickBook(books, "wikipedia_en", "maxi")).toBeUndefined();

    const older: KiwixBook = {
      ...books[1]!,
      updated: "2026-08-02T00:00:00Z",
      version: "2026-08",
      fileName: "wikipedia_en_medicine_maxi_2026-08.zim",
    };
    const newer: KiwixBook = {
      ...books[1]!,
      updated: "2026-11-03T00:00:00Z",
      version: "2026-11",
      fileName: "wikipedia_en_medicine_maxi_2026-11.zim",
    };
    expect(pickBook([older, ...books, newer], "wikipedia_en_medicine", "maxi")).toBe(newer);
    expect(pickBook([newer, ...books, older], "wikipedia_en_medicine", "maxi")).toBe(newer);
  });

  it("reads checksum and Metalink files, and build dates from file names", () => {
    const hash = "c66f27274775870cec7e0c230c7e7626d367633b1f26c4a74499c249ddac0822";
    expect(parseSha256File(fixture("wikipedia_en_medicine_mini_2026-10.zim.sha256"))).toBe(hash);
    expect(parseSha256File("<html>not found</html>")).toBeUndefined();
    expect(parseMetalink(fixture("wikipedia_en_medicine_mini_2026-10.zim.meta4"))).toEqual({ sizeBytes: 174350854, sha256: hash });
    expect(versionFromFileName("wikipedia_en_100_2026-08.zim")).toBe("2026-08");
    expect(versionFromFileName("gutenberg_en_lcc-pf_2025-12-24.zim")).toBe("2025-12-24");
    expect(versionFromFileName("odd.zim")).toBeNull();
    expect(() => parseOpdsFeed("<html><body>Bad gateway</body></html>")).toThrow(/could not read/);
  });

  it("orders versions", () => {
    expect(compareVersions("2026-08", "2026-10")).toBe(-1);
    expect(compareVersions("2026-10", "2026-10")).toBe(0);
    expect(compareVersions("2027-01", "2026-12")).toBe(1);
    expect(compareVersions("1.9", "1.10")).toBe(-1);
    expect(compareVersions("2026-08", "2026-08-15")).toBe(-1);
  });
});

describe("refreshing from the Kiwix library", () => {
  async function setup() {
    app = await createTestApp();
    const server = await fileServer();
    const library = serveKiwixLibrary(server, [
      {
        name: "wikipedia_en_medicine",
        flavour: "maxi",
        version: "2026-10",
        body: testBytes(90_000, 1),
        title: "WikiMed",
        articleCount: 371615,
      },
      { name: "wikipedia_en_medicine", flavour: "mini", version: "2026-10", body: testBytes(20_000, 2), title: "WikiMed" },
      { name: "zimgit-knots_en", flavour: "", version: "2024-08", body: testBytes(30_000, 3), title: "A Library of Knots" },
      { name: "zimgit-knots_en", flavour: "", version: "2024-02", body: testBytes(29_000, 4), title: "A Library of Knots (older build)" },
      { name: "wikipedia_fr_test", flavour: "nopic", version: "2026-09", body: testBytes(10_000, 5), language: "fra" },
      // Fifteen other books, so that forgetting count=-1 would lose entries.
      ...Array.from({ length: 15 }, (_, index) => ({
        name: `filler_en_${index}`,
        flavour: "",
        version: "2026-01",
        body: Buffer.from("x"),
      })),
    ]);
    ship(
      app,
      "kiwix.json",
      manifest("kiwix-test", [
        entry("k.medicine-maxi", { type: "kiwix", name: "wikipedia_en_medicine", flavour: "maxi" }, { sizeBytes: 5_000_000 }),
        entry("k.medicine-nopic", { type: "kiwix", name: "wikipedia_en_medicine", flavour: "nopic" }),
        entry("k.knots", { type: "kiwix", name: "zimgit-knots_en", flavour: "" }),
        entry("k.french", { type: "kiwix", name: "wikipedia_fr_test", flavour: "nopic" }, { language: "fr" }),
        entry("k.gone", { type: "kiwix", name: "withdrawn_en_all", flavour: "" }),
      ]),
    );
    const kiwix = createCatalogService(app.ctx, { kiwixCatalogUrl: library.catalogUrl });
    return { server, library, kiwix };
  }

  it("resolves every entry with one request for English and one per other book", async () => {
    const { library, kiwix, server } = await setup();
    const before = await entryOf(app!, "k.medicine-maxi");
    expect(before).toMatchObject({ availability: "unknown", sizeBytes: 5_000_000, sizeIsEstimate: true, version: null, resolvedAt: null });

    const summary = await kiwix.refresh();

    expect(summary.checked).toBe(5);
    expect(summary.available).toBe(3);
    expect(summary.unchecked).toEqual([]);
    expect(summary.unavailable.map((item) => item.entryId).sort()).toEqual(["k.gone", "k.medicine-nopic"]);
    expect(summary.unavailable.find((item) => item.entryId === "k.medicine-nopic")!.reason).toMatch(
      /no longer lists a book named "wikipedia_en_medicine" in the "nopic" edition/,
    );
    // One bulk request, then by name for what it did not contain (each name once).
    expect(library.feedQueries()).toEqual([
      "lang=eng&count=-1",
      "name=wikipedia_en_medicine&count=-1",
      "name=wikipedia_fr_test&count=-1",
      "name=withdrawn_en_all&count=-1",
    ]);
    // Refreshing looks; it does not download.
    expect(server.requests.every((seen) => seen.path === "/catalog/v2/entries")).toBe(true);

    const catalog = await catalogOf(app!);
    expect(catalog.lastRefreshedAt).toBe(summary.refreshedAt);
    const byId = new Map(catalog.entries.map((item) => [item.id, item]));
    expect(byId.get("k.medicine-maxi")).toMatchObject({
      availability: "available",
      sizeBytes: 90_112, // the feed's rounded figure, until a download asks for the exact one
      sizeIsEstimate: false,
      version: "2026-10",
      publishedAt: "2026-10-01T00:00:00Z",
      articleCount: 371615,
      resolvedAt: summary.refreshedAt,
      status: "not_installed",
    });
    expect(byId.get("k.knots")).toMatchObject({ availability: "available", version: "2024-08", sizeBytes: 30_720 });
    expect(byId.get("k.french")).toMatchObject({ availability: "available", version: "2026-09" });
    expect(byId.get("k.gone")).toMatchObject({ availability: "unavailable", version: null });
    expect(byId.get("k.gone")!.unavailableReason).toMatch(/renamed or withdrawn/);
  });

  it("keeps the last known details when a book disappears, and when offline", async () => {
    const { library, kiwix } = await setup();
    await kiwix.refresh();
    library.remove("zimgit-knots_en", "");
    await kiwix.refresh();
    expect(await entryOf(app!, "k.knots")).toMatchObject({ availability: "unavailable", version: "2024-08", sizeBytes: 30_720 });

    const offline = createCatalogService(app!.ctx, { kiwixCatalogUrl: `http://127.0.0.1:${await unusedPort()}/catalog/v2/entries` });
    const error = await offline.refresh().catch((caught) => caught);
    expect(error).toMatchObject({
      code: "offline",
      status: 503,
      message: "The catalogue could not be refreshed because there is no connection. Showing the last known details.",
    });
    expect(await entryOf(app!, "k.medicine-maxi")).toMatchObject({ availability: "available", version: "2026-10" });
  });

  it("will not ask a feed on a host that no manifest lists", async () => {
    const { server, library } = await setup();
    const elsewhere = createCatalogService(app!.ctx, { kiwixCatalogUrl: library.catalogUrl.replace("127.0.0.1", "localhost") });
    const before = server.requests.length;
    await expect(elsewhere.refresh()).rejects.toMatchObject({
      code: "forbidden",
      message: expect.stringMatching(/localhost is not a download source listed/),
    });
    expect(server.requests.length).toBe(before);
  });

  it("refreshes through the API", async () => {
    app = await createTestApp();
    const server = await fileServer();
    server.routes.set("/guide.pdf", { body: testBytes(12_345) });
    ship(
      app,
      "http.json",
      manifest("http-test", [
        entry("h.guide", { type: "http", url: server.url("/guide.pdf"), version: "3" }),
        entry("h.gone", { type: "http", url: server.url("/gone.pdf") }),
      ]),
    );
    const refreshed = await app.api("POST", "/api/catalog/refresh");
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({ checked: 2, available: 1, unavailable: [{ entryId: "h.gone" }] });
    // The file that is gone is asked for twice: "not found" to HEAD is only believed once the first byte is refused too.
    expect(server.requests.map((seen) => `${seen.method} ${seen.path}`)).toEqual(["HEAD /guide.pdf", "HEAD /gone.pdf", "GET /gone.pdf"]);
    expect(await entryOf(app, "h.guide")).toMatchObject({ availability: "available", sizeBytes: 12_345, version: "3" });
    expect(await entryOf(app, "h.gone")).toMatchObject({ availability: "unavailable" });
  });
});

describe("checking files that publishers host themselves", () => {
  const allowed = (server: FileServer) => ({ allowedHosts: [server.host] });
  const loaded = (id: string, source: Json) => ({ ...entry(id, source), manifestId: "http-test" }) as unknown as LoadedEntry;

  it("does not contact the publisher on refresh when the manifest already pins the size and checksum", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(20_000, 21);
    server.routes.set("/pinned.pdf", { body });
    server.routes.set("/loose.pdf", { body: testBytes(5_000, 22) });
    ship(
      app,
      "http.json",
      manifest("http-test", [
        entry("h.pinned", { type: "http", url: server.url("/pinned.pdf"), sha256: sha256Of(body), sizeBytes: body.length, version: "2" }),
        entry("h.loose", { type: "http", url: server.url("/loose.pdf") }),
      ]),
    );
    const refreshed = await app.api("POST", "/api/catalog/refresh");
    expect(refreshed.body).toMatchObject({ checked: 2, available: 2, unavailable: [], unchecked: [] });
    // Only the entry with nothing pinned needed asking about.
    expect(server.requests.map((seen) => `${seen.method} ${seen.path}`)).toEqual(["HEAD /loose.pdf"]);
    expect(await entryOf(app, "h.pinned")).toMatchObject({ availability: "available", sizeBytes: 20_000, version: "2" });
  });

  it("asks for one byte when a server refuses HEAD", async () => {
    const server = await fileServer();
    server.routes.set("/report.pdf", { body: testBytes(8_000, 23), headStatus: 500 });
    server.routes.set("/broken.pdf", { body: testBytes(10), status: 503 });
    const http = createHttpClient({ allowPrivate: true });
    try {
      const entries = [
        loaded("h.report", { type: "http", url: server.url("/report.pdf") }),
        loaded("h.broken", { type: "http", url: server.url("/broken.pdf") }),
        loaded("h.gone", { type: "http", url: server.url("/gone.pdf") }),
      ];
      const results = await resolveEntries(http, entries, allowed(server));
      expect(results.get("h.report")).toMatchObject({ state: "available", resolved: { sizeBytes: 8_000 } });
      expect(results.get("h.broken")).toMatchObject({ state: "unchecked", reason: expect.stringMatching(/answered HTTP 503/) });
      expect(results.get("h.gone")).toMatchObject({ state: "unavailable" });
      const report = server.requests.filter((seen) => seen.path === "/report.pdf");
      expect(report.map((seen) => [seen.method, seen.range])).toEqual([
        ["HEAD", undefined],
        ["GET", "bytes=0-0"],
      ]);
    } finally {
      await http.close();
    }
  });

  it("does not take a 404 or a 410 to HEAD as the file being gone until the first byte has been asked for too", async () => {
    // Two publishers answer HEAD with 404 while serving the file (nvlpubs.nist.gov, and the Met Office's file service on a cold cache).
    const server = await fileServer();
    server.routes.set("/sp330.pdf", { body: testBytes(9_000, 25), headStatus: 404 });
    server.routes.set("/factsheet.pdf", { body: testBytes(7_000, 26), headStatus: 410 });
    server.routes.set("/withdrawn.pdf", { body: testBytes(10), status: 410 });
    const http = createHttpClient({ allowPrivate: true });
    try {
      const entries = [
        loaded("h.sp330", { type: "http", url: server.url("/sp330.pdf") }),
        loaded("h.factsheet", { type: "http", url: server.url("/factsheet.pdf") }),
        loaded("h.withdrawn", { type: "http", url: server.url("/withdrawn.pdf") }),
        loaded("h.gone", { type: "http", url: server.url("/gone.pdf") }),
      ];
      const results = await resolveEntries(http, entries, allowed(server));
      expect(results.get("h.sp330")).toMatchObject({ state: "available", resolved: { sizeBytes: 9_000 } });
      expect(results.get("h.factsheet")).toMatchObject({ state: "available", resolved: { sizeBytes: 7_000 } });
      // Gone is still gone, once both ways of asking say so.
      expect(results.get("h.withdrawn")).toMatchObject({ state: "unavailable" });
      expect(results.get("h.gone")).toMatchObject({ state: "unavailable" });
      for (const path of ["/sp330.pdf", "/gone.pdf"]) {
        expect(server.requests.filter((seen) => seen.path === path).map((seen) => [seen.method, seen.range])).toEqual([
          ["HEAD", undefined],
          ["GET", "bytes=0-0"],
        ]);
      }
    } finally {
      await http.close();
    }
  });

  it("leaves a gap between requests to the same host when asked to, and checks pinned files too", async () => {
    const server = await fileServer();
    const body = testBytes(3_000, 24);
    for (const name of ["a", "b", "c"]) server.routes.set(`/${name}.pdf`, { body });
    const http = createHttpClient({ allowPrivate: true });
    try {
      const entries = ["a", "b", "c"].map((name) =>
        loaded(`h.${name}`, { type: "http", url: server.url(`/${name}.pdf`), sha256: sha256Of(body), sizeBytes: body.length }),
      );
      const started = Date.now();
      const results = await resolveEntries(http, entries, { ...allowed(server), hostIntervalMs: 120 });
      expect(Date.now() - started).toBeGreaterThanOrEqual(240);
      expect([...results.values()].map((result) => result.state)).toEqual(["available", "available", "available"]);
      expect(server.requests.length).toBe(3);
    } finally {
      await http.close();
    }
  });
});

describe("an archive that is installed already", () => {
  it("is recognised as its catalogue entry, so it is not offered or fetched again", async () => {
    app = await createTestApp();
    const { collections, storage } = app.ctx.services;
    const location = storage.getDefault();
    const put = async (file: string, meta: Json) => {
      const relPath = `collections/zim/${file}`;
      fs.mkdirSync(path.join(location.path, "collections/zim"), { recursive: true });
      fs.writeFileSync(path.join(location.path, relPath), "zim");
      return collections.create({ kind: "zim", title: file, locationId: location.id, relPath, meta });
    };
    // Added by hand: the name and edition come from the archive itself.
    const knots = await put("wikipedia_en_knots_maxi_2026-10.zim", { zim: { flavour: "maxi" }, kiwix: { name: "wikipedia_en_knots" } });
    // The same book in another edition is a different entry, and this one has no entry at all.
    const mini = await put("wikipedia_en_knots_mini_2026-10.zim", { zim: { flavour: "mini" }, kiwix: { name: "wikipedia_en_knots" } });
    // A second copy of the first must not take the link from it.
    const copy = await put("wikipedia_en_knots_maxi_copy.zim", { zim: { flavour: "maxi" }, kiwix: { name: "wikipedia_en_knots" } });
    ship(
      app,
      "kiwix.json",
      manifest("kiwix-test", [
        entry("k.knots", { type: "kiwix", name: "wikipedia_en_knots", flavour: "maxi" }, { name: "Knots", category: "survival" }),
        entry("k.water", { type: "kiwix", name: "zimgit-water_en", flavour: "" }, { name: "Water", category: "survival" }),
      ]),
    );

    expect(await entryOf(app, "k.knots")).toMatchObject({ status: "installed", collectionId: knots.id });
    expect(await entryOf(app, "k.water")).toMatchObject({ status: "not_installed" });
    expect(collections.get(knots.id)?.catalogEntryId).toBe("k.knots");
    expect(collections.get(mini.id)?.catalogEntryId).toBeNull();
    expect(collections.get(copy.id)?.catalogEntryId).toBeNull();
    // Only the link changed.
    expect(collections.get(knots.id)).toMatchObject({ title: "wikipedia_en_knots_maxi_2026-10.zim", status: "installed" });
  });
});

describe("downloading from the catalogue", () => {
  it("resolves a Kiwix book just before downloading, with exact size and checksum", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const body = testBytes(150_000, 9);
    const book = { name: "wikipedia_en_100", flavour: "", version: "2026-08", body, title: "Wikipedia 100", articleCount: 5056 };
    const library = serveKiwixLibrary(server, [book, { ...book, version: "2026-06", body: testBytes(140_000, 10) }]);
    ship(
      app,
      "kiwix.json",
      manifest("kiwix-test", [
        entry(
          "k.wikipedia-100",
          { type: "kiwix", name: "wikipedia_en_100", flavour: "" },
          { name: "Wikipedia 100", category: "encyclopedias", licenseNote: "Check the source." },
        ),
      ]),
    );
    const kiwix = createCatalogService(app.ctx, { kiwixCatalogUrl: library.catalogUrl });

    const resolution = await kiwix.resolveForDownload("k.wikipedia-100");
    expect(resolution).toMatchObject({
      url: server.url("/zim/other/wikipedia_en_100_2026-08.zim"),
      fileName: "wikipedia_en_100_2026-08.zim",
      sizeBytes: body.length,
      sha256: sha256Of(body),
      version: "2026-08",
      kiwix: { name: "wikipedia_en_100", flavour: "", articleCount: 5056, title: "Wikipedia 100" },
    });
    expect(await entryOf(app, "k.wikipedia-100")).toMatchObject({ availability: "available", sizeBytes: body.length, version: "2026-08" });

    const { download, replacesCollectionId } = await kiwix.download("k.wikipedia-100");
    expect(replacesCollectionId).toBeNull();
    expect(download).toMatchObject({
      kind: "zim",
      title: "Wikipedia 100",
      relPath: "collections/zim/wikipedia_en_100_2026-08.zim",
      catalogEntryId: "k.wikipedia-100",
      sha256Expected: sha256Of(body),
      totalBytes: body.length,
    });
    expect(download.meta).toMatchObject({
      title: "Wikipedia 100",
      category: "encyclopedias",
      language: "en",
      publisher: "Test Press",
      license: "CC BY-SA 4.0",
      attribution: "Test Press contributors",
      version: "2026-08",
      kiwix: { name: "wikipedia_en_100", flavour: "" },
    });
    const row = await downloadFinished(app, download.id);
    expect(row.state).toBe("completed");

    const collection = app.ctx.services.collections.get(row.collectionId!)!;
    expect(collection).toMatchObject({
      kind: "zim",
      catalogEntryId: "k.wikipedia-100",
      title: "Wikipedia 100",
      category: "encyclopedias",
      version: "2026-08",
      sha256: sha256Of(body),
      sizeBytes: body.length,
      relPath: "collections/zim/wikipedia_en_100_2026-08.zim",
    });
    expect(collection.meta).toMatchObject({
      format: "zim",
      licenseNote: "Check the source.",
      zim: { bookName: "wikipedia_en_100_2026-08", flavour: "", articleCount: 5056 },
    });
    expect(fs.readFileSync(app.ctx.services.collections.absolutePath(collection.id)).equals(body)).toBe(true);
    expect(await entryOf(app, "k.wikipedia-100")).toMatchObject({
      status: "installed",
      collectionId: collection.id,
      installedVersion: "2026-08",
      updateAvailable: false,
    });
  });

  it("refuses a file without a published checksum, a book that is gone, and a mirror host nobody listed", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const library = serveKiwixLibrary(server, [
      { name: "nochecksum_en", flavour: "", version: "2026-01", body: testBytes(1000), withoutChecksums: true },
      { name: "elsewhere_en", flavour: "", version: "2026-01", body: testBytes(1000), fileOrigin: `http://localhost:${server.port}` },
    ]);
    ship(
      app,
      "kiwix.json",
      manifest("kiwix-test", [
        entry("k.nochecksum", { type: "kiwix", name: "nochecksum_en", flavour: "" }),
        entry("k.elsewhere", { type: "kiwix", name: "elsewhere_en", flavour: "" }),
        entry("k.gone", { type: "kiwix", name: "gone_en", flavour: "" }),
      ]),
    );
    const kiwix = createCatalogService(app.ctx, { kiwixCatalogUrl: library.catalogUrl });

    await expect(kiwix.download("k.nochecksum")).rejects.toMatchObject({
      code: "upstream",
      message: expect.stringMatching(/did not provide a checksum/),
    });
    await expect(kiwix.download("k.gone")).rejects.toMatchObject({
      code: "upstream",
      message: expect.stringMatching(/no longer lists a book named "gone_en"/),
    });
    await expect(kiwix.download("k.elsewhere")).rejects.toMatchObject({
      code: "forbidden",
      message: expect.stringMatching(/from localhost, which no catalogue manifest lists/),
    });
    await expect(kiwix.download("k.unknown")).rejects.toMatchObject({ code: "not_found" });

    expect(app.ctx.services.downloads.list()).toHaveLength(0);
    expect(server.requests.filter((seen) => seen.path.endsWith(".zim"))).toHaveLength(0);
    expect(await entryOf(app, "k.gone")).toMatchObject({ availability: "unavailable" });
    // The same host rule applies when refreshing.
    const summary = await kiwix.refresh();
    expect(summary.unavailable.find((item) => item.entryId === "k.elsewhere")!.reason).toMatch(/localhost/);
  });

  it("follows an entry from not installed, through downloading and installed, to update available and updated", async () => {
    app = await createTestApp();
    const server = await fileServer();
    const v1 = testBytes(400_000, 11);
    const v2 = testBytes(420_000, 12);
    server.routes.set("/guide-v1.pdf", { body: v1, chunkBytes: 16_384, delayMs: 10 });
    server.routes.set("/guide-v2.pdf", { body: v2 });
    const guide = (file: string, body: Buffer, version: string) =>
      manifest("http-test", [
        entry(
          "h.guide",
          { type: "http", url: server.url(file), sha256: sha256Of(body), sizeBytes: body.length, version },
          { name: "Field guide", category: "survival" },
        ),
      ]);
    ship(app, "http.json", guide("/guide-v1.pdf", v1, "2025-03"));

    expect(await entryOf(app, "h.guide")).toMatchObject({
      status: "not_installed",
      version: "2025-03",
      sizeBytes: v1.length,
      updateAvailable: false,
    });

    const started = await app.api("POST", "/api/catalog/entries/h.guide/download", {});
    expect(started.status).toBe(200);
    expect(started.body.replacesCollectionId).toBeNull();
    expect(started.body.download).toMatchObject({
      kind: "file",
      state: "queued",
      relPath: "collections/files/guide-v1.pdf",
      catalogEntryId: "h.guide",
      locationName: "Internal storage",
    });
    const downloadId = started.body.download.id as string;
    await waitFor(async () => (await entryOf(app!, "h.guide")).status === "downloading", "the entry to show as downloading");
    expect(await entryOf(app, "h.guide")).toMatchObject({ status: "downloading", downloadId });
    expect((await app.api("POST", "/api/catalog/entries/h.guide/download", {})).status).toBe(409);

    await app.api("POST", `/api/downloads/${downloadId}/pause`);
    expect(await entryOf(app, "h.guide")).toMatchObject({ status: "paused", downloadId });
    await waitFor(() => app!.ctx.jobs.get(app!.ctx.services.downloads.get(downloadId)!.jobId!)?.state === "paused", "the pause");
    await app.api("POST", `/api/downloads/${downloadId}/resume`);

    const first = await downloadFinished(app, downloadId);
    expect(first.state).toBe("completed");
    const installed = await entryOf(app, "h.guide");
    expect(installed).toMatchObject({
      status: "installed",
      collectionId: first.collectionId,
      installedVersion: "2025-03",
      updateAvailable: false,
    });
    expect(installed.downloadId).toBeUndefined();
    const oldFile = app.ctx.services.collections.absolutePath(first.collectionId!);
    expect(fs.readFileSync(oldFile).equals(v1)).toBe(true);
    const again = await app.api("POST", "/api/catalog/entries/h.guide/download", {});
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already installed \(version 2025-03\)/);

    // The publisher releases a new edition and the manifest follows.
    ship(app, "http.json", guide("/guide-v2.pdf", v2, "2026-01"));
    expect(await entryOf(app, "h.guide")).toMatchObject({
      status: "installed",
      installedVersion: "2025-03",
      version: "2026-01",
      updateAvailable: true,
    });
    expect((await app.api("GET", `/api/collections/${first.collectionId}`)).body.collection.updateAvailable).toBe(true);

    const update = await app.api("POST", "/api/catalog/entries/h.guide/download", {});
    expect(update.status).toBe(200);
    expect(update.body.replacesCollectionId).toBe(first.collectionId);
    const second = await downloadFinished(app, update.body.download.id);
    expect(second.state).toBe("completed");
    await waitFor(() => !app!.ctx.services.collections.get(first.collectionId!), "the old version to be removed");

    // The old version and its file are gone; the new one is what is installed.
    expect(fs.existsSync(oldFile)).toBe(false);
    const collections = app.ctx.services.collections.list();
    expect(collections.map((row) => row.id)).toEqual([second.collectionId]);
    expect(fs.readFileSync(app.ctx.services.collections.absolutePath(second.collectionId!)).equals(v2)).toBe(true);
    expect(await entryOf(app, "h.guide")).toMatchObject({
      status: "installed",
      collectionId: second.collectionId,
      installedVersion: "2026-01",
      updateAvailable: false,
    });
  });

  it("shows a failed download as failed, and continues it when asked again", async () => {
    app = await createTestApp();
    app.ctx.services.settings.update({ "downloads.maxAttempts": 1 });
    const server = await fileServer();
    const body = testBytes(200_000, 13);
    server.routes.set("/flaky.pdf", { body, dropAfterBytes: 80_000 });
    ship(
      app,
      "http.json",
      manifest("http-test", [entry("h.flaky", { type: "http", url: server.url("/flaky.pdf"), sha256: sha256Of(body) })]),
    );

    const started = await app.api("POST", "/api/catalog/entries/h.flaky/download");
    const failed = await downloadFinished(app, started.body.download.id);
    expect(failed.state).toBe("failed");
    expect(await entryOf(app, "h.flaky")).toMatchObject({ status: "failed", downloadId: failed.id });

    const retried = await app.api("POST", "/api/catalog/entries/h.flaky/download");
    expect(retried.status).toBe(200);
    expect(retried.body.download.id).toBe(failed.id);
    expect((await downloadFinished(app, failed.id)).state).toBe("completed");
    expect(server.requests.at(-1)!.range).toBe("bytes=80000-");
    expect(app.ctx.services.downloads.list()).toHaveLength(1);
  });

  it("checks free space on the chosen location before starting", async () => {
    app = await createTestApp();
    const server = await fileServer();
    server.routes.set("/planet.pdf", { body: testBytes(100) });
    const usb = await app.ctx.services.storage.add({ name: "USB drive", path: path.join(app.dir, "storage", "usb"), kind: "external" });
    ship(app, "http.json", manifest("http-test", [entry("h.planet", { type: "http", url: server.url("/planet.pdf"), sizeBytes: 8e15 })]));

    const refused = await app.api("POST", "/api/catalog/entries/h.planet/download", { locationId: usb.id });
    expect(refused.status).toBe(507);
    expect(refused.body.error.code).toBe("insufficient_space");
    expect(refused.body.error.message).toMatch(/"USB drive" does not have enough free space/);
    expect(refused.body.error.details).toMatchObject({ locationId: usb.id, requiredBytes: 8e15 });
    expect(refused.body.error.details.freeBytes).toBeGreaterThan(0);
    expect(server.requests).toHaveLength(0);
    expect(app.ctx.services.downloads.list()).toHaveLength(0);

    expect((await app.api("POST", "/api/catalog/entries/h.planet/download", { locationId: "nope" })).status).toBe(404);
    expect((await app.api("POST", "/api/catalog/entries/h.nothing/download", {})).status).toBe(404);
  });

  it("only lets downloads start on hosts the manifests list", async () => {
    app = await createTestApp();
    const server = await fileServer();
    server.routes.set("/a.pdf", { body: testBytes(100) });
    ship(app, "http.json", manifest("http-test", [entry("h.a", { type: "http", url: server.url("/a.pdf") })]));
    expect(app.ctx.services.catalog.allowedHosts()).toEqual(["127.0.0.1"]);

    // An entry pointing anywhere else never makes it into the catalogue ...
    ship(
      app,
      "other.json",
      manifest("other", [entry("o.b", { type: "http", url: `http://localhost:${server.port}/a.pdf` })], {
        downloadHosts: ["mirror.example.org"],
      }),
    );
    const catalog = await catalogOf(app);
    expect(catalog.entries.map((item) => item.id)).toEqual(["h.a"]);
    expect(catalog.problems[0]).toMatchObject({ file: "other.json", entryId: "o.b" });
    expect((await app.api("POST", "/api/catalog/entries/o.b/download", {})).status).toBe(404);
    // ... while its manifest's hosts do join the allow-list, along with the configured extras.
    expect(app.ctx.services.catalog.allowedHosts()).toEqual(["127.0.0.1", "mirror.example.org"]);

    const started = await app.api("POST", "/api/catalog/entries/h.a/download", {});
    expect((await downloadFinished(app, started.body.download.id)).state).toBe("completed");
    expect(app.ctx.jobs.list()[0]!.payload).toMatchObject({ allowedHosts: ["127.0.0.1", "mirror.example.org"] });
    expect(server.requests.map((seen) => seen.path)).toEqual(["/a.pdf"]);
  });

  it("adds hosts from OUTPOST_DOWNLOAD_HOSTS to the allow-list", async () => {
    app = await createTestApp({ OUTPOST_DOWNLOAD_HOSTS: "Mirror.Lan, files.lan" });
    expect(app.ctx.services.catalog.allowedHosts()).toEqual(["mirror.lan", "files.lan"]);
  });
});

describe("the online check's skipped hosts", () => {
  const loaded = (id: string, source: Record<string, unknown>) => ({ id, source }) as unknown as LoadedEntry;
  const entries = [
    loaded("k.book", { type: "kiwix", name: "wikipedia_en_100", flavour: "" }),
    loaded("h.pdf", { type: "http", url: "https://files.example.org/a.pdf" }),
    loaded("h.other", { type: "http", url: "https://Other.example.org/b.pdf" }),
    loaded("b.sheet", { type: "bundled", file: "radio/a.md" }),
  ];

  it("leaves Kiwix's hosts unasked in an online check unless told to include them", () => {
    // Their robots.txt disallows everything; the bulk check is the robot-like part (docs/sources.md).
    expect(hostsToSkip(["--online"])).toEqual([...KIWIX_HOSTS]);
    expect(hostsToSkip(["--online", "--skip-host", "example.org"])).toEqual(["example.org", ...KIWIX_HOSTS]);
    expect(hostsToSkip(["--online", "--include-kiwix"])).toEqual([]);
    expect(hostsToSkip(["--online", "--include-kiwix", "--skip-host", "example.org"])).toEqual(["example.org"]);
    expect(KIWIX_HOSTS).toContain("opds.library.kiwix.org");
  });

  it("asks about everything when no host is named", () => {
    const { check, skipped } = entriesToCheck(entries);
    expect(check.map((entry) => entry.id)).toEqual(["k.book", "h.pdf", "h.other", "b.sheet"]);
    expect(skipped).toEqual([]);
  });

  it("leaves out entries on a named host, a Kiwix book counting as the feed's host", () => {
    const { check, skipped } = entriesToCheck(entries, ["opds.library.kiwix.org", "OTHER.example.org"]);
    expect(check.map((entry) => entry.id)).toEqual(["h.pdf", "b.sheet"]);
    expect(skipped).toEqual(["k.book", "h.other"]);
  });
});
