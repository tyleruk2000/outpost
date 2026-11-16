/**
 * Finding the article in a web page.
 *
 * A page is mostly not the thing a person came to read: a header, menus, a sidebar,
 * sharing buttons, a footer, and somewhere among them the text. This file picks out
 * the text, with its title and, where the page says, who wrote it and for which site.
 *
 * The method is the one reader views have used for years, described by Arc90's
 * Readability and kept up by Mozilla: throw away what is never content (scripts,
 * styles, frames, forms, navigation); give every block of running text a score for its
 * length and its commas; pass that score up to the elements that hold it; take the
 * element that gathered the most, less whatever of it is links; then clean out of it
 * the blocks that are mostly links or carry a name such as "share" or "related".
 * It is written here against the HTML tree the server already builds (`rehype-parse`),
 * so that saving a page needs no second HTML parser and no browser-like DOM.
 *
 * Nothing here runs anything. A page that is drawn entirely by its scripts has no
 * text in its HTML, and is reported as having none.
 */
import type { Element, ElementContent, Nodes, Root, Text } from "hast";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { resolveAgainst } from "./address.ts";

export interface Article {
  title: string;
  byline?: string;
  site?: string;
  /** When the page says it was published, as an ISO date. */
  published?: string;
  language?: string;
  /** The article: a `div` holding what was kept. Addresses in it are complete; it has not been sanitised. */
  content: Element;
  /** Characters of running text in `content`. */
  textLength: number;
  /** Something about the page that explains a lack of text, when there is one. */
  hint?: "sign-in" | "script";
}

/** Past this depth a page is not being written by a person, and what lies deeper is dropped. */
const MAX_DEPTH = 256;

// ── Small helpers over the tree ──

const isElement = (node: Nodes | undefined): node is Element => node?.type === "element";
const isText = (node: Nodes | undefined): node is Text => node?.type === "text";

function attr(element: Element, name: string): string {
  const value = element.properties?.[name];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.join(" ");
  return value === true ? name : "";
}

const classAndId = (element: Element) => `${attr(element, "className")} ${attr(element, "id")}`;

/** Every element under `node`, itself included, parents before children. */
function* elementsIn(node: Nodes, depth = 0): Generator<Element> {
  if (isElement(node)) yield node;
  if (!("children" in node) || depth > MAX_DEPTH) return;
  for (const child of node.children) yield* elementsIn(child, depth + 1);
}

function find(node: Nodes, test: (element: Element) => boolean): Element | undefined {
  for (const element of elementsIn(node)) if (test(element)) return element;
  return undefined;
}

/** The words of a node, with runs of white space made one space. */
export function textOf(node: Nodes, depth = 0): string {
  if (isText(node)) return node.value;
  if (!("children" in node) || depth > MAX_DEPTH) return "";
  let text = "";
  for (const child of node.children) {
    if (isElement(child) && child.tagName === "br") text += " ";
    else text += textOf(child, depth + 1);
    if (isElement(child) && BLOCKS.has(child.tagName)) text += " ";
  }
  return text;
}

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

// ── What is never content ──

const NEVER = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "canvas",
  "svg",
  "video",
  "audio",
  "source",
  "track",
  "map",
  "area",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "label",
  "fieldset",
  "dialog",
  "menu",
  "nav",
  "aside",
  "footer",
  "link",
  "meta",
  "base",
  "head",
  "title",
  "slot",
  "portal",
]);

const HIDDEN_ROLES = new Set([
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
  "search",
  "dialog",
  "alertdialog",
  "alert",
  "menu",
  "menubar",
  "toolbar",
  "tablist",
  "form",
  "status",
]);

const BLOCKS = new Set([
  "address",
  "article",
  "blockquote",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/** Names (in `class` or `id`) of things that sit around an article and are not it. */
const UNLIKELY =
  /-ad-|ad-break|adsense|advert|agegate|banner|breadcrumb|combx|comment|community|consent|cookie|disqus|editsection|edit-section|extra|footer|gdpr|header|legends|masthead|menu|modal|newsletter|outbrain|paywall|popup|promo|related|remark|replies|rss|share|sharing|shoutbox|sidebar|skyscraper|social|sponsor|subscribe|supplemental|taboola|toolbar|widget/i;
/** Names that say an element may well be the article in spite of the above. */
const MAYBE = /and|article|body|column|content|main|shadow|story|post|entry/i;
const POSITIVE = /article|body|content|entry|hentry|h-entry|main|page|post|text|blog|story/i;
const NEGATIVE =
  /-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|footer|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|widget/i;
const SCREEN_READER_ONLY = /(^|\s)(sr-only|visually-?hidden|screen-reader-text|screenreader|a11y-hidden|offscreen)(\s|$)/i;
/** Names of the last things to go: bars of buttons left inside the article itself. */
const CLUTTER =
  /share|sharing|social|related|newsletter|subscribe|promo|advert|sponsor|cookie|consent|breadcrumb|pagination|pager|toolbar|print|popup|modal|paywall/i;

/** Names among the unlikely ones that are also given to parts of an article. */
const LOOSELY_UNLIKELY = /header|masthead|extra|supplemental/gi;

/** Whether an element holds a paragraph of running text, as against a row of links or a line of small print. */
function hasLongParagraph(element: Element): boolean {
  for (const inner of elementsIn(element)) {
    if (inner.tagName !== "p") continue;
    let linked = 0;
    for (const link of elementsIn(inner)) if (link.tagName === "a") linked += textOf(link).length;
    if (tidy(textOf(inner)).length - linked >= 100) return true;
  }
  return false;
}

function isHidden(element: Element): boolean {
  if (element.properties?.hidden !== undefined && element.properties.hidden !== false) return true;
  if (attr(element, "ariaHidden") === "true") return true;
  if (HIDDEN_ROLES.has(attr(element, "role").toLowerCase())) return true;
  const style = attr(element, "style").replace(/\s+/g, "").toLowerCase();
  if (style.includes("display:none") || style.includes("visibility:hidden")) return true;
  return SCREEN_READER_ONLY.test(attr(element, "className"));
}

/** Tags the "unlikely" names are never held against: the page itself, links, code, and headings. */
const KEEP_WHATEVER_ITS_NAME = new Set([
  "html",
  "body",
  "article",
  "main",
  "a",
  "pre",
  "code",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "figure",
  "picture",
]);

/**
 * Removes, in place, everything that is never content. With `strict`, also what is
 * named like the furniture around an article.
 */
function prune(node: Nodes, strict: boolean, insideCode = false, depth = 0): void {
  if (!("children" in node)) return;
  const kept: ElementContent[] = [];
  for (const child of node.children as ElementContent[]) {
    if (child.type === "comment") continue;
    if (!isElement(child)) {
      kept.push(child);
      continue;
    }
    if (depth >= MAX_DEPTH || NEVER.has(child.tagName) || isHidden(child)) continue;
    // A formula written in MathML reads as scattered letters. The line its author gave for it reads as the formula.
    if (child.tagName === "math") {
      const written = tidy(attr(child, "alttext"));
      if (written) kept.push({ type: "element", tagName: "code", properties: {}, children: [{ type: "text", value: written }] });
      continue;
    }
    const code = insideCode || child.tagName === "pre" || child.tagName === "code";
    if (strict && !code && !KEEP_WHATEVER_ITS_NAME.has(child.tagName)) {
      const names = classAndId(child);
      if (names.trim() && UNLIKELY.test(names) && !MAYBE.test(names)) {
        // "header" names a site's banner, and just as often the top of the article with its opening paragraphs in it.
        const onlyLoosely = !UNLIKELY.test(names.replace(LOOSELY_UNLIKELY, ""));
        if (!onlyLoosely || !hasLongParagraph(child)) continue;
      }
    }
    prune(child, strict, code, depth + 1);
    kept.push(child);
  }
  (node as { children: ElementContent[] }).children = kept;
}

// ── What the page says about itself ──

interface Described {
  title?: string;
  documentTitle?: string;
  byline?: string;
  site?: string;
  published?: string;
  language?: string;
  /** The address the page gives for links and pictures to be completed against. */
  base?: string;
}

const clip = (text: string | undefined, max: number) => {
  const tidied = tidy(text ?? "");
  return tidied ? tidied.slice(0, max) : undefined;
};

/** A date a page gives for itself, kept only if it is one. */
function isoDate(value: string | undefined): string | undefined {
  const written = value?.trim();
  if (!written || written.length > 40 || !/^\d{4}-\d{2}-\d{2}/.test(written)) return undefined;
  return Number.isFinite(Date.parse(written)) ? written : undefined;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The structured description many articles carry for search engines. It is data and is only read. */
function fromLinkedData(root: Root): Described {
  const found: Described = {};
  const nameOf = (value: Json | undefined): string | undefined => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(nameOf).filter(Boolean).slice(0, 4).join(", ") || undefined;
    if (value && typeof value === "object" && typeof value.name === "string") return value.name;
    return undefined;
  };
  const read = (value: Json, depth: number): void => {
    if (depth > 4 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 50)) read(item, depth + 1);
      return;
    }
    if (Array.isArray(value["@graph"])) read(value["@graph"], depth + 1);
    const type = [value["@type"]].flat().join(" ");
    if (!/Article|BlogPosting|Report|WebPage|Posting/i.test(type)) return;
    const article = /Article|Posting|Report/i.test(type);
    if (article) {
      found.title ??= clip(nameOf(value.headline), 300);
      found.byline ??= clip(nameOf(value.author), 200);
      found.published ??= isoDate(nameOf(value.datePublished));
    }
    found.site ??= clip(nameOf(value.publisher), 200);
  };
  for (const script of elementsIn(root)) {
    if (script.tagName !== "script" || !/^application\/ld\+json/i.test(attr(script, "type"))) continue;
    const text = textOf(script);
    if (text.length > 200_000) continue;
    try {
      read(JSON.parse(text) as Json, 0);
    } catch {
      // Not the JSON it claims to be.
    }
  }
  return found;
}

function describe(root: Root, pageUrl: string): Described {
  const meta = new Map<string, string>();
  let documentTitle: string | undefined;
  let base: string | undefined;
  for (const element of elementsIn(root)) {
    if (element.tagName === "meta") {
      const key = (attr(element, "property") || attr(element, "name") || attr(element, "itemProp")).toLowerCase();
      const content = attr(element, "content");
      if (key && content && !meta.has(key)) meta.set(key, content);
    } else if (element.tagName === "title" && documentTitle === undefined) {
      documentTitle = clip(textOf(element), 500);
    } else if (element.tagName === "base" && base === undefined) {
      base = resolveAgainst(attr(element, "href"), pageUrl)?.href;
    }
  }
  const linked = fromLinkedData(root);
  const first = (...keys: string[]) => keys.map((key) => meta.get(key)).find((value) => value?.trim());
  const author = first("author", "article:author", "parsely-author", "dc.creator", "dcterms.creator");
  return {
    title: clip(first("og:title", "twitter:title", "dc.title", "dcterms.title"), 300) ?? linked.title,
    documentTitle,
    // A profile address is not a name.
    byline: linked.byline ?? (author && !/^https?:\/\//i.test(author.trim()) ? clip(author, 200) : undefined),
    site: clip(first("og:site_name", "application-name"), 200) ?? linked.site,
    published:
      isoDate(first("article:published_time", "datepublished", "date", "dc.date", "dcterms.date", "parsely-pub-date")) ?? linked.published,
    language: clip(
      attr(
        find(root, (element) => element.tagName === "html") ?? { type: "element", tagName: "html", properties: {}, children: [] },
        "lang",
      ),
      35,
    ),
    base,
  };
}

/** What stands between an article's name and its site's in a window title. A colon is not one: it belongs to too many real titles. */
const SEPARATORS = /\s+[|\-–—·»]+\s+/;

/** The article's own name: what the page calls it, without the site's name tacked on. */
function chooseTitle(described: Described, root: Root): string | undefined {
  const headings = [...elementsIn(root)].filter((element) => element.tagName === "h1").map((element) => tidy(textOf(element)));
  const heading = headings.find((text) => text.length > 0);
  const whole = described.documentTitle;
  if (whole) {
    // The heading, when the window title only adds to it ("Heading | Site").
    const within = headings.find((text) => text.length >= 8 && whole.toLowerCase().includes(text.toLowerCase()));
    if (within) return within.slice(0, 300);
  }
  if (described.title) return described.title;
  if (whole) {
    const parts = whole.split(SEPARATORS).map((part) => part.trim());
    const site = described.site?.toLowerCase();
    const without = site ? parts.filter((part) => part.toLowerCase() !== site) : parts;
    if (without.length > 0 && without.length < parts.length) return without.join(" - ").slice(0, 300);
    // With nothing to say which part is the site, the longest part is the likelier title.
    if (parts.length > 1) {
      const longest = parts.reduce((a, b) => (b.length > a.length ? b : a));
      if (longest.split(/\s+/).length >= 4) return longest.slice(0, 300);
    }
    return whole.slice(0, 300);
  }
  return heading?.slice(0, 300);
}

const BYLINE = /(^|[\s_-])(byline|author|dateline|writtenby|p-author)([\s_-]|$)/i;

/** A line in the page that names its writer, removed from the page so it is not said twice. */
function takeByline(root: Root): string | undefined {
  let found: string | undefined;
  const visit = (node: Nodes, depth: number): void => {
    if (found !== undefined || !("children" in node) || depth > MAX_DEPTH) return;
    for (let index = 0; index < node.children.length; index += 1) {
      const child = node.children[index];
      if (!isElement(child)) continue;
      const marked =
        attr(child, "rel").toLowerCase().split(/\s+/).includes("author") ||
        /(^|\s)author(\s|$)/i.test(attr(child, "itemProp")) ||
        BYLINE.test(classAndId(child));
      if (marked && !NEVER.has(child.tagName)) {
        const text = tidy(textOf(child));
        if (text.length > 0 && text.length < 100) {
          found = text;
          node.children.splice(index, 1);
          return;
        }
      }
      visit(child, depth + 1);
      if (found !== undefined) return;
    }
  };
  visit(root, 0);
  return found?.replace(/^(by|written by|posted by)[\s:]+/i, "").trim() || undefined;
}

// ── Scoring ──

interface Measure {
  /** Characters of text, links included. */
  chars: number;
  /** Characters of text that are inside links. */
  linkChars: number;
  commas: number;
}

function measureAll(root: Nodes): Map<Nodes, Measure> {
  const measures = new Map<Nodes, Measure>();
  const visit = (node: Nodes, inLink: boolean, depth: number): Measure => {
    const own: Measure = { chars: 0, linkChars: 0, commas: 0 };
    if (isText(node)) {
      const text = node.value.replace(/\s+/g, " ");
      own.chars = text.trim() ? text.length : 0;
      if (inLink) own.linkChars = own.chars;
      own.commas = own.chars ? (text.match(/[,،﹐︐︑⹁⸴⸲，、]/g)?.length ?? 0) : 0;
    } else if ("children" in node && depth <= MAX_DEPTH) {
      const link = inLink || (isElement(node) && node.tagName === "a");
      for (const child of node.children) {
        const inner = visit(child, link, depth + 1);
        own.chars += inner.chars;
        own.linkChars += inner.linkChars;
        own.commas += inner.commas;
      }
    }
    measures.set(node, own);
    return own;
  };
  visit(root, false, 0);
  return measures;
}

function classWeight(element: Element): number {
  let weight = 0;
  for (const names of [attr(element, "className"), attr(element, "id")]) {
    if (!names) continue;
    if (NEGATIVE.test(names)) weight -= 25;
    if (POSITIVE.test(names)) weight += 25;
  }
  return weight;
}

function startingScore(element: Element): number {
  let score = classWeight(element);
  const tag = element.tagName;
  if (tag === "article") score += 10;
  else if (tag === "main" || tag === "div" || tag === "section") score += 5;
  else if (tag === "pre" || tag === "td" || tag === "blockquote") score += 3;
  else if (["address", "ol", "ul", "dl", "dd", "dt", "li", "form"].includes(tag)) score -= 3;
  else if (/^h[1-6]$/.test(tag) || tag === "th") score -= 5;
  if (/articleBody/i.test(attr(element, "itemProp"))) score += 25;
  return score;
}

const hasBlockChild = (element: Element) => element.children.some((child) => isElement(child) && BLOCKS.has(child.tagName));

/**
 * An element that holds running text directly: a paragraph, or a `div` used as one.
 * List items are left out on purpose: a long list of references is full of commas and
 * would outscore the article it belongs to.
 */
function isTextBlock(element: Element): boolean {
  const tag = element.tagName;
  if (tag === "p" || tag === "pre" || tag === "td") return true;
  return (tag === "div" || tag === "section" || tag === "article") && !hasBlockChild(element);
}

interface Pick {
  nodes: ElementContent[];
}

function pick(body: Element): Pick {
  const measures = measureAll(body);
  const measure = (node: Nodes): Measure => measures.get(node) ?? { chars: 0, linkChars: 0, commas: 0 };
  const linkDensity = (node: Nodes) => {
    const { chars, linkChars } = measure(node);
    return chars === 0 ? 0 : linkChars / chars;
  };

  const parents = new Map<Nodes, Element>();
  for (const element of elementsIn(body)) for (const child of element.children) parents.set(child, element);

  const scores = new Map<Element, number>();
  for (const element of elementsIn(body)) {
    if (!isTextBlock(element)) continue;
    const { chars, commas } = measure(element);
    if (chars < 25) continue;
    const points = 1 + commas + Math.min(Math.floor(chars / 100), 3);
    let ancestor = parents.get(element);
    for (let level = 0; ancestor && level < 5; level += 1) {
      if (!scores.has(ancestor)) scores.set(ancestor, startingScore(ancestor));
      // The parent gets it all, the grandparent half, and those above less and less.
      const share = level === 0 ? 1 : level === 1 ? 2 : level * 3;
      scores.set(ancestor, scores.get(ancestor)! + points / share);
      ancestor = parents.get(ancestor);
    }
  }

  const ranked = [...scores]
    .map(([element, score]) => ({ element, score: score * (1 - linkDensity(element)) }))
    .sort((a, b) => b.score - a.score);
  let top = ranked[0];
  if (!top) return { nodes: body.children };
  const final = new Map(ranked.map((entry) => [entry.element, entry.score]));

  const ancestorsOf = (element: Element): Element[] => {
    const chain: Element[] = [];
    for (let up = parents.get(element); up; up = parents.get(up)) chain.push(up);
    return chain;
  };

  // An article split over several sections: when most of the leading candidates sit
  // under one element, that element is the article.
  const rivals = ranked.slice(1, 5).filter((entry) => entry.score / top!.score >= 0.75);
  if (rivals.length >= 3) {
    for (const ancestor of ancestorsOf(top.element)) {
      if (ancestor === body) break;
      const holding = rivals.filter((rival) => ancestorsOf(rival.element).includes(ancestor)).length;
      if (holding >= 3) {
        top = { element: ancestor, score: final.get(ancestor) ?? top.score };
        break;
      }
    }
  }
  // Climb while the element above scores better still, or is only a wrapper.
  let last = top.score;
  const least = top.score / 3;
  for (let up = parents.get(top.element); up && up !== body; up = parents.get(up)) {
    const score = final.get(up);
    if (score === undefined) continue;
    if (score < least) break;
    if (score > last) {
      top = { element: up, score };
      break;
    }
    last = score;
  }
  for (let up = parents.get(top.element); up && up !== body; up = parents.get(up)) {
    if (up.children.filter((child) => isElement(child) || (isText(child) && child.value.trim())).length !== 1) break;
    top = { element: up, score: top.score };
  }

  // Brothers and sisters of the chosen element that are plainly more of the same text.
  const parent = parents.get(top.element);
  if (!parent || top.element === body) return { nodes: [top.element] };
  const threshold = Math.max(10, top.score * 0.2);
  const names = attr(top.element, "className");
  const nodes: ElementContent[] = [];
  for (const sibling of parent.children) {
    if (sibling === top.element) {
      nodes.push(sibling);
      continue;
    }
    if (!isElement(sibling)) continue;
    const bonus = names && attr(sibling, "className") === names ? top.score * 0.2 : 0;
    const score = final.get(sibling);
    let keep = score !== undefined && score + bonus >= threshold;
    // The block that carries the page's main heading and some running text is the top of the article.
    if (!keep && sibling.tagName !== "p") keep = count(sibling, (inner) => inner.tagName === "h1") > 0 && hasLongParagraph(sibling);
    if (!keep && sibling.tagName === "p") {
      const { chars } = measure(sibling);
      const density = linkDensity(sibling);
      keep = (chars > 80 && density < 0.25) || (chars > 0 && chars <= 80 && density === 0 && /\.( |$)/.test(textOf(sibling)));
    }
    if (keep) nodes.push(sibling);
  }
  return { nodes };
}

// ── Cleaning what was picked ──

const count = (element: Nodes, test: (inner: Element) => boolean) => {
  let total = 0;
  for (const inner of elementsIn(element)) if (inner !== element && test(inner)) total += 1;
  return total;
};

/** A table that holds data, as against one used to lay a page out. */
function isDataTable(table: Element): boolean {
  if (attr(table, "role") === "presentation") return false;
  if (count(table, (inner) => inner.tagName === "table") > 0) return false;
  if (count(table, (inner) => inner.tagName === "th" || inner.tagName === "caption" || inner.tagName === "thead") > 0) return true;
  const rows = count(table, (inner) => inner.tagName === "tr");
  const cells = count(table, (inner) => inner.tagName === "td");
  return rows >= 2 && cells >= rows * 2;
}

const CONDITIONAL = new Set(["div", "section", "ul", "ol", "dl", "table", "header", "figure", "details"]);

/** Removes, in place, blocks inside the article that are not writing: lists of links, empty wrappers, button bars. */
function clean(root: Element): void {
  const visit = (node: Element, depth: number, inFigure: boolean): void => {
    if (depth > MAX_DEPTH) return;
    const kept: ElementContent[] = [];
    for (const child of node.children) {
      if (!isElement(child)) {
        kept.push(child);
        continue;
      }
      if (child.tagName === "pre" || child.tagName === "code") {
        kept.push(child);
        continue;
      }
      visit(child, depth + 1, inFigure || child.tagName === "figure");
      if (CONDITIONAL.has(child.tagName) && shouldDrop(child, inFigure)) continue;
      kept.push(child);
    }
    node.children = kept;
  };

  const shouldDrop = (element: Element, inFigure: boolean): boolean => {
    const text = tidy(textOf(element));
    const pictures = count(element, (inner) => inner.tagName === "img");
    if (text.length === 0 && pictures === 0) return true;
    if (element.tagName === "table" && isDataTable(element)) return false;
    if (element.tagName === "figure" || inFigure) return false;
    let linkChars = 0;
    for (const inner of elementsIn(element)) if (inner.tagName === "a") linkChars += tidy(textOf(inner)).length;
    const density = text.length === 0 ? 0 : Math.min(1, linkChars / text.length);
    const names = classAndId(element);
    const weight = classWeight(element);
    // A named bar of buttons or links: short, or mostly links.
    if (names.trim() && CLUTTER.test(names) && !POSITIVE.test(names) && (text.length < 400 || density > 0.3)) return true;
    // A wrapper around a heading is the heading: short, and none the worse for a link in it.
    let headingChars = 0;
    for (const inner of elementsIn(element)) if (/^h[1-6]$/.test(inner.tagName)) headingChars += tidy(textOf(inner)).length;
    if (text.length > 0 && headingChars / text.length >= 0.5) return false;
    if (weight < 0) return true;
    const commas = text.match(/[,،，、]/g)?.length ?? 0;
    if (commas >= 10) return false;
    const list = element.tagName === "ul" || element.tagName === "ol" || element.tagName === "dl";
    const paragraphs = count(element, (inner) => inner.tagName === "p");
    const items = count(element, (inner) => inner.tagName === "li") - 100;
    if (!list && items > paragraphs) return true;
    if (!list && text.length < 25 && (pictures === 0 || pictures > 2) && density > 0) return true;
    if (!list && weight < 25 && density > 0.2) return true;
    if (weight >= 25 && density > 0.5) return true;
    // A list that is nothing but links is a menu, unless it is short enough to be a list of sources.
    return list && density > 0.8 && count(element, (inner) => inner.tagName === "li") > 12 && commas < 3;
  };

  visit(root, 0, false);
}

// ── Links and pictures ──

/** The address in a `srcset` of the widest picture that is not enormous. */
function fromSrcset(srcset: string): string | undefined {
  let best: { url: string; size: number } | undefined;
  for (const candidate of srcset.split(/,\s+|,(?=https?:|\/)/)) {
    const [url, descriptor = ""] = candidate.trim().split(/\s+/);
    if (!url) continue;
    const size = Number.parseFloat(descriptor) * (descriptor.endsWith("x") ? 1000 : 1) || 1;
    // The widest up to about a screen and a half: enough to read by, without the full-size original.
    const better = !best || (size <= 1700 ? size > best.size || best.size > 1700 : size < best.size);
    if (better) best = { url, size };
  }
  return best?.url;
}

const PLACEHOLDER = /(^data:|blank|spacer|placeholder|pixel|transparent|1x1|loading\.(gif|svg)|grey\.gif)/i;
const LAZY_ATTRIBUTES = ["dataSrc", "dataLazySrc", "dataOriginal", "dataOrig", "dataUrl", "dataLazy", "dataHiSrc", "dataFullSrc"];

/** Where a picture really is: pages that load pictures late keep the address somewhere other than `src`. */
function pictureAddress(img: Element, picture: Element | undefined): string | undefined {
  const src = attr(img, "src");
  for (const name of LAZY_ATTRIBUTES) {
    const late = attr(img, name);
    if (late && !/^data:/.test(late)) return late;
  }
  const lateSet = attr(img, "dataSrcset") || attr(img, "dataLazySrcset");
  if (lateSet) return fromSrcset(lateSet);
  if (src && !PLACEHOLDER.test(src)) return src;
  const set = attr(img, "srcSet");
  if (set) return fromSrcset(set);
  if (picture) {
    for (const source of picture.children) {
      if (!isElement(source) || source.tagName !== "source") continue;
      const type = attr(source, "type").toLowerCase();
      if (type && !/^image\/(jpeg|png|webp|gif)$/.test(type)) continue;
      const chosen = fromSrcset(attr(source, "srcSet") || attr(source, "dataSrcset"));
      if (chosen) return chosen;
    }
  }
  return src && !/^data:/.test(src) ? src : undefined;
}

/** A size written on the picture that says it is a spacer or a counter, not a picture. */
function declaredTiny(img: Element): boolean {
  const width = Number.parseInt(attr(img, "width"), 10);
  const height = Number.parseInt(attr(img, "height"), 10);
  return (Number.isFinite(width) && width < 8) || (Number.isFinite(height) && height < 8);
}

/**
 * Settles every picture's address before anything is removed, since the elements that
 * carry the choices (`source`) are among the things removed. A picture left without
 * an address keeps only its description.
 */
function settlePictures(root: Root, base: string): void {
  const visit = (node: Nodes, picture: Element | undefined, depth: number): void => {
    if (!("children" in node) || depth > MAX_DEPTH) return;
    const kept: ElementContent[] = [];
    for (const child of node.children as ElementContent[]) {
      if (isElement(child) && child.tagName === "img") {
        const alt = tidy(attr(child, "alt"));
        const title = tidy(attr(child, "title"));
        // Formulas drawn as pictures stand beside the same formula in MathML; one is enough.
        if (/math-fallback|mwe-math/i.test(attr(child, "className")) || declaredTiny(child)) continue;
        const address = resolveAgainst(pictureAddress(child, picture), base);
        if (!address && !alt) continue;
        child.properties = { ...(address ? { src: address.href } : {}), alt, ...(title && title !== alt ? { title } : {}) };
        kept.push(child);
        continue;
      }
      if (isElement(child)) visit(child, child.tagName === "picture" ? child : picture, depth + 1);
      kept.push(child);
    }
    (node as { children: ElementContent[] }).children = kept;
  };
  visit(root, undefined, 0);
}

/** Completes every link's address, and leaves the words of any link that is not a web or mail address. */
function settleLinks(root: Element, base: string, pageUrl: string): void {
  const here = pageUrl.replace(/#.*$/, "");
  const visit = (node: Element, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    const kept: ElementContent[] = [];
    for (const child of node.children) {
      if (!isElement(child)) {
        kept.push(child);
        continue;
      }
      visit(child, depth + 1);
      if (child.tagName !== "a") {
        kept.push(child);
        continue;
      }
      const written = attr(child, "href").trim();
      let href: string | undefined;
      if (/^mailto:/i.test(written)) href = written;
      else {
        const complete = resolveAgainst(written, base)?.href;
        // A link to another place on the same page stays a jump within the copy.
        if (complete?.startsWith(`${here}#`)) href = complete.slice(here.length);
        else href = complete;
      }
      if (!href) kept.push(...child.children);
      else {
        child.properties = { href };
        kept.push(child);
      }
    }
    node.children = kept;
  };
  visit(root, 0);
}

/** A caption reads as a caption when it is set apart from the text around it. */
function markCaptions(root: Element): void {
  for (const element of elementsIn(root)) {
    if (element.tagName !== "figcaption" || hasBlockChild(element) || !tidy(textOf(element))) continue;
    element.tagName = "p";
    element.properties = {};
    element.children = [{ type: "element", tagName: "em", properties: {}, children: element.children }];
  }
}

/** Takes out the first heading that only repeats the title, which is shown above the text already. */
function dropRepeatedTitle(root: Element, title: string): void {
  const wanted = tidy(title).toLowerCase();
  let seenText = 0;
  const visit = (node: Element, depth: number): boolean => {
    if (depth > MAX_DEPTH) return false;
    for (let index = 0; index < node.children.length; index += 1) {
      const child = node.children[index];
      if (isText(child)) seenText += child.value.trim().length;
      if (!isElement(child)) continue;
      if (/^h[12]$/.test(child.tagName)) {
        const words = tidy(textOf(child)).toLowerCase();
        if (words && (words === wanted || (words.length >= 12 && wanted.includes(words)))) {
          node.children.splice(index, 1);
          return true;
        }
      }
      // Only a heading near the top is the title again; one further down is a section of that name.
      if (seenText > 600) return true;
      if (visit(child, depth + 1)) return true;
    }
    return false;
  };
  visit(root, 0);
}

// ── The whole of it ──

function attempt(html: string, pageUrl: string, strict: boolean): Article | undefined {
  const root = unified().use(rehypeParse).parse(html) as Root;
  const described = describe(root, pageUrl);
  const base = described.base ?? pageUrl;
  const title = chooseTitle(described, root);
  const signIn = Boolean(find(root, (element) => element.tagName === "input" && attr(element, "type").toLowerCase() === "password"));
  const scripted =
    Boolean(find(root, (element) => element.tagName === "noscript" && /javascript|enable|browser/i.test(textOf(element)))) ||
    count(root, (element) => element.tagName === "script") > 0;

  settlePictures(root, base);
  const body = find(root, (element) => element.tagName === "body");
  if (!body) return undefined;
  // The line is taken out of the page whichever source the name comes from, so it is not said twice.
  const written = takeByline(root);
  const byline = described.byline ?? written;
  prune(body, strict);

  const content: Element = { type: "element", tagName: "div", properties: {}, children: pick(body).nodes };
  clean(content);
  settleLinks(content, base, pageUrl);
  markCaptions(content);
  let host = "";
  try {
    host = new URL(pageUrl).host;
  } catch {
    // The caller has already read this address; an unreadable one only costs the fallback title.
  }
  const named = title ?? host;
  dropRepeatedTitle(content, named);

  return {
    title: named || "Saved page",
    ...(byline ? { byline: byline.slice(0, 200) } : {}),
    ...(described.site ? { site: described.site } : {}),
    ...(described.published ? { published: described.published } : {}),
    ...(described.language ? { language: described.language } : {}),
    content,
    textLength: tidy(textOf(content)).length,
    ...(signIn ? { hint: "sign-in" as const } : scripted ? { hint: "script" as const } : {}),
  };
}

/** An article shorter than this found the strict way is looked for again the lenient way. */
const RETRY_BELOW = 500;

/**
 * The article in a page of HTML. `pageUrl` is the address the HTML came from, which
 * relative links and pictures are completed against.
 */
export function findArticle(html: string, pageUrl: string): Article | undefined {
  const strict = attempt(html, pageUrl, true);
  if (strict && strict.textLength >= RETRY_BELOW) return strict;
  // The names that usually mean "not the article" were perhaps the article's own here.
  const lenient = attempt(html, pageUrl, false);
  if (!lenient) return strict;
  return !strict || lenient.textLength > strict.textLength ? lenient : strict;
}
