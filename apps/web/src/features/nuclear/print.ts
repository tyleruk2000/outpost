/**
 * A scenario (or several) on paper, laid out with the print kit: each scenario in its own
 * numbered section with its caveat, its map or its rings to scale, the key, every figure
 * and what each level means; then sheltering, in the UK Health Security Agency's words
 * the workspace's planning section carries; then the assumptions, the limits and the
 * source. The words are document.ts's; the drawings are diagrams.ts's and, for the maps,
 * print-figures.ts's, carried into the kit by `blocksToContent` with the map pictures as
 * data addresses.
 *
 * Dated by the scenarios, not by the clock: the same scenarios make the same file.
 */
import {
  EFFECTS_ASSUMPTIONS,
  EFFECTS_CAVEAT,
  EFFECTS_LIMITATIONS,
  EFFECTS_SOURCE,
  roundDistance,
  sourceById,
  templateStep,
} from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { PdfPicture } from "@/features/maps/print/pdf";
import type { SheetItem } from "@/features/maps/print/sheet";
import {
  blocksToContent,
  bullets,
  callout,
  dataTable,
  figure,
  heading,
  label,
  measureOf,
  note,
  type PrintPaper,
  para,
  printDocument,
  quote,
  renderPdf,
  sectionHeader,
  sheetItemsToSvg,
  twoColumns,
} from "@/features/print-kit";
import type { Block } from "@/features/propagation/plans/document";
import { appLocale } from "@/lib/region";
import { decayDiagram, reachDiagram, shelterDiagram, shelterQuote } from "./diagrams";
import { colourKey, type ScenarioFigures, scenarioTitle, type Written } from "./document";
import { DRAWN_FALLOUT_RATES } from "./layers";
import { diagramBlock, FURNITURE } from "./print-figures";
import { burstText, distanceText, windText, yieldText } from "./words";

const coordinates = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** A JPEG as a data address, for an SVG picture in the PDF. */
export function jpegAddress(jpeg: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < jpeg.length; at += 0x8000) binary += String.fromCharCode(...jpeg.subarray(at, at + 0x8000));
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/** The map pictures, by id, as data addresses. */
export const pictureAddresses = (pictures: ReadonlyMap<string, PdfPicture>): Map<string, string> =>
  new Map([...pictures].map(([id, picture]) => [id, jpegAddress(picture.jpeg)]));

/** With no map, the rings to scale (print-figures.ts's drawing, square) and the key to their colours beside it. */
function ringsBesideKey({ letter, result }: Written, measure: number): Content {
  const block = diagramBlock(letter, result);
  if (block.kind !== "drawing") return blocksToContent([block], measure)[0]!;
  const size = block.height - FURNITURE;
  const key = colourKey(result);
  const keyItems = key.kind === "drawing" ? key.draw(0, 0, 160) : [];
  return twoColumns(
    [
      figure(sheetItemsToSvg(block.draw(0, 0, size), { x: 0, y: 0, width: size, height: block.height }), {
        width: size,
        caption: block.words,
      }),
    ],
    [
      label("Key"),
      {
        svg: sheetItemsToSvg(keyItems, { x: 0, y: 0, width: 160, height: key.kind === "drawing" ? key.height : 0 }),
        width: 160,
      } as Content,
    ],
    { widths: [size, "*"] },
  );
}

function scenarioSection(item: Written, index: number, several: boolean, measure: number, maps: Content[] | null): Content[] {
  const { letter, scenario, result } = item;
  const content: Content[] = [
    sectionHeader(
      {
        number: several ? letter : index + 1,
        title: scenario.name,
        subtitle: `${yieldText(result.yieldKt)}, ${burstText(scenario.effects, result.heightM)}, at ${coordinates(scenario.lat, scenario.lon)}; ${windText(scenario.effects)}.`,
        id: `scenario-${letter}`,
      },
      measure,
    ),
    callout("warn", "An educational estimate, not a forecast", para(EFFECTS_CAVEAT, 0)),
    ...(maps ? [...maps, ...blocksToContent([colourKey(result)], measure)] : [ringsBesideKey(item, measure)]),
  ];
  if (scenario.notes.trim()) content.push(para(`**Notes:** ${scenario.notes.trim()}`));
  content.push(
    {
      stack: [
        heading("How far each effect reaches"),
        dataTable(
          ["Effect", "Distance from ground zero", "Source"],
          result.rings.map((ring) => [
            ring.label,
            ring.metres === null ? `None given: ${ring.why ?? ""}` : distanceText(roundDistance(ring.metres)),
            ring.source,
          ]),
          { bold: [0] },
        ),
      ],
      unbreakable: true,
    } as Content,
    label("What each level means"),
    bullets(result.rings.map((ring) => `**${ring.label}:** ${ring.meaning}`)),
  );
  if (result.fallout.drawn) {
    const contours = result.fallout.contours;
    const strongest = contours
      .filter((contour) => (DRAWN_FALLOUT_RATES as readonly number[]).includes(contour.rate))
      .reduce<number | null>((most, contour) => (most === null || contour.rate > most ? contour.rate : most), null);
    content.push(
      heading("Fallout, idealised"),
      para(
        `Idealised fallout pattern for a steady wind, which real fallout never follows (Table 9.93, scaled for the wind by § 9.97, factor ${result.fallout.factor.toFixed(2)}). Dose rates are those one hour after the burst, in the open on smooth ground, with all of the yield from fission.`,
      ),
      figure(reachDiagram(contours, measure).svg, {
        title: "How far each contour reaches, upwind and downwind of ground zero",
        width: measure,
        caption: "The figures in the table below, drawn to one scale. Real fallout has hot spots and gaps this shape does not.",
      }),
      dataTable(
        ["Dose rate at 1 hour", "Downwind", "Greatest width", "Upwind"],
        contours.map((contour) => [
          `${contour.rate.toLocaleString("en-GB")} rads/h`,
          distanceText(contour.downwindM),
          distanceText(contour.maxWidthM),
          distanceText(contour.upwindM),
        ]),
        { bold: [0] },
      ),
      figure(decayDiagram(measure, strongest).svg, {
        title: "As time passes",
        width: measure,
        caption: `Dose rates “fall roughly tenfold for every sevenfold increase in time” after the burst (§ 9.16)${
          strongest !== null ? `: the ${strongest.toLocaleString("en-GB")} rads per hour contour beside each step` : ""
        }. Roughly: the rule is the book's, not a measurement.`,
      }),
    );
  } else content.push(para(`**Fallout:** ${result.fallout.why}`));
  if (result.notes.length > 0) content.push(bullets(result.notes));
  return content;
}

function shelterSection(number: number, measure: number): Content[] {
  const source = sourceById(templateStep("radiation.during.2")?.step.source)!;
  const go = templateStep("radiation.during.1")?.step.quote ?? "";
  const close = templateStep("radiation.during.5")?.step.quote ?? "";
  return [
    sectionHeader(
      {
        number,
        title: "Where to shelter",
        subtitle: "In the UK Health Security Agency's words, from the radiation emergency template the planning section makes plans from.",
        id: "nuclear-shelter",
      },
      measure,
    ),
    callout("act", "Go in, stay in, tune in", [quote(go, "UKHSA"), quote(close, "UKHSA")]),
    figure(shelterDiagram(measure).svg, {
      width: measure,
      caption:
        "Outpost's drawing of the three sentences under it, in their order. The guidance gives no figure for how much each protects, so none is drawn.",
    }),
    quote(shelterQuote("vehicles"), "UKHSA"),
    quote(shelterQuote("buildings"), "UKHSA"),
    quote(shelterQuote("middle"), "UKHSA"),
    note(
      `${source.publisher}, “${source.title}” (${source.pageDate}), ${source.url}, checked ${source.checked}. Contains public sector information licensed under the Open Government Licence v3.0.`,
    ),
    callout(
      "know",
      "In a real emergency",
      para(
        "General preparedness information, not instructions for an emergency in progress. In a real emergency, follow what the emergency services and your local authorities say.",
        0,
      ),
    ),
  ];
}

export interface ScenarioPrintInput {
  written: Written[];
  dated: number;
  paper: PrintPaper;
  /** The maps, as print-maps.ts makes them; without, each scenario has its rings to scale. */
  figures?: ScenarioFigures;
  /** The maps' pictures by id, as data addresses. */
  pictures?: ReadonlyMap<string, string>;
}

/** The scenarios, laid out with the print kit. Pure. */
export function scenarioPrint({ written, dated, paper, figures, pictures }: ScenarioPrintInput): TDocumentDefinitions {
  const measure = measureOf(paper);
  const title = scenarioTitle(written);
  const several = written.length > 1;
  const blocks = (list: ScenarioFigures["overview"] | undefined) => (list && list.length > 0 ? mapContent(list, measure, pictures) : null);
  const parts: Array<{ kind: "section"; running: string; content: Content[] }> = [];
  const apart = callout(
    "know",
    "Separate illustrations",
    para(
      "Each scenario is worked out on its own, under its own letter. Nothing is added up across them: they are separate illustrations of what a published model says, not an estimate of anything happening together.",
      0,
    ),
  );
  const overview = blocks(figures?.overview);
  // The map of them all gets a page of its own; without one, the sentence that nothing is added up leads the first scenario.
  if (several && overview)
    parts.push({
      kind: "section",
      running: "All the scenarios",
      content: [
        sectionHeader(
          { number: "", title, subtitle: `${written.length} scenarios, each under its own letter.`, id: "scenario-all" },
          measure,
        ),
        apart,
        ...overview,
      ],
    });
  written.forEach((item, index) => {
    const content = scenarioSection(item, index, several, measure, figures ? blocks(figures.maps[item.letter]) : null);
    if (several && !overview && index === 0) content.splice(1, 0, apart);
    parts.push({
      kind: "section",
      running: several ? `${item.letter} · ${item.scenario.name}` : `${index + 1} · ${item.scenario.name}`,
      content,
    });
  });
  // Scenarios under letters when there are several, so what follows is numbered from 1; after one scenario, from 2.
  const next = several ? 1 : 2;
  parts.push({ kind: "section", running: `${next} · Where to shelter`, content: shelterSection(next, measure) });
  parts.push({
    kind: "section",
    running: `${next + 1} · Assumptions and source`,
    content: [
      sectionHeader({ number: next + 1, title: "Assumptions, limits and source", id: "nuclear-assumptions" }, measure),
      heading("Assumptions"),
      bullets([...EFFECTS_ASSUMPTIONS]),
      heading("Limitations"),
      bullets([...EFFECTS_LIMITATIONS]),
      heading("Source"),
      para(
        `${EFFECTS_SOURCE} Figures were read off the book's printed curves; section, figure and table numbers are the book's. No casualty figures are given.`,
      ),
    ],
  });
  return printDocument({
    paper,
    title,
    subject: "An educational estimate from a published model for an idealised case. Not a forecast and not instructions.",
    made: new Date(dated),
    footerName: title.length > 60 ? "Nuclear effects scenarios" : title,
    footerRight: `Scenario of ${longDate.format(new Date(dated))}`,
    parts,
  });
}

/**
 * The maps' blocks in the kit: a map's picture, frame, scale bar and north as a drawing
 * with its pictures, and the lines under it (which the block draws as text in the old
 * writer's measure) as the figure's caption in the book's type. Other blocks as the kit
 * prints them.
 */
function mapContent(blocks: Block[], measure: number, pictures: ReadonlyMap<string, string> = new Map()): Content[] {
  return blocks.flatMap((block) => {
    if (block.kind !== "drawing") return blocksToContent([block], measure);
    const items = block.draw(0, 0, measure);
    // A map's frame: the one rectangle round the picture, at the top. Without one (the rings to scale), the drawing is whole.
    const frame = items.some((item) => item.kind === "image")
      ? items.find((item): item is Extract<SheetItem, { kind: "rect" }> => item.kind === "rect" && item.y === 0)
      : undefined;
    const height = frame ? frame.height + FURNITURE - 4 : block.height;
    const kept = frame ? items.filter((item) => item.kind !== "text" || item.y < height) : items;
    return [
      figure(sheetItemsToSvg(kept, { x: 0, y: 0, width: measure, height }, pictures), {
        width: measure,
        caption: block.words,
      }),
    ];
  });
}

/** The scenarios as a PDF. */
export async function scenarioKitPdf(input: ScenarioPrintInput): Promise<{ bytes: Uint8Array; pages: number }> {
  return renderPdf(scenarioPrint(input));
}
