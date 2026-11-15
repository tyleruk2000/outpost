/**
 * An inline link to another page. It shows the target's current icon and title, so a
 * renamed page is renamed everywhere it is linked; the stored `label` is what shows
 * until the tree is loaded, and what remains if the target is gone.
 */

import { noteUrl } from "@outpost/shared";
import { mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { Link } from "react-router";
import { displayTitle, usePageRef } from "../notes-data";
import { PageIcon } from "../page-bits";

function PageLinkView({ node, selected }: ReactNodeViewProps<HTMLSpanElement>) {
  const noteId = String(node.attrs.noteId ?? "");
  const label = String(node.attrs.label ?? "");
  const { page, missing } = usePageRef(noteId);
  const title = displayTitle(page ? page.title : label);

  return (
    <NodeViewWrapper as="span" className="page-link" data-selected={selected || undefined} data-missing={missing || undefined}>
      {missing ? (
        <span title="This page is in the trash or no longer exists">
          <PageIcon icon={null} />
          {title}
          <span className="sr-only"> (page not found)</span>
        </span>
      ) : (
        <Link to={noteUrl(noteId)} draggable={false}>
          <PageIcon icon={page?.icon} />
          {title}
        </Link>
      )}
    </NodeViewWrapper>
  );
}

export const PageLink = Node.create({
  name: "pageLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      noteId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-page-link") ?? "",
        renderHTML: (attributes) => ({ "data-page-link": attributes.noteId, href: noteUrl(String(attributes.noteId)) }),
      },
      label: {
        default: "",
        parseHTML: (element) => element.textContent ?? "",
        // The label is the element's text, not an attribute of it.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    // Ahead of the link mark, which would otherwise claim any <a href>.
    return [{ tag: "a[data-page-link]", priority: 1100 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["a", mergeAttributes({ class: "page-link" }, HTMLAttributes), displayTitle(String(node.attrs.label ?? ""))];
  },

  renderText({ node }) {
    return displayTitle(String(node.attrs.label ?? ""));
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView, { as: "span", className: "page-link-view" });
  },
});
