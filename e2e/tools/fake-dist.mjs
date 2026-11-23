// Stands in for nodejs.org/dist during end-to-end tests, so that writing a portable
// drive can be exercised without the internet. It serves a checksum list and, for
// every platform, a small archive whose "node" is a stub. The drive written from it is
// complete in shape but is not started by the tests. It also serves one plain file, so
// that a catalogue download can be followed from Explore to the library. And under
// /overpass/ it stands in for a route source, answering with made-up routes, so that
// finding a route can be followed from the search to the GPX export. Under
// /repeater-lists/ it stands in for a publisher of repeater lists, with made-up stations.
// Under /voacap/ it stands in for the engine's repository, serving VOACAP's real
// coefficients from the tests' copy (engines/voacap/.cache), by the names in
// engines/voacap/coefficients.json and no others.
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { buildPbf } from "../../apps/server/test/fixtures/layers/builders.ts";
import { createGeofabrikStandIn } from "../../apps/server/test/fixtures/layers/geofabrik-stand-in.ts";
import { serveOurAirportsStandIn } from "../../apps/server/test/fixtures/layers/ourairports-stand-in.ts";
import { createImageryStandIn } from "../../apps/server/test/fixtures/maps/imagery-stand-in.ts";
import { createOsNamesStandIn } from "../../apps/server/test/fixtures/maps/os-names-sample.ts";
import { createOverpassStandIn } from "../../apps/server/test/fixtures/maps/overpass-answers.ts";
import { serveP533StandIn } from "../../apps/server/test/fixtures/propagation/p533-maps-stand-in.ts";
import { createRepeaterSourceStandIn } from "../../apps/server/test/fixtures/repeaters/source-stand-in.ts";
import { serveWeatherStandIn } from "../../apps/server/test/fixtures/weather/stand-in.ts";

const port = Number(process.argv[2] ?? 8473);
const version = process.version;

function tar(name, content) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000755\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(`${content.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write("00000000000\0", 136);
  header.write("        ", 148);
  header.write("0", 156);
  header.write("ustar\0", 257);
  header.write("00", 263);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return Buffer.concat([header, content, Buffer.alloc((512 - (content.length % 512)) % 512), Buffer.alloc(1024)]);
}

const stub = Buffer.from("#!/bin/sh\necho 'stub runtime used by end-to-end tests'\n");
const files = new Map();
for (const platform of ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]) {
  files.set(`node-${version}-${platform}.tar.gz`, gzipSync(tar(`node-${version}-${platform}/bin/node`, stub)));
}
for (const platform of ["win-x64", "win-arm64"]) files.set(`${platform}/node.exe`, Buffer.from("MZ stub runtime"));
const sums = [...files].map(([name, body]) => `${createHash("sha256").update(body).digest("hex")}  ${name}`).join("\n");

// A file for the downloads test: any bytes will do, as long as both sides agree on them.
export const FIELD_MANUAL = Buffer.alloc(300_000, "A field manual for end-to-end tests. ");

const routeSource = createOverpassStandIn();
// download.geofabrik.de: its list of extracts and small made-up extracts (apps/server/test/fixtures/layers).
const geofabrik = createGeofabrikStandIn();
// A made-up Monaco for Map data's own add (map-data.spec.ts): one main road through it, a hospital and a pharmacy beside it.
{
  const body = buildPbf({
    nodes: [
      { id: 1, lat: 43.725, lon: 7.41 },
      { id: 2, lat: 43.733, lon: 7.42 },
      { id: 3, lat: 43.741, lon: 7.43 },
      { id: 10, lat: 43.734, lon: 7.421, tags: { amenity: "hospital", name: "Made-up Hospital (test)" } },
      { id: 11, lat: 43.732, lon: 7.419, tags: { amenity: "pharmacy", name: "Made-up Pharmacy (test)" } },
    ],
    ways: [{ id: 100, refs: [1, 2, 3], tags: { highway: "primary", ref: "M6", name: "Boulevard (test)" } }],
    relations: [],
    timestamp: Date.UTC(2026, 10, 21) / 1000,
  });
  geofabrik.files.set("europe/monaco", {
    path: "europe/monaco",
    body,
    md5: createHash("md5").update(body).digest("hex"),
    latest: "261121",
    dated: ["261121"],
  });
}
const voacapHome = path.resolve(import.meta.dirname, "../../engines/voacap");
const voacapFiles = new Set(JSON.parse(fs.readFileSync(path.join(voacapHome, "coefficients.json"), "utf8")).files.map((file) => file.path));
const repeaterSource = createRepeaterSourceStandIn();
// Satellite imagery's publishers: NASA's world picture, the Sentinel-2 search and one scene.
const imagery = createImageryStandIn(() => `http://127.0.0.1:${port}`);
// Ordnance Survey's Downloads API and its file store, serving a small real sample of OS Open Names.
const osNames = createOsNamesStandIn(() => `http://127.0.0.1:${port}`);

http
  .createServer((request, response) => {
    if (request.url === "/health") return response.end("ok");
    if (request.url?.startsWith("/overpass/")) return routeSource.handle(request, response);
    if (request.url?.startsWith("/repeater-lists/")) return repeaterSource.handle(request, response);
    if (request.url?.startsWith("/p533/")) return serveP533StandIn(request, response);
    // Every weather publisher, with recorded answers (apps/server/test/fixtures/weather).
    if (request.url?.startsWith("/weather/")) return serveWeatherStandIn(request, response);
    if (request.url?.startsWith("/voacap/")) {
      const name = decodeURIComponent(request.url.slice("/voacap/".length));
      if (!voacapFiles.has(name)) {
        response.statusCode = 404;
        return response.end();
      }
      const body = fs.readFileSync(path.join(voacapHome, ".cache", name));
      response.setHeader("Content-Length", body.length);
      return response.end(body);
    }
    if (request.url?.startsWith("/imagery/")) return imagery.handle(request, response);
    // OurAirports' airports.csv and airport-frequencies.csv (apps/server/test/fixtures/layers).
    if (request.url?.startsWith("/ourairports/")) return serveOurAirportsStandIn(request, response);
    if (request.url?.startsWith("/geofabrik/")) return geofabrik.handle(request, response, "/geofabrik");
    if (request.url?.startsWith("/os-downloads/") || request.url?.startsWith("/os-files/")) return osNames.handle(request, response);
    if (request.url === "/files/field-manual.bin") {
      response.setHeader("Content-Length", FIELD_MANUAL.length);
      return response.end(FIELD_MANUAL);
    }
    if (request.url === `/${version}/SHASUMS256.txt`) return response.end(`${sums}\n`);
    const body = files.get((request.url ?? "").replace(`/${version}/`, ""));
    if (!body) {
      response.statusCode = 404;
      return response.end();
    }
    response.setHeader("Content-Length", body.length);
    response.end(body);
  })
  .listen(port, "127.0.0.1");
