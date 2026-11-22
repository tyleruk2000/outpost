/** The QR sheet laid out with the print kit: the code at its printed size, read back by an independent decoder. */
import jsQR from "jsqr";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { kitCanSetAll } from "@/features/contacts/kit-letters";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { describe as describeContent } from "./content";
import { encodeQr } from "./encoder";
import { codeDrawing, qrDocument, qrTexts } from "./kit-sheet";
import { PRINTED_WIDTH_MM } from "./sheet";

const MADE = new Date(Date.UTC(2026, 10, 16));
const FOOTER = "Made in Outpost on 16 Nov 2026.";
const wifi = { kind: "wifi" as const, wifi: { ssid: "Hut", security: "WPA" as const, password: "s3cret", hidden: false } };

/** The drawing's rectangles painted into pixels, `scale` to a point, and read by jsQR. */
function decodeDrawing(svg: string, size: number, scale: number): string | null {
  const width = Math.ceil(size * scale);
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const match of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="#000000"\/>/g)) {
    const [x, y, w, h] = match.slice(1).map(Number) as [number, number, number, number];
    for (let row = Math.round(y * scale); row < Math.round((y + h) * scale); row += 1)
      for (let column = Math.round(x * scale); column < Math.round((x + w) * scale); column += 1) {
        const at = (row * width + column) * 4;
        data[at] = 0;
        data[at + 1] = 0;
        data[at + 2] = 0;
      }
  }
  const read = jsQR(data, width, width, { inversionAttempts: "dontInvert" });
  return read ? new TextDecoder().decode(new Uint8Array(read.binaryData)) : null;
}

describe("the QR sheet with the print kit", () => {
  it("draws the code exactly 8 cm across, with its quiet zone, and it reads back as what it holds", () => {
    for (const payload of ["Water point 3, by the gate", "https://example.org/a/rather/long/address?with=some&more=words".repeat(4)]) {
      const code = encodeQr(payload);
      const picture = codeDrawing(code);
      expect((picture.module * code.size) / (72 / 25.4)).toBeCloseTo(PRINTED_WIDTH_MM, 6);
      // Nothing dark in the quiet zone: the first module starts four modules in.
      const xs = [...picture.svg.matchAll(/<rect x="([\d.]+)"[^>]*fill="#000000"/g)].map((match) => Number(match[1]));
      expect(Math.min(...xs)).toBeCloseTo(picture.codeLeft, 1);
      expect(picture.codeLeft - 4 * picture.module).toBeGreaterThan(0);
      expect(decodeDrawing(picture.svg, picture.width, 8 / picture.module)).toBe(payload);
    }
  });

  it("places the drawing at its own size, and writes the password only when asked", () => {
    const code = encodeQr(describeContent(wifi, { showPassword: false }).payload);
    const hidden = qrDocument(code, describeContent(wifi, { showPassword: false }), "a4", FOOTER, MADE);
    const node = (hidden.content as Array<{ section: Array<{ svg?: string; width?: number }> }>)[0]!.section.find((part) => part.svg)!;
    expect(node.width).toBe(codeDrawing(code).width);
    expect(node.svg).toMatch(new RegExp(`^<svg [^>]*width="${node.width}"`));
    expect(contentText(hidden.content)).not.toContain("s3cret");
    expect(contentText(hidden.content)).toContain("Point the phone’s camera at the code.");
    const told = qrDocument(code, describeContent(wifi, { showPassword: true }), "a4", FOOTER, MADE);
    expect(contentText(told.content)).toContain("s3cret");
    expect(kitCanSetAll(qrTexts(describeContent(wifi, { showPassword: true }), FOOTER))).toBe(true);
    const greek = { kind: "wifi" as const, wifi: { ...wifi.wifi, ssid: "Καλύβα" } };
    expect(kitCanSetAll(qrTexts(describeContent(greek, { showPassword: false }), FOOTER))).toBe(false);
  });

  it("makes one page whose words a reader finds, the same file each time", async () => {
    const described = describeContent(wifi, { showPassword: true });
    const code = encodeQr(described.payload);
    for (const paper of ["a4", "letter"] as const) {
      const made = await renderPdf(qrDocument(code, described, paper, FOOTER, MADE));
      writeSample(`qr-sheet-${paper}-after`, made.bytes);
      const loading = getDocument({ data: made.bytes.slice() });
      const pdf = await loading.promise;
      expect(pdf.numPages).toBe(1);
      const text = ((await (await pdf.getPage(1)).getTextContent()).items as Array<{ str: string }>).map((item) => item.str).join(" ");
      await loading.destroy();
      expect(text).toContain(described.heading);
      expect(text).toContain("s3cret");
      expect((await renderPdf(qrDocument(code, described, paper, FOOTER, MADE))).bytes).toEqual(made.bytes);
    }
  }, 30_000);
});
