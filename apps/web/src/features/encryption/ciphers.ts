/**
 * Ciphers that can be worked with pencil and paper.
 *
 * Each function does what a person would do by hand and also returns its working (the
 * shifted alphabet, the square, the zigzag, the grid), so that the screen can show the
 * steps with the person's own message. The rules follow the usual published
 * descriptions, and `ciphers.test.ts` checks every one against a published worked
 * example; docs/encryption.md lists them.
 *
 * None of these is secure except the one-time pad, and that only when it is used as
 * its rules demand. The screen says so; nothing here pretends otherwise.
 */

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const A = 65;

export type Direction = "encipher" | "decipher";

/** A message or key that the cipher's rules cannot work with, in words for the person. */
export class CipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CipherError";
  }
}

export interface Reduced {
  /** What is left to work with, in capitals. */
  text: string;
  /** Digits that were left out (a cipher over letters cannot carry them: spell numbers out). */
  digits: number;
  /** Other characters left out, not counting spaces and line breaks. */
  others: number;
}

/**
 * The letters A to Z of a text, in capitals. Accents are removed (é becomes E, ß
 * becomes SS); spaces, punctuation and everything else are left out, as they are when
 * a message is prepared by hand. With `digits`, the figures 0 to 9 are kept too, which
 * a transposition can carry because it only moves characters about.
 */
export function reduce(text: string, options: { digits?: boolean } = {}): Reduced {
  const plain = text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toUpperCase();
  let kept = "";
  let digits = 0;
  let others = 0;
  for (const character of plain) {
    if (character >= "A" && character <= "Z") kept += character;
    else if (character >= "0" && character <= "9") {
      if (options.digits) kept += character;
      else digits += 1;
    } else if (!/\s/u.test(character)) others += 1;
  }
  return { text: kept, digits, others };
}

/** "ATTACKATDAWN" → "ATTAC KATDA WN": how ciphertext is written down and read out. */
export function inGroups(text: string, size = 5): string {
  const groups: string[] = [];
  for (let at = 0; at < text.length; at += size) groups.push(text.slice(at, at + size));
  return groups.join(" ");
}

const mod = (value: number, by: number) => ((value % by) + by) % by;
const code = (letter: string) => letter.charCodeAt(0) - A;
const letter = (value: number) => String.fromCharCode(A + mod(value, 26));

/** Shifts one character if it is an unaccented letter, keeping its case; anything else is returned as it is. */
function shiftCharacter(character: string, by: number): string {
  if (character >= "A" && character <= "Z") return letter(code(character) + by);
  if (character >= "a" && character <= "z") return letter(code(character.toUpperCase()) + by).toLowerCase();
  return character;
}

// ── Caesar and ROT13 ────────────────────────────────────────────────────────

export interface CaesarWorking {
  output: string;
  /** The shift actually used, 0 to 25, as a shift to the right when enciphering. */
  shift: number;
  /** The alphabet each plain letter is replaced from: `cipherAlphabet[i]` stands for `ALPHABET[i]`. */
  cipherAlphabet: string;
}

/**
 * Replaces each letter by the one `shift` places further on in the alphabet, wrapping
 * round (a right shift; a left shift of 3 is a right shift of 23). Deciphering shifts
 * back. Case is kept, and everything that is not a letter A to Z is left as it is.
 */
export function caesar(text: string, shift: number, direction: Direction = "encipher"): CaesarWorking {
  if (!Number.isInteger(shift)) throw new CipherError("The shift has to be a whole number.");
  const by = mod(shift, 26);
  const applied = direction === "encipher" ? by : -by;
  let output = "";
  for (const character of text) output += shiftCharacter(character, applied);
  return { output, shift: by, cipherAlphabet: [...ALPHABET].map((plain) => letter(code(plain) + by)).join("") };
}

/** Caesar with a shift of 13, which is its own inverse. */
export const rot13 = (text: string): string => caesar(text, 13).output;

// ── Vigenère ────────────────────────────────────────────────────────────────

export interface VigenereWorking {
  output: string;
  key: string;
  /** One entry per letter of the message, in order: the letter, the key letter under it, and the result. */
  steps: Array<{ input: string; key: string; output: string }>;
}

/**
 * Each letter is shifted by the key letter written under it (A shifts by 0, B by 1 …),
 * the key repeating along the message: C = (M + K) mod 26. The key moves on only at
 * letters, so spaces and punctuation stay where they are and do not use up key.
 */
export function vigenere(text: string, key: string, direction: Direction = "encipher"): VigenereWorking {
  const keyLetters = reduce(key).text;
  if (keyLetters.length === 0) throw new CipherError("The key needs at least one letter.");
  const steps: VigenereWorking["steps"] = [];
  let output = "";
  let used = 0;
  for (const character of text) {
    const isLetter = /^[A-Za-z]$/.test(character);
    if (!isLetter) {
      output += character;
      continue;
    }
    const keyLetter = keyLetters[used % keyLetters.length]!;
    used += 1;
    const result = shiftCharacter(character, direction === "encipher" ? code(keyLetter) : -code(keyLetter));
    steps.push({ input: character.toUpperCase(), key: keyLetter, output: result.toUpperCase() });
    output += result;
  }
  return { output, key: keyLetters, steps };
}

/** The 26 rows of the Vigenère square (tabula recta): row K is the alphabet shifted by K. */
export function vigenereSquare(): string[] {
  return [...ALPHABET].map((_, row) => [...ALPHABET].map((plain) => letter(code(plain) + row)).join(""));
}

// ── Playfair ────────────────────────────────────────────────────────────────

export type PlayfairRule = "row" | "column" | "rectangle";

export interface PlayfairWorking {
  output: string;
  /** The 5 × 5 key square, row by row (25 letters; J shares I's place). */
  square: string[];
  steps: Array<{ input: string; output: string; rule: PlayfairRule }>;
  /** Letters added while pairing: an X between doubled letters, and one to make the last pair. */
  fillers: number;
  dropped: Reduced;
}

/** The key's letters in order without repeats, then the rest of the alphabet; J is written as I. */
export function playfairSquare(key: string): string[] {
  const seen = new Set<string>();
  let letters = "";
  for (const character of `${reduce(key).text}${ALPHABET}`) {
    const placed = character === "J" ? "I" : character;
    if (seen.has(placed)) continue;
    seen.add(placed);
    letters += placed;
  }
  return [0, 5, 10, 15, 20].map((start) => letters.slice(start, start + 5));
}

/** Splits a message into pairs for enciphering: a doubled pair is parted by X, and a lone last letter gets one. */
function playfairPairs(letters: string): { pairs: string[]; fillers: number } {
  const pairs: string[] = [];
  let fillers = 0;
  // X is the usual filler; between two Xs, or after a final X, Q stands in so that no pair is a doubled letter.
  const fillerFor = (first: string) => (first === "X" ? "Q" : "X");
  for (let at = 0; at < letters.length; ) {
    const first = letters[at]!;
    const second = letters[at + 1];
    if (second === undefined || second === first) {
      pairs.push(first + fillerFor(first));
      fillers += 1;
      at += 1;
    } else {
      pairs.push(first + second);
      at += 2;
    }
  }
  return { pairs, fillers };
}

/**
 * Enciphers pairs of letters on a 5 × 5 square. Two letters in the same row are each
 * replaced by the letter to their right; in the same column, by the letter below;
 * otherwise by the letter in their own row at the other's column. Deciphering goes
 * left and up instead. The fillers stay in the deciphered text for the reader to drop.
 */
export function playfair(text: string, key: string, direction: Direction = "encipher"): PlayfairWorking {
  const square = playfairSquare(key);
  const flat = square.join("");
  const dropped = reduce(text);
  const letters = dropped.text.replaceAll("J", "I");
  let pairs: string[];
  let fillers = 0;
  if (direction === "encipher") ({ pairs, fillers } = playfairPairs(letters));
  else {
    if (letters.length % 2 !== 0) {
      throw new CipherError(
        `Playfair ciphertext comes in pairs, and this has ${letters.length} letters. A letter is missing or one too many was copied.`,
      );
    }
    pairs = letters.match(/../g) ?? [];
  }
  const step = direction === "encipher" ? 1 : 4;
  const steps = pairs.map((pair) => {
    const [first, second] = [flat.indexOf(pair[0]!), flat.indexOf(pair[1]!)];
    const [rowA, colA, rowB, colB] = [Math.floor(first / 5), first % 5, Math.floor(second / 5), second % 5];
    let output: string;
    let rule: PlayfairRule;
    if (rowA === rowB) {
      rule = "row";
      output = flat[rowA * 5 + ((colA + step) % 5)]! + flat[rowB * 5 + ((colB + step) % 5)]!;
    } else if (colA === colB) {
      rule = "column";
      output = flat[((rowA + step) % 5) * 5 + colA]! + flat[((rowB + step) % 5) * 5 + colB]!;
    } else {
      rule = "rectangle";
      output = flat[rowA * 5 + colB]! + flat[rowB * 5 + colA]!;
    }
    return { input: pair, output, rule };
  });
  return { output: steps.map((entry) => entry.output).join(""), square, steps, fillers, dropped };
}

// ── Rail fence ──────────────────────────────────────────────────────────────

export interface RailFenceWorking {
  output: string;
  /** One string per rail, as long as the message, with a space wherever the rail holds nothing. */
  layout: string[];
  dropped: Reduced;
}

/** Which rail each position of a message of `length` falls on: down to the last rail and back up, over and over. */
function railPattern(length: number, rails: number): number[] {
  const period = 2 * (rails - 1);
  return Array.from({ length }, (_, at) => {
    const phase = at % period;
    return phase < rails ? phase : period - phase;
  });
}

/**
 * Writes the message in a zigzag across `rails` lines and reads it off line by line.
 * Deciphering marks out the same zigzag, fills it line by line from the ciphertext,
 * and reads along the zigzag. Spaces and punctuation are left out; figures are kept.
 */
export function railFence(text: string, rails: number, direction: Direction = "encipher"): RailFenceWorking {
  if (!Number.isInteger(rails) || rails < 2) throw new CipherError("A rail fence needs at least 2 rails.");
  if (rails > 40) throw new CipherError("That is more rails than a page has lines. Use 40 or fewer.");
  const dropped = reduce(text, { digits: true });
  const letters = dropped.text;
  const pattern = railPattern(letters.length, rails);
  const plain: string[] = new Array(letters.length);
  if (direction === "encipher") {
    for (let at = 0; at < letters.length; at += 1) plain[at] = letters[at]!;
  } else {
    let next = 0;
    for (let rail = 0; rail < rails; rail += 1) {
      for (let at = 0; at < letters.length; at += 1) {
        if (pattern[at] === rail) {
          plain[at] = letters[next]!;
          next += 1;
        }
      }
    }
  }
  const layout = Array.from({ length: rails }, (_, rail) =>
    plain.map((character, at) => (pattern[at] === rail ? character : " ")).join(""),
  );
  const output = direction === "encipher" ? layout.map((line) => line.replaceAll(" ", "")).join("") : plain.join("");
  return { output, layout, dropped };
}

// ── Columnar transposition ──────────────────────────────────────────────────

export interface ColumnarWorking {
  output: string;
  key: string;
  /** The number over each column, 1 for the column read first. Equal key letters are numbered left to right. */
  order: number[];
  /** The message written out in rows under the key; the last row may be short. */
  rows: string[];
  dropped: Reduced;
}

/** ZEBRAS → [6, 3, 2, 4, 1, 5]: each column's place in the alphabetical order of the key's letters. */
export function columnOrder(key: string): number[] {
  const letters = [...reduce(key).text];
  const ranked = letters
    .map((character, at) => ({ character, at }))
    .sort((a, b) => (a.character < b.character ? -1 : a.character > b.character ? 1 : a.at - b.at));
  const order = new Array<number>(letters.length);
  ranked.forEach((entry, rank) => {
    order[entry.at] = rank + 1;
  });
  return order;
}

/**
 * Writes the message in rows under the key and reads it off by columns, in the
 * alphabetical order of the key's letters. The last row is left short (the "irregular"
 * form) unless `pad` is given, which fills it with that letter. Spaces and punctuation
 * are left out; figures are kept.
 */
export function columnar(text: string, key: string, direction: Direction = "encipher", options: { pad?: string } = {}): ColumnarWorking {
  const keyLetters = reduce(key).text;
  if (keyLetters.length < 2) throw new CipherError("The key needs at least two letters: one column moves nothing.");
  const order = columnOrder(keyLetters);
  const columns = keyLetters.length;
  const dropped = reduce(text, { digits: true });
  let letters = dropped.text;
  if (direction === "encipher" && options.pad && letters.length % columns !== 0) {
    const pad = reduce(options.pad).text[0];
    if (!pad) throw new CipherError("The letter to fill the last row with has to be a letter.");
    letters = letters.padEnd(Math.ceil(letters.length / columns) * columns, pad);
  }
  /** Column positions (0-based, left to right) in the order they are read. */
  const reading = order
    .map((rank, at) => ({ rank, at }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.at);
  const fullRows = Math.floor(letters.length / columns);
  const extra = letters.length % columns;
  const heightOf = (column: number) => fullRows + (column < extra ? 1 : 0);

  let plain: string;
  if (direction === "encipher") plain = letters;
  else {
    const grid: string[][] = Array.from({ length: columns }, () => []);
    let next = 0;
    for (const column of reading) {
      const height = heightOf(column);
      grid[column] = [...letters.slice(next, next + height)];
      next += height;
    }
    plain = "";
    for (let row = 0; row < fullRows + (extra > 0 ? 1 : 0); row += 1) {
      for (let column = 0; column < columns; column += 1) plain += grid[column]![row] ?? "";
    }
  }
  const rows: string[] = [];
  for (let at = 0; at < plain.length; at += columns) rows.push(plain.slice(at, at + columns));
  const output = direction === "encipher" ? reading.map((column) => rows.map((row) => row[column] ?? "").join("")).join("") : plain;
  return { output, key: keyLetters, order, rows, dropped };
}

// ── One-time pad ────────────────────────────────────────────────────────────

export interface OneTimePadWorking {
  output: string;
  /** How many letters of the pad this message used. They must be struck out and never used again. */
  used: number;
  steps: Array<{ input: string; pad: string; sum: number; output: string }>;
  dropped: Reduced;
}

/**
 * Adds each letter of the message to the letter of the pad under it (A = 0 … Z = 25)
 * and keeps the remainder after dividing by 26; deciphering subtracts. The pad must
 * have a letter for every letter of the message: a pad is never repeated or reused.
 */
export function oneTimePad(text: string, pad: string, direction: Direction = "encipher"): OneTimePadWorking {
  const dropped = reduce(text);
  const letters = dropped.text;
  const padLetters = reduce(pad).text;
  if (padLetters.length < letters.length) {
    throw new CipherError(
      `The message has ${letters.length} letters and the pad only ${padLetters.length}. A pad is never repeated: use a longer stretch of pad, or shorten the message.`,
    );
  }
  const steps = [...letters].map((character, at) => {
    const padLetter = padLetters[at]!;
    const sum = direction === "encipher" ? code(character) + code(padLetter) : code(character) - code(padLetter);
    return { input: character, pad: padLetter, sum, output: letter(sum) };
  });
  return { output: steps.map((entry) => entry.output).join(""), used: letters.length, steps, dropped };
}

/**
 * `count` letters, each equally likely, from the source of random bytes given (the
 * browser's cryptographic one unless a test supplies another). A byte of 234 or more is
 * thrown away and drawn again: 234 is 9 × 26, so what is left divides evenly among the
 * letters and none is favoured.
 */
export function randomLetters(count: number, fill: (bytes: Uint8Array) => void = (bytes) => void crypto.getRandomValues(bytes)): string {
  if (!Number.isInteger(count) || count < 0 || count > 100_000) throw new CipherError("That is not a sensible number of letters.");
  let letters = "";
  const bytes = new Uint8Array(256);
  while (letters.length < count) {
    fill(bytes);
    for (const byte of bytes) {
      if (byte >= 234) continue;
      letters += letter(byte % 26);
      if (letters.length === count) break;
    }
  }
  return letters;
}
