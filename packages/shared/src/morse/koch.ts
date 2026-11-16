/**
 * Koch-method progression (LCWO character order).
 *
 * Lesson 1 introduces two characters; every later lesson adds one, so lesson
 * `n` drills `n + 1` characters. Copy a session at ≥ 90 % and you advance.
 */

/** LCWO 40-lesson order (41 characters). */
export const KOCH_ORDER: readonly string[] = [
  "K",
  "M",
  "U",
  "R",
  "E",
  "S",
  "N",
  "A",
  "P",
  "T",
  "L",
  "W",
  "I",
  ".",
  "J",
  "Z",
  "=",
  "F",
  "O",
  "Y",
  ",",
  "V",
  "G",
  "5",
  "/",
  "Q",
  "9",
  "2",
  "H",
  "3",
  "8",
  "B",
  "?",
  "4",
  "7",
  "C",
  "1",
  "D",
  "6",
  "0",
  "X",
];

export const KOCH_LESSON_COUNT = KOCH_ORDER.length - 1; // 40

/** Fraction of characters that must be copied correctly to advance. */
export const PASS_THRESHOLD = 0.9;

/** Characters available at lesson `n` (1-based). Lesson 1 → first two chars. */
export function lessonCharset(lesson: number): string[] {
  const n = Math.min(Math.max(Math.trunc(lesson), 1), KOCH_LESSON_COUNT);
  return KOCH_ORDER.slice(0, n + 1) as string[];
}

/** The character a lesson introduces (lesson 1 introduces two). */
export function lessonNewChars(lesson: number): string[] {
  const n = Math.min(Math.max(Math.trunc(lesson), 1), KOCH_LESSON_COUNT);
  return n === 1 ? (KOCH_ORDER.slice(0, 2) as string[]) : [KOCH_ORDER[n]!];
}
