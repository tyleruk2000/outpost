/**
 * What an EPUB says about itself: its package file, reading order, table of contents,
 * cover, and whether it is locked.
 *
 * An EPUB is a zip. `META-INF/container.xml` names the package file (OPF); the OPF
 * lists every file (the manifest) and the reading order (the spine). The table of
 * contents is a navigation document (EPUB 3) or an NCX file (EPUB 2). Reading the text
 * for search (`extract-epub.ts`) and showing the book (`epub-reader.ts`) both start
 * here, so they agree on which document is which chapter.
 *
 * These small XML files are read with the forgiving HTML parser the rest of the app
 * uses, not a strict XML reader: books in the wild are full of files a strict reader
 * would refuse, and nothing here is ever declared, expanded or fetched.
 */
import path from "node:path";
import type { Element, Nodes } from "hast";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { decodeText } from "./extract-text.ts";
import { type Extracted, ExtractionError, tidyText } from "./extract-types.ts";
import type { ZipReader } from "./zip.ts";

/** Largest package file, navigation document or NCX read when text is extracted (in a worker). */
export const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
/** Most documents of the reading order that are kept. Books in the wild have tens or hundreds. */
export const MAX_SPINE_ITEMS = 2000;
/** Most lines of a table of contents that are kept, and how deep they may nest. */
export const MAX_CONTENTS_ENTRIES = 5000;
const MAX_CONTENTS_DEPTH = 6;

const VOID_ELEMENTS = "area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr";
const SELF_CLOSING = new RegExp(`<(?!(?:${VOID_ELEMENTS})\\b)([A-Za-z_][\\w:.-]*)((?:\\s[^<>]*?)?)\\s*/>`, "g");

/**
 * XML allows `<a/>` for any element; the HTML parser used here only honours it for
 * void elements and would treat `<script/>` or `<item/>` as opened and never closed.
 * Spelling the close tag out makes both parsers agree.
 */
export function expandSelfClosing(xml: string): string {
  return xml.replace(SELF_CLOSING, "<$1$2></$1>");
}

export interface XmlElement {
  /** Tag name without a namespace prefix, lower-case. */
  name: string;
  attributes: Record<string, string>;
  text: string;
}

const fragmentParser = unified().use(rehypeParse, { fragment: true });
const documentParser = unified().use(rehypeParse);

const localName = (element: Element) => element.tagName.replace(/^.*:/, "").toLowerCase();

function describe(element: Element): XmlElement {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(element.properties)) {
    if (value === null || value === undefined || value === false) continue;
    attributes[key.toLowerCase()] = Array.isArray(value) ? value.join(" ") : String(value);
  }
  const text = element.children.map((child) => (child.type === "text" ? child.value : "")).join("");
  return { name: localName(element), attributes, text: tidyText(text) };
}

/** Every element of a small XML file, in document order. Enough for the OPF and container. */
export function xmlElements(xml: string): XmlElement[] {
  const tree = fragmentParser.parse(expandSelfClosing(xml));
  const elements: XmlElement[] = [];
  const visit = (node: Nodes) => {
    if (node.type === "element") elements.push(describe(node));
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(tree);
  return elements;
}

/**
 * Resolves a reference written in one file of the book (a manifest href, a link, a
 * picture's `src`) against the folder of that file. The part after `#` is dropped.
 * Null when it is an address rather than a path, or leaves the archive.
 */
export function resolveHref(fromPath: string, href: string): string | null {
  let decoded = href.split("#")[0] ?? "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Not percent-encoded after all; use it as written.
  }
  if (!decoded || decoded.includes("\0") || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) return null;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), decoded));
  return resolved.startsWith("..") || resolved.startsWith("/") ? null : resolved;
}

/** The part of a reference after `#`, decoded. Undefined when there is none. */
export function fragmentOf(href: string): string | undefined {
  const at = href.indexOf("#");
  if (at === -1 || at === href.length - 1) return undefined;
  const raw = href.slice(at + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** One document of the reading order. */
export interface SpineItem {
  /** Path inside the archive. */
  path: string;
  /** False for a document the book marks as outside the main reading order (a notes file, an answer key). */
  linear: boolean;
}

export interface EpubPackage {
  /** Path of the package file inside the archive. */
  opfPath: string;
  meta: Extracted["meta"];
  /** The content documents in reading order. The navigation document is left out: it is a table of contents. */
  spine: SpineItem[];
  /** Documents of the reading order beyond `MAX_SPINE_ITEMS`, which are not kept. */
  spineDropped: number;
  /** The EPUB 3 navigation document, when the manifest names one that is in the archive. */
  navPath?: string;
  /** The EPUB 2 table of contents (NCX), likewise. */
  ncxPath?: string;
  /** The cover picture, when the book names one that is in the archive. */
  coverPath?: string;
  /** True when the book says its pages are fixed layouts rather than text that reflows. */
  fixedLayout: boolean;
}

const damaged = () =>
  new ExtractionError("This EPUB is missing the files that describe its contents, so it could not be read. It may be damaged.");

const isPicture = (mediaType: string, href: string) => /^image\//i.test(mediaType) || /\.(png|jpe?g|gif|webp|svg)$/i.test(href);

export async function readPackage(zip: ZipReader, maxBytes = MAX_PACKAGE_BYTES): Promise<EpubPackage> {
  if (!zip.has("META-INF/container.xml")) throw damaged();
  const container = xmlElements(decodeText(await zip.read("META-INF/container.xml", maxBytes)));
  const opfPath = container.find((element) => element.name === "rootfile" && element.attributes["full-path"])?.attributes["full-path"];
  if (!opfPath || !zip.has(opfPath)) throw damaged();

  const source = decodeText(await zip.read(opfPath, maxBytes));
  const elements = xmlElements(source);
  const first = (name: string) => elements.find((element) => element.name === name && element.text)?.text.slice(0, 300);

  const manifest = new Map<string, XmlElement>();
  for (const element of elements) {
    if (element.name === "item" && element.attributes.id) manifest.set(element.attributes.id, element);
  }
  const properties = (item: XmlElement) => (item.attributes.properties ?? "").split(/\s+/).filter(Boolean);
  /** The archive path of a manifest item, when the file is really there. */
  const present = (item: XmlElement | undefined) => {
    const target = item?.attributes.href ? resolveHref(opfPath, item.attributes.href) : null;
    return target && zip.has(target) ? target : undefined;
  };

  const spine: SpineItem[] = [];
  const seen = new Set<string>();
  let spineDropped = 0;
  let ncxId: string | undefined;
  for (const element of elements) {
    if (element.name === "spine") ncxId = element.attributes.toc;
    if (element.name !== "itemref") continue;
    const item = manifest.get(element.attributes.idref ?? "");
    if (!item?.attributes.href) continue;
    const mediaType = item.attributes["media-type"] ?? "";
    const isMarkup = /x?html/i.test(mediaType) || /\.x?html?$/i.test(item.attributes.href);
    // The navigation document is a table of contents; indexing it would make every
    // chapter title match twice.
    const isNav = properties(item).includes("nav");
    const target = present(item);
    if (!isMarkup || isNav || !target || seen.has(target)) continue;
    seen.add(target);
    if (spine.length >= MAX_SPINE_ITEMS) spineDropped += 1;
    else spine.push({ path: target, linear: element.attributes.linear?.toLowerCase() !== "no" });
  }

  const items = [...manifest.values()];
  const navPath = present(items.find((item) => properties(item).includes("nav")));
  const ncxPath = present(
    (ncxId ? manifest.get(ncxId) : undefined) ?? items.find((item) => item.attributes["media-type"] === "application/x-dtbncx+xml"),
  );
  // EPUB 3 marks the cover in the manifest; EPUB 2 points at it from the metadata.
  const coverId = elements.find((element) => element.name === "meta" && element.attributes.name === "cover")?.attributes.content;
  const coverItem = items.find((item) => properties(item).includes("cover-image")) ?? (coverId ? manifest.get(coverId) : undefined);
  const coverPath =
    coverItem && isPicture(coverItem.attributes["media-type"] ?? "", coverItem.attributes.href ?? "") ? present(coverItem) : undefined;
  // `<meta>` holds nothing in HTML, so the parser used here does not keep its words; the line is read as written.
  const fixedLayout = /<meta\b[^>]*\bproperty\s*=\s*["']rendition:layout["'][^>]*>\s*pre-paginated\b/i.test(source);

  return {
    opfPath,
    meta: { title: first("title"), author: first("creator"), language: first("language")?.slice(0, 35) },
    spine,
    spineDropped,
    ...(navPath ? { navPath } : {}),
    ...(ncxPath ? { ncxPath } : {}),
    ...(coverPath ? { coverPath } : {}),
    fixedLayout,
  };
}

// ── Locked books ─────────────────────────────────────────────────────────────

/**
 * The two ways a book may scramble its fonts so they cannot be lifted out of it. They
 * are not locks on the text: a book that uses only these reads like any other, and
 * Outpost never uses a book's fonts anyway.
 */
const FONT_OBFUSCATION = new Set(["http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"]);
/** Files a rights scheme leaves in a book: Adobe's, Readium LCP's and Apple's. */
const RIGHTS_FILES = ["META-INF/rights.xml", "META-INF/license.lcpl", "META-INF/sinf.xml"];

/**
 * Whether the book is locked by a rights scheme (DRM): it carries a rights file, or
 * its `encryption.xml` covers something other than obfuscated fonts. Such a book is
 * never read, and nothing here tries to open it.
 */
export async function isProtected(zip: ZipReader, maxBytes = MAX_PACKAGE_BYTES): Promise<boolean> {
  if (RIGHTS_FILES.some((name) => zip.has(name))) return true;
  if (!zip.has("META-INF/encryption.xml")) return false;
  let elements: XmlElement[];
  try {
    elements = xmlElements(decodeText(await zip.read("META-INF/encryption.xml", maxBytes)));
  } catch {
    // An encryption file that cannot be read says nothing reassuring.
    return true;
  }
  const encrypted = elements.filter((element) => element.name === "encrypteddata").length;
  if (encrypted === 0) return false;
  const methods = elements.filter((element) => element.name === "encryptionmethod");
  // Every encrypted file names how; one that does not, or names anything but font obfuscation, is a lock.
  return methods.length < encrypted || methods.some((method) => !FONT_OBFUSCATION.has(method.attributes.algorithm ?? ""));
}

export const PROTECTED_MESSAGE =
  "This book is copy-protected (DRM), so Outpost cannot read it. Outpost does not remove copy protection. The file is stored as it is and can be downloaded.";

// ── Table of contents ────────────────────────────────────────────────────────

/** A line of the table of contents, as the book wrote it. */
export interface ContentsLine {
  title: string;
  /** Archive path of the document it opens. Undefined for a line that only names a part of the book. */
  path?: string;
  /** The place inside that document, as written after `#`. */
  fragment?: string;
  depth: number;
}

const isElement = (node: Nodes): node is Element => node.type === "element";
const childElements = (node: Element, name: string) =>
  node.children.filter((child): child is Element => isElement(child) && localName(child) === name);

function wordsOf(node: Nodes, depth = 0): string {
  if (node.type === "text") return node.value;
  if (!("children" in node) || depth > 50) return "";
  // A picture used as a label is read by its description.
  if (isElement(node) && node.tagName === "img") return typeof node.properties.alt === "string" ? node.properties.alt : "";
  return node.children.map((child) => wordsOf(child, depth + 1)).join("");
}

const labelOf = (node: Nodes) => tidyText(wordsOf(node)).replace(/\s+/g, " ").slice(0, 300);

function findAll(node: Nodes, name: string, found: Element[] = [], depth = 0): Element[] {
  if (isElement(node) && localName(node) === name) found.push(node);
  if ("children" in node && depth < 100) for (const child of node.children) findAll(child, name, found, depth + 1);
  return found;
}

/** Gathers lines, resolving each against the file that wrote it, up to the limit. */
function contentsList(from: string) {
  const lines: ContentsLine[] = [];
  return {
    lines,
    full: () => lines.length >= MAX_CONTENTS_ENTRIES,
    add(title: string, href: string | undefined, depth: number): void {
      if (!title || lines.length >= MAX_CONTENTS_ENTRIES) return;
      const target = href ? resolveHref(from, href) : null;
      const fragment = href && target ? fragmentOf(href) : undefined;
      lines.push({
        title,
        ...(target ? { path: target } : {}),
        ...(fragment ? { fragment } : {}),
        depth: Math.min(depth, MAX_CONTENTS_DEPTH - 1),
      });
    },
  };
}

/** EPUB 3: `<nav epub:type="toc"><ol><li><a href>…</a><ol>…</ol></li></ol></nav>`. */
function navLines(source: string, navPath: string): ContentsLine[] {
  const tree = documentParser.parse(expandSelfClosing(source));
  const navs = findAll(tree, "nav");
  const typeOf = (nav: Element) => String(nav.properties["epub:type"] ?? nav.properties.role ?? "");
  const toc = navs.find((nav) => /\btoc\b/.test(typeOf(nav))) ?? navs.find((nav) => findAll(nav, "ol").length > 0);
  if (!toc) return [];
  const list = contentsList(navPath);
  const walk = (parent: Element, depth: number) => {
    for (const ol of childElements(parent, "ol")) {
      for (const li of childElements(ol, "li")) {
        if (list.full()) return;
        // The label is the item's link, or failing that its own words without those of the lists inside it.
        const own: Element = { ...li, children: li.children.filter((child) => !(isElement(child) && child.tagName === "ol")) };
        const link = findAll(own, "a")[0];
        const label = link ?? own;
        const href = typeof link?.properties.href === "string" ? link.properties.href : undefined;
        list.add(labelOf(label), href, depth);
        if (depth < 50) walk(li, depth + 1);
      }
    }
  };
  walk(toc, 0);
  return list.lines;
}

/** EPUB 2: `<navMap><navPoint><navLabel><text>…</text></navLabel><content src/>…</navPoint></navMap>`. */
function ncxLines(source: string, ncxPath: string): ContentsLine[] {
  const tree = fragmentParser.parse(expandSelfClosing(source));
  const map = findAll(tree, "navmap")[0];
  if (!map) return [];
  const list = contentsList(ncxPath);
  const walk = (parent: Element, depth: number) => {
    for (const point of childElements(parent, "navpoint")) {
      if (list.full()) return;
      const label = childElements(point, "navlabel")[0];
      const src = childElements(point, "content")[0]?.properties.src;
      list.add(label ? labelOf(label) : "", typeof src === "string" ? src : undefined, depth);
      if (depth < 50) walk(point, depth + 1);
    }
  };
  walk(map, 0);
  return list.lines;
}

/**
 * The book's table of contents: from its navigation document, else from its NCX. Empty
 * when it has neither, or neither can be read; the reading order still stands.
 */
export async function readContents(zip: ZipReader, book: EpubPackage, maxBytes = MAX_PACKAGE_BYTES): Promise<ContentsLine[]> {
  const attempts: Array<[string | undefined, (source: string, from: string) => ContentsLine[]]> = [
    [book.navPath, navLines],
    [book.ncxPath, ncxLines],
  ];
  for (const [file, read] of attempts) {
    if (!file) continue;
    try {
      const lines = read(decodeText(await zip.read(file, maxBytes)), file);
      if (lines.length > 0) return lines;
    } catch {
      // A table of contents that cannot be read is done without.
    }
  }
  return [];
}
