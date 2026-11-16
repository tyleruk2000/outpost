/**
 * An article, once found, becomes Markdown.
 *
 * The article is still a piece of somebody else's HTML at this point. It is cleaned
 * with an allow-list (`rehype-sanitize`, as imported HTML is), turned into a Markdown
 * syntax tree, and written out as text. What is kept is headings, paragraphs, lists,
 * quotations, tables, code, emphasis, links and pictures. Scripts, styles, frames,
 * forms and every attribute but a link's address and a picture's address and
 * description are gone before the tree exists, and the tree has no node that could
 * hold raw HTML.
 */
import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { Heading, Nodes, Paragraph, Root, RootContent } from "mdast";
import rehypeRemark from "rehype-remark";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { pictureLabel } from "../documents/embedded-pictures.ts";
import { markdownText } from "../documents/extract-text.ts";

const schema: typeof defaultSchema = {
  ...defaultSchema,
  // Elements whose content is not writing. Anything else not on the list is replaced by
  // what is inside it, so the words in an unknown wrapper survive.
  strip: [
    "script",
    "style",
    "head",
    "title",
    "template",
    "noscript",
    "iframe",
    "object",
    "embed",
    "svg",
    "math",
    "canvas",
    "audio",
    "video",
    "select",
    "textarea",
    "button",
  ],
  protocols: { ...defaultSchema.protocols, href: ["http", "https", "mailto"], src: ["http", "https"] },
  clobber: [],
};

const toTree = unified().use(rehypeSanitize, schema).use(rehypeRemark).freeze();

const toText = unified()
  .use(remarkGfm, { tablePipeAlign: false })
  .use(remarkStringify, {
    bullet: "-",
    emphasis: "*",
    strong: "*",
    // Asterisks, so that a rule can never be mistaken for front matter or a setext heading.
    rule: "*",
    fences: true,
    listItemIndent: "one",
    incrementListMarker: true,
  })
  .freeze();

/** Deeper than any article is written; what lies below is kept as its words. */
const MAX_DEPTH = 48;

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "−": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
};
const SUBSCRIPT: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "−": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
};

const CELL_BLOCKS = new Set([
  "p",
  "div",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "section",
  "figure",
  "dl",
  "dt",
  "dd",
]);

/**
 * Two things Markdown would otherwise lose. "H₂O" and "x²" keep their small figures
 * where the characters exist; and paragraphs inside one table cell stay apart.
 */
function prepare(node: Element, depth = 0): void {
  if (depth > 400) return;
  const inCell = node.tagName === "td" || node.tagName === "th";
  const children: ElementContent[] = [];
  for (const child of node.children) {
    if (child.type !== "element") {
      children.push(child);
      continue;
    }
    prepare(child, depth + 1);
    if ((child.tagName === "sup" || child.tagName === "sub") && child.children.length === 1 && child.children[0]!.type === "text") {
      const table = child.tagName === "sup" ? SUPERSCRIPT : SUBSCRIPT;
      const written = child.children[0]!.value.trim();
      if (written && written.length <= 6 && [...written].every((letter) => table[letter])) {
        children.push({ type: "text", value: [...written].map((letter) => table[letter]).join("") });
        continue;
      }
    }
    if (inCell && CELL_BLOCKS.has(child.tagName)) {
      if (children.length > 0) children.push({ type: "element", tagName: "br", properties: {}, children: [] });
      children.push(...child.children);
      continue;
    }
    children.push(child);
  }
  node.children = children;
}

const isWeb = (address: string | null | undefined) => /^https?:\/\//i.test(address ?? "");

/** Tidies the tree: no raw HTML, no empty links, a linked picture as just the picture, and nothing absurdly deep. */
function settle(node: Nodes, depth: number): Nodes[] {
  if (node.type === "html" || node.type === "definition" || node.type === "yaml") return [];
  if (node.type === "image") {
    const alt = (node.alt ?? "").replace(/\s+/g, " ").trim();
    if (!isWeb(node.url)) return alt ? [{ ...node, url: "", alt }] : [];
    return [{ ...node, alt }];
  }
  if (!("children" in node)) return [node];
  if (depth >= MAX_DEPTH) {
    const words = markdownText(node).trim();
    return words ? [{ type: "paragraph", children: [{ type: "text", value: words }] }] : [];
  }
  const children = (node.children as Nodes[]).flatMap((child) => settle(child, depth + 1));
  if (node.type === "link") {
    const words = children.some((child) => markdownText(child).trim());
    const pictures = children.filter((child) => child.type === "image");
    // A picture that is also a link is kept as the picture: the copy is for reading.
    if (pictures.length > 0 && children.every((child) => child.type === "image" || !markdownText(child).trim())) return pictures;
    if (!words) return [];
  }
  // A heading that links to itself, as many sites make them, is just the heading.
  if (node.type === "heading") {
    const plain = children.flatMap((child) => (child.type === "link" && child.url.startsWith("#") ? (child.children as Nodes[]) : [child]));
    return plain.length > 0 ? [{ ...node, children: plain } as Nodes] : [];
  }
  const empty = children.length === 0 || children.every((child) => child.type === "text" && !child.value.trim());
  if (empty && node.type !== "root" && node.type !== "tableCell" && node.type !== "tableRow" && node.type !== "table") return [];
  return [{ ...node, children } as Nodes];
}

function* nodesIn(node: Nodes): Generator<Nodes> {
  yield node;
  if ("children" in node) for (const child of node.children as Nodes[]) yield* nodesIn(child);
}

export interface ConvertedArticle {
  /** The article as a Markdown syntax tree. Pictures are `image` nodes with their web address. */
  tree: Root;
  /** The address of each picture, once each, in the order they come. */
  pictures: string[];
  /** The words alone. */
  text: string;
}

export function convertArticle(content: Element): ConvertedArticle {
  prepare(content);
  const converted = toTree.runSync({ type: "root", children: [content] } satisfies HastRoot) as unknown as Root;
  const tree = (settle(converted, 0)[0] as Root | undefined) ?? { type: "root", children: [] };

  // A heading left with nothing under it (its list of links was taken out, say) goes too.
  for (let index = tree.children.length - 1; index >= 0; index -= 1) {
    const node = tree.children[index]!;
    const next = tree.children[index + 1];
    if (node.type === "heading" && (!next || (next.type === "heading" && next.depth <= node.depth))) tree.children.splice(index, 1);
  }

  // The title is the one first-level heading. If the article uses that level for its sections, they all move down one.
  const headings = [...nodesIn(tree)].filter((node): node is Heading => node.type === "heading");
  if (headings.some((heading) => heading.depth === 1)) {
    for (const heading of headings) heading.depth = Math.min(6, heading.depth + 1) as Heading["depth"];
  }

  const pictures = new Set<string>();
  for (const node of nodesIn(tree)) if (node.type === "image" && isWeb(node.url)) pictures.add(node.url);
  return {
    tree,
    pictures: [...pictures],
    text: markdownText(tree)
      .replace(/[ \t]+/g, " ")
      .trim(),
  };
}

/**
 * Points each picture that was brought along at its place in the file, by number, and
 * takes out the ones that turned out not to be pictures at all (a counter one dot
 * wide). Any other picture keeps its address and is shown as its description.
 */
export function placePictures(tree: Root, numbers: ReadonlyMap<string, number>, remove: ReadonlySet<string>): Root {
  const place = (node: Nodes): Nodes[] => {
    if (node.type === "image") {
      if (remove.has(node.url)) return [];
      const number = numbers.get(node.url);
      if (number === undefined) return [node];
      const label = pictureLabel(number);
      return [{ type: "imageReference", identifier: label, label, referenceType: "full", alt: node.alt ?? "" }];
    }
    if (!("children" in node)) return [node];
    const children = (node.children as Nodes[]).flatMap(place);
    if (children.length === 0 && (node.type === "paragraph" || node.type === "link" || node.type === "emphasis" || node.type === "strong"))
      return [];
    return [{ ...node, children } as Nodes];
  };
  return (place(tree)[0] as Root | undefined) ?? { type: "root", children: [] };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "1 October 2026" from an ISO date, read as the calendar day it names. */
export function plainDate(iso: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${Number(match[3])} ${month} ${match[1]}` : undefined;
}

export interface Heading1 {
  title: string;
  byline?: string;
  site?: string;
  published?: string;
}

/** The article as Markdown text, under its title and a line saying who wrote it, where and when. */
export function writeArticle(tree: Root, head: Heading1): string {
  const opening: RootContent[] = [{ type: "heading", depth: 1, children: [{ type: "text", value: head.title }] }];
  const published = head.published ? plainDate(head.published) : undefined;
  // A name that ends in a full stop of its own ("Example, Inc.") is not given a second.
  const sentence = (words: string) => (/[.!?]$/.test(words) ? words : `${words}.`);
  const credits = [
    head.byline ? sentence(`By ${head.byline}`) : "",
    head.site ? sentence(head.site) : "",
    published ? `Published ${published}.` : "",
  ].filter(Boolean);
  if (credits.length > 0) {
    const line: Paragraph = { type: "paragraph", children: [{ type: "emphasis", children: [{ type: "text", value: credits.join(" ") }] }] };
    opening.push(line);
  }
  return toText.stringify({ type: "root", children: [...opening, ...tree.children] });
}
