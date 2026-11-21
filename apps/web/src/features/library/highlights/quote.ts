/**
 * Finding a marked passage by its words. A passage is kept as the words themselves and
 * a few words either side (a text quote, as the W3C annotation model has it), because
 * nothing else about a page of text stays put: a PDF's text layer is drawn again as it
 * scrolls, and a Markdown document is drawn afresh each time it is opened.
 *
 * White space is made single throughout, on both sides, so line breaks in the drawing
 * of the text do not matter.
 */
import { HIGHLIGHT_CONTEXT_CHARS } from "@outpost/shared";

export interface TextQuote {
  exact: string;
  prefix: string;
  suffix: string;
}

/** The text of a part of the page with white space made single, and where each character came from. */
export interface TextIndex {
  text: string;
  nodes: Text[];
  /** For each character of `text`: the index in `nodes`, and the offset in that node. */
  node: Int32Array;
  offset: Int32Array;
}

const SPACE = /\s/;

export function indexText(root: Node): TextIndex {
  const nodes: Text[] = [];
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let length = 0;
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    nodes.push(current as Text);
    length += (current as Text).data.length;
  }
  const node = new Int32Array(length + 1);
  const offset = new Int32Array(length + 1);
  const parts: string[] = [];
  let count = 0;
  let lastSpace = true;
  nodes.forEach((textNode, nodeIndex) => {
    const data = textNode.data;
    for (let i = 0; i < data.length; i++) {
      const space = SPACE.test(data[i]!);
      if (space && lastSpace) continue;
      parts.push(space ? " " : data[i]!);
      node[count] = nodeIndex;
      offset[count] = i;
      count++;
      lastSpace = space;
    }
  });
  return { text: parts.join(""), nodes, node: node.subarray(0, count), offset: offset.subarray(0, count) };
}

/** The position in `index.text` of a point in the page (a node and an offset), rounded forward. */
function positionOf(index: TextIndex, container: Node, offsetInNode: number): number {
  // A point between elements is turned into the first text at or after it.
  let target: Node | null = container;
  let targetOffset = offsetInNode;
  if (target.nodeType !== Node.TEXT_NODE) {
    const child = target.childNodes[offsetInNode] ?? null;
    targetOffset = 0;
    target = child;
    if (!target) {
      // After the last child: the end of everything inside the container.
      let last: Node | null = container;
      while (last?.lastChild) last = last.lastChild;
      const at = index.nodes.indexOf(last as Text);
      if (at >= 0) return firstAfter(index, at, (last as Text).data.length);
      return index.text.length;
    }
    if (target.nodeType !== Node.TEXT_NODE) {
      const walker = target.ownerDocument!.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      if (!first) {
        // An element with no text in it: the text that follows it.
        const after = index.nodes.findIndex((text) => target!.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING);
        return after >= 0 ? firstAfter(index, after, 0) : index.text.length;
      }
      target = first;
    }
  }
  const nodeIndex = index.nodes.indexOf(target as Text);
  if (nodeIndex < 0) return index.text.length;
  return firstAfter(index, nodeIndex, targetOffset);
}

function firstAfter(index: TextIndex, nodeIndex: number, offsetInNode: number): number {
  // The positions are in order, so the first one at or past the point is found by halving.
  let low = 0;
  let high = index.node.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const n = index.node[middle]!;
    if (n < nodeIndex || (n === nodeIndex && index.offset[middle]! < offsetInNode)) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** The quote of what `range` covers inside `root`, or null when it covers no words of it. */
export function quoteOf(index: TextIndex, range: Range): TextQuote | null {
  const start = positionOf(index, range.startContainer, range.startOffset);
  const end = positionOf(index, range.endContainer, range.endOffset);
  if (end <= start) return null;
  let s = start;
  let e = end;
  while (s < e && index.text[s] === " ") s++;
  while (e > s && index.text[e - 1] === " ") e--;
  if (e <= s) return null;
  return {
    exact: index.text.slice(s, e),
    prefix: index.text.slice(Math.max(0, s - HIGHLIGHT_CONTEXT_CHARS), s),
    suffix: index.text.slice(e, e + HIGHLIGHT_CONTEXT_CHARS),
  };
}

/** How many characters two strings share at their ends (`a`'s end, `b`'s end). */
function sharedEnd(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function sharedStart(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

const single = (value: string) => value.replace(/\s+/g, " ");

/** Where the quote is in the indexed text, `[start, end)`, choosing the occurrence whose surroundings match best. */
export function locate(index: TextIndex, quote: TextQuote): [number, number] | null {
  const exact = single(quote.exact).trim();
  if (!exact) return null;
  const prefix = single(quote.prefix);
  const suffix = single(quote.suffix);
  let best: [number, number] | null = null;
  let bestScore = -1;
  for (let at = index.text.indexOf(exact); at >= 0; at = index.text.indexOf(exact, at + 1)) {
    const score =
      sharedEnd(index.text.slice(Math.max(0, at - prefix.length), at), prefix) +
      sharedStart(index.text.slice(at + exact.length, at + exact.length + suffix.length), suffix);
    if (score > bestScore) {
      best = [at, at + exact.length];
      bestScore = score;
    }
  }
  return best;
}

/** A DOM range over `[start, end)` of the indexed text. */
export function rangeOf(index: TextIndex, [start, end]: [number, number]): Range {
  const range = index.nodes[0]!.ownerDocument.createRange();
  const last = end - 1;
  range.setStart(index.nodes[index.node[start]!]!, index.offset[start]!);
  range.setEnd(index.nodes[index.node[last]!]!, index.offset[last]! + 1);
  return range;
}
