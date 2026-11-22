/**
 * Satellite elements and transmitters, fetched only when asked, from a local server that
 * stands in for CelesTrak and SatNOGS DB (`OUTPOST_SATELLITES_STAND_IN`).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { parseCelestrakCsv } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";

const HEADER =
  "OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT";
const ISS =
  "ISS (ZARYA),1998-067A,2026-11-21T04:54:08.875296,15.49527370,.0007384,51.6319,243.0636,49.3258,310.8372,0,U,25544,999,59609,.2073332E-3,.11207E-3,0";

/** n made-up satellites, numbered from `first`, on the ISS's orbit. */
function rows(first: number, n: number, name: string): string {
  return Array.from({ length: n }, (_, i) => ISS.replace("ISS (ZARYA)", `"${name} ${i}, test"`).replace(",25544,", `,${first + i},`)).join(
    "\n",
  );
}

let requests: string[] = [];
let failCelestrak = false;
let failSatnogs = false;
let failWikipedia = false;

/** SatNOGS DB's satellite list, as it gives it (the ISS's record as read on 22 November 2026). */
const SATNOGS_SATELLITES = [
  {
    sat_id: "XSKZ-5603-1870-9019-3066",
    norad_cat_id: 25544,
    name: "ISS",
    names: "ZARYA, RS0ISS, NA1SS",
    image: "satellites/ISS.jpg",
    status: "in orbit",
    decayed: null,
    launched: "1998-11-20T00:00:00Z",
    deployed: null,
    website: "https://www.nasa.gov/mission_pages/station/main/index.html",
    operator: "None",
    countries: "RU,US",
    citation: "dl7ndr",
    is_frequency_violator: false,
    associated_satellites: ["OTHER-1"],
  },
  { sat_id: "OTHER-1", norad_cat_id: 1, name: "Not kept", names: "", status: "in orbit", website: "javascript:alert(1)" },
  {
    sat_id: "AMSAT-0",
    norad_cat_id: 91000,
    name: "AMSAT 0",
    names: "AMSAT 0, ",
    status: "in orbit",
    launched: "not a date",
    website: "ftp://example.org",
    operator: "Someone",
    countries: "us, XX1",
    is_frequency_violator: true,
    associated_satellites: [],
  },
  { sat_id: "NO-NORAD", norad_cat_id: null, name: "No number" },
];
let standIn: http.Server;
let app: TestApp;

beforeAll(async () => {
  standIn = http.createServer((request, response) => {
    const url = request.url ?? "";
    requests.push(url);
    if (url.startsWith("/celestrak/")) {
      if (failCelestrak) {
        response.writeHead(503).end();
        return;
      }
      const group = new URL(url, "http://x").searchParams.get("GROUP");
      const body =
        group === "stations"
          ? `${HEADER}\n${ISS}\n${rows(90000, 5, "STATION")}`
          : group === "amateur"
            ? `${HEADER}\n${ISS}\n${rows(91000, 45, "AMSAT")}`
            : `${HEADER}\n${rows(92000, 25, "WX")}`;
      response.writeHead(200, { "content-type": "text/csv" }).end(body);
      return;
    }
    if (url.startsWith("/satnogs/satellites/")) {
      if (failSatnogs) {
        response.writeHead(500).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(SATNOGS_SATELLITES));
      return;
    }
    if (url.startsWith("/wikipedia/")) {
      const address = new URL(url, "http://x");
      if (failWikipedia) {
        response.writeHead(503).end();
        return;
      }
      if (address.pathname === "/wikipedia/w/api.php") {
        const titles = address.searchParams.get("titles");
        if (titles !== null) {
          // As the Action API answers: ISS is a disambiguation page, NA1SS redirects to the article, the rest are missing.
          const names = titles.split("|");
          response.writeHead(200, { "content-type": "application/json" }).end(
            JSON.stringify({
              query: {
                redirects: names.includes("NA1SS") ? [{ from: "NA1SS", to: "International Space Station" }] : [],
                pages: names.map((name) =>
                  name === "ISS"
                    ? { ns: 0, title: "ISS", pageid: 1, pageprops: { disambiguation: "" } }
                    : name === "NA1SS"
                      ? { ns: 0, title: "International Space Station", pageid: 2 }
                      : { ns: 0, title: name, missing: true },
                ),
              },
            }),
          );
          return;
        }
        const search = address.searchParams.get("srsearch") ?? "";
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ query: { search: search.startsWith("AMSAT 0") ? [{ ns: 0, title: "Fox-1B" }] : [] } }));
        return;
      }
      const title = decodeURIComponent(address.pathname.replace("/wikipedia/api/rest_v1/page/summary/", ""));
      if (title === "International_Space_Station" || title === "Fox-1B") {
        const name = title.replace(/_/g, " ");
        response.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            type: "standard",
            title: name,
            description: "A test article",
            extract: `${name} is a test article.`,
            timestamp: "2026-11-01T00:00:00Z",
            content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title}` } },
          }),
        );
        return;
      }
      response.writeHead(404).end();
      return;
    }
    if (url.startsWith("/satnogs/")) {
      if (failSatnogs) {
        response.writeHead(500).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify([
          {
            uuid: "a",
            description: "FM voice repeater",
            alive: true,
            type: "Transceiver",
            uplink_low: 145990000,
            downlink_low: 437800000,
            mode: "FM",
            invert: false,
            norad_cat_id: 25544,
            status: "active",
          },
          { uuid: "b", description: "Not ours", alive: true, norad_cat_id: 1, status: "active" },
          { uuid: "c", alive: true, norad_cat_id: 25544 },
        ]),
      );
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
  app = await createTestApp({ OUTPOST_SATELLITES_STAND_IN: base }, undefined, { voacapData: false });
});

afterAll(async () => {
  await app.close();
  await new Promise((resolve) => standIn.close(resolve));
});

describe("CelesTrak's CSV", () => {
  it("reads the fields by their names, quoted names included", () => {
    const [iss, quoted] = parseCelestrakCsv(`${HEADER}\n${ISS}\n${rows(90000, 1, "A")}`, "stations");
    expect(iss).toMatchObject({
      noradId: 25544,
      name: "ISS (ZARYA)",
      designator: "1998-067A",
      epoch: Date.parse("2026-11-21T04:54:08.875296Z"),
    });
    expect(iss?.elements.MEAN_MOTION).toBeCloseTo(15.4952737);
    expect(iss?.elements.BSTAR).toBeCloseTo(0.0002073332);
    expect(quoted?.name).toBe("A 0, test");
  });

  it("keeps nothing when a row is broken", () => {
    expect(() => parseCelestrakCsv(`${HEADER}\n${ISS.replace("15.49527370", "x")}`, "amateur")).toThrow(/MEAN_MOTION/);
  });
});

describe("satellites", () => {
  it("asks no one until a person presses", async () => {
    const { body } = await app.api("GET", "/api/satellites");
    expect(body.satellites).toEqual([]);
    expect(body.sources.map((source: { fetchedAt: number | null }) => source.fetchedAt)).toEqual([null, null, null]);
    expect(body.about).toEqual([]);
    expect(body.wikipedia).toEqual([]);
    expect(requests).toEqual([]);
  });

  it("keeps the elements of every group once, and the transmitters of those satellites", async () => {
    const { status, body } = await app.api("POST", "/api/satellites/fetch");
    expect(status).toBe(200);
    expect(body.said[0]).toMatch(/76 satellites/);
    const list = (await app.api("GET", "/api/satellites")).body;
    expect(list.satellites).toHaveLength(76);
    const iss = list.satellites.find((s: { noradId: number }) => s.noradId === 25544);
    expect(iss.groups.sort()).toEqual(["amateur", "stations"]);
    expect(list.transmitters).toEqual([
      expect.objectContaining({ id: "a", uplinkLowHz: 145990000, downlinkLowHz: 437800000, type: "Transceiver" }),
    ]);
    expect(body.said[2]).toMatch(/details of 2 satellites from SatNOGS DB/);
    // Only the kept satellites, read strictly: "None" is no operator, a bad address or date is left out, codes are checked.
    expect(list.about).toEqual(
      expect.arrayContaining([
        {
          noradId: 25544,
          name: "ISS",
          otherNames: ["ZARYA", "RS0ISS", "NA1SS"],
          status: "in orbit",
          launched: "1998-11-20T00:00:00Z",
          deployed: null,
          decayed: null,
          website: "https://www.nasa.gov/mission_pages/station/main/index.html",
          operator: null,
          countries: ["RU", "US"],
          citation: "dl7ndr",
          frequencyViolator: false,
          associated: ["Not kept"],
        },
        expect.objectContaining({
          noradId: 91000,
          otherNames: [],
          launched: null,
          website: null,
          operator: "Someone",
          countries: ["US"],
          frequencyViolator: true,
        }),
      ]),
    );
    expect(list.about).toHaveLength(2);
    expect(list.sources[2]).toMatchObject({ id: "satnogs-satellites", count: 2, error: null });
    expect(requests.some((url) => url.startsWith("/wikipedia/"))).toBe(false);
  });

  it("does not ask CelesTrak again within its two-hour update", async () => {
    requests = [];
    const { body } = await app.api("POST", "/api/satellites/fetch");
    expect(body.said[0]).toMatch(/less than 2 hours ago/);
    expect(requests).toEqual([]);
  });

  it("keeps what it had when CelesTrak fails, and says so", async () => {
    app.ctx.sqlite.prepare("UPDATE satellite_fetches SET fetched_at = 0").run();
    failCelestrak = true;
    const { status, body } = await app.api("POST", "/api/satellites/fetch");
    failCelestrak = false;
    expect(status).toBe(502);
    expect(JSON.stringify(body)).toMatch(/unchanged/);
    const list = (await app.api("GET", "/api/satellites")).body;
    expect(list.satellites).toHaveLength(76);
    expect(list.sources[0].error).toMatch(/503/);
  });

  it("keeps the elements when only SatNOGS fails", async () => {
    app.ctx.sqlite.prepare("UPDATE satellite_fetches SET fetched_at = 0").run();
    failSatnogs = true;
    const { status, body } = await app.api("POST", "/api/satellites/fetch");
    failSatnogs = false;
    expect(status).toBe(200);
    expect(body.said[1]).toMatch(/SatNOGS DB/);
    const list = (await app.api("GET", "/api/satellites")).body;
    expect(list.sources[1].error).toMatch(/500/);
    expect(list.transmitters).toHaveLength(1);
    expect(body.said[2]).toMatch(/Could not get satellite details from SatNOGS DB.*unchanged/);
    expect(list.sources[2].error).toMatch(/500/);
    expect(list.about).toHaveLength(2);
  });
});

describe("Wikipedia, on a press", () => {
  it("finds the article under one of the satellite's names, passing over a disambiguation page, and keeps it", async () => {
    requests = [];
    const { status, body } = await app.api("POST", "/api/satellites/25544/wikipedia");
    expect(status).toBe(200);
    expect(body.wikipedia).toMatchObject({
      noradId: 25544,
      title: "International Space Station",
      url: "https://en.wikipedia.org/wiki/International_Space_Station",
      extract: "International Space Station is a test article.",
      foundBy: "name",
      searchedFor: "NA1SS",
    });
    expect(requests.filter((url) => url.startsWith("/wikipedia/"))).toHaveLength(2);
    const list = (await app.api("GET", "/api/satellites")).body;
    expect(list.wikipedia).toEqual([expect.objectContaining({ noradId: 25544, title: "International Space Station" })]);
  });

  it("searches when no name is an article, and says it was a search", async () => {
    const { body } = await app.api("POST", "/api/satellites/91000/wikipedia");
    expect(body.wikipedia).toMatchObject({ title: "Fox-1B", foundBy: "search", searchedFor: "AMSAT 0 satellite" });
  });

  it("says so when nothing is found, and keeps nothing", async () => {
    const { status, body } = await app.api("POST", "/api/satellites/92000/wikipedia");
    expect(status).toBe(404);
    expect(JSON.stringify(body)).toMatch(/Wikipedia has no article/);
    expect((await app.api("GET", "/api/satellites")).body.wikipedia).toHaveLength(2);
  });

  it("keeps what it had when Wikipedia fails", async () => {
    failWikipedia = true;
    const { status, body } = await app.api("POST", "/api/satellites/25544/wikipedia");
    failWikipedia = false;
    expect(status).toBe(502);
    expect(JSON.stringify(body)).toMatch(/503/);
    expect((await app.api("GET", "/api/satellites")).body.wikipedia).toHaveLength(2);
  });

  it("discards an article, and refuses a satellite it does not know", async () => {
    expect((await app.api("DELETE", "/api/satellites/91000/wikipedia")).status).toBe(200);
    const list = (await app.api("GET", "/api/satellites")).body;
    expect(list.wikipedia.map((row: { noradId: number }) => row.noradId)).toEqual([25544]);
    expect((await app.api("POST", "/api/satellites/12345/wikipedia")).status).toBe(404);
    expect((await app.api("POST", "/api/satellites/abc/wikipedia")).status).toBe(400);
  });
});

describe("the radio licence setting", () => {
  it("is off by default and keeps a callsign in capitals", async () => {
    expect((await app.api("GET", "/api/settings")).body.settings["radio.licensed"]).toBe(false);
    const { body } = await app.api("PATCH", "/api/settings", { "radio.licensed": true, "radio.callsign": " m7abc " });
    expect(body.settings["radio.licensed"]).toBe(true);
    expect(body.settings["radio.callsign"]).toBe("M7ABC");
    expect((await app.api("PATCH", "/api/settings", { "radio.callsign": "M7 <b>" })).status).toBe(400);
  });
});
