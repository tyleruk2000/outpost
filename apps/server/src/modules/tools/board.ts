/**
 * The household board: its messages and check-ins, newest first, with who wrote them and
 * when, from the board's own service (`ctx.services.board`). Only the words are given:
 * a sent file is mentioned, never named or read, and nothing a radio transport keeps
 * with a message is passed on. The area is off until a person turns it on.
 */
import { BOARD_LIMITS, type BoardMessage } from "@outpost/shared";
import { z } from "zod";
import { ageOf, dayOf, defineTool, pageOf, type ToolDefinition } from "./types.ts";

/** The household's own channel, as the Messages screen shows it. */
const CHANNEL = "board";
/** Messages read for paging: the newest this many. */
const READ = 100;

const STATUS = { safe: "safe", help: "needs help", other: "other" } as const;

function lineOf(message: BoardMessage, now: number): string {
  const when = `${dayOf(message.createdAt)}, ${new Date(message.createdAt).toISOString().slice(11, 16)} UTC (${ageOf(message.createdAt, now)})`;
  const words = message.body.replace(/\s+/g, " ").trim().slice(0, 300);
  const file = message.file ? " (sent a file)" : "";
  if (message.kind === "checkin") {
    const status = message.status ? STATUS[message.status] : "checked in";
    return `- ${when}, ${message.author} checked in: ${status}${message.place ? `, at ${message.place}` : ""}${words ? `. "${words}"` : ""}${file}`;
  }
  return `- ${when}, ${message.author}: ${words ? `"${words}"` : "(no words)"}${file}${message.edited ? " (edited)" : ""}`;
}

export const boardMessages = defineTool({
  name: "board_messages",
  title: "messages on the board",
  area: "board",
  description: "The household board's messages and check-ins (\"I'm safe, gone to Mum's\"), newest first, with who wrote each and when.",
  input: z.object({
    page: z.number().int().min(1).max(10).optional().describe("Which page, from 1: newest first."),
  }),
  run({ page }, { ctx, now }) {
    const read = ctx.services.board.list({ channel: CHANNEL, limit: Math.min(READ, 200) });
    const messages = read.messages.filter((message) => !message.removed).reverse();
    if (messages.length === 0)
      return { held: false, url: "/messages", text: "No messages are on the household board. Messages are written under Messages." };
    const { shown, line } = pageOf(messages, page ?? 1);
    const latest = ctx.services.board
      .summary()
      .checkIns.filter((entry) => entry.latest)
      .map((entry) => `${entry.name}: ${STATUS[entry.latest!.status]} (${ageOf(entry.latest!.createdAt, now)})`);
    const atStart = (page ?? 1) === 1;
    return {
      held: true,
      label: `newest ${dayOf(messages[0]!.createdAt)}`,
      url: "/messages",
      text: [
        atStart && latest.length > 0 ? `Latest check-ins: ${latest.join("; ")}.` : null,
        "Messages on the household board, newest first:",
        ...shown.map((message) => lineOf(message, now)),
        line,
        read.older && messages.length >= READ
          ? `Only the newest ${READ} are read here (the board keeps pages of ${BOARD_LIMITS.page}).`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
});

export const BOARD_TOOLS: ToolDefinition[] = [boardMessages];
