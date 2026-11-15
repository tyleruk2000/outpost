/**
 * The link mark. Tiptap's own link extension carries `target`, `rel`, `class` and
 * `title` attributes; the page model has `href` and nothing else, so this is a small
 * mark of our own with the same name and only that attribute.
 */

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { type Editor, InputRule, Mark, markPasteRule, mergeAttributes } from "@tiptap/react";
import type { HostRef } from "./host";

const WEB = /^https?:\/\/[^\s]+$/i;
const MAIL = /^mailto:[^\s]+$/i;
const BARE_MAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i;

export const isInAppHref = (href: string): boolean => href.startsWith("/") && !href.startsWith("//");

/**
 * Turns what a person typed into an address the page model accepts: a path inside
 * Outpost, or an http, https or mailto address. Anything else gives `null`.
 */
export function normaliseHref(input: string): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  if (isInAppHref(value)) return value;
  if (WEB.test(value)) {
    // An address of this very Outpost is kept as a path, so it survives a change of host name.
    try {
      const url = new URL(value);
      if (typeof window !== "undefined" && url.origin === window.location.origin) return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
    return value;
  }
  if (MAIL.test(value)) return value;
  if (BARE_MAIL.test(value)) return `mailto:${value}`;
  if (BARE_DOMAIN.test(value)) return `https://${value}`;
  return null;
}

export function setLink(editor: Editor, href: string): boolean {
  return editor.chain().focus().extendMarkRange("link").setMark("link", { href }).run();
}

export function unsetLink(editor: Editor): boolean {
  return editor.chain().focus().unsetMark("link", { extendEmptyMarkRange: true }).run();
}

/** Asks the selection toolbar to show its link field (⌘K). */
export const EDIT_LINK_EVENT = "outpost:edit-link";

const URL_IN_TEXT = /(?:^|\s)(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/gi;
const URL_THEN_SPACE = /(?:^|\s)(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])\s$/i;

export const NoteLink = Mark.create<{ host: HostRef | null }>({
  name: "link",
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,

  addOptions() {
    return { host: null };
  },

  addAttributes() {
    return { href: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: "a[href]",
        getAttrs: (element) => {
          const href = normaliseHref(element.getAttribute("href") ?? "");
          return href ? { href } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const href = String(HTMLAttributes.href ?? "");
    const external = !isInAppHref(href);
    return ["a", mergeAttributes(HTMLAttributes, external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {}), 0];
  },

  addInputRules() {
    return [
      // A web address followed by a space becomes a link, the way it does in most editors.
      new InputRule({
        find: URL_THEN_SPACE,
        handler: ({ state, range, match }) => {
          const url = match[1];
          if (!url) return null;
          const { tr } = state;
          // Depending on how the character arrived, the space may or may not be in the document yet.
          const typed = range.to > 0 && /\s/.test(tr.doc.textBetween(range.to - 1, range.to, "\n", "\ufffc"));
          const end = typed ? range.to - 1 : range.to;
          const start = end - url.length;
          if (start < 0 || tr.doc.textBetween(start, end) !== url) return null;
          tr.addMark(start, end, this.type.create({ href: url }));
          if (!typed) tr.insertText(" ", end);
          return;
        },
      }),
    ];
  },

  addPasteRules() {
    return [markPasteRule({ find: URL_IN_TEXT, type: this.type, getAttributes: (match) => ({ href: match[1] }) })];
  },

  addProseMirrorPlugins() {
    const { editor, options, type } = this;
    return [
      new Plugin({
        key: new PluginKey("noteLinkBehaviour"),
        props: {
          // ⌘K (Ctrl+K) links the selection, or edits the link the cursor is in. With
          // neither, the key is left alone, and the rest of the app uses it for search.
          handleKeyDown(view, event) {
            if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "k") return false;
            if (!editor.isEditable || (view.state.selection.empty && !editor.isActive("link"))) return false;
            event.preventDefault();
            // The app's own ⌘K listener is on the window and does not check who handled the key.
            event.stopPropagation();
            view.dom.dispatchEvent(new CustomEvent(EDIT_LINK_EVENT));
            return true;
          },
          // Pasting an address over selected words links those words.
          handlePaste(view, event) {
            const { selection } = view.state;
            if (selection.empty) return false;
            const href = normaliseHref(event.clipboardData?.getData("text/plain") ?? "");
            if (!href || (!WEB.test(href) && !isInAppHref(href))) return false;
            if (view.state.doc.resolve(selection.from).parent.type.spec.code) return false;
            view.dispatch(view.state.tr.addMark(selection.from, selection.to, type.create({ href })));
            return true;
          },
          handleDOMEvents: {
            click(view, event) {
              const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
              if (!anchor || !view.dom.contains(anchor) || anchor.closest("[data-node-view-wrapper]")) return false;
              const href = anchor.getAttribute("href") ?? "";
              const modified = event.metaKey || event.ctrlKey;
              if (!editor.isEditable) {
                // Reading: in-app links stay in the app; everything else is the browser's business.
                if (modified || event.shiftKey || event.button !== 0 || !isInAppHref(href)) return false;
                event.preventDefault();
                options.host?.current.navigate(href);
                return true;
              }
              // Writing: a click in a link places the cursor. ⌘ or Ctrl with the click follows it.
              event.preventDefault();
              if (!modified || event.button !== 0) return false;
              if (isInAppHref(href)) options.host?.current.navigate(href);
              else window.open(href, "_blank", "noopener,noreferrer");
              return true;
            },
          },
        },
      }),
    ];
  },
});
