import { describe, expect, it } from "vitest";
import { handlingOf, isTilePath, keptCacheName, keptKey, type RequestFacts, shellCacheName } from "./rules";

const ORIGIN = "https://outpost.home";
const precached = new Set(["/index.html", "/assets/index-abc123.js", "/outpost.svg", "/world/land.json"]);

const get = (path: string, extra: Partial<RequestFacts> = {}): RequestFacts => ({
  method: "GET",
  url: path.startsWith("http") ? path : `${ORIGIN}${path}`,
  mode: "cors",
  destination: "",
  ...extra,
});
const pageLoad = (path: string) => get(path, { mode: "navigate", destination: "document" });
const handling = (request: RequestFacts) => handlingOf(request, ORIGIN, precached);

describe("what the service worker does with a request", () => {
  it("asks the server first for a page of the app, whatever its address", () => {
    for (const path of ["/", "/notes", "/notes/abc", "/maps?lat=54", "/kept", "/library/documents/x"]) {
      expect(handling(pageLoad(path)), path).toBe("page");
    }
  });

  it("leaves the API alone: nothing under /api/ is stored or answered from a cache", () => {
    for (const path of [
      "/api/health",
      "/api/events",
      "/api/notes",
      "/api/notes/abc",
      "/api/notes/tree",
      "/api/search?q=water",
      "/api/maps/sources",
      "/api/maps/markers",
      "/api/maps/tracks/t1",
      "/api/maps/area-size?bbox=0,0,1,1&maxZoom=3",
      "/api/documents/d1/file",
      "/api/system",
      "/api/settings",
    ]) {
      expect(handling(get(path)), path).toBe("none");
    }
    // Opened as a page (a download link, an address typed by hand), it is still the server's alone.
    expect(handling(pageLoad("/api/notes/abc/export.md"))).toBe("none");
    expect(handling(pageLoad("/api/maps/export.gpx"))).toBe("none");
  });

  it("leaves reference collections alone, as a frame, a page or a file", () => {
    expect(handling(get("/kiwix/content/wikipedia/A/Water"))).toBe("none");
    expect(handling(get("/kiwix/content/wikipedia/A/Water", { mode: "navigate", destination: "iframe" }))).toBe("none");
    expect(handling(pageLoad("/kiwix/content/wikipedia/A/Water"))).toBe("none");
  });

  it("leaves anything that changes something alone", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(handling(get("/api/notes/abc", { method }))).toBe("none");
      expect(handling(get("/api/attachments/a1", { method }))).toBe("none");
    }
  });

  it("looks for a kept copy only where something can have been kept on purpose", () => {
    expect(handling(get("/api/attachments/a1"))).toBe("kept");
    expect(handling(get("/api/maps/tiles/12/2003/1332.mvt?v=abc"))).toBe("kept");
    expect(handling(get("/api/maps/terrain/10/500/333.webp"))).toBe("kept");
    expect(handling(get("/map-assets/fonts/Noto%20Sans%20Regular/0-255.pbf"))).toBe("kept");
    expect(handling(get("/map-assets/sprites/v4/light.json"))).toBe("kept");
  });

  it("never answers with a kept file when it is opened as a page: an upload must not run in the app's origin", () => {
    expect(handling(pageLoad("/api/attachments/a1"))).toBe("none");
    expect(handling(get("/api/attachments/a1", { mode: "navigate", destination: "iframe" }))).toBe("none");
    expect(handling(pageLoad("/map-assets/sprites/v4/light.json"))).toBe("none");
  });

  it("lets the request that fetches a tile in order to keep it through to the server", () => {
    expect(handling(get("/api/maps/tiles/12/2003/1332.mvt?raw=1"))).toBe("none");
  });

  it("answers the app's own files from the installed copy", () => {
    expect(handling(get("/assets/index-abc123.js"))).toBe("shell");
    expect(handling(get("/assets/some-other-chunk-999.js"))).toBe("shell");
    expect(handling(get("/outpost.svg"))).toBe("shell");
    expect(handling(get("/world/land.json"))).toBe("shell");
  });

  it("does not treat a file, a frame or another site as a page of the app", () => {
    expect(handling(pageLoad("/pdfjs/cmaps/78-H.bcmap"))).toBe("none");
    expect(handling(pageLoad("/manifest.webmanifest"))).toBe("none");
    expect(handling(get("/notes/abc", { mode: "navigate", destination: "iframe" }))).toBe("none");
    expect(handling(pageLoad("https://example.org/"))).toBe("none");
    expect(handling(get("https://example.org/assets/x.js"))).toBe("none");
    expect(handling(get("not a url"))).toBe("none");
  });
});

describe("where a kept copy is filed", () => {
  it("under the path alone, so a tile is found whatever version its address carries", () => {
    expect(keptKey(`${ORIGIN}/api/maps/tiles/12/2003/1332.mvt?v=abc`, ORIGIN)).toBe("/api/maps/tiles/12/2003/1332.mvt");
    expect(keptKey("/api/maps/tiles/12/2003/1332.mvt?raw=1", ORIGIN)).toBe("/api/maps/tiles/12/2003/1332.mvt");
    expect(keptKey("/map-assets/fonts/Noto Sans Regular/0-255.pbf", ORIGIN)).toBe("/map-assets/fonts/Noto%20Sans%20Regular/0-255.pbf");
  });

  it("names caches so that a build's files and a person's kept things can never be mistaken for each other", () => {
    expect(shellCacheName("index-abc.js")).toBe("outpost-shell:index-abc.js");
    expect(keptCacheName("note", "n1")).toBe("outpost-kept:note:n1");
    expect(keptCacheName("area", "a1").startsWith("outpost-shell:")).toBe(false);
  });

  it("knows a map tile from anything else", () => {
    expect(isTilePath("/api/maps/tiles/1/0/0.mvt")).toBe(true);
    expect(isTilePath("/api/maps/terrain/1/0/0.webp")).toBe(true);
    expect(isTilePath("/api/attachments/a1")).toBe(false);
    expect(isTilePath("/map-assets/sprites/v4/light.png")).toBe(false);
  });
});
