/**
 * Arabic and Hebrew in a document: loaded by render.ts only when a document has them.
 *
 * Text is put in drawn order by bidi-js (MIT; order.ts). pdfmake's own text is then shaped
 * by fontkit inside pdfmake, Arabic letters joined. A drawing's text is not: pdfmake draws
 * SVG with svg-to-pdfkit, which leaves out every glyph of no width, and Noto Sans Arabic
 * draws the dots of its letters as such glyphs, so ب, ت, ن and ي would print without them.
 * So a drawing's `<text>` holding Arabic or Hebrew is drawn here as shapes, with fontkit
 * (MIT): every word of it, in the same fonts and at the same place, with the same words
 * laid over it as invisible text, so that a search still finds them.
 */
import bidiFactory from "bidi-js";
import { create, type Font, registerFormat, registerShaper } from "fontkit/core";
import { TTFFont } from "fontkit/formats/TTFFont";
import { ArabicShaper } from "fontkit/shapers/ArabicShaper";
import { HebrewShaper } from "fontkit/shapers/HebrewShaper";
import { FALLBACK_LOADERS, type FallbackFont, orderedRuns, type RightToLeft } from "./fallback";
import { FONT_FILES } from "./fonts";
import { PRINT_FONT } from "./tokens";

registerFormat(TTFFont);
registerShaper(ArabicShaper);
registerShaper(HebrewShaper);

const fromBase64 = (data: string): Uint8Array => Uint8Array.from(atob(data), (character) => character.charCodeAt(0));

/** The book's own regular or bold, or a fallback in its regular or (where it has one) its bold. */
type FaceName = "regular" | "bold" | FallbackFont | `${FallbackFont} bold`;
const faces = new Map<FaceName, Font>();

async function face(name: FaceName): Promise<Font> {
  let font = faces.get(name);
  if (!font) {
    let data: string;
    if (name === "regular") data = FONT_FILES["Atkinson-Regular.ttf"]!;
    else if (name === "bold") data = FONT_FILES["Atkinson-Bold.ttf"]!;
    else {
      const [fallback, weight] = name.split(" ") as [FallbackFont, string | undefined];
      const files = await FALLBACK_LOADERS[fallback]();
      data = weight === "bold" ? files.bold : files.regular;
    }
    font = create(fromBase64(data));
    faces.set(name, font);
  }
  return font;
}

/** Attributes kept on the group that stands for a drawing's `<text>`. */
const KEPT = ["transform", "opacity", "fill-opacity", "clip-path", "id"];
/** Attributes this drawing does not follow: such a `<text>` is left to `<tspan>`s. */
const UNFOLLOWED = ["dx", "dy", "rotate", "textLength", "lengthAdjust", "letter-spacing", "word-spacing", "style", "class"];

const attributesOf = (open: string): Map<string, string> =>
  new Map([...open.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((match) => [match[1]!, match[2]!]));

const encode = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const number = (value: number) => String(Math.round(value * 100) / 100);

/**
 * What puts Arabic and Hebrew in drawn order, with the fonts loaded to draw a drawing's
 * words: the book's regular and bold, and the fallbacks the document uses.
 */
export async function loadRightToLeft(fallbacks: ReadonlySet<FallbackFont>): Promise<RightToLeft> {
  const bidi = bidiFactory();
  const names: FaceName[] = ["regular", "bold", ...fallbacks, ...[...fallbacks].map((font) => `${font} bold` as const)];
  await Promise.all(names.map(face));
  const drawText = (open: string, words: string) => {
    const attributes = attributesOf(open);
    if (UNFOLLOWED.some((name) => attributes.has(name))) return null;
    const x = Number(attributes.get("x") ?? 0);
    const y = Number(attributes.get("y") ?? 0);
    const size = Number.parseFloat(attributes.get("font-size") ?? "16");
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(size > 0)) return null;
    const weight = attributes.get("font-weight") ?? "normal";
    const bold = weight === "bold" || weight === "bolder" || Number(weight) >= 600;
    const fill = attributes.get("fill") ?? "#000";
    const pieces = orderedRuns(words.replace(/\s+/g, " ").trim(), { bidi });
    if (pieces.some((run) => run.font && !faces.has(run.font))) return null;
    const runs = pieces.map((run) => {
      const font = faces.get(run.font ? (bold ? `${run.font} bold` : run.font) : bold ? "bold" : "regular")!;
      const scale = size / font.unitsPerEm;
      const laid = font.layout(run.text);
      const width = laid.positions.reduce((sum, position) => sum + position.xAdvance * scale, 0);
      return { ...run, laid, scale, width };
    });
    const width = runs.reduce((sum, run) => sum + run.width, 0);
    const anchor = attributes.get("text-anchor") ?? "start";
    let pen = x - width * (anchor === "middle" ? 0.5 : anchor === "end" ? 1 : 0);
    const parts: string[] = [];
    const starts: number[] = [];
    for (const { laid, scale } of runs) {
      starts.push(pen);
      laid.glyphs.forEach((glyph, index) => {
        const position = laid.positions[index]!;
        const left = pen + position.xOffset * scale;
        const base = y - position.yOffset * scale;
        const at = (args: number[]) => {
          const points: string[] = [];
          for (let i = 0; i < args.length; i += 2) points.push(`${number(left + args[i]! * scale)},${number(base - args[i + 1]! * scale)}`);
          return points.join(" ");
        };
        for (const { command, args } of glyph.path.commands) {
          if (command === "moveTo") parts.push(`M${at(args)}`);
          else if (command === "lineTo") parts.push(`L${at(args)}`);
          else if (command === "quadraticCurveTo") parts.push(`Q${at(args)}`);
          else if (command === "bezierCurveTo") parts.push(`C${at(args)}`);
          else parts.push("Z");
        }
        pen += position.xAdvance * scale;
      });
    }
    const d = parts.join("");
    const kept = KEPT.filter((name) => attributes.has(name))
      .map((name) => ` ${name}="${attributes.get(name)}"`)
      .join("");
    const fonts = runs.flatMap((run) => (run.font ? [run.font] : []));
    // The words again, unseen, each piece where its shapes are, so that a search and a copy find them.
    const hidden = runs
      .map(
        (run, index) =>
          `<text x="${number(starts[index]!)}" y="${number(y)}" font-family="${run.font ?? PRINT_FONT}" font-size="${number(size)}"${bold ? ' font-weight="bold"' : ""} fill="#000" fill-opacity="0.001">${encode(run.text)}</text>`,
      )
      .join("");
    return { svg: `<g${kept}><path d="${d}" fill="${fill}"/>${hidden}</g>`, fonts };
  };
  return { bidi, drawText };
}
