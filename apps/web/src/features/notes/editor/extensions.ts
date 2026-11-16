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
