/** The "/" menu: every kind of block, filtered as you type. */
import type { NoteCalloutVariant } from "@outpost/shared";
import { PluginKey } from "@tiptap/pm/state";
import { type Editor, Extension, type Range } from "@tiptap/react";
import { Suggestion } from "@tiptap/suggestion";
import {
  ChevronRight,
  FilePlus2,
  FileSymlink,
  FileText,
  Image as ImageIcon,
  type LucideIcon,
  Minus,
  Table as TableIcon,
} from "lucide-react";
import { blockKinds } from "./blocks";
import { calloutKinds } from "./callout";
import type { HostRef } from "./host";
import { popupRenderer } from "./suggestion-popup";

interface SlashItem {
  id: string;
  group: string;
  label: string;
  /** Extra words that find this item. */
  keywords: string;
  icon: LucideIcon;
  /** What to type instead, where there is a Markdown shortcut. */
  shortcut?: string;
  run(editor: Editor, range: Range, host: HostRef): void;
}

const shortcuts: Record<string, string> = {
  heading1: "#",
  heading2: "##",
  heading3: "###",
  bulletList: "-",
  orderedList: "1.",
  taskList: "[]",
  blockquote: ">",
  codeBlock: "```",
};
const keywords: Record<string, string> = {
  paragraph: "text paragraph plain",
  heading1: "h1 title big",
  heading2: "h2 subtitle section",
  heading3: "h3 subheading small",
  bulletList: "ul bullets unordered points",
  orderedList: "ol numbers ordered steps",
  taskList: "todo task checkbox checklist tick",
  blockquote: "quote citation",
  codeBlock: "code snippet pre monospace",
};

/** Callouts are listed one by one further down, so the generic "Callout" kind is left out here. */
const basic: SlashItem[] = blockKinds
  .filter((kind) => kind.id !== "callout")
  .map((kind) => ({
    id: kind.id,
    group: "Basic blocks",
    label: kind.label,
    keywords: keywords[kind.id] ?? "",
    icon: kind.icon,
    shortcut: shortcuts[kind.id],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      kind.apply(editor);
    },
  }));

const callouts: SlashItem[] = (Object.keys(calloutKinds) as NoteCalloutVariant[]).map((variant) => ({
  id: `callout-${variant}`,
  group: "Callouts",
  label: variant === "info" ? "Callout" : `${calloutKinds[variant].label} callout`,
  keywords: `callout notice box panel admonition ${variant} ${calloutKinds[variant].label}`,
  icon: calloutKinds[variant].icon,
  shortcut: variant === "info" ? "!!!" : undefined,
  run: (editor, range) => {
    editor.chain().focus().deleteRange(range).clearNodes().wrapIn("callout", { variant }).run();
  },
}));

const structure: SlashItem[] = [
  {
    id: "divider",
    group: "Basic blocks",
    label: "Divider",
    keywords: "hr rule line separator horizontal",
    icon: Minus,
    shortcut: "---",
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    id: "table",
    group: "More blocks",
    label: "Table",
    keywords: "table grid rows columns",
    icon: TableIcon,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    id: "toggle",
    group: "More blocks",
    label: "Toggle",
    keywords: "toggle details collapse fold disclosure hide",
    icon: ChevronRight,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).clearNodes().setDetails().run();
    },
  },
  {
    id: "image",
    group: "More blocks",
    label: "Image",
    keywords: "image picture photo upload figure",
    icon: ImageIcon,
    run: (editor, range, host) => {
      editor.chain().focus().deleteRange(range).run();
      host.current.pickImage(editor.state.selection.from);
    },
  },
];

const links: SlashItem[] = [
  {
    id: "page-link",
    group: "Pages and documents",
    label: "Link to page",
    keywords: "link page mention reference backlink",
    icon: FileSymlink,
    shortcut: "[[",
    run: (editor, range) => {
      // Typing the trigger hands over to the page picker, with the same list and keys.
      editor.chain().focus().deleteRange(range).insertContent("[[").run();
    },
  },
  {
    id: "sub-page",
    group: "Pages and documents",
    label: "Page",
    keywords: "new page subpage sub-page child create",
    icon: FilePlus2,
    run: (editor, range, host) => {
      editor.chain().focus().deleteRange(range).run();
      const at = editor.state.selection.from;
      void host.current.createSubPage("").then((page) => {
        if (!page || editor.isDestroyed) return;
        const pos = Math.min(at, editor.state.doc.content.size);
        editor
          .chain()
          .focus()
          .insertContentAt(pos, [
            { type: "pageLink", attrs: { noteId: page.id, label: page.title } },
            { type: "text", text: " " },
          ])
          .run();
      });
    },
  },
  {
    id: "document",
    group: "Pages and documents",
    label: "Embed a document",
    keywords: "embed document library file pdf book attach",
    icon: FileText,
    run: (editor, range, host) => {
      editor.chain().focus().deleteRange(range).run();
      host.current.pickDocument(editor.state.selection.from);
    },
  },
];

const order = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "divider",
  "codeBlock",
];
const basicOrdered = [...basic, ...structure.filter((item) => item.group === "Basic blocks")].sort(
  (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
);

export const slashItems: SlashItem[] = [
  ...basicOrdered,
  ...callouts,
  ...structure.filter((item) => item.group !== "Basic blocks"),
  ...links,
];

export function filterSlashItems(query: string): SlashItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return slashItems;
  const starts = slashItems.filter((item) => item.label.toLowerCase().startsWith(needle));
  const rest = slashItems.filter((item) => !starts.includes(item) && `${item.label} ${item.keywords}`.toLowerCase().includes(needle));
  return [...starts, ...rest];
}

export const SlashMenu = Extension.create<{ host: HostRef | null }>({
  name: "slashMenu",

  addOptions() {
    return { host: null };
  },

  addProseMirrorPlugins() {
    const { host } = this.options;
    if (!host) return [];
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey("slashMenu"),
        char: "/",
        items: ({ query }) => filterSlashItems(query),
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        command: ({ editor, range, props }) => props.run(editor, range, host),
        render: popupRenderer<SlashItem>({
          label: "Blocks",
          describe: (item, query) => ({
            key: item.id,
            // Groups only make sense while the list is in its own order.
            group: query.trim() ? undefined : item.group,
            icon: <item.icon aria-hidden />,
            title: item.label,
            hint: item.shortcut,
          }),
          empty: (query) => `No block is called “${query}”.`,
        }),
      }),
    ];
  },
});
