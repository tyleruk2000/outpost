/**
 * A Geofabrik extract is checked against the MD5 Geofabrik publishes beside it, asked of
 * download.geofabrik.de alone. The download itself, like every download, is held to that
 * host on its first request only, so the MD5 is what stands between a redirect to another
 * server and a file read into the map. An `.md5` that holds no checksum must therefore
 * stop the fetch, not let the file through unchecked. A local stand-in serves Geofabrik's
 * format (fixtures/layers/geofabrik-stand-in.ts); nothing reaches the internet.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { ReferencePackDto } from "@outpost/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGeofabrikStandIn } from "./fixtures/layers/geofabrik-stand-in.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

describe("a Geofabrik extract whose MD5 cannot be read", () => {
  let app: TestApp;
  let server: http.Server;
  const standIn = createGeofabrikStandIn();

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      if (/\.osm\.pbf\.md5$/.test(request.url ?? "")) {
        standIn.requests.push(`${request.method} ${request.url}`);
        response.writeHead(200, { "content-type": "text/html" }).end("<html><body>Not found</body></html>\n");
        return;
      }
      standIn.handle(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    app = await createTestApp({ OUTPOST_GEOFABRIK_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it("is not fetched or read without the checksum", async () => {
    expect((await app.api("POST", "/api/reference/regions", {})).status).toBe(200);
    const found = await app.api("POST", "/api/reference/estimate", {
      provider: "osm-extract",
      scope: { regions: ["us/ohio"] },
      layers: ["food"],
    });
    if (found.status === 200) {
      const started = await app.api("POST", "/api/reference/downloads", {
        estimateId: found.body.estimateId,
        keys: (found.body.items as Array<{ key: string }>).map((item) => item.key),
      });
      await app.ctx.jobs.whenIdle();
      expect(started.status === 200 ? ((await app.api("GET", "/api/reference/packs")).body.packs as ReferencePackDto[]) : []).toEqual([]);
    } else {
      expect(JSON.stringify(found.body)).toMatch(/MD5/);
    }
    expect(standIn.requests.filter((line) => /^GET .*\.osm\.pbf$/.test(line))).toEqual([]);
  });
});
