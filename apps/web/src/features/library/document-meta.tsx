/** Names, icons and small facts shared by the document list and the document screen. */
import type { DocumentDto, DocumentType } from "@outpost/shared";
import { BookOpen, FileBraces, FileCode, FileSpreadsheet, FileText, FileType, Image, type LucideIcon } from "lucide-react";
import { plural } from "@/lib/utils";

/** Query keys. They all start with "documents" so `lib/events.tsx` refreshes them on `documents.changed`. */
export const documentKeys = {
  all: ["documents"] as const,
  list: (filters: Record<string, string>) => ["documents", "list", filters] as const,
  facets: ["documents", "facets"] as const,
  detail: (id: string) => ["documents", "detail", id] as const,
  text: (id: string) => ["documents", "text", id] as const,
  markdown: (id: string) => ["documents", "markdown", id] as const,
};

/** What the file picker offers. The server decides for itself; this only saves people a wasted upload. */
export const ACCEPTED_FILES = ".pdf,.epub,.md,.markdown,.txt,.csv,.json,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.svg";
export const SUPPORTED_TYPES = "PDF, EPUB, Markdown, plain text, HTML, CSV, JSON, and images (PNG, JPEG, GIF, WebP, SVG)";

export const typeLabels: Record<DocumentType, { label: string; plural: string; icon: LucideIcon }> = {
  pdf: { label: "PDF", plural: "PDFs", icon: FileText },
  epub: { label: "EPUB", plural: "EPUB books", icon: BookOpen },
  markdown: { label: "Markdown", plural: "Markdown", icon: FileType },
  text: { label: "Text", plural: "Text", icon: FileType },
  html: { label: "HTML", plural: "HTML pages", icon: FileCode },
  image: { label: "Image", plural: "Images", icon: Image },
};

const extLabels: Record<string, { label: string; icon?: LucideIcon }> = {
  csv: { label: "CSV", icon: FileSpreadsheet },
  json: { label: "JSON", icon: FileBraces },
  txt: { label: "Plain text" },
  png: { label: "PNG image" },
  jpg: { label: "JPEG image" },
  jpeg: { label: "JPEG image" },
  gif: { label: "GIF image" },
  webp: { label: "WebP image" },
  svg: { label: "SVG image" },
};

/** The most exact name for what a document is: "CSV" rather than "Text", "PNG image" rather than "Image". */
export function kindOfDocument(document: Pick<DocumentDto, "type" | "ext">): { label: string; icon: LucideIcon } {
  const byType = typeLabels[document.type] ?? typeLabels.text;
  const byExt = extLabels[document.ext];
  return { label: byExt?.label ?? byType.label, icon: byExt?.icon ?? byType.icon };
}

/** "PDF, 340 pages" */
export function kindLine(document: Pick<DocumentDto, "type" | "ext" | "pageCount">): string {
  const { label } = kindOfDocument(document);
  return document.pageCount ? `${label}, ${plural(document.pageCount, "page")}` : label;
}

/** True while Outpost is still reading a document's text. */
export const isReading = (document: Pick<DocumentDto, "extraction">) =>
  document.extraction === "pending" || document.extraction === "running";

/**
 * Copies text to the clipboard. Outpost is often reached over plain HTTP on a home
 * network, where the modern clipboard API is not offered, so there is an older path too.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the older way.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}
