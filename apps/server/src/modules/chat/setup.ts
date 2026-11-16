/**
 * Setting up answers and chat in three steps, as Settings and the Chat screen offer it:
 * find the model server, choose one of its models, try it. When the try succeeds the
 * address and the model are saved and answers are switched on, so nobody has to know
 * that those are three settings.
 *
 * Nothing here contacts anything unless a person pressed a button, and every request
 * goes through the same rule as the rest (`modules/answers/address.ts`): a server on
 * this computer or a private network, unless a start-up option says otherwise.
 */
import type { ModelSetupLook, ModelSetupTry } from "@outpost/shared";
import { recommendModel } from "@outpost/shared";
import { messageOf } from "../../core/errors.ts";
import { type ModelServerAddress, parseModelServerAddress } from "../answers/address.ts";
import { type ModelTimeouts, openAiChatProvider } from "../answers/provider.ts";
import type { Settings } from "../settings/service.ts";
import { lookForOllama } from "./models.ts";

type Guard = (address: ModelServerAddress) => Promise<void>;

/**
 * The only places set-up looks, and so the only places it will try a model: the address
 * already in Settings first, because a person who typed one has said where their server
 * is, then the places Ollama listens by default. A request cannot add to them.
 */
export function placesToLook(endpoint: string, ollamaAddresses: readonly string[]): string[] {
  const addresses: string[] = [];
  try {
    addresses.push(parseModelServerAddress(endpoint).base);
  } catch {
    // An address that cannot be read is not asked; the usual places still are.
  }
  for (const candidate of ollamaAddresses) {
    const base = parseModelServerAddress(candidate).base;
    if (!addresses.includes(base)) addresses.push(base);
  }
  return addresses;
}

/** Step one: asks each of those places, in order, whether a model server is there. */
export async function lookForModelServer(
  settings: Pick<Settings, "answers.endpoint" | "answers.model">,
  timeouts: ModelTimeouts,
  guard: Guard,
  ollamaAddresses: readonly string[],
): Promise<ModelSetupLook> {
  const found = await lookForOllama(timeouts, guard, placesToLook(settings["answers.endpoint"], ollamaAddresses));
  return { ...found, recommended: found.found ? recommendModel(found.models, settings["answers.model"].trim()) : null };
}

/**
 * Step three. Asks the model at this address for one word, exactly as the test in
 * Settings does, without the address or the model having been saved first. `save` is
 * called only when the model answered.
 */
export async function tryModel(
  input: { address: string; model: string },
  /** The addresses step one looks at. Any other is refused: this is not a way to ask after hosts of the caller's choosing. */
  places: readonly string[],
  timeouts: ModelTimeouts,
  guard: Guard,
  busy: boolean,
  save: (settings: Pick<Settings, "answers.enabled" | "answers.endpoint" | "answers.model">) => void,
): Promise<ModelSetupTry> {
  const failed = (failure: ModelSetupTry["failure"], message: string): ModelSetupTry => ({
    ok: false,
    failure,
    message,
    models: [],
    reply: null,
    tookMs: 0,
    saved: false,
  });
  let address: ModelServerAddress;
  try {
    address = parseModelServerAddress(input.address);
    if (!places.includes(address.base)) {
      return failed(
        "address",
        `Outpost has not looked for a model server at ${address.host}. Enter that address in Settings, under More options, and look again.`,
      );
    }
    // An address that may not be contacted is an answer in itself; nothing is sent to find out more.
    await guard(address);
  } catch (error) {
    return failed("address", messageOf(error));
  }
  if (busy) return failed("other", "The model is writing something at the moment. Try it again when that has finished.");
  const result = await openAiChatProvider(address, input.model, timeouts, () => guard(address)).test();
  if (!result.ok) return { ...result, saved: false };
  save({ "answers.enabled": true, "answers.endpoint": address.base, "answers.model": input.model });
  return { ...result, saved: true };
}
