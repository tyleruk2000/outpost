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
  type EffectsResult,
  type NuclearScenarioInput,
  roundDistance,
} from "@outpost/shared";
import { writePdfPages } from "@/features/maps/print/pdf";
import { type Block, toMarkdown, toSheets } from "@/features/propagation/plans/document";
import { burstText, distanceText, windText, yieldText } from "./words";

export interface Written {
  letter: "A" | "B";
  scenario: NuclearScenarioInput;
  result: EffectsResult;
}

const coordinates = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;

export function scenarioTitle(written: Written[]): string {
  return written.length === 1
    ? `Nuclear effects scenario: ${written[0]!.scenario.name}`
    : `Nuclear effects scenarios compared: ${written.map((item) => item.scenario.name).join(" and ")}`;
}

function scenarioBlocks({ letter, scenario, result }: Written, labelled: boolean): Block[] {
  const blocks: Block[] = [
    { kind: "heading", text: `${labelled ? `${letter}: ` : ""}${scenario.name}` },
    {
      kind: "para",
      text: `${yieldText(result.yieldKt)}, ${burstText(scenario.effects, result.heightM)}, at ${coordinates(scenario.lat, scenario.lon)}; ${windText(scenario.effects)}.`,
    },
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
    { kind: "para", text: EFFECTS_CAVEAT },
    ...written.flatMap((item) => scenarioBlocks(item, written.length > 1)),
    { kind: "heading", text: "Assumptions" },
    { kind: "list", items: [...EFFECTS_ASSUMPTIONS] },
    { kind: "heading", text: "Limitations" },
    { kind: "list", items: [...EFFECTS_LIMITATIONS] },
    { kind: "heading", text: "Source" },
    {
      kind: "para",
      text: `${EFFECTS_SOURCE} Figures were read off the book's printed curves; section, figure and table numbers are the book's. Affected population is not estimated: this version has no population data.`,
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
