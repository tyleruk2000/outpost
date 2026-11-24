/**
 * Every field shows where the keyboard is with more than its caret (WCAG 2.4.7), in a ring that stands out from
 * what is around it (3:1, WCAG 1.4.11): a field that drops its outline puts the full-strength ring on itself or
 * on the row around it, and no focus ring is drawn faint.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/features/maps/lib/map-styles";
import { searchRowFocus } from "./input";

const SRC = path.resolve(import.meta.dirname, "../..");

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}
const files = sources(SRC).map((file) => ({ file: path.relative(SRC, file), text: fs.readFileSync(file, "utf8") }));

/**
 * Fields that drop their own outline because the box around them draws the ring instead, with what that box
 * has. Anything new that drops a field's outline must either ring itself or be named here.
 */
const RINGED_BY_WRAPPER: Record<string, string> = {
  "components/command-palette.tsx": "searchRowFocus",
  "features/imports/parent-picker.tsx": "searchRowFocus",
  "features/contacts/contact-editor.tsx": "searchRowFocus",
  "features/notes/move-dialog.tsx": "searchRowFocus",
  "features/notes/editor/document-picker.tsx": "searchRowFocus",
  "features/propagation/antenna-picker.tsx": "searchRowFocus",
  "features/satellites/satellite-picker.tsx": "searchRowFocus",
  "features/maps/search-box.tsx": "searchRowFocus",
  "features/maps/directions/picker.tsx": "searchRowFocus",
  "features/library/document-tags.tsx": "focus-within:ring-2 focus-within:ring-focus",
  "features/chat/composer.tsx": "focus-within:ring-2 focus-within:ring-focus",
  "features/games/skerry/skerry-page.tsx": "focus-within:outline-2",
};

describe("focus on a field", () => {
  it("is never only the caret: a field that drops its outline has a ring of its own or one round it", () => {
    const bare: string[] = [];
    for (const { file, text } of files) {
      for (const match of text.matchAll(/<(?:input|textarea|Command\.Input)\b[\s\S]*?\/>/g)) {
        const tag = match[0];
        if (!/(?:^|[\s"`])(?:focus:|focus-visible:)?outline-none\b/.test(tag)) continue;
        if (/ring-2/.test(tag) && /ring-focus\b/.test(tag)) continue;
        const wrapper = RINGED_BY_WRAPPER[file];
        if (wrapper && text.includes(wrapper)) continue;
        bare.push(`${file}: ${tag.slice(0, 80).replace(/\s+/g, " ")}…`);
      }
    }
    expect(bare).toEqual([]);
  });

  it("puts the search row's ring on in full, inside the row, for the field and not for a button beside it", () => {
    expect(searchRowFocus).toContain("has-[input:focus-visible]:ring-2");
    expect(searchRowFocus).toContain("has-[input:focus-visible]:ring-focus");
    expect(searchRowFocus).toContain("has-[input:focus-visible]:ring-inset");
    expect(searchRowFocus).not.toMatch(/ring-focus\//);
  });

  it("is never drawn in a faint ring that would not stand out from the page", () => {
    const faint = files.filter(({ text }) => /ring-focus\/\d/.test(text)).map(({ file }) => file);
    expect(faint).toEqual([]);
  });
});

/** OKLCH (as the tokens are written) to an sRGB "rgb()" string, clipped to the gamut. */
function oklchToRgb(text: string): string {
  const [L, C, h] = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(text)!.slice(1).map(Number) as [number, number, number];
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const encoded = linear.map((x) => {
    const c = Math.min(1, Math.max(0, x));
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  });
  return `rgb(${encoded.join(", ")})`;
}

describe("the focus colour", () => {
  const css = fs.readFileSync(path.join(SRC, "styles/tokens.css"), "utf8");
  // The light tokens are the first block; the dark ones the block for the dark theme.
  const light = css.slice(css.indexOf(":root {"), css.indexOf(':root[data-theme="dark"]'));
  const dark = css.slice(css.indexOf(':root[data-theme="dark"] {'));
  const token = (block: string, name: string) => new RegExp(`--${name}:\\s*(oklch\\([^)]*\\))`).exec(block)?.[1];

  it.each([
    ["light", light],
    ["dark", dark],
  ])("stands out at 3:1 from every ground a field sits on, in the %s theme", (_theme, block) => {
    const focus = oklchToRgb(token(block, "focus")!);
    for (const ground of ["page", "surface", "surface-strong", "raised"]) {
      expect(contrastRatio(focus, oklchToRgb(token(block, ground)!)), ground).toBeGreaterThanOrEqual(3);
    }
  });
});
