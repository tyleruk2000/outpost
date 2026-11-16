/**
 * Passphrases: suggesting one, and deciding whether one will do.
 *
 * What a passphrase protects here can be copied by anyone on the home network (a
 * protected private key kept on Outpost, an encrypted page) and attacked afterwards for
 * as long as they like, at whatever speed their hardware manages. OpenPGP stretches a
 * passphrase with repeated SHA-256, which a graphics card computes quickly, so the
 * passphrase's own unpredictability is the whole defence.
 *
 * Outpost cannot measure how unpredictable a phrase someone made up is; nothing can,
 * without knowing how they made it up. So it does two honest things instead:
 *
 * - It offers a passphrase it made itself, whose strength is known exactly because
 *   every part was drawn from the browser's cryptographic random source.
 * - For a passphrase that was typed, it measures what can be measured (length and
 *   variety) and refuses what is certainly weak. Passing is not a promise of strength.
 */

/**
 * A suggested passphrase is made of "proquints": pronounceable five-letter words of
 * consonant-vowel-consonant-vowel-consonant, each carrying exactly 16 random bits
 * (16 consonants × 4 vowels × 16 × 4 × 16 = 65,536). From Daniel S. Wilkerson, "A
 * Proposal for Proquints: Identifiers that are Readable, Spellable, and Pronounceable"
 * (2009), https://arxiv.org/abs/0901.4016.
 */
const CONSONANTS = "bdfghjklmnprstvz";
const VOWELS = "aiou";

export const SUGGESTED_WORDS = 5;
export const BITS_PER_WORD = 16;

export function proquint(value: number): string {
  const v = value & 0xffff;
  return (
    CONSONANTS[(v >> 12) & 0xf]! + VOWELS[(v >> 10) & 0x3]! + CONSONANTS[(v >> 6) & 0xf]! + VOWELS[(v >> 4) & 0x3]! + CONSONANTS[v & 0xf]!
  );
}

/** `words` proquints joined by hyphens: 16 bits each, so five are 80 bits. */
export function suggestPassphrase(
  words = SUGGESTED_WORDS,
  fill: (values: Uint16Array<ArrayBuffer>) => void = (values) => void crypto.getRandomValues(values),
): string {
  const values = new Uint16Array(words);
  fill(values);
  return [...values].map(proquint).join("-");
}

/** The least a typed passphrase must be to protect something that is kept on Outpost. */
export const NETWORK_MIN_LENGTH = 20;
export const NETWORK_MIN_DISTINCT = 10;
/** The least any passphrase for a private key must be, wherever the key is kept. */
export const DEVICE_MIN_LENGTH = 12;
/** A suggested passphrase needs at least this many random bits to protect something kept on Outpost. */
export const NETWORK_MIN_BITS = 64;

export interface PassphraseVerdict {
  /** Good enough for a private key kept only in this browser. */
  deviceOk: boolean;
  /** Good enough for something anyone on the network can copy and attack offline. */
  networkOk: boolean;
  /** Exact, for a passphrase Outpost suggested and the person has not altered; otherwise null. */
  bits: number | null;
  /** One sentence saying what was measured and what is missing. */
  summary: string;
}

const distinct = (text: string) => new Set(text.toLowerCase()).size;

/** True for one character repeated, or a straight run such as "abcdefgh" or "87654321". */
function isTrivialPattern(text: string): boolean {
  if (text.length < 2) return true;
  const codes = [...text].map((character) => character.codePointAt(0)!);
  const steps = new Set(codes.slice(1).map((value, index) => value - codes[index]!));
  return steps.size === 1 && [0, 1, -1].includes([...steps][0]!);
}

/** True when the passphrase is built around something written in the key itself. */
function leansOn(passphrase: string, facts: readonly string[]): string | null {
  const lowered = passphrase.toLowerCase();
  for (const fact of facts) {
    for (const part of fact.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (part.length >= 4 && lowered.includes(part)) return part;
    }
  }
  return null;
}

/**
 * @param suggested the passphrase Outpost last suggested in this form, if any; a typed
 *   passphrase equal to it is credited with its exact strength.
 * @param facts the name and email going into the key, which a passphrase must not be made from.
 */
export function assessPassphrase(
  passphrase: string,
  options: { suggested?: string | null; facts?: readonly string[] } = {},
): PassphraseVerdict {
  const length = [...passphrase].length;
  if (length === 0) return { deviceOk: false, networkOk: false, bits: null, summary: "Give a passphrase." };

  if (options.suggested && passphrase === options.suggested) {
    const bits = passphrase.split("-").length * BITS_PER_WORD;
    return {
      deviceOk: true,
      networkOk: bits >= NETWORK_MIN_BITS,
      bits,
      summary: `Made by this browser at random: ${bits} bits, which is ${bits >= 80 ? "beyond" : "hard for"} any guessing that is practical today. Write it down and keep the paper somewhere safe.`,
    };
  }

  const variety = distinct(passphrase);
  const borrowed = leansOn(passphrase, options.facts ?? []);
  if (isTrivialPattern(passphrase)) {
    return {
      deviceOk: false,
      networkOk: false,
      bits: null,
      summary: "That is one character repeated or a straight run, which is among the first things anyone would try.",
    };
  }
  if (borrowed) {
    return {
      deviceOk: false,
      networkOk: false,
      bits: null,
      summary: `That contains “${borrowed}”, which is written in the key itself for anyone to read. Choose something that is not.`,
    };
  }
  if (length < DEVICE_MIN_LENGTH) {
    return {
      deviceOk: false,
      networkOk: false,
      bits: null,
      summary: `${length} characters. A private key needs at least ${DEVICE_MIN_LENGTH}; longer is better than cleverer.`,
    };
  }
  const networkOk = length >= NETWORK_MIN_LENGTH && variety >= NETWORK_MIN_DISTINCT;
  const measured = `${length} characters, ${variety} different`;
  return {
    deviceOk: true,
    networkOk,
    bits: null,
    summary: networkOk
      ? `${measured}. Long enough to be kept on Outpost. Outpost cannot tell how guessable a phrase you made up is: if it is a quotation, a lyric or anything published, it is weak however long it is.`
      : `${measured}. Enough for a key kept only on this device. To be kept on Outpost, where anyone on the network can copy it and guess at leisure, it needs at least ${NETWORK_MIN_LENGTH} characters with ${NETWORK_MIN_DISTINCT} different ones, or use a suggested one.`,
  };
}
