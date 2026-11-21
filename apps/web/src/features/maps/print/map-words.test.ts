/**
 * The words a printed map carries beside its picture: what they say, and that the
 * library's reader of PDFs finds them in the file although nothing of them is drawn.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { graticule } from "./graticule";
import { mapFileName, mapLibraryTitle, mapViewPath, mapWords, withMapWords } from "./map-words";
import { pageGeometry } from "./paper";
import { writePdf } from "./pdf";
import { boxAtScale } from "./scale";
import { layoutSheet } from "./sheet";

const geometry = pageGeometry("a4", "portrait");
const bbox = boxAtScale({ lat: 54.527, lon: -3.017 }, 25_000, geometry.mapPixels);
const input = {
  title: "Helvellyn from Glenridding",
  bbox,
  scale: 25_000,
  date: "16 November 2026",
  paper: "A4, portrait",
  names: ["Glenridding", "Patterdale", "Helvellyn", "glenridding", "Żabie Oko", "Red Tarn", "Boathouse"],
  places: ["Boathouse"],
  routes: ["Swirral Edge round"],
};

/** The 8 × 4 pixel JPEG of pdf.test.ts, made with macOS's `sips` from a flat colour. */
const JPEG = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAACKADAAQAAAABAAAABAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgABAAIAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMABAQEBAQEBgQEBgkGBgYJDAkJCQkMDwwMDAwMDxIPDw8PDw8SEhISEhISEhUVFRUVFRkZGRkZHBwcHBwcHBwcHP/bAEMBBAUFBwcHDAcHDB0UEBQdHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHf/dAAQAAf/aAAwDAQACEQMRAD8A+rKKKK6jyz//2Q==",
  ),
  (character) => character.charCodeAt(0),
);

describe("what a printed map says of itself", () => {
  it("says where it is, how large, at what scale and when, and lists the names on it", () => {
    const [first, places, routes, names] = mapWords(input);
    expect(first).toMatch(
      /^What this map shows: Helvellyn from Glenridding\. An area of [\d.]+ × [\d.]+ km centred on 54\.5270°N 3\.0170°W \(Maidenhead locator IO84LM, MGRS 30U \w\w \d{4} \d{4}\), from 54\.\d{4}°N 3\.\d{4}°W at its south-west corner to 54\.\d{4}°N 2\.\d{4}°W at its north-east\. Scale 1:25,000 on A4, portrait\. Drawn by Outpost on 16 November 2026 from the maps installed then\.$/,
    );
    expect(places).toBe("Your saved places on it: Boathouse.");
    expect(routes).toBe("Your routes on it: Swirral Edge round.");
    // Each name once, the person's own place not a second time, and a name the typeface cannot write counted, not mangled.
    expect(names).toBe(
      "Names written on it: Glenridding, Patterdale, Helvellyn, Red Tarn. 1 more is in a script this file's typeface cannot write.",
    );
  });

  it("says nothing about names where the map has none, and stops listing after a great many", () => {
    expect(mapWords({ ...input, names: [], places: [], routes: [] })).toHaveLength(1);
    const many = mapWords({ ...input, places: [], routes: [], names: Array.from({ length: 300 }, (_, index) => `Place ${index + 1}`) });
    expect(many[1]).toMatch(/Place 250, and 50 more\.$/);
  });

  it("names the document for the library by its title or its centre, with scale and day", () => {
    const made = new Date(2026, 10, 16, 14, 30);
    expect(mapLibraryTitle("Helvellyn from Glenridding", bbox, 25_000, made)).toBe(
      "Map, Helvellyn from Glenridding, 1:25,000, 16 Nov 2026",
    );
    expect(mapLibraryTitle("  ", bbox, 25_000, made)).toBe("Map, 54.5270°N 3.0170°W, 1:25,000, 16 Nov 2026");
    expect(mapViewPath(bbox, 13.2)).toBe("/maps?lat=54.5270&lon=-3.0170&z=12.2");
  });

  it("names the saved file for what it is, not map.pdf", () => {
    const made = new Date(2026, 10, 16, 14, 30);
    expect(mapFileName("", bbox, 25_000, made)).toBe("map-54-5270-n-3-0170-w-1-25-000-16-nov-2026.pdf");
    expect(mapFileName("Helvellyn from Glenridding", bbox, 25_000, made)).toBe("map-helvellyn-from-glenridding-1-25-000-16-nov-2026.pdf");
  });

  it("is in the file as text over the map, drawn in no ink, and a reader of the PDF finds it", async () => {
    const sheet = layoutSheet({
      geometry,
      bbox,
      scale: 25_000,
      title: input.title,
      date: input.date,
      credits: "© OpenStreetMap",
      graticule: graticule(bbox, geometry.map, "decimal"),
      pictures: [{ id: "map", x: 0, y: 0, ...geometry.mapPixels }],
    });
    const worded = withMapWords(sheet, geometry.map, mapWords(input));
    const hidden = worded.items.filter((item) => item.kind === "text" && item.hidden);
    expect(hidden.length).toBeGreaterThan(3);
    // Every hidden line lies inside the map's own rectangle.
    for (const item of hidden) {
      if (item.kind !== "text") continue;
      expect(item.x).toBeGreaterThan(geometry.map.x);
      expect(item.y).toBeGreaterThan(geometry.map.y);
      expect(item.y).toBeLessThan(geometry.map.y + geometry.map.height);
    }
    // The visible page is unchanged: the same items, in the same order, come first.
    expect(worded.items.slice(0, sheet.items.length)).toEqual(sheet.items);

    const file = writePdf({
      sheet: worded,
      pictures: new Map([["map", { jpeg: JPEG, width: 8, height: 4 }]]),
      title: input.title,
      created: new Date(2026, 10, 16),
    });
    const source = Array.from(file, (byte) => String.fromCharCode(byte)).join("");
    // Rendering mode 3 (no ink) is set for these lines and put back after each.
    expect(source.match(/ 3 Tr \(/g)).toHaveLength(hidden.length);
    expect(source.match(/Tj 0 Tr ET/g)).toHaveLength(hidden.length);

    const reading = getDocument({ data: file.slice(), useSystemFonts: false, disableFontFace: true });
    const page = await (await reading.promise).getPage(1);
    const items = (await page.getTextContent()).items as Array<{ str: string; hasEOL: boolean }>;
    // Joined as the library's own reader joins a page (extract-pdf.ts).
    const text = items
      .map((item) => item.str + (item.hasEOL ? "\n" : ""))
      .join("")
      .replace(/\s+/g, " ");
    await reading.destroy();
    expect(text).toContain("What this map shows: Helvellyn from Glenridding.");
    expect(text).toContain("Maidenhead locator IO84LM");
    expect(text).toContain("Names written on it: Glenridding, Patterdale, Helvellyn, Red Tarn.");
    expect(text).toContain("Your saved places on it: Boathouse.");
    // And what was on the page before is still read: the scale and the credits.
    expect(text).toContain("1:25,000");
    expect(text).toContain("© OpenStreetMap");
  });
});
