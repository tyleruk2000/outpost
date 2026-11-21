/**
 * Marks passages over a document being read, and offers to mark the words selected.
 *
 * It works over whatever the viewer draws inside `area`: the parts of it that hold
 * text are `.pdf-page` (a page of a PDF, its number in `data-page`) and
 * `[data-highlight-root]` (a Markdown document or a chapter of an EPUB). Passages are
 * painted with the CSS Custom Highlight API, so nothing is added to or changed in the
 * drawn text; a browser without it still keeps, lists and finds highlights, and says
 * on the list that it cannot paint them.
 *
 * `?highlight=<id>` in the address brings that passage into view once its text is drawn.
 */
import type { HighlightDto } from "@outpost/shared";
import { MAX_HIGHLIGHT_CHARS, MAX_HIGHLIGHT_NOTE_CHARS } from "@outpost/shared";
import { Highlighter } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { useHighlightChanges, useHighlights } from "./highlights-data";
import { indexText, locate, quoteOf, rangeOf, type TextQuote } from "./quote";
import "./highlights.css";

const PAINT = "outpost-highlight";
const CURRENT = "outpost-highlight-current";

/** Whether this browser can paint passages without changing the page. */
export const canPaint = (): boolean => typeof Highlight !== "undefined" && typeof CSS !== "undefined" && "highlights" in CSS;

interface Root {
  element: HTMLElement;
  page: number | null;
}

function rootsIn(area: HTMLElement): Root[] {
  return [...area.querySelectorAll<HTMLElement>(".pdf-page, [data-highlight-root]")].map((element) => ({
    element,
    page: element.classList.contains("pdf-page") ? Number(element.dataset.page) || null : null,
  }));
}

function rootOf(node: Node, area: HTMLElement): Root | null {
  const element = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
  const found = element?.closest<HTMLElement>(".pdf-page, [data-highlight-root]");
  if (!found || !area.contains(found)) return null;
  return { element: found, page: found.classList.contains("pdf-page") ? Number(found.dataset.page) || null : null };
}

/** Where each highlight is drawn now, for those whose text is on screen. */
function rangesFor(area: HTMLElement, highlights: readonly HighlightDto[]): Map<string, Range> {
  const found = new Map<string, Range>();
  const roots = rootsIn(area);
  const indexes = new Map<HTMLElement, ReturnType<typeof indexText>>();
  for (const highlight of highlights) {
    for (const root of roots) {
      if (highlight.page !== null && root.page !== null && root.page !== highlight.page) continue;
      let index = indexes.get(root.element);
      if (!index) {
        index = indexText(root.element);
        indexes.set(root.element, index);
      }
      if (index.nodes.length === 0) continue;
      const at = locate(index, highlight);
      if (at) {
        found.set(highlight.id, rangeOf(index, at));
        break;
      }
    }
  }
  return found;
}

interface Selected {
  quote: TextQuote;
  page: number | null;
  /** Where to put the button, in the viewport. */
  top: number;
  left: number;
}

function MarkDialog({
  selected,
  onClose,
  onSave,
  saving,
}: {
  selected: Selected | null;
  onClose(): void;
  onSave(note: string): void;
  saving: boolean;
}) {
  const [note, setNote] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new passage starts with an empty note
  useEffect(() => setNote(""), [selected]);
  return (
    <Dialog open={selected !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent title="Highlight this passage" description="Kept in Outpost only. The document's file is not changed.">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave(note);
          }}
        >
          <DialogBody className="grid gap-4">
            <blockquote className="max-h-40 overflow-y-auto rounded-control bg-surface px-3 py-2 font-title text-body text-ink">
              {selected?.quote.exact}
            </blockquote>
            <Field label="A line about it" optional>
              {(ids) => (
                <Textarea
                  {...ids}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={MAX_HIGHLIGHT_NOTE_CHARS}
                  rows={3}
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save highlight
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HighlightLayer({
  documentId,
  area,
  chapter,
}: {
  documentId: string;
  /** What the viewer draws into. */
  area: RefObject<HTMLElement | null>;
  /** The chapter of an EPUB being read; highlights of other chapters are not looked for. */
  chapter: number | null;
}) {
  const highlights = useHighlights(documentId);
  const changes = useHighlightChanges(documentId);
  const [params] = useSearchParams();
  const wanted = params.get("highlight");
  const [selection, setSelection] = useState<Selected | null>(null);
  const [marking, setMarking] = useState<Selected | null>(null);
  const shownWanted = useRef<string | null>(null);

  const all = highlights.data?.highlights;

  // Painting, again whenever the viewer draws or takes away text.
  useEffect(() => {
    const element = area.current;
    if (!element) return;
    let timer = 0;
    const list = (all ?? []).filter((entry) => entry.chapter === null || entry.chapter === chapter);
    const paint = () => {
      const ranges = rangesFor(element, list);
      if (canPaint()) {
        CSS.highlights.set(PAINT, new Highlight(...[...ranges.entries()].filter(([id]) => id !== wanted).map(([, range]) => range)));
        const current = wanted ? ranges.get(wanted) : undefined;
        if (current) CSS.highlights.set(CURRENT, new Highlight(current));
        else CSS.highlights.delete(CURRENT);
      }
      const current = wanted ? ranges.get(wanted) : undefined;
      if (current && shownWanted.current !== wanted) {
        shownWanted.current = wanted;
        const target = current.startContainer.parentElement;
        target?.scrollIntoView({ block: "center" });
      }
    };
    paint();
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(paint, 120);
    });
    observer.observe(element, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      if (canPaint()) {
        CSS.highlights.delete(PAINT);
        CSS.highlights.delete(CURRENT);
      }
    };
  }, [all, chapter, wanted, area]);

  // A new address asks for its passage to be brought into view again.
  useEffect(() => {
    if (wanted === null) shownWanted.current = null;
  }, [wanted]);

  // What is selected inside the document, as a passage that could be marked.
  useEffect(() => {
    const read = () => {
      const element = area.current;
      const chosen = window.getSelection();
      if (!element || !chosen || chosen.isCollapsed || chosen.rangeCount === 0) return setSelection(null);
      const range = chosen.getRangeAt(0);
      const root = rootOf(range.commonAncestorContainer, element) ?? rootOf(range.startContainer, element);
      if (!root) return setSelection(null);
      const quote = quoteOf(indexText(root.element), range);
      if (!quote) return setSelection(null);
      const box = range.getBoundingClientRect();
      setSelection({
        quote,
        page: root.page,
        top: Math.min(window.innerHeight - 56, box.bottom + 8),
        left: Math.max(8, Math.min(window.innerWidth - 160, box.left)),
      });
    };
    // A selection being dragged changes many times a second; it is read once it rests.
    let timer = 0;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 120);
    };
    document.addEventListener("selectionchange", later);
    return () => {
      document.removeEventListener("selectionchange", later);
      window.clearTimeout(timer);
    };
  }, [area]);

  const save = (note: string) => {
    if (!marking) return;
    if (marking.quote.exact.length > MAX_HIGHLIGHT_CHARS) {
      toast(`A highlight can mark up to ${MAX_HIGHLIGHT_CHARS.toLocaleString("en-GB")} characters. Select a shorter passage.`);
      return;
    }
    changes.create.mutate(
      { ...marking.quote, page: marking.page, chapter, note },
      {
        onSuccess: () => {
          setMarking(null);
          window.getSelection()?.removeAllRanges();
          toast.success("Highlighted. It is listed under Details.");
        },
      },
    );
  };

  return (
    <>
      {selection && !marking ? (
        <div className="fixed z-(--z-popover)" style={{ top: selection.top, left: selection.left }}>
          <Button
            variant="secondary"
            size="sm"
            className="shadow-float max-md:min-h-11"
            // Pressing the button must not clear the selection it is about.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setMarking(selection)}
          >
            <Highlighter /> Highlight
          </Button>
        </div>
      ) : null}
      <MarkDialog selected={marking} onClose={() => setMarking(null)} onSave={save} saving={changes.create.isPending} />
    </>
  );
}
