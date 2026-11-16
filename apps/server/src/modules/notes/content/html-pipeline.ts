/**
 * HTML → Markdown syntax tree, safely. HTML is parsed, cleaned with an allow-list
 * (rehype-sanitize) and only then converted, so scripts, styles, frames, event handlers
 * and `javascript:` URLs are gone before anything looks at the content.
 *
 * Used for whole HTML files (`htmlToDoc`) and for the HTML fragments people put inside
 * Markdown. A few elements Markdown has no node for are passed on in the form the
 * mdast → document mapper already understands from Markdown:
 *   <u>, <ins>, <mark>  → emphasis nodes labelled with the mark that was meant
 *   <aside>             → a blockquote that starts with `[!NOTE]` (a callout)
 *   <details>           → an `outpostDetails` node carrying its summary
 */
import type { Element, Nodes as HastNodes, Root as HastRoot } from "hast";
import { toText } from "hast-util-to-text";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { unified } from "unified";
import type { MdNode } from "./from-mdast.ts";
import { type PrepareOptions, prepareForConversion } from "./html-prepare.ts";

/** The part of the converter's state the handlers below use. */
interface State {
  all(node: Element): MdNode[];
  toFlow(nodes: MdNode[]): MdNode[];
}
type Handle = (state: State, node: Element) => MdNode | MdNode[];

const schema: typeof defaultSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "u", "mark", "aside"],
  // Elements whose content is not writing. Everything else that is not allowed is
  // replaced by its children, so the words inside an unknown wrapper survive.
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
  // Inline pictures are let through here and judged by `safeUrl` later, which only
  // accepts raster image types.
  protocols: { ...defaultSchema.protocols, src: ["http", "https", "data"] },
  // Ids are not used by the content model, so there is nothing to protect by renaming them.
  clobber: [],
};

/**
 * Underline and highlight travel as an emphasis node with a note on it. Emphasis is
 * something every step of the conversion treats as inline content, so the words stay in
 * their sentence; the note tells the mapper which mark was really meant.
 */
const markAs =
  (mark: "underline" | "highlight"): Handle =>
  (state, node) => ({ type: "emphasis", data: { outpostMark: mark }, children: state.all(node) });

const isElement = (node: unknown, tagName: string): node is Element =>
  (node as Element | undefined)?.type === "element" && (node as Element).tagName === tagName;

const handlers: Record<string, Handle> = {
  u: markAs("underline"),
  ins: markAs("underline"),
  mark: markAs("highlight"),
  aside: (state, node) => ({
    type: "blockquote",
    children: [{ type: "paragraph", children: [{ type: "text", value: "[!NOTE]" }] }, ...state.toFlow(state.all(node))],
  }),
  details: (state, node) => {
    const summary = node.children.find((child) => isElement(child, "summary")) as Element | undefined;
    const body: Element = { ...node, children: node.children.filter((child) => child !== summary) };
    return {
      type: "outpostDetails",
      summary: summary ? state.all(summary) : [],
      children: state.toFlow(state.all(body)),
    };
  },
};

/**
 * Of the elements the allow-list lets through, the ones the converter's look-ahead does
 * not stop at: everything that sits inside a line of text, and `<details>`. These are
 * what it is slow at when they are empty and in a row. An empty block (a paragraph, a
 * list item, a table cell) ends the look-ahead, and is left for the converter to treat
 * as it always has.
 */
const DROPPED_WHEN_EMPTY = new Set([
  "a",
  "b",
  "code",
  "del",
  "details",
  "em",
  "i",
  "ins",
  "kbd",
  "mark",
  "picture",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "source",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "tt",
  "u",
  "var",
]);

/**
 * What the walk before conversion does here (see `html-prepare.ts`). The elements opened
 * are the inline ones the converter passes on as their words alone; `<u>`, `<ins>` and
 * `<mark>` are not among them because they become marks above. A `<q>` is written out
 * as the converter would write it, its words between quotation marks, so that a row of
 * them is one piece of text and not three pieces each.
 */
const PREPARE: PrepareOptions = {
  open: new Set(["span", "sup", "sub", "ruby", "rt", "rp"]),
  keepEmpty: (tagName) => !DROPPED_WHEN_EMPTY.has(tagName),
  replace: (child) => (child.tagName === "q" ? [{ type: "text", value: '"' }, ...child.children, { type: "text", value: '"' }] : undefined),
};

const processor = unified()
  .use(rehypeParse)
  .use(rehypeSanitize, schema)
  .use(() => (tree: HastRoot) => prepareForConversion(tree, PREPARE))
  .use(rehypeRemark, { handlers: handlers as never })
  .freeze();

function findElement(node: HastNodes, tagName: string, depth = 0): Element | undefined {
  if (isElement(node, tagName)) return node;
  // Real pages are nowhere near this deep; the limit only stops hostile nesting.
  if (depth > 200 || !("children" in node)) return undefined;
  for (const child of node.children) {
    const found = findElement(child, tagName, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export interface HtmlTree {
  /** Markdown syntax tree of the cleaned HTML. */
  tree: MdNode;
  /** Text of `<title>`, or of the first `<h1>` when there is no title. */
  title?: string;
}

export function htmlToMdast(html: string): HtmlTree {
  const hast = processor.parse(html) as HastRoot;
  const titleElement = findElement(hast, "title") ?? findElement(hast, "h1");
  const title = titleElement ? toText(titleElement).replace(/\s+/g, " ").trim() : "";
  const tree = processor.runSync(hast) as unknown as MdNode;
  return title ? { tree, title } : { tree };
}
