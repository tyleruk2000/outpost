import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { graticule } from "./graticule";
import { encodeWinAnsi, fitText, textWidth, wrapText } from "./helvetica";
import { pageGeometry } from "./paper";
import { pdfFileName, writePdf } from "./pdf";
import { boxAtScale } from "./scale";
import { layoutSheet, sheetBottom, sheetWords } from "./sheet";

/** An 8 × 4 pixel JPEG, made with macOS's `sips` from a flat colour. */
const JPEG = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAACKADAAQAAAABAAAABAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgABAAIAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMABAQEBAQEBgQEBgkGBgYJDAkJCQkMDwwMDAwMDxIPDw8PDw8SEhISEhISEhUVFRUVFRkZGRkZHBwcHBwcHBwcHP/bAEMBBAUFBwcHDAcHDB0UEBQdHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHf/dAAQAAf/aAAwDAQACEQMRAD8A+rKKKK6jyz//2Q==",
  ),
  (character) => character.charCodeAt(0),
);

const CREDITS =
  "Protomaps © OpenStreetMap, openstreetmap.org/copyright · © Mapterhorn, mapterhorn.com/attribution · Outlines: Natural Earth, naturalearthdata.com";

function sheet(
  paper: "a4" | "a3" | "letter" = "a4",
  orientation: "portrait" | "landscape" = "portrait",
  title = "Helvellyn from Glenridding",
) {
  const geometry = pageGeometry(paper, orientation);
  const bbox = boxAtScale({ lat: 54.5, lon: -3.1 }, 25_000, geometry.mapPixels);
  return {
    geometry,
    sheet: layoutSheet({
      geometry,
      bbox,
      scale: 25_000,
      title,
      date: "16 November 2026",
      credits: CREDITS,
      graticule: graticule(bbox, geometry.map, "dms"),
      pictures: [{ id: "map", x: 0, y: 0, ...geometry.mapPixels }],
    }),
  };
}

const latin1 = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

describe("the page's typeface", () => {
  it("measures text with Helvetica's published widths", () => {
    // From Helvetica.afm: space 278, H 722, e 556, l 222, o 556. "Hello" is 722 + 556 + 222 + 222 + 556 = 2,278 thousandths.
    expect(textWidth("Hello", 10)).toBeCloseTo(22.78, 9);
    expect(textWidth(" ", 1000)).toBe(278);
    // Helvetica-Bold.afm: H 722, e 556, l 278, o 611.
    expect(textWidth("Hello", 10, true)).toBeCloseTo(24.45, 9);
    // The copyright sign is 737 in both.
    expect(textWidth("©", 1000)).toBe(737);
  });

  it("writes what the encoding has and refuses what it lacks", () => {
    expect(Array.from(encodeWinAnsi("A©°é")!)).toEqual([0x41, 0xa9, 0xb0, 0xe9]);
    // Outside Latin-1 but in the Windows code page: the euro, the ellipsis, the en dash.
    expect(Array.from(encodeWinAnsi("€…–")!)).toEqual([0x80, 0x85, 0x96]);
    expect(encodeWinAnsi("Ωmega")).toBeNull();
    expect(encodeWinAnsi("Żabie Oko")).toBeNull();
  });

  it("breaks and shortens lines by width", () => {
    const lines = wrapText("one two three four five six", 10, textWidth("one two three", 10) + 0.01);
    expect(lines).toEqual(["one two three", "four five six"]);
    expect(fitText("A long title for a small space", 12, 60, true)).toMatch(/…$/);
    expect(textWidth(fitText("A long title for a small space", 12, 60, true), 12, true)).toBeLessThanOrEqual(60);
    expect(fitText("Short", 12, 600)).toBe("Short");
  });
});

describe("the sheet", () => {
  it("states the scale, how it varies, how to check a print, north, and every credit", () => {
    const words = sheetWords(sheet().sheet).join("\n");
    expect(words).toContain("Helvellyn from Glenridding");
    expect(words).toContain("16 November 2026");
    expect(words).toContain("1:25,000");
    expect(words).toMatch(/Web Mercator projection\. Scale 1:25,000 along the middle of the sheet \(54\.50°N\)\./);
    expect(words).toMatch(/1:24,983 along the top edge and 1:25,017 along the bottom, 0\.07% at most\./);
    expect(words).toMatch(/Printed at 100% \("actual size"\), the 1 km bar is 40 mm long\./);
    expect(words).toMatch(/True north is straight up everywhere on the sheet; magnetic north is not shown\./);
    const flowed = words.replace(/\n/g, " ");
    for (const credit of ["© OpenStreetMap, openstreetmap.org/copyright", "© Mapterhorn, mapterhorn.com/attribution", "Natural Earth"]) {
      expect(flowed).toContain(credit);
    }
    expect(words).toContain("1 km");
    expect(words).toContain("0.5 mi");
    expect(words).toContain("54°30'N");
  });

  it("keeps everything on the paper and out of the map, on every paper both ways up", () => {
    for (const paper of ["a4", "a3", "letter"] as const) {
      for (const orientation of ["portrait", "landscape"] as const) {
        const { sheet: page, geometry } = sheet(
          paper,
          orientation,
          "A title long enough that it has to be cut short before it reaches the scale",
        );
        const safe = 12;
        expect(sheetBottom(page), `${paper} ${orientation}`).toBeLessThanOrEqual(geometry.height - safe);
        const mapBottom = geometry.map.y + geometry.map.height;
        for (const item of page.items) {
          if (item.kind !== "text") continue;
          const width = textWidth(item.text, item.size, item.bold);
          const left = item.upward
            ? item.x - item.size
            : item.anchor === "end"
              ? item.x - width
              : item.anchor === "middle"
                ? item.x - width / 2
                : item.x;
          const right = item.upward ? item.x : left + width;
          expect(left, item.text).toBeGreaterThanOrEqual(safe);
          expect(right, item.text).toBeLessThanOrEqual(geometry.width - safe);
          // No lettering lies over the map: it is above it, beside it or below it.
          const beside = right <= geometry.map.x || left >= geometry.map.x + geometry.map.width;
          const above = item.y <= geometry.map.y;
          const below = item.y - item.size * 0.75 >= mapBottom;
          expect(beside || above || below, item.text).toBe(true);
        }
      }
    }
  });

  it("puts the date where the title would be when there is no title", () => {
    const words = sheetWords(sheet("a4", "portrait", "  ").sheet);
    expect(words).toContain("16 November 2026");
    expect(words.filter((word) => word === "16 November 2026")).toHaveLength(1);
  });
});

describe("the PDF", () => {
  const { sheet: page, geometry } = sheet();
  const file = writePdf({
    sheet: page,
    pictures: new Map([["map", { jpeg: JPEG, width: 8, height: 4 }]]),
    title: "Helvellyn from Glenridding",
    created: new Date(2026, 10, 16, 14, 22, 33),
  });
  const text = latin1(file);

  it("is a well-formed file: every entry of its table points at its object", () => {
    expect(text.startsWith("%PDF-1.6\n")).toBe(true);
    expect(text.endsWith("%%EOF\n")).toBe(true);
    const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const entries = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    expect(entries).toHaveLength(8);
    for (const [index, offset] of entries.entries())
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    // Each stream is as long as it says.
    for (const match of text.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const from = match.index + match[0].length;
      expect(text.slice(from + Number(match[1]), from + Number(match[1]) + 10)).toBe("\nendstream");
    }
  });

  it("is one A4 page that asks to be printed at its true size", () => {
    expect(text).toContain("/Type /Pages /Kids [3 0 R] /Count 1");
    expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(text).toContain("/ViewerPreferences << /PrintScaling /None >>");
  });

  it("holds the picture as it was given, placed at the size of the map in points", () => {
    expect(text).toContain("/Subtype /Image /Width 8 /Height 4 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode");
    const at = text.indexOf("/DCTDecode");
    const from = text.indexOf("stream\n", at) + 7;
    expect(Array.from(file.subarray(from, from + JPEG.length))).toEqual(Array.from(JPEG));
    // 896 × 1,188 map pixels at 0.6 points each, with its bottom-left corner measured up from the foot of the page.
    const bottom = geometry.height - geometry.map.y - geometry.map.height;
    expect(text).toContain(`q 537.6 0 0 712.8 ${Number(geometry.map.x.toFixed(3))} ${Number(bottom.toFixed(3))} cm /Im1 Do Q`);
  });

  it("is read by another PDF reader, which finds one page of that size and the words as text", async () => {
    // pdf.js (Apache-2.0), the reader the document library uses. It has its own copy of the standard fonts' data.
    const reading = getDocument({
      data: file.slice(),
      useSystemFonts: false,
      disableFontFace: true,
      standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
    });
    const document = await reading.promise;
    expect(document.numPages).toBe(1);
    const first = await document.getPage(1);
    const view = first.getViewport({ scale: 1 });
    expect(view.width).toBeCloseTo(595.28, 2);
    expect(view.height).toBeCloseTo(841.89, 2);
    const items = (await first.getTextContent()).items as Array<{ str: string }>;
    const words = items.map((item) => item.str).join(" ");
    expect(words).toContain("Helvellyn from Glenridding");
    expect(words).toContain("1:25,000");
    expect(words).toContain("© OpenStreetMap, openstreetmap.org/copyright");
    expect(words).toContain("© Mapterhorn, mapterhorn.com/attribution");
    expect(words).toContain("54°30'N");
    const info = (await document.getMetadata()).info as { Title?: string; Creator?: string };
    expect(info.Title).toBe("Helvellyn from Glenridding");
    expect(info.Creator).toBe("Outpost");
    await reading.destroy();
  });

  it("writes a title in another script into the file's record, and never an unescaped bracket into the page", () => {
    const other = sheet("a4", "portrait", "Peak (north) \\ ridge");
    const made = latin1(
      writePdf({
        sheet: other.sheet,
        pictures: new Map([["map", { jpeg: JPEG, width: 8, height: 4 }]]),
        title: "Żabie Oko",
        created: new Date(0),
      }),
    );
    expect(made).toContain("(Peak \\(north\\) \\\\ ridge) Tj");
    // "Ż" is U+017B.
    expect(made).toContain("/Title <FEFF017B");
  });

  it("refuses a page that refers to a picture it was not given", () => {
    expect(() => writePdf({ sheet: page, pictures: new Map(), title: "", created: new Date(0) })).toThrow(/picture that was not supplied/);
  });

  it("names the file after the title", () => {
    expect(pdfFileName("Helvellyn from Glenridding")).toBe("helvellyn-from-glenridding.pdf");
    expect(pdfFileName("  Żabie Oko / Morskie Oko!  ")).toBe("zabie-oko-morskie-oko.pdf");
    expect(pdfFileName("../../etc/passwd")).toBe("etc-passwd.pdf");
    expect(pdfFileName("")).toBe("map.pdf");
    expect(pdfFileName("???")).toBe("map.pdf");
    expect(pdfFileName("x".repeat(200))).toHaveLength(84);
  });
});
