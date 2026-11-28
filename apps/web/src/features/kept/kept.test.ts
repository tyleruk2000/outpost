import type { NoteDetail, NoteDoc, NoteTreeItem } from "@outpost/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { areaPositions, areaRefusal } from "./area";
import { deviceOf } from "./device";
import { type FakeCacheStorage, installFakeCaches } from "./fake-caches";
import { BASE_GLYPH_RANGES, collectGlyphRanges, glyphPath, spritePaths } from "./glyphs";
import { attachmentsOf, keepMedical, keepNote, keepPlaces, keepTrack, MAX_KEPT_PAGES, refreshKept } from "./keep";
import { findKeptPage } from "./kept-note-screen";
import { forgetKeptSnapshot, getKept, keepingSupported, listKept, removeKept } from "./store";

const doc = (...content: unknown[]): NoteDoc => ({ type: "doc", content }) as unknown as NoteDoc;
const text = (value: string) => ({ type: "paragraph", content: [{ type: "text", text: value }] });

function page(id: string, patch: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id,
    title: `Page ${id}`,
    icon: null,
    parentId: null,
    content: doc(text(`Text of ${id}`)),
    tags: [],
    isFavorite: false,
    isTemplate: false,
    encrypted: false,
    position: 1,
    coverAttachmentId: null,
    coverUrl: null,
    breadcrumbs: [],
    backlinks: [],
    children: [],
    trashedAt: null,
    createdAt: 1,
    updatedAt: 100,
    lastViewedAt: null,
    ...patch,
  };
}

/** A stand-in server: the pages, files, routes and places it holds, and every address asked of it. */
function fakeServer() {
  const state = {
    pages: new Map<string, NoteDetail>(),
    files: new Map<string, { type: string; bytes: number }>(),
    tracks: new Map<string, { id: string; name: string; updatedAt: number }>(),
    markers: [] as Array<{ id: string; name: string }>,
    /** The households' medical sheets (only how many matter here), and which household is current. */
    medical: {
      current: "household",
      households: {
        household: { name: "Home", sheets: 1 },
        caravan: { name: "Caravan", sheets: 2 },
      } as Record<string, { name: string; sheets: number }>,
    },
    asked: [] as string[],
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const missing = () => json({ error: { code: "not_found", message: "It was not found." } }, 404);
  const tree = (): NoteTreeItem[] =>
    [...state.pages.values()]
      .filter((item) => item.trashedAt === null && !item.isTemplate)
      .map((item) => ({
        id: item.id,
        title: item.title,
        icon: item.icon,
        parentId: item.parentId,
        position: item.position,
        isFavorite: false,
        childCount: item.children.length,
        updatedAt: item.updatedAt,
      }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
      const path = url.pathname;
      state.asked.push(path + url.search);
      if (path === "/api/medical-sheets") {
        const id = url.searchParams.get("household") ?? state.medical.current;
        const household = state.medical.households[id];
        if (!household) return missing();
        const sheets = Array.from({ length: household.sheets }, (_, n) => ({ id: `${id}${n}`, name: `Sheet ${n}`, encrypted: false }));
        return json({ sheets, inSearch: false, inTools: false, household: { id, name: household.name, several: true } });
      }
      if (path === "/api/notes/tree") return json({ notes: tree() });
      if (path === "/api/maps/tracks") return json({ tracks: [...state.tracks.values()] });
      if (path === "/api/maps/markers") return json({ markers: state.markers });
      const note = /^\/api\/notes\/([^/]+)$/.exec(path);
      if (note) return state.pages.has(note[1]!) ? json({ note: state.pages.get(note[1]!) }) : missing();
      const track = /^\/api\/maps\/tracks\/([^/]+)$/.exec(path);
      if (track) {
        const found = state.tracks.get(track[1]!);
        return found
          ? json({
              track: { ...found, color: "teal", distanceMeters: 1200, bounds: null, geojson: { type: "FeatureCollection", features: [] } },
            })
          : missing();
      }
      const file = state.files.get(path);
      if (file) {
        return new Response(new Uint8Array(Math.min(file.bytes, 64)), {
          headers: {
            "Content-Type": file.type,
            "Content-Length": String(file.bytes),
            "Content-Security-Policy": "sandbox; default-src 'none'",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return missing();
    }),
  );
  return state;
}

let storage: FakeCacheStorage;
let restore: () => void;
let server: ReturnType<typeof fakeServer>;

beforeEach(() => {
  ({ storage, restore } = installFakeCaches());
  forgetKeptSnapshot();
  server = fakeServer();
});
afterEach(() => {
  restore();
  vi.unstubAllGlobals();
});

describe("what a page needs to be read away from the server", () => {
  it("finds the pictures and files it shows or links to, and nothing that is not Outpost's own", () => {
    const note = page("a", {
      coverUrl: "/api/attachments/cover",
      content: doc(
        { type: "image", attrs: { src: "/api/attachments/photo", alt: null, title: null } },
        { type: "image", attrs: { src: "https://example.org/remote.png", alt: null, title: null } },
        { type: "image", attrs: { src: "/api/attachments/photo", alt: null, title: null } },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "the map", marks: [{ type: "link", attrs: { href: "/api/attachments/gpx" } }] },
            { type: "text", text: "elsewhere", marks: [{ type: "link", attrs: { href: "/api/attachments/../settings" } }] },
          ],
        },
      ),
    });
    expect(attachmentsOf(note).sort()).toEqual(["/api/attachments/cover", "/api/attachments/gpx", "/api/attachments/photo"]);
  });
});

describe("keeping a page", () => {
  beforeEach(() => {
    server.pages.set(
      "plan",
      page("plan", {
        title: "Field plan",
        children: [{ id: "day1", title: "Page day1", icon: null }],
        coverUrl: "/api/attachments/cover",
        content: doc(text("Start early."), { type: "image", attrs: { src: "/api/attachments/photo", alt: null, title: null } }),
      }),
    );
    server.pages.set("day1", page("day1", { parentId: "plan", children: [{ id: "camp", title: "Page camp", icon: null }] }));
    server.pages.set("camp", page("camp", { parentId: "day1" }));
    server.pages.set("other", page("other"));
    server.files.set("/api/attachments/cover", { type: "image/jpeg", bytes: 40 });
    server.files.set("/api/attachments/photo", { type: "image/png", bytes: 60 });
  });

  it("keeps the page, every page inside it however deep, and their pictures, and nothing else", async () => {
    const item = await keepNote("plan");
    expect(item).toMatchObject({ kind: "note", id: "plan", title: "Field plan", files: 2, skipped: 0 });
    expect(item.pages.map((entry) => entry.id)).toEqual(["plan", "day1", "camp"]);
    expect(storage.paths("outpost-kept:note:plan")).toEqual([
      "/api/attachments/cover",
      "/api/attachments/photo",
      "/api/notes/camp",
      "/api/notes/day1",
      "/api/notes/plan",
    ]);
    expect(item.bytes).toBeGreaterThan(100);
    expect(await listKept()).toHaveLength(1);
    // Opening a page was not counted as a view on the server.
    expect(server.asked.every((path) => !path.includes("view"))).toBe(true);
  });

  it("files a kept upload with the sandbox the server put on it, so it can never run in the app's origin", async () => {
    await keepNote("plan");
    const copy = await (await caches.open("outpost-kept:note:plan")).match("/api/attachments/photo");
    expect(copy?.headers.get("Content-Type")).toBe("image/png");
    expect(copy?.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'");
    expect(copy?.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("finds a page inside a kept page, and says nothing is kept for a page that was left behind", async () => {
    await keepNote("plan");
    const found = await findKeptPage("camp");
    expect(found?.note.id).toBe("camp");
    expect(found?.item.id).toBe("plan");
    expect(await findKeptPage("other")).toBeUndefined();
  });

  it("leaves a file over the size limit on the server and says how many were left", async () => {
    server.files.set("/api/attachments/photo", { type: "video/mp4", bytes: 60 * 1024 * 1024 });
    const item = await keepNote("plan");
    expect(item).toMatchObject({ files: 1, skipped: 1 });
    expect(storage.paths("outpost-kept:note:plan")).not.toContain("/api/attachments/photo");
  });

  it("refuses a page in the trash, and one with more pages inside it than can be kept as one", async () => {
    server.pages.set("gone", page("gone", { trashedAt: 5 }));
    await expect(keepNote("gone")).rejects.toThrow(/in the trash/);
    await expect(keepNote("nowhere")).rejects.toThrow();

    const many = Array.from({ length: MAX_KEPT_PAGES + 1 }, (_unused, index) => `c${index}`);
    server.pages.set("big", page("big", { children: many.map((id) => ({ id, title: id, icon: null })) }));
    for (const id of many) server.pages.set(id, page(id, { parentId: "big" }));
    await expect(keepNote("big")).rejects.toThrow(/more than 300 pages inside it/);
    expect(await getKept("note", "big")).toBeUndefined();
  });

  it("removes every part of a kept page from the phone at once", async () => {
    await keepNote("plan");
    await removeKept("note", "plan");
    expect(await listKept()).toEqual([]);
    expect(await storage.keys()).not.toContain("outpost-kept:note:plan");
  });

  describe("when the server is back in reach", () => {
    it("asks for nothing but the list when nothing has changed", async () => {
      await keepNote("plan");
      server.asked.length = 0;
      expect(await refreshKept()).toBe(0);
      expect(server.asked).toEqual(["/api/notes/tree"]);
    });

    it("replaces a changed page with the server's version, fetching only that page", async () => {
      await keepNote("plan");
      server.pages.set("camp", page("camp", { parentId: "day1", updatedAt: 200, content: doc(text("Camp moved to the tarn.")) }));
      server.asked.length = 0;
      expect(await refreshKept()).toBe(1);
      expect(server.asked).toEqual(["/api/notes/tree", "/api/notes/camp"]);
      expect(JSON.stringify((await findKeptPage("camp"))?.note.content)).toContain("Camp moved to the tarn.");
      expect((await getKept("note", "plan"))?.pages.find((entry) => entry.id === "camp")?.updatedAt).toBe(200);
    });

    it("takes in a page added inside, and lets go of one moved away", async () => {
      await keepNote("plan");
      server.pages.set("day2", page("day2", { parentId: "plan" }));
      server.pages.set(
        "plan",
        page("plan", {
          title: "Field plan",
          children: [
            { id: "day1", title: "Page day1", icon: null },
            { id: "day2", title: "Page day2", icon: null },
          ],
        }),
      );
      server.pages.set("day1", page("day1", { parentId: "plan", children: [] }));
      server.pages.set("camp", page("camp", { parentId: null }));
      expect(await refreshKept()).toBe(1);
      const item = await getKept("note", "plan");
      expect(item?.pages.map((entry) => entry.id)).toEqual(["plan", "day1", "day2"]);
      // The pictures went with the text that held them, and the page that moved away went too.
      expect(storage.paths("outpost-kept:note:plan")).toEqual(["/api/notes/day1", "/api/notes/day2", "/api/notes/plan"]);
    });

    it("keeps the copy of a page that was deleted at home, and says it is gone", async () => {
      await keepNote("plan");
      server.pages.delete("plan");
      expect(await refreshKept()).toBe(1);
      expect((await getKept("note", "plan"))?.gone).toBe(true);
      expect((await findKeptPage("plan"))?.note.title).toBe("Field plan");
      // Asked again, it is not reported as a change a second time.
      expect(await refreshKept()).toBe(0);
    });

    it("never sends anything to the server", async () => {
      await keepNote("plan");
      server.pages.set("camp", page("camp", { parentId: "day1", updatedAt: 300 }));
      await refreshKept();
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.every(([, init]) => ((init as RequestInit | undefined)?.method ?? "GET") === "GET")).toBe(true);
    });
  });
});

describe("keeping a route and the saved places", () => {
  it("keeps a route with its line, and follows the server when it changes or goes", async () => {
    server.tracks.set("t1", { id: "t1", name: "Round", updatedAt: 10 });
    const item = await keepTrack("t1");
    expect(item).toMatchObject({ kind: "track", id: "t1", title: "Round", distanceMeters: 1200, updatedAt: 10 });
    expect(storage.paths("outpost-kept:track:t1")).toEqual(["/api/maps/tracks/t1"]);

    expect(await refreshKept()).toBe(0);
    server.tracks.set("t1", { id: "t1", name: "Round, the long way", updatedAt: 20 });
    expect(await refreshKept()).toBe(1);
    expect((await getKept("track", "t1"))?.title).toBe("Round, the long way");

    server.tracks.delete("t1");
    expect(await refreshKept()).toBe(1);
    expect(await getKept("track", "t1")).toMatchObject({ gone: true, title: "Round, the long way" });
  });

  it("keeps saved places as a set, and the set is the server's each time it is in reach", async () => {
    server.markers = [{ id: "m1", name: "Tarn" }];
    expect(await keepPlaces()).toMatchObject({ kind: "places", count: 1 });
    server.markers.push({ id: "m2", name: "Hut" });
    await refreshKept();
    expect((await getKept("places", "all"))?.count).toBe(2);
  });
});

describe("keeping the medical sheets", () => {
  it("keeps one copy per household, so that keeping another's does not replace the first", async () => {
    expect(await keepMedical()).toMatchObject({ kind: "medical", id: "household", householdName: "Home", count: 1 });
    server.medical.current = "caravan";
    expect(await keepMedical()).toMatchObject({ kind: "medical", id: "caravan", householdName: "Caravan", count: 2 });
    const kept = (await listKept()).filter((item) => item.kind === "medical");
    expect(kept.map((item) => item.title).sort()).toEqual(["Medical sheets for Caravan", "Medical sheets for Home"]);
  });

  it("brings each household's copy up to date from its own household, whichever is current", async () => {
    await keepMedical();
    server.medical.current = "caravan";
    await keepMedical();
    server.medical.households.household!.sheets = 3;
    await refreshKept();
    expect((await getKept("medical", "household"))?.count).toBe(3);
    expect((await getKept("medical", "caravan"))?.count).toBe(2);
    expect(server.asked).toContain("/api/medical-sheets?household=household");
  });

  it("keeps the copy of a household removed at home as it was", async () => {
    server.medical.current = "caravan";
    await keepMedical();
    delete server.medical.households.caravan;
    await refreshKept();
    expect((await getKept("medical", "caravan"))?.count).toBe(2);
  });
});

describe("a browser that cannot keep anything", () => {
  it("is one that is not on a secure origin: the list is empty and nothing is attempted", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    expect(keepingSupported()).toBe(false);
    expect(await listKept()).toEqual([]);
    expect(await getKept("note", "plan")).toBeUndefined();
  });
});

describe("the lettering a kept map area needs", () => {
  const field = (tag: number, bytes: Uint8Array) => new Uint8Array([tag, bytes.length, ...bytes]);
  const utf8 = (value: string) => new TextEncoder().encode(value);
  /** A vector tile with one layer whose values are the given strings, and a number among them. */
  const tile = (...values: string[]) =>
    field(
      0x1a,
      new Uint8Array([
        ...field(0x0a, utf8("places")),
        ...values.flatMap((value) => [...field(0x22, field(0x0a, utf8(value)))]),
        // A number value (double), a feature, an extent and a version: all stepped over.
        ...field(0x22, new Uint8Array([0x19, 0, 0, 0, 0, 0, 0, 0xf0, 0x3f])),
        ...field(0x12, new Uint8Array([0x08, 0x01])),
        0x28,
        0x80,
        0x20,
        0x78,
        0x02,
      ]),
    );

  it("is every range of 256 characters that a name in its tiles falls in", () => {
    const ranges = new Set<number>();
    collectGlyphRanges(tile("Keswick", "Łąka", "東京", "😀"), ranges);
    expect([...ranges].sort((a, b) => a - b)).toEqual([0, 1, 0x4e, 0x67, 0x1f6]);
  });

  it("counts nothing for a tile it cannot read, and does not throw", () => {
    const ranges = new Set<number>();
    collectGlyphRanges(new Uint8Array([0x1a, 0x7f, 1, 2, 3]), ranges);
    collectGlyphRanges(new TextEncoder().encode("not a tile at all"), ranges);
    collectGlyphRanges(new Uint8Array(), ranges);
    expect(ranges.size).toBe(0);
  });

  it("is asked for at the addresses the map itself uses", () => {
    expect(glyphPath("Noto Sans Regular", 0)).toBe("/map-assets/fonts/Noto%20Sans%20Regular/0-255.pbf");
    expect(glyphPath("Noto Sans Medium", 1)).toBe("/map-assets/fonts/Noto%20Sans%20Medium/256-511.pbf");
    expect(BASE_GLYPH_RANGES).toContain(0);
    expect(spritePaths({ light: "/map-assets/sprites/v4/light", dark: "/map-assets/sprites/v4/dark", white: "/x" })).toEqual([
      "/map-assets/sprites/v4/light.json",
      "/map-assets/sprites/v4/light.png",
      "/map-assets/sprites/v4/light@2x.json",
      "/map-assets/sprites/v4/light@2x.png",
      "/map-assets/sprites/v4/dark.json",
      "/map-assets/sprites/v4/dark.png",
      "/map-assets/sprites/v4/dark@2x.json",
      "/map-assets/sprites/v4/dark@2x.png",
    ]);
  });
});

describe("a kept map area", () => {
  const sources = {
    hasTiles: true,
    hasTerrain: true,
    sources: {
      basemap: { type: "vector", tiles: [], minzoom: 0, maxzoom: 15, bounds: [-180, -85, 180, 85], attribution: "" },
      terrain: {
        type: "raster-dem",
        tiles: [],
        minzoom: 0,
        maxzoom: 12,
        bounds: [-180, -85, 180, 85],
        tileSize: 512,
        encoding: "terrarium",
        attribution: "",
      },
    },
  } as never;

  it("is every tile of the box from the coarsest zoom to the one chosen, coarsest first, with terrain only when asked", () => {
    const bbox: [number, number, number, number] = [-3.4, 54.3, -2.8, 54.7];
    const map = areaPositions({ bbox, maxZoom: 9, terrainMaxZoom: null, sources });
    expect(map[0]).toEqual({ path: "/api/maps/tiles/0/0/0.mvt", vector: true });
    expect(map.every((position) => position.vector)).toBe(true);
    expect(map.at(-1)?.path).toMatch(/^\/api\/maps\/tiles\/9\//);
    expect(map).toHaveLength(15);

    const withTerrain = areaPositions({ bbox, maxZoom: 9, terrainMaxZoom: 9, sources });
    expect(withTerrain.filter((position) => !position.vector)).toHaveLength(15);
    expect(withTerrain.find((position) => !position.vector)?.path).toBe("/api/maps/terrain/0/0/0.webp");
  });

  it("is refused, in words, when there is no map to keep, when it is too large, and when the browser has no room", () => {
    const size = (bytes: number, tiles = 10) => ({
      bbox: [0, 0, 1, 1] as [number, number, number, number],
      map: { tiles, bytes, minZoom: 0, maxZoom: 9 },
      terrain: null,
      totalTiles: tiles,
      totalBytes: bytes,
    });
    expect(areaRefusal(size(1000), null)).toBeUndefined();
    expect(areaRefusal(size(1000), 50 * 1024 * 1024)).toBeUndefined();
    expect(areaRefusal({ ...size(0, 0), map: null }, null)).toMatch(/No detailed map is installed/);
    expect(areaRefusal(size(0, 0), null)).toMatch(/No detailed map is installed/);
    expect(areaRefusal(size(500 * 1024 * 1024), null)).toMatch(
      /^At this detail that is 524 MB, more than one kept area may hold\. Choose less detail, or zoom the map in so that less of it is in view\.$/,
    );
    // A whole region cannot be zoomed into: the other way is the part of it in view.
    expect(areaRefusal(size(500 * 1024 * 1024), null, "Ireland")).toMatch(
      /Choose less detail, or keep the part of Ireland in view instead\.$/,
    );
    expect(areaRefusal(size(30 * 1024 * 1024), 20 * 1024 * 1024)).toMatch(/does not have that much room/);
  });
});

describe("what to call the device", () => {
  it("is a phone, a tablet or a computer, by what the browser says it is", () => {
    expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", 5)).toBe(
      "phone",
    );
    expect(deviceOf("Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36", 5)).toBe("phone");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 16; Pixel Tablet) AppleWebKit/537.36 Chrome/142.0 Safari/537.36", 5)).toBe("tablet");
    // An iPad asks for the desktop site by default and says it is a Mac; only its touch screen gives it away.
    expect(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15", 5)).toBe("tablet");
    expect(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15", 0)).toBe(
      "computer",
    );
    expect(deviceOf("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", 0)).toBe("computer");
  });
});
