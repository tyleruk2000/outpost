/**
 * The drawing of signal figures. The first three groups are ported with the code from
 * LogBook73 (frontend/src/features/handbook/RadioViz.test.tsx, copyright (c) 2026 Tyler
 * Allen, MIT licence); the rest are Outpost's: what happens to a specification that is
 * not one, and every figure in the books that ship with Outpost.
 */
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RadioViz, { fitLabelX, withCallouts, wrapLabel } from "./radio-viz";
import { readVizSpec } from "./viz-spec";

// SVG labels have fixed positions in user units and the figure
// scales as one image, so a long label was clipped at every screen width.

describe("fitLabelX", () => {
  it("pulls a label near the left edge inside the figure", () => {
    // "CTCSS 71.9 Hz" on a component at x=26 of 640 ran off the left edge.
    const x = fitLabelX(26, "CTCSS 71.9 Hz", 12, 640);
    const half = ("CTCSS 71.9 Hz".length * 12 * 0.56) / 2;
    expect(x - half).toBeGreaterThanOrEqual(4);
  });

  it("pulls a label near the right edge inside the figure", () => {
    const x = fitLabelX(636, "your voice", 12, 640);
    expect(x + ("your voice".length * 12 * 0.56) / 2).toBeLessThanOrEqual(636);
  });

  it("leaves a label with room to spare where it is", () => {
    expect(fitLabelX(320, "speech", 12, 640)).toBe(320);
  });
});

describe("withCallouts", () => {
  it("names every callout in full and in number order ", () => {
    expect(
      withCallouts("Front panel", [
        { n: 2, x: 10, y: 10, label: "Squelch" },
        { n: 1, x: 10, y: 10, label: "A very long volume knob label that the slot clips" },
      ] as never),
    ).toBe("Front panel. 1 A very long volume knob label that the slot clips; 2 Squelch");
    expect(withCallouts("Front panel", [])).toBe("Front panel");
  });
});

describe("wrapLabel", () => {
  it("keeps a short label on one line", () => {
    expect(wrapLabel("Volume", 13, 200)).toEqual(["Volume"]);
  });

  it("wraps a long label at word boundaries to fit the width", () => {
    const lines = wrapLabel("Shift direction (+): TX is offset above", 13, 142);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("Shift direction (+): TX is offset above");
    for (const ln of lines) expect(ln.length * 13 * 0.56).toBeLessThanOrEqual(142);
  });

  it("never splits a single over-long word", () => {
    expect(wrapLabel("Supercalifragilistic", 13, 40)).toEqual(["Supercalifragilistic"]);
  });

  it("caps the lines and ends the last one in an ellipsis ", () => {
    const label = "one two three four five six seven eight nine ten eleven twelve";
    const lines = wrapLabel(label, 13, 60, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith("…")).toBe(true);
    expect(wrapLabel("Volume", 13, 200, 2)).toEqual(["Volume"]);
    // A slot too small for one line still shows one.
    expect(wrapLabel(label, 13, 60, 0)).toHaveLength(1);
  });
});

describe("RadioViz callouts", () => {
  it("wraps a long display callout into tspans instead of running off the figure", () => {
    const spec = {
      type: "display",
      title: "A programmed repeater channel",
      callouts: [{ n: 1, x: 90, y: 50, label: "Shift direction (+): TX is offset above" }],
    };
    const { container } = render(<RadioViz source={JSON.stringify(spec)} />);
    const label = [...container.querySelectorAll("text")].find((t) => t.textContent?.includes("Shift direction"));
    expect(label).toBeDefined();
    const spans = label!.querySelectorAll("tspan");
    expect(spans.length).toBeGreaterThan(1);
    // Every line restarts at the same x so the block stays left-aligned.
    const xs = new Set([...spans].map((s) => s.getAttribute("x")));
    expect(xs.size).toBe(1);
  });
});

const draw = (spec: unknown) => render(<RadioViz source={typeof spec === "string" ? spec : JSON.stringify(spec)} />);

describe("a block that is marked as a figure and is not one", () => {
  it("is shown as the text it is, with the reason", () => {
    for (const source of ["{ not json", "null", "[1,2]", '"wave"', '{"nope":1}', '{"type":"hologram"}', '{"type":7}', ""]) {
      const { container, unmount } = draw(source);
      expect(container.querySelector("svg"), source).toBeNull();
      expect(container.querySelector(".doc-figure-failed p")?.textContent, source).toMatch(/not one Outpost can draw/);
      expect(container.querySelector("pre code")?.textContent, source).toBe(source);
      unmount();
    }
    expect(readVizSpec(`{"type":"wave","title":"${"x".repeat(70_000)}"}`)).toBeNull();
  });

  it("is drawn from numbers and words only, whatever else the specification holds", () => {
    const hostile = {
      type: "spectrum",
      title: '<img src=x onerror="alert(1)">',
      caption: "<script>alert(1)</script>",
      xLabel: { toString: "nope" },
      noiseFloor: "0.5",
      components: [
        { f: 50, amp: 0.8, label: "</text><script>alert(1)</script>", tone: "url(https://evil.example/x)" },
        { f: "50", amp: 1 },
        { f: 1e308, amp: -5, width: Number.NaN },
        null,
        "carrier",
        ...Array.from({ length: 500 }, (_, f) => ({ f: f % 100, amp: 0.5 })),
      ],
      mask: { kind: "bandpass", from: "javascript:alert(1)", to: 1e9 },
      onload: "alert(1)",
      dangerouslySetInnerHTML: { __html: "<b>x</b>" },
    };
    const spec = readVizSpec(JSON.stringify(hostile));
    expect(spec).toEqual({
      type: "spectrum",
      title: '<img src=x onerror="alert(1)">',
      caption: "<script>alert(1)</script>",
      components: [
        { f: 50, amp: 0.8, label: "</text><script>alert(1)</script>" },
        { f: 100, amp: 0 },
        // A figure shows fourteen components at most; the first fourteen written are the ones considered.
        ...Array.from({ length: 9 }, (_, f) => ({ f: f % 100, amp: 0.5 })),
      ],
      mask: { kind: "bandpass", from: 0, to: 100 },
    });

    const { container } = draw(hostile);
    // What looks like markup is lettering in the picture; nothing was built from it.
    expect(container.querySelector("script, img, [onerror], [onload]")).toBeNull();
    expect(container.querySelector("figcaption")?.textContent).toBe('<img src=x onerror="alert(1)">');
    expect([...container.querySelectorAll("text")].some((text) => text.textContent === "</text><script>alert(1)</script>")).toBe(true);
    expect(container.innerHTML).not.toMatch(/evil\.example|javascript:/);
  });

  it("keeps every list, number and label within what a figure can show", () => {
    const many = <T,>(count: number, make: (index: number) => T) => Array.from({ length: count }, (_, index) => make(index));
    const spec = readVizSpec(
      JSON.stringify({
        type: "wave",
        traces: [
          { kind: "points", points: many(2500, (index) => [index / 5000, 9]), label: "L".repeat(500), freq: 1e12, pattern: [0, 0] },
          ...many(20, () => ({ kind: "sine" })),
        ],
        markers: many(40, (index) => ({ x: index, label: "m" })),
        points: many(60, () => [9, -9, "p".repeat(100)]),
        signals: many(30, () => ({ f: -50, width: 1e6, kind: "nonsense" })),
        callouts: many(30, (index) => ({ n: index, x: 1e6, y: -1e6, label: "c".repeat(300), side: "top" })),
        curve: { preset: "lowpass", f0: 0, bw: 0, order: 1e6 },
        screen: { rows: many(6, () => ({ freq: "1".repeat(100), active: "yes" })), topIcons: many(20, () => "icon"), bottomTags: "VOX" },
        device: { screenRows: 99, sideKeys: -4, nav: "joystick", keypad: "no" },
      }),
    );
    expect(spec?.traces).toHaveLength(5);
    expect(spec?.traces?.[0]).toMatchObject({ freq: 240 });
    expect(spec?.traces?.[0]).not.toHaveProperty("pattern");
    expect(spec?.traces?.[0]?.points).toHaveLength(2000);
    expect(spec?.traces?.[0]?.points?.[1999]).toEqual([1999 / 5000, 1]);
    expect(spec?.traces?.[0]?.label).toHaveLength(80);
    expect(spec?.markers).toHaveLength(12);
    expect(spec?.points).toHaveLength(32);
    expect(spec?.points?.[0]).toEqual([1.2, -1.2, "p".repeat(16)]);
    expect(spec?.signals).toEqual(Array.from({ length: 10 }, () => ({ f: 0, width: 100 })));
    expect(spec?.callouts).toHaveLength(14);
    expect(spec?.callouts?.[13]).toEqual({ n: 13, x: 120, y: -40, label: "c".repeat(240) });
    expect(spec?.curve).toEqual({ preset: "lowpass", f0: 1, bw: 0.5, order: 8 });
    expect(spec?.screen?.rows).toEqual(Array.from({ length: 3 }, () => ({ freq: "1".repeat(24) })));
    expect(spec?.screen?.topIcons).toHaveLength(8);
    expect(spec?.screen).not.toHaveProperty("bottomTags");
    expect(spec?.device).toEqual({ screenRows: 4, sideKeys: 0 });
    // And each kind of figure draws from such a specification without failing.
    for (const type of ["wave", "spectrum", "response", "polar", "constellation", "waterfall", "device", "display"]) {
      const { container, unmount } = draw({ ...spec, type });
      expect(container.querySelector("svg[role=img]"), type).not.toBeNull();
      unmount();
    }
  });
});

describe("the figures in the books that ship with Outpost", () => {
  const root = path.resolve(import.meta.dirname, "../../../../../../catalog/bundled");
  const figures: Array<{ where: string; source: string }> = [];
  for (const file of fs.readdirSync(root, { recursive: true, encoding: "utf8" })) {
    if (!file.endsWith(".md")) continue;
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const [, source = ""] of text.matchAll(/^```viz\n([\s\S]*?)\n```$/gm)) figures.push({ where: file, source });
  }

  it("are all read exactly as written, and all draw", () => {
    expect(figures.length).toBeGreaterThanOrEqual(149);
    const kinds = new Map<string, number>();
    const problems: string[] = [];
    for (const { where, source } of figures) {
      const spec = readVizSpec(source);
      if (!spec) {
        problems.push(`${where}: not a figure`);
        continue;
      }
      // Checking a specification changes nothing in one that was already sound.
      try {
        expect(spec).toEqual(JSON.parse(source));
      } catch {
        problems.push(`${where}: "${spec.title}" is not read as written`);
      }
      const { container, unmount } = draw(source);
      const svg = container.querySelector("svg[role=img]");
      if (!svg) problems.push(`${where}: "${spec.title}" did not draw`);
      else if (/NaN|Infinity|undefined/.test(svg.innerHTML)) problems.push(`${where}: "${spec.title}" has a mark with no position`);
      // Every figure has a name for people who cannot see it, and the handbook's own style asks for a title.
      if (!svg?.getAttribute("aria-label")?.trim() || !spec.title) problems.push(`${where}: a figure has no title`);
      kinds.set(spec.type, (kinds.get(spec.type) ?? 0) + 1);
      unmount();
    }
    expect(problems).toEqual([]);
    expect([...kinds.keys()].sort()).toEqual(["constellation", "display", "polar", "response", "spectrum", "waterfall", "wave"]);
  });
});
