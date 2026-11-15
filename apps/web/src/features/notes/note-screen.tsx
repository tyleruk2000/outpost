/**
 * One page, open for reading and writing. This file owns the page's working copy (the
 * title, icon, tags, cover and the editor), hands changes to the save queue, and shows
 * every state a page can be in: loading, missing, in the trash, a template, offline, in
 * conflict with another device, or holding a draft from before a reload.
 */
import { attachmentUrl, type NoteDetail, type NoteDoc, type NoteResponse } from "@outpost/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import { ArchiveRestore, CircleAlert, History, LayoutTemplate, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { NoteEditor } from "./editor/note-editor";
import { MoveDialog } from "./move-dialog";
import { NoteFooter } from "./note-footer";
import { PageAdornments, PageCover, PageTitle } from "./note-header";
import { NoteTopBar } from "./note-top-bar";
import { noteKeys, saveNote, uploadAttachment, useNoteActions, useNoteTree } from "./notes-data";
import { TagEditor } from "./tag-editor";
import { clearDraft, draftDiffers, PAGE_FIELDS, type PageDraft, type PageFields, readDraft, usePageSaver } from "./use-page-saver";

/** The measure of the text: the 70 characters of `.prose`, as a width the whole page column shares. */
const column = "mx-auto w-full max-w-[calc(43.125rem+2.5rem)] px-5 md:max-w-[calc(43.125rem+7rem)] md:px-14";

function NoteSkeleton() {
  return (
    <div aria-busy>
      <div className="flex h-12 items-center px-5 md:px-6">
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className={`${column} pt-10 md:pt-16`}>
        <Skeleton className="h-10 w-3/5" />
        <Skeleton className="mt-9 h-4 w-full" />
        <Skeleton className="mt-3.5 h-4 w-11/12" />
        <Skeleton className="mt-3.5 h-4 w-4/5" />
        <Skeleton className="mt-9 h-4 w-full" />
        <Skeleton className="mt-3.5 h-4 w-2/3" />
      </div>
    </div>
  );
}

export function NoteScreen({ id }: { id: string }) {
  const viewed = useRef(false);
  const note = useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: () => {
      // Opening a page counts as a view once; refreshing it in the background does not.
      const first = !viewed.current;
      viewed.current = true;
      return api.get<NoteResponse>(`/api/notes/${id}`, first ? { view: 1 } : undefined);
    },
    // A page shown from the cache is always checked against the server straight away.
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (note.isPending) return <NoteSkeleton />;
  if (note.isError) {
    if (note.error instanceof ApiError && note.error.status === 404) {
      return (
        <Page width="reading">
          <h1 className="font-title text-title text-ink">This page does not exist</h1>
          <p className="mt-2 text-ink-muted">
            It may have been deleted for good, or the link may be wrong. Pages moved to the trash can still be restored.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="primary">
              <Link to="/notes">Go to Notes</Link>
            </Button>
            <Button asChild>
              <Link to="/notes?view=trash">Look in the trash</Link>
            </Button>
          </div>
        </Page>
      );
    }
    return (
      <Page width="reading">
        <ErrorState error={note.error} onRetry={() => note.refetch()} />
      </Page>
    );
  }
  // The editor is made for one page in one mode; a restored page gets a fresh, editable one.
  return (
    <LoadedNote
      key={`${id}:${note.data.note.trashedAt === null}`}
      note={note.data.note}
      reload={async () => (await note.refetch()).data?.note}
    />
  );
}

function LoadedNote({ note, reload }: { note: NoteDetail; reload(): Promise<NoteDetail | undefined> }) {
  const client = useQueryClient();
  const actions = useNoteActions();
  const tree = useNoteTree();
  const editable = note.trashedAt === null;

  const [title, setTitle] = useState(note.title);
  const [icon, setIcon] = useState(note.icon);
  const [tags, setTags] = useState(note.tags);
  const [cover, setCover] = useState<{ id: string; url: string } | null>(
    note.coverAttachmentId && note.coverUrl ? { id: note.coverAttachmentId, url: note.coverUrl } : null,
  );
  const [coverUploading, setCoverUploading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [draft, setDraft] = useState<PageDraft | null>(() => {
    if (!editable) return null;
    const stored = readDraft(note.id);
    if (!stored) return null;
    const saved: PageFields = {
      title: note.title,
      icon: note.icon,
      tags: note.tags,
      coverAttachmentId: note.coverAttachmentId,
      content: note.content,
    };
    if (draftDiffers(stored, saved)) return stored;
    clearDraft(note.id);
    return null;
  });

  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const iconButton = useRef<HTMLButtonElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  /** What the editor last held, for the moment it is read after it has gone. */
  const lastContent = useRef<NoteDoc>(note.content);

  const fields = useRef({ title, icon, tags, coverAttachmentId: cover?.id ?? null });
  fields.current = { title, icon, tags, coverAttachmentId: cover?.id ?? null };

  const { saver, status } = usePageSaver({
    noteId: note.id,
    baseUpdatedAt: note.updatedAt,
    enabled: editable,
    collect(keys) {
      const patch: Partial<PageFields> = {};
      if (keys.has("title")) patch.title = fields.current.title;
      if (keys.has("icon")) patch.icon = fields.current.icon;
      if (keys.has("tags")) patch.tags = fields.current.tags;
      if (keys.has("coverAttachmentId")) patch.coverAttachmentId = fields.current.coverAttachmentId;
      if (keys.has("content")) {
        const editor = editorRef.current;
        if (editor && !editor.isDestroyed) lastContent.current = editor.getJSON() as NoteDoc;
        patch.content = lastContent.current;
      }
      return patch;
    },
  });

  const touch = useCallback((key: keyof PageFields) => saver.current?.touch(key), [saver]);
  const flush = useCallback(() => saver.current?.flush(), [saver]);

  /** Replaces the working copy with a version from the server. */
  const adopt = useCallback(
    (fresh: NoteDetail) => {
      setTitle(fresh.title);
      setIcon(fresh.icon);
      setTags(fresh.tags);
      setCover(fresh.coverAttachmentId && fresh.coverUrl ? { id: fresh.coverAttachmentId, url: fresh.coverUrl } : null);
      lastContent.current = fresh.content;
      const editor = editorRef.current;
      if (editor && !editor.isDestroyed)
        editor.chain().setMeta("addToHistory", false).setContent(fresh.content, { emitUpdate: false }).run();
      saver.current?.reset(fresh.updatedAt);
    },
    [saver],
  );

  // The page changed somewhere else while this copy had nothing unsaved: follow it.
  // With unsaved changes it is left alone, and the next save reports the conflict.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a newer version arrives, not when the callback changes
  useEffect(() => {
    const queue = saver.current;
    if (queue && note.updatedAt > queue.baseUpdatedAt() && queue.isClean()) adopt(note);
  }, [note.updatedAt]);

  const restoreDraft = () => {
    if (!draft) return;
    const { fields: kept } = draft;
    if (kept.title !== undefined) setTitle(kept.title);
    if (kept.icon !== undefined) setIcon(kept.icon);
    if (kept.tags !== undefined) setTags(kept.tags);
    if (kept.coverAttachmentId !== undefined)
      setCover(kept.coverAttachmentId ? { id: kept.coverAttachmentId, url: attachmentUrl(kept.coverAttachmentId) } : null);
    if (kept.content !== undefined) editorRef.current?.commands.setContent(kept.content, { emitUpdate: false });
    // The values are in state from the next render on, which is before the queue reads them.
    for (const key of Object.keys(kept) as Array<keyof PageFields>) touch(key);
    setDraft(null);
  };

  const discardDraft = () => {
    clearDraft(note.id);
    setDraft(null);
  };

  const loadOther = async () => {
    setChoosing(true);
    try {
      const fresh = await reload();
      if (fresh) adopt(fresh);
    } finally {
      setChoosing(false);
    }
  };

  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    setCoverUploading(true);
    try {
      const attachment = await uploadAttachment(file, note.id);
      if (!attachment.mime.startsWith("image/")) {
        void api.delete(`/api/attachments/${attachment.id}`).catch(() => {});
        toast.error(`“${file.name}” is not a picture. A cover has to be a picture.`);
        return;
      }
      setCover({ id: attachment.id, url: attachment.url });
      // Read by the queue after the next render, when the new cover is in `fields`.
      touch("coverAttachmentId");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCoverUploading(false);
    }
  };

  const removeCover = () => {
    setCover(null);
    touch("coverAttachmentId");
  };

  const setTemplate = async (isTemplate: boolean) => {
    const queue = saver.current;
    // Anything still unsaved goes first, so this change is made on top of it.
    queue?.flush();
    for (let waited = 0; queue && !queue.isClean() && queue.status().kind === "saving" && waited < 40; waited += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    try {
      const { note: saved } = await saveNote(note.id, { isTemplate });
      queue?.rebase(saved.updatedAt);
      client.setQueryData<NoteResponse>(noteKeys.detail(note.id), (data) => (data ? { note: { ...data.note, ...saved } } : data));
      await client.invalidateQueries({ queryKey: noteKeys.all });
      toast(
        isTemplate
          ? "This page is now a template. Find it under Templates when you start a new page."
          : "This page is an ordinary page again, at the top level of your pages.",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const createSubPage = useCallback(
    (subTitle: string) => actions.create({ parentId: note.id, title: subTitle }, { open: false }),
    [actions, note.id],
  );
  const onEditor = useCallback((editor: Editor | null) => {
    if (editor) editorRef.current = editor;
  }, []);
  const onContentChange = useCallback(() => touch("content"), [touch]);
  const newSubPage = useCallback(() => void actions.create({ parentId: note.id }), [actions, note.id]);

  return (
    <article>
      <NoteTopBar
        note={note}
        status={status}
        actions={actions}
        hasIcon={icon !== null}
        hasCover={cover !== null}
        onMove={() => setMoving(true)}
        onAddIcon={() => iconButton.current?.click()}
        onAddCover={() => coverInput.current?.click()}
        onRemoveCover={removeCover}
        onTemplate={(next) => void setTemplate(next)}
      />

      {cover ? (
        <PageCover
          url={cover.url}
          editable={editable}
          uploading={coverUploading}
          onChange={() => coverInput.current?.click()}
          onRemove={removeCover}
        />
      ) : null}
      <input
        ref={coverInput}
        type="file"
        accept="image/*"
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void pickCover(file);
        }}
      />

      <div className={`${column} ${cover ? "pt-6" : "pt-6 md:pt-12"}`}>
        <div className="grid gap-3 empty:hidden [&:not(:empty)]:mb-6">
          {note.trashedAt !== null ? (
            <Notice
              tone="warning"
              icon={<ArchiveRestore />}
              title="This page is in the trash"
              action={
                <Button size="sm" className="shrink-0" onClick={() => void actions.restore(note)}>
                  Restore
                </Button>
              }
            >
              It was moved there {timeAgo(note.trashedAt)} and cannot be changed until it is restored.
            </Notice>
          ) : null}

          {note.isTemplate && editable ? (
            <Notice tone="info" icon={<LayoutTemplate />} title="This page is a template">
              It is kept outside your pages and offered whenever you start a new one. Changes here apply to pages made from it later, not to
              ones already made.
            </Notice>
          ) : null}

          {status.kind === "conflict" ? (
            <Notice tone="warning" icon={<TriangleAlert />} title="This page was changed somewhere else">
              <p>
                Another tab or device saved a newer version at {formatDateTime(status.current.updatedAt)}. Your version is still here,
                unsaved, and nothing has been overwritten. Choose which one to keep.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" disabled={choosing} onClick={() => saver.current?.keepMine(PAGE_FIELDS)}>
                  Keep my version
                </Button>
                <Button size="sm" loading={choosing} onClick={() => void loadOther()}>
                  Load the other version
                </Button>
              </div>
            </Notice>
          ) : null}

          {status.kind === "error" ? (
            <Notice
              tone="danger"
              icon={<CircleAlert />}
              title="Your changes could not be saved"
              action={
                <Button size="sm" className="shrink-0" onClick={() => saver.current?.retry()}>
                  Try again
                </Button>
              }
            >
              {status.message} They are still here on this screen.
            </Notice>
          ) : null}

          {draft ? (
            <Notice tone="info" icon={<History />} title="Unsaved changes were found">
              <p>
                This tab was closed or reloaded {timeAgo(draft.at)} before your last changes to this page were saved. They were kept on this
                device.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={restoreDraft}>
                  Restore my changes
                </Button>
                <Button size="sm" onClick={discardDraft}>
                  Discard them
                </Button>
              </div>
            </Notice>
          ) : null}
        </div>

        <header className="group/reveal">
          <PageAdornments
            icon={icon}
            hasCover={cover !== null}
            editable={editable}
            coverUploading={coverUploading}
            iconButtonRef={iconButton}
            onIcon={(next) => {
              setIcon(next);
              touch("icon");
            }}
            onAddCover={() => coverInput.current?.click()}
          />
          <PageTitle
            ref={titleRef}
            value={title}
            editable={editable}
            onChange={(next) => {
              setTitle(next);
              touch("title");
            }}
            onEnter={() => {
              const editor = editorRef.current;
              if (!editor) return;
              // Tiptap moves the focus a frame later; a fast typist's next key must already land in the text.
              editor.view.focus();
              editor.commands.focus("start");
            }}
            onBlur={flush}
          />
          <TagEditor
            tags={tags}
            readOnly={!editable}
            onChange={(next) => {
              setTags(next);
              touch("tags");
            }}
            onBlur={flush}
            className="mt-3"
          />
        </header>

        <div className="mt-7">
          <NoteEditor
            noteId={note.id}
            content={note.content}
            editable={editable}
            onChange={onContentChange}
            onBlur={flush}
            onEditor={onEditor}
            createSubPage={createSubPage}
          />
        </div>

        <NoteFooter
          backlinks={note.backlinks}
          subPages={note.children}
          canAddSubPage={editable && !note.isTemplate}
          onNewSubPage={newSubPage}
        />
      </div>

      {moving && tree.data ? <MoveDialog page={note} index={tree.data} onClose={() => setMoving(false)} /> : null}
    </article>
  );
}
