/**
 * A scenario (or two side by side) written out: every figure, what each level means,
 * every assumption and limitation, and the source of each. The same blocks become
 * Markdown and the pages of a PDF (with the writer the HF planner's documents use).
 *
 * The file is dated by the scenario, not by the clock: the same scenario written out
 * twice is the same file, so the library can tell it already has it.
 */
import {
  EFFECTS_ASSUMPTIONS,
  EFFECTS_CAVEAT,
  EFFECTS_LIMITATIONS,
  EFFECTS_SOURCE,
  type EffectFamily,
  type EffectsResult,
  type NuclearScenarioInput,
  roundDistance,
  type ScenarioLetter,
} from "@outpost/shared";
import { FALLBACK_THEME } from "@/features/maps/lib/palette";
import { writePdfPages } from "@/features/maps/print/pdf";
import type { Rgb, SheetItem } from "@/features/maps/print/sheet";
import { type Block, toMarkdown, toSheets } from "@/features/propagation/plans/document";
import { FAMILY_HUE, FAMILY_LINES } from "./layers";
import { burstText, distanceText, listText, windText, yieldText } from "./words";

export interface Written {
  letter: ScenarioLetter;
  scenario: NuclearScenarioInput;
  result: EffectsResult;
}

const coordinates = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;

export function scenarioTitle(written: Written[]): string {
  return written.length === 1
    ? `Nuclear effects scenario: ${written[0]!.scenario.name}`
    : `Nuclear effects scenarios: ${listText(written.map((item) => `${item.letter}, ${item.scenario.name}`))}`;
}

/** The kinds of effect, by the names the screen gives them, in the order the key lists them. */
export const FAMILY_NAMES: Record<EffectFamily | "fallout", string> = {
  fireball: "Fireball",
  crater: "Crater",
  blast: "Blast",
  thermal: "Burns (heat)",
  radiation: "Initial radiation",
  fallout: "Fallout (idealised)",
};

/** A kind's hue on paper: the light theme's, since paper is light (the tokens `--map-effect-*`). */
export function printHue(family: EffectFamily | "fallout"): Rgb {
  const hex = FALLBACK_THEME.light.effects[FAMILY_HUE[family]];
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255) as unknown as Rgb;
}

/** The kinds of effect a scenario has, each once, in the key's order. */
export function familiesOf(result: EffectsResult): Array<EffectFamily | "fallout"> {
  const present = new Set<EffectFamily | "fallout">(result.rings.filter((ring) => ring.metres !== null).map((ring) => ring.family));
  if (result.fallout.drawn) present.add("fallout");
  return (Object.keys(FAMILY_NAMES) as Array<EffectFamily | "fallout">).filter((family) => present.has(family));
}

/** The key to the colours on paper: a line in each kind's hue and dashes, and its name. Black-and-white copies keep the dashes and names. */
function colourKey(result: EffectsResult): Block {
  const families = familiesOf(result);
  const ROW = 14;
  return {
    kind: "drawing",
    height: families.length * ROW + 4,
    words: `Colours: ${families.map((family) => FAMILY_NAMES[family]).join(", ")}.`,
    draw: (x, y) => {
      const items: SheetItem[] = [];
      families.forEach((family, index) => {
        const top = y + index * ROW;
        const colour = printHue(family);
        if (family === "fallout")
          items.push({ kind: "rect", x, y: top + 2, width: 30, height: 8, fill: colour, stroke: colour, lineWidth: 0.8, dash: [3, 1.5] });
        else {
          const line = FAMILY_LINES[family];
          if (line.dash) {
            // Dashes drawn as short lines: the sheet's lines are solid.
            const [on, off] = line.dash.map((part) => Math.max(0.8, part * line.width));
            for (let at = 0; at < 30; at += on! + off!)
              items.push({
                kind: "line",
                x1: x + at,
                y1: top + 6,
                x2: x + Math.min(30, at + on!),
                y2: top + 6,
                color: colour,
                width: line.width,
              });
          } else items.push({ kind: "line", x1: x, y1: top + 6, x2: x + 30, y2: top + 6, color: colour, width: line.width });
        }
        items.push({ kind: "text", x: x + 38, y: top + 9, text: FAMILY_NAMES[family], size: 9, color: [0.09, 0.12, 0.13] });
      });
      return items;
    },
  };
}

function scenarioBlocks({ letter, scenario, result }: Written, labelled: boolean): Block[] {
  const blocks: Block[] = [
    { kind: "heading", text: `${labelled ? `${letter}: ` : ""}${scenario.name}` },
    {
      kind: "para",
      text: `${yieldText(result.yieldKt)}, ${burstText(scenario.effects, result.heightM)}, at ${coordinates(scenario.lat, scenario.lon)}; ${windText(scenario.effects)}.`,
    },
    { kind: "para", text: EFFECTS_CAVEAT },
    colourKey(result),
  ];
  if (scenario.notes.trim()) blocks.push({ kind: "para", text: `Notes: ${scenario.notes.trim()}` });
  blocks.push({
    kind: "table",
    head: ["Effect", "Distance from ground zero", "Source"],
    rows: result.rings.map((ring) => [
      ring.label,
      ring.metres === null ? `None given: ${ring.why ?? ""}` : distanceText(roundDistance(ring.metres)),
      ring.source,
    ]),
  });
  blocks.push({ kind: "list", items: result.rings.map((ring) => `${ring.label}: ${ring.meaning}`) });
  if (result.fallout.drawn) {
    blocks.push({
      kind: "para",
      text: `Idealised fallout pattern for a steady wind, which real fallout never follows (Table 9.93, scaled for the wind by § 9.97, factor ${result.fallout.factor.toFixed(2)}). Dose rates are those one hour after the burst, in the open on smooth ground, with all of the yield from fission; they fall roughly tenfold for every sevenfold increase in time (§ 9.16).`,
    });
    blocks.push({
      kind: "table",
      head: ["Dose rate at 1 hour", "Downwind", "Greatest width", "Upwind"],
      rows: result.fallout.contours.map((contour) => [
        `${contour.rate.toLocaleString("en-GB")} rads/h`,
        distanceText(contour.downwindM),
        distanceText(contour.maxWidthM),
        distanceText(contour.upwindM),
      ]),
    });
  } else {
    blocks.push({ kind: "para", text: `Fallout: ${result.fallout.why}` });
  }
  if (result.notes.length > 0) blocks.push({ kind: "list", items: result.notes });
  return blocks;
}

export function scenarioDocument(written: Written[]): Block[] {
  return [
    { kind: "title", text: scenarioTitle(written) },
    ...(written.length > 1
      ? [
          {
            kind: "para" as const,
            text: "Each scenario is worked out on its own, under its own letter. Nothing is added up across them: they are separate illustrations of what a published model says, not an estimate of anything happening together.",
          },
        ]
      : []),
    ...written.flatMap((item) => scenarioBlocks(item, written.length > 1)),
    { kind: "heading", text: "Assumptions" },
    { kind: "list", items: [...EFFECTS_ASSUMPTIONS] },
    { kind: "heading", text: "Limitations" },
    { kind: "list", items: [...EFFECTS_LIMITATIONS] },
    { kind: "heading", text: "Source" },
    {
      kind: "para",
      text: `${EFFECTS_SOURCE} Figures were read off the book's printed curves; section, figure and table numbers are the book's. No casualty figures are given.`,
    },
    {
      kind: "para",
      text: "General preparedness information, not instructions for an emergency in progress. In a real emergency, follow what the emergency services and your local authorities say.",
    },
  ];
}

export const scenarioMarkdown = (written: Written[]) => toMarkdown(scenarioDocument(written));

/** `dated` is the scenarios' own last change (or, for one not saved, when it was last edited), so the same scenario makes the same file. */
export function scenarioPdf(written: Written[], dated: number, paper: "a4" | "letter" = "a4"): Uint8Array {
  const title = scenarioTitle(written);
  return writePdfPages({ pages: toSheets(scenarioDocument(written), title, paper), title, created: new Date(dated) });
}
