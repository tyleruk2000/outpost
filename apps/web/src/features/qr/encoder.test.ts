/**
 * The encoder against published examples, and every symbol it makes read back by an
 * independent decoder (jsQR, a development dependency only, Apache-2.0).
 *
 * Sources of the fixed values:
 *  - ISO/IEC 18004:2015 Annex I ("Symbol encoding example"): "01234567" as version 1-M.
 *  - Thonky's QR code tutorial (thonky.com/qr-code-tutorial, read 16 November 2026):
 *    "HELLO WORLD" as version 1-M, its data and error-correction codewords; the format
 *    information strings (format-version-tables); the version 7 information string.
 *  - Table 7 of the standard, data capacity: 2953 bytes at 40-L, 1273 at 40-H, 7089
 *    digits and 4296 alphanumeric characters at 40-L, 17 bytes at 1-L, 7 at 1-H.
 */
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import {
  alignmentPositions,
  byteCapacity,
  dataCodewordsFor,
  EC_LEVELS,
  type EcLevel,
  encodeQr,
  formatBits,
  makeSegment,
  penalty,
  type QrCode,
  QrTooLongError,
  reedSolomon,
  segmentsFor,
  versionBits,
} from "./encoder";

/** The symbol as RGBA pixels, with the four-module quiet zone, for the decoder. */
function pixels(code: QrCode, scale = 4) {
  const quiet = 4;
  const width = (code.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let r = 0; r < code.size; r += 1)
    for (let c = 0; c < code.size; c += 1) {
      if (!code.modules[r]![c]) continue;
      for (let y = 0; y < scale; y += 1)
        for (let x = 0; x < scale; x += 1) {
          const at = (((r + quiet) * scale + y) * width + (c + quiet) * scale + x) * 4;
          data[at] = 0;
          data[at + 1] = 0;
          data[at + 2] = 0;
        }
    }
  return { data, width };
}

function decode(code: QrCode): { text: string; version: number } | null {
  const { data, width } = pixels(code, code.size > 120 ? 3 : 4);
  const result = jsQR(data, width, width, { inversionAttempts: "dontInvert" });
  if (!result) return null;
  return { text: new TextDecoder().decode(new Uint8Array(result.binaryData)), version: result.version };
}

describe("published examples", () => {
  it("writes ISO 18004 Annex I's 01234567 at 1-M with the standard's codewords", () => {
    const segments = [makeSegment("numeric", "01234567")];
    const data = dataCodewordsFor(segments, 1, "M");
    expect(data).toEqual([16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17]);
    expect(reedSolomon(data, 10)).toEqual([165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
  });

  it("writes HELLO WORLD at 1-M as Thonky's tutorial gives it", () => {
    const segments = segmentsFor("HELLO WORLD", 1);
    expect(segments.map((segment) => segment.mode)).toEqual(["alphanumeric"]);
    const data = dataCodewordsFor(segments, 1, "M");
    expect(data).toEqual([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
    expect(reedSolomon(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("has the format information strings of the standard's table", () => {
    const bits = (level: EcLevel, mask: number) => formatBits(level, mask).toString(2).padStart(15, "0");
    expect(bits("L", 0)).toBe("111011111000100");
    expect(bits("M", 0)).toBe("101010000010010");
    expect(bits("Q", 0)).toBe("011010101011111");
    expect(bits("H", 0)).toBe("001011010001001");
    expect(bits("M", 5)).toBe("100000011001110");
  });

  it("has the version information of version 7 and 40", () => {
    expect(versionBits(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
    expect(versionBits(40).toString(2).padStart(18, "0")).toBe("101000110001101001");
  });

  it("places alignment patterns where Annex E's table has them", () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(alignmentPositions(36)).toEqual([6, 24, 50, 76, 102, 128, 154]);
    expect(alignmentPositions(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
  });

  it("holds what Table 7 says each size holds, and no more", () => {
    expect(byteCapacity("L")).toBe(2953);
    expect(byteCapacity("H")).toBe(1273);
    expect(byteCapacity("L", 1)).toBe(17);
    expect(byteCapacity("H", 1)).toBe(7);
    expect(encodeQr("7".repeat(7089), { ecLevel: "L" }).version).toBe(40);
    expect(() => encodeQr("7".repeat(7090), { ecLevel: "L" })).toThrow(QrTooLongError);
    expect(encodeQr("A".repeat(4296), { ecLevel: "L" }).version).toBe(40);
    expect(() => encodeQr("A".repeat(4297), { ecLevel: "L" })).toThrow(QrTooLongError);
    expect(encodeQr("a".repeat(2953), { ecLevel: "L" }).version).toBe(40);
    expect(() => encodeQr("a".repeat(2954), { ecLevel: "L" })).toThrow(QrTooLongError);
    expect(encodeQr("a".repeat(17), { ecLevel: "L" }).version).toBe(1);
    expect(encodeQr("a".repeat(18), { ecLevel: "L" }).version).toBe(2);
  });
});

describe("what it makes reads back", () => {
  it("decodes at every level, across versions 1 to 40", () => {
    for (const level of EC_LEVELS) {
      for (const version of [1, 2, 6, 7, 10, 14, 21, 27, 33, 40]) {
        const text = `Outpost ${level}${version} `.repeat(200);
        const code = encodeQr(text.slice(0, Math.min(text.length, byteCapacity(level, version))), {
          ecLevel: level,
          minVersion: version,
          maxVersion: version,
          segments: [makeSegment("byte", text.slice(0, byteCapacity(level, version)))],
        });
        expect(code.version).toBe(version);
        const read = decode(code);
        expect(read, `${version}-${level}`).not.toBeNull();
        expect(read!.version).toBe(version);
        expect(read!.text).toBe(text.slice(0, byteCapacity(level, version)));
      }
    }
  }, 60_000);

  it("decodes each of the eight masks", () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const code = encodeQr("https://example.org/a/path?with=query", { mask, ecLevel: "Q" });
      expect(code.mask).toBe(mask);
      expect(decode(code)?.text).toBe("https://example.org/a/path?with=query");
    }
  });

  it("decodes text in other scripts as UTF-8", () => {
    for (const text of [
      "Καλημέρα κόσμε",
      "日本語のテキスト、QRコード",
      "مرحبا بالعالم",
      "Здравствуй, мир",
      "हिन्दी पाठ",
      "Tent 🏕️ by the lake 🌊",
      "Café, naïve, Ångström",
    ]) {
      for (const level of EC_LEVELS) expect(decode(encodeQr(text, { ecLevel: level }))?.text).toBe(text);
    }
  });

  it("decodes mixed text written in several modes", () => {
    const text = "Grid ref NY 12345 67890, call 01768 772645 or 999";
    const code = encodeQr(text, { ecLevel: "M" });
    expect(decode(code)?.text).toBe(text);
    const numeric = encodeQr("123456789012345678901234567890HELLO", { ecLevel: "L" });
    expect(numeric.segments.map((segment) => segment.mode)).toEqual(["numeric", "alphanumeric"]);
    expect(decode(numeric)?.text).toBe("123456789012345678901234567890HELLO");
  });

  it("decodes a Wi-Fi code and a vCard", () => {
    const wifi = "WIFI:T:WPA;S:Hut\\;Wi-Fi;P:pa\\:ss\\\\word;H:true;;";
    expect(decode(encodeQr(wifi))?.text).toBe(wifi);
    const card = "BEGIN:VCARD\r\nVERSION:3.0\r\nN:Okafor;Maya;;;\r\nFN:Maya Okafor\r\nTEL;TYPE=CELL:+44 7700 900123\r\nEND:VCARD";
    expect(decode(encodeQr(card))?.text).toBe(card);
  });
});

describe("choices", () => {
  it("chooses the smallest version and the mask with the lowest penalty", () => {
    const code = encodeQr("HELLO WORLD", { ecLevel: "Q" });
    expect(code.version).toBe(1);
    const scores = [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => penalty(encodeQr("HELLO WORLD", { ecLevel: "Q", mask }).modules));
    expect(penalty(code.modules)).toBe(Math.min(...scores));
  });

  it("writes digits as numeric, capitals as alphanumeric and the rest as bytes", () => {
    expect(segmentsFor("0123456789", 1).map((segment) => segment.mode)).toEqual(["numeric"]);
    expect(segmentsFor("HTTPS://EXAMPLE.ORG", 1).map((segment) => segment.mode)).toEqual(["alphanumeric"]);
    expect(segmentsFor("hello", 1).map((segment) => segment.mode)).toEqual(["byte"]);
  });

  it("scores penalties by the four rules", () => {
    // A light 5×5 square: rule 1 gives 3 for each of 5 rows and 5 columns, rule 2 gives 3 × 16 blocks, rule 4 gives 100.
    const light = Array.from({ length: 5 }, () => new Array<boolean>(5).fill(false));
    expect(penalty(light)).toBe(30 + 48 + 100);
  });
});
