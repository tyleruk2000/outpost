/**
 * The editor's schema and behaviour. Node and mark names and their attributes are the
 * content model of `@outpost/shared`, which the server validates, indexes and exports;
 * `schema.test.ts` holds this file to it.
 */
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { Highlight } from "@tiptap/extension-highlight";
import { OrderedList, TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import type { EditorView } from "@tiptap/pm/view";
import { Extension, type Extensions } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { duplicateBlock, moveBlock, selectedTopBlock } from "./blocks";
import { Callout } from "./callout";
import { NoteCodeBlock } from "./code-block";
import { DocumentEmbed } from "./document-embed";
import type { HostRef } from "./host";
import { NoteImage } from "./image";
import { NoteLink } from "./link";
import { duplicateListItem, listItemDrop, moveListItem, selectedListItem } from "./list-items";
import { PageLink } from "./page-link";
import { PageLinkMenu } from "./page-link-menu";
import { SlashMenu } from "./slash-menu";
import { focusToolbar } from "./toolbar-keys";
import { Uploads } from "./uploads";

/** The model keeps `start` on a numbered list and nothing else. */
const NoteOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (element) => (element.hasAttribute("start") ? Number.parseInt(element.getAttribute("start") ?? "", 10) || 1 : 1),
      },
    };
  },
});

const cellAttributes = () => ({
  colspan: { default: 1 },
  rowspan: { default: 1 },
  colwidth: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const widths = element.getAttribute("colwidth");
      return widths ? widths.split(",").map((width) => Number.parseInt(width, 10)) : null;
    },
  },
});

/** Table cells without the alignment attribute, which the model does not have. */
const NoteTableCell = TableCell.extend({ addAttributes: cellAttributes });
const NoteTableHeader = TableHeader.extend({ addAttributes: cellAttributes });

/**
 * Moving and duplicating from the keyboard. With the cursor in a list item the keys act
 * on that item, which stops at the ends of its list; anywhere else, or with several
 * items selected, they act on the whole block. A list of one item moves as a block.
 */
const BlockShortcuts = Extension.create({
  name: "blockShortcuts",

  addKeyboardShortcuts() {
    const move = (direction: -1 | 1) => () => {
      const item = selectedListItem(this.editor.state);
      if (item && !(item.count === 1 && item.topLevel)) {
        moveListItem(this.editor, item, direction);
        return true;
      }
      const block = selectedTopBlock(this.editor);
      return block ? moveBlock(this.editor, block, direction) : false;
    };
    return {
      // Into the bar over the selection or the table, when one is showing (toolbar-keys.ts).
      "Alt-F10": () => focusToolbar(),
      "Alt-Shift-ArrowUp": move(-1),
      "Alt-Shift-ArrowDown": move(1),
      "Mod-Shift-d": () => {
        const item = selectedListItem(this.editor.state);
        if (item) return duplicateListItem(this.editor, item);
        const block = selectedTopBlock(this.editor);
        return block ? duplicateBlock(this.editor, block) : false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [listItemDrop()];
  },
});

/**
 * Ticking a to-do changes only the to-do. The tick box's own handler also put the caret in the text, which on an
 * iPhone raised the keyboard over the list being ticked off. Its change is caught first, on the way down, and made
 * here without moving focus; Space on the box from the keyboard leaves focus on the box too.
 */
export function tickWithoutFocus(view: EditorView, event: Event): boolean {
  const box = event.target;
  if (!(box instanceof HTMLInputElement) || box.type !== "checkbox" || !view.editable) return false;
  const item = box.closest('ul[data-type="taskList"] > li');
  if (!item || !view.dom.contains(item)) return false;
  let at: number;
  try {
    at = view.posAtDOM(item, 0);
  } catch {
    return false;
  }
  const $at = view.state.doc.resolve(at);
  let pos = $at.nodeAfter?.type.name === "taskItem" ? at : -1;
  for (let depth = $at.depth; pos < 0 && depth > 0; depth -= 1) {
    if ($at.node(depth).type.name === "taskItem") pos = $at.before(depth);
  }
  const node = pos >= 0 ? view.state.doc.nodeAt(pos) : null;
  if (!node) return false;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: box.checked }));
  return true;
}

const QuietTicks = Extension.create<unknown, { off?: () => void }>({
  name: "quietTicks",
  addStorage() {
    return {};
  },
  onCreate() {
    const view = this.editor.view;
    const onChange = (event: Event) => {
      if (tickWithoutFocus(view, event)) event.stopPropagation();
    };
    // A press on the room round the box (its label) would otherwise focus the text, as Safari focuses the nearest
    // thing that takes focus: the press still ticks the box, and focus stays where it was.
    const onPress = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('ul[data-type="taskList"] > li > label')) event.preventDefault();
    };
    view.dom.addEventListener("change", onChange, true);
    view.dom.addEventListener("mousedown", onPress, true);
    this.storage.off = () => {
      view.dom.removeEventListener("change", onChange, true);
      view.dom.removeEventListener("mousedown", onPress, true);
    };
  },
  onDestroy() {
    this.storage.off?.();
  },
});

export const EMPTY_PAGE_PLACEHOLDER = "Write, or press / for blocks";

export function buildExtensions(host: HostRef | null): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Replaced below by versions that match the page model exactly.
      codeBlock: false,
      link: false,
      orderedList: false,
      // It adds an empty line to a page the moment the page is clicked, which is an edit
      // nobody made. The space under the text does the same job on request (note-editor.tsx).
      trailingNode: false,
      dropcursor: { color: "var(--primary)", width: 2 },
    }),
    NoteOrderedList,
    NoteLink.configure({ host }),
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    QuietTicks,
    NoteCodeBlock,
    Table.configure({ resizable: true, cellMinWidth: 96, lastColumnResizable: false, allowTableNodeSelection: true }),
    TableRow,
    NoteTableHeader,
    NoteTableCell,
    NoteImage,
    Details.configure({
      persist: false,
      HTMLAttributes: { class: "note-details" },
      renderToggleButton: ({ element, isOpen }) => {
        element.setAttribute("aria-label", isOpen ? "Hide what is inside" : "Show what is inside");
        element.setAttribute("aria-expanded", String(isOpen));
      },
    }),
    DetailsSummary,
    DetailsContent,
    Callout,
    PageLink,
    DocumentEmbed,
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
        if (node.type.name === "detailsSummary") return "Toggle";
        return EMPTY_PAGE_PLACEHOLDER;
      },
      showOnlyCurrent: false,
      includeChildren: true,
    }),
    Uploads,
    BlockShortcuts,
    SlashMenu.configure({ host }),
    PageLinkMenu.configure({ host }),
  ];
}
