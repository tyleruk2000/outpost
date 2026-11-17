/**
 * A kept page, shown while the server is out of reach. It is the same page, drawn by
 * the same editor with writing switched off: a kept copy is for reading, and nothing
 * typed here could be saved anywhere.
 */
import type { NoteDetail, NoteResponse } from "@outpost/shared";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { NoteEditor } from "@/features/notes/editor/note-editor";
import { NoteFooter } from "@/features/notes/note-footer";
import { PageAdornments, PageCover, PageTitle } from "@/features/notes/note-header";
import { TagEditor } from "@/features/notes/tag-editor";
import { formatDateTime } from "@/lib/utils";
import { DEVICE, ON_THIS_DEVICE } from "./device";
import { notePath } from "./keep";
import { type KeptNote, listKept, readKeptJson } from "./store";

/** The measure of the text, as on the page when it can be edited (`note-screen.tsx`). */
const column = "mx-auto w-full max-w-[calc(43.125rem+2.5rem)] px-5 md:max-w-[calc(43.125rem+7rem)] md:px-14";
const nothing = () => {};
const noSubPage = async () => undefined;

type Found = { state: "loading" } | { state: "not-kept" } | { state: "kept"; note: NoteDetail; item: KeptNote };

/** Looks a page up among the kept ones: as a page kept for itself, or as one inside a kept page. */
export async function findKeptPage(id: string): Promise<{ note: NoteDetail; item: KeptNote } | undefined> {
  const items = (await listKept()).filter((item): item is KeptNote => item.kind === "note");
  // A copy of the page itself is preferred to the copy that came with a page above it.
  const holders = [
    ...items.filter((item) => item.id === id),
    ...items.filter((item) => item.id !== id && item.pages.some((page) => page.id === id)),
  ];
  for (const item of holders) {
    const answer = await readKeptJson<NoteResponse>("note", item.id, notePath(id));
    if (answer) return { note: answer.note, item };
  }
  return undefined;
}

function NotKept() {
  return (
    <Page width="reading">
      <h1 className="font-title text-title text-ink">This page is not kept on this {DEVICE}</h1>
      <p className="mt-2 max-w-[60ch] text-ink-muted">
        It is on the Outpost server, which is out of reach from here. When the server is back in reach, open the page and choose “Keep on
        this {DEVICE}” from its menu, and it will open here next time.
      </p>
      <Button asChild variant="primary" className="mt-5">
        <Link to="/kept">See what is kept</Link>
      </Button>
    </Page>
  );
}

function KeptNoteView({ note, item }: { note: NoteDetail; item: KeptNote }) {
  const parent = note.breadcrumbs.at(-1);
  // The way back up leads to the parent only if the parent came along; otherwise to the list of what is kept.
  const parentKept = parent && item.pages.some((page) => page.id === parent.id);
  return (
    <article>
      <div className="sticky top-0 z-(--z-sticky) flex h-12 items-center gap-3 bg-page px-5 max-md:top-13 md:px-6">
        <Link
          to={parentKept ? `/notes/${parent.id}` : "/kept"}
          className="-ml-1.5 flex h-10 min-w-0 flex-1 items-center gap-1 text-small text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{parentKept ? parent.title.trim() || "Untitled" : ON_THIS_DEVICE}</span>
        </Link>
        <p className="tabular shrink-0 text-small text-ink-muted">Kept copy from {formatDateTime(item.refreshedAt)}</p>
      </div>

      {note.coverUrl ? <PageCover url={note.coverUrl} editable={false} uploading={false} onChange={nothing} onRemove={nothing} /> : null}

      <div className={`${column} ${note.coverUrl ? "pt-6" : "pt-6 md:pt-12"}`}>
        <header>
          <PageAdornments
            icon={note.icon}
            hasCover={note.coverUrl !== null}
            editable={false}
            coverUploading={false}
            iconButtonRef={null}
            onIcon={nothing}
            onAddCover={nothing}
          />
          <PageTitle value={note.title} editable={false} onChange={nothing} onEnter={nothing} onBlur={nothing} />
          <TagEditor tags={note.tags} readOnly onChange={nothing} className="mt-3" />
        </header>
        <div className="mt-7">
          <NoteEditor
            noteId={note.id}
            content={note.content}
            editable={false}
            onChange={nothing}
            onBlur={nothing}
            onEditor={nothing}
            createSubPage={noSubPage}
          />
        </div>
        <NoteFooter backlinks={note.backlinks} subPages={note.children} canAddSubPage={false} onNewSubPage={nothing} />
      </div>
    </article>
  );
}

export default function KeptNoteScreen() {
  const { id = "" } = useParams();
  const [found, setFound] = useState<Found>({ state: "loading" });

  useEffect(() => {
    let current = true;
    setFound({ state: "loading" });
    findKeptPage(id).then(
      (result) => current && setFound(result ? { state: "kept", ...result } : { state: "not-kept" }),
      () => current && setFound({ state: "not-kept" }),
    );
    return () => {
      current = false;
    };
  }, [id]);

  if (found.state === "loading") {
    return (
      <div className={`${column} pt-16`} aria-busy>
        <Skeleton className="h-10 w-3/5" />
        <Skeleton className="mt-9 h-4 w-full" />
        <Skeleton className="mt-3.5 h-4 w-4/5" />
      </div>
    );
  }
  if (found.state === "not-kept") return <NotKept />;
  // The editor is made for one page; another page gets another editor.
  return <KeptNoteView key={found.note.id} note={found.note} item={found.item} />;
}
