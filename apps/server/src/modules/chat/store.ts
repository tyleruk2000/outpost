/**
 * Conversations and their messages, as rows. Nothing here talks to a model.
 *
 * A reply is stored as the text the model wrote and nothing else. It is read into a
 * tree of plain values (see `replyBlocks`) each time it is sent to a browser, by the
 * same reader a Markdown document goes through, so the model's words can be shown with
 * their headings, lists, tables and code, and can never be markup.
 */
import type {
  AnswerFailure,
  AnswerSource,
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
  ChatReplyState,
  ChatScope,
  MarkdownBlock,
} from "@outpost/shared";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { AppContext } from "../../core/context.ts";
import { notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { chatConversations, chatMessages } from "../../db/schema.ts";
import { markdownBlocks } from "../documents/markdown-view.ts";
import { CITATION_MARKER } from "../retrieval/index.ts";
import { excerptOf } from "./context.ts";

type ConversationRow = typeof chatConversations.$inferSelect;
type MessageRow = typeof chatMessages.$inferSelect;

/**
 * A reply as a tree of plain values. A reply that opens with a line of dashes is not a
 * file with front matter, so it is kept from being read as one.
 */
export function replyBlocks(text: string): MarkdownBlock[] {
  if (!text.trim()) return [];
  try {
    const blocks = markdownBlocks(text.startsWith("---") ? `\n${text}` : text);
    // Raw HTML is reduced to its words, and a reply that is nothing else has none left: show what was typed.
    return blocks.length > 0 ? blocks : [{ t: "code", v: text.trim() }];
  } catch {
    // The reader does not fail on real text; if it ever does, the words are still shown.
    return [{ t: "paragraph", c: [{ t: "text", v: text }] }];
  }
}

/** The citation markers a reply uses, by the same rule as `checkCitations`, in order. */
function markersIn(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(CITATION_MARKER)) for (const number of match[1]?.split(/[,;]/) ?? []) found.add(Number(number));
  return [...found].sort((a, b) => a - b);
}

const routeOf = (kind: "document" | "note", id: string) => (kind === "note" ? `/notes/${id}` : `/library/documents/${id}`);

function scopeOf(row: ConversationRow): ChatScope | null {
  if (!row.scopeKind || !row.scopeEntityId) return null;
  return { kind: row.scopeKind, entityId: row.scopeEntityId, title: row.scopeTitle ?? "", url: routeOf(row.scopeKind, row.scopeEntityId) };
}

export function toConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    useLibrary: row.useLibrary,
    scope: scopeOf(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toMessage(row: MessageRow, blocks?: MarkdownBlock[]): ChatMessage {
  const sources = (row.sources ?? []) as AnswerSource[];
  const settled = row.state === "complete" || row.state === "cut-short";
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    blocks: row.role === "assistant" ? (blocks ?? replyBlocks(row.text)) : [],
    state: row.state as ChatReplyState,
    failure: (row.failure as AnswerFailure | null) ?? null,
    notice: row.notice,
    model: row.model,
    grounded: row.grounded,
    sources,
    searchedFor: row.searchedFor,
    // Markers are judged once the reply is whole; half a reply has not cited anything wrongly yet.
    unsupported: row.grounded && settled ? markersIn(row.text).filter((marker) => !sources.some((source) => source.marker === marker)) : [],
    omitted: row.omitted,
    tookMs: row.tookMs,
    createdAt: row.createdAt,
  };
}

export interface NewReply {
  model: string;
  grounded: boolean;
}

export function createChatStore(ctx: AppContext) {
  const { db } = ctx;

  function row(id: string): ConversationRow {
    const found = db.select().from(chatConversations).where(eq(chatConversations.id, id)).get();
    if (!found) throw notFound("That conversation");
    return found;
  }

  const rowsOf = (conversationId: string): MessageRow[] =>
    db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(asc(chatMessages.seq)).all();

  function nextSeq(conversationId: string): number {
    const last = db
      .select({ seq: sql<number>`coalesce(max(${chatMessages.seq}), 0)` })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .get();
    return (last?.seq ?? 0) + 1;
  }

  const touch = (id: string, patch: Partial<ConversationRow> = {}) =>
    db
      .update(chatConversations)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(chatConversations.id, id))
      .run();

  return {
    row,
    rowsOf,

    list(query: string | undefined, writingIn: string | null): ChatConversationSummary[] {
      const q = query?.trim();
      const rows = db
        .select()
        .from(chatConversations)
        // A title is searched for as typed: % and _ are letters here, not wildcards.
        .where(q ? sql`${chatConversations.title} LIKE ${`%${q.replace(/[\\%_]/g, "\\$&")}%`} ESCAPE '\\'` : undefined)
        .orderBy(desc(chatConversations.updatedAt), desc(chatConversations.id))
        .limit(500)
        .all();
      const counts = new Map(
        db
          .select({ id: chatMessages.conversationId, n: sql<number>`count(*)`, last: sql<number>`max(${chatMessages.seq})` })
          .from(chatMessages)
          .groupBy(chatMessages.conversationId)
          .all()
          .map((entry) => [entry.id, entry]),
      );
      return rows.map((entry) => {
        const count = counts.get(entry.id);
        const newest = count
          ? db
              .select({ text: chatMessages.text, notice: chatMessages.notice })
              .from(chatMessages)
              .where(and(eq(chatMessages.conversationId, entry.id), eq(chatMessages.seq, count.last)))
              .get()
          : undefined;
        return {
          ...toConversation(entry),
          messageCount: count?.n ?? 0,
          excerpt: excerptOf(newest?.text || newest?.notice || ""),
          writing: writingIn === entry.id,
        };
      });
    },

    create(input: { title?: string; model?: string; useLibrary?: boolean; scope?: Omit<ChatScope, "url"> }): ChatConversation {
      const now = Date.now();
      const title = input.title?.trim() ?? "";
      const created: ConversationRow = {
        id: newId(),
        title,
        titleSet: title.length > 0,
        model: input.model?.trim() ?? "",
        useLibrary: input.scope ? true : (input.useLibrary ?? false),
        scopeKind: input.scope?.kind ?? null,
        scopeEntityId: input.scope?.entityId ?? null,
        scopeTitle: input.scope?.title ?? null,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(chatConversations).values(created).run();
      return toConversation(created);
    },

    update(id: string, patch: { title?: string; model?: string; useLibrary?: boolean }): ChatConversation {
      const current = row(id);
      const next: Partial<ConversationRow> = {};
      if (patch.title !== undefined) {
        next.title = patch.title.trim();
        next.titleSet = next.title.length > 0;
      }
      if (patch.model !== undefined) next.model = patch.model.trim();
      // A conversation about one item is always answered from that item.
      if (patch.useLibrary !== undefined && !current.scopeKind) next.useLibrary = patch.useLibrary;
      // Renaming or choosing a model does not make a conversation newer, so its place in the list stays.
      if (Object.keys(next).length > 0) db.update(chatConversations).set(next).where(eq(chatConversations.id, id)).run();
      return toConversation(row(id));
    },

    remove(id: string): void {
      row(id);
      // The messages go with it (the table says so), in one step.
      db.delete(chatConversations).where(eq(chatConversations.id, id)).run();
    },

    /** Names a conversation after its first message, unless a person has named it. */
    nameIfUnnamed(id: string, title: string): void {
      const current = row(id);
      if (!current.titleSet && !current.title) touch(id, { title });
    },

    addUserMessage(conversationId: string, text: string): MessageRow {
      const message: MessageRow = {
        id: newId(),
        conversationId,
        seq: nextSeq(conversationId),
        role: "user",
        text,
        state: "complete",
        failure: null,
        notice: null,
        model: null,
        grounded: false,
        sources: null,
        searchedFor: null,
        omitted: 0,
        tookMs: null,
        createdAt: Date.now(),
      };
      db.insert(chatMessages).values(message).run();
      touch(conversationId);
      return message;
    },

    startReply(conversationId: string, reply: NewReply): MessageRow {
      const message: MessageRow = {
        id: newId(),
        conversationId,
        seq: nextSeq(conversationId),
        role: "assistant",
        text: "",
        state: "writing",
        failure: null,
        notice: null,
        model: reply.model,
        grounded: reply.grounded,
        sources: null,
        searchedFor: null,
        omitted: 0,
        tookMs: null,
        createdAt: Date.now(),
      };
      db.insert(chatMessages).values(message).run();
      touch(conversationId);
      return message;
    },

    patchReply(id: string, patch: Partial<Omit<MessageRow, "id" | "conversationId" | "seq" | "role">>): MessageRow {
      db.update(chatMessages).set(patch).where(eq(chatMessages.id, id)).run();
      const found = db.select().from(chatMessages).where(eq(chatMessages.id, id)).get();
      if (!found) throw notFound("That message");
      return found;
    },

    message(id: string): MessageRow {
      const found = db.select().from(chatMessages).where(eq(chatMessages.id, id)).get();
      if (!found) throw notFound("That message");
      return found;
    },

    /** Removes a message and everything after it in its conversation. */
    removeFrom(conversationId: string, seq: number): void {
      db.delete(chatMessages)
        .where(and(eq(chatMessages.conversationId, conversationId), gt(chatMessages.seq, seq - 1)))
        .run();
      touch(conversationId);
    },

    /**
     * Replies left as "being written" by a server that stopped: nothing is writing them
     * now. They keep what had been written and say what happened.
     */
    settleAbandoned(): number {
      return db
        .update(chatMessages)
        .set({
          state: "stopped",
          failure: "interrupted",
          notice: "Outpost was restarted while this reply was being written, so it stops here. Regenerate it to ask again.",
        })
        .where(eq(chatMessages.state, "writing"))
        .run().changes;
    },
  };
}

export type ChatStore = ReturnType<typeof createChatStore>;
