import type { SearchKind, SearchResult, SearchSegment } from "@outpost/shared";
import {
  BookMarked,
  BookOpen,
  Compass,
  Contact,
  FileText,
  Highlighter,
  type LucideIcon,
  MapPin,
  NotebookText,
  RadioReceiver,
  Route,
} from "lucide-react";

export const kindMeta: Record<string, { label: string; plural: string; icon: LucideIcon }> = {
  document: { label: "Document", plural: "Documents", icon: FileText },
  note: { label: "Page", plural: "Pages", icon: NotebookText },
  collection: { label: "Collection", plural: "Collections", icon: BookOpen },
  reference: { label: "Reference", plural: "Reference", icon: BookMarked },
  catalog: { label: "Available to download", plural: "Available to download", icon: Compass },
  marker: { label: "Saved place", plural: "Saved places", icon: MapPin },
  track: { label: "Route", plural: "Routes", icon: Route },
  contact: { label: "Contact", plural: "Contacts", icon: Contact },
  repeater: { label: "Repeater", plural: "Repeaters", icon: RadioReceiver },
  highlight: { label: "Highlight", plural: "Highlights", icon: Highlighter },
};

export function kindOf(kind: SearchKind) {
  return kindMeta[kind] ?? { label: kind, plural: kind, icon: FileText };
}

/**
 * Where a result opens. A passage of a document without pages is known by the heading
 * it sits under, which for a book is the first heading of its chapter; the address
 * carries that heading, and an EPUB book opens at the chapter it names.
 */
export function resultHref(result: Pick<SearchResult, "kind" | "url" | "passages">): string {
  const passage = result.passages[0];
  if (result.kind !== "document" || !passage?.heading || passage.page !== null || result.url.includes("?")) return result.url;
  return `${result.url}?heading=${encodeURIComponent(passage.heading.slice(0, 300))}`;
}

/** Renders text with the matched parts marked. Segments are plain strings, never HTML. */
export function Highlighted({ segments }: { segments: SearchSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are a fixed, ordered list
          <mark key={index}>{segment.text}</mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are a fixed, ordered list
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
