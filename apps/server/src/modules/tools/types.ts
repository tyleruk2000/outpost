/**
 * What a tool is: a name, words a small model can act on, an input schema, the area of
 * the household's data it reads, and a function that answers from Outpost's own services.
 *
 * The rules every tool keeps (tested for the whole registry in test/tools-readonly.test.ts):
 *
 *  - It reads. It never creates, changes or removes anything, never queues a job, never
 *    starts a download, and never asks anything on the internet or the home network,
 *    except that a library search sends its words to the embedding server search by
 *    meaning uses, when one is set up, as every search does.
 *  - It answers from the service that already answers the same question for a screen.
 *    No calculation is written a second time here.
 *  - Its answer is short, plainly labelled text: what it is, where it came from and how
 *    old it is. A model's context is small, so a list is paged and says when there is more.
 *  - When the thing asked about is not held, it says so, and says where in Outpost it
 *    could be got, so that the model can pass that on instead of guessing.
 */
import type { ToolArea } from "@outpost/shared";
import type { z } from "zod";
import type { AppContext } from "../../core/context.ts";

export interface ToolRun {
  ctx: AppContext;
  /** Fires when whoever asked has gone (Stop in Chat, a closed connection). */
  signal: AbortSignal;
  /** Milliseconds since 1970, fixed for the call, so that "how old" is said consistently. */
  now: number;
}

export interface ToolAnswer {
  /** What the model is sent. Plain lines, labelled; bounded by the service (MAX_ANSWER_CHARS). */
  text: string;
  /**
   * A few words for "Looked at", after the tool's title: where it came from and how old
   * ("Food and supplies, fetched 12 Nov"). Optional.
   */
  label?: string;
  /** In-app route of the screen the answer came from, built here, never by the model. */
  url?: string;
  /** False when nothing was held for what was asked: the text then says so and where to get it. */
  held: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: each tool's own schema types its own arguments
export interface ToolDefinition<Input extends z.ZodObject<any> = z.ZodObject<any>> {
  /** Letters, digits and underscores only, as every model server and MCP accept: `find_places`. */
  name: string;
  /** As a person reads it in "Looked at", lower case: "places on the map". */
  title: string;
  area: ToolArea;
  /** Two or three plain sentences: what it answers, and when to use it rather than another tool. */
  description: string;
  /** Arguments, each `.describe()`d. The JSON Schema the model is sent is made from this. */
  input: Input;
  run(args: z.infer<Input>, run: ToolRun): Promise<ToolAnswer> | ToolAnswer;
}

/** The most characters of one tool's answer sent to a model: about 750 tokens. */
export const MAX_ANSWER_CHARS = 3000;
/** Items in one page of a list. */
export const PAGE_SIZE = 10;

/** "12 Nov 2026", in UK English. */
export const dayOf = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** How long ago, in words: "3 hours ago", "2 days ago". */
export function ageOf(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 120) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * One page of a list, with the line that says whether there is more:
 * "Showing 1 to 10 of 34. Ask again with page 2 for the next ten."
 */
export function pageOf<T>(items: readonly T[], page: number, size = PAGE_SIZE): { shown: T[]; line: string } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const at = Math.min(Math.max(1, Math.floor(page)), pages);
  const shown = items.slice((at - 1) * size, at * size);
  if (items.length <= size) return { shown, line: items.length === 0 ? "" : `${items.length} in all.` };
  const first = (at - 1) * size + 1;
  const last = first + shown.length - 1;
  return {
    shown,
    line:
      at < pages
        ? `Showing ${first} to ${last} of ${items.length}. Ask again with page ${at + 1} for more.`
        : `Showing ${first} to ${last} of ${items.length}; that is the last page.`,
  };
}

/** A tool, with its arguments typed from its own schema. */
// biome-ignore lint/suspicious/noExplicitAny: see ToolDefinition
export function defineTool<Input extends z.ZodObject<any>>(tool: ToolDefinition<Input>): ToolDefinition {
  return tool as unknown as ToolDefinition;
}
