/**
 * A stand-in for the streets service (Valhalla 3.9.3), answering with replies recorded
 * from a real one serving Great Britain's streets (Geofabrik's extract of 22 Nov 2026,
 * built on the Mac with the sidecar image, 23 Nov 2026; street data © OpenStreetMap
 * contributors, ODbL 1.0):
 *
 *   door-start-auto.json   Fetcham (51.2905, -0.3555) to the fixture's Leatherhead join (51.296, -0.33), by car
 *   door-end-auto.json     the fixture's Dover join (51.123, 1.31) to a door in Dover (51.1265, 1.3135), by car
 *   walk.json              Leatherhead (51.2965, -0.3303) to Box Hill (51.2556, -0.3106), on foot
 *   cycle.json             Leatherhead to Dorking (51.2325, -0.3305), by bicycle
 *   outside.json           any route to a point in France: error 171, no streets near it
 *   reach-drive.json       15 and 30 minutes' drive from Leatherhead (denoise 0.5, generalize 100)
 *   reach-walk.json        15 minutes' walk from Leatherhead (denoise 0.5, generalize 50)
 *   status.json            GET /status
 *
 * Which reply is chosen by the costing and the first point; every request is kept, to
 * check what Outpost sent.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const recorded = (name: string) => fs.readFileSync(path.join(here, name), "utf8");

export interface ValhallaStandIn {
  url: string;
  requests: Array<{ method: string; path: string; body: Record<string, unknown> | null }>;
  /** Answers instead of the recorded replies, for one test. */
  override: ((path: string, body: Record<string, unknown> | null) => { status: number; body: string; delayMs?: number } | null) | null;
  close(): Promise<void>;
}

interface Loc {
  lat: number;
  lon: number;
}

function choose(pathName: string, body: Record<string, unknown> | null): { status: number; body: string } {
  if (pathName === "/status") return { status: 200, body: recorded("status.json") };
  const locations = (body?.locations as Loc[] | undefined) ?? [];
  const costing = body?.costing;
  if (locations.some((l) => l.lat < 50.5 && l.lon > 1.5)) return { status: 400, body: recorded("outside.json") };
  if (pathName === "/route") {
    if (costing === "pedestrian") return { status: 200, body: recorded("walk.json") };
    if (costing === "bicycle") return { status: 200, body: recorded("cycle.json") };
    if (costing === "auto") {
      const first = locations[0];
      if (first && Math.abs(first.lat - 51.123) < 0.01) return { status: 200, body: recorded("door-end-auto.json") };
      return { status: 200, body: recorded("door-start-auto.json") };
    }
  }
  if (pathName === "/isochrone") {
    if (costing === "pedestrian") return { status: 200, body: recorded("reach-walk.json") };
    return { status: 200, body: recorded("reach-drive.json") };
  }
  return { status: 404, body: JSON.stringify({ error_code: 106, error: "Try any of: '/route' '/isochrone' '/status'" }) };
}

export async function createValhallaStandIn(port = 0): Promise<ValhallaStandIn> {
  const standIn: ValhallaStandIn = {
    url: "",
    requests: [],
    override: null,
    close: async () => {},
  };
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      let body: Record<string, unknown> | null = null;
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        body = null;
      }
      const pathName = (request.url ?? "/").split("?")[0]!;
      standIn.requests.push({ method: request.method ?? "GET", path: pathName, body });
      const answer = standIn.override?.(pathName, body) ?? choose(pathName, body);
      const send = () => {
        if (response.destroyed) return;
        response.writeHead(answer.status, { "content-type": "application/json" });
        response.end(answer.body);
      };
      const delay = (answer as { delayMs?: number }).delayMs;
      if (delay) setTimeout(send, delay);
      else send();
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  standIn.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  standIn.close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return standIn;
}

/** Plays the streets service's side of the shared folder: what it writes as it starts. */
export function writeSidecarStatus(dir: string, status: Record<string, unknown>) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "status.json.part"), JSON.stringify(status));
  fs.renameSync(path.join(dir, "status.json.part"), path.join(dir, "status.json"));
}

export const GB_TILESET = {
  name: "Great Britain",
  extracts: [{ file: "great-britain.osm.pbf", bytes: 2_205_301_182 }],
  builtAt: Date.parse("2026-11-23T10:32:00Z"),
  tarBytes: 2_734_991_360,
  valhalla: "3.9.3",
  regions: [{ regionId: "europe/great-britain", name: "Great Britain", country: "GB", dataDate: "2026-11-22" }],
};

export const sidecarStatus = (overrides: Record<string, unknown> = {}) => ({
  state: "ready",
  id: null,
  name: null,
  stage: null,
  message: null,
  startedAt: null,
  finishedAt: null,
  current: GB_TILESET,
  ...overrides,
});
