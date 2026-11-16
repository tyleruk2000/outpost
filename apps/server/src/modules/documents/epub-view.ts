/**
 * A chapter of an EPUB book as a person reads it.
 *
 * A chapter is an XHTML page written by whoever made the book, with its own styles and
 * sometimes its own scripts. None of that reaches the browser. The page is parsed and
 * read into the same tree of plain values a Markdown file becomes (`markdown-view.ts`),
 * which the web app draws with its own elements: headings, paragraphs, emphasis, lists,
 * quotations, tables, code, notes and pictures. An element this file does not name
 * keeps its words and loses everything else; no attribute is copied across.
 *
 * Three things in a chapter point somewhere, and each is looked up rather than passed on:
 * a link (to the web, to a place in this chapter, or to another chapter of the book), a
 * picture (a file inside the book's archive) and an id (a place a link can land on).
 *
 * The parser is the forgiving HTML one the import path uses. Chapters are meant to be
 * XML, but books in the wild have unclosed tags and stray ampersands, and a strict
 * reader would refuse them.
 */
import type { MarkdownBlock, MarkdownInline, MarkdownListItem } from "@outpost/shared";
import type { Element, Nodes, Root } from "hast";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { expandSelfClosing } from "./epub-package.ts";

/** Lists inside quotations inside lists: past this depth the rest is shown as plain text. */
const MAX_DEPTH = 16;
/** Places a link can land on that are kept from one chapter. */
const MAX_ANCHORS = 20_000;
const MAX_ALT_CHARS = 500;

/** What was left out of a chapter, so the reader can be told. */
export type LeftOut = "script" | "media" | "math" | "drawing" | "form";

/** Where a link written in a chapter leads. */
export type LinkTarget =
  | { kind: "web"; href: string }
  /** A place in this chapter. */
  | { kind: "here"; anchor?: string }
  /** Another chapter, counted from 1; 0 is the book's contents. */
  | { kind: "chapter"; chapter: number; anchor?: string };

export interface ChapterLookups {
  /** Null for anything the reader will not follow; the link's words are then kept as words. */
  link(href: string): LinkTarget | null;
  /** The archive path of a picture the chapter names, or null when the book has no such file. */
  picture(src: string): string | null;
}

export interface ChapterView {
  blocks: MarkdownBlock[];
  leftOut: LeftOut[];
}

/**
 * The id a place in a chapter is known by. Ids in books hold dots, colons and other
 * characters the web app does not accept in an id, so each of those becomes an
 * underscore. The mapping needs nothing but the id itself, which is what lets a link
 * from one chapter name a place in another without that chapter being read.
 */
export function anchorId(raw: string): string {
  return raw
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}_-]/gu, "_")
    .slice(0, 200);
}

const parser = unified().use(rehypeParse);

const BLOCK_TAGS = new Set(
  "address article aside blockquote body caption center dd details dialog dir div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr html li main menu nav ol p pre section summary table tbody td tfoot th thead tr ul".split(
    " ",
  ),
);
/** Elements whose content is not writing: it is code, styling, or a control. */
const DROPPED: Record<string, LeftOut | null> = {
  script: "script",
  style: null,
  head: null,
  title: null,
  template: null,
  noscript: null,
  link: null,
  meta: null,
  iframe: "media",
  object: "media",
  embed: "media",
  audio: "media",
  video: "media",
  canvas: "script",
  select: "form",
  textarea: "form",
  button: "form",
  input: "form",
};
const HEADING = /^h([1-6])$/;
/** Elements a heading cannot hold: finding one inside a heading means the heading was left open. */
const RUNAWAY = new Set("p ul ol dl table blockquote pre hr figure h1 h2 h3 h4 h5 h6".split(" "));
/** Ids some shops add to every sentence of a book; nothing links to them. */
const NOISE_ID = /^kobo\.\d+\.\d+$/;

const isElement = (node: Nodes): node is Element => node.type === "element";
const collapse = (value: string) => value.replace(/[ \t\n\r\f]+/g, " ");
const text = (v: string): MarkdownInline[] => (v ? [{ t: "text", v }] : []);
/** `push(...items)` passes every item as an argument, and a long chapter has more runs than a call can take. */
function append<T>(target: T[], items: readonly T[]): void {
  for (const item of items) target.push(item);
}
const attribute = (node: Element, name: string): string | undefined => {
  const value = node.properties[name];
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
};

/**
 * Joins neighbouring text runs and squeezes the spaces where they meet. The pieces of
 * a stretch of text are joined once, at its end: a paragraph of a hundred thousand
 * one-letter runs must not cost a hundred thousand ever-longer strings.
 */
function merged(runs: MarkdownInline[]): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  let pieces: string[] = [];
  const settle = () => {
    if (pieces.length === 0) return;
    const v = pieces.length === 1 ? (pieces[0] ?? "") : collapse(pieces.join(""));
    pieces = [];
    if (v) out.push({ t: "text", v });
  };
  for (const run of runs) {
    if (run.t === "text") pieces.push(run.v);
    else {
      settle();
      out.push(run);
    }
  }
  settle();
  return out;
}

/** True when a run shows nothing: an anchor, or only spaces. */
const isBlank = (run: MarkdownInline) => run.t === "anchor" || (run.t === "text" && !run.v.trim());

/** Runs as a block holds them: joined, with no space at either end. */
function tidy(runs: MarkdownInline[]): MarkdownInline[] {
  const out = merged(runs);
  const first = out.find((run) => run.t !== "anchor");
  if (first?.t === "text") first.v = first.v.trimStart();
  const last = out.findLast((run) => run.t !== "anchor");
  if (last?.t === "text") last.v = last.v.trimEnd();
  return out.filter((run) => run.t !== "text" || run.v);
}

interface Context {
  lookups: ChapterLookups;
  /** Every place in this chapter a link can land on. */
  ids: Set<string>;
  leftOut: Set<LeftOut>;
  /** Whether each element has a block-level element somewhere inside it. */
  holdsBlock: WeakMap<Element, boolean>;
}

/** The words of a subtree, with line breaks where `<br>` stood. Used where formatting is not kept. */
function wordsOf(node: Nodes): string {
  if (node.type === "text") return node.value;
  if (!isElement(node)) return "children" in node ? node.children.map(wordsOf).join("") : "";
  if (node.tagName === "br") return "\n";
  if (node.tagName in DROPPED) return "";
  if (node.tagName === "img") return attribute(node, "alt") ?? "";
  return node.children.map(wordsOf).join("");
}

function holdsBlock(node: Element, context: Context): boolean {
  const known = context.holdsBlock.get(node);
  if (known !== undefined) return known;
  const found = node.children.some((child) => isElement(child) && (BLOCK_TAGS.has(child.tagName) || holdsBlock(child, context)));
  context.holdsBlock.set(node, found);
  return found;
}

/** The place this element marks, when it has an id a link could name. */
function placeOf(node: Element, context: Context): string | undefined {
  const raw = attribute(node, "id") ?? (node.tagName === "a" ? attribute(node, "name") : undefined);
  const id = raw && !NOISE_ID.test(raw) ? anchorId(raw) : "";
  return id && context.ids.has(id) ? id : undefined;
}

const anchors = (id: string | undefined): MarkdownInline[] => (id ? [{ t: "anchor", id }] : []);

/** Something that names the kind of thing an element is: `epub:type="footnote"`, `role="doc-footnote"`. */
const kindOf = (node: Element) => `${attribute(node, "epub:type") ?? ""} ${attribute(node, "role") ?? ""}`.toLowerCase();

function picture(src: string | undefined, alt: string, context: Context): MarkdownInline[] {
  const file = src ? context.lookups.picture(src) : null;
  const words = collapse(alt).trim().slice(0, MAX_ALT_CHARS);
  if (file) return [{ t: "picture", src: file, alt: words }];
  // A picture that is not in the book (one on the web, say) is never fetched; what was written about it is kept.
  return words ? [{ t: "image", alt: words }] : [];
}

/** A drawing written into the page. Only the pictures it places are shown; its own shapes are not. */
function drawing(node: Element, context: Context): MarkdownInline[] {
  const placed: MarkdownInline[] = [];
  let label = attribute(node, "ariaLabel") ?? "";
  const visit = (child: Nodes, depth: number) => {
    if (!isElement(child) || depth > 50) return;
    if (child.tagName === "image") placed.push(...picture(attribute(child, "href") ?? attribute(child, "xLinkHref"), label, context));
    else if ((child.tagName === "title" || child.tagName === "desc") && !label) {
      label = child.children.map((inner) => (inner.type === "text" ? inner.value : "")).join("");
    }
    for (const inner of child.children) visit(inner, depth + 1);
  };
  for (const child of node.children) visit(child, 0);
  if (placed.length > 0) return placed;
  context.leftOut.add("drawing");
  const words = collapse(label).trim().slice(0, MAX_ALT_CHARS);
  return words ? [{ t: "image", alt: words }] : [];
}

function inline(node: Nodes, context: Context): MarkdownInline[] {
  if (node.type === "text") return text(collapse(node.value));
  if (!isElement(node)) return [];
  const tag = node.tagName;
  if (tag in DROPPED) {
    const what = DROPPED[tag];
    if (what) context.leftOut.add(what);
    return [];
  }
  const place = anchors(placeOf(node, context));
  const children = () => merged(node.children.flatMap((child) => inline(child, context)));
  const wrap = (t: "strong" | "em" | "del" | "sup" | "sub"): MarkdownInline[] => {
    const c = children();
    return [...place, ...(c.every(isBlank) ? c : [{ t, c }])];
  };
  switch (tag) {
    case "br":
      return [...place, { t: "break" }];
    case "wbr":
    case "rp":
      return place;
    case "strong":
    case "b":
      return wrap("strong");
    case "em":
    case "i":
    case "cite":
    case "dfn":
    case "var":
      return wrap("em");
    case "del":
    case "s":
    case "strike":
      return wrap("del");
    case "sup":
      return wrap("sup");
    case "sub":
      return wrap("sub");
    case "code":
    case "kbd":
    case "samp":
    case "tt": {
      const v = wordsOf(node);
      return [...place, ...(v.trim() ? [{ t: "code" as const, v }] : [])];
    }
    case "q":
      return [...place, ...text("“"), ...children(), ...text("”")];
    // The reading of a character, written above it in the book, follows it in brackets here.
    case "rt":
      return [...place, ...text(" ("), ...children(), ...text(")")];
    case "img":
      return [...place, ...picture(attribute(node, "src"), attribute(node, "alt") ?? "", context)];
    case "svg":
      return [...place, ...drawing(node, context)];
    case "math": {
      // Mathematics is not drawn. What its author wrote for a reader who cannot see it is used, else its symbols in order.
      context.leftOut.add("math");
      return [...place, ...text(collapse(attribute(node, "alttext") ?? wordsOf(node)))];
    }
    case "a": {
      const label = children();
      const href = attribute(node, "href") ?? attribute(node, "xLinkHref");
      const target = href ? context.lookups.link(href) : null;
      if (!target || label.every(isBlank)) return [...place, ...label];
      if (target.kind === "web") return [...place, { t: "link", href: target.href, c: label }];
      if (target.kind === "chapter") {
        return [...place, { t: "chapter", chapter: target.chapter, ...(target.anchor ? { anchor: target.anchor } : {}), c: label }];
      }
      // A jump is kept only when it has somewhere to land.
      return [
        ...place,
        ...(target.anchor && context.ids.has(target.anchor) ? [{ t: "jump" as const, to: target.anchor, c: label }] : label),
      ];
    }
    default:
      // A block met where only words can go (a `<div>` inside a heading) keeps its words apart from its neighbours'.
      return BLOCK_TAGS.has(tag) ? [...place, ...text(" "), ...children(), ...text(" ")] : [...place, ...children()];
  }
}

/** Puts a place at the start of the first words of some blocks, so a link to their container lands on them. */
function withPlace(blocks: MarkdownBlock[], id: string | undefined): MarkdownBlock[] {
  if (!id) return blocks;
  const mark: MarkdownInline = { t: "anchor", id };
  const first = blocks[0];
  if (first?.t === "paragraph" || first?.t === "heading") first.c.unshift(mark);
  else if (first?.t === "quote") first.c = withPlace(first.c, id);
  else if (first?.t === "list" && first.items[0]) first.items[0].c = withPlace(first.items[0].c, id);
  else if (first?.t === "table" && first.rows[0]?.[0]) first.rows[0][0].unshift(mark);
  // Nothing to hold it (a picture, a rule, code, or no content at all): a paragraph of its own, which shows nothing.
  else blocks.unshift({ t: "paragraph", c: [mark] });
  return blocks;
}

/** A paragraph from some runs; a picture alone in a paragraph stands on its own. */
function paragraph(runs: MarkdownInline[], out: MarkdownBlock[]): void {
  const c = tidy(runs);
  const shown = c.filter((run) => !isBlank(run));
  if (shown.length === 0) {
    // Places with no words around them are kept, so links to them still land here.
    if (c.length > 0) out.push({ t: "paragraph", c });
    return;
  }
  const only = shown.length === 1 ? shown[0] : undefined;
  if (only?.t === "picture") {
    const places = c.filter((run) => run.t === "anchor");
    if (places.length > 0) out.push({ t: "paragraph", c: places });
    out.push({ t: "figure", src: only.src, alt: only.alt });
    return;
  }
  out.push({ t: "paragraph", c });
}

/** What a table cell holds, as runs: a cell cannot hold blocks, so they follow one another on lines of their own. */
function flattened(blocks: MarkdownBlock[]): MarkdownInline[] {
  const lines: MarkdownInline[][] = [];
  const visit = (block: MarkdownBlock, prefix: string) => {
    switch (block.t) {
      case "paragraph":
      case "heading":
        lines.push([...text(prefix), ...block.c]);
        break;
      case "quote":
        for (const inner of block.c) visit(inner, prefix);
        break;
      case "list":
        block.items.forEach((item, index) => {
          const marker = block.ordered ? `${(block.start ?? 1) + index}. ` : "• ";
          item.c.forEach((inner, at) => {
            visit(inner, at === 0 ? marker : "");
          });
        });
        break;
      case "code":
        lines.push([{ t: "code", v: block.v }]);
        break;
      case "figure":
        lines.push([
          { t: "picture", src: block.src, alt: block.alt },
          ...(block.caption ? [{ t: "break" } as const, ...block.caption] : []),
        ]);
        break;
      case "table":
        for (const row of block.rows) lines.push(row.flatMap((cell, index) => (index > 0 ? [...text(" | "), ...cell] : cell)));
        break;
      default:
        break;
    }
  };
  for (const block of blocks) visit(block, "");
  return merged(lines.flatMap((line, index) => (index > 0 ? [{ t: "break" } as const, ...line] : line)));
}

function cellRuns(cell: Element, context: Context, depth: number): MarkdownInline[] {
  const place = anchors(placeOf(cell, context));
  if (!holdsBlock(cell, context)) return [...place, ...tidy(cell.children.flatMap((child) => inline(child, context)))];
  return [...place, ...flattened(flow(cell.children, context, depth + 1))];
}

function table(node: Element, context: Context, depth: number): MarkdownBlock[] {
  const out: MarkdownBlock[] = [];
  const rows: Element[] = [];
  let caption: Element | undefined;
  const gather = (parent: Element) => {
    for (const child of parent.children) {
      if (!isElement(child)) continue;
      if (child.tagName === "tr") rows.push(child);
      else if (child.tagName === "caption") caption ??= child;
      else if (child.tagName === "thead" || child.tagName === "tbody" || child.tagName === "tfoot") gather(child);
    }
  };
  gather(node);
  const cells = rows.map((row) => row.children.filter((child): child is Element => isElement(child) && /^t[dh]$/.test(child.tagName)));
  const width = Math.max(0, ...cells.map((row) => row.length));
  if (caption)
    paragraph(
      caption.children.flatMap((child) => inline(child, context)),
      out,
    );
  if (width === 0) return out;
  // A table of one column is a layout device, not a table: its cells are read one after another.
  if (width === 1) {
    for (const row of cells) for (const cell of row) append(out, withPlace(flow(cell.children, context, depth), placeOf(cell, context)));
    return out;
  }
  const headed = cells[0]?.some((cell) => cell.tagName === "th") ?? false;
  out.push({
    t: "table",
    ...(headed ? {} : { plain: true as const }),
    rows: cells.map((row) => Array.from({ length: width }, (_, column) => (row[column] ? cellRuns(row[column], context, depth) : []))),
  });
  return out;
}

function list(node: Element, context: Context, depth: number): MarkdownBlock[] {
  const items: MarkdownListItem[] = [];
  let loose: Nodes[] = [];
  // Words written straight into the list, outside any item, join the item before them.
  const settle = () => {
    const blocks = flow(loose, context, depth + 1);
    loose = [];
    if (blocks.length === 0) return;
    const last = items.at(-1);
    if (last) append(last.c, blocks);
    else items.push({ c: blocks });
  };
  for (const child of node.children) {
    if (isElement(child) && child.tagName === "li") {
      settle();
      items.push({ c: withPlace(flow(child.children, context, depth + 1), placeOf(child, context)) });
    } else loose.push(child);
  }
  settle();
  const kept = items.filter((item) => item.c.length > 0);
  if (kept.length === 0) return [];
  const ordered = node.tagName === "ol";
  const start = Number(attribute(node, "start"));
  return [{ t: "list", ordered, ...(ordered && Number.isSafeInteger(start) && start !== 1 ? { start } : {}), items: kept }];
}

/** A picture with its caption, when a `<figure>` is exactly that; otherwise undefined and it is read as it comes. */
function figure(node: Element, context: Context): MarkdownBlock | undefined {
  const caption = node.children.find((child): child is Element => isElement(child) && child.tagName === "figcaption");
  const rest = tidy(node.children.filter((child) => child !== caption).flatMap((child) => inline(child, context)));
  const shown = rest.filter((run) => !isBlank(run));
  const only = shown.length === 1 ? shown[0] : undefined;
  if (only?.t !== "picture") return undefined;
  const words = caption ? tidy(caption.children.flatMap((child) => inline(child, context))) : [];
  return { t: "figure", src: only.src, alt: only.alt, ...(words.some((run) => !isBlank(run)) ? { caption: words } : {}) };
}

function block(node: Element, context: Context, depth: number): MarkdownBlock[] {
  const tag = node.tagName;
  const place = placeOf(node, context);
  if (depth >= MAX_DEPTH) {
    const out: MarkdownBlock[] = [];
    paragraph(text(collapse(wordsOf(node))), out);
    return withPlace(out, place);
  }
  const heading = HEADING.exec(tag);
  if (heading) {
    // A heading that was never closed swallows the paragraphs after it, as it would in a browser.
    // Its opening words are the heading; the rest is read as the text it is.
    const runaway = node.children.findIndex((child) => isElement(child) && RUNAWAY.has(child.tagName));
    const own = runaway === -1 ? node.children : node.children.slice(0, runaway);
    const c = tidy(own.flatMap((child) => inline(child, context)));
    const out: MarkdownBlock[] = c.every(isBlank)
      ? withPlace(c.length > 0 ? [{ t: "paragraph", c }] : [], place)
      : [{ t: "heading", depth: Number(heading[1]), ...(place ? { id: place } : {}), c }];
    if (runaway !== -1) append(out, flow(node.children.slice(runaway), context, depth));
    return out;
  }
  switch (tag) {
    case "p": {
      const out: MarkdownBlock[] = [];
      paragraph([...anchors(place), ...node.children.flatMap((child) => inline(child, context))], out);
      return out;
    }
    case "hr":
      return withPlace([{ t: "rule" }], place);
    case "pre": {
      const v = wordsOf(node).replace(/^\n/, "").replace(/\s+$/, "");
      return withPlace(v ? [{ t: "code", v }] : [], place);
    }
    case "blockquote": {
      const c = flow(node.children, context, depth + 1);
      return withPlace(c.length > 0 ? [{ t: "quote", c }] : [], place);
    }
    case "aside": {
      // A footnote or a sidebar: set apart from the text, and said to be a note rather than a quotation.
      const c = flow(node.children, context, depth + 1);
      return withPlace(c.length > 0 ? [{ t: "quote", kind: "note", c }] : [], place);
    }
    case "ul":
    case "ol":
    case "menu":
    case "dir":
      return withPlace(list(node, context, depth), place);
    case "dt": {
      // A term and what it means: the term in bold, the meaning beneath it.
      const c = tidy(node.children.flatMap((child) => inline(child, context)));
      return withPlace(c.every(isBlank) ? [] : [{ t: "paragraph", c: [{ t: "strong", c }] }], place);
    }
    case "table":
      return withPlace(table(node, context, depth), place);
    case "figure": {
      const drawn = figure(node, context);
      return withPlace(drawn ? [drawn] : flow(node.children, context, depth), place);
    }
    default: {
      // A footnote written as a `<div>` or a `<section>` is a note all the same.
      const blocks = flow(node.children, context, depth);
      const note = /\b(foot|end|rear)note\b/.test(kindOf(node)) && blocks.length > 0;
      return withPlace(note ? [{ t: "quote", kind: "note", c: blocks }] : blocks, place);
    }
  }
}

/** Reads a run of sibling nodes: words and inline elements gather into paragraphs, block elements stand between them. */
function flow(nodes: readonly Nodes[], context: Context, depth: number): MarkdownBlock[] {
  const out: MarkdownBlock[] = [];
  let pending: MarkdownInline[] = [];
  const flush = () => {
    paragraph(pending, out);
    pending = [];
  };
  for (const node of nodes) {
    if (node.type === "text") pending.push(...text(collapse(node.value)));
    else if (!isElement(node)) continue;
    else if (node.tagName in DROPPED) inline(node, context);
    else if (BLOCK_TAGS.has(node.tagName) || holdsBlock(node, context)) {
      flush();
      append(out, block(node, context, depth));
    } else append(pending, inline(node, context));
  }
  flush();
  return out;
}

function find(node: Nodes, tagName: string, depth = 0): Element | undefined {
  if (isElement(node) && node.tagName === tagName) return node;
  if (!("children" in node) || depth > 20) return undefined;
  for (const child of node.children) {
    const found = find(child, tagName, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** Every id in the page, as `anchorId` writes it, and whether the page carries a script anywhere. */
function survey(tree: Root): { ids: Set<string>; scripted: boolean } {
  const ids = new Set<string>();
  let scripted = false;
  const visit = (node: Nodes) => {
    if (isElement(node)) {
      if (node.tagName === "script") scripted = true;
      const raw = attribute(node, "id") ?? (node.tagName === "a" ? attribute(node, "name") : undefined);
      const id = raw && !NOISE_ID.test(raw) ? anchorId(raw) : "";
      if (id && ids.size < MAX_ANCHORS) ids.add(id);
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(tree);
  return { ids, scripted };
}

/**
 * Reads one chapter's XHTML into blocks. Throws `RangeError` for a page nested too
 * deeply to walk; the caller says so in words.
 */
export function chapterBlocks(source: string, lookups: ChapterLookups): ChapterView {
  const tree = parser.parse(expandSelfClosing(source)) as Root;
  const { ids, scripted } = survey(tree);
  const context: Context = { lookups, ids, leftOut: new Set(scripted ? ["script"] : []), holdsBlock: new WeakMap() };
  const body = find(tree, "body");
  const blocks = body ? withPlace(flow(body.children, context, 0), placeOf(body, context)) : flow(tree.children, context, 0);
  return { blocks, leftOut: [...context.leftOut] };
}
