/** The page picker that opens on "[[" or "@": find a page by title and link it, or make a new one. */
import type { NoteLookupItem } from "@outpost/shared";
import { PluginKey } from "@tiptap/pm/state";
import { type Editor, Extension, type Range } from "@tiptap/react";
import { Suggestion } from "@tiptap/suggestion";
import { FilePlus2 } from "lucide-react";
import { displayTitle, lookupNotes } from "../notes-data";
import { PageIcon } from "../page-bits";
import type { HostRef } from "./host";
import { popupRenderer } from "./suggestion-popup";

type Choice = { kind: "page"; page: NoteLookupItem } | { kind: "create"; title: string };

/** "[[Trip plan]]" typed in full still looks up "Trip plan". */
const cleanQuery = (query: string) => query.replace(/\]+$/, "").trim();

function insertLink(editor: Editor, range: Range, noteId: string, label: string): void {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: "pageLink", attrs: { noteId, label } },
      { type: "text", text: " " },
    ])
    .run();
}

function pagePicker(editor: Editor, host: HostRef, char: string, name: string) {
  return Suggestion<Choice, Choice>({
    editor,
    pluginKey: new PluginKey(name),
    char,
    // "[[" may follow anything; "@" only starts a link after a space, so e-mail addresses are left alone.
    allowedPrefixes: char === "@" ? [" "] : null,
    allowSpaces: char !== "@",
    debounce: 120,
    allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
    items: async ({ query, signal }) => {
      const pages = await lookupNotes(cleanQuery(query), signal);
      // A page linking to itself is no use to anyone.
      return pages.filter((page) => page.id !== host.current.noteId).map((page): Choice => ({ kind: "page", page }));
    },
    command: ({ editor: current, range, props }) => {
      if (props.kind === "page") {
        insertLink(current, range, props.page.id, props.page.title);
        return;
      }
      const typed = current.state.doc.textBetween(range.from, range.to);
      void host.current.createSubPage(props.title).then((page) => {
        if (!page || current.isDestroyed) return;
        // Replace what was typed if it is still there; otherwise add the link at the cursor.
        const size = current.state.doc.content.size;
        const intact = range.to <= size && current.state.doc.textBetween(range.from, range.to) === typed;
        const at = intact ? range : { from: current.state.selection.from, to: current.state.selection.from };
        insertLink(current, at, page.id, page.title);
      });
    },
    render: popupRenderer<Choice>({
      label: "Link to a page",
      describe: (choice) =>
        choice.kind === "page"
          ? {
              key: choice.page.id,
              group: "Link to a page",
              icon: <PageIcon icon={choice.page.icon} className="text-ink-muted" />,
              title: displayTitle(choice.page.title),
              detail: choice.page.path || undefined,
            }
          : {
              key: "\u0000create",
              group: "New",
              icon: <FilePlus2 aria-hidden />,
              title: <>Create page “{choice.title}”</>,
              detail: "Inside this page",
            },
      extras: (query) => {
        const title = cleanQuery(query);
        return title ? [{ kind: "create", title }] : [];
      },
      empty: () => "No pages yet. Type a title to make one.",
    }),
  });
}

export const PageLinkMenu = Extension.create<{ host: HostRef | null }>({
  name: "pageLinkMenu",

  addOptions() {
    return { host: null };
  },

  addProseMirrorPlugins() {
    const { host } = this.options;
    if (!host) return [];
    return [pagePicker(this.editor, host, "[[", "pageLinkBrackets"), pagePicker(this.editor, host, "@", "pageLinkAt")];
  },
});
