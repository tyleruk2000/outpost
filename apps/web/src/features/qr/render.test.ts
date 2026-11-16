/** The code as a picture and as a page: the same squares everywhere, with the margin the standard asks for. */
import { describe, expect, it } from "vitest";
import { describe as describeContent } from "./content";
import { encodeQr } from "./encoder";
import { codeFileName, darkRuns, extentOf, svgFile } from "./render";
import { qrSheet } from "./sheet";

describe("pictures of a code", () => {
  const code = encodeQr("HELLO WORLD", { ecLevel: "Q" });

  it("joins dark modules into runs that cover exactly the dark modules", () => {
    const dark = code.modules.flat().filter(Boolean).length;
    expect(darkRuns(code).reduce((sum, run) => sum + run.length, 0)).toBe(dark);
  });

  it("writes an SVG with a four-module margin, black on white", () => {
    const svg = svgFile(code, "A <code> & more");
    expect(extentOf(code)).toBe(29);
    expect(svg).toContain('viewBox="0 0 29 29"');
    expect(svg).toContain("<title>A &lt;code&gt; &amp; more</title>");
    expect(svg).toContain('fill="#fff"');
  });

  it("names files from the title, in any script", () => {
    expect(codeFileName("Wi-Fi code for Hut", "png")).toBe("wi-fi-code-for-hut.png");
    expect(codeFileName("Wi-Fi code for Καλύβα", "svg")).toBe("wi-fi-code-for-καλυβα.svg");
    expect(codeFileName("!!!", "png")).toBe("qr-code.png");
  });

  it("puts the code 8 cm wide on the sheet, and the password only when asked", () => {
    const wifi = { kind: "wifi" as const, wifi: { ssid: "Hut", security: "WPA" as const, password: "s3cret", hidden: false } };
    const wifiCode = encodeQr(describeContent(wifi, { showPassword: false }).payload);
    const sheet = qrSheet(wifiCode, describeContent(wifi, { showPassword: false }), "a4", "Made in Outpost.");
    const rects = sheet.items.filter((item) => item.kind === "rect");
    const left = Math.min(...rects.map((item) => item.x));
    const right = Math.max(...rects.map((item) => item.x + item.width));
    expect((right - left) / (72 / 25.4)).toBeCloseTo(80, 0);
    const words = JSON.stringify(sheet.items.filter((item) => item.kind === "text"));
    expect(words).not.toContain("s3cret");
    const told = qrSheet(wifiCode, describeContent(wifi, { showPassword: true }), "a4", "Made in Outpost.");
    expect(JSON.stringify(told.items)).toContain("s3cret");
  });
});
