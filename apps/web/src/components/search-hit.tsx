import type { SearchKind, SearchSegment } from "@outpost/shared";
import { BookMarked, BookOpen, Compass, FileText, type LucideIcon, MapPin, NotebookText, Route } from "lucide-react";

export const kindMeta: Record<string, { label: string; plural: string; icon: LucideIcon }> = {
  document: { label: "Document", plural: "Documents", icon: FileText },
  note: { label: "Page", plural: "Pages", icon: NotebookText },
  collection: { label: "Collection", plural: "Collections", icon: BookOpen },
  reference: { label: "Reference", plural: "Reference", icon: BookMarked },
  catalog: { label: "Available to download", plural: "Available to download", icon: Compass },
  marker: { label: "Saved place", plural: "Saved places", icon: MapPin },
  track: { label: "Route", plural: "Routes", icon: Route },
};

export function kindOf(kind: SearchKind) {
  return kindMeta[kind] ?? { label: kind, plural: kind, icon: FileText };
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
