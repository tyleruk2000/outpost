/**
 * The barcode reader against pictures made in the test (test-images.ts): clean, then
 * blurred, turned, upside down, unevenly lit, half in shadow, speckled and small. The
 * limits found here are the ones docs/supplies.md states.
 */
import { describe, expect, it } from "vitest";
import { CODE128, code128Text, decodeBarcode, decodeBarcodes, toLuma } from "./decode";
import { blur, code128Modules, ean8Modules, ean13Modules, noise, render, rotate, shade, shadow, shrink } from "./test-images";

const EAN = "5012345678900";
const UPC = "0036000291452";
const read = (image: Parameters<typeof decodeBarcode>[0]) => decodeBarcode(image)?.text ?? null;

describe("the tables", () => {
  it("has 107 Code 128 symbols of 11 modules (the stop 13), every one different, with an even number of bar modules", () => {
    expect(CODE128).toHaveLength(107);
    CODE128.forEach((widths, value) => {
      expect(widths.reduce((a, b) => a + b, 0), `symbol ${value}`).toBe(value === 106 ? 13 : 11);
      // ISO/IEC 15417: the bars of every symbol add up to an even number of modules.
      const bars = widths.filter((_, index) => index % 2 === 0).reduce((a, b) => a + b, 0);
      expect(bars % 2, `symbol ${value}`).toBe(0);
    });
    expect(new Set(CODE128.map((widths) => widths.join(""))).size).toBe(107);
  });

  it("reads Code 128's code sets", () => {
    // Start C, 12, 34, then Code B, "A": 33.
    expect(code128Text([105, 12, 34, 100, 33])).toBe("1234A");
    expect(code128Text([104, 33, 34, 99, 56])).toBe("AB56");
  });
});

describe("a clean picture", () => {
  it("reads an EAN-13", () => {
    expect(decodeBarcode(render(ean13Modules(EAN), 3))).toMatchObject({ format: "ean_13", text: EAN });
  });
  it("reads a UPC-A as its twelve digits", () => {
    expect(decodeBarcode(render(ean13Modules(UPC), 3))).toMatchObject({ format: "upc_a", text: "036000291452" });
  });
  it("reads an EAN-8", () => {
    expect(decodeBarcode(render(ean8Modules("96385074"), 3))).toMatchObject({ format: "ean_8", text: "96385074" });
  });
  it("reads a Code 128", () => {
    expect(decodeBarcode(render(code128Modules("OUTPOST-42"), 3))).toMatchObject({ format: "code_128", text: "OUTPOST-42" });
  });
  it("finds nothing in a blank picture or in noise", () => {
    expect(decodeBarcodes({ data: new Uint8Array(400 * 300).fill(200), width: 400, height: 300 })).toEqual([]);
    expect(decodeBarcodes(noise({ data: new Uint8Array(400 * 300).fill(128), width: 400, height: 300 }, 120))).toEqual([]);
  });
  it("reads from RGBA as a canvas gives it", () => {
    const grey = render(ean13Modules(EAN), 3);
    const rgba = new Uint8ClampedArray(grey.width * grey.height * 4);
    grey.data.forEach((value, index) => rgba.set([value, value, value, 255], index * 4));
    expect(read(toLuma(rgba, grey.width, grey.height))).toBe(EAN);
  });
});

describe("a spoiled picture", () => {
  it("reads one upside down", () => {
    expect(read(rotate(render(ean13Modules(EAN), 3), 180))).toBe(EAN);
  });

  it.each([5, 10, 20, 30, 45, 60, 80, 90, 135, -25])("reads one turned %i degrees", (degrees) => {
    expect(read(rotate(render(ean13Modules(EAN), 3), degrees))).toBe(EAN);
  });

  // A box blur of radius r run three times is close to a Gaussian of sigma = sqrt(r(r+1)), in pixels.
  it.each([
    [4, 1, "0.35"],
    [6, 2, "0.41"],
    [8, 3, "0.43"],
  ])("reads one blurred at %i pixels a module (radius %i: sigma %s of a module)", (module, radius) => {
    expect(read(blur(render(ean13Modules(EAN), module), radius))).toBe(EAN);
  });

  it("reads one in light that falls to a third across it", () => {
    expect(read(shade(render(ean13Modules(EAN), 3), 1, 0.33))).toBe(EAN);
  });

  it("reads one half in shadow", () => {
    expect(read(shadow(render(ean13Modules(EAN), 3), 0.5, 0.35))).toBe(EAN);
  });

  it("reads one speckled", () => {
    expect(read(noise(render(ean13Modules(EAN), 3), 40))).toBe(EAN);
  });

  it("reads one at 1.5 pixels a module, as a frame made smaller sees it", () => {
    expect(read(shrink(render(ean13Modules(EAN), 3), 2))).toBe(EAN);
  });

  it("reads one turned, blurred, half in shadow and speckled at once", () => {
    const picture = noise(shadow(blur(rotate(render(ean13Modules(UPC), 4), 17), 1), 0.55, 0.45), 20);
    expect(read(picture)).toBe("036000291452");
  });

  it("reads a Code 128 turned and blurred", () => {
    expect(read(blur(rotate(render(code128Modules("AB-1234"), 3), 12), 1))).toBe("AB-1234");
  });
});

describe("the limits", () => {
  // Found by trying; docs/supplies.md states them. These say where it stops, so a change that moves them is seen.
  it("does not read one blurred to sigma 0.47 of a module or more", () => {
    expect(read(blur(render(ean13Modules(EAN), 3), 1))).toBeNull();
    expect(read(blur(render(ean13Modules(EAN), 4), 2))).toBeNull();
  });
  it("does not read one at a pixel a module", () => {
    expect(read(shrink(render(ean13Modules(EAN), 3), 3))).toBeNull();
  });
  it("never gives a wrong number for a spoiled picture: it reads the right one or none", () => {
    const seen = new Set<string>();
    for (const radius of [1, 2, 3])
      for (const degrees of [0, 7, 22, 41])
        for (const module of [3, 4, 6]) {
          const result = decodeBarcode(blur(rotate(render(ean13Modules(EAN), module), degrees), radius));
          if (result) seen.add(result.text);
        }
    expect([...seen]).toEqual([EAN]);
  });
});
