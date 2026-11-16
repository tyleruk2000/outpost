/**
 * Markdown export of the list shapes that moving, dragging and converting single list
 * items in the editor produces. The exporter was not changed for that feature: these
 * pin down that such pages are written as ordinary lists and read back exactly.
 */
import { describe, expect, it } from "vitest";
import { docToMarkdown, markdownToDoc } from "../src/modules/notes/content/index.ts";
import type { PMNode } from "../src/modules/notes/content/schema.ts";

const p = (value: string): PMNode => ({ type: "paragraph", content: [{ type: "text", text: value }] });
const li = (...content: PMNode[]): PMNode => ({ type: "listItem", content });
const task = (checked: boolean, ...content: PMNode[]): PMNode => ({ type: "taskItem", attrs: { checked }, content });
const ul = (...content: PMNode[]): PMNode => ({ type: "bulletList", content });
const ol = (start: number, ...content: PMNode[]): PMNode => ({ type: "orderedList", attrs: { start }, content });
const tl = (...content: PMNode[]): PMNode => ({ type: "taskList", content });
const doc = (...content: PMNode[]): PMNode => ({ type: "doc", content });

const cases: Array<[name: string, page: PMNode, markdown: string]> = [
  [
    "an item moved to another place in its list, with its nested items",
    doc(ul(li(p("Tent")), li(p("Rope")), li(p("Stove"), ul(li(p("Gas")), li(p("Jet pricker")))))),
    "- Tent\n- Rope\n- Stove\n  - Gas\n  - Jet pricker\n",
  ],
  [
    "a bullet dropped into a numbered list",
    doc(ul(li(p("Stove")), li(p("Tent"))), p("Then:"), ol(1, li(p("Pack")), li(p("Rope")), li(p("Check weather")))),
    "- Stove\n- Tent\n\nThen:\n\n1. Pack\n2. Rope\n3. Check weather\n",
  ],
  [
    "a bullet dropped into a to-do list, and a to-do dropped among bullets",
    doc(
      tl(task(false, p("Fill water")), task(false, p("Map")), task(true, p("Charge radio"))),
      p("Kit:"),
      ul(li(p("Rope")), li(p("Lock hut"))),
    ),
    "- [ ] Fill water\n- [ ] Map\n- [x] Charge radio\n\nKit:\n\n- Rope\n- Lock hut\n",
  ],
  [
    "a numbered item dropped outside any list",
    doc(ol(1, li(p("Pack")), li(p("Leave a note"))), p("After everything."), ol(1, li(p("Check weather")))),
    "1. Pack\n2. Leave a note\n\nAfter everything.\n\n1. Check weather\n",
  ],
  [
    "one item of a numbered list turned into text, the numbering carrying on",
    doc(ol(4, li(p("Pack"))), p("Check weather"), ol(6, li(p("Leave a note")), li(p("Go")))),
    "4. Pack\n\nCheck weather\n\n6. Leave a note\n7. Go\n",
  ],
  [
    "one item turned into a heading, what was nested under it following",
    doc(
      ul(li(p("Rope"))),
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Stove" }] },
      ul(li(p("Gas")), li(p("Jet pricker"))),
      ul(li(p("Tent"))),
    ),
    "- Rope\n\n### Stove\n\n- Gas\n- Jet pricker\n\n* Tent\n",
  ],
  [
    "one bullet turned into a to-do, between the bullets either side",
    doc(ul(li(p("Rope"))), tl(task(false, p("Stove"), ul(li(p("Gas"))))), ul(li(p("Tent")), li(p("Map")))),
    "- Rope\n\n* [ ] Stove\n  - Gas\n\n- Tent\n- Map\n",
  ],
  [
    "one bullet turned into a numbered item, between the bullets either side",
    doc(ul(li(p("a"))), ol(1, li(p("b"))), ul(li(p("c")))),
    "- a\n\n1. b\n\n- c\n",
  ],
  [
    "a nested item turned into text inside the item above it",
    doc(ul(li(p("Stove"), p("Gas"), ul(li(p("Jet pricker")))), li(p("Tent")))),
    "- Stove\n\n  Gas\n\n  - Jet pricker\n- Tent\n",
  ],
  [
    "an item dragged under a to-do, and lists of three kinds nested in one item",
    doc(ul(li(p("a"), ul(li(p("a1"))), tl(task(true, p("a2"))), ol(3, li(p("a3")))))),
    "- a\n  - a1\n  * [x] a2\n  3. a3\n",
  ],
  [
    "an item wrapped in a quote",
    doc(ul(li(p("Rope"))), { type: "blockquote", content: [p("Stove"), ul(li(p("Gas")))] }, ul(li(p("Tent")))),
    "- Rope\n\n> Stove\n>\n> - Gas\n\n- Tent\n",
  ],
];

describe("Markdown export of pages whose list items were moved or converted one at a time", () => {
  for (const [name, page, markdown] of cases) {
    it(`writes ${name}`, () => {
      expect(docToMarkdown(page)).toBe(markdown);
    });

    it(`reads back ${name}`, () => {
      const { doc: back, warnings } = markdownToDoc(markdown);
      expect(warnings).toEqual([]);
      expect(back).toEqual(page);
    });
  }

  it("still writes the three kinds of list exactly as before", () => {
    // The canonical forms from the round-trip table in notes-content.test.ts.
    for (const markdown of [
      "- one\n- two\n  - inner\n    - deeper\n- three\n",
      "3. three\n4. four\n   1. nested\n",
      "- [x] done\n- [ ] to do\n  - [ ] part of it\n",
    ]) {
      expect(docToMarkdown(markdownToDoc(markdown).doc)).toBe(markdown);
    }
  });
});
