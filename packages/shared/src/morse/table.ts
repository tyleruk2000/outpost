/**
 * The Morse code: the characters the trainer sends and reads, written for display
 * with `·` (U+00B7) and `−` (U+2212), and the same patterns in plain ASCII ('.' and
 * '-') with lookups both ways. The code is ITU-R M.1677-1, International Morse code;
 * the table is written out here, not copied from that document.
 *
 * Prosigns are written in text as `<AR>`, `<SK>`, … and sent as one run with no gaps
 * between their letters.
 */

export interface MorseEntry {
  char: string;
  code: string;
}

export const MORSE_LETTERS: MorseEntry[] = [
  { char: "A", code: "·−" },
  { char: "B", code: "−···" },
  { char: "C", code: "−·−·" },
  { char: "D", code: "−··" },
  { char: "E", code: "·" },
  { char: "F", code: "··−·" },
  { char: "G", code: "−−·" },
  { char: "H", code: "····" },
  { char: "I", code: "··" },
  { char: "J", code: "·−−−" },
  { char: "K", code: "−·−" },
  { char: "L", code: "·−··" },
  { char: "M", code: "−−" },
  { char: "N", code: "−·" },
  { char: "O", code: "−−−" },
  { char: "P", code: "·−−·" },
  { char: "Q", code: "−−·−" },
  { char: "R", code: "·−·" },
  { char: "S", code: "···" },
  { char: "T", code: "−" },
  { char: "U", code: "··−" },
  { char: "V", code: "···−" },
  { char: "W", code: "·−−" },
  { char: "X", code: "−··−" },
  { char: "Y", code: "−·−−" },
  { char: "Z", code: "−−··" },
];

export const MORSE_DIGITS: MorseEntry[] = [
  { char: "1", code: "·−−−−" },
  { char: "2", code: "··−−−" },
  { char: "3", code: "···−−" },
  { char: "4", code: "····−" },
  { char: "5", code: "·····" },
  { char: "6", code: "−····" },
  { char: "7", code: "−−···" },
  { char: "8", code: "−−−··" },
  { char: "9", code: "−−−−·" },
  { char: "0", code: "−−−−−" },
];

export const MORSE_PUNCTUATION: MorseEntry[] = [
  { char: ".", code: "·−·−·−" },
  { char: ",", code: "−−··−−" },
  { char: "?", code: "··−−··" },
  { char: "/", code: "−··−·" },
  { char: "=", code: "−···−" },
  { char: "+", code: "·−·−·" },
  { char: "@", code: "·−−·−·" },
];

export interface MorseProsign {
  sign: string;
  code: string;
  meaning: string;
}

/** Prosigns are sent as one run with no inter-letter gaps. */
export const MORSE_PROSIGNS: MorseProsign[] = [
  { sign: "AR", code: "·−·−·", meaning: "End of message" },
  { sign: "SK", code: "···−·−", meaning: "End of contact" },
  { sign: "BT", code: "−···−", meaning: "Break, a new paragraph (the same as =)" },
  { sign: "KN", code: "−·−−·", meaning: "Go ahead, only the station called" },
  { sign: "AS", code: "·−···", meaning: "Wait" },
  { sign: "SOS", code: "···−−−···", meaning: "Distress: only ever in a real emergency" },
];

export const DIT = ".";
export const DAH = "-";

/** Display glyphs used across the app (toolbox reference + trainer UI). */
export const DIT_GLYPH = "·";
export const DAH_GLYPH = "−";

export function toAscii(displayCode: string): string {
  return displayCode.replaceAll(DIT_GLYPH, DIT).replaceAll(DAH_GLYPH, DAH);
}

export function toDisplay(asciiCode: string): string {
  return asciiCode.replaceAll(DIT, DIT_GLYPH).replaceAll(DAH, DAH_GLYPH);
}

/** char (upper-case) → ascii pattern, e.g. 'A' → '.-' */
export const MORSE_MAP: ReadonlyMap<string, string> = new Map(
  [...MORSE_LETTERS, ...MORSE_DIGITS, ...MORSE_PUNCTUATION].map((e) => [e.char.toUpperCase(), toAscii(e.code)]),
);

/** prosign (e.g. 'AR') → ascii pattern. Keyed without angle brackets. */
export const PROSIGN_MAP: ReadonlyMap<string, string> = new Map(MORSE_PROSIGNS.map((p) => [p.sign.toUpperCase(), toAscii(p.code)]));

/** ascii pattern → char. Prosigns are included as '<AR>' style tokens where the
 * pattern is not already claimed by a plain character (e.g. '.-.-.'  is both
 * '+' and <AR>; the plain character wins so decoding stays unsurprising). */
export const REVERSE_MAP: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [char, code] of MORSE_MAP) if (!m.has(code)) m.set(code, char);
  for (const [sign, code] of PROSIGN_MAP) if (!m.has(code)) m.set(code, `<${sign}>`);
  return m;
})();

/** Look up the pattern for a single character (case-insensitive). */
export function encodeChar(char: string): string | undefined {
  return MORSE_MAP.get(char.toUpperCase());
}

/** Look up the pattern for a prosign token, with or without angle brackets. */
export function encodeProsign(sign: string): string | undefined {
  return PROSIGN_MAP.get(sign.replace(/[<>]/g, "").toUpperCase());
}

/** Decode one ascii element pattern back to a character or '<PROSIGN>'. */
export function decodeElements(pattern: string): string | undefined {
  return REVERSE_MAP.get(pattern);
}

/**
 * Tokenise a line of text into sendable tokens.
 * - `<AR>` style prosigns become single tokens (no inner letter gaps)
 * - every other supported character is its own token
 * - runs of whitespace collapse to a single word-gap token `' '`
 * - unsupported characters are dropped
 */
export type MorseToken = { kind: "char"; char: string; code: string } | { kind: "prosign"; sign: string; code: string } | { kind: "space" };

export function tokenize(text: string): MorseToken[] {
  const out: MorseToken[] = [];
  let i = 0;
  const s = text.toUpperCase();
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      if (out.length > 0 && out[out.length - 1]!.kind !== "space") out.push({ kind: "space" });
      i += 1;
      continue;
    }
    if (ch === "<") {
      const close = s.indexOf(">", i);
      if (close > i) {
        const sign = s.slice(i + 1, close);
        const code = PROSIGN_MAP.get(sign);
        if (code) {
          out.push({ kind: "prosign", sign, code });
          i = close + 1;
          continue;
        }
      }
      i += 1;
      continue;
    }
    const code = MORSE_MAP.get(ch);
    if (code) out.push({ kind: "char", char: ch, code });
    i += 1;
  }
  while (out.length > 0 && out[out.length - 1]!.kind === "space") out.pop();
  return out;
}

/** All characters the trainer can send/grade (letters, digits, punctuation). */
export const ALL_CHARS: readonly string[] = [...MORSE_MAP.keys()];
