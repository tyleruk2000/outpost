/**
 * The paper aids as paper: what a one-time pad sheet and a Vigenère square say, and the
 * paper they are printed on.
 *
 * The words and the lines of a pad are here once, and both the sheet on screen
 * (hand-tab.tsx) and the PDF (kit-aids.ts, laid out with the print kit) are made from them.
 *
 * Nothing here touches the network or keeps anything.
 */
import { likelyPaperFor, regionOfLanguage } from "@/lib/region";
import { inGroups, randomLetters } from "./ciphers";

export interface Pad {
  serial: string;
  letters: string;
}

/** Letters to a line of a pad. */
export const PAD_LINE = 50;

export function makePads(count: number, letters: number): Pad[] {
  return Array.from({ length: count }, () => ({ serial: `${randomLetters(3)}-${randomLetters(3)}`, letters: randomLetters(letters) }));
}

/** A pad's letters as its lines, each in groups of five. */
export function padLines(letters: string): string[] {
  return (letters.match(new RegExp(`.{1,${PAD_LINE}}`, "g")) ?? []).map((line) => inGroups(line));
}

export const padHeading = (pad: Pad, copy: 1 | 2) => `One-time pad ${pad.serial}, copy ${copy} of 2`;
export const padHolder = (copy: 1 | 2) => (copy === 1 ? "For the sender" : "For the receiver");
export const lineNumber = (index: number) => String(index + 1).padStart(2, "0");
export const PAD_RULE =
  "Use each letter once, from the top. Cross out what you have used. Never use any part of this pad for a second message. Burn or shred it when it is finished, and let nobody else see it.";

export const SQUARE_TITLE = "Vigenère square";
export const SQUARE_HOW =
  "To encipher: find the key letter down the left side and the message letter along the top; the cipher letter is where that row and column meet. To decipher: go along the key letter’s row to the cipher letter; the message letter is at the top of that column.";

// ── Paper ───────────────────────────────────────────────────────────────────

/** The two papers a home printer takes. */
export const AID_PAPERS = ["a4", "letter"] as const;
export type AidPaper = (typeof AID_PAPERS)[number];
export const isAidPaper = (value: unknown): value is AidPaper => (AID_PAPERS as readonly unknown[]).includes(value);
/** Where the paper last chosen is kept in the browser. Other sheets made for a home printer (an HF prediction) read and write the same choice. */
export const AID_PAPER_KEY = "outpost.encryption.paper";

/** US Letter where the device is set to a country that uses it; A4 everywhere else. */
export function likelyPaper(language: string | undefined): AidPaper {
  return likelyPaperFor(regionOfLanguage(language));
}
