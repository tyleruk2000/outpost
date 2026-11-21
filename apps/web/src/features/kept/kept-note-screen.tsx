/**
 * A kept page, shown while the server is out of reach. It is the same page, drawn by the
 * same editor, for reading; "Edit on this phone" lets its title and text be changed. The
 * changes are kept on the phone as they are typed (`outbox.ts`) and sent when Outpost is
 * next in reach, made on top of this copy: a page saved on Outpost since is not
 * overwritten, and its screen asks which version to keep.
 */
import type { NoteDetail, NoteDoc, NoteResponse } from "@outpost/shared";
import type { Editor } from "@tiptap/react";
import { ArrowLeft, Check, PenLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { NoteEditor } from "@/features/notes/editor/note-editor";
import { NoteFooter } from "@/features/notes/note-footer";
import { PageAdornments, PageCover, PageTitle } from "@/features/notes/note-header";
import { TagEditor } from "@/features/notes/tag-editor";
import { notify } from "@/lib/notify";
import { formatDateTime } from "@/lib/utils";
import { DEVICE, ON_THIS_DEVICE } from "./device";
import { notePath } from "./keep";
import { editFor, keepEdit, type OutboxEdit } from "./outbox";
import { type KeptNote, keepingSupported, listKept, outOfRoomMessage, readKeptJson } from "./store";

/** The measure of the text, as on the page when it can be edited (`note-screen.tsx`). */
const column = "mx-auto w-full max-w-[calc(43.125rem+2.5rem)] px-5 md:max-w-[calc(43.125rem+7rem)] md:px-14";
const nothing = () => {};
const noSubPage = async () => undefined;

/** How long typing pauses before the changes are kept on the phone. */
const KEEP_AFTER_MS = 500;

type Found =
  | { state: "loading" }
  | { state: "not-kept" }
  | { state: "kept"; note: NoteDetail; item: KeptNote; edit: OutboxEdit | undefined };

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

function KeptNoteView({ note, item, edit }: { note: NoteDetail; item: KeptNote; edit: OutboxEdit | undefined }) {
  const parent = note.breadcrumbs.at(-1);
  // The way back up leads to the parent only if the parent came along; otherwise to the list of what is kept.
  const parentKept = parent && item.pages.some((page) => page.id === parent.id);
  // An encrypted page is kept as it is stored, unreadable without its passphrase: it is not changed here.
  const canEdit = keepingSupported() && !note.encrypted;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(edit?.title ?? note.title);
  const [changedAt, setChangedAt] = useState(edit?.writtenAt ?? null);
  const content = useRef<NoteDoc>(edit?.content ?? note.content);
  const editor = useRef<Editor | null>(null);
  const titleNow = useRef(title);
  titleNow.current = title;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  // The copy the changes are made on: the one they were first made on, if some are already waiting.
  const base = edit?.base ?? note.updatedAt;

  const keepNow = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (!dirty.current) return;
    dirty.current = false;
    const live = editor.current;
    if (live && !live.isDestroyed) content.current = live.getJSON() as NoteDoc;
    try {
      const kept = await keepEdit({ noteId: note.id, title: titleNow.current, content: content.current, base });
      setChangedAt(kept.writtenAt);
    } catch (error) {
      notify.error(outOfRoomMessage(error) ?? `This ${DEVICE} could not keep the change. It is still on the screen.`);
    }
  }, [note.id, base]);

  const changed = useCallback(() => {
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void keepNow(), KEEP_AFTER_MS);
  }, [keepNow]);

  // Kept at once when the page is hidden or left, not after the pause.
  useEffect(() => {
    const onHidden = () => document.visibilityState === "hidden" && void keepNow();
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      void keepNow();
    };
  }, [keepNow]);

  const onEditor = useCallback((next: Editor | null) => {
    if (!next && editor.current && !editor.current.isDestroyed) content.current = editor.current.getJSON() as NoteDoc;
    editor.current = next;
  }, []);

  const toggle = () => {
    if (editing) void keepNow();
    else {
      const live = editor.current;
      if (live && !live.isDestroyed) content.current = live.getJSON() as NoteDoc;
    }
    setEditing(!editing);
  };
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
        {canEdit ? (
          <Button size="sm" variant={editing ? "primary" : "secondary"} className="shrink-0" onClick={toggle}>
            {editing ? <Check aria-hidden /> : <PenLine aria-hidden />}
            {editing ? "Done" : "Edit"}
          </Button>
        ) : null}
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
          <PageTitle
            value={title}
            editable={editing}
            onChange={(next) => {
              setTitle(next);
              changed();
            }}
            onEnter={() => editor.current?.commands.focus("start")}
            onBlur={() => void keepNow()}
          />
          <TagEditor tags={note.tags} readOnly onChange={nothing} className="mt-3" />
          {changedAt !== null || editing ? (
            <p role="status" className="mt-3 text-small text-ink-muted">
              {changedAt !== null
                ? `Changed on this ${DEVICE} ${formatDateTime(changedAt)}. The changes are sent when Outpost is back in reach; if the page was changed there too, nothing is overwritten and you choose which version to keep.`
                : `Changes to the title and text are kept on this ${DEVICE} as you type, and sent when Outpost is back in reach. Pictures can be added once it is.`}
            </p>
          ) : null}
        </header>
        <div className="mt-7">
          <NoteEditor
            // A fresh editor for writing and for reading, each starting from the text as it is now.
            key={editing ? "writing" : "reading"}
            noteId={note.id}
            content={content.current}
            editable={editing}
            onChange={changed}
            onBlur={() => void keepNow()}
            onEditor={onEditor}
            createSubPage={noSubPage}
            pictures={false}
            noPicturesWhy={`A picture can be added once Outpost is back in reach: it is stored there, not on this ${DEVICE}.`}
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
    Promise.all([findKeptPage(id), editFor(id).catch(() => undefined)]).then(
      ([result, edit]) => current && setFound(result ? { state: "kept", ...result, edit } : { state: "not-kept" }),
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
  return <KeptNoteView key={found.note.id} note={found.note} item={found.item} edit={found.edit} />;
}
