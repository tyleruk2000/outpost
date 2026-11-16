import type { NoteDoc, NoteNodeJson } from "@outpost/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeSelection } from "@tiptap/pm/state";
import { Editor } from "@tiptap/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { installBrowserStubs } from "../../downloads/test-support";
import { handleTargetDeduction } from "./block-handle";
import { BlockMenuItems } from "./block-menu";
import { blockKinds, selectedTopBlock, topBlockAt, turnBlockInto } from "./blocks";
import { buildExtensions } from "./extensions";
import {
  deleteListItem,
  dropListItem,
  duplicateListItem,
  type ListItemTarget,
  listItemAt,
  moveListItem,
  selectedListItem,
  sliceForDrop,
  turnListItemInto,
} from "./list-items";

beforeAll(installBrowserStubs);

type Json = NoteNodeJson;
const text = (value: string): Json => ({ type: "text", text: value });
const p = (value?: string): Json => (value ? { type: "paragraph", content: [text(value)] } : { type: "paragraph" });
const li = (...content: Json[]): Json => ({ type: "listItem", content });
const task = (checked: boolean, ...content: Json[]): Json => ({ type: "taskItem", attrs: { checked }, content });
const ul = (...content: Json[]): Json => ({ type: "bulletList", content });
const ol = (start: number, ...content: Json[]): Json => ({ type: "orderedList", attrs: { start }, content });
const tl = (...content: Json[]): Json => ({ type: "taskList", content });
const quote = (...content: Json[]): Json => ({ type: "blockquote", content });
const doc = (...content: Json[]): Json => ({ type: "doc", content });

/** The page most of these tests start from. */
const page = () =>
  doc(
    p("Before"),
    ul(li(p("Rope")), li(p("Stove"), ul(li(p("Gas")), li(p("Jet pricker")))), li(p("Tent"))),
    p("Between"),
    ol(4, li(p("Pack")), li(p("Check weather")), li(p("Leave a note"))),
    tl(task(false, p("Fill water")), task(true, p("Charge radio"))),
    p("After"),
  );

let editor: Editor | undefined;
afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

function open(content: Json): Editor {
  editor = new Editor({ extensions: buildExtensions(null), content: content as NoteDoc });
  return editor;
}

const json = (instance: Editor) => instance.getJSON() as Json;

/** A position inside the first run of text equal to `value`. */
function posOf(instance: Editor, value: string, offset = 1): number {
  let found = -1;
  instance.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === value) found = pos + offset;
  });
  if (found < 0) throw new Error(`no text "${value}"`);
  return found;
}

const item = (instance: Editor, value: string): ListItemTarget => {
  const target = listItemAt(instance.state.doc, posOf(instance, value));
  if (!target) throw new Error(`"${value}" is not in a list item`);
  return target;
};

const cursorIn = (instance: Editor, value: string) => instance.commands.setTextSelection(posOf(instance, value));

/** A document as an outline, which reads better in a failure than nested JSON. */
function outline(node: Json): string {
  if (node.type === "text") return node.text ?? "";
  const inner = (node.content ?? []).map(outline);
  const nested = () => (inner.length > 1 ? `${inner[0]}{${inner.slice(1).join(",")}}` : (inner[0] ?? ""));
  switch (node.type) {
    case "doc":
      return inner.join(" / ");
    case "paragraph":
      return inner.join("");
    case "heading":
      return `h${String(node.attrs?.level)}(${inner.join("")})`;
    case "bulletList":
      return `ul[${inner.join("|")}]`;
    case "orderedList":
      return `ol${String(node.attrs?.start ?? 1)}[${inner.join("|")}]`;
    case "taskList":
      return `tl[${inner.join("|")}]`;
    case "listItem":
      return nested();
    case "taskItem":
      return `${node.attrs?.checked ? "☑" : "☐"}${nested()}`;
    default:
      return `${node.type}(${inner.join(",")})`;
  }
}
const now = (instance: Editor) => outline(json(instance));
const START =
  "Before / ul[Rope|Stove{ul[Gas|Jet pricker]}|Tent] / Between / ol4[Pack|Check weather|Leave a note] / tl[☐Fill water|☑Charge radio] / After";

describe("finding the item", () => {
  it("is the innermost item around a position", () => {
    const instance = open(page());
    expect(item(instance, "Gas")).toMatchObject({ typeName: "listItem", listType: "bulletList", index: 0, count: 2, topLevel: false });
    expect(item(instance, "Stove")).toMatchObject({ index: 1, count: 3, topLevel: true });
    expect(item(instance, "Charge radio")).toMatchObject({ typeName: "taskItem", listType: "taskList", index: 1 });
    expect(listItemAt(instance.state.doc, posOf(instance, "Between"))).toBeNull();
  });

  it("takes the selection as an item only when it is within one", () => {
    const instance = open(page());
    cursorIn(instance, "Tent");
    expect(selectedListItem(instance.state)?.index).toBe(2);
    instance.commands.setTextSelection({ from: posOf(instance, "Rope"), to: posOf(instance, "Rope", 3) });
    expect(selectedListItem(instance.state)?.index).toBe(0);
    // Across two items, and from an item into its own nested item: not one item.
    instance.commands.setTextSelection({ from: posOf(instance, "Rope"), to: posOf(instance, "Tent") });
    expect(selectedListItem(instance.state)).toBeNull();
    instance.commands.setTextSelection({ from: posOf(instance, "Stove"), to: posOf(instance, "Gas") });
    expect(selectedListItem(instance.state)).toBeNull();
    cursorIn(instance, "Between");
    expect(selectedListItem(instance.state)).toBeNull();
  });
});

describe("what the handle takes hold of", () => {
  const deduction = (instance: Editor, value: string, depth: number) => {
    const $pos = instance.state.doc.resolve(posOf(instance, value));
    return handleTargetDeduction({ node: $pos.node(depth), depth, $pos });
  };

  it("is a block of the page, or a list item at any depth", () => {
    const instance = open(page());
    // "Gas": doc > bulletList(1) > listItem(2) > bulletList(3) > listItem(4) > paragraph(5).
    expect(deduction(instance, "Gas", 1)).toBe(0);
    expect(deduction(instance, "Gas", 2)).toBe(0);
    expect(deduction(instance, "Gas", 3)).toBe(1000);
    expect(deduction(instance, "Gas", 4)).toBe(0);
    expect(deduction(instance, "Gas", 5)).toBe(1000);
    expect(deduction(instance, "Between", 1)).toBe(0);
    expect(deduction(instance, "Fill water", 2)).toBe(0);
  });

  it("is nothing at all between two items, so the grip stays on the item it was on", () => {
    const instance = open(page());
    // Right before the "Stove" item: a position in the list itself, as the pointer reports on a bullet.
    const $between = instance.state.doc.resolve(item(instance, "Stove").pos);
    expect($between.parent.type.name).toBe("bulletList");
    expect(handleTargetDeduction({ node: $between.node(1), depth: 1, $pos: $between })).toBe(1000);
  });

  it("leaves a list inside a table to the table", () => {
    const cell = (type: string, ...content: Json[]): Json => ({ type, attrs: { colspan: 1, rowspan: 1, colwidth: null }, content });
    const instance = open(
      doc({
        type: "table",
        content: [{ type: "tableRow", content: [cell("tableHeader", p("Kit")), cell("tableCell", ul(li(p("Axe"))))] }],
      }),
    );
    // "Axe": doc > table(1) > tableRow(2) > tableCell(3) > bulletList(4) > listItem(5) > paragraph(6).
    expect(deduction(instance, "Axe", 5)).toBe(1000);
    expect(deduction(instance, "Axe", 1)).toBe(0);
  });
});

describe("moving an item among its neighbours", () => {
  it("swaps it with the item before or after, with whatever is nested under it", () => {
    const instance = open(page());
    expect(moveListItem(instance, item(instance, "Stove"), 1)).toBe(true);
    expect(now(instance)).toBe(START.replace("ul[Rope|Stove{ul[Gas|Jet pricker]}|Tent]", "ul[Rope|Tent|Stove{ul[Gas|Jet pricker]}]"));
    expect(moveListItem(instance, item(instance, "Stove"), -1)).toBe(true);
    expect(now(instance)).toBe(START);
    expect(moveListItem(instance, item(instance, "Jet pricker"), -1)).toBe(true);
    expect(now(instance)).toContain("Stove{ul[Jet pricker|Gas]}");
  });

  it("stops at the ends of its list", () => {
    const instance = open(page());
    expect(moveListItem(instance, item(instance, "Rope"), -1)).toBe(false);
    expect(moveListItem(instance, item(instance, "Tent"), 1)).toBe(false);
    expect(moveListItem(instance, item(instance, "Gas"), -1)).toBe(false);
    expect(now(instance)).toBe(START);
  });

  it("keeps the cursor where it was in the item", () => {
    const instance = open(page());
    instance.commands.setTextSelection(posOf(instance, "Tent", 2));
    moveListItem(instance, item(instance, "Tent"), -1);
    const { $from } = instance.state.selection;
    expect($from.parent.textContent).toBe("Tent");
    expect($from.parentOffset).toBe(2);
  });

  it("undoes and redoes each move as one step, however quickly they follow", () => {
    const instance = open(page());
    moveListItem(instance, item(instance, "Tent"), -1);
    const once = now(instance);
    moveListItem(instance, item(instance, "Tent"), -1);
    const twice = now(instance);
    expect(twice).toContain("ul[Tent|Rope|Stove{ul[Gas|Jet pricker]}]");
    instance.commands.undo();
    expect(now(instance)).toBe(once);
    instance.commands.undo();
    expect(now(instance)).toBe(START);
    instance.commands.redo();
    expect(now(instance)).toBe(once);
    instance.commands.redo();
    expect(now(instance)).toBe(twice);
  });
});

describe("duplicating and deleting an item", () => {
  it("duplicates one item, tick and nested items included", () => {
    const instance = open(page());
    duplicateListItem(instance, item(instance, "Charge radio"));
    expect(now(instance)).toContain("tl[☐Fill water|☑Charge radio|☑Charge radio]");
    duplicateListItem(instance, item(instance, "Stove"));
    expect(now(instance)).toContain("ul[Rope|Stove{ul[Gas|Jet pricker]}|Stove{ul[Gas|Jet pricker]}|Tent]");
  });

  it("deletes one item and leaves the rest of the list", () => {
    const instance = open(page());
    deleteListItem(instance, item(instance, "Stove"));
    expect(now(instance)).toBe(START.replace("|Stove{ul[Gas|Jet pricker]}", ""));
    instance.commands.undo();
    expect(now(instance)).toBe(START);
  });

  it("takes the list away with its last item", () => {
    const instance = open(doc(p("Before"), ul(li(p("Only"))), p("After")));
    deleteListItem(instance, item(instance, "Only"));
    expect(now(instance)).toBe("Before / After");
  });

  it("removes a nested list with its last item, and keeps the item it was under", () => {
    const instance = open(doc(ul(li(p("Stove"), ul(li(p("Gas")))))));
    deleteListItem(instance, item(instance, "Gas"));
    expect(json(instance)).toEqual(doc(ul(li(p("Stove")))));
  });

  it("leaves an empty line where a block would otherwise be left with nothing in it", () => {
    const instance = open(doc(quote(ul(li(p("Only"))))));
    deleteListItem(instance, item(instance, "Only"));
    expect(json(instance)).toEqual(doc(quote(p())));
    const alone = open(doc(ul(li(p("Only")))));
    deleteListItem(alone, item(alone, "Only"));
    expect(json(alone)).toEqual(doc(p()));
  });
});

describe("turning one item into something else", () => {
  it("makes it text and leaves a list either side, the numbering carrying on", () => {
    const instance = open(page());
    expect(turnListItemInto(instance, item(instance, "Check weather"), "paragraph")).toBe(true);
    expect(now(instance)).toContain("Between / ol4[Pack] / Check weather / ol6[Leave a note] / tl[");
    expect(instance.state.selection.$from.parent.textContent).toBe("Check weather");
    instance.commands.undo();
    expect(now(instance)).toBe(START);
  });

  it("leaves no empty list behind for the first or the last item", () => {
    const instance = open(page());
    turnListItemInto(instance, item(instance, "Pack"), "paragraph");
    expect(now(instance)).toContain("Between / Pack / ol5[Check weather|Leave a note] / tl[");
    turnListItemInto(instance, item(instance, "Leave a note"), "heading2");
    expect(now(instance)).toContain("Between / Pack / ol5[Check weather] / h2(Leave a note) / tl[");
  });

  it("brings what was nested under it along, as the blocks that follow", () => {
    const instance = open(page());
    turnListItemInto(instance, item(instance, "Stove"), "heading3");
    expect(now(instance)).toContain("Before / ul[Rope] / h3(Stove) / ul[Gas|Jet pricker] / ul[Tent] / Between");
  });

  it("wraps the whole item in a quote or a callout", () => {
    const instance = open(page());
    turnListItemInto(instance, item(instance, "Stove"), "blockquote");
    expect(now(instance)).toContain("ul[Rope] / blockquote(Stove,ul[Gas|Jet pricker]) / ul[Tent]");
    turnListItemInto(instance, item(instance, "Pack"), "callout");
    expect(now(instance)).toContain("Between / callout(Pack) / ol5[Check weather|Leave a note]");
    expect((json(instance).content ?? []).find((node) => node.type === "callout")?.attrs).toEqual({ variant: "info" });
  });

  it("makes a code block of its words", () => {
    const instance = open(
      doc(ul(li({ type: "paragraph", content: [{ type: "text", text: "run ", marks: [{ type: "bold" }] }, text("it")] }))),
    );
    turnListItemInto(instance, item(instance, "it"), "codeBlock");
    expect(json(instance)).toEqual(doc({ type: "codeBlock", attrs: { language: null }, content: [text("run it")] }));
  });

  it("makes it a list of another kind by itself: numbered, bulleted, to-do", () => {
    const instance = open(page());
    turnListItemInto(instance, item(instance, "Stove"), "taskList");
    expect(now(instance)).toContain("Before / ul[Rope] / tl[☐Stove{ul[Gas|Jet pricker]}] / ul[Tent] / Between");
    turnListItemInto(instance, item(instance, "Charge radio"), "bulletList");
    expect(now(instance)).toContain("tl[☐Fill water] / ul[Charge radio] / After");
    turnListItemInto(instance, item(instance, "Check weather"), "bulletList");
    expect(now(instance)).toContain("ol4[Pack] / ul[Check weather] / ol6[Leave a note]");
  });

  it("joins a list of the same kind that it ends up next to", () => {
    const instance = open(doc(ul(li(p("a")), li(p("b")), li(p("c")))));
    turnListItemInto(instance, item(instance, "b"), "orderedList");
    expect(now(instance)).toBe("ul[a] / ol1[b] / ul[c]");
    turnListItemInto(instance, item(instance, "c"), "orderedList");
    expect(now(instance)).toBe("ul[a] / ol1[b|c]");
    turnListItemInto(instance, item(instance, "a"), "orderedList");
    expect(now(instance)).toBe("ol1[a|b|c]");
  });

  it("does nothing when the item is already that kind of list", () => {
    const instance = open(page());
    expect(turnListItemInto(instance, item(instance, "Rope"), "bulletList")).toBe(false);
    expect(now(instance)).toBe(START);
  });

  it("works on a nested item, inside the item above it", () => {
    const instance = open(page());
    turnListItemInto(instance, item(instance, "Gas"), "paragraph");
    expect(now(instance)).toContain("ul[Rope|Stove{Gas,ul[Jet pricker]}|Tent]");
  });

  it("still turns the whole list into another kind when asked for the block", () => {
    const instance = open(page());
    const block = topBlockAt(instance, posOf(instance, "Pack"));
    const numbered = blockKinds.find((kind) => kind.id === "bulletList");
    if (!block || !numbered) throw new Error("no block");
    turnBlockInto(instance, block, numbered);
    expect(now(instance)).toContain("Between / ul[Pack|Check weather|Leave a note] / tl[");
  });
});

describe("dragging an item", () => {
  const drop = (instance: Editor, dragged: string, pos: number) => {
    const tr = dropListItem(instance.state, item(instance, dragged).pos, pos);
    if (tr) instance.view.dispatch(tr);
    return tr !== null;
  };
  /** A position in the first half of a line (which lands before its item) or at its end (after it). */
  const startOf = (instance: Editor, value: string) => posOf(instance, value, 0);
  const endOf = (instance: Editor, value: string) => posOf(instance, value, value.length);

  it("moves it to another place in its list, nested items and all", () => {
    const instance = open(page());
    expect(drop(instance, "Tent", startOf(instance, "Rope"))).toBe(true);
    expect(now(instance)).toBe(START.replace("ul[Rope|Stove{ul[Gas|Jet pricker]}|Tent]", "ul[Tent|Rope|Stove{ul[Gas|Jet pricker]}]"));
    drop(instance, "Stove", startOf(instance, "Tent"));
    expect(now(instance)).toContain("ul[Stove{ul[Gas|Jet pricker]}|Tent|Rope]");
  });

  it("is one step of undo and of redo", () => {
    const instance = open(page());
    drop(instance, "Tent", startOf(instance, "Rope"));
    const moved = now(instance);
    instance.commands.undo();
    expect(now(instance)).toBe(START);
    instance.commands.redo();
    expect(now(instance)).toBe(moved);
  });

  it("goes into a nested list, and out of one", () => {
    const instance = open(page());
    drop(instance, "Tent", endOf(instance, "Gas"));
    expect(now(instance)).toContain("ul[Rope|Stove{ul[Gas|Tent|Jet pricker]}]");
    drop(instance, "Gas", startOf(instance, "Rope"));
    expect(now(instance)).toContain("ul[Gas|Rope|Stove{ul[Tent|Jet pricker]}]");
  });

  it("takes the kind of the list it is dropped in", () => {
    const instance = open(page());
    drop(instance, "Rope", endOf(instance, "Pack"));
    expect(now(instance)).toContain("ol4[Pack|Rope|Check weather|Leave a note]");
    drop(instance, "Tent", endOf(instance, "Fill water"));
    expect(now(instance)).toContain("tl[☐Fill water|☐Tent|☑Charge radio]");
    drop(instance, "Charge radio", endOf(instance, "Pack"));
    expect(now(instance)).toContain("ol4[Pack|Charge radio|Rope|Check weather|Leave a note]");
    expect(now(instance)).toContain("tl[☐Fill water|☐Tent]");
  });

  it("becomes a list of its own kind when dropped outside any list", () => {
    const instance = open(page());
    drop(instance, "Check weather", endOf(instance, "After"));
    expect(now(instance)).toBe(START.replace("|Check weather", "").replace(" / After", " / After / ol1[Check weather]"));
    drop(instance, "Charge radio", startOf(instance, "Before"));
    expect(now(instance)).toMatch(/^tl\[☑Charge radio\] \/ Before/);
  });

  it("joins a list of its kind when set down right against it", () => {
    const instance = open(page());
    // The end of "Between" is right above the numbered list.
    drop(instance, "Leave a note", endOf(instance, "Between"));
    expect(now(instance)).toContain("Between / ol4[Leave a note|Pack|Check weather] / tl[");
  });

  it("takes its list away when it was the last item in it", () => {
    const instance = open(doc(ul(li(p("Only"))), p("Middle"), ol(1, li(p("One")))));
    drop(instance, "Only", endOf(instance, "One"));
    expect(json(instance)).toEqual(doc(p("Middle"), ol(1, li(p("One")), li(p("Only")))));
  });

  it("changes nothing when dropped where it already is", () => {
    const instance = open(page());
    expect(drop(instance, "Tent", posOf(instance, "Tent", 2))).toBe(false);
    expect(drop(instance, "Stove", posOf(instance, "Gas"))).toBe(false);
    expect(now(instance)).toBe(START);
  });

  it("carries an item of the other kind, or a list of its own, depending on what is under the pointer", () => {
    const instance = open(page());
    const from = item(instance, "Rope").pos;
    expect(sliceForDrop(instance.state.doc, from, posOf(instance, "Pack"))?.content.firstChild?.type.name).toBe("listItem");
    expect(sliceForDrop(instance.state.doc, from, posOf(instance, "Fill water"))?.content.firstChild?.type.name).toBe("taskItem");
    expect(sliceForDrop(instance.state.doc, from, posOf(instance, "Between"))?.content.firstChild?.type.name).toBe("bulletList");
    const numbered = item(instance, "Pack").pos;
    expect(sliceForDrop(instance.state.doc, numbered, posOf(instance, "After"))?.content.firstChild?.toJSON()).toEqual(
      ol(1, li(p("Pack"))),
    );
  });

  it("makes the drop through the editor itself, as a drag by the handle does", () => {
    const instance = open(page());
    const { view } = instance;
    const from = item(instance, "Tent").pos;
    const selection = NodeSelection.create(view.state.doc, from);
    view.dispatch(view.state.tr.setSelection(selection));
    view.dragging = { slice: selection.content(), move: true, node: selection } as typeof view.dragging;
    const target = startOf(instance, "Fill water");
    view.posAtCoords = () => ({ pos: target, inside: -1 });
    // Over the to-do list, what is carried becomes a to-do, which is what the drop marker is drawn for.
    // (The marker itself needs a laid-out page, so the handler is called as the editor calls it.)
    const over = new MouseEvent("dragover", { bubbles: true, cancelable: true }) as DragEvent;
    view.someProp("handleDOMEvents", (handlers) => handlers.dragover?.call(null as never, view, over));
    expect(view.dragging?.slice.content.firstChild?.type.name).toBe("taskItem");
    const event = new MouseEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { getData: () => "", files: [] } });
    view.dom.dispatchEvent(event);
    expect(now(instance)).toBe(START.replace("|Tent]", "]").replace("tl[☐Fill water", "tl[☐Tent|☐Fill water"));
    expect(event.defaultPrevented).toBe(true);
    instance.commands.undo();
    expect(now(instance)).toBe(START);
  });
});

describe("the keyboard", () => {
  const press = (instance: Editor, init: KeyboardEventInit) =>
    instance.view.someProp("handleKeyDown", (handler) => handler(instance.view, new KeyboardEvent("keydown", init)));
  const up = { key: "ArrowUp", keyCode: 38, altKey: true, shiftKey: true };
  const down = { key: "ArrowDown", keyCode: 40, altKey: true, shiftKey: true };

  it("moves the item the cursor is in, and stops at the end of its list", () => {
    const instance = open(page());
    cursorIn(instance, "Tent");
    press(instance, up);
    expect(now(instance)).toContain("ul[Rope|Tent|Stove{ul[Gas|Jet pricker]}]");
    press(instance, up);
    press(instance, up);
    expect(now(instance)).toContain("Before / ul[Tent|Rope|Stove{ul[Gas|Jet pricker]}] / Between");
    cursorIn(instance, "Jet pricker");
    press(instance, down);
    expect(now(instance)).toContain("Stove{ul[Gas|Jet pricker]}");
  });

  it("moves the whole block when several items are selected, or outside a list", () => {
    const instance = open(page());
    instance.commands.setTextSelection({ from: posOf(instance, "Rope"), to: posOf(instance, "Tent") });
    press(instance, down);
    expect(now(instance)).toMatch(/^Before \/ Between \/ ul\[Rope\|Stove\{ul\[Gas\|Jet pricker\]\}\|Tent\] \/ ol4/);
    cursorIn(instance, "After");
    press(instance, up);
    expect(now(instance)).toMatch(/After \/ tl\[☐Fill water\|☑Charge radio\]$/);
  });

  it("moves a list of one item as a block", () => {
    const instance = open(doc(p("Before"), ul(li(p("Only")))));
    cursorIn(instance, "Only");
    press(instance, up);
    expect(now(instance)).toBe("ul[Only] / Before");
  });

  it("duplicates the item the cursor is in", () => {
    const instance = open(page());
    cursorIn(instance, "Rope");
    press(instance, { key: "D", keyCode: 68, ctrlKey: true, shiftKey: true });
    expect(now(instance)).toContain("ul[Rope|Rope|Stove{ul[Gas|Jet pricker]}|Tent]");
  });
});

describe("the menu on a list item", () => {
  function showMenu(instance: Editor, value: string, flat = false) {
    const block = topBlockAt(instance, posOf(instance, value));
    if (!block) throw new Error("no block");
    render(
      <Menu open>
        <MenuTrigger />
        <MenuContent>
          <BlockMenuItems editor={instance} block={block} item={item(instance, value)} activeKind="bulletList" flat={flat} />
        </MenuContent>
      </Menu>,
    );
  }

  it("acts on the one item, and says so", async () => {
    const user = userEvent.setup();
    const instance = open(page());
    showMenu(instance, "Stove");
    expect(screen.getByRole("menuitemradio", { name: "This item" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Whole list" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("menuitem", { name: /Delete/ }));
    expect(now(instance)).toBe(START.replace("|Stove{ul[Gas|Jet pricker]}", ""));
  });

  it("greys out the direction an item cannot go", () => {
    const instance = open(page());
    showMenu(instance, "Rope");
    expect(screen.getByRole("menuitem", { name: /Move up/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /Move down/ })).not.toHaveAttribute("aria-disabled");
  });

  it("switches to the whole list without closing, and then acts on all of it", async () => {
    const user = userEvent.setup();
    const instance = open(page());
    showMenu(instance, "Stove");
    await user.click(screen.getByRole("menuitemradio", { name: "Whole list" }));
    expect(screen.getByRole("menuitemradio", { name: "Whole list" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitem", { name: /Delete/ }));
    expect(now(instance)).toBe(START.replace(" / ul[Rope|Stove{ul[Gas|Jet pricker]}|Tent]", ""));
  });

  it("turns just that item into another kind from the flat menu a touch screen shows", async () => {
    const user = userEvent.setup();
    const instance = open(page());
    showMenu(instance, "Tent", true);
    await user.click(screen.getByRole("menuitem", { name: /Numbered list/ }));
    expect(now(instance)).toContain("ul[Rope|Stove{ul[Gas|Jet pricker]}] / ol1[Tent] / Between");
  });
});

describe("pages written before", () => {
  const older = doc(
    ul(li(p("a"), ol(3, li(p("a1")), li(p("a2"))), tl(task(true, p("a3"), ul(li(p("deep")))))), li(p("b"))),
    ol(1, li(p("one"))),
    tl(task(false, p("todo"))),
    quote(ul(li(p("quoted")))),
  );

  it("open exactly as they were stored", () => {
    expect(json(open(older))).toEqual(older);
  });

  it("are the same again after an item is moved and the move undone", () => {
    const instance = open(older);
    moveListItem(instance, item(instance, "a2"), -1);
    expect(json(instance)).not.toEqual(older);
    instance.commands.undo();
    expect(json(instance)).toEqual(older);
  });

  it("still treat a selection in a plain paragraph as a block", () => {
    const instance = open(doc(p("Alone")));
    cursorIn(instance, "Alone");
    expect(selectedListItem(instance.state)).toBeNull();
    expect(selectedTopBlock(instance)?.typeName).toBe("paragraph");
  });
});
