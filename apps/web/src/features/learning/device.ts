/**
 * What this device remembers about learning: who is learning on it, and whether the
 * reader records anything at all. Both are preferences of the device, kept in this
 * browser; the progress itself is on the server (docs/learning.md).
 *
 * A name is not proof of anything. Anyone holding the device can choose any name.
 */
import { learnerName } from "@outpost/shared";
import { useSyncExternalStore } from "react";

const LEARNER_KEY = "outpost.learning.learner";
const RECORDING_KEY = "outpost.learning.recording";

export interface LearningDevice {
  /** The learner chosen on this device: a name, "" for "Just me", or null when no one has been chosen. */
  learner: string | null;
  /** False when someone turned recording off for this device. */
  recording: boolean;
}

function read(): LearningDevice {
  try {
    const raw = localStorage.getItem(LEARNER_KEY);
    const parsed = raw ? (JSON.parse(raw) as { name?: unknown }) : null;
    return {
      learner: parsed && typeof parsed.name === "string" ? learnerName(parsed.name) : null,
      recording: localStorage.getItem(RECORDING_KEY) !== "off",
    };
  } catch {
    // Storage switched off: no one is chosen, so nothing is recorded.
    return { learner: null, recording: true };
  }
}

let current = read();
const listeners = new Set<() => void>();
const changed = () => {
  current = read();
  for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
  // Another tab of the same browser chose someone else.
  window.addEventListener("storage", (event) => {
    if (event.key === LEARNER_KEY || event.key === RECORDING_KEY) changed();
  });
}

export function chooseLearner(name: string | null): void {
  try {
    if (name === null) localStorage.removeItem(LEARNER_KEY);
    else localStorage.setItem(LEARNER_KEY, JSON.stringify({ name: learnerName(name) }));
  } catch {
    // Not remembered where storage is switched off.
  }
  changed();
}

export function setRecording(on: boolean): void {
  try {
    if (on) localStorage.removeItem(RECORDING_KEY);
    else localStorage.setItem(RECORDING_KEY, "off");
  } catch {
    // Not remembered where storage is switched off.
  }
  changed();
}

export function learningDevice(): LearningDevice {
  return current;
}

export function useLearningDevice(): LearningDevice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** Read again from storage: for tests, which change it behind this module's back. */
export function reloadLearningDevice(): void {
  changed();
}
