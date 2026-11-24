/**
 * "Read about it on Wikipedia", against a local stand-in for Wikidata and Wikipedia that
 * answers as they did on 24 November 2026 for the 44 satellites of the satellites review
 * (fixtures/satellites/wikimedia-44.json), and a stand-in kiwix-serve holding a small
 * Wikipedia copy. Nothing here touches the internet.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isOscarDesignation, isSeriesTitle, retryAfterMs } from "../src/modules/satellites/wikipedia.ts";
import { infoboxNumbers, leadText } from "../src/modules/satellites/wikipedia-offline.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

interface Row {
  noradId: number;
  celestrak: string;
  cospar: string | null;
  satnogs: { name: string; names: string } | null;
  before: { verdict: "right" | "wrong" | "series" | "none"; title: string | null };
  expected: { outcome: "exact" | "series" | "none"; title: string | null };
}
interface Entity {
  label: string | null;
  description: string | null;
  p31: string[];
  p279: string[];
  p377: string[];
  p247: string[];
  enwiki: string | null;
}
const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/satellites/wikimedia-44.json"), "utf8")) as {
  satellites: Row[];
  redirects: Record<string, string>;
  titled: string[];
  pages: Record<string, { q: string | null; description: string | null; disambiguation: boolean }>;
  searches: Record<string, string[]>;
  entities: Record<string, Entity>;
};

const HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";
const csvRow = (name: string, cospar: string, norad: number) =>
  `"${name}",${cospar},2026-11-21T04:54:08.875296,15.49527370,.0007384,51.6319,243.0636,49.3258,310.8372,0,U,${norad},999,59609,.2073332E-3,.11207E-3,0`;
const filler = (first: number, n: number) =>
  Array.from({ length: n }, (_, i) => csvRow(`FILLER ${i}`, `2020-001${"ABCDEFGHJKLMNPQRSTUVWXYZ"[i]}`, first + i));

let requests: string[] = [];
let busy = false;
let failing = false;
const json = (response: http.ServerResponse, body: unknown) =>
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
const claim = (value: unknown) => ({ mainsnak: { datavalue: { value } } });

function wikidata(params: URLSearchParams): unknown {
  if (params.get("list") === "search") {
    const terms = (params.get("srsearch") ?? "").replace(/^haswbstatement:/, "").split("|");
    const hits = Object.entries(fixture.entities).filter(([, entity]) =>
      terms.some((term) => {
        const [property, value] = term.split("=");
        return (property === "P377" ? entity.p377 : property === "P247" ? entity.p247 : []).includes(value ?? "");
      }),
    );
    return { query: { search: hits.map(([q]) => ({ ns: 0, title: q })) } };
  }
  const entities: Record<string, unknown> = {};
  for (const id of (params.get("ids") ?? "").split("|")) {
    const entity = fixture.entities[id];
    entities[id] = entity
      ? {
          id,
          descriptions: entity.description ? { en: { value: entity.description } } : {},
          claims: {
            P31: entity.p31.map((q) => claim({ id: q })),
            P279: entity.p279.map((q) => claim({ id: q })),
            P377: entity.p377.map(claim),
            P247: entity.p247.map(claim),
          },
          sitelinks: entity.enwiki ? { enwiki: { site: "enwiki", title: entity.enwiki } } : {},
        }
      : { id, missing: "" };
  }
  return { entities };
}

const pageOf = (title: string, index?: number) => {
  const page = fixture.pages[title]!;
  return {
    ns: 0,
    title,
    ...(index !== undefined ? { index } : {}),
    ...(page.description ? { description: page.description } : {}),
    pageprops: { ...(page.q ? { wikibase_item: page.q } : {}), ...(page.disambiguation ? { disambiguation: "" } : {}) },
  };
};

function wikipedia(params: URLSearchParams): unknown {
  const titles = params.get("titles");
  if (titles !== null) {
    const names = titles.split("|");
    const redirects = names.filter((name) => fixture.redirects[name]).map((name) => ({ from: name, to: fixture.redirects[name] }));
    const pages = names.map((name) => {
      const title = fixture.redirects[name] ?? name;
      return fixture.titled.includes(title) && fixture.pages[title] ? pageOf(title) : { ns: 0, title, missing: true };
    });
    return { query: { redirects, pages } };
  }
  const hits = fixture.searches[params.get("gsrsearch") ?? ""] ?? [];
  return hits.length ? { query: { pages: hits.map((title, index) => pageOf(title, index + 1)) } } : {};
}

const articles = new Set([...Object.keys(fixture.pages), ...Object.values(fixture.entities).flatMap((entity) => entity.enwiki ?? [])]);

let standIn: http.Server;
let app: TestApp;
let base: string;

beforeAll(async () => {
  standIn = http.createServer((request, response) => {
    const url = request.url ?? "";
    requests.push(url);
    const address = new URL(url, "http://x");
    if (url.startsWith("/celestrak/")) {
      const group = address.searchParams.get("GROUP");
      const rows =
        group === "amateur"
          ? fixture.satellites.map((row) => csvRow(row.celestrak, row.cospar ?? "", row.noradId))
          : group === "stations"
            ? filler(90000, 5)
            : filler(92000, 20);
      response.writeHead(200, { "content-type": "text/csv" }).end(`${HEADER}\n${rows.join("\n")}`);
      return;
    }
    if (url.startsWith("/satnogs/satellites/")) {
      json(
        response,
        fixture.satellites
          .filter((row) => row.satnogs)
          .map((row) => ({ sat_id: `S${row.noradId}`, norad_cat_id: row.noradId, ...row.satnogs, status: "in orbit" })),
      );
      return;
    }
    if (url.startsWith("/satnogs/")) return json(response, []);
    if (busy && (url.startsWith("/wikidata/") || url.startsWith("/wikipedia/"))) {
      response.writeHead(429, { "retry-after": "120" }).end();
      return;
    }
    if (failing && (url.startsWith("/wikidata/") || url.startsWith("/wikipedia/"))) {
      response.writeHead(503).end();
      return;
    }
    if (address.pathname === "/wikidata/w/api.php") return json(response, wikidata(address.searchParams));
    if (address.pathname === "/wikipedia/w/api.php") return json(response, wikipedia(address.searchParams));
    if (address.pathname.startsWith("/wikipedia/api/rest_v1/page/summary/")) {
      const title = decodeURIComponent(address.pathname.slice("/wikipedia/api/rest_v1/page/summary/".length)).replace(/_/g, " ");
      if (!articles.has(title)) return response.writeHead(404).end();
      return json(response, {
        type: "standard",
        title,
        description: fixture.pages[title]?.description ?? null,
        extract: `${title} is the article's first paragraph.`,
        timestamp: "2026-11-01T00:00:00Z",
        content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}` } },
      });
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
  app = await createTestApp({ OUTPOST_SATELLITES_STAND_IN: base }, undefined, { voacapData: false });
  expect((await app.api("POST", "/api/satellites/fetch")).status).toBe(200);
});

afterAll(async () => {
  await app.close();
  await new Promise((resolve) => standIn.close(resolve));
});

const wikiOnly = () => requests.filter((url) => url.startsWith("/wikidata/") || url.startsWith("/wikipedia/"));

describe("the rules", () => {
  it("knows an OSCAR number, a series title and a Retry-After", () => {
    expect(["AO-73", "SO-50", "QO-100", "ao-7"].every(isOscarDesignation)).toBe(true);
    expect(["FUNCUBE-1", "AO-10 OSCAR-10", "JPSS-1"].some(isOscarDesignation)).toBe(false);
    expect(isSeriesTitle("MetOp", ["METOP-B"])).toBe(true);
    expect(isSeriesTitle("Meteor (satellite)", ["METEOR-M2 3"])).toBe(true);
    expect(isSeriesTitle("Amateur radio satellite", ["GREENCUBE"])).toBe(false);
    expect(isSeriesTitle("MetOp", ["MetOp"])).toBe(false);
    expect(retryAfterMs("120")).toBe(120_000);
    expect(retryAfterMs(null)).toBe(60_000);
    expect(retryAfterMs(new Date(Date.now() + 30_000).toUTCString())).toBeGreaterThan(25_000);
  });
});

describe("the 44 satellites of the review", () => {
  it("were matched wrongly 21 times by names alone", () => {
    expect(fixture.satellites).toHaveLength(44);
    expect(fixture.satellites.filter((row) => row.before.verdict === "wrong")).toHaveLength(21);
  });

  it("are each matched by catalogue number, said to be a series, or said to have no article: none wrongly", async () => {
    const outcomes: string[] = [];
    let wrong = 0;
    for (const row of fixture.satellites) {
      const { status, body } = await app.api("POST", `/api/satellites/${row.noradId}/wikipedia`);
      let outcome: string;
      if (status === 200) {
        const { title, foundBy } = body.wikipedia as { title: string; foundBy: string };
        outcome = `${foundBy === "series" ? "series" : "exact"}:${title}`;
        if (foundBy !== "series") expect(["number", "cospar"]).toContain(foundBy);
      } else {
        expect(status, `${row.noradId}: ${JSON.stringify(body)}`).toBe(404);
        expect(body.error.message).toMatch(/^No article found that is clearly about this satellite\./);
        outcome = "none";
      }
      const expected = row.expected.outcome === "none" ? "none" : `${row.expected.outcome}:${row.expected.title}`;
      if (outcome !== expected) wrong += 1;
      outcomes.push(`${row.noradId} ${outcome}`);
      expect(outcome, `NORAD ${row.noradId} (${row.celestrak})`).toBe(expected);
    }
    expect(wrong).toBe(0);
    expect(outcomes.filter((line) => line.includes(" exact:"))).toHaveLength(26);
    expect(outcomes.filter((line) => line.includes(" series:"))).toHaveLength(2);
  });

  it("finds FUNcube-1 for FUNCUBE-1 (AO-73) by its number in three requests, and says how", async () => {
    requests = [];
    const { body } = await app.api("POST", "/api/satellites/39444/wikipedia");
    expect(body.wikipedia).toMatchObject({
      title: "FUNcube-1",
      foundBy: "number",
      searchedFor: "NORAD 39444",
      wikidataId: "Q15261051",
      archive: null,
    });
    expect(wikiOnly()).toHaveLength(3);
    expect(decodeURIComponent(wikiOnly()[0]!)).toContain("haswbstatement:P377=39444|P247=2013-066AE");
    expect(wikiOnly().some((url) => decodeURIComponent(url).includes("AO-73"))).toBe(false);
  });

  it("asks for an old number zero-padded, as Wikidata keeps it", async () => {
    requests = [];
    const { body } = await app.api("POST", "/api/satellites/7530/wikipedia");
    expect(body.wikipedia).toMatchObject({ title: "AMSAT-OSCAR 7", foundBy: "number" });
    expect(decodeURIComponent(wikiOnly()[0]!)).toContain("P377=7530|P377=07530");
  });

  it("takes the ISS, not Zarya, when both items carry 25544: the one its name leads to", async () => {
    const { body } = await app.api("POST", "/api/satellites/25544/wikipedia");
    expect(body.wikipedia).toMatchObject({ title: "International Space Station", wikidataId: "Q25271" });
  });

  it("says a series article is about the series", async () => {
    const { body } = await app.api("POST", "/api/satellites/38771/wikipedia");
    expect(body.wikipedia).toMatchObject({ title: "MetOp", foundBy: "series", searchedFor: "METOP-B satellite" });
  });

  it("says why there is none", async () => {
    const own = await app.api("POST", "/api/satellites/44909/wikipedia");
    expect(own.body.error.message).toMatch(/Wikidata has an entry for it \(Q97161046\), but no English Wikipedia article/);
    const none = await app.api("POST", "/api/satellites/53109/wikipedia");
    expect(none.body.error.message).toMatch(/Wikidata has no entry with its catalogue number/);
  });

  it("remembers a discarded article and does not offer it again, until asked to", async () => {
    await app.api("POST", "/api/satellites/39444/wikipedia");
    expect((await app.api("DELETE", "/api/satellites/39444/wikipedia")).status).toBe(200);
    const list = (await app.api("GET", "/api/satellites")).body;
    expect(list.wikipediaDiscarded).toContainEqual({ noradId: 39444, title: "FUNcube-1" });
    expect(list.wikipedia.some((row: { noradId: number }) => row.noradId === 39444)).toBe(false);
    const again = await app.api("POST", "/api/satellites/39444/wikipedia");
    expect(again.status).toBe(404);
    expect(again.body.error.message).toMatch(/“FUNcube-1”, was discarded/);
    expect((await app.api("DELETE", "/api/satellites/39444/wikipedia/discarded")).status).toBe(200);
    expect((await app.api("POST", "/api/satellites/39444/wikipedia")).body.wikipedia.title).toBe("FUNcube-1");
  });

  it("keeps what it had when Wikipedia fails, and refuses a satellite it does not know", async () => {
    failing = true;
    const { status, body } = await app.api("POST", "/api/satellites/25544/wikipedia");
    failing = false;
    expect(status).toBe(502);
    expect(body.error.message).toMatch(/error 503/);
    const kept = (await app.api("GET", "/api/satellites")).body.wikipedia;
    expect(kept.find((row: { noradId: number }) => row.noradId === 25544).title).toBe("International Space Station");
    expect((await app.api("POST", "/api/satellites/12345/wikipedia")).status).toBe(404);
    expect((await app.api("POST", "/api/satellites/abc/wikipedia")).status).toBe(400);
  });

  it("says a 429 in plain words, and asks nothing more until the time it gave", async () => {
    busy = true;
    const first = await app.api("POST", "/api/satellites/33591/wikipedia");
    expect(first.status).toBe(429);
    expect(first.body.error.message).toBe(
      "Wikipedia is busy and asked Outpost to wait before asking again. Nothing was changed. Try again in about 2 minutes.",
    );
    busy = false;
    requests = [];
    const second = await app.api("POST", "/api/satellites/33591/wikipedia");
    expect(second.status).toBe(429);
    expect(wikiOnly()).toEqual([]);
  });
});

// ── A Wikipedia copy on this Outpost ──

const UUID = "b37270fd-f267-39ba-fc4f-9f3c720e5d8f";
const BOOK = "wikipedia_en_all_maxi_2026-10";
const infobox = (rows: Array<[string, string]>) =>
  `<table class="infobox"><tbody>${rows.map(([head, cell]) => `<tr><th scope="row">${head}</th><td>${cell}</td></tr>`).join("")}</tbody></table>`;
const page = (title: string, box: string, lead: string) =>
  `<html><head><title>${title}</title></head><body>${box}<p>${lead}</p><p>A second paragraph that says rather more about it.</p></body></html>`;
const ZIM_PAGES: Record<string, string> = {
  "FUNcube-1": page(
    "FUNcube-1",
    infobox([
      ["Mission type", "Education"],
      ['<a href="./COSPAR_ID">COSPAR ID</a>', '<a href="x">2013-066AE</a>'],
      ['<a href="./Satellite_Catalog_Number">SATCAT</a> no.', "39444<sup>[1]</sup>"],
    ]),
    "<b>FUNcube-1</b> (also <b>AO-73</b>) is a CubeSat built by AMSAT-UK, launched in 2013.<sup>[2]</sup>",
  ),
  // A title that is one of the satellite's names, but whose infobox numbers are another object's.
  "JAS-2": page(
    "JAS-2",
    infobox([
      ["COSPAR ID", "1996-046A"],
      ["SATCAT no.", "24277"],
    ]),
    "<b>JAS-2</b> is the name of another satellite launched on the same rocket, used here to stand in for a wrong article.",
  ),
  // A name that leads to an article about something else altogether: no numbers, no spacecraft.
  CSS: page("CSS", "", "<b>CSS</b> (Cascading Style Sheets) is a style sheet language used for describing the presentation of a document."),
};

function zimHeader(): Buffer {
  const header = Buffer.alloc(80);
  header.writeUInt32LE(0x044d495a, 0);
  header.writeUInt16LE(6, 4);
  header.writeUInt16LE(3, 6);
  Buffer.from(UUID.replace(/-/g, ""), "hex").copy(header, 8);
  return header;
}

describe("with a Wikipedia copy on this Outpost", () => {
  let kiwix: http.Server;
  let offline: TestApp;
  let collectionId: string;
  const asked: string[] = [];

  beforeAll(async () => {
    const meta: Record<string, string> = {
      Title: "Wikipedia",
      Description: "The free encyclopedia",
      Language: "eng",
      Name: "wikipedia_en_all",
      Flavour: "maxi",
      Date: "2026-10-01",
      Counter: "text/html=7000000",
    };
    kiwix = http.createServer((request, response) => {
      const url = request.url ?? "";
      asked.push(url);
      if (url === "/catalog/v2/root.xml") return response.end("<feed/>");
      const metaMatch = new RegExp(`^/raw/${BOOK}/meta/(\\w+)$`).exec(url);
      if (metaMatch) {
        const value = meta[metaMatch[1]!];
        if (value === undefined) return response.writeHead(404, { "content-type": "text/html" }).end("<html></html>");
        return response.writeHead(200, { "content-type": "text/plain" }).end(value);
      }
      if (url.startsWith("/suggest?")) {
        const term = new URL(url, "http://x").searchParams.get("term") ?? "";
        const hits = Object.keys(ZIM_PAGES).filter((title) => title.toLowerCase().startsWith(term.toLowerCase()));
        return json(
          response,
          hits.map((title) => ({ value: title, label: title, kind: "path", path: title })),
        );
      }
      const content = new RegExp(`^/content/${BOOK}/(.+)$`).exec(url);
      const html = content ? ZIM_PAGES[decodeURIComponent(content[1]!)] : undefined;
      if (html) return response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => kiwix.listen(0, "127.0.0.1", resolve));
    offline = await createTestApp(
      { OUTPOST_SATELLITES_STAND_IN: base, OUTPOST_KIWIX_URL: `http://127.0.0.1:${(kiwix.address() as AddressInfo).port}` },
      undefined,
      { voacapData: false },
    );
    const location = offline.ctx.services.storage.getDefault();
    const relPath = `collections/zim/${BOOK}.zim`;
    fs.mkdirSync(path.dirname(path.join(location.path, relPath)), { recursive: true });
    fs.writeFileSync(path.join(location.path, relPath), zimHeader());
    const imported = await offline.api("POST", "/api/kiwix/import", { locationId: location.id, relPath });
    expect(imported.status).toBe(200);
    collectionId = imported.body.collection.id;
    const until = Date.now() + 4000;
    while (offline.ctx.services.kiwix.wikipedia.list().length === 0 || !offline.ctx.services.kiwix.wikipedia.list()[0]!.date) {
      if (Date.now() > until) throw new Error("the Wikipedia copy was not read in time");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect((await offline.api("POST", "/api/satellites/fetch")).status).toBe(200);
  });

  afterAll(async () => {
    await offline.close();
    await new Promise((resolve) => kiwix.close(resolve));
  });

  it("reads an infobox's numbers and an article's first paragraphs", () => {
    expect(infoboxNumbers(ZIM_PAGES["FUNcube-1"]!)).toEqual({ cospar: ["2013-066AE"], norad: ["39444"] });
    expect(leadText(ZIM_PAGES["FUNcube-1"]!)).toMatch(
      /^FUNcube-1 \(also AO-73\) is a CubeSat built by AMSAT-UK, launched in 2013\.\n\nA second/,
    );
  });

  it("finds the article there first, confirmed by the SATCAT number in its infobox, with no request outside", async () => {
    requests = [];
    asked.length = 0;
    const { status, body } = await offline.api("POST", "/api/satellites/39444/wikipedia");
    expect(status).toBe(200);
    expect(body.wikipedia).toMatchObject({
      title: "FUNcube-1",
      foundBy: "number",
      searchedFor: "NORAD 39444",
      url: `/library/read/${collectionId}/FUNcube-1`,
      archive: { collectionId, title: "Wikipedia", date: "2026-10-01" },
    });
    expect(body.wikipedia.extract).toMatch(/^FUNcube-1 \(also AO-73\) is a CubeSat/);
    expect(wikiOnly()).toEqual([]);
    // An OSCAR number is never looked up as a title on its own.
    const terms = asked.filter((url) => url.startsWith("/suggest?")).map((url) => new URL(url, "http://x").searchParams.get("term"));
    expect(terms).toContain("FUNCUBE-1");
    expect(terms).not.toContain("AO-73");
    const kept = (await offline.api("GET", "/api/satellites")).body.wikipedia[0];
    expect(kept.archive).toEqual({ collectionId, title: "Wikipedia", date: "2026-10-01" });
  });

  it("rejects a title whose infobox carries another object's number, and one about something else, then offers Wikipedia online", async () => {
    requests = [];
    const jas = await offline.api("POST", "/api/satellites/24278/wikipedia");
    expect(jas.status).toBe(404);
    expect(jas.body.error.message).toMatch(
      /The Wikipedia copy on this Outpost \(Wikipedia\) has no article that is clearly about this satellite/,
    );
    expect(jas.body.error.details).toEqual({ offlineChecked: true });
    const css = await offline.api("POST", "/api/satellites/48274/wikipedia");
    expect(css.status).toBe(404);
    expect(wikiOnly()).toEqual([]);
    // Asked for online, on its own press: Wikidata's item carries Tianhe's number.
    const online = await offline.api("POST", "/api/satellites/48274/wikipedia", { online: true });
    expect(online.body.wikipedia).toMatchObject({ title: "Tianhe core module", foundBy: "number", archive: null });
    expect(wikiOnly().length).toBeGreaterThan(0);
  });
});
