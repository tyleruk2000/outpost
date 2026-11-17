/**
 * Chat's side of the tools a model may call (modules/tools): whether a reply offers
 * them, and how what they answer is put to the model and kept with the reply.
 *
 * A reply offers tools when all of these hold, decided once at its start:
 *
 *  - "Let the model look things up in Outpost" is on in Settings (`tools.enabled`);
 *  - the model server says the model can call tools (Ollama lists "tools" among its
 *    capabilities; a server that says nothing is taken to mean it cannot);
 *  - a person has not turned them off for this model (`tools.offForModels`);
 *  - the conversation is not about one document or note, which is answered from that
 *    item alone;
 *  - at least one area of the household's data is switched on.
 *
 * Nothing is asked of the model server to decide this while the switch is off.
 *
 * Each answer goes to the model as a numbered source, carrying on from the library's
 * passages, so that the reply can cite it as it cites a passage; and it is kept in the
 * reply's `sources` as a source of kind `lookup`, so that the conversation, read again
 * later, shows what was looked at and what it said.
 */
import type { AnswerSource } from "@outpost/shared";
import { sameModelName } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import type { ModelServerAddress } from "../answers/address.ts";
import type { ToolCallResult } from "../tools/index.ts";
import type { ToolDefinition } from "../tools/types.ts";
import { toolAbility } from "./models.ts";

/** The most rounds of tool calls in one reply. Then the model is asked once more, with no tools, to answer from what it has. */
export const MAX_TOOL_ROUNDS = 4;
/** The most calls run in one round. More are answered, in words, that they were not run. */
export const MAX_CALLS_PER_ROUND = 3;
/**
 * The most characters of tool answers sent in one reply, all rounds together: two
 * full answers' worth (modules/tools/types.ts allows 3,000 to one). Counted in the turn
 * budget with the tools' own descriptions, so the prompt still fits what the model reads.
 */
export const TOOL_RESULTS_CHARS = 6000;

/** What is said to the model when it has used its rounds: the last request carries no tools. */
export const ANSWER_NOW =
  "(From Outpost, not from the person: you have looked up as much as you can for this message. Answer now from what you have, with the source numbers, and say what you could not find.)";

/** The tools a reply offers, or none. May ask the model server for its list; see the top of this file. */
export async function toolsForReply(
  ctx: AppContext,
  input: { model: string; scoped: boolean; address: ModelServerAddress | undefined },
): Promise<ToolDefinition[]> {
  const { settings, tools, answers } = ctx.services;
  if (!settings.get("tools.enabled") || input.scoped || !input.address) return [];
  if (settings.get("tools.offForModels").some((name) => sameModelName(name, input.model))) return [];
  const offered = tools.offered();
  if (offered.length === 0) return [];
  const address = input.address;
  const can = await toolAbility(address, input.model, () => answers.guard(address), answers.timeouts().probeMs);
  return can ? offered : [];
}

/** "places on the map, Food and supplies, fetched 12 Nov": what was looked at, as "Looked at" names it. */
export const lookedAt = (result: Pick<ToolCallResult, "title" | "label">) =>
  result.label ? `${result.title}, ${result.label}` : result.title;

/** A tool's answer as the model is sent it: under its source number, or marked as refused when it was. */
export function resultForModel(result: ToolCallResult, marker: number): string {
  if (!result.ok) return `Refused (not a source): ${result.text}`;
  return `Source [${marker}] (from Outpost: ${lookedAt(result)}):\n${result.text}`;
}

/** Cuts what is sent to the room that is left, saying so. */
export function within(text: string, room: number): string {
  if (text.length <= room) return text;
  if (room < 200) return "(Not sent: there is no more room for answers in this turn. Answer from what you have.)";
  return `${text.slice(0, room - 80).trimEnd()}\n(Cut short: there was no more room in this turn.)`;
}

/** Arguments as kept: whatever the model sent, but not without end. */
function kept(args: unknown): unknown {
  if (typeof args === "string") return args.slice(0, 500);
  const json = JSON.stringify(args ?? {});
  return json.length > 2000 ? json.slice(0, 500) : args;
}

/** One call kept with the reply. A refused one has marker 0: it is not a source, and nothing can cite it. */
export function lookupSource(result: ToolCallResult, marker: number, sent: string): AnswerSource {
  return {
    marker: result.ok ? marker : 0,
    kind: "lookup",
    entityId: result.tool?.name ?? "",
    // As "Looked at" lists it: "places on the map (Food and supplies, fetched 12 Nov)".
    title: result.label ? `${result.title} (${result.label})` : result.title,
    collection: null,
    url: result.url ?? "",
    page: null,
    heading: null,
    quote: sent,
    safetyCritical: false,
    lookup: { tool: result.name.slice(0, 120), arguments: kept(result.arguments), area: result.area, ok: result.ok },
  };
}

/** What makes two calls the same call: the tool and its arguments, as sent. */
export const callKey = (name: string, args: unknown) => `${name}\u0000${JSON.stringify(args ?? {})}`;

/**
 * Whether a reply is, or holds, a tool call or a tool's description written out as JSON
 * rather than made: `{"name": "weather", "parameters": {…}}`, `{"type":"function",…}`.
 * llama3.2:1b did both when tried (docs/ai.md, "Tried with a real model: tools").
 */
export function writesToolsAsText(text: string): boolean {
  return /\{\s*"(?:type"\s*:\s*"function|name"\s*:\s*"[a-z_]+"\s*,\s*"(?:parameters|arguments)"|function"\s*:\s*[{"])/.test(text);
}
