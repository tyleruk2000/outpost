/**
 * The Chat screen: a box to start a conversation in, and the conversations there are.
 *
 * A conversation does not exist until its first message is sent, so nothing empty is
 * ever left in the list. "Ask about this" on a document or a page of notes arrives here
 * with that item named above the box.
 */
import type { ChatConversationSummary } from "@outpost/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, PencilLine, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ErrorState, Notice, Page, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { plural, timeAgo } from "@/lib/utils";
import { chatApi, chatKeys, SETTINGS_MODEL, storeDetail, useChatModels, useChatStatus, useConversations } from "./chat-data";
import { Composer } from "./composer";
import { isMissing, ModelPicker } from "./model-picker";
import { ChatSetup } from "./setup";
import "./chat.css";
import { notify } from "@/lib/notify";
import { useDebounced } from "@/lib/use-debounced";

const ABOUT = /^(document|note):([0-9A-Za-z]{1,40})$/;

/** `?about=document:<id>` as "Ask about this" writes it. Anything else is no item at all. */
export function readAbout(value: string | null): { kind: "document" | "note"; id: string } | null {
  const match = ABOUT.exec(value ?? "");
  return match ? { kind: match[1] as "document" | "note", id: match[2]! } : null;
}

function Lamp() {
  return <span aria-hidden className="chat-lamp mr-1" />;
}

function RenameDialog({ conversation, onClose }: { conversation: ChatConversationSummary | null; onClose(): void }) {
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setTitle(conversation?.title ?? ""), [conversation]);
  const save = async () => {
    if (!conversation || !title.trim()) return;
    setSaving(true);
    try {
      storeDetail(client, await chatApi.update(conversation.id, { title: title.trim() }));
      onClose();
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={conversation !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title="Rename conversation" size="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <DialogBody>
            <Field label="Name">
              {(ids) => <Input {...ids} value={title} maxLength={200} autoFocus onChange={(event) => setTitle(event.target.value)} />}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!title.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConversationRow({
  conversation,
  onRename,
  onDelete,
}: {
  conversation: ChatConversationSummary;
  onRename(): void;
  onDelete(): void;
}) {
  const title = conversation.title || "New conversation";
  return (
    <li className="flex items-center gap-2">
      <Link to={`/chat/${conversation.id}`} className="group min-w-0 flex-1 py-3">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate font-title text-body text-ink decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline">
            {title}
          </span>
          <span className="tabular flex shrink-0 items-center gap-2 text-small text-ink-muted">
            {conversation.writing ? (
              <>
                <Lamp /> Writing a reply
              </>
            ) : (
              timeAgo(conversation.updatedAt)
            )}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-small text-ink-muted">
          {conversation.excerpt || (conversation.messageCount === 0 ? "Nothing said yet" : "")}
        </span>
      </Link>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${title}`} className="-mr-2 shrink-0">
            <Ellipsis />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={onRename}>
            <PencilLine /> Rename
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger onSelect={onDelete}>
            <Trash2 /> Delete conversation
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}

function Conversations() {
  const client = useQueryClient();
  const [typed, setTyped] = useState("");
  // The list is asked for once typing pauses, not at every key.
  const q = useDebounced(typed.trim(), 220);
  const list = useConversations(q);
  const [renaming, setRenaming] = useState<ChatConversationSummary | null>(null);
  const [deleting, setDeleting] = useState<ChatConversationSummary | null>(null);
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await chatApi.remove(deleting.id);
      client.removeQueries({ queryKey: chatKeys.detail(deleting.id) });
      await client.invalidateQueries({ queryKey: ["chat", "list"] });
      setDeleting(null);
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setRemoving(false);
    }
  };

  const conversations = list.data?.conversations ?? [];
  const searching = q.length > 0;
  // With nothing kept and nothing searched for, the box above is the whole of the screen.
  if (list.isSuccess && conversations.length === 0 && !searching) return null;

  return (
    <Section
      title="Conversations"
      className="mt-12"
      actions={
        conversations.length > 5 || searching ? (
          <div className="relative w-full sm:w-64">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              type="search"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Find by name"
              aria-label="Find a conversation by name"
              className="pl-8"
            />
          </div>
        ) : undefined
      }
    >
      {list.isPending ? (
        <div aria-busy className="divide-y divide-border border-y border-border">
          {[0, 1, 2].map((row) => (
            <div key={row} className="py-3.5">
              <Skeleton className="h-4" style={{ width: `${12 + row * 5}rem`, maxWidth: "100%" }} />
              <Skeleton className="mt-2 h-3.5 w-4/5" />
            </div>
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : conversations.length === 0 ? (
        <p className="border-y border-border py-4 text-ink-muted">
          No conversation has “{q}” in its name.{" "}
          <button type="button" onClick={() => setTyped("")} className="font-medium text-primary underline underline-offset-2">
            Show them all
          </button>
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border" aria-label="Conversations">
          {conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              onRename={() => setRenaming(conversation)}
              onDelete={() => setDeleting(conversation)}
            />
          ))}
        </ul>
      )}

      <RenameDialog conversation={renaming} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => (open ? undefined : setDeleting(null))}
        title={`Delete “${deleting?.title || "New conversation"}”?`}
        description={
          <>
            The conversation and its {plural(deleting?.messageCount ?? 0, "message")} are removed from this Outpost, on every device.
            {deleting?.writing ? " The reply being written is stopped." : ""} Notes you saved from it stay. This cannot be undone.
          </>
        }
        confirmLabel="Delete conversation"
        loading={removing}
        onConfirm={() => void remove()}
      />
    </Section>
  );
}

function NewConversation() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const about = readAbout(params.get("about"));
  // The link that led here names the item; an address typed or reloaded does not, so the item is asked for.
  const carried =
    typeof (location.state as { title?: unknown } | null)?.title === "string" ? (location.state as { title: string }).title : "";
  const item = useQuery({
    queryKey: ["chat", "about", about?.kind, about?.id],
    enabled: about !== null,
    retry: false,
    queryFn: async () =>
      about?.kind === "note"
        ? (await api.get<{ note: { title: string } }>(`/api/notes/${about.id}`)).note.title
        : (await api.get<{ document: { title: string } }>(`/api/documents/${about?.id}`)).document.title,
  });
  const aboutTitle = item.data ?? carried;
  const status = useChatStatus().data;
  const modelsQuery = useChatModels(status?.usable === true);
  const models = modelsQuery.data;

  const [draft, setDraft] = useState("");
  const [model, setModel] = useState("");
  const [useLibrary, setUseLibrary] = useState(false);
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const chosen = model || status?.defaultModel || "";
  const blocked = !chosen ? "Choose a model first" : status?.writingIn ? "The model is busy" : null;

  const start = async () => {
    const said = draft.trim();
    if (!said || sending) return;
    setSending(true);
    setRefusal(null);
    let created: string | undefined;
    try {
      const made = await chatApi.create({ model: model || undefined, useLibrary, about: about ?? undefined });
      created = made.conversation.id;
      storeDetail(client, await chatApi.send(created, said));
      navigate(`/chat/${created}`);
    } catch (error) {
      // The message was refused, so the conversation made for it holds nothing: take it away again.
      if (created) await chatApi.remove(created).catch(() => {});
      void client.invalidateQueries({ queryKey: chatKeys.all });
      setRefusal(errorMessage(error));
      setSending(false);
    }
  };

  return (
    <section aria-label="New conversation">
      <div className="mb-2 flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {about ? (
          <p className="flex min-w-0 items-center gap-1 text-small text-ink">
            <span className="min-w-0 truncate">
              About{" "}
              <Link
                to={about.kind === "note" ? `/notes/${about.id}` : `/library/documents/${about.id}`}
                className="font-title text-body underline decoration-border-strong decoration-1 underline-offset-[0.2em] hover:decoration-primary"
              >
                {aboutTitle || (about.kind === "note" ? "this page" : "this document")}
              </Link>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-md:size-11"
              aria-label="Not about this item after all"
              onClick={() => {
                params.delete("about");
                setParams(params, { replace: true });
              }}
            >
              <X />
            </Button>
          </p>
        ) : (
          <h2 className="text-small font-medium text-ink">New conversation</h2>
        )}
        <ModelPicker value={model} onChange={setModel} status={status} list={models} loading={modelsQuery.isFetching} className="-mr-2" />
      </div>
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => void start()}
        sending={sending}
        blocked={blocked}
        useLibrary={useLibrary}
        onUseLibrary={setUseLibrary}
        scope={
          about
            ? { kind: about.kind, title: aboutTitle, url: about.kind === "note" ? `/notes/${about.id}` : `/library/documents/${about.id}` }
            : null
        }
        autoFocus
        notice={
          refusal ? (
            <Notice tone="warning" title="Not sent">
              {refusal}
            </Notice>
          ) : about && item.isError ? (
            <Notice
              tone="warning"
              title={about.kind === "note" ? "That page is not in your notes" : "That document is not in your library"}
            >
              It may have been deleted. Close “About” above the box to have a conversation that is not about it.
            </Notice>
          ) : status?.writingIn ? (
            <Notice tone="info" title="The model is writing a reply in another conversation">
              It writes one at a time. Start this one when that reply has finished.{" "}
              <Link to={`/chat/${status.writingIn}`} className="font-medium underline underline-offset-2">
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
          ) : isMissing(chosen, models) ? (
            <Notice tone="warning" title="This model is not on the model server">
              <span className="font-mono text-[0.8125rem]">{chosen}</span> is not among its models. Choose another, above the box.
            </Notice>
          ) : null
        }
      />
    </section>
  );
}

export function ChatHome() {
  const status = useChatStatus();
  return (
    <Page width="reading">
      <PageHeader
        title="Chat"
        description={
          <>
            Conversations with a language model that runs on your own computer. They are kept on this Outpost, and there are no accounts, so
            anyone who can open it can read them.
          </>
        }
      />
      {status.isPending ? (
        <div aria-busy>
          <Skeleton className="h-28" />
          <Skeleton className="mt-3 h-4 w-3/4" />
        </div>
      ) : status.isError ? (
        <ErrorState error={status.error} onRetry={() => status.refetch()} />
      ) : status.data.usable ? (
        <NewConversation />
      ) : (
        <ChatSetup status={status.data} />
      )}
      <Conversations />
    </Page>
  );
}
