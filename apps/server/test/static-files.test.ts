import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./helpers.ts";
import { tempDir } from "./temp.ts";

let app: TestApp | undefined;
let dir: string | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** A built web app as the build leaves it: some files with compressed copies beside them. */
async function withWebApp(): Promise<TestApp> {
  dir = tempDir("outpost-static-");
  const web = path.join(dir, "web");
  fs.mkdirSync(path.join(web, "assets"), { recursive: true });
  const script = "console.log('outpost');\n".repeat(200);
  fs.writeFileSync(path.join(web, "index.html"), '<!doctype html><script type="module" src="/assets/index-ABC.js"></script>');
  fs.writeFileSync(path.join(web, "assets/index-ABC.js"), script);
  fs.writeFileSync(path.join(web, "assets/index-ABC.js.gz"), zlib.gzipSync(script));
  fs.writeFileSync(path.join(web, "assets/index-ABC.js.br"), zlib.brotliCompressSync(script));
  fs.writeFileSync(path.join(web, "sw.js"), script);
  fs.writeFileSync(path.join(web, "sw.js.gz"), zlib.gzipSync(script));
  fs.mkdirSync(path.join(web, "map-assets/sprites/v4"), { recursive: true });
  fs.mkdirSync(path.join(web, "map-assets/fonts/Noto Sans Regular"), { recursive: true });
  fs.writeFileSync(path.join(web, "map-assets/sprites/v4/light.json"), "{}");
  fs.writeFileSync(path.join(web, "map-assets/fonts/Noto Sans Regular/0-255.pbf"), "glyphs");
  fs.writeFileSync(path.join(web, "map-assets/SOURCE.json"), "{}");
  return createTestApp({}, dir);
}

describe("the web app's files", () => {
  it("sends the compressed copy the browser accepts, cached for good when its name is fingerprinted", async () => {
    app = await withWebApp();
    const gz = await app.api("GET", "/assets/index-ABC.js", undefined, { headers: { "accept-encoding": "gzip, deflate" } });
    expect(gz.status).toBe(200);
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(gz.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    const br = await app.api("GET", "/assets/index-ABC.js", undefined, { headers: { "accept-encoding": "gzip, br" } });
    expect(br.headers["content-encoding"]).toBe("br");
    const plain = await app.api("GET", "/assets/index-ABC.js", undefined, { headers: { "accept-encoding": "identity" } });
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body).toContain("outpost");
  });

  it("never lets a cache keep the service worker or the page, compressed or not", async () => {
    app = await withWebApp();
    const sw = await app.api("GET", "/sw.js", undefined, { headers: { "accept-encoding": "gzip" } });
    expect(sw.headers["content-encoding"]).toBe("gzip");
    expect(sw.headers["cache-control"]).toBe("no-cache");
    expect(sw.headers["content-security-policy"]).toContain("default-src 'self'");
    const page = await app.api("GET", "/", undefined, { headers: { "accept-encoding": "gzip" } });
    expect(page.headers["cache-control"]).toBe("no-cache");
  });

  it("keeps the map's icons for good, as their folder is named for their version, and its fonts for a week", async () => {
    app = await withWebApp();
    const sprite = await app.api("GET", "/map-assets/sprites/v4/light.json");
    expect(sprite.status).toBe(200);
    expect(sprite.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    const font = await app.api("GET", "/map-assets/fonts/Noto%20Sans%20Regular/0-255.pbf");
    expect(font.status).toBe(200);
    expect(font.headers["cache-control"]).toBe("public, max-age=604800");
    const source = await app.api("GET", "/map-assets/SOURCE.json");
    expect(source.headers["cache-control"]).toBe("public, max-age=0");
  });
});
