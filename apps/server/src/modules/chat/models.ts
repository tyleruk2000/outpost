/**
 * The models a person can choose between in a conversation.
 *
 * The list is the model server's own (`GET <address>/models`, the OpenAI-compatible
 * list every supported server has). That list carries names and nothing that helps
 * choose between them. Ollama also has a list of its own, `GET /api/tags` beside the
 * `/v1` address, which states each model's size on disk, its parameter count and how
 * it was compressed. When the address ends in `/v1` that list is asked for too, from
 * the same host and under the same rule as every other request, and what it says is
 * added to the names. A server that has no such list (llama.cpp, LM Studio) answers 404
 * and the names stand alone.
 *
 * The shape of `/api/tags` was read from Ollama's API documentation
 * (docs/api.md, "List Local Models") on 2026-11-16: `{"models":[{"name","model",
 * "modified_at","size","digest","details":{"parent_model","format","family",
 * "families","parameter_size","quantization_level"}}]}`. It has not been checked
 * against a running Ollama: none is installed where this was written.
 */
import type { ChatLookResult, ChatModel, ChatModelsResponse } from "@outpost/shared";
import { AppError } from "../../core/errors.ts";
import { type ModelServerAddress, parseModelServerAddress } from "../answers/address.ts";
import { type ModelTimeouts, openAiChatProvider } from "../answers/provider.ts";

/** Where Ollama listens unless it has been told otherwise. */
export const OLLAMA_DEFAULT_ADDRESSES = ["http://127.0.0.1:11434/v1", "http://host.docker.internal:11434/v1"] as const;

/** The most that is read of Ollama's list. A real one is a few hundred bytes a model. */
const MOST_BYTES = 512 * 1024;

const text = (value: unknown, most = 80): string | null => (typeof value === "string" && value.trim() ? value.trim().slice(0, most) : null);

/** Ollama's own list beside a `/v1` address. Undefined when the server has none, or it could not be read. */
async function ollamaDetails(
  address: ModelServerAddress,
  guard: () => Promise<void>,
  timeoutMs: number,
): Promise<Map<string, Omit<ChatModel, "id">> | undefined> {
  if (!address.base.endsWith("/v1")) return undefined;
  const url = `${address.base.slice(0, -"/v1".length)}/api/tags`;
  try {
    await guard();
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(Math.min(timeoutMs, 10_000)),
      redirect: "error",
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      return undefined;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    let read = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      read += value.byteLength;
      if (read > MOST_BYTES) {
        await reader.cancel().catch(() => {});
        return undefined;
      }
      raw += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(raw) as { models?: unknown };
    if (!Array.isArray(body.models)) return undefined;
    const found = new Map<string, Omit<ChatModel, "id">>();
    for (const entry of body.models.slice(0, 500) as Array<Record<string, unknown>>) {
      if (!entry || typeof entry !== "object") continue;
      const details = (entry.details && typeof entry.details === "object" ? entry.details : {}) as Record<string, unknown>;
      const info = {
        sizeBytes: typeof entry.size === "number" && Number.isFinite(entry.size) && entry.size > 0 ? entry.size : null,
        parameters: text(details.parameter_size, 24),
        quantization: text(details.quantization_level, 24),
        family: text(details.family, 40),
      };
      for (const name of [entry.name, entry.model]) if (typeof name === "string" && name) found.set(name, info);
    }
    return found;
  } catch {
    // The names are enough to choose by; the sizes are a help, never a requirement.
    return undefined;
  }
}

const bare = (id: string): ChatModel => ({ id, sizeBytes: null, parameters: null, quantization: null, family: null });

/** The server's models, with what Ollama says about each when the server is Ollama. Throws when the list cannot be read. */
export async function listChatModels(
  address: ModelServerAddress,
  timeouts: ModelTimeouts,
  guard: () => Promise<void>,
): Promise<{ models: ChatModel[]; ollama: boolean }> {
  const [names, details] = await Promise.all([
    openAiChatProvider(address, "", timeouts, guard).listModels(),
    ollamaDetails(address, guard, timeouts.probeMs),
  ]);
  return {
    models: names.map((id) => ({ ...bare(id), ...details?.get(id) })),
    ollama: details !== undefined,
  };
}

export async function chatModels(
  server: { address?: ModelServerAddress; reason: string | null },
  timeouts: ModelTimeouts,
  guard: (address: ModelServerAddress) => Promise<void>,
): Promise<ChatModelsResponse> {
  const { address, reason } = server;
  if (!address || reason) return { models: [], message: reason ?? "No model server is set up.", ollama: false };
  try {
    return { ...(await listChatModels(address, timeouts, () => guard(address))), message: null };
  } catch (error) {
    if (error instanceof AppError) return { models: [], message: error.message, ollama: false };
    throw error;
  }
}

/**
 * "Look for Ollama on this computer": asks the address Ollama listens on by default
 * whether a model server is there, and what it has. Nothing is saved; the person
 * decides whether to use what was found. `addresses` is a seam for tests.
 */
export async function lookForOllama(
  timeouts: ModelTimeouts,
  guard: (address: ModelServerAddress) => Promise<void>,
  addresses: readonly string[] = OLLAMA_DEFAULT_ADDRESSES,
): Promise<ChatLookResult> {
  const quick = { ...timeouts, probeMs: Math.min(timeouts.probeMs, 3_000) };
  for (const candidate of addresses) {
    const address = parseModelServerAddress(candidate);
    try {
      const { models } = await listChatModels(address, quick, () => guard(address));
      return {
        found: true,
        address: address.base,
        models,
        message:
          models.length > 0
            ? `A model server is running at ${address.host} with ${models.length === 1 ? "one model" : `${models.length} models`}.`
            : `A model server is running at ${address.host}, but it has no models yet. Fetch one with its own tool, for example: ollama pull llama3.2:3b`,
      };
    } catch {
      // Not there; try the next place it could be.
    }
  }
  return {
    found: false,
    address: null,
    models: [],
    message:
      "Nothing answered at 127.0.0.1:11434, which is where Ollama listens. If it is installed, start it and look again. If your model server is somewhere else, enter its address in Settings.",
  };
}
