/**
 * The word for pressing on the map. On a touch screen it is "tap", never "click"; with a
 * mouse it stays "click or tap", which is also right on a laptop with a touch screen.
 */
export const touchScreen = (): boolean => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;

/** "Tap" on a touch screen, "Click or tap" otherwise; lower case with `lower`. */
export function pressWord(lower = false, touch = touchScreen()): string {
  const word = touch ? "Tap" : "Click or tap";
  return lower ? word.toLowerCase() : word;
}
