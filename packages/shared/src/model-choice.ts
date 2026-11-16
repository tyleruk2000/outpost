/**
 * Which of a model server's models to offer first when answers and chat are being set
 * up, for a person who has no reason to prefer one.
 *
 * In order: the model already named in Settings, while the server still has it; then
 * the first model of Outpost's own short list (recommended-models.ts) that the server
 * has; then "the smallest sensible one": the smallest model that writes text and is
 * large enough to follow an instruction such as "cite your sources". Small models
 * answer soonest and run on the most computers; below about a billion parameters they
 * are too unreliable to be a first impression. That last rule is a judgement from the
 * models' published sizes, not from running them.
 */
import type { ChatModel } from "./chat.ts";
import { RECOMMENDED_MODELS, sameModelName as sameModel } from "./recommended-models.ts";

/** The fewest parameters, in billions, a model should have to be offered first. */
export const SENSIBLE_PARAMETERS = 0.9;
/** The smallest size on disk to be offered first, when the server does not state parameters. */
export const SENSIBLE_BYTES = 700_000_000;

/** "3.2B" → 3.2, "999.89M" → 0.99989. Null when the server did not say, or said something else. */
export function parametersInBillions(parameters: string | null): number | null {
  const match = /^([\d.]+)\s*([KMBT])$/i.exec(parameters?.trim() ?? "");
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return value * { K: 1e-6, M: 1e-3, B: 1, T: 1e3 }[match[2]!.toUpperCase() as "K" | "M" | "B" | "T"];
}

/**
 * True for a model that turns text into numbers for search and cannot write. The
 * server's own word is taken when it gives one; otherwise this is judged from the
 * model's family and name. A wrong guess costs nothing but the order of a list; trying
 * a model is what finds out.
 */
export function looksLikeEmbeddingModel(model: Pick<ChatModel, "id" | "family" | "writes">): boolean {
  if (model.writes !== undefined) return !model.writes;
  if (/bert/i.test(model.family ?? "")) return true;
  return /embed|(^|[/:_-])(bge|gte|e5|minilm|all-minilm|rerank\w*)([:_-]|$)/i.test(model.id);
}

/**
 * The model to offer first. `chosen` is the one already named in Settings, which wins
 * when the server still has it. Null when the server has nothing that writes.
 */
export function recommendModel(models: ChatModel[], chosen = ""): string | null {
  const writers = models.filter((model) => !looksLikeEmbeddingModel(model));
  if (writers.length === 0) return null;
  const already = chosen ? writers.find((model) => sameModel(model.id, chosen)) : undefined;
  if (already) return already.id;
  for (const recommended of RECOMMENDED_MODELS) {
    const held = writers.find((model) => sameModel(model.id, recommended.name));
    if (held) return held.id;
  }

  const sized = writers.filter((model) => model.sizeBytes !== null);
  // A server that states no sizes (llama.cpp, LM Studio) gives nothing to choose by: its first model.
  if (sized.length === 0) return writers[0]!.id;
  const bySize = [...sized].sort((a, b) => a.sizeBytes! - b.sizeBytes!);
  const sensible = bySize.find((model) => {
    const billions = parametersInBillions(model.parameters);
    return billions !== null ? billions >= SENSIBLE_PARAMETERS : model.sizeBytes! >= SENSIBLE_BYTES;
  });
  // Nothing large enough: the largest of the small ones is the nearest to sensible.
  return (sensible ?? bySize.at(-1)!).id;
}
