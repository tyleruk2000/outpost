/**
 * Reads a list written as JavaScript, without running it.
 *
 * Some archives keep their table of contents in a script: `var DATABASE = [ {…}, … ];`.
 * Their own page loads that script and so gets the list for free. Outpost must not: the
 * file comes from an archive of unknown origin, and running it would run whatever else
 * its author put there, inside the server. So this reads the one shape such a file is
 * meant to have and refuses everything else.
 *
 * What is accepted, and nothing more:
 *
 *   var DATABASE = [ value, … ];
 *
 * where a value is a string in single or double quotes, a plain decimal number, an array
 * of values, or an object whose keys are quoted strings. Commas may trail. White space is
 * spaces, tabs and line ends. No comments, no identifiers, no template strings, no
 * expressions, no second statement.
 *
 * The file is written by a Python program (openZIM's nautilus prints each entry with
 * Python's `str()` of a dictionary), so strings carry the escapes Python writes, which
 * are also JavaScript's: \\ \' \" \n \r \t \xHH \uHHHH. Python writes a character
 * outside the basic plane that it will not print as \UHHHHHHHH, which is read here as
 * the character meant. The other escapes JavaScript defines for a string (\b \f \v \0
 * \u{…}) are read too. Any other backslash is refused.
 *
 * Objects come back as Maps, so a key named `__proto__` or `constructor` is a key like
 * any other and can touch nothing.
 */

export type Literal = string | number | Literal[] | Map<string, Literal>;

export interface LiteralLimits {
  /** Longest source accepted, in UTF-16 code units. */
  maxLength: number;
  /** How deep arrays and objects may sit inside each other. The list itself is depth 1. */
  maxDepth: number;
  /** Most values (strings, numbers, arrays, objects) in the whole file. */
  maxValues: number;
}

export const DEFAULT_LITERAL_LIMITS: LiteralLimits = { maxLength: 4 * 1024 * 1024, maxDepth: 6, maxValues: 1_000_000 };

/** Why a file was refused. `at` is the position in the source, for the log; the text is never shown as HTML. */
export class LiteralError extends Error {
  readonly at: number;
  constructor(message: string, at: number) {
    super(message);
    this.name = "LiteralError";
    this.at = at;
  }
}

const SPACE = 0x20;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const QUOTE = 0x27;
const DOUBLE_QUOTE = 0x22;
const BACKSLASH = 0x5c;

const SIMPLE_ESCAPES: Record<string, string> = {
  "\\": "\\",
  "'": "'",
  '"': '"',
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  v: "\v",
};

const isDigit = (code: number) => code >= 0x30 && code <= 0x39;

/**
 * The array a `var DATABASE = […];` file holds. Throws `LiteralError` for anything that
 * is not exactly that, or is larger than the limits allow.
 */
export function parseDatabaseLiteral(source: string, limits: LiteralLimits = DEFAULT_LITERAL_LIMITS): Literal[] {
  if (source.length > limits.maxLength) throw new LiteralError("The list is larger than Outpost reads.", limits.maxLength);
  let at = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  let values = 0;

  const fail: (message: string, where?: number) => never = (message, where = at) => {
    throw new LiteralError(message, where);
  };
  const skipSpace = () => {
    for (;;) {
      const code = source.charCodeAt(at);
      if (code !== SPACE && code !== TAB && code !== LF && code !== CR) return;
      at += 1;
    }
  };
  const expectWord = (word: string) => {
    if (!source.startsWith(word, at)) fail(`Expected "${word}".`);
    at += word.length;
  };
  const count = () => {
    values += 1;
    if (values > limits.maxValues) fail("The list holds more values than Outpost reads.");
  };

  const hex = (digits: number): number => {
    const text = source.slice(at, at + digits);
    if (text.length !== digits || !/^[0-9a-fA-F]+$/.test(text)) fail("A character escape is not written in full.");
    at += digits;
    return Number.parseInt(text, 16);
  };

  function escaped(): string {
    // `at` is just past the backslash.
    const letter = source[at];
    if (letter === undefined) return fail("The text ends in the middle of a string.");
    at += 1;
    const simple = SIMPLE_ESCAPES[letter];
    if (simple !== undefined && Object.hasOwn(SIMPLE_ESCAPES, letter)) return simple;
    if (letter === "0") {
      // "\0" is a null character; "\01" would be an octal escape, which is not accepted.
      if (isDigit(source.charCodeAt(at))) fail("Octal escapes are not accepted.");
      return "\0";
    }
    if (letter === "x") return String.fromCharCode(hex(2));
    if (letter === "u") {
      if (source[at] !== "{") return String.fromCharCode(hex(4));
      const end = source.indexOf("}", at);
      const text = end === -1 ? "" : source.slice(at + 1, end);
      if (!/^[0-9a-fA-F]{1,6}$/.test(text)) fail("A character escape is not written in full.");
      const point = Number.parseInt(text, 16);
      if (point > 0x10ffff) fail("A character escape names no character.");
      at = end + 1;
      return String.fromCodePoint(point);
    }
    if (letter === "U") {
      const point = hex(8);
      if (point > 0x10ffff) fail("A character escape names no character.");
      return String.fromCodePoint(point);
    }
    return fail("A backslash is followed by something that is not an escape.", at - 1);
  }

  function string(): string {
    const quote = source.charCodeAt(at);
    const start = at;
    at += 1;
    let text = "";
    let from = at;
    for (;;) {
      if (at >= source.length) fail("A string is never closed.", start);
      const code = source.charCodeAt(at);
      if (code === quote) {
        text += source.slice(from, at);
        at += 1;
        return text;
      }
      // A string in a script cannot run over a line end; one that does was not written by the program this reads.
      if (code === LF || code === CR) fail("A string runs over the end of its line.", start);
      if (code === BACKSLASH) {
        text += source.slice(from, at);
        at += 1;
        text += escaped();
        from = at;
      } else {
        at += 1;
      }
    }
  }

  function number(): number {
    const match = /^-?(?:0|[1-9]\d{0,20})(?:\.\d{1,20})?(?:[eE][+-]?\d{1,3})?/.exec(source.slice(at, at + 60));
    if (!match) return fail("Expected a value.");
    const after = source.charCodeAt(at + match[0].length);
    // "12abc" or "1.2.3" is not a number followed by something; it is not a number.
    const letter = (after >= 0x41 && after <= 0x5a) || (after >= 0x61 && after <= 0x7a) || after === 0x5f || after === 0x24;
    if (isDigit(after) || after === 0x2e || letter) fail("That is not a number.");
    const value = Number(match[0]);
    if (!Number.isFinite(value)) fail("That is not a number.");
    at += match[0].length;
    return value;
  }

  function value(depth: number): Literal {
    count();
    const code = source.charCodeAt(at);
    if (code === QUOTE || code === DOUBLE_QUOTE) return string();
    if (code === 0x5b) return array(depth + 1);
    if (code === 0x7b) return object(depth + 1);
    if (code === 0x2d || isDigit(code)) return number();
    if (at >= source.length) return fail("The text ends where a value was expected.");
    return fail("Expected a string, a number, a list or an object.");
  }

  function array(depth: number): Literal[] {
    if (depth > limits.maxDepth) fail("Lists are nested deeper than Outpost reads.");
    at += 1; // [
    const items: Literal[] = [];
    for (;;) {
      skipSpace();
      if (source.charCodeAt(at) === 0x5d) break;
      items.push(value(depth));
      skipSpace();
      const next = source.charCodeAt(at);
      if (next === 0x2c) at += 1;
      else if (next !== 0x5d) fail(at >= source.length ? "A list is never closed." : "Expected a comma or the end of the list.");
    }
    at += 1; // ]
    return items;
  }

  function object(depth: number): Map<string, Literal> {
    if (depth > limits.maxDepth) fail("Lists are nested deeper than Outpost reads.");
    at += 1; // {
    const entries = new Map<string, Literal>();
    for (;;) {
      skipSpace();
      const code = source.charCodeAt(at);
      if (code === 0x7d) break;
      if (code !== QUOTE && code !== DOUBLE_QUOTE) fail(at >= source.length ? "An object is never closed." : "Expected a quoted name.");
      const key = string();
      skipSpace();
      if (source.charCodeAt(at) !== 0x3a) fail("Expected a colon after a name.");
      at += 1;
      skipSpace();
      // As in a script, a name given twice keeps its last value.
      entries.set(key, value(depth));
      skipSpace();
      const next = source.charCodeAt(at);
      if (next === 0x2c) at += 1;
      else if (next !== 0x7d) fail(at >= source.length ? "An object is never closed." : "Expected a comma or the end of the object.");
    }
    at += 1; // }
    return entries;
  }

  skipSpace();
  expectWord("var");
  const afterVar = at;
  skipSpace();
  if (at === afterVar) fail('Expected a space after "var".');
  expectWord("DATABASE");
  skipSpace();
  expectWord("=");
  skipSpace();
  if (source.charCodeAt(at) !== 0x5b) fail("Expected the list to start with a square bracket.");
  count();
  const list = array(1);
  skipSpace();
  if (source.charCodeAt(at) === 0x3b) at += 1;
  skipSpace();
  if (at < source.length) fail("There is more in the file than the list.");
  return list;
}
