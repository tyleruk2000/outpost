/**
 * What the HTTPS section and its parts loaded on demand (`https-own.tsx`,
 * `https-steps.tsx`) share. Kept apart so that Settings can draw the section without
 * loading those two until a person needs them.
 */
export const HTTPS_STATUS_KEY = ["https", "status"];

export type Device = "apple-mobile" | "android" | "mac" | "windows" | "linux" | "firefox";

/** The device this browser most likely runs on, so that its steps can be opened first. */
export function guessDevice(agent: string, touchPoints: number): Device | null {
  if (/iPhone|iPad|iPod/.test(agent)) return "apple-mobile";
  // An iPad asks for desktop sites by default, and then says it is a Mac; a Mac has no touch screen.
  if (/Macintosh/.test(agent) && touchPoints > 1) return "apple-mobile";
  if (/Android/.test(agent)) return "android";
  // On Linux, Firefox keeps a list of its own and does not read the system's.
  if (/Firefox\//.test(agent) && /Linux|X11/.test(agent)) return "firefox";
  if (/Macintosh|Mac OS X/.test(agent)) return "mac";
  if (/Windows/.test(agent)) return "windows";
  if (/Linux|X11/.test(agent) && !/CrOS/.test(agent)) return "linux";
  return null;
}
