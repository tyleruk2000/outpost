/**
 * What to call the thing in the person's hand. Kept copies live in one browser on one
 * device, and the words on screen should name that device truthfully: "this phone" on a
 * phone, not on a laptop.
 */
import { Laptop, type LucideIcon, Smartphone, Tablet } from "lucide-react";

export type Device = "phone" | "tablet" | "computer";

export function deviceOf(userAgent: string, touchPoints: number): Device {
  if (/iPhone|iPod|Android.+Mobile|Windows Phone/i.test(userAgent)) return "phone";
  // An iPad says it is a Mac; a Mac has no touch screen.
  if (/iPad|Android|Tablet/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1)) return "tablet";
  return "computer";
}

export const DEVICE: Device = typeof navigator === "undefined" ? "computer" : deviceOf(navigator.userAgent, navigator.maxTouchPoints ?? 0);

export const DeviceIcon: LucideIcon = DEVICE === "phone" ? Smartphone : DEVICE === "tablet" ? Tablet : Laptop;

/** The screen's name, and the name of its entry in the navigation. */
export const ON_THIS_DEVICE = `On this ${DEVICE}`;
/** The action, wherever it is offered. */
export const KEEP_ON_THIS_DEVICE = `Keep on this ${DEVICE}`;

/** True when Outpost was opened from the Home Screen (or the Dock) rather than in a browser tab. */
export function runsInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches);
}
