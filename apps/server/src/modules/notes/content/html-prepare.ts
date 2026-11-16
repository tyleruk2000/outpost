/**
 * Getting cleaned HTML ready for the HTML → Markdown tree converter.
 *
 * The converter (hast-util-to-mdast, and the whitespace pass it runs first) is slow at
 * two shapes, and slow by the square of their length:
 *
 *  - A run of elements with no words in them. For each one the whitespace pass looks
 *    ahead through its neighbours for the next piece of real text, and with none to
 *    find it reads to the end every time. Four thousand empty `<i>`, a file of 28 kB,
 *    held the server's thread for sixteen seconds.
 *  - A run of separate pieces of text. The converter joins neighbours one pair at a
 *    time and reads the joined text again after each. Text is in pieces wherever
 *    something sat between two pieces that leaves no node behind: a comment, a `<wbr>`,
 *    or an element Markdown has no mark for, which is passed on as its words alone.
 *
 * Neither shape says anything, so both are taken away here, in one walk of the tree
 * that costs in proportion to its size: elements with nothing in them are dropped,
 * comments and `<wbr>` are dropped, elements that only pass their words on are opened,
 * and text that ends up side by side is joined once. Inside `<pre>`, where white space
 * is the content, none of it is changed.
 *
 * Used for a web page being saved (`webpages/convert.ts`) and for HTML that is imported
 * or found inside imported Markdown (`html-pipeline.ts`). Run it after the allow-list
 * has cleaned the tree, so that what it looks at is what will be converted.
 */
import type { Element, ElementContent, Root } from "hast";

export interface PrepareOptions {
  /** Elements to open: what is inside one takes its place. */
  open: ReadonlySet<string>;
  /** Whether an element with no words in it stays (a line break, a picture, a table cell). Any other is dropped. */
  keepEmpty(tagName: string): boolean;
  /**
   * A chance to put something else where an element is, asked once its own children are
   * ready and it is known not to be empty. `undefined` leaves the element to the rules above.
   */
  replace?(child: Element, where: { parent: Element | Root; preceded: boolean }): ElementContent[] | undefined;
}

/** Real pages are nowhere near this deep; below it the tree is left as it came. */
const MAX_PREPARE_DEPTH = 400;

/**
 * Elements whose white space is the content: every space, tab and line end inside one
 * is shown as written. A highlighter puts a line's indent, and sometimes the line end
 * itself, in an element of its own, so in here an element that holds only white space
 * gives exactly that white space and not the one space it would stand for in a sentence.
 */
const KEEPS_WHITE_SPACE = new Set(["pre", "textarea", "listing", "plaintext", "xmp"]);

const wordless = (node: ElementContent): boolean => node.type === "text" && !node.value.trim();

/** `keepsWhiteSpace` is for the walk's own use: whether `node` is inside an element that keeps its white space. */
export function prepareForConversion(node: Element | Root, options: PrepareOptions, depth = 0, keepsWhiteSpace = false): void {
  if (depth > MAX_PREPARE_DEPTH) return;
  const exact = keepsWhiteSpace || (node.type === "element" && KEEPS_WHITE_SPACE.has(node.tagName));
  const children: ElementContent[] = [];
  const add = (child: ElementContent) => {
    const last = children.at(-1);
    if (child.type === "text" && last?.type === "text") last.value += child.value;
    else children.push(child);
  };
  for (const child of node.children) {
    if (child.type !== "element") {
      // A copy, so that joining never writes into a node something else still holds.
      if (child.type === "text") add({ type: "text", value: child.value });
      continue;
    }
    if (child.tagName === "wbr") continue;
    prepareForConversion(child, options, depth + 1, exact);
    // An element with nothing in it says nothing. One that held only a space still parts the words either side.
    if (child.children.every(wordless) && !options.keepEmpty(child.tagName)) {
      // Where white space is kept, what it held comes through as it was written. Its children are all text here.
      if (exact) for (const inner of child.children) add(inner);
      else if (child.children.length > 0) add({ type: "text", value: " " });
      continue;
    }
    const instead = options.replace?.(child, { parent: node, preceded: children.length > 0 });
    if (instead) {
      for (const inner of instead) add(inner);
      continue;
    }
    if (options.open.has(child.tagName)) {
      for (const inner of child.children) add(inner);
      continue;
    }
    add(child);
  }
  node.children = children;
}
