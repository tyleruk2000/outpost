/** A document from the library, shown in the page as one compact row that opens it. */
import type { DocumentResponse } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { mergeAttributes, Node, NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { ArrowUpRight, FileText, FileX2 } from "lucide-react";
import { Link } from "react-router";
import { ApiError, api } from "@/lib/api";

export const documentUrl = (documentId: string): string => `/library/documents/${documentId}`;

function DocumentEmbedView({ node, selected }: ReactNodeViewProps) {
  const documentId = String(node.attrs.documentId ?? "");
  const stored = String(node.attrs.title ?? "");
  // The library knows the document's current title; the stored one covers the time before it answers.
  const current = useQuery({
    queryKey: ["documents", "detail", documentId],
    queryFn: () => api.get<DocumentResponse>(`/api/documents/${documentId}`),
    enabled: documentId !== "",
    staleTime: 60_000,
    retry: false,
  });
  const gone = current.error instanceof ApiError && current.error.status === 404;
  const title = current.data?.document.title || stored || "Untitled document";

  return (
    <NodeViewWrapper className="document-embed" data-selected={selected || undefined} data-missing={gone || undefined} data-drag-handle>
      {gone ? (
        <div className="document-embed-row" title="This document is no longer in the library">
          <FileX2 aria-hidden />
          <span className="document-embed-title">{title}</span>
          <span className="document-embed-open">Not in the library</span>
        </div>
      ) : (
        <Link to={documentUrl(documentId)} className="document-embed-row" draggable={false}>
          <FileText aria-hidden />
          <span className="document-embed-title">{title}</span>
          <span className="document-embed-open">
            Open <ArrowUpRight aria-hidden />
          </span>
        </Link>
      )}
    </NodeViewWrapper>
  );
}

export const DocumentEmbed = Node.create({
  name: "documentEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      documentId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-document-id") ?? "",
        renderHTML: (attributes) => ({ "data-document-id": attributes.documentId }),
      },
      title: {
        default: "",
        parseHTML: (element) => element.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-document-id]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const documentId = String(node.attrs.documentId ?? "");
    return [
      "div",
      mergeAttributes({ class: "document-embed" }, HTMLAttributes),
      ["a", { class: "document-embed-row", href: documentUrl(documentId) }, String(node.attrs.title ?? "") || "Untitled document"],
    ];
  },

  renderText({ node }) {
    return String(node.attrs.title ?? "");
  },

  addNodeView() {
    return ReactNodeViewRenderer(DocumentEmbedView);
  },
});
