/**
 * Draws a Mermaid diagram as a picture.
 *
 * Mermaid turns a diagram's text into SVG. In Outpost that text can come from any
 * Markdown file a person uploads, so the SVG is never put into the page as markup.
 * It is drawn in a hidden corner of the page, where Mermaid can measure its lettering,
 * and then handed over as an image file (`<img>` with a blob address). An SVG shown as
 * an image cannot run script, follow a link or load anything, whatever it contains.
 *
 * Three settings do the rest (Mermaid 12; see its `MermaidConfig`):
 *  - `securityLevel: "strict"`: Mermaid's own cleaning of labels and no click handlers;
 *  - `htmlLabels: false`: labels are SVG text, not HTML inside the SVG, which an image
 *    would not show reliably and which is the part of Mermaid's output hardest to trust;
 *  - `secure`: the settings a diagram may not change for itself with an `init`
 *    directive or front matter, which here is every one that matters: it may not turn
 *    HTML labels back on, restyle itself, or pick another layout engine.
 *
 * This module is loaded only when a document has a diagram: Mermaid is large.
 */
import fontFile from "@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2?inline";
import mermaid from "mermaid";

/** The design tokens a diagram is drawn with, as colours Mermaid's own colour maths can read. */
export interface DiagramPalette {
  dark: boolean;
  page: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  borderStrong: string;
  ink: string;
  inkMuted: string;
  primary: string;
  primarySoft: string;
  primarySoftInk: string;
}

export interface DrawnDiagram {
  /** A blob address of the SVG. The caller revokes it when the picture is no longer shown. */
  url: string;
  /** Size in CSS pixels at which the lettering is the size it was drawn at. */
  width: number;
  height: number;
  /** What the diagram shows, in words: its kind and the labels in it. */
  description: string;
}

const TOKENS: Record<Exclude<keyof DiagramPalette, "dark">, string> = {
  page: "--page",
  surface: "--surface",
  surfaceStrong: "--surface-strong",
  border: "--border",
  borderStrong: "--border-strong",
  ink: "--ink",
  inkMuted: "--ink-muted",
  primary: "--primary",
  primarySoft: "--primary-soft",
  primarySoftInk: "--primary-soft-ink",
};

/** Used only where the tokens cannot be read (no canvas): the tokens' values as a browser gives them in sRGB. */
const FALLBACK: Record<"light" | "dark", Omit<DiagramPalette, "dark">> = {
  light: {
    page: "#ffffff",
    surface: "#f3f7f7",
    surfaceStrong: "#e8eeee",
    border: "#dbe1e1",
    borderStrong: "#bdc6c7",
    ink: "#111a1d",
    inkMuted: "#495559",
    primary: "#096165",
    primarySoft: "#def3f4",
    primarySoftInk: "#003f42",
  },
  dark: {
    page: "#121718",
    surface: "#191f20",
    surfaceStrong: "#1f2729",
    border: "#293133",
    borderStrong: "#3f4a4c",
    ink: "#e5ebec",
    inkMuted: "#a3adaf",
    primary: "#64c3c3",
    primarySoft: "#0e3133",
    primarySoftInk: "#a9e5e4",
  },
};

const hex = (value: number) => value.toString(16).padStart(2, "0");

/**
 * Reads the design tokens as they are right now, light or dark. The tokens are written
 * in OKLCH, which Mermaid cannot do arithmetic on, so each is painted onto a one-pixel
 * canvas and read back as the sRGB colour the browser makes of it.
 */
export function readPalette(): DiagramPalette {
  const dark = document.documentElement.dataset.theme === "dark";
  const fallback = FALLBACK[dark ? "dark" : "light"];
  let context: CanvasRenderingContext2D | null = null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    context = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    context = null;
  }
  if (!context) return { dark, ...fallback };
  const style = getComputedStyle(document.documentElement);
  const palette = { dark, ...fallback };
  for (const [name, token] of Object.entries(TOKENS) as Array<[keyof typeof TOKENS, string]>) {
    const value = style.getPropertyValue(token).trim();
    if (!value) continue;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000000";
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
    if (alpha === 255) palette[name] = `#${hex(red)}${hex(green)}${hex(blue)}`;
  }
  return palette;
}

/** The functional face. It is embedded in each picture, because an image cannot use the page's fonts. */
const FACE = "Atkinson Hyperlegible Next Variable";
const FONT_FAMILY = `"${FACE}", system-ui, -apple-system, "Segoe UI", sans-serif`;
const FONT_SIZE = 14;

/** Settings a diagram's own text may not override. Mermaid's defaults, and everything about how it is drawn. */
const SECURE = [
  "secure",
  "securityLevel",
  "startOnLoad",
  "maxTextSize",
  "suppressErrorRendering",
  "maxEdges",
  "htmlLabels",
  "theme",
  "themeVariables",
  "themeCSS",
  "darkMode",
  "look",
  "layout",
  "fontFamily",
  "altFontFamily",
  "fontSize",
  "logLevel",
  "arrowMarkerAbsolute",
  "dompurifyConfig",
  "deterministicIds",
  "deterministicIDSeed",
  "legacyMathML",
  "forceLegacyMathML",
  "flowchart",
  "sequence",
  "elk",
];

export function diagramConfig(palette: DiagramPalette): Parameters<typeof mermaid.initialize>[0] {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    secure: SECURE,
    suppressErrorRendering: true,
    // The handbook's diagrams were laid out with dagre; ELK, Mermaid 12's default, arranges them differently.
    layout: "dagre",
    look: "classic",
    maxTextSize: 20_000,
    maxEdges: 300,
    logLevel: "fatal",
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    theme: "base",
    darkMode: palette.dark,
    themeVariables: {
      darkMode: palette.dark,
      fontFamily: FONT_FAMILY,
      fontSize: `${FONT_SIZE}px`,
      background: palette.page,
      // Boxes are quiet panels with a firm outline; colour is kept for what a note says.
      primaryColor: palette.surface,
      primaryTextColor: palette.ink,
      primaryBorderColor: palette.borderStrong,
      secondaryColor: palette.surfaceStrong,
      secondaryTextColor: palette.ink,
      secondaryBorderColor: palette.borderStrong,
      tertiaryColor: palette.page,
      tertiaryTextColor: palette.ink,
      tertiaryBorderColor: palette.border,
      mainBkg: palette.surface,
      nodeBorder: palette.borderStrong,
      nodeTextColor: palette.ink,
      textColor: palette.ink,
      titleColor: palette.ink,
      lineColor: palette.inkMuted,
      defaultLinkColor: palette.inkMuted,
      edgeLabelBackground: palette.page,
      clusterBkg: palette.page,
      clusterBorder: palette.border,
      // Sequence diagrams
      actorBkg: palette.surface,
      actorBorder: palette.borderStrong,
      actorTextColor: palette.ink,
      actorLineColor: palette.borderStrong,
      signalColor: palette.inkMuted,
      signalTextColor: palette.ink,
      labelBoxBkgColor: palette.surface,
      labelBoxBorderColor: palette.borderStrong,
      labelTextColor: palette.ink,
      loopTextColor: palette.ink,
      noteBkgColor: palette.primarySoft,
      noteBorderColor: palette.primary,
      noteTextColor: palette.primarySoftInk,
      activationBkgColor: palette.surfaceStrong,
      activationBorderColor: palette.borderStrong,
      sequenceNumberColor: palette.page,
    },
    // Set a little closer than Mermaid's defaults, and with labels wrapping sooner: a diagram that is
    // narrower needs less sideways scrolling on a phone, at the same size of lettering.
    flowchart: { curve: "basis", padding: 12, nodeSpacing: 30, rankSpacing: 34, wrappingWidth: 160, diagramPadding: 4, useMaxWidth: false },
    sequence: {
      useMaxWidth: false,
      mirrorActors: false,
      diagramMarginX: 8,
      diagramMarginY: 8,
      actorMargin: 40,
      width: 130,
      height: 48,
      boxMargin: 8,
      messageMargin: 30,
      wrap: true,
    },
  };
}

const KINDS: Array<[RegExp, string]> = [
  [/^flowchart/, "Flow chart"],
  [/^sequence/, "Sequence diagram"],
  [/^state/, "State diagram"],
  [/^class/, "Class diagram"],
  [/^er/, "Entity relationship diagram"],
  [/^gantt/, "Gantt chart"],
  [/^pie/, "Pie chart"],
  [/^timeline/, "Timeline"],
  [/^mindmap/, "Mind map"],
];

/** The words a diagram holds, for people who cannot see it: its kind, any title its author gave it, and its labels. */
export function describeDiagram(svg: SVGSVGElement): string {
  const role = svg.getAttribute("aria-roledescription") ?? "";
  const kind = KINDS.find(([pattern]) => pattern.test(role))?.[1] ?? "Diagram";
  const title = svg.querySelector(":scope > title")?.textContent?.trim();
  const summary = svg.querySelector(":scope > desc")?.textContent?.trim();
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const element of svg.querySelectorAll("text")) {
    // A label broken over several lines is one row of the text per line; read them with spaces between.
    const rows = [...element.children].filter((child) => child.nodeName === "tspan");
    const words = rows.length > 0 ? rows.map((row) => row.textContent ?? "").join(" ") : (element.textContent ?? "");
    const label = words.replace(/\s+/g, " ").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length === 40) break;
  }
  const parts = [title ? `${kind}: ${title}` : kind, summary, labels.length > 0 ? `It shows: ${labels.join("; ")}` : null];
  return parts.filter(Boolean).join(". ").slice(0, 1500);
}

/**
 * Makes Mermaid's SVG into a picture that stands on its own: sized in pixels, carrying
 * its font, and with nothing left in it that is not drawing. An image would ignore
 * script and handlers anyway; they are removed so that the file is also safe to look at
 * as a file.
 */
export function standalone(markup: string): { svg: string; width: number; height: number; description: string } {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = parsed.documentElement as unknown as SVGSVGElement;
  if (svg.nodeName !== "svg" || parsed.querySelector("parsererror")) throw new Error("The diagram was not drawn as an SVG picture.");
  for (const element of [
    ...parsed.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video, image, use[href^='http'], a"),
  ]) {
    // A link is replaced by what it wraps; everything else here has no place in a drawing of boxes and lines.
    if (element.nodeName === "a") element.replaceWith(...element.childNodes);
    else element.remove();
  }
  for (const element of parsed.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const external = (name === "href" || name === "xlink:href") && !attribute.value.startsWith("#");
      if (name.startsWith("on") || external) element.removeAttribute(attribute.name);
    }
  }
  const box = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const width = Math.ceil(box[2] ?? Number.NaN);
  const height = Math.ceil(box[3] ?? Number.NaN);
  if (!(width > 0 && height > 0 && width < 20_000 && height < 20_000)) throw new Error("The diagram has no size.");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.removeAttribute("style");
  const description = describeDiagram(svg);
  const face = parsed.createElementNS("http://www.w3.org/2000/svg", "style");
  face.textContent = `@font-face{font-family:"${FACE}";font-style:normal;font-weight:100 900;src:url(${fontFile}) format("woff2-variations")}`;
  svg.insertBefore(face, svg.firstChild);
  return { svg: new XMLSerializer().serializeToString(svg), width, height, description };
}

let configured: string | undefined;
let counter = 0;
let queue: Promise<unknown> = Promise.resolve();
let fontReady: Promise<unknown> | undefined;

async function draw(source: string, palette: DiagramPalette): Promise<DrawnDiagram> {
  // Mermaid measures labels in the page, with the page's copy of the font: wait until it is there.
  fontReady ??= document.fonts?.load(`${FONT_SIZE}px "${FACE}"`).catch(() => undefined) ?? Promise.resolve();
  await fontReady;
  const key = JSON.stringify(palette);
  if (configured !== key) {
    mermaid.initialize(diagramConfig(palette));
    configured = key;
  }
  // Somewhere to draw that nobody sees, hears or tabs into. It is wide, so that no diagram is squeezed by it.
  const corner = document.createElement("div");
  corner.setAttribute("aria-hidden", "true");
  corner.inert = true;
  corner.style.cssText = `position:absolute;left:-20000px;top:0;width:4000px;visibility:hidden;pointer-events:none;font-family:${FONT_FAMILY};font-size:${FONT_SIZE}px;line-height:1.5`;
  document.body.append(corner);
  counter += 1;
  try {
    const { svg } = await mermaid.render(`outpost-diagram-${counter}`, source, corner);
    const picture = standalone(svg);
    const url = URL.createObjectURL(new Blob([picture.svg], { type: "image/svg+xml" }));
    return { url, width: picture.width, height: picture.height, description: picture.description };
  } finally {
    corner.remove();
    // Mermaid leaves its working element behind when it fails part-way.
    document.getElementById(`doutpost-diagram-${counter}`)?.remove();
  }
}

/**
 * Draws one diagram. Diagrams are drawn one at a time: Mermaid keeps its settings in one
 * place, and two drawn at once in different themes would share them.
 * Rejects when the text is not a diagram Mermaid can draw.
 */
export function drawDiagram(source: string, palette: DiagramPalette): Promise<DrawnDiagram> {
  const next = queue.then(
    () => draw(source, palette),
    () => draw(source, palette),
  );
  queue = next.catch(() => undefined);
  return next;
}
