/**
 * Chat's data: what is asked of the server, and the reply that is being written.
 *
 * Conversations live on the server. The browser holds a copy for the screen and one
 * piece of state of its own: the reply that is being written right now, which arrives
 * as a stream of small changes and is laid over the stored conversation until the
 * server says it is done.
 */
import type {
  AnswerSource,
  ChatConversationDetail,
  ChatConversationSummary,
  ChatLookResult,
  ChatMessage,
  ChatModelsResponse,
  ChatPhase,
  ChatStatus,
  ChatStreamEvent,
  MarkdownBlock,
  ModelSetupLook,
  ModelSetupTry,
} from "@outpost/shared";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePageShown } from "./use-page-shown";

export const chatKeys = {
  all: ["chat"] as const,
  status: ["chat", "status"] as const,
  // Under "answers", not "chat": the model server is asked for its list when the screen opens or the
  // setting changes, not every time a conversation does.
  models: ["answers", "chat-models"] as const,
  list: (q: string) => ["chat", "list", q] as const,
  detail: (id: string) => ["chat", "conversation", id] as const,
};

export const SETTINGS_MODEL = "/settings#answers-title";

export const useChatStatus = () =>
  useQuery({ queryKey: chatKeys.status, queryFn: () => api.get<ChatStatus>("/api/chat/status"), staleTime: 15_000 });

/** The model server's own list. Asked for only once chat can be used; the request carries nothing. */
export const useChatModels = (enabled: boolean) =>
  useQuery({
    queryKey: chatKeys.models,
    queryFn: () => api.get<ChatModelsResponse>("/api/chat/models"),
    enabled,
    staleTime: 60_000,
  });

export const useConversations = (q: string) =>
  useQuery({
    queryKey: chatKeys.list(q),
    // A list asked for while the name was still being typed is not wanted any more: its request is dropped.
    queryFn: ({ signal }) => api.get<{ conversations: ChatConversationSummary[] }>("/api/chat/conversations", { q }, signal),
    placeholderData: (previous) => previous,
  });

export const useConversation = (id: string) =>
  useQuery({
    queryKey: chatKeys.detail(id),
    queryFn: () => api.get<ChatConversationDetail>(`/api/chat/conversations/${id}`),
    // A conversation shown from the cache is checked against the server straight away: another device may have added to it.
    staleTime: 0,
  });

export const chatApi = {
  create: (body: { model?: string; useLibrary?: boolean; about?: { kind: "document" | "note"; id: string } }) =>
    api.post<ChatConversationDetail>("/api/chat/conversations", body),
  update: (id: string, patch: { title?: string; model?: string; useLibrary?: boolean }) =>
    api.patch<ChatConversationDetail>(`/api/chat/conversations/${id}`, patch),
  remove: (id: string) => api.delete<{ ok: true }>(`/api/chat/conversations/${id}`),
  send: (id: string, text: string, replaceLast = false) =>
    api.post<ChatConversationDetail>(`/api/chat/conversations/${id}/messages`, { text, replaceLast }),
  regenerate: (id: string) => api.post<ChatConversationDetail>(`/api/chat/conversations/${id}/regenerate`),
  stop: (id: string) => api.post<ChatConversationDetail>(`/api/chat/conversations/${id}/stop`),
  saveAsNote: (messageId: string) => api.post<{ noteId: string; title: string }>(`/api/chat/messages/${messageId}/note`),
  lookForOllama: () => api.post<ChatLookResult>("/api/chat/look-for-ollama"),
  /** Setting up, step one: finds the model server and says which of its models to start with. Saves nothing. */
  setupLook: () => api.post<ModelSetupLook>("/api/chat/setup/look"),
  /** Setting up, the last step: asks the model for one word; when it answers, the server saves the set-up and switches answers on. */
  setupTry: (address: string, model: string) => api.post<ModelSetupTry>("/api/chat/setup/try", { address, model }),
};

/** Puts a conversation the server just sent into the cache, and lets the lists catch up. */
export function storeDetail(client: QueryClient, detail: ChatConversationDetail): void {
  client.setQueryData(chatKeys.detail(detail.conversation.id), detail);
  void client.invalidateQueries({ queryKey: ["chat", "list"] });
  void client.invalidateQueries({ queryKey: chatKeys.status });
}

// ── The reply being written ────────────────────────────────────────────────

export interface LiveReply {
  messageId: string;
  phase: ChatPhase;
  model: string;
  grounded: boolean;
  sources: AnswerSource[];
  searchedFor: string | null;
  blocks: MarkdownBlock[];
  /** When this browser first saw the reply being written, by its own clock. */
  since: number;
}

/** Applies one event from the stream to the reply as this browser holds it. */
export function applyStreamEvent(live: LiveReply | null, event: ChatStreamEvent, now = Date.now()): LiveReply | null {
  switch (event.type) {
    case "start":
      return {
        messageId: event.messageId,
        phase: event.phase,
        model: event.model,
        grounded: event.grounded,
        sources: event.sources,
        searchedFor: event.searchedFor,
        blocks: [],
        // The server's clock and this one may disagree; the wait is counted from whichever started later.
        since: Math.min(now, Math.max(event.startedAt, now - 10 * 60_000)),
      };
    case "phase":
      return live
        ? { ...live, phase: event.phase, sources: event.sources ?? live.sources, searchedFor: event.searchedFor ?? live.searchedFor }
        : live;
    case "blocks":
      return live ? { ...live, phase: "writing", blocks: [...live.blocks.slice(0, event.from), ...event.blocks] } : live;
    default:
      return null;
  }
}

/** Reads a stream of server-sent events, calling `onEvent` for each as it arrives. */
export async function readChatEvents(body: ReadableStream<Uint8Array>, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  const flush = (block: string) => {
    let type = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!type) return;
    try {
      onEvent({ type, ...(data ? (JSON.parse(data) as object) : {}) } as ChatStreamEvent);
    } catch {
      // A damaged event is skipped; the stored conversation is the truth and is read again when the stream ends.
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    rest = (rest + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
    let gap = rest.indexOf("\n\n");
    while (gap !== -1) {
      flush(rest.slice(0, gap));
      rest = rest.slice(gap + 2);
      gap = rest.indexOf("\n\n");
    }
  }
  if (rest.trim()) flush(rest);
}

/** Replaces one message of a cached conversation with the version the server stored. */
function settle(client: QueryClient, id: string, message: ChatMessage): void {
  client.setQueryData<ChatConversationDetail>(chatKeys.detail(id), (current) =>
    current ? { ...current, messages: current.messages.map((entry) => (entry.id === message.id ? message : entry)) } : current,
  );
}

/**
 * Watches the reply being written in a conversation, while there is one. The reply
 * belongs to the server: leaving this screen, or losing the connection, does not stop
 * it, and coming back picks it up where it now stands. So while the page is hidden
 * (a background tab, a locked phone) nothing is watched at all, and showing it again
 * asks for the reply as it then stands.
 */
export function useLiveReply(id: string, writing: boolean): LiveReply | null {
  const client = useQueryClient();
  const [live, setLive] = useState<LiveReply | null>(null);
  const shown = usePageShown();
  const watching = writing && shown;

  useEffect(() => {
    if (!writing) {
      setLive(null);
      return;
    }
    if (!watching) return;
    const controller = new AbortController();
    let stopped = false;
    void (async () => {
      // A dropped connection (a phone that slept, a server restarting) is tried again, more slowly each time.
      for (let attempt = 0; !stopped; attempt += 1) {
        let finished = false;
        try {
          const response = await fetch(`/api/chat/conversations/${id}/stream`, {
            headers: { Accept: "text/event-stream" },
            signal: controller.signal,
            credentials: "same-origin",
          });
          if (response.ok && response.body) {
            await readChatEvents(response.body, (event) => {
              if (stopped) return;
              if (event.type === "done") {
                finished = true;
                settle(client, id, event.message);
              } else if (event.type === "idle") {
                finished = true;
              }
              setLive((current) => applyStreamEvent(current, event));
            });
          }
        } catch {
          // Aborted, or the connection failed: decided below.
        }
        if (stopped) return;
        if (finished) {
          // The stored conversation is the truth: the line where sent messages begin may have moved, and the lists have changed.
          void client.invalidateQueries({ queryKey: chatKeys.all });
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, Math.min(8000, 600 * 2 ** attempt)));
        if (stopped) return;
        // Find out whether it is still being written before watching again.
        await client.invalidateQueries({ queryKey: chatKeys.detail(id) });
      }
    })();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [client, id, writing, watching]);

  return writing ? live : null;
}

/** Seconds since `since`, counted while `running` and the page can be seen. For a wait that must not look frozen. */
export function useElapsedSeconds(since: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  const shown = usePageShown();
  const counting = running && shown;
  useEffect(() => {
    if (!counting) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [counting]);
  return since === null ? 0 : Math.max(0, Math.round((now - since) / 1000));
}
