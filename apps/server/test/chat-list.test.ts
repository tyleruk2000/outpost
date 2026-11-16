/**
 * The list of conversations: the same answer as asking about each conversation in turn,
 * from a fixed number of questions to the database however long the list is.
 */
import type { ChatConversationSummary } from "@outpost/shared";
import { afterEach, describe, expect, it } from "vitest";
import { excerptOf } from "../src/modules/chat/context.ts";
import { createTestApp, type TestApp } from "./helpers.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** A few hundred conversations with nothing, one message, or many; some ending in a notice with no text. */
function fill(target: TestApp, conversations: number): void {
  const db = target.ctx.sqlite;
  const addConversation = db.prepare("INSERT INTO chat_conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)");
  const addMessage = db.prepare(
    "INSERT INTO chat_messages (id, conversation_id, seq, role, text, notice, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    for (let c = 0; c < conversations; c += 1) {
      const id = `conv${String(c).padStart(5, "0")}`;
      addConversation.run(id, c % 7 === 0 ? `Water ${c}` : `Talk ${c}`, 1_000 + c, 2_000 + ((c * 37) % conversations));
      const messages = c % 11 === 0 ? 0 : 1 + (c % 9);
      for (let m = 1; m <= messages; m += 1) {
        const last = m === messages;
        // The newest message of some conversations has no words of its own, only a notice.
        const text = last && c % 5 === 0 ? "" : `Message ${m} of conversation ${c}, which runs on for a while to be cut.`;
        const notice = last && c % 5 === 0 ? `Stopped before anything was written (${c}).` : null;
        addMessage.run(`${id}m${m}`, id, m, m % 2 === 1 ? "user" : "assistant", text, notice, 3_000 + m);
      }
    }
  })();
}

/** What the list said before: one question per conversation. Kept here as the reference. */
function reference(target: TestApp, q?: string): Array<Pick<ChatConversationSummary, "id" | "messageCount" | "excerpt">> {
  const db = target.ctx.sqlite;
  const rows = db
    .prepare(`SELECT id FROM chat_conversations ${q ? "WHERE title LIKE ? ESCAPE '\\'" : ""} ORDER BY updated_at DESC, id DESC LIMIT 500`)
    .all(...(q ? [`%${q}%`] : [])) as Array<{ id: string }>;
  const count = db.prepare("SELECT count(*) AS n, max(seq) AS last FROM chat_messages WHERE conversation_id = ?");
  const newest = db.prepare("SELECT text, notice FROM chat_messages WHERE conversation_id = ? AND seq = ?");
  return rows.map(({ id }) => {
    const { n, last } = count.get(id) as { n: number; last: number | null };
    const message = last === null ? undefined : (newest.get(id, last) as { text: string; notice: string | null });
    return { id, messageCount: n, excerpt: excerptOf(message?.text || message?.notice || "") };
  });
}

const listed = async (target: TestApp, q = "") =>
  ((await target.api("GET", `/api/chat/conversations${q ? `?q=${q}` : ""}`)).body.conversations as ChatConversationSummary[]).map(
    ({ id, messageCount, excerpt }) => ({ id, messageCount, excerpt }),
  );

describe("the list of conversations", () => {
  it("says the same as asking about each conversation, for hundreds of them, in a fixed number of questions", async () => {
    app = await createTestApp();
    expect(await listed(app)).toEqual([]);
    fill(app, 640);

    // Newest first, 500 at most; counts and the newest message's words as before.
    const all = await listed(app);
    expect(all).toHaveLength(500);
    expect(all).toEqual(reference(app));
    expect(all.some((entry) => entry.messageCount === 0 && entry.excerpt === "")).toBe(true);
    expect(all.some((entry) => entry.excerpt.startsWith("Stopped before anything was written"))).toBe(true);
    // And for a search by title.
    const found = await listed(app, "Water");
    expect(found.length).toBeGreaterThan(50);
    expect(found).toEqual(reference(app, "Water"));

    // However many conversations there are, the list asks the database three things.
    // Before, it asked once for each conversation: 454 questions for this list.
    const asked: string[] = [];
    const sqlite = app.ctx.sqlite;
    const prepare = sqlite.prepare.bind(sqlite);
    sqlite.prepare = ((source: string) => {
      if (/chat_(conversations|messages)/.test(source)) asked.push(source);
      return prepare(source);
    }) as typeof sqlite.prepare;
    try {
      await listed(app);
    } finally {
      sqlite.prepare = prepare as typeof sqlite.prepare;
    }
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.length).toBeLessThanOrEqual(3);
  });
});
