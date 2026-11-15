/**
 * Text from an EPUB book.
 *
 * An EPUB is a zip. `META-INF/container.xml` names the package file (OPF); the OPF
 * lists every file (the manifest) and the reading order (the spine). Each document in
 * the spine, usually a chapter, becomes one section.
 */
import path from "node:path";
import type { Element, Nodes } from "hast";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { decodeText, firstHeading, htmlText, parseHtml } from "./extract-text.ts";
import { type Extracted, type ExtractedSection, ExtractionError, type ExtractProgress, tidyText } from "./extract-types.ts";
import { openZip, type ZipReader } from "./zip.ts";

const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
const MAX_CHAPTER_BYTES = 32 * 1024 * 1024;
/** Extracted text kept from one book; a guard against archives built to exhaust memory. */
const MAX_BOOK_CHARS = 64 * 1024 * 1024;

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

interface XmlElement {
  /** Tag name without a namespace prefix, lower-case. */
  name: string;
  attributes: Record<string, string>;
  text: string;
}

const fragmentParser = unified().use(rehypeParse, { fragment: true });

/** Every element of a small XML file, in document order. Enough for the OPF and container. */
function xmlElements(xml: string): XmlElement[] {
  const tree = fragmentParser.parse(expandSelfClosing(xml));
  const elements: XmlElement[] = [];
  const visit = (node: Nodes) => {
    if (node.type === "element") elements.push(describe(node));
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(tree);
  return elements;
}

function describe(element: Element): XmlElement {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(element.properties)) {
    if (value === null || value === undefined || value === false) continue;
    attributes[key.toLowerCase()] = Array.isArray(value) ? value.join(" ") : String(value);
  }
  const text = element.children.map((child) => (child.type === "text" ? child.value : "")).join("");
  return { name: element.tagName.replace(/^.*:/, "").toLowerCase(), attributes, text: tidyText(text) };
}

/** Resolves a manifest href against the folder of the OPF. Null when it leaves the archive. */
function resolveHref(opfPath: string, href: string): string | null {
  let decoded = href.split("#")[0] ?? "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Not percent-encoded after all; use it as written.
  }
  if (!decoded || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) return null;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(opfPath), decoded));
  return resolved.startsWith("..") || resolved.startsWith("/") ? null : resolved;
}

interface Package {
  meta: Extracted["meta"];
  /** Archive paths of the content documents, in reading order. */
  chapters: string[];
}

async function readPackage(zip: ZipReader): Promise<Package> {
  const damaged = new ExtractionError(
    "This EPUB is missing the files that describe its contents, so it could not be read. It may be damaged.",
  );
  if (!zip.has("META-INF/container.xml")) throw damaged;
  const container = xmlElements(decodeText(await zip.read("META-INF/container.xml", MAX_PACKAGE_BYTES)));
  const opfPath = container.find((element) => element.name === "rootfile" && element.attributes["full-path"])?.attributes["full-path"];
  if (!opfPath || !zip.has(opfPath)) throw damaged;

  const elements = xmlElements(decodeText(await zip.read(opfPath, MAX_PACKAGE_BYTES)));
  const first = (name: string) => elements.find((element) => element.name === name && element.text)?.text.slice(0, 300);

  const manifest = new Map<string, XmlElement>();
  for (const element of elements) {
    if (element.name === "item" && element.attributes.id) manifest.set(element.attributes.id, element);
  }
  const chapters: string[] = [];
  for (const element of elements) {
    if (element.name !== "itemref") continue;
    const item = manifest.get(element.attributes.idref ?? "");
    if (!item?.attributes.href) continue;
    const mediaType = item.attributes["media-type"] ?? "";
    const isMarkup = /x?html/i.test(mediaType) || /\.x?html?$/i.test(item.attributes.href);
    // The navigation document is a table of contents; indexing it would make every
    // chapter title match twice.
    const isNav = (item.attributes.properties ?? "").split(/\s+/).includes("nav");
    const target = resolveHref(opfPath, item.attributes.href);
    if (isMarkup && !isNav && target && zip.has(target) && !chapters.includes(target)) chapters.push(target);
  }
  return { meta: { title: first("title"), author: first("creator"), language: first("language")?.slice(0, 35) }, chapters };
}

export async function extractEpub(file: string, onProgress: (progress: ExtractProgress) => void): Promise<Extracted> {
  const zip = await openZip(file);
  try {
    const { meta, chapters } = await readPackage(zip);
    const sections: ExtractedSection[] = [];
    const notes: string[] = [];
    let skipped = 0;
    let chars = 0;

    for (const [index, chapter] of chapters.entries()) {
      if (chars >= MAX_BOOK_CHARS) {
        notes.push("This book is unusually large, so only the first part of it can be searched.");
        break;
      }
      try {
        const parsed = parseHtml(expandSelfClosing(decodeText(await zip.read(chapter, MAX_CHAPTER_BYTES))));
        const text = htmlText(parsed.tree);
        if (text) {
          sections.push({ heading: firstHeading(parsed.tree) ?? parsed.title, text });
          chars += text.length;
        }
      } catch {
        // Encrypted (DRM), oversized or damaged chapters are left out; the rest still counts.
        skipped += 1;
      }
      onProgress({ current: index + 1, total: chapters.length, message: `Reading chapter ${index + 1} of ${chapters.length}` });
    }

    if (skipped > 0) {
      notes.push(
        `${skipped} of ${chapters.length} chapters could not be read and ${skipped === 1 ? "is" : "are"} not searchable. The book may be copy-protected (DRM) or damaged.`,
      );
    }
    return { sections, pageCount: null, meta, notes };
  } finally {
    zip.close();
  }
}
