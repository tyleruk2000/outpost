/**
 * Every host the server is written to ask, against the two pages that promise the list:
 * docs/security.md ("No telemetry" and the sections it points to) and docs/offline.md
 * ("What needs a connection"). A host added to the code is either asked, and then must be
 * named in both, or only a link or a credit the browser shows, and then must be listed
 * below as one. Either way someone decides, so a new outbound host cannot slip in unsaid.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const security = fs.readFileSync(path.join(root, "docs/security.md"), "utf8");
const offline = fs.readFileSync(path.join(root, "docs/offline.md"), "utf8");

/**
 * Hosts in the server's code that it never asks: credits, licences, terms and publishers'
 * pages, shown as links the browser follows.
 */
const LINKS_ONLY = new Set([
  "check-for-flooding.service.gov.uk",
  "creativecommons.org",
  "discovery.nationalarchives.gov.uk",
  "fas.org",
  "github.com",
  "hub.worldpop.org",
  "joint-research-centre.ec.europa.eu",
  "map.geo.admin.ch",
  "mapterhorn.com",
  "nsarchive2.gwu.edu",
  "nuke.fas.org",
  "open-meteo.com",
  "opendata.swiss",
  "opendatacommons.org",
  "openstreetmap.org",
  "ourairports.com",
  "pris.iaea.org",
  "protomaps.com",
  "ratings.food.gov.uk",
  "registry.opendata.aws",
  "science.nasa.gov",
  "sentinels.copernicus.eu",
  "weather.metoffice.gov.uk",
  "wiki.openstreetmap.org",
  "www.babs.admin.ch",
  "www.data.gov.uk",
  "www.geo.admin.ch",
  "www.geonames.org",
  "www.givefood.org.uk",
  "www.hse.gov.uk",
  "www.mediawiki.org",
  "www.nasa.gov",
  "www.nationalarchives.gov.uk",
  "www.naturalearthdata.com",
  "www.ntiindex.org",
  "www.openstreetmap.org",
  "www.ordnancesurvey.co.uk",
  "www.sipri.org",
  "www.wikidata.org",
  "www.worldpop.org",
]);

/**
 * Asked, but named in offline.md by what they are rather than by host: the satellite and
 * aerial picture hosts ("Earth Search and its Sentinel-2 files, NASA ..., LINZ's public
 * bucket, Microsoft's Planetary Computer"), and the terrain archive's default address,
 * which both pages call the `maps.terrainSource` archive.
 */
const SECURITY_ONLY = new Set([
  "assets.science.nasa.gov",
  "earth-search.aws.element84.com",
  "e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com",
  "nz-imagery.s3.ap-southeast-2.amazonaws.com",
  "planetarycomputer.microsoft.com",
  "naipeuwest.blob.core.windows.net",
]);
const NAMED_AS_A_SETTING = new Set(["download.mapterhorn.com"]);
/** XML namespaces: names written into files, never fetched. */
const NAMESPACES = new Set(["www.w3.org", "www.topografix.com", "www.idpf.org", "ns.adobe.com", "calendarserver.org", "opds-spec.org"]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "cli" ? [] : sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** Hosts written in the code as the start of an address in a string, or as a `…_HOST` constant. */
function hostsInCode(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(path.join(root, "apps/server/src"))) {
    const text = fs.readFileSync(file, "utf8");
    const hosts = [
      ...[...text.matchAll(/["'`]https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)].map((match) => match[1]!),
      ...[...text.matchAll(/_HOST\s*=\s*"([a-z0-9.-]+)"/gi)].map((match) => match[1]!),
    ];
    for (const host of hosts) {
      const lower = host.toLowerCase();
      found.set(lower, [...(found.get(lower) ?? []), path.relative(root, file)]);
    }
  }
  return found;
}

describe("the hosts Outpost asks, against what the documentation says", () => {
  const inCode = hostsInCode();

  it("finds the hosts the code asks (the scan itself works)", () => {
    for (const host of ["api.os.uk", "download.geofabrik.de", "api.ratings.food.gov.uk", "environment.data.gov.uk"]) {
      expect(inCode.has(host), host).toBe(true);
    }
  });

  it("names every host the code asks in security.md and offline.md", () => {
    const missing: string[] = [];
    for (const [host, files] of inCode) {
      if (LINKS_ONLY.has(host) || NAMESPACES.has(host) || host.endsWith(".invalid") || host === "127.0.0.1" || host === "localhost") continue;
      const where = ` (${[...new Set(files)].join(", ")})`;
      if (!security.includes(host)) missing.push(`security.md lacks ${host}${where}`);
      if (!SECURITY_ONLY.has(host) && !NAMED_AS_A_SETTING.has(host) && !offline.includes(host))
        missing.push(`offline.md lacks ${host}${where}`);
    }
    expect(missing).toEqual([]);
  });

  it("lists no link that has left the code", () => {
    for (const host of LINKS_ONLY) expect(inCode.has(host), `${host} is no longer in the code; remove it from LINKS_ONLY`).toBe(true);
  });
});

describe("Ordnance Survey's answers about its downloads", () => {
  it("are read only up to a bound, not however much the server sends", async () => {
    const http = await import("node:http");
    const { createHttpClient } = await import("../src/core/http.ts");
    const { fetchOffer } = await import("../src/modules/maps/os-names/source.ts");
    let sent = 0;
    const server = http.createServer((request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      // A JSON string that never ends: 64 MB, a megabyte at a time, unless the reader stops first.
      response.write('{"id":"OpenNames","version":"2026-10","padding":"');
      const chunk = "x".repeat(1024 * 1024);
      const more = () => {
        while (sent < 64 && !response.destroyed) {
          sent += 1;
          if (!response.write(chunk)) return void response.once("drain", more);
        }
        if (!response.destroyed) response.end('"}');
      };
      more();
      request.on("close", () => response.destroy());
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const client = createHttpClient({ allowPrivate: true });
    try {
      const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/downloads/v1/`;
      await expect(fetchOffer(client, { base })).rejects.toThrow(/Ordnance Survey/);
      expect(sent).toBeLessThan(16);
    } finally {
      await client.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }, 30_000);
});
