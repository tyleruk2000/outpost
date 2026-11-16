/**
 * Lines a page's typefaces cannot write, drawn as pictures.
 *
 * The PDF writer letters pages in Helvetica and Courier, which every reader supplies,
 * through an encoding of Western European letters (helvetica.ts). A name in Greek,
 * Polish, Arabic or Chinese cannot be written that way. Where such a line has to be
 * read on paper (a person's name on the emergency sheet, a place's name on a sheet of
 * sun times), it is drawn here by the browser, in the device's own type, as a small
 * picture placed where the line would have been. The browser draws every script the
 * device can show, joined and in the right direction, which a font carried in the file
 * by Outpost could not do without a shaping engine.
 *
 * A picture cannot be searched, so the same words are put over it as hidden text (the
 * PDF writer has a font for hidden words in any script). The library then finds the
 * name, and a reader that speaks the page reads it.
 *
 * Where the device will not draw (no canvas, or it refuses to make a picture), each
 * run of characters the typeface lacks is printed as "[?]" and the caller is told how
 * many lines were marked, so that the screen and the page can say so. Nothing is ever
 * transliterated or guessed.
 */
import { encodeWinAnsi } from "./helvetica";
import { PT_PER_INCH } from "./paper";
import { type PdfPicture, writePdfPages } from "./pdf";
import type { Sheet, SheetItem, SheetText } from "./sheet";

/** A line drawn as a picture: the picture, and its size and baseline in points. */
export interface DrawnLine {
  picture: PdfPicture;
  width: number;
  height: number;
  /** From the top of the picture down to the baseline of its letters. */
  baseline: number;
}

export type DrawLine = (item: SheetText) => Promise<DrawnLine>;

/** Whether the page's typefaces can write every character of a line. */
export const writable = (text: string): boolean => encodeWinAnsi(text) !== null;

/** What is printed for a run of characters the typeface lacks, where the line cannot be drawn as a picture. */
export const UNWRITABLE_MARK = "[?]";

/** The line with each run of characters the typeface lacks put as "[?]". */
export function markUnwritable(text: string): string {
  let out = "";
  let inRun = false;
  for (const character of text) {
    if (writable(character)) {
      out += character;
      inRun = false;
    } else if (!inRun) {
      out += UNWRITABLE_MARK;
      inRun = true;
    }
  }
  return out;
}

const blobOf = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("This browser would not make a picture."))), "image/jpeg", 0.95),
  );

/** Draws a line with the browser's own type at 300 to the inch, on white (a JPEG has no transparency). */
export async function canvasLine(item: SheetText): Promise<DrawnLine> {
  const density = 300 / PT_PER_INCH;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw.");
  const family = item.mono ? '"Courier New", Courier, monospace' : '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const font = `${item.bold ? "700" : "400"} ${item.size * density}px ${family}`;
  context.font = font;
  const width = Math.max(1, Math.ceil(context.measureText(item.text).width));
  const height = Math.ceil(item.size * density * 1.5);
  const baseline = Math.round(item.size * density * 1.1);
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.font = font;
  context.fillStyle = `rgb(${item.color.map((part) => Math.round(part * 255)).join(" ")})`;
  context.fillText(item.text, 0, baseline);
  const jpeg = new Uint8Array(await (await blobOf(canvas)).arrayBuffer());
  canvas.width = 0;
  return { picture: { jpeg, width, height }, width: width / density, height: height / density, baseline: baseline / density };
}

/**
 * A line as a picture placed where its letters would have stood, made smaller if it
 * would be wider than `fit`, with the words hidden over it.
 */
export async function lineAsPicture(
  item: SheetText,
  id: string,
  draw: DrawLine = canvasLine,
): Promise<{ items: SheetItem[]; picture: PdfPicture }> {
  const drawn = await draw(item);
  const shrink = item.fit && drawn.width > item.fit ? item.fit / drawn.width : 1;
  const width = drawn.width * shrink;
  const height = drawn.height * shrink;
  const x = item.anchor === "end" ? item.x - width : item.anchor === "middle" ? item.x - width / 2 : item.x;
  return {
    items: [
      { kind: "image", id, x, y: item.y - drawn.baseline * shrink, width, height },
      { kind: "text", x, y: item.y, text: item.text, size: item.size * shrink, color: item.color, hidden: true, fit: width },
    ],
    picture: drawn.picture,
  };
}

export interface Lettered {
  pages: Sheet[];
  pictures: Map<string, PdfPicture>;
  /** Lines drawn as pictures. */
  drawn: number;
  /** Lines printed with "[?]" because the device would not draw them. */
  marked: number;
}

/**
 * The pages with every visible line the typefaces cannot write drawn as a picture.
 * Lines turned to read upwards are left as they are (nothing here makes one).
 */
export async function letterPages(pages: readonly Sheet[], draw: DrawLine = canvasLine): Promise<Lettered> {
  const pictures = new Map<string, PdfPicture>();
  let drawn = 0;
  let marked = 0;
  let canDraw = true;
  const out: Sheet[] = [];
  for (const page of pages) {
    const items: SheetItem[] = [];
    for (const item of page.items) {
      if (item.kind !== "text" || item.hidden || item.upward || writable(item.text)) {
        items.push(item);
        continue;
      }
      if (canDraw) {
        try {
          const id = `lettering-${drawn + 1}`;
          const made = await lineAsPicture(item, id, draw);
          pictures.set(id, made.picture);
          items.push(...made.items);
          drawn += 1;
          continue;
        } catch {
          // A device that cannot draw one line will not draw the next: every line after this is marked.
          canDraw = false;
        }
      }
      marked += 1;
      items.push({ ...item, text: markUnwritable(item.text) });
      // The words themselves are still put in the file, unseen, for search.
      items.push({ ...item, hidden: true });
    }
    out.push({ ...page, items });
  }
  return { pages: out, pictures, drawn, marked };
}

/** Pages lettered as above and written as a PDF: the bytes, and how many lines were drawn or marked. */
export async function writeLettered(
  pages: readonly Sheet[],
  title: string,
  created: Date,
  draw: DrawLine = canvasLine,
): Promise<{ bytes: Uint8Array; pages: number; drawn: number; marked: number }> {
  const lettered = await letterPages(pages, draw);
  return {
    bytes: writePdfPages({ pages: lettered.pages, pictures: lettered.pictures, title, created }),
    pages: lettered.pages.length,
    drawn: lettered.drawn,
    marked: lettered.marked,
  };
}

/** A device that draws nothing: for writing a file with every line it cannot write marked. */
export const cannotDraw: DrawLine = () => Promise.reject(new Error("Not drawn."));
