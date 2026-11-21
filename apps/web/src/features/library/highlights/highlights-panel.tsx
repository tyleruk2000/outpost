/** The highlights of one document, under Details: each passage, its note, a way back to it, and a copy to Notes. */
import type { DocumentDto, HighlightDto } from "@outpost/shared";
import { MAX_HIGHLIGHT_NOTE_CHARS } from "@outpost/shared";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { plural } from "@/lib/utils";
import { canPaint } from "./highlight-layer";
import { placeWords, useHighlightChanges, useHighlights } from "./highlights-data";

const matches = (highlight: HighlightDto, words: string) => {
  const q = words.trim().toLowerCase();
  return !q || highlight.exact.toLowerCase().includes(q) || highlight.note.toLowerCase().includes(q);
};

function HighlightRow({ highlight, documentId, onDelete }: { highlight: HighlightDto; documentId: string; onDelete(): void }) {
  const { update } = useHighlightChanges(documentId);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(highlight.note);
  const place = placeWords(highlight);
  return (
    <li className="py-3">
      <Link
        to={highlight.url}
        replace
        className="block rounded-control font-title text-small text-ink hover:underline hover:decoration-1 hover:underline-offset-[0.2em]"
      >
        <span className="line-clamp-4">{highlight.exact}</span>
      </Link>
      {editing ? (
        <form
          className="mt-2 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({ id: highlight.id, note }, { onSuccess: () => setEditing(false) });
          }}
        >
          <Textarea
            aria-label="A line about it"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={MAX_HIGHLIGHT_NOTE_CHARS}
            rows={3}
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="primary" loading={update.isPending}>
              Save note
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setNote(highlight.note);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : highlight.note ? (
        <p className="mt-1.5 text-small whitespace-pre-line text-ink-muted">{highlight.note}</p>
      ) : null}
      {editing ? null : (
        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-small text-ink-muted">
          {place ? <span className="tabular mr-1">{place}</span> : null}
          <Button variant="ghost" size="sm" className="max-md:min-h-11" onClick={() => setEditing(true)}>
            <Pencil /> {highlight.note ? "Edit note" : "Add a note"}
          </Button>
          <Button variant="ghost" size="sm" className="max-md:min-h-11" onClick={onDelete} aria-label="Delete highlight">
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}

export function HighlightsPanel({ document }: { document: DocumentDto }) {
  const navigate = useNavigate();
  const highlights = useHighlights(document.id);
  const { remove, toNotes } = useHighlightChanges(document.id);
  const [words, setWords] = useState("");
  const [deleting, setDeleting] = useState<HighlightDto | null>(null);

  const copy = () =>
    toNotes.mutate(undefined, {
      onSuccess: ({ note }) =>
        toast.success("Copied to a new page in Notes.", { action: { label: "Open it", onClick: () => navigate(`/notes/${note.id}`) } }),
    });

  let body: React.ReactNode;
  if (highlights.isPending) {
    body = (
      <div className="grid gap-2" aria-busy>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  } else if (highlights.isError) {
    body = <ErrorState error={highlights.error} onRetry={() => highlights.refetch()} />;
  } else if (highlights.data.highlights.length === 0) {
    body = (
      <p className="text-small text-ink-muted">
        Select words in the document and press <span className="font-medium text-ink">Highlight</span> to mark them, with a line about them
        if you like. Highlights are kept in Outpost; the file is not changed.
      </p>
    );
  } else {
    const all = highlights.data.highlights;
    const shown = all.filter((entry) => matches(entry, words));
    body = (
      <div className="grid gap-3">
        {all.length > 3 ? (
          <Input
            type="search"
            aria-label="Find in these highlights"
            placeholder="Find in these highlights"
            value={words}
            onChange={(event) => setWords(event.target.value)}
          />
        ) : null}
        {shown.length === 0 ? (
          <p className="text-small text-ink-muted">
            No highlight here has those words.{" "}
            <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => setWords("")}>
              Show them all
            </button>
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((entry) => (
              <HighlightRow key={entry.id} highlight={entry} documentId={document.id} onDelete={() => setDeleting(entry)} />
            ))}
          </ul>
        )}
        <div>
          <Button size="sm" onClick={copy} loading={toNotes.isPending} className="max-md:min-h-11">
            Copy {all.length === 1 ? "it" : `all ${all.length}`} to a page in Notes
          </Button>
        </div>
        {canPaint() ? null : (
          <p className="text-small text-ink-muted">This browser cannot mark passages on the page itself; they are listed here.</p>
        )}
      </div>
    );
  }

  return (
    <section className="border-t border-border px-5 py-5">
      <h3 className="mb-3 text-small font-semibold text-ink">
        {highlights.data && highlights.data.highlights.length > 0 ? plural(highlights.data.highlights.length, "highlight") : "Highlights"}
      </h3>
      {body}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => (open ? null : setDeleting(null))}
        title="Delete this highlight?"
        description={
          deleting
            ? `“${deleting.exact.slice(0, 160)}${deleting.exact.length > 160 ? "…" : ""}”${deleting.note ? " and its note" : ""} will no longer be marked. The document is not changed.`
            : ""
        }
        confirmLabel="Delete highlight"
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
        loading={remove.isPending}
      />
    </section>
  );
}
