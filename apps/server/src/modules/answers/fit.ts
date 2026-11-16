/**
 * Fitting what is sent into what a model can read at once.
 *
 * A model reads a fixed number of tokens, its context: the instructions, the passages,
 * the conversation so far, and the reply it is writing all have to fit. What happens
 * when they do not depends on the server, and none of it is good. Ollama 0.40.16, left
 * to itself, drops the front of the prompt until half the context is left and answers
 * from the rest without a word (tried: a prompt of 13,739 tokens was answered from
 * 2,050 of them); and when a prompt fits but leaves no room for the reply, it makes
 * room part-way through by dropping the start of the prompt. llama-server refuses.
 *
 * So Outpost decides. It works in characters, because it has no tokeniser, and plans on
 * 3.5 characters to a token. English prose measured 4.4 with the models tried; a table
 * of figures measured 1.8, which no single planning figure covers. So Ollama is also
 * asked for a named context size, told to refuse a prompt that does not fit, and told
 * to stop a reply that runs out of room (see provider.ts); a refusal reaches the person
 * as "too long for the model", with the two figures, and never as an answer written
 * from half of what was sent.
 */

/** Characters to a token, for planning. Prose runs higher (more room than planned); figures and some languages run lower. */
export const CHARS_PER_TOKEN = 3.5;

/**
 * The context sizes Outpost asks Ollama for. The smallest is Ollama's own default on a
 * machine with little video memory, so a model that is already in memory is not loaded
 * again; the others are only reached by raising the context budget in Settings.
 */
export const CONTEXT_SIZES = [4096, 8192, 16384, 32768] as const;

/** Tokens kept back for the chat template's own markers, and as a margin for the estimate. */
const SPARE_TOKENS = 96;
/** The standing instructions and the marker lines round the passages, in characters, generously. */
const INSTRUCTIONS_CHARS = 2200;
/** The longest question accepted for an answer, in characters. */
const QUESTION_CHARS = 1000;

const tokensFor = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

/**
 * The context to ask for, given the context budget in Settings and the longest reply
 * asked for. It depends on the settings alone, not on the question, so that every
 * request asks for the same size and the model is not loaded afresh between them.
 */
/**
 * The model server refused a prompt as more than the model can read at once. How many
 * characters of passages to send when it is asked again, so that the prompt and a reply
 * of `replyTokens` fit. When the server gave its figures (llama-server and Ollama both
 * do), the characters to a token are taken from this very prompt as the model's own
 * tokeniser counted it, which is what a table of figures needs; the instructions and the
 * question cannot be shrunk, so they are taken off first, and a tenth is kept in hand.
 * Without figures, two thirds of what was sent.
 */
export function passageCharsAfterRefusal(input: {
  promptChars: number;
  passageChars: number;
  sizes: { promptTokens: number; contextTokens: number } | null;
  replyTokens: number;
}): number {
  const { promptChars, passageChars, sizes, replyTokens } = input;
  if (!sizes || sizes.promptTokens <= 0) return Math.floor(passageChars * 0.66);
  const charsPerToken = promptChars / sizes.promptTokens;
  const room = (sizes.contextTokens - replyTokens - SPARE_TOKENS) * charsPerToken;
  return Math.max(0, Math.floor((room - (promptChars - passageChars)) * 0.9));
}

export function contextTokensFor(contextChars: number, replyTokens: number): number {
  const needed = tokensFor(contextChars + INSTRUCTIONS_CHARS + QUESTION_CHARS) + replyTokens + SPARE_TOKENS;
  return CONTEXT_SIZES.find((size) => size >= needed) ?? CONTEXT_SIZES[CONTEXT_SIZES.length - 1]!;
}
