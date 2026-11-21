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
const ISS = "ISS (ZARYA),1998-067A,2026-11-21T04:54:08.875296,15.49527370,.0007384,51.6319,243.0636,49.3258,310.8372,0,U,25544,999,59609,.2073332E-3,.11207E-3,0";

/** n made-up satellites, numbered from `first`, on the ISS's orbit. */
function rows(first: number, n: number, name: string): string {
  return Array.from({ length: n }, (_, i) =>
    ISS.replace("ISS (ZARYA)", `"${name} ${i}, test"`).replace(",25544,", `,${first + i},`),
  ).join("\n");
}

let requests: string[] = [];
let failCelestrak = false;
let failSatnogs = false;
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
    expect(iss).toMatchObject({ noradId: 25544, name: "ISS (ZARYA)", designator: "1998-067A", epoch: Date.parse("2026-11-21T04:54:08.875296Z") });
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
    expect(body.sources.map((source: { fetchedAt: number | null }) => source.fetchedAt)).toEqual([null, null]);
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
    expect(list.transmitters).toEqual([expect.objectContaining({ id: "a", uplinkLowHz: 145990000, downlinkLowHz: 437800000, type: "Transceiver" })]);
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
