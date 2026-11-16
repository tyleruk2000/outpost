/**
 * The hues of the kinds of effect: one each, the same in the tokens, the map, the legend
 * and the PDF; never a status colour; stronger levels more opaque within a kind; the
 * selected scenario drawn at full strength and the others quieter, never in a hue of
 * their own.
 */
import fs from "node:fs";
import path from "node:path";
import { computeEffects, type EffectFamily } from "@outpost/shared";
import { describe, expect, it } from "vitest";
import { FALLBACK_THEME } from "@/features/maps/lib/palette";
import { scenarioDocument } from "./document";
import { FAMILY_HUE, familyColour, nuclearData, nuclearLayers } from "./layers";
import { LEGEND_FAMILIES } from "./nuclear-page";

const FAMILIES: Array<EffectFamily | "fallout"> = ["fireball", "crater", "blast", "thermal", "radiation", "fallout"];
const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../styles/tokens.css"), "utf8");
const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("\n}", start));
};
const token = (text: string, name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(text)?.[1]?.trim();

const surface = () => {
  const answer = computeEffects({ yieldKt: 100, burst: { kind: "surface" }, wind: { fromDegrees: 270, kmh: 24 } });
  if (!answer.ok) throw new Error("expected an answer");
  return answer.result;
};

describe("the hue of each kind of effect", () => {
  it("is one per kind (the fireball and crater share one), different from every other, in light and dark", () => {
    for (const theme of [FALLBACK_THEME.light, FALLBACK_THEME.dark]) {
      const hues = Object.values(theme.effects);
      expect(hues).toHaveLength(5);
      expect(new Set(hues).size, "two kinds share a colour").toBe(5);
    }
    expect(FAMILY_HUE.crater).toBe(FAMILY_HUE.fireball);
    expect(new Set(FAMILIES.filter((family) => family !== "crater").map((family) => FAMILY_HUE[family])).size).toBe(5);
  });

  it("comes from tokens defined for both themes, matching what the map falls back to, and never a status colour", () => {
    const light = block(":root");
    const dark = block(':root[data-theme="dark"]');
    for (const hue of ["fireball", "blast", "heat", "radiation", "fallout"] as const) {
      expect(token(light, `map-effect-${hue}`), hue).toBe(FALLBACK_THEME.light.effects[hue]);
      expect(token(dark, `map-effect-${hue}`), hue).toBe(FALLBACK_THEME.dark.effects[hue]);
      for (const status of ["danger", "warning", "success"]) {
        expect(token(light, `map-effect-${hue}`)).not.toBe(token(light, status));
        expect(token(dark, `map-effect-${hue}`)).not.toBe(token(dark, status));
      }
    }
    for (const family of FAMILIES) expect(familyColour(family)).toBe(`var(--map-effect-${FAMILY_HUE[family]})`);
  });

  it("paints each kind's rings, and the plume, in its own hue on the map", () => {
    const theme = { ...FALLBACK_THEME.light } as never;
    const layers = nuclearLayers(theme);
    for (const family of ["fireball", "crater", "blast", "thermal", "radiation"] as const) {
      const ring = layers.find((layer) => layer.id === `o-nuclear-ring-${family}`) as { paint: Record<string, unknown> };
      expect(ring.paint["line-color"], family).toBe(FALLBACK_THEME.light.effects[FAMILY_HUE[family]]);
    }
    const plume = layers.find((layer) => layer.id === "o-nuclear-plume") as { paint: Record<string, unknown> };
    expect(plume.paint["fill-color"]).toBe(FALLBACK_THEME.light.effects.fallout);
  });

  it("is in the legend for every kind", () => {
    const named = new Set<string>(LEGEND_FAMILIES.map(([family]) => family));
    for (const family of FAMILIES) expect(named.has(family === "crater" ? "fireball" : family), family).toBe(true);
  });

  it("is in the PDF's key for every kind the scenario has", () => {
    const result = surface();
    const blocks = scenarioDocument([
      {
        letter: "A",
        scenario: {
          name: "Q",
          notes: "",
          lat: 54,
          lon: -3,
          effects: { yieldKt: 100, burst: { kind: "surface" }, wind: { fromDegrees: 270, kmh: 24 } },
        },
        result,
      },
    ]);
    const key = blocks.find((each) => each.kind === "drawing") as {
      words: string;
      draw: (x: number, y: number, w: number) => Array<{ kind: string; color?: number[]; fill?: number[] }>;
    };
    for (const name of ["Fireball", "Crater", "Blast", "Burns (heat)", "Initial radiation", "Fallout (idealised)"])
      expect(key.words).toContain(name);
    const colours = new Set(key.draw(0, 0, 400).flatMap((item) => (item.kind === "text" ? [] : [JSON.stringify(item.color ?? item.fill)])));
    // Five hues: the fireball and crater share one.
    expect(colours.size).toBe(5);
  });
});

describe("within a kind, and between scenarios", () => {
  it("draws a stronger level more opaque, not in another hue", () => {
    const data = nuclearData([{ letter: "A", selected: true, at: { lat: 54, lon: -3 }, result: surface() }], {
      blast: true,
      thermal: true,
      radiation: true,
      fireball: true,
      fallout: true,
    });
    const blast = data.features.filter((feature) => feature.properties.kind === "ring" && feature.properties.family === "blast");
    const opacity = (label: string) =>
      Number(blast.find((feature) => String(feature.properties.label).includes(label))!.properties.opacity);
    expect(opacity("20 psi")).toBeGreaterThan(opacity("5 psi"));
    expect(opacity("5 psi")).toBeGreaterThan(opacity("1 psi"));
    const plume = data.features
      .filter((feature) => feature.properties.kind === "plume")
      .map((feature) => Number(feature.properties.opacity));
    expect([...plume].sort((a, b) => a - b)).toEqual(plume);
    // The outermost contour is still plainly there.
    expect(plume[0]).toBeGreaterThanOrEqual(0.12);
  });

  it("draws the selected scenario at full strength and filled, and the others quieter and unfilled, in the same hues", () => {
    const result = surface();
    const data = nuclearData(
      [
        { letter: "A", selected: false, at: { lat: 54, lon: -3 }, result },
        { letter: "B", selected: true, at: { lat: 54.2, lon: -3 }, result },
        { letter: "C", selected: false, at: { lat: 54.4, lon: -3 }, result },
      ],
      { blast: true, thermal: true, radiation: true, fireball: true, fallout: true },
    );
    const zones = data.features.filter((feature) => feature.properties.kind === "zone");
    expect(new Set(zones.map((feature) => feature.properties.scenario))).toEqual(new Set(["B"]));
    const rings = data.features.filter((feature) => feature.properties.kind === "ring");
    for (const ring of rings) expect(ring.properties.quiet).toBe(ring.properties.scenario !== "B");
    // Every ring and contour says its scenario's letter.
    for (const feature of data.features.filter((each) => each.properties.kind === "ring" || each.properties.kind === "plume"))
      expect(String(feature.properties.label)).toMatch(new RegExp(`^${feature.properties.scenario} · `));
    expect(
      data.features
        .filter((feature) => feature.properties.kind === "zero")
        .map((feature) => feature.properties.label)
        .sort(),
    ).toEqual(["A", "B", "C"]);
  });
});
