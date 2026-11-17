/**
 * One conversation, open for reading and for saying the next thing.
 *
 * The screen is as tall as the window: the conversation scrolls in the middle and the
 * message box stays at the foot, above a phone's keyboard when one is up. While a reply
 * is written the newest words are kept in view, unless the person has scrolled up to
 * read, in which case nothing moves and a button offers the way back down.
 */
import type { ChatConversationDetail, ChatMessage } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ChevronLeft, Ellipsis, PencilLine, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/misc";
import { placeWords } from "@/features/search/answer-text";
import { ApiError, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn, formatDate, plural } from "@/lib/utils";
import { chatApi, chatKeys, SETTINGS_MODEL, storeDetail, useChatModels, useChatStatus, useConversation, useLiveReply } from "./chat-data";
import { Composer, type ComposerHandle } from "./composer";
import { createEndFollower } from "./follow-end";
import { isMissing, ModelPicker, modelFacts } from "./model-picker";
import { Transcript, type TranscriptActions, TURN } from "./transcript";
import { useKeyboardInset } from "./use-keyboard-inset";

/** The column a conversation is set in: a margin for who is speaking, and the text. */
const COLUMN = "mx-auto w-full max-w-[60rem] px-5 md:px-10";

const draftKey = (id: string) => `outpost.chat.draft.${id}`;
function readDraft(id: string): string {
  try {
    return sessionStorage.getItem(draftKey(id)) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(id: string, text: string): void {
  try {
    if (text) sessionStorage.setItem(draftKey(id), text);
    else sessionStorage.removeItem(draftKey(id));
  } catch {
    // Storage can be unavailable; the draft then lasts while this screen is open.
  }
}

function ConversationSkeleton() {
  return (
    <div aria-busy className={cn(COLUMN, "pt-16")}>
      <Skeleton className="h-9 w-3/5" />
      <Skeleton className="mt-3 h-4 w-72 max-w-full" />
      <div className="mt-10 grid gap-3.5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

/** The conversation's name, editable where it stands. Saved when the field is left, or on Enter. A long name wraps. */
function Title({
  value,
  onRename,
  inputRef,
}: {
  value: string;
  onRename(title: string): void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again whenever the name changes
  useLayoutEffect(() => {
    const area = inputRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [draft, inputRef]);
  const commit = () => {
    const next = draft.replace(/\s+/g, " ").trim();
    if (next && next !== value) onRename(next);
    else setDraft(value);
  };
  return (
    <h1 className="min-w-0">
      <textarea
        ref={inputRef}
        rows={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            const area = event.currentTarget;
            setDraft(value);
            window.setTimeout(() => area.blur(), 0);
          }
        }}
        maxLength={200}
        aria-label="Name of this conversation"
        className="-mx-1.5 block w-[calc(100%+0.75rem)] resize-none overflow-hidden rounded-control bg-transparent px-1.5 font-title text-title text-ink max-md:min-h-11 max-md:py-1 outline-none hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-focus/40"
      />
    </h1>
  );
}

export function ConversationScreen({ id }: { id: string }) {
  const query = useConversation(id);
  if (query.isPending) {
    return (
      <Frame>
        <ConversationSkeleton />
      </Frame>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <Page width="reading">
          <h1 className="font-title text-title text-ink">This conversation does not exist</h1>
          <p className="mt-2 text-ink-muted">It may have been deleted, here or on another device, or the link may be wrong.</p>
          <Button asChild variant="primary" className="mt-5">
            <Link to="/chat">Go to Chat</Link>
          </Button>
        </Page>
      );
    }
    return (
      <Page width="reading">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Page>
    );
  }
  return <Loaded detail={query.data} />;
}

/** As tall as the window, less the phone's bars; less the keyboard too when one is up. */
function Frame({ children }: { children: React.ReactNode }) {
  const keyboard = useKeyboardInset();
  return (
    <div
      className="flex h-[calc(100dvh-3.25rem)] flex-col pb-[calc(3.25rem+env(safe-area-inset-bottom))] md:h-dvh md:pb-0"
      // With the keyboard up, the bar at the foot of a phone is behind it: the box sits on the keyboard instead.
      style={keyboard > 0 ? { height: `calc(100dvh - 3.25rem - ${keyboard}px)`, paddingBottom: 0 } : undefined}
      data-testid="chat-frame"
    >
      {children}
    </div>
  );
}

function Loaded({ detail }: { detail: ChatConversationDetail }) {
  const { conversation, messages } = detail;
  const id = conversation.id;
  const client = useQueryClient();
  const navigate = useNavigate();
  const status = useChatStatus().data;
  const modelsQuery = useChatModels(status?.usable === true);
  const models = modelsQuery.data;

  const last = messages.at(-1);
  const writing = last?.role === "assistant" && last.state === "writing";
  const live = useLiveReply(id, writing);

  const [draft, setDraft] = useState(() => readDraft(id));
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const composer = useRef<ComposerHandle>(null);
  const titleInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => writeDraft(id, editing ? "" : draft), [id, draft, editing]);

  // ── Keeping the newest words in view, without taking the page from someone reading further up ──
  const scroller = useRef<HTMLDivElement>(null);
  const [follower] = useState(createEndFollower);
  const [away, setAway] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toEnd = useCallback(() => {
    if (scroller.current) follower.toEnd(scroller.current);
  }, [follower]);
  const follow = useCallback(() => {
    if (scroller.current) follower.follow(scroller.current);
  }, [follower]);
  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    const fromEnd = follower.scrolled(element);
    setAway(fromEnd > 240);
    setScrolled(element.scrollTop > 4);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs whenever what is on screen grows
  useLayoutEffect(() => {
    follow();
  }, [messages.length, live?.blocks, live?.phase, last?.state, follow]);
  // What is on screen also grows for reasons of its own (a face that loads late, a table that settles, the
  // box getting taller as it is typed in): the end is kept in view through those too.
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observed = [content.current, scroller.current].filter((element) => element !== null);
    if (observed.length === 0 || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(follow);
    for (const element of observed) observer.observe(element);
    return () => observer.disconnect();
  }, [follow]);

  const model = conversation.model || status?.defaultModel || "";
  const modelInfo = models?.models.find((entry) => entry.id === model || entry.id === `${model}:latest`);
  const facts = modelInfo ? modelFacts(modelInfo) : "";
  const elsewhere = status?.writingIn && status.writingIn !== id ? status.writingIn : null;
  const blocked = !status
    ? null
    : !status.usable
      ? "The model server is not set up"
      : !model
        ? "Choose a model first"
        : elsewhere
          ? "The model is busy"
          : null;

  const apply = (next: ChatConversationDetail) => storeDetail(client, next);
  const fail = (error: unknown) => {
    setRefusal(errorMessage(error));
    void client.invalidateQueries({ queryKey: chatKeys.status });
  };

  async function send(text: string, replaceLast: boolean) {
    const said = text.trim();
    if (!said || sending) return;
    setSending(true);
    setRefusal(null);
    follower.pin();
    // Shown at once, as it will be stored; the server's version replaces it a moment later.
    const before = client.getQueryData<ChatConversationDetail>(chatKeys.detail(id));
    if (before) {
      const lastMine = before.messages.findLastIndex((entry) => entry.role === "user");
      const kept = replaceLast && lastMine >= 0 ? before.messages.slice(0, lastMine) : before.messages;
      const mine: ChatMessage = {
        id: "sending",
        role: "user",
        text: said,
        blocks: [],
        state: "complete",
        failure: null,
        notice: null,
        model: null,
        grounded: false,
        sources: [],
        searchedFor: null,
        declined: false,
        used: [],
        unsupported: [],
        repointed: [],
        citesAll: false,
        omitted: 0,
        tookMs: null,
        createdAt: Date.now(),
      };
      client.setQueryData<ChatConversationDetail>(chatKeys.detail(id), { ...before, messages: [...kept, mine] });
    }
    setDraft("");
    setEditing(false);
    // The next message can be typed while this one is answered.
    composer.current?.focus();
    try {
      apply(await chatApi.send(id, said, replaceLast));
    } catch (error) {
      // Nothing was changed on the server: put everything back, the typed words included.
      if (before) client.setQueryData(chatKeys.detail(id), before);
      setDraft(said);
      setEditing(replaceLast);
      fail(error);
    } finally {
      setSending(false);
    }
  }

  const run = async (work: () => Promise<ChatConversationDetail>) => {
    setRefusal(null);
    try {
      apply(await work());
    } catch (error) {
      fail(error);
    }
  };

  const actions: TranscriptActions = {
    regenerate: () => {
      follower.pin();
      void run(() => chatApi.regenerate(id));
    },
    edit: (message) => {
      setDraft(message.text);
      setEditing(true);
    },
    say: (text) => void send(text, false),
    askWithoutLibrary: () =>
      void run(async () => {
        await chatApi.update(id, { useLibrary: false });
        return chatApi.regenerate(id);
      }),
    saveAsNote: async (message) => {
      try {
        const saved = await chatApi.saveAsNote(message.id);
        void client.invalidateQueries({ queryKey: ["notes"] });
        toast.success("Saved as a new note", {
          description: saved.title,
          action: { label: "Open it", onClick: () => navigate(`/notes/${saved.noteId}`) },
        });
      } catch (error) {
        notify.error(errorMessage(error));
      }
    },
    chooseModel: () => setPickerOpen(true),
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await chatApi.remove(id);
      writeDraft(id, "");
      client.removeQueries({ queryKey: chatKeys.detail(id) });
      void client.invalidateQueries({ queryKey: ["chat", "list"] });
      navigate("/chat", { replace: true });
    } catch (error) {
      notify.error(errorMessage(error));
      setRemoving(false);
    }
  };

  const title = conversation.title || "New conversation";
  return (
    <Frame>
      <div
        data-scrolled={scrolled}
        className="flex h-12 shrink-0 items-center gap-1 border-b border-transparent pr-2 pl-3 transition-colors duration-150 data-[scrolled=true]:border-border max-md:h-13 md:pr-4 md:pl-5"
      >
        <nav aria-label="Where this conversation is" className="flex min-w-0 flex-1 items-center gap-1.5 text-small">
          <Link
            to="/chat"
            className="-ml-1 flex h-11 min-w-11 shrink-0 items-center gap-1 rounded-control px-1 text-ink-muted hover:text-ink md:h-8 md:min-w-0"
          >
            <ChevronLeft aria-hidden className="size-4 md:hidden" />
            Chat
          </Link>
          <span aria-hidden className="text-border-strong max-md:hidden">
            /
          </span>
          <span className="truncate text-ink max-md:hidden">{title}</span>
        </nav>
        <ModelPicker
          value={conversation.model}
          onChange={(next) => void run(() => chatApi.update(id, { model: next }))}
          status={status}
          list={models}
          loading={modelsQuery.isFetching}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
        />
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Conversation actions">
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              onSelect={() =>
                window.setTimeout(() => {
                  titleInput.current?.focus();
                  titleInput.current?.select();
                }, 0)
              }
            >
              <PencilLine /> Rename
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setDeleting(true)}>
              <Trash2 /> Delete conversation
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="scroll-quiet relative min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]"
      >
        <div ref={content} className={cn(COLUMN, "pt-6 pb-10 md:pt-10")}>
          <header className={cn(TURN, "mb-8 md:mb-10")}>
            <span aria-hidden className="max-md:hidden" />
            <div className="min-w-0">
              <Title value={title} onRename={(next) => void run(() => chatApi.update(id, { title: next }))} inputRef={titleInput} />
              <p className="mt-1.5 max-w-[68ch] text-small text-ink-muted">
                {model ? (
                  <>
                    With <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">{model}</span>, a language model{" "}
                    {placeWords(status?.place ?? null, status?.server ?? null)}
                    {facts ? ` (${facts})` : ""}.{" "}
                  </>
                ) : null}
                Started {formatDate(conversation.createdAt)}
                {messages.length > 0 ? `, ${plural(messages.length, "message")}` : ""}.
              </p>
            </div>
          </header>

          {messages.length === 0 ? (
            <div className={TURN}>
              <span aria-hidden className="max-md:hidden" />
              <p className="max-w-[60ch] text-ink-muted">Nothing has been said here yet. Write the first message below.</p>
            </div>
          ) : (
            <Transcript detail={detail} live={live} busy={writing || sending} actions={actions} />
          )}
        </div>
      </div>

      <div className="relative shrink-0 border-t border-border bg-page">
        {away ? (
          <div className="pointer-events-none absolute inset-x-0 -top-12 flex justify-center max-md:-top-14">
            <Button
              size="sm"
              className="pointer-events-auto shadow-float max-md:h-11"
              onClick={() => {
                follower.pin();
                setAway(false);
                toEnd();
              }}
            >
              <ArrowDown aria-hidden /> {writing ? "Newest words" : "Newest message"}
            </Button>
          </div>
        ) : null}
        <div className={cn(COLUMN, TURN, "pt-3 pb-3 md:pt-4 md:pb-5")}>
          <p aria-hidden className="pt-3 text-small font-medium text-ink-muted max-md:hidden">
            You
          </p>
          <Composer
            ref={composer}
            value={draft}
            onChange={setDraft}
            onSend={() => void send(draft, editing)}
            onStop={writing ? () => void run(() => chatApi.stop(id)) : undefined}
            sending={sending}
            blocked={blocked}
            useLibrary={conversation.useLibrary}
            onUseLibrary={(on) => void run(() => chatApi.update(id, { useLibrary: on }))}
            scope={conversation.scope}
            editing={editing}
            onCancelEdit={() => {
              setEditing(false);
              setDraft("");
            }}
            autoFocus
            notice={
              refusal ? (
                <Notice tone="warning" title="Not sent">
                  {refusal}
                </Notice>
              ) : status && !status.usable ? (
                <Notice tone="info" title="No model server is set up">
                  {status.reason}{" "}
                  <Link to="/chat" className="font-medium underline underline-offset-2">
                    Set one up
                  </Link>
                </Notice>
              ) : elsewhere ? (
                <Notice tone="info" title="The model is writing a reply in another conversation">
                  It writes one at a time. Send your message when that reply has finished.{" "}
                  <Link to={`/chat/${elsewhere}`} className="font-medium underline underline-offset-2">
                    Open that conversation
                  </Link>
                </Notice>
              ) : models?.message ? (
                <Notice tone="warning" title="The model server is not answering">
                  {models.message}{" "}
                  <button type="button" onClick={() => void modelsQuery.refetch()} className="font-medium underline underline-offset-2">
                    Look again
                  </button>
                  , or{" "}
                  <Link to={SETTINGS_MODEL} className="font-medium underline underline-offset-2">
                    open Settings
                  </Link>
                  .
                </Notice>
              ) : isMissing(model, models) && last?.failure !== "no-such-model" ? (
                <Notice tone="warning" title="This model is not on the model server">
                  <span className="font-mono text-[0.8125rem]">{model}</span> is not among its models.{" "}
                  <button type="button" onClick={() => setPickerOpen(true)} className="font-medium underline underline-offset-2">
                    Choose another model
                  </button>
                </Notice>
              ) : null
            }
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${title}”?`}
        description={
          <>
            The conversation and its {plural(messages.length, "message")} are removed from this Outpost, on every device.
            {writing ? " The reply being written is stopped." : ""} Notes you saved from it stay. This cannot be undone.
          </>
        }
        confirmLabel="Delete conversation"
        loading={removing}
        onConfirm={() => void remove()}
      />
    </Frame>
  );
}
