/**
 * A small XML reader for GPX files.
 *
 * It walks the text once, from start to end, and says what it meets: an element
 * opening, an element closing, a piece of text. It builds nothing. Names, attributes
 * and text are positions in the original string until somebody asks for one, so the
 * memory a file costs does not depend on how many elements it has, how deep they go or
 * how long their text is. That is the point of it: a tree of the same file costs
 * hundreds of bytes for every element, and a file of a few megabytes could ask for
 * more memory than the process may have.
 *
 * It is strict. Anything that is not well-formed XML 1.0 with namespaces is an error,
 * with no attempt to carry on. A DOCTYPE is an error too: nothing is ever declared, so
 * the only entities are the five XML defines (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;`)
 * and numbered characters. A few hard limits stop it early on files no GPX writer makes.
 *
 * It is lenient in one thing, because real files need it: an ampersand that starts no
 * reference (`Fish & chips` in a name, `?a=1&b=2` in a link) is read as an ampersand.
 * Programs write those, the reader before this one took them, and nothing can be made
 * of one but the character itself.
 *
 * There was no library to use instead. `saxes` is strict and ISC-licensed but its
 * repository is archived; `sax` is maintained but accepts files that are not
 * well-formed (two root elements, a repeated attribute, `<` inside an attribute) and
 * its licence is not one of those Outpost links to. See docs/security.md.
 */

/** What one file may ask of the reader. Each is far beyond anything a GPX writer produces. */
export const XML_LIMITS = {
  /** Elements open inside one another. GPX itself goes five deep; extensions a few more. */
  depth: 64,
  /** Attributes on one element. */
  attributes: 64,
  /** Namespace declarations in force at one place. */
  namespaces: 64,
  /** Characters in one unbroken piece of text, CDATA section, comment or attribute value. */
  run: 1_000_000,
} as const;

export type XmlLimit = keyof typeof XML_LIMITS;

/** The text is not well-formed XML. The message is for logs and tests, not for people. */
export class XmlSyntaxError extends Error {
  constructor(reason: string, position: number) {
    super(`${reason} (at character ${position})`);
    this.name = "XmlSyntaxError";
  }
}

/** The text asks for more than one of `XML_LIMITS` allows. */
export class XmlLimitError extends Error {
  limit: XmlLimit;
  constructor(limit: XmlLimit) {
    super(`over the limit on ${limit}`);
    this.name = "XmlLimitError";
    this.limit = limit;
  }
}

export const XML_END = 0;
export const XML_OPEN = 1;
export const XML_CLOSE = 2;
export const XML_TEXT = 3;
export type XmlEvent = typeof XML_END | typeof XML_OPEN | typeof XML_CLOSE | typeof XML_TEXT;

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

// Which ASCII characters may start a name, and which may only continue one.
const NAME_START = 1;
const NAME_PART = 2;
const ASCII = new Uint8Array(128);
for (let code = 0x41; code <= 0x5a; code += 1) {
  ASCII[code] = NAME_START;
  ASCII[code + 0x20] = NAME_START;
}
ASCII[0x5f] = NAME_START; // _
ASCII[0x3a] = NAME_START; // :
for (let code = 0x30; code <= 0x39; code += 1) ASCII[code] = NAME_PART;
ASCII[0x2d] = NAME_PART; // -
ASCII[0x2e] = NAME_PART; // .

/** NameStartChar of XML 1.0 (fifth edition), for characters past ASCII and below the surrogates. */
function startsNameBeyondAscii(code: number): boolean {
  return (
    (code >= 0xc0 && code <= 0x2ff && code !== 0xd7 && code !== 0xf7) ||
    (code >= 0x370 && code <= 0x1fff && code !== 0x37e) ||
    code === 0x200c ||
    code === 0x200d ||
    (code >= 0x2070 && code <= 0x218f) ||
    (code >= 0x2c00 && code <= 0x2fef) ||
    (code >= 0x3001 && code <= 0xd7ff) ||
    (code >= 0xf900 && code <= 0xfdcf) ||
    (code >= 0xfdf0 && code <= 0xfffd)
  );
}

function continuesNameBeyondAscii(code: number): boolean {
  return code === 0xb7 || (code >= 0x300 && code <= 0x36f) || code === 0x203f || code === 0x2040 || startsNameBeyondAscii(code);
}

const isSpace = (code: number) => code === 0x20 || code === 0x0a || code === 0x09 || code === 0x0d;

const S = "[ \\t\\r\\n]";
const XML_DECLARATION = new RegExp(
  `^<\\?xml${S}+version${S}*=${S}*(?:"1\\.[0-9]+"|'1\\.[0-9]+')` +
    `(?:${S}+encoding${S}*=${S}*(?:"[A-Za-z][A-Za-z0-9._-]*"|'[A-Za-z][A-Za-z0-9._-]*'))?` +
    `(?:${S}+standalone${S}*=${S}*(?:"(?:yes|no)"|'(?:yes|no)'))?${S}*\\?>`,
);

// How a stretch of characters is to be read.
const TEXT = 0; // between elements: references, and no "]]>"
const VALUE = 1; // an attribute value: references, no "<", white space becomes a space
const RAW = 2; // comment, processing instruction, CDATA: characters as they are

const REFERENCES: ReadonlyArray<readonly [string, number]> = [
  ["amp;", 0x26],
  ["lt;", 0x3c],
  ["gt;", 0x3e],
  ["quot;", 0x22],
  ["apos;", 0x27],
];

/**
 * Reads XML one event at a time. Call `next()` until it returns `XML_END`.
 *
 * After `XML_OPEN` the element just opened can be asked about (`is`, `uri`,
 * `attribute`); after `XML_TEXT`, `text()` gives the piece of text. Nothing from an
 * earlier event stays readable.
 */
export class XmlTokenizer {
  readonly source: string;
  /** Elements open right now: after `XML_OPEN` this counts the new one, after `XML_CLOSE` it no longer counts the old one. */
  depth = 0;
  /** Namespace of the element just opened; empty when it has none. */
  uri = "";

  private position = 0;
  private readonly start: number;
  private nameEnd = 0;
  private localStart = 0;
  /** Where the colon of the name last scanned is, or -1. */
  private colon = -1;
  private attributeCount = 0;
  /** Four numbers for each attribute: where its name starts and ends, where its value starts and ends. */
  private readonly attributes = new Int32Array(XML_LIMITS.attributes * 4);
  private readonly attributeColons = new Int32Array(XML_LIMITS.attributes);
  /** Where the name of each open element starts and ends, to check its closing tag against. */
  private readonly open = new Int32Array((XML_LIMITS.depth + 1) * 2);
  private readonly prefixes: string[] = [];
  private readonly uris: string[] = [];
  private readonly declaredAt: number[] = [];
  private closesAtOnce = false;
  private rootSeen = false;
  private textStart = 0;
  private textEnd = 0;
  private textKind = TEXT;
  private referenceEnd = 0;

  constructor(source: string) {
    this.source = source;
    // A byte-order mark is not part of the document.
    this.start = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    this.position = this.start;
  }

  next(): XmlEvent {
    const source = this.source;
    if (this.closesAtOnce) {
      this.closesAtOnce = false;
      return this.close();
    }
    for (;;) {
      const at = this.position;
      if (at >= source.length) {
        if (this.depth > 0) throw this.wrong("the file ends inside an element", at);
        if (!this.rootSeen) throw this.wrong("there is no element", at);
        return XML_END;
      }
      if (source.charCodeAt(at) !== 0x3c) {
        let end = source.indexOf("<", at);
        if (end < 0) end = source.length;
        if (end - at > XML_LIMITS.run) throw new XmlLimitError("run");
        this.position = end;
        if (this.depth === 0) {
          for (let i = at; i < end; i += 1) if (!isSpace(source.charCodeAt(i))) throw this.wrong("text outside the root element", i);
          continue;
        }
        this.characters(at, end, TEXT, false);
        this.textStart = at;
        this.textEnd = end;
        this.textKind = TEXT;
        return XML_TEXT;
      }
      const second = source.charCodeAt(at + 1);
      if (second === 0x2f) return this.closingTag(at);
      if (second === 0x3f) {
        this.instruction(at);
        continue;
      }
      if (second === 0x21) {
        if (source.startsWith("<!--", at)) {
          this.comment(at);
          continue;
        }
        if (source.startsWith("<![CDATA[", at)) return this.cdata(at);
        // A DOCTYPE lands here: nothing is ever declared, so nothing can be expanded or fetched.
        throw this.wrong("a declaration is not allowed", at);
      }
      return this.openingTag(at);
    }
  }

  /** The name of the element just opened, without any prefix. */
  get local(): string {
    return this.source.slice(this.localStart, this.nameEnd);
  }

  /** Whether the element just opened has this name, leaving any prefix aside. */
  is(local: string): boolean {
    return this.nameEnd - this.localStart === local.length && this.source.startsWith(local, this.localStart);
  }

  /** The value of an attribute of the element just opened, by its name as written; undefined when it has none. */
  attribute(name: string): string | undefined {
    const attributes = this.attributes;
    for (let i = 0; i < this.attributeCount * 4; i += 4) {
      if (attributes[i + 1]! - attributes[i]! === name.length && this.source.startsWith(name, attributes[i])) {
        return this.characters(attributes[i + 2]!, attributes[i + 3]!, VALUE, true);
      }
    }
    return undefined;
  }

  /** Length of the piece of text just met, as written in the file. */
  get textLength(): number {
    return this.textEnd - this.textStart;
  }

  /** The piece of text just met, with references resolved and line endings made `\n`. */
  text(): string {
    return this.characters(this.textStart, this.textEnd, this.textKind, true);
  }

  private wrong(reason: string, position: number): XmlSyntaxError {
    return new XmlSyntaxError(reason, position);
  }

  /**
   * Checks a stretch of characters, and returns it decoded when `want` is set.
   * Checking and decoding are one loop so that they cannot disagree.
   */
  private characters(start: number, end: number, kind: number, want: boolean): string {
    const source = this.source;
    let out = "";
    let from = start;
    for (let i = start; i < end; i += 1) {
      const code = source.charCodeAt(i);
      if (code > 0x5d) {
        if (code < 0xd800) continue;
        if (code <= 0xdbff) {
          const low = source.charCodeAt(i + 1);
          if (i + 1 >= end || !(low >= 0xdc00 && low <= 0xdfff)) throw this.wrong("half a character", i);
          i += 1;
        } else if (code <= 0xdfff || code >= 0xfffe) {
          throw this.wrong("a character XML does not allow", i);
        }
        continue;
      }
      if (code >= 0x20) {
        if (code === 0x26 && kind !== RAW) {
          const resolved = this.reference(i, end);
          // An ampersand on its own stays in the text as it is.
          if (resolved < 0) continue;
          if (want) out += source.slice(from, i) + String.fromCodePoint(resolved);
          i = this.referenceEnd;
          from = i + 1;
        } else if (code === 0x3c && kind === VALUE) {
          throw this.wrong("< inside an attribute value", i);
        } else if (
          code === 0x5d &&
          kind === TEXT &&
          i + 2 < end &&
          source.charCodeAt(i + 1) === 0x5d &&
          source.charCodeAt(i + 2) === 0x3e
        ) {
          throw this.wrong("]]> in text", i);
        }
        continue;
      }
      if (code === 0x0a || code === 0x09) {
        if (want && kind === VALUE) {
          out += `${source.slice(from, i)} `;
          from = i + 1;
        }
        continue;
      }
      if (code !== 0x0d) throw this.wrong("a control character", i);
      // A carriage return, alone or before a line feed, is one line ending.
      if (want) out += source.slice(from, i) + (kind === VALUE ? " " : "\n");
      if (i + 1 < end && source.charCodeAt(i + 1) === 0x0a) i += 1;
      from = i + 1;
    }
    if (!want) return "";
    return from === start ? source.slice(start, end) : out + source.slice(from, end);
  }

  /**
   * The character a reference starting at `at` stands for, leaving `referenceEnd` on its
   * semicolon; or -1 for an ampersand that starts no reference at all (`Fish & chips`,
   * `?a=1&b=2`), which is read as the ampersand it plainly is.
   */
  private reference(at: number, end: number): number {
    const source = this.source;
    let i = at + 1;
    if (source.charCodeAt(i) === 0x23) {
      i += 1;
      let value = 0;
      const first = i;
      if (source.charCodeAt(i) === 0x78) {
        i += 1;
        const firstHex = i;
        for (; i < end; i += 1) {
          const code = source.charCodeAt(i);
          const digit =
            code >= 0x30 && code <= 0x39 ? code - 0x30 : (code | 0x20) >= 0x61 && (code | 0x20) <= 0x66 ? (code | 0x20) - 0x57 : -1;
          if (digit < 0) break;
          value = value * 16 + digit;
          if (value > 0x10ffff) throw this.wrong("a character number out of range", at);
        }
        if (i === firstHex) throw this.wrong("an empty character reference", at);
      } else {
        for (; i < end; i += 1) {
          const code = source.charCodeAt(i);
          if (code < 0x30 || code > 0x39) break;
          value = value * 10 + (code - 0x30);
          if (value > 0x10ffff) throw this.wrong("a character number out of range", at);
        }
        if (i === first) throw this.wrong("an empty character reference", at);
      }
      if (i >= end || source.charCodeAt(i) !== 0x3b) throw this.wrong("a character reference without its semicolon", at);
      const allowed =
        value === 0x09 ||
        value === 0x0a ||
        value === 0x0d ||
        (value >= 0x20 && value <= 0xd7ff) ||
        (value >= 0xe000 && value <= 0xfffd) ||
        value >= 0x10000;
      if (!allowed) throw this.wrong("a reference to a character XML does not allow", at);
      this.referenceEnd = i;
      return value;
    }
    // Something of the shape `&name;` is a reference and has to be one XML defines.
    let nameEnd = i;
    while (nameEnd < end) {
      const code = source.charCodeAt(nameEnd);
      const kind = code < 128 ? ASCII[code]! : 0;
      if (kind === 0 || (nameEnd === i && kind !== NAME_START)) break;
      nameEnd += 1;
    }
    if (nameEnd === i || nameEnd >= end || source.charCodeAt(nameEnd) !== 0x3b) return -1;
    for (const [name, code] of REFERENCES) {
      if (i + name.length <= end && source.startsWith(name, i)) {
        this.referenceEnd = i + name.length - 1;
        return code;
      }
    }
    throw this.wrong("an entity that XML does not define", at);
  }

  private startsName(at: number): boolean {
    const code = this.source.charCodeAt(at);
    if (code < 128) return ASCII[code] === NAME_START && code !== 0x3a;
    if (code >= 0xd800 && code <= 0xdb7f) return true;
    return startsNameBeyondAscii(code);
  }

  /**
   * Reads a name starting at `from` and returns where it ends (`from` itself when
   * there is no name there). Records its colon. A name may have one colon, with a
   * proper name on each side of it.
   */
  private name(from: number): number {
    const source = this.source;
    let colon = -1;
    let i = from;
    for (;;) {
      const code = source.charCodeAt(i);
      if (code < 128) {
        const kind = ASCII[code]!;
        if (kind === 0 || (i === from && kind !== NAME_START)) break;
        if (code === 0x3a) {
          if (colon >= 0) throw this.wrong("a name with two colons", i);
          colon = i;
        }
        i += 1;
      } else if (code >= 0xd800 && code <= 0xdb7f) {
        const low = source.charCodeAt(i + 1);
        if (!(low >= 0xdc00 && low <= 0xdfff)) break;
        i += 2;
      } else if (i === from ? startsNameBeyondAscii(code) : continuesNameBeyondAscii(code)) {
        i += 1;
      } else {
        break;
      }
    }
    if (colon >= 0 && (colon === from || colon === i - 1 || !this.startsName(colon + 1)))
      throw this.wrong("a colon in the wrong place in a name", colon);
    this.colon = colon;
    return i;
  }

  private space(from: number): number {
    let i = from;
    while (isSpace(this.source.charCodeAt(i))) i += 1;
    return i;
  }

  private sameText(startA: number, endA: number, startB: number, endB: number): boolean {
    if (endA - startA !== endB - startB) return false;
    const source = this.source;
    for (let i = 0; i < endA - startA; i += 1) if (source.charCodeAt(startA + i) !== source.charCodeAt(startB + i)) return false;
    return true;
  }

  private matches(literal: string, start: number, end: number): boolean {
    return end - start === literal.length && this.source.startsWith(literal, start);
  }

  /** The namespace a prefix stands for at this point, or undefined when it was never declared. */
  private namespaceOf(start: number, end: number): string | undefined {
    for (let i = this.prefixes.length - 1; i >= 0; i -= 1) if (this.matches(this.prefixes[i]!, start, end)) return this.uris[i];
    if (this.matches("xml", start, end)) return XML_NAMESPACE;
    return undefined;
  }

  private openingTag(at: number): XmlEvent {
    const source = this.source;
    if (this.depth === 0 && this.rootSeen) throw this.wrong("a second root element", at);
    const nameStart = at + 1;
    const nameEnd = this.name(nameStart);
    if (nameEnd === nameStart) throw this.wrong("< that does not start a tag", at);
    const nameColon = this.colon;
    if (this.depth >= XML_LIMITS.depth) throw new XmlLimitError("depth");

    const attributes = this.attributes;
    let count = 0;
    let declares = false;
    let prefixed = 0;
    let i = nameEnd;
    let closesAtOnce = false;
    for (;;) {
      const afterSpace = this.space(i);
      const code = source.charCodeAt(afterSpace);
      if (code === 0x3e) {
        i = afterSpace + 1;
        break;
      }
      if (code === 0x2f) {
        if (source.charCodeAt(afterSpace + 1) !== 0x3e) throw this.wrong("/ that does not end a tag", afterSpace);
        closesAtOnce = true;
        i = afterSpace + 2;
        break;
      }
      if (afterSpace === i) throw this.wrong("a tag that is not finished", afterSpace);
      const attributeStart = afterSpace;
      const attributeEnd = this.name(attributeStart);
      if (attributeEnd === attributeStart) throw this.wrong("something that is not an attribute", attributeStart);
      const attributeColon = this.colon;
      let valueStart = this.space(attributeEnd);
      if (source.charCodeAt(valueStart) !== 0x3d) throw this.wrong("an attribute without a value", attributeEnd);
      valueStart = this.space(valueStart + 1);
      const quote = source.charCodeAt(valueStart);
      if (quote !== 0x22 && quote !== 0x27) throw this.wrong("an attribute value without quotes", valueStart);
      valueStart += 1;
      const valueEnd = source.indexOf(quote === 0x22 ? '"' : "'", valueStart);
      if (valueEnd < 0) throw this.wrong("an attribute value that never ends", valueStart);
      if (valueEnd - valueStart > XML_LIMITS.run) throw new XmlLimitError("run");
      if (count >= XML_LIMITS.attributes) throw new XmlLimitError("attributes");
      this.characters(valueStart, valueEnd, VALUE, false);
      for (let k = 0; k < count * 4; k += 4) {
        if (this.sameText(attributes[k]!, attributes[k + 1]!, attributeStart, attributeEnd))
          throw this.wrong("an attribute given twice", attributeStart);
      }
      attributes[count * 4] = attributeStart;
      attributes[count * 4 + 1] = attributeEnd;
      attributes[count * 4 + 2] = valueStart;
      attributes[count * 4 + 3] = valueEnd;
      this.attributeColons[count] = attributeColon;
      if (source.startsWith("xmlns", attributeStart) && (attributeEnd - attributeStart === 5 || attributeColon === attributeStart + 5))
        declares = true;
      else if (attributeColon >= 0) prefixed += 1;
      count += 1;
      i = valueEnd + 1;
    }

    const depth = this.depth + 1;
    if (declares) this.declareNamespaces(count, depth);
    if (nameColon < 0) {
      this.uri = this.namespaceOf(nameStart, nameStart) ?? "";
    } else {
      const uri = this.matches("xmlns", nameStart, nameColon) ? undefined : this.namespaceOf(nameStart, nameColon);
      if (uri === undefined) throw this.wrong("an element with a prefix that was never declared", nameStart);
      this.uri = uri;
    }
    if (prefixed > 0) this.checkPrefixedAttributes(count);

    this.open[depth * 2] = nameStart;
    this.open[depth * 2 + 1] = nameEnd;
    this.depth = depth;
    this.rootSeen = true;
    this.nameEnd = nameEnd;
    this.localStart = nameColon < 0 ? nameStart : nameColon + 1;
    this.attributeCount = count;
    this.closesAtOnce = closesAtOnce;
    this.position = i;
    return XML_OPEN;
  }

  private declareNamespaces(count: number, depth: number): void {
    const attributes = this.attributes;
    for (let k = 0; k < count; k += 1) {
      const start = attributes[k * 4]!;
      const end = attributes[k * 4 + 1]!;
      if (!this.source.startsWith("xmlns", start)) continue;
      const isDefault = end - start === 5;
      if (!isDefault && this.attributeColons[k] !== start + 5) continue;
      const prefix = isDefault ? "" : this.source.slice(start + 6, end);
      const uri = this.characters(attributes[k * 4 + 2]!, attributes[k * 4 + 3]!, VALUE, true);
      // The rules of "Namespaces in XML": what may and may not be declared.
      if (prefix === "xmlns") throw this.wrong("the prefix xmlns cannot be declared", start);
      if (prefix !== "" && uri === "") throw this.wrong("a prefix declared as nothing", start);
      if ((prefix === "xml") !== (uri === XML_NAMESPACE)) throw this.wrong("the xml prefix and its namespace belong to each other", start);
      if (uri === XMLNS_NAMESPACE) throw this.wrong("the xmlns namespace cannot be declared", start);
      if (this.prefixes.length >= XML_LIMITS.namespaces) throw new XmlLimitError("namespaces");
      this.prefixes.push(prefix);
      this.uris.push(uri);
      this.declaredAt.push(depth);
    }
  }

  /** Every prefix on an attribute must be declared, and no two attributes may be the same name in the same namespace. */
  private checkPrefixedAttributes(count: number): void {
    const attributes = this.attributes;
    const seen: Array<{ uri: string; start: number; end: number }> = [];
    for (let k = 0; k < count; k += 1) {
      const colon = this.attributeColons[k]!;
      const start = attributes[k * 4]!;
      const end = attributes[k * 4 + 1]!;
      if (colon < 0 || this.matches("xmlns", start, colon)) continue;
      const uri = this.namespaceOf(start, colon);
      if (uri === undefined) throw this.wrong("an attribute with a prefix that was never declared", start);
      for (const other of seen) {
        if (other.uri === uri && this.sameText(other.start, other.end, colon + 1, end)) throw this.wrong("an attribute given twice", start);
      }
      seen.push({ uri, start: colon + 1, end });
    }
  }

  private closingTag(at: number): XmlEvent {
    const source = this.source;
    const nameStart = at + 2;
    const nameEnd = this.name(nameStart);
    if (nameEnd === nameStart) throw this.wrong("a closing tag without a name", at);
    const end = this.space(nameEnd);
    if (source.charCodeAt(end) !== 0x3e) throw this.wrong("a closing tag that is not finished", end);
    if (this.depth === 0) throw this.wrong("a closing tag with nothing open", at);
    if (!this.sameText(this.open[this.depth * 2]!, this.open[this.depth * 2 + 1]!, nameStart, nameEnd)) {
      throw this.wrong("a closing tag that does not match the element it closes", at);
    }
    this.position = end + 1;
    return this.close();
  }

  private close(): XmlEvent {
    while (this.declaredAt.length > 0 && this.declaredAt[this.declaredAt.length - 1] === this.depth) {
      this.declaredAt.pop();
      this.prefixes.pop();
      this.uris.pop();
    }
    this.depth -= 1;
    return XML_CLOSE;
  }

  private comment(at: number): void {
    const source = this.source;
    const end = source.indexOf("--", at + 4);
    if (end < 0) throw this.wrong("a comment that never ends", at);
    if (source.charCodeAt(end + 2) !== 0x3e) throw this.wrong("-- inside a comment", end);
    if (end - at > XML_LIMITS.run) throw new XmlLimitError("run");
    this.characters(at + 4, end, RAW, false);
    this.position = end + 3;
  }

  private cdata(at: number): XmlEvent {
    if (this.depth === 0) throw this.wrong("CDATA outside the root element", at);
    const start = at + 9;
    const end = this.source.indexOf("]]>", start);
    if (end < 0) throw this.wrong("a CDATA section that never ends", at);
    if (end - start > XML_LIMITS.run) throw new XmlLimitError("run");
    this.characters(start, end, RAW, false);
    this.textStart = start;
    this.textEnd = end;
    this.textKind = RAW;
    this.position = end + 3;
    return XML_TEXT;
  }

  /** `<?name …?>`. Nothing is done with one; it only has to be well-formed. */
  private instruction(at: number): void {
    const source = this.source;
    const targetStart = at + 2;
    const targetEnd = this.name(targetStart);
    if (targetEnd === targetStart || this.colon >= 0) throw this.wrong("a processing instruction without a proper name", at);
    if (targetEnd - targetStart === 3 && source.slice(targetStart, targetEnd).toLowerCase() === "xml") {
      // The XML declaration: only as the very first thing, and only in its set form.
      const declaration = at === this.start ? XML_DECLARATION.exec(source.slice(at, at + 256)) : null;
      if (!declaration) throw this.wrong("an XML declaration that is misplaced or malformed", at);
      this.position = at + declaration[0].length;
      return;
    }
    const end = source.indexOf("?>", targetEnd);
    if (end < 0) throw this.wrong("a processing instruction that never ends", at);
    if (end !== targetEnd && !isSpace(source.charCodeAt(targetEnd))) throw this.wrong("a processing instruction without a proper name", at);
    if (end - at > XML_LIMITS.run) throw new XmlLimitError("run");
    this.characters(targetEnd, end, RAW, false);
    this.position = end + 2;
  }
}
