/**
 * What of a conversation is sent to the model, and what is not.
 *
 * A small model reads a few thousand tokens at once, and some servers (Ollama) cut a
 * longer prompt down without saying so. So Outpost decides what goes, by one rule a
 * person can be told:
 *
 *   The newest message is always sent whole. Then come the most recent earlier
 *   exchanges that still fit in the budget; older ones are left out, whole exchanges
 *   at a time, oldest first.
 *
 * Nothing is summarised: a summary would be a second request to the model that nobody
 * asked for, and a small model's summary of a conversation is not the conversation.
 * The screen draws a line where the messages that are still sent begin.
 */

/** A message as this file needs it. */
export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface PlannedHistory {
  /** The earlier messages to send, oldest first: the person and the model in turn, ending with the model. */
  sent: Turn[];
  /**
   * What the person said after the last reply the model wrote, which went unanswered
   * (the reply failed, or the library held nothing). It is sent as the opening of the
   * newest message, since a model expects the two sides to take turns.
   */
  unanswered: string;
  /** How many earlier messages are left out. */
  omitted: number;
  /** The oldest message that is sent, when any is left out. */
  sentFrom: string | null;
}

/** The standing instructions of a plain conversation: no library, and the model is told so. */
export const PLAIN_SYSTEM = [
  "You are a language model running on the person's own computer, inside Outpost, an offline library.",
  "You are having a plain conversation: you cannot search the internet, open files or read the person's library, and nothing from it has been given to you.",
  "Answer from what you know. If you do not know, or are not sure, say so plainly instead of guessing.",
  "Use Markdown where it helps: lists, tables, and fenced code blocks for code.",
].join(" ");

/**
 * Earlier messages grouped into exchanges: a person's message and the reply to it. A
 * reply the model never wrote (it failed, or the library held nothing) has no text and
 * is not sent; the question it would have answered still is.
 */
function exchanges(earlier: readonly Turn[]): Turn[][] {
  const groups: Turn[][] = [];
  for (const turn of earlier) {
    if (!turn.text.trim()) continue;
    const last = groups.at(-1);
    // Two messages from the person in a row (the first went unanswered) are one exchange,
    // so that what is sent always alternates the way chat models expect.
    if (turn.role === "user" && last && last.every((entry) => entry.role === "user")) last.push(turn);
    else if (turn.role === "user" || !last) groups.push([turn]);
    else last.push(turn);
  }
  return groups;
}

/**
 * Chooses which earlier messages go with the next question. `budgetChars` is what is
 * left for them once the newest message, the instructions and any passages are counted.
 */
export function planHistory(earlier: readonly Turn[], budgetChars: number): PlannedHistory {
  const groups = exchanges(earlier);
  const kept: Turn[][] = [];
  let used = 0;
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]!;
    const size = group.reduce((sum, turn) => sum + turn.text.length, 0);
    // The first exchange that does not fit ends it: what is sent is always one unbroken run of the newest messages.
    if (used + size > budgetChars) break;
    kept.unshift(group);
    used += size;
  }
  const sent = mergeSameRole(kept.flat());
  const unanswered = sent.at(-1)?.role === "user" ? (sent.pop()?.text ?? "") : "";
  const sentCount = kept.reduce((sum, group) => sum + group.length, 0);
  const counted = groups.reduce((sum, group) => sum + group.length, 0);
  const omitted = counted - sentCount;
  return { sent, unanswered, omitted, sentFrom: omitted > 0 ? (kept[0]?.[0]?.id ?? null) : null };
}

/** Two messages in a row from the same side become one, since chat models are trained on strict turns. */
function mergeSameRole(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const turn of turns) {
    const last = out.at(-1);
    if (last && last.role === turn.role) out[out.length - 1] = { ...last, text: `${last.text}\n\n${turn.text}` };
    else out.push({ ...turn });
  }
  // A conversation as sent starts with the person.
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

/** A title from the first message: its first line, cut at a word, without the punctuation that ends it. */
export function titleFrom(text: string, most = 60): string {
  const line =
    text
      .split("\n")
      .map((part) => part.trim())
      .find(Boolean) ?? "";
  const plain = line
    .replace(/^[#>*\-\s]+/, "")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // A question keeps its question mark: it is what the conversation is.
  if (plain.length <= most) return plain.replace(/[.!:;,]+$/, "") || "New conversation";
  const cut = plain.slice(0, most + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > most * 0.5 ? cut.slice(0, space) : cut.slice(0, most)).replace(/[.?!:;,]+$/, "")}…`;
}

/** The start of a message as plain words, for a list. */
export function excerptOf(text: string, most = 140): string {
  const plain = text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/[#>*_`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > most ? `${plain.slice(0, most).trimEnd()}…` : plain;
}
