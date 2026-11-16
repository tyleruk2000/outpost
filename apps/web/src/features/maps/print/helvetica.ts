/**
 * What the PDF's lettering needs to know about its typeface.
 *
 * The page is lettered in Helvetica, one of the fourteen typefaces every PDF reader
 * must supply itself, so the file carries no font and its words stay real text: they
 * can be selected and searched, and are sharp at any size. The price is the character
 * set. A standard font is addressed through one byte per character, here in the
 * "WinAnsi" encoding (Windows code page 1252): Latin letters with western European
 * accents, and signs such as © and °. Text with anything else in it (a title in
 * Greek, say) cannot be written this way; `encodeWinAnsi` returns null for it and the
 * caller draws that one line as a picture instead.
 *
 * The widths are needed to centre and right-align text and to break lines, since a PDF
 * has no notion of either. They are the advance widths from Adobe's metrics for the
 * Core 14 fonts (Helvetica.afm and Helvetica-Bold.afm), in thousandths of the type
 * size, for the characters at bytes 32 to 255 of the encoding, in order. Adobe's notice
 * for those files: "This file and the 14 PostScript(R) AFM files it accompanies may be
 * used, copied, and distributed for any purpose and without charge, with or without
 * modification, provided that all copyright notices are retained; that the AFM files
 * are not distributed without this file; that all modifications to this file or any of
 * the AFM files are prominently noted in the modified file(s); and that this paragraph
 * is not modified. Adobe Systems has no responsibility or liability for any use of the
 * AFM files. Copyright (c) 1985, 1987, 1989, 1990, 1997 Adobe Systems Incorporated.
 * All Rights Reserved." What is here is the widths alone, re-ordered by byte.
 */

// biome-ignore format: a table of 224 numbers reads best as a block
const REGULAR = [
  278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,
  556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,
  278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,
  667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,
  556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500,
];

// biome-ignore format: as above
const BOLD = [
  278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
  975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
  333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,
  556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,
  278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,
  722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,
  556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556,
];

/** Bytes 128 to 159 of code page 1252, which are not where Unicode keeps those characters. Zero marks a byte with no character. */
// biome-ignore format: a table
const HIGH = [
  0x20ac,0,0x201a,0x0192,0x201e,0x2026,0x2020,0x2021,0x02c6,0x2030,0x0160,0x2039,0x0152,0,0x017d,0,
  0,0x2018,0x2019,0x201c,0x201d,0x2022,0x2013,0x2014,0x02dc,0x2122,0x0161,0x203a,0x0153,0,0x017e,0x0178,
];

const BYTE_OF = new Map<number, number>();
for (let byte = 32; byte <= 126; byte += 1) BYTE_OF.set(byte, byte);
for (let byte = 160; byte <= 255; byte += 1) BYTE_OF.set(byte, byte);
HIGH.forEach((codePoint, index) => {
  if (codePoint) BYTE_OF.set(codePoint, 128 + index);
});

/** The bytes of a line of text in the encoding, or null if any character has no byte. */
export function encodeWinAnsi(text: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const character of text) {
    const byte = BYTE_OF.get(character.codePointAt(0)!);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

/** The width of a line of text at `size` points. Characters outside the encoding count as an average letter. */
export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? BOLD : REGULAR;
  let thousandths = 0;
  for (const character of text) {
    const byte = BYTE_OF.get(character.codePointAt(0)!);
    thousandths += byte === undefined ? 556 : table[byte - 32]!;
  }
  return (thousandths * size) / 1000;
}

/** Breaks text into lines no wider than `maxWidth`, at spaces. A single word wider than the line is left whole. */
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, size, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

/** Shortens text to fit `maxWidth`, ending it with an ellipsis when anything was cut. */
export function fitText(text: string, size: number, maxWidth: number, bold = false): string {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  const characters = [...text];
  while (characters.length > 1 && textWidth(`${characters.join("").trimEnd()}…`, size, bold) > maxWidth) characters.pop();
  return `${characters.join("").trimEnd()}…`;
}
