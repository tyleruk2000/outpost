/**
 * An encrypted page. Its title and tags are plain and are edited and saved as on any
 * page. Its text is one OpenPGP message: this screen asks for the passphrase or key,
 * decrypts the message in the browser and shows the page. Nothing decrypted is ever
 * sent to the server or written to the browser's storage.
 *
 * Editing: "Edit" makes the text editable. Changes are saved a moment after typing
 * stops, each time as a fresh encryption of the whole page that has been decrypted back
 * and compared before it is sent. "Lock" forgets the text and the passphrase; so do
 * five idle minutes, and leaving the page.
 *
 * A page opened with a key needs that key, unlocked, for every save. So reading and
 * typing here count as use of the key, and it is not forgotten while the page is in use.
 * If a save finds the key locked all the same, the page asks for its passphrase again
 * and then saves; what was typed is never left with no way to save it.
 */
import { encryptedNoteArmor, encryptedNoteDoc, type NoteDetail, type NoteDoc, type NoteResponse } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import { CircleAlert, Ellipsis, History, LockKeyhole, LockKeyholeOpen, Pencil, Star, TriangleAlert } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Skeleton, Tooltip } from "@/components/ui/misc";
import { cryptographyAvailable, getEngine, type MessageNeeds } from "@/features/encryption/engine";
import { keyLabel } from "@/features/encryption/format";
import { canUsePrivate, type ShelfKey, useShelf, useUnlocked } from "@/features/encryption/keys-data";
import { openPage, type PageLock, sealPage } from "@/features/encryption/pages";
import { IDLE_MINUTES, PassphraseInput, UnlockForm } from "@/features/encryption/parts";
import { keepUnlocked, lockAll, UNLOCK_IDLE_MS, unlockedKey } from "@/features/encryption/session";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NoteEditor } from "./editor/note-editor";
import { MoveDialog } from "./move-dialog";
import { NoteFooter } from "./note-footer";
import { PageCover, PageTitle } from "./note-header";
import { Breadcrumbs, SaveState } from "./note-top-bar";
import { displayTitle, noteKeys, refreshNotes, saveNote, useNoteActions, useNoteTree } from "./notes-data";
import { PageIcon, PageMenuItems } from "./page-bits";
import { TagEditor } from "./tag-editor";
import { clearDraft, type PageFields, readDraft, usePageSaver } from "./use-page-saver";

const column = "mx-auto w-full max-w-[calc(43.125rem+2.5rem)] px-5 md:max-w-[calc(43.125rem+7rem)] md:px-14";
/** How long after the last keystroke an edit is encrypted and saved. Longer than for a plain page: each save encrypts the whole page twice over. */
const SAVE_DELAY_MS = 2000;

interface Open {
  content: NoteDoc;
  lock: PageLock;
  /** True for a message Outpost did not write, shown as plain paragraphs. */
  foreign: boolean;
  /** The key the page was opened with, kept so that its passphrase can be asked for again. */
  key: ShelfKey | null;
}

type TextState =
  | { kind: "saved" }
  | { kind: "unsaved" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  /** The key the page was opened with has been locked: nothing can be saved until it is unlocked again. */
  | { kind: "key-locked" };

export default function EncryptedNote({ note }: { note: NoteDetail }) {
  const client = useQueryClient();
  const actions = useNoteActions();
  const tree = useNoteTree();
  const available = cryptographyAvailable();
  const shelf = useShelf(available);
  const unlocked = useUnlocked();
  const armor = encryptedNoteArmor(note.content) ?? "";

  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState(note.tags);
  const [moving, setMoving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [needs, setNeeds] = useState<MessageNeeds | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState<TextState>({ kind: "saved" });
  const [staleDraft, setStaleDraft] = useState(() => readDraft(note.id)?.fields.content !== undefined);

  const editorRef = useRef<Editor | null>(null);
  const openRef = useRef<Open | null>(null);
  openRef.current = open;
  /** The armour this screen last decrypted or saved: a different one arriving means the page was changed elsewhere. */
  const knownArmor = useRef(armor);
  const fields = useRef({ title, tags });
  fields.current = { title, tags };

  // ── The plain parts: title and tags, saved as on any page. The content is never in this queue. ──
  const { saver, status } = usePageSaver({
    noteId: note.id,
    baseUpdatedAt: note.updatedAt,
    enabled: true,
    collect(keys) {
      const patch: Partial<PageFields> = {};
      if (keys.has("title")) patch.title = fields.current.title;
      if (keys.has("tags")) patch.tags = fields.current.tags;
      return patch;
    },
  });
  const flushPlain = useCallback(() => saver.current?.flush(), [saver]);

  // ── What the message needs, read from its outside ──
  useEffect(() => {
    if (!available || !armor) return;
    let cancelled = false;
    getEngine()
      .then((engine) => engine.messageNeeds(armor))
      .then(
        (found) => !cancelled && setNeeds(found),
        (failure: unknown) => !cancelled && setOpenError(errorMessage(failure)),
      );
    return () => {
      cancelled = true;
    };
  }, [armor, available]);

  const addressed: ShelfKey[] = needs
    ? (shelf.data?.keys ?? []).filter((entry) => entry.info.keyIds.some((id) => needs.keyIds.includes(id)))
    : [];
  const myKey = addressed.find((entry) => canUsePrivate(entry));
  const strangers = needs ? needs.keyIds.filter((id) => !addressed.some((entry) => entry.info.keyIds.includes(id))) : [];
  /** Saving re-encrypts the page the way it was locked. That is only safe when that way is the page's only lock. */
  const canEdit =
    open !== null &&
    needs !== null &&
    (open.lock.kind === "passphrase"
      ? needs.keyIds.length === 0
      : !needs.passphrase && needs.keyIds.length === 1 && strangers.length === 0);

  // ── Locking ──
  const lockPage = useCallback(() => {
    setOpen(null);
    setEditing(false);
    setText({ kind: "saved" });
    setPassphrase("");
    editorRef.current = null;
    typed.current = null;
  }, []);

  // ── Saving the text ──
  const saving = useRef<Promise<void> | null>(null);
  const dirty = useRef(false);
  /**
   * The text as last typed, taken at every change. The editor's document is a value that later typing does not
   * alter, so keeping the latest one costs nothing, and it is still here after the editor has been destroyed:
   * a save that starts once the page has been left has only this to go by.
   */
  const typed = useRef<{ toJSON(): unknown } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const saveText = useCallback(async (): Promise<void> => {
    // One save at a time. Whatever was typed while another was under way is saved after it, from what was typed.
    while (saving.current) await saving.current;
    let current = openRef.current;
    if (!current || !dirty.current) return;
    if (current.lock.kind === "key") {
      // Saving is a use of the key. One that was forgotten cannot check what it encrypts, so nothing is tried with it:
      // the page asks for the passphrase, and what was typed stays unsaved until then.
      const held = unlockedKey(current.lock.fingerprint);
      if (!held) {
        setText({ kind: "key-locked" });
        return;
      }
      if (held !== current.lock.unlocked) {
        current = { ...current, lock: { ...current.lock, unlocked: held } };
        openRef.current = current;
        setOpen(current);
      }
    }
    const { lock } = current;
    // Taken together, with nothing awaited in between: from here on, "not dirty" means exactly this text.
    const content = typed.current ? (typed.current.toJSON() as NoteDoc) : current.content;
    dirty.current = false;
    setText({ kind: "saving" });
    const run = (async () => {
      try {
        const engine = await getEngine();
        const sealed = await sealPage(engine, content, lock);
        const queue = saver.current;
        // The title's own save goes first, so that this one is made on top of it.
        queue?.flush();
        for (let waited = 0; queue && !queue.isClean() && queue.status().kind === "saving" && waited < 100; waited += 1) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const stored = encryptedNoteDoc(sealed);
        const { note: saved } = await saveNote(note.id, { content: stored, baseUpdatedAt: queue?.baseUpdatedAt() ?? note.updatedAt });
        queue?.rebase(saved.updatedAt);
        knownArmor.current = sealed.trim();
        client.setQueryData<NoteResponse>(noteKeys.detail(note.id), (data) =>
          data ? { note: { ...data.note, ...saved, content: stored } } : data,
        );
        if (openRef.current) openRef.current = { ...openRef.current, content };
        setOpen((before) => (before ? { ...before, content } : before));
        setText(dirty.current ? { kind: "unsaved" } : { kind: "saved" });
      } catch (failure) {
        dirty.current = true;
        setText({ kind: "error", message: errorMessage(failure) });
      } finally {
        saving.current = null;
      }
    })();
    saving.current = run;
    await run;
  }, [client, note.id, note.updatedAt, saver]);

  const onTextChange = useCallback(() => {
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed) typed.current = editor.state.doc;
    dirty.current = true;
    setText((before) => (before.kind === "saving" || before.kind === "key-locked" ? before : { kind: "unsaved" }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveText(), SAVE_DELAY_MS);
  }, [saveText]);

  const finishEditing = async () => {
    clearTimeout(timer.current);
    await saveText();
    if (!dirty.current) setEditing(false);
  };

  // Leaving the page with something unsaved: it is encrypted and saved on the way out, and the browser is asked to wait for a closing tab.
  const latestSave = useRef(saveText);
  latestSave.current = saveText;
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current || saving.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(timer.current);
      if (dirty.current || saving.current) {
        // The key is still needed to check what is saved, by a save under way as much as by one yet to start.
        // It is forgotten as soon as that is done.
        void latestSave.current().then(() => {
          if (dirty.current) toast.error("Your last changes to an encrypted page could not be saved before you left it.");
          typed.current = null;
          lockAll();
        });
      } else lockAll();
    };
  }, []);

  // Idle: the decrypted text and the passphrase are forgotten after five minutes without a key or a pointer.
  // Anything unsaved is saved first; if it cannot be, the page stays open with it.
  const isOpen = open !== null;
  useEffect(() => {
    if (!isOpen) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const onIdle = () => {
      if (!dirty.current && !saving.current) {
        lockPage();
        return;
      }
      const fired = idle;
      void latestSave.current().then(() => {
        // A key or a pointer in the meantime: the person is back, and the clock has started again.
        if (stopped || idle !== fired) return;
        if (dirty.current) arm();
        else lockPage();
      });
    };
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(onIdle, UNLOCK_IDLE_MS);
      // Use of the page is use of the key it was opened with: the key's own five minutes start again with the page's.
      // The page's clock is set first, so that it runs out first and can still save with the key.
      const lock = openRef.current?.lock;
      if (lock?.kind === "key") keepUnlocked(lock.fingerprint);
    };
    arm();
    window.addEventListener("keydown", arm, true);
    window.addEventListener("pointerdown", arm, true);
    return () => {
      stopped = true;
      clearTimeout(idle);
      window.removeEventListener("keydown", arm, true);
      window.removeEventListener("pointerdown", arm, true);
    };
  }, [isOpen, lockPage]);

  // The page was encrypted again somewhere else: what is on this screen is no longer the page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to a new message arriving, not to the other values it reads
  useEffect(() => {
    if (armor === knownArmor.current) return;
    if (dirty.current || saving.current) return; // The next save reports the conflict.
    knownArmor.current = armor;
    if (openRef.current) {
      lockPage();
      toast("This page was changed on another device. Unlock it again to see the newer version.");
    }
  }, [armor]);

  // ── Opening ──
  const openWith = async (lock: PageLock, key: ShelfKey | null = null) => {
    setOpening(true);
    setOpenError(null);
    try {
      const engine = await getEngine();
      const page = await openPage(engine, armor, lock);
      knownArmor.current = armor;
      setPassphrase("");
      setOpen({ ...page, lock, key });
    } catch (failure) {
      setOpenError(errorMessage(failure));
    } finally {
      setOpening(false);
    }
  };

  const openWithPassphrase = (event: FormEvent) => {
    event.preventDefault();
    void openWith({ kind: "passphrase", passphrase });
  };

  const openWithKey = (entry: ShelfKey) => {
    const key = unlockedKey(entry.fingerprint);
    if (key) void openWith({ kind: "key", fingerprint: entry.fingerprint, publicKey: entry.publicKey, unlocked: key }, entry);
  };

  // ── Removing the encryption ──
  const removeEncryption = async () => {
    const current = openRef.current;
    if (!current) return;
    setRemoveBusy(true);
    try {
      clearTimeout(timer.current);
      const editor = editorRef.current;
      const content = editor && !editor.isDestroyed ? (editor.getJSON() as NoteDoc) : current.content;
      const queue = saver.current;
      queue?.flush();
      for (let waited = 0; queue && !queue.isClean() && queue.status().kind === "saving" && waited < 100; waited += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const { note: saved } = await saveNote(note.id, {
        content,
        baseUpdatedAt: queue?.baseUpdatedAt() ?? note.updatedAt,
        removeEncryption: true,
      });
      dirty.current = false;
      client.setQueryData<NoteResponse>(noteKeys.detail(note.id), (data) =>
        data ? { note: { ...data.note, ...saved, content, encrypted: false } } : data,
      );
      await refreshNotes(client);
      toast(`“${displayTitle(title)}” is no longer encrypted.`);
    } catch (failure) {
      toast.error(errorMessage(failure));
    } finally {
      setRemoveBusy(false);
      setRemoving(false);
    }
  };

  const onEditor = useCallback((editor: Editor | null) => {
    if (editor) editorRef.current = editor;
  }, []);
  const createSubPage = useCallback(
    (subTitle: string) => actions.create({ parentId: note.id, title: subTitle }, { open: false }),
    [actions, note.id],
  );
  const nothing = useCallback(() => {}, []);

  const textStatus =
    text.kind === "saving"
      ? "Encrypting and saving…"
      : text.kind === "unsaved"
        ? "Not saved yet"
        : text.kind === "error" || text.kind === "key-locked"
          ? "Not saved"
          : null;

  return (
    <article>
      <div className="sticky top-0 z-(--z-sticky) flex h-12 items-center gap-2 bg-page px-5 max-md:top-13 md:px-6">
        <Breadcrumbs note={note} />
        {textStatus ? (
          <p role="status" aria-live="polite" className="shrink-0 text-small text-ink-muted">
            {textStatus}
          </p>
        ) : (
          <SaveState status={status} />
        )}
        <div className="-mr-2 flex shrink-0 items-center">
          <Tooltip label={note.isFavorite ? "Remove from favourites" : "Add to favourites"}>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Favourite"
              aria-pressed={note.isFavorite}
              onClick={() => void actions.setFavorite(note, !note.isFavorite)}
              className={cn(note.isFavorite && "text-lamp hover:text-lamp")}
            >
              <Star fill={note.isFavorite ? "currentColor" : "none"} />
            </Button>
          </Tooltip>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Page actions">
                <Ellipsis />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <PageMenuItems
                page={note}
                isFavorite={note.isFavorite}
                actions={actions}
                onMove={() => setMoving(true)}
                openId={note.id}
                favourite={false}
              >
                {open ? (
                  <MenuItem onSelect={() => setRemoving(true)}>
                    <LockKeyholeOpen /> Remove encryption…
                  </MenuItem>
                ) : null}
              </PageMenuItems>
            </MenuContent>
          </Menu>
        </div>
      </div>

      {note.coverUrl ? <PageCover url={note.coverUrl} editable={false} uploading={false} onChange={nothing} onRemove={nothing} /> : null}

      <div className={`${column} ${note.coverUrl ? "pt-6" : "pt-6 md:pt-12"}`}>
        <div className="grid gap-3 empty:hidden [&:not(:empty)]:mb-6">
          {staleDraft ? (
            <Notice tone="warning" icon={<History />} title="An old draft of this page is kept in this tab, not encrypted">
              <p>
                It is from before the page was encrypted, and holds text that was never saved. It stays in this tab’s storage until it is
                discarded or the tab is closed.
              </p>
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  clearDraft(note.id);
                  setStaleDraft(false);
                }}
              >
                Discard the draft
              </Button>
            </Notice>
          ) : null}
          {status.kind === "conflict" || status.kind === "error" ? (
            <Notice tone="warning" icon={<TriangleAlert />} title="The title or tags could not be saved">
              {status.kind === "error" ? status.message : "They were changed somewhere else as well."} Reload the page to see what is
              stored.
            </Notice>
          ) : null}
          {text.kind === "error" ? (
            <Notice
              tone="danger"
              icon={<CircleAlert />}
              title="Your changes to the text have not been saved"
              action={
                <Button size="sm" className="shrink-0" onClick={() => void saveText()}>
                  Try again
                </Button>
              }
            >
              {text.message} They are still here on this screen, and nothing has been stored in their place.
            </Notice>
          ) : null}
          {text.kind === "key-locked" ? (
            <Notice tone="danger" icon={<CircleAlert />} title="Your changes to the text have not been saved">
              <p>
                The key this page was opened with has been locked again, and the page cannot be encrypted and checked without it. Your
                changes are still here on this screen, and nothing has been stored in their place.
              </p>
              {open?.key ? (
                <div className="mt-3 max-w-md">
                  <UnlockForm entry={open.key} submitLabel="Unlock and save" onUnlocked={() => void saveText()} />
                </div>
              ) : null}
            </Notice>
          ) : null}
        </div>

        <header>
          {note.icon ? <PageIcon icon={note.icon} className="mb-2 text-[2.5rem]" /> : null}
          <PageTitle
            value={title}
            editable
            onChange={(next) => {
              setTitle(next);
              saver.current?.touch("title");
            }}
            onEnter={() => editorRef.current?.commands.focus("start")}
            onBlur={flushPlain}
          />
          <TagEditor
            tags={tags}
            readOnly={false}
            onChange={(next) => {
              setTags(next);
              saver.current?.touch("tags");
            }}
            onBlur={flushPlain}
            className="mt-3"
          />
        </header>

        <div className="mt-7">
          {open ? (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-2 border-y border-border py-2.5">
                <p className="mr-auto flex items-center gap-1.5 text-small text-ink-muted">
                  <LockKeyholeOpen className="size-4" aria-hidden />
                  Decrypted on this device.{" "}
                  {editing ? "Changes are encrypted before they are saved." : `Locks after ${IDLE_MINUTES} idle minutes.`}
                </p>
                {editing ? (
                  <Button size="sm" variant="primary" loading={text.kind === "saving"} onClick={() => void finishEditing()}>
                    Done
                  </Button>
                ) : canEdit ? (
                  <Button size="sm" onClick={() => setEditing(true)}>
                    <Pencil /> Edit
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  disabled={text.kind === "saving"}
                  onClick={async () => {
                    clearTimeout(timer.current);
                    await saveText();
                    if (!dirty.current) lockPage();
                  }}
                >
                  <LockKeyhole /> Lock
                </Button>
              </div>
              {open.foreign ? (
                <Notice tone="info" title="This message was not written by Outpost" className="mb-5">
                  It is shown as plain text. {canEdit ? "If you edit it, it is saved in Outpost’s own form." : ""}
                </Notice>
              ) : null}
              {!canEdit ? (
                <p className="mb-5 text-small text-ink-muted">
                  This page can be read here but not edited: it has more than one lock (a passphrase and a key, or several keys), and saving
                  from here would keep only the one you used. Remove the encryption, then encrypt the page again.
                </p>
              ) : null}
              <NoteEditor
                key={editing ? "edit" : "view"}
                noteId={note.id}
                content={open.content}
                editable={editing}
                pictures={false}
                onChange={onTextChange}
                onBlur={nothing}
                onEditor={onEditor}
                createSubPage={createSubPage}
              />
            </>
          ) : (
            <div className="rounded-panel border border-border p-5 md:p-6" data-testid="encrypted-page-locked">
              <h2 className="flex items-center gap-2 text-lead font-semibold text-ink">
                <LockKeyhole className="size-5 text-ink-muted" aria-hidden /> This page is encrypted
              </h2>
              <p className="mt-1.5 max-w-[60ch] text-small text-ink-muted">
                Its text is stored on Outpost as an OpenPGP message. It is decrypted here, in this browser; the passphrase and the text are
                not sent anywhere.
              </p>
              <div className="mt-4 grid max-w-md gap-4">
                {!available ? (
                  <Notice tone="warning" icon={<TriangleAlert />} title="This needs HTTPS">
                    This page was opened over plain HTTP, where browsers do not allow the cryptography this needs. Turn HTTPS on under{" "}
                    <Link to="/settings#https" className="font-medium text-primary underline underline-offset-2">
                      Settings, HTTPS on your network
                    </Link>
                    , or open Outpost on the computer it runs on.
                  </Notice>
                ) : !needs && !openError ? (
                  <Skeleton className="h-10" />
                ) : (
                  <>
                    {needs?.passphrase ? (
                      <form onSubmit={openWithPassphrase} className="grid gap-2">
                        <Field label="Passphrase for this page">
                          {(ids) => (
                            <div className="flex flex-wrap gap-2">
                              <PassphraseInput
                                {...ids}
                                className="min-w-[12rem] flex-1"
                                value={passphrase}
                                onChange={(event) => setPassphrase(event.target.value)}
                                autoFocus
                              />
                              <Button type="submit" variant="primary" loading={opening} disabled={!passphrase}>
                                Unlock
                              </Button>
                            </div>
                          )}
                        </Field>
                      </form>
                    ) : null}
                    {needs && needs.keyIds.length > 0 ? (
                      myKey ? (
                        unlocked.has(myKey.fingerprint) ? (
                          <div>
                            <Button variant="primary" loading={opening} onClick={() => openWithKey(myKey)}>
                              <LockKeyholeOpen /> Open with {keyLabel(myKey.info)}’s key
                            </Button>
                          </div>
                        ) : (
                          <UnlockForm entry={myKey} submitLabel="Unlock" onUnlocked={() => openWithKey(myKey)} />
                        )
                      ) : shelf.isPending ? (
                        <Skeleton className="h-10" />
                      ) : (
                        <p className="text-small text-ink">
                          It is locked with{" "}
                          {addressed[0] ? `${keyLabel(addressed[0].info)}’s key` : `a key (ID ${needs.keyIds[0]?.toUpperCase()})`}, whose
                          private half is not on this device. Open it on the device that has that key, or import the private key under{" "}
                          <Link to="/encryption" className="text-primary underline underline-offset-2">
                            Encryption
                          </Link>
                          .
                        </p>
                      )
                    ) : null}
                    {openError ? (
                      <Notice tone="danger" icon={<CircleAlert />}>
                        {openError}
                      </Notice>
                    ) : null}
                  </>
                )}
              </div>
              <p className="mt-5 max-w-[60ch] text-small text-ink-muted">
                The title and tags above are not encrypted, and neither is the fact that this page is. Without the passphrase or key the
                text cannot be recovered by anyone, Outpost included.
              </p>
            </div>
          )}
        </div>

        <NoteFooter
          backlinks={note.backlinks}
          subPages={note.children}
          canAddSubPage
          onNewSubPage={() => void actions.create({ parentId: note.id })}
        />
      </div>

      {moving && tree.data ? <MoveDialog page={note} index={tree.data} onClose={() => setMoving(false)} /> : null}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove the encryption from this page?"
        description="The text will be stored on Outpost as plain text again: anyone on your network can read it, it is searchable, and it goes into backups and onto portable drives in the clear. You can encrypt it again afterwards, with a new passphrase if you like."
        confirmLabel="Remove encryption"
        loading={removeBusy}
        onConfirm={() => void removeEncryption()}
      />
    </article>
  );
}
